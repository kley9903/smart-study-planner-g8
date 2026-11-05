// 入口：切頁、畫面更新、所有按鈕的動作。
import {
  getState, subscribe, ui, ob, resetDemo, say, runScenario, chooseOption, inkProposal, eraseProposal,
  checkin, checkinRemain, setProgress, adjustStep, confirmEstimate, setItemState, inkAllItems, saveItem,
  addRule, removeRule, setSleep, obRestart, obFinish,
  getMode, enterMine, enterDemo, addTask, deleteTask, requestPlans, choosePlan, startAsk, answerAsk, skipAsk, closeAsk, relang, updateTask, addTaskAttachment, addOwnDoc, removeOwnDoc, setOwnItems, setDocCourse, deleteCourse, renameCourse, editTaskBasics, setTaskGroup, partsOf,
} from './store.js';
import { readSyllabus, toItems, mergeFound, checklist, AI_MAX_MB, AI_IMAGE_MAX_MB } from './syllabus-ai.js';

const REVEAL_STEP_MS = 450; // 檢查視窗逐行揭曉的間隔
import { editor } from './views/task-editor.js';
import { installPickers } from './pickers.js';
import { renderMonth, shiftMonth } from './views/month.js';
import { stepFields, stepHelper, suggestSteps } from './views/task-editor.js';
import { keepFile, fits, LIMIT_MB, getAttachment, removeAttachment } from './attachments.js';
import { L, setLang, applyStatic } from './i18n.js';
import { toast, openPopover, closePopover, place, remember, recall, esc } from './ui.js';
import { drawArrows, forgetPencils } from './planner.js';
import { startTour, endTour, tourStep, tourActive, placeTour } from './tour.js';
import { taskOf, pendingProposal, pendingCount } from './model.js';
import { hm, weekday } from './time.js';
import { createDemoState } from './demo-data.js';
import * as week from './views/week.js';
import * as tasks from './views/tasks.js';
import * as importView from './views/import.js';
import * as start from './views/start.js';
import * as about from './views/about.js';
import { renderDock } from './views/dock.js';
import { renderAsk } from './views/ask.js';
import { blockPopover, hatchPopover, busyForm } from './views/popovers.js';
import { createMascot } from './mascot.js';
import { attachBusyPainting } from './busy-paint.js';

const views = {
  week, tasks,
  monthly: { render: (s) => `<div class="page-head"><div><h1 class="page-head__title">${L('月曆', 'Monthly')}</h1><p class="page-head__lede">${L('查看整個月的截止日期及忙碌時段，點選日期新增或查看內容。', 'View deadlines and busy times for the month. Select a date to view or add items.')}</p></div></div><section class="sheet monthly-page">${renderMonth(s)}</section>` },
  'add-task': { render: (s) => `<div class="page-head"><h1 class="page-head__title">${L('新增任務', 'Add task')}</h1></div><div class="add-task-page">${editor(s, null, ui.taskDate)}${stepHelper()}</div>` },
  import: importView, start, about,
  time: { render: () => '' }, // 舊網址 #/time：在 render() 轉到本週的「改沒空的時間」
  margin: { render: () => '' }, // 舊網址 #/margin：在 render() 轉到本週並打開右下角的 AI 助手
};

const main = document.getElementById('main');
const dock = document.getElementById('dock');
const header = document.getElementById('app-header');
let current = { name: '', params: [] };
let lastKey = '';
let afterRoute = null;
let draftTimer = null;
let obTimer = null;

// 網址可直接打開某個示範情境，方便組員討論：例如 #/week?try=hero 或 #/week?try=hero.A
function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [name, ...params] = path.split('/').filter(Boolean);
  return { name: views[name] ? name : null, params, query: new URLSearchParams(query) };
}

const wide = () => window.innerWidth >= 1180;

/* ---------------- 畫面更新 ---------------- */
function render(info = {}) {
  const r = route();
  if (!r.name) {
    location.replace('#/week');
    return;
  }
  // 分享出去的示範情境連結（#/week?try=…）和新手導覽連結（#/week?tour=1）一律在導覽模式打開
  if ((r.query.get('try') || r.query.get('tour')) && getMode() !== 'demo') enterDemo();
  document.body.dataset.mode = getMode();
  if (r.name === 'margin') {
    const q = r.query.toString();
    setDockOpen(true);
    location.replace(`#/week${q ? `?${q}` : ''}`);
    return;
  }
  if (r.name === 'time') {
    ui.editBusy = true;
    location.replace('#/week');
    return;
  }
  if (r.name !== 'week') ui.editBusy = false;
  if (r.name === 'week') ui.calendarView = 'week';
  if (r.name === 'add-task' && current.name !== 'add-task' && !r.query.get('add')) ui.taskDate = '';
  current = r;
  const s = getState();
  const addDate = ['tasks', 'add-task'].includes(r.name) && r.query.get('add');
  if (addDate && /^\d{4}-\d{2}-\d{2}$/.test(addDate)) {
    ui.taskForm = true; ui.taskDate = addDate; ui.editTask = null;
    history.replaceState(null, '', `#/${r.name}`);
  }
  const key = `${r.name}/${r.params.join('/')}`;
  const changed = key !== lastKey;

  const thread = dock.querySelector('[data-thread-scroll]');
  const threadTop = thread ? thread.scrollTop : null;
  const scrollers = [...main.querySelectorAll('.planner__scroll, .horizon__scroll')].map((el) => el.scrollLeft);
  const focusId = document.activeElement?.id;

  closePopover();
  main.innerHTML = views[r.name].render(s, r.params);
  document.body.dataset.route = r.name;
  updateNav(r.name === 'add-task' ? 'tasks' : r.name, s);
  drawDock(s, r, changed);
  drawAsk();

  if (changed) {
    window.scrollTo(0, 0);
    lastKey = key;
  } else {
    main.querySelectorAll('.planner__scroll, .horizon__scroll').forEach((el, i) => { if (scrollers[i] != null) el.scrollLeft = scrollers[i]; });
  }

  // AI 助手：新訊息很長（例如要選做法）就由它的開頭看起，否則捲到最底
  const t = dock.querySelector('[data-thread-scroll]');
  const notes = dock.querySelectorAll('.thread > .note');
  const last = notes[notes.length - 1];
  if (t) {
    if (info.scrollThread && last && last.offsetHeight > t.clientHeight * 0.8) t.scrollTop = last.offsetTop - 12;
    else t.scrollTop = info.scrollThread || threadTop == null ? t.scrollHeight : threadTop;
  }
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });

  markActiveChange();
  requestAnimationFrame(() => { drawArrows(main, ui.arrowFor); placeTour(); });
  if (tourActive() && r.name !== 'week') endTour();
  if (r.name === 'week' && ui.justInked.length) ui.justInked = [];
  autosize();

  if (r.name === 'start' && r.params[0] === '5' && !ob.drafted && !draftTimer) {
    draftTimer = setTimeout(() => { ob.drafted = true; draftTimer = null; if (current.name === 'start') render(); }, 1600);
  }
  if (afterRoute && r.name === 'week') {
    const fn = afterRoute;
    afterRoute = null;
    requestAnimationFrame(() => fn());
  }
  const tourAt = Number(r.query.get('tour'));
  if (tourAt && r.name === 'week') {
    history.replaceState(null, '', '#/week');
    setTimeout(() => startTour(tourAt), 200);
  }
  const tryId = r.query.get('try');
  if (tryId) {
    history.replaceState(null, '', `#/${[r.name, ...r.params].join('/')}`);
    const [id, opt] = tryId.split('.');
    runScenario(id);
    if (opt) chooseOption(opt);
  }
}

function updateNav(name, s) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const n = pendingCount(s);
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.hidden = !n;
    el.textContent = n;
  });
}

/* ---------------- 右下角的 AI 助手 ---------------- */
let readyKey = '';
let dockHtml = '';
const mascot = createMascot(dock, { main });
function drawDock(s, r, navigated) {
  // AI 建議可以確認時，面板自動縮小讓出時間表，泡泡留下「確認／不要」
  const p = pendingProposal(s);
  const key = p && !(p.kind === 'hero' && !p.option) ? `${p.id}:${p.option || ''}` : '';
  if (key && key !== readyKey && ui.dockOpen) setDockOpen(false);
  readyKey = key;
  dock.hidden = r.name === 'start';
  if (dock.hidden) return;
  const d = renderDock(s, { quiet: r.name === 'add-task' || !!ui.editTask });
  // 內容沒變就不重建：重建會讓正在播的撐起來／掉下去／打哈欠動畫從第一格重來，然後被計時器中途切斷
  if (d.html !== dockHtml) { dock.innerHTML = d.html; dockHtml = d.html; }
  dock.classList.toggle('is-open', d.open);
  dock.classList.toggle('has-bubble', !!d.bubble);
  mascot.shown({ hidden: false, open: d.open, bubble: d.bubble, navigated });
}

/* ---------------- 遊戲式對話框（AI 助手一題一題問） ---------------- */
const askLayer = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ask-layer' }));
let askHtml = '';
let askKey = '';
let typing = null;
function drawAsk() {
  const html = renderAsk();
  dock.classList.toggle('is-away', !!ui.ask); // 角色跳到對話框旁邊，右下角先空出來
  if (html === askHtml) return;
  askLayer.innerHTML = html;
  askHtml = html;
  const box = askLayer.querySelector('.ask');
  if (!box) { askKey = ''; return; }
  const key = box.dataset.askKey;
  const text = box.querySelector('[data-type]');
  if (key !== askKey) {
    askKey = key;
    typeOut(text);
    // 有選項時先聚焦第一個選項，按 1–4 才不會打進輸入格
    (askLayer.querySelector('.ask__choice') || askLayer.querySelector('#ask-input'))?.focus({ preventScroll: true });
  } else text.classList.add('is-done');
}
/** 逐字打出問題；減少動態效果時直接整句顯示。 */
function typeOut(el) {
  clearInterval(typing);
  const full = el.textContent;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('is-done'); return; }
  let n = 0;
  el.textContent = '';
  el.dataset.full = full;
  typing = setInterval(() => {
    n += 1;
    el.textContent = full.slice(0, n);
    if (n >= full.length) { clearInterval(typing); el.classList.add('is-done'); }
  }, 28);
}
function revealAsk() {
  const el = askLayer.querySelector('[data-type]');
  if (!el || el.classList.contains('is-done')) return;
  clearInterval(typing);
  el.textContent = el.dataset.full || el.textContent;
  el.classList.add('is-done');
}
function answer(value) {
  if (answerAsk(value)) { ui.askDraft = ''; ui.askError = ''; }
  else { ui.askError = L('看不懂，可以換個寫法再試，或按「不知道」', 'Could not read that. Try writing it another way, or press "Don\'t know"'); }
  render();
}
askLayer.addEventListener('click', (e) => {
  if (!e.target.closest('button, input, a')) revealAsk(); // 點一下就整句顯示，不讓學生乾等
});
askLayer.addEventListener('input', (e) => { if (e.target.id === 'ask-input') ui.askDraft = e.target.value; });
askLayer.addEventListener('submit', (e) => {
  e.preventDefault();
  answer(new FormData(e.target).get('answer'));
});

function setDockOpen(open) {
  ui.dockOpen = open;
  remember('dock', open ? '1' : '0');
}

function toggleDock(open) {
  setDockOpen(open);
  render({ scrollThread: open });
  if (open) setTimeout(() => (document.getElementById('say-input') || dock.querySelector('.margin__close'))?.focus({ preventScroll: true }), 0);
  else dock.querySelector('.dock__me')?.focus({ preventScroll: true });
}

function autosize() {
  const ta = document.getElementById('say-input');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}

function markActiveChange() {
  if (!ui.arrowFor) return;
  main.querySelectorAll(`.change[data-from="${ui.arrowFor}"]`).forEach((el) => el.classList.add('is-active'));
}

subscribe((info) => {
  if (info.toast) toast(info.toast, info.toastIcon || 'check');
  render(info);
});

/* ---------------- 時間表上的彈出框、拖拉標記沒空的時間 ---------------- */
function openBusyForm(el, start) {
  openPopover(el, busyForm(el.dataset.date || getState().today, start));
}

// 要比下面的點擊處理先登記，拖拉放開後瀏覽器補的 click 才吞得掉
const paintActions = attachBusyPainting({
  isEditing: () => ui.editBusy,
  isRule: (id) => getState().unavailable.some((r) => r.id === id),
  addRule, removeRule, openBusyForm,
});

/* ---------------- 首次使用流程 ---------------- */
function obGo(step) {
  if (step === 2 && !ob.loaded) { toast('先按「用 4 份示範大綱」', 'info'); return; }
  if (step === 4 && !ob.sleepSet) { toast('先確認睡眠時間，AI 才可以排計劃', 'moon'); return; }
  if (step === 5 && !ob.classesInked) { toast('先確認沒空的時間', 'info'); return; }
  ui.dropMsg = '';
  location.hash = `#/start/${step}`;
}

function obLater(step, ms, fn) {
  clearTimeout(obTimer);
  obTimer = setTimeout(() => {
    if (current.name === 'start' && current.params[0] === String(step)) fn();
  }, ms);
}

function finishOnboarding() {
  obFinish();
  remember('visited', '1');
  location.hash = '#/week';
  toast(L('計劃已確認。跟著頁頂的「示範導覽」看看 AI 怎樣幫你調整', 'Plan confirmed. Follow "Try it" at the top to see how the AI adjusts it'), 'check');
}

/* ---------------- 本週：定位、導覽 ---------------- */
function locate(date, blockId, fromId) {
  ui.calendarView = 'week';
  if (date) ui.day = date;
  ui.arrowFor = fromId || null;
  if (window.innerWidth < 900 && ui.dockOpen) setDockOpen(false); // 窄螢幕的面板會蓋住時間表
  const go = () => {
    const el = (blockId && main.querySelector(`[data-block="${CSS.escape(blockId)}"]`)) || main.querySelector(`.pcol[data-date="${date}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    if (el.classList.contains('blk')) {
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
    }
  };
  if (current.name !== 'week') {
    afterRoute = go;
    location.hash = '#/week';
  } else {
    render();
    go();
  }
}

function focusDecision() {
  if (!ui.dockOpen) { setDockOpen(true); render(); }
  const box = dock.querySelector('.decide');
  if (box) {
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.querySelector('.opt, .btn--ink')?.focus({ preventScroll: true });
  }
}

/* ---------------- 按鈕動作 ---------------- */
const $ = (sel) => document.querySelector(sel);

const actions = {
  'calendar-view': (el) => { location.hash = el.dataset.view === 'month' ? '#/monthly' : '#/week'; },
  'month-move': (el) => { ui.month = shiftMonth(ui.month || getState().today, Number(el.dataset.delta)); ui.monthDay = ui.month; render(); },
  'month-today': () => { ui.month = ui.monthDay = getState().today; render(); },
  'month-day': (el) => { ui.monthDay = el.dataset.date; render(); },
  'new-busy': (el) => openBusyForm(el),
  'rules-toggle': (el) => { ui.rulesOpen[el.dataset.src] = !ui.rulesOpen[el.dataset.src]; render(); },
  'task-form-open': () => { ui.taskDate = ''; ui.editTask = null; location.hash = '#/add-task'; },
  'task-form-close': () => { ui.taskForm = false; ui.editTask = null; if (current.name === 'add-task') location.hash = '#/tasks'; else render(); },
  'task-edit': (el) => { ui.editTask = el.dataset.task; ui.taskForm = false; render(); main.querySelector('.tform input')?.focus(); },
  'step-add': (el) => { const rows = el.closest('form').querySelector('[data-step-rows]'); rows.insertAdjacentHTML('beforeend', stepFields()); rows.lastElementChild.querySelector('input').focus(); },
  'suggest-steps': () => {
    const form = main.querySelector('form[data-form="task"]');
    if (!form) return;
    const f = new FormData(form);
    const hours = Number(f.get('hours')) || 3;
    const rows = form.querySelector('[data-step-rows]');
    rows.innerHTML = suggestSteps(String(f.get('kind') || ''), String(f.get('title') || ''), hours).map(stepFields).join('');
    rows.querySelector('input')?.focus();
    toast(L(`已建議 ${rows.children.length} 個子任務，可以再修改`, `Suggested ${rows.children.length} steps; edit as needed`), 'pencil');
  },
  'step-remove': (el) => { el.closest('.step-editor__row').remove(); },
  'file-download': async (el) => {
    try {
      const file = await getAttachment(el.dataset.fileId);
      if (!file) throw new Error('missing');
      const url = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast(L('無法讀取附件，請重新加入原檔。', 'Cannot read this attachment. Attach the original file again.'), 'alert'); }
  },
  reset: () => resetDemo(),
  'pop-close': () => closePopover(),
  block: (el) => { const html = blockPopover(getState(), el.dataset.block); if (html) openPopover(el, html); },
  hatch: (el) => { const html = hatchPopover(getState(), el.dataset, ui.editBusy); if (html) openPopover(el, html); },
  ink: (el) => {
    const p = pendingProposal(getState());
    if (p?.kind === 'hero' && !p.option) { closePopover(); inkProposal(); focusDecision(); return; }
    closePopover();
    inkProposal();
  },
  erase: () => { closePopover(); eraseProposal(); },
  option: (el) => chooseOption(el.dataset.opt),
  scenario: (el) => {
    if (el.dataset.id === 'hero' && !wide()) ui.day = '2026-11-06';
    runScenario(el.dataset.id);
  },
  checkin: (el) => checkin(el.dataset.result),
  remain: (el) => checkinRemain(Number(el.dataset.min)),
  progress: (el) => { closePopover(); setProgress(el.dataset.step, el.dataset.p); },
  'toggle-gaps': () => { ui.showGaps = !ui.showGaps; render(); },
  day: (el) => { ui.day = el.dataset.date; render(); },
  'hl-task': (el) => { const id = el.dataset.task; ui.hlTask = !id || ui.hlTask === id ? null : id; render(); },
  locate: (el) => locate(el.dataset.date, el.dataset.block, el.dataset.from),
  'guide-toggle': () => { ui.guideOpen = !ui.guideOpen; render(); },
  'guide-hero': () => {
    if (!wide()) ui.day = '2026-11-06';
    runScenario('hero');
    requestAnimationFrame(() => {
      const pl = main.querySelector('.week__sheet .planner');
      pl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  },
  'guide-decide': () => { closePopover(); focusDecision(); },
  'dock-toggle': () => toggleDock(!ui.dockOpen),
  'dock-dismiss': (el) => { ui.dockDismissed.push(el.dataset.id); render(); },
  'dock-decide': () => focusDecision(),
  'busy-edit': (el) => {
    const on = el.dataset.on === '1';
    // 右邊的 AI 助手會收起，所以有建議未決定時先處理建議
    if (on && pendingProposal(getState())) { closePopover(); toast(L('先確認或不要目前的建議，再改沒空的時間', 'Confirm or discard the current suggestion first'), 'info'); return; }
    ui.editBusy = on;
    ui.hlRule = null;
    ui.sleepEdit = false;
    closePopover();
    endTour();
    if (current.name !== 'week') { location.hash = '#/week'; return; }
    render();
  },
  'hl-rule': (el) => {
    ui.hlRule = ui.hlRule === el.dataset.rule ? null : el.dataset.rule;
    render();
    main.querySelector('.hatch.is-hl')?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  },
  'sleep-edit': (el) => { ui.sleepEdit = el.dataset.on === '1'; render(); },
  'sleep-save': () => setSleep(Number($('#sleep-start').value), Number($('#sleep-end').value)),
  'remove-rule': (el) => { closePopover(); removeRule(el.dataset.rule); },
  doc: (el) => { ui.docId = el.dataset.doc; ui.editItem = null; render(); },
  'open-doc': (el) => { ui.docId = el.dataset.doc; },
  'doc-remove': (el) => {
    if (!confirm(L('從這個瀏覽器移除這份大綱？', 'Remove this syllabus from this browser?'))) return;
    const doc = getState().docs.find((d) => d.id === el.dataset.doc);
    if (doc) partsOf(doc).forEach((x) => removeAttachment(x.id).catch(() => {}));
    removeOwnDoc(el.dataset.doc);
  },
  'syllabus-paste': async () => {
    const box = document.querySelector('[data-syllabus-text]');
    try {
      const shots = await clipboardImages();
      if (shots.length) { await takeFiles(shots); return; }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('empty');
      ui.syllabusDraft = text;
      render();
      document.querySelector('[data-syllabus-text]')?.focus();
    } catch {
      box?.focus();
      toast(L('請按 Ctrl+V（Mac 按 ⌘V）貼上', 'Press Ctrl+V (⌘V on a Mac) to paste'), 'info');
    }
  },
  'syllabus-clear': () => { ui.syllabusDraft = ''; render(); },
  'syllabus-read': async () => {
    const text = ui.syllabusDraft.trim();
    if (ui.docReading) return;
    if (!text && !ui.basket.length) { toast(L('先打幾個字、貼上文字，或放入檔案。', 'Type or paste something, or add a file, first.'), 'alert'); return; }
    // 收集箱裡的檔案加上打的字（存成 .txt）合成一份資料，AI 逐份讀，結果合成一份核對表
    const parts = [...ui.basket];
    if (text) {
      const line = text.split('\n')[0].replace(/[\\/:*?"<>|]/g, ' ').trim();
      const first = (line.length > 40 ? line.slice(0, 40).replace(/\s+\S*$/, '') : line).replace(/[\s.,;:，。；：]+$/, '') || L('貼上的大綱', 'Pasted syllabus');
      try {
        parts.push(await keepFile(new File([text], `${first}.txt`, { type: 'text/plain' }), LIMIT_MB.syllabus));
      } catch (err) { toast(fileProblem(err, { name: first }), 'alert'); return; }
    }
    const one = parts.length === 1;
    const doc = { id: one ? parts[0].id : crypto.randomUUID(), size: parts.reduce((n, x) => n + (x.size || 0), 0),
      name: one ? parts[0].name : L(`${parts[0].name} 等 ${parts.length} 份`, `${parts[0].name} and ${parts.length - 1} more`), ...(one ? {} : { parts }) };
    ui.syllabusDraft = '';
    ui.basket = [];
    addOwnDoc(doc, ui.addCourse);
    actions['doc-read']({ dataset: { doc: doc.id } });
  },
  'basket-remove': (el) => {
    ui.basket = ui.basket.filter((f) => f.id !== el.dataset.fileId);
    removeAttachment(el.dataset.fileId).catch(() => {});
    render();
  },
  'doc-read': async (el) => {
    const id = el.dataset.doc;
    if (ui.docReading) return;
    ui.docReading = id;
    ui.readStage = 'read';
    ui.aiModal = { doc: id, phase: 'run', fresh: true };
    render();
    try {
      const doc = getState().docs.find((d) => d.id === id);
      const course = doc?.course && getState().courses[doc.course];
      // 補充某一科時，告訴 AI 這份資料屬於哪一科（短短一段公告也認得出）
      const context = course ? `這份資料屬於 ${course.name}${course.title ? `（${course.title}）` : ''}。` : '';
      const parts = partsOf(doc);
      const found = [];
      let failed = null;
      for (const [n, part] of parts.entries()) {
        ui.readPart = parts.length > 1 ? { n: n + 1, of: parts.length, name: part.name } : null;
        ui.readStage = 'read';
        render();
        try {
          const file = await getAttachment(part.id);
          if (!file) throw Object.assign(new Error('missing'), { reason: 'missing' });
          found.push(toItems(await readSyllabus(file, { context, onStage: (stage) => { ui.readStage = stage; render(); } })));
        } catch (err) {
          failed = err;
          found.push({ course: '', items: [], weightTotal: null, notes: [{ kind: 'other', text: L(`「${part.name}」讀不到：${readProblem(err)}`, `Could not read "${part.name}": ${readProblem(err)}`) }] });
        }
      }
      ui.readPart = null;
      if (failed && found.every((f) => !f.items.length && f.notes.length === 1)) throw failed; // 全部都讀不到
      ui.docReading = null;
      setOwnItems(id, mergeFound(found));
      revealChecks(id);
    } catch (err) {
      ui.docReading = null;
      ui.readPart = null;
      ui.aiModal = null;
      render();
      toast(readProblem(err), 'alert');
    }
  },
  'course-toggle': (el) => {
    const id = el.dataset.course;
    // 同一張卡 400ms 內點兩下＝雙擊改名（點一下就重畫卡頭，瀏覽器不會發 dblclick）；兩下開合剛好回到原狀
    const twice = lastHead.id === id && Date.now() - lastHead.at < 400;
    lastHead = twice ? {} : { id, at: Date.now() };
    ui.openCourse = ui.openCourse === id ? null : id;
    ui.editRow = null;
    if (twice) startRename(id); else render();
  },
  'course-add': () => { ui.addCourse = null; ui.docId = null; location.hash = '#/import/add'; },
  'course-more': (el) => { ui.addCourse = el.dataset.course; ui.docId = null; location.hash = '#/import/add'; },
  'course-continue': (el) => { ui.addCourse = null; ui.docId = el.dataset.doc; },
  'course-rename': (el) => startRename(el.dataset.course),
  'course-rename-cancel': () => { ui.renameCourse = null; render(); },
  'course-row-edit': (el) => {
    ui.editRow = el.dataset.task;
    render();
    const input = document.querySelector('.crow-edit input[name="title"]');
    input?.focus();
    input?.select();
  },
  'course-row-cancel': () => { ui.editRow = null; render(); },
  'task-group': (el) => { closePopover(); setTaskGroup(el.dataset.task, el.dataset.group); },
  'course-delete': (el) => {
    const c = getState().courses[el.dataset.course];
    if (!c || !window.confirm(L(`刪除「${c.name}」？這一科的功課、測驗、考試，連同已排的讀書時段和你放過的資料，都會一起刪除，不能復原。`,
      `Delete ${c.name}? Its assignments, quizzes and exams, their scheduled sessions and the sources you added are deleted too. This cannot be undone.`))) return;
    deleteCourse(c.id).forEach((file) => removeAttachment(file).catch(() => {}));
  },
  'ai-modal-close': () => {
    const done = ui.aiModal?.phase === 'done';
    const doc = ui.aiModal?.doc;
    ui.aiModal = null;
    if (done && doc) startAsk(doc); // 讀完有「要你補」的，助手接著一題一題問
    render();
    if (done) document.querySelector('.xtable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'demo-docs': () => {
    document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(L('下面是示範大綱的抽取結果（預先寫好）', 'Below are the demo extraction results (pre-written)'), 'info');
  },
  item: (el) => setItemState(el.dataset.doc, el.dataset.item, el.dataset.to),
  'edit-item': (el) => {
    ui.editItem = el.dataset.item || null;
    render();
    // 從報告的「去補」來：捲到那一列，游標放在第一個要填的格
    if (ui.editItem && el.classList.contains('ai-todo__go')) {
      const field = $('#edit-scope') || $('#edit-when');
      field?.scrollIntoView({ block: 'center' });
      field?.focus({ preventScroll: true });
    }
  },
  'save-item': (el) => saveItem(el.dataset.doc, el.dataset.item, { when: $('#edit-when').value.trim() || '—', hours: $('#edit-hours').value.trim() || '—', scope: $('#edit-scope')?.value || '' }),
  'ink-all': (el) => inkAllItems(el.dataset.doc),
  adjust: (el) => adjustStep(el.dataset.step, Number(el.dataset.delta)),
  'confirm-est': (el) => confirmEstimate(el.dataset.task),

  'start-mine': () => { endTour(); enterMine(); forgetPencils(); remember('visited', '1'); },
  'leave-demo': () => { endTour(); enterMine(); forgetPencils(); render(); },
  'start-tour': () => {
    enterDemo();
    forgetPencils();
    remember('visited', '1');
    ui.guideOpen = false;
    // 等切到「本週」並畫好畫面才開始（不用 requestAnimationFrame：分頁在背景時它會暫停）
    setTimeout(() => { if (current.name === 'week') startTour(); }, 200);
  },
  lang: (el) => {
    endTour();
    closePopover();
    setLang(el.dataset.langOpt);
    relang();
  },
  'tour-next': () => tourStep(1),
  'tour-prev': () => tourStep(-1),
  'tour-end': () => endTour(),
  'auto-plan': () => requestPlans(),
  'ask-start': (el) => startAsk(el.dataset.doc),
  'ask-pick': (el) => answer(Number(el.dataset.value)),
  'ask-skip': () => { ui.askError = ''; skipAsk(); },
  'ask-later': () => { ui.askError = ''; closeAsk(); },
  'plan-pick': (el) => choosePlan(el.dataset.plan),
  'plan-close': () => { ui.planError = ''; eraseProposal(); render(); },
  'del-task': (el) => {
    const t = taskOf(getState(), el.dataset.task);
    if (t && window.confirm(L(`刪除「${t.title}」和它已排的讀書時段？`, `Delete "${t.title}" and its scheduled sessions?`))) {
      deleteTask(t.id);
      location.hash = '#/tasks';
    }
  },
  'ob-begin': () => { enterDemo(); obRestart(); forgetPencils(); ui.dropMsg = ''; remember('visited', '1'); },
  'ob-skip': () => remember('visited', '1'),
  'ob-load': () => {
    ob.loaded = true;
    ui.dropMsg = '';
    render();
    obLater(1, 2000, () => obGo(2));
  },
  'ob-go': (el) => obGo(Number(el.dataset.step)),
  'ob-item': (el) => { ob.itemState[el.dataset.item] = el.dataset.to; render(); },
  'ob-confirm-items': () => {
    let n = 0;
    createDemoState().docs.flatMap((d) => d.items).forEach((it) => {
      if (!it.warn && (ob.itemState[it.id] || 'pencil') === 'pencil') { ob.itemState[it.id] = 'ink'; n += 1; }
    });
    toast(`已確認 ${n} 項；AI 不肯定的留待之後核對`, 'check');
    obGo(3);
  },
  'ob-confirm-sleep': () => {
    ob.sleepSet = true;
    toast(`已確認：每晚 ${hm(ob.sleep.start)}–${hm(ob.sleep.end)} 睡覺`, 'moon');
    obGo(4);
  },
  'ob-confirm-hatch': () => {
    ob.classesInked = true;
    ob.lifeAdded = true;
    toast('已確認沒空的時間', 'check');
    obGo(5);
  },
  'ob-wait': () => toast('AI 正在排計劃，請等一等', 'clock'),
  'ob-ink-plan': () => {
    ob.inked = true;
    render();
    obLater(5, 1700, finishOnboarding);
  },
  'ob-finish': () => { clearTimeout(obTimer); finishOnboarding(); },
  ...paintActions,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el, e);
}, true);

installPickers();
document.getElementById('scrim').addEventListener('click', () => closePopover());

/* 科目卡改名：雙擊卡頭（見 course-toggle），或按卡底「改名」；卡頭換成輸入格，代號先選好方便直接打。 */
let lastHead = {};
function startRename(id) {
  ui.renameCourse = id;
  render();
  const input = document.querySelector('.course__rename input[name="name"]');
  input?.focus();
  input?.select();
}

/* 科目卡：把一項移到另一組（改它的類型）。電腦上拖放；手機長按「拿起來」再拖；電腦右鍵開「移到…」選單。 */
const groupName = (g) => (g === 'exam' ? L('測驗和考試', 'quizzes and exams') : L('功課', 'assignments'));
let dragRow = null;
const endDrag = () => {
  dragRow?.classList.remove('is-dragged');
  document.querySelectorAll('.course.is-dragging').forEach((x) => x.classList.remove('is-dragging'));
  document.querySelectorAll('.course__group.is-drop').forEach((x) => x.classList.remove('is-drop'));
  dragRow = null;
};
// 只能放到同一科的另一組
const dropTarget = (e) => groupAt(e.target);
const groupAt = (el) => {
  const g = el?.closest?.('.course__group[data-group]');
  return dragRow && g && g.dataset.course === dragRow.dataset.course && g.dataset.group !== dragRow.dataset.group ? g : null;
};
const markDrop = (g) => document.querySelectorAll('.course__group[data-group]').forEach((x) => x.classList.toggle('is-drop', x === g));
document.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.crow[data-task]');
  if (!row) return;
  dragRow = row;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', row.dataset.task);
  row.closest('.course')?.classList.add('is-dragging'); // 空的那一組這時才出現
  setTimeout(() => row.classList.add('is-dragged'), 0); // 拖著的影像先照原樣拍下，原位才變淡
});
document.addEventListener('dragover', (e) => {
  const g = dropTarget(e);
  document.querySelectorAll('.course__group.is-drop').forEach((x) => { if (x !== g) x.classList.remove('is-drop'); });
  if (!g) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  g.classList.add('is-drop');
});
document.addEventListener('drop', (e) => {
  const g = dropTarget(e);
  if (!g) return;
  e.preventDefault();
  const id = dragRow.dataset.task;
  endDrag();
  setTaskGroup(id, g.dataset.group);
});
document.addEventListener('dragend', endDrag);

const openMoveMenu = (row) => {
  const t = taskOf(getState(), row.dataset.task);
  if (!t) return;
  const to = row.dataset.group === 'exam' ? 'work' : 'exam';
  openPopover(row, `<p class="pop__title">${esc(t.title)}</p>
    <div class="pop__actions">
      <button class="btn btn--sm btn--ink" type="button" data-action="task-group" data-task="${t.id}" data-group="${to}">${L(`移到${groupName(to)}`, `Move to ${groupName(to)}`)}</button>
      <a class="btn btn--sm btn--ghost" href="#/tasks/${t.id}" data-action="pop-close">${L('打開這一項', 'Open')}</a>
    </div>`);
};
// 手機：按住 0.4 秒，那一項像方塊一樣浮起來跟著手指走，放到另一組就移過去。
// 浮起來之前手指一移動就當作捲動；浮起來之後不捲動頁面，拖到螢幕上下邊緣才慢慢捲。
let touch = null;
const dropTouch = () => {
  if (!touch) return;
  clearTimeout(touch.timer);
  cancelAnimationFrame(touch.raf);
  touch.ghost?.remove();
  if (touch.lifted) endDrag();
  touch = null;
};
document.addEventListener('touchstart', (e) => {
  const row = e.target.closest?.('.crow[data-task]');
  if (!row || e.touches.length !== 1) return;
  const t0 = e.touches[0];
  touch = { row, x: t0.clientX, y: t0.clientY, lifted: false, used: false };
  touch.timer = setTimeout(() => {
    const r = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.className = 'crow crow-ghost';
    ghost.removeAttribute('href');
    ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px`;
    row.closest('.course').append(ghost);
    Object.assign(touch, { lifted: true, used: true, ghost, dx: touch.x - r.left, dy: touch.y - r.top });
    dragRow = row;
    row.closest('.course')?.classList.add('is-dragging');
    row.classList.add('is-dragged');
    navigator.vibrate?.(12);
  }, 400);
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!touch) return;
  const t0 = e.touches[0];
  if (!touch.lifted) {
    if (Math.hypot(t0.clientX - touch.x, t0.clientY - touch.y) > 10) { clearTimeout(touch.timer); touch = null; } // 是捲動
    return;
  }
  e.preventDefault();
  touch.x = t0.clientX;
  touch.y = t0.clientY;
  touch.ghost.style.left = `${touch.x - touch.dx}px`;
  touch.ghost.style.top = `${touch.y - touch.dy}px`;
  markDrop(groupAt(document.elementFromPoint(touch.x, touch.y)));
  // 拖到上下邊緣：慢慢捲動
  cancelAnimationFrame(touch.raf);
  const edge = touch.y < 90 ? -1 : touch.y > innerHeight - 70 ? 1 : 0;
  if (edge) {
    const step = () => {
      if (!touch?.lifted) return;
      window.scrollBy(0, edge * 8);
      markDrop(groupAt(document.elementFromPoint(touch.x, touch.y)));
      touch.raf = requestAnimationFrame(step);
    };
    touch.raf = requestAnimationFrame(step);
  }
}, { passive: false });
document.addEventListener('touchend', () => {
  if (!touch) return;
  if (!touch.lifted) { clearTimeout(touch.timer); touch = null; return; }
  const g = groupAt(document.elementFromPoint(touch.x, touch.y));
  const id = dragRow?.dataset.task;
  const keep = touch;
  dropTouch();
  touch = { used: keep.used }; // 擋住放手後的 click
  setTimeout(() => { if (touch && !touch.row) touch = null; }, 400);
  if (g && id) setTaskGroup(id, g.dataset.group);
});
document.addEventListener('touchcancel', dropTouch);

// 電腦右鍵：「移到…」選單（手機長按也會觸發 contextmenu，但手機用上面的拖動，這裡只擋掉系統選單）
document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest?.('.crow[data-task]');
  if (!row) return;
  e.preventDefault();
  if (!touch) openMoveMenu(row);
});
// 長按拿起過，放手產生的 click 不要打開這一項
document.addEventListener('click', (e) => {
  if (touch?.used && e.target.closest?.('.crow[data-task]')) { e.preventDefault(); e.stopPropagation(); touch = null; }
}, true);

document.addEventListener('keydown', (e) => {
  if (tourActive()) {
    if (e.key === 'Escape') endTour();
    else if (e.key === 'ArrowRight') tourStep(1);
    else if (e.key === 'ArrowLeft') tourStep(-1);
    return;
  }
  if (ui.ask) {
    // 對話框開著：1–4 選選項（在輸入格打字時除外），Esc 之後再說
    if (e.key === 'Escape') { actions['ask-later'](); return; }
    const pick = /^[1-4]$/.test(e.key) && e.target.id !== 'ask-input' && askLayer.querySelectorAll('.ask__choice')[Number(e.key) - 1];
    if (pick) { e.preventDefault(); pick.click(); }
    return;
  }
  if (e.key === 'Escape') {
    if (!document.getElementById('popover').hidden) closePopover();
    else if (ui.aiModal) actions['ai-modal-close']();
    else if (ui.dockOpen) toggleDock(false);
    else if (ui.renameCourse) actions['course-rename-cancel']();
    else if (ui.editRow) actions['course-row-cancel']();
  }
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.matches?.('li[data-action]')) { e.preventDefault(); t.click(); }
  if (t.id === 'say-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    say(t.value);
    requestAnimationFrame(() => document.getElementById('say-input')?.focus());
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.matches('[data-form="task"], [data-form="edit-task"]')) {
    e.preventDefault();
    const form = e.target;
    const f = new FormData(form);
    const [h, m] = String(f.get('time')).split(':').map(Number);
    const fields = {
      title: String(f.get('title')).trim(), course: String(f.get('course') || '').trim(),
      kind: String(f.get('kind')).trim(), date: String(f.get('date')), min: h * 60 + m,
      hours: Number(f.get('hours')), requirements: String(f.get('requirements') || '').trim(),
    };
    if (!fields.title || !fields.kind) { toast(L('請填寫名稱和類型', 'Enter a name and type'), 'alert'); return; }
    const steps = [...form.querySelectorAll('[data-step-id]')].map((row) => ({
      id: row.dataset.stepId, title: row.querySelector('[name="step-title"]').value.trim(),
      min: Number(row.querySelector('[name="step-hours"]').value) * 60,
    }));
    if (steps.some((st) => !st.title)) { toast(L('請為每個子任務填名稱', 'Name every step'), 'alert'); return; }
    if (form.dataset.form === 'edit-task') {
      if (!steps.length) { toast(L('請保留至少一個有名稱的子任務', 'Keep at least one named step'), 'alert'); return; }
      updateTask(form.dataset.task, fields, steps);
    } else {
      const files = [...(form.querySelector('[name="guide"]')?.files || [])];
      const big = files.find((file) => !fits(file, LIMIT_MB.task));
      if (big) { toast(fileProblem({ reason: 'too-big', maxMB: LIMIT_MB.task }, big), 'alert'); return; }
      addTask(fields, steps.map(({ title, min }) => ({ title, min })));
      const taskId = ui.taskId;
      location.hash = `#/tasks/${taskId}`;
      saveGuides(taskId, files);
    }
    return;
  }
  if (e.target.matches('[data-form="busy"]')) {
    e.preventDefault();
    const f = new FormData(e.target);
    const minutes = (v) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
    const start = minutes(String(f.get('start'))), end = minutes(String(f.get('end')));
    const label = String(f.get('label')).trim();
    if (end <= start || !label) { toast(L('請填寫名稱，結束時間必須晚於開始時間。', 'Enter a name and an end time after the start.'), 'alert'); return; }
    const date = String(f.get('date')), type = String(f.get('repeat'));
    closePopover();
    addRule({ label, type, start, end, ...(type === 'weekly' ? { days: [weekday(date)] } : { date }) });
    return;
  }
  if (e.target.matches('[data-form="course-rename"]')) {
    e.preventDefault();
    const f = new FormData(e.target);
    renameCourse(e.target.dataset.course, String(f.get('name')), String(f.get('title')));
    return;
  }
  if (e.target.matches('[data-form="course-row"]')) {
    e.preventDefault();
    const f = new FormData(e.target);
    const [h, m] = String(f.get('time') || '').split(':').map(Number);
    editTaskBasics(e.target.dataset.task, { title: String(f.get('title')), date: String(f.get('date')), min: h * 60 + m, weight: String(f.get('weight') || '') });
    return;
  }
  if (e.target.matches('[data-form="say"]')) {
    e.preventDefault();
    const ta = e.target.querySelector('textarea');
    say(ta.value);
    requestAnimationFrame(() => document.getElementById('say-input')?.focus());
  }
});

document.addEventListener('input', (e) => {
  if (e.target.matches('[data-draft]')) { ui.draft = e.target.value; autosize(); }
  if (e.target.matches('[data-syllabus-text]')) {
    ui.syllabusDraft = e.target.value;
    const count = document.querySelector('[data-syllabus-count]');
    const n = ui.basket.length;
    if (count) count.textContent = L(`${e.target.value.length} 字`, `${e.target.value.length} characters`) + (n ? L(` · ${n} 個檔案`, ` · ${n} file${n === 1 ? '' : 's'}`) : '');
  }
});

/* ---------------- 附件：存進這個瀏覽器（attachments.js 的 keepFile） ---------------- */
const fileProblem = (err, file) => (err.reason === 'too-big'
  ? L(`「${file.name}」超過 ${err.maxMB} MB`, `"${file.name}" is over ${err.maxMB} MB`)
  : L('儲存失敗，請檢查瀏覽器儲存空間。', 'Could not save. Check browser storage space.'));

/** 結果到了：檢查視窗逐行揭曉找到／找不到，最後出報告。視窗被關掉就停。 */
function revealChecks(id) {
  if (ui.aiModal?.doc !== id) return;
  const doc = getState().docs.find((d) => d.id === id);
  const rows = checklist(doc).length;
  ui.aiModal = { doc: id, phase: 'reveal', step: 1 }; // 第一行「讀取大綱」已經完成
  const tick = () => {
    const m = ui.aiModal;
    if (m?.doc !== id) return;
    m.step += 1;
    if (m.step >= rows) m.phase = 'done';
    render();
    if (m.phase !== 'done') setTimeout(tick, REVEAL_STEP_MS);
  };
  render();
  setTimeout(tick, REVEAL_STEP_MS);
}

const readProblem = (err) => ({
  'too-big': err.image
    ? L(`AI 只能讀 ${AI_IMAGE_MAX_MB} MB 以內的圖片，請截小一點或壓縮後再放。`, `The AI can only read images up to ${AI_IMAGE_MAX_MB} MB. Crop or compress it first.`)
    : L(`AI 只能讀 ${AI_MAX_MB} MB 以內的檔案，請先壓縮或只放有日期的那幾頁。`, `The AI can only read files up to ${AI_MAX_MB} MB. Compress it or keep only the pages with dates.`),
  missing: L('讀不到這份檔案，請重新放入原檔。', 'Cannot read this file. Add the original again.'),
  offline: L('連不上 AI，請檢查網絡後再試。', 'Cannot reach the AI. Check your connection and try again.'),
  'no-key': L('AI 還沒在伺服器設定好（缺少 DIFY_API_KEY）。', 'The AI is not set up on the server yet (DIFY_API_KEY is missing).'),
  'no-server': L('這個網址沒有 AI 轉接服務。請用 node serve.mjs 預覽，或在已發布的網站使用。', 'No AI relay at this address. Preview with node serve.mjs or use the published site.'),
  invalid: L('AI 讀不出課程資料。如果是圖片，請確認字夠清楚；掃描的 PDF 可以改成截圖放入。', 'The AI found no course data. If it is an image, make sure the text is sharp; for a scanned PDF, add screenshots instead.'),
}[err.reason] || L('AI 讀取失敗，請稍後再試。', 'The AI could not read it. Try again later.'));

async function saveGuides(taskId, files) {
  for (const file of files) {
    try {
      addTaskAttachment(taskId, await keepFile(file, LIMIT_MB.task));
    } catch (err) { toast(fileProblem(err, file), 'alert'); return; }
  }
}

/** 剪貼簿裡的圖片（例如剛截的圖），變成有檔名的 File；讀不到（瀏覽器不准）就回傳空陣列。 */
async function clipboardImages() {
  if (!navigator.clipboard?.read) return [];
  try {
    const out = [];
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) out.push(namedShot(await item.getType(type)));
    }
    return out;
  } catch { return []; }
}
const namedShot = (blob, i = 0) => new File([blob], `${L('截圖', 'Screenshot')} ${new Date().toTimeString().slice(0, 8).replaceAll(':', '')}${i ? `-${i + 1}` : ''}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: blob.type || 'image/png' });

// 在收集頁按 Ctrl+V／⌘V 貼上截圖：圖片放進收集箱；貼的是文字就照舊進文字框
document.addEventListener('paste', (e) => {
  if (getMode() !== 'mine' || current.name !== 'import' || current.params?.[0] !== 'add') return;
  const shots = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!shots.length) return;
  e.preventDefault();
  takeFiles(shots.map((f, i) => (f.name && f.name !== 'image.png' ? f : namedShot(f, i))));
});

async function takeFiles(files) {
  const names = [...files].map((f) => f.name).join('、');
  if (!names) return;
  if (getMode() === 'mine' && current.name === 'import') {
    for (const file of files) {
      if (!/[.](pdf|docx|pptx|txt|md|jpe?g|png|gif|webp)$/i.test(file.name)) { toast(L(`「${file.name}」不是 PDF、Word、PPT、文字檔或圖片（JPG、PNG、WEBP），沒有放入。`, `"${file.name}" is not a PDF, Word, PowerPoint, text file or image (JPG, PNG, WEBP), so it was skipped.`), 'alert'); continue; }
      try {
        ui.basket.push(await keepFile(file, LIMIT_MB.syllabus));
      } catch (err) {
        toast(fileProblem(err, file), 'alert');
        if (err.reason !== 'too-big') break; // 太大的跳過，存不進去就停
      }
    }
    if (current.params?.[0] !== 'add') location.hash = '#/import/add';
    render();
    return;
  }
  ui.dropMsg = `收到檔名「${names}」。原型不會上傳或讀取內容，會改用示範大綱。`;
  if (current.name === 'start') {
    ob.loaded = true;
    render();
    obLater(1, 2400, () => obGo(2));
    return;
  }
  render();
}

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.matches('[data-doc-course]')) { setDocCourse(t.dataset.docCourse, t.value); return; }
  if (t.matches('[data-task-file]')) {
    const file = t.files[0];
    if (!file) return;
    t.disabled = true;
    try {
      addTaskAttachment(t.dataset.taskFile, await keepFile(file, LIMIT_MB.task));
    } catch (err) { toast(fileProblem(err, file), 'alert'); t.disabled = false; t.value = ''; }
    return;
  }
  if (t.matches('[data-file]')) takeFiles(t.files);
  if (t.matches('[data-ob-sleep]')) {
    ob.sleep[t.dataset.obSleep] = Number(t.value);
    ob.sleepSet = false;
    render();
  }
});

document.addEventListener('dragover', (e) => {
  const z = e.target.closest?.('[data-drop]');
  if (!z) return;
  e.preventDefault();
  z.classList.add('is-over');
});
document.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('is-over'));
document.addEventListener('drop', (e) => {
  const z = e.target.closest?.('[data-drop]');
  if (!z) return;
  e.preventDefault();
  takeFiles(e.dataTransfer.files);
});

/* ---------------- 視窗 ---------------- */
const bands = (w) => [760, 900, 1180].filter((b) => w >= b).length;
let band = bands(window.innerWidth);
window.addEventListener('resize', () => {
  const b = bands(window.innerWidth);
  if (b !== band) { band = b; render(); return; }
  drawArrows(main, ui.arrowFor);
  place();
  placeTour();
});
window.addEventListener('scroll', () => {
  header.classList.toggle('is-scrolled', window.scrollY > 4);
  place();
  placeTour();
}, { passive: true });

window.addEventListener('hashchange', () => render());
ui.dockOpen = recall('dock') === '1';
applyStatic();
render();

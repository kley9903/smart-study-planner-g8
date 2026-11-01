// 入口：切頁、畫面更新、所有按鈕的動作。
import {
  getState, subscribe, ui, ob, resetDemo, say, runScenario, chooseOption, inkProposal, eraseProposal,
  checkin, checkinRemain, setProgress, adjustStep, confirmEstimate, setItemState, inkAllItems, saveItem,
  addRule, removeRule, setSleep, obRestart, obFinish,
  getMode, enterMine, enterDemo, addTask, deleteTask, autoPlan, relang, updateTask, addTaskAttachment, addOwnDoc, removeOwnDoc,
} from './store.js';
import { editor } from './views/task-editor.js';
import { renderMonth, shiftMonth } from './views/month.js';
import { stepFields, stepHelper, suggestSteps } from './views/task-editor.js';
import { saveAttachment, getAttachment, removeAttachment } from './attachments.js';
import { L, setLang, applyStatic } from './i18n.js';
import { toast, openPopover, closePopover, place, esc, icon, remember, recall } from './ui.js';
import { drawArrows, forgetPencils } from './planner.js';
import { startTour, endTour, tourStep, tourActive, placeTour } from './tour.js';
import { blockOf, stepOf, taskOf, overlay, pendingProposal, pendingCount, courseOf, inkOf } from './model.js';
import { dayLabel, span, hoursText, hm, wdName, weekday, mdNum, dayShort, md } from './time.js';
import { createDemoState } from './demo-data.js';
import * as week from './views/week.js';
import * as tasks from './views/tasks.js';
import * as importView from './views/import.js';
import * as availability from './views/availability.js';
import * as start from './views/start.js';
import * as about from './views/about.js';
import { renderMargin } from './views/margin.js';

const views = {
  week, tasks,
  monthly: { render: (s) => `<div class="page-head"><div><h1 class="page-head__title">${L('月曆', 'Monthly')}</h1><p class="page-head__lede">${L('查看整個月的截止日期及忙碌時段，點選日期新增或查看內容。', 'View deadlines and busy times for the month. Select a date to view or add items.')}</p></div></div><section class="sheet monthly-page">${renderMonth(s)}</section>` },
  'add-task': { render: (s) => `<div class="page-head"><h1 class="page-head__title">${L('新增任務', 'Add task')}</h1></div><div class="add-task-page">${editor(s, null, ui.taskDate)}${stepHelper()}</div>` },
  import: importView, time: availability, start, about,
  margin: { render: (s) => `<div class="margin-page">${renderMargin(s)}</div>` },
};

const main = document.getElementById('main');
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
  if (r.name === 'margin' && wide()) {
    const q = r.query.toString();
    location.replace(`#/week${q ? `?${q}` : ''}`);
    return;
  }
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

  const thread = main.querySelector('[data-thread-scroll]');
  const threadTop = thread ? thread.scrollTop : null;
  const scrollers = [...main.querySelectorAll('.planner__scroll, .horizon__scroll')].map((el) => el.scrollLeft);
  const focusId = document.activeElement?.id;

  closePopover();
  main.innerHTML = views[r.name].render(s, r.params);
  document.body.dataset.route = r.name;
  updateNav(r.name === 'add-task' ? 'tasks' : r.name, s);

  if (changed) {
    if (r.name !== 'margin') window.scrollTo(0, 0);
    lastKey = key;
  } else {
    main.querySelectorAll('.planner__scroll, .horizon__scroll').forEach((el, i) => { if (scrollers[i] != null) el.scrollLeft = scrollers[i]; });
  }

  // AI 助手：新訊息很長（例如要選做法）就由它的開頭看起，否則捲到最底
  const t = main.querySelector('[data-thread-scroll]');
  const notes = main.querySelectorAll('.thread > .note');
  const last = notes[notes.length - 1];
  if (r.name === 'margin') {
    if (info.scrollThread || changed) {
      requestAnimationFrame(() => {
        const top = last ? last.getBoundingClientRect().top + window.scrollY - header.offsetHeight - 12 : 0;
        const tall = last && last.offsetHeight > window.innerHeight * 0.7;
        window.scrollTo(0, tall ? top : document.documentElement.scrollHeight);
      });
    }
  } else if (t) {
    if (info.scrollThread && last && last.offsetHeight > t.clientHeight * 0.8) t.scrollTop = last.offsetTop - 12;
    else t.scrollTop = info.scrollThread || changed || threadTop == null ? t.scrollHeight : threadTop;
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

/* ---------------- 彈出框內容 ---------------- */
function findBlock(s, id) {
  const ov = overlay(s);
  const real = blockOf(s, id);
  if (real) return { b: real, variant: ov.ghosts.has(id) ? 'ghost' : 'ink' };
  const add = ov.adds.find((x) => x.id === id);
  return add ? { b: add, variant: 'pencil' } : {};
}

function ghostText(s, b, p) {
  const c = p?.changes.find((x) => x.block === b.id);
  if (!c) return L('AI 建議改動這一段。', 'The AI suggests changing this session.');
  if (c.kind === 'move') return L(`AI 建議移到 ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}。`, `The AI suggests moving it to ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}.`);
  if (c.kind === 'split') {
    const parts = c.to.map((t) => `${dayShort(t.date)} ${span(t.start, t.end)}`);
    return L(`AI 建議分兩段：${parts.join('、')}。`, `The AI suggests two sessions: ${parts.join(', ')}.`);
  }
  if (c.kind === 'remove') return L('AI 建議不做這一段（簡化）。', 'The AI suggests skipping this (simplified).');
  if (c.kind === 'defer') return L(`AI 建議移到 ${md(c.toDate)}，具體時間下次排程再定。`, `The AI suggests moving it to ${md(c.toDate)}; the exact time is set in the next round.`);
  return L('AI 建議改動這一段。', 'The AI suggests changing this session.');
}

function proposalActions(p) {
  if (!p) return '';
  if (p.kind === 'hero' && !p.option) {
    return `<div class="pop__actions"><button class="btn btn--sm btn--ink" type="button" data-action="guide-decide">${icon('arrow')} ${L('去選做法', 'Choose an option')}</button></div>`;
  }
  return `<div class="pop__actions"><button class="btn btn--sm btn--ink" type="button" data-action="ink">${icon('check')} ${L(`確認全部改動（${p.changes.length} 項）`, `Confirm all (${p.changes.length})`)}</button><button class="btn btn--sm btn--ghost" type="button" data-action="erase">${icon('x')} ${L('不要', 'Discard')}</button></div>`;
}

function openBlock(el) {
  const s = getState();
  const { b, variant } = findBlock(s, el.dataset.block);
  if (!b) return;
  const task = taskOf(s, b.task);
  const { step } = stepOf(s, b.step);
  const p = pendingProposal(s);
  const tag = variant === 'ink'
    ? `<span class="chip chip--quiet">${icon('check')} ${L('已確認', 'Confirmed')}</span>`
    : variant === 'pencil' ? `<span class="chip chip--pencil">${icon('pencil')} ${L('建議 · 未確認', 'Suggested · not confirmed')}</span>` : `<span class="chip chip--pencil">${icon('arrow')} ${L('AI 建議移走', 'Suggested to move')}</span>`;
  let html = `
    <div class="pop__eyebrow" data-ink="${inkOf(s, task)}"><span class="course-tag"><span class="dot"></span>${esc(courseOf(s, task).name)}</span>${tag}</div>
    <div class="pop__title">${esc(task.short)} · ${esc(step.title)}</div>
    <div class="pop__time">${dayLabel(b.date)} ${span(b.start, b.end)} · ${hoursText(b.end - b.start)}</div>
    <div class="pop__section"><div class="pop__label">${icon('pencil')} ${L('為甚麼排在這裡', 'Why it is here')}</div><p class="pop__reason">${esc(b.reason || '')}</p></div>`;
  if (variant === 'ink') {
    html += `
      <div class="pop__section">
        <div class="pop__label">${icon('check')} ${L('進度 · 你回報的直接生效', 'Progress · takes effect right away')}</div>
        <div class="seg seg--sm" role="group" aria-label="${L('進度', 'Progress')}">
          ${[['todo', L('未開始', 'Not started')], ['doing', L('進行中', 'In progress')], ['done', L('已完成', 'Done')]].map(([k, t]) => `<button class="seg__opt" type="button" data-action="progress" data-step="${step.id}" data-p="${k}" aria-pressed="${step.progress === k}">${t}</button>`).join('')}
        </div>
        <p class="muted" style="font-size:12.5px;margin-top:8px">${step.progress === 'doing' && step.remain ? L(`你回報還差 ${hoursText(step.remain)}。`, `You reported ${hoursText(step.remain)} left. `) : ''}${L('時段結束不會自動當作完成。', 'A session ending is not counted as done.')}</p>
      </div>
      <div class="pop__actions"><a class="btn btn--sm" href="#/tasks/${task.id}">${icon('list')} ${L('在任務頁查看', 'Open in Tasks')}</a></div>`;
  } else {
    html += `
      <div class="pop__section"><p style="font-size:13.5px;color:var(--ink-2)">${variant === 'pencil' ? L('這是建議的時段，還未確認。', 'This is a suggested session, not confirmed yet.') : esc(ghostText(s, b, p))}</p></div>
      ${proposalActions(p)}`;
  }
  openPopover(el, html);
}

function ruleWhen(r) {
  if (r.type === 'single') return `${dayLabel(r.date)} ${span(r.start, r.end)}`;
  const days = r.days.length === 7 ? L('每天', 'Every day') : L(`每週${r.days.map((d) => wdName(d)).join('、')}`, `Every ${r.days.map((d) => wdName(d)).join(', ')}`);
  return `${days} ${span(r.start, r.end)}`;
}

function openHatch(el) {
  const s = getState();
  const id = el.dataset.rule;
  if (!id) {
    const night = el.dataset.sleep;
    const o = s.sleepOverrides.find((x) => x.night === night);
    const pen = overlay(s).sleep.find((x) => x.night === night);
    openPopover(el, `
      <div class="pop__eyebrow">${icon('moon')} ${L('睡眠 · 每晚重複', 'Sleep · every night')}</div>
      <div class="pop__title">${hm(s.sleep.start)}–${hm(s.sleep.end)}</div>
      ${pen ? `<div class="pop__time">${L(`AI 建議：${md(night)}晚上 ${hm(pen.start)} 才睡（只限今晚）`, `AI suggests: bed at ${hm(pen.start)} on ${md(night)} (tonight only)`)}</div>` : o ? `<div class="pop__time">${L(`${md(night)}晚上 ${hm(o.start)} 才睡（只限這一晚）`, `${md(night)}: bed at ${hm(o.start)} (that night only)`)}</div>` : ''}
      <div class="pop__section"><p class="pop__reason">${L('AI 不會把睡眠當作讀書時間。要遲睡，它會先問你，而且只限當晚，不會改每晚的設定。', 'Sleep is never used for study. A later bedtime is only suggested for one night, after asking you.')}</p></div>
      <div class="pop__actions"><a class="btn btn--sm" href="#/time">${icon('pencil')} ${L('改睡眠時間', 'Change sleep time')}</a></div>`);
    return;
  }
  const real = s.unavailable.find((x) => x.id === id);
  const r = real || overlay(s).rules.find((x) => x.id === id);
  if (!r) return;
  const kind = r.type === 'single' ? `${icon('pin')} ${L('只限這天', 'One day')}` : `${icon('repeat')} ${L('每週重複', 'Weekly')}`;
  const src = r.src === 'syllabus' ? L('從課程大綱找到，你核對過。', 'Found in your syllabus and checked by you.') : L('你自己加的。', 'Added by you.');
  if (current.name === 'time' && ui.timeTool === 'erase' && real) {
    openPopover(el, `
      <div class="pop__eyebrow">${icon('eraser')} ${L('移除沒空時間', 'Remove busy time')}</div>
      <div class="pop__title">${esc(r.label)}</div>
      <div class="pop__time">${ruleWhen(r)}</div>
      <div class="pop__section"><p style="font-size:13.5px;color:var(--ink-2)">${r.type === 'weekly' ? L('這是每週重複的沒空時間，移除後每週這段時間都會變回可以讀書。', 'This repeats weekly; removing it frees this time every week. ') : L('只會移除這一天。', 'Only this day is removed. ')}${r.src === 'syllabus' ? L('這是從課程大綱找到的上課時間。', 'This class time came from your syllabus.') : ''}</p></div>
      <div class="pop__actions"><button class="btn btn--sm btn--ink" type="button" data-action="remove-rule" data-rule="${r.id}">${icon('eraser')} ${L('移除', 'Remove')}</button><button class="btn btn--sm btn--ghost" type="button" data-action="pop-close">${L('取消', 'Cancel')}</button></div>`);
    return;
  }
  const p = pendingProposal(s);
  openPopover(el, `
    <div class="pop__eyebrow">${L('沒空時間', 'Busy')} · ${kind}${real ? '' : ` <span class="chip chip--pencil">${icon('pencil')} ${L('AI 建議', 'AI suggestion')}</span>`}</div>
    <div class="pop__title">${esc(r.label)}</div>
    <div class="pop__time">${ruleWhen(r)}</div>
    <div class="pop__section"><p style="font-size:13.5px;color:var(--ink-2)">${real ? src : L('AI 從你說的話理解到的，還未確認。', 'The AI understood this from what you said; not confirmed yet.')}</p></div>
    ${real ? `<div class="pop__actions"><a class="btn btn--sm" href="#/time">${icon('hatch')} ${L('到「不可用時段」修改', 'Edit in Busy times')}</a></div>` : proposalActions(p)}`);
}

/* ---------------- 拖拉標記沒空的時間 ---------------- */
let paint = null;
let swallowUntil = 0;
const snap = (m) => Math.floor(m / 30) * 30;

function cssNum(el, name) { return parseFloat(getComputedStyle(el).getPropertyValue(name)); }

document.addEventListener('pointerdown', (e) => {
  const col = e.target.closest('.planner.is-painting .pcol');
  if (!col || e.button !== 0) return;
  const pl = col.closest('.planner');
  const ppm = cssNum(pl, '--ppm');
  const pStart = cssNum(pl, '--p-start');
  const pEnd = cssNum(pl, '--p-end');
  const rect = col.getBoundingClientRect();
  const toMin = (y) => Math.max(pStart, Math.min(pEnd - 30, pStart + (y - rect.top) / ppm));
  const m = snap(toMin(e.clientY));
  paint = { col, date: col.dataset.date, anchor: m, cur: m, moved: false, onHatch: !!e.target.closest('.hatch'), toMin, y0: e.clientY, sel: null };
  try { col.setPointerCapture(e.pointerId); } catch { /* 某些瀏覽器不支援 */ }
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
  if (!paint) return;
  if (Math.abs(e.clientY - paint.y0) > 5) paint.moved = true;
  if (!paint.moved) return;
  paint.cur = snap(paint.toMin(e.clientY));
  drawSel();
});

document.addEventListener('pointerup', () => {
  if (!paint) return;
  const p = paint;
  paint = null;
  if (!p.moved && p.onHatch) return; // 當作普通按一下灰色時段
  swallowUntil = performance.now() + 300;
  if (!p.moved) { p.cur = p.anchor + 30; }
  paint = p;
  drawSel();
  paint = null;
  openPaint(p);
});

function drawSel() {
  const p = paint;
  const s = Math.min(p.anchor, p.cur);
  const e = Math.max(p.anchor, p.cur) + 30;
  if (!p.sel) {
    p.sel = document.createElement('div');
    p.sel.className = 'paint-sel';
    p.sel.tabIndex = -1;
    p.col.append(p.sel);
  }
  p.start = s;
  p.end = e;
  p.sel.style.setProperty('--s', s);
  p.sel.style.setProperty('--e', e);
  p.sel.innerHTML = `<span>${span(s, e)}</span>`;
}

let painted = null;
function openPaint(p) {
  painted = { date: p.date, start: p.start, end: p.end, repeat: ui.paintRepeat };
  const wdLabel = wdName(weekday(p.date));
  openPopover(p.sel, `
    <div class="pop__eyebrow">${icon('hatch')} ${L('新的沒空時間', 'New busy time')}</div>
    <div class="pop__title">${dayLabel(p.date)}</div>
    <div class="pop__time">${span(p.start, p.end)} · ${hoursText(p.end - p.start)}</div>
    <div class="pop__section">
      <label class="field"><span class="field__label">${L('這段時間在做甚麼', 'What is it?')}</span><input class="input" id="paint-label" maxlength="16" placeholder="${L('例如：小組會議', 'e.g. Group meeting')}"></label>
      <div class="pop__label" style="margin-top:12px">${L('重複方式', 'Repeat')}</div>
      <div class="seg seg--sm" role="group" aria-label="${L('重複方式', 'Repeat')}">
        <button class="seg__opt" type="button" data-action="paint-repeat" data-repeat="single" aria-pressed="${painted.repeat === 'single'}">${icon('pin')} ${L(`只限 ${mdNum(p.date)}`, `Only ${mdNum(p.date)}`)}</button>
        <button class="seg__opt" type="button" data-action="paint-repeat" data-repeat="weekly" aria-pressed="${painted.repeat === 'weekly'}">${icon('repeat')} ${L(`每週${wdLabel}`, `Every ${wdLabel}`)}</button>
      </div>
    </div>
    <div class="pop__actions">
      <button class="btn btn--sm btn--ink" type="button" data-action="paint-confirm">${icon('hatch')} ${L('標記為沒空', 'Mark as busy')}</button>
      <button class="btn btn--sm btn--ghost" type="button" data-action="pop-close">${L('取消', 'Cancel')}</button>
    </div>`, { onClose: () => p.sel?.remove() });
  setTimeout(() => document.getElementById('paint-label')?.focus(), 30);
}

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
  if (current.name === 'week') {
    const box = main.querySelector('.margin .decide');
    if (box) {
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      box.querySelector('.opt, .btn--ink')?.focus({ preventScroll: true });
    }
    return;
  }
  location.hash = '#/margin';
}

/* ---------------- 按鈕動作 ---------------- */
const $ = (sel) => document.querySelector(sel);

function openBusyForm(el) {
  const date = el.dataset.date || getState().today;
  openPopover(el, `<form data-form="busy">
    <h2 class="pop__title">${L('新增忙碌時段', 'Add busy time')}</h2>
    <label class="field"><span class="field__label">${L('名稱', 'Name')}</span><input class="input" name="label" maxlength="80" required></label>
    <label class="field"><span class="field__label">${L('日期', 'Date')}</span><input class="input" name="date" type="date" value="${date}" required></label>
    <label class="field"><span class="field__label">${L('開始時間', 'Start time')}</span><input class="input" type="time" name="start" value="09:00" required></label>
    <label class="field"><span class="field__label">${L('結束時間', 'End time')}</span><input class="input" type="time" name="end" value="10:00" required></label>
    <label class="field"><span class="field__label">${L('重複方式', 'Repeat')}</span><select class="select" name="repeat"><option value="single">${L('只限這天', 'One day')}</option><option value="weekly">${L('每週同一天', 'Weekly on this day')}</option></select></label>
    <p class="demo-note">${L('跨午夜的時段請分成兩天新增。', 'For overnight events, add a separate time on each day.')}</p>
    <button class="btn btn--ink" type="submit">${L('保存', 'Save')}</button>
  </form>`);
}

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
  block: (el) => openBlock(el),
  hatch: (el) => openHatch(el),
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
  tool: (el) => { ui.timeTool = el.dataset.tool; render(); },
  'hl-rule': (el) => {
    ui.hlRule = ui.hlRule === el.dataset.rule ? null : el.dataset.rule;
    render();
    main.querySelector('.hatch.is-hl')?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  },
  'sleep-edit': (el) => { ui.sleepEdit = el.dataset.on === '1'; render(); },
  'sleep-save': () => setSleep(Number($('#sleep-start').value), Number($('#sleep-end').value)),
  'remove-rule': (el) => { closePopover(); removeRule(el.dataset.rule); },
  'paint-repeat': (el) => {
    if (!painted) return;
    painted.repeat = el.dataset.repeat;
    ui.paintRepeat = painted.repeat;
    el.parentElement.querySelectorAll('.seg__opt').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  },
  'paint-confirm': () => {
    if (!painted) return;
    const label = ($('#paint-label')?.value || '').trim() || L('沒空', 'Busy');
    const p = painted;
    painted = null;
    closePopover();
    addRule({ type: p.repeat, ...(p.repeat === 'weekly' ? { days: [weekday(p.date)] } : { date: p.date }), start: p.start, end: p.end, label });
  },
  doc: (el) => { ui.docId = el.dataset.doc; ui.editItem = null; render(); },
  'open-doc': (el) => { ui.docId = el.dataset.doc; },
  'doc-remove': (el) => {
    if (!confirm(L('從這個瀏覽器移除這份大綱？', 'Remove this syllabus from this browser?'))) return;
    removeAttachment(el.dataset.doc).catch(() => {});
    removeOwnDoc(el.dataset.doc);
  },
  'demo-docs': () => {
    document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(L('下面是示範大綱的抽取結果（預先寫好）', 'Below are the demo extraction results (pre-written)'), 'info');
  },
  item: (el) => setItemState(el.dataset.doc, el.dataset.item, el.dataset.to),
  'edit-item': (el) => { ui.editItem = el.dataset.item || null; render(); },
  'save-item': (el) => saveItem(el.dataset.doc, el.dataset.item, { when: $('#edit-when').value.trim() || '—', hours: $('#edit-hours').value.trim() || '—' }),
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
  'auto-plan': () => autoPlan(),
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
};

document.addEventListener('click', (e) => {
  if (performance.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el, e);
}, true);

document.getElementById('scrim').addEventListener('click', () => closePopover());

document.addEventListener('keydown', (e) => {
  if (tourActive()) {
    if (e.key === 'Escape') endTour();
    else if (e.key === 'ArrowRight') tourStep(1);
    else if (e.key === 'ArrowLeft') tourStep(-1);
    return;
  }
  if (e.key === 'Escape') closePopover();
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
      if (files.some((file) => file.size > 10 * 1024 * 1024)) { toast(L('每份附件最多 10 MB', 'Each attachment must be 10 MB or smaller'), 'alert'); return; }
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
  if (e.target.matches('[data-form="say"]')) {
    e.preventDefault();
    const ta = e.target.querySelector('textarea');
    say(ta.value);
    requestAnimationFrame(() => document.getElementById('say-input')?.focus());
  }
});

document.addEventListener('input', (e) => {
  if (e.target.matches('[data-draft]')) { ui.draft = e.target.value; autosize(); }
});

async function saveGuides(taskId, files) {
  for (const file of files) {
    const id = crypto.randomUUID();
    try {
      await saveAttachment(id, file);
      addTaskAttachment(taskId, { id, name: file.name, size: file.size });
    } catch { toast(L('附件儲存失敗，請檢查瀏覽器儲存空間。', 'Could not save an attachment. Check browser storage space.'), 'alert'); return; }
  }
}

async function takeFiles(files) {
  const names = [...files].map((f) => f.name).join('、');
  if (!names) return;
  if (getMode() === 'mine' && current.name === 'import') {
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) { toast(L(`「${file.name}」超過 20 MB`, `"${file.name}" is over 20 MB`), 'alert'); continue; }
      const id = crypto.randomUUID();
      try {
        await saveAttachment(id, file);
        addOwnDoc({ id, name: file.name, size: file.size });
      } catch { toast(L('儲存失敗，請檢查瀏覽器儲存空間。', 'Could not save. Check browser storage space.'), 'alert'); return; }
    }
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
  if (t.matches('[data-task-file]')) {
    const file = t.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast(L('每份附件最多 10 MB', 'Each attachment must be 10 MB or smaller'), 'alert'); t.value = ''; return; }
    t.disabled = true;
    const id = crypto.randomUUID();
    try {
      await saveAttachment(id, file);
      addTaskAttachment(t.dataset.taskFile, { id, name: file.name, size: file.size });
    } catch { toast(L('儲存失敗，請檢查瀏覽器儲存空間。', 'Could not save. Check browser storage space.'), 'alert'); t.disabled = false; t.value = ''; }
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
applyStatic();
render();

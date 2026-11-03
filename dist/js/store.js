// 狀態與動作。兩種模式：
// - demo（新手導覽）：示範資料只在記憶體；重新整理或按「重設」會回到示範資料。
// - mine（直接開始）：使用者自己的計劃，存在這個瀏覽器的 localStorage，每次改動即保存。
// 介面文字中英兩版：L('中文', 'English')。
import { createDemoState, DEMO_TODAY } from './demo-data.js';
import { HERO, heroChanges, heroMissing, CHECKIN, ESSAY, fallbackText, CHIPS, matchScenario } from './scenarios.js';
import { blockOf, stepOf, taskOf, pendingProposal } from './model.js';
import { planSteps } from './scheduler.js';
import { md, span, dayShort, hoursText } from './time.js';
import { recall, remember, esc } from './ui.js';
import { L } from './i18n.js';
import { parseWhen, parseHours, typeLabel } from './syllabus-ai.js';

const MINE_KEY = 'mine';
const INKS = ['blue', 'amber', 'green', 'plum'];
let ORIGINAL = createDemoState();
let mode = recall('mode') === 'mine' ? 'mine' : 'demo';
let state = mode === 'mine' ? loadMine() : fresh();
let seq = 0;
const nid = (prefix) => `${prefix}${Date.now().toString(36)}${++seq}`;

function fresh() {
  const s = createDemoState();
  s.proposals = {};
  return s;
}

/** 這部電腦的「今天」和「現在」（分鐘）。 */
function clock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return { today: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, now: d.getHours() * 60 + d.getMinutes() };
}

function emptyMine() {
  return {
    mine: true, ...clock(), courses: {}, tasks: [], blocks: [], unavailable: [],
    sleep: { start: 30, end: 510 }, sleepOverrides: [], history: [], docs: [],
    thread: [{ id: 'm-hello', who: 'ai', kind: 'hello' }],
    proposals: {}, proposal: null, flags: {},
  };
}

function loadMine() {
  try {
    const saved = JSON.parse(recall(MINE_KEY) || 'null');
    if (saved?.mine) return { ...emptyMine(), ...saved, ...clock() };
  } catch { /* 資料損壞就重新開始 */ }
  return emptyMine();
}

export const getMode = () => mode;

export function enterMine() {
  mode = 'mine';
  remember('mode', 'mine');
  state = loadMine();
  Object.assign(ui, freshUi(), { day: state.today });
}

export function enterDemo() {
  mode = 'demo';
  remember('mode', 'demo');
  state = fresh();
  Object.assign(ui, freshUi());
}

/** 換語言後：示範資料按新語言重建（示範進度會重設）；自己的計劃不變。 */
export function relang() {
  ORIGINAL = createDemoState();
  if (mode === 'demo') {
    state = fresh();
    Object.assign(ui, freshUi());
  }
  emit({});
}

function freshUi() {
  return {
    hlTask: null, showGaps: false, day: DEMO_TODAY, docId: 'stat', taskId: 'ps4',
    editBusy: false, dockOpen: false, dockDismissed: [], hlRule: null, justInked: [], arrowFor: null,
    draft: '', editItem: null, docReading: null, readStage: null, aiModal: null, openCourse: null, renameCourse: null, addCourse: null, syllabusDraft: '', basket: [], readPart: null, sleepEdit: false, dropMsg: '', guideOpen: false,
    calendarView: 'week', month: null, monthDay: null, taskForm: false, editTask: null, taskDate: '', rulesOpen: {},
  };
}

function freshOb() {
  return { loaded: false, itemState: {}, sleep: { start: 30, end: 510 }, sleepSet: false, classesInked: false, lifeAdded: true, drafted: false, inked: false };
}

export const ui = { ...freshUi(), day: state.today };
export let ob = freshOb();

const listeners = new Set();
export function getState() {
  if (mode === 'mine') Object.assign(state, clock());
  return state;
}
export function subscribe(fn) { listeners.add(fn); }
function emit(info = {}) {
  if (mode === 'mine') remember(MINE_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(info));
}
export function refresh(info) { emit(info); }

function note(n) { state.thread.push({ id: nid('m'), ...n }); }

/** 記下每項改動原本的位置和時數，確認後仍可顯示「由哪裡移到哪裡」。 */
function annotate(changes) {
  return changes.map((c) => {
    const out = { ...c };
    if (typeof c.block === 'string') {
      const b = blockOf(state, c.block);
      if (b) out.from = { ...b };
    }
    if (c.kind === 'estimate') out.fromMin = stepOf(state, c.step).step.min;
    return out;
  });
}

const progressLabel = (p) => ({ todo: L('未開始', 'Not started'), doing: L('進行中', 'In progress'), done: L('已完成', 'Done') }[p]);

/* ---------------- 共用檢查 ---------------- */
function untouched(ids) {
  return ids.every((id) => {
    const a = blockOf(state, id);
    const b = ORIGINAL.blocks.find((x) => x.id === id);
    return a && b && a.date === b.date && a.start === b.start && a.end === b.end;
  });
}
function slotFree(date, start, end) {
  return !state.blocks.some((b) => b.date === date && b.start < end && b.end > start);
}

export function canRun(id) {
  if (pendingProposal(state)) return false;
  if (id === 'hero') return untouched(['b2', 'b3', 'b4', 'b5']) && slotFree(state.today, 1080, 1110) && !state.unavailable.some((r) => r.id.startsWith('u-move'));
  if (id === 'essay') return untouched(['b11']);
  if (id === 'done14') return state.history.some((h) => h.id === 'h1' && h.checkin === 'pending');
  return false;
}

export function availableChips() {
  return Object.keys(CHIPS).filter((id) => canRun(id)).map((id) => ({ id, text: CHIPS[id] }));
}

function blocked() {
  if (pendingProposal(state)) {
    note({ who: 'ai', html: L('還有一份 AI 建議等你決定。先按「確認」或「不要」，再試這個情境。', 'There is still a suggestion waiting for you. Press "Confirm" or "Discard" first, then try this.') });
  } else {
    note({ who: 'ai', html: L('這個示範情境要用原本的示範計劃，但計劃已經改過。可以重設示範資料再試。', 'This demo needs the original demo plan, but the plan has changed. Reset the demo data and try again.'), reset: true });
  }
}

/* ---------------- 示範資料 ---------------- */
export function resetDemo() {
  state = fresh();
  Object.assign(ui, freshUi());
  emit({ toast: L('已重設示範資料', 'Demo data reset'), reset: true });
}

/* ---------------- AI 助手：說話與情境 ---------------- */
export function say(text) {
  const t = text.trim();
  if (!t) return;
  ui.draft = '';
  note({ who: 'me', text: t });
  const id = matchScenario(t);
  if (id) runScenario(id, true);
  else {
    note({ who: 'ai', html: fallbackText(), chips: true });
    emit({ scrollThread: true });
  }
}

export function runScenario(id, said = false) {
  if (!said) note({ who: 'me', text: CHIPS[id] });
  if (!canRun(id)) {
    blocked();
    emit({ scrollThread: true });
    return;
  }
  if (id === 'done14') {
    checkin('done', true);
    return;
  }
  const pid = nid(id);
  if (id === 'hero') {
    state.proposals[pid] = { id: pid, kind: 'hero', status: 'pending', option: null, changes: annotate(heroChanges(null)), missing: heroMissing(null) };
    note({ who: 'ai', html: HERO.intro, proposal: pid });
  } else if (id === 'essay') {
    state.proposals[pid] = { id: pid, kind: 'essay', status: 'pending', changes: annotate(ESSAY.changes) };
    note({ who: 'ai', html: ESSAY.reply, proposal: pid });
  }
  state.proposal = pid;
  ui.arrowFor = null;
  emit({ scrollThread: true, proposal: true });
}

export function chooseOption(optId) {
  const p = pendingProposal(state);
  if (!p || p.kind !== 'hero') return;
  p.option = optId;
  p.changes = annotate(heroChanges(optId));
  p.missing = heroMissing(optId);
  emit({ keepScroll: true });
}

export function inkProposal() {
  const p = pendingProposal(state);
  if (!p) return;
  if (p.kind === 'hero' && !p.option) {
    emit({ toast: L('先選一個做法（不想改其他東西，可以選「先不處理」）', 'Pick an option first (choose "Leave it for now" if you want no other changes)'), toastIcon: 'info' });
    return;
  }
  const inked = [];
  for (const c of p.changes) {
    if (c.kind === 'hatch') state.unavailable.push({ ...c.rule });
    else if (c.kind === 'move') {
      const b = blockOf(state, c.block);
      Object.assign(b, c.to, { reason: c.reason || b.reason });
      inked.push(b.id);
    } else if (c.kind === 'split') {
      const b = blockOf(state, c.block);
      state.blocks = state.blocks.filter((x) => x !== b);
      c.to.forEach((to, i) => {
        const nb = { ...b, ...to, id: `${b.id}-${i + 1}`, reason: c.reason || b.reason };
        state.blocks.push(nb);
        inked.push(nb.id);
      });
    } else if (c.kind === 'remove') {
      state.blocks = state.blocks.filter((x) => x.id !== c.block);
      if (c.step) stepOf(state, c.step).step.dropped = true;
    } else if (c.kind === 'defer') {
      const b = blockOf(state, c.block);
      state.blocks = state.blocks.filter((x) => x !== b);
      const { step } = stepOf(state, b.step);
      step.later = L(`已延到 ${md(c.toDate)}，具體時間下次排程確認`, `Moved to ${md(c.toDate)}; exact time set in the next planning round`);
    } else if (c.kind === 'add') {
      state.blocks.push({ ...c.block });
      inked.push(c.block.id);
    } else if (c.kind === 'sleep') {
      state.sleepOverrides.push({ night: c.night, start: c.start });
    } else if (c.kind === 'estimate') {
      const { step } = stepOf(state, c.step);
      step.min = c.min;
      step.estNote = c.note;
    }
  }
  p.status = 'inked';
  state.proposal = null;
  ui.justInked = inked;
  ui.arrowFor = null;
  note({ who: 'ai', html: inkSummary(p) });
  const n = p.changes.length;
  emit({
    toast: L(`已確認 ${n} 項改動${mode === 'demo' ? '（只存在這個分頁）' : ''}`, `Confirmed ${n} change${n === 1 ? '' : 's'}${mode === 'demo' ? ' (this tab only)' : ''}`),
    toastIcon: 'check', scrollThread: true, inked: true,
  });
}

function inkSummary(p) {
  if (p.kind === 'hero') {
    if (p.option === 'A') return L('已確認。PS4 所有題目都排在 11月6日 23:59 前；今晚 01:30 才睡只限今晚，明晚起回復 00:30。', 'Confirmed. All PS4 questions are scheduled before Nov 6, 23:59. Bedtime 01:30 is for tonight only; from tomorrow it is back to 00:30.');
    if (p.option === 'B') return L('已確認。Bonus 題標為「不做」，題 9–12 的預計時數改為 2 小時；其餘題目都排在截止前。', 'Confirmed. The bonus is marked "skip" and Q9–12 is now estimated at 2 hours; everything else is before the deadline.');
    if (p.option === 'C') return L('已確認。PS4 所有題目都排在截止前；明天 13:00–14:00 記得留給題 12。', 'Confirmed. All PS4 questions are before the deadline; keep 13:00–14:00 tomorrow for Q12.');
    return L('已確認。PS4 題 12 仍欠約 1 小時；之後想處理，可以再告訴我。', 'Confirmed. PS4 Q12 is still about 1 hour short; tell me if you want to deal with it later.');
  }
  if (p.kind === 'essay') return L('已確認。「構思大綱」延到 11月16日，這 7 日少了 1 小時讀書時間。', 'Confirmed. The outline moves to Nov 16, freeing 1 hour in these 7 days.');
  if (p.kind === 'checkin') return L('已確認。題 1–4 餘下的部分已排在 PS4 截止前。', 'Confirmed. The rest of Q1–4 is scheduled before PS4 is due.');
  if (p.kind === 'plan') return L(`已確認 ${p.changes.length} 段讀書時段。做完記得在時段上回報進度。`, `Confirmed ${p.changes.length} study sessions. Report your progress on each one when you finish.`);
  return L('已確認。', 'Confirmed.');
}

export function eraseProposal() {
  const p = pendingProposal(state);
  if (!p) return;
  p.status = 'erased';
  state.proposal = null;
  ui.arrowFor = null;
  const msg = {
    hero: () => L('好，這些改動都不做，計劃維持原樣；11月6日的搬屋也沒有記下。如果仍要記下，可以再告訴我。', 'OK, none of these changes are made and the plan stays as it was; the move on Nov 6 is not recorded either. Tell me again if you want it recorded.'),
    essay: () => L('好，不改。「構思大綱」維持在 11月9日 20:00。', 'OK, no change. The outline stays on Nov 9 at 20:00.'),
    checkin: () => L('好，不加。題 1–4 餘下的部分未有安排；想放在其他時間，可以告訴我。', 'OK, not added. The rest of Q1–4 has no slot yet; tell me if you want it somewhere else.'),
    plan: () => L('好，這次不排。改好功課或沒空的時間後，可以再按「自動排程」。', 'OK, nothing scheduled this time. After changing tasks or busy times, press "Auto-schedule" again.'),
  }[p.kind];
  note({ who: 'ai', html: msg ? msg() : L('好，不改。', 'OK, no change.') });
  emit({ toast: L('已放棄這些建議，計劃維持原樣', 'Suggestions discarded; the plan is unchanged'), toastIcon: 'x', scrollThread: true });
}

/* ---------------- 進度回報 ---------------- */
export function checkin(result, said = false) {
  const h = state.history.find((x) => x.id === 'h1');
  if (!h || h.checkin !== 'pending') return;
  const { step } = stepOf(state, h.step);
  if (result === 'done') {
    if (!said) note({ who: 'me', text: L('完成了', 'Done') });
    h.checkin = 'done';
    step.progress = 'done';
    note({ who: 'ai', html: CHECKIN.done });
  } else if (result === 'partial') {
    note({ who: 'me', text: L('還差一點', 'Not quite') });
    h.checkin = 'asking';
    note({ who: 'ai', html: CHECKIN.partialAsk, remainAsk: true });
  } else {
    note({ who: 'me', text: L('沒有做', 'Did not do it') });
    note({ who: 'ai', html: CHECKIN.none, chips: true });
  }
  emit({ scrollThread: true, toast: result === 'done' ? L('已記錄：PS4 題 1–4 完成', 'Saved: PS4 Q1–4 done') : undefined });
}

export function checkinRemain(min) {
  const h = state.history.find((x) => x.id === 'h1');
  if (!h || h.checkin !== 'asking') return;
  note({ who: 'me', text: min === 30 ? L('還差 30 分鐘', '30 minutes left') : L('還差 1 小時', '1 hour left') });
  const today = state.today;
  if (pendingProposal(state) || !slotFree(today, 1080, 1110) || (min === 60 && !slotFree(today, 1440, 1470))) {
    blocked();
    emit({ scrollThread: true });
    return;
  }
  const { step } = stepOf(state, h.step);
  h.checkin = 'done';
  step.progress = 'doing';
  step.remain = min;
  const mk = (start, end) => ({ id: nid('bx'), task: 'ps4', step: 'ps4-1', date: today, start, end, reason: L('題 1–4 餘下的部分；PS4 明晚 23:59 截止。', 'The rest of Q1–4; PS4 is due tomorrow at 23:59.') });
  const blocks = min === 30 ? [mk(1080, 1110)] : [mk(1080, 1110), mk(1440, 1470)];
  const pid = nid('checkin');
  state.proposals[pid] = { id: pid, kind: 'checkin', status: 'pending', changes: blocks.map((block) => ({ kind: 'add', block })) };
  state.proposal = pid;
  note({ who: 'ai', html: min === 30 ? CHECKIN.partial30 : CHECKIN.partial60, proposal: pid });
  emit({ scrollThread: true, proposal: true });
}

export function setProgress(stepId, progress) {
  const { step, task } = stepOf(state, stepId);
  if (!step) return;
  step.progress = progress;
  if (progress !== 'doing') delete step.remain;
  for (const h of state.history) if (h.step === stepId && h.checkin === 'pending' && progress === 'done') h.checkin = 'done';
  emit({ toast: L(`已記錄：${task.short} ${step.title} · ${progressLabel(progress)}`, `Saved: ${task.short} ${step.title} · ${progressLabel(progress)}`), keepScroll: true });
}

/* ---------------- 預計時數 ---------------- */
export function adjustStep(stepId, delta) {
  const { step } = stepOf(state, stepId);
  if (!step) return;
  step.min = Math.max(30, Math.min(600, step.min + delta));
  step.estBy = 'me';
  emit({ keepScroll: true });
}

export function confirmEstimate(taskId) {
  const t = taskOf(state, taskId);
  t.estimateConfirmed = true;
  emit({ toast: L(`已確認：${t.short} 的預計時數`, `Confirmed: estimate for ${t.short}`), keepScroll: true });
}

/* ---------------- 課程資料 ---------------- */
function itemOf(docId, itemId) {
  return state.docs.find((d) => d.id === docId)?.items.find((i) => i.id === itemId);
}
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, '');
const courseIdOf = (doc) => doc.course || Object.values(state.courses).find((c) => c.name === (doc.courseName || '').trim())?.id;

/**
 * 這一項在科目裡是否已經有（同名）：
 *   'same'  —— 已有，這次沒有新的日期或時間 → 不重複加入
 *   'moved' —— 已有任務，但這次寫的日期或時間不同 → 確認後改任務的日期（from 是原本的）
 *   'dated' —— 已確認過但當時日期未公布，這次有日期 → 確認後補上日期、變成任務
 * 沒有同名的回傳 null。
 */
function matchOf(doc, it) {
  const p = it.plan;
  const course = courseIdOf(doc);
  if (p?.kind !== 'task' || !course) return null;
  const key = norm(p.title);
  const task = state.tasks.find((t) => t.course === course && norm(t.title) === key);
  if (task) {
    if (!p.date) return { kind: 'same', task: task.id };
    // 這次沒寫時間（暫定的）就不拿暫定時間蓋掉原本的時間
    const min = it.flag === 'no-time' ? task.due.min : p.min;
    if (task.due.date === p.date && task.due.min === min) return { kind: 'same', task: task.id };
    return { kind: 'moved', task: task.id, from: { ...task.due }, to: { date: p.date, min } };
  }
  const undated = state.docs.filter((d) => d.own && (d === doc || d.course === course)).flatMap((d) => d.items)
    .some((i) => i !== it && i.state === 'ink' && !i.filled && i.applied !== 'dup' && i.plan?.kind === 'task' && !i.plan.date && norm(i.plan.title) === key);
  if (undated) return p.date ? { kind: 'dated' } : { kind: 'same' };
  return null;
}
/** 重新判斷這份資料裡未確認的項目（讀完、或改了科目之後）。 */
function markMatches(doc) {
  doc.items.forEach((it) => { if (it.state === 'pencil') it.match = matchOf(doc, it); });
}

/** 改這份資料屬於哪一科（只限還沒確認任何項目、也不是從某科的「補充資訊」進來的）。 */
export function setDocCourse(docId, name) {
  const doc = state.docs.find((d) => d.id === docId);
  if (!doc || doc.course) return;
  doc.courseName = name.trim();
  markMatches(doc);
  emit({ keepScroll: true });
}

/** 任務的截止改了：跟編輯任務一樣，清掉還沒開始的讀書時段和待確認的建議，請你重新排程。 */
function moveDue(task, due) {
  state.blocks = state.blocks.filter((b) => b.task !== task.id || b.date < state.today || (b.date === state.today && b.start <= state.now));
  const pending = pendingProposal(state);
  if (pending) { pending.status = 'erased'; state.proposal = null; }
  task.due = { ...due };
}

/**
 * 自己的資料：確認一項時，把它放進科目（第一次確認時才建立科目），再變成任務（每項只做一次）。
 * 科目裡已有同名的：補日期、改日期，或不重複加入（見 matchOf）。回傳做了什麼：'task'、'moved'、'busy' 或 null。
 */
function applyItem(doc, it) {
  const p = it.plan;
  if (!doc.own || it.applied || !p) return null;
  if (!doc.course) doc.course = courseFor(doc.courseName || L('未命名科目', 'Untitled course'), doc.courseTitle || '');
  doc.courseName = state.courses[doc.course].name;
  const m = matchOf(doc, it);
  it.match = m;
  if (m?.kind === 'same') {
    const task = m.task && taskOf(state, m.task);
    if (task && !task.weight && it.weight) task.weight = it.weight; // 原本沒有比重的順便補上
    it.applied = 'dup';
    return null;
  }
  if (m?.kind === 'moved') {
    moveDue(taskOf(state, m.task), m.to);
    if (it.weight) taskOf(state, m.task).weight = it.weight;
    it.taskId = m.task;
    it.applied = 'moved';
    return 'moved';
  }
  if (p.kind === 'task' && p.date) {
    it.taskId = createTask({ title: p.title, course: doc.courseName || '', kind: typeLabel(p.key), date: p.date, min: p.min, hours: p.hours, weight: it.weight || '' }).id;
    it.applied = 'task';
    if (m?.kind === 'dated') {
      // 之前確認過、日期未公布的同一項，現在有日期了：不再列在「日期未公布」
      state.docs.filter((d) => d.course === doc.course).flatMap((d) => d.items).forEach((i) => {
        if (i !== it && i.state === 'ink' && !i.filled && i.plan?.kind === 'task' && !i.plan.date && norm(i.plan.title) === norm(p.title)) i.filled = it.taskId;
      });
    }
  } else if (p.kind === 'busy') {
    pushRule({ type: p.type, ...(p.type === 'weekly' ? { days: p.days } : { date: p.date }), start: p.start, end: p.end, label: p.label });
    it.applied = 'busy';
  }
  return it.applied || null;
}
function appliedText(kinds) {
  const t = kinds.filter((k) => k === 'task').length, b = kinds.filter((k) => k === 'busy').length, m = kinds.filter((k) => k === 'moved').length;
  if (!t && !b && !m) return '';
  return L(`；${[t && `加入 ${t} 項任務`, m && `更新 ${m} 項任務的日期（尚未開始的安排已清除，請重新排程）`, b && `加入 ${b} 段沒空時間`].filter(Boolean).join('、')}`,
    `; ${[t && `added ${t} task${t === 1 ? '' : 's'}`, m && `moved the date of ${m} task${m === 1 ? '' : 's'} (unstarted sessions cleared; schedule again)`, b && `added ${b} busy time${b === 1 ? '' : 's'}`].filter(Boolean).join(', ')}`);
}

export function setItemState(docId, itemId, value) {
  const doc = state.docs.find((d) => d.id === docId);
  const it = itemOf(docId, itemId);
  if (!it) return;
  it.state = value;
  ui.editItem = null;
  const added = value === 'ink' ? appliedText([applyItem(doc, it)]) : '';
  emit({ toast: value === 'ink' ? L('已確認這一項', 'Item confirmed') + added : value === 'erased' ? L('已刪除這一項（之後不會用來排程）', 'Item removed (it will not be used for planning)') : undefined, keepScroll: true });
}
export function inkAllItems(docId) {
  const doc = state.docs.find((d) => d.id === docId);
  const pending = doc.items.filter((i) => i.state === 'pencil');
  pending.forEach((i) => { i.state = 'ink'; });
  const added = appliedText(pending.map((i) => applyItem(doc, i)));
  emit({ toast: pending.length ? L(`已確認 ${pending.length} 項`, `Confirmed ${pending.length} items`) + added : L('這份大綱沒有待核對的項目', 'Nothing left to check in this syllabus'), keepScroll: true });
}
export function saveItem(docId, itemId, fields) {
  const doc = state.docs.find((d) => d.id === docId);
  const it = itemOf(docId, itemId);
  if (!it) return;
  if (doc.own && it.plan && !it.applied) {
    // 自己的大綱：讀回改過的日期和時數，讀不懂就留在編輯狀態。
    const plan = fields.when === '—' ? { ...it.plan, date: null } : parseWhen(it.plan, fields.when);
    const hours = it.plan.kind === 'task' ? parseHours(fields.hours) : null;
    if (!plan || (plan.kind === 'task' && plan.date && !hours)) {
      emit({ toast: it.plan.kind === 'busy'
        ? L('看不懂這個時間，請寫成「每週一、三 10:30–12:00」', 'Cannot read that time. Write it like "Mon, Wed 10:30–12:00"')
        : L('看不懂，日期請寫成「2026-11-20 23:59」，時數寫數字', 'Cannot read that. Write the date like "2026-11-20 23:59" and hours as a number'), toastIcon: 'alert', keepScroll: true });
      return;
    }
    if (hours) plan.hours = hours;
    Object.assign(it, { plan, reasons: [], flag: null, hoursDefault: false });
    fields = {}; // 顯示文字由 rowText(plan) 產生
  }
  Object.assign(it, fields, { state: 'ink', edited: true });
  delete it.warn;
  ui.editItem = null;
  emit({ toast: L('已按你的修改確認', 'Confirmed with your edits') + appliedText([applyItem(doc, it)]), keepScroll: true });
}

/* ---------------- 不可用時段 ---------------- */
function pushRule(rule) {
  const r = { id: nid('u-'), src: 'me', ...rule };
  state.unavailable.push(r);
  return r;
}
export function addRule(rule) {
  const r = pushRule(rule);
  const days = r.type === 'weekly' ? null : r.date;
  const clash = state.blocks.filter((b) => (days ? b.date === days : r.days.includes(new Date(b.date + 'T00:00:00Z').getUTCDay())) && b.start < r.end && b.end > r.start);
  const n = clash.length;
  emit({
    toast: n
      ? L(`已標記為沒空。與 ${n} 段已排的讀書時段重疊${mode === 'demo' ? '；示範版不會自動重排' : ''}`, `Marked as busy. It overlaps ${n} scheduled session${n === 1 ? '' : 's'}${mode === 'demo' ? '; the demo does not reschedule' : ''}`)
      : L(`已標記為沒空：${r.label}（${span(r.start, r.end)}）`, `Marked as busy: ${r.label} (${span(r.start, r.end)})`),
    toastIcon: 'hatch',
    keepScroll: true,
  });
  return r;
}
export function removeRule(id) {
  const r = state.unavailable.find((x) => x.id === id);
  state.unavailable = state.unavailable.filter((x) => x.id !== id);
  ui.hlRule = null;
  emit({ toast: r ? L(`已移除「${r.label}」`, `Removed "${r.label}"`) : undefined, toastIcon: 'eraser', keepScroll: true });
}
export function setSleep(start, end) {
  state.sleep = { start, end };
  ui.sleepEdit = false;
  emit({ toast: mode === 'demo' ? L('已更新每晚的睡眠時間（示範版不會自動重排）', 'Sleep time updated (the demo does not reschedule)') : L('已更新每晚的睡眠時間', 'Sleep time updated'), keepScroll: true });
}

/* ---------------- 我的計劃：功課與自動排程 ---------------- */
/** 用科目名稱（通常是代號）找科目，沒有就新增；title 是全名，有的話順便記下。 */
function courseFor(name, title = '') {
  const label = name.trim() || L('其他', 'Other');
  const found = Object.values(state.courses).find((c) => c.name === label);
  if (found) {
    if (title && !found.title) found.title = title;
    return found.id;
  }
  const id = nid('c');
  // 先用還沒有科目用的顏色（刪過科目後不會跟現有的科目撞色）
  const used = Object.values(state.courses).map((c) => c.ink);
  const ink = INKS.find((k) => !used.includes(k)) || INKS[used.length % INKS.length];
  state.courses[id] = { id, name: label, ...(title ? { title } : {}), ink };
  return id;
}

/** 預計時數拆成每段最多 2 小時，以 30 分鐘為單位。 */
function splitMinutes(total) {
  const parts = Math.ceil(total / 120);
  const base = Math.floor(total / parts / 30) * 30;
  const out = Array(parts).fill(base);
  let rest = total - base * parts;
  for (let i = 0; rest > 0; i = (i + 1) % parts) { out[i] += 30; rest -= 30; }
  return out;
}

function createTask({ title, course, kind, date, min, hours, requirements = '', weight = '' }, ownSteps = []) {
  const id = nid('t');
  const total = ownSteps.length ? ownSteps.reduce((n, st) => n + st.min, 0) : Math.max(30, Math.round(hours * 2) * 30);
  const parts = ownSteps.length ? ownSteps : splitMinutes(total).map((m, i, all) => ({ title: all.length > 1 ? L(`第 ${i + 1} 部分`, `Part ${i + 1}`) : L('全部', 'All'), min: m }));
  const steps = parts.map((st, i) => ({ id: `${id}-${i + 1}`, title: st.title, min: st.min, progress: 'todo' }));
  state.tasks.push({
    id, course: courseFor(course), title, short: title.length > 14 ? `${title.slice(0, 13)}…` : title, kind,
    due: { date, min }, requirements, attachments: [], weight, source: null, estimateBy: 'me', estimateConfirmed: true, steps, aiNote: '',
  });
  return { id, total };
}
export function addTask(fields, ownSteps = []) {
  const { id, total } = createTask(fields, ownSteps);
  const { title } = fields;
  ui.taskId = id;
  ui.taskForm = false;
  emit({ toast: L(`已加入「${title}」，共 ${hoursText(total)}`, `Added "${title}" (${hoursText(total)})`), keepScroll: true });
}

export function deleteTask(id) {
  const t = taskOf(state, id);
  if (!t) return;
  const p = pendingProposal(state);
  if (p && p.changes.some((c) => c.block?.task === id)) { p.status = 'erased'; state.proposal = null; }
  state.tasks = state.tasks.filter((x) => x.id !== id);
  state.blocks = state.blocks.filter((b) => b.task !== id);
  ui.taskId = null;
  emit({ toast: L(`已刪除「${t.title}」和它的讀書時段`, `Deleted "${t.title}" and its sessions`), toastIcon: 'x' });
}

/**
 * 在科目卡把一項移到另一組：只改類型（'exam' → 名稱像考試的寫「考試」，其他寫「測驗」；'work' → 「功課」）。
 * 預計時數和已排的讀書時段不動，要改時數打開這一項再改。
 */
export function setTaskGroup(id, group) {
  const t = taskOf(state, id);
  if (!t || !['exam', 'work'].includes(group)) return;
  const exam = group === 'exam';
  t.kind = exam ? (/exam|midterm|final|考試/i.test(t.title) ? L('考試', 'Exam') : L('測驗', 'Quiz')) : L('功課', 'Assignment');
  emit({ toast: L(`已把「${t.title}」移到${exam ? '測驗和考試' : '功課'}（預計時數沒有改）`, `Moved "${t.title}" to ${exam ? 'quizzes and exams' : 'assignments'} (estimate unchanged)`), toastIcon: 'check', keepScroll: true });
}

/** Editing scheduling inputs invalidates future sessions, never silently reschedules. */
export function updateTask(id, fields, steps) {
  const task = taskOf(state, id);
  if (!task) return;
  const before = task.steps.filter((st) => !st.dropped);
  const changed = task.due.date !== fields.date || task.due.min !== fields.min ||
    JSON.stringify(before.map((st) => [st.id, st.title, st.min])) !== JSON.stringify(steps.map((st) => [st.id, st.title, st.min]));
  const retained = steps.map((st) => ({ progress: 'todo', ...task.steps.find((old) => old.id === st.id), ...st, id: st.id || nid('st'), estBy: 'me' }));
  const removed = task.steps.filter((old) => !retained.some((st) => st.id === old.id));
  // Keep retired steps when past sessions/history still refer to them.
  const archived = removed.filter((st) => ['done', 'doing'].includes(st.progress) || state.history.some((h) => h.step === st.id) || state.blocks.some((b) => b.step === st.id && (b.date < state.today || (b.date === state.today && b.start <= state.now))))
    .map((st) => ({ ...st, dropped: true, retired: true }));
  if (changed) {
    state.blocks = state.blocks.filter((b) => b.task !== id || b.date < state.today || (b.date === state.today && b.start <= state.now));
    const pending = pendingProposal(state);
    if (pending) { pending.status = 'erased'; state.proposal = null; }
  }
  Object.assign(task, {
    title: fields.title, short: fields.title.length > 14 ? `${fields.title.slice(0, 13)}…` : fields.title,
    course: courseFor(fields.course), kind: fields.kind, requirements: fields.requirements,
    due: { date: fields.date, min: fields.min }, steps: [...retained, ...archived],
    estimateBy: 'me', estimateConfirmed: true,
  });
  ui.editTask = null;
  emit({ toast: changed ? L('已保存。尚未開始的安排已清除，請到本週重新排程並確認。', 'Saved. Unstarted sessions cleared; schedule again on Week and confirm.') : L('任務已保存', 'Task saved'), keepScroll: true });
}

/** 一份資料裡的檔案（存在瀏覽器）。一次放入幾個檔案加文字時有好幾份；以前的資料只有一份，id 就是資料本身的 id。 */
export const partsOf = (doc) => doc.parts || [{ id: doc.id, name: doc.name, size: doc.size }];

/**
 * 放入一份資料。parts：一次放入的幾個檔案（加上打的字，存成 .txt），AI 會逐份讀，結果合成一份核對表。
 * course：從某科的「補充資訊」進來時，這份資料固定屬於那一科。
 */
export function addOwnDoc({ id, name, size, parts }, course = null) {
  const c = course && state.courses[course];
  state.docs.push({ id, name, size, ...(parts ? { parts } : {}), own: true, pages: null, items: [], course: c ? c.id : null, courseName: c ? c.name : '' });
  ui.docId = id;
  emit({ toast: L(`已保存「${name}」`, `Saved "${name}"`), keepScroll: true });
}

/** AI 讀完一份自己的大綱：放入待核對的項目（已確認的保留，未確認的換成這次的結果）。 */
export function setOwnItems(docId, { course, courseTitle = '', items, notes, weightTotal = null }) {
  const doc = state.docs.find((d) => d.id === docId);
  if (!doc) return;
  const kept = doc.items.filter((i) => i.state === 'ink');
  doc.items = [...kept, ...items.map((it) => ({ ...it, id: nid(`${it.id}-`) }))];
  // 科目要等第一項確認時才建立（見 applyItem），資料裡甚麼都沒有就不會多出一張空的科目卡。
  // 從某科的「補充資訊」進來的，維持那一科；否則用 AI 找到的科目代號，之後可以在核對表上改。
  if (!doc.course) { doc.courseName = course || doc.courseName || ''; doc.courseTitle = courseTitle; }
  markMatches(doc);
  doc.notes = notes;
  doc.weightTotal = weightTotal;
  ui.docId = docId;
  emit({ toast: L(`AI 找到 ${items.length} 項，請逐項核對`, `AI found ${items.length} items. Check each one.`), keepScroll: true });
}

export function removeOwnDoc(id) {
  state.docs = state.docs.filter((d) => d.id !== id);
  if (ui.docId === id) ui.docId = state.docs[0]?.id || null;
  emit({ toast: L('已移除這份大綱', 'Syllabus removed'), toastIcon: 'x', keepScroll: true });
}

/**
 * 改一科的代號和全名（雙擊卡頭或按「改名」）。代號不能空，也不能跟另一科一樣；全名可以留空。
 * 寫著舊代號、還沒確認的資料一起跟著改，之後確認的項目仍然放進這一科。回傳是否改成功。
 */
export function renameCourse(id, name, title = '') {
  const c = state.courses[id];
  const label = String(name || '').trim();
  const full = String(title || '').trim();
  if (!c) return false;
  if (!label) { emit({ toast: L('科目代號不能留空', 'Enter a course code'), toastIcon: 'alert', keepScroll: true }); return false; }
  if (Object.values(state.courses).some((o) => o.id !== id && o.name === label)) {
    emit({ toast: L(`已經有一科叫「${label}」`, `There is already a course called ${label}`), toastIcon: 'alert', keepScroll: true });
    return false;
  }
  const old = c.name;
  c.name = label;
  if (full) c.title = full; else delete c.title;
  state.docs.filter((d) => d.own && (d.course === id || (!d.course && (d.courseName || '').trim() === old))).forEach((d) => {
    d.courseName = label;
    markMatches(d);
  });
  ui.renameCourse = null;
  emit({ toast: L(`已改名為「${label}」`, `Renamed to ${label}`), keepScroll: true });
  return true;
}

/**
 * 刪除一科：科目卡、它的任務和讀書時段，以及屬於它的資料（包括寫著這一科、還沒確認的）；其他科目不動。
 * 回傳要從瀏覽器刪掉的檔案 id（資料原檔和任務附件），由呼叫的地方刪。
 */
export function deleteCourse(id) {
  const c = state.courses[id];
  if (!c) return [];
  const tasks = state.tasks.filter((t) => t.course === id);
  const gone = new Set(tasks.map((t) => t.id));
  const docs = state.docs.filter((d) => d.own && courseIdOf(d) === id);
  const p = pendingProposal(state);
  if (p && p.changes.some((ch) => gone.has(ch.block?.task))) { p.status = 'erased'; state.proposal = null; }
  state.tasks = state.tasks.filter((t) => !gone.has(t.id));
  state.blocks = state.blocks.filter((b) => !gone.has(b.task));
  state.docs = state.docs.filter((d) => !docs.includes(d));
  delete state.courses[id];
  if (ui.openCourse === id) ui.openCourse = null;
  if (ui.renameCourse === id) ui.renameCourse = null;
  if (ui.addCourse === id) ui.addCourse = null;
  if (docs.some((d) => d.id === ui.docId)) ui.docId = null;
  if (gone.has(ui.taskId)) ui.taskId = null;
  emit({ toast: L(`已刪除「${c.name}」`, `Deleted ${c.name}`), toastIcon: 'x', keepScroll: true });
  return [...docs.flatMap((d) => partsOf(d).map((x) => x.id)), ...tasks.flatMap((t) => (t.attachments || []).map((a) => a.id))];
}

export function addTaskAttachment(taskId, metadata) {
  const task = taskOf(state, taskId);
  if (!task) return;
  (task.attachments ||= []).push(metadata);
  emit({ toast: L('附件已保存在此瀏覽器', 'Attachment saved in this browser'), keepScroll: true });
}

export function autoPlan() {
  if (pendingProposal(state)) { emit({ toast: L('先確認或不要目前的建議', 'Confirm or discard the current suggestion first'), toastIcon: 'info' }); return; }
  if (!state.tasks.length) { emit({ toast: L('先加入功課和 deadline', 'Add a task and its deadline first'), toastIcon: 'info' }); return; }
  const { blocks, missing } = planSteps(state);
  if (!blocks.length && !missing.length) { emit({ toast: L('全部功課都已排好', 'Everything is already scheduled'), toastIcon: 'check' }); return; }
  const lacking = missing.length
    ? L(
      `<br>放不下（截止前未有足夠空檔）：${missing.map(({ task, step }) => `<b>${esc(task.short)}</b> ${esc(step.title)}（${hoursText(step.min)}，${dayShort(task.due.date)} 截止）`).join('、')}。可以減少沒空的時間、調低預計時數，或分給之後的日子。`,
      `<br>Did not fit (not enough free time before the deadline): ${missing.map(({ task, step }) => `<b>${esc(task.short)}</b> ${esc(step.title)} (${hoursText(step.min)}, due ${dayShort(task.due.date)})`).join(', ')}. Try freeing up busy time or lowering the estimate.`,
    )
    : '';
  if (!blocks.length) {
    note({ who: 'ai', html: L(`這 7 日排不到新的時段。${lacking}`, `No new sessions fit in these 7 days.${lacking}`) });
    emit({ toast: L('未來 7 日沒有足夠空檔', 'Not enough free time in the next 7 days'), toastIcon: 'alert', scrollThread: true });
    return;
  }
  blocks.forEach((b) => { b.id = nid('b'); });
  const total = blocks.reduce((a, b) => a + b.end - b.start, 0);
  const pid = nid('plan');
  state.proposals[pid] = { id: pid, kind: 'plan', status: 'pending', changes: blocks.map((block) => ({ kind: 'add', block })) };
  state.proposal = pid;
  const n = blocks.length;
  note({
    who: 'ai',
    html: L(
      `我排了 <b>${n}</b> 段，共 ${hoursText(total)}，都在各自的截止前。虛線是建議，確認後才會生效。${lacking}`,
      `I scheduled <b>${n}</b> session${n === 1 ? '' : 's'} (${hoursText(total)}), each before its deadline. Dashed means suggested; nothing changes until you confirm.${lacking}`,
    ),
    proposal: pid,
  });
  emit({ scrollThread: true, proposal: true, toast: L(`排了 ${n} 段，等你確認`, `${n} session${n === 1 ? '' : 's'} suggested; waiting for you`), toastIcon: 'pencil' });
}

/* ---------------- 首次使用 ---------------- */
export function obRestart() {
  ob = freshOb();
}
export function obFinish() {
  mode = 'demo';
  remember('mode', 'demo');
  state = fresh();
  Object.assign(ui, freshUi());
  ui.justInked = state.blocks.map((b) => b.id);
}

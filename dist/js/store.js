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
    editBusy: false, timeTool: null, paintRepeat: 'single', hlRule: null, justInked: [], arrowFor: null,
    draft: '', editItem: null, sleepEdit: false, dropMsg: '', guideOpen: false,
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
export function setItemState(docId, itemId, value) {
  const it = itemOf(docId, itemId);
  if (!it) return;
  it.state = value;
  ui.editItem = null;
  emit({ toast: value === 'ink' ? L('已確認這一項', 'Item confirmed') : value === 'erased' ? L('已刪除這一項（之後不會用來排程）', 'Item removed (it will not be used for planning)') : undefined, keepScroll: true });
}
export function inkAllItems(docId) {
  const doc = state.docs.find((d) => d.id === docId);
  const pending = doc.items.filter((i) => i.state === 'pencil');
  pending.forEach((i) => { i.state = 'ink'; });
  emit({ toast: pending.length ? L(`已確認 ${pending.length} 項`, `Confirmed ${pending.length} items`) : L('這份大綱沒有待核對的項目', 'Nothing left to check in this syllabus'), keepScroll: true });
}
export function saveItem(docId, itemId, fields) {
  const it = itemOf(docId, itemId);
  if (!it) return;
  Object.assign(it, fields, { state: 'ink', edited: true });
  delete it.warn;
  ui.editItem = null;
  emit({ toast: L('已按你的修改確認', 'Confirmed with your edits'), keepScroll: true });
}

/* ---------------- 不可用時段 ---------------- */
export function addRule(rule) {
  const r = { id: nid('u-'), src: 'me', ...rule };
  state.unavailable.push(r);
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
function courseFor(name) {
  const label = name.trim() || L('其他', 'Other');
  const found = Object.values(state.courses).find((c) => c.name === label);
  if (found) return found.id;
  const id = nid('c');
  state.courses[id] = { id, name: label, ink: INKS[Object.keys(state.courses).length % INKS.length] };
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

export function addTask({ title, course, kind, date, min, hours, requirements = '' }, ownSteps = []) {
  const id = nid('t');
  const total = ownSteps.length ? ownSteps.reduce((n, st) => n + st.min, 0) : Math.max(30, Math.round(hours * 2) * 30);
  const parts = ownSteps.length ? ownSteps : splitMinutes(total).map((m, i, all) => ({ title: all.length > 1 ? L(`第 ${i + 1} 部分`, `Part ${i + 1}`) : L('全部', 'All'), min: m }));
  const steps = parts.map((st, i) => ({ id: `${id}-${i + 1}`, title: st.title, min: st.min, progress: 'todo' }));
  state.tasks.push({
    id, course: courseFor(course), title, short: title.length > 14 ? `${title.slice(0, 13)}…` : title, kind,
    due: { date, min }, requirements, attachments: [], weight: '', source: null, estimateBy: 'me', estimateConfirmed: true, steps, aiNote: '',
  });
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

/** 自己的計劃：大綱檔案存在瀏覽器，這裡只記檔名；自動抽取未接通，所以沒有項目。 */
export function addOwnDoc({ id, name, size }) {
  state.docs.push({ id, name, size, own: true, pages: null, course: null, items: [] });
  ui.docId = id;
  emit({ toast: L(`已保存「${name}」`, `Saved "${name}"`), keepScroll: true });
}

export function removeOwnDoc(id) {
  state.docs = state.docs.filter((d) => d.id !== id);
  if (ui.docId === id) ui.docId = state.docs[0]?.id || null;
  emit({ toast: L('已移除這份大綱', 'Syllabus removed'), toastIcon: 'x', keepScroll: true });
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

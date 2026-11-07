// 狀態與動作。兩種模式：
// - demo（新手導覽）：示範資料只在記憶體；重新整理或按「重設」會回到示範資料。
// - mine（直接開始）：使用者自己的計劃，存在這個瀏覽器的 localStorage，每次改動即保存。
// 介面文字中英兩版：L('中文', 'English')。
import { createDemoState, DEMO_TODAY } from './demo-data.js';
import { HERO, heroChanges, heroMissing, CHECKIN, ESSAY, fallbackText, CHIPS, matchScenario } from './scenarios.js';
import { blockOf, stepOf, taskOf, pendingProposal, unplannedSteps } from './model.js';
import { md, span, dayShort, hoursText } from './time.js';
import { recall, remember, esc } from './ui.js';
import { L } from './i18n.js';
import { parseWhen, parseHours, typeLabel, typeHours } from './syllabus-ai.js';
import { toState, proposalFrom } from './plan-ai.js';
import { questionsFor, readDue } from './ask.js';
import { toContext } from './chat-ai.js';
import { createAiRequests } from './ai-requests.js';
import { createTimer, rhythmOf, stop as stopTimer, pause as pauseTimer, resume as resumeTimer, tick as tickTimer } from './focus.js';

const MINE_KEY = 'mine';
const INKS = ['blue', 'amber', 'green', 'plum'];
let ORIGINAL = createDemoState();
let mode = recall('mode') === 'mine' ? 'mine' : 'demo';
let state = mode === 'mine' ? loadMine() : fresh();
let seq = 0;
const aiRequests = createAiRequests();
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
  aiRequests.reset();
  mode = 'mine';
  remember('mode', 'mine');
  state = loadMine();
  Object.assign(ui, freshUi(), { day: state.today });
}

export function enterDemo() {
  aiRequests.reset();
  mode = 'demo';
  remember('mode', 'demo');
  state = fresh();
  Object.assign(ui, freshUi());
}

/** 換語言後：示範資料按新語言重建（示範進度會重設）；自己的計劃不變。 */
export function relang() {
  ORIGINAL = createDemoState();
  if (mode === 'demo') {
    aiRequests.reset();
    state = fresh();
    Object.assign(ui, freshUi());
  }
  emit({});
}

function freshUi() {
  return {
    hlTask: null, showGaps: false, day: DEMO_TODAY, docId: 'stat', taskId: 'ps4',
    editBusy: false, dockOpen: false, dockDismissed: [], hlRule: null, justInked: [], arrowFor: null,
    draft: '', editItem: null, docReading: null, readStage: null, aiModal: null, openCourse: null, renameCourse: null, editRow: null, newRow: null, addCourse: null, syllabusDraft: '', basket: [], readPart: null, sleepEdit: false, dropMsg: '', guideOpen: false,
    calendarView: 'week', month: null, monthDay: null, taskForm: false, editTask: null, taskDate: '', rulesOpen: {},
    planning: false, planOptions: null, planError: '', ask: null, chatting: false,
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
  aiRequests.reset();
  state = fresh();
  Object.assign(ui, freshUi());
  emit({ toast: L('已重設示範資料', 'Demo data reset'), reset: true });
}

/* ---------------- AI 助手：說話與情境 ---------------- */
export function say(text) {
  const t = text.trim();
  if (!t) return;
  if (mode === 'mine') return chat(t); // 自己的計劃：交給 AI 助手 Chatflow；示範導覽仍用預先寫好的情境
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
    } else if (c.kind === 'borrow') {
      // 借用單次沒空時間的一部分：把那段切開，借出的時間變成可用
      const r = state.unavailable.find((x) => x.id === c.rule);
      if (r) {
        state.unavailable = state.unavailable.filter((x) => x !== r);
        if (r.start < c.start) state.unavailable.push({ ...r, id: `-a`, end: c.start });
        if (c.end < r.end) state.unavailable.push({ ...r, id: `-b`, start: c.end });
      }
    } else if (c.kind === 'progress') {
      const { step } = stepOf(state, c.step);
      if (step) { step.progress = c.progress; if (c.progress === 'doing' && c.remain) step.remain = c.remain; else delete step.remain; }
    } else if (c.kind === 'fill') {
      fillItem(c.doc, c.item, c.field, c.value);
    } else if (c.kind === 'drop') {
      const task = state.tasks.find((t) => t.id === c.task);
      task?.steps.forEach((st) => { if (st.progress !== 'done') st.dropped = true; });
    }
  }
  p.status = 'inked';
  ui.planOptions = null;
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
  ui.planOptions = null;
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

/** 待確認的建議若碰到這些時段就作廢（避免建議指向已不存在的時段）。 */
function dropProposalTouching(ids) {
  const p = pendingProposal(state);
  if (p && p.changes.some((c) => ids.has(c.block) || ids.has(c.block?.id))) { p.status = 'erased'; state.proposal = null; }
}

/** 從時間表移除一段：只拿走時段，功課和進度不動；這一部分會回到「未排」。 */
export function removeBlock(id) {
  const b = state.blocks.find((x) => x.id === id);
  if (!b) return;
  dropProposalTouching(new Set([id]));
  state.blocks = state.blocks.filter((x) => x !== b);
  emit({ toast: L('已從時間表移除，功課還在', 'Removed from the schedule; the task is kept'), toastIcon: 'x', keepScroll: true });
}

/** 還沒開始的讀書時段（今天稍後和之後的日子）。 */
export function upcomingBlocks(s = state) {
  return s.blocks.filter((b) => b.date > s.today || (b.date === s.today && b.start > s.now));
}

/** 一鍵清空排程：拿走所有還沒開始的時段；已過去或進行中的保留，功課不動。回傳清走的段數。 */
export function clearSchedule() {
  const s = getState();
  const gone = new Set(upcomingBlocks(s).map((b) => b.id));
  if (!gone.size) return 0;
  dropProposalTouching(gone);
  state.blocks = state.blocks.filter((b) => !gone.has(b.id));
  emit({ toast: L(`已清空 ${gone.size} 段排程，功課還在`, `Cleared ${gone.size} session${gone.size === 1 ? '' : 's'}; tasks are kept`), toastIcon: 'x', keepScroll: true });
  return gone.size;
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
    // 用 AI 拆好的步驟；學生在核對表改過時數，就照學生的時數重新拆。
    const aiSteps = !it.edited && it.steps?.length ? it.steps : [];
    it.taskId = createTask({ title: p.title, course: doc.courseName || '', kind: typeLabel(p.key), date: p.date, min: p.min, hours: p.hours, weight: it.weight || '', difficulty: it.difficulty || null, requirements: it.scope || '', estimateBy: it.byStudent ? 'me' : 'ai' }, aiSteps).id;
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
    // 日期留空、沒改預填的原文（例如「TBD — 第 5 週前公布」），或只寫 TBD／TBA／未定：保持日期未公布
    const undated = fields.when === '—' || (!it.plan.date && (fields.when === (it.raw || '—') || /^(tbd|tba|待定|未定|未公布)(?![a-z])/i.test(fields.when)));
    const plan = undated ? { ...it.plan, date: null } : parseWhen(it.plan, fields.when);
    const hours = it.plan.kind === 'task' ? parseHours(fields.hours) : null;
    if (!plan || (plan.kind === 'task' && plan.date && !hours)) {
      emit({ toast: it.plan.kind === 'busy'
        ? L('看不懂這個時間，請寫成「每週一、三 10:30–12:00」', 'Cannot read that time. Write it like "Mon, Wed 10:30–12:00"')
        : L('看不懂，日期請寫成「2026-11-20 23:59」，時數寫數字', 'Cannot read that. Write the date like "2026-11-20 23:59" and hours as a number'), toastIcon: 'alert', keepScroll: true });
      return;
    }
    if (hours && hours !== it.plan.hours) it.byStudent = true; // 學生改了時數，任務裡標「你填的」
    if (hours) plan.hours = hours;
    Object.assign(it, { plan, reasons: [], flag: null, hoursDefault: false });
    // 顯示文字由 rowText(plan) 產生；「要做甚麼」是資料，要留著
    fields = fields.scope?.trim() ? { scope: fields.scope.trim() } : {};
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

/** estimateBy：'me' 學生自己填的時數（新增功課頁），'ai' 大綱裡 AI 估的（學生在核對表確認過） */
function createTask({ title, course, courseId = null, kind, date, min, hours, requirements = '', weight = '', difficulty = null, estimateBy = 'me' }, ownSteps = []) {
  const id = nid('t');
  const total = ownSteps.length ? ownSteps.reduce((n, st) => n + st.min, 0) : Math.max(30, Math.round(hours * 2) * 30);
  const parts = ownSteps.length ? ownSteps : splitMinutes(total).map((m, i, all) => ({ title: all.length > 1 ? L(`第 ${i + 1} 部分`, `Part ${i + 1}`) : L('全部', 'All'), min: m }));
  const steps = parts.map((st, i) => ({ id: `${id}-${i + 1}`, title: st.title, min: st.min, progress: 'todo' }));
  state.tasks.push({
    id, course: courseId && state.courses[courseId] ? courseId : courseFor(course), title, short: title.length > 14 ? `${title.slice(0, 13)}…` : title, kind,
    due: { date, min }, requirements, attachments: [], weight, source: null, estimateBy, estimateConfirmed: true, steps, aiNote: '',
    ...(difficulty ? { difficulty } : {}),
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
  if (ui.editRow === id) ui.editRow = null;
  emit({ toast: L(`已刪除「${t.title}」和它的讀書時段`, `Deleted "${t.title}" and its sessions`), toastIcon: 'x', keepScroll: true });
}

const kindFor = (group, name) => (group === 'exam' ? (/exam|midterm|final|考試/i.test(name) ? L('考試', 'Exam') : L('測驗', 'Quiz')) : L('功課', 'Assignment'));
const groupKey = (group, name) => (group === 'exam' ? (/exam|midterm|final|考試/i.test(name) ? 'exam' : 'quiz') : 'assignment');

/**
 * 截止日期時間：日期留空 → { none: true }（不排進時間表）；有日期沒時間 → 23:59；寫錯 → null。
 */
function readDueFields(date, min) {
  if (!String(date || '').trim()) return { none: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (min == null || Number.isNaN(min)) return { date, min: 1439 };
  return Number.isInteger(min) && min >= 0 && min < 1440 ? { date, min } : null;
}

/**
 * 科目卡上直接新增一項：只有名稱必填。日期留空的放在同一組、日期一格空白，不排進時間表，之後用鉛筆補日期才變成任務。
 * 有日期沒填時數就用這類項目的預設時數。成功回傳 true。
 */
export function addCourseTask(courseId, { title, group, date, min, weight = '', hours }) {
  const course = state.courses[courseId];
  if (!course) return false;
  const name = String(title || '').trim();
  const bad = (msg) => { emit({ toast: msg, toastIcon: 'alert', keepScroll: true }); return false; };
  if (!name) return bad(L('名稱不能留空', 'Enter a name'));
  const due = readDueFields(date, min);
  if (!due) return bad(L('日期或時間寫法不對', 'Check the date and time'));
  const h = hours == null || hours === '' || Number.isNaN(hours) ? null : Number(hours);
  if (h != null && !(h > 0 && h <= 200)) return bad(L('預計時數要大過 0', 'Hours must be more than 0'));
  const w = String(weight || '').trim().slice(0, 20);
  const grp = group === 'exam' ? 'exam' : 'work';
  if (due.none) {
    (course.undated ||= []).push({ id: nid('u'), title: name, group: grp, weight: w, ...(h ? { hours: h } : {}) });
    ui.newRow = null;
    emit({ toast: L(`已加入「${name}」（沒有日期，不會排進時間表）`, `Added "${name}" (no date, so it is not scheduled)`), toastIcon: 'check', keepScroll: true });
    return true;
  }
  const { total } = createTask({ title: name, courseId, kind: kindFor(grp, name), date: due.date, min: due.min, hours: h || typeHours(groupKey(grp, name)), weight: w });
  ui.newRow = null;
  emit({ toast: L(`已加入「${name}」，共 ${hoursText(total)}`, `Added "${name}" (${hoursText(total)})`), toastIcon: 'check', keepScroll: true });
  return true;
}

/**
 * 科目卡上沒有日期的項目：自己加的（course.undated）和大綱裡日期未公布的（已確認的資料項目）。
 * ref 是 'm:科目:項目' 或 'd:資料:項目'。回傳 [{ ref, title, group?, kind?, weight }]，group 沒有時由名稱和類型判斷。
 */
export function undatedOf(s, courseId) {
  const own = (s.courses[courseId]?.undated || []).map((u) => ({ ref: `m:${courseId}:${u.id}`, title: u.title, group: u.group, weight: u.weight || '' }));
  const fromDocs = s.docs.filter((d) => d.own && d.course === courseId).flatMap((d) => d.items
    .filter((i) => i.state === 'ink' && i.applied !== 'dup' && !i.filled && i.plan?.kind === 'task' && !i.plan.date)
    .map((i) => ({ ref: `d:${d.id}:${i.id}`, title: i.plan.title || i.what, kind: typeLabel(i.plan.key), weight: i.weight || '' })));
  return [...own, ...fromDocs];
}
function undatedRef(ref) {
  const [k, a, b] = String(ref || '').split(':');
  if (k === 'm') {
    const course = state.courses[a];
    const u = course?.undated?.find((x) => x.id === b);
    return u && { kind: 'm', course, u };
  }
  if (k === 'd') {
    const doc = state.docs.find((d) => d.id === a);
    const it = doc?.items.find((i) => i.id === b);
    return it && { kind: 'd', doc, it };
  }
  return null;
}

/** 改一項沒有日期的：填了日期就變成任務（之後可以排程）；沒填就只改名稱和比重。成功回傳 true。 */
export function editUndated(ref, { title, date, min, weight = '' }) {
  const r = undatedRef(ref);
  if (!r) return false;
  const name = String(title || '').trim();
  const bad = (msg) => { emit({ toast: msg, toastIcon: 'alert', keepScroll: true }); return false; };
  if (!name) return bad(L('名稱不能留空', 'Enter a name'));
  const due = readDueFields(date, min);
  if (!due) return bad(L('日期或時間寫法不對', 'Check the date and time'));
  const w = String(weight || '').trim().slice(0, 20);
  ui.editRow = null;
  if (due.none) {
    if (r.kind === 'm') Object.assign(r.u, { title: name, weight: w });
    else { r.it.plan = { ...r.it.plan, title: name }; r.it.what = name; r.it.weight = w; }
    emit({ toast: L('已保存', 'Saved'), toastIcon: 'check', keepScroll: true });
    return true;
  }
  let total;
  if (r.kind === 'm') {
    const courseId = r.course.id;
    ({ total } = createTask({ title: name, courseId, kind: kindFor(r.u.group, name), date: due.date, min: due.min, hours: r.u.hours || typeHours(groupKey(r.u.group, name)), weight: w }));
    r.course.undated = r.course.undated.filter((x) => x !== r.u);
  } else {
    const p = r.it.plan;
    const task = createTask({ title: name, courseId: r.doc.course, kind: typeLabel(p.key), date: due.date, min: due.min, hours: p.hours || typeHours(p.key), weight: w, requirements: r.it.scope || '', estimateBy: r.it.byStudent ? 'me' : 'ai' });
    total = task.total;
    r.it.filled = task.id;
  }
  emit({ toast: L(`已加入日期，「${name}」可以排進時間表了（共 ${hoursText(total)}）`, `Date added; "${name}" can now be scheduled (${hoursText(total)})`), toastIcon: 'check', keepScroll: true });
  return true;
}

/** 刪除一項沒有日期的。 */
export function deleteUndated(ref) {
  const r = undatedRef(ref);
  if (!r) return;
  if (r.kind === 'm') r.course.undated = r.course.undated.filter((x) => x !== r.u);
  else r.it.state = 'erased';
  if (ui.editRow === ref) ui.editRow = null;
  emit({ toast: L('已刪除這一項', 'Item deleted'), toastIcon: 'x', keepScroll: true });
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

/** 截止時間或子任務改了：這一項還沒開始的安排和待確認的建議作廢（不偷偷重排）；已做過的保留。 */
function dropFutureSessions(id) {
  state.blocks = state.blocks.filter((b) => b.task !== id || b.date < state.today || (b.date === state.today && b.start <= state.now));
  const pending = pendingProposal(state);
  if (pending) { pending.status = 'erased'; state.proposal = null; }
}

/**
 * 科目卡上直接改一項：名稱、截止日期時間、比重。其他（類型、子任務、預計時數）不動。
 * 截止時間改了，跟 updateTask 一樣清掉還沒開始的安排。成功回傳 true。
 */
export function editTaskBasics(id, { title, date, min, weight = '' }) {
  const task = taskOf(state, id);
  if (!task) return false;
  const name = String(title || '').trim();
  if (!name) { emit({ toast: L('名稱不能留空', 'Enter a name'), toastIcon: 'alert', keepScroll: true }); return false; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isInteger(min) || min < 0 || min >= 1440) {
    emit({ toast: L('請填寫日期和時間', 'Enter a date and time'), toastIcon: 'alert', keepScroll: true });
    return false;
  }
  const changed = task.due.date !== date || task.due.min !== min;
  if (changed) dropFutureSessions(id);
  Object.assign(task, {
    title: name, short: name.length > 14 ? `${name.slice(0, 13)}…` : name,
    due: { date, min }, weight: String(weight || '').trim().slice(0, 20),
  });
  ui.editRow = null;
  emit({ toast: changed ? L('已保存。截止時間改了，這一項還沒開始的安排已清除，請到本週重新排程。', 'Saved. The deadline changed, so unstarted sessions for this item were cleared; schedule again on Week.') : L('已保存', 'Saved'), toastIcon: 'check', keepScroll: true });
  return true;
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
  if (changed) dropFutureSessions(id);
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

/**
 * Canvas 日曆讀到的項目：不用逐項確認，直接放進各科（每一科一份資料，source: 'canvas'，沒有檔案；科目沒有就建立）。
 * 放錯的之後在科目卡刪除就好。再匯入一次時用回同一份：已經加入過的（按 Canvas 的編號認）不會再加，
 * 所以刪掉的功課不會回來；Canvas 上改了截止時間的，任務跟著改。回傳 { courses, added, moved }。
 */
export function addCanvasDocs(groups) {
  let added = 0, moved = 0;
  const touched = new Set();
  for (const { course, items } of groups) {
    let doc = state.docs.find((d) => d.own && d.source === 'canvas' && (d.courseName === course || state.courses[d.course]?.name === course));
    if (!doc) {
      doc = { id: nid('canvas-'), name: `Canvas · ${course}`, size: 0, source: 'canvas', own: true, pages: null, items: [], course: null, courseName: course, notes: [], weightTotal: null };
      state.docs.push(doc);
    }
    const had = new Map(doc.items.map((i) => [i.uid, i]));
    for (const it of items) {
      const old = had.get(it.uid);
      if (old?.state === 'pencil') doc.items = doc.items.filter((i) => i !== old); // 舊版留下的待核對：換成這次的，直接加入
      else if (old) {
        // 已經加入過：Canvas 改了截止時間，而任務還在，就跟著改
        const task = old.taskId && taskOf(state, old.taskId);
        if (task && (task.due.date !== it.plan.date || task.due.min !== it.plan.min)) {
          moveDue(task, { date: it.plan.date, min: it.plan.min });
          old.plan = { ...old.plan, date: it.plan.date, min: it.plan.min };
          moved++;
          touched.add(doc.id);
        }
        continue;
      }
      const item = { ...it, id: nid(`${it.id}-`), state: 'ink' };
      doc.items.push(item);
      if (applyItem(doc, item) === 'task') { added++; touched.add(doc.id); }
    }
  }
  emit({ keepScroll: true });
  return { courses: touched.size, added, moved };
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

/* ---------------- 首次使用 ---------------- */
export function obRestart() {
  ob = freshOb();
}
export function obFinish() {
  aiRequests.reset();
  mode = 'demo';
  remember('mode', 'demo');
  state = fresh();
  Object.assign(ui, freshUi());
  ui.justInked = state.blocks.map((b) => b.id);
}

/* ---------------- 排程方案（Dify「排程｜Study Planner」） ---------------- */
/** 按「排程」或 AI 助手要求：把目前的資料交給排程工作流程，拿回最多約 10 份方案；先預覽最安全的一份。 */
export async function requestPlans(request = '') {
  if (ui.planning) return;
  const p = pendingProposal(state);
  if (p && p.kind !== 'plan') { emit({ toast: L('先確認或不要目前的建議', 'Confirm or discard the current suggestion first'), toastIcon: 'info' }); return; }
  if (!state.tasks.length) { emit({ toast: L('先加入功課和 deadline', 'Add a task and its deadline first'), toastIcon: 'info' }); return; }
  Object.assign(ui, { planning: true, planError: '', planOptions: null });
  if (p) { p.status = 'erased'; state.proposal = null; }
  emit({ keepScroll: true });
  // 全部都排好了還按：當作想重新選。還沒開始的時段交回去重排，確認新方案時才換掉；已過去或進行中的不動。
  const now = getState();
  const later = (b) => b.date > now.today || (b.date === now.today && b.start > now.now);
  const released = unplannedSteps(now).length ? [] : now.blocks.filter((b) => later(b) && stepOf(now, b.step).step?.progress !== 'done');
  const sent = toState({ ...now, blocks: now.blocks.filter((b) => !released.includes(b)) });
  return aiRequests.send('plan', { state: sent, request }, (out) => {
    ui.planning = false;
    if (!out?.ok || !out.result?.plans?.length) {
      // 有回應但一份方案都沒有：截止前的空檔不夠，不是連不上
      ui.planError = out?.ok
        ? L('截止前的空檔不夠，排不下還沒排的部分。可以按「清空排程」後再排一次，或改沒空的時間。', 'There is not enough free time before the deadlines for the unscheduled parts. Try "Clear schedule" and plan again, or edit your busy times.')
        : out?.reason === 'invalid'
        ? L('現在沒有可以排的功課：可能都已排好，或還缺截止日期。', 'Nothing to schedule right now: everything may already be planned, or due dates are missing.')
        : L('AI 暫時連不上，請稍後再試。', 'The AI cannot be reached right now. Please try again later.');
      emit({ keepScroll: true });
      return;
    }
    ui.planOptions = { ...out.result, released: released.map((b) => b.id) };
    choosePlan(out.result.plans[0].id);
  });
}

/** 點一個方案：用虛線預覽它的時段（換掉之前預覽的方案）。 */
export function choosePlan(id) {
  const plan = ui.planOptions?.plans.find((x) => x.id === id);
  if (!plan) return;
  const old = pendingProposal(state);
  if (old?.kind === 'plan') { delete state.proposals[old.id]; state.proposal = null; }
  const pid = nid('plan');
  const prop = proposalFrom(plan, state);
  // 重新排程：先列出會被換掉的舊時段（時間表上變成淡色），確認時才刪
  const swap = (ui.planOptions.released || []).map((id) => ({ kind: 'remove', block: id, replaced: true, reason: L('重新排程，換成新的時段', 'Replanned: replaced by a new session') }));
  state.proposals[pid] = { id: pid, status: 'pending', ...prop, changes: [...swap, ...prop.changes] };
  state.proposal = pid;
  emit({ keepScroll: true, proposal: true });
}

/* ---------------- AI 助手一題一題問（遊戲式對話框） ---------------- */
/** 開始問這份資料「要你補」的項目；沒有要問的就不開。 */
export function startAsk(docId) {
  const doc = state.docs.find((d) => d.id === docId);
  const list = doc ? questionsFor(doc) : [];
  ui.ask = list.length ? { docId, list, i: 0 } : null;
  emit({ keepScroll: true });
}

function nextAsk() {
  ui.ask.i += 1;
  if (ui.ask.i >= ui.ask.list.length) ui.ask = null;
  emit({ keepScroll: true });
}

/** 回答目前這一題（選項的值或打的字）。讀不懂回傳 false，留在同一題。 */
export function answerAsk(value) {
  const a = ui.ask;
  if (!a) return false;
  const q = a.list[a.i];
  if (!itemOf(a.docId, q.item)) { nextAsk(); return true; }
  if (!fillItem(a.docId, q.item, q.field, value)) return false;
  nextAsk();
  return true;
}

/** 把學生給的資料填進核對表的一項（截止日期、要做甚麼、要多久）。讀不懂回傳 false。 */
function fillItem(docId, itemId, field, value) {
  const it = itemOf(docId, itemId);
  if (!it) return false;
  if (field === 'date') {
    const due = readDue(value, Number(state.today.slice(0, 4)));
    if (!due) return false;
    it.plan = { ...it.plan, date: due.date, min: due.min ?? it.plan.min };
    it.flag = due.min == null && !it.plan.min ? 'no-time' : null;
    it.reasons = [];
  } else if (field === 'scope') {
    const text = String(value || '').trim();
    if (!text) return false;
    it.scope = text;
  } else {
    const hours = typeof value === 'number' ? value / 60 : parseHours(value);
    if (!hours) return false;
    it.plan = { ...it.plan, hours };
    Object.assign(it, { confidence: 'high', byStudent: true, hoursDefault: false, steps: [] }); // 學生自己的時數：照時數重新拆步驟
  }
  markMatches(state.docs.find((d) => d.id === docId));
  return true;
}

/** 「不知道」：這題不改，問下一題。 */
export function skipAsk() { if (ui.ask) nextAsk(); }

/** 「之後再說」：關掉，沒答的留在「要你補」。 */
export function closeAsk() { ui.ask = null; emit({ keepScroll: true }); }

/* ---------------- AI 助手 Chatflow（自己的計劃） ---------------- */
const CHAT_FAIL = () => L('AI 助手暫時連不上，請稍後再試。', 'The assistant cannot be reached right now. Please try again later.');

/** 學生打的一句話 → Chatflow；回覆寫進對話，action 變成要確認的建議，或直接去要排程方案。 */
async function chat(text) {
  if (ui.chatting) return;
  ui.draft = '';
  note({ who: 'me', text });
  ui.chatting = true;
  emit({ scrollThread: true });
  return aiRequests.send('chat', { message: text, context: toContext(getState()), conversation: state.chatConversation || '' }, async (out) => {
    ui.chatting = false;
    if (!out?.ok) { note({ who: 'ai', html: esc(CHAT_FAIL()) }); emit({ scrollThread: true }); return; }
    if (out.conversation) state.chatConversation = out.conversation;
    const { reply, action, follow_up: follow } = out.result;
    const change = action && {
      busy: () => ({ kind: 'hatch', rule: { id: nid('u'), ...action.rule, label: action.rule.label || L('沒空', 'Busy'), src: 'me' } }),
      progress: () => ({ kind: 'progress', step: action.step, progress: action.progress, ...(action.remain_min ? { remain: action.remain_min } : {}) }),
      fill: () => ({ kind: 'fill', doc: action.doc, item: action.item, field: action.field, value: action.value }),
    }[action.type]?.();
    let pid = null;
    if (change) {
      const old = pendingProposal(state);
      if (old) old.status = 'erased';
      pid = nid('chat');
      state.proposals[pid] = { id: pid, kind: 'chat', status: 'pending', changes: [change] };
      state.proposal = pid;
    }
    note({ who: 'ai', html: esc(reply), ...(pid ? { proposal: pid } : {}) });
    if (follow) note({ who: 'ai', html: esc(follow) });
    emit({ scrollThread: true, ...(pid ? { proposal: true } : {}) });
    if (action?.type === 'plan') await requestPlans(action.request || '');
  });
}

/* ---------------- 番茄鐘 ---------------- */
/**
 * 開始專注。從一段讀書時段開始（{ block }）時，照那個方案的休息節奏，並把那一步標成進行中；
 * 甚麼都不帶就是自由計時，做甚麼都可以，不會記實際用時。
 */
export function startFocus({ block = null } = {}, now = Date.now()) {
  const b = block ? state.blocks.find((x) => x.id === block) : null;
  const found = b ? stepOf(state, b.step) : { task: null, step: null };
  state.focus = { timer: createTimer(rhythmOf(b?.rest), now), block: b?.id || null, task: found.task?.id || null, step: found.step?.id || null };
  if (found.step && found.step.progress !== 'done') found.step.progress = 'doing';
  emit({ keepScroll: true });
}

/** 停止：從讀書時段開始的，先問做完了沒有；自由計時直接結束。 */
export function stopFocus(now = Date.now()) {
  const f = state.focus;
  if (!f) return;
  f.worked = stopTimer(f.timer, now);
  if (f.step) f.asking = true;
  else state.focus = null;
  emit({ keepScroll: true });
}

/** 回答「做完了嗎？」：記下實際用時（作為日後估算的依據）和進度。 */
export function finishFocus(result, remain = null) {
  const f = state.focus;
  if (!f?.step) { state.focus = null; emit({ keepScroll: true }); return; }
  const { task, step } = stepOf(state, f.step);
  if (task && step) {
    if (f.worked > 0) (state.actuals ||= []).push({ task: task.id, step: step.id, kind: task.kind, min: f.worked, date: state.today });
    if (result === 'done') { step.progress = 'done'; delete step.remain; }
    else { step.progress = 'doing'; if (remain) step.remain = remain; }
  }
  state.focus = null;
  emit({ keepScroll: true, toast: result === 'done' ? L('記下了：這一步完成', 'Saved: this step is done') : L('記下了進度', 'Progress saved'), toastIcon: 'check' });
}
export function pauseFocus(now = Date.now()) { if (state.focus) { pauseTimer(state.focus.timer, now); emit({ keepScroll: true }); } }
export function resumeFocus(now = Date.now()) { if (state.focus) { resumeTimer(state.focus.timer, now); emit({ keepScroll: true }); } }
/** 每秒呼叫：到時間就轉段（專注 ↔ 小休），有轉換才重畫並回傳 true。 */
export function tickFocus(now = Date.now()) {
  const f = state.focus;
  if (!f || f.asking || !tickTimer(f.timer, now)) return false;
  emit({ keepScroll: true, toast: f.timer.phase === 'work' ? L('小休完了，繼續專注', 'Break over, back to focus') : L('專注完一輪，休息一下', 'Round done, take a break'), toastIcon: 'clock' });
  return true;
}

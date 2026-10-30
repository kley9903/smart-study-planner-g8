// 由狀態推算畫面要用的資料：每日的沒空時間（hatch）與時段、空檔、統計、「遠方」。
import { addDays, weekday, diffDays } from './time.js';
import { WINDOW_DAYS, HORIZON_DAYS } from './demo-data.js';
import { L } from './i18n.js';

export const taskOf = (s, id) => s.tasks.find((t) => t.id === id);
export const blockOf = (s, id) => s.blocks.find((b) => b.id === id);
export const courseOf = (s, task) => s.courses[task.course];
export const inkOf = (s, task) => s.courses[task.course].ink;

export function stepOf(s, stepId) {
  for (const task of s.tasks) {
    const step = task.steps.find((x) => x.id === stepId);
    if (step) return { task, step };
  }
  return { task: null, step: null };
}

export function windowDates(s) {
  return Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(s.today, i));
}

export function pendingProposal(s) {
  const p = s.proposal && s.proposals?.[s.proposal];
  return p && p.status === 'pending' ? p : null;
}

/** 把未確認的 AI 建議疊到畫面上：哪些時段會移走、哪些是新建議的時段。 */
export function overlay(s) {
  const o = { rules: [], ghosts: new Map(), adds: [], sleep: [], defers: [] };
  const p = pendingProposal(s);
  if (!p) return o;
  for (const c of p.changes) {
    const b = c.block && typeof c.block === 'string' ? blockOf(s, c.block) : null;
    if (c.kind === 'hatch') o.rules.push({ ...c.rule, pencil: true });
    else if (c.kind === 'move' && b) {
      o.ghosts.set(b.id, 'move');
      o.adds.push({ ...b, ...c.to, id: `${b.id}~0`, from: b.id, reason: c.reason || b.reason, pencil: true });
    } else if (c.kind === 'split' && b) {
      o.ghosts.set(b.id, 'move');
      c.to.forEach((to, i) => o.adds.push({ ...b, ...to, id: `${b.id}~${i}`, from: b.id, reason: c.reason || b.reason, pencil: true }));
    } else if (c.kind === 'remove' && b) o.ghosts.set(b.id, 'remove');
    else if (c.kind === 'defer' && b) { o.ghosts.set(b.id, 'defer'); o.defers.push(c); }
    else if (c.kind === 'add') o.adds.push({ ...c.block, pencil: true });
    else if (c.kind === 'sleep') o.sleep.push({ night: c.night, start: c.start });
  }
  return o;
}

/** 某一晚幾點睡（以該晚日期計，過了午夜即 1440 以上）。 */
export function bedtime(s, night, ov) {
  const pencil = ov?.sleep.find((x) => x.night === night);
  const ink = s.sleepOverrides.find((x) => x.night === night);
  const start = pencil ? pencil.start : ink ? ink.start : s.sleep.start;
  return { min: start < 720 ? start + 1440 : start, pencil: !!pencil, changed: !!(pencil || ink) };
}

function applies(rule, date) {
  return rule.type === 'weekly' ? rule.days.includes(weekday(date)) : rule.date === date;
}

/** 一日的畫面資料 */
export function dayModel(s, date, ov = overlay(s)) {
  const hatches = [];
  const prevBed = bedtime(s, addDays(date, -1), ov);
  hatches.push({ id: `sleep-am-${date}`, kind: 'sleep', start: Math.max(0, prevBed.min - 1440), end: s.sleep.end, label: L('睡眠', 'Sleep') });
  const bed = bedtime(s, date, ov);
  hatches.push({
    id: `sleep-pm-${date}`, kind: 'sleep', start: bed.min, end: 1440 + s.sleep.end,
    label: bed.changed ? L('睡眠 · 只限今晚', 'Sleep · tonight only') : L('睡眠', 'Sleep'), pencil: bed.pencil, sleepNight: date,
  });
  for (const r of s.unavailable) if (applies(r, date)) hatches.push({ id: r.id, kind: r.type, start: r.start, end: r.end, label: r.label, pencil: !!r.pencil, rule: r });
  for (const r of ov.rules) if (applies(r, date)) hatches.push({ id: r.id, kind: r.type, start: r.start, end: r.end, label: r.label, pencil: true, rule: r });

  const blocks = [];
  for (const b of s.blocks) {
    if (b.date !== date) continue;
    const ghost = ov.ghosts.get(b.id);
    blocks.push({ ...b, variant: ghost ? 'ghost' : b.pencil ? 'pencil' : 'ink', ghostKind: ghost });
  }
  for (const b of ov.adds) if (b.date === date) blocks.push({ ...b, variant: 'pencil' });

  const deadlines = s.tasks.filter((t) => t.due.date === date).map((t) => ({ task: t, min: t.due.min }));
  return { date, hatches, blocks, deadlines, wakeMin: s.sleep.end, bedMin: bed.min };
}

/** 空檔：醒著、不是沒空時間、沒有時段的時間。 */
export function gapsOf(model, { from = 0, minLen = 60 } = {}) {
  const lo = Math.max(model.wakeMin, from);
  const hi = model.bedMin;
  if (hi - lo < minLen) return [];
  const busy = [
    ...model.hatches.filter((h) => h.kind !== 'sleep'),
    ...model.blocks.filter((b) => b.variant !== 'ghost'),
  ]
    .map((x) => [Math.max(lo, x.start), Math.min(hi, x.end)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cur = lo;
  for (const [a, b] of busy) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (hi > cur) out.push([cur, hi]);
  return out.filter(([a, b]) => b - a >= minLen).map(([start, end]) => ({ start, end }));
}

/** 一份功課的時數統計（分鐘） */
export function taskStats(s, task) {
  const dates = new Set(windowDates(s));
  const live = task.steps.filter((st) => !st.dropped);
  const planned = s.blocks
    .filter((b) => b.task === task.id && dates.has(b.date) && !b.pencil)
    .filter((b) => stepOf(s, b.step).step?.progress !== 'done')
    .reduce((a, b) => a + b.end - b.start, 0);
  const done = live.filter((st) => st.progress === 'done').reduce((a, st) => a + st.min, 0);
  const total = live.reduce((a, st) => a + st.min, 0);
  const later = live.filter((st) => st.progress !== 'done' && st.later).reduce((a, st) => a + st.min, 0);
  return { planned, done, total, later };
}

/** 每個步驟現在的狀態：done / doing / planned / later / waiting（等回報） / open */
export function stepState(s, step) {
  if (step.dropped) return 'dropped';
  if (step.progress === 'done') return 'done';
  if (step.progress === 'doing') return 'doing';
  if (s.history.some((h) => h.step === step.id && h.checkin === 'pending')) return 'waiting';
  if (s.blocks.some((b) => b.step === step.id && !b.pencil)) return 'planned';
  if (step.later) return 'later';
  return 'open';
}

export function plannedTotal(s) {
  const dates = new Set(windowDates(s));
  return s.blocks.filter((b) => dates.has(b.date) && !b.pencil).reduce((a, b) => a + b.end - b.start, 0);
}

export function nextBlock(s) {
  const ink = s.blocks.filter((b) => !b.pencil);
  const today = ink.filter((b) => b.date === s.today && b.end > s.now).sort((a, b) => a.start - b.start);
  if (today.length) return today[0];
  return ink.filter((b) => b.date > s.today).sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))[0] || null;
}

export function pendingCheckins(s) {
  return s.history.filter((h) => h.checkin === 'pending');
}

export function pendingCount(s) {
  return (pendingProposal(s) ? 1 : 0) + pendingCheckins(s).length;
}

/** 示範導覽三步的完成狀態 */
export function guideState(s) {
  const h = s.history.find((x) => x.id === 'h1');
  const heroes = Object.values(s.proposals || {}).filter((p) => p.kind === 'hero');
  const hero = heroes[heroes.length - 1] || null;
  return {
    s1: !!h && h.checkin !== 'pending' && h.checkin !== 'asking',
    s2: !!hero,
    s3: !!hero && hero.status !== 'pending',
    asking: h?.checkin === 'asking',
    hero,
  };
}

/** 「遠方」：今天起 HORIZON_DAYS 日內的 deadline，卡片分行避免重疊。 */
export function horizonModel(s) {
  const span = 4; // 一張卡片大約佔 4 日的闊度
  const flags = s.tasks
    .map((task) => ({ task, d: diffDays(s.today, task.due.date) + task.due.min / 1440 }))
    .filter((f) => f.d >= 0 && f.d <= HORIZON_DAYS)
    .sort((a, b) => a.d - b.d);
  const lanes = [];
  for (const f of flags) {
    f.flip = f.d + span > HORIZON_DAYS;
    const ext = f.flip ? [f.d - span, f.d] : [f.d, f.d + span];
    let lane = lanes.findIndex((end) => ext[0] >= end + 0.2);
    if (lane === -1) { lane = lanes.length; lanes.push(ext[1]); } else lanes[lane] = ext[1];
    f.lane = lane;
  }
  return { days: HORIZON_DAYS, flags, lanes: Math.max(1, lanes.length) };
}

// 自動排程（固定規則，不靠 AI）：把還沒排的步驟放進未來 7 日的空檔。
// 規則：越早截止越先排；只排在截止前；一個步驟一段（最多 2 小時）；
// 每日讀書最多 4 小時；兩段之間留 15 分鐘；今天只排現在之後；不排過午夜。
import { windowDates, dayModel, gapsOf } from './model.js';
import { dayLabel, hm } from './time.js';
import { L } from './i18n.js';

const DAY_CAP = 240;
const BREAK = 15;
const LATEST = 1440;
const NO_PROPOSAL = { rules: [], ghosts: new Map(), adds: [], sleep: [], defers: [] };
const up30 = (m) => Math.ceil(m / 30) * 30;

const byDue = (a, b) => (a.due.date === b.due.date ? a.due.min - b.due.min : a.due.date < b.due.date ? -1 : 1);

/** 還沒做完、也沒有排在「現在之後」的步驟；已截止的功課不排。 */
export function unplannedSteps(s) {
  const out = [];
  for (const task of [...s.tasks].sort(byDue)) {
    if (task.due.date < s.today || (task.due.date === s.today && task.due.min <= s.now)) continue;
    for (const step of task.steps) {
      if (step.dropped || step.progress === 'done') continue;
      const ahead = s.blocks.some((b) => b.step === step.id && (b.date > s.today || (b.date === s.today && b.end > s.now)));
      if (!ahead) out.push({ task, step });
    }
  }
  return out;
}

/** 回傳建議的時段（未確認）和放不下的步驟。 */
export function planSteps(s) {
  const dates = windowDates(s);
  const placed = [];
  const missing = [];
  for (const { task, step } of unplannedSteps(s)) {
    const spot = findSpot(s, dates, task, step.min, placed);
    if (!spot) {
      missing.push({ task, step });
      continue;
    }
    placed.push({
      task: task.id, step: step.id, ...spot,
      reason: L(
        `${task.short} 在 ${dayLabel(task.due.date)} ${hm(task.due.min)} 截止；這是截止前最早、當日讀書未滿 4 小時的空檔。`,
        `${task.short} is due ${dayLabel(task.due.date)} ${hm(task.due.min)}; this is the earliest free slot before then on a day with under 4 hours of study.`,
      ),
    });
  }
  return { blocks: placed, missing };
}

function findSpot(s, dates, task, min, placed) {
  for (const date of dates) {
    if (date > task.due.date) break;
    const model = dayModel(s, date, NO_PROPOSAL);
    const taken = [...model.blocks, ...placed.filter((b) => b.date === date)];
    if (taken.reduce((a, b) => a + b.end - b.start, 0) + min > DAY_CAP) continue;
    model.blocks = taken.map((b) => ({ ...b, variant: 'ink', start: b.start - BREAK, end: b.end + BREAK }));
    const from = date === s.today ? s.now + BREAK : 0;
    const limit = Math.min(LATEST, date === task.due.date ? task.due.min : LATEST);
    for (const g of gapsOf(model, { from, minLen: min })) {
      const start = up30(g.start);
      const end = start + min;
      if (end <= g.end && end <= limit) return { date, start, end };
    }
  }
  return null;
}

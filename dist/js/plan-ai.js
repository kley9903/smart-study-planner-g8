// 排程方案：網站資料 → Dify「排程｜Study Planner」的輸入；學生選的方案 → 待確認的建議（虛線）；方案小方塊上的文字。
// 時段全部由 Dify 的固定規則算好，這裡不再排；只轉格式和產生顯示文字（跟著目前的介面語言）。
import { L, getLang } from './i18n.js';
import { dayShort, hm, hoursText, diffDays } from './time.js';

export const HORIZON_DAYS = 7;
const PROGRESS = { todo: 'todo', doing: 'partial', done: 'done' };

/** 網站狀態 → 工作流程的 state（格式見 docs/planner-workflow-brief.md 第 4 節）。 */
export function toState(s) {
  const pct = (w) => { const n = parseFloat(String(w ?? '').replace('%', '')); return Number.isFinite(n) ? n : null; };
  return {
    now: { date: s.today, min: s.now },
    horizon_days: HORIZON_DAYS,
    // 截止已過的不送：排程程式會因為排不進過去而整份回零個方案
    tasks: s.tasks.filter((t) => t.due.date > s.today || (t.due.date === s.today && t.due.min > s.now)).map((t) => ({
      id: t.id, title: t.title, kind: t.kind, due: { ...t.due }, weight_percent: pct(t.weight), difficulty: t.difficulty || 'mid',
      steps: t.steps.filter((st) => !st.dropped).map((st) => {
        const progress = PROGRESS[st.progress] || 'todo';
        return { id: st.id, title: st.title, min: st.min, progress, ...(progress === 'partial' && st.remain ? { remaining_min: st.remain } : {}) };
      }),
    })),
    blocks: s.blocks.filter((b) => b.date >= s.today).map((b) => ({ id: b.id, step: b.step, date: b.date, start: b.start, end: b.end })),
    unavailable: s.unavailable.map((r) => ({ ...r })),
    sleep: { start: s.sleep.start, end: s.sleep.end },
    sleep_overrides: (s.sleepOverrides || []).map((x) => ({ ...x })),
  };
}

const shortOf = (s, id) => s.tasks.find((t) => t.id === id)?.short || id;

/** 一項改動的理由（目前語言）。 */
function reasonText(c, s) {
  const r = c.reason || {};
  if (r.code === 'spread_before_due') return L(`${shortOf(s, c.task)} 在 ${dayShort(r.due.date)} ${hm(r.due.min)} 截止；分成幾天做，每天一點。`, `${shortOf(s, c.task)} is due ${dayShort(r.due.date)} ${hm(r.due.min)}; spread over a few days, a bit each day.`);
  if (r.code === 'earliest_before_due') return L(`${shortOf(s, c.task)} 在 ${dayShort(r.due.date)} ${hm(r.due.min)} 截止；這是截止前最早的空檔。`, `${shortOf(s, c.task)} is due ${dayShort(r.due.date)} ${hm(r.due.min)}; this is the earliest free slot before then.`);
  if (r.code === 'late_sleep') return L(`遲 ${r.minutes} 分鐘睡，會少睡一些。`, `Sleep ${r.minutes} minutes later; this costs sleep.`);
  if (r.code === 'simplify') return L(`簡化：由 ${hoursText(r.from)} 減到 ${hoursText(c.min)}。`, `Simplified: from ${hoursText(r.from)} to ${hoursText(c.min)}.`);
  if (r.code === 'borrow') return L(`借用「${r.label || '沒空的時間'}」的一部分。`, `Borrows part of "${r.label || 'busy time'}".`);
  if (r.code === 'drop') return L(`放棄這一項（比重 ${r.weight_percent}%）。`, `Drops this task (${r.weight_percent}% of the grade).`);
  return '';
}

/** 學生選的方案 → 網站的建議（changes 用 store.inkProposal 認得的種類）。 */
export function proposalFrom(plan, s) {
  const changes = [];
  plan.changes.forEach((c, i) => {
    const reason = reasonText(c, s);
    // rest：這個方案的休息方式，番茄鐘從這段開始時照它的節奏
    if (c.kind === 'add') changes.push({ kind: 'add', reason, block: { id: `ai-${plan.id}-${i}`, task: c.task, step: c.step, date: c.date, start: c.start, end: c.end, reason, rest: plan.knobs?.rest ?? null } });
    else if (c.kind === 'sleep') changes.push({ kind: 'sleep', night: c.night, start: c.start, reason });
    else if (c.kind === 'estimate') changes.push({ kind: 'estimate', step: c.step, min: c.min, note: reason, reason });
    else if (c.kind === 'borrow') changes.push({ kind: 'borrow', rule: c.unavailable, date: c.date, start: c.start, end: c.end, reason });
    else if (c.kind === 'drop') changes.push({ kind: 'drop', task: c.task, reason });
  });
  return { kind: 'plan', option: plan.id, changes };
}

const RISKY = 720; // 最緊一項的緩衝少於半日，方塊用紅色標出

/** 方案小方塊上的文字和數字。 */
export function cardOf(plan, s) {
  const st = plan.stats || {};
  const title = plan.summary?.[getLang() === 'zh' ? 'zh' : 'en'] || plan.summary?.zh || plan.summary?.en || knobsText(plan.knobs);
  const buffer = st.tightest?.buffer_min ?? null;
  const days = buffer == null ? 0 : Math.floor(buffer / 1440);
  const left = buffer == null ? '' : days >= 1 ? L(`${days} 天`, `${days} day${days === 1 ? '' : 's'}`) : hoursText(Math.max(0, buffer));
  return {
    id: plan.id,
    title,
    tradeoff: plan.tradeoff?.type || null,
    costsSleep: !!plan.tradeoff?.costs_sleep,
    finish: st.finish ? `${dayShort(st.finish.date)} ${hm(st.finish.min % 1440)}` : '—',
    tightest: st.tightest ? L(`最緊：${shortOf(s, st.tightest.task)} 截止前 ${left}`, `Tightest: ${shortOf(s, st.tightest.task)}, ${left} before due`) : '',
    risky: buffer != null && buffer < RISKY,
    busiest: hoursText(st.max_daily_min || 0),
    short: (plan.short || []).map((x) => `${shortOf(s, x.task)} ${hoursText(x.missing_min)}`),
    days: dayLoads(plan, s),
  };
}

/** 迷你週曆：未來 7 日每日新排了多少分鐘。 */
function dayLoads(plan, s) {
  const out = Array.from({ length: HORIZON_DAYS }, () => 0);
  for (const c of plan.changes || []) {
    if (c.kind !== 'add') continue;
    const i = diffDays(s.today, c.date);
    if (i >= 0 && i < HORIZON_DAYS) out[i] += c.end - c.start;
  }
  return out;
}

/** LLM 沒有寫說明時，用旋鈕組一句。 */
function knobsText(k = {}) {
  const order = { due: L('截止早的先做', 'Earliest deadline first'), short: L('短的先做', 'Shortest first'), easy: L('容易的先做', 'Easiest first') }[k.order] || '';
  const period = { morning: L('早上', 'mornings'), afternoon: L('下午', 'afternoons'), evening: L('晚上', 'evenings'), any: '' }[k.period] || '';
  return [order, period].filter(Boolean).join(L('，', ', '));
}

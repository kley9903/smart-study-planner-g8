// 排程方案：網站資料 → Dify「排程｜Study Planner」的輸入；學生選的方案 → 待確認的建議（虛線）；方案小方塊上的文字。
// 時段全部由 Dify 的固定規則算好，這裡不再排；只轉格式和產生顯示文字（跟著目前的介面語言）。
import { L, getLang } from './i18n.js';
import { dayShort, hm, hoursText, diffDays } from './time.js';
import { dailyLimit } from './model.js';

export const HORIZON_DAYS = 7;
const PROGRESS = { todo: 'todo', doing: 'partial', done: 'done' };

/** 網站狀態 → 工作流程的 state（格式見 docs/planner-workflow-brief.md 第 4 節）。 */
export function toState(s) {
  const pct = (w) => { const n = parseFloat(String(w ?? '').replace('%', '')); return Number.isFinite(n) ? n : null; };
  return {
    now: { date: s.today, min: s.now },
    horizon_days: HORIZON_DAYS,
    scheduling_policy: 'capacity-v1',
    daily_limit_min: dailyLimit(s),
    // 截止已過的不送：排程程式會因為排不進過去而整份回零個方案
    tasks: s.tasks.filter((t) => t.due.date > s.today || (t.due.date === s.today && t.due.min > s.now)).map((t) => ({
      id: t.id, title: t.title, kind: t.kind, due: { ...t.due }, weight_percent: pct(t.weight), difficulty: t.difficulty || 'mid',
      steps: t.steps.filter((st) => !st.dropped).map((st) => {
        const progress = PROGRESS[st.progress] || 'todo';
        return { id: st.id, title: st.title, min: st.min, progress, ...(progress === 'partial' && st.remain != null ? { remaining_min: st.remain } : {}) };
      }),
    })),
    blocks: s.blocks.filter((b) => b.date >= s.today).map((b) => ({ id: b.id, task: b.task, step: b.step, date: b.date, start: b.start, end: b.end,
      ...(b.work_min != null ? { work_min: b.work_min } : {}), ...(b.completed ? { completed: true } : {}) })),
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
  if (['capacity_balanced', 'capacity_leveling', 'balanced_before_target'].includes(r.code)) return L('按每日可用時間分攤，並保留提前完成的緩衝。', 'Spread within your daily availability, keeping an early-completion buffer.');
  if (r.code === 'late_sleep') return L(`遲 ${r.minutes} 分鐘睡，會少睡一些。`, `Sleep ${r.minutes} minutes later; this costs sleep.`);
  if (r.code === 'simplify') return L(`簡化：由 ${hoursText(r.from)} 減到 ${hoursText(c.min)}。`, `Simplified: from ${hoursText(r.from)} to ${hoursText(c.min)}.`);
  return '';
}

/** 學生選的方案 → 網站的建議（changes 用 store.inkProposal 認得的種類）。 */
export function proposalFrom(plan, s) {
  const changes = [];
  plan.changes.forEach((c, i) => {
    const reason = reasonText(c, s);
    // rest：這個方案的休息方式，番茄鐘從這段開始時照它的節奏
    if (c.kind === 'add') changes.push({ kind: 'add', reason, block: { id: `ai-${plan.id}-${i}`, task: c.task, step: c.step, date: c.date, start: c.start, end: c.end,
      ...(c.work_min != null ? { work_min: c.work_min } : {}), reason, rest: plan.knobs?.rest ?? null } });
    else if (c.kind === 'sleep') changes.push({ kind: 'sleep', night: c.night, start: c.start, reason });
    else if (c.kind === 'estimate') changes.push({ kind: 'estimate', step: c.step, min: c.min, note: reason, reason });
  });
  return { kind: 'plan', option: plan.id, actionable: plan.actionable !== false && !(plan.short || []).some((x) => x.missing_min > 0), tradeoff: plan.tradeoff || null, changes };
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
    actionable: plan.actionable !== false && !(plan.short || []).some((x) => x.missing_min > 0),
    consent: plan.tradeoff?.type === 'reduce_buffer_extra_time'
      ? L(`縮短緩衝至 ${plan.tradeoff.adopted_days ?? 1} 天，並在標示的日子臨時加時；修改時間減少，平日上限維持不變。`, `Reduce the buffer to ${plan.tradeoff.adopted_days ?? 1} day and add time on the shown days; less time remains for changes, and your usual daily limit stays unchanged.`)
      : plan.tradeoff?.type === 'reduce_buffer'
      ? L(`縮短緩衝至 ${plan.tradeoff.adopted_days ?? 1} 天；突發情況的修改時間會減少。`, `Reduce the buffer to ${plan.tradeoff.adopted_days ?? 1} day; less time remains for unexpected changes.`)
      : plan.tradeoff?.type === 'extra_time'
      ? L('需要在標示的日子臨時加時；確認只採用這次排程，不會調高平日上限。', 'Requires extra time on the shown days. Confirming applies this schedule without raising your usual daily limit.') : '',
    finish: st.finish ? `${dayShort(st.finish.date)} ${hm(st.finish.min % 1440)}` : '—',
    tightest: st.tightest ? L(`最緊：${shortOf(s, st.tightest.task)} 截止前 ${left}`, `Tightest: ${shortOf(s, st.tightest.task)}, ${left} before due`) : '',
    risky: buffer != null && buffer < RISKY,
    busiest: hoursText(st.max_daily_min || 0),
    deferred: plan.deferred?.work_min ? hoursText(plan.deferred.work_min) : '',
    short: (plan.short || []).map((x) => `${shortOf(s, x.task)} ${hoursText(x.missing_min)}`),
    days: dayLoads(plan, s),
  };
}

/** 迷你週曆：未來 7 日每日新排了多少分鐘。 */
function dayLoads(plan, s) {
  const out = Array.from({ length: HORIZON_DAYS }, () => 0);
  if (plan.daily_loads?.length) {
    for (const d of plan.daily_loads) {
      const i = diffDays(s.today, d.date);
      if (i >= 0 && i < HORIZON_DAYS) out[i] = d.total_min ?? ((d.fixed_min || 0) + (d.work_min || 0));
    }
    return out;
  }
  for (const c of plan.changes || []) {
    if (c.kind !== 'add') continue;
    const i = diffDays(s.today, c.date);
    if (i >= 0 && i < HORIZON_DAYS) out[i] += c.end - c.start;
  }
  return out;
}

/** LLM 沒有寫說明時，用旋鈕組一句。 */
function knobsText(k = {}) {
  const order = L('按提交日期依序完成', 'Complete tasks in deadline order');
  const period = { morning: L('早上', 'mornings'), afternoon: L('下午', 'afternoons'), evening: L('晚上', 'evenings'), any: '' }[k.period] || '';
  return [order, period].filter(Boolean).join(L('，', ', '));
}

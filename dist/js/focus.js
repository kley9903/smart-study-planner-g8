// 番茄鐘的計時（不碰畫面，可以用假時鐘測試）。全部用時間戳記算：網頁在背景或重新載入都不會走慢。
// 預設專注 25 分鐘、小休 5 分鐘，每 4 輪的小休改成長休 15 分鐘。
const MIN = 60000;

/** 方案的休息設定 → 番茄鐘節奏：專注節奏 {work, break} 照用，其他（只有段與段之間的休息）用 25 + 5。 */
export function rhythmOf(rest) {
  return rest && typeof rest === 'object' && rest.work > 0 ? { work: rest.work, brk: rest.break || 5 } : { work: 25, brk: 5 };
}

export function createTimer({ work = 25, brk = 5, long = 15, every = 4 } = {}, now) {
  return { work, brk, long, every, phase: 'work', round: 1, start: now, length: work * MIN, pausedAt: null, workedMs: 0 };
}

const endOf = (t) => t.start + t.length;

/** 還剩多少毫秒（暫停時不動）。 */
export function timeLeft(t, now) {
  return Math.max(0, endOf(t) - (t.pausedAt ?? now));
}

/** 時間到了就進下一段（一次只進一段，讓學生看得到轉換）；回傳有沒有轉換。 */
export function tick(t, now) {
  if (t.pausedAt != null || now < endOf(t)) return false;
  const start = endOf(t);
  if (t.phase === 'work') {
    t.workedMs += t.length;
    t.phase = 'break';
    t.length = (t.round % t.every === 0 ? t.long : t.brk) * MIN;
  } else {
    t.phase = 'work';
    t.round += 1;
    t.length = t.work * MIN;
  }
  t.start = start;
  return true;
}

export function pause(t, now) {
  if (t.pausedAt == null) t.pausedAt = now;
}

export function resume(t, now) {
  if (t.pausedAt == null) return;
  t.start += now - t.pausedAt; // 暫停的時間不算
  t.pausedAt = null;
}

/** 停止：回傳專注了幾分鐘（小休和暫停不算）。 */
export function stop(t, now) {
  const at = Math.min(t.pausedAt ?? now, endOf(t));
  const current = t.phase === 'work' ? Math.max(0, at - t.start) : 0;
  return Math.round((t.workedMs + current) / MIN);
}

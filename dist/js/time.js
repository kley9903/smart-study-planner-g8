// 日期與時間的小工具。
// 日期一律用 'YYYY-MM-DD' 字串；時間用「由當日 00:00 起計的分鐘」。
// 過了午夜仍屬於前一晚的時間，用 1440 以上表示，例如 00:30 = 1470。
import { L } from './i18n.js';

const WD_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

export function weekday(iso) {
  return toDate(iso).getUTCDay();
}

export function diffDays(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86400000);
}

/** 星期幾的名稱（數字 0–6）：四／Thu */
export function wdName(n) {
  return L(WD_ZH[n], WD_EN[n]);
}

/** 11月5日／Nov 5 */
export function md(iso) {
  const d = toDate(iso);
  return L(`${d.getUTCMonth() + 1}月${d.getUTCDate()}日`, `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`);
}

/** 11/5 */
export function mdNum(iso) {
  const d = toDate(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function dayNum(iso) {
  return toDate(iso).getUTCDate();
}

/** 四／Thu */
export function wd(iso) {
  return wdName(weekday(iso));
}

/** 週四／Thu */
export function wk(iso) {
  return L(`週${WD_ZH[weekday(iso)]}`, WD_EN[weekday(iso)]);
}

/** 11月5日（四）／Thu, Nov 5 */
export function dayLabel(iso) {
  return L(`${md(iso)}（${wd(iso)}）`, `${wd(iso)}, ${md(iso)}`);
}

/** 11/5（四）／Thu 11/5 */
export function dayShort(iso) {
  return L(`${mdNum(iso)}（${wd(iso)}）`, `${wd(iso)} ${mdNum(iso)}`);
}

/** 分鐘 → 16:00；1440 會顯示為 24:00 */
export function hm(min) {
  if (min === 1440) return '24:00';
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function span(start, end) {
  return `${hm(start)}–${hm(end)}`;
}

export function num(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** 90 → 1.5 小時／1.5 hours；30 → 30 分鐘／30 min */
export function hoursText(min) {
  if (min < 60) return L(`${min} 分鐘`, `${min} min`);
  const h = num(min / 60);
  return L(`${h} 小時`, `${h} ${h === '1' ? 'hour' : 'hours'}`);
}

/** 90 → 1.5h；130 → 2h10m */
export function hShort(min) {
  if (!min) return '0h';
  if (min < 60) return `${min}m`;
  if (min % 30 === 0) return `${num(min / 60)}h`;
  return `${Math.floor(min / 60)}h${min % 60}m`;
}

export function isWeekend(iso) {
  const w = weekday(iso);
  return w === 0 || w === 6;
}

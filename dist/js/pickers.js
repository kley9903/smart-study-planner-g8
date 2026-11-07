// 日期格和時間格：一格文字（YYYY-MM-DD／24 小時制 HH:MM），旁邊一個小按鈕，點開是紙本樣式的選單。
// 不用瀏覽器內建的 <input type="date|time">：它們跟著電腦的語言顯示（英文介面也出「下午」「2026年12月」），
// 彈出來的是瀏覽器自己畫的深色方塊，CSS 改不了。
// 表單照舊用 FormData 讀 name 的值（"YYYY-MM-DD"、"HH:MM"），送出的地方不用改。
// 時間選單：小時 00–23 排成 6×4、分鐘每 5 分排成 6×2，一眼看完，不用捲動。
// 日曆：星期一開頭（跟月曆頁一樣），今天畫圈，選中的用科目色填滿；上下月可翻，底下「今天」。
import { esc, icon } from './ui.js';
import { L } from './i18n.js';
import { addDays, toDate, weekday } from './time.js';
import { getState } from './store.js';

const pad = (n) => String(n).padStart(2, '0');
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function field(kind, name, value, cls, extra, btnIcon, btnLabel, optional = false) {
  return `<span class="pick pick--${kind}"><input class="${cls}" type="text" name="${name}" value="${esc(value)}" ${optional ? '' : 'required'} autocomplete="off" spellcheck="false" data-pick="${kind}" ${extra}><button class="pick__btn" type="button" aria-label="${btnLabel}" aria-expanded="false" aria-haspopup="dialog">${icon(btnIcon)}</button></span>`;
}

/** 時間格。value 是 "HH:MM"；cls 是文字格自己的 class（例如 input）。 */
/** optional：可以留空（不加 required）。 */
export function timeField(name, value, cls = '', optional = false) {
  return field('time', name, value, cls,
    `inputmode="numeric" maxlength="5" pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]" placeholder="HH:MM"`,
    'clock', L('選時間', 'Pick a time'), optional);
}

/** 日期格。value 是 "YYYY-MM-DD"。 */
export function dateField(name, value, cls = '', optional = false) {
  return field('date', name, value, cls,
    `inputmode="numeric" maxlength="10" pattern="\\d{4}-\\d{2}-\\d{2}" placeholder="YYYY-MM-DD"`,
    'calendar', L('選日期', 'Pick a date'), optional);
}

/** 打字時常見的寫法整理成 HH:MM：930 → 09:30、7 → 07:00、23：59 → 23:59。認不出就原樣不動。 */
export function normalizeTime(text) {
  const s = String(text || '').trim().replace(/[.：]/g, ':');
  let m = s.match(/^(\d{1,2}):(\d{2})$/) || s.match(/^(\d{1,2})(\d{2})$/);
  if (!m && /^\d{1,2}$/.test(s)) m = [s, s, '00'];
  if (!m) return s;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : s;
}

/** 日期寫法整理成 YYYY-MM-DD：2026/12/1、2026.12.1；只打 12/1 就用 year 那一年。不是真的日子就原樣不動。 */
export function normalizeDate(text, year = new Date().getFullYear()) {
  const s = String(text || '').trim().replace(/[./年月]/g, '-').replace(/日$/, '');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) { const md = s.match(/^(\d{1,2})-(\d{1,2})$/); if (md) m = [s, String(year), md[1], md[2]]; }
  if (!m) return s;
  const iso = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  const d = toDate(iso);
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]) ? iso : s;
}

const today = () => getState()?.today || new Date().toISOString().slice(0, 10);
const timeParts = (input) => { const m = normalizeTime(input.value).match(/^(\d{2}):(\d{2})$/); return m ? [Number(m[1]), Number(m[2])] : [null, null]; };
const dateOf = (input) => { const v = normalizeDate(input.value, Number(today().slice(0, 4))); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };

/** 時間選單的內容 */
function timeMenu(input) {
  const [h, min] = timeParts(input);
  const cell = (kind, n, on) => `<button type="button" data-${kind}="${n}" aria-pressed="${on}">${pad(n)}</button>`;
  return `<p class="pick__label">${L('時', 'Hour')}</p>
    <div class="pick__grid pick__grid--hours">${Array.from({ length: 24 }, (_, i) => cell('h', i, i === h)).join('')}</div>
    <p class="pick__label">${L('分', 'Minute')}</p>
    <div class="pick__grid pick__grid--mins">${Array.from({ length: 12 }, (_, i) => cell('m', i * 5, i * 5 === min)).join('')}</div>`;
}

/** 日曆的內容：month 是那個月任何一天的 "YYYY-MM-DD" */
function dateMenu(input, month) {
  const picked = dateOf(input);
  const first = `${month.slice(0, 7)}-01`;
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const next = toDate(first); next.setUTCMonth(next.getUTCMonth() + 1);
  const weeks = Math.ceil((next - toDate(start)) / 864e5 / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const [y, mo] = first.split('-').map(Number);
  const title = L(`${y} 年 ${mo} 月`, `${MONTHS_EN[mo - 1]} ${y}`);
  const heads = L(['一', '二', '三', '四', '五', '六', '日'], ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  const t = today();
  return `<div class="pick__head">
      <button type="button" class="pick__nav" data-month="-1" aria-label="${L('上個月', 'Previous month')}">${icon('chevron')}</button>
      <b class="pick__title" aria-live="polite">${title}</b>
      <button type="button" class="pick__nav is-next" data-month="1" aria-label="${L('下個月', 'Next month')}">${icon('chevron')}</button>
    </div>
    <div class="pick__week" aria-hidden="true">${heads.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="pick__days" data-month-of="${first}">${days.map((d) => `<button type="button" data-d="${d}" aria-pressed="${d === picked}" aria-label="${d}" class="${d.slice(0, 7) === first.slice(0, 7) ? '' : 'is-out'} ${d === t ? 'is-today' : ''}">${Number(d.slice(8))}</button>`).join('')}</div>
    <div class="pick__foot"><button type="button" class="pick__today" data-d="${t}">${L('今天', 'Today')}</button></div>`;
}

let openWrap = null;

function close() {
  if (!openWrap) return;
  openWrap.querySelector('.pick__menu')?.remove();
  openWrap.querySelector('.pick__btn')?.setAttribute('aria-expanded', 'false');
  openWrap = null;
}

function show(wrap, month) {
  if (openWrap !== wrap) close();
  const input = wrap.querySelector('input');
  const kind = input.dataset.pick;
  let menu = wrap.querySelector('.pick__menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = `pick__menu pick__menu--${kind}`;
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', kind === 'date' ? L('選日期', 'Pick a date') : L('選時間', 'Pick a time'));
    wrap.append(menu);
  }
  menu.innerHTML = kind === 'date' ? dateMenu(input, month || dateOf(input) || today()) : timeMenu(input);
  wrap.querySelector('.pick__btn').setAttribute('aria-expanded', 'true');
  openWrap = wrap;
  place(menu);
}

/** 選單放在格子下面；右邊或下面放不下就靠右／往上翻 */
function place(menu) {
  menu.classList.remove('is-right', 'is-up');
  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth - 8) menu.classList.add('is-right');
  if (r.bottom > window.innerHeight - 8 && menu.parentElement.getBoundingClientRect().top > r.height + 16) menu.classList.add('is-up');
}

function setValue(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 裝上兩種格子的點擊、Esc、整理寫法；app.js 開頭呼叫一次（模組測試在 Node 跑，沒有 document，所以不在載入時就裝）。 */
export function installPickers() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.pick__btn');
    if (btn) { const wrap = btn.closest('.pick'); if (openWrap === wrap) close(); else show(wrap); return; }
    const menu = e.target.closest?.('.pick__menu');
    if (!menu) { if (openWrap && !openWrap.contains(e.target)) close(); return; }
    const wrap = menu.closest('.pick');
    const input = wrap.querySelector('input');
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.h !== undefined) {
      const [, min] = timeParts(input);
      setValue(input, `${pad(b.dataset.h)}:${pad(min ?? 0)}`);
      show(wrap);
    } else if (b.dataset.m !== undefined) {
      const [h] = timeParts(input);
      setValue(input, `${pad(h ?? 0)}:${pad(b.dataset.m)}`);
      close();
      input.focus();
    } else if (b.dataset.month) {
      const shown = menu.querySelector('[data-month-of]').dataset.monthOf;
      const d = toDate(shown);
      d.setUTCMonth(d.getUTCMonth() + Number(b.dataset.month));
      show(wrap, d.toISOString().slice(0, 10));
    } else if (b.dataset.d) {
      setValue(input, b.dataset.d);
      close();
      input.focus();
    }
  }, true);

  // Esc 先關選單，不要連帶取消整張表單
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openWrap) { e.stopImmediatePropagation(); const input = openWrap.querySelector('input'); close(); input.focus(); }
  }, true);

  // 離開文字格時整理寫法（930 → 09:30、12/1 → 2026-12-01）
  document.addEventListener('change', (e) => {
    const kind = e.target.dataset?.pick;
    if (kind === 'time') e.target.value = normalizeTime(e.target.value);
    else if (kind === 'date') e.target.value = normalizeDate(e.target.value, Number(today().slice(0, 4)));
  }, true);
}

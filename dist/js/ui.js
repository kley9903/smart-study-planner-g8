// 畫面小工具：圖示、跳脫文字、提示、彈出框。

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function icon(name, cls = '') {
  return `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/* ---------- 提示 ---------- */
export function toast(message, iconName = 'check') {
  const region = document.getElementById('toasts');
  if (!region || !message) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
  region.append(el);
  while (region.children.length > 2) region.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 240);
  }, 3400);
}

/* ---------- 彈出框 ---------- */
let anchorEl = null;
let onClose = null;

export function openPopover(anchor, html, { onClose: close } = {}) {
  const pop = document.getElementById('popover');
  const scrim = document.getElementById('scrim');
  if (!pop) return;
  closePopover();
  anchorEl = anchor;
  onClose = close || null;
  pop.innerHTML = `<button class="icon-btn popover__close" type="button" data-action="pop-close" aria-label="關閉">${icon('x')}</button>${html}`;
  pop.hidden = false;
  scrim.hidden = false;
  place();
  const first = pop.querySelector('button:not(.popover__close), a, input, select');
  (first || pop.querySelector('.popover__close'))?.focus({ preventScroll: true });
}

export function place() {
  const pop = document.getElementById('popover');
  if (!pop || pop.hidden || !anchorEl) return;
  if (window.innerWidth < 760) return; // 手機用底部抽屜
  const r = anchorEl.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const gap = 10;
  let left = r.right + gap;
  if (left + pw > window.innerWidth - 12) left = r.left - pw - gap;
  if (left < 12) left = Math.min(Math.max(12, r.left), window.innerWidth - pw - 12);
  let top = r.top;
  if (top + ph > window.innerHeight - 12) top = window.innerHeight - ph - 12;
  top = Math.max(12, top);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

export function closePopover() {
  const pop = document.getElementById('popover');
  const scrim = document.getElementById('scrim');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  pop.innerHTML = '';
  scrim.hidden = true;
  const back = anchorEl;
  anchorEl = null;
  const cb = onClose;
  onClose = null;
  cb?.();
  if (back && document.body.contains(back)) back.focus({ preventScroll: true });
}

export function popoverOpen() {
  const pop = document.getElementById('popover');
  return pop && !pop.hidden;
}

/* ---------- 本機記憶（只用於「看過歡迎頁」這類小事） ---------- */
export function remember(key, value) {
  try { localStorage.setItem(`ssp:${key}`, value); } catch { /* 私密模式等情況可略過 */ }
}
export function recall(key) {
  try { return localStorage.getItem(`ssp:${key}`); } catch { return null; }
}

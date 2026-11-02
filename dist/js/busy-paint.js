// 「改沒空的時間」模式下，直接在時間表上標記沒空的時段：
// - 電腦：按住拖拉選範圍（按一下 = 1 小時）→ 彈出框填名稱、選重複方式 → 新增；在灰色時段按右鍵直接移除。
// - 手機：拖拉會和捲動打架，改成按一下空白處，用表格新增（開始時間預設為按下的那個鐘頭）。
// 整個手勢的狀態都在這裡；app.js 只要呼叫 attachBusyPainting()，再把回傳的按鈕動作併進動作表。
import { L } from './i18n.js';
import { toast, openPopover, closePopover, icon } from './ui.js';
import { dayLabel, span, hoursText, wdName, weekday, mdNum } from './time.js';

const SLOT = 30;
export const snap = (m) => Math.floor(m / SLOT) * SLOT;
/** 拖拉起點和目前位置（分鐘，已對齊 30 分鐘）→ 選到的範圍；終點包含目前那一格 */
export const paintRange = (anchor, cur) => ({ start: Math.min(anchor, cur), end: Math.max(anchor, cur) + SLOT });

const cssNum = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name));

/**
 * @param deps.isEditing 現在是否在「改沒空的時間」模式
 * @param deps.isRule    這個 id 是不是已確認的沒空時間（睡眠和 AI 建議不能用右鍵移除）
 * @param deps.addRule / removeRule 寫入資料
 * @param deps.openBusyForm(el, start) 打開用表格新增的彈出框
 * @returns 彈出框按鈕的動作（paint-repeat、paint-confirm），併進 app.js 的動作表
 */
export function attachBusyPainting({ doc = document, isEditing, isRule, addRule, removeRule, openBusyForm }) {
  let drag = null;        // 正在拖拉
  let draft = null;       // 拖拉完、彈出框打開中，等你填名稱
  let repeat = 'single';  // 記住上次選的重複方式
  let swallowUntil = 0;   // 放開後瀏覽器會補一個 click，別讓它變成按到時段
  let lastPointer = 'mouse';

  function drawSel(d) {
    const { start, end } = paintRange(d.anchor, d.cur);
    if (!d.sel) {
      d.sel = doc.createElement('div');
      d.sel.className = 'paint-sel';
      d.sel.tabIndex = -1;
      d.col.append(d.sel);
    }
    Object.assign(d, { start, end });
    d.sel.style.setProperty('--s', start);
    d.sel.style.setProperty('--e', end);
    d.sel.innerHTML = `<span>${span(start, end)}</span>`;
  }

  function openForm(d) {
    draft = { date: d.date, start: d.start, end: d.end };
    const wdLabel = wdName(weekday(d.date));
    openPopover(d.sel, `
      <div class="pop__eyebrow">${icon('hatch')} ${L('新的沒空時間', 'New busy time')}</div>
      <div class="pop__title">${dayLabel(d.date)}</div>
      <div class="pop__time">${span(d.start, d.end)} · ${hoursText(d.end - d.start)}</div>
      <div class="pop__section">
        <label class="field"><span class="field__label">${L('這段時間在做甚麼', 'What is it?')}</span><input class="input" id="paint-label" maxlength="16" placeholder="${L('例如：小組會議', 'e.g. Group meeting')}"></label>
        <div class="pop__label" style="margin-top:12px">${L('重複方式', 'Repeat')}</div>
        <div class="seg seg--sm" role="group" aria-label="${L('重複方式', 'Repeat')}">
          <button class="seg__opt" type="button" data-action="paint-repeat" data-repeat="single" aria-pressed="${repeat === 'single'}">${icon('pin')} ${L(`只限 ${mdNum(d.date)}`, `Only ${mdNum(d.date)}`)}</button>
          <button class="seg__opt" type="button" data-action="paint-repeat" data-repeat="weekly" aria-pressed="${repeat === 'weekly'}">${icon('repeat')} ${L(`每週${wdLabel}`, `Every ${wdLabel}`)}</button>
        </div>
      </div>
      <div class="pop__actions">
        <button class="btn btn--sm btn--ink" type="button" data-action="paint-confirm">${icon('hatch')} ${L('標記為沒空', 'Mark as busy')}</button>
        <button class="btn btn--sm btn--ghost" type="button" data-action="pop-close">${L('取消', 'Cancel')}</button>
      </div>`, { onClose: () => d.sel?.remove() });
    setTimeout(() => doc.getElementById('paint-label')?.focus(), 30);
  }

  doc.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
    const col = e.target.closest('.planner.is-painting .pcol');
    if (!col || e.button !== 0 || e.pointerType === 'touch') return;
    const pl = col.closest('.planner');
    const ppm = cssNum(pl, '--ppm');
    const pStart = cssNum(pl, '--p-start');
    const pEnd = cssNum(pl, '--p-end');
    const rect = col.getBoundingClientRect();
    const toMin = (y) => Math.max(pStart, Math.min(pEnd - SLOT, pStart + (y - rect.top) / ppm));
    const m = snap(toMin(e.clientY));
    drag = { col, date: col.dataset.date, anchor: m, cur: m, moved: false, onHatch: !!e.target.closest('.hatch'), toMin, y0: e.clientY, sel: null };
    try { col.setPointerCapture(e.pointerId); } catch { /* 某些瀏覽器不支援 */ }
    e.preventDefault();
  });

  doc.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientY - drag.y0) > 5) drag.moved = true;
    if (!drag.moved) return;
    drag.cur = snap(drag.toMin(e.clientY));
    drawSel(drag);
  });

  doc.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved && d.onHatch) return; // 當作普通按一下灰色時段
    swallowUntil = performance.now() + 300;
    if (!d.moved) d.cur = d.anchor + SLOT; // 按一下（沒拖拉）= 1 小時
    drawSel(d);
    openForm(d);
  });

  // 比 app.js 的點擊處理先登記（同在 capture 階段），所以能把放開後補的 click 整個吞掉
  doc.addEventListener('click', (e) => {
    if (performance.now() < swallowUntil) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (lastPointer !== 'touch' || !isEditing()) return;
    const col = e.target.closest('.planner.is-painting .pcol');
    if (!col || e.target.closest('.hatch, .blk')) return;
    const pl = col.closest('.planner');
    const m = cssNum(pl, '--p-start') + (e.clientY - col.getBoundingClientRect().top) / cssNum(pl, '--ppm');
    openBusyForm(col, Math.min(1380, Math.max(0, Math.floor(m / 60) * 60)));
  }, true);

  doc.addEventListener('contextmenu', (e) => {
    const h = isEditing() && e.target.closest('.planner.is-busy-edit .hatch');
    if (!h) return;
    e.preventDefault();
    closePopover();
    if (h.dataset.rule && isRule(h.dataset.rule)) removeRule(h.dataset.rule);
    else if (!h.dataset.rule) toast(L('睡眠請在右邊修改', 'Change sleep on the right'), 'moon');
  });

  return {
    'paint-repeat': (el) => {
      if (!draft) return;
      repeat = el.dataset.repeat;
      el.parentElement.querySelectorAll('.seg__opt').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    },
    'paint-confirm': () => {
      if (!draft) return;
      const label = (doc.getElementById('paint-label')?.value || '').trim() || L('沒空', 'Busy');
      const d = draft;
      draft = null;
      closePopover();
      addRule({ type: repeat, ...(repeat === 'weekly' ? { days: [weekday(d.date)] } : { date: d.date }), start: d.start, end: d.end, label });
    },
  };
}

// AI 助手入口：每頁右下角的角色。平時站著（操作時縮成探頭），有事冒泡泡可以直接回答，按角色展開對話面板。
import { icon, esc } from '../ui.js';
import { ui, getMode } from '../store.js';
import { pendingProposal, pendingCount, nextBlock, taskOf, stepOf } from '../model.js';
import { renderMargin, mascotImg } from './margin.js';
import { span, hm, dayShort, dayLabel } from '../time.js';
import { L } from '../i18n.js';

/** 角色名字未定；之後改這裡和 margin.js 的標題就好 */
export const assistantName = () => (getMode() === 'mine' ? L('排程助手', 'Planning assistant') : L('AI 助手', 'AI assistant'));

/** 現在要冒的泡泡：AI 建議等你決定，或者問你上一段做完沒有 */
export function bubbleFor(s) {
  const p = pendingProposal(s);
  if (p) {
    const n = p.changes.length;
    if (p.kind === 'hero' && !p.option) {
      return {
        id: `p:${p.id}`,
        html: `<p>${L('時間不夠：PS4 在截止前差 <b>1 小時</b>。我想了幾個做法，你選一個。', 'Not enough time: PS4 is <b>1 hour</b> short. I have a few options for you to pick from.')}</p>
          <div class="dock__acts"><button class="btn btn--sm btn--ink" type="button" data-action="dock-decide">${icon('arrow')} ${L('去選做法', 'Choose an option')}</button></div>`,
      };
    }
    return {
      id: `p:${p.id}:${p.option || ''}`,
      html: `<p>${L(`我在時間表上用虛線標了 <b>${n} 項改動</b>，確認後才會生效。`, `I marked <b>${n} change${n === 1 ? '' : 's'}</b> with dashes on the timetable. Nothing changes until you confirm.`)}</p>
        <div class="dock__acts">
          <button class="btn btn--sm btn--ink" type="button" data-action="ink">${icon('check')} ${L('確認', 'Confirm')}</button>
          <button class="btn btn--sm" type="button" data-action="erase">${L('不要', 'Discard')}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-action="dock-decide">${L('看詳情', 'Details')}</button>
        </div>`,
    };
  }
  const h = s.history.find((x) => x.id === 'h1' && (x.checkin === 'pending' || x.checkin === 'asking'));
  if (h) {
    const task = taskOf(s, h.task);
    const { step } = stepOf(s, h.step);
    if (h.checkin === 'asking') {
      return {
        id: `c:${h.id}:asking`,
        html: `<p>${L('還差多少？', 'How much is left?')}</p>
          <div class="dock__acts">
            <button class="btn btn--sm" type="button" data-action="remain" data-min="30">${L('還差 30 分鐘', '30 min left')}</button>
            <button class="btn btn--sm" type="button" data-action="remain" data-min="60">${L('還差 1 小時', '1 hour left')}</button>
          </div>`,
      };
    }
    return {
      id: `c:${h.id}`,
      html: `<p>${L(`${dayLabel(h.date)} ${span(h.start, h.end)} 的 <b>${esc(task.short)} ${esc(step.title)}</b> 做完了嗎？`, `Did you finish <b>${esc(task.short)} ${esc(step.title)}</b> (${dayShort(h.date)} ${span(h.start, h.end)})?`)}</p>
        <div class="dock__acts">
          <button class="btn btn--sm btn--ink" type="button" data-action="checkin" data-result="done">${icon('check')} ${L('完成了', 'Done')}</button>
          <button class="btn btn--sm" type="button" data-action="checkin" data-result="partial">${L('還差一點', 'Not quite')}</button>
        </div>`,
    };
  }
  return null;
}

/** 名牌上的一行狀態 */
function status(s) {
  const n = pendingCount(s);
  if (n) return `<i class="dock__dot"></i>${L(`${n} 項等你決定`, `${n} waiting for you`)}`;
  const b = nextBlock(s);
  if (b) {
    const when = `${b.date === s.today ? '' : `${dayShort(b.date)} `}${hm(b.start)}`;
    return L(`下一段 ${when}`, `Next: ${when}`);
  }
  return L('有事找我', 'Ask me anything');
}

/** quiet：新增任務等要打字的頁面，不冒泡泡 */
export function renderDock(s, { quiet = false } = {}) {
  const open = !!ui.dockOpen;
  const b = !open && !quiet ? bubbleFor(s) : null;
  const bubble = b && !ui.dockDismissed.includes(b.id) ? b : null;
  return {
    open,
    bubble: !!bubble,
    html: `
      ${open ? `<div class="dock__panel" role="dialog" aria-modal="false" aria-label="${assistantName()}">${renderMargin(s)}</div>` : ''}
      ${bubble ? `
        <div class="dock__bubble" role="status">
          ${bubble.html}
          <button class="dock__x" type="button" data-action="dock-dismiss" data-id="${bubble.id}" aria-label="${L('先不理', 'Dismiss')}">${icon('x')}</button>
        </div>` : ''}
      <button class="dock__me" type="button" data-action="dock-toggle" aria-expanded="${open}" aria-label="${open ? L(`縮小${assistantName()}`, `Minimize ${assistantName()}`) : L(`打開${assistantName()}`, `Open ${assistantName()}`)}">
        <span class="dock__tag"><b>${assistantName()}</b><span>${status(s)}</span></span>
        ${mascotImg('dock__fig', 122, 189)}
      </button>`,
  };
}

// 遊戲式對話框（文字冒險遊戲的版面）：AI 助手要問學生時，畫面底部出現一條全寬的對話帶，
// 角色放大站在對話帶後面左邊（不擋頁面中間；下半身被擋住），名字標在對話帶左上，一次問一題。
// 文字逐字打出來（點一下就全部顯示）；有選項時可以按 1–4；永遠可以自己打字、「不知道」或「之後再說」。
import { esc, icon } from '../ui.js';
import { ui } from '../store.js';
import { L } from '../i18n.js';
import { assistantName } from './dock.js';

/** 目前要問的題目；沒有就回傳空字串。 */
export function renderAsk() {
  const a = ui.ask;
  if (!a) return '';
  const q = a.list[a.i];
  return `
    <div class="ask" role="dialog" aria-modal="true" aria-labelledby="ask-text" data-ask-key="${a.docId}:${a.i}">
      <div class="ask__stage">
      <span class="ask__fig" aria-hidden="true"><span class="dock__stand"></span></span>
      <div class="ask__box">
        <p class="ask__name">${assistantName()}</p>
        <p class="ask__text" id="ask-text" data-type>${esc(q.text)}</p>
        ${q.choices.length ? `<ol class="ask__choices">${q.choices.map((c, i) => `
          <li><button class="ask__choice" type="button" data-action="ask-pick" data-value="${c.value}"><span class="ask__key">${i + 1}</span>${esc(c.label)}</button></li>`).join('')}
        </ol>` : ''}
        <form class="ask__own" data-ask-form>
          <label class="sr-only" for="ask-input">${L('自己打', 'Type your own answer')}</label>
          <input class="input" id="ask-input" name="answer" autocomplete="off" placeholder="${esc(q.placeholder || '')}" value="${esc(ui.askDraft || '')}">
          <button class="btn btn--sm btn--ink" type="submit">${icon('check')} ${L('好', 'OK')}</button>
        </form>
        ${ui.askError ? `<p class="ask__err" role="alert">${esc(ui.askError)}</p>` : ''}
        <footer class="ask__foot">
          <button class="btn btn--sm btn--ghost" type="button" data-action="ask-skip">${L('不知道', "Don't know")}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-action="ask-later">${L('之後再說', 'Later')}</button>
          <span class="ask__count">${a.i + 1} / ${a.list.length}</span>
        </footer>
      </div>
      </div>
    </div>`;
}

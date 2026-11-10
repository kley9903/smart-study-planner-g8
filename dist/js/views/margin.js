// AI 助手：AI 的回覆、建議改動（① 選做法 ② 看改動 ③ 確認）、進度回報和輸入框。
// 放在右下角角色展開的面板裡（views/dock.js），角色趴在面板右上角。
import { esc, icon } from '../ui.js';
import { ui, availableChips, getMode } from '../store.js';
import { HERO } from '../scenarios.js';
import { taskOf, stepOf, inkOf } from '../model.js';
import { span, dayShort, dayLabel } from '../time.js';
import { L } from '../i18n.js';
import { describeChange } from '../proposal.js';

/** 「做完了嗎？」的兩個答案；對話卡與底部提示共用。 */
export const checkinButtons = () => `<button class="btn btn--sm btn--ink" type="button" data-action="checkin" data-result="done">${icon('check')} ${L('完成了', 'Done')}</button>
        <button class="btn btn--sm btn--ghost" type="button" data-action="checkin" data-result="none">${L('沒有做', 'Did not do it')}</button>`;

// 只讓「新」訊息有升上來的動畫；第一次打開頁面時已有的訊息不動。
// 送出後畫面會馬上再畫一次（顯示「正在回覆」），所以記住每則訊息第一次出現的時間，
// 動畫期間重畫時用負的 animation-delay 接著播，不會被打斷或重頭再來。
const RISE_MS = 500;
const seenAt = new Map();
let primed = false;
let typingAt = 0;
const rise = (at) => {
  const ago = Date.now() - at;
  return ago < RISE_MS ? { cls: 'is-new ', style: ` style="animation-delay:${-ago}ms"` } : null;
};

export function renderMargin(s) {
  const now = Date.now();
  s.thread.forEach((n) => { if (!seenAt.has(n.id)) seenAt.set(n.id, primed ? now : 0); });
  primed = true;
  if (!ui.chatting) typingAt = 0;
  else if (!typingAt) typingAt = now;
  const typing = rise(typingAt);
  const mine = getMode() === 'mine';
  return `
  <aside class="margin" id="margin" aria-label="${mine ? L('小秘書', 'Little Secretary') : L('AI 助手（示範）', 'AI assistant (demo)')}">
    ${mine ? '' : `<header class="margin__head">
      <span class="demo-stamp" title="${L('預先寫好的示範回覆，沒有連接 AI', 'Pre-written demo replies, not connected to AI')}">${L('示範回覆', 'Demo replies')}</span>
    </header>`}
    <div class="margin__body" data-thread-scroll>
      <p class="margin__date" aria-hidden="true">${dayLabel(s.today)}</p>
      <div class="thread" aria-live="polite">
        ${s.thread.map((n) => { const r = rise(seenAt.get(n.id)); return r ? noteHtml(s, n).replace('class="note ', `${r.style.trim()} class="note ${r.cls}`) : noteHtml(s, n); }).join('')}
        ${ui.chatting ? `<article class="note note--ai note--typing ${typing ? 'is-new' : ''}"${typing ? typing.style : ''} aria-label="${L('AI 助手正在回覆', 'The assistant is replying')}">${meta('ai')}<div class="note__body"><span class="plans__dots"><i></i><i></i><i></i></span></div></article>` : ''}
      </div>
    </div>
    ${composer(mine)}
  </aside>`;
}

function meta(who) {
  if (who === 'me') return `<div class="note__meta">${icon('nib')} ${L('你', 'You')}</div>`;
  return getMode() === 'mine'
    ? `<div class="note__meta">${L('小秘書', 'Little Secretary')}</div>`
    : `<div class="note__meta">${icon('pencil')} AI · ${L('示範回覆', 'demo reply')}</div>`;
}

function noteHtml(s, n) {
  if (n.who === 'me') {
    return `<article class="note note--me">${meta('me')}<div class="note__body">${esc(n.text)}</div></article>`;
  }
  if (n.kind === 'checkin') return checkinNote(s, n);
  if (n.kind === 'hello') {
    return `<article class="note note--ai">${meta('ai')}<div class="note__body">${L('有甚麼要安排，直接跟我說。', 'Tell me what you need to plan.')}</div></article>`;
  }
  const p = n.proposal ? s.proposals[n.proposal] : null;
  const parts = [];
  if (p) parts.push(decideCard(s, p));
  if (n.chips) parts.push(chipsHtml());
  if (n.reset) parts.push(`<div class="note__chips"><button class="btn btn--sm" type="button" data-action="reset">${icon('reset')} ${L('重設示範資料', 'Reset demo data')}</button></div>`);
  return `
    <article class="note note--ai" ${p ? `data-proposal="${p.id}"` : ''}>
      ${meta('ai')}
      <div class="note__body">${n.html}</div>
      ${parts.map((x) => `<div class="note__attach">${x}</div>`).join('')}
    </article>`;
}

function checkinNote(s, n) {
  const h = s.history.find((x) => x.id === n.history);
  if (!h) return '';
  const task = taskOf(s, h.task);
  const { step } = stepOf(s, h.step);
  let foot;
  if (h.checkin === 'pending') {
    foot = `
      <div class="ccard__actions">
        ${checkinButtons()}
      </div>`;
  } else {
    foot = `<p class="ccard__done">${icon('check')} ${L('已回報：完成了', 'Reported: done')}</p>`;
  }
  return `
    <article class="note note--ai" data-checkin>
      ${meta('ai')}
      <div class="note__body">${L('昨晚的時段做得怎樣？時段結束不等於做完，所以我會先問你。', 'How did last night\'s session go? A session ending does not mean the work is done, so I ask first.')}</div>
      <div class="note__attach">
        <div class="ccard" data-ink="${inkOf(s, task)}">
          <div class="ccard__when">${dayShort(h.date)} ${span(h.start, h.end)}</div>
          <div class="ccard__title"><span class="dot"></span>${esc(task.short)} · ${esc(step.title)}</div>
          ${foot}
        </div>
      </div>
    </article>`;
}

function chipsHtml() {
  const chips = availableChips();
  if (!chips.length) return '';
  return `<div class="note__chips">${chips.map((c) => `<button class="suggest__chip" type="button" data-action="scenario" data-id="${c.id}">${esc(c.text)}</button>`).join('')}</div>`;
}

/* ---------- 決定卡：① 選做法 ② 看改動 ③ 確認 ---------- */
function decideCard(s, p) {
  const hero = p.kind === 'hero';
  const options = hero ? HERO.options : [];
  const chosen = hero ? options.find((o) => o.id === p.option) : null;
  const n = p.changes.length;
  const changesWord = L(`${n} 項改動`, `${n} change${n === 1 ? '' : 's'}`);

  if (p.status !== 'pending') {
    const done = p.status === 'inked';
    return `
      <div class="decide is-closed">
        <div class="decide__status">
          <span class="decide__badge ${done ? 'is-ok' : ''}">${icon(done ? 'check' : 'x')} ${done ? L('已確認', 'Confirmed') : L('已放棄', 'Discarded')}</span>
          <span>${done ? L(`${n} 項改動已生效${chosen ? `（做法：${chosen.title}）` : ''}`, `${changesWord} applied${chosen ? ` (option: ${chosen.title})` : ''}`) : L('這些建議沒有採用，計劃維持原樣', 'Not applied; the plan is unchanged')}</span>
        </div>
        ${done ? `<ol class="changes">${p.changes.map((c) => changeHtml(s, c, p)).join('')}</ol>` : ''}
      </div>`;
  }

  const status = hero
    ? `<div class="decide__status"><span class="decide__badge is-warn">${icon('alert')} ${L('時間不夠', 'Not enough time')}</span><span>${p.missing
      ? L('PS4 在 11月6日（五）23:59 前差 <b>1 小時</b>', 'PS4 is <b>1 hour</b> short before Fri, Nov 6, 23:59')
      : L(`按「${chosen.title}」，PS4 在截止前<b class="decide__ok">做得完</b>`, `With "${chosen.title}", PS4 <b class="decide__ok">fits</b> before the deadline`)}</span></div>`
    : `<div class="decide__status"><span class="decide__badge">${icon('pencil')} ${p.kind === 'plan' ? L('建議', 'Suggested') : L('AI 建議', 'AI suggestion')} · ${L('未確認', 'not confirmed')}</span><span>${changesWord}</span></div>`;

  const optionsHtml = hero
    ? `<p class="decide__step"><span>1</span>${L('選一個做法', 'Pick an option')}</p>
       <div class="options" role="group" aria-label="${L('選一個做法', 'Pick an option')}">
         ${options.map((o) => {
           const on = p.option === o.id;
           return `
             <button class="opt" type="button" data-action="option" data-opt="${o.id}" aria-pressed="${on}">
               <span class="opt__title">${icon(o.icon)} ${o.title}<span class="opt__check">${on ? icon('check') : ''}</span></span>
               <span class="opt__row"><b>${L('換來', 'Gain')}</b><span>${o.gain}</span></span>
               <span class="opt__row opt__row--cost"><b>${L('代價', 'Cost')}</b><span>${o.cost.join('<br>')}${o.note ? `<br><span class="muted">${o.note}</span>` : ''}</span></span>
             </button>`;
         }).join('')}
       </div>`
    : '';

  const listReady = !hero || chosen;
  const changes = listReady
    ? `<ol class="changes">${p.changes.map((c) => changeHtml(s, c, p)).join('')}${p.missing ? `<li class="change change--warn"><span class="change__glyph change__glyph--remove">${icon('alert')}</span><span><b>${L('仍然不夠時間', 'Still not enough time')}</b>${L('：PS4 題 12 未有時間（約 1 小時）', ': PS4 Q12 has no slot (about 1 hour)')}</span></li>` : ''}</ol>`
    : `<p class="decide__empty">${L('先選一個做法', 'Pick an option first')}</p>`;

  return `
    <div class="decide">
      ${status}
      ${optionsHtml}
      <p class="decide__step"><span>${hero ? 2 : 1}</span>${L('會改甚麼', 'What changes')}</p>
      ${changes}
      <p class="decide__step"><span>${hero ? 3 : 2}</span>${L('確認或不要', 'Confirm or discard')}</p>
      <div class="decide__foot">
        <button class="btn btn--ink" type="button" data-action="ink" ${hero && !chosen ? 'aria-disabled="true"' : ''}>${icon('check')} ${hero && !chosen ? L('先選一個做法', 'Pick an option first') : L(`確認改動（${n} 項）`, `Confirm (${n})`)}</button>
        <button class="btn btn--ghost" type="button" data-action="erase">${icon('x')} ${L('不要', 'Discard')}</button>
      </div>
    </div>`;
}

/** 一項改動在建議卡上的一行；內容由 proposal.js 給，這裡只有版型。未確認時可以按，會跳到時間表上的位置。 */
function changeHtml(s, c, p) {
  const d = describeChange(s, c);
  if (!d) return '';
  const t = p.status === 'pending' && d.target;
  const target = t ? ` data-action="locate" data-date="${t.date}" data-block="${t.block}" data-from="${t.from || ''}" data-target role="button" tabindex="0"` : '';
  return `<li class="change"${target}><span class="change__glyph${d.tone ? ` change__glyph--${d.tone}` : ''}">${icon(d.icon)}</span><span><b>${esc(d.title)}</b> ${esc(d.text)}${d.detail ? `<small>${esc(d.detail)}</small>` : ''}</span></li>`;
}

/* ---------- 輸入框 ---------- */
function composer(mine = false) {
  const chips = mine ? [] : availableChips(); // 自己的計劃直接跟 AI 說，不放示範情境的按鈕
  return `
    <form class="composer" data-form="say">
      ${chips.length ? `<div class="suggest"><span class="suggest__label">${L('試試：', 'Try:')}</span>${chips.map((c) => `<button class="suggest__chip" type="button" data-action="scenario" data-id="${c.id}">${esc(c.text)}</button>`).join('')}</div>` : ''}
      <div class="composer__box">
        <label class="sr-only" for="say-input">${mine ? L('寫給小秘書', 'Message Little Secretary') : L('寫給 AI 助手', 'Message the AI assistant')}</label>
        <textarea id="say-input" name="text" rows="1" placeholder="${L('例如：明天要幫家人搬屋', 'e.g. Helping my family move tomorrow')}" data-draft>${esc(ui.draft)}</textarea>
        <button class="composer__send" type="submit" aria-label="${L('送出', 'Send')}">${icon('send')}</button>
      </div>
      ${mine ? '' : `<p class="composer__note">${icon('info')} ${L('示範版沒有連接 AI，只認得上面的示範句子。', 'The demo is not connected to AI; it only understands the sample sentences above.')}</p>`}
    </form>`;
}

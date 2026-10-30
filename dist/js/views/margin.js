// AI 助手：AI 的回覆、建議改動（① 選做法 ② 看改動 ③ 確認）、進度回報和輸入框。
import { esc, icon } from '../ui.js';
import { ui, availableChips, getMode } from '../store.js';
import { HERO } from '../scenarios.js';
import { taskOf, stepOf, inkOf } from '../model.js';
import { span, dayShort, md, hm, hoursText } from '../time.js';
import { L } from '../i18n.js';

// 只讓「新」訊息有淡入動畫；第一次打開頁面時已有的訊息不動
const seen = new Set();
let primed = false;

export function renderMargin(s) {
  const fresh = new Set(primed ? s.thread.filter((n) => !seen.has(n.id)).map((n) => n.id) : []);
  s.thread.forEach((n) => seen.add(n.id));
  primed = true;
  const mine = getMode() === 'mine';
  return `
  <aside class="margin" id="margin" aria-label="${mine ? L('排程助手', 'Planning assistant') : L('AI 助手（示範）', 'AI assistant (demo)')}">
    <header class="margin__head">
      <div>
        <h2>${icon('note')} ${mine ? L('排程助手', 'Planning assistant') : L('AI 助手', 'AI assistant')}</h2>
        <p>${L('建議先用虛線顯示；你按「確認」才會生效。', 'Suggestions are dashed first; they take effect when you press "Confirm".')}</p>
      </div>
      ${mine
        ? `<span class="demo-stamp" title="${L('自動排程用固定規則計算；AI 對話之後接上', 'Auto-schedule uses fixed rules; AI chat comes later')}">${L('規則排程', 'Rule-based')}</span>`
        : `<span class="demo-stamp" title="${L('預先寫好的示範回覆，沒有連接 AI', 'Pre-written demo replies, not connected to AI')}">${L('示範回覆', 'Demo replies')}</span>`}
    </header>
    <div class="margin__body" data-thread-scroll>
      <div class="thread" aria-live="polite">
        ${s.thread.map((n) => noteHtml(s, n).replace('class="note ', `class="note ${fresh.has(n.id) ? 'is-new ' : ''}`)).join('')}
      </div>
    </div>
    ${mine ? `<div class="composer"><p class="composer__note">${icon('info')} ${L('AI 對話之後接上；現在可以在「本週」按「自動排程」。', 'AI chat is coming later; for now, use "Auto-schedule" on This week.')}</p></div>` : composer()}
  </aside>`;
}

function meta(who) {
  if (who === 'me') return `<div class="note__meta">${icon('nib')} ${L('你', 'You')}</div>`;
  return getMode() === 'mine'
    ? `<div class="note__meta">${icon('clock')} ${L('排程助手', 'Planning assistant')}</div>`
    : `<div class="note__meta">${icon('pencil')} AI · ${L('示範回覆', 'demo reply')}</div>`;
}

function noteHtml(s, n) {
  if (n.who === 'me') {
    return `<article class="note note--me">${meta('me')}<div class="note__body">${esc(n.text)}</div></article>`;
  }
  if (n.kind === 'checkin') return checkinNote(s, n);
  if (n.kind === 'hello') {
    return `<article class="note note--ai">${meta('ai')}<div class="note__body">${L('加入功課和 deadline 後，按「自動排程」，我會把讀書時段放進你未來 7 日的空檔。每段都要你確認才會生效。', 'Add your tasks and deadlines, then press "Auto-schedule" and I will place study sessions in your free time over the next 7 days. Each one needs your confirmation.')}</div></article>`;
  }
  const p = n.proposal ? s.proposals[n.proposal] : null;
  const parts = [];
  if (p) parts.push(decideCard(s, p));
  if (n.remainAsk) parts.push(remainAsk(s));
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
        <button class="btn btn--sm btn--ink" type="button" data-action="checkin" data-result="done">${icon('check')} ${L('完成了', 'Done')}</button>
        <button class="btn btn--sm" type="button" data-action="checkin" data-result="partial">${L('還差一點', 'Not quite')}</button>
        <button class="btn btn--sm btn--ghost" type="button" data-action="checkin" data-result="none">${L('沒有做', 'Did not do it')}</button>
      </div>`;
  } else if (h.checkin === 'asking') {
    foot = `<p class="ccard__done">${icon('clock')} ${L('等你說還差多少', 'Waiting for how much is left')}</p>`;
  } else {
    foot = `<p class="ccard__done">${icon('check')} ${L('已回報：', 'Reported: ')}${step.progress === 'done' ? L('完成了', 'done') : L(`還差 ${hoursText(step.remain || 30)}`, `${hoursText(step.remain || 30)} left`)}</p>`;
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

function remainAsk(s) {
  const h = s.history.find((x) => x.id === 'h1');
  if (!h || h.checkin !== 'asking') return '';
  return `
    <div class="note__chips">
      <button class="btn btn--sm" type="button" data-action="remain" data-min="30">${L('還差 30 分鐘', '30 min left')}</button>
      <button class="btn btn--sm" type="button" data-action="remain" data-min="60">${L('還差 1 小時', '1 hour left')}</button>
    </div>`;
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
    ? `<ol class="changes">${p.changes.map((c) => changeHtml(s, c, p)).join('')}${p.missing ? `<li class="change change--warn"><span class="change__glyph change__glyph--remove">${icon('alert')}</span><span><b>${L('仍然不夠時間', 'Still not enough time')}</b>${L('：PS4 題 12 未有時間（約 1 小時）', ': PS4 Q12 has no slot (about 1 hour)')}</span></li>` : ''}</ol>
       <p class="decide__hint">${icon('info')} ${L('按一項改動，時間表會標出它由哪裡移到哪裡。', 'Press a change to see on the timetable where it moves from and to.')}</p>`
    : `<p class="decide__empty">${L('先選一個做法，這裡會列出所有改動。時間表上的虛線是目前的建議。', 'Pick an option first and all the changes will be listed here. The dashed sessions on the timetable are the current suggestion.')}</p>`;

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
      <p class="decide__hint">${L('確認之前，時間表不會改變。', 'Nothing on the timetable changes until you confirm.')}</p>
    </div>`;
}

function changeHtml(s, c, p) {
  const from = c.from;
  const live = p.status === 'pending';
  const target = (date, block, fromId = '') => (live ? `data-action="locate" data-date="${date}" data-block="${block}" data-from="${fromId}" data-target role="button" tabindex="0"` : '');
  const name = (stepId) => {
    const { task, step } = stepOf(s, stepId);
    return task ? `${esc(task.short)} · ${esc(step.title)}` : '';
  };
  switch (c.kind) {
    case 'hatch':
      return `<li class="change" ${target(c.rule.date, '')}><span class="change__glyph change__glyph--hatch">${icon('pin')}</span><span><b>${L('新增沒空時間', 'New busy time')}</b> ${dayShort(c.rule.date)} ${span(c.rule.start, c.rule.end)} "${esc(c.rule.label)}"<small>${L('只限這天', 'this day only')}${c.note ? `; ${c.note}` : ''}</small></span></li>`;
    case 'move':
      return `<li class="change" ${target(c.to.date, `${c.block}~0`, c.block)}><span class="change__glyph">${icon('arrow')}</span><span><b>${L('移動', 'Move')}</b> ${name(from.step)}<small>${dayShort(from.date)} ${hm(from.start)} → ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}${c.short ? L(`（只放得下 ${hoursText(c.to.end - c.to.start)}）`, ` (only ${hoursText(c.to.end - c.to.start)} fits)`) : ''}</small></span></li>`;
    case 'split':
      return `<li class="change" ${target(c.to[0].date, `${c.block}~0`, c.block)}><span class="change__glyph">${icon('scissors')}</span><span><b>${L('分兩段做', 'Split in two')}</b> ${name(from.step)}<small>${c.to.map((t) => `${dayShort(t.date)} ${span(t.start, t.end)}`).join(L('、', ', '))}</small></span></li>`;
    case 'remove':
      return `<li class="change" ${target(from.date, c.block)}><span class="change__glyph change__glyph--remove">${icon('minus')}</span><span><b>${L('不做', 'Skip')}</b> ${name(from.step)}<small>${esc(c.reason)}</small></span></li>`;
    case 'defer':
      return `<li class="change" ${target(from.date, c.block)}><span class="change__glyph">${icon('arrow')}</span><span><b>${L('移出這 7 日', 'Move out of these 7 days')}</b> ${name(from.step)}<small>${dayShort(from.date)} ${hm(from.start)} → ${md(c.toDate)}${L('（下次排程再定時間）', ' (time set in the next round)')}</small></span></li>`;
    case 'add':
      return `<li class="change" ${target(c.block.date, c.block.id)}><span class="change__glyph">${icon('plus')}</span><span><b>${L('新增', 'Add')}</b> ${name(c.block.step)}<small>${dayShort(c.block.date)} ${span(c.block.start, c.block.end)}</small></span></li>`;
    case 'sleep':
      return `<li class="change" ${target(c.night, '')}><span class="change__glyph change__glyph--sleep">${icon('moon')}</span><span><b>${L('今晚遲睡', 'Later bedtime tonight')}</b> ${L(`${md(c.night)}晚上`, `${md(c.night)}, night:`)} ${hm(s.sleep.start)} → ${hm(c.start)}<small>${L('只限今晚；每晚的睡眠設定不變', 'tonight only; your usual sleep time stays the same')}</small></span></li>`;
    case 'estimate':
      return `<li class="change"><span class="change__glyph change__glyph--est">${icon('clock')}</span><span><b>${L('改預計時數', 'New estimate')}</b> ${name(c.step)}<small>${hoursText(c.fromMin)} → ${hoursText(c.min)} (${esc(c.note)})</small></span></li>`;
    default:
      return '';
  }
}

/* ---------- 輸入框 ---------- */
function composer() {
  const chips = availableChips();
  return `
    <form class="composer" data-form="say">
      ${chips.length ? `<div class="suggest"><span class="suggest__label">${L('試試：', 'Try:')}</span>${chips.map((c) => `<button class="suggest__chip" type="button" data-action="scenario" data-id="${c.id}">${esc(c.text)}</button>`).join('')}</div>` : ''}
      <div class="composer__box">
        <label class="sr-only" for="say-input">${L('寫給 AI 助手', 'Message the AI assistant')}</label>
        <textarea id="say-input" name="text" rows="1" placeholder="${L('跟 AI 說，例如：明天要全日幫家人搬屋', 'Tell the AI, e.g. I have to help my family move house tomorrow')}" data-draft>${esc(ui.draft)}</textarea>
        <button class="composer__send" type="submit" aria-label="${L('送出', 'Send')}">${icon('send')}</button>
      </div>
      <p class="composer__note">${icon('info')} ${L('示範版沒有連接 AI，只認得上面的示範句子。', 'The demo is not connected to AI; it only understands the sample sentences above.')}</p>
    </form>`;
}

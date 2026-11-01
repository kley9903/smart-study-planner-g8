// 改沒空的時間：在「本週」按「改沒空的時間」進入，不另開一頁。
// 時間表上方換成工具列，可以直接塗灰；右邊的 AI 助手換成睡眠、上課時間、你自己加的。
import { esc, icon } from '../ui.js';
import { ui, getMode } from '../store.js';
import { span, hm, dayShort, md, wdName, hoursText } from '../time.js';
import { isMobile } from './week.js';
import { L } from '../i18n.js';

export function tool() {
  if (!ui.timeTool) ui.timeTool = isMobile() ? 'view' : 'paint';
  return ui.timeTool;
}

/** 時間表要加的 class：塗色中／移除中 */
export function toolClass() {
  const t = tool();
  return t === 'paint' ? 'is-painting' : t === 'erase' ? 'is-erasing' : '';
}

/** 放在時間表上方：查看／標記沒空／移除，以及目前工具的說明 */
export function busyToolbar() {
  const t = tool();
  const hint = {
    paint: L('在時間格上按住並向下拖，放手後替這段時間命名。讀書時段暫時變淡，方便看會不會撞到。', 'Press and drag down on the grid, then name the time when you let go. Study sessions are faded so you can see clashes.'),
    erase: L('按一下灰色時段就可以移除（睡眠請在右邊修改）。', 'Press a gray block to remove it (change sleep on the right).'),
    view: L('按一下灰色時段查看詳情；要新增，選「標記沒空」。', 'Press a gray block for details; to add one, choose "Mark busy".'),
  }[t];
  return `
    <div class="tp__toolbar">
      <div class="seg" role="group" aria-label="${L('工具', 'Tool')}">
        <button class="seg__opt" type="button" data-action="tool" data-tool="view" aria-pressed="${t === 'view'}">${icon('eye')} ${L('查看', 'View')}</button>
        <button class="seg__opt" type="button" data-action="tool" data-tool="paint" aria-pressed="${t === 'paint'}">${icon('pencil')} ${L('標記沒空', 'Mark busy')}</button>
        <button class="seg__opt" type="button" data-action="tool" data-tool="erase" aria-pressed="${t === 'erase'}">${icon('eraser')} ${L('移除', 'Remove')}</button>
      </div>
      <div class="legend" aria-label="${L('圖例', 'Legend')}">
        <span class="legend__item"><i class="sw sw--off sw--icon">${icon('repeat')}</i>${L('每週重複', 'Weekly')}</span>
        <span class="legend__item"><i class="sw sw--off sw--icon">${icon('pin')}</i>${L('只限這天', 'One day')}</span>
        <span class="legend__item"><i class="sw sw--sleep sw--icon">${icon('moon')}</i>${L('睡眠', 'Sleep')}</span>
      </div>
    </div>
    <p class="tp__hint">${icon('info')} ${hint}</p>`;
}

/** 取代 AI 助手的右欄 */
export function busySide(s) {
  return `
    <aside class="tp__side busy-side" aria-label="${L('沒空的時間', 'Busy times')}">
      <section class="card side-card">
        <h3>${icon('hatch')} ${L('改沒空的時間', 'Edit busy times')}</h3>
        <p class="side-card__sub" style="line-height:1.7">${L('預設全部時間都可以讀書。把上課、兼職、睡覺等沒空的時間塗成灰色，排計劃時會避開。', 'By default every hour is free for study. Mark classes, work and sleep in gray and planning will avoid them.')}</p>
        <div class="busy-side__acts">
          <button class="btn btn--sm" type="button" data-action="new-busy" data-date="${ui.day || s.today}">${icon('plus')} ${L('用表格新增', 'Add with a form')}</button>
          <button class="btn btn--sm btn--ink" type="button" data-action="busy-edit" data-on="0">${icon('check')} ${L('完成', 'Done')}</button>
        </div>
      </section>
      ${sleepCard(s)}
      ${getMode() === 'mine' && !s.unavailable.some((r) => r.src === 'syllabus') ? '' : rulesCard(s, 'syllabus')}
      ${rulesCard(s, 'me')}
    </aside>`;
}

function sleepCard(s) {
  const dur = (s.sleep.end + 1440 - s.sleep.start) % 1440;
  const ov = s.sleepOverrides.map((o) => `<li class="rule" style="cursor:default"><span class="rule__sw sw--sleep sw--icon">${icon('moon')}</span><span class="rule__what"><b>${L(`${md(o.night)}晚上 ${hm(o.start)} 才睡`, `${md(o.night)}: bed at ${hm(o.start)}`)}</b><small>${L('只限這一晚 · 你跟 AI 助手確認的', 'that night only · confirmed with the AI assistant')}</small></span></li>`).join('');
  const opts = (from, to, step, sel) => {
    const out = [];
    for (let m = from; m <= to; m += step) out.push(`<option value="${m % 1440}" ${m % 1440 === sel ? 'selected' : ''}>${hm(m)}</option>`);
    return out.join('');
  };
  return `
    <section class="card side-card">
      <h3>${icon('moon')} ${L('睡眠 · 每晚', 'Sleep · every night')}</h3>
      <p class="side-card__sub">${L('排計劃時一定避開', 'Planning always avoids it')}</p>
      ${ui.sleepEdit ? `
        <div class="sleep-edit">
          <label class="field"><span class="field__label">${L('幾點睡', 'Bedtime')}</span><select class="select" id="sleep-start">${opts(1320, 1560, 30, s.sleep.start)}</select></label>
          <label class="field"><span class="field__label">${L('幾點起身', 'Wake-up')}</span><select class="select" id="sleep-end">${opts(360, 660, 30, s.sleep.end)}</select></label>
        </div>
        <div class="pop__actions">
          <button class="btn btn--sm btn--ink" type="button" data-action="sleep-save">${icon('nib')} ${L('保存', 'Save')}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-action="sleep-edit" data-on="0">${L('取消', 'Cancel')}</button>
        </div>` : `
        <div class="sleep-big">${hm(s.sleep.start)} ${icon('arrow')} ${hm(s.sleep.end)} <small>${hoursText(dur)}</small></div>
        <div style="margin-top:10px"><button class="btn btn--sm" type="button" data-action="sleep-edit" data-on="1">${icon('pencil')} ${L('修改', 'Edit')}</button></div>`}
      <p class="sleep-rule">${L('AI 不會把睡眠當作讀書時間。要遲睡，它會先問你，而且只限當晚，不會改這裡的設定。', 'Sleep is never used for study. A later bedtime is only ever suggested for one night, after asking you, and never changes this setting.')}</p>
      ${ov ? `<ul class="rules">${ov}</ul>` : ''}
    </section>`;
}

function ruleWhen(r) {
  if (r.type === 'single') return `${dayShort(r.date)} ${span(r.start, r.end)}`;
  const days = r.days.length === 7 ? L('每天', 'Every day') : L(`每週${r.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => wdName(d)).join('、')}`, `Every ${r.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => wdName(d)).join(', ')}`);
  return `${days} ${span(r.start, r.end)}`;
}

function rulesCard(s, src) {
  const list = s.unavailable.filter((r) => (r.src || 'me') === src);
  const title = src === 'syllabus' ? `${icon('file')} ${L('從課程大綱找到', 'From your syllabus')}` : `${icon('repeat')} ${L('你自己加的', 'Added by you')}`;
  const sub = src === 'syllabus' ? L('上課時間在「課程資料」核對後才會變成沒空的時間', 'Class times become busy times after you check them in Syllabus') : L('每週重複和只限這天的安排', 'Weekly and one-day busy times');
  const items = list
    .slice()
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'weekly' ? -1 : 1))
    .map((r) => `
      <li>
        <button class="rule ${ui.hlRule === r.id ? 'is-hl' : ''}" type="button" data-action="hl-rule" data-rule="${r.id}">
          <span class="rule__sw sw--off sw--icon">${icon(r.type === 'single' ? 'pin' : src === 'syllabus' ? 'file' : 'repeat')}</span>
          <span class="rule__what"><b>${esc(r.label)}</b><small>${ruleWhen(r)}</small></span>
          <span class="rule__src">${r.type === 'single' ? L('只限這天', 'One day') : L('每週', 'Weekly')}</span>
        </button>
      </li>`).join('');
  return `
    <section class="card side-card">
      <button class="rules-toggle" data-action="rules-toggle" data-src="${src}" aria-expanded="${!!ui.rulesOpen[src]}"><span>${title}</span><span>${list.length} ${icon('chevron')}</span></button>
      <div ${ui.rulesOpen[src] ? '' : 'hidden'}>
      <p class="side-card__sub">${sub}</p>
      <ul class="rules">${items || `<li class="muted" style="font-size:13px;padding:6px">${L('未有', 'None yet')}</li>`}</ul>
      </div>
    </section>`;
}

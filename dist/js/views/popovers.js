// 時間表上的彈出框內容：按讀書時段、按灰色沒空時段、用表格新增沒空時間。
// 全部只由資料算出 HTML，不碰 DOM；app.js 負責在按到的元素旁邊打開（openPopover）。
import { timeField, dateField } from '../pickers.js';
import { L } from '../i18n.js';
import { esc, icon } from '../ui.js';
import { blockOf, stepOf, taskOf, overlay, pendingProposal, courseOf, inkOf } from '../model.js';
import { dayLabel, span, hoursText, hm, wdName, dayShort, md } from '../time.js';

function findBlock(s, id) {
  const ov = overlay(s);
  const real = blockOf(s, id);
  if (real) return { b: real, variant: ov.ghosts.has(id) ? 'ghost' : 'ink' };
  const add = ov.adds.find((x) => x.id === id);
  return add ? { b: add, variant: 'pencil' } : {};
}

function ghostText(b, p) {
  const c = p?.changes.find((x) => x.block === b.id);
  if (!c) return L('AI 建議改動這一段。', 'The AI suggests changing this session.');
  if (c.kind === 'move') return L(`AI 建議移到 ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}。`, `The AI suggests moving it to ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}.`);
  if (c.kind === 'split') {
    const parts = c.to.map((t) => `${dayShort(t.date)} ${span(t.start, t.end)}`);
    return L(`AI 建議分兩段：${parts.join('、')}。`, `The AI suggests two sessions: ${parts.join(', ')}.`);
  }
  if (c.kind === 'remove') return L('AI 建議不做這一段（簡化）。', 'The AI suggests skipping this (simplified).');
  if (c.kind === 'defer') return L(`AI 建議移到 ${md(c.toDate)}，具體時間下次排程再定。`, `The AI suggests moving it to ${md(c.toDate)}; the exact time is set in the next round.`);
  return L('AI 建議改動這一段。', 'The AI suggests changing this session.');
}

function proposalActions(p) {
  if (!p) return '';
  if (p.kind === 'hero' && !p.option) {
    return `<div class="pop__actions"><button class="btn btn--sm btn--ink" type="button" data-action="guide-decide">${icon('arrow')} ${L('去選做法', 'Choose an option')}</button></div>`;
  }
  return `<div class="pop__actions"><button class="btn btn--sm btn--ink" type="button" data-action="ink">${icon('check')} ${L(`確認全部改動（${p.changes.length} 項）`, `Confirm all (${p.changes.length})`)}</button><button class="btn btn--sm btn--ghost" type="button" data-action="erase">${icon('x')} ${L('不要', 'Discard')}</button></div>`;
}

/** 讀書時段（已確認、AI 建議移走、或建議新增）；找不到這段時回傳 '' */
export function blockPopover(s, blockId) {
  const { b, variant } = findBlock(s, blockId);
  if (!b) return '';
  const task = taskOf(s, b.task);
  const { step } = stepOf(s, b.step);
  const p = pendingProposal(s);
  const tag = variant === 'ink'
    ? `<span class="chip chip--quiet">${icon('check')} ${L('已確認', 'Confirmed')}</span>`
    : variant === 'pencil' ? `<span class="chip chip--pencil">${icon('pencil')} ${L('建議 · 未確認', 'Suggested · not confirmed')}</span>` : `<span class="chip chip--pencil">${icon('arrow')} ${L('AI 建議移走', 'Suggested to move')}</span>`;
  let html = `
    <div class="pop__eyebrow" data-ink="${inkOf(s, task)}"><span class="course-tag"><span class="dot"></span>${esc(courseOf(s, task).name)}</span>${tag}</div>
    <div class="pop__title">${esc(task.short)} · ${esc(step.title)}</div>
    <div class="pop__time">${dayLabel(b.date)} ${span(b.start, b.end)} · ${hoursText(b.end - b.start)}</div>
    <div class="pop__section"><div class="pop__label">${icon('pencil')} ${L('為甚麼排在這裡', 'Why it is here')}</div><p class="pop__reason">${esc(b.reason || '')}</p></div>`;
  if (variant === 'ink') {
    html += `
      <div class="pop__section">
        <div class="pop__label">${icon('check')} ${L('進度 · 你回報的直接生效', 'Progress · takes effect right away')}</div>
        <div class="seg seg--sm" role="group" aria-label="${L('進度', 'Progress')}">
          ${[['todo', L('未開始', 'Not started')], ['doing', L('進行中', 'In progress')], ['done', L('已完成', 'Done')]].map(([k, t]) => `<button class="seg__opt" type="button" data-action="progress" data-step="${step.id}" data-p="${k}" aria-pressed="${step.progress === k}">${t}</button>`).join('')}
        </div>
        <p class="muted" style="font-size:12.5px;margin-top:8px">${step.progress === 'doing' && step.remain ? L(`你回報還差 ${hoursText(step.remain)}。`, `You reported ${hoursText(step.remain)} left. `) : ''}</p>
      </div>
      <div class="pop__actions"><a class="btn btn--sm" href="#/tasks/${task.id}">${icon('list')} ${L('在任務頁查看', 'Open in Tasks')}</a></div>`;
  } else {
    html += `
      <div class="pop__section"><p style="font-size:13.5px;color:var(--ink-2)">${variant === 'pencil' ? L('這是建議的時段，還未確認。', 'This is a suggested session, not confirmed yet.') : esc(ghostText(b, p))}</p></div>
      ${proposalActions(p)}`;
  }
  return html;
}

function ruleWhen(r) {
  if (r.type === 'single') return `${dayLabel(r.date)} ${span(r.start, r.end)}`;
  const days = r.days.length === 7 ? L('每天', 'Every day') : L(`每週${r.days.map((d) => wdName(d)).join('、')}`, `Every ${r.days.map((d) => wdName(d)).join(', ')}`);
  return `${days} ${span(r.start, r.end)}`;
}

/**
 * 灰色沒空時段。target 是按到的元素的 data：{ rule } 是沒空時間（已確認或 AI 建議），{ sleep } 是某晚的睡眠。
 * editBusy：在「改沒空的時間」模式時，已確認的時段改成顯示「移除」。找不到時回傳 ''。
 */
export function hatchPopover(s, { rule, sleep }, editBusy) {
  if (!rule) {
    const o = s.sleepOverrides.find((x) => x.night === sleep);
    const pen = overlay(s).sleep.find((x) => x.night === sleep);
    return `
      <div class="pop__eyebrow">${icon('moon')} ${L('睡眠 · 每晚重複', 'Sleep · every night')}</div>
      <div class="pop__title">${hm(s.sleep.start)}–${hm(s.sleep.end)}</div>
      ${pen ? `<div class="pop__time">${L(`AI 建議：${md(sleep)}晚上 ${hm(pen.start)} 才睡（只限今晚）`, `AI suggests: bed at ${hm(pen.start)} on ${md(sleep)} (tonight only)`)}</div>` : o ? `<div class="pop__time">${L(`${md(sleep)}晚上 ${hm(o.start)} 才睡（只限這一晚）`, `${md(sleep)}: bed at ${hm(o.start)} (that night only)`)}</div>` : ''}
      <div class="pop__actions"><a class="btn btn--sm" href="#/time">${icon('pencil')} ${L('改睡眠時間', 'Change sleep time')}</a></div>`;
  }
  const real = s.unavailable.find((x) => x.id === rule);
  const r = real || overlay(s).rules.find((x) => x.id === rule);
  if (!r) return '';
  const kind = r.type === 'single' ? `${icon('pin')} ${L('只限這天', 'One day')}` : `${icon('repeat')} ${L('每週重複', 'Weekly')}`;
  const src = r.src === 'syllabus' ? L('從課程大綱找到，你核對過。', 'Found in your syllabus and checked by you.') : L('你自己加的。', 'Added by you.');
  if (editBusy && real) {
    return `
      <div class="pop__eyebrow">${icon('hatch')} ${L('沒空時間', 'Busy')} · ${kind}</div>
      <div class="pop__title">${esc(r.label)}</div>
      <div class="pop__time">${ruleWhen(r)}</div>
      <div class="pop__section"><p style="font-size:13.5px;color:var(--ink-2)">${r.type === 'weekly' ? L('這是每週重複的沒空時間，移除後每週這段時間都會變回可以讀書。', 'This repeats weekly; removing it frees this time every week. ') : L('只會移除這一天。', 'Only this day is removed. ')}${r.src === 'syllabus' ? L('這是從課程大綱找到的上課時間。', 'This class time came from your syllabus.') : ''}</p></div>
      <div class="pop__actions"><button class="btn btn--sm btn--ink" type="button" data-action="remove-rule" data-rule="${r.id}">${icon('eraser')} ${L('移除', 'Remove')}</button><button class="btn btn--sm btn--ghost" type="button" data-action="pop-close">${L('取消', 'Cancel')}</button></div>`;
  }
  return `
    <div class="pop__eyebrow">${L('沒空時間', 'Busy')} · ${kind}${real ? '' : ` <span class="chip chip--pencil">${icon('pencil')} ${L('AI 建議', 'AI suggestion')}</span>`}</div>
    <div class="pop__title">${esc(r.label)}</div>
    <div class="pop__time">${ruleWhen(r)}</div>
    <div class="pop__section"><p style="font-size:13.5px;color:var(--ink-2)">${real ? src : L('AI 從你說的話理解到的，還未確認。', 'The AI understood this from what you said; not confirmed yet.')}</p></div>
    ${real ? (editBusy ? '' : `<div class="pop__actions"><button class="btn btn--sm" type="button" data-action="busy-edit" data-on="1">${icon('hatch')} ${L('改沒空的時間', 'Edit busy times')}</button></div>`) : proposalActions(pendingProposal(s))}`;
}

/** 用表格新增沒空時間（日期、開始時間預設值由呼叫端給；開始時間以分鐘計） */
export function busyForm(date, start = 540) {
  return `<form data-form="busy">
    <h2 class="pop__title">${L('新增忙碌時段', 'Add busy time')}</h2>
    <label class="field"><span class="field__label">${L('名稱', 'Name')}</span><input class="input" name="label" maxlength="80" required></label>
    <label class="field"><span class="field__label">${L('日期', 'Date')}</span>${dateField('date', date, 'input')}</label>
    <label class="field"><span class="field__label">${L('開始時間', 'Start time')}</span>${timeField('start', hm(start), 'input')}</label>
    <label class="field"><span class="field__label">${L('結束時間', 'End time')}</span>${timeField('end', hm(start + 60), 'input')}</label>
    <label class="field"><span class="field__label">${L('重複方式', 'Repeat')}</span><select class="select" name="repeat"><option value="single">${L('只限這天', 'One day')}</option><option value="weekly">${L('每週同一天', 'Weekly on this day')}</option></select></label>
    <p class="demo-note">${L('跨午夜的時段請分成兩天新增。', 'For overnight events, add a separate time on each day.')}</p>
    <button class="btn btn--ink" type="submit">${L('保存', 'Save')}</button>
  </form>`;
}

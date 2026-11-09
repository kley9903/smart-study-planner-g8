// 番茄鐘頁：可以獨立使用（做甚麼都可以），也可以從一段讀書時段開始（照那個方案的節奏，結束時問做完沒有，記下實際用時）。
// 倒數的數字由 app.js 每秒更新 [data-focus-left] 和圓環，不用整頁重畫。
import { esc, icon } from '../ui.js';
import { L } from '../i18n.js';
import { timeLeft } from '../focus.js';
import { stepOf, remainingMinutes, workMinutes } from '../model.js';
import { span, dayShort, hoursText } from '../time.js';

export const clock = (ms) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function upcoming(s) {
  return s.blocks
    .filter((b) => !b.completed && (b.date > s.today || (b.date === s.today && b.end > s.now)))
    .sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))
    .slice(0, 3)
    .map((b) => ({ b, ...stepOf(s, b.step) }))
    .filter((x) => x.step && x.step.progress !== 'done');
}

export const focusPage = {
  render(s) {
    const f = s.focus;
    const head = `<div class="page-head"><div><h1 class="page-head__title">${L('專注', 'Focus')}</h1></div></div>`;
    if (!f) {
      const list = upcoming(s);
      return `${head}
        <section class="sheet focus">
          <div class="focus__dial" style="--p:0"><span class="focus__time">25:00</span><span class="focus__phase">${L('專注 25 分鐘 · 休息 5 分鐘', '25 min focus · 5 min break')}</span></div>
          <button class="btn btn--ink focus__go" type="button" data-action="focus-start">${icon('play')} ${L('開始專注', 'Start')}</button>
          ${list.length ? `<div class="focus__from"><h2>${L('從讀書時段開始', 'Start from a study session')}</h2><ul>${list.map(({ b, task, step }) => `
            <li><button class="focus__session" type="button" data-action="focus-block" data-block="${b.id}">
              <b>${esc(task.short)} · ${esc(step.title)}</b><span>${dayShort(b.date)} ${span(b.start, b.end)}${b.rest && typeof b.rest === 'object' ? L(` · 專注 ${b.rest.work} 分鐘、休 ${b.rest.break} 分鐘`, ` · ${b.rest.work} min focus, ${b.rest.break} min break`) : ''}</span>
            </button></li>`).join('')}</ul></div>` : ''}
        </section>`;
    }
    const { task, step } = f.step ? stepOf(s, f.step) : { task: null, step: null };
    const what = step ? `<p class="focus__what">${esc(task.short)} · ${esc(step.title)}</p>` : '';
    if (f.asking) {
      const block = s.blocks.find((b) => b.id === f.block);
      const split = block && step && workMinutes(block) < remainingMinutes(step);
      return `${head}
        <section class="sheet focus">
          ${what}
          <p class="focus__ask">${L(`專注了 ${hoursText(Math.max(1, f.worked))}。這一步做完了嗎？`, `You focused for ${hoursText(Math.max(1, f.worked))}. Is this step done?`)}</p>
          <div class="focus__acts">
            ${split ? `<button class="btn btn--ink" type="button" data-action="focus-finish" data-result="session">${icon('check')} ${L(`這段完成，餘下 ${hoursText(remainingMinutes(step) - workMinutes(block))}`, `Session done; ${hoursText(remainingMinutes(step) - workMinutes(block))} remains`)}</button>` : ''}
            <button class="btn ${split ? '' : 'btn--ink'}" type="button" data-action="focus-finish" data-result="done">${icon('check')} ${L('整個步驟已完成', 'Whole step done')}</button>
            <button class="btn btn--ghost" type="button" data-action="focus-finish" data-result="notdone">${L('還沒做完', 'Not finished')}</button>
          </div>
        </section>`;
    }
    const t = f.timer;
    const left = timeLeft(t, Date.now());
    const phase = t.phase === 'work' ? L(`專注中 · 第 ${t.round} 輪`, `Focus · round ${t.round}`) : t.length > t.brk * 60000 ? L('長休', 'Long break') : L('小休', 'Break');
    return `${head}
      <section class="sheet focus ${t.phase === 'work' ? '' : 'is-break'} ${t.pausedAt != null ? 'is-paused' : ''}">
        ${what}
        <div class="focus__dial" data-focus-dial style="--p:${(1 - left / t.length).toFixed(4)}">
          <span class="focus__time" data-focus-left>${clock(left)}</span>
          <span class="focus__phase">${t.pausedAt != null ? L('已暫停', 'Paused') : phase}</span>
        </div>
        <div class="focus__acts">
          ${t.pausedAt != null
            ? `<button class="btn btn--ink" type="button" data-action="focus-resume">${icon('play')} ${L('繼續', 'Resume')}</button>`
            : `<button class="btn" type="button" data-action="focus-pause">${L('暫停', 'Pause')}</button>`}
          <button class="btn btn--ghost" type="button" data-action="focus-stop">${L('停止', 'Stop')}</button>
        </div>
      </section>`;
  },
};

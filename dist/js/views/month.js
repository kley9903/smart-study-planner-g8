// Month overview shares tasks and busy rules with the weekly planner.
import { addDays, toDate, isoOf, weekday, dayNum, wdName, hm, hoursText } from '../time.js';
import { esc, icon } from '../ui.js';
import { ui } from '../store.js';
import { L } from '../i18n.js';

export function shiftMonth(date, delta) {
  const d = toDate(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return isoOf(d);
}

export function monthDates(date) {
  const first = `${date.slice(0, 7)}-01`;
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const next = shiftMonth(first, 1);
  const count = Math.ceil(((toDate(next) - toDate(start)) / 86400000) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function renderMonth(s) {
  const month = ui.month || s.today;
  const dates = monthDates(month);
  const selected = ui.monthDay || s.today;
  const deadlines = s.tasks.filter((t) => t.due.date === selected);
  const rules = s.unavailable.filter((r) => r.type === 'weekly' ? r.days.includes(weekday(selected)) : r.date === selected);
  const label = toDate(month).toLocaleDateString(L('zh-TW', 'en-US'), { year: 'numeric', month: 'long', timeZone: 'UTC' });
  return `<section class="month" aria-label="${L('月曆總覽', 'Month overview')}">
    <div class="month__toolbar">
      <h2>${esc(label)}</h2>
      <div class="month__nav">
        <button class="btn btn--sm" data-action="month-move" data-delta="-1" aria-label="${L('上個月', 'Previous month')}">${icon('back')}</button>
        <button class="btn btn--sm" data-action="month-today">${L('今天', 'Today')}</button>
        <button class="btn btn--sm" data-action="month-move" data-delta="1" aria-label="${L('下個月', 'Next month')}">${icon('arrow')}</button>
      </div>
    </div>
    <p class="month__hint">${L('看截止日期與忙碌時段；選一天查看詳情或新增。讀書安排請切回週視圖。', 'Deadlines and busy times at a glance. Select a day to view or add items; use Week for study sessions.')}</p>
    <div class="month__grid">
      ${[1, 2, 3, 4, 5, 6, 0].map((n) => `<div class="month__weekday">${wdName(n)}</div>`).join('')}
      ${dates.map((date) => {
        const tasks = s.tasks.filter((t) => t.due.date === date);
        const busy = s.unavailable.filter((r) => r.type === 'weekly' ? r.days.includes(weekday(date)) : r.date === date);
        return `<button class="month__day ${date.slice(0, 7) !== month.slice(0, 7) ? 'is-outside' : ''} ${date === s.today ? 'is-today' : ''}" id="month-${date}" data-action="month-day" data-date="${date}" aria-pressed="${date === selected}" aria-label="${esc(`${date}, ${tasks.length} ${L('個截止項目', 'deadlines')}, ${busy.length} ${L('個忙碌時段', 'busy times')}`)}">
          <span class="month__number">${dayNum(date)}</span>
          ${tasks.slice(0, 2).map((t) => `<span class="month__deadline">${esc(t.short)}</span>`).join('')}
          ${tasks.length > 2 ? `<span class="month__more">+${tasks.length - 2}</span>` : ''}
          ${busy.length ? `<span class="month__busy">${busy.length} ${L('項沒空', 'busy')}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <section class="month__agenda" aria-live="polite">
      <div class="month__toolbar"><h3>${esc(selected)}</h3><div class="month__nav">
        <a class="btn btn--sm" href="#/add-task?add=${selected}">${icon('plus')} ${L('新增任務', 'Add task')}</a>
        <button class="btn btn--sm" data-action="new-busy" data-date="${selected}">${icon('hatch')} ${L('新增忙碌時段', 'Add busy time')}</button>
      </div></div>
      ${deadlines.map((t) => `<a class="month__item" href="#/tasks/${t.id}">${icon('flag')} <b>${esc(t.title)}</b><span>${hm(t.due.min)} ${L('截止', 'due')}</span></a>`).join('')}
      ${rules.map((r) => `<a class="month__item" href="#/time">${icon('hatch')} <b>${esc(r.label)}</b><span>${hm(r.start)}–${hm(r.end)} · ${hoursText(r.end - r.start)}</span></a>`).join('')}
      ${!deadlines.length && !rules.length ? `<p class="muted">${L('這天沒有截止項目或忙碌時段。', 'No deadlines or busy times on this day.')}</p>` : ''}
    </section>
  </section>`;
}

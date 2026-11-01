// 本週：示範導覽、未來 7 日的具體時間表、「下一段」、遠方 deadline，以及 AI 助手。
import { esc, icon } from '../ui.js';
import { ui, canRun, getMode } from '../store.js';
import { unplannedSteps } from '../scheduler.js';
import { renderPlanner } from '../planner.js';
import { renderMargin } from './margin.js';
import { HERO } from '../scenarios.js';
import {
  windowDates, plannedTotal, nextBlock, pendingCount, pendingProposal,
  taskOf, stepOf, inkOf, taskStats, courseOf, overlay, guideState,
} from '../model.js';
import { md, span, hm, hShort, num, addDays, dayNum, wd, wk, mdNum, isWeekend, diffDays, hoursText } from '../time.js';
import { HORIZON_DAYS, WINDOW_DAYS } from '../demo-data.js';
import { L } from '../i18n.js';
import { renderMonth } from './month.js';

export const isMobile = () => window.innerWidth < 760;

export function render(s) {
  const dates = windowDates(s);
  if (!dates.includes(ui.day)) ui.day = s.today;
  const mobile = isMobile();
  return `
    <div class="week">
      <div class="week__main">
        ${getMode() === 'mine' ? mineBar(s) : guide(s)}
        <section class="sheet week__sheet" aria-label="${L('未來 7 日讀書計劃', 'Study plan for the next 7 days')}">
          ${head(s, dates)}
          ${ui.calendarView === 'month' ? renderMonth(s) : `
          ${nextBar(s)}
          ${mobile ? dayPicker(s, dates) : ''}
          ${renderPlanner(s, {
            dates: mobile ? [ui.day] : dates, mode: 'week', hlTask: ui.hlTask, showGaps: ui.showGaps,
            justInked: ui.justInked, colMin: mobile ? 240 : null,
          })}
          ${s.tasks.length ? horizon(s) : ''}`}
        </section>
        ${decisionBar(s)}
      </div>
      ${mobile ? '' : renderMargin(s)}
    </div>`;
}

/* ---------- 我的計劃：下一步該做甚麼 ---------- */
function mineBar(s) {
  const left = unplannedSteps(s);
  const pending = pendingProposal(s);
  let text;
  if (!s.tasks.length) text = L('先加入功課和 deadline，再標記沒空的時間，然後按「自動排程」。', 'Add your tasks and deadlines, mark when you are busy, then press "Auto-schedule".');
  else if (pending) text = L('自動排程的建議在下面，確認後才會生效。', 'The suggested schedule is below; it takes effect once you confirm.');
  else if (left.length) {
    const h = hoursText(left.reduce((a, x) => a + x.step.min, 0));
    text = L(`還有 ${left.length} 段未排（共 ${h}）。`, `${left.length} part${left.length === 1 ? '' : 's'} not scheduled yet (${h}).`);
  } else text = L('全部功課都已排好。', 'Everything is scheduled.');
  return `
    <section class="guide mine-bar" aria-label="${L('我的計劃', 'My plan')}">
      <div class="guide__head">
        <span class="guide__badge">${icon('calendar')} ${L('我的計劃', 'My plan')}</span>
        <b>${text}</b>
      </div>
      <div class="guide__acts">
        <a class="btn btn--sm ${s.tasks.length ? '' : 'btn--ink'}" href="#/tasks">${icon('plus')} ${L('新增功課', 'Add task')}</a>
        <a class="btn btn--sm" href="#/time">${icon('hatch')} ${L('沒空的時間', 'Busy times')}</a>
        ${s.tasks.length && left.length && !pending ? `<button class="btn btn--sm btn--ink" type="button" data-action="auto-plan">${icon('clock')} ${L('自動排程', 'Auto-schedule')}</button>` : ''}
      </div>
    </section>`;
}

/* ---------- 示範導覽 ---------- */
function guide(s) {
  const g = guideState(s);
  const doneCount = [g.s1, g.s2, g.s3].filter(Boolean).length;
  if (!ui.guideOpen) {
    return `
      <div class="guide guide--mini">
        <span class="guide__badge">${icon('play')} ${L('示範導覽', 'Try it')}</span>
        <span class="guide__mini-text">${doneCount === 3 ? L('3 步都完成了', 'All 3 steps done') : L(`3 步中已完成 ${doneCount} 步`, `${doneCount} of 3 steps done`)}</span>
        <button class="link-btn" type="button" data-action="guide-toggle">${L('展開', 'Show')}</button>
      </div>`;
  }
  if (doneCount === 3) {
    const kept = g.hero?.status === 'inked';
    return `
      <section class="guide is-done" aria-label="${L('示範導覽', 'Try it')}">
        <div class="guide__head">
          <span class="guide__badge">${icon('check')} ${L('示範完成', 'Done')}</span>
          <b>${L('你看過了：回報進度、臨時改動、時間不夠時怎樣取捨。', 'You have seen: reporting progress, last-minute changes, and trade-offs when time runs short.')}</b>
          <button class="link-btn" type="button" data-action="guide-toggle">${L('收起', 'Hide')}</button>
        </div>
        <p class="guide__done">${kept ? L('改動已確認，時間表上的實色時段就是新計劃。', 'The changes are confirmed; the solid sessions are your new plan.') : L('你選了不要這些改動，計劃維持原樣。', 'You discarded the changes, so the plan is unchanged.')}</p>
        <div class="guide__acts">
          <button class="btn btn--sm" type="button" data-action="reset">${icon('reset')} ${L('重設示範再試一次', 'Reset and try again')}</button>
          <a class="btn btn--sm btn--ink" href="#/week" data-action="leave-demo">${icon('play')} ${L('開始我的計劃', 'Start my own plan')}</a>
        </div>
      </section>`;
  }
  const current = !g.s1 ? 1 : !g.s2 ? 2 : 3;
  const st = (n, done) => (done ? 'is-done' : n === current ? 'is-current' : 'is-todo');
  const pending = pendingProposal(s);

  let act1 = '';
  if (current === 1) {
    act1 = g.asking
      ? `<button class="btn btn--sm" type="button" data-action="remain" data-min="30">${L('還差 30 分鐘', '30 min left')}</button><button class="btn btn--sm" type="button" data-action="remain" data-min="60">${L('還差 1 小時', '1 hour left')}</button>`
      : `<button class="btn btn--sm btn--ink" type="button" data-action="checkin" data-result="done">${icon('check')} ${L('完成了', 'Done')}</button><button class="btn btn--sm" type="button" data-action="checkin" data-result="partial">${L('還差一點', 'Not quite')}</button>`;
  }
  let act2 = '';
  if (current === 2) {
    if (pending) act2 = `<span class="guide__note">${L('先在下面確認或不要目前的 AI 建議', 'First confirm or discard the current suggestion below')}</span>`;
    else if (!canRun('hero')) act2 = `<button class="btn btn--sm" type="button" data-action="reset">${icon('reset')} ${L('重設示範再試', 'Reset demo')}</button>`;
    else act2 = `<button class="btn btn--sm btn--ink" type="button" data-action="guide-hero">${icon('send')} ${L('告訴 AI', 'Tell the AI')}</button>`;
  }
  const act3 = current === 3 ? `<button class="btn btn--sm btn--ink" type="button" data-action="guide-decide">${icon('arrow')} ${L('去選做法', 'Choose an option')}</button>` : '';

  return `
    <section class="guide" aria-label="${L('示範導覽', 'Try it')}">
      <div class="guide__head">
        <span class="guide__badge">${icon('play')} ${L('示範導覽', 'Try it')}</span>
        <b>${L('跟著做 3 步，看 AI 怎樣幫你調整計劃', 'Follow 3 steps to see how the AI adjusts your plan')}</b>
        <button class="link-btn" type="button" data-action="guide-toggle">${L('收起', 'Hide')}</button>
      </div>
      <ol class="guide__steps">
        <li class="gstep ${st(1, g.s1)}">
          <span class="gstep__n">${g.s1 ? icon('check') : '1'}</span>
          <div class="gstep__body"><b>${L('回報昨晚的進度', 'Report last night\'s progress')}</b><span>${L('昨晚 19:30–21:00 排了 PS4 題 1–4。時段結束不等於做完，所以要你說一聲。', 'Last night 19:30–21:00 was PS4 Q1–4. A session ending does not mean the work is done, so it asks you.')}</span></div>
          <div class="gstep__act">${act1}</div>
        </li>
        <li class="gstep ${st(2, g.s2)}">
          <span class="gstep__n">${g.s2 ? icon('check') : '2'}</span>
          <div class="gstep__body"><b>${L('臨時有事：告訴 AI「明天要全日幫家人搬屋」', 'Something came up: tell the AI "I have to help my family move all day tomorrow"')}</b><span>${L('AI 會用虛線標出它建議的改動；時間表在你確認前不會變。', 'The AI marks its suggested changes with dashes; the timetable does not change until you confirm.')}</span></div>
          <div class="gstep__act">${act2}</div>
        </li>
        <li class="gstep ${st(3, g.s3)}">
          <span class="gstep__n">${g.s3 ? icon('check') : '3'}</span>
          <div class="gstep__body"><b>${L('時間不夠：選一個做法，然後確認', 'Not enough time: pick an option, then confirm')}</b><span>${L('每個做法都寫明換來甚麼、代價是甚麼，由你決定。', 'Each option says what you gain and what it costs. You decide.')}</span></div>
          <div class="gstep__act">${act3}</div>
        </li>
      </ol>
    </section>`;
}

function head(s, dates) {
  const pc = pendingCount(s);
  const total = plannedTotal(s);
  const far = s.tasks.filter((t) => diffDays(s.today, t.due.date) <= HORIZON_DAYS).length;
  return `
    <header class="wk-head">
      <div>
        <h1 class="wk-title">${ui.calendarView === 'month' ? L('截止日期總覽', 'Deadlines at a glance') : `${md(dates[0])}<span class="wk-title__dash">—</span>${md(dates[dates.length - 1])}`}</h1>
        <p class="wk-sum">
          <span>${L(`已排 <b>${num(total / 60)}</b> 小時讀書`, `<b>${num(total / 60)}</b> h of study planned`)}</span>
          <span>${L(`${far} 個 deadline 在 20 日內`, `${far} deadline${far === 1 ? '' : 's'} within 20 days`)}</span>
          ${pc ? `<span class="is-alert">${L(`<b>${pc}</b> 項等你決定`, `<b>${pc}</b> waiting for you`)}</span>` : ''}
        </p>
      </div>
      <div class="wk-head__side">
        <div class="seg" role="group" aria-label="${L('日曆視圖', 'Calendar view')}">
          <button class="seg__opt" data-action="calendar-view" data-view="week" aria-pressed="${ui.calendarView === 'week'}">${L('週', 'Week')}</button>
          <button class="seg__opt" data-action="calendar-view" data-view="month" aria-pressed="${ui.calendarView === 'month'}">${L('月', 'Month')}</button>
        </div>
        <div class="legend" ${ui.calendarView === 'month' ? 'hidden' : ''} aria-label="${L('圖例', 'Legend')}">
          <span class="legend__item"><i class="sw sw--ink"></i>${L('實色：已確認', 'Solid: confirmed')}</span>
          <span class="legend__item"><i class="sw sw--pencil"></i>${L('虛線：AI 建議（未確認）', 'Dashed: suggested (not confirmed)')}</span>
          <span class="legend__item"><i class="sw sw--off"></i>${L('灰色：沒空', 'Gray: busy')}</span>
        </div>
        <div class="wk-tools" ${ui.calendarView === 'month' ? 'hidden' : ''}>
          <button class="btn btn--sm btn--ghost" type="button" data-action="toggle-gaps" aria-pressed="${ui.showGaps}">${icon('eye')} ${ui.showGaps ? L('隱藏空檔', 'Hide free time') : L('顯示空檔', 'Show free time')}</button>
          <a class="btn btn--sm btn--ghost" href="#/time">${icon('hatch')} ${L('改沒空的時間', 'Edit busy times')}</a>
        </div>
      </div>
    </header>`;
}

function nextBar(s) {
  const b = nextBlock(s);
  if (!b) return '';
  const task = taskOf(s, b.task);
  const { step } = stepOf(s, b.step);
  const moving = overlay(s).ghosts.has(b.id);
  const inMin = b.date === s.today ? b.start - s.now : null;
  const when = inMin == null
    ? L(`${mdNum(b.date)}（${wd(b.date)}）`, `${wd(b.date)} ${mdNum(b.date)}`)
    : inMin > 0
      ? (inMin < 60 ? L(`${inMin} 分鐘後`, `in ${inMin} min`) : L(`${num(Math.round(inMin / 6) / 10)} 小時後`, `in ${num(Math.round(inMin / 6) / 10)} h`))
      : L('進行中', 'now');
  const doing = step.progress === 'doing';
  const done = step.progress === 'done';
  return `
    <div class="wk-next">
      <span class="wk-next__label">${L('下一段', 'Next')}</span>
      <span class="wk-next__time">${span(b.start, b.end)}</span>
      <div class="wk-next__what" data-ink="${inkOf(s, task)}">
        <span class="dot"></span>
        <span class="wk-next__title">${esc(courseOf(s, task).name)} · ${esc(task.short)} ${esc(step.title)}</span>
        <span class="wk-next__why">${when} · ${L('共', '')} ${hoursText(b.end - b.start)}${moving ? L(' · AI 建議移走', ' · AI suggests moving it') : ''}</span>
      </div>
      <div class="wk-next__actions">
        ${done ? `<span class="chip chip--ok">${icon('check')} ${L('已完成', 'Done')}</span>` : doing
          ? `<button class="btn btn--sm" type="button" data-action="progress" data-step="${step.id}" data-p="done">${icon('check')} ${L('做完了', 'Finished')}</button>`
          : `<button class="btn btn--sm" type="button" data-action="progress" data-step="${step.id}" data-p="doing">${icon('play')} ${L('開始', 'Start')}</button>`}
        <button class="btn btn--sm btn--ghost" type="button" data-action="block" data-block="${b.id}">${L('詳情', 'Details')}</button>
      </div>
    </div>`;
}

function dayPicker(s, dates) {
  const ov = overlay(s);
  const changed = new Set([...ov.adds.map((b) => b.date), ...ov.rules.map((r) => r.date)]);
  for (const id of ov.ghosts.keys()) { const b = s.blocks.find((x) => x.id === id); if (b) changed.add(b.date); }
  return `
    <div class="daypick" role="group" aria-label="${L('選擇日子', 'Pick a day')}" style="padding:14px 14px 4px">
      ${dates.map((d) => {
        const dl = s.tasks.some((t) => t.due.date === d);
        const label = `${mdNum(d)} ${wk(d)}${changed.has(d) ? L('，有 AI 建議的改動', ', has suggested changes') : ''}${dl ? L('，有 deadline', ', has a deadline') : ''}`;
        return `<button class="daypick__btn ${d === s.today ? 'is-today' : ''} ${changed.has(d) ? 'has-change' : ''}" type="button" data-action="day" data-date="${d}" aria-pressed="${d === ui.day}" aria-label="${label}"><span>${d === s.today ? L('今天', 'Today') : wk(d)}</span><b>${dayNum(d)}</b>${dl ? '<i class="daypick__dot"></i>' : '<i></i>'}</button>`;
      }).join('')}
    </div>`;
}

/* ---------- 等你決定（窄螢幕時固定在底部） ---------- */
function decisionBar(s) {
  const p = pendingProposal(s);
  if (!p) return '';
  const hero = p.kind === 'hero';
  const n = p.changes.length;
  const options = hero ? HERO.options : [];
  const chosen = hero ? options.find((o) => o.id === p.option) : null;
  const title = hero
    ? L(`PS4 在截止前${p.missing ? '<b class="dbar__warn">差 1 小時</b>' : '<b class="dbar__ok">做得完</b>'}`, `PS4 before the deadline: ${p.missing ? '<b class="dbar__warn">1 hour short</b>' : '<b class="dbar__ok">fits</b>'}`)
    : p.kind === 'plan' ? L(`自動排程：${n} 段讀書時段`, `Auto-schedule: ${n} session${n === 1 ? '' : 's'}`)
    : p.kind === 'essay' ? L('Essay 大綱延到 11月16日', 'Essay outline moves to Nov 16') : L('加入題 1–4 餘下的時段', 'Add time for the rest of Q1–4');
  const opts = hero
    ? `<p class="dbar__step">① ${L('選一個做法', 'Pick an option')}</p>
       <div class="dbar__opts" role="group" aria-label="${L('選一個做法', 'Pick an option')}">
         ${options.map((o) => `<button class="dbar__opt" type="button" data-action="option" data-opt="${o.id}" aria-pressed="${p.option === o.id}">${icon(o.icon)} ${o.title}</button>`).join('')}
       </div>`
    : '';
  const hint = hero
    ? (chosen ? L(`② 已選「${chosen.title}」，共 ${n} 項改動`, `② "${chosen.title}": ${n} changes`) : L('選了做法，才可以確認', 'Pick an option before confirming'))
    : L(`共 ${n} 項改動，確認前時間表不會變`, `${n} change${n === 1 ? '' : 's'}; nothing changes until you confirm`);
  return `
    <div class="dbar" role="region" aria-label="${L('AI 建議，等你決定', 'Suggestion waiting for you')}">
      <div class="dbar__top">
        <span class="dbar__badge">${icon('pencil')} ${L('建議 · 未確認', 'Suggested · not confirmed')}</span>
        <span class="dbar__title">${title}</span>
        <a class="link-btn dbar__more" href="#/margin">${L('看詳情', 'Details')}</a>
      </div>
      ${opts}
      <div class="dbar__foot">
        <span class="dbar__hint">${hint}</span>
        <div class="dbar__btns">
          <button class="btn btn--sm btn--ghost" type="button" data-action="erase">${L('不要', 'Discard')}</button>
          <button class="btn btn--sm btn--ink" type="button" data-action="ink" ${hero && !p.option ? 'aria-disabled="true"' : ''}>${icon('check')} ${L('確認改動', 'Confirm')}</button>
        </div>
      </div>
    </div>`;
}

/* ---------- 遠方：每份功課一行 ---------- */
function horizon(s) {
  const days = HORIZON_DAYS;
  const ov = overlay(s);
  const axis = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(s.today, i);
    const first = i === 0 || dayNum(d) === 1;
    axis.push(`<span class="hz-day ${isWeekend(d) ? 'is-weekend' : ''} ${first ? 'is-month' : ''} ${i === 0 ? 'is-today' : ''}" style="--i:${i}">${first ? mdNum(d) : dayNum(d)}</span>`);
  }
  const rows = s.tasks
    .map((t) => ({ t, d: diffDays(s.today, t.due.date) + t.due.min / 1440 }))
    .filter((r) => r.d >= 0 && r.d <= days)
    .sort((a, b) => a.d - b.d)
    .map(({ t, d }) => {
      const st = taskStats(s, t);
      const meta = [st.planned ? L(`已排 ${hShort(st.planned)}`, `${hShort(st.planned)} planned`) : '', st.done ? L(`已做 ${hShort(st.done)}`, `${hShort(st.done)} done`) : ''].filter(Boolean).join(' · ') || L('下次排程再排', 'Next planning round');
      const defer = ov.defers.find((c) => s.blocks.find((b) => b.id === c.block)?.task === t.id);
      const mark = defer ? `<span class="hz-mark" style="--d:${diffDays(s.today, defer.toDate) + 0.5}">${icon('pencil')} ${L('大綱', 'Outline')} → ${mdNum(defer.toDate)}</span>` : '';
      return `
        <button class="hz-row" type="button" data-ink="${inkOf(s, t)}" data-action="hl-task" data-task="${t.id}" aria-pressed="${ui.hlTask === t.id}"
          aria-label="${esc(L(`${t.short}，${mdNum(t.due.date)} ${hm(t.due.min)} 截止，${meta}；按一下在時間表標示`, `${t.short}, due ${mdNum(t.due.date)} ${hm(t.due.min)}, ${meta}; press to highlight on the timetable`))}">
          <span class="hz-name"><span class="dot"></span>${esc(t.short)}</span>
          <span class="hz-track">
            <span class="hz-bar" style="--d:${d.toFixed(3)}"></span>
            ${mark}
            <span class="hz-due ${d / days > 0.7 ? 'is-left' : ''}" style="--d:${d.toFixed(3)}">${L(`${mdNum(t.due.date)}（${wd(t.due.date)}）`, `${wd(t.due.date)} ${mdNum(t.due.date)}`)}<small>${hm(t.due.min)}</small></span>
          </span>
          <span class="hz-meta">${meta}</span>
        </button>`;
    }).join('');
  return `
    <section class="horizon" aria-label="${L('較遠的 deadline', 'Later deadlines')}">
      <div class="horizon__head">
        <h3>${L('遠方', 'Further ahead')}</h3><button class="link-btn" data-action="calendar-view" data-view="month">${icon('calendar')} ${L('查看月曆', 'View calendar')}</button>
        <p>${L('7 日之後的 deadline，排程時一樣會考慮，較遠的功課可以提早開始。', 'Deadlines after these 7 days are still considered; later work can start early.')}${ui.hlTask ? ` <button class="link-btn" type="button" data-action="hl-task" data-task="">${L('取消標示', 'Clear highlight')}</button>` : L('按一行可在時間表標示該科時段。', ' Press a row to highlight its sessions.')}</p>
      </div>
      <div class="horizon__scroll">
        <div class="hz" style="--days:${days};--win:${WINDOW_DAYS}">
          <div class="hz-axis">
            <span></span>
            <span class="hz-track"><span class="hz-span hz-span--now">${L('這 7 日 · 具體時間表', 'These 7 days · timetable')}</span><span class="hz-span hz-span--later">${L('之後 · 只看 deadline', 'Later · deadlines only')}</span>${axis.join('')}</span>
            <span></span>
          </div>
          ${rows}
        </div>
      </div>
    </section>`;
}

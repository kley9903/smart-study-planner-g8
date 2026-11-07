// 本週：示範導覽、未來 7 日的具體時間表、「下一段」、接下來的 deadline。AI 助手在每頁右下角（views/dock.js）。
import { esc, icon } from '../ui.js';
import { ui, canRun, getMode, upcomingBlocks } from '../store.js';
import { renderPlanner } from '../planner.js';
import { HERO } from '../scenarios.js';
import {
  windowDates, nextBlock, pendingCount, pendingProposal,
  taskOf, stepOf, inkOf, taskStats, courseOf, overlay, guideState, unplannedSteps,
} from '../model.js';
import { cardOf } from '../plan-ai.js';
import { md, span, hm, hShort, num, addDays, dayNum, wd, wk, mdNum, isWeekend, diffDays, hoursText } from '../time.js';
import { HORIZON_DAYS, WINDOW_DAYS } from '../demo-data.js';
import { L } from '../i18n.js';
import { renderMonth } from './month.js';
import { busyHint, busySide } from './availability.js';

export const isMobile = () => window.innerWidth < 760;

export function render(s) {
  const dates = windowDates(s);
  if (!dates.includes(ui.day)) ui.day = s.today;
  const mobile = isMobile();
  // 改沒空的時間：同一張時間表變成可以塗灰，右邊的 AI 助手換成睡眠和沒空時間清單
  const editing = ui.editBusy && ui.calendarView !== 'month';
  return `
    <div class="week ${editing ? 'is-busy-edit' : ''}">
      <div class="week__main">
        <section class="sheet week__sheet" aria-label="${L('未來 7 日讀書計劃', 'Study plan for the next 7 days')}">
          ${head(s, dates, editing)}
          ${editing ? '' : planStrip(s)}
          ${ui.calendarView === 'month' ? renderMonth(s) : `
          ${editing ? busyHint() : nextBar(s)}
          ${mobile ? dayPicker(s, dates) : ''}
          ${renderPlanner(s, {
            dates: mobile ? [ui.day] : dates, mode: 'week',
            hlTask: editing ? null : ui.hlTask, hlRule: editing ? ui.hlRule : null, showGaps: !editing && ui.showGaps,
            justInked: ui.justInked, colMin: mobile ? 240 : null, extraClass: editing ? 'is-busy-edit is-painting' : '',
          })}
          ${!editing && s.tasks.length ? horizon(s) : ''}`}
        </section>
        ${getMode() === 'mine' || editing ? '' : guide(s)}
        ${decisionBar(s)}
      </div>
      ${editing ? busySide(s) : ''}
    </div>`;
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
    if (pending) act2 = `<span class="guide__note">${L('先在右下角確認或不要目前的 AI 建議', 'First confirm or discard the current suggestion (bottom right)')}</span>`;
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

// 這週的日期是頁頭的重點，月份兩邊都寫：11月6日 – 11月12日
function weekRange(a, b) {
  return `${md(a)}<span class="wk-title__dash">–</span>${md(b)}`;
}

function head(s, dates, editing) {
  const pc = pendingCount(s);
  // 自己的計劃：未排的段數、新增功課和自動排程都放在頁頭，不另開一列
  const mine = getMode() === 'mine';
  const left = mine ? unplannedSteps(s) : [];
  // 自動排程一直都在：還有未排的就排；全部排好了就變成「重新排程」，想反悔可以再選一次
  const canPlan = mine && !editing && s.tasks.length && !pendingProposal(s) && !ui.planning && !ui.planOptions;
  const month = ui.calendarView === 'month';
  const notes = [
    canPlan && left.length ? L(`${left.length} 段未排`, `${left.length} part${left.length === 1 ? '' : 's'} not scheduled`) : '',
    pc ? L(`${pc} 項等你決定`, `${pc} waiting for you`) : '',
  ].filter(Boolean);
  // 頁頭是一條工具列：日期不另外寫（下面的日子欄已經有），只留給螢幕閱讀器
  return `
    <header class="wk-head wk-bar${month ? ' is-month' : ''}">
      <h1 class="${month ? 'wk-title' : 'sr-only'}">${month ? L('截止日期總覽', 'Deadlines at a glance') : weekRange(dates[0], dates[dates.length - 1])}</h1>
      ${month ? '' : `<div class="wk-bar__tools">
        ${editing
          ? `<button class="wk-bar__btn is-on" type="button" data-action="busy-edit" data-on="0" aria-pressed="true">${icon('check')} ${L('完成', 'Done')}</button>`
          : `${mine ? `<a class="wk-bar__btn" href="#/add-task">${icon('plus')} ${L('新增功課', 'Add task')}</a>` : ''}
        ${canPlan ? `<button class="wk-bar__btn is-main" type="button" data-action="auto-plan">${icon('clock')} ${left.length ? L('自動排程', 'Auto-schedule') : L('重新排程', 'Replan')}</button>` : ''}
        ${canPlan && upcomingBlocks(s).length ? `<button class="wk-bar__btn" type="button" data-action="clear-plan">${icon('trash')} ${L('清空排程', 'Clear schedule')}</button>` : ''}
        <button class="wk-bar__btn" type="button" data-action="toggle-gaps" aria-pressed="${ui.showGaps}">${icon('eye')} ${L('空檔', 'Free time')}</button>
        <button class="wk-bar__btn" type="button" data-action="busy-edit" data-on="1" aria-pressed="false">${icon('hatch')} ${L('改沒空的時間', 'Edit busy times')}</button>`}
      </div>
      ${mine && !s.tasks.length
        ? `<p class="wk-bar__note">${L('先加入功課和 deadline，再按「自動排程」。', 'Add your tasks and deadlines, then press "Auto-schedule".')}</p>`
        : notes.length ? `<p class="wk-bar__note is-alert">${icon('info')} ${notes.join(' · ')}</p>` : ''}`}
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
          : `<button class="btn btn--sm" type="button" data-action="focus-block" data-block="${b.id}">${icon('play')} ${L('開始專注', 'Focus')}</button>`}
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

/* ---------- 接下來的 deadline：每份功課一行 ---------- */
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
    <section class="horizon" aria-label="Deadline">
      <div class="horizon__head">
        <h3>Deadline</h3>
        ${ui.hlTask ? `<button class="link-btn" type="button" data-action="hl-task" data-task="">${L('取消標示', 'Clear highlight')}</button>` : ''}
        <button class="link-btn horizon__cal" data-action="calendar-view" data-view="month">${icon('calendar')} ${L('查看月曆', 'View calendar')}</button>
      </div>
      <div class="horizon__scroll">
        <div class="hz" style="--days:${days};--win:${WINDOW_DAYS}">
          <div class="hz-axis">
            <span></span>
            <span class="hz-track">${axis.join('')}</span>
            <span></span>
          </div>
          ${rows}
        </div>
      </div>
    </section>`;
}

/**
 * 排程方案：按「自動排程」後，AI 給最多約 10 份方案，左右滑動；點一份，本週時間表用虛線預覽它，按確認才寫進讀書計劃。
 * 越左越安全（最緊一項的緩衝最大）；緩衝少於半日的標紅；取捨方案寫明代價。
 */
function planStrip(s) {
  // 一按下就出現：幾個閃動的空方塊，表示正在生成，不用等 AI 回來才有反應
  if (ui.planning) return `
    <section class="plans is-busy" aria-live="polite" aria-busy="true">
      <header class="plans__head"><h2 class="plans__thinking">${L('AI 正在想排法', 'The AI is working out ways to plan')}<span class="plans__dots" aria-hidden="true"><i></i><i></i><i></i></span></h2></header>
      <ol class="plans__row" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `
        <li><div class="plan-card plan-card--ghost" style="--i:${i}"><span class="ghost ghost--title"></span><span class="ghost ghost--week"></span><span class="ghost"></span><span class="ghost ghost--short"></span></div></li>`).join('')}
      </ol>
    </section>`;
  if (ui.planError) return `<section class="plans" role="status"><p class="plans__wait">${icon('alert')} ${esc(ui.planError)}</p><button class="btn btn--sm btn--ghost" type="button" data-action="plan-close">${L('關閉', 'Close')}</button></section>`;
  const opts = ui.planOptions;
  if (!opts) return '';
  const current = pendingProposal(s)?.option;
  const skipped = opts.skipped?.length ? `<p class="plans__note">${icon('info')} ${L(`${opts.skipped.length} 項沒有截止日期，這次不排`, `${opts.skipped.length} without a due date, not planned this time`)}</p>` : '';
  const short = opts.capacity && !opts.capacity.enough ? `<p class="plans__note is-alert">${icon('alert')} ${L('時間不夠：以下是取捨方案，每份寫明代價', 'Not enough time: these trade-off plans say what each one costs')}</p>` : '';
  const max = Math.max(60, ...opts.plans.flatMap((p) => cardOf(p, s).days));
  return `
    <section class="plans" aria-label="${L('排程方案', 'Plan options')}">
      <header class="plans__head">
        <h2>${L(`${opts.plans.length} 個排法，選一個`, `${opts.plans.length} ways to plan, pick one`)}</h2>
        <div class="plans__acts">
          <button class="btn btn--sm btn--ink" type="button" data-action="ink" ${current ? '' : 'disabled'}>${icon('check')} ${L('用這個', 'Use this one')}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-action="plan-close">${L('不要', 'Discard')}</button>
        </div>
      </header>
      ${short}${skipped}
      <ol class="plans__row">${opts.plans.map((p) => {
        const c = cardOf(p, s);
        return `<li><button class="plan-card ${c.id === current ? 'is-on' : ''} ${c.risky ? 'is-risky' : ''}" type="button" data-action="plan-pick" data-plan="${esc(c.id)}" aria-pressed="${c.id === current}">
          <span class="plan-card__title">${esc(c.title)}</span>
          <span class="plan-card__week" aria-hidden="true">${c.days.map((m) => `<i style="--h:${Math.round((m / max) * 100)}%"></i>`).join('')}</span>
          <span class="plan-card__line">${L('全部做完', 'All done')} <b>${esc(c.finish)}</b></span>
          ${c.tightest ? `<span class="plan-card__line plan-card__tight">${esc(c.tightest)}</span>` : ''}
          ${c.costsSleep ? `<span class="plan-card__line is-alert">${L('會少睡一些', 'Costs some sleep')}</span>` : ''}
          ${c.short.length ? `<span class="plan-card__line is-alert">${L('仍欠：', 'Still short: ')}${esc(c.short.join(', '))}</span>` : ''}
        </button></li>`;
      }).join('')}</ol>
    </section>`;
}

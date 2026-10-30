// 任務：每份功課／考試如何拆成步驟、預計時數、排在哪裡、做到哪裡。
import { esc, icon } from '../ui.js';
import { ui, getMode } from '../store.js';
import { taskOf, inkOf, courseOf, taskStats, stepState, windowDates } from '../model.js';
import { dayLabel, dayShort, span, hm, hShort, hoursText, diffDays, mdNum, wk } from '../time.js';
import { L } from '../i18n.js';

const KINDS = () => [['功課', 'Assignment'], ['考試', 'Exam'], ['測驗', 'Quiz'], ['報告', 'Report']].map(([zh, en]) => L(zh, en));

export function render(s, params) {
  const mine = getMode() === 'mine';
  const chosen = params[0] && taskOf(s, params[0]) ? params[0] : null;
  if (chosen) ui.taskId = chosen;
  const task = taskOf(s, ui.taskId) || s.tasks[0];
  const last = windowDates(s).at(-1);
  const groups = [
    { title: L('這 7 日內截止', 'Due in the next 7 days'), items: s.tasks.filter((t) => t.due.date <= last) },
    { title: L('7 日之後', 'After 7 days'), items: s.tasks.filter((t) => t.due.date > last && diffDays(s.today, t.due.date) <= 10) },
    { title: L('較遠', 'Later'), items: s.tasks.filter((t) => diffDays(s.today, t.due.date) > 10) },
  ].filter((g) => g.items.length);
  const head = mine
    ? `
    <div class="page-head">
      <div>
        <p class="eyebrow">${L('任務', 'Tasks')}</p>
        <h1 class="page-head__title">${L('功課與考試', 'Assignments and exams')}</h1>
        <p class="page-head__lede">${L('加入功課和 deadline；預計時數會拆成每段最多 2 小時，再到「本週」按「自動排程」。', 'Add tasks and deadlines. The estimate is split into parts of at most 2 hours; then press "Auto-schedule" on This week.')}</p>
      </div>
    </div>`
    : `
    <div class="page-head">
      <div>
        <p class="eyebrow">${L('任務', 'Tasks')}</p>
        <h1 class="page-head__title">${L('AI 把功課拆成做得到的步驟', 'The AI breaks work into doable steps')}</h1>
        <p class="page-head__lede">${L('每一步都有預計時數；AI 先估算，你確認或修改。進度由你回報，時段結束不會自動當作做完。', 'Each step has an estimate: the AI suggests one, you confirm or change it. You report progress; a session ending is not counted as done.')}</p>
      </div>
    </div>`;
  if (!task) return `${head}${taskForm(s)}`;
  return `
    ${head}
    ${mine ? taskForm(s) : ''}
    <div class="tasks ${chosen ? 'has-detail' : ''}">
      <nav class="tlist" aria-label="${L('任務清單', 'Task list')}">
        ${groups.map((g) => `
          <div class="tlist__group">
            <h3>${g.title}</h3>
            <div class="tlist__rows">${g.items.map((t) => row(s, t, t.id === task.id)).join('')}</div>
          </div>`).join('')}
      </nav>
      ${detail(s, task)}
    </div>`;
}

function taskForm(s) {
  return `
    <form class="sheet tform" data-form="task" aria-label="${L('新增功課', 'Add a task')}">
      <h2 class="tform__title">${icon('plus')} ${L('新增功課或考試', 'Add an assignment or exam')}</h2>
      <div class="tform__grid">
        <label class="field tform__wide"><span class="field__label">${L('名稱', 'Name')}</span><input class="input" name="title" required maxlength="40" placeholder="${L('例如：Problem Set 4', 'e.g. Problem Set 4')}"></label>
        <label class="field"><span class="field__label">${L('科目', 'Course')}</span><input class="input" name="course" maxlength="20" placeholder="${L('例如：統計學', 'e.g. Statistics')}" list="course-list"></label>
        <label class="field"><span class="field__label">${L('類型', 'Type')}</span><select class="select" name="kind">${KINDS().map((k) => `<option>${k}</option>`).join('')}</select></label>
        <label class="field"><span class="field__label">${L('截止日期', 'Due date')}</span><input class="input" type="date" name="date" required min="${s.today}"></label>
        <label class="field"><span class="field__label">${L('截止時間', 'Due time')}</span><input class="input" type="time" name="time" value="23:59" required></label>
        <label class="field"><span class="field__label">${L('預計要幾小時', 'Estimated hours')}</span><input class="input" type="number" name="hours" min="0.5" max="40" step="0.5" value="3" required></label>
      </div>
      <datalist id="course-list">${Object.values(s.courses).map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
      <div class="tform__foot"><button class="btn btn--ink" type="submit">${icon('plus')} ${L('加入', 'Add')}</button></div>
    </form>`;
}

function bar(s, t) {
  return `<span class="pbar">${t.steps.filter((x) => !x.dropped).map((st) => {
    const ss = stepState(s, st);
    const cls = ss === 'done' ? 'is-done' : ss === 'planned' || ss === 'doing' ? 'is-planned' : ss === 'later' ? 'is-later' : '';
    return `<i class="${cls}" style="--w:${st.min}"></i>`;
  }).join('')}</span>`;
}

function row(s, t, current) {
  const days = diffDays(s.today, t.due.date);
  const st = taskStats(s, t);
  const pencil = !t.estimateConfirmed;
  return `
    <a class="trow" href="#/tasks/${t.id}" data-ink="${inkOf(s, t)}" ${current ? 'aria-current="true"' : ''}>
      <span class="trow__bar"></span>
      <span>
        <span class="trow__title">${esc(t.short)}${pencil ? `<span class="chip chip--pencil" style="padding:0 7px;font-size:11.5px">${icon('pencil')}${L('待確認', 'To confirm')}</span>` : ''}</span>
        <span class="trow__meta">${esc(courseOf(s, t).name)} · ${esc(t.kind)} · ${L('共', '')} ${hShort(st.total)}${st.done ? ` · ${L('已完成', 'done')} ${hShort(st.done)}` : ''}</span>
        ${bar(s, t)}
      </span>
      <span class="trow__due ${days <= 1 ? 'is-soon' : ''}"><b>${mdNum(t.due.date)}</b>${wk(t.due.date)} ${hm(t.due.min)}</span>
    </a>`;
}

function detail(s, t) {
  const st = taskStats(s, t);
  const days = diffDays(s.today, t.due.date);
  const doc = t.source && s.docs.find((d) => d.id === t.source.doc);
  const confirmed = t.estimateConfirmed;
  const mine = getMode() === 'mine';
  const dueIn = days === 0 ? L('今天', 'today') : days === 1 ? L('明天', 'tomorrow') : days < 0 ? L('已過', 'past') : L(`還有 ${days} 日`, `in ${days} days`);
  return `
    <section class="sheet tdetail" data-ink="${inkOf(s, t)}" aria-label="${esc(t.short)}">
      <a class="btn btn--sm btn--ghost tback" href="#/tasks" style="margin:-6px 0 10px -8px">${icon('back')} ${L('全部任務', 'All tasks')}</a>
      <div class="td-head">
        <span class="course-tag"><span class="dot"></span>${esc(courseOf(s, t).name)} · ${esc(t.kind)}</span>
        <h1 class="td-title">${esc(t.title)}</h1>
        <div class="td-facts">
          <span class="chip ${days <= 1 ? 'chip--seal' : ''}">${icon('flag')} ${L(`${dayLabel(t.due.date)} ${hm(t.due.min)} 截止`, `Due ${dayLabel(t.due.date)} ${hm(t.due.min)}`)} · ${dueIn}</span>
          ${t.weight ? `<span class="chip">${esc(t.weight)}</span>` : ''}
          ${doc ? `<a class="chip" href="#/import" data-action="open-doc" data-doc="${t.source.doc}">${icon('file')} ${L(`出處：${esc(doc.name)} 第 ${t.source.page} 頁`, `Source: ${esc(doc.name)}, p.${t.source.page}`)}</a>` : ''}
          ${mine ? `<button class="chip" type="button" data-action="del-task" data-task="${t.id}">${icon('x')} ${L('刪除', 'Delete')}</button>` : ''}
        </div>
      </div>
      <div class="td-grid">
        <div>
          <h2 class="td-section-title">${icon('layers')} ${mine ? L(`分成 ${t.steps.length} 段`, `${t.steps.length} part${t.steps.length === 1 ? '' : 's'}`) : L(`AI 拆成 ${t.steps.length} 步`, `AI split it into ${t.steps.length} steps`)}</h2>
          <div class="route">${t.steps.map((step) => stepRow(s, t, step)).join('')}</div>
        </div>
        <aside class="td-aside">
          <div class="est-box" style="${confirmed ? '' : 'border:1.5px dashed var(--graphite-2);background:#fff'}">
            <span class="eyebrow">${L('預計所需時間', 'Estimated time')}</span>
            <div class="est-box__big">${hShort(st.total)}</div>
            <div class="est-box__who">${t.estimateBy === 'me' ? `${icon('nib')} ${L('你填的', 'Your estimate')}` : confirmed ? `${icon('nib')} ${L('AI 估算 · 你已確認', 'AI estimate · confirmed')}` : `${icon('pencil')} ${L('AI 估算 · 未確認', 'AI estimate · not confirmed')}`}</div>
            ${confirmed ? '' : `<div><button class="btn btn--sm btn--ink" type="button" data-action="confirm-est" data-task="${t.id}">${icon('check')} ${L('確認時數', 'Confirm estimate')}</button></div>`}
            <div class="mini-stats">
              <div class="mini-stat"><b>${hShort(st.done)}</b><span>${L('已完成', 'Done')}</span></div>
              <div class="mini-stat"><b>${hShort(st.planned)}</b><span>${L('這 7 日已排', 'Planned (7 days)')}</span></div>
              <div class="mini-stat"><b>${hShort(st.later)}</b><span>${L('之後再排', 'Later')}</span></div>
            </div>
          </div>
          ${t.aiNote ? `
          <div class="ai-note">
            <div class="ai-note__meta">${icon('pencil')} ${L('AI 的拆解理由 · 示範', 'Why the AI split it this way · demo')}</div>
            <p>${esc(t.aiNote)}</p>
          </div>` : ''}
          <p class="demo-note">${icon('info')} ${mine ? L('改了時數，到「本週」按「自動排程」安排還未排的部分。', 'After changing hours, press "Auto-schedule" on This week to place the unscheduled parts.') : L('改時數會在下次排程使用；示範版不會自動重排。', 'New estimates are used in the next planning round; the demo does not reschedule.')}</p>
        </aside>
      </div>
    </section>`;
}

function stepRow(s, t, step) {
  const ss = stepState(s, step);
  const blocks = s.blocks.filter((b) => b.step === step.id && !b.pencil).sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1));
  const past = s.history.filter((h) => h.step === step.id);
  const slots = [
    ...past.map((h) => `<span class="slot slot--past">${dayShort(h.date)} ${span(h.start, h.end)}${h.checkin === 'pending' ? L(' · 等你回報', ' · waiting for your report') : ''}</span>`),
    ...blocks.map((b) => `<button class="slot" type="button" data-action="locate" data-date="${b.date}" data-block="${b.id}">${icon('calendar')} ${dayShort(b.date)} ${span(b.start, b.end)}</button>`),
  ];
  if (step.later && ss !== 'done') slots.push(`<span class="slot slot--later">${icon('clock')} ${esc(step.later)}</span>`);
  if (step.dropped) slots.push(`<span class="slot slot--later">${icon('minus')} ${L('你選擇不做（簡化）', 'You chose to skip this (simplified)')}</span>`);
  const est = step.estBy === 'me' || t.estimateBy === 'me' ? L('你填的', 'your estimate') : step.estNote ? L(`已調整：${esc(step.estNote)}`, `adjusted: ${esc(step.estNote)}`) : L('AI 估算', 'AI estimate');
  const seg = step.dropped ? '' : `
    <div class="seg seg--sm" role="group" aria-label="${esc(step.title)}">
      ${[['todo', L('未開始', 'Not started')], ['doing', L('進行中', 'In progress')], ['done', L('已完成', 'Done')]].map(([k, label]) => `<button class="seg__opt" type="button" data-action="progress" data-step="${step.id}" data-p="${k}" aria-pressed="${step.progress === k}">${label}</button>`).join('')}
    </div>
    <div class="stepper" role="group" aria-label="${L('調整預計時數', 'Adjust estimate')}">
      <button type="button" data-action="adjust" data-step="${step.id}" data-delta="-30" aria-label="${L('減 30 分鐘', '30 minutes less')}">${icon('minus')}</button>
      <output>${hShort(step.min)}</output>
      <button type="button" data-action="adjust" data-step="${step.id}" data-delta="30" aria-label="${L('加 30 分鐘', '30 minutes more')}">${icon('plus')}</button>
    </div>`;
  return `
    <div class="rstep is-${ss}">
      <span class="rstep__node">${ss === 'done' ? icon('check') : ''}</span>
      <div class="rstep__top">
        <span class="rstep__title" style="${step.dropped ? 'text-decoration:line-through;color:var(--ink-3)' : ''}">${esc(step.title)}</span>
        <span class="rstep__hours">${hoursText(step.min)}</span>
        <span class="rstep__est">${est}${step.progress === 'doing' && step.remain ? L(` · 還差 ${hoursText(step.remain)}`, ` · ${hoursText(step.remain)} left`) : ''}</span>
      </div>
      <div class="rstep__slots">${slots.join('') || `<span class="slot slot--later">${L('未排', 'Not scheduled')}</span>`}</div>
      <div class="rstep__progress">${seg}</div>
    </div>`;
}

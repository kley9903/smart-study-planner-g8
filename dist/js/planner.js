// 時間格：本週（包括改沒空的時間）、首次使用都用這一個元件。
import { dayModel, overlay, gapsOf, taskOf, stepOf, inkOf, pendingProposal } from './model.js';
import { hm, span, dayNum, wk, md, isWeekend, hShort, addDays, toDate } from './time.js';
import { L } from './i18n.js';
import { esc, icon } from './ui.js';

const PPM = 0.72;
const seenPencil = new Set(); // AI 建議的時段只在第一次出現時淡入
export function forgetPencils() { seenPencil.clear(); }

export function plannerRange(s, models) {
  const start = Math.min(480, Math.floor((s.sleep.end - 30) / 30) * 30);
  let end = 1500;
  for (const m of models) {
    end = Math.max(end, Math.ceil((m.bedMin + 30) / 30) * 30);
    for (const b of m.blocks) end = Math.max(end, Math.ceil((b.end + 30) / 30) * 30);
  }
  return { start, end: Math.min(end, 1440 + s.sleep.end) };
}

export function renderPlanner(s, opts = {}) {
  const {
    dates, mode = 'week', hlTask = null, hlRule = null, showGaps = false, justInked = [],
    showBlocks = true, colMin = null, ppm = PPM, extraClass = '', fold = true,
    interactive = true, stagger = [],
  } = opts;
  const ov = overlay(s);
  const models = dates.map((d) => dayModel(s, d, ov));
  const { start, end } = plannerRange(s, models);
  const p = pendingProposal(s);
  const ctx = { s, start, end, mode, hlTask, hlRule, showGaps, justInked, showBlocks, proposal: p, interactive, stagger };

  const ticks = [];
  for (let m = Math.ceil(start / 60) * 60; m < end; m += 60) ticks.push(`<span class="tick" style="--m:${m}">${hm(m)}</span>`);
  const nowLabel = dates.includes(s.today) && s.now >= start && s.now <= end ? `<span class="gutter-now" style="--m:${s.now}">${hm(s.now)}</span>` : '';

  const foldBar = fold
    ? `<div class="planner__fold">${icon('moon')}<div class="planner__fold-text"><span>${L('睡眠', 'Sleep')} ${hm(s.sleep.start)}–${hm(s.sleep.end)} · ${L('每晚', 'nightly')}</span><span class="fold-extra muted">${L(`${hm(start)} 前的時間已收起`, `before ${hm(start)} hidden`)}</span>${mode === 'week' ? `<a class="link-btn fold-extra" href="#/time">${L('改睡眠時間', 'Change sleep')}</a>` : ''}</div></div>`
    : '';

  const style = [`--ppm:${ppm}`, `--p-start:${start}`, `--p-end:${end}`, `--cols:${dates.length}`, colMin ? `--col-min:${colMin}px` : ''].filter(Boolean).join(';');
  return `
  <div class="planner ${hlTask ? 'has-hl' : ''} ${showGaps ? '' : 'hide-gaps'} ${extraClass}" style="${style}" data-planner="${mode}">
    <div class="planner__scroll"><div class="planner__inner">
      <div class="planner__head">
        <div class="planner__corner">${L(`${toDate(dates[0]).getUTCMonth() + 1}月`, md(dates[0]).split(' ')[0])}</div>
        ${models.map((m, i) => dayHead(ctx, m, i === models.length - 1)).join('')}
      </div>
      ${foldBar}
      <div class="planner__body">
        <div class="planner__gutter">${ticks.join('')}${nowLabel}</div>
        ${models.map((m) => column(ctx, m)).join('')}
        <svg class="planner__arrows" aria-hidden="true"></svg>
      </div>
    </div></div>
  </div>`;
}

function dayHead(ctx, m, isLast) {
  const { s, mode, proposal } = ctx;
  const today = m.date === s.today;
  const flags = [];
  if (mode !== 'time') {
    for (const d of m.deadlines) flags.push(`<span class="dl-chip" title="${esc(L(`${d.task.short} 截止`, `${d.task.short} due`))}">${icon('flag')}${esc(d.task.short)} ${hm(d.min)}</span>`);
    if (proposal?.missing && taskOf(s, 'ps4').due.date === m.date) flags.push(`<span class="dl-chip dl-chip--short">${icon('alert')}${L('欠 1 小時', '1 h short')}</span>`);
    if (isLast) {
      const tomorrow = addDays(m.date, 1);
      for (const t of s.tasks.filter((x) => x.due.date === tomorrow)) flags.push(`<span class="dl-chip dl-chip--soft" title="${esc(L(`翌日 ${hm(t.due.min)} ${t.short}`, `Next day ${hm(t.due.min)} ${t.short}`))}">${icon('arrow')}${L('翌日', 'Next day:')} ${esc(t.short)}</span>`);
    }
  }
  return `
    <div class="dayhead ${today ? 'is-today' : ''} ${isWeekend(m.date) ? 'is-weekend' : ''}">
      <div class="dayhead__row">
        <span class="dayhead__num">${dayNum(m.date)}</span>
        <span class="dayhead__wd">${wk(m.date)}</span>
      </div>
      ${today ? `<span class="dayhead__today">${L('今天', 'Today')}</span>` : ''}
      ${mode === 'time' ? '' : `<div class="dayhead__flags">${flags.join('')}</div>`}
    </div>`;
}

function column(ctx, m) {
  const { s, start, end, mode, showGaps, showBlocks } = ctx;
  const parts = [];
  // 被「只限這天」整段蓋住的每週時段不再重畫，免得兩個標籤疊在一起
  const singles = m.hatches.filter((h) => h.kind === 'single');
  for (const h of m.hatches) {
    if (h.kind === 'weekly' && singles.some((x) => x.start <= h.start && x.end >= h.end)) continue;
    parts.push(hatchHtml(ctx, h));
  }
  if (showGaps && mode === 'week' && m.date >= s.today) {
    const from = m.date === s.today ? s.now : 0;
    for (const g of gapsOf(m, { from, minLen: 90 })) {
      if (g.end <= start || g.start >= end) continue;
      parts.push(`<div class="gap" style="--s:${g.start};--e:${g.end}"><span>${L('空檔', 'Free')} ${hShort(g.end - g.start)}</span></div>`);
    }
  }
  if (showBlocks) {
    const pencils = m.blocks.filter((b) => b.variant === 'pencil');
    for (const b of m.blocks) {
      // 新建議剛好放在被移走的位置時，只顯示新建議（舊的仍留一個看不見的位置，給箭嘴量度）
      const covered = b.variant === 'ghost' && pencils.some((x) => x.start < b.end && x.end > b.start);
      parts.push(blockHtml(ctx, b, covered));
    }
  }
  if (mode !== 'time') {
    for (const d of m.deadlines) {
      if (d.min < start || d.min > end) continue;
      parts.push(`<div class="dl-line" style="--m:${d.min}"><span>${esc(d.task.short)} ${L('截止', 'due')} ${hm(d.min)}</span></div>`);
    }
  }
  if (m.date === s.today && s.now >= start && s.now <= end) parts.push(`<div class="now-line" style="--m:${s.now}"></div>`);
  const cls = ['pcol', m.date === s.today ? 'is-today' : '', isWeekend(m.date) ? 'is-weekend' : ''].join(' ');
  return `<div class="${cls}" data-date="${m.date}">${parts.join('')}</div>`;
}

function hatchHtml(ctx, h) {
  const { start, end, hlRule } = ctx;
  const a = Math.max(h.start, start);
  const b = Math.min(h.end, end);
  if (b <= a) return '';
  // 睡眠在時間格頂部和底部只露出一小段，不重複標籤（上面的折疊列已說明）
  const tiny = b - a < 30 || (h.kind === 'sleep' && !h.pencil && b - a <= 60);
  const icn = h.kind === 'sleep' ? 'moon' : h.kind === 'single' ? 'pin' : h.rule?.src === 'syllabus' ? 'file' : 'repeat';
  const cls = ['hatch', `hatch--${h.kind}`, h.pencil ? 'is-pencil' : '', tiny ? 'is-tiny' : '', hlRule && h.rule?.id === hlRule ? 'is-hl' : ''].join(' ');
  const data = h.rule ? `data-rule="${h.rule.id}"` : h.sleepNight ? `data-sleep="${h.sleepNight}"` : 'data-sleep=""';
  const kindText = h.kind === 'sleep' ? L('睡眠', 'sleep') : h.kind === 'single' ? L('只限這天', 'this day only') : L('每週重複', 'weekly');
  const aria = `${h.pencil ? L('AI 建議（未確認）：', 'AI suggestion (not confirmed): ') : ''}${L('不可用時段：', 'Busy: ')}${h.label}, ${span(h.start, h.end)}, ${kindText}`;
  const label = `<span class="hatch__label">${icon(icn)}${h.pencil ? L('AI 建議：', 'AI suggests: ') : ''}${esc(h.label)}</span>`;
  if (!ctx.interactive) return `<div class="${cls}" style="--s:${a};--e:${b}" title="${esc(aria)}">${label}</div>`;
  return `<button type="button" class="${cls}" style="--s:${a};--e:${b}" ${data} data-action="hatch" aria-label="${esc(aria)}">${label}</button>`;
}

function blockHtml(ctx, b, covered = false) {
  const { s, hlTask, justInked } = ctx;
  const task = taskOf(s, b.task);
  const { step } = stepOf(s, b.step);
  if (!task || !step) return '';
  const style = `--s:${b.start};--e:${b.end}`;

  if (b.variant === 'ghost') {
    const word = b.ghostKind === 'remove' ? L('不做', 'Skip') : b.ghostKind === 'defer' ? L('延後', 'Later') : L('移走', 'Moved');
    if (covered) return `<div class="blk blk--ghost" data-block="${b.id}" style="${style};visibility:hidden" aria-hidden="true"></div>`;
    const attrs = ctx.interactive
      ? `type="button" data-action="block" data-block="${b.id}" aria-label="${esc(L(`AI 建議${word}：${task.short} ${step.title}`, `AI suggests ${word.toLowerCase()}: ${task.short} ${step.title}`))}"`
      : `data-block="${b.id}"`;
    const tag = ctx.interactive ? 'button' : 'div';
    return `<${tag} class="blk blk--ghost" data-ink="${inkOf(s, task)}" ${attrs} style="${style}"><span class="ghost-tag">${icon(b.ghostKind === 'remove' ? 'minus' : 'arrow')}${word}${L('：', ': ')}${esc(task.short)} ${esc(step.title)}</span></${tag}>`;
  }

  const dur = b.end - b.start;
  const cls = ['blk', `blk--${b.variant}`];
  if (dur <= 35) cls.push('is-short');
  if (b.variant === 'ink' && step.progress === 'done') cls.push('is-done');
  if (b.variant === 'ink' && step.progress === 'doing') cls.push('is-doing');
  if (hlTask === b.task) cls.push('is-hl');
  if (justInked.includes(b.id)) cls.push('just-inked');
  const pencilKey = `${b.id}@${b.date}/${b.start}`;
  if (b.variant === 'pencil' && !seenPencil.has(pencilKey)) { cls.push('is-new'); seenPencil.add(pencilKey); }
  const stateText = b.variant === 'pencil' ? L('AI 建議（未確認）', 'Suggested (not confirmed)') : L('已確認', 'Confirmed');
  const meta = b.variant === 'pencil'
    ? `<span class="blk__meta">${icon('pencil')}${span(b.start, b.end)}</span>`
    : `<span class="blk__meta">${span(b.start, b.end)}${step.progress === 'doing' ? L(' · 進行中', ' · in progress') : ''}</span>`;
  const badge = b.variant === 'ink' && step.progress === 'done' ? `<span class="blk__badge">${icon('check')}</span>` : '';
  let delay = '';
  if (justInked.includes(b.id)) delay = `animation-delay:${(justInked.indexOf(b.id) % 14) * 70}ms;`;
  else if (ctx.stagger.includes(b.id)) delay = `animation-delay:${ctx.stagger.indexOf(b.id) * 120}ms;`;
  const tag = ctx.interactive ? 'button' : 'div';
  const attrs = ctx.interactive
    ? `type="button" data-action="block" data-block="${b.id}" ${b.from ? `data-from="${b.from}"` : ''} aria-label="${esc(`${stateText}: ${task.short} ${step.title}, ${span(b.start, b.end)}`)}"`
    : `data-block="${b.id}" ${b.from ? `data-from="${b.from}"` : ''}`;
  return `
    <${tag} class="${cls.join(' ')}" data-ink="${inkOf(s, task)}" ${attrs} style="${style};${delay}">
      <span class="blk__title">${b.variant === 'pencil' ? '<span class="pencil-dot"></span> ' : ''}<span class="blk__step">${esc(task.short)}</span> ${esc(step.title)}</span>
      ${meta}${badge}
    </${tag}>`;
}

/** 只在點選某項改動時，畫一條由原位置指向新位置的箭嘴 */
export function drawArrows(root, onlyFrom) {
  root.querySelectorAll('.planner').forEach((pl, n) => {
    const svg = pl.querySelector('.planner__arrows');
    const body = pl.querySelector('.planner__body');
    if (!svg || !body) return;
    if (!onlyFrom) { svg.innerHTML = ''; return; }
    const br = body.getBoundingClientRect();
    const paths = [];
    pl.querySelectorAll(`.blk--pencil[data-from="${onlyFrom}"]`).forEach((to) => {
      const from = pl.querySelector(`.blk--ghost[data-block="${onlyFrom}"]`);
      if (!from) return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const ya = a.top - br.top + Math.min(a.height / 2, 16);
      const yb = b.top - br.top + Math.min(b.height / 2, 16);
      let x1;
      let x2;
      if (Math.abs(a.left - b.left) < 4) {
        x1 = a.right - br.left - 4;
        x2 = b.right - br.left - 4;
        const bulge = Math.max(x1, x2) + 34;
        paths.push(`<path d="M${x1},${ya} C${bulge},${ya} ${bulge},${yb} ${x2 + 4},${yb}" marker-end="url(#ah${n})"/>`);
        return;
      }
      if (b.left < a.left) { x1 = a.left - br.left + 2; x2 = b.right - br.left - 2; } else { x1 = a.right - br.left - 2; x2 = b.left - br.left + 2; }
      const dx = x2 - x1;
      paths.push(`<path d="M${x1},${ya} C${x1 + dx * 0.5},${ya} ${x2 - dx * 0.5},${yb} ${x2},${yb}" marker-end="url(#ah${n})"/>`);
    });
    svg.innerHTML = paths.length
      ? `<defs><marker id="ah${n}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah" d="M0,0 L10,5 L0,10 z"/></marker></defs>${paths.join('')}`
      : '';
  });
}

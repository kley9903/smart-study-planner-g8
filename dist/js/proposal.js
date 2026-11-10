// 建議裡的「改動」：每一種改動的全部行為都寫在這裡。
// 一種改動要答幾件事：確認前記下甚麼（annotate）、確認時怎樣改資料（apply）、
// 未確認時怎樣疊在時間表上（overlay）、建議卡那一行寫甚麼（describe）、
// 時間表上被改動的時段說甚麼（hint）。新增一種改動只改這個檔；scripts/check-proposal.mjs 會逐種檢查。
import { blockOf, stepOf } from './model.js';
import { span, dayShort, md, hm, hoursText } from './time.js';
import { L } from './i18n.js';
import { daysText } from './syllabus-ai.js';

const stepName = (s, stepId) => {
  const { task, step } = stepOf(s, stepId);
  return task ? `${task.short} · ${step.title}` : '';
};
const slots = (to) => to.map((t) => `${dayShort(t.date)} ${span(t.start, t.end)}`);

/* 每種改動：
 *   apply(state, c, deps)  確認：直接改 state；回傳要閃一下的時段 id（沒有就不回傳）
 *   overlay(o, c, b)       未確認：寫進 o（rules／ghosts／adds／sleep／defers）；b 是 c.block 指的現有時段
 *   describe(s, c)         建議卡一行：{ icon, tone?, title, text, detail?, target? }，全部是純文字
 *   hint(c)                時間表上原時段的一句話（只有會動到現有時段的改動才有）
 */
const KINDS = {
  hatch: {
    apply(state, c) { state.unavailable.push({ ...c.rule }); },
    overlay(o, c) { o.rules.push({ ...c.rule, pencil: true }); },
    describe(s, c) {
      const when = `${span(c.rule.start, c.rule.end)} "${c.rule.label}"`;
      if (c.rule.type === 'weekly') return { icon: 'pin', tone: 'hatch', title: L('新增每週沒空時間', 'New weekly busy time'), text: `${daysText(c.rule.days)} ${when}` };
      return { icon: 'pin', tone: 'hatch', title: L('新增沒空時間', 'New busy time'), text: `${dayShort(c.rule.date)} ${when}`,
        detail: `${L('只限這天', 'this day only')}${c.note ? `; ${c.note}` : ''}`, target: { date: c.rule.date, block: '' } };
    },
  },
  move: {
    apply(state, c) {
      const b = blockOf(state, c.block);
      Object.assign(b, c.to, { reason: c.reason || b.reason });
      return [b.id];
    },
    overlay(o, c, b) {
      if (!b) return;
      o.ghosts.set(b.id, 'move');
      o.adds.push({ ...b, ...c.to, id: `${b.id}~0`, from: b.id, reason: c.reason || b.reason, pencil: true });
    },
    describe(s, c) {
      const fit = c.short ? L(`（只放得下 ${hoursText(c.to.end - c.to.start)}）`, ` (only ${hoursText(c.to.end - c.to.start)} fits)`) : '';
      return { icon: 'arrow', title: L('移動', 'Move'), text: stepName(s, c.from.step),
        detail: `${dayShort(c.from.date)} ${hm(c.from.start)} → ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}${fit}`,
        target: { date: c.to.date, block: `${c.block}~0`, from: c.block } };
    },
    hint: (c) => L(`AI 建議移到 ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}。`, `The AI suggests moving it to ${dayShort(c.to.date)} ${span(c.to.start, c.to.end)}.`),
  },
  split: {
    apply(state, c) {
      const b = blockOf(state, c.block);
      state.blocks = state.blocks.filter((x) => x !== b);
      return c.to.map((to, i) => {
        const nb = { ...b, ...to, id: `${b.id}-${i + 1}`, reason: c.reason || b.reason };
        state.blocks.push(nb);
        return nb.id;
      });
    },
    overlay(o, c, b) {
      if (!b) return;
      o.ghosts.set(b.id, 'move');
      c.to.forEach((to, i) => o.adds.push({ ...b, ...to, id: `${b.id}~${i}`, from: b.id, reason: c.reason || b.reason, pencil: true }));
    },
    describe: (s, c) => ({ icon: 'scissors', title: L('分兩段做', 'Split in two'), text: stepName(s, c.from.step),
      detail: slots(c.to).join(L('、', ', ')), target: { date: c.to[0].date, block: `${c.block}~0`, from: c.block } }),
    hint: (c) => L(`AI 建議分兩段：${slots(c.to).join('、')}。`, `The AI suggests two sessions: ${slots(c.to).join(', ')}.`),
  },
  remove: {
    apply(state, c) {
      state.blocks = state.blocks.filter((x) => x.id !== c.block);
      if (c.step) stepOf(state, c.step).step.dropped = true;
    },
    // 重新排程換走的，顯示「移走」不是「不做」
    overlay(o, c, b) { if (b) o.ghosts.set(b.id, c.replaced ? 'move' : 'remove'); },
    describe: (s, c) => ({ icon: 'minus', tone: 'remove', title: L('不做', 'Skip'), text: stepName(s, c.from.step),
      detail: c.reason || '', target: { date: c.from.date, block: c.block } }),
    hint: () => L('AI 建議不做這一段（簡化）。', 'The AI suggests skipping this (simplified).'),
  },
  defer: {
    apply(state, c) {
      const b = blockOf(state, c.block);
      state.blocks = state.blocks.filter((x) => x !== b);
      const { step } = stepOf(state, b.step);
      step.later = L(`已延到 ${md(c.toDate)}，具體時間下次排程確認`, `Moved to ${md(c.toDate)}; exact time set in the next planning round`);
    },
    overlay(o, c, b) { if (b) { o.ghosts.set(b.id, 'defer'); o.defers.push(c); } },
    describe: (s, c) => ({ icon: 'arrow', title: L('移出這 7 日', 'Move out of these 7 days'), text: stepName(s, c.from.step),
      detail: `${dayShort(c.from.date)} ${hm(c.from.start)} → ${md(c.toDate)}${L('（下次排程再定時間）', ' (time set in the next round)')}`,
      target: { date: c.from.date, block: c.block } }),
    hint: (c) => L(`AI 建議移到 ${md(c.toDate)}，具體時間下次排程再定。`, `The AI suggests moving it to ${md(c.toDate)}; the exact time is set in the next round.`),
  },
  add: {
    apply(state, c) { state.blocks.push({ ...c.block }); return [c.block.id]; },
    overlay(o, c) { o.adds.push({ ...c.block, pencil: true }); },
    describe: (s, c) => ({ icon: 'plus', title: L('新增', 'Add'), text: stepName(s, c.block.step),
      detail: `${dayShort(c.block.date)} ${span(c.block.start, c.block.end)}`, target: { date: c.block.date, block: c.block.id } }),
  },
  sleep: {
    apply(state, c) { state.sleepOverrides.push({ night: c.night, start: c.start }); },
    overlay(o, c) { o.sleep.push({ night: c.night, start: c.start }); },
    describe: (s, c) => ({ icon: 'moon', tone: 'sleep', title: L('今晚遲睡', 'Later bedtime tonight'),
      text: `${L(`${md(c.night)}晚上`, `${md(c.night)}, night:`)} ${hm(s.sleep.start)} → ${hm(c.start)}`,
      detail: L('只限今晚；每晚的睡眠設定不變', 'tonight only; your usual sleep time stays the same'), target: { date: c.night, block: '' } }),
  },
  estimate: {
    annotate(state, c, out) { out.fromMin = stepOf(state, c.step).step.min; },
    apply(state, c) {
      const { step } = stepOf(state, c.step);
      step.min = c.min;
      step.estNote = c.note;
    },
    describe: (s, c) => ({ icon: 'clock', tone: 'est', title: L('改預計時數', 'New estimate'), text: stepName(s, c.step),
      detail: `${hoursText(c.fromMin)} → ${hoursText(c.min)} (${c.note})` }),
  },
  progress: {
    apply(state, c) {
      const { step } = stepOf(state, c.step);
      if (!step) return;
      step.progress = c.progress;
      if (c.progress === 'doing' && c.remain) step.remain = c.remain; else delete step.remain;
    },
    describe: (s, c) => ({ icon: 'check', title: c.progress === 'done' ? L('記下完成', 'Mark done') : L('記下進行中', 'Mark in progress'), text: stepName(s, c.step) }),
  },
  fill: {
    // 補課程資料的動作在 store（要重算該份文件），由 deps 傳進來
    apply(state, c, { fillItem }) { fillItem(c.doc, c.item, c.field, c.value); },
    describe: (s, c) => ({ icon: 'pencil', title: { date: L('補截止日期', 'Add due date'), scope: L('補要做甚麼', 'Add what to do'), hours: L('補要多久', 'Add how long') }[c.field], text: String(c.value ?? '') }),
  },
};

export const CHANGE_KINDS = Object.keys(KINDS);

/** 記下每項改動原本的位置和時數，確認後仍可顯示「由哪裡移到哪裡」。 */
export function annotate(state, changes) {
  return changes.map((c) => {
    const out = { ...c };
    if (typeof c.block === 'string') {
      const b = blockOf(state, c.block);
      if (b) out.from = { ...b };
    }
    KINDS[c.kind]?.annotate?.(state, c, out);
    return out;
  });
}

/** 確認一份建議的全部改動；回傳新放上去或移動過的時段 id。不認識的種類略過。 */
export function applyChanges(state, changes, deps = {}) {
  const inked = [];
  for (const c of changes) inked.push(...(KINDS[c.kind]?.apply(state, c, deps) || []));
  return inked;
}

/** 把未確認的改動疊到畫面上：哪些時段會移走、哪些是新建議的時段。 */
export function overlayChanges(s, changes) {
  const o = { rules: [], ghosts: new Map(), adds: [], sleep: [], defers: [] };
  for (const c of changes) {
    const b = c.block && typeof c.block === 'string' ? blockOf(s, c.block) : null;
    KINDS[c.kind]?.overlay?.(o, c, b);
  }
  return o;
}

/** 建議卡上一行的內容（純文字，由畫面負責跳脫和版型）；不認識的種類回傳 null。 */
export const describeChange = (s, c) => KINDS[c.kind]?.describe(s, c) ?? null;

/** 時間表上被改動的原時段要說的一句話；這種改動沒有就回傳 null。 */
export const changeHint = (c) => KINDS[c?.kind]?.hint?.(c) ?? null;

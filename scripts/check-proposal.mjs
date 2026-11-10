// Checks for dist/js/proposal.js: every kind of change can be annotated, shown on the timetable where it
// applies, described on the suggestion card, and applied. A new kind without a sample here fails.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { CHANGE_KINDS, annotate, applyChanges, overlayChanges, describeChange, changeHint } = await import('../dist/js/proposal.js');

const fresh = () => ({
  today: '2026-11-02', now: 600,
  tasks: [{ id: 't1', short: 'PS4', steps: [{ id: 's1', title: 'Q1-4', min: 120, progress: 'todo' }, { id: 's2', title: 'Q5-8', min: 60, progress: 'todo' }] }],
  blocks: [{ id: 'b1', task: 't1', step: 's1', date: '2026-11-03', start: 600, end: 720 }, { id: 'b2', task: 't1', step: 's2', date: '2026-11-04', start: 600, end: 660 }],
  unavailable: [], sleep: { start: 1410, end: 450 }, sleepOverrides: [],
});
const filled = [];
const deps = { fillItem: (...args) => filled.push(args) };

// One sample per kind: the change, what must be true after confirming, and what the timetable must show before.
const SAMPLES = {
  hatch: { change: { kind: 'hatch', rule: { id: 'u1', type: 'single', date: '2026-11-03', start: 840, end: 900, label: 'Dentist' } },
    after: (s) => s.unavailable.some((r) => r.id === 'u1'), overlay: (o) => o.rules[0]?.pencil === true },
  move: { change: { kind: 'move', block: 'b1', to: { date: '2026-11-05', start: 540, end: 660 } },
    after: (s) => s.blocks.find((b) => b.id === 'b1').date === '2026-11-05', overlay: (o) => o.ghosts.get('b1') === 'move' && o.adds[0].id === 'b1~0', inked: ['b1'], hint: true },
  split: { change: { kind: 'split', block: 'b1', to: [{ date: '2026-11-05', start: 540, end: 600 }, { date: '2026-11-06', start: 540, end: 600 }] },
    after: (s) => !s.blocks.some((b) => b.id === 'b1') && s.blocks.some((b) => b.id === 'b1-1') && s.blocks.some((b) => b.id === 'b1-2'),
    overlay: (o) => o.ghosts.get('b1') === 'move' && o.adds.length === 2, inked: ['b1-1', 'b1-2'], hint: true },
  remove: { change: { kind: 'remove', block: 'b2', step: 's2', reason: 'Simplified' },
    after: (s) => !s.blocks.some((b) => b.id === 'b2') && s.tasks[0].steps[1].dropped === true, overlay: (o) => o.ghosts.get('b2') === 'remove', hint: true },
  defer: { change: { kind: 'defer', block: 'b2', toDate: '2026-11-10' },
    after: (s) => !s.blocks.some((b) => b.id === 'b2') && !!s.tasks[0].steps[1].later, overlay: (o) => o.ghosts.get('b2') === 'defer' && o.defers.length === 1, hint: true },
  add: { change: { kind: 'add', block: { id: 'ai-1', task: 't1', step: 's2', date: '2026-11-05', start: 600, end: 660 } },
    after: (s) => s.blocks.some((b) => b.id === 'ai-1'), overlay: (o) => o.adds[0]?.id === 'ai-1' && o.adds[0].pencil, inked: ['ai-1'] },
  sleep: { change: { kind: 'sleep', night: '2026-11-03', start: 30 },
    after: (s) => s.sleepOverrides[0]?.start === 30, overlay: (o) => o.sleep[0]?.night === '2026-11-03' },
  estimate: { change: { kind: 'estimate', step: 's1', min: 90, note: 'Main steps only' },
    after: (s) => s.tasks[0].steps[0].min === 90, annotated: (c) => c.fromMin === 120 },
  progress: { change: { kind: 'progress', step: 's1', progress: 'done' }, after: (s) => s.tasks[0].steps[0].progress === 'done' },
  fill: { change: { kind: 'fill', doc: 'd1', item: 'i1', field: 'date', value: '2026-11-20' }, after: () => filled.at(-1)?.join() === 'd1,i1,date,2026-11-20' },
};

// 1. Every kind has a sample, and nothing else does.
assert.deepEqual(Object.keys(SAMPLES).sort(), [...CHANGE_KINDS].sort(), 'each kind of change has a sample in this check');

for (const kind of CHANGE_KINDS) {
  const sample = SAMPLES[kind];
  const state = fresh();
  // 2. Before confirming: what it was, how it shows on the timetable, and its line on the card.
  const [c] = annotate(state, [sample.change]);
  if (typeof sample.change.block === 'string') assert.equal(c.from.id, sample.change.block, `${kind}: remembers the session it changes`);
  if (sample.annotated) assert.ok(sample.annotated(c), `${kind}: remembers the old value`);
  const o = overlayChanges(state, [c]);
  if (sample.overlay) assert.ok(sample.overlay(o), `${kind}: shows on the timetable before it is confirmed`);
  else assert.deepEqual([o.rules.length, o.ghosts.size, o.adds.length, o.sleep.length, o.defers.length], [0, 0, 0, 0, 0], `${kind}: nothing to draw`);
  const d = describeChange(state, c);
  assert.ok(d && d.icon && d.title && typeof d.text === 'string' && d.text, `${kind}: has an icon, a title and what it is about`);
  assert.equal(!!changeHint(c), !!sample.hint, `${kind}: a hint only when it changes an existing session`);
  // 3. Confirming changes the plan as the sample says, and reports the sessions it placed.
  const before = JSON.stringify(state) + filled.length;
  const inked = applyChanges(state, [c], deps);
  assert.notEqual(JSON.stringify(state) + filled.length, before, `${kind}: confirming changes something`);
  assert.ok(sample.after(state), `${kind}: confirming does what the card said`);
  assert.deepEqual(inked, sample.inked || [], `${kind}: sessions to highlight`);
  // 4. Once confirmed, the line can still be written (the card stays in the thread).
  assert.ok(describeChange(state, c), `${kind}: still described after confirming`);
}

// 5. A swapped session reads as "moved away", not "skipped".
assert.equal(overlayChanges(fresh(), [{ kind: 'remove', block: 'b1', replaced: true }]).ghosts.get('b1'), 'move');

// 6. A kind this site does not know is left out everywhere and never breaks confirming the rest.
const odd = fresh();
assert.equal(describeChange(odd, { kind: 'teleport' }), null);
assert.equal(changeHint(undefined), null);
assert.deepEqual(applyChanges(odd, [{ kind: 'teleport' }, SAMPLES.add.change], deps), ['ai-1']);

// 7. Everything that makes changes only makes kinds this module knows.
const made = (file, pattern) => [...readFileSync(new URL(`../dist/js/${file}`, import.meta.url), 'utf8').matchAll(pattern)].map((m) => m[1]);
const sources = [...made('plan-ai.js', /changes\.push\(\{ kind: '(\w+)'/g), ...made('scenarios.js', /\{ kind: '(\w+)'/g)];
assert.ok(sources.length >= 10, 'found the places that make changes');
for (const kind of sources) assert.ok(CHANGE_KINDS.includes(kind), `"${kind}" is made but proposal.js does not know it`);

console.log('Passed: every kind of change is annotated, shown, described and applied; unknown kinds are left out.');

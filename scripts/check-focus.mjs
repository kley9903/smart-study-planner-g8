// Checks for the focus timer (番茄鐘): the timer itself (fake clock), starting it from a study session
// with that plan's rhythm, and recording actual time when a session ends.
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { createTimer, timeLeft, tick, pause, resume, stop, rhythmOf } = await import('../dist/js/focus.js');
const MIN = 60000;

/* ---------- the timer ---------- */
// 1. 25 + 5 by default; every 4th break is a long one (15).
let t = createTimer({}, 0);
assert.deepEqual([t.phase, t.round, timeLeft(t, 0)], ['work', 1, 25 * MIN]);
tick(t, 25 * MIN);
assert.deepEqual([t.phase, timeLeft(t, 25 * MIN)], ['break', 5 * MIN], 'work ends, a short break starts');
tick(t, 30 * MIN);
assert.deepEqual([t.phase, t.round], ['work', 2], 'the break ends, the next round starts');
for (let i = 0; i < 5; i++) tick(t, (30 + 30 * (i + 1)) * MIN);
assert.deepEqual([t.phase, t.round], ['break', 4]);
assert.equal(t.length, 15 * MIN, 'the fourth break is long');

// 2. Pausing stops the clock; time away from the page is counted by timestamps, not by ticks.
t = createTimer({ work: 50, brk: 10 }, 0);
pause(t, 10 * MIN);
assert.equal(timeLeft(t, 99 * MIN), 40 * MIN, 'paused: the time left does not move');
resume(t, 100 * MIN);
assert.equal(timeLeft(t, 120 * MIN), 20 * MIN);
tick(t, 200 * MIN);
assert.equal(t.phase, 'break', 'one long absence moves at most one phase, so the student sees the change');

// 3. Stopping tells how many minutes of work were done (breaks and pauses do not count).
t = createTimer({ work: 25, brk: 5 }, 0);
tick(t, 25 * MIN); tick(t, 30 * MIN);
assert.equal(stop(t, 40 * MIN), 35, '25 + 10 minutes of work');

// 4. The rhythm of a plan: a focus rhythm is used as it is; otherwise 25 + 5.
assert.deepEqual(rhythmOf({ work: 45, break: 15 }), { work: 45, brk: 15 });
assert.deepEqual(rhythmOf(30), { work: 25, brk: 5 });
assert.deepEqual(rhythmOf(null), { work: 25, brk: 5 });

/* ---------- from a study session, and recording actual time ---------- */
const store = await import('../dist/js/store.js');
const { proposalFrom } = await import('../dist/js/plan-ai.js');
store.enterMine();
const s = store.getState();
store.addTask({ title: 'Library quiz', course: 'LIBR', kind: 'Quiz', date: '2099-01-10', min: 1439, hours: 1 });
const task = s.tasks.at(-1);
const step = task.steps[0];

// 5. A confirmed plan remembers its rhythm on each session.
const prop = proposalFrom({ id: 'p1', knobs: { rest: { work: 45, break: 15 } }, changes: [{ kind: 'add', task: task.id, step: step.id, date: s.today, start: 600, end: 660, reason: { code: 'x' } }] }, s);
assert.deepEqual(prop.changes[0].block.rest, { work: 45, break: 15 });

// 6. Starting from a session: the timer uses its rhythm and knows the step; the step is in progress.
s.blocks.push({ ...prop.changes[0].block });
store.startFocus({ block: prop.changes[0].block.id }, 0);
assert.deepEqual([s.focus.step, s.focus.timer.work, step.progress], [step.id, 45, 'doing']);

// 7. Stopping asks whether it is done; the answer records the actual time and the progress.
store.stopFocus(50 * MIN);
assert.equal(s.focus.asking, true, 'asks "done?" before recording');
store.finishFocus('notdone');
assert.deepEqual([step.progress, step.remain], ['doing', undefined], '"not finished" asks nothing more; the whole step is planned again');
assert.deepEqual(s.actuals.at(-1), { task: task.id, step: step.id, kind: 'Quiz', min: 45, date: s.today }, '45 minutes of work (the break does not count)');
assert.equal(s.focus, null);
assert.equal(s.blocks[0].completed, true, 'reported work cannot be booked again against the updated remaining estimate');

// A long step may have many shorter sessions; finishing one session keeps the rest live.
{
  step.progress = 'doing'; step.remain = 120;
  const chunk = { id: 'split-session', task: task.id, step: step.id, date: s.today, start: 900, end: 970, work_min: 60 };
  s.blocks.push(chunk);
  store.startFocus({ block: chunk.id }, 0); store.stopFocus(50 * MIN);
  store.finishFocus('session');
  assert.deepEqual([step.progress, step.remain, chunk.completed], ['doing', 60, true], 'session completion deducts focused chunk only and keeps remaining work');
  store.startFocus({ block: chunk.id }, 0);
  assert.equal(s.focus, null, 'reported session cannot be credited a second time');
  const next = { ...chunk, id: 'split-next', completed: false };
  s.blocks.push(next);
  store.startFocus({ block: next.id }, 0); store.stopFocus(10 * MIN);
  store.finishFocus('done');
  assert.deepEqual([step.progress, step.remain], ['done', undefined], 'student can explicitly report the entire step done');
}

// 8. A free timer (not from a session) records nothing.
const before = s.actuals.length;
store.startFocus({}, 0);
store.stopFocus(25 * MIN);
assert.deepEqual([s.focus, s.actuals.length], [null, before], 'no session: no question, no record');

console.log('Passed: focus timer, plan rhythm, starting from a session, recording actual time.');

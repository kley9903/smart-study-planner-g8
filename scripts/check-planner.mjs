// Regression checks for calendar boundaries and edits to a confirmed plan.
import assert from 'node:assert/strict';
const memory = new Map();
// getState refreshes the clock; keep fixture deadlines in the future independently of the machine date.
const NativeDate = Date;
const fixtureNow = new NativeDate('2026-11-01T10:00:00').getTime();
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixtureNow])); }
  static now() { return fixtureNow; }
};
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
const { monthDates, shiftMonth } = await import('../dist/js/views/month.js');
const { enterMine, getState, addTask, updateTask, editTaskBasics, requestPlans, inkProposal, addTaskAttachment } = await import('../dist/js/store.js');

assert.equal(shiftMonth('2026-12-31', 1), '2027-01-01');
assert.equal(shiftMonth('2026-01-31', -1), '2025-12-01');
assert.ok(monthDates('2028-02-01').includes('2028-02-29'));
assert.equal(monthDates('2027-02-01').length, 28);
assert.equal(monthDates('2026-11-01').length, 42);
for (const date of ['2026-11-01', '2027-02-01', '2028-02-01']) {
  const dates = monthDates(date);
  assert.equal(new Date(`${dates[0]}T00:00:00Z`).getUTCDay(), 1);
  assert.equal(new Set(dates).size, dates.length);
}

enterMine();
const s = getState();
s.today = '2026-11-01'; s.now = 600;
addTask({ title: '<unsafe> report', course: 'Statistics', kind: 'Report', date: '2026-11-07', min: 1439, hours: 3, requirements: 'Original requirements' });
const task = s.tasks[0];
// getState refreshes the real clock, so set deterministic inputs just before planning.
s.today = '2026-11-01'; s.now = 600;
// The planning workflow is faked: it puts each step on 2 Nov, one after another.
globalThis.fetch = async (url, init) => {
  const t = JSON.parse(init.body).state.tasks[0];
  const changes = t.steps.map((x, i) => ({ kind: 'add', task: t.id, step: x.id, date: '2026-11-02', start: 600 + i * 120, end: 600 + i * 120 + x.min, reason: { code: 'earliest_before_due', due: t.due } }));
  return Response.json({ ok: true, result: { capacity: { enough: true }, skipped: [], plans: [{ id: 'p1', kind: 'normal', summary: { zh: '', en: '' }, short: [], stats: {}, changes }] } });
};
await requestPlans();
assert.equal(s.blocks.length, 0, 'Suggested sessions must not become confirmed automatically');
assert.equal(s.proposals[s.proposal].status, 'pending');
inkProposal();
assert.ok(s.blocks.length > 0);
const firstBlock = s.blocks[0];
const firstStep = task.steps.find((st) => st.id === firstBlock.step);
firstStep.progress = 'done';
s.history.push({ id: 'qa-history', step: firstStep.id, date: firstBlock.date, start: firstBlock.start, end: firstBlock.end, checkin: 'done' });
firstBlock.date = '2026-10-31';
const originalSteps = task.steps.map((st) => ({ id: st.id, title: st.title, min: st.min }));
const fields = { title: task.title, course: 'Statistics', kind: 'Report', date: task.due.date, min: task.due.min, requirements: 'Updated requirements' };
const before = s.blocks.length;
updateTask(task.id, fields, originalSteps);
assert.equal(s.blocks.length, before, 'A note edit must not remove scheduled sessions');
s.proposals['qa-pending'] = { status: 'pending', changes: [] };
s.proposal = 'qa-pending';
updateTask(task.id, { ...fields, date: '2026-11-03' }, [{ ...originalSteps[1], title: 'Revised step' }, { id: '', title: 'New step', min: 60 }]);
assert.ok(s.blocks.every((b) => b.date < s.today || (b.date === s.today && b.start <= s.now)));
assert.equal(s.history[0].step, firstStep.id);
assert.equal(task.steps.find((st) => st.id === firstStep.id).progress, 'done');
assert.equal(task.steps.find((st) => st.title === 'New step').progress, 'todo');
assert.equal(task.due.date, '2026-11-03');
assert.equal(s.proposal, null);
assert.equal(s.proposals['qa-pending'].status, 'erased');
const manualDone = task.steps.find((st) => st.title === 'New step');
manualDone.progress = 'done';
updateTask(task.id, { ...fields, date: task.due.date }, task.steps.filter((st) => !st.dropped && st.id !== manualDone.id).map((st) => ({ id: st.id, title: st.title, min: st.min })));
assert.equal(task.steps.find((st) => st.id === manualDone.id).progress, 'done');
assert.equal(task.steps.find((st) => st.id === manualDone.id).retired, true);
addTaskAttachment(task.id, { id: 'local-file', name: 'guidelines.txt', size: 10 });
assert.ok(JSON.parse(memory.get('ssp:mine')).tasks[0].attachments.some((f) => f.id === 'local-file'));
enterMine();
assert.equal(getState().tasks[0].requirements, 'Updated requirements');
assert.equal(getState().tasks[0].due.date, '2026-11-03');
// 科目卡上直接改一項：名稱和比重不動安排；改截止時間才清掉還沒開始的安排；名稱留空不保存
const t2 = getState().tasks[0];
const stepsBefore = JSON.stringify(t2.steps);
assert.equal(editTaskBasics(t2.id, { title: '  Renamed  ', date: t2.due.date, min: t2.due.min, weight: ' 25% ' }), true);
assert.equal(t2.title, 'Renamed');
assert.equal(t2.weight, '25%');
assert.equal(JSON.stringify(t2.steps), stepsBefore, 'Row edit must not touch steps');
assert.equal(editTaskBasics(t2.id, { title: '   ', date: t2.due.date, min: t2.due.min }), false);
assert.equal(t2.title, 'Renamed');
assert.equal(editTaskBasics(t2.id, { title: 'Renamed', date: '2026-11-20', min: 17 * 60 }), true);
assert.deepEqual(t2.due, { date: '2026-11-20', min: 1020 });
assert.equal(t2.weight, '');
assert.ok(getState().blocks.every((b) => b.task !== t2.id || b.date < getState().today || (b.date === getState().today && b.start <= getState().now)));
console.log('Passed: month boundaries, confirmation before scheduling, note-only edits, deadline/step invalidation, history preservation, saved task metadata and course-card row edits.');

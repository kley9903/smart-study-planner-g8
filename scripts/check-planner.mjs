// Regression checks for calendar boundaries and edits to a confirmed plan.
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
const { monthDates, shiftMonth } = await import('../dist/js/views/month.js');
const { enterMine, getState, addTask, updateTask, autoPlan, inkProposal, addTaskAttachment } = await import('../dist/js/store.js');

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
autoPlan();
assert.equal(s.blocks.length, 0, 'Suggested sessions must not become confirmed automatically');
assert.equal(s.proposals[s.proposal].status, 'pending');
assert.ok(s.thread.at(-1).html.includes('suggested'));
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
addTaskAttachment(task.id, { id: 'local-file', name: 'guidelines.txt', size: 10 });
assert.ok(JSON.parse(memory.get('ssp:mine')).tasks[0].attachments.some((f) => f.id === 'local-file'));
enterMine();
assert.equal(getState().tasks[0].requirements, 'Updated requirements');
assert.equal(getState().tasks[0].due.date, '2026-11-03');
console.log('Passed: month boundaries, confirmation before scheduling, note-only edits, deadline/step invalidation, history preservation and saved task metadata.');

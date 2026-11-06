// Checks for the Canvas calendar file (.ics, downloaded from the "Calendar Feed" link and read in the browser):
// folded lines, all-day due dates, UTC times turned into Hong Kong time, files that are not calendars, which events
// become items, and importing twice (confirmed or removed items do not come back). The calendar is made up in Canvas's shape.
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { parseFeed, readIcs, canvasFound, keyFromTitle } = await import('../dist/js/canvas.js');
const { getState, enterMine, addCanvasDocs, setItemState } = await import('../dist/js/store.js');

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:icalendar-ruby', 'X-WR-CALNAME:Student Calendar (Canvas)',
  'BEGIN:VEVENT', 'UID:event-assignment-1001', 'DTSTART;VALUE=DATE;VALUE=DATE:20261120',
  'DESCRIPTION:Submit the report\\, with the template.', 'SUMMARY:Lab Report 3 [COMP2711 (L1-L3', ' )]', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-assignment-1002', 'DTSTART;VALUE=DATE;VALUE=DATE:20261001',
  'SUMMARY:Old Homework [COMP2711 (L1-L3)]', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-calendar-event-2001', 'DTSTART:20261209T010000Z', 'DTEND:20261209T030000Z',
  'SUMMARY:Midterm Exam [LEGL1000 (L6)]', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-calendar-event-2002', 'DTSTART:20261121T160000Z', 'DTEND:20261121T170000Z',
  'SUMMARY:Career Talk [COMP4900 (T1-T3)]', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-assignment-1003', 'DTSTART;VALUE=DATE;VALUE=DATE:20261212',
  'SUMMARY:Module 1 Quiz [LEGL1000 (L6)]', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

/* ---------- reading the calendar ---------- */
const events = parseFeed(ICS);
assert.equal(events.length, 5);
assert.deepEqual(events[0], { kind: 'assignment', uid: 'event-assignment-1001', title: 'Lab Report 3', course: 'COMP2711', section: 'L1-L3', date: '2026-11-20', min: null, endDate: null, endMin: null },
  'a folded title is joined; an all-day due date has no time');
assert.deepEqual([events[2].kind, events[2].course, events[2].date, events[2].min, events[2].endMin], ['event', 'LEGL1000', '2026-12-09', 9 * 60, 11 * 60], 'UTC becomes Hong Kong time');
assert.deepEqual([events[3].date, events[3].min], ['2026-11-22', 0], 'Hong Kong time can be the next day');
assert.ok(!('description' in events[0]), 'descriptions are not passed on');

/* ---------- reading a downloaded .ics file ---------- */
assert.equal((await readIcs(new File([ICS], 'user_abc.ics', { type: 'text/calendar' }))).length, 5);
await assert.rejects(readIcs(new File(['<html>Canvas sign in</html>'], 'feed.ics')), { reason: 'not-calendar' }, 'a sign-in page saved as .ics is refused');
await assert.rejects(readIcs({ name: 'huge.ics', size: 6 * 1024 * 1024, text: async () => '' }), { reason: 'too-big' });

/* ---------- which events become items ---------- */
assert.deepEqual(['Midterm Exam', 'Final Exam', 'Module 1 Quiz', 'Final Project Presentation', 'Lab Report 3', 'Reading reflection'].map(keyFromTitle), ['exam', 'exam', 'quiz', 'presentation', 'lab', 'assignment']);
const groups = canvasFound(events, '2026-11-06');
assert.deepEqual(groups.map((g) => [g.course, g.items.map((i) => i.what)]), [['COMP2711', ['Lab Report 3']], ['LEGL1000', ['Midterm Exam', 'Module 1 Quiz']]],
  'past work and events that are not exams are left out; one group per course');
const lab = groups[0].items[0];
assert.deepEqual([lab.state, lab.plan.kind, lab.plan.date, lab.plan.min, lab.src], ['pencil', 'task', '2026-11-20', 1439, 'Canvas'], 'an all-day due date is due at 23:59');
assert.deepEqual([groups[1].items[0].key, groups[1].items[0].plan.min], ['exam', 540], 'an exam starts at its start time');

/* ---------- importing into your own plan ---------- */
enterMine();
assert.equal(addCanvasDocs(groups), 3);
let docs = getState().docs.filter((d) => d.source === 'canvas');
assert.deepEqual(docs.map((d) => [d.name, d.courseName, d.items.length]), [['Canvas · COMP2711', 'COMP2711', 1], ['Canvas · LEGL1000', 'LEGL1000', 2]]);
const legl = docs[1];
setItemState(legl.id, legl.items[0].id, 'ink');
setItemState(legl.id, legl.items[1].id, 'erased');
assert.ok(Object.values(getState().courses).some((c) => c.name === 'LEGL1000'), 'confirming an item makes the course');
assert.ok(getState().tasks.some((t) => t.title === 'Midterm Exam' && t.due.date === '2026-12-09'), 'and the task');
assert.equal(addCanvasDocs(canvasFound(events, '2026-11-06')), 1, 'importing again brings back only the item still waiting');
docs = getState().docs.filter((d) => d.source === 'canvas');
assert.equal(docs.length, 2, 'the same course reuses its Canvas source');
assert.deepEqual(docs[1].items.map((i) => [i.what, i.state]), [['Midterm Exam', 'ink'], ['Module 1 Quiz', 'erased']]);

console.log('Passed: reading Canvas calendar files, choosing items and importing twice.');

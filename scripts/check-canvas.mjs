// Checks for the Canvas calendar file (.ics, downloaded from the "Calendar Feed" link and read in the browser):
// folded lines, all-day due dates, UTC times turned into Hong Kong time, files that are not calendars, which events
// become items, and importing twice (confirmed or removed items do not come back). The calendar is made up in Canvas's shape.
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { parseFeed, readIcs, canvasFound, keyFromTitle, cleanTitle, canvasHours } = await import('../dist/js/canvas.js');
const { getState, enterMine, addCanvasDocs, deleteTask } = await import('../dist/js/store.js');

/* ---------- a date written in the title is dropped (the due date has its own field) ---------- */
assert.equal(cleanTitle('[2026.10.28] Submission: Basic HTML/CSS and Personal Website Building'), 'Submission: Basic HTML/CSS and Personal Website Building');
assert.equal(cleanTitle('Essay 1 (2026-11-20)'), 'Essay 1');
assert.equal(cleanTitle('Week [3] reading'), 'Week [3] reading', 'other brackets stay');
assert.equal(cleanTitle('[2026.10.28]'), '[2026.10.28]', 'a title that is only a date is kept');
assert.equal(parseFeed('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:event-assignment-7\r\nDTSTART;VALUE=DATE:20261106\r\nSUMMARY:[2026.10.28] Submission: Basic HTML [COMP4900 (T1-T3)]\r\nEND:VEVENT\r\nEND:VCALENDAR')[0].title, 'Submission: Basic HTML');

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
/* Canvas only gives a title: small weekly items get small default hours, marked as defaults. */
const hrs = (t) => canvasHours(t, keyFromTitle(t));
assert.deepEqual(['Intake Survey', 'Attendance Record Week 9', 'Reflection Report 2', 'Peer Evaluation', 'Module 1 Quiz', 'Homework 3', 'Lab Report 3'].map(hrs), [0.5, 0.5, 1, 1, 1, 2, 2]);
assert.deepEqual(['Final Project Presentation', 'Midterm Exam', 'Essay 2', 'Group Project Peer Evaluation'].map(hrs), [4, 8, 6, 1], 'big items keep the syllabus defaults');
assert.deepEqual([lab.plan.hours, lab.hoursDefault], [2, true]);

/* ---------- importing into your own plan: no confirming, straight into each course ---------- */
enterMine();
const names = () => Object.values(getState().courses).map((c) => c.name).sort();
const titles = () => getState().tasks.map((t) => `${getState().courses[t.course]?.name} ${t.title} ${t.due.date}`).sort();
assert.deepEqual(addCanvasDocs(groups), { courses: 2, added: 3, moved: 0 });
assert.deepEqual(names(), ['COMP2711', 'LEGL1000'], 'each Canvas course becomes its own course');
assert.deepEqual(titles(), ['COMP2711 Lab Report 3 2026-11-20', 'LEGL1000 Midterm Exam 2026-12-09', 'LEGL1000 Module 1 Quiz 2026-12-12'], 'every item is a task already');
assert.equal(getState().docs.flatMap((d) => d.items).filter((i) => i.state === 'pencil').length, 0, 'nothing waits to be confirmed');

// Delete a wrong one; Canvas moves another deadline; import again.
deleteTask(getState().tasks.find((t) => t.title === 'Module 1 Quiz').id);
const later = parseFeed(ICS.replace('DTSTART;VALUE=DATE;VALUE=DATE:20261120', 'DTSTART;VALUE=DATE;VALUE=DATE:20261127'));
assert.deepEqual(addCanvasDocs(canvasFound(later, '2026-11-06')), { courses: 1, added: 0, moved: 1 });
assert.deepEqual(titles(), ['COMP2711 Lab Report 3 2026-11-27', 'LEGL1000 Midterm Exam 2026-12-09'], 'a deleted task does not come back; a moved deadline follows Canvas');
assert.equal(getState().docs.filter((d) => d.source === 'canvas').length, 2, 'the same course reuses its Canvas source');

// Items left waiting by the earlier version are added on the next import.
const old = getState().docs.find((d) => d.courseName === 'COMP2711');
old.items.push({ ...canvasFound(parseFeed(ICS.replace('event-assignment-1001', 'event-assignment-1009').replace('Lab Report 3', 'Lab Report 4')), '2026-11-06')[0].items[0], id: 'left-over' });
assert.equal(old.items.at(-1).state, 'pencil');
const withNew = parseFeed(ICS.replace('event-assignment-1002', 'event-assignment-1009').replace('Old Homework', 'Lab Report 4').replace('20261001', '20261201'));
assert.equal(addCanvasDocs(canvasFound(withNew, '2026-11-06')).added, 1);
assert.ok(titles().includes('COMP2711 Lab Report 4 2026-12-01'));
assert.equal(old.items.filter((i) => i.uid === 'event-assignment-1009').length, 1, 'the waiting copy is replaced, not doubled');

console.log('Passed: reading Canvas calendar files, choosing items, adding them straight into courses and importing again.');

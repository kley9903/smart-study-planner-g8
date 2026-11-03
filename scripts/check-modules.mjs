// Checks for modules that run without a browser: the corner character's pose machine (fake clock and
// event sources), timetable popover content, busy-time range snapping, attachment size rules, and the
// syllabus AI path (Dify output → items to check → tasks and busy times, plus the server relay with a fake Dify).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { createMascot, TIMING } = await import('../dist/js/mascot.js');
const { blockPopover, hatchPopover, busyForm } = await import('../dist/js/views/popovers.js');
const { snap, paintRange } = await import('../dist/js/busy-paint.js');
const { keepFile, fits, LIMIT_MB } = await import('../dist/js/attachments.js');
const { getState, enterMine, addOwnDoc, setOwnItems, setItemState, inkAllItems, saveItem, setDocCourse, deleteCourse, setTaskGroup, partsOf, ui } = await import('../dist/js/store.js');
const { toItems, mergeFound, rowText, report, checklist, parseDays, parseWhen, readSyllabus } = await import('../dist/js/syllabus-ai.js');
const { setLang } = await import('../dist/js/i18n.js');
const { onRequestPost } = await import('../functions/api/syllabus.js');

/* ---------- corner character ---------- */
function fakeClock() {
  let t = 0, seq = 0;
  const due = new Map();
  return {
    now: () => t,
    set: (fn, ms) => { due.set(++seq, { at: t + ms, fn }); return seq; },
    clear: (id) => due.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, x] of due) if (x.at <= end && (!next || x.at < next[1].at)) next = [id, x];
        if (!next) break;
        due.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}
class FakeEl extends EventTarget {
  hidden = false;
  hovered = false;
  classList = Object.assign(new Set(), {
    contains(c) { return this.has(c); },
    remove(...cs) { cs.forEach((c) => this.delete(c)); },
    replace(a, b) { if (this.delete(a)) this.add(b); },
  });
  querySelector(sel) { return sel === '.dock__me:hover' && this.hovered ? this : null; }
  closest(sel) { return sel === '.dock__me' ? this : null; }
}
function setup({ reduced = false } = {}) {
  const el = new FakeEl();
  const win = new EventTarget(), doc = new EventTarget(), main = Object.assign(new EventTarget(), { matches: () => true });
  const clock = fakeClock();
  const mascot = createMascot(el, { win, doc, main, clock, random: () => 0, reducedMotion: () => reduced });
  const fire = (target, type) => target.dispatchEvent(new Event(type));
  const pose = () => ['is-dropping', 'is-rest', 'is-waking', 'is-yawning'].filter((c) => el.classList.has(c)).join(' ');
  mascot.shown({ hidden: false, open: false, bubble: '', navigated: true });
  return { el, win, doc, main, clock, mascot, fire, pose };
}

{
  const { el, win, doc, main, clock, mascot, fire, pose } = setup();
  fire(win, 'scroll');
  assert.equal(pose(), '', 'scrolling back to the top after a page change is not the user scrolling');
  clock.advance(TIMING.quietAfterNav + 1);
  fire(win, 'scroll');
  assert.equal(pose(), 'is-dropping');
  clock.advance(TIMING.drop - 1);
  assert.equal(pose(), 'is-dropping');
  clock.advance(1);
  assert.equal(pose(), 'is-rest');
  fire(doc, 'pointermove');
  assert.equal(pose(), 'is-rest', 'after scrolling she stays down until the pointer reaches her');

  clock.advance(TIMING.firstYawn);
  assert.equal(pose(), 'is-rest is-yawning', 'first yawn 20 s after lying down');
  clock.advance(TIMING.yawn);
  assert.equal(pose(), 'is-rest');
  clock.advance(TIMING.yawnGap[0] - 1);
  assert.equal(pose(), 'is-rest');
  clock.advance(1);
  assert.equal(pose(), 'is-rest is-yawning', 'next yawn after a 20–60 s gap');

  fire(el, 'pointerover');
  assert.equal(pose(), 'is-waking', 'hovering her wakes her and stops the yawn');
  clock.advance(TIMING.rise);
  assert.equal(pose(), '');

  fire(doc, 'pointermove');
  clock.advance(TIMING.idle - 1);
  assert.equal(pose(), '');
  clock.advance(1);
  assert.equal(pose(), 'is-dropping', '30 s without input');
  clock.advance(TIMING.drop);
  fire(doc, 'keydown');
  assert.equal(pose(), 'is-waking', 'any input wakes her from an idle rest');
  clock.advance(TIMING.rise);

  fire(main, 'focusin');
  clock.advance(TIMING.drop);
  assert.equal(pose(), 'is-rest', 'typing in a field');
  fire(el, 'pointerover');
  assert.equal(pose(), 'is-rest', 'hovering does not wake her while you type');
  fire(main, 'focusout');
  clock.advance(TIMING.typingWake - 1);
  assert.equal(pose(), 'is-rest');
  clock.advance(1);
  assert.equal(pose(), 'is-waking');
  clock.advance(TIMING.rise);

  el.hovered = true;
  fire(win, 'scroll');
  assert.equal(pose(), '', 'scrolling with the pointer over her does not make her drop (no twitching)');
  el.hovered = false;

  fire(win, 'scroll');
  clock.advance(TIMING.drop);
  mascot.shown({ hidden: false, open: false, bubble: 'b1' });
  assert.equal(pose(), 'is-waking', 'a new speech bubble wakes her');
  clock.advance(TIMING.rise);
  fire(win, 'scroll');
  clock.advance(TIMING.drop);
  mascot.shown({ hidden: false, open: false, bubble: 'b1' });
  assert.equal(pose(), 'is-rest', 'the same bubble again does not');

  mascot.shown({ hidden: false, open: true, bubble: 'b1' });
  assert.equal(pose(), 'is-waking', 'opening the panel wakes her');
  clock.advance(TIMING.rise);
  fire(win, 'scroll');
  assert.equal(pose(), '', 'no dropping while the panel is open');
  clock.advance(TIMING.firstYawn);
  assert.equal(pose(), 'is-yawning', 'she yawns while lying on the open panel');
  mascot.shown({ hidden: false, open: false, bubble: 'b1' });
  assert.equal(pose(), '', 'closing the panel stops the yawn');
}
{
  const { clock, mascot, pose } = setup({ reduced: true });
  mascot.shown({ hidden: false, open: true, bubble: '' });
  clock.advance(TIMING.firstYawn + 10);
  assert.equal(pose(), '', 'no yawn animation with reduced motion');
}

/* ---------- timetable popovers ---------- */
const s = getState();
const block = s.blocks[0];
assert.ok(blockPopover(s, block.id).includes('pop__title'));
assert.equal(blockPopover(s, 'missing'), '');
const rule = s.unavailable[0];
assert.ok(hatchPopover(s, { rule: rule.id }, true).includes('data-action="remove-rule"'), 'edit mode offers Remove');
assert.ok(hatchPopover(s, { rule: rule.id }, false).includes('data-action="busy-edit"'), 'otherwise it links to editing');
assert.ok(hatchPopover(s, { sleep: s.today }, false).includes('href="#/time"'), 'sleep links to changing sleep time');
assert.equal(hatchPopover(s, { rule: 'missing' }, false), '');
const form = busyForm('2026-11-05', 600);
assert.ok(form.includes('value="2026-11-05"') && form.includes('value="10:00"') && form.includes('value="11:00"'));

/* ---------- busy-time painting ---------- */
assert.equal(snap(89), 60);
assert.deepEqual(paintRange(120, 60), { start: 60, end: 150 }, 'dragging upwards still includes the slot under the pointer');
assert.deepEqual(paintRange(60, 90), { start: 60, end: 120 });

/* ---------- attachments ---------- */
const mb = 1024 * 1024;
assert.ok(fits({ size: LIMIT_MB.task * mb }, LIMIT_MB.task));
assert.ok(!fits({ size: LIMIT_MB.task * mb + 1 }, LIMIT_MB.task));
await assert.rejects(keepFile({ name: 'big.pdf', size: 11 * mb }, LIMIT_MB.task), { reason: 'too-big', maxMB: 10 });
await assert.rejects(keepFile({ name: 'ok.pdf', size: 1 }, LIMIT_MB.task), { reason: 'storage' }, 'no IndexedDB in node, so storing fails with reason "storage"');

/* ---------- course cards ---------- */
const { mark, groupOf } = await import('../dist/js/views/courses.js');
assert.deepEqual(['COMP1023', 'ENGG 1310', 'COMP2011H', 'MATH', '微積分', 'Calculus IB', 'Untitled course'].map(mark),
  ['1023', '1310', '2011', 'MATH', '微積', 'CIB', 'UC'], 'watermark: the course number, else a short code, the first two characters, or initials');
assert.deepEqual([
  { kind: '功課', title: 'Library quiz' }, { kind: '測驗', title: 'Lab 4' }, { kind: '', title: 'Quiz 2' },
  { kind: '其他', title: 'Midterm exam' }, { kind: '專題', title: 'Group project final report' }, { title: 'Final report' },
].map(groupOf), ['work', 'exam', 'exam', 'exam', 'work', 'work'], 'the type decides the group; the name only counts when there is no type');

/* ---------- syllabus AI ---------- */
// A real workflow output for a short sample syllabus; one fact was given page 2 to cover page sources.
const sample = JSON.parse(await readFile(new URL('./fixtures/dify-syllabus.json', import.meta.url), 'utf8'));
assert.deepEqual(parseDays('Monday and Wednesday 10:30-12:00'), [1, 3]);
assert.deepEqual(parseDays('每週二、四'), [2, 4]);
assert.deepEqual(parseDays('星期一和星期五'), [1, 5]);
assert.deepEqual(parseWhen({ kind: 'busy', days: [1], start: 0, end: 0 }, '每週二、四 09:30–11:20'), { kind: 'busy', days: [2, 4], start: 570, end: 680 });
assert.deepEqual(parseWhen({ kind: 'task', min: 1439 }, '2026-12-10'), { kind: 'task', date: '2026-12-10', min: 1439 });
assert.equal(parseWhen({ kind: 'task' }, 'next week'), null);

const found = toItems(sample);
assert.equal(found.course, 'COMP1010');
assert.equal(found.courseTitle, 'Introduction to Programming');
assert.equal(found.items.length, 5, 'only assignments, quizzes and exams: class times are not collected');
assert.ok(found.items.every((i) => i.key !== 'class'));
const [a1, midterm, proposal, , final] = found.items;
assert.deepEqual([a1.plan.date, a1.plan.min, a1.weight, rowText(a1).warn], ['2026-11-20', 1439, '15%', undefined]);
assert.equal(proposal.weight, '', 'the 30% belongs to the whole project, not to each of its two parts');
assert.equal(midterm.plan.min, 540, 'an exam without a time is set to 09:00 and says so');
assert.ok(rowText(midterm).warn.includes('09:00'));
assert.equal(rowText(midterm).src, 'p.2');
assert.equal(final.plan.date, null, 'TBA final exam cannot be scheduled');
assert.ok(rowText(final).warn.includes('TBA'), 'the reason from missing_information is shown on its row');
globalThis.document = { documentElement: {}, querySelectorAll: () => [] }; // setLang also relabels the page
setLang('zh');
assert.deepEqual([rowText(a1).type, rowText(a1).hours], ['功課', '6 小時'], 'labels follow the interface language');
setLang('en');
assert.deepEqual([rowText(a1).type], ['Assignment']);
delete globalThis.document;
assert.deepEqual(found.notes, [], 'missing information tied to a row, or to class times, is not repeated as a note');
assert.ok(found.items.every((i) => i.state === 'pencil'), 'nothing is confirmed automatically');
assert.equal(found.weightTotal, 100);
{
  // Notes from Dify are sorted by what they are about, so the report can group them.
  const dify = toItems({
    tasks: [], conflicts: ['Week 13 is listed twice'],
    missing_information: [{ path: '/assessment_components/0/weight_percent', reason: 'No weight published' }, { path: '/course/instructor', reason: 'No teacher' }],
    warnings: ['原文有「Quiz 10%」，但結果裡沒有 10% 的評核項目，請核對是否漏了。', '原文有「due 11/20」，但結果裡找不到 11/20 這個日期，請核對是否漏了截止日或考試。', 'Scanned file'],
  });
  assert.deepEqual(dify.notes.map((n) => n.kind), ['weight', 'other', 'check', 'weight', 'date', 'other']);

  // Several files added at once are read one by one and put together into one list to check.
  const fromSlides = { course: '', items: [{ ...final, id: 'x1' }, { ...a1, id: 'x2', weight: '' }], notes: [{ kind: 'other', text: 'Slides only' }], weightTotal: null };
  const fromNote = { course: 'COMP1010', courseTitle: 'Intro', items: [{ ...final, id: 'y1', plan: { ...final.plan, date: '2026-12-15', min: 540 }, flag: null }, { ...a1, id: 'y2', weight: '20%' }], notes: [], weightTotal: 100 };
  const merged = mergeFound([fromSlides, fromNote]);
  assert.deepEqual(merged.items.map((i) => [i.plan.title, i.plan.date, i.weight]), [['Final exam', '2026-12-15', final.weight], ['Assignment 1', '2026-11-20', '20%']], 'one row per item: the dated final wins, the missing weight is filled in');
  assert.deepEqual([merged.course, merged.courseTitle, merged.weightTotal, merged.notes.length], ['COMP1010', 'Intro', 100, 1]);
  assert.equal(new Set(merged.items.map((i) => i.id)).size, 2);
  assert.deepEqual(partsOf({ id: 'd', name: 'a.pdf', size: 3 }), [{ id: 'd', name: 'a.pdf', size: 3 }], 'older sources are one file with the source id');

  // The report lists only what needs checking, grouped; a repeated note is shown once with a count.
  const notes = [
    { kind: 'weight', text: 'No weight published' }, { kind: 'weight', text: 'No weight published' }, { kind: 'weight', text: 'No weight published' },
    { kind: 'check', text: 'Week 13 is listed twice' }, '原文有「25%」，但結果裡沒有 25% 的評核項目，請核對是否漏了。', 'Course name not published.',
  ];
  const groups = report({ items: found.items, notes, weightTotal: 90 });
  assert.deepEqual(groups.map((g) => [g.kind, g.label]), [['date', 'Dates to settle'], ['weight', 'Weights'], ['check', 'To confirm'], ['other', 'Other']], 'grouped in this order; nothing about what was found');
  const by = Object.fromEntries(groups.map((g) => [g.kind, g.lines]));
  assert.deepEqual(by.date.map((l) => l.text), ['Midterm exam', 'Group project proposal', 'Group project final report', 'Final exam'], 'items without a time or a date');
  assert.ok(by.date[0].hint.includes('09:00') && by.date.at(-1).hint.includes(final.raw), 'each says what is missing or what the syllabus wrote');
  assert.ok(by.weight[0].text.includes('90%'), 'weights that do not add up to 100% come first under weights');
  assert.equal(by.weight.find((l) => l.text === 'No weight published').times, 3, 'a repeated note is shown once with a count');
  assert.ok(by.weight.some((l) => l.text.startsWith('原文有「25%」')), 'old notes saved as plain text are still sorted: a coverage check about a percentage goes under weights');
  assert.deepEqual([by.check.map((l) => l.text), by.other.map((l) => l.text)], [['Week 13 is listed twice'], ['Course name not published.']]);
  assert.deepEqual(report({ items: [found.items[0]], notes: [], weightTotal: null }).map((g) => [g.kind, g.lines.map((l) => l.text)]), [['check', ['No exams or quizzes found']]]);
  assert.deepEqual(report({ items: [found.items[0], found.items[1]].map((i) => ({ ...i, flag: null })), notes: [], weightTotal: 100 }), [], 'nothing to check');
  assert.equal(checklist({ items: [], notes, weightTotal: null }).at(-1).text, '4 to check', 'the syllabus row counts a repeated note once');
  const rows = checklist({ items: found.items, notes: [], weightTotal: 100 });
  assert.deepEqual(rows.map((r) => r.state), ['ok', 'ok', 'ok', 'ok', 'warn', 'ok'], 'check window rows: read, work, exams, weights, dates (final TBA), syllabus');
  assert.deepEqual(rows.map((r) => r.stage), ['read', 'extract', 'extract', 'check', 'check', 'check']);
  assert.deepEqual(checklist({ items: [], notes: ['x'], weightTotal: null }).slice(1).map((r) => r.state), ['none', 'none', 'none', 'ok', 'warn']);
}

enterMine();
const mine = getState();
const tasksBefore = mine.tasks.length;
const coursesBefore = Object.keys(mine.courses).length;
const comp = () => Object.values(mine.courses).find((c) => c.name === 'COMP1010');

// A source with nothing useful in it does not leave an empty course behind.
addOwnDoc({ id: 'doc-0', name: 'notes.txt', size: 1 });
setOwnItems('doc-0', { course: 'COMP9999', items: [], notes: [] });
assert.equal(Object.keys(mine.courses).length, coursesBefore, 'no course card until something is confirmed');

addOwnDoc({ id: 'doc-1', name: 'comp1010.pdf', size: 1 });
setOwnItems('doc-1', found);
const doc = mine.docs.find((d) => d.id === 'doc-1');
assert.equal(doc.items.length, 5);
assert.equal(mine.tasks.length, tasksBefore, 'reading adds nothing by itself');
assert.equal(comp(), undefined, 'the course is created only when the first item is confirmed');
assert.equal(doc.courseName, 'COMP1010', 'the AI course code is suggested for this source');
setItemState('doc-1', doc.items[0].id, 'ink');
assert.deepEqual([comp().title, mine.tasks.at(-1).title, mine.tasks.at(-1).weight, mine.tasks.at(-1).course], ['Introduction to Programming', 'Assignment 1', '15%', comp().id], 'confirming creates the course with its full name; the task keeps its weight');
setItemState('doc-1', doc.items[1].id, 'erased');
saveItem('doc-1', doc.items[4].id, { when: '2026-12-15 14:00', hours: '10' });
const finalTask = mine.tasks.at(-1);
assert.deepEqual([finalTask.title, finalTask.due.date, finalTask.due.min, finalTask.steps.reduce((n, st) => n + st.min, 0)], ['Final exam', '2026-12-15', 840, 600], 'an edited date and hours become the task');
inkAllItems('doc-1');
assert.equal(mine.tasks.length, tasksBefore + 4, 'confirm all: the two pending dated tasks join assignment 1 and the edited final; the removed midterm does not');
inkAllItems('doc-1');
assert.equal(mine.tasks.length, tasksBefore + 4, 'confirming again does not add duplicates');
setOwnItems('doc-1', found);
assert.equal(doc.items.filter((i) => i.state === 'ink').length, 4, 'reading again keeps confirmed items');

// Adding more information to the same course later ("補充資訊"): only new items are added.
addOwnDoc({ id: 'doc-2', name: 'announcement.txt', size: 1 }, comp().id);
const lab = { ...found.items[0], id: 'task-9', what: 'Lab 2', plan: { ...found.items[0].plan, title: 'Lab 2', date: '2026-11-12' }, weight: '5%' };
setOwnItems('doc-2', { course: '', items: [found.items[0], lab], notes: [] });
const doc2 = mine.docs.find((d) => d.id === 'doc-2');
assert.equal(doc2.course, comp().id, 'information added from a course card stays with that course');
assert.deepEqual([doc2.items[0].match?.kind, doc2.items[1].match], ['same', null], 'an item the course already has (same date) is marked');
inkAllItems('doc-2');
assert.equal(mine.tasks.length, tasksBefore + 5, 'only Lab 2 is added; Assignment 1 is not added twice');
assert.equal(doc2.items[0].applied, 'dup');

// The course of a new source can be changed before anything is confirmed.
addOwnDoc({ id: 'doc-3', name: 'other.pdf', size: 1 });
setOwnItems('doc-3', { course: '', items: [{ ...lab, plan: { ...lab.plan, title: 'Essay 1' } }], notes: [] });
setDocCourse('doc-3', 'ENGL1001');
inkAllItems('doc-3');
assert.equal(mine.tasks.at(-1).course, Object.values(mine.courses).find((c) => c.name === 'ENGL1001').id);

// Another course's own TBA "Final exam" must stay untouched when MATH1001's final gets a date.
addOwnDoc({ id: 'doc-4', name: 'phys.pdf', size: 1 });
setOwnItems('doc-4', { course: 'PHYS1001', items: [{ ...found.items[4], id: 'p-final' }], notes: [] });
inkAllItems('doc-4');
const physFinal = mine.docs.find((d) => d.id === 'doc-4').items[0];

// Supplying a date announced later: "Final exam (TBA)" was confirmed without a date; a later
// announcement gives the date. It must become a task, not be dropped as a duplicate.
const finalTBA = found.items[4];
const finalOn = (date, min, flag = null) => ({ ...finalTBA, id: `f-${date}-${min}`, flag, reasons: [], raw: date, plan: { ...finalTBA.plan, date, min } });
addOwnDoc({ id: 'doc-5', name: 'math-syllabus.pdf', size: 1 });
setOwnItems('doc-5', { course: 'MATH1001', items: [finalTBA], notes: [] });
inkAllItems('doc-5');
const math = Object.values(mine.courses).find((c) => c.name === 'MATH1001');
const mathTasks = () => mine.tasks.filter((t) => t.course === math.id);
const undatedIn = () => mine.docs.filter((d) => d.course === math.id).flatMap((d) => d.items).filter((i) => i.state === 'ink' && !i.filled && i.applied !== 'dup' && !i.plan?.date);
assert.deepEqual([mathTasks().length, undatedIn().length], [0, 1], 'the TBA final is kept as a confirmed item without a date');

addOwnDoc({ id: 'doc-6', name: 'final-announced.txt', size: 1 }, math.id);
setOwnItems('doc-6', { course: '', items: [finalOn('2026-12-20', 540)], notes: [] });
const doc6 = mine.docs.find((d) => d.id === 'doc-6');
assert.equal(doc6.items[0].match?.kind, 'dated', 'a date for an item that had none is recognised as new information');
inkAllItems('doc-6');
assert.deepEqual(mathTasks().map((t) => [t.title, t.due.date, t.due.min]), [['Final exam', '2026-12-20', 540]], 'the announced date becomes a task');
assert.equal(undatedIn().length, 0, 'and the item no longer shows under "date not announced"');
assert.equal(physFinal.filled, undefined, "another course's TBA final is not touched");

// A changed date moves the task (and clears its unstarted sessions); a source without a time keeps the time.
const finalTask2 = mathTasks()[0];
mine.blocks.push({ id: 'b-future', task: finalTask2.id, step: finalTask2.steps[0].id, date: '2099-01-01', start: 600, end: 660 });
addOwnDoc({ id: 'doc-7', name: 'final-moved.txt', size: 1 }, math.id);
setOwnItems('doc-7', { course: '', items: [finalOn('2026-12-22', 840)], notes: [] });
const doc7 = mine.docs.find((d) => d.id === 'doc-7');
assert.deepEqual([doc7.items[0].match?.kind, doc7.items[0].match?.from], ['moved', { date: '2026-12-20', min: 540 }]);
inkAllItems('doc-7');
assert.deepEqual([mathTasks().length, finalTask2.due], [1, { date: '2026-12-22', min: 840 }], 'the existing task moves; no second task');
assert.equal(mine.blocks.some((b) => b.id === 'b-future'), false, 'unstarted sessions for the moved task are cleared');
assert.equal(doc7.items[0].applied, 'moved');
addOwnDoc({ id: 'doc-8', name: 'reminder.txt', size: 1 }, math.id);
setOwnItems('doc-8', { course: '', items: [finalOn('2026-12-22', 540, 'no-time'), { ...finalTBA, id: 'f-tba' }], notes: [] });
const doc8 = mine.docs.find((d) => d.id === 'doc-8');
assert.deepEqual(doc8.items.map((i) => i.match?.kind), ['same', 'same'], 'same date without a time, or no date at all, adds nothing new');
inkAllItems('doc-8');
assert.deepEqual([mathTasks().length, finalTask2.due.min], [1, 840], 'the real time is not replaced by a placeholder');

// Deleting a course removes its card, tasks, sessions and sources (also a source for it not confirmed yet); nothing else.
addOwnDoc({ id: 'doc-9', name: 'math-quiz.txt and 1 more', size: 2, parts: [{ id: 'f-a', name: 'math-quiz.txt', size: 1 }, { id: 'f-b', name: 'slides.pptx', size: 1 }] });
setOwnItems('doc-9', { course: 'MATH1001', items: [{ ...lab, id: 'm-quiz', plan: { ...lab.plan, title: 'Quiz 1' } }], notes: [] });
mine.blocks.push({ id: 'b-math', task: finalTask2.id, step: finalTask2.steps[0].id, date: '2099-01-02', start: 600, end: 660 });
finalTask2.attachments = [{ id: 'att-1', name: 'notes.pdf', size: 1 }];
const otherTasks = mine.tasks.filter((t) => t.course !== math.id).length;
ui.openCourse = math.id;
const files = deleteCourse(math.id);
assert.equal(mine.courses[math.id], undefined, 'the course card is gone');
assert.deepEqual([mathTasks().length, mine.tasks.length], [0, otherTasks], 'its tasks are deleted; other courses keep theirs');
assert.equal(mine.blocks.some((b) => b.id === 'b-math'), false, 'its sessions are deleted');
assert.deepEqual(mine.docs.filter((d) => ['doc-5', 'doc-6', 'doc-7', 'doc-8', 'doc-9'].includes(d.id)), [], 'its sources are removed, including one not confirmed yet');
assert.deepEqual(files.sort(), ['att-1', 'doc-5', 'doc-6', 'doc-7', 'doc-8', 'f-a', 'f-b'], 'stored files for the page to remove from the browser');
assert.equal(ui.openCourse, null);
assert.ok(mine.docs.some((d) => d.id === 'doc-4') && physFinal.state === 'ink', 'another course is untouched');
assert.deepEqual(deleteCourse('missing'), []);
assert.ok(!Object.values(mine.courses).some((c) => c.ink === math.ink), 'its colour is free again');
addOwnDoc({ id: 'doc-10', name: 'chem.pdf', size: 1 });
setOwnItems('doc-10', { course: 'CHEM1001', items: [{ ...lab, id: 'c-lab' }], notes: [] });
inkAllItems('doc-10');
{
  // Moving an item to the other group on the course card changes only its type.
  const t = mine.tasks.find((x) => x.title === 'Assignment 1');
  const before = JSON.stringify([t.due, t.steps, mine.blocks.length]);
  setTaskGroup(t.id, 'exam');
  assert.deepEqual([t.kind, groupOf(t)], ['Quiz', 'exam']);
  setTaskGroup(t.id, 'work');
  assert.deepEqual([t.kind, groupOf(t)], ['Assignment', 'work']);
  assert.equal(JSON.stringify([t.due, t.steps, mine.blocks.length]), before, 'date, estimate and sessions stay as they were');
  const exam = mine.tasks.find((x) => x.title === 'Final exam');
  setTaskGroup(exam.id, 'exam');
  assert.equal(exam.kind, 'Exam', 'an item named like an exam becomes an exam, not a quiz');
}
assert.equal(Object.values(mine.courses).find((c) => c.name === 'CHEM1001').ink, math.ink, 'a new course takes the freed colour instead of repeating one in use');

// Server relay with a fake Dify: uploads the file, runs the workflow in streaming mode, unwraps the output.
const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('event: ping\n\n'));
const node = (node_type) => ({ event: 'node_started', data: { node_type } });
const calls = [];
const fakeDify = async (url, init) => {
  calls.push({ url, init });
  if (url.endsWith('/files/upload')) return Response.json({ id: 'file-9' });
  return sse([{ event: 'workflow_started' }, node('start'), node('document-extractor'), node('llm'), node('code'), node('end'),
    { event: 'workflow_finished', data: { status: 'succeeded', outputs: { result: JSON.stringify({ valid: true, data: sample, errors: [] }) } } }]);
};
// The relay answers in NDJSON once the workflow starts: progress lines, then the result.
const lines = async (res) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
const post = (form, headers = {}) => new Request('https://planner.test/api/syllabus', { method: 'POST', body: form, headers });
const withFile = () => { const f = new FormData(); f.append('file', new File(['%PDF'], 'c.pdf', { type: 'application/pdf' })); return f; };
let res = await onRequestPost({ request: post(withFile()), env: { DIFY_API_KEY: 'k' }, fetcher: fakeDify });
assert.match(res.headers.get('Content-Type'), /ndjson/);
let all = await lines(res);
assert.deepEqual(all.slice(0, -1).map((l) => l.stage), ['read', 'extract', 'check', 'tidy'], 'each workflow step is reported once, in order');
assert.equal(all.at(-1).result.course.code, 'COMP1010');
assert.equal(calls[0].url, 'https://api.dify.ai/v1/files/upload');
assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
assert.deepEqual(JSON.parse(calls[1].init.body).inputs.document, { type: 'document', transfer_method: 'local_file', upload_file_id: 'file-9' });
assert.equal(JSON.parse(calls[1].init.body).response_mode, 'streaming');
// An image (screenshot or photo of a notice) goes to the workflow's image input; the OCR step still counts as reading.
calls.length = 0;
const ocrDify = async (url, init) => {
  calls.push({ url, init });
  if (url.endsWith('/files/upload')) return Response.json({ id: 'img-1' });
  return sse([{ event: 'workflow_started' }, node('start'), node('if-else'), { event: 'node_started', data: { node_type: 'llm', title: '圖片文字辨識' } }, node('llm'), node('code'), node('end'),
    { event: 'workflow_finished', data: { status: 'succeeded', outputs: { result: JSON.stringify({ valid: true, data: sample, errors: [] }) } } }]);
};
const withImage = (size = 4) => { const f = new FormData(); f.append('file', new File([new Uint8Array(size)], 'notice.png', { type: 'image/png' })); return f; };
res = await onRequestPost({ request: post(withImage()), env: { DIFY_API_KEY: 'k' }, fetcher: ocrDify });
all = await lines(res);
const imgInputs = JSON.parse(calls[1].init.body).inputs;
assert.deepEqual([imgInputs.image, imgInputs.document], [{ type: 'image', transfer_method: 'local_file', upload_file_id: 'img-1' }, undefined], 'an image goes to the image input, not document');
assert.deepEqual(all.slice(0, -1).map((l) => l.stage), ['read', 'extract', 'check', 'tidy'], 'reading the image is part of "read", not "extract"');
res = await onRequestPost({ request: post(withImage(11 * 1024 * 1024)), env: { DIFY_API_KEY: 'k' }, fetcher: ocrDify });
assert.equal(res.status, 413, 'images over 10 MB are refused');
res = await onRequestPost({ request: post(withFile()), env: {}, fetcher: fakeDify });
assert.deepEqual([res.status, (await res.json()).reason], [503, 'no-key']);
res = await onRequestPost({ request: post(withFile(), { Origin: 'https://evil.test' }), env: { DIFY_API_KEY: 'k' }, fetcher: fakeDify });
assert.equal(res.status, 403, 'other sites cannot use the relay from a browser');
res = await onRequestPost({ request: post(new FormData()), env: { DIFY_API_KEY: 'k' }, fetcher: fakeDify });
assert.equal(res.status, 400);
res = await onRequestPost({
  request: post(withFile()), env: { DIFY_API_KEY: 'k' },
  fetcher: async (url) => (url.endsWith('/files/upload') ? Response.json({ id: 'f' }) : sse([{ event: 'workflow_finished', data: { status: 'succeeded', outputs: { result: '{"valid": false, "data": null, "errors": ["not a syllabus"]}' } } }])),
});
assert.deepEqual((await lines(res)).at(-1), { ok: false, reason: 'invalid', message: 'not a syllabus' });

// The browser side passes the relay's reason through.
await assert.rejects(readSyllabus({ name: 'big.pdf', size: 16 * mb }), { reason: 'too-big' });
const relay = async (url, init) => onRequestPost({ request: new Request(`https://planner.test${url}`, init), env: {}, fetcher: fakeDify });
await assert.rejects(readSyllabus(new File(['x'], 'a.pdf'), { fetcher: relay }), { reason: 'no-key' });
const ok = async (url, init) => onRequestPost({ request: new Request(`https://planner.test${url}`, init), env: { DIFY_API_KEY: 'k' }, fetcher: fakeDify });
const seen = [];
assert.equal((await readSyllabus(new File(['x'], 'a.pdf'), { fetcher: ok, onStage: (st) => seen.push(st) })).course.code, 'COMP1010');
assert.deepEqual(seen, ['read', 'extract', 'check', 'tidy'], 'the page hears every step');
calls.length = 0;
await readSyllabus(new File(['COMP1010 lectures Mon 10:30-12:00'], 'pasted.txt', { type: 'text/plain' }), { fetcher: ok });
assert.equal(calls.length, 1, 'pasted text is sent as text, with no file upload');
assert.equal(JSON.parse(calls[0].init.body).inputs.text, 'COMP1010 lectures Mon 10:30-12:00');
calls.length = 0;
await readSyllabus(new File(['Lab 3 due Friday'], 'note.txt', { type: 'text/plain' }), { fetcher: ok, context: '這份資料屬於 COMP1010。' });
assert.equal(JSON.parse(calls[0].init.body).inputs.context, '這份資料屬於 COMP1010。', 'adding to a course tells the AI which course it is');

console.log('Passed: corner character poses, timetable popovers, busy-time ranges, attachment limits and the syllabus AI path.');

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
const { getState, enterMine, addOwnDoc, setOwnItems, setItemState, inkAllItems, saveItem, setDocCourse, deleteCourse, renameCourse, setTaskGroup, addCourseTask, deleteTask, partsOf, undatedOf, editUndated, deleteUndated, removeBlock, clearSchedule, upcomingBlocks, ui } = await import('../dist/js/store.js');
const { toItems, mergeFound, rowText, report, checklist, sourceLine, parseDays, parseWhen, readSyllabus } = await import('../dist/js/syllabus-ai.js');
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
  assert.deepEqual(dify.notes.map((n) => n.kind), ['weight', 'other', 'check', 'source', 'source', 'other']);

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
  // Items given a scope and a confident estimate, so only the date problems are left to report.
  const sure = (i) => ({ ...i, scope: 'x', confidence: 'high' });
  const groups = report({ items: found.items.map(sure), notes, weightTotal: 90 });
  assert.deepEqual(groups.map((g) => [g.kind, g.label]), [['fill', 'To fill in'], ['date', 'Dates to settle'], ['source', 'Against the syllabus'], ['weight', 'Weights'], ['check', 'To confirm'], ['other', 'Other']], 'grouped in this order; nothing about what was found');
  const by = Object.fromEntries(groups.map((g) => [g.kind, g.lines]));
  assert.deepEqual(by.fill.map((l) => [l.text, l.need]), [['Final exam', ['date']]], 'a missing due date is asked under "To fill in", not listed again under dates');
  assert.ok(by.fill[0].hint.includes(final.raw), 'and says what the syllabus wrote');
  assert.deepEqual(by.date.map((l) => l.text), ['Midterm exam', 'Group project proposal', 'Group project final report'], 'items without a time');
  assert.ok(by.date[0].hint.includes('09:00'), 'each says what time it was set to');
  assert.ok(by.weight[0].text.includes('90%'), 'weights that do not add up to 100% come first under weights');
  assert.equal(by.weight.find((l) => l.text === 'No weight published').times, 3, 'a repeated note is shown once with a count');
  assert.deepEqual(by.source.map((l) => [l.date, l.text]), [['25%', '25%']], 'old notes saved as plain text are still sorted: a coverage check goes under "against the syllabus", shown as the value and a short quote');
  assert.deepEqual([by.check.map((l) => l.text), by.other.map((l) => l.text)], [['Week 13 is listed twice'], ['Course name not published.']]);
  assert.deepEqual(report({ items: [sure(found.items[0])], notes: [], weightTotal: null }).map((g) => [g.kind, g.lines.map((l) => l.text)]), [['check', ['No exams or quizzes found']]]);
  assert.deepEqual(report({ items: [found.items[0], found.items[1]].map((i) => ({ ...sure(i), flag: null })), notes: [], weightTotal: 100 }), [], 'nothing to check');
  assert.equal(checklist({ items: [], notes: [...notes, notes[4]], weightTotal: null }).at(-1).text, '1 to check', 'the syllabus row counts only coverage checks, a repeated one once');
  const rows = checklist({ items: found.items, notes: [], weightTotal: 100 });
  assert.deepEqual(rows.map((r) => r.state), ['ok', 'ok', 'ok', 'ok', 'warn', 'ok'], 'check window rows: read, work, exams, weights, dates (final TBA), syllabus');
  assert.deepEqual(rows.map((r) => r.stage), ['read', 'extract', 'extract', 'check', 'check', 'check']);
  assert.deepEqual(checklist({ items: [], notes: ['x'], weightTotal: null }).slice(1).map((r) => r.state), ['none', 'none', 'none', 'ok', 'ok'], 'a note that is not a coverage check is not a syllabus mismatch');

  // A coverage check quoting a table row is shown as the date plus a short, clean quote: no empty cells, no half cell at the start.
  const tableNote = '原文有「…ces in HKUST (1) & (2) | | | 3 Sep 14 – Sep 18 | Module 2: Acade…」，但結果裡找不到 3 Sep 這個日期，請核對是否漏了截止日或考試。';
  assert.deepEqual(sourceLine(tableNote), { date: '3 Sep', text: '3 Sep 14 – Sep 18 · Module 2: Acade…' });
  const many = [tableNote, tableNote, '另外還有 7 處原文的比重或日期在結果裡找不到。'];
  const src = report({ items: [], notes: many, weightTotal: 100 }).find((g) => g.kind === 'source');
  assert.deepEqual([src.lines.length, src.n, src.lines[0].times], [2, 8, 2], '"7 more" counts as 7; a repeated note is shown once');
  assert.equal(checklist({ items: [], notes: many, weightTotal: 100 }).at(-1).text, '8 to check', 'the syllabus row and the report group give the same number');

  // An item that needs filling in and has no time says both on one line, not again under dates.
  const both = report({ items: [{ ...found.items[1], scope: '', confidence: 'high' }], notes: [], weightTotal: 100 });
  assert.deepEqual(both.map((g) => g.kind), ['fill'], 'the midterm is listed once');
  assert.ok(both[0].lines[0].hint.includes('09:00'), 'the missing time is on the same line');
}
{
  // The AI estimate comes from the course material, not from the type: a 10-question library quiz is 1 hour, not the 3-hour quiz default.
  const quiz = toItems({ tasks: [{
    title: 'Library quiz', type: 'quiz', due_date: '2026-11-18', due_time: '23:59', scope: '10 multiple-choice questions on library skills',
    estimate: { minutes: 60, confidence: 'high', basis: 'Syllabus: 10 MCQs, 2%' }, difficulty: 'easy',
    steps: [{ title: 'Read the library guide', minutes: 40 }, { title: 'Do the quiz', minutes: 20 }],
  }] }).items[0];
  assert.equal(quiz.plan.hours, 1, 'the AI estimate replaces the type default');
  assert.deepEqual([quiz.confidence, quiz.basis, quiz.difficulty, quiz.scope], ['high', 'Syllabus: 10 MCQs, 2%', 'easy', '10 multiple-choice questions on library skills']);
  assert.deepEqual(quiz.steps, [{ title: 'Read the library guide', min: 40 }, { title: 'Do the quiz', min: 20 }]);

  // Without an AI estimate the type default is only a placeholder: it never counts as a confident estimate.
  assert.equal(a1.confidence, 'low', 'an old output with no estimate is low confidence');
  const guessed = toItems({ tasks: [{ title: 'Quiz 2', type: 'quiz', due_date: '2026-11-25', estimate: { minutes: 90, confidence: 'sure' } }] }).items[0];
  assert.equal(guessed.confidence, 'low', 'anything other than "high" is low');
  assert.deepEqual(['easy', 'medium', 'mid', 'hard', 'weird'].map((d) => toItems({ tasks: [{ title: 'X', type: 'quiz', difficulty: d }] }).items[0].difficulty), ['easy', 'mid', 'mid', 'hard', null], 'difficulty is stored as the planner expects it: easy, mid or hard');

  // "To fill in" comes first: items missing what planning needs (a due date, what to do) or with a low-confidence estimate.
  const bare = toItems({ tasks: [{ title: 'Quiz 3', type: 'quiz', due_raw: 'TBA' }] }).items[0];
  const fill = report({ items: [quiz, guessed, bare], notes: [], weightTotal: 100 })[0];
  assert.deepEqual([fill.kind, fill.label], ['fill', 'To fill in']);
  assert.deepEqual(fill.lines.map((l) => [l.text, l.need]), [['Quiz 2', ['scope', 'hours']], ['Quiz 3', ['date', 'scope', 'hours']]], 'the complete library quiz is not asked about');
  assert.equal(report({ items: [quiz], notes: [{ kind: 'weight', text: 'No weight published' }], weightTotal: null })[0].later, true, 'weights can wait: that group is marked for later');
  assert.equal(fill.lines[0].item, guessed.id, 'each line points at its row so the page can open it for filling in');

  // The row shows why the AI chose those hours, how sure it is, how hard the task is, and what to do.
  const row = rowText(quiz);
  assert.deepEqual([row.hours, row.hoursNote, row.difficulty, row.scope, row.steps], ['1 hour', 'Syllabus: 10 MCQs, 2%', 'Easy', '10 multiple-choice questions on library skills', 2]);
  assert.equal(rowText(guessed).hoursNote, 'AI guess: check this', 'a low-confidence estimate says so');
  assert.equal(rowText(a1).hoursNote, 'default, change as needed', 'no estimate at all is still a default');

  // A real Dify output with the planning fields: the small quiz is 45 minutes, the name-only quiz is asked about, the essay has 4 steps.
  const real = toItems(JSON.parse(await readFile(new URL('./fixtures/dify-syllabus-estimates.json', import.meta.url), 'utf8'))).items;
  assert.deepEqual(real.map((i) => [i.what, i.plan.hours, i.confidence, i.difficulty, i.steps.length]), [['Library quiz', 0.75, 'high', 'easy', 1], ['Quiz 2', 1, 'low', 'mid', 1], ['Research essay', 10, 'high', 'hard', 4]]);
  assert.deepEqual(report({ items: real, notes: [], weightTotal: null })[0].lines.map((l) => [l.text, l.need]), [['Quiz 2', ['date', 'scope', 'hours']]], 'only the name-only quiz needs filling in');
  assert.equal(rowText(real[0]).hours, '45 min', 'less than an hour is shown in minutes, not "0.75 hours"');
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

// A confirmed item becomes a task with the AI's steps and difficulty, not "Part 1, Part 2" cut by the hour.
{
  const [libQuiz, essay] = toItems({ tasks: [
    { title: 'Library quiz', type: 'quiz', due_date: '2099-11-18', due_time: '23:59', scope: '10 MCQs', difficulty: 'easy',
      estimate: { minutes: 60, confidence: 'high', basis: '10 MCQs' }, steps: [{ title: 'Read the library guide', minutes: 40 }, { title: 'Do the quiz', minutes: 20 }] },
    { title: 'Essay 2', type: 'essay', due_date: '2099-11-30', scope: '1500 words', difficulty: 'hard',
      estimate: { minutes: 360, confidence: 'high' }, steps: [{ title: 'Outline', minutes: 120 }, { title: 'Draft', minutes: 240 }] },
  ] }).items;
  addOwnDoc({ id: 'doc-ai', name: 'lib.txt', size: 1 });
  setOwnItems('doc-ai', { course: 'LIB1000', items: [libQuiz, essay], notes: [] });
  const [libRow, essayRow] = mine.docs.find((d) => d.id === 'doc-ai').items; // setOwnItems gives rows new ids
  setItemState('doc-ai', libRow.id, 'ink');
  const t = mine.tasks.at(-1);
  assert.deepEqual(t.steps.map((st) => [st.title, st.min]), [['Read the library guide', 40], ['Do the quiz', 20]]);
  assert.equal(t.difficulty, 'easy');
  saveItem('doc-ai', essayRow.id, { when: '2099-11-30 23:59', hours: '3' });
  const e = mine.tasks.at(-1);
  assert.equal(e.steps.reduce((n, st) => n + st.min, 0), 180, 'hours the student changed win over the AI steps');
  assert.equal(e.difficulty, 'hard');

  // Filling in "what to do" from the edit row saves it on the item, so it is no longer asked.
  setOwnItems('doc-ai', { course: '', items: toItems({ tasks: [{ title: 'Quiz 3', type: 'quiz', due_raw: 'TBA' }] }).items, notes: [] });
  const q3 = mine.docs.find((d) => d.id === 'doc-ai').items.at(-1);
  saveItem('doc-ai', q3.id, { when: '2099-12-01 10:00', hours: '1', scope: 'Chapters 4–5' });
  assert.equal(q3.scope, 'Chapters 4–5');
  assert.equal(mine.tasks.at(-1).requirements, 'Chapters 4–5', 'what to do is kept on the task');
}
addOwnDoc({ id: 'doc-8', name: 'reminder.txt', size: 1 }, math.id);
setOwnItems('doc-8', { course: '', items: [finalOn('2026-12-22', 540, 'no-time'), { ...finalTBA, id: 'f-tba' }], notes: [] });
const doc8 = mine.docs.find((d) => d.id === 'doc-8');
assert.deepEqual(doc8.items.map((i) => i.match?.kind), ['same', 'same'], 'same date without a time, or no date at all, adds nothing new');
inkAllItems('doc-8');
assert.deepEqual([mathTasks().length, finalTask2.due.min], [1, 840], 'the real time is not replaced by a placeholder');

// Deleting a course removes its card, tasks, sessions and sources (also a source for it not confirmed yet); nothing else.
addOwnDoc({ id: 'doc-9', name: 'math-quiz.txt and 1 more', size: 2, parts: [{ id: 'f-a', name: 'math-quiz.txt', size: 1 }, { id: 'f-b', name: 'slides.pptx', size: 1 }] });
setOwnItems('doc-9', { course: 'MATH1001', items: [{ ...lab, id: 'm-quiz', plan: { ...lab.plan, title: 'Quiz 1' } }], notes: [] });
// Renaming a course keeps its id, tasks and colour; a source still waiting under the old code follows it.
{
  const ink = math.ink;
  const taskCount = mathTasks().length;
  assert.equal(renameCourse(math.id, 'PHYS1001'), false, 'cannot take another course\'s code');
  assert.equal(renameCourse(math.id, '   '), false, 'the code cannot be empty');
  assert.equal(math.name, 'MATH1001');
  assert.equal(renameCourse(math.id, ' MATH1010 ', ' Calculus I '), true);
  assert.deepEqual([math.name, math.title, math.ink, mathTasks().length], ['MATH1010', 'Calculus I', ink, taskCount]);
  assert.equal(mine.docs.find((d) => d.id === 'doc-9').courseName, 'MATH1010', 'an unconfirmed source written for the old code follows');
  assert.equal(mine.docs.find((d) => d.id === 'doc-7').courseName, 'MATH1010');
  renameCourse(math.id, 'MATH1010', '');
  assert.equal('title' in math, false, 'an empty full name removes it');
  assert.equal(renameCourse('missing', 'X'), false);
}
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
{
  // Adding and deleting an item straight on the course card.
  const chem = Object.values(mine.courses).find((c) => c.name === 'CHEM1001');
  const n = mine.tasks.length;
  assert.equal(addCourseTask(chem.id, { title: ' ', group: 'work', date: '2099-01-10', min: 1439, hours: 2 }), false, 'a blank name is refused');
  assert.equal(addCourseTask(chem.id, { title: 'Lab 2', group: 'work', date: 'soon', min: 1439, hours: 2 }), false, 'a badly written date is refused');
  assert.equal(addCourseTask(chem.id, { title: 'Lab 2', group: 'work', date: '2099-01-10', min: 1439, hours: 0 }), false, 'zero hours is refused');
  assert.equal(mine.tasks.length, n);
  ui.newRow = chem.id;
  assert.equal(addCourseTask(chem.id, { title: 'Lab 2', group: 'work', date: '2099-01-10', min: 1439, weight: '5%', hours: 3 }), true);
  const lab2 = mine.tasks.at(-1);
  assert.deepEqual([lab2.course, lab2.kind, groupOf(lab2), lab2.weight, lab2.estimateBy, lab2.steps.reduce((m, st) => m + st.min, 0)],
    [chem.id, 'Assignment', 'work', '5%', 'me', 180]);
  assert.equal(ui.newRow, null, 'the form closes after adding');
  addCourseTask(chem.id, { title: 'Midterm exam', group: 'exam', date: '2099-01-12', min: 600, hours: 4 });
  const mid = mine.tasks.at(-1);
  assert.deepEqual([mid.kind, groupOf(mid)], ['Exam', 'exam']);
  ui.editRow = lab2.id;
  deleteTask(lab2.id);
  deleteTask(mid.id);
  assert.equal(mine.tasks.length, n);
  assert.equal(ui.editRow, null, 'deleting from the row form closes it');
}
{
  // Items without a date: kept on the course card only, never scheduled; adding a date turns them into tasks.
  const chem = Object.values(mine.courses).find((c) => c.name === 'CHEM1001');
  const n = mine.tasks.length;
  assert.equal(addCourseTask(chem.id, { title: 'Final project', group: 'work', date: '', min: null, weight: '', hours: null }), true, 'only the name is required');
  assert.equal(mine.tasks.length, n, 'no date means no task to schedule');
  const u = undatedOf(mine, chem.id).find((x) => x.title === 'Final project');
  assert.deepEqual([u.group, u.weight], ['work', '']);
  editUndated(u.ref, { title: 'Final project report', date: '', min: null, weight: '30%' });
  assert.deepEqual(undatedOf(mine, chem.id).filter((x) => x.ref === u.ref).map((x) => [x.title, x.weight]), [['Final project report', '30%']], 'name and weight can change without a date');
  assert.equal(editUndated(u.ref, { title: 'Final project report', date: '2099-02-01', min: null, weight: '30%' }), true);
  const made = mine.tasks.at(-1);
  assert.deepEqual([mine.tasks.length, made.title, made.due, made.weight, made.course], [n + 1, 'Final project report', { date: '2099-02-01', min: 1439 }, '30%', chem.id], 'adding a date makes it a task, 23:59 when no time');
  assert.ok(!undatedOf(mine, chem.id).some((x) => x.ref === u.ref), 'it leaves the undated list');
  deleteTask(made.id);
  addCourseTask(chem.id, { title: 'Quiz 9', group: 'exam', date: '2099-02-03', min: null, hours: null });
  const q = mine.tasks.at(-1);
  assert.deepEqual([q.kind, q.due.min, q.steps.reduce((m, st) => m + st.min, 0)], ['Quiz', 1439, 180], 'a blank time is 23:59 and blank hours use the default for the type');
  deleteTask(q.id);
  addCourseTask(chem.id, { title: 'Essay', group: 'work', date: '', min: null, hours: null });
  const e = undatedOf(mine, chem.id).find((x) => x.title === 'Essay');
  deleteUndated(e.ref);
  assert.ok(!undatedOf(mine, chem.id).some((x) => x.title === 'Essay'), 'an undated item can be deleted');
}
{
  // Removing one session, then clearing the schedule: tasks stay, past sessions stay.
  const t = mine.tasks[0];
  const n = mine.tasks.length;
  const keep = mine.blocks.length;
  const mk = (id, date, start) => ({ id, task: t.id, step: t.steps[0].id, date, start, end: start + 60, reason: '' });
  mine.blocks.push(mk('zz-past', '2000-01-01', 600), mk('zz-a', '2099-01-01', 600), mk('zz-b', '2099-01-02', 600));
  removeBlock('zz-a');
  assert.ok(!mine.blocks.some((b) => b.id === 'zz-a'), 'one session is removed');
  assert.equal(mine.tasks.length, n, 'removing a session keeps the task');
  assert.ok(upcomingBlocks(mine).some((b) => b.id === 'zz-b'));
  assert.ok(clearSchedule() >= 1);
  assert.equal(upcomingBlocks(mine).length, 0, 'nothing upcoming is left');
  assert.ok(mine.blocks.some((b) => b.id === 'zz-past'), 'past sessions are kept');
  assert.equal(mine.tasks.length, n, 'clearing keeps every task');
  assert.equal(clearSchedule(), 0, 'clearing an empty schedule does nothing');
  mine.blocks = mine.blocks.filter((b) => b.id !== 'zz-past');
  assert.ok(mine.blocks.length <= keep);
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

// 24 小時制時間格：常見打法整理成 HH:MM，認不出的不動
const { normalizeTime, normalizeDate } = await import('../dist/js/pickers.js');
assert.equal(normalizeTime('930'), '09:30');
assert.equal(normalizeTime('9:30'), '09:30');
assert.equal(normalizeTime('7'), '07:00');
assert.equal(normalizeTime('23：59'), '23:59');
assert.equal(normalizeTime('2400'), '2400');
assert.equal(normalizeTime('abc'), 'abc');
assert.equal(normalizeDate('2026/12/1'), '2026-12-01');
assert.equal(normalizeDate('12/1', 2027), '2027-12-01');
assert.equal(normalizeDate('2026年2月3日'), '2026-02-03');
assert.equal(normalizeDate('2026-02-30'), '2026-02-30');
assert.equal(normalizeDate('2028-02-29'), '2028-02-29');

// QA 2026-11-07（TEST2200）：group_work 只認 true、日期未公布的項目可照預填存、時數會顯示、任務分清 AI 估的和自己填的
{
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
  setLang('en');
  const qa = toItems({ course: { code: 'TEST2200' }, tasks: [
    { title: 'Final report', type: 'report', due_date: '2026-12-14', due_time: '23:59', group_work: 'Final reports must be personal work.', estimate: { minutes: 720, confidence: 'high' } },
    { title: 'Team pitch', type: 'presentation', due_date: '2026-12-10', due_time: '10:00', group_work: true },
    { title: 'Peer memo', type: 'report', due_raw: 'TBD — announced after Week 3', estimate: { minutes: 120, confidence: 'high' } },
    { title: 'Reading log', type: 'report', due_raw: 'TBD' },
  ] });
  assert.deepEqual(qa.items.map((i) => i.group), [false, true, false, false], 'a sentence in group_work (e.g. "must be personal work") is not group work');
  assert.equal(rowText(qa.items[0]).what, 'Final report');
  assert.equal(rowText(qa.items[2]).hours, '2 hours', 'an undated item still shows its estimate');

  addOwnDoc({ id: 'doc-qa', name: 'test2200.pdf', size: 1 });
  setOwnItems('doc-qa', qa);
  const qd = mine.docs.find((d) => d.id === 'doc-qa');
  const [report1, , memo, log] = qd.items;
  saveItem('doc-qa', memo.id, { when: rowText(memo).when, hours: '3' });
  assert.deepEqual([memo.state, memo.plan.date, memo.plan.hours, rowText(memo).hours], ['ink', null, 3, '3 hours'], 'saving with the prefilled TBD text keeps it undated and keeps the new hours');
  saveItem('doc-qa', log.id, { when: 'TBA', hours: '2' });
  assert.deepEqual([log.state, log.plan.date], ['ink', null], 'typing TBA also keeps it undated');
  const pending = qd.items.find((i) => i.what === 'Team pitch');
  saveItem('doc-qa', pending.id, { when: 'next Friday', hours: '2' });
  assert.equal(pending.state, 'pencil', 'an unreadable date on a dated item is still refused');

  setItemState('doc-qa', report1.id, 'ink');
  assert.equal(mine.tasks.find((t) => t.title === 'Final report').estimateBy, 'ai', 'a confirmed AI estimate is not shown as "your estimate"');
  saveItem('doc-qa', pending.id, { when: '2026-12-10 10:00', hours: '5' });
  assert.equal(mine.tasks.find((t) => t.title === 'Team pitch').estimateBy, 'me', 'hours the student changed are theirs');
  assert.equal(finalTask.estimateBy, 'me', 'the edited final exam (10 hours) counts as the student\'s');
  setLang('zh');
  delete globalThis.document;
}
console.log('Passed: corner character poses, timetable popovers, busy-time ranges, attachment limits and the syllabus AI path.');

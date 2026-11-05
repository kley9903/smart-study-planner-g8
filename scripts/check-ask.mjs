// Checks for the game-style questions: the assistant asks about the "To fill in" items one at a time.
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { toItems, report, rowText } = await import('../dist/js/syllabus-ai.js');
const { questionsFor } = await import('../dist/js/ask.js');
const store = await import('../dist/js/store.js');

const found = toItems({ tasks: [
  { title: 'Library quiz', type: 'quiz', due_date: '2099-11-18', due_time: '23:59', scope: '10 MCQs', difficulty: 'easy', estimate: { minutes: 45, confidence: 'high', basis: '10 MCQs' }, steps: [{ title: 'Do it', minutes: 45 }] },
  { title: 'Quiz 2', type: 'quiz', due_raw: 'TBA', estimate: { minutes: 90, confidence: 'low', basis: 'name only' } },
  { title: 'Essay 1', type: 'essay', due_date: '2099-11-30', due_time: '23:59', scope: '1500 words', estimate: { minutes: 300, confidence: 'low', basis: 'no rubric' } },
] });

// 1. One question per missing piece, in row order: due date, then what to do, then how long.
const qs = questionsFor({ items: found.items });
assert.deepEqual(qs.map((q) => [q.what, q.field]), [['Quiz 2', 'date'], ['Quiz 2', 'scope'], ['Quiz 2', 'hours'], ['Essay 1', 'hours']]);
assert.match(qs[0].text, /Quiz 2/, 'each question names the item');
assert.deepEqual(qs[2].choices.map((c) => c.value), [30, 60, 120, 180], 'how long: quick answers in minutes');
assert.ok(qs[1].typed && !qs[1].choices.length, 'what to do is typed');
assert.ok(qs.every((q) => q.later), 'every question can be left for later');
assert.deepEqual(questionsFor({ items: found.items.filter((i) => i.what === 'Library quiz') }), [], 'a complete item is not asked about');

// 2. Answering fills the item; the question is not asked again, and it leaves "To fill in" once nothing is missing.
store.enterMine();
const s = store.getState();
store.addOwnDoc({ id: 'doc-q', name: 'quiz.txt', size: 1 });
store.setOwnItems('doc-q', { course: 'LIBR1000', items: found.items, notes: [] });
const doc = s.docs.find((d) => d.id === 'doc-q');
store.startAsk('doc-q');
assert.deepEqual([store.ui.ask.i, store.ui.ask.list.length], [0, 4]);
assert.equal(store.answerAsk('next week'), false, 'an answer that cannot be read keeps the same question');
assert.equal(store.ui.ask.i, 0);
assert.equal(store.answerAsk('11/25 10:00'), true);
const quiz2 = doc.items.find((i) => i.what === 'Quiz 2');
assert.deepEqual([quiz2.plan.date.slice(5), quiz2.plan.min], ['11-25', 600], 'a typed date and time');
assert.equal(store.ui.ask.i, 1);
store.answerAsk('Chapters 4–5');
store.answerAsk(60);
assert.deepEqual([quiz2.scope, quiz2.plan.hours, quiz2.confidence], ['Chapters 4–5', 1, 'high'], 'the student\'s own hours count as sure');
assert.equal(rowText(quiz2).hoursNote, '', 'the AI basis no longer shows under the student\'s own hours');
assert.equal(quiz2.state, 'pencil', 'answering fills in; confirming is still the student\'s step');
assert.ok(!report(doc)[0]?.lines.some((l) => l.text === 'Quiz 2'), 'Quiz 2 left "To fill in"');

// 3. "Later" closes; the rest stays in "To fill in". "Don't know" moves on without changing anything.
assert.equal(store.ui.ask.i, 3);
store.closeAsk();
assert.equal(store.ui.ask, null, '"later" closes the dialog');
const essay = doc.items.find((i) => i.what === 'Essay 1');
assert.ok(report(doc)[0].lines.some((l) => l.text === 'Essay 1'), 'what was not answered stays in "To fill in"');
store.startAsk('doc-q');
assert.deepEqual(store.ui.ask.list.map((q) => q.what), ['Essay 1'], 'asking again starts from what is still missing');
store.skipAsk();
assert.deepEqual([store.ui.ask, essay.confidence, essay.plan.hours], [null, 'low', 5], '"don\'t know" moves on (here: the end) and changes nothing');
store.startAsk('doc-q');
store.answerAsk(180);
assert.equal(essay.plan.hours, 3);
assert.equal(store.ui.ask, null, 'after the last answer the dialog closes');

console.log('Passed: questions one at a time, answers fill the items, later and don\'t know.');

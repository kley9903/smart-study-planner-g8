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
const { getState, enterMine, addOwnDoc, setOwnItems, setItemState, inkAllItems, saveItem } = await import('../dist/js/store.js');
const { toItems, rowText, report, checklist, parseDays, parseWhen, readSyllabus } = await import('../dist/js/syllabus-ai.js');
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
assert.equal(found.items.length, 6, '1 class time + 5 tasks');
const [lecture, a1, midterm, proposal, , final] = found.items;
assert.deepEqual(lecture.plan, { kind: 'busy', type: 'weekly', days: [1, 3], start: 630, end: 720, label: 'COMP1010 Lectures' });
assert.equal(rowText(lecture).what, 'Lectures · Room LT2');
assert.deepEqual([a1.plan.date, a1.plan.min, a1.weight, rowText(a1).warn], ['2026-11-20', 1439, '15%', undefined]);
assert.equal(proposal.weight, '', 'the 30% belongs to the whole project, not to each of its two parts');
assert.equal(midterm.plan.min, 540, 'an exam without a time is set to 09:00 and says so');
assert.ok(rowText(midterm).warn.includes('09:00'));
assert.equal(rowText(midterm).src, 'p.2');
assert.equal(final.plan.date, null, 'TBA final exam cannot be scheduled');
assert.ok(rowText(final).warn.includes('TBA'), 'the reason from missing_information is shown on its row');
globalThis.document = { documentElement: {}, querySelectorAll: () => [] }; // setLang also relabels the page
setLang('zh');
assert.deepEqual([rowText(a1).type, rowText(a1).hours, rowText(lecture).when], ['功課', '6 小時', '每週一、三 10:30–12:00'], 'labels follow the interface language');
setLang('en');
assert.deepEqual([rowText(a1).type, rowText(lecture).when], ['Assignment', 'Mon, Wed 10:30–12:00']);
delete globalThis.document;
assert.deepEqual(found.notes, [], 'missing information tied to a row is not repeated as a note');
assert.ok(found.items.every((i) => i.state === 'pencil'), 'nothing is confirmed automatically');
assert.equal(found.weightTotal, 100);
{
  const r = report({ items: found.items, notes: ['原文有「25%」…'], weightTotal: 90 });
  assert.deepEqual(r.have, ['3 assignments', '2 exams or quizzes', '1 class time', 'Weights add up to 90%']);
  assert.ok(r.missing.some((t) => t.includes('90%')), 'weights that do not add up to 100% are reported');
  assert.ok(r.missing.some((t) => t.startsWith('Final exam: no date')), 'items with no date are reported');
  assert.ok(r.missing.some((t) => t.startsWith('Midterm exam: no time')));
  assert.equal(r.missing.at(-1), '原文有「25%」…', 'the workflow coverage check is part of the report');
  const empty = report({ items: [found.items[1]], notes: [], weightTotal: null });
  assert.deepEqual(empty.missing, ['No class times found', 'No exams or quizzes found']);
  const rows = checklist({ items: found.items, notes: [], weightTotal: 100 });
  assert.deepEqual(rows.map((r) => r.state), ['ok', 'ok', 'ok', 'ok', 'ok', 'warn', 'ok'], 'check window rows: read, work, exams, classes, weights, dates (final TBA), syllabus');
  assert.deepEqual(rows.map((r) => r.stage), ['read', 'extract', 'extract', 'extract', 'check', 'check', 'check']);
  assert.deepEqual(checklist({ items: [], notes: ['x'], weightTotal: null }).slice(1).map((r) => r.state), ['none', 'none', 'none', 'none', 'ok', 'warn']);
}

enterMine();
const mine = getState();
const tasksBefore = mine.tasks.length, rulesBefore = mine.unavailable.length;
addOwnDoc({ id: 'doc-1', name: 'comp1010.pdf', size: 1 });
setOwnItems('doc-1', found);
const doc = mine.docs.find((d) => d.id === 'doc-1');
assert.equal(doc.items.length, 6);
assert.equal(mine.tasks.length, tasksBefore, 'reading the syllabus adds nothing by itself');
setItemState('doc-1', doc.items[0].id, 'ink');
assert.equal(mine.unavailable.length, rulesBefore + 1, 'confirming the class time adds a weekly busy time');
assert.deepEqual(mine.unavailable.at(-1).days, [1, 3]);
setItemState('doc-1', doc.items[2].id, 'erased');
saveItem('doc-1', doc.items[5].id, { when: '2026-12-15 14:00', hours: '10' });
const finalTask = mine.tasks.at(-1);
assert.deepEqual([finalTask.title, finalTask.due.date, finalTask.due.min, finalTask.steps.reduce((n, st) => n + st.min, 0)], ['Final exam', '2026-12-15', 840, 600], 'an edited date and hours become the task');
inkAllItems('doc-1');
assert.equal(mine.tasks.length, tasksBefore + 4, 'confirm all: the three pending dated tasks join the edited final; the removed midterm does not');
assert.equal(mine.tasks.find((t) => t.title === 'Assignment 1').course, mine.tasks.find((t) => t.title === 'Final exam').course, 'tasks share the course');
inkAllItems('doc-1');
assert.equal(mine.tasks.length, tasksBefore + 4, 'confirming again does not add duplicates');
setOwnItems('doc-1', found);
assert.equal(doc.items.filter((i) => i.state === 'ink').length, 5, 'reading again keeps confirmed items');

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

console.log('Passed: corner character poses, timetable popovers, busy-time ranges, attachment limits and the syllabus AI path.');

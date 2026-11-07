// Checks for planning with the Dify planning workflow: the /api/plan relay (with a fake Dify),
// turning the site's data into the workflow's input, and a chosen plan option into a proposal.
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { onRequestPost } = await import('../functions/api/plan.js');

/* ---------- relay ---------- */
const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('event: ping\n\n'));
const plans = { capacity: { need_min: 60, free_min: 600, enough: true }, skipped: [], plans: [{ id: 'p1', kind: 'normal', changes: [] }] };
const calls = [];
const fakeDify = (result) => async (url, init) => {
  calls.push({ url, init });
  return sse([{ event: 'workflow_started' }, { event: 'workflow_finished', data: { status: 'succeeded', outputs: { result: JSON.stringify(result) } } }]);
};
const post = (body, headers = {}) => new Request('https://planner.test/api/plan', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });
const state = { now: { date: '2026-11-04', min: 870 }, tasks: [] };

let res = await onRequestPost({ request: post({ state, request: 'only evenings' }), env: { DIFY_PLAN_KEY: 'pk' }, fetcher: fakeDify({ valid: true, data: plans, errors: [] }) });
assert.deepEqual(await res.json(), { ok: true, result: plans });
assert.equal(calls[0].url, 'https://api.dify.ai/v1/workflows/run');
assert.equal(calls[0].init.headers.Authorization, 'Bearer pk', 'uses the planning key, not the course data key');
const sent = JSON.parse(calls[0].init.body);
assert.deepEqual([JSON.parse(sent.inputs.state), sent.inputs.request, sent.response_mode], [state, 'only evenings', 'streaming']);

res = await onRequestPost({ request: post({ state }), env: { DIFY_PLAN_KEY: 'pk' }, fetcher: fakeDify({ valid: false, data: null, errors: ['no task can be scheduled'] }) });
assert.deepEqual([res.status, await res.json()], [200, { ok: false, reason: 'invalid', message: 'no task can be scheduled' }]);
res = await onRequestPost({ request: post({ state }), env: { DIFY_API_KEY: 'course-key' }, fetcher: fakeDify({}) });
assert.deepEqual([res.status, (await res.json()).reason], [503, 'no-key']);
res = await onRequestPost({ request: post({ state }, { Origin: 'https://evil.test' }), env: { DIFY_PLAN_KEY: 'pk' }, fetcher: fakeDify({}) });
assert.equal(res.status, 403, 'other sites cannot use the relay from a browser');
res = await onRequestPost({ request: post('not json'), env: { DIFY_PLAN_KEY: 'pk' }, fetcher: fakeDify({}) });
assert.deepEqual([res.status, (await res.json()).reason], [400, 'bad-input']);
res = await onRequestPost({ request: post({ request: 'x' }), env: { DIFY_PLAN_KEY: 'pk' }, fetcher: fakeDify({}) });
assert.equal(res.status, 400, 'state is required');
res = await onRequestPost({ request: post({ state }), env: { DIFY_PLAN_KEY: 'pk' }, fetcher: async () => new Response('down', { status: 502 }) });
assert.deepEqual([res.status, (await res.json()).reason], [502, 'dify']);

/* ---------- site data → workflow input ---------- */
const { toState, proposalFrom, cardOf } = await import('../dist/js/plan-ai.js');
const s = {
  today: '2026-11-04', now: 870,
  tasks: [
    { id: 't1', title: 'Problem Set 4', short: 'PS4', kind: 'Assignment', due: { date: '2026-11-06', min: 1439 }, weight: '5%', difficulty: 'mid',
      steps: [{ id: 't1-1', title: 'Q1–4', min: 90, progress: 'done' }, { id: 't1-2', title: 'Q5–8', min: 120, progress: 'doing', remain: 30 }, { id: 't1-3', title: 'Q9–12', min: 150, progress: 'todo' }, { id: 't1-4', title: 'Bonus', min: 30, progress: 'todo', dropped: true }] },
    { id: 't2', title: 'Quiz', short: 'Quiz', kind: 'Quiz', due: { date: '2026-11-08', min: 600 }, weight: '', steps: [{ id: 't2-1', title: 'All', min: 60, progress: 'todo' }] },
  ],
  blocks: [{ id: 'b1', task: 't1', step: 't1-3', date: '2026-11-05', start: 1140, end: 1290 }, { id: 'b0', task: 't1', step: 't1-1', date: '2026-11-03', start: 600, end: 690 }],
  unavailable: [{ id: 'u1', type: 'weekly', days: [1, 3], start: 630, end: 720, label: 'Class' }, { id: 'u2', type: 'single', date: '2026-11-07', start: 510, end: 1440, label: 'Moving' }],
  sleep: { start: 30, end: 510 }, sleepOverrides: [{ night: '2026-11-04', start: 90 }],
};
const input = toState(s);
assert.deepEqual(input.now, { date: '2026-11-04', min: 870 });
assert.equal(input.horizon_days, 7);
assert.deepEqual(input.tasks[0], { id: 't1', title: 'Problem Set 4', kind: 'Assignment', due: { date: '2026-11-06', min: 1439 }, weight_percent: 5, difficulty: 'mid',
  steps: [{ id: 't1-1', title: 'Q1–4', min: 90, progress: 'done' }, { id: 't1-2', title: 'Q5–8', min: 120, progress: 'partial', remaining_min: 30 }, { id: 't1-3', title: 'Q9–12', min: 150, progress: 'todo' }] },
  'done stays done, doing is partial with what is left, dropped steps are left out, weight becomes a number');
assert.deepEqual([input.tasks[1].weight_percent, input.tasks[1].difficulty], [null, 'mid'], 'unknown weight is null; unknown difficulty is mid');
assert.deepEqual(input.blocks, [{ id: 'b1', step: 't1-3', date: '2026-11-05', start: 1140, end: 1290 }], 'only blocks from today on');
assert.deepEqual(input.unavailable, s.unavailable);
assert.deepEqual([input.sleep, input.sleep_overrides], [{ start: 30, end: 510 }, [{ night: '2026-11-04', start: 90 }]]);

/* ---------- chosen plan option → proposal ---------- */
const option = {
  id: 'p9', kind: 'tradeoff', tradeoff: { type: 'late_sleep', minutes: 60, costs_sleep: true }, summary: { zh: '今晚遲睡', en: 'Sleep later tonight' },
  stats: { finish: { date: '2026-11-05', min: 60 }, tightest: { task: 't1', buffer_min: 2000 }, max_daily_min: 300, latest_end: 1410 },
  changes: [
    { kind: 'sleep', night: '2026-11-04', start: 90, reason: { code: 'late_sleep', minutes: 60 } },
    { kind: 'estimate', task: 't2', step: 't2-1', min: 45, reason: { code: 'simplify', from: 60 } },
    { kind: 'add', task: 't2', step: 't2-1', date: '2026-11-04', start: 900, end: 945, reason: { code: 'spread_before_due', due: { date: '2026-11-08', min: 600 } } },
  ],
  short: [],
};
const prop = proposalFrom(option, s);
assert.deepEqual(prop.changes.map((c) => c.kind), ['sleep', 'estimate', 'add']);
const add = prop.changes[2];
assert.deepEqual([add.block.task, add.block.step, add.block.date, add.block.start, add.block.end], ['t2', 't2-1', '2026-11-04', 900, 945], 'an add becomes a block the timetable can draw');
assert.ok(add.block.id && add.block.reason, 'with an id and a reason in the current language');
assert.match(add.block.reason, /a bit each day|每天一點/, 'the reason says the work is spread over days');
assert.deepEqual([prop.changes[1].step, prop.changes[1].min], ['t2-1', 45]);

/* ---------- plan card ---------- */
const card = cardOf(option, s);
assert.deepEqual([card.title, card.risky, card.costsSleep], ['Sleep later tonight', false, true]);
assert.match(card.finish, /Nov 5|11\/5|Thu/, 'when everything is done');
assert.match(card.tightest, /PS4/, 'names the tightest task');
assert.equal(cardOf({ ...option, stats: { ...option.stats, tightest: { task: 't1', buffer_min: 120 } } }, s).risky, true, 'a buffer under half a day is risky');

/* ---------- store: ask for plans, preview one, confirm ---------- */
const store = await import('../dist/js/store.js');
const { pendingProposal } = await import('../dist/js/model.js');
store.enterMine();
const mine = store.getState();
store.addTask({ title: 'Essay 2', course: 'ENGL', kind: 'Essay', date: '2099-01-10', min: 1439, hours: 2 });
const essay = mine.tasks.at(-1);
const optionFor = (id, start) => ({ id, kind: 'normal', summary: { zh: id, en: id }, short: [],
  stats: { finish: { date: mine.today, min: start + 60 }, tightest: { task: essay.id, buffer_min: 5000 }, max_daily_min: 60, latest_end: start + 60 },
  changes: [{ kind: 'add', task: essay.id, step: essay.steps[0].id, date: mine.today, start, end: start + 60, reason: { code: 'earliest_before_due', due: essay.due } }] });
let asked = null;
globalThis.fetch = async (url, init) => { asked = { url, body: JSON.parse(init.body) }; return Response.json({ ok: true, result: { capacity: { enough: true }, skipped: [], plans: [optionFor('p1', 1200), optionFor('p2', 1260)] } }); };
await store.requestPlans();
assert.equal(asked.url, '/api/plan');
assert.ok(asked.body.state.tasks.some((t) => t.id === essay.id), 'sends the current tasks');
assert.deepEqual(store.ui.planOptions.plans.map((p) => p.id), ['p1', 'p2']);
assert.equal(pendingProposal(mine).option, 'p1', 'the first (safest) option is previewed straight away');
store.choosePlan('p2');
const p = pendingProposal(mine);
assert.deepEqual([p.option, p.changes[0].block.start], ['p2', 1260], 'clicking another option swaps the preview');
const before = mine.blocks.length;
store.inkProposal();
assert.equal(mine.blocks.length, before + 1, 'confirming writes the chosen option into the study plan');
assert.equal(store.ui.planOptions, null, 'and closes the options');
// Changed your mind after confirming: with everything scheduled, the button plans again. Sessions not started yet are
// given back to the planner, and the new option replaces them only when confirmed; past or running sessions stay.
{
  const confirmed = mine.blocks.filter((b) => b.task === essay.id);
  assert.ok(confirmed.length, 'the essay is scheduled');
  confirmed.forEach((b) => { b.date = '2099-01-05'; }); // in the future whatever the real clock says
  const running = { id: 'b-now', task: essay.id, step: essay.steps[0].id, date: mine.today, start: mine.now - 10, end: mine.now + 50 };
  mine.blocks.push(running);
  let sent = null;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return Response.json({ ok: true, result: { capacity: { enough: true }, skipped: [], plans: [optionFor('p3', 1320)] } }); };
  await store.requestPlans();
  assert.ok(!sent.state.blocks.some((b) => confirmed.some((c) => c.id === b.id)), 'sessions not started yet are sent back to be planned again');
  assert.ok(sent.state.blocks.some((b) => b.id === 'b-now'), 'a running session stays');
  const redo = pendingProposal(mine);
  assert.deepEqual(redo.changes.filter((c) => c.kind === 'remove').map((c) => c.block).sort(), confirmed.map((b) => b.id).sort(), 'the preview shows which sessions would be replaced');
  assert.ok(mine.blocks.some((b) => b.id === confirmed[0].id), 'nothing changes before confirming');
  const { overlay } = await import('../dist/js/model.js');
  assert.equal(overlay(mine).ghosts.get(confirmed[0].id), 'move', 'old sessions show as moved away, not as skipped');
  store.inkProposal();
  assert.deepEqual([mine.blocks.some((b) => confirmed.some((c) => c.id === b.id)), mine.blocks.some((b) => b.start === 1320), essay.steps[0].dropped], [false, true, undefined], 'confirming swaps the old sessions for the new ones');
  mine.blocks = mine.blocks.filter((b) => b.id !== 'b-now');
}

globalThis.fetch = async () => Response.json({ ok: false, reason: 'invalid', message: 'no task can be scheduled' });
await store.requestPlans();
assert.equal(store.ui.planOptions, null);
assert.match(store.ui.planError, /.+/, 'a failure is shown, nothing is scheduled');

globalThis.fetch = async () => Response.json({ ok: true, result: { capacity: { need_min: 2160, free_min: 4170, enough: false }, skipped: [], plans: [] } });
await store.requestPlans();
assert.equal(store.ui.planOptions, null);
assert.doesNotMatch(store.ui.planError, /連不上|cannot be reached/, 'no plans is not reported as a connection problem');
assert.match(store.ui.planError, /空檔不夠|not enough free time/);

console.log('Passed: planning relay, workflow input, plan options as proposals and cards, asking for and confirming plans.');

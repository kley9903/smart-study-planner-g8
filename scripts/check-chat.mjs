// Checks for the AI assistant chat: the /api/chat relay (fake Dify), the summary sent with each message,
// and what the site does with the Chatflow's action (a suggestion to confirm, or asking for plans).
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

const { onRequestPost } = await import('../functions/api/chat.js');

/* ---------- relay ---------- */
const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('event: ping\n\n'));
const result = { valid: true, data: { reply: '好', action: null, follow_up: null }, errors: [] };
const text = JSON.stringify(result);
const calls = [];
const fakeDify = async (url, init) => {
  calls.push({ url, init });
  return sse([{ event: 'message', answer: text.slice(0, 20), conversation_id: 'c-1' }, { event: 'message', answer: text.slice(20), conversation_id: 'c-1' },
    { event: 'message_end', conversation_id: 'c-1' }]);
};
const post = (body, headers = {}) => new Request('https://planner.test/api/chat', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });
let res = await onRequestPost({ request: post({ message: '今晚做甚麼？', context: { now: { date: '2026-11-05' } }, conversation: 'c-0' }), env: { DIFY_CHAT_KEY: 'ck' }, fetcher: fakeDify });
assert.deepEqual(await res.json(), { ok: true, result: result.data, conversation: 'c-1' });
const sent = JSON.parse(calls[0].init.body);
assert.equal(calls[0].url, 'https://api.dify.ai/v1/chat-messages');
assert.equal(calls[0].init.headers.Authorization, 'Bearer ck');
assert.deepEqual([sent.query, JSON.parse(sent.inputs.context).now.date, sent.conversation_id, sent.response_mode], ['今晚做甚麼？', '2026-11-05', 'c-0', 'streaming']);
res = await onRequestPost({ request: post({ message: '' }), env: { DIFY_CHAT_KEY: 'ck' }, fetcher: fakeDify });
assert.equal(res.status, 400, 'an empty message is refused');
res = await onRequestPost({ request: post({ message: 'hi' }), env: {}, fetcher: fakeDify });
assert.deepEqual([res.status, (await res.json()).reason], [503, 'no-key']);
res = await onRequestPost({ request: post({ message: 'hi' }, { Origin: 'https://evil.test' }), env: { DIFY_CHAT_KEY: 'ck' }, fetcher: fakeDify });
assert.equal(res.status, 403);

/* ---------- the summary sent with each message ---------- */
const { toContext } = await import('../dist/js/chat-ai.js');
const s = {
  today: '2026-11-05', now: 900,
  tasks: [{ id: 't1', title: 'Problem Set 4', course: 'c1', due: { date: '2026-11-07', min: 1439 }, steps: [{ id: 't1-1', title: 'Q1-4', min: 90, progress: 'done' }, { id: 't1-2', title: 'Q5-8', min: 120, progress: 'doing', remain: 30 }, { id: 't1-3', title: 'x', min: 30, dropped: true }] }],
  courses: { c1: { name: 'STAT1010' } },
  blocks: [{ id: 'b1', task: 't1', step: 't1-2', date: '2026-11-05', start: 1140, end: 1260 }, { id: 'b0', task: 't1', step: 't1-1', date: '2026-11-01', start: 600, end: 690 }],
  unavailable: [{ id: 'u1', type: 'weekly', days: [1, 3], start: 630, end: 720, label: 'Class' }],
  sleep: { start: 30, end: 510 },
  docs: [{ id: 'd1', own: true, items: [{ id: 'i7', what: 'Quiz 2', state: 'pencil', plan: { kind: 'task', date: null, min: 1439, hours: 1 }, scope: '', confidence: 'low', key: 'quiz' }] }],
};
const ctx = toContext(s);
assert.deepEqual(ctx.now, { date: '2026-11-05', min: 900, weekday: 4 });
assert.deepEqual(ctx.tasks[0], { id: 't1', title: 'Problem Set 4', course: 'STAT1010', due: { date: '2026-11-07', min: 1439 },
  steps: [{ id: 't1-1', title: 'Q1-4', min: 90, progress: 'done' }, { id: 't1-2', title: 'Q5-8', min: 120, progress: 'doing', remain_min: 30 }] });
assert.deepEqual(ctx.blocks, [{ date: '2026-11-05', start: 1140, end: 1260, task: 'Problem Set 4', step: 'Q5-8' }], 'only sessions from today on, with names');
assert.deepEqual(ctx.to_fill, [{ doc: 'd1', item: 'i7', what: 'Quiz 2', need: ['date', 'scope', 'hours'] }]);
assert.ok(JSON.stringify(ctx).length < 4000, 'small enough to send with every message');
{
  const { setLang } = await import('../dist/js/i18n.js');
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] }; // setLang also relabels the page
  setLang('zh');
  assert.equal(toContext(s).lang, 'zh', 'the reply follows the language chosen on the site, not the language typed');
  setLang('en');
  assert.equal(toContext(s).lang, 'en');
  delete globalThis.document;
}
s.thread = [{ who: 'me', text: 'Quiz 2 下星期二交，範圍是第 5 章' }, { who: 'ai', html: '記下日期，<b>範圍</b>也要記嗎？' }, { who: 'ai', kind: 'hello' }];
assert.deepEqual(toContext(s).recent, [{ who: 'me', text: 'Quiz 2 下星期二交，範圍是第 5 章' }, { who: 'ai', text: '記下日期，範圍也要記嗎？' }], 'the last few lines of the chat, as plain text, so "yes, that too" makes sense');

/* ---------- what the site does with the answer ---------- */
const store = await import('../dist/js/store.js');
const { pendingProposal } = await import('../dist/js/model.js');
store.enterMine();
const mine = store.getState();
store.addTask({ title: 'Essay 2', course: 'ENGL', kind: 'Essay', date: '2099-01-10', min: 1439, hours: 2 });
const essay = mine.tasks.at(-1);
const reply = (data) => { globalThis.fetch = async (url, init) => { reply.last = { url, body: JSON.parse(init.body) }; return Response.json({ ok: true, result: data, conversation: 'c-9' }); }; };

reply({ reply: '好，明天全日搬屋。', action: { type: 'busy', rule: { type: 'single', date: '2099-01-02', start: 510, end: 1440, label: '搬屋' } }, follow_up: null });
await store.say('明天全日搬屋');
assert.equal(reply.last.url, '/api/chat');
assert.equal(mine.thread.at(-1).text || mine.thread.at(-1).html.replace(/<[^>]+>/g, ''), '好，明天全日搬屋。');
let p = pendingProposal(mine);
assert.deepEqual([p.kind, p.changes[0].kind, p.changes[0].rule.label], ['chat', 'hatch', '搬屋'], 'a busy time is a dashed suggestion first');
const rulesBefore = mine.unavailable.length;
store.inkProposal();
assert.equal(mine.unavailable.length, rulesBefore + 1, 'confirming adds it');

reply({ reply: '記下了', action: { type: 'progress', step: essay.steps[0].id, progress: 'doing', remain_min: 40 }, follow_up: '其他部分呢？' });
await store.say('Essay 第一部分做了一半');
assert.equal(reply.last.body.conversation, 'c-9', 'the conversation continues');
p = pendingProposal(mine);
assert.equal(p.changes[0].kind, 'progress');
store.inkProposal();
assert.deepEqual([essay.steps[0].progress, essay.steps[0].remain], ['doing', 40]);
assert.ok(mine.thread.some((n) => (n.text || n.html || '').includes('其他部分呢？')), 'the follow-up question is shown');

reply({ reply: '我幫你排，只排晚上。', action: { type: 'plan', request: 'only evenings' }, follow_up: null });
let planBody = null;
const chatFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (url === '/api/plan') { planBody = JSON.parse(init.body); return Response.json({ ok: false, reason: 'invalid' }); }
  return chatFetch(url, init);
};
await store.say('幫我排今個星期，只在晚上');
assert.equal(planBody?.request, 'only evenings', 'asking for plans goes through the same planning as the button, with the request');

globalThis.fetch = async () => Response.json({ ok: false, reason: 'dify' });
await store.say('hello');
assert.match(mine.thread.at(-1).html || mine.thread.at(-1).text, /.+/, 'a failure is said in the thread');

console.log('Passed: chat relay, summary, suggestions from chat, asking for plans from chat.');

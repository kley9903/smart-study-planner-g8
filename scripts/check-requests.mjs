// Exercise the real store with responses held across a change of plan/mode.
// No Dify calls or persistent browser data are involved.
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
const store = await import('../dist/js/store.js');
// getState updates the clock; it is not part of the response's write effects.
const snapshot = () => JSON.stringify({ state: { ...store.getState(), today: null, now: null }, ui: store.ui });

function mine() {
  memory.clear();
  store.enterMine();
  store.addTask({ title: 'Essay', course: 'ENGL', kind: 'Essay', date: '2099-12-01', min: 1439, hours: 1 });
}
function hold() {
  const calls = [];
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => calls.push({ url, init, resolve, reject }));
  return calls;
}
const plan = (id) => Response.json({ ok: true, result: { plans: [{ id, changes: [] }] } });
const answer = (action = null) => Response.json({ ok: true, conversation: 'old-conversation', result: { reply: 'Old reply', action, follow_up: 'Old follow-up' } });

// Both paths must discard success and failure after a mode change or reload,
// including leaving and returning to mine before the old response arrives.
for (const [name, change] of [
  ['demo', () => store.enterDemo()],
  ['reload mine', () => store.enterMine()],
  ['leave and return', () => { store.enterDemo(); store.enterMine(); }],
]) {
  for (const kind of ['plan', 'chat']) {
    for (const failed of [false, true]) {
      mine();
      const calls = hold();
      const pending = kind === 'plan' ? store.requestPlans() : store.say('Plan my week');
      assert.equal(calls.length, 1);
      change();
      assert.equal(calls[0].init.signal.aborted, true, 'changing plans cancels outstanding network work');
      const before = snapshot();
      if (failed) calls[0].reject(new Error('offline'));
      else calls[0].resolve(kind === 'plan' ? plan('old') : answer({ type: 'plan' }));
      await pending;
      assert.ok(snapshot() === before, `${kind} ${failed ? 'failure' : 'success'} after ${name} must not write to the new state`);
      assert.equal(calls.length, 1, 'an obsolete chat action must not start planning');
    }
  }
}

// Old completion must not clear the new request's waiting indicator or replace
// its result. Test both completion orders, with fetch ignoring cancellation.
for (const kind of ['plan', 'chat']) {
  for (const oldFirst of [true, false]) {
    mine();
    const calls = hold();
    const send = () => kind === 'plan' ? store.requestPlans() : store.say('Hello');
    const old = send();
    store.enterMine();
    const current = send();
    assert.equal(calls.length, 2);
    const finishOld = async () => { calls[0].resolve(kind === 'plan' ? plan('old') : answer()); await old; };
    const finishNew = async () => { calls[1].resolve(kind === 'plan' ? plan('new') : Response.json({ ok: true, conversation: 'new-conversation', result: { reply: 'New reply' } })); await current; };
    if (oldFirst) {
      await finishOld();
      assert.equal(kind === 'plan' ? store.ui.planning : store.ui.chatting, true, 'old completion must leave the new request waiting');
      await finishNew();
    } else {
      await finishNew();
      const before = snapshot();
      await finishOld();
      assert.ok(snapshot() === before, 'old completion must not replace the new result');
    }
    assert.equal(kind === 'plan' ? store.ui.planOptions.plans[0].id : store.getState().chatConversation, kind === 'plan' ? 'new' : 'new-conversation');
    assert.equal(kind === 'plan' ? store.ui.planning : store.ui.chatting, false);
  }
}

// A rapid second chat should not append a message or start an overlapping turn.
mine();
const calls = hold();
const first = store.say('First');
const threadLength = store.getState().thread.length;
await store.say('Second');
assert.equal(calls.length, 1, 'one chat turn at a time');
assert.equal(store.getState().thread.length, threadLength, 'ignored duplicate is not added to the conversation');
calls[0].resolve(answer());
await first;

// Invalid current responses still finish waiting and show the existing error.
for (const kind of ['plan', 'chat']) {
  mine();
  globalThis.fetch = async () => Response.json(null);
  await (kind === 'plan' ? store.requestPlans() : store.say('Hello'));
  assert.equal(kind === 'plan' ? store.ui.planning : store.ui.chatting, false, 'invalid current response clears the waiting state');
  assert.ok(kind === 'plan' ? store.ui.planError : store.getState().thread.at(-1).html, 'invalid response shows the existing error');
}

console.log('Passed: obsolete plan/chat success and failure, reload and mode changes, both response orders, and one chat turn at a time.');

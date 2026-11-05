// Cloudflare Pages Function: POST /api/chat
// 把學生在 AI 助手打的一句話，連同計劃的精簡摘要，交給 Dify「AI 助手｜Study Planner」Chatflow。
// API 金鑰只在伺服器端：Cloudflare Pages 的環境變數 DIFY_CHAT_KEY（本機預覽用同名環境變數）。
//
// 請求：JSON { message, context, conversation? }
// 回應：{ ok: true, result: { reply, action, follow_up }, conversation }
//   或 { ok: false, reason: 'no-key' | 'bad-input' | 'dify' | 'invalid', message }
const USER = 'study-planner-web';
const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const fail = (status, reason, message) => reply(status, { ok: false, reason, message });

export async function onRequestPost({ request, env, fetcher = fetch }) {
  const key = env.DIFY_CHAT_KEY;
  if (!key) return fail(503, 'no-key', 'DIFY_CHAT_KEY is not set on the server');
  const base = (env.DIFY_API_BASE || 'https://api.dify.ai/v1').replace(/\/$/, '');
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'bad-input', 'Cross-site requests are not accepted');

  let body;
  try { body = await request.json(); } catch { return fail(400, 'bad-input', 'Send JSON'); }
  const message = String(body?.message || '').trim().slice(0, 1000);
  if (!message) return fail(400, 'bad-input', 'message is required');
  const context = JSON.stringify(body.context || {});
  if (context.length > 20000) return fail(413, 'bad-input', 'context is too large');

  try {
    const res = await fetcher(`${base}/chat-messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: message, inputs: { context }, conversation_id: String(body.conversation || ''), response_mode: 'streaming', user: USER }),
    });
    if (!res.ok) return fail(502, 'dify', `Chat failed to start (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const { answer, conversation, error } = await readAnswer(res.body);
    if (error) return fail(502, 'dify', error);
    let out = null;
    try { out = JSON.parse(answer); } catch { /* 下面當作讀不懂 */ }
    if (!out?.valid || !out.data) return reply(200, { ok: false, reason: 'invalid', message: (out?.errors || []).join('; ') || 'The assistant did not answer' });
    return reply(200, { ok: true, result: out.data, conversation });
  } catch (err) {
    return fail(502, 'dify', String(err?.message || err));
  }
}

/** 讀 Chatflow 的 SSE：把 message 事件的 answer 接起來，記下 conversation_id。 */
async function readAnswer(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let conversation = '';
  let error = '';
  const take = (line) => {
    if (!line.startsWith('data:')) return;
    let msg;
    try { msg = JSON.parse(line.slice(5)); } catch { return; }
    if (msg.conversation_id) conversation = msg.conversation_id;
    if (msg.event === 'message' || msg.event === 'agent_message') answer += msg.answer || '';
    if (msg.event === 'error') error = msg.message || 'Chat error';
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(take);
  }
  take(buffer);
  return { answer: answer.trim(), conversation, error };
}

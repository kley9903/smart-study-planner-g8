// Cloudflare Pages Function: POST /api/syllabus
// 把使用者的大綱（PDF／Word 檔，或文字）交給 Dify「課程資料整理｜Study Planner」工作流程，回傳它整理好的 JSON。
// API 金鑰只在伺服器端：Cloudflare Pages 的環境變數 DIFY_API_KEY（本機預覽用同名環境變數）。
// 回應：{ ok: true, result: { schema_version, course, tasks, course_events, facts, missing_information, ... } }
//       或 { ok: false, reason: 'no-key' | 'bad-input' | 'too-big' | 'dify' | 'invalid', message }
const MAX_MB = 15; // Dify 雲端的單檔上限
const USER = 'study-planner-web';

const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const fail = (status, reason, message) => reply(status, { ok: false, reason, message });

export async function onRequestPost({ request, env, fetcher = fetch }) {
  const key = env.DIFY_API_KEY;
  if (!key) return fail(503, 'no-key', 'DIFY_API_KEY is not set on the server');
  const base = (env.DIFY_API_BASE || 'https://api.dify.ai/v1').replace(/\/$/, '');
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'bad-input', 'Cross-site requests are not accepted');

  let form;
  try { form = await request.formData(); } catch { return fail(400, 'bad-input', 'Send multipart form data'); }
  const file = form.get('file');
  const text = String(form.get('text') || '').slice(0, 80000);
  const context = String(form.get('context') || '').slice(0, 20000);
  const hasFile = file && typeof file === 'object' && file.size > 0;
  if (!hasFile && !text.trim()) return fail(400, 'bad-input', 'Send a file or some text');
  if (hasFile && file.size > MAX_MB * 1024 * 1024) return fail(413, 'too-big', `Files over ${MAX_MB} MB are not accepted`);

  const auth = { Authorization: `Bearer ${key}` };
  const inputs = { text, context };
  try {
    if (hasFile) {
      const upload = new FormData();
      upload.append('file', file, file.name || 'syllabus.pdf');
      upload.append('user', USER);
      const res = await fetcher(`${base}/files/upload`, { method: 'POST', headers: auth, body: upload });
      if (!res.ok) return fail(502, 'dify', `File upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const { id } = await res.json();
      inputs.document = { type: 'document', transfer_method: 'local_file', upload_file_id: id };
    }
    // 用 streaming 讀到 workflow_finished：長的大綱可能超過 blocking 模式的等待上限。
    const run = await fetcher(`${base}/workflows/run`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, response_mode: 'streaming', user: USER }),
    });
    if (!run.ok) return fail(502, 'dify', `Workflow failed to start (${run.status}): ${(await run.text()).slice(0, 300)}`);
    const finished = await lastFinished(run.body);
    if (!finished) return fail(502, 'dify', 'The workflow ended without a result');
    if (finished.status !== 'succeeded') return fail(502, 'dify', finished.error || `Workflow ${finished.status}`);
    const out = unwrap(finished.outputs);
    if (!out?.valid || !out.data) return fail(502, 'invalid', (out?.errors || []).join('; ') || 'The workflow did not return valid course data');
    return reply(200, { ok: true, result: out.data });
  } catch (err) {
    return fail(502, 'dify', String(err?.message || err));
  }
}

/** 讀 Dify 的 SSE 串流，回傳 workflow_finished 事件的 data。 */
async function lastFinished(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = null;
  const take = (line) => {
    if (!line.startsWith('data:')) return;
    try {
      const msg = JSON.parse(line.slice(5));
      if (msg.event === 'workflow_finished') finished = msg.data;
    } catch { /* ping 或不完整的行 */ }
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
  return finished;
}

/** 工作流程的輸出變數裡，找出 { valid, data, errors } 那一個（可能是字串）。 */
function unwrap(outputs = {}) {
  for (const value of Object.values(outputs || {})) {
    let v = value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { continue; } }
    if (v && typeof v === 'object' && 'valid' in v) return v;
  }
  return null;
}

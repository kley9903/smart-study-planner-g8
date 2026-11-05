// Cloudflare Pages Function: POST /api/syllabus
// 把使用者的大綱（PDF／Word 檔、公告圖片，或文字）交給 Dify「課程資料整理｜Study Planner」工作流程，回傳它整理好的 JSON。
// API 金鑰只在伺服器端：Cloudflare Pages 的環境變數 DIFY_API_KEY（本機預覽用同名環境變數）。
//
// 輸入有問題時直接回 JSON：{ ok: false, reason: 'no-key' | 'bad-input' | 'too-big', message }。
// 開始執行後回 NDJSON（每行一個 JSON），讓網頁即時顯示進度：
//   { stage: 'read' | 'extract' | 'check' | 'tidy' }   … Dify 每走到下一步就送一行
//   { ok: true, result: { course, tasks, course_events, facts, missing_information, warnings, ... } }   最後一行
//   或 { ok: false, reason: 'dify' | 'invalid', message }
const MAX_MB = 15; // Dify 雲端的單檔上限
const IMAGE_MAX_MB = 10; // Dify 雲端的圖片上限
/** 圖片送到工作流程的 image 欄位（先經「圖片文字辨識」抄出文字），其他檔案送到 document。 */
const isImage = (file) => /^image[/]/.test(file.type || '') || /[.](jpe?g|png|gif|webp)$/i.test(file.name || '');
const USER = 'study-planner-web';
/** Dify 節點類型 → 網頁上的步驟（圖片文字辨識雖然是 llm，但仍算「讀取」） */
const STAGE = {
  start: 'read', 'if-else': 'read', 'variable-aggregator': 'read', 'document-extractor': 'read',
  llm: 'extract', code: 'check', 'template-transform': 'tidy', end: 'tidy',
};

const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const fail = (status, reason, message) => reply(status, { ok: false, reason, message });

export async function onRequestPost({ request, env, waitUntil, fetcher = fetch }) {
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
  const limit = hasFile && isImage(file) ? IMAGE_MAX_MB : MAX_MB;
  if (hasFile && file.size > limit * 1024 * 1024) return fail(413, 'too-big', `Files over ${limit} MB are not accepted`);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (obj) => writer.write(encoder.encode(`${JSON.stringify(obj)}\n`));
  const work = run({ base, key, file: hasFile ? file : null, inputs: { text, context }, fetcher, send })
    .catch((err) => ({ ok: false, reason: 'dify', message: String(err?.message || err) }))
    .then(async (last) => { await send(last); await writer.close(); })
    .catch(() => {}); // 使用者關掉網頁時寫入會失敗，不用處理
  waitUntil?.(work);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** 上傳檔案（如有）、執行工作流程，途中送出步驟；回傳最後一行。 */
async function run({ base, key, file, inputs, fetcher, send }) {
  const auth = { Authorization: `Bearer ${key}` };
  await send({ stage: 'read' });
  if (file) {
    const upload = new FormData();
    upload.append('file', file, file.name || 'syllabus.pdf');
    upload.append('user', USER);
    const res = await fetcher(`${base}/files/upload`, { method: 'POST', headers: auth, body: upload });
    if (!res.ok) return { ok: false, reason: 'dify', message: `File upload failed (${res.status}): ${(await res.text()).slice(0, 300)}` };
    const { id } = await res.json();
    const kind = isImage(file) ? 'image' : 'document';
    inputs[kind] = { type: kind, transfer_method: 'local_file', upload_file_id: id };
  }
  // 用 streaming 讀到 workflow_finished：長的大綱可能超過 blocking 模式的等待上限，也能一路回報步驟。
  const res = await fetcher(`${base}/workflows/run`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs, response_mode: 'streaming', user: USER }),
  });
  if (!res.ok) return { ok: false, reason: 'dify', message: `Workflow failed to start (${res.status}): ${(await res.text()).slice(0, 300)}` };
  let stage = 'read';
  const finished = await readEvents(res.body, async (msg) => {
    const ocr = msg.data?.node_type === 'llm' && /圖片|image|ocr/i.test(msg.data?.title || '');
    const next = msg.event === 'node_started' && (ocr ? 'read' : STAGE[msg.data?.node_type]);
    if (next && next !== stage) { stage = next; await send({ stage }); }
  });
  if (!finished) return { ok: false, reason: 'dify', message: 'The workflow ended without a result' };
  if (finished.status !== 'succeeded') return { ok: false, reason: 'dify', message: finished.error || `Workflow ${finished.status}` };
  const out = unwrap(finished.outputs);
  if (!out?.valid || !out.data) return { ok: false, reason: 'invalid', message: (out?.errors || []).join('; ') || 'The workflow did not return valid course data' };
  return { ok: true, result: out.data };
}

/** 讀 Dify 的 SSE 串流：每個事件交給 onEvent，回傳 workflow_finished 事件的 data。 */
export async function readEvents(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = null;
  const take = async (line) => {
    if (!line.startsWith('data:')) return;
    let msg;
    try { msg = JSON.parse(line.slice(5)); } catch { return; } // ping 或不完整的行
    if (msg.event === 'workflow_finished') finished = msg.data;
    await onEvent(msg);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) await take(line);
  }
  await take(buffer);
  return finished;
}

/** 工作流程的輸出變數裡，找出 { valid, data, errors } 那一個（可能是字串）。 */
export function unwrap(outputs = {}) {
  for (const value of Object.values(outputs || {})) {
    let v = value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { continue; } }
    if (v && typeof v === 'object' && 'valid' in v) return v;
  }
  return null;
}

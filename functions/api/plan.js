// Cloudflare Pages Function: POST /api/plan
// 把學生目前的任務、空檔和已確認的時段交給 Dify「排程｜Study Planner」工作流程，回傳最多約 10 份排程方案。
// API 金鑰只在伺服器端：Cloudflare Pages 的環境變數 DIFY_PLAN_KEY（本機預覽用同名環境變數）。
//
// 請求：JSON { state, request? }（state 的格式見專案 docs/planner-workflow-brief.md 第 4 節）
// 回應：{ ok: true, result: { capacity, skipped, plans } }
//   或 { ok: false, reason: 'no-key' | 'bad-input' | 'dify' | 'invalid', message }
import { readEvents, unwrap } from './syllabus.js';

const USER = 'study-planner-web';
const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const fail = (status, reason, message) => reply(status, { ok: false, reason, message });

export async function onRequestPost({ request, env, fetcher = fetch }) {
  const key = env.DIFY_PLAN_KEY;
  if (!key) return fail(503, 'no-key', 'DIFY_PLAN_KEY is not set on the server');
  const base = (env.DIFY_API_BASE || 'https://api.dify.ai/v1').replace(/\/$/, '');
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'bad-input', 'Cross-site requests are not accepted');

  let body;
  try { body = await request.json(); } catch { return fail(400, 'bad-input', 'Send JSON'); }
  if (!body?.state || typeof body.state !== 'object') return fail(400, 'bad-input', 'state is required');
  const state = JSON.stringify(body.state);
  if (state.length > 60000) return fail(413, 'bad-input', 'state is too large');
  const inputs = { state, request: String(body.request || '').slice(0, 500) };

  try {
    // streaming：排 10 份方案可能超過 blocking 模式的等待上限
    const res = await fetcher(`${base}/workflows/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, response_mode: 'streaming', user: USER }),
    });
    if (!res.ok) return fail(502, 'dify', `Workflow failed to start (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const finished = await readEvents(res.body, async () => {});
    if (!finished) return fail(502, 'dify', 'The workflow ended without a result');
    if (finished.status !== 'succeeded') return fail(502, 'dify', finished.error || `Workflow ${finished.status}`);
    const out = unwrap(finished.outputs);
    if (!out?.valid || !out.data) return reply(200, { ok: false, reason: 'invalid', message: (out?.errors || []).join('; ') || 'The workflow did not return plans' });
    // 新網站不能把舊 Workflow 的「不限每日工時」當作正常方案。
    // 舊客戶端仍可使用舊合約；容量版須與同版本 Python 一起發布。
    if (body.state.scheduling_policy === 'capacity-v1' && out.data.engine !== 'capacity-v1') {
      return fail(503, 'workflow-update-required', 'The capacity-aware scheduling workflow has not been published yet');
    }
    return reply(200, { ok: true, result: out.data });
  } catch (err) {
    return fail(502, 'dify', String(err?.message || err));
  }
}

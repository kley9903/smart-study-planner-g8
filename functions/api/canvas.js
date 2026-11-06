// Cloudflare Pages Function: POST /api/canvas  { url: 'https://canvas.ust.hk/feeds/calendars/user_….ics' }
// 讀學生自己的 Canvas 日曆訂閱連結（.ics），整理成簡單的 JSON 交回網頁。Canvas 不准網頁直接跨網站讀，所以經伺服器轉。
// 連結本身等於讀取那個人行事曆的鑰匙：這裡不記錄、不保存，讀完即丟；也不回傳說明文字（只要名稱、科目和日期）。
//
// 回覆：{ ok: true, events: [{ kind: 'assignment' | 'event', uid, title, course, section, date, min, endDate, endMin }] }
//   date 是 YYYY-MM-DD（香港時間）；min 是當天第幾分鐘，只有日期沒有時間時是 null。
// 或 { ok: false, reason: 'bad-url' | 'not-found' | 'canvas', message }
const MAX_BYTES = 5 * 1024 * 1024;
const TZ = 'Asia/Hong_Kong';

const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const fail = (status, reason, message) => reply(status, { ok: false, reason, message });

/** 只接受 Canvas 的日曆訂閱連結（HKUST，或 Instructure 代管的學校），免得這裡變成替人讀任何網址的跳板。 */
export function feedUrl(text) {
  let u;
  try { u = new URL(String(text || '').trim().replace(/^webcal:/i, 'https:')); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
  if (host !== 'canvas.ust.hk' && !host.endsWith('.instructure.com')) return null;
  if (!/^\/feeds\/calendars\/[\w-]+\.ics$/.test(u.pathname)) return null;
  return `https://${host}${u.pathname}`;
}

export async function onRequestPost({ request, fetcher = fetch }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'bad-url', 'Cross-site requests are not accepted');
  let body;
  try { body = await request.json(); } catch { return fail(400, 'bad-url', 'Send JSON { url }'); }
  const url = feedUrl(body?.url);
  if (!url) return fail(400, 'bad-url', 'Not a Canvas calendar feed link');

  let res;
  try {
    res = await fetcher(url, { redirect: 'manual', headers: { Accept: 'text/calendar' } });
  } catch (err) {
    return fail(502, 'canvas', String(err?.message || err));
  }
  // 連結錯了或已重設：HKUST Canvas 回 400，其他學校可能回 401／403／404
  if ([400, 401, 403, 404].includes(res.status)) return fail(404, 'not-found', `Canvas answered ${res.status}`);
  if (res.status !== 200) return fail(502, 'canvas', `Canvas answered ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) return fail(502, 'canvas', 'The calendar is too big');
  if (!/^BEGIN:VCALENDAR/m.test(text)) return fail(502, 'canvas', 'Not a calendar');
  return reply(200, { ok: true, events: parseFeed(text) });
}

/** .ics 文字 → 事件清單（見檔頭）。 */
export function parseFeed(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') { if (ev) events.push(ev); ev = null; continue; }
    if (!ev) continue;
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (m) ev[m[1]] = { params: m[2], value: m[3] };
  }
  return events.map(toEvent).filter(Boolean);
}

const unescape = (s) => String(s || '').replace(/\\([\\,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

function toEvent(ev) {
  if (!ev.DTSTART || !ev.SUMMARY) return null;
  const uid = ev.UID?.value || '';
  const kind = /^event-assignment-/.test(uid) ? 'assignment' : 'event';
  // Canvas 的標題是「名稱 [COMP2711 (L1-L3)]」：方括號裡是科目代號和班別
  const summary = unescape(ev.SUMMARY.value).trim();
  const tag = /^(.*?)\s*\[([^\]]+)\]$/.exec(summary);
  const [code, ...rest] = (tag ? tag[2] : '').trim().split(/\s+/);
  const start = when(ev.DTSTART);
  if (!start) return null;
  const end = ev.DTEND ? when(ev.DTEND) : null;
  return {
    kind, uid, title: tag ? tag[1] : summary, course: code || '', section: rest.join(' ').replace(/^\(|\)$/g, ''),
    date: start.date, min: start.min, endDate: end?.date || null, endMin: end?.min ?? null,
  };
}

/** DTSTART／DTEND → { date, min }：只有日期的 min 是 null；UTC（Z 結尾）轉成香港時間；有 TZID 或沒有時區的照寫。 */
function when({ params, value }) {
  const d = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(value || '');
  if (!d) return null;
  if (/VALUE=DATE(?!-)/.test(params) || !d[4]) return { date: `${d[1]}-${d[2]}-${d[3]}`, min: null };
  if (!d[7]) return { date: `${d[1]}-${d[2]}-${d[3]}`, min: Number(d[4]) * 60 + Number(d[5]) };
  const at = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +d[4], +d[5]));
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

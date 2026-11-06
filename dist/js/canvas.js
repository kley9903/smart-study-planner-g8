// Canvas 日曆訂閱連結（.ics）→ 經伺服器 /api/canvas 讀取 → 每一科一份待核對的項目（跟 AI 讀大綱的結果同一個樣子）。
// 只收今天或之後的功課，以及標題看得出是考試或測驗的活動；其他活動（講座、參觀）不收。
// Canvas 只給日期、沒給時間的功課，是 23:59 截止（Canvas 把 23:59 的截止日寫成全日）。
import { typeHours } from './syllabus-ai.js';

/** 讀日曆。失敗丟出帶 reason 的錯誤：'bad-url'、'not-found'、'canvas'、'offline'、'no-server'。 */
export async function readCanvas(url, { fetcher = fetch } = {}) {
  let res;
  try {
    res = await fetcher('/api/canvas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  } catch (cause) {
    throw Object.assign(new Error('offline', { cause }), { reason: 'offline' });
  }
  const out = await res.json().catch(() => null);
  if (!out) throw Object.assign(new Error(`HTTP ${res.status}`), { reason: res.status === 404 ? 'no-server' : 'canvas' });
  if (!out.ok) throw Object.assign(new Error(out.message || 'failed'), { reason: out.reason || 'canvas' });
  return out.events || [];
}

const EXAM = /mid-?term|\bexam|考試/i; // 「Final Project」不是考試，「Final Exam」靠 exam 認出
const QUIZ = /quiz|\btest\b|測驗|小測/i;
/** 從標題猜類型（核對時可以改）。 */
export function keyFromTitle(title = '') {
  const t = String(title);
  if (EXAM.test(t)) return 'exam';
  if (QUIZ.test(t)) return 'quiz';
  if (/presentation|匯報/i.test(t)) return 'presentation';
  if (/project|專題/i.test(t)) return 'project';
  if (/\blab\b/i.test(t)) return 'lab';
  if (/essay/i.test(t)) return 'essay';
  if (/report|報告/i.test(t)) return 'report';
  return 'assignment';
}

/**
 * 事件清單 → [{ course, items }]，按科目分開（沒有科目代號的歸「Canvas」）。today 是 YYYY-MM-DD。
 * 每一項有 uid（Canvas 的編號），再匯入一次時用來認出已經有的。
 */
export function canvasFound(events, today) {
  const by = new Map();
  for (const ev of events) {
    if (!ev.date || ev.date < today) continue;
    const key = keyFromTitle(ev.title);
    if (ev.kind !== 'assignment' && key !== 'exam' && key !== 'quiz') continue;
    const course = ev.course || 'Canvas';
    if (!by.has(course)) by.set(course, []);
    by.get(course).push({
      id: `cv-${ev.uid}`, uid: ev.uid, key, what: ev.title, group: false, raw: '', weight: '',
      src: 'Canvas', quote: '', reasons: [], flag: null, hoursDefault: true, confidence: 'low', basis: '', difficulty: null, scope: '', steps: [],
      plan: { kind: 'task', title: ev.title, key, date: ev.date, min: ev.min ?? 1439, hours: typeHours(key) }, state: 'pencil',
    });
  }
  return [...by].map(([course, items]) => ({ course, items: items.sort((a, b) => a.plan.date.localeCompare(b.plan.date) || a.plan.min - b.plan.min) }));
}

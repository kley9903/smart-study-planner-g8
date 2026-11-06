// Canvas 日曆檔（.ics）→ 每一科一份待核對的項目（跟 AI 讀大綱的結果同一個樣子）。
// 學生在 Canvas「日曆」頁按「Calendar Feed」的連結，瀏覽器會下載 .ics 檔；把檔案放進網站，在瀏覽器裡直接讀，不經伺服器。
// （Canvas 不准網站從伺服器代讀這條連結，正式網站經 Cloudflare 讀會被擋，所以改成這樣。）
// 只收今天或之後的功課，以及標題看得出是考試或測驗的活動；其他活動（講座、參觀）不收。
// Canvas 只給日期、沒給時間的功課，是 23:59 截止（Canvas 把 23:59 的截止日寫成全日）。
import { typeHours } from './syllabus-ai.js';

const TZ = 'Asia/Hong_Kong';
export const ICS_MAX_MB = 5;

/** 讀一個 .ics 檔 → 事件清單。不是日曆檔丟出 reason 'not-calendar'，太大丟出 'too-big'。 */
export async function readIcs(file) {
  if (file.size > ICS_MAX_MB * 1024 * 1024) throw Object.assign(new Error('too big'), { reason: 'too-big' });
  const text = await file.text();
  if (!/^BEGIN:VCALENDAR/m.test(text)) throw Object.assign(new Error('not a calendar'), { reason: 'not-calendar' });
  return parseFeed(text);
}

/**
 * .ics 文字 → [{ kind: 'assignment' | 'event', uid, title, course, section, date, min, endDate, endMin }]。
 * date 是 YYYY-MM-DD（香港時間）；min 是當天第幾分鐘，只有日期沒有時間時是 null。說明文字不收。
 */
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
    kind, uid, title: cleanTitle(tag ? tag[1] : summary), course: code || '', section: rest.join(' ').replace(/^\(|\)$/g, ''),
    date: start.date, min: start.min, endDate: end?.date || null, endMin: end?.min ?? null,
  };
}

/** 老師有時把日期寫在標題前後，例如「[2026.10.28] Submission: …」；截止日另有欄位，標題就不用重複。 */
const DATE_TAG = String.raw`[\[(（【]\s*\d{4}[./-]\d{1,2}[./-]\d{1,2}\s*[\])）】]`;
export function cleanTitle(title) {
  const t = String(title).replace(new RegExp(`^\\s*${DATE_TAG}\\s*[-–:：]?\\s*`), '').replace(new RegExp(`\\s*[-–]?\\s*${DATE_TAG}\\s*$`), '').trim();
  return t || String(title).trim();
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
 * Canvas 項目的預設時數：日曆只有標題，看不出份量。課程的每週小功課很多，所以比大綱的預設小得多；
 * 只有專題、文章、報告、匯報、考試才用大綱的預設。學生之後可以改（hoursDefault 會標「預設值」）。
 */
const TINY = /attendance|survey|questionnaire|poll|check-?in|sign[- ]?up|intake|introduc|出席|問卷/i; // 半小時
const SMALL = /reflection|peer|discussion|forum|post|journal|participation|feedback|反思|討論/i; // 1 小時
export function canvasHours(title, key) {
  const t = String(title || '');
  if (TINY.test(t)) return 0.5; // 先看這些字：「Reflection Report」「Project Peer Evaluation」是小功課
  if (SMALL.test(t)) return 1;
  if (key === 'exam' || ['project', 'essay', 'report', 'presentation'].includes(key)) return typeHours(key);
  if (key === 'quiz') return 1;
  return 2; // 一般功課、Lab
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
      plan: { kind: 'task', title: ev.title, key, date: ev.date, min: ev.min ?? 1439, hours: canvasHours(ev.title, key) }, state: 'pencil',
    });
  }
  return [...by].map(([course, items]) => ({ course, items: items.sort((a, b) => a.plan.date.localeCompare(b.plan.date) || a.plan.min - b.plan.min) }));
}

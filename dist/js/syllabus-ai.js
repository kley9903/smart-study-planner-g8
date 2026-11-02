// 自己的大綱 → Dify「課程資料整理」工作流程（經伺服器端 /api/syllabus 轉接，金鑰不在網頁裡）→ 待核對的項目。
// 每一項附 plan：確認後變成任務（{ kind: 'task' }）或沒空時段（{ kind: 'busy' }）；沒有 plan 的只作記錄。
import { L } from './i18n.js';

/** 伺服器（Dify 雲端）接受的單檔上限 */
export const AI_MAX_MB = 15;

/**
 * 把大綱檔案交給 AI 整理（貼上的文字存成 .txt，以文字送出）。成功回傳 Dify 的課程 JSON；
 * 失敗丟出帶 reason 的錯誤：'too-big'、'no-key'（伺服器未設定金鑰）、'offline'、'dify'、'invalid'。
 */
export async function readSyllabus(file, { fetcher = fetch } = {}) {
  if (file.size > AI_MAX_MB * 1024 * 1024) throw Object.assign(new Error('too big'), { reason: 'too-big' });
  const body = new FormData();
  if (file.type.startsWith('text/')) body.append('text', await file.text());
  else body.append('file', file, file.name);
  let res;
  try {
    res = await fetcher('/api/syllabus', { method: 'POST', body });
  } catch (cause) {
    throw Object.assign(new Error('offline', { cause }), { reason: 'offline' });
  }
  const out = await res.json().catch(() => null);
  if (!out) throw Object.assign(new Error(`HTTP ${res.status}`), { reason: res.status === 404 ? 'no-server' : 'dify' });
  if (!out.ok) throw Object.assign(new Error(out.message || 'failed'), { reason: out.reason || 'dify' });
  return out.result;
}

const TYPES = {
  class: ['上課', 'Class', 0], requirement: ['要求', 'Requirement', 0],
  assignment: ['功課', 'Assignment', 6], homework: ['功課', 'Assignment', 6], exam: ['考試', 'Exam', 8], quiz: ['測驗', 'Quiz', 3],
  test: ['測驗', 'Test', 3], report: ['報告', 'Report', 6], project: ['專題', 'Project', 6], presentation: ['匯報', 'Presentation', 4],
  lab: ['Lab', 'Lab', 3], essay: ['文章', 'Essay', 6], other: ['其他', 'Other', 4],
};
const keyOf = (t) => { const k = String(t || '').toLowerCase(); return TYPES[k]?.[2] ? k : 'other'; };
/** 項目類型的名稱（跟著目前的介面語言） */
export const typeLabel = (key) => { const [zh, en] = TYPES[key] || TYPES.other; return L(zh, en); };
const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toMin = (hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const daysText = (days) => L(`每週${days.map((d) => DAY_ZH[d]).join('、')}`, days.map((d) => DAY_EN[d]).join(', '));

/** 從「Monday and Wednesday」「週一、三」「Tue/Thu」之類的文字找出星期（0 = 星期日）。 */
export function parseDays(text = '') {
  const found = new Set();
  const s = String(text);
  [/\bsun/i, /\bmon/i, /\btue/i, /\bwed/i, /\bthu/i, /\bfri/i, /\bsat/i].forEach((re, d) => { if (re.test(s)) found.add(d); });
  for (const m of s.matchAll(/(?:週|周|星期|禮拜)([一二三四五六日天])((?:[、,，和及與\s]*[一二三四五六日天](?![一二三四五六日天]))*)/g)) {
    for (const ch of (m[1] + m[2]).replace(/[^一二三四五六日天]/g, '')) found.add(ch === '天' ? 0 : DAY_ZH.indexOf(ch));
  }
  return [...found].sort((a, b) => a - b);
}

const dateIn = (text) => {
  const d = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  return d ? `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}` : null;
};
/** 讀回使用者在核對表改過的「日期／時間」文字。回傳新的 plan，讀不懂回傳 null。 */
export function parseWhen(plan, text) {
  if (plan?.kind === 'busy') {
    const t = /(\d{1,2}:\d{2})\s*[–\-~至到]\s*(\d{1,2}:\d{2})/.exec(text);
    if (!t) return null;
    const start = toMin(t[1]), end = toMin(t[2]);
    if (!(end > start)) return null;
    if (plan.type === 'single') { const date = dateIn(text); return date ? { ...plan, date, start, end } : null; }
    const days = parseDays(text);
    return days.length ? { ...plan, days, start, end } : null;
  }
  const date = dateIn(text);
  if (!date) return null;
  const time = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\D+(\d{1,2}:\d{2})/.exec(text);
  const min = time ? toMin(time[1]) : plan?.min ?? 1439;
  return { ...(plan || { kind: 'task' }), date, min };
}
export function whenText(plan) {
  if (plan.kind === 'busy') return `${plan.type === 'single' ? plan.date : daysText(plan.days)} ${hm(plan.start)}–${hm(plan.end)}`;
  return `${plan.date} ${hm(plan.min)}`;
}

/**
 * Dify 的課程 JSON → { course, items, notes }。items 都是 'pencil'（待核對），
 * 只存跟語言無關的資料；畫面用 rowText(item) 取得目前語言的文字。
 */
export function toItems(result) {
  const r = result || {};
  const course = r.course?.code || r.course?.name || '';
  const facts = r.facts || [];
  const missing = r.missing_information || [];
  const sourceOf = (prefix) => {
    const f = facts.filter((x) => x.path?.startsWith(prefix));
    const page = f.find((x) => x.page != null)?.page;
    const quote = f.map((x) => x.quote).filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
    return { src: page != null ? `p.${page}` : '', quote };
  };
  const used = new Set();
  const reasonsFor = (prefix) => missing.filter((m) => m.path?.startsWith(prefix) && used.add(m)).map((m) => m.reason || m.question).filter(Boolean);
  const perComponent = {};
  (r.tasks || []).forEach((t) => { perComponent[t.component_id] = (perComponent[t.component_id] || 0) + 1; });
  const items = [];

  (r.course_events || []).forEach((ev, i) => {
    const prefix = `/course_events/${i}/`;
    const start = toMin(ev.start_time), end = toMin(ev.end_time);
    const days = parseDays(ev.recurrence_raw || ev.date_raw || '');
    const label = [course, ev.title].filter(Boolean).join(' ');
    let plan = null;
    if (start != null && end > start && ev.date) plan = { kind: 'busy', type: 'single', date: ev.date, start, end, label };
    else if (start != null && end > start && days.length) plan = { kind: 'busy', type: 'weekly', days, start, end, label };
    items.push({
      id: `ev-${i}`, key: 'class', what: [ev.title, ev.location].filter(Boolean).join(' · '), raw: ev.recurrence_raw || ev.date_raw || '',
      ...sourceOf(prefix), reasons: reasonsFor(prefix), flag: plan ? null : 'no-day', plan, state: 'pencil',
    });
  });

  (r.tasks || []).forEach((t, i) => {
    const prefix = `/tasks/${i}/`;
    const key = keyOf(t.type);
    const exam = /exam|quiz|test/i.test(t.type || '');
    const reasons = reasonsFor(prefix);
    const min = toMin(t.due_time) ?? (exam ? 540 : 1439);
    const flag = !t.due_date ? (reasons.length ? null : 'no-date') : t.due_time ? null : 'no-time';
    // 一個評核項目拆成幾份（例如 proposal + final report）時，比重屬於整個項目，不放到每一份。
    const weight = t.weight_percent ?? (perComponent[t.component_id] === 1 ? (r.assessment_components || []).find((c) => c.id === t.component_id)?.weight_percent : null);
    items.push({
      id: `task-${i}`, key, what: t.title, group: !!t.group_work, raw: t.due_raw || '', weight: weight != null ? `${weight}%` : '',
      ...sourceOf(prefix), reasons, flag, hoursDefault: true,
      plan: { kind: 'task', title: t.title, key, date: t.due_date || null, min, hours: TYPES[key][2] }, state: 'pencil',
    });
  });

  (r.course_requirements || []).forEach((req, i) => {
    const text = typeof req === 'string' ? req : req.text || req.title || req.description || req.requirement || JSON.stringify(req);
    items.push({ id: `req-${i}`, key: 'requirement', what: text, raw: '', ...sourceOf(`/course_requirements/${i}/`), reasons: [], flag: null, plan: null, state: 'pencil' });
  });

  const describe = (x) => (typeof x === 'string' ? x : x?.reason || x?.message || x?.description || x?.question || JSON.stringify(x));
  const notes = [...missing.filter((m) => !used.has(m)), ...(r.conflicts || []), ...(r.warnings || [])].map(describe).filter(Boolean);
  return { course, items, notes };
}

/** 一個 AI 項目在核對表上顯示的文字（目前的介面語言）。 */
export function rowText(it) {
  const p = it.plan;
  const dated = p && (p.kind === 'busy' || p.date);
  const flag = {
    'no-time': p && L(`大綱沒寫時間，暫定 ${hm(p.min)}。`, `No time given; set to ${hm(p.min)} for now.`),
    'no-date': L('大綱沒寫日期，確認後只作記錄；知道日期後按「改」填上。', 'No date given; if confirmed it is kept as a note. Use Edit once you know the date.'),
    'no-day': L('看不出是星期幾或幾點，確認後只作記錄，不會加入沒空的時間。', 'Cannot tell the day or time; if confirmed it is kept as a note only.'),
  }[it.flag];
  const task = p?.kind === 'task' && p.date;
  return {
    type: typeLabel(it.key),
    what: it.what + (it.group ? L('（小組）', ' (group)') : ''),
    when: dated ? whenText(p) : it.raw || '—',
    src: it.src || (it.quote ? L('原文', 'Quote') : '—'),
    hours: task ? L(`${p.hours} 小時`, `${p.hours} hours`) : '—',
    hoursNote: task && it.hoursDefault ? L('預設值，請按需要修改', 'default, change as needed') : '',
    warn: [...(it.reasons || []), flag].filter(Boolean).join(' ') || undefined,
  };
}

/** 讀「6 小時」「6.5h」之類的時數文字，讀不懂回傳 null。 */
export function parseHours(text) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(text || ''));
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n <= 200 ? n : null;
}

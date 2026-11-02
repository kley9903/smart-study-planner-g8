// 自己的大綱 → Dify「課程資料整理」工作流程（經伺服器端 /api/syllabus 轉接，金鑰不在網頁裡）→ 待核對的項目。
// 每一項附 plan：確認後變成任務（{ kind: 'task' }）或沒空時段（{ kind: 'busy' }）；沒有 plan 的只作記錄。
import { L } from './i18n.js';

/** 伺服器（Dify 雲端）接受的單檔上限 */
export const AI_MAX_MB = 15;

/** AI 讀大綱的步驟，順序同伺服器送來的 stage */
export const STAGES = ['read', 'extract', 'check', 'tidy'];
export const stageLabel = (stage) => ({
  read: L('讀取大綱', 'Reading the syllabus'),
  extract: L('AI 找出功課、考試和上課時間', 'AI finds assignments, exams and class times'),
  check: L('逐項核對比重和日期', 'Checking weights and dates one by one'),
  tidy: L('整理結果', 'Putting the results together'),
}[stage]);

/**
 * 把大綱檔案交給 AI 整理（貼上的文字存成 .txt，以文字送出）。onStage(stage) 在 AI 走到下一步時呼叫。
 * 成功回傳 Dify 的課程 JSON；失敗丟出帶 reason 的錯誤：'too-big'、'no-key'（伺服器未設定金鑰）、'offline'、'dify'、'invalid'。
 */
export async function readSyllabus(file, { fetcher = fetch, onStage = () => {} } = {}) {
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
  let out = null;
  if ((res.headers.get('Content-Type') || '').includes('ndjson')) {
    try {
      await eachLine(res.body, (msg) => { if (msg.stage) onStage(msg.stage); else out = msg; });
    } catch (cause) {
      throw Object.assign(new Error('offline', { cause }), { reason: 'offline' });
    }
  } else {
    out = await res.json().catch(() => null);
  }
  if (!out) throw Object.assign(new Error(`HTTP ${res.status}`), { reason: res.status === 404 ? 'no-server' : 'dify' });
  if (!out.ok) throw Object.assign(new Error(out.message || 'failed'), { reason: out.reason || 'dify' });
  return out.result;
}

async function eachLine(body, fn) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const take = (line) => { if (line.trim()) fn(JSON.parse(line)); };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(take);
  }
  take(buffer);
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
  const weights = (r.assessment_components || []).map((c) => c.weight_percent).filter((w) => typeof w === 'number');
  return { course, items, notes, weightTotal: weights.length ? weights.reduce((a, b) => a + b, 0) : null };
}

const EXAMS = new Set(['exam', 'quiz', 'test']);

/**
 * 檢查視窗的逐項清單。stage 是這一行在 AI 哪一步進行（用來轉圈）；
 * state 是讀完後的結果：'ok'（找到／對得上）、'warn'（要核對）、'none'（沒找到）。
 */
export function checklist(doc) {
  const items = doc.items.filter((i) => i.state !== 'erased');
  const count = (pick) => items.filter(pick).length;
  const found = (n, unit) => (n ? { state: 'ok', text: L(`找到 ${n} ${unit[0]}`, `${n} found`) } : { state: 'none', text: L('沒找到', 'None found') });
  const work = count((i) => i.plan?.kind === 'task' && !EXAMS.has(i.key));
  const exams = count((i) => EXAMS.has(i.key));
  const classes = count((i) => i.key === 'class');
  const undated = count((i) => i.plan?.kind === 'task' && !i.plan.date);
  const total = doc.weightTotal;
  const gaps = (doc.notes || []).length;
  return [
    { stage: 'read', label: L('讀取大綱', 'Read the syllabus'), state: 'ok', text: L('完成', 'Done') },
    { stage: 'extract', label: L('功課', 'Assignments'), ...found(work, ['項']) },
    { stage: 'extract', label: L('考試／測驗', 'Exams and quizzes'), ...found(exams, ['項']) },
    { stage: 'extract', label: L('上課時間', 'Class times'), ...found(classes, ['段']) },
    { stage: 'check', label: L('比重', 'Weights'), ...(total == null ? { state: 'none', text: L('大綱沒寫比重', 'No weights given') }
      : Math.abs(total - 100) <= 0.5 ? { state: 'ok', text: L(`合計 ${total}%`, `${total}% in total`) }
        : { state: 'warn', text: L(`合計 ${total}%，不是 100%`, `${total}% in total, not 100%`) }) },
    { stage: 'check', label: L('日期', 'Dates'), ...(undated ? { state: 'warn', text: L(`${undated} 項沒有日期`, `${undated} without a date`) } : { state: 'ok', text: L('都有日期', 'All dated') }) },
    { stage: 'check', label: L('原文對照', 'Against the syllabus'), ...(gaps ? { state: 'warn', text: L(`${gaps} 處要核對`, `${gaps} to check`) } : { state: 'ok', text: L('沒有發現對不上的地方', 'Nothing out of line') }) },
  ];
}
/**
 * AI 讀完一份大綱的報告：have（找到了甚麼）和 missing（沒有或要核對甚麼），都是目前語言的文字。
 * 已刪除的項目不算。missing 包括 Dify 的硬性檢查（原文有、結果沒有）和衝突。
 */
export function report(doc) {
  const items = doc.items.filter((i) => i.state !== 'erased');
  const exams = items.filter((i) => EXAMS.has(i.key));
  const work = items.filter((i) => i.plan?.kind === 'task' && !EXAMS.has(i.key));
  const classes = items.filter((i) => i.key === 'class');
  const have = [
    L(`功課 ${work.length} 項`, `${work.length} assignment${work.length === 1 ? '' : 's'}`),
    L(`考試／測驗 ${exams.length} 項`, `${exams.length} exam${exams.length === 1 ? '' : 's'} or quiz${exams.length === 1 ? '' : 'zes'}`),
    L(`上課時間 ${classes.length} 段`, `${classes.length} class time${classes.length === 1 ? '' : 's'}`),
  ];
  if (doc.weightTotal != null) have.push(L(`比重合計 ${doc.weightTotal}%`, `Weights add up to ${doc.weightTotal}%`));
  const missing = [];
  if (!classes.length) missing.push(L('沒找到上課時間', 'No class times found'));
  if (!exams.length) missing.push(L('沒找到考試或測驗', 'No exams or quizzes found'));
  if (doc.weightTotal != null && Math.abs(doc.weightTotal - 100) > 0.5) {
    missing.push(L(`比重合計 ${doc.weightTotal}%，不是 100%：可能漏了評核項目`, `Weights add up to ${doc.weightTotal}%, not 100%: an assessment may be missing`));
  }
  for (const it of items) {
    if (it.plan?.kind === 'task' && !it.plan.date) missing.push(L(`${it.what}：沒有日期（${it.raw || '大綱沒寫'}）`, `${it.what}: no date (${it.raw || 'not in the syllabus'})`));
    else if (it.flag === 'no-time') missing.push(L(`${it.what}：沒寫時間，暫定 ${hm(it.plan.min)}`, `${it.what}: no time, set to ${hm(it.plan.min)}`));
    else if (it.flag === 'no-day') missing.push(L(`${it.what}：看不出星期幾或時間`, `${it.what}: day or time unclear`));
  }
  return { have, missing: [...missing, ...(doc.notes || [])] };
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

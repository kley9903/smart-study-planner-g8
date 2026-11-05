// AI 助手問學生：把核對表「要你補」的項目變成一題一題的問題（遊戲式對話框用）。
// 一項缺幾樣就問幾題，次序是截止日期 → 要做甚麼 → 要多久；每題都可以「之後再說」。
import { L } from './i18n.js';
import { report } from './syllabus-ai.js';

const EXAMS = new Set(['exam', 'quiz', 'test']);

/** 這份資料要問的問題，按核對表的次序。 */
export function questionsFor(doc) {
  const fill = report({ ...doc, notes: [], weightTotal: 100 }).find((g) => g.kind === 'fill');
  if (!fill) return [];
  const out = [];
  for (const line of fill.lines) {
    const it = doc.items.find((x) => x.id === line.item);
    if (!it) continue;
    for (const field of line.need) out.push(question(it, field));
  }
  return out;
}

function question(it, field) {
  const base = { item: it.id, what: it.what, field, later: true };
  if (field === 'date') {
    return { ...base, typed: true, choices: [], placeholder: L('例如 11/25 10:00', 'e.g. 11/25 10:00'),
      text: L(`「${it.what}」甚麼時候截止？${it.raw ? `原文只寫了「${it.raw}」。` : ''}`, `When is "${it.what}" due?${it.raw ? ` The source only says "${it.raw}".` : ''}`) };
  }
  if (field === 'scope') {
    return { ...base, typed: true, choices: [], placeholder: L('例如：第 4–5 章，10 題選擇題', 'e.g. chapters 4–5, 10 multiple-choice questions'),
      text: L(`「${it.what}」要做甚麼？範圍、題數或字數都可以。`, `What does "${it.what}" involve? Scope, number of questions or words.`) };
  }
  const exam = EXAMS.has(it.key);
  return { ...base, typed: true, placeholder: L('例如 1.5', 'e.g. 1.5'),
    choices: [30, 60, 120, 180].map((m) => ({ value: m, label: m < 60 ? L(`${m} 分鐘`, `${m} min`) : L(`${m / 60} 小時`, `${m / 60} hour${m === 60 ? '' : 's'}`) })),
    text: exam
      ? L(`「${it.what}」大約要溫習多久？`, `About how long do you need to prepare for "${it.what}"?`)
      : L(`「${it.what}」大約要做多久？`, `About how long will "${it.what}" take?`) };
}


/** 學生打的截止時間：11/25、2026-11-25、11月25日，後面可加 10:00 或 1000。讀不懂回傳 null。 */
export function readDue(text, year) {
  const s = String(text || '').trim().replace(/[年月]/g, '/').replace(/日/g, ' ').replace(/：/g, ':');
  const m = s.match(/^(?:(\d{4})[/.-])?(\d{1,2})[/.-](\d{1,2})\s*(?:(\d{1,2}):?(\d{2}))?$/);
  if (!m) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const y = Number(m[1] || year), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  const h = m[4] == null ? null : Number(m[4]), mi = m[5] == null ? null : Number(m[5]);
  if (h != null && (h > 23 || mi > 59)) return null;
  return { date: `${y}-${pad(mo)}-${pad(d)}`, min: h == null ? null : h * 60 + mi };
}

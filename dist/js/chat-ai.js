// AI 助手 Chatflow：每句話附上的計劃摘要，和把 Chatflow 的 action 變成網站的建議。
// 摘要要小（每句都送），只放回答問題和判斷 action 需要的東西；id 讓 Chatflow 指明是哪一項。
import { weekday } from './time.js';
import { questionsFor } from './ask.js';
import { getLang } from './i18n.js';

const PROGRESS = { todo: 'todo', doing: 'doing', done: 'done' };

/** 網站狀態 → Chatflow 的 context。 */
export function toContext(s) {
  const stepOf = (id) => { for (const t of s.tasks) { const st = t.steps.find((x) => x.id === id); if (st) return [t, st]; } return [null, null]; };
  const toFill = [];
  for (const d of s.docs || []) {
    if (!d.own) continue;
    const byItem = new Map();
    for (const q of questionsFor(d)) byItem.set(q.item, [...(byItem.get(q.item) || []), q.field]);
    for (const [item, need] of byItem) toFill.push({ doc: d.id, item, what: d.items.find((x) => x.id === item)?.what || '', need });
  }
  return {
    lang: getLang() === 'zh' ? 'zh' : 'en', // 回覆用網站現在選的語言
    now: { date: s.today, min: s.now, weekday: weekday(s.today) },
    tasks: s.tasks.map((t) => ({
      id: t.id, title: t.title, course: s.courses?.[t.course]?.name || '', due: { ...t.due },
      steps: t.steps.filter((st) => !st.dropped).map((st) => ({
        id: st.id, title: st.title, min: st.min, progress: PROGRESS[st.progress] || 'todo',
        ...(st.progress === 'doing' && st.remain ? { remain_min: st.remain } : {}),
      })),
    })),
    blocks: s.blocks.filter((b) => b.date >= s.today).map((b) => {
      const [t, st] = stepOf(b.step);
      return { date: b.date, start: b.start, end: b.end, task: t?.title || '', step: st?.title || '' };
    }),
    busy: s.unavailable.map((r) => ({ id: r.id, type: r.type, ...(r.type === 'weekly' ? { days: r.days } : { date: r.date }), start: r.start, end: r.end, label: r.label || '' })),
    sleep: { ...s.sleep },
    to_fill: toFill,
    // 最近幾句對話（純文字）：學生說「好，也記下」時，AI 才知道指的是甚麼
    recent: (s.thread || []).filter((n) => n.who === 'me' ? n.text : n.html)
      .map((n) => ({ who: n.who === 'me' ? 'me' : 'ai', text: (n.text || n.html.replace(/<[^>]+>/g, '')).trim().slice(0, 300) }))
      .slice(-6),
  };
}

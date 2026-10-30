// 示範情境：AI 助手預先寫好的回覆和建議改動（中英兩版：L('中文', 'English')）。
// 原型沒有連接 AI；這裡只認得幾句示範句子，其他句子會如實說明未能理解。
// 商科組員可以在這裡改 AI 的措辭、取捨方案和代價說明。
import { L } from './i18n.js';

export const CHIPS = {
  get hero() { return L('明天要全日幫家人搬屋', 'I have to help my family move house all day tomorrow'); },
  get done14() { return L('PS4 題 1–4 昨晚做完了', 'I finished PS4 Q1–4 last night'); },
  get essay() { return L('Essay 2 可以遲些才開始嗎？', 'Can I start Essay 2 later?'); },
};

export function matchScenario(text) {
  const t = text.replace(/\s+/g, '');
  if (/搬屋|搬家|mov(e|ing)house|moving/i.test(t)) return 'hero';
  if (/essay|論文|文章/i.test(t)) return 'essay';
  if (/(題1|1[–-]4|題一|q1)/i.test(t) && /(做完|完成|搞掂|搞定|做好|finish|done|complete)/i.test(t)) return 'done14';
  return null;
}

/* ------------------------------------------------------------------
   情境一：明天臨時要全日搬屋 → 時間不足 → 由你選取捨方案
   ------------------------------------------------------------------ */

const OPTIONS = {
  A: () => ({
    id: 'A', icon: 'moon', title: L('今晚遲 1 小時睡', 'Sleep 1 hour later tonight'),
    gain: L('今晚 23:00–01:30 一次做完題 9–12。', 'Finish Q9–12 in one go tonight, 23:00–01:30.'),
    cost: [L('今晚只睡 7 小時；明天全日搬屋，可能會較累。', 'Only 7 hours of sleep before a full day of moving; you may be tired.'),
      L('只限 11月5日晚上；每晚 00:30 睡的設定不變。', 'Only the night of Nov 5; your usual 00:30 bedtime stays the same.')],
  }),
  B: () => ({
    id: 'B', icon: 'scissors', title: L('簡化 PS4', 'Simplify PS4'),
    gain: L('省下 1 小時，其餘題目在截止前做得完。', 'Saves 1 hour; everything else is done before the deadline.'),
    cost: [L('不做 Bonus 題：失去 Bonus 加分（示範大綱：最多 +5 分）。', 'Skip the bonus question: lose the bonus marks (demo syllabus: up to +5).'),
      L('題 12 只寫主要步驟：可能被扣步驟分。', 'Q12 with main steps only: you may lose method marks.')],
    note: L('其餘題目的要求不變。', 'All other questions stay as required.'),
  }),
  C: () => ({
    id: 'C', icon: 'clock', title: L('搬屋當天抽 1 小時', 'Take 1 hour out of moving day'),
    gain: L('明天 13:00–14:00 做完題 12，不用遲睡。', 'Finish Q12 tomorrow 13:00–14:00, no late night.'),
    cost: [L('要在搬屋期間抽空；到時抽不到的話，題 12 仍會未完成。', 'You need a break during the move; if it does not happen, Q12 stays unfinished.')],
  }),
  D: () => ({
    id: 'D', icon: 'eye', title: L('先不處理', 'Leave it for now'),
    gain: L('其他改動照建議，PS4 保持現況。', 'Apply the other changes; PS4 stays as it is.'),
    cost: [L('題 12 未有時間（約 1 小時），截止前可能做不完。', 'Q12 has no time slot (about 1 hour) and may not be done by the deadline.')],
  }),
};

export const HERO = {
  id: 'hero',
  task: 'ps4',
  need: 180,       // 題 9–12（150 分鐘）＋ Bonus（30 分鐘）
  free: 120,       // 截止前可用：今天 18:00–18:30 及 23:00–00:30
  get intro() {
    return L(
      '收到：<b>11月6日（五）全日幫家人搬屋</b>。那天原本有 3 段讀書時間，我建議把市場報告和程式期中移到週六。'
      + '<br>但 <b>PS4 明晚 23:59 截止</b>，截止前的空檔（不計少於半小時的零碎時間）只有 2 小時，題 9–12 仍差 <b>1 小時</b>。'
      + '<br>請先選一個做法，再確認。確認之前，時間表不會改變。',
      'Got it: <b>helping your family move all day on Fri, Nov 6</b>. That day had 3 study sessions; I suggest moving the marketing report and the programming midterm to Saturday.'
      + '<br>But <b>PS4 is due tomorrow at 23:59</b>. Before then there are only 2 hours free (ignoring gaps under 30 minutes), so Q9–12 is still <b>1 hour</b> short.'
      + '<br>Pick an option first, then confirm. Nothing on the timetable changes until you confirm.',
    );
  },
  get options() { return ['A', 'B', 'C', 'D'].map((k) => OPTIONS[k]()); },
};

export function heroMissing(option) {
  return option === 'A' || option === 'B' || option === 'C' ? 0 : 60;
}

/** 按所選方案，回傳整份建議的改動 */
export function heroChanges(option) {
  const day = '2026-11-06';
  const tonight = '2026-11-05';
  const move = L('幫家人搬屋', 'Helping family move');
  const hatch = option === 'C'
    ? [
      { kind: 'hatch', rule: { id: 'u-move-a', type: 'single', date: day, start: 510, end: 780, label: move, src: 'me' } },
      { kind: 'hatch', rule: { id: 'u-move-b', type: 'single', date: day, start: 840, end: 1440, label: move, src: 'me' }, note: L('中午 13:00–14:00 留空', '13:00–14:00 left free') },
    ]
    : [{ kind: 'hatch', rule: { id: 'u-move', type: 'single', date: day, start: 510, end: 1440, label: move, src: 'me' } }];

  const moves = [
    { kind: 'move', block: 'b2', to: { date: '2026-11-07', start: 540, end: 600 }, reason: L('程式期中在 11月12日，可以讓位給今晚更急的 PS4；改到週六上午，連著 Lab 3–4 一起做。', 'The midterm is on Nov 12, so it can make room for the more urgent PS4 tonight; moved to Saturday morning next to labs 3–4.') },
    { kind: 'move', block: 'b5', to: { date: '2026-11-07', start: 1200, end: 1320 }, reason: L('市場報告 11月13日才截止，改到週六晚上做資料蒐集。', 'The marketing report is not due until Nov 13; research moves to Saturday evening.') },
  ];

  const bonusMove = { kind: 'move', block: 'b4', to: { date: tonight, start: 1080, end: 1110 }, reason: L('今天晚飯前剩下的半小時，剛好做 Bonus 題。', 'The half hour before dinner today fits the bonus question.') };

  if (option === 'A') {
    return [
      ...hatch, ...moves, bonusMove,
      { kind: 'sleep', night: tonight, start: 90 },
      { kind: 'move', block: 'b3', to: { date: tonight, start: 1380, end: 1530 }, reason: L('你同意今晚遲 1 小時睡，題 9–12 可以一次做完。', 'You agreed to sleep an hour later tonight, so Q9–12 fit in one go.') },
    ];
  }
  if (option === 'B') {
    return [
      ...hatch, ...moves,
      { kind: 'remove', block: 'b4', step: 'ps4-4', reason: L('簡化：不做 Bonus 題。', 'Simplified: skip the bonus question.') },
      { kind: 'split', block: 'b3', to: [{ date: tonight, start: 1080, end: 1110 }, { date: tonight, start: 1380, end: 1470 }], reason: L('題 12 只寫主要步驟，2 小時分兩段做完。', 'Q12 with main steps only: 2 hours in two sessions.') },
      { kind: 'estimate', step: 'ps4-3', min: 120, note: L('題 12 只寫主要步驟', 'Q12 main steps only') },
    ];
  }
  if (option === 'C') {
    return [
      ...hatch, ...moves, bonusMove,
      { kind: 'split', block: 'b3', to: [{ date: tonight, start: 1380, end: 1470 }, { date: day, start: 780, end: 840 }], reason: L('今晚做 1.5 小時，題 12 留到搬屋中午抽出的 1 小時。', '1.5 hours tonight; Q12 goes into the hour taken out of moving day.') },
    ];
  }
  return [
    ...hatch, ...moves, bonusMove,
    { kind: 'move', block: 'b3', to: { date: tonight, start: 1380, end: 1470 }, short: 60, reason: L('截止前唯一較長的空檔；只放得下 1.5 小時。', 'The only longer free slot before the deadline; it fits just 1.5 hours.') },
  ];
}

/* ------------------------------------------------------------------
   情境二：回報昨晚的進度
   ------------------------------------------------------------------ */
export const CHECKIN = {
  get done() { return L('記下了：<b>PS4 題 1–4 完成</b>。這是你回報的進度，直接生效，不需要再確認。', 'Noted: <b>PS4 Q1–4 done</b>. Progress you report takes effect right away, no confirmation needed.'); },
  get partialAsk() { return L('明白。還差多少？', 'OK. How much is left?'); },
  get partial30() { return L('今天 18:00–18:30 剛好有半小時，我建議放「題 1–4 餘下部分」（時間表上的虛線）。確認後才生效。', 'There is half an hour free today, 18:00–18:30. I suggest the rest of Q1–4 there (dashed on the timetable). It takes effect once you confirm.'); },
  get partial60() { return L('截止前只剩兩段各半小時的空檔：今天 18:00–18:30 及 00:00–00:30。比較零碎，但都排在 PS4 截止前。確認後才生效。', 'Only two half-hour gaps are left before the deadline: today 18:00–18:30 and 00:00–00:30. Fragmented, but both are before PS4 is due. They take effect once you confirm.'); },
  get none() { return L('明白，題 1–4 仍需 1.5 小時，截止前的空檔不夠，需要取捨。<br>示範版沒有預備這個情境；可以試「明天要全日幫家人搬屋」，看看取捨怎樣呈現。', 'OK. Q1–4 still needs 1.5 hours and there is not enough free time before the deadline, so something has to give.<br>The demo does not include this case; try "I have to help my family move house all day tomorrow" to see how trade-offs are shown.'); },
};

/* ------------------------------------------------------------------
   情境三：較遠的 Essay 想遲些開始
   ------------------------------------------------------------------ */
export const ESSAY = {
  get reply() {
    return L(
      '可以。Essay 2 在 <b>11月20日（五）</b>截止。如果把「構思大綱」移到 11月16日（一），這 7 日會少 1 小時；'
      + '代價是 11月12–20日之間要做完全部 8 小時，其間還有市場報告收尾。<br>我在時間表用虛線標了出來，你確認才會改。',
      'Yes. Essay 2 is due <b>Fri, Nov 20</b>. Moving the outline to Mon, Nov 16 frees 1 hour in these 7 days. '
      + 'The cost: all 8 hours must fit between Nov 12 and 20, alongside finishing the marketing report.<br>It is marked with dashes on the timetable; nothing changes until you confirm.',
    );
  },
  get changes() { return [{ kind: 'defer', block: 'b11', toDate: '2026-11-16', reason: L('延到下週一；具體時間在下次排程時再確認。', 'Moved to next Monday; the exact time is set in the next planning round.') }]; },
};

export function fallbackText() {
  return L('這是示範版，AI 助手沒有連接真正的 AI，所以未能理解這句。可以試下面的示範句子：',
    'This is the demo: the assistant is not connected to a real AI, so it cannot understand that. Try one of the sample sentences below:');
}

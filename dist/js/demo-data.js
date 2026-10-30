// 示範資料：全部是虛構內容，只用來展示介面。中英兩版都寫在這裡：L('中文', 'English')。
// 想改課程、功課、上課時間或 AI 回覆的示範句子，改這個檔案即可，不用懂其他程式。
//
// 時間寫法：分鐘，由當日 00:00 起計。例：16:00 = 960，23:00 = 1380，00:30（過了午夜）= 1470。
// 不可用時段 days：0=週日 1=週一 … 6=週六。
import { L } from './i18n.js';

export const DEMO_TODAY = '2026-11-05';   // 示範中的「今天」（週四）
export const DEMO_NOW = 15 * 60 + 40;     // 示範中的「現在」15:40
export const WINDOW_DAYS = 7;             // 每次排未來 7 日
export const HORIZON_DAYS = 20;           // 「遠方」顯示到 11/24

export function courses() {
  return {
    stat: { id: 'stat', name: L('統計學', 'Statistics'), ink: 'blue' },
    mktg: { id: 'mktg', name: L('市場學', 'Marketing'), ink: 'amber' },
    prog: { id: 'prog', name: L('程式設計', 'Programming'), ink: 'green' },
    eng: { id: 'eng', name: L('學術英文', 'Academic English'), ink: 'plum' },
  };
}

function tasks() {
  return [
    {
      id: 'ps4', course: 'stat', title: 'Problem Set 4', short: 'PS4', kind: L('功課', 'Assignment'),
      due: { date: '2026-11-06', min: 1439 }, weight: L('佔 5%', '5% of grade'), source: { doc: 'stat', page: 3 },
      estimateBy: 'ai', estimateConfirmed: true,
      steps: [
        { id: 'ps4-1', title: L('題 1–4', 'Q1–4'), min: 90, progress: 'todo' },
        { id: 'ps4-2', title: L('題 5–8', 'Q5–8'), min: 120, progress: 'todo' },
        { id: 'ps4-3', title: L('題 9–12', 'Q9–12'), min: 150, progress: 'todo' },
        { id: 'ps4-4', title: L('Bonus 題', 'Bonus'), min: 30, progress: 'todo' },
      ],
      aiNote: L('題 9–12 涉及迴歸分析，篇幅最長，所以預留了 2.5 小時；Bonus 題不影響基本分，排在最後。',
        'Q9–12 cover regression and are the longest, so I set aside 2.5 hours. The bonus question does not affect the base mark, so it comes last.'),
    },
    {
      id: 'mid', course: 'prog', title: L('期中考', 'Midterm exam'), short: L('程式期中', 'Prog midterm'), kind: L('考試', 'Exam'),
      due: { date: '2026-11-12', min: 630 }, weight: L('佔 20%', '20% of grade'), source: { doc: 'prog', page: 6 },
      estimateBy: 'ai', estimateConfirmed: true,
      steps: [
        { id: 'mid-1', title: L('重做 Lab 1–2', 'Redo Labs 1–2'), min: 60, progress: 'todo' },
        { id: 'mid-2', title: L('重做 Lab 3–4', 'Redo Labs 3–4'), min: 60, progress: 'todo' },
        { id: 'mid-3', title: L('溫 Lecture 1–3 筆記', 'Review lectures 1–3'), min: 90, progress: 'todo' },
        { id: 'mid-4', title: L('溫 Lecture 4–6 筆記', 'Review lectures 4–6'), min: 90, progress: 'todo' },
        { id: 'mid-5', title: L('做一份 past paper', 'Do a past paper'), min: 120, progress: 'todo' },
        { id: 'mid-6', title: L('重溫錯題', 'Go over mistakes'), min: 60, progress: 'todo' },
      ],
      aiNote: L('考試在 11月12日早上，剛好在這 7 日之後。我把 8 小時分成 6 段，最後一晚只重溫錯題。',
        'The exam is on the morning of Nov 12, just after these 7 days. I split 8 hours into 6 sessions; the last evening is only for going over mistakes.'),
    },
    {
      id: 'rep', course: 'mktg', title: L('小組報告', 'Group report'), short: L('市場報告', 'Mktg report'), kind: L('功課', 'Assignment'),
      due: { date: '2026-11-13', min: 1439 }, weight: L('佔 25%', '25% of grade'), source: { doc: 'mktg', page: 5 },
      estimateBy: 'ai', estimateConfirmed: true,
      steps: [
        { id: 'rep-1', title: L('讀個案', 'Read the case'), min: 90, progress: 'done' },
        { id: 'rep-2', title: L('資料蒐集', 'Research'), min: 120, progress: 'todo' },
        { id: 'rep-3', title: L('分析框架', 'Analysis framework'), min: 120, progress: 'todo' },
        { id: 'rep-4', title: L('撰寫負責部分', 'Write my part'), min: 150, progress: 'todo' },
        { id: 'rep-5', title: L('組內校對', 'Team proofread'), min: 60, progress: 'todo', later: L('要等組員交齊，留待下次排程（11月12日後）', 'Waits for teammates; next planning round (after Nov 12)') },
      ],
      aiNote: L('「組內校對」要等組員交齊各自部分，所以沒有排進這 7 日。',
        '"Team proofread" has to wait until everyone hands in their part, so it is not in these 7 days.'),
    },
    {
      id: 'essay', course: 'eng', title: 'Essay 2', short: 'Essay 2', kind: L('功課', 'Assignment'),
      due: { date: '2026-11-20', min: 1439 }, weight: L('佔 20% · 1500 字', '20% · 1,500 words'), source: { doc: 'eng', page: 2 },
      estimateBy: 'ai', estimateConfirmed: true,
      steps: [
        { id: 'essay-1', title: L('構思大綱', 'Outline'), min: 60, progress: 'todo' },
        { id: 'essay-2', title: L('搜集文獻（至少 5 個學術來源）', 'Find sources (5+ academic)'), min: 120, progress: 'todo', later: L('下次排程', 'Next planning round') },
        { id: 'essay-3', title: L('寫初稿', 'First draft'), min: 180, progress: 'todo', later: L('下次排程', 'Next planning round') },
        { id: 'essay-4', title: L('修改及校對', 'Revise and proofread'), min: 120, progress: 'todo', later: L('下次排程', 'Next planning round') },
      ],
      aiNote: L('截止日較遠，但 11月12–13日有考試和報告。先在這 7 日放 1 小時大綱，之後比較從容。',
        'The deadline is further away, but Nov 12–13 has an exam and a report. One hour on the outline now makes later weeks easier.'),
    },
    {
      id: 'quiz', course: 'stat', title: 'Quiz 2', short: 'Quiz 2', kind: L('測驗', 'Quiz'),
      due: { date: '2026-11-19', min: 690 }, weight: L('佔 10%', '10% of grade'), source: { doc: 'stat', page: 4 },
      estimateBy: 'ai', estimateConfirmed: false,
      steps: [
        { id: 'quiz-1', title: L('溫第 7–8 章', 'Review chapters 7–8'), min: 180, progress: 'todo', later: L('下次排程', 'Next planning round') },
      ],
      aiNote: L('這是我從大綱估算的時數，你還未確認。確認後下次排程會用這個數字。',
        'This is my estimate from the syllabus and you have not confirmed it yet. Once confirmed, the next planning round will use it.'),
    },
  ];
}

// 已確認的讀書時段，即示範中已經確認的 7 日計劃。
function blocks() {
  const b = (id, task, step, date, start, end, reason) => ({ id, task, step, date, start, end, reason });
  return [
    b('b1', 'ps4', 'ps4-2', '2026-11-05', 960, 1080, L('PS4 明晚 23:59 截止；這是今天下課後最長的一段空檔。', 'PS4 is due tomorrow 23:59; this is the longest free slot after class today.')),
    b('b2', 'mid', 'mid-1', '2026-11-05', 1380, 1440, L('社團後到睡覺前還有 1.5 小時，先做份量較輕的 Lab，留半小時休息。', '1.5 hours between the club and bedtime: a lighter lab first, with half an hour to rest.')),
    b('b3', 'ps4', 'ps4-3', '2026-11-06', 540, 690, L('導修前有 3 小時，留給 PS4 最長的一部分。', '3 hours before the tutorial, for the longest part of PS4.')),
    b('b4', 'ps4', 'ps4-4', '2026-11-06', 750, 780, L('Bonus 題只需半小時，放在導修和兼職之間。', 'The bonus takes only half an hour, between the tutorial and work.')),
    b('b5', 'rep', 'rep-2', '2026-11-06', 1200, 1320, L('市場報告 11月13日截止；週五晚上空著，先做資料蒐集。', 'The marketing report is due Nov 13; Friday evening is free, so research starts here.')),
    b('b6', 'mid', 'mid-2', '2026-11-07', 600, 660, L('兼職前的上午，接續重做 Lab。', 'Saturday morning before work, continuing the labs.')),
    b('b7', 'rep', 'rep-3', '2026-11-07', 675, 795, L('資料蒐集之後才做分析，趕在兼職前完成。', 'Analysis comes after research, finished before work.')),
    b('b8', 'mid', 'mid-3', '2026-11-08', 600, 690, L('家庭聚餐前的上午。', 'Sunday morning before the family lunch.')),
    b('b9', 'rep', 'rep-4', '2026-11-08', 930, 1080, L('聚餐後到晚飯前有 3.5 小時，用 2.5 小時寫你負責的部分。', '3.5 hours between lunch and dinner; 2.5 of them for your part of the report.')),
    b('b10', 'mid', 'mid-4', '2026-11-09', 1005, 1095, L('下課後溫第二部分筆記。', 'After class, the second half of the notes.')),
    b('b11', 'essay', 'essay-1', '2026-11-09', 1200, 1260, L('Essay 2 在 11月20日截止，但下週較忙，先放 1 小時構思大綱。', 'Essay 2 is due Nov 20, but next week is busy, so one hour on the outline now.')),
    b('b12', 'mid', 'mid-5', '2026-11-10', 945, 1065, L('考試前兩日，做一份完整的 past paper。', 'Two days before the exam: a full past paper.')),
    b('b13', 'mid', 'mid-6', '2026-11-11', 1200, 1260, L('考試前一晚只重溫錯題，不排新內容。', 'The night before the exam is only for mistakes, nothing new.')),
  ];
}

// 不可用時段。type：weekly（每週重複）或 single（只限這天）。src：syllabus（從大綱找到）或 me（你自己加的）。
function unavailable() {
  const w = (id, days, start, end, label, extra = {}) => ({ id, type: 'weekly', days, start, end, label, src: 'me', ...extra });
  const s = (id, date, start, end, label) => ({ id, type: 'single', date, start, end, label, src: 'me' });
  const cls = { src: 'syllabus' };
  const job = L('兼職補習', 'Tutoring job');
  return [
    w('u-dinner', [0, 1, 2, 3, 4, 5, 6], 1110, 1170, L('晚飯', 'Dinner')),
    w('u-stat-lec', [1, 3], 630, 740, L('統計學 上課', 'Statistics lecture'), { ...cls, course: 'stat' }),
    w('u-prog-lec', [1], 870, 980, L('程式設計 上課', 'Programming lecture'), { ...cls, course: 'prog' }),
    w('u-prog-lab', [3], 870, 1040, L('程式設計 Lab', 'Programming lab'), { ...cls, course: 'prog' }),
    w('u-eng', [2, 4], 570, 680, L('學術英文 上課', 'Academic English seminar'), { ...cls, course: 'eng' }),
    w('u-mktg', [2, 4], 810, 920, L('市場學 上課', 'Marketing lecture'), { ...cls, course: 'mktg' }),
    w('u-stat-tut', [5], 690, 740, L('統計學 導修', 'Statistics tutorial'), { ...cls, course: 'stat' }),
    w('u-job-tue', [2], 1170, 1290, job),
    w('u-job-fri', [5], 840, 1020, job),
    w('u-job-sat', [6], 840, 1110, job),
    s('u-club', '2026-11-05', 1170, 1380, L('社團籌備會', 'Club meeting')),
    s('u-family', '2026-11-08', 720, 900, L('家庭聚餐', 'Family lunch')),
  ];
}

// 課程大綱的抽取結果（示範：預先寫好，並非真的分析過 PDF）。state：ink 已確認、pencil 待核對。
function docs() {
  return [
    {
      id: 'stat', course: 'stat', name: L('統計學大綱（示範）.pdf', 'Statistics syllabus (demo).pdf'), pages: 14,
      items: [
        { id: 'stat-1', type: L('上課', 'Class'), what: L('Lecture · 每週一、三', 'Lecture · Mon, Wed'), when: '10:30–12:20', src: 'p.1', state: 'ink' },
        { id: 'stat-2', type: L('導修', 'Tutorial'), what: L('Tutorial · 每週五', 'Tutorial · Fri'), when: '11:30–12:20', src: 'p.1', state: 'ink' },
        { id: 'stat-3', type: L('功課', 'Assignment'), what: 'Problem Set 4', when: L('11月6日（五）23:59', 'Fri, Nov 6 23:59'), weight: '5%', src: 'p.3', hours: L('6.5 小時', '6.5 hours'), hoursNote: L('拆成 4 部分', 'in 4 parts'), state: 'ink' },
        { id: 'stat-4', type: L('測驗', 'Quiz'), what: L('Quiz 2（第 7–8 章）', 'Quiz 2 (chapters 7–8)'), when: L('11月19日（四）11:30', 'Thu, Nov 19 11:30'), weight: '10%', src: 'p.4', hours: L('3 小時', '3 hours'), hoursNote: L('AI 估算', 'AI estimate'), warn: L('大綱沒寫測驗份量，3 小時溫習是我估的，請確認。', 'The syllabus does not say how much the quiz covers; 3 hours is my estimate. Please check.'), state: 'pencil' },
        { id: 'stat-5', type: L('考試', 'Exam'), what: L('期末考', 'Final exam'), when: L('考試周（日期未公布）', 'Exam week (date not announced)'), weight: '40%', src: 'p.4', hours: '—', warn: L('大綱沒有寫明日期，我暫時不會排程；公布後告訴我就可以。', 'No date in the syllabus, so I will not plan for it yet. Tell me once it is announced.'), state: 'pencil' },
      ],
    },
    {
      id: 'mktg', course: 'mktg', name: L('市場學大綱（示範）.pdf', 'Marketing syllabus (demo).pdf'), pages: 9,
      items: [
        { id: 'mktg-1', type: L('上課', 'Class'), what: L('Lecture · 每週二、四', 'Lecture · Tue, Thu'), when: '13:30–15:20', src: 'p.1', state: 'ink' },
        { id: 'mktg-2', type: L('功課', 'Assignment'), what: L('小組報告（個案分析）', 'Group report (case study)'), when: L('11月13日（五）23:59', 'Fri, Nov 13 23:59'), weight: '25%', src: 'p.5', hours: L('9 小時', '9 hours'), hoursNote: L('只計你負責的部分', 'your part only'), state: 'ink' },
        { id: 'mktg-3', type: L('匯報', 'Presentation'), what: L('小組匯報', 'Group presentation'), when: L('11月27日（五）？', 'Fri, Nov 27?'), weight: '15%', src: 'p.5', hours: L('4 小時', '4 hours'), hoursNote: L('AI 估算', 'AI estimate'), warn: L('大綱只寫「第 12 週」，我推斷是 11月27日（五），請核對。', 'The syllabus only says "week 12"; I inferred Fri, Nov 27. Please check.'), state: 'pencil' },
      ],
    },
    {
      id: 'prog', course: 'prog', name: L('程式設計大綱（示範）.pdf', 'Programming syllabus (demo).pdf'), pages: 11,
      items: [
        { id: 'prog-1', type: L('上課', 'Class'), what: L('Lecture · 每週一', 'Lecture · Mon'), when: '14:30–16:20', src: 'p.1', state: 'ink' },
        { id: 'prog-2', type: 'Lab', what: L('Lab · 每週三', 'Lab · Wed'), when: '14:30–17:20', src: 'p.1', state: 'ink' },
        { id: 'prog-3', type: L('考試', 'Exam'), what: L('期中考（Lecture 1–6、Lab 1–4）', 'Midterm (lectures 1–6, labs 1–4)'), when: L('11月12日（四）10:30', 'Thu, Nov 12 10:30'), weight: '20%', src: 'p.6', hours: L('8 小時', '8 hours'), hoursNote: L('溫習，拆成 6 部分', 'revision, in 6 parts'), state: 'ink' },
      ],
    },
    {
      id: 'eng', course: 'eng', name: L('學術英文大綱（示範）.pdf', 'Academic English syllabus (demo).pdf'), pages: 6,
      items: [
        { id: 'eng-1', type: L('上課', 'Class'), what: L('Seminar · 每週二、四', 'Seminar · Tue, Thu'), when: '09:30–11:20', src: 'p.1', state: 'ink' },
        { id: 'eng-2', type: L('功課', 'Assignment'), what: L('Essay 2（1500 字）', 'Essay 2 (1,500 words)'), when: L('11月20日（五）23:59', 'Fri, Nov 20 23:59'), weight: '20%', src: 'p.2', hours: L('8 小時', '8 hours'), hoursNote: L('拆成 4 部分', 'in 4 parts'), state: 'ink' },
        { id: 'eng-3', type: L('要求', 'Requirement'), what: L('Essay 2 至少引用 5 個學術來源', 'Essay 2 must cite at least 5 academic sources'), when: '—', src: 'p.2', hours: '—', state: 'ink' },
      ],
    },
  ];
}

export function createDemoState() {
  return {
    today: DEMO_TODAY,
    now: DEMO_NOW,
    courses: courses(),
    tasks: tasks(),
    blocks: blocks(),
    unavailable: unavailable(),
    sleep: { start: 30, end: 510 },      // 每晚 00:30–08:30
    sleepOverrides: [],                   // 只限某一晚的睡眠改動
    history: [
      { id: 'h1', task: 'ps4', step: 'ps4-1', date: '2026-11-04', start: 1170, end: 1260, checkin: 'pending' },
      { id: 'h0', task: 'rep', step: 'rep-1', date: '2026-11-03', start: 960, end: 1050, checkin: 'done' },
    ],
    docs: docs(),
    thread: [
      {
        id: 'm-plan', who: 'ai',
        html: L('我按你的空檔排好了 11月5日至11日。<b>程式期中</b>在 11月12日早上，8 小時溫習都排在考試前；<b>Essay 2</b> 截止還遠，先放 1 小時構思大綱。',
          'I planned Nov 5–11 around your free time. The <b>programming midterm</b> is on the morning of Nov 12, so all 8 hours of revision come before it. <b>Essay 2</b> is due later, so for now there is one hour for the outline.'),
      },
      { id: 'm-checkin', who: 'ai', kind: 'checkin', history: 'h1' },
    ],
    proposal: null,
    flags: {},
  };
}

// 首次使用流程的「生活安排」示範（不是從大綱來的不可用時段）。
export const LIFE_RULE_IDS = ['u-dinner', 'u-job-tue', 'u-job-fri', 'u-job-sat', 'u-club', 'u-family'];

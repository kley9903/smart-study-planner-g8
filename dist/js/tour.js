// 新手導覽：畫面變暗，只亮出正在介紹的位置，旁邊一個說明框。
// 在「本週」示範畫面上逐步介紹；每一步用 CSS 選擇器找要亮出的元素，找不到就跳過該步。
import { icon } from './ui.js';
import { L } from './i18n.js';

const STEPS_DEF = [
  { sel: '.wk-head', title: ['這是你未來 7 日的計劃', 'This is your next 7 days'], text: ['今天永遠在最左邊。上面寫著已排了多少小時，以及有幾項要你決定。', 'Today is always on the left. The top shows how many hours are planned and how many things need your decision.'] },
  { sel: '.planner .blk--ink', title: ['實色：已確認的讀書時段', 'Solid: confirmed study sessions'], text: ['按一下可以看為甚麼排在這裡，做完了就回報進度。時段結束不會自動當作做完。', 'Press one to see why it is there, and report progress when you finish. A session ending is not counted as done.'] },
  { sel: '.planner .hatch:not(.hatch--sleep)', title: ['灰色：你沒空的時間', 'Gray: when you are busy'], text: ['上課、兼職、晚飯這些時間，排程一定會避開。按時間表上方的「改沒空的時間」就可以自己標記。', 'Classes, work, dinner: planning always avoids these. Press "Edit busy times" above the timetable to mark your own.'] },
  { sel: '.horizon', title: ['遠方：7 日之後的 deadline', 'Further ahead: deadlines after 7 days'], text: ['較遠的功課也會被考慮，需要的話會提早在這 7 日開始。', 'Later work is considered too, and can start early in these 7 days if needed.'] },
  { sel: ['#margin', '.top-nav__link--margin', '.bottom-nav [data-nav="margin"]'], title: ['AI 助手', 'AI assistant'], text: ['告訴它臨時有事，它會提出改動。建議先用虛線顯示，你按「確認」才會生效。', 'Tell it when something comes up and it suggests changes. Suggestions are dashed until you press "Confirm".'] },
  { sel: '.guide', title: ['親手試一次', 'Try it yourself'], text: ['跟著這 3 步，看看 AI 怎樣幫你調整計劃。之後可以開始你自己的計劃。', 'Follow these 3 steps to see how the AI adjusts the plan. Then start your own.'], last: true },
];
const STEPS = STEPS_DEF;
const tr = ([zh, en]) => L(zh, en);

let index = -1;
let root = null;

export const tourActive = () => index >= 0;

export function startTour(step = 1) {
  index = Math.min(Math.max(1, step), STEPS.length) - 1;
  show();
}

export function endTour() {
  index = -1;
  root?.remove();
  root = null;
}

export function tourStep(delta) {
  if (index < 0) return;
  const next = index + delta;
  if (next < 0 || next >= STEPS.length) return;
  index = next;
  show(delta);
}

/** 第一個看得見的元素（sel 可以是幾個候選，按視窗闊度不同而出現）。 */
function target(step) {
  for (const sel of [].concat(step.sel)) {
    const el = document.querySelector(sel);
    if (el && el.getBoundingClientRect().width) return el;
  }
  return null;
}

function show(dir = 1) {
  const step = STEPS[index];
  const el = target(step);
  if (!el) {
    // 這個畫面沒有這一項（例如窄螢幕），往同一方向跳過
    const next = index + (dir < 0 ? -1 : 1);
    if (next < 0 || next >= STEPS.length) { endTour(); return; }
    index = next;
    show(dir);
    return;
  }
  if (!root) {
    root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = '<div class="tour__hole"></div><div class="tour__bubble" role="dialog" aria-modal="true" aria-live="polite"></div>';
    document.body.append(root);
  }
  root.querySelector('.tour__bubble').innerHTML = `
    <p class="tour__count">${index + 1} / ${STEPS.length}</p>
    <h3 class="tour__title">${tr(step.title)}</h3>
    <p class="tour__text">${tr(step.text)}</p>
    <div class="tour__acts">
      ${step.last
        ? `<button class="btn btn--sm btn--ghost" type="button" data-action="tour-end">${L('自己試試', 'Explore')}</button>
           <a class="btn btn--sm btn--ink" href="#/week" data-action="leave-demo">${icon('play')} ${L('開始我的計劃', 'Start my plan')}</a>`
        : `<button class="btn btn--sm btn--ghost" type="button" data-action="tour-end">${L('跳過', 'Skip')}</button>
           ${index ? `<button class="btn btn--sm" type="button" data-action="tour-prev">${icon('back')} ${L('上一步', 'Back')}</button>` : ''}
           <button class="btn btn--sm btn--ink" type="button" data-action="tour-next">${L('下一步', 'Next')} ${icon('arrow')}</button>`}
    </div>`;
  const r = el.getBoundingClientRect();
  if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: 'center' });
  place();
  root.querySelector('.tour__bubble .btn--ink')?.focus({ preventScroll: true });
}

/** 亮出位置和說明框跟著元素走（捲動、改變視窗大小、畫面重繪後都會重新計算）。 */
export function placeTour() {
  if (index >= 0) place();
}

function place() {
  if (!root) return;
  const el = target(STEPS[index]);
  if (!el) return;
  const pad = 6;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = {
    left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad),
    right: Math.min(vw - 4, r.right + pad), bottom: Math.min(vh - 4, r.bottom + pad),
  };
  Object.assign(root.querySelector('.tour__hole').style, {
    left: `${hole.left}px`, top: `${hole.top}px`, width: `${hole.right - hole.left}px`, height: `${hole.bottom - hole.top}px`,
  });
  const b = root.querySelector('.tour__bubble');
  const bw = b.offsetWidth;
  const bh = b.offsetHeight;
  const gap = 14;
  let left;
  let top;
  if (vw - hole.right >= bw + gap + 8) { left = hole.right + gap; top = hole.top; }
  else if (hole.left >= bw + gap + 8) { left = hole.left - bw - gap; top = hole.top; }
  else if (vh - hole.bottom >= bh + gap + 8) { left = hole.left; top = hole.bottom + gap; }
  else if (hole.top >= bh + gap + 8) { left = hole.left; top = hole.top - bh - gap; }
  else { left = (vw - bw) / 2; top = vh - bh - 12; }
  b.style.left = `${Math.round(Math.min(Math.max(12, left), vw - bw - 12))}px`;
  b.style.top = `${Math.round(Math.min(Math.max(12, top), vh - bh - 12))}px`;
}

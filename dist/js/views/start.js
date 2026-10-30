// 首次使用：歡迎頁 → 5 步（放入大綱、核對、睡眠、沒空的時間、AI 排計劃）。
// 每一步只有一個主要按鈕（右下角），按下就完成該步並前往下一步。
import { esc, icon } from '../ui.js';
import { ob, ui } from '../store.js';
import { createDemoState, courses } from '../demo-data.js';
import { renderPlanner } from '../planner.js';
import { windowDates } from '../model.js';
import { hm, hoursText } from '../time.js';
import { L } from '../i18n.js';

const STEPS = ['放入大綱', '核對', '睡眠', '沒空的時間', 'AI 排計劃'];
const DEMO = createDemoState();

export function render(_s, params) {
  const step = Number(params[0] || 0);
  if (!step) return welcome();
  const body = [null, step1, step2, step3, step4, step5][step] || step1;
  return `
    <div class="ob">
      <div class="ob__bar">
        <ol class="steps">${STEPS.map((t, i) => `<li class="${i + 1 < step ? 'is-done' : i + 1 === step ? 'is-current' : ''}">${t}</li>`).join('')}</ol>
        <a class="btn btn--sm btn--ghost" href="#/week" data-action="ob-skip">略過，直接看示範計劃 ${icon('arrow')}</a>
      </div>
      <section class="sheet ob__sheet">${body()}</section>
    </div>`;
}

/** 首次使用流程用的「臨時狀態」，不影響主畫面的示範資料。 */
export function obPlannerState() {
  const s = createDemoState();
  s.proposals = {};
  s.proposal = null;
  const classes = s.unavailable.filter((r) => r.src === 'syllabus').map((r) => ({ ...r, pencil: !ob.classesInked }));
  const life = ob.lifeAdded ? s.unavailable.filter((r) => r.src !== 'syllabus') : [];
  s.unavailable = [...classes, ...life];
  s.blocks = ob.drafted ? s.blocks.map((b) => ({ ...b, pencil: !ob.inked })) : [];
  return s;
}

function foot(note, back, primary) {
  return `
    <footer class="ob__foot">
      <p class="ob__foot-note">${icon('info')} ${note}</p>
      <div class="ob__actions">
        ${back ? `<button class="btn btn--ghost" type="button" data-action="ob-go" data-step="${back}">${icon('back')} 上一步</button>` : ''}
        ${primary}
      </div>
    </footer>`;
}

/* ---------- 歡迎 ---------- */
function welcome() {
  return `
    <section class="hero">
      <div class="hero__copy">
        <p class="hero__eyebrow"><span class="seal" style="--size:26px" aria-hidden="true">讀</span> Smart Study Planner</p>
        <h1 class="hero__title">${L('讀書計劃，<br>先用<span class="pencil-word">鉛筆起稿</span>。', 'Plan your study.<br>Draft it in <span class="pencil-word">pencil</span> first.')}</h1>
        <p class="hero__lede">${L('告訴它你的功課和 deadline，它幫你排好未來 7 日。每個建議都要你確認才生效。', 'Tell it your assignments and deadlines, and it plans your next 7 days. Every suggestion needs your confirmation.')}</p>
        <div class="hero__cta">
          <a class="btn btn--ink btn--lg" href="#/week" data-action="start-mine">${icon('play')} ${L('直接開始', 'Get started')}</a>
          <a class="btn btn--lg" href="#/week" data-action="start-tour">${icon('eye')} ${L('新手導覽（約 1 分鐘）', 'Take the tour (1 min)')}</a>
        </div>
        <p class="hero__fine">${icon('info')}<span>${L('新手導覽用虛構的示範資料。直接開始是你自己的計劃，只存在這個瀏覽器。', 'The tour uses made-up demo data. "Get started" is your own plan, saved only in this browser.')}</span></p>
      </div>
      <div class="hero__art" aria-hidden="true">${miniArt()}</div>
    </section>`;
}

function miniArt() {
  const hatch = (cls, s, e, label, ic) => `<div class="hatch ${cls}" style="--s:${s};--e:${e}"><span class="hatch__label">${icon(ic)}${label}</span></div>`;
  const ink = (c, s, e, title, time) => `<div class="blk blk--ink" data-ink="${c}" style="--s:${s};--e:${e}"><span class="blk__title"><span class="blk__step">${title}</span></span><span class="blk__meta">${time}</span></div>`;
  const pencil = (c, s, e, title, time) => `<div class="blk blk--pencil" data-ink="${c}" style="--s:${s};--e:${e}"><span class="blk__title"><span class="pencil-dot"></span> <span class="blk__step">${title}</span></span><span class="blk__meta">${icon('pencil')}${time}</span></div>`;
  const ticks = [15, 16, 17, 18, 19, 20].map((h, i) => `<span style="top:${i * 50}px">${h}:00</span>`).join('');
  return `
    <div class="mini">
      <div class="mini__head"><b>${L('11月5日 — 7日', 'Nov 5 – 7')}</b><span class="demo-stamp">${L('示範', 'Demo')}</span></div>
      <div class="mini__days"><span></span><span><b>5</b>${L('週四', 'Thu')}</span><span><b>6</b>${L('週五', 'Fri')}</span><span><b>7</b>${L('週六', 'Sat')}</span></div>
      <div class="mini__grid" style="--p-start:900;--ppm:0.8333">
        <div class="mini__gut">${ticks}</div>
        <div class="mini__col">
          ${hatch('hatch--weekly', 1110, 1170, L('晚飯', 'Dinner'), 'repeat')}
          ${hatch('hatch--single', 1170, 1260, L('社團', 'Club'), 'pin')}
          ${ink('blue', 960, 1080, L('PS4 題 5–8', 'PS4 Q5–8'), '16:00–18:00')}
        </div>
        <div class="mini__col">
          ${hatch('hatch--weekly', 900, 1020, L('兼職', 'Work'), 'repeat')}
          ${hatch('hatch--weekly', 1110, 1170, L('晚飯', 'Dinner'), 'repeat')}
          ${pencil('amber', 1020, 1110, L('市場報告', 'Mktg report'), '17:00–18:30')}
          ${pencil('plum', 1185, 1245, L('Essay 大綱', 'Essay outline'), '19:45–20:45')}
        </div>
        <div class="mini__col">
          ${hatch('hatch--weekly', 1110, 1170, L('晚飯', 'Dinner'), 'repeat')}
          ${ink('green', 930, 1020, L('程式期中', 'Prog midterm'), '15:30–17:00')}
        </div>
      </div>
      <div class="mini__legend">
        <span><i class="sw sw--pencil"></i>${L('虛線：AI 建議', 'Dashed: suggested')}</span>
        <span><i class="sw sw--ink"></i>${L('實色：已確認', 'Solid: confirmed')}</span>
        <span><i class="sw sw--off"></i>${L('灰色：沒空', 'Gray: busy')}</span>
      </div>
      <div class="mini__foot"><span>${icon('pencil')} ${L('AI 建議了 2 段，等你確認', '2 sessions suggested, waiting for you')}</span><span class="btn btn--sm btn--ink">${icon('check')} ${L('確認', 'Confirm')}</span></div>
    </div>`;
}

/* ---------- 第 1 步：放入大綱 ---------- */
function step1() {
  const reading = ob.loaded
    ? DEMO.docs.map((d, i) => `
        <div class="reading__doc" data-ink="${courses()[d.course].ink}" style="animation-delay:${i * 160}ms">
          <span class="doc__icon" style="width:38px;height:44px">${icon('file')}</span>
          <span><b style="font-size:14px">${esc(d.name)}</b><span class="reading__bar"><i style="animation-delay:${i * 260 + 150}ms"></i></span></span>
          <span class="demo-note">${d.items.length} 項</span>
        </div>`).join('')
    : `<div class="reading__empty">${icon('file')}<span>示範大綱：統計學、市場學、程式設計、學術英文</span></div>`;
  const primary = ob.loaded
    ? `<button class="btn btn--ink btn--lg" type="button" data-action="ob-go" data-step="2">下一步：核對 ${icon('arrow')}</button>`
    : `<button class="btn btn--ink btn--lg" type="button" data-action="ob-load">${icon('file')} 用 4 份示範大綱</button>`;
  return `
    <p class="eyebrow">第 1 步 · 共 5 步</p>
    <h1 class="ob__title">先放入這個學期的課程大綱</h1>
    <p class="ob__lede">AI 會從大綱找出 deadline、考試、上課時間和功課要求。原型不會讀取你的檔案，按右下角的按鈕改用 4 份示範大綱。</p>
    <div class="ob__body ob-drop">
      <div class="drop" data-drop>
        <div class="drop__icon">${icon('clip')}</div>
        <p class="drop__title">把 PDF 放在這裡</p>
        <p class="drop__sub">可以一次放幾份。原型只會顯示檔名，不會讀取內容。</p>
        <div class="drop__actions">
          <label class="btn">${icon('upload')} 選擇檔案<input type="file" accept=".pdf,application/pdf" multiple hidden data-file></label>
        </div>
        ${ui.dropMsg ? `<p class="drop__msg" role="status">${esc(ui.dropMsg)}</p>` : ''}
      </div>
      <div class="reading" aria-live="polite">${reading}</div>
    </div>
    ${foot(ob.loaded ? '示範：讀取動畫是模擬的，沒有分析任何檔案。' : '示範版：不會上傳或分析任何檔案。', 0, primary)}`;
}

/* ---------- 第 2 步：核對 ---------- */
function step2() {
  const rows = DEMO.docs.flatMap((d) => d.items.map((it) => ({ d, it, st: ob.itemState[it.id] || 'pencil' })));
  const sure = rows.filter((r) => !r.it.warn && r.st === 'pencil').length;
  const unsure = rows.filter((r) => r.it.warn && r.st === 'pencil').length;
  const tr = ({ d, it, st }) => `
    <tr class="xrow--${st}" data-ink="${courses()[d.course].ink}">
      <td><span class="xtype">${courses()[d.course].name}</span><br><small class="muted">${esc(it.type)}</small></td>
      <td><div class="xwhat">${esc(it.what)}</div>${it.warn && st === 'pencil' ? `<div class="xwarn">${icon('alert')}<span>${esc(it.warn)}</span></div>` : ''}</td>
      <td class="mono ${it.when === '—' ? 'is-empty' : ''}" style="font-size:13px">${esc(it.when)}</td>
      <td><span class="xsrc">${icon('file')} ${esc(it.src)}</span></td>
      <td class="xhours ${!it.hours || it.hours === '—' ? 'is-empty' : ''}">${esc(it.hours || '—')}</td>
      <td><div class="xact">${st === 'pencil'
        ? `<button class="btn btn--sm" type="button" data-action="ob-item" data-item="${it.id}" data-to="ink">${icon('check')} 對</button><button class="btn btn--sm btn--ghost" type="button" data-action="ob-item" data-item="${it.id}" data-to="erased">不是</button>`
        : `<span class="xstate">${st === 'ink' ? `${icon('check')} 已確認` : `${icon('x')} 已刪除`}</span>`}</div></td>
    </tr>`;
  const primary = sure
    ? `<button class="btn btn--ink btn--lg" type="button" data-action="ob-confirm-items">${icon('check')} 確認肯定的 ${sure} 項，下一步</button>`
    : `<button class="btn btn--ink btn--lg" type="button" data-action="ob-go" data-step="3">下一步：睡眠 ${icon('arrow')}</button>`;
  return `
    <p class="eyebrow">第 2 步 · 共 5 步</p>
    <h1 class="ob__title">核對 AI 從大綱找到的項目</h1>
    <p class="ob__lede">每一項都附出處頁碼。AI 肯定的可以一次確認；AI 不肯定的（紅字說明原因）可以之後在「課程資料」再核對。</p>
    <div class="ob__body">
      <div class="review" style="border:1px solid var(--rule);border-radius:14px;overflow:hidden;background:var(--paper)">
        <header class="review__head">
          <div><h2 style="font-size:18px">4 份大綱 · 找到 ${rows.length} 項</h2><p><span class="demo-note">${icon('info')} 示範：預先寫好的結果，並非 AI 分析</span></p></div>
          ${unsure ? `<span class="chip chip--pencil" style="white-space:normal">${icon('alert')} ${unsure} 項 AI 不肯定</span>` : ''}
        </header>
        <table class="xtable">
          <thead><tr><th>科目</th><th>內容</th><th>日期／時間</th><th>出處</th><th>預計時數</th><th><span class="sr-only">操作</span></th></tr></thead>
          <tbody>${rows.map(tr).join('')}</tbody>
        </table>
      </div>
    </div>
    ${foot('只有確認了的項目，才會用來排計劃。', 1, primary)}`;
}

/* ---------- 第 3 步：睡眠 ---------- */
function step3() {
  const { start, end } = ob.sleep;
  const bed = start < 720 ? start + 1440 : start;
  const wake = end + 1440;
  const n0 = 1080;
  const n1 = 2160;
  const scale = [1080, 1260, 1440, 1620, 1800, 1980, 2160].map((m) => `<span style="--m:${m}">${hm(m)}</span>`).join('');
  const opts = (from, to, sel) => {
    const out = [];
    for (let m = from; m <= to; m += 30) out.push(`<option value="${m % 1440}" ${m % 1440 === sel ? 'selected' : ''}>${hm(m)}</option>`);
    return out.join('');
  };
  const mid = ((bed + wake) / 2 - n0) / (n1 - n0) * 100;
  return `
    <p class="eyebrow">第 3 步 · 共 5 步</p>
    <h1 class="ob__title">確認你的睡眠時間</h1>
    <p class="ob__lede">確認之前，AI 不會排計劃，免得把讀書時段排到凌晨。之後每晚都會避開這段時間；要遲睡，AI 會先問你，而且只限當晚。</p>
    <div class="ob__body sleepset">
      <div>
        <div class="night" style="--n0:${n0};--n1:${n1}">
          <div class="night__band is-pencil" style="--s:${bed};--e:${wake}"></div>
          <div class="night__label" style="left:${mid.toFixed(2)}%">${icon('moon')} ${hm(start)} → ${hm(end)} · ${hoursText(wake - bed)}</div>
          <div class="night__scale">${scale}</div>
        </div>
        <p class="demo-note" style="margin-top:10px">${icon('info')} 先填了常見的時間，可以在右邊改。</p>
      </div>
      <div class="time-pickers">
        <label class="field"><span class="field__label">通常幾點睡</span><select class="select" data-ob-sleep="start">${opts(1320, 1560, start)}</select></label>
        <label class="field"><span class="field__label">通常幾點起身</span><select class="select" data-ob-sleep="end">${opts(360, 660, end)}</select></label>
      </div>
    </div>
    ${foot('睡眠是每晚重複的沒空時間，之後可以在「不可用時段」修改。', 2, `<button class="btn btn--ink btn--lg" type="button" data-action="ob-confirm-sleep">${icon('check')} 確認睡眠時間，下一步</button>`)}`;
}

/* ---------- 第 4 步：沒空的時間 ---------- */
function step4() {
  const s = obPlannerState();
  s.sleep = { ...ob.sleep };
  return `
    <p class="eyebrow">第 4 步 · 共 5 步</p>
    <h1 class="ob__title">確認你沒空的時間</h1>
    <p class="ob__lede">虛線框的灰色時段是 AI 從大綱找到的每週 9 段上課時間；其他灰色時段是你的晚飯、兼職、社團和家庭安排（示範）。沒有塗灰的時間，預設都可以讀書。</p>
    <div class="ob__body">
      <div class="ob-planner">${renderPlanner(s, { dates: windowDates(s), mode: 'time', showBlocks: false, showGaps: false, interactive: false, colMin: 92 })}</div>
      <p class="demo-note" style="margin-top:10px">${icon('info')} 正式版可以直接在格上拖拉標記，或者跟 AI 說；完整工具在「不可用時段」頁。</p>
    </div>
    ${foot('每週重複和只限一天的，看標籤前的圖示分辨。', 3, `<button class="btn btn--ink btn--lg" type="button" data-action="ob-confirm-hatch">${icon('check')} 確認這些時間，下一步</button>`)}`;
}

/* ---------- 第 5 步：AI 排計劃 ---------- */
function step5() {
  const s = obPlannerState();
  const ids = s.blocks.slice().sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1)).map((b) => b.id);
  const total = DEMO.blocks.reduce((a, b) => a + b.end - b.start, 0);
  const differs = ob.sleep.start !== 30 || ob.sleep.end !== 510;
  const status = !ob.drafted
    ? `<div class="draft-status"><span class="spinner" aria-hidden="true"></span> AI 正在排計劃…（示範動畫，並無真正排程）</div>`
    : ob.inked
      ? `<div class="draft-status" style="background:var(--ok-wash);color:var(--green-deep)">${icon('check')} 已確認 ${DEMO.blocks.length} 段，共 ${hoursText(total)}。正在打開本週計劃…</div>`
      : `<div class="draft-status">${icon('pencil')} AI 建議了 ${DEMO.blocks.length} 段，共 ${hoursText(total)}（虛線，未確認）。</div>`;
  const note = (html) => `<div class="ai-note"><div class="ai-note__meta">${icon('pencil')} AI 的排法 · 示範</div><p>${html}</p></div>`;
  const notes = ob.drafted
    ? note('<b>PS4 明晚截止</b>，所以今天下課後先排 2 小時，週五再排 3 小時。')
      + note('<b>程式期中在 11月12日</b>，剛好在這 7 日之後；8 小時溫習分 6 段，最後一晚只重溫錯題。')
      + note('<b>Essay 2 截止還遠</b>，但下週較忙，先放 1 小時構思大綱。')
      + (differs ? `<p class="demo-note">${icon('info')} 示範計劃是預先按每晚 00:30–08:30 排好的；正式版會按你選的睡眠時間排。</p>` : '')
    : '';
  const primary = !ob.drafted
    ? `<button class="btn btn--ink btn--lg" type="button" aria-disabled="true" data-action="ob-wait">AI 排計劃中…</button>`
    : ob.inked
      ? `<button class="btn btn--ink btn--lg" type="button" data-action="ob-finish">進入本週計劃 ${icon('arrow')}</button>`
      : `<button class="btn btn--ink btn--lg" type="button" data-action="ob-ink-plan">${icon('check')} 確認這份計劃</button>`;
  return `
    <p class="eyebrow">第 5 步 · 共 5 步</p>
    <h1 class="ob__title">AI 排好未來 7 日，你看過再確認</h1>
    <p class="ob__lede">AI 按你的空檔排出未來 7 日，同時考慮 7 日之後的 deadline。虛線時段是建議；確認後變成實色，計劃才生效。之後想改，可以跟 AI 助手說。</p>
    <div class="ob__body draft-wrap">
      <div class="ob-planner">${renderPlanner(s, { dates: windowDates(s), mode: 'week', showGaps: false, interactive: false, justInked: ob.inked ? ids : [], stagger: ob.inked ? [] : ids })}</div>
      <aside class="draft-notes">${status}${notes}</aside>
    </div>
    ${foot('示範：計劃是預先寫好的，並非 AI 即時排程。', ob.inked ? 0 : 4, primary)}`;
}

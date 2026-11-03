// 課程資料：放入大綱 → AI 抽出項目（未確認） → 你核對確認。
// 示範模式：一頁看完，用預寫的結果。
// 自己的計劃：#/import 是科目列表（views/courses.js）；#/import/add 是收集資料的頁面——貼上文字或放入 PDF／Word，
// 經 syllabus-ai.js 交給 Dify 工作流程，核對確認後才放進科目、變成任務。可以分幾次加。
import { esc, icon } from '../ui.js';
import { ui, getMode } from '../store.js';
import { L } from '../i18n.js';
import { AI_MAX_MB, rowText, report, checklist, STAGES, stageLabel } from '../syllabus-ai.js';
import { coursesPage } from './courses.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function render(s, params = []) {
  const mine = getMode() === 'mine';
  if (mine && params[0] !== 'add') return coursesPage(s);
  const doc = mine ? s.docs.find((d) => d.id === ui.docId) : s.docs.find((d) => d.id === ui.docId) || s.docs[0];
  const pendingAll = s.docs.flatMap((d) => d.items).filter((i) => i.state === 'pencil').length;
  return `
    <div class="page-head">
      <div>
        ${mine ? `<a class="page-back" href="#/import">${icon('back')} ${L('課程資料', 'Courses')}</a>` : `<p class="eyebrow">${L('課程資料', 'Syllabus')}</p>`}
        <h1 class="page-head__title">${!mine ? L('課程資料', 'Syllabus') : s.courses[ui.addCourse] ? L(`補充 ${esc(s.courses[ui.addCourse].name)} 的資訊`, `Add information to ${esc(s.courses[ui.addCourse].name)}`) : L('增加科目', 'Add a course')}</h1>
        <p class="page-head__lede">${mine
          ? L('大綱、公告、或自己打的字都可以，不用一次齊全；AI 找出功課、測驗和考試，你確認了才會放進科目。可以分幾次加。', 'A syllabus, an announcement or your own notes all work, and nothing has to be complete at once. AI finds assignments, quizzes and exams; only what you confirm goes into the course. Add more any time.')
          : L('AI 會從大綱找出 deadline、考試、上課時間和功課要求，每一項都附出處頁碼。你核對、確認之後，才會用來排計劃。', 'The AI finds deadlines, exams, class times and requirements in your syllabus, each with its page number. Only what you check and confirm is used for planning.')}</p>
      </div>
      ${mine ? '' : pendingAll ?`<span class="chip chip--pencil">${icon('pencil')} ${L(`還有 ${pendingAll} 項待核對`, `${pendingAll} to check`)}</span>` : `<span class="chip chip--ok">${icon('check')} ${L('全部已核對', 'All checked')}</span>`}
    </div>
    <div class="imp">
      <div class="imp__top">
        ${mine ? pasteBox() : `<div class="drop" data-drop>
          <div class="drop__icon">${icon('clip')}</div>
          <p class="drop__title">${L('把課程大綱 PDF 放在這裡', 'Drop your syllabus PDF here')}</p>
          <p class="drop__sub">${L('原型不會上傳或讀取檔案內容。選了檔案只會顯示檔名，然後改用示範大綱。', 'The prototype does not upload or read files. It only shows the file name and uses the demo syllabi instead.')}</p>
          <div class="drop__actions">
            <label class="btn">${icon('upload')} ${L('選擇檔案', 'Choose file')}<input type="file" accept=".pdf,application/pdf" hidden data-file></label>
            <button class="btn btn--ink" type="button" data-action="demo-docs">${icon('file')} ${L('看示範大綱', 'See demo syllabi')}</button>
          </div>
          ${ui.dropMsg ? `<p class="drop__msg" role="status">${esc(ui.dropMsg)}</p>` : ''}
        </div>`}
        <section class="sheet imp-how" aria-label="${L('流程', 'How it works')}">
          <h2>${L('大綱怎樣變成計劃', 'From syllabus to plan')}</h2>
          ${mine ? `<ol class="how-list">
            <li><span class="how-list__n">1</span><span><b>${L('放入資料', 'Add information')}</b><br>${L('大綱、公告或自己打字，PDF、Word、文字都可以；不用一次齊全。', 'A syllabus, an announcement or your notes, as PDF, Word or text; it does not have to be complete.')}</span></li>
            <li><span class="how-list__n">2</span><span><b>${L('AI 找出項目（未確認）', 'AI finds items (not confirmed)')}</b><br>${L('功課、測驗、考試的日期和比重，附原文出處；沒寫清楚的會講明。', 'Dates and weights of assignments, quizzes and exams, with the original wording; it says what is unclear.')}</span></li>
            <li><span class="how-list__n">3</span><span><b>${L('你確認', 'You confirm')}</b><br>${L('確認的才放進科目、變成任務；科目裡已有的不會重複加入。', 'Only confirmed items go into the course and become tasks; anything already there is not added twice.')}</span></li>
            <li><span class="how-list__n">4</span><span><b>${L('排溫習時間', 'Plan revision time')}</b><br>${L('到「本週」產生建議，確認了才會生效。', 'Generate suggestions on This week; they apply only after you confirm.')}</span></li>
          </ol>` : `<ol class="how-list">
            <li><span class="how-list__n">1</span><span><b>${L('放入大綱', 'Add the syllabus')}</b><br>${L('第一版先做 PDF；之後可以接 Canvas。', 'PDF first; Canvas later.')}</span></li>
            <li><span class="how-list__n">2</span><span><b>${L('AI 抽出（未確認）', 'AI extracts (not confirmed)')}</b><br>${L('deadline、考試、上課時間、要求，每項附頁碼；不肯定的會講明。', 'Deadlines, exams, class times and requirements, each with a page number; it says when it is unsure.')}</span></li>
            <li><span class="how-list__n">3</span><span><b>${L('你核對', 'You check')}</b><br>${L('對就確認，錯就改，不是就刪除。', 'Confirm what is right, fix what is wrong, remove what does not belong.')}</span></li>
            <li><span class="how-list__n">4</span><span><b>${L('確認了才用來排程', 'Only confirmed items are planned')}</b><br>${L('上課時間變成每週的沒空時間（灰色），功課拆成步驟、估算時數。', 'Class times become weekly busy times (gray); assignments are split into steps with estimates.')}</span></li>
          </ol>`}
        </section>
      </div>

      ${mine ? '' : doc ? `<div class="docs" role="group" aria-label="${L('已放入的大綱', 'Syllabi added')}">
        ${s.docs.map((d) => docCard(s, d, d.id === doc.id)).join('')}
      </div>` : `<p class="docs-empty muted">${L('還沒有放入大綱。', 'No syllabus added yet.')}</p>`}

      ${!doc ? '' : doc.own ? `${ownPanel(doc)}${doc.items.length && ui.docReading !== doc.id ? `${reportCard(doc)}${review(s, doc)}${doneBar(doc)}` : ''}` : `${review(s, doc)}${confirmed(doc)}`}
    </div>
    ${ui.aiModal ? aiModal(s) : ''}`;
}

/**
 * 檢查視窗：蓋在頁面上，後面模糊。像一張有紅色邊線的筆記紙：
 * run：AI 還在讀，每一行跟著 Dify 實際走到的步驟轉圈（ui.readStage）；
 * reveal：結果到了，逐行揭曉找到／找不到（ui.aiModal.step）；done：蓋上「已核對」印章，下面出報告。
 */
function aiModal(s) {
  const m = ui.aiModal;
  const doc = s.docs.find((d) => d.id === m.doc);
  if (!doc) return '';
  const now = STAGES.indexOf(ui.readStage);
  const rows = checklist(m.phase === 'run' ? { items: [], notes: [], weightTotal: null } : doc);
  const stateOf = (r, i) => {
    if (m.phase !== 'run') return i < m.step ? r.state : 'spin';
    const at = STAGES.indexOf(r.stage);
    if (at < now) return r.stage === 'read' ? 'ok' : 'spin'; // 找出的數目要等結果到了才知道
    return at === now ? 'spin' : 'todo';
  };
  const states = rows.map(stateOf);
  const settled = states.filter((st) => st !== 'spin' && st !== 'todo').length;
  const mark = { ok: icon('check'), warn: '!', none: icon('x'), spin: '', todo: '' };
  const done = m.phase === 'done';
  const fresh = m.fresh; // 只有第一次畫出視窗時播淡入；之後每一步重畫不再播
  m.fresh = false;
  return `
    <div class="ai-modal ${fresh ? 'is-fresh' : ''}" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
      <section class="ai-modal__card ${done ? 'is-done' : ''}">
        <header class="ai-modal__head">
          <div>
            <p class="ai-modal__eyebrow">${L('AI 核對', 'AI check')} · ${settled} / ${rows.length}</p>
            <h2 class="ai-modal__title" id="ai-modal-title">${done ? L('核對完成', 'Check complete') : L('正在逐項核對大綱', 'Checking the syllabus')}</h2>
            <p class="ai-modal__file">${icon('file')}<span>${esc(doc.name)}</span></p>
          </div>
          <button class="ai-modal__close" type="button" data-action="ai-modal-close" aria-label="${L('關閉', 'Close')}">${icon('x')}</button>
        </header>
        ${done ? `<div class="ai-stamp" aria-hidden="true">${L('已核對', 'Checked')}</div>` : ''}
        <div class="ai-meter" role="progressbar" aria-label="${L('核對進度', 'Progress')}" aria-valuemin="0" aria-valuemax="${rows.length}" aria-valuenow="${settled}">
          <span style="--p:${settled / rows.length}"></span>
        </div>
        <ol class="ai-checks" aria-live="polite">
          ${rows.map((r, i) => {
            const st = states[i];
            const text = st === 'spin' ? L('檢查中', 'Checking') : st === 'todo' ? L('等待', 'Waiting') : r.text;
            return `<li class="ai-check is-${st} ${m.phase === 'reveal' && i === m.step - 1 ? 'is-new' : ''}">
              <span class="ai-check__n">${String(i + 1).padStart(2, '0')}</span>
              <span class="ai-check__mark">${mark[st]}</span>
              <span class="ai-check__label">${r.label}</span>
              <span class="ai-check__text">${esc(text)}</span></li>`;
          }).join('')}
        </ol>
        ${done ? `
        ${ledger(doc, true)}
        <footer class="ai-modal__foot">
          <button class="btn btn--ink" type="button" data-action="ai-modal-close">${L('去逐項核對', 'Check the items')} ${icon('arrow')}</button>
        </footer>` : `
        <footer class="ai-modal__foot">
          <span class="ai-modal__hint">${icon('clock')} ${L('通常要半分鐘到一分鐘', 'Usually 30–60 seconds')}</span>
          <button class="btn btn--ghost btn--sm" type="button" data-action="ai-modal-close">${L('在背景繼續', 'Keep going in the background')}</button>
        </footer>`}
      </section>
    </div>`;
}

/** 報告的帳目：左邊「找到」用墨水寫，右邊「找不到／要核對」放在鉛筆虛線框裡，等你處理。 */
function ledger(doc, animate) {
  const { have, missing } = report(doc);
  let n = 0;
  const line = (cls, sign, text) => `<li class="ai-line ${cls}" ${animate ? `style="--i:${n++}"` : ''}>${icon(sign)}<span>${esc(text)}</span></li>`;
  return `
        <div class="ai-ledger ${animate ? 'is-animated' : ''}">
          <div class="ai-ledger__col">
            <h3>${L('找到', 'Found')}</h3>
            <ul>${have.map((t) => line('is-ok', 'check', t)).join('')}</ul>
          </div>
          <div class="ai-ledger__col ai-ledger__col--check ${missing.length ? '' : 'is-clear'}">
            <h3>${L('找不到／要核對', 'Missing or to check')} <span class="ai-ledger__count">${missing.length}</span></h3>
            <ul>${missing.length ? missing.map((t) => line('is-warn', 'alert', t)).join('') : line('is-ok', 'check', L('沒有發現缺漏', 'Nothing missing found'))}</ul>
          </div>
        </div>`;
}

/** 自己的計劃：可以直接打字／貼上大綱文字，也可以放入檔案。框是空的時候中間顯示「貼上」「上傳檔案」。 */
function pasteBox() {
  return `
        <div class="drop paste" data-drop>
          <label class="sr-only" for="syllabus-text">${L('課程大綱文字', 'Syllabus text')}</label>
          <textarea class="paste__text" id="syllabus-text" data-syllabus-text maxlength="80000"
            placeholder="${L('在這裡貼上或輸入課程大綱的文字，或把 PDF／Word 檔拖進來', 'Paste or type your syllabus text here, or drop a PDF or Word file')}">${esc(ui.syllabusDraft)}</textarea>
          <div class="paste__start">
            <div class="drop__actions">
              <button class="btn" type="button" data-action="syllabus-paste">${icon('clip')} ${L('貼上', 'Paste here')}</button>
              <label class="btn">${icon('upload')} ${L('上傳檔案', 'Upload file')}<input type="file" accept=".pdf,.docx,application/pdf,${DOCX}" multiple hidden data-file></label>
            </div>
            <p class="drop__sub">${L(`檔案保存在這個瀏覽器（每份最多 20 MB）。按「用 AI 找出項目」時才會交給 AI 讀（檔案最多 ${AI_MAX_MB} MB）。`, `Files are kept in this browser (up to 20 MB each). Nothing goes to the AI until you press "Find items with AI" (files up to ${AI_MAX_MB} MB).`)}</p>
          </div>
          <div class="paste__bar">
            <span class="paste__count" data-syllabus-count>${L(`${ui.syllabusDraft.length} 字`, `${ui.syllabusDraft.length} characters`)}</span>
            <button class="btn btn--ghost btn--sm" type="button" data-action="syllabus-clear">${icon('x')} ${L('清除', 'Clear')}</button>
            <button class="btn btn--ink" type="button" data-action="syllabus-read" ${ui.docReading ? 'disabled' : ''}>${icon('eye')} ${L('用 AI 找出項目', 'Find items with AI')}</button>
          </div>
          ${ui.dropMsg ? `<p class="drop__msg" role="status">${esc(ui.dropMsg)}</p>` : ''}
        </div>`;
}

/** AI 正在讀：每一步是 Dify 實際走到的節點（伺服器即時送來），不是計時器。 */
function readingSteps() {
  const now = STAGES.indexOf(ui.readStage);
  return `
          <div class="ai-run" role="status" aria-live="polite">
            <ol class="ai-steps">
              ${STAGES.map((st, i) => `<li class="ai-step ${i < now ? 'is-done' : i === now ? 'is-now' : ''}">
                <span class="ai-step__mark">${i < now ? icon('check') : ''}</span>${stageLabel(st)}${i === now ? '…' : ''}</li>`).join('')}
            </ol>
            <p class="muted">${L('通常要半分鐘到一分鐘，可以先做別的事。', 'This usually takes 30–60 seconds. You can do other things meanwhile.')}</p>
          </div>`;
}

/** 讀完的報告留在頁面上：有甚麼、沒有甚麼（剛讀完時在檢查視窗裡逐項揭曉）。 */
function reportCard(doc) {
  return `
    <section class="sheet ai-report" aria-label="${L('AI 讀取報告', 'AI reading report')}">
      <p class="ai-report__eyebrow">${L('AI 讀取報告', 'AI reading report')}</p>
      ${ledger(doc, false)}
    </section>`;
}

function ownPanel(doc) {
  const typed = /\.txt$/i.test(doc.name);
  const what = typed ? L('你貼上或打的文字', 'Text you pasted or typed') : doc.size ? `${Math.max(0.1, doc.size / 1048576).toFixed(1)} MB` : '';
  return `
    <section class="sheet review own-doc" id="review" aria-label="${esc(doc.name)}">
      <header class="review__head">
        <div>
          <h2>${esc(doc.name)}</h2>
          <p>${what} · ${L('保存在這個瀏覽器', 'Saved in this browser')}</p>
        </div>
        <div class="own-doc__acts">
          <button class="btn" type="button" data-action="file-download" data-file-id="${doc.id}">${icon('file')} ${L('打開檔案', 'Open file')}</button>
          <button class="btn btn--ghost" type="button" data-action="doc-remove" data-doc="${doc.id}">${icon('x')} ${L('移除', 'Remove')}</button>
        </div>
      </header>
      <div class="own-doc__body">
        <div class="own-doc__ai">
          ${ui.docReading === doc.id
            ? readingSteps()
            : `<button class="btn btn--ink" type="button" data-action="doc-read" data-doc="${doc.id}" ${ui.docReading ? 'disabled' : ''}>${icon('eye')} ${doc.items.length ? L('再讓 AI 讀一次', 'Ask AI again') : L('用 AI 找出項目', 'Find items with AI')}</button>
               <span class="muted">${doc.items.length
                ? L('再讀一次會換掉未確認的項目，已確認的保留。', 'Reading again replaces unconfirmed items; confirmed ones stay.')
                : L('AI 讀完後，項目會出現在下面等你核對，不會自動加入。', 'Items appear below for you to check; nothing is added automatically.')}</span>`}
        </div>
        <p class="own-doc__manual">${L('AI 沒找到的，也可以', 'Anything the AI missed, you can also')} <a href="#/add-task">${L('自己加一項功課或考試', 'add yourself as a task')} ${icon('arrow')}</a></p>
      </div>
    </section>`;
}

/** 示範項目已是顯示文字；自己的大綱的 AI 項目按目前語言產生。 */
const view = (doc, it) => (doc.own ? { ...it, ...rowText(it) } : it);

function confirmed(doc) {
  const items = doc.items.filter((i) => i.state === 'ink').map((i) => view(doc, i));
  return `
    <section class="kept" aria-label="${L('已確認的項目', 'Confirmed items')}">
      <h2 class="kept__title">${L('已確認、會用來排程', 'Confirmed for planning')} <span>${items.length}</span></h2>
      ${items.length ? `<div class="kept__grid">${items.map((it) => `
        <div class="kept__item"><span class="xtype">${esc(it.type)}</span><b>${esc(it.what)}</b><span class="kept__when">${esc(it.when)}</span></div>`).join('')}</div>`
        : `<p class="muted">${L('還沒有確認任何項目。在上面的表核對後，會出現在這裡。', 'Nothing confirmed yet. Items you confirm in the table above appear here.')}</p>`}
    </section>`;
}

function docCard(s, d, current) {
  const pending = d.items.filter((i) => i.state === 'pencil').length;
  const ink = s.courses[d.course]?.ink || '';
  return `
    <button class="doc" type="button" data-action="doc" data-doc="${d.id}" data-ink="${ink}" ${current ? 'aria-current="true"' : ''}>
      <span class="doc__icon">${icon('file')}<span>${/\.docx?$/i.test(d.name) ? 'DOC' : /\.txt$/i.test(d.name) ? 'TXT' : 'PDF'}</span></span>
      <span>
        <span class="doc__name">${esc(d.name)}</span>
        ${d.own ? `<span class="doc__meta">${L('自己的大綱', 'Your syllabus')}</span>${pending ? `<span class="chip chip--pencil">${icon('pencil')} ${L(`${pending} 項待核對`, `${pending} to check`)}</span>` : ''}` : `<span class="doc__meta">${L(`${d.pages} 頁 · 找到 ${d.items.length} 項`, `${d.pages} pages · ${d.items.length} items found`)}</span>
        ${pending ? `<span class="chip chip--pencil">${icon('pencil')} ${L(`${pending} 項待核對`, `${pending} to check`)}</span>` : `<span class="chip chip--ok">${icon('check')} ${L('已全部核對', 'All checked')}</span>`}`}
      </span>
    </button>`;
}

/** 這份資料屬於哪一科：確認第一項之後就固定；之前可以改（AI 找到的代號、或選已有的科目）。 */
function courseField(s, doc) {
  if (doc.course) return `<span class="xcourse">${L('科目', 'Course')} <b>${esc(s.courses[doc.course]?.name || doc.courseName)}</b></span>`;
  return `<label class="xcourse">${L('放進科目', 'Course')}
      <input class="input input--sm" list="course-names" value="${esc(doc.courseName || '')}" data-doc-course="${doc.id}" placeholder="${L('例如 COMP1023', 'e.g. COMP1023')}">
    </label>
    <datalist id="course-names">${Object.values(s.courses).map((c) => `<option value="${esc(c.name)}">${esc(c.title || '')}</option>`).join('')}</datalist>`;
}

function doneBar(doc) {
  const pending = doc.items.filter((i) => i.state === 'pencil').length;
  return `
    <div class="imp-done">
      <span class="muted">${pending ? L(`還有 ${pending} 項未確認，可以之後再回來。`, `${pending} still to confirm; you can come back later.`) : L('這份資料都核對好了。', 'Everything here is checked.')}</span>
      <a class="btn btn--ink" href="#/import">${L('完成，回到課程資料', 'Done, back to courses')} ${icon('arrow')}</a>
    </div>`;
}

function review(s, doc) {
  const ink = s.courses[doc.course]?.ink || '';
  const pending = doc.items.filter((i) => i.state === 'pencil').length;
  const meta = doc.own
    ? `${courseField(s, doc)} · ${L(`找到 ${doc.items.length} 項`, `${doc.items.length} items found`)} · <span class="demo-note">${icon('info')} ${L('AI 抽取，可能有錯，請逐項核對', 'Found by AI and may be wrong; check each item')}</span>`
    : `${L(`${doc.pages} 頁 · 找到 ${doc.items.length} 項`, `${doc.pages} pages · ${doc.items.length} items found`)} · <span class="demo-note">${icon('info')} ${L('示範：預先寫好的抽取結果，並非 AI 分析', 'Demo: pre-written results, not AI analysis')}</span>`;
  return `
    <section class="sheet review" id="review" data-ink="${ink}" aria-label="${esc(doc.name)}">
      <header class="review__head">
        <div>
          <h2>${esc(doc.name)}</h2>
          <p>${meta}</p>
        </div>
        ${pending
          ? `<button class="btn btn--ink" type="button" data-action="ink-all" data-doc="${doc.id}">${icon('check')} ${L(`全部確認（${pending} 項）`, `Confirm all (${pending})`)}</button>`
          : `<span class="chip chip--ok">${icon('check')} ${L('全部已核對', 'All checked')}</span>`}
      </header>
      <table class="xtable">
        <thead><tr><th>${L('類型', 'Type')}</th><th>${L('內容', 'Item')}</th><th>${L('日期／時間', 'Date / time')}</th><th>${L('比重', 'Weight')}</th><th>${L('出處', 'Source')}</th><th>${L('預計時數', 'Estimate')}</th><th><span class="sr-only">${L('操作', 'Actions')}</span></th></tr></thead>
        <tbody>${doc.items.map((it) => (ui.editItem === it.id ? editRow(doc, view(doc, it)) : itemRow(doc, view(doc, it)))).join('')}</tbody>
      </table>
    </section>`;
}

function itemRow(doc, it) {
  const actions = it.state === 'pencil'
    ? `<button class="btn btn--sm btn--ink" type="button" data-action="item" data-doc="${doc.id}" data-item="${it.id}" data-to="ink">${icon('check')} ${L('對，確認', 'Correct')}</button>
       <button class="btn btn--sm" type="button" data-action="edit-item" data-item="${it.id}">${icon('pencil')} ${L('改', 'Edit')}</button>
       <button class="btn btn--sm btn--ghost" type="button" data-action="item" data-doc="${doc.id}" data-item="${it.id}" data-to="erased">${icon('eraser')} ${L('不是', 'Remove')}</button>`
    : it.state === 'ink'
      ? `<span class="xstate">${icon('check')} ${it.applied === 'task' ? L('已加入任務', 'Added to Tasks') : it.applied === 'dup' ? L('科目裡已有，沒有重複加入', 'Already in the course') : it.applied === 'moved' ? L('已更新任務的日期', 'Task date updated') : it.applied === 'busy' ? L('已加入沒空時間', 'Added as busy time') : L('已確認', 'Confirmed')}${it.edited ? L('（你改過）', ' (edited)') : ''}</span>
         ${it.applied ? '' : `<button class="btn btn--sm btn--ghost" type="button" data-action="edit-item" data-item="${it.id}" aria-label="${L('修改', 'Edit')}">${icon('pencil')}</button>`}`
      : `<span class="xstate">${icon('x')} ${L('已刪除', 'Removed')}</span>
         <button class="btn btn--sm btn--ghost" type="button" data-action="item" data-doc="${doc.id}" data-item="${it.id}" data-to="pencil">${L('復原', 'Undo')}</button>`;
  return `
    <tr class="xrow--${it.state}">
      <td><span class="xtype">${esc(it.type)}</span></td>
      <td><div class="xwhat">${esc(it.what)}</div>${it.warn && it.state === 'pencil' ? `<div class="xwarn">${icon('alert')}<span>${esc(it.warn)}</span></div>` : ''}</td>
      <td class="mono ${it.when === '—' ? 'is-empty' : ''}" style="font-size:13px">${esc(it.when)}</td>
      <td class="${it.weight ? '' : 'is-empty'}">${it.weight ? esc(it.weight) : '—'}</td>
      <td><span class="xsrc" ${it.quote ? `title="${esc(it.quote)}"` : ''}>${icon('file')} ${esc(it.src)}</span>${it.quote ? `<small class="xquote">${esc(it.quote)}</small>` : ''}</td>
      <td class="xhours ${!it.hours || it.hours === '—' ? 'is-empty' : ''}">${esc(it.hours || '—')}${it.hoursNote ? `<small>${esc(it.hoursNote)}</small>` : ''}</td>
      <td><div class="xact">${actions}</div></td>
    </tr>`;
}

function editRow(doc, it) {
  return `
    <tr class="xrow--pencil">
      <td><span class="xtype">${esc(it.type)}</span></td>
      <td><div class="xwhat">${esc(it.what)}</div></td>
      <td><label class="sr-only" for="edit-when">${L('日期／時間', 'Date / time')}</label><input class="input" id="edit-when" value="${esc(it.when)}" style="min-width:150px"></td>
      <td>${esc(it.weight || '—')}</td>
      <td><span class="xsrc">${esc(it.src)}</span></td>
      <td><label class="sr-only" for="edit-hours">${L('預計時數', 'Estimate')}</label><input class="input" id="edit-hours" value="${esc(it.hours || '')}" style="min-width:90px"></td>
      <td><div class="xact">
        <button class="btn btn--sm btn--ink" type="button" data-action="save-item" data-doc="${doc.id}" data-item="${it.id}">${icon('check')} ${L('保存並確認', 'Save and confirm')}</button>
        <button class="btn btn--sm btn--ghost" type="button" data-action="edit-item" data-item="">${L('取消', 'Cancel')}</button>
      </div></td>
    </tr>`;
}

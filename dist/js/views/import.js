// 課程資料：放入大綱 → AI 抽出項目（未確認） → 你核對確認。（只在示範中使用）
import { esc, icon } from '../ui.js';
import { ui, getMode } from '../store.js';
import { L } from '../i18n.js';

export function render(s) {
  const mine = getMode() === 'mine';
  const doc = s.docs.find((d) => d.id === ui.docId) || s.docs[0];
  const pendingAll = s.docs.flatMap((d) => d.items).filter((i) => i.state === 'pencil').length;
  return `
    <div class="page-head">
      <div>
        <p class="eyebrow">${L('課程資料', 'Syllabus')}</p>
        <h1 class="page-head__title">${L('課程資料', 'Syllabus')}</h1>
        <p class="page-head__lede">${mine
          ? L('把課程大綱保存在這裡，方便隨時打開。自動找出 deadline 的功能還沒接通，請先按大綱手動加入任務和上課時間。', 'Keep your syllabi here to open any time. Automatic deadline finding is not connected yet; add tasks and class times by hand from the syllabus.')
          : L('AI 會從大綱找出 deadline、考試、上課時間和功課要求，每一項都附出處頁碼。你核對、確認之後，才會用來排計劃。', 'The AI finds deadlines, exams, class times and requirements in your syllabus, each with its page number. Only what you check and confirm is used for planning.')}</p>
      </div>
      ${mine ? '' : pendingAll ?`<span class="chip chip--pencil">${icon('pencil')} ${L(`還有 ${pendingAll} 項待核對`, `${pendingAll} to check`)}</span>` : `<span class="chip chip--ok">${icon('check')} ${L('全部已核對', 'All checked')}</span>`}
    </div>
    <div class="imp">
      <div class="imp__top">
        <div class="drop" data-drop>
          <div class="drop__icon">${icon('clip')}</div>
          <p class="drop__title">${L('把課程大綱 PDF 放在這裡', 'Drop your syllabus PDF here')}</p>
          <p class="drop__sub">${mine
            ? L('檔案只保存在這個瀏覽器（每份最多 20 MB），不會上傳，也不會交給 AI 讀取。', 'Files stay in this browser (up to 20 MB each). They are not uploaded or read by AI.')
            : L('原型不會上傳或讀取檔案內容。選了檔案只會顯示檔名，然後改用示範大綱。', 'The prototype does not upload or read files. It only shows the file name and uses the demo syllabi instead.')}</p>
          <div class="drop__actions">
            <label class="btn ${mine ? 'btn--ink' : ''}">${icon('upload')} ${L('選擇檔案', 'Choose file')}<input type="file" accept=".pdf,application/pdf" ${mine ? 'multiple' : ''} hidden data-file></label>
            ${mine ? '' : `<button class="btn btn--ink" type="button" data-action="demo-docs">${icon('file')} ${L('看示範大綱', 'See demo syllabi')}</button>`}
          </div>
          ${ui.dropMsg ? `<p class="drop__msg" role="status">${esc(ui.dropMsg)}</p>` : ''}
        </div>
        <section class="sheet imp-how" aria-label="${L('流程', 'How it works')}">
          <h2>${L('大綱怎樣變成計劃', 'From syllabus to plan')}</h2>
          ${mine ? `<ol class="how-list">
            <li><span class="how-list__n">1</span><span><b>${L('放入大綱', 'Add the syllabus')}</b><br>${L('PDF 保存在這個瀏覽器，隨時可以打開。', 'The PDF stays in this browser, ready to open.')}</span></li>
            <li><span class="how-list__n">2</span><span><b>${L('自動抽取（未接通）', 'Automatic extraction (not connected)')}</b><br>${L('之後會由 AI 找出 deadline、考試、上課時間，等你確認。', 'Later, AI will find deadlines, exams and class times for you to confirm.')}</span></li>
            <li><span class="how-list__n">3</span><span><b>${L('現在：自己加入', 'For now: add them yourself')}</b><br>${L('功課和考試加到「任務」，上課時間在「本週」按「改沒空的時間」加入。', 'Add assignments and exams to Tasks, class times with "Edit busy times" on This week.')}</span></li>
            <li><span class="how-list__n">4</span><span><b>${L('到本週排程', 'Schedule on This week')}</b><br>${L('產生建議後，確認了才會生效。', 'Suggestions apply only after you confirm.')}</span></li>
          </ol>` : `<ol class="how-list">
            <li><span class="how-list__n">1</span><span><b>${L('放入大綱', 'Add the syllabus')}</b><br>${L('第一版先做 PDF；之後可以接 Canvas。', 'PDF first; Canvas later.')}</span></li>
            <li><span class="how-list__n">2</span><span><b>${L('AI 抽出（未確認）', 'AI extracts (not confirmed)')}</b><br>${L('deadline、考試、上課時間、要求，每項附頁碼；不肯定的會講明。', 'Deadlines, exams, class times and requirements, each with a page number; it says when it is unsure.')}</span></li>
            <li><span class="how-list__n">3</span><span><b>${L('你核對', 'You check')}</b><br>${L('對就確認，錯就改，不是就刪除。', 'Confirm what is right, fix what is wrong, remove what does not belong.')}</span></li>
            <li><span class="how-list__n">4</span><span><b>${L('確認了才用來排程', 'Only confirmed items are planned')}</b><br>${L('上課時間變成每週的沒空時間（灰色），功課拆成步驟、估算時數。', 'Class times become weekly busy times (gray); assignments are split into steps with estimates.')}</span></li>
          </ol>`}
        </section>
      </div>

      ${doc ? `<div class="docs" role="group" aria-label="${L('已放入的大綱', 'Syllabi added')}">
        ${s.docs.map((d) => docCard(s, d, d.id === doc.id)).join('')}
      </div>` : `<p class="docs-empty muted">${L('還沒有放入大綱。', 'No syllabus added yet.')}</p>`}

      ${!doc ? '' : doc.own ? ownPanel(doc) : `${review(s, doc)}${confirmed(doc)}`}
    </div>`;
}

function ownPanel(doc) {
  const mb = doc.size ? `${Math.max(0.1, doc.size / 1048576).toFixed(1)} MB` : '';
  return `
    <section class="sheet review own-doc" id="review" aria-label="${esc(doc.name)}">
      <header class="review__head">
        <div>
          <h2>${esc(doc.name)}</h2>
          <p>${mb} · ${L('保存在這個瀏覽器', 'Saved in this browser')}</p>
        </div>
        <div class="own-doc__acts">
          <button class="btn" type="button" data-action="file-download" data-file-id="${doc.id}">${icon('file')} ${L('打開檔案', 'Open file')}</button>
          <button class="btn btn--ghost" type="button" data-action="doc-remove" data-doc="${doc.id}">${icon('x')} ${L('移除', 'Remove')}</button>
        </div>
      </header>
      <div class="own-doc__body">
        <p class="demo-note">${icon('info')} ${L('自動找出 deadline、考試和上課時間的功能還沒接通，所以這裡不會出現待確認項目。', 'Automatic finding of deadlines, exams and class times is not connected yet, so no items appear here to confirm.')}</p>
        <p>${L('對照大綱，自己加入：', 'Using the syllabus, add these yourself:')}</p>
        <div class="own-doc__next">
          <a class="btn btn--ink" href="#/add-task">${icon('plus')} ${L('功課和考試 → 新增任務', 'Assignments and exams → Add task')}</a>
          <a class="btn" href="#/time">${icon('hatch')} ${L('上課時間 → 改沒空的時間', 'Class times → Edit busy times')}</a>
        </div>
      </div>
    </section>`;
}

function confirmed(doc) {
  const items = doc.items.filter((i) => i.state === 'ink');
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
      <span class="doc__icon">${icon('file')}<span>PDF</span></span>
      <span>
        <span class="doc__name">${esc(d.name)}</span>
        ${d.own ? `<span class="doc__meta">${L('自己的大綱', 'Your syllabus')}</span>` : `<span class="doc__meta">${L(`${d.pages} 頁 · 找到 ${d.items.length} 項`, `${d.pages} pages · ${d.items.length} items found`)}</span>
        ${pending ? `<span class="chip chip--pencil">${icon('pencil')} ${L(`${pending} 項待核對`, `${pending} to check`)}</span>` : `<span class="chip chip--ok">${icon('check')} ${L('已全部核對', 'All checked')}</span>`}`}
      </span>
    </button>`;
}

function review(s, doc) {
  const ink = s.courses[doc.course].ink;
  const pending = doc.items.filter((i) => i.state === 'pencil').length;
  return `
    <section class="sheet review" id="review" data-ink="${ink}" aria-label="${esc(doc.name)}">
      <header class="review__head">
        <div>
          <h2>${esc(doc.name)}</h2>
          <p>${L(`${doc.pages} 頁 · 找到 ${doc.items.length} 項`, `${doc.pages} pages · ${doc.items.length} items found`)} · <span class="demo-note">${icon('info')} ${L('示範：預先寫好的抽取結果，並非 AI 分析', 'Demo: pre-written results, not AI analysis')}</span></p>
        </div>
        ${pending
          ? `<button class="btn btn--ink" type="button" data-action="ink-all" data-doc="${doc.id}">${icon('check')} ${L(`全部確認（${pending} 項）`, `Confirm all (${pending})`)}</button>`
          : `<span class="chip chip--ok">${icon('check')} ${L('全部已核對', 'All checked')}</span>`}
      </header>
      <table class="xtable">
        <thead><tr><th>${L('類型', 'Type')}</th><th>${L('內容', 'Item')}</th><th>${L('日期／時間', 'Date / time')}</th><th>${L('比重', 'Weight')}</th><th>${L('出處', 'Source')}</th><th>${L('預計時數', 'Estimate')}</th><th><span class="sr-only">${L('操作', 'Actions')}</span></th></tr></thead>
        <tbody>${doc.items.map((it) => (ui.editItem === it.id ? editRow(doc, it) : itemRow(doc, it))).join('')}</tbody>
      </table>
    </section>`;
}

function itemRow(doc, it) {
  const actions = it.state === 'pencil'
    ? `<button class="btn btn--sm btn--ink" type="button" data-action="item" data-doc="${doc.id}" data-item="${it.id}" data-to="ink">${icon('check')} ${L('對，確認', 'Correct')}</button>
       <button class="btn btn--sm" type="button" data-action="edit-item" data-item="${it.id}">${icon('pencil')} ${L('改', 'Edit')}</button>
       <button class="btn btn--sm btn--ghost" type="button" data-action="item" data-doc="${doc.id}" data-item="${it.id}" data-to="erased">${icon('eraser')} ${L('不是', 'Remove')}</button>`
    : it.state === 'ink'
      ? `<span class="xstate">${icon('check')} ${L('已確認', 'Confirmed')}${it.edited ? L('（你改過）', ' (edited)') : ''}</span>
         <button class="btn btn--sm btn--ghost" type="button" data-action="edit-item" data-item="${it.id}" aria-label="${L('修改', 'Edit')}">${icon('pencil')}</button>`
      : `<span class="xstate">${icon('x')} ${L('已刪除', 'Removed')}</span>
         <button class="btn btn--sm btn--ghost" type="button" data-action="item" data-doc="${doc.id}" data-item="${it.id}" data-to="pencil">${L('復原', 'Undo')}</button>`;
  return `
    <tr class="xrow--${it.state}">
      <td><span class="xtype">${esc(it.type)}</span></td>
      <td><div class="xwhat">${esc(it.what)}</div>${it.warn && it.state === 'pencil' ? `<div class="xwarn">${icon('alert')}<span>${esc(it.warn)}</span></div>` : ''}</td>
      <td class="mono ${it.when === '—' ? 'is-empty' : ''}" style="font-size:13px">${esc(it.when)}</td>
      <td class="${it.weight ? '' : 'is-empty'}">${it.weight ? esc(it.weight) : '—'}</td>
      <td><span class="xsrc">${icon('file')} ${esc(it.src)}</span></td>
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

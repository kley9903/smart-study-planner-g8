// 課程資料：放入大綱 → AI 抽出項目（未確認） → 你核對確認。（只在示範中使用）
import { esc, icon } from '../ui.js';
import { ui } from '../store.js';
import { L } from '../i18n.js';

export function render(s) {
  const doc = s.docs.find((d) => d.id === ui.docId) || s.docs[0];
  const pendingAll = s.docs.flatMap((d) => d.items).filter((i) => i.state === 'pencil').length;
  return `
    <div class="page-head">
      <div>
        <p class="eyebrow">${L('課程資料', 'Syllabus')}</p>
        <h1 class="page-head__title">${L('課程資料', 'Syllabus')}</h1>
        <p class="page-head__lede">${L('AI 會從大綱找出 deadline、考試、上課時間和功課要求，每一項都附出處頁碼。你核對、確認之後，才會用來排計劃。', 'The AI finds deadlines, exams, class times and requirements in your syllabus, each with its page number. Only what you check and confirm is used for planning.')}</p>
      </div>
      ${pendingAll ? `<span class="chip chip--pencil">${icon('pencil')} ${L(`還有 ${pendingAll} 項待核對`, `${pendingAll} to check`)}</span>` : `<span class="chip chip--ok">${icon('check')} ${L('全部已核對', 'All checked')}</span>`}
    </div>
    <div class="imp">
      <div class="imp__top">
        <div class="drop" data-drop>
          <div class="drop__icon">${icon('clip')}</div>
          <p class="drop__title">${L('把課程大綱 PDF 放在這裡', 'Drop your syllabus PDF here')}</p>
          <p class="drop__sub">${L('原型不會上傳或讀取檔案內容。選了檔案只會顯示檔名，然後改用示範大綱。', 'The prototype does not upload or read files. It only shows the file name and uses the demo syllabi instead.')}</p>
          <div class="drop__actions">
            <label class="btn">${icon('upload')} ${L('選擇檔案', 'Choose file')}<input type="file" accept=".pdf,application/pdf" hidden data-file></label>
            <button class="btn btn--ink" type="button" data-action="demo-docs">${icon('file')} ${L('看示範大綱', 'See demo syllabi')}</button>
          </div>
          ${ui.dropMsg ? `<p class="drop__msg" role="status">${esc(ui.dropMsg)}</p>` : ''}
        </div>
        <section class="sheet imp-how" aria-label="${L('流程', 'How it works')}">
          <h2>${L('大綱怎樣變成計劃', 'From syllabus to plan')}</h2>
          <ol class="how-list">
            <li><span class="how-list__n">1</span><span><b>${L('放入大綱', 'Add the syllabus')}</b><br>${L('第一版先做 PDF；之後可以接 Canvas。', 'PDF first; Canvas later.')}</span></li>
            <li><span class="how-list__n">2</span><span><b>${L('AI 抽出（未確認）', 'AI extracts (not confirmed)')}</b><br>${L('deadline、考試、上課時間、要求，每項附頁碼；不肯定的會講明。', 'Deadlines, exams, class times and requirements, each with a page number; it says when it is unsure.')}</span></li>
            <li><span class="how-list__n">3</span><span><b>${L('你核對', 'You check')}</b><br>${L('對就確認，錯就改，不是就刪除。', 'Confirm what is right, fix what is wrong, remove what does not belong.')}</span></li>
            <li><span class="how-list__n">4</span><span><b>${L('確認了才用來排程', 'Only confirmed items are planned')}</b><br>${L('上課時間變成每週的沒空時間（灰色），功課拆成步驟、估算時數。', 'Class times become weekly busy times (gray); assignments are split into steps with estimates.')}</span></li>
          </ol>
        </section>
      </div>

      <div class="docs" role="group" aria-label="${L('已放入的大綱', 'Syllabi added')}">
        ${s.docs.map((d) => docCard(s, d, d.id === doc.id)).join('')}
      </div>

      ${review(s, doc)}
    </div>`;
}

function docCard(s, d, current) {
  const pending = d.items.filter((i) => i.state === 'pencil').length;
  const ink = s.courses[d.course].ink;
  return `
    <button class="doc" type="button" data-action="doc" data-doc="${d.id}" data-ink="${ink}" ${current ? 'aria-current="true"' : ''}>
      <span class="doc__icon">${icon('file')}<span>PDF</span></span>
      <span>
        <span class="doc__name">${esc(d.name)}</span>
        <span class="doc__meta">${L(`${d.pages} 頁 · 找到 ${d.items.length} 項`, `${d.pages} pages · ${d.items.length} items found`)}</span>
        ${pending ? `<span class="chip chip--pencil">${icon('pencil')} ${L(`${pending} 項待核對`, `${pending} to check`)}</span>` : `<span class="chip chip--ok">${icon('check')} ${L('已全部核對', 'All checked')}</span>`}
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

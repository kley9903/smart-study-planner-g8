import { timeField, dateField } from '../pickers.js';
import { esc, icon } from '../ui.js';
import { L } from '../i18n.js';
import { hm } from '../time.js';
import { getMode } from '../store.js';

export function editor(s, task, date) {
  const field = (label, html, wide = '') => `<label class="field ${wide}"><span class="field__label">${label}</span>${html}</label>`;
  return `<form class="sheet tform" data-form="${task ? 'edit-task' : 'task'}" ${task ? `data-task="${task.id}"` : ''}>
    <div class="month__toolbar"><h2 class="tform__title">${icon('pencil')} ${task ? L('編輯任務', 'Edit task') : L('新增功課或考試', 'Add an assignment or exam')}</h2><button type="button" class="btn btn--sm btn--ghost" data-action="task-form-close">${L('取消', 'Cancel')}</button></div>
    <div class="tform__grid">
      ${field(L('名稱', 'Name'), `<input class="input" name="title" required maxlength="80" value="${esc(task?.title || '')}">`, 'tform__wide')}
      ${field(L('科目', 'Course'), `<input class="input" name="course" maxlength="40" list="course-list" value="${esc(task ? s.courses[task.course].name : '')}">`)}
      ${field(L('類型', 'Type'), `<input class="input" name="kind" maxlength="30" value="${esc(task?.kind || L('功課', 'Assignment'))}" required>`)}
      ${field(L('截止日期', 'Due date'), dateField('date', task?.due.date || date || s.today, 'input'))}
      ${field(L('截止時間', 'Due time'), timeField('time', task ? hm(task.due.min) : '23:59', 'input'))}
      ${task ? '' : field(L('預計要幾小時', 'Estimated hours'), '<input class="input" type="number" name="hours" min="0.5" max="40" step="0.5" value="3" required>')}
      ${field(L('作業要求／備註', 'Requirements / notes'), `<textarea class="input" name="requirements" maxlength="5000" rows="3">${esc(task?.requirements || '')}</textarea>`, 'tform__wide')}
    </div>
    <datalist id="course-list">${Object.values(s.courses).map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
    ${task ? `<fieldset class="step-editor"><legend>${L('子任務', 'Steps')}</legend><div data-step-rows>${task.steps.filter((st) => !st.dropped).map(stepFields).join('')}</div><button class="btn btn--sm" type="button" data-action="step-add">${icon('plus')} ${L('新增子任務', 'Add step')}</button></fieldset>` : ''}
    ${task ? '' : `<fieldset class="step-editor" data-new-steps><legend>${L('子任務', 'Steps')}</legend>
      <div data-step-rows></div><button class="btn btn--sm" type="button" data-action="step-add">${icon('plus')} ${L('新增子任務', 'Add step')}</button></fieldset>
    ${getMode() === 'mine' ? `<label class="field"><span class="field__label">${L('作業指引檔案（可選，每份最多 10 MB）', 'Assignment guidelines (optional, up to 10 MB each)')}</span><input class="input" type="file" name="guide" multiple></label>
    <p class="demo-note">${L('檔案只存在這個瀏覽器。', 'Files stay in this browser.')}</p>` : `<p class="demo-note">${L('示範中不能上傳。', 'Upload is off in the demo.')}</p>`}`}
    <div class="tform__foot"><button class="btn btn--ink" type="submit">${icon('check')} ${L('保存任務', 'Save task')}</button></div>
  </form>`;
}

export function stepFields(step = {}) {
  return `<div class="step-editor__row" data-step-id="${step.id || ''}">
    <label class="field"><span class="field__label">${L('子任務名稱', 'Step name')}</span><input class="input" name="step-title" required maxlength="80" value="${esc(step.title || '')}"></label>
    <label class="field"><span class="field__label">${L('小時', 'Hours')}</span><input class="input" name="step-hours" type="number" min="0.5" max="10" step="0.5" required value="${(step.min || 60) / 60}"></label>
    <button class="btn btn--sm btn--ghost" type="button" data-action="step-remove" aria-label="${L('移除此子任務', 'Remove this step')}">${icon('x')}</button>
  </div>`;
}

// 示範用的固定拆法：按類型選範本，再按比例分配時數（以半小時為單位）。未接 AI。
const templates = [
  [/考|測|quiz|exam|test|midterm|final/i, [['整理筆記與重點', 'Review notes', 3], ['做練習題', 'Practice questions', 4], ['溫習錯題', 'Go over mistakes', 3]]],
  [/報告|論文|essay|report|paper|project/i, [['找資料', 'Research', 3], ['寫大綱', 'Outline', 2], ['寫初稿', 'First draft', 4], ['修改與校對', 'Revise and proofread', 2]]],
];
const fallback = [['讀題與整理資料', 'Read the brief and materials', 2], ['完成主要部分', 'Do the main work', 5], ['檢查與提交', 'Check and submit', 2]];

export function suggestSteps(kind, title, hours) {
  const parts = [...(templates.find(([re]) => re.test(`${kind} ${title}`)) || [null, fallback])[1]];
  const halves = Math.max(1, Math.round(hours * 2));
  // 時數太少時，先拿走比重最輕的步驟，確保合計不超過預計時數
  while (parts.length > halves) parts.splice(parts.reduce((low, p, i) => (p[2] <= parts[low][2] ? i : low), 0), 1);
  const weight = parts.reduce((n, p) => n + p[2], 0);
  const exact = parts.map((p) => (halves * p[2]) / weight);
  const out = exact.map((x) => Math.max(1, Math.floor(x)));
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  for (let k = 0, rest = halves - out.reduce((a, b) => a + b, 0); rest > 0; k++, rest--) out[order[k % order.length]] += 1;
  // 子任務每個最多 10 小時（表單上限），太長就分成幾段
  return parts.flatMap((p, i) => {
    const n = Math.ceil(out[i] / 20);
    const base = Math.floor(out[i] / n);
    return Array.from({ length: n }, (_, k) => ({
      title: n > 1 ? `${L(p[0], p[1])} ${k + 1}` : L(p[0], p[1]),
      min: (base + (k < out[i] - base * n ? 1 : 0)) * 30,
    }));
  });
}

export function stepHelper() {
  return `<aside class="card add-task-help">
    <h2>${icon('note')} ${L('AI 幫你拆子任務', 'Split into steps')}</h2>
    <button class="btn btn--ink" type="button" data-action="suggest-steps">${icon('pencil')} ${L('建議拆法', 'Suggest steps')}</button>
    <p class="demo-note">${icon('info')} ${L('示範：按類型用固定範本拆分。', 'Demo: fixed templates by type.')}</p>
  </aside>`;
}

export function attachments(task, mine) {
  return `<details class="task-files"><summary>${icon('clip')} ${L('作業要求與附件', 'Requirements and attachments')} (${(task.attachments || []).length})</summary><div class="task-files__body">
    ${task.requirements ? `<p class="task-requirements">${esc(task.requirements)}</p>` : `<p class="muted">${L('未有作業要求', 'No requirements yet')}</p>`}
    ${(task.attachments || []).map((file) => `<button type="button" class="btn btn--sm" data-action="file-download" data-file-id="${file.id}">${icon('file')} ${esc(file.name)}</button>`).join('')}
    ${mine ? `<label class="field"><span class="field__label">${L('加入作業說明文件（每份最多 10 MB）', 'Attach assignment guidelines (up to 10 MB each)')}</span><input class="input" type="file" data-task-file="${task.id}"></label>` : ''}
    <p class="demo-note">${L('附件只存在這個瀏覽器。', 'Attachments stay in this browser.')}</p>
  </div></details>`;
}

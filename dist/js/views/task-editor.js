import { esc, icon } from '../ui.js';
import { L } from '../i18n.js';
import { hm } from '../time.js';

export function editor(s, task, date) {
  const field = (label, html, wide = '') => `<label class="field ${wide}"><span class="field__label">${label}</span>${html}</label>`;
  return `<form class="sheet tform" data-form="${task ? 'edit-task' : 'task'}" ${task ? `data-task="${task.id}"` : ''}>
    <div class="month__toolbar"><h2 class="tform__title">${icon('pencil')} ${task ? L('編輯任務', 'Edit task') : L('新增功課或考試', 'Add an assignment or exam')}</h2><button type="button" class="btn btn--sm btn--ghost" data-action="task-form-close">${L('取消', 'Cancel')}</button></div>
    <div class="tform__grid">
      ${field(L('名稱', 'Name'), `<input class="input" name="title" required maxlength="80" value="${esc(task?.title || '')}">`, 'tform__wide')}
      ${field(L('科目', 'Course'), `<input class="input" name="course" maxlength="40" list="course-list" value="${esc(task ? s.courses[task.course].name : '')}">`)}
      ${field(L('類型', 'Type'), `<input class="input" name="kind" maxlength="30" value="${esc(task?.kind || L('功課', 'Assignment'))}" required>`)}
      ${field(L('截止日期', 'Due date'), `<input class="input" type="date" name="date" value="${task?.due.date || date || s.today}" required>`)}
      ${field(L('截止時間', 'Due time'), `<input class="input" type="time" name="time" value="${task ? hm(task.due.min) : '23:59'}" required>`)}
      ${task ? '' : field(L('預計要幾小時', 'Estimated hours'), '<input class="input" type="number" name="hours" min="0.5" max="40" step="0.5" value="3" required>')}
      ${field(L('作業要求／備註', 'Requirements / notes'), `<textarea class="input" name="requirements" maxlength="5000" rows="3">${esc(task?.requirements || '')}</textarea>`, 'tform__wide')}
    </div>
    <datalist id="course-list">${Object.values(s.courses).map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
    ${task ? `<fieldset class="step-editor"><legend>${L('子任務', 'Steps')}</legend><div data-step-rows>${task.steps.filter((st) => !st.dropped).map(stepFields).join('')}</div><button class="btn btn--sm" type="button" data-action="step-add">${icon('plus')} ${L('新增子任務', 'Add step')}</button></fieldset>
    <p class="demo-note">${L('更改截止日期或子任務時，會清除這份任務尚未開始的安排及待確認建議；已完成／進行中的紀錄會保留。到本週重新排程並確認。', 'Changing the deadline or steps clears this task’s unstarted sessions and pending suggestions. Completed and ongoing records are kept. Schedule again on Week and confirm.')}</p>` : ''}
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

export function attachments(task, mine) {
  return `<details class="task-files"><summary>${icon('clip')} ${L('作業要求與附件', 'Requirements and attachments')} (${(task.attachments || []).length})</summary><div class="task-files__body">
    ${task.requirements ? `<p class="task-requirements">${esc(task.requirements)}</p>` : `<p class="muted">${L('尚未填寫作業要求，可從「編輯任務」加入。', 'Add requirements using Edit task.')}</p>`}
    ${(task.attachments || []).map((file) => `<button type="button" class="btn btn--sm" data-action="file-download" data-file-id="${file.id}">${icon('file')} ${esc(file.name)}</button>`).join('')}
    ${mine ? `<label class="field"><span class="field__label">${L('加入作業說明文件（每份最多 10 MB）', 'Attach assignment guidelines (up to 10 MB each)')}</span><input class="input" type="file" data-task-file="${task.id}"></label>` : ''}
    <p class="demo-note">${L('附件只保存在這個瀏覽器，不會上傳或交給 AI 分析；清除網站資料會一併移除。', 'Attachments stay in this browser. They are not uploaded or analysed by AI; clearing site data removes them.')}</p>
  </div></details>`;
}

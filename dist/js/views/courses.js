// 課程資料（自己的計劃）：每科一張長方形的卡，寫著代號和全名；點一下展開，看這科已確認的功課、測驗和考試。
// 收集資料、AI 核對、逐項確認都在另一頁（#/import/add）；可以分幾次加，確認的才放進科目，未確認的不會出現在這裡。
// 上課時間不收：這個網站只幫你安排溫習和做功課的時間。
// 版面照使用者給的參考圖：暖色紙卡，左上角斜貼科目色紙膠帶，卡頭大號代號、右邊淡淡的浮水印（見 mark）；
// 卡裡全用襯線字，科目色用在代號、小標題、箭咀和「補充資訊」按鈕。
// 展開後以小標題（測驗和考試、功課）分組，類型只寫在小標題；每項一行：名稱｜日期時間｜比重。
// 沒有日期的（自己加時留空、或大綱寫日期未公布）放在同一組最後，日期一格空白，不排進時間表；用鉛筆補日期才變成任務。
//
// 7 天內到期用朱紅標出，已過的變淡。
// 每項右邊一枝小鉛筆和一個垃圾桶：鉛筆原地改名稱、截止日期時間、比重（rowForm，只用 ✓ ✕ 符號按鈕）；垃圾桶確認後刪除；改名時卡頭原地變輸入格，字型跟平時一樣（renameForm）。
// 卡底「新增一項」：原地多一行輸入格，自己加功課、測驗或考試（newForm）。
import { timeField, dateField } from '../pickers.js';
import { esc, icon } from '../ui.js';
import { ui, undatedOf } from '../store.js';
import { L } from '../i18n.js';
import { mdNum, wd, hm } from '../time.js';

// 分組看類型（AI 給的、你拖動或在任務裡改的）；類型是空的或「其他」才看名稱（只認明確的字，「final report」不是考試）。
const EXAM_KIND = /考試|測驗|小測|exam|quiz|test/i;
const GENERIC_KIND = /^(其他|other)?$/i;
const EXAM_TITLE = /\b(?:exam|quiz|test|midterm)\b|考試|測驗|小測/i;
/** 這一項放在哪一組：'exam'（測驗和考試）或 'work'（功課）。 */
export const groupOf = (t) => ((GENERIC_KIND.test((t.kind || '').trim()) ? EXAM_TITLE.test(t.title) : EXAM_KIND.test(t.kind)) ? 'exam' : 'work');
const due = (t) => `${t.due.date} ${String(t.due.min).padStart(4, '0')}`;
/**
 * 卡頭的浮水印：代號裡的數字（COMP1023 → 1023）；沒有數字時，短代號照用（MATH），
 * 中文名用頭兩個字（微積分 → 微積），長英文名用字首（Calculus IB → CIB）。
 */
export function mark(name) {
  const n = String(name || '').trim();
  const digits = n.match(/\d{3,5}/);
  if (digits) return digits[0];
  const compact = n.replace(/\s+/g, '');
  if (/[\u3400-\u9fff]/.test(compact)) return [...compact].slice(0, 2).join('');
  if (compact.length <= 5) return compact.toUpperCase();
  // 字首；本來就是縮寫的短大寫字（IB、II）整個保留
  return n.split(/\s+/).map((w) => (/^[A-Z0-9]{1,3}$/.test(w) ? w : w[0])).join('').slice(0, 4).toUpperCase();
}
const daysFrom = (today, iso) => Math.round((new Date(`${iso}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 864e5);

export function coursesPage(s) {
  const courses = Object.values(s.courses);
  const waiting = s.docs.filter((d) => d.own).flatMap((d) => d.items).filter((i) => i.state === 'pencil').length;
  const firstWaiting = s.docs.find((d) => d.own && d.items.some((i) => i.state === 'pencil'));
  return `
    <div class="page-head">
      <div>
        <p class="eyebrow">${L('課程資料', 'Courses')}</p>
        <h1 class="page-head__title">${L('課程資料', 'Courses')}</h1>
        ${courses.length ? '' : `<p class="page-head__lede">${L('還沒有科目，先放入一份課程大綱。', 'No courses yet. Start with a syllabus.')}</p>`}
      </div>
      <label class="btn" title="${L('在 Canvas「日曆」打開「Calendar Feed」的連結，會下載 .ics 檔', 'In Canvas Calendar, open the "Calendar Feed" link to download an .ics file')}">${icon('upload')} ${L('加入 Canvas 日曆', 'Add Canvas calendar')}<input type="file" accept=".ics,text/calendar" hidden data-file></label>
    </div>
    ${waiting ? `<a class="course-pending" href="#/import/add" data-action="course-continue" data-doc="${firstWaiting.id}">${icon('pencil')} ${L(`還有 ${waiting} 項等你確認`, `${waiting} item${waiting === 1 ? '' : 's'} waiting for you to confirm`)} ${icon('arrow')}</a>` : ''}
    <div class="courses">
      ${courses.map((c) => courseCard(s, c)).join('')}
      <button class="course-add ${courses.length ? '' : 'is-first'}" type="button" data-action="course-add">
        <span class="course-add__plus">${icon('plus')}</span>
        <b>${L('增加科目', 'Add a course')}</b>
      </button>
    </div>`;
}

function courseCard(s, c) {
  const open = ui.openCourse === c.id;
  const tasks = s.tasks.filter((t) => t.course === c.id).sort((a, b) => due(a).localeCompare(due(b)));
  const exams = tasks.filter((t) => groupOf(t) === 'exam');
  const work = tasks.filter((t) => groupOf(t) === 'work');
  const undated = undatedOf(s, c.id);
  const undatedIn = (key) => undated.filter((u) => (u.group || groupOf({ kind: u.kind, title: u.title })) === key);
  const any = tasks.length + undated.length;
  const id = `course-${c.id}`;
  const wm = mark(c.name);
  return `
    <section class="course ${open ? 'is-open' : ''}" data-ink="${c.ink}">
      <span class="course__tape" aria-hidden="true"></span>
      ${ui.renameCourse === c.id ? renameForm(c) : `<button class="course__head ${c.title ? 'has-name' : ''}" type="button" data-action="course-toggle" data-course="${c.id}" aria-expanded="${open}" aria-controls="${id}">
        <span class="course__title">
          <span class="course__code">${esc(c.name)}</span>
          ${c.title ? `<span class="course__name">${esc(c.title)}</span>` : ''}
        </span>
        <span class="course__mark ${/^[0-9A-Z]+$/.test(wm) ? 'is-latin' : ''}" aria-hidden="true">${esc(wm)}</span>
        <span class="course__chev" aria-hidden="true">${icon('chevron')}</span>
      </button>`}
      ${open ? `
      <div class="course__body" id="${id}">
        ${group(s, c, 'exam', L('測驗和考試', 'Quizzes and exams'), exams, undatedIn('exam'), any)}
        ${group(s, c, 'work', L('功課', 'Assignments'), work, undatedIn('work'), any)}
        ${ui.newRow === c.id ? newForm() : ''}
        ${!any && ui.newRow !== c.id ? `<p class="course__empty">${L('這科還沒有已確認的測驗、考試或功課。', 'Nothing confirmed for this course yet.')}</p>` : ''}
        <footer class="course__foot">
          <div class="course__actions">
            <button class="course__more" type="button" data-action="course-row-new" data-course="${c.id}">${icon('plus')} ${L('新增一項', 'Add an item')}</button>
            <button class="course__more" type="button" data-action="course-more" data-course="${c.id}">${icon('plus')} ${L('補充資訊', 'Add information')}</button>
            <button class="course__del is-rename" type="button" data-action="course-rename" data-course="${c.id}">${icon('pencil')} ${L('改名', 'Rename')}</button>
            <button class="course__del" type="button" data-action="course-delete" data-course="${c.id}">${icon('x')} ${L('刪除這一科', 'Delete course')}</button>
          </div>
        </footer>
      </div>` : ''}
    </section>`;
}

/**
 * 改名時卡頭原地變成可以打字：代號仍是大號科目色字、全名在下面，跟平時卡頭同一個位置和字型，
 * 只多一條底線表示可以改；右邊科目色「保存」和淡色「取消」。Enter 保存，Esc 取消。
 */
function renameForm(c) {
  return `
      <form class="course__rename" data-form="course-rename" data-course="${c.id}">
        <div class="course__rename-fields">
          <label class="course__rename-code"><span class="sr-only">${L('代號', 'Code')}</span><input name="name" value="${esc(c.name)}" maxlength="40" required placeholder="${L('代號', 'Code')}" autocomplete="off"></label>
          <label class="course__rename-name"><span class="sr-only">${L('全名', 'Full name')}</span><input name="title" value="${esc(c.title || '')}" maxlength="80" placeholder="${L('全名（可以留空）', 'Full name (optional)')}" autocomplete="off"></label>
        </div>
        <div class="course__rename-actions">
          <button class="course__save" type="submit">${icon('check')} ${L('保存', 'Save')}</button>
          <button class="course__cancel" type="button" data-action="course-rename-cancel">${L('取消', 'Cancel')}</button>
        </div>
      </form>`;
}

/** 卡上直接改一項：名稱｜日期｜時間｜比重，原地換成輸入格。Enter 保存，Esc 取消。 */
function rowForm(t, ref = '') {
  return `
            <li><form class="crow-edit" data-form="${ref ? 'course-undated' : 'course-row'}" ${ref ? `data-ref="${esc(ref)}"` : `data-task="${t.id}"`}>
              <label class="crow-edit__title"><span>${L('名稱', 'Name')}</span><input name="title" value="${esc(t.title)}" maxlength="80" required autocomplete="off"></label>
              <label class="crow-edit__date"><span>${L('截止日期', 'Due date')}</span>${dateField('date', t.due?.date || '', '', !!ref)}</label>
              <label class="crow-edit__time"><span>${L('時間', 'Time')}</span>${timeField('time', t.due ? hm(t.due.min) : '', '', !!ref)}</label>
              <label class="crow-edit__weight"><span>${L('比重', 'Weight')}</span><input name="weight" value="${esc(t.weight || '')}" maxlength="20" placeholder="${L('例如 20%', 'e.g. 20%')}" autocomplete="off"></label>
              <div class="crow-edit__actions">
                <button class="course__save is-icon" type="submit" aria-label="${L('保存', 'Save')}">${icon('check')}</button>
                <button class="course__cancel is-icon" type="button" data-action="course-row-cancel" aria-label="${L('取消', 'Cancel')}">${icon('x')}</button>
              </div>
            </form></li>`;
}

/** 卡上新增一項：名稱｜類型，下一行截止日期｜時間｜比重｜預計時數｜加入 取消。只有名稱必填；日期留空就不排進時間表。 */
function newForm() {
  return `
        <form class="crow-edit crow-edit--new" data-form="course-new" data-course="${ui.newRow}">
          <label class="crow-edit__title"><span>${L('名稱', 'Name')}</span><input name="title" maxlength="80" required autocomplete="off"></label>
          <label class="crow-edit__kind"><span>${L('類型', 'Type')}</span><select name="group">
            <option value="work">${L('功課', 'Assignment')}</option>
            <option value="exam">${L('測驗或考試', 'Quiz or exam')}</option>
          </select></label>
          <label class="crow-edit__date"><span>${L('截止日期', 'Due date')}</span>${dateField('date', '', '', true)}</label>
          <label class="crow-edit__time"><span>${L('時間', 'Time')}</span>${timeField('time', '', '', true)}</label>
          <label class="crow-edit__weight"><span>${L('比重', 'Weight')}</span><input name="weight" maxlength="20" placeholder="${L('例如 20%', 'e.g. 20%')}" autocomplete="off"></label>
          <label class="crow-edit__hours"><span>${L('預計時數', 'Hours')}</span><input name="hours" type="number" min="0.5" max="200" step="0.5"></label>
          <div class="crow-edit__actions">
            <button class="course__save" type="submit">${icon('check')} ${L('加入', 'Add')}</button>
            <button class="course__cancel is-icon" type="button" data-action="course-row-new-cancel" aria-label="${L('取消', 'Cancel')}">${icon('x')}</button>
          </div>
        </form>`;
}

/**
 * 一組（測驗和考試／功課）。電腦上可以把一項拖到另一組（改它的類型），手機上長按選「移到…」。
 * 這科有任務但這一組是空的時候，先畫一個隱藏的空組，拖動時才出現，讓你放進去。
 */
function group(s, c, key, title, tasks, undated, any) {
  const n = tasks.length + undated.length;
  if (!n && !any) return '';
  return `
        <div class="course__group ${n ? '' : 'is-empty'}" data-group="${key}" data-course="${c.id}">
          <h3>${title} <span>${n}</span></h3>
          ${n ? `<ul class="crows ${[...tasks, ...undated].some((t) => t.weight) ? 'crows--weights' : ''}">${tasks.map((t) => row(s, t)).join('')}${undated.map(undatedRow).join('')}</ul>`
            : `<p class="course__drop">${L('放到這裡', 'Drop here')}</p>`}
        </div>`;
}

/**
 * 日期分四格（還有幾天｜日期｜星期｜時間），每格固定寬度，整組的日期、星期、時間上下對齊。
 * 中文：11/8（日）；英文：Sun 11/8。
 */
function due4(when, t) {
  const day = L(`<span class="crow__d1">${mdNum(t.due.date)}</span><span class="crow__d2">（${wd(t.due.date)}）</span>`,
    `<span class="crow__d1">${wd(t.due.date)}</span><span class="crow__d2">${mdNum(t.due.date)}</span>`);
  return `<span class="crow__due ${L('is-zh', 'is-en')}"><span class="crow__when">${when}</span>${day}<span class="crow__time">${hm(t.due.min)}</span></span>`;
}

/** 一項：名稱｜（還有幾天）日期時間｜比重。類型已經寫在小標題，這裡不再貼標籤。 */
function row(s, t) {
  if (ui.editRow === t.id) return rowForm(t);
  const d = daysFrom(s.today, t.due.date);
  const when = d < 0 ? L('已過', 'Past') : d === 0 ? L('今天', 'Today') : d === 1 ? L('明天', 'Tomorrow') : d <= 7 ? L(`還有 ${d} 天`, `In ${d} days`) : '';
  return `
            <li><a class="crow ${d < 0 ? 'is-past' : d <= 7 ? 'is-soon' : ''}" href="#/tasks/${t.id}" draggable="true" data-task="${t.id}" data-course="${t.course}" data-group="${groupOf(t)}">
              <span class="crow__title">${esc(t.title)}</span>
              ${due4(when, t)}
              <span class="crow__weight">${esc(t.weight || '')}</span>
            </a><button class="crow__edit" type="button" data-action="course-row-edit" data-task="${t.id}" aria-label="${L(`修改「${esc(t.title)}」`, `Edit "${esc(t.title)}"`)}">${icon('pencil')}</button><button class="crow__edit crow__del" type="button" data-action="course-row-delete" data-task="${t.id}" aria-label="${L(`刪除「${esc(t.title)}」`, `Delete "${esc(t.title)}"`)}">${icon('trash')}</button></li>`;
}

/** 沒有日期的一項：日期一格空白，不排進時間表。鉛筆補日期（補了就變成任務），垃圾桶刪除。 */
function undatedRow(u) {
  if (ui.editRow === u.ref) return rowForm(u, u.ref);
  return `
            <li><div class="crow is-undated">
              <span class="crow__title">${esc(u.title)}</span>
              <span class="crow__due ${L('is-zh', 'is-en')}"><span class="crow__when"></span></span>
              <span class="crow__weight">${esc(u.weight || '')}</span>
            </div><button class="crow__edit" type="button" data-action="course-row-edit" data-task="${esc(u.ref)}" aria-label="${L(`修改「${esc(u.title)}」`, `Edit "${esc(u.title)}"`)}">${icon('pencil')}</button><button class="crow__edit crow__del" type="button" data-action="course-undated-delete" data-ref="${esc(u.ref)}" data-title="${esc(u.title)}" aria-label="${L(`刪除「${esc(u.title)}」`, `Delete "${esc(u.title)}"`)}">${icon('trash')}</button></li>`;
}

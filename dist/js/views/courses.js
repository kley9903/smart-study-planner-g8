// 課程資料（自己的計劃）：每科一張長方形的卡，寫著代號和全名；點一下展開，看這科已確認的功課、測驗和考試。
// 收集資料、AI 核對、逐項確認都在另一頁（#/import/add）；可以分幾次加，確認的才放進科目，未確認的不會出現在這裡。
// 上課時間不收：這個網站只幫你安排溫習和做功課的時間。
// 版面：紙卡左上角貼一段科目色紙膠帶，卡頭右邊淡淡印著浮水印（見 mark）；科目色也用在代號和箭咀圓鈕。
// 展開後以小標題（測驗和考試、功課、日期未公布）分組，類型只寫在小標題；每項一行：名稱｜日期時間｜比重，
// 7 天內到期用朱紅標出，已過的變淡。
import { esc, icon } from '../ui.js';
import { ui } from '../store.js';
import { L } from '../i18n.js';
import { dayShort, hm } from '../time.js';

// 先看類型（AI 給的，或你在任務裡填的）；類型說不準時才看名稱，而且只認明確的字（「final report」不是考試）
const isExam = (t) => /考試|測驗|小測|exam|quiz|test/i.test(t.kind || '') || /\b(?:exam|quiz|test|midterm)\b|考試|測驗|小測/i.test(t.title);
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
        <p class="page-head__lede">${courses.length
          ? L('點一下科目，看它的測驗、考試和功課。發現有漏的，打開那一科按「補充資訊」。', 'Tap a course to see its quizzes, exams and assignments. If something is missing, open the course and choose "Add information".')
          : L('還沒有科目。放入第一份課程大綱、公告，或自己打字，AI 會幫你找出測驗、考試和功課。', 'No courses yet. Add a syllabus, an announcement or your own notes; AI finds the quizzes, exams and assignments.')}</p>
      </div>
    </div>
    ${waiting ? `<a class="course-pending" href="#/import/add" data-action="course-continue" data-doc="${firstWaiting.id}">${icon('pencil')} ${L(`還有 ${waiting} 項等你確認`, `${waiting} item${waiting === 1 ? '' : 's'} waiting for you to confirm`)} ${icon('arrow')}</a>` : ''}
    <div class="courses">
      ${courses.map((c) => courseCard(s, c)).join('')}
      <button class="course-add ${courses.length ? '' : 'is-first'}" type="button" data-action="course-add">
        <span class="course-add__plus">${icon('plus')}</span>
        <b>${L('增加科目', 'Add a course')}</b>
        <small>${L('大綱、公告或自己打字都可以，之後還可以補充', 'A syllabus, an announcement or your own notes; you can add more later')}</small>
      </button>
    </div>`;
}

function courseCard(s, c) {
  const open = ui.openCourse === c.id;
  const tasks = s.tasks.filter((t) => t.course === c.id).sort((a, b) => due(a).localeCompare(due(b)));
  const exams = tasks.filter(isExam);
  const work = tasks.filter((t) => !exams.includes(t));
  const undated = s.docs.filter((d) => d.own && d.course === c.id).flatMap((d) => d.items)
    .filter((i) => i.state === 'ink' && i.applied !== 'dup' && !i.filled && i.plan?.kind === 'task' && !i.plan.date);
  const id = `course-${c.id}`;
  return `
    <section class="course ${open ? 'is-open' : ''}" data-ink="${c.ink}">
      <span class="course__tape" aria-hidden="true"></span>
      <button class="course__head" type="button" data-action="course-toggle" data-course="${c.id}" aria-expanded="${open}" aria-controls="${id}">
        <span class="course__title">
          <span class="course__code">${esc(c.name)}</span>
          ${c.title ? `<span class="course__name">${esc(c.title)}</span>` : ''}
        </span>
        <span class="course__mark" aria-hidden="true">${esc(mark(c.name))}</span>
        <span class="course__chev" aria-hidden="true">${icon('chevron')}</span>
      </button>
      ${open ? `
      <div class="course__body" id="${id}">
        ${group(s, L('測驗和考試', 'Quizzes and exams'), exams)}
        ${group(s, L('功課', 'Assignments'), work)}
        ${undated.length ? `
        <div class="course__group">
          <h3>${L('日期未公布', 'Date not announced')} <span>${undated.length}</span></h3>
          <p class="course__hint">${L('公布後按下面的「補充資訊」加上日期。', 'Once a date is announced, add it with "Add information" below.')}</p>
          <ul class="crows">${undated.map((i) => `
            <li><div class="crow is-undated">
              <span class="crow__title">${esc(i.what)}</span>
              <span class="crow__due">${L('待公布', 'TBA')}</span>
              <span class="crow__weight">${esc(i.weight || '')}</span>
            </div></li>`).join('')}</ul>
        </div>` : ''}
        ${!tasks.length && !undated.length ? `<p class="course__empty">${L('這科還沒有已確認的測驗、考試或功課。', 'Nothing confirmed for this course yet.')}</p>` : ''}
        <footer class="course__foot">
          <span>${L('漏了甚麼？貼上公告、大綱，或自己打字補充這一科。', 'Something missing? Paste an announcement or syllabus, or type it in.')}</span>
          <button class="btn btn--sm" type="button" data-action="course-more" data-course="${c.id}">${icon('plus')} ${L('補充資訊', 'Add information')}</button>
        </footer>
      </div>` : ''}
    </section>`;
}

function group(s, title, tasks) {
  if (!tasks.length) return '';
  return `
        <div class="course__group">
          <h3>${title} <span>${tasks.length}</span></h3>
          <ul class="crows">${tasks.map((t) => row(s, t)).join('')}</ul>
        </div>`;
}

/** 一項：名稱｜（還有幾天）日期時間｜比重。類型已經寫在小標題，這裡不再貼標籤。 */
function row(s, t) {
  const d = daysFrom(s.today, t.due.date);
  const when = d < 0 ? L('已過', 'Past') : d === 0 ? L('今天', 'Today') : d === 1 ? L('明天', 'Tomorrow') : d <= 7 ? L(`還有 ${d} 天`, `In ${d} days`) : '';
  return `
            <li><a class="crow ${d < 0 ? 'is-past' : d <= 7 ? 'is-soon' : ''}" href="#/tasks/${t.id}">
              <span class="crow__title">${esc(t.title)}</span>
              <span class="crow__due">${when ? `<span class="crow__when">${when}</span>` : ''}${dayShort(t.due.date)} ${hm(t.due.min)}</span>
              <span class="crow__weight">${esc(t.weight || '')}</span>
            </a></li>`;
}

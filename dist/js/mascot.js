// 右下角角色的姿勢：站著 ↔ 腳下一空掉下去、雙手抓住畫面底邊趴著 ↔ 撐起來站好，趴著時偶爾打哈欠。
// 姿勢全部寫在角色容器的 class 上（is-dropping / is-rest / is-waking / is-yawning），CSS 依 class 播動畫。
//
// 什麼時候趴下：你捲動頁面、在輸入框打字、或 30 秒沒有滑鼠鍵盤動作。
// 什麼時候站起來：捲動後要等滑鼠移到她身上；閒置趴下的話你一動就站起來；打字趴下的話離開輸入框 1.5 秒後；
// 她有新的話要說、或打開對話面板時也會站起來。滑鼠停在她身上時捲動不趴下（否則換圖觸發 pointerover，會來回抽搐）。
// 打哈欠：趴著（畫面底邊或面板上）20 秒後第一次，之後每次播完再隨機等 20–60 秒；站起來或縮小面板就重新計時。

export const TIMING = { drop: 1350, rise: 1090, idle: 30000, quietAfterNav: 200, typingWake: 1500, yawn: 1520, firstYawn: 20000, yawnGap: [20000, 60000] };

const browserClock = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id), now: () => performance.now() };

/**
 * @param el 角色容器（#dock）
 * @param deps 測試時可換掉：事件來源（win、doc、main）、時鐘、亂數、是否減少動態效果
 * @returns {{ shown(info: { hidden: boolean, open: boolean, bubble: string, navigated: boolean }): void }}
 *   每次重畫角色容器後呼叫 shown()，其餘都由 module 自己監聽。
 */
export function createMascot(el, {
  win = window, doc = document, main = doc.getElementById('main'),
  clock = browserClock, random = Math.random,
  reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches,
} = {}) {
  const cls = el.classList;
  const timer = { drop: null, wake: null, risen: null, idle: null, yawn: null };
  const stop = (k) => { clock.clear(timer[k]); timer[k] = null; };
  let open = false;
  let lastBubble = '';
  let quietUntil = 0;
  let reason = '';
  let yawnArmed = false;

  const lying = () => !el.hidden && (open || cls.contains('is-rest'));

  function syncYawn() {
    if (!lying()) {
      stop('yawn');
      yawnArmed = false;
      cls.remove('is-yawning');
    } else if (!yawnArmed) {
      yawnArmed = true;
      timer.yawn = clock.set(yawn, TIMING.firstYawn);
    }
  }

  function yawn() {
    if (!lying()) return syncYawn();
    if (!reducedMotion()) cls.add('is-yawning');
    timer.yawn = clock.set(() => {
      cls.remove('is-yawning');
      const [min, max] = TIMING.yawnGap;
      timer.yawn = clock.set(yawn, min + random() * (max - min));
    }, TIMING.yawn);
  }

  function rest(why, wakeAfter = 0) {
    if (open || el.hidden) return;
    reason = why;
    if (!cls.contains('is-rest') && !cls.contains('is-dropping')) {
      stop('risen');
      cls.remove('is-waking');
      cls.add('is-dropping');
      timer.drop = clock.set(() => { cls.replace('is-dropping', 'is-rest'); syncYawn(); }, TIMING.drop);
    }
    stop('wake');
    if (wakeAfter) timer.wake = clock.set(wake, wakeAfter);
  }

  function wake() {
    stop('drop');
    stop('wake');
    reason = '';
    if (cls.contains('is-dropping') || cls.contains('is-rest')) {
      cls.remove('is-dropping', 'is-rest');
      cls.add('is-waking');
      timer.risen = clock.set(() => cls.remove('is-waking'), TIMING.rise);
    }
    syncYawn();
  }

  function active() {
    if (reason === 'idle') wake();
    stop('idle');
    timer.idle = clock.set(() => rest('idle'), TIMING.idle);
  }

  const isField = (t) => t?.matches?.('input, textarea, select');
  ['pointermove', 'pointerdown', 'keydown'].forEach((t) => doc.addEventListener(t, active, { passive: true }));
  el.addEventListener('pointerover', (e) => { if (e.target.closest?.('.dock__me') && reason !== 'typing') wake(); });
  main.addEventListener('focusin', (e) => { if (isField(e.target)) rest('typing'); });
  main.addEventListener('focusout', (e) => { if (isField(e.target)) rest('typing', TIMING.typingWake); });
  win.addEventListener('scroll', () => {
    if (clock.now() > quietUntil && !el.querySelector?.('.dock__me:hover')) rest('scroll');
  }, { passive: true });
  active();

  return {
    shown({ hidden, open: isOpen, bubble = '', navigated = false }) {
      open = isOpen;
      if (navigated) quietUntil = clock.now() + TIMING.quietAfterNav; // 換頁回到頂部不算你在捲動
      if (!hidden && (open || (bubble && bubble !== lastBubble))) wake();
      lastBubble = bubble;
      syncYawn();
    },
  };
}

// 說明：給組員看的原型說明、設計規則、示範情境和檔案位置。
import { icon } from '../ui.js';

export function render() {
  return `
    <div class="about">
      <section class="sheet about-hero about__wide">
        <div>
          <p class="eyebrow">關於這個原型</p>
          <h1>Smart Study Planner · 第一代 UI</h1>
          <p>以 AI 為核心的大學生讀書規劃工具。這個網頁是給組員討論用的前端原型：頁面可以切換、主要互動可以操作，但所有內容都是預先寫好的示範資料。</p>
        </div>
        <div class="pop__actions">
          <a class="btn btn--ink" href="#/start" data-action="ob-begin">${icon('play')} 重看首次使用流程</a>
          <button class="btn" type="button" data-action="reset">${icon('reset')} 重設示範資料</button>
        </div>
      </section>

      <section class="sheet about-card about__wide">
        <h2>建議怎樣看這個原型</h2>
        <div class="scenario-list">
          <div class="scenario"><span class="scenario__n">1</span><div><b>首次使用：大綱 → 核對 → 睡眠 → 沒空的時間 → AI 排計劃</b><span>每一步只有右下角一個主要按鈕，約 1 分鐘</span></div><a class="btn btn--sm" href="#/start" data-action="ob-begin">開始</a></div>
          <div class="scenario"><span class="scenario__n">2</span><div><b>本週頁頂的「示範導覽」</b><span>回報昨晚進度 → 告訴 AI 明天要全日搬屋 → 時間不夠時選一個做法並確認</span></div><a class="btn btn--sm" href="#/week">去本週</a></div>
          <div class="scenario"><span class="scenario__n">3</span><div><b>其他頁面</b><span>任務（功課怎樣拆、預計時數）、課程資料（核對大綱）、不可用時段（在格上拖拉標記沒空的時間）</span></div><a class="btn btn--sm" href="#/tasks">去任務</a></div>
        </div>
      </section>

      <section class="sheet about-card about__wide">
        <h2>四條設計規則</h2>
        <div class="rules-grid">
          <div class="rule-card">
            <div class="rule-card__vis" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <span style="border:1.5px dashed var(--graphite);border-radius:8px;background:#fff"></span>
              <span style="border-radius:8px;background:var(--blue-wash);box-shadow:inset 4px 0 0 var(--blue)"></span>
            </div>
            <h3>虛線是建議，實色是計劃</h3>
            <p>AI 產生的東西（抽出的 deadline、估算時數、排好的時段、從對話理解到的時間）先用虛線顯示，你按「確認」才變成實色。你自己做的改動和回報的進度，直接生效。</p>
          </div>
          <div class="rule-card">
            <div class="rule-card__vis" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
              <span class="sw--off sw--icon" style="border-radius:8px;font-size:18px">${icon('repeat')}</span>
              <span class="sw--off sw--icon" style="border-radius:8px;font-size:18px">${icon('pin')}</span>
              <span class="sw--sleep sw--icon" style="border-radius:8px;font-size:18px">${icon('moon')}</span>
            </div>
            <h3>灰色是沒空的時間</h3>
            <p>預設全部時間可以讀書。沒空的時間塗成淺灰色，標籤前的圖示分辨每週重複和只限這天；睡眠是深一點的灰色並預設收起。AI 排程一定避開灰色的時間；要動睡眠，必須問你，而且只限當晚。</p>
          </div>
          <div class="rule-card">
            <div class="rule-card__vis" style="background:var(--paper);border:1px solid var(--rule);position:relative">
              <span style="position:absolute;left:0;top:0;bottom:0;width:35%;background:rgba(27,34,50,.06)"></span>
              <span style="position:absolute;left:8px;top:14px;height:6px;width:20%;border-radius:3px;background:var(--blue-wash)"></span>
              <span style="position:absolute;left:8px;top:32px;height:6px;width:70%;border-radius:3px;background:var(--plum-wash)"></span>
            </div>
            <h3>近 7 日具體，遠方看 deadline</h3>
            <p>每次只排未來 7 日的具體時段，今天永遠在最左邊；7 日之後的 deadline 放在「遠方」，每份功課一行，較遠的功課可以提早在這 7 日開始。</p>
          </div>
          <div class="rule-card">
            <div class="rule-card__vis" style="display:grid;gap:5px;align-content:center;padding:0 8px;background:#fff;border:1px solid var(--rule)">
              <span style="height:10px;border-radius:4px;background:var(--seal-wash)"></span>
              <span style="height:10px;width:70%;border-radius:4px;background:var(--paper-3)"></span>
            </div>
            <h3>時間不夠就講清楚</h3>
            <p>放不下時，直接說差多少、在哪個截止前；列出幾個做法，每個寫明「換來甚麼、代價是甚麼」。簡化方案要逐項說明犧牲了哪些要求，由你選了再確認。</p>
          </div>
        </div>
      </section>

      <section class="sheet about-card">
        <h2>哪些是真的、哪些是示範</h2>
        <table class="status-table">
          <tr><td>頁面切換、時間格、AI 建議、確認／不要、選做法、回報進度、標記沒空的時間</td><td>可以操作（改動只存在這個分頁，重新整理就會回到示範資料）</td></tr>
          <tr><td>AI 助手的回覆</td><td>預先寫好的示範句子，沒有連接 AI；其他句子會如實說未能理解</td></tr>
          <tr><td>上傳課程大綱、抽取結果</td><td>不會上傳或讀取檔案；抽取結果是預先寫好的</td></tr>
          <tr><td>排程</td><td>建議的時段是預先寫好的；新標記的沒空時間不會令計劃自動重排</td></tr>
          <tr><td>登入、資料庫、Canvas、提醒</td><td>未有；之後的版本再接</td></tr>
        </table>
      </section>

      <section class="sheet about-card">
        <h2>可以直接分享的示範連結</h2>
        <ul>
          <li><a href="#/start">首次使用流程</a></li>
          <li><a href="#/week">本週計劃（含示範導覽）</a></li>
          <li><a href="#/week?try=hero">搬屋 → 時間不夠 → 選做法</a>（未選做法）</li>
          <li><a href="#/week?try=hero.A">同上，已選「今晚遲 1 小時睡」</a>（B／C／D 是其他做法）</li>
          <li><a href="#/week?try=essay">較遠的 Essay 想遲些開始</a></li>
        </ul>
      </section>

      <section class="sheet about-card about__wide">
        <h2>給組員：檔案在哪裡</h2>
        <p style="margin-bottom:12px">沒有 build 步驟，改完重新整理瀏覽器即可。程式用了 JavaScript 模組，所以不能直接雙擊 index.html；在 <code>src/web</code> 執行 <code>node serve.mjs</code>（不用安裝任何套件），再打開 http://localhost:5173。</p>
        <div class="files">src/web/dist/
├─ index.html            頁首、導覽、圖示
├─ css/tokens.css        顏色、字體（改視覺先改這裡）
├─ css/planner.css       時間格、沒空的時間（灰色）、已確認／建議的時段、遠方
├─ css/pages.css         各頁版面
├─ js/demo-data.js       示範課程、功課、時段（商科組員可直接改）
├─ js/scenarios.js       AI 助手的示範回覆和取捨做法
├─ js/store.js           狀態與動作（確認、不要、回報進度）
├─ js/planner.js         時間格元件
└─ js/views/             每頁一個檔案：week、margin、tasks、import、availability、start、about</div>
      </section>
    </div>`;
}

// 中英切換：預設英文，選擇記在這個瀏覽器。
// 程式內文字一律寫成 L('中文', 'English')；index.html 的固定文字用 data-en 屬性。
import { recall, remember } from './ui.js';

let lang = recall('lang') === 'zh' ? 'zh' : 'en';

export const getLang = () => lang;
export const L = (zh, en) => (lang === 'zh' ? zh : en);

export function setLang(next) {
  lang = next === 'zh' ? 'zh' : 'en';
  remember('lang', lang);
  applyStatic();
}

/** 把 index.html 裡有 data-en 的固定文字換成目前語言（第一次會把原本的中文記在 data-zh）。 */
export function applyStatic() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-en]').forEach((el) => {
    if (el.dataset.zh == null) el.dataset.zh = el.textContent;
    el.textContent = lang === 'zh' ? el.dataset.zh : el.dataset.en;
  });
  document.querySelectorAll('[data-en-label]').forEach((el) => {
    if (el.dataset.zhLabel == null) el.dataset.zhLabel = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', lang === 'zh' ? el.dataset.zhLabel : el.dataset.enLabel);
    if (el.hasAttribute('title')) el.setAttribute('title', lang === 'zh' ? el.dataset.zhLabel : el.dataset.enLabel);
  });
  document.querySelectorAll('[data-lang-opt]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.langOpt === lang)));
}

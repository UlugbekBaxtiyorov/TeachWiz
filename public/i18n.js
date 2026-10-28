/**
 * TeachWiz i18n — client-side localization module
 * MVP-12 / REQ-16
 *
 * Usage (in every HTML page):
 *   <script type="module" src="/i18n.js"></script>
 *
 * Usage (in page-specific JS modules):
 *   import { t } from '/i18n.js';
 *
 * Markup convention:
 *   <span data-i18n="key">Fallback text</span>
 *   <input data-i18n-placeholder="key" placeholder="Fallback">
 *   <button data-i18n="key">Fallback</button>
 *
 * Language choice is persisted in localStorage under 'teachwiz_lang'.
 * Defaults to 'en' if not set or if the stored value is invalid.
 */

const SUPPORTED = ['uz', 'ru', 'en'];
const STORAGE_KEY = 'teachwiz_lang';
const LANG_HTML_MAP = { uz: 'uz', ru: 'ru', en: 'en' };

let currentLang = 'en';
let currentDict = {};

/** Translate a key, returning the key itself if not found. */
export function t(key) {
  return currentDict[key] ?? key;
}

/** Apply a locale dictionary to the current DOM. */
export function applyLocale(lang, dict) {
  currentLang = lang;
  currentDict = dict;

  // Update <html lang="">
  document.documentElement.lang = LANG_HTML_MAP[lang] || lang;

  // Translate all text-content nodes
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (Object.prototype.hasOwnProperty.call(dict, key)) {
      el.textContent = dict[key];
    }
  }

  // Translate placeholder attributes
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (Object.prototype.hasOwnProperty.call(dict, key)) {
      el.placeholder = dict[key];
    }
  }

  // Update aria-pressed on lang buttons
  const langGroup = document.querySelector('.lang[role="group"]');
  if (langGroup) {
    const buttons = langGroup.querySelectorAll('button[type="button"]');
    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', String(btn.textContent.trim().toLowerCase() === lang));
    }
  }
}

/** Fetch a locale dict; returns null on network/parse error. */
async function fetchDict(lang) {
  try {
    const res = await fetch(`/locales/${lang}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Wire up the language switcher buttons in the header. */
function attachLangButtons(currentLang) {
  const langGroup = document.querySelector('.lang[role="group"]');
  if (!langGroup) return;

  for (const btn of langGroup.querySelectorAll('button[type="button"]')) {
    const label = btn.textContent.trim().toLowerCase();
    if (!SUPPORTED.includes(label)) continue;
    btn.setAttribute('aria-pressed', String(label === currentLang));
    btn.addEventListener('click', async () => {
      if (label === currentLang) return;
      const dict = await fetchDict(label);
      if (!dict) return; // fail silently — keep current language
      localStorage.setItem(STORAGE_KEY, label);
      applyLocale(label, dict);
      attachLangButtons(label); // re-wire so `currentLang` closure updates
    });
  }
}

/**
 * Initialize i18n: read stored preference, fetch dict, apply to DOM.
 * Call this once per page (the module calls it automatically when loaded
 * as a plain script tag, or you can await it in another module).
 */
export async function initI18n() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const lang = SUPPORTED.includes(stored) ? stored : 'en';

  const dict = await fetchDict(lang);
  if (dict) {
    applyLocale(lang, dict);
  }

  attachLangButtons(lang);
}

// Auto-init when this module is loaded as a <script type="module"> tag.
// When imported by another module, the caller can await initI18n() itself.
await initI18n();

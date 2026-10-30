/**
 * TeachWiz i18n — client-side localization module
 * MVP-12 / REQ-16
 *
 * Static UI is translated from the locale dictionaries. Existing
 * data-i18n/data-i18n-placeholder attributes are supported, while exact
 * English UI strings are also detected automatically so older pages do not
 * need to be manually wrapped before the switcher works.
 */

const SUPPORTED = ['uz', 'ru', 'en'];
const STORAGE_KEY = 'teachwiz_lang';
const LANG_HTML_MAP = { uz: 'uz', ru: 'ru', en: 'en' };
const AUTO_KEY_ATTR = 'data-i18n-auto-key';
const AUTO_PLACEHOLDER_ATTR = 'data-i18n-auto-placeholder-key';
const AUTO_LABEL_ATTR = 'data-i18n-auto-label-key';
const EXCLUDED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);

let currentLang = 'en';
let currentDict = {};
let englishDict = {};
let englishValueToKey = new Map();

export function t(key) {
  return currentDict[key] ?? englishDict[key] ?? key;
}

function rememberEnglishKey(el, attr, value) {
  if (el.getAttribute(attr)) return el.getAttribute(attr);
  const key = englishValueToKey.get(value.trim());
  if (key) el.setAttribute(attr, key);
  return key || '';
}

function shouldSkipTextNode(node) {
  const parent = node.parentElement;
  if (!parent || EXCLUDED_TAGS.has(parent.tagName)) return true;
  if (parent.closest('.lang, [data-no-i18n], #review-list')) return true;
  return !node.nodeValue.trim();
}

function translateTextNodes(root, dict) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    if (shouldSkipTextNode(node)) continue;
    const parent = node.parentElement;
    const original = node.nodeValue;
    const trimmed = original.trim();
    let key = parent.getAttribute(AUTO_KEY_ATTR);

    if (!key) {
      key = englishValueToKey.get(trimmed) || '';
      if (key) parent.setAttribute(AUTO_KEY_ATTR, key);
    }

    if (!key || !Object.prototype.hasOwnProperty.call(dict, key)) continue;
    const translated = dict[key];
    const start = original.indexOf(trimmed);
    const end = start + trimmed.length;
    node.nodeValue = `${original.slice(0, start)}${translated}${original.slice(end)}`;
  }
}

function translateAttributes(root, dict) {
  const elements = root.querySelectorAll
    ? root.querySelectorAll('[data-i18n-placeholder], [placeholder], [aria-label], [title]')
    : [];

  for (const el of elements) {
    if (el.matches('[data-i18n-placeholder]')) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) el.placeholder = dict[key];
    } else if (el.hasAttribute('placeholder')) {
      const value = el.getAttribute('placeholder');
      const key = el.getAttribute(AUTO_PLACEHOLDER_ATTR) || englishValueToKey.get(value.trim());
      if (key) {
        el.setAttribute(AUTO_PLACEHOLDER_ATTR, key);
        if (dict[key]) el.placeholder = dict[key];
      }
    }

    if (el.hasAttribute('aria-label') && !el.closest('.lang')) {
      const value = el.getAttribute('aria-label');
      const key = el.getAttribute(AUTO_LABEL_ATTR) || englishValueToKey.get(value.trim());
      if (key) {
        el.setAttribute(AUTO_LABEL_ATTR, key);
        if (dict[key]) el.setAttribute('aria-label', dict[key]);
      }
    }

    if (el.hasAttribute('title')) {
      const value = el.getAttribute('title');
      const key = el.getAttribute('data-i18n-auto-title-key') || englishValueToKey.get(value.trim());
      if (key) {
        el.setAttribute('data-i18n-auto-title-key', key);
        if (dict[key]) el.setAttribute('title', dict[key]);
      }
    }
  }
}

export function applyLocale(lang, dict) {
  currentLang = lang;
  currentDict = dict;
  document.documentElement.lang = LANG_HTML_MAP[lang] || lang;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (Object.prototype.hasOwnProperty.call(dict, key)) el.textContent = dict[key];
  }

  translateTextNodes(document.body, dict);
  translateAttributes(document, dict);

  const langGroup = document.querySelector('.lang[role="group"]');
  if (langGroup) {
    for (const btn of langGroup.querySelectorAll('button[type="button"]')) {
      const label = (btn.dataset.lang || btn.textContent).trim().toLowerCase();
      if (SUPPORTED.includes(label)) btn.setAttribute('aria-pressed', String(label === lang));
    }
  }

  document.dispatchEvent(new CustomEvent('teachwiz:languagechange', { detail: { lang } }));
}

async function fetchDict(lang) {
  try {
    const res = await fetch(`/locales/${lang}.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function attachLangButtons() {
  const langGroup = document.querySelector('.lang[role="group"]');
  if (!langGroup || langGroup.dataset.i18nBound === 'true') return;
  langGroup.dataset.i18nBound = 'true';

  langGroup.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[type="button"]');
    if (!btn || !langGroup.contains(btn)) return;
    const lang = (btn.dataset.lang || btn.textContent).trim().toLowerCase();
    if (!SUPPORTED.includes(lang) || lang === currentLang) return;

    btn.disabled = true;
    const dict = await fetchDict(lang);
    btn.disabled = false;
    if (!dict) return;

    localStorage.setItem(STORAGE_KEY, lang);
    applyLocale(lang, dict);
  });
}

function observeDynamicUi() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          translateTextNodes(node, currentDict);
          translateAttributes(node, currentDict);
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          translateTextNodes(node.parentElement, currentDict);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export async function initI18n() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const lang = SUPPORTED.includes(stored) ? stored : 'en';

  englishDict = await fetchDict('en') || {};
  englishValueToKey = new Map(
    Object.entries(englishDict)
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([key, value]) => [value.trim(), key]),
  );

  const dict = lang === 'en' ? englishDict : await fetchDict(lang);
  if (dict) applyLocale(lang, dict);

  attachLangButtons();
  observeDynamicUi();
}

await initI18n();

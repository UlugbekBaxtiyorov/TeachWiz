import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const languages = ['en', 'ru', 'uz'];

async function locale(lang) {
  return JSON.parse(await readFile(new URL(`../public/locales/${lang}.json`, import.meta.url), 'utf8'));
}

test('all locale dictionaries contain the same keys', async () => {
  const dictionaries = await Promise.all(languages.map(locale));
  const expected = Object.keys(dictionaries[0]).sort();
  for (const dict of dictionaries.slice(1)) {
    assert.deepEqual(Object.keys(dict).sort(), expected);
  }
});

test('all locale values are non-empty strings', async () => {
  for (const lang of languages) {
    const dict = await locale(lang);
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${lang}.${key} must be a string`);
      assert.ok(value.trim(), `${lang}.${key} must not be empty`);
    }
  }
});

test('i18n module exposes the supported language set and persistent storage key', async () => {
  const source = await readFile(new URL('../public/i18n.js', import.meta.url), 'utf8');
  assert.match(source, /const SUPPORTED = \['uz', 'ru', 'en'\]/);
  assert.match(source, /const STORAGE_KEY = 'teachwiz_lang'/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY, lang\)/);
  assert.match(source, /fetch\(`\/locales\/\$\{lang\}\.json`/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { fixture, origin } from '../test-support/auth-fixture.js';
import { catalogFixture } from '../test-support/catalog-fixture.js';
import { listingInput } from '../src/verification.js';
import { openStore } from '../src/store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function search(f, query = '') {
  const response = await fetch(`${f.base}/api/catalog${query ? `?${query}` : ''}`);
  assert.equal(response.status, 200);
  return response.json();
}

test('keyword search matches names, subjects and canonical preparation labels regardless of case', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const math = catalog.add({ subjects: ['Math', 'Physics'], providerName: 'Bright Minds Center' });
  const language = catalog.add({ providerName: 'Lingua Hub', subjects: ['English'], preparationCategories: ['ielts', 'sat'], title: 'Exam preparation' });
  const school = catalog.add({ providerName: 'ШКОЛА ЗНАНИЙ', subjects: ['Математика'], preparationCategories: ['presidential_school'] });
  const literal = catalog.add({ providerName: '100% _ Success', subjects: ['O‘zbek tili'] });
  for (const [q, id] of [['bRiGhT minds', math.listing.id], ['PHYSICS', math.listing.id], ['lingua IELTS', language.listing.id],
    ['SaT', language.listing.id], ['presidential SCHOOL', school.listing.id], ['школа', school.listing.id], ['МАТЕМАТИКА', school.listing.id],
    ['100%', literal.listing.id], ['_', literal.listing.id], ["o'zbek", literal.listing.id]]) {
    assert.deepEqual((await search(f, `q=${encodeURIComponent(q)}`)).listings.map((item) => item.id), [id], q);
  }
  assert.equal((await search(f, 'q=private')).total, 0);
  assert.equal((await search(f, 'q=unmatched')).total, 0);
  assert.equal((await search(f, `q=${encodeURIComponent("' OR 1=1 --")}`)).total, 0);
  assert.equal((await search(f, 'q=%20%20')).total, 4);
  await f.restart();
  assert.equal((await search(f, 'q=physics')).listings[0].subjects[1], 'Physics');
});

test('search and categories run before pagination, including records older than the legacy 100-listing feed', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const oldest = catalog.add({ providerType: 'tutor', providerName: 'Find me first', preparationCategories: ['sat'] });
  for (let index = 0; index < 105; index++) catalog.add({ providerName: `Other center ${index}`, subjects: ['English'], preparationCategories: ['ielts'] });
  assert.equal((await search(f, 'q=find')).listings[0].id, oldest.listing.id);
  assert.equal((await search(f, 'type=tutors&category=sat')).total, 1);
  assert.equal((await search(f, 'type=centers&category=sat')).total, 0);
  assert.equal((await search(f, 'category=sat&category=ielts')).total, 106);
  const first = await search(f); const second = await search(f, 'page=2');
  assert.equal(first.total, 106); assert.equal(first.pages, 5); assert.equal(first.listings.length, 24);
  assert.ok(!first.listings.some((item) => second.listings.some((other) => item.id === other.id)));
  assert.equal((await search(f, 'page=6')).listings.length, 0);
});

test('catalog and detail endpoints expose only approved listings with current representative approval', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const live = catalog.add({ subjects: ['Math'] });
  const pending = catalog.add({ approved: false });
  const unverified = catalog.add({ verified: false });
  const result = await search(f);
  assert.deepEqual(result.listings.map((item) => item.id), [live.listing.id]);
  const serialized = JSON.stringify(result);
  for (const value of ['PRIVATE', '@example.test', 'userId', 'reviewReason', 'password']) assert.ok(!serialized.includes(value));
  for (const id of [pending.listing.id, unverified.listing.id, 'missing', "' OR 1=1"]) {
    assert.equal((await fetch(`${f.base}/api/catalog/listing?id=${encodeURIComponent(id)}`)).status, 404);
  }
  const detail = await (await fetch(`${f.base}/api/catalog/listing?id=${live.listing.id}`)).json();
  assert.equal(detail.listing.providerName, 'Bright Minds Center');
  const db = new DatabaseSync(f.filename); db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(live.user.id); db.close();
  assert.equal((await search(f)).total, 0);
  assert.equal((await fetch(`${f.base}/api/catalog/listing?id=${live.listing.id}`)).status, 404);
});

test('invalid filters and unsupported methods fail explicitly without altering stored data', async (t) => {
  const f = await fixture(t);
  for (const query of ['q=a&q=b', 'q='+ 'x'.repeat(151), 'category=unknown', 'type=admin', 'sort=sql', 'page=0', 'page=-1', 'page=1.5', 'page=100000', 'ownerId=other']) {
    assert.equal((await fetch(`${f.base}/api/catalog?${query}`)).status, 400, query);
  }
  assert.equal((await fetch(`${f.base}/api/catalog`, { method: 'POST' })).status, 405);
});

test('listing subjects and preparation categories are validated, persisted and available for admin review', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const item = catalog.add({ approved: false });
  const token = randomBytes(32).toString('hex');
  f.store.createSession(token, item.user.id, Date.now() + 100000, '', Date.now());
  const body = { title: 'Test course', description: 'Teaching skills.', subjects: ['Math', 'math', ' Physics '], preparationCategories: ['ielts', 'ielts'] };
  const response = await fetch(`${f.base}/api/listings/submit`, { method: 'POST', headers: { Cookie: `teachwiz_session=${token}`, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 201);
  const saved = (await response.json()).listing;
  assert.deepEqual(saved.subjects, ['math', 'Physics']); assert.deepEqual(saved.preparationCategories, ['ielts']);
  assert.deepEqual(f.store.pendingListings().find((row) => row.id === saved.id).subjects, saved.subjects);
  for (const invalid of [{ subjects: 'Math' }, { subjects: [''] }, { subjects: ['x'.repeat(61)] }, { subjects: Array(13).fill('Math') },
    { preparationCategories: ['__proto__'] }, { preparationCategories: ['IELTS'] }, { preparationCategories: 'ielts' }, { rating: 5 }]) {
    assert.throws(() => listingInput({ ...body, ...invalid }), { status: 400 });
  }
});

test('schema v2 listings migrate with approvals, owners and text intact and empty search metadata', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'teachwiz-v2-catalog-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = join(dir, 'existing.sqlite');
  let store = openStore(filename);
  const item = catalogFixture(store).add({ providerName: 'Existing provider' });
  const before = store.publishedListings(); store.close();
  const db = new DatabaseSync(filename);
  db.exec(`DROP INDEX listings_monthly_fee; DROP TABLE provider_rating_summaries;
    ALTER TABLE listings DROP COLUMN city; ALTER TABLE listings DROP COLUMN district; ALTER TABLE listings DROP COLUMN skill_level;
    ALTER TABLE listings DROP COLUMN monthly_fee; ALTER TABLE listings DROP COLUMN instruction_languages; ALTER TABLE listings DROP COLUMN delivery_modes;
    ALTER TABLE listings DROP COLUMN subjects; ALTER TABLE listings DROP COLUMN preparation_categories; PRAGMA user_version = 2;`);
  db.close();
  for (let pass = 0; pass < 2; pass++) {
    store = openStore(filename);
    assert.deepEqual(store.publishedListings(), before);
    assert.equal(store.isVerifiedRepresentative(item.user.id), true);
    assert.deepEqual(store.publishedListing(item.listing.id).subjects, []);
    assert.deepEqual(store.publishedListing(item.listing.id).preparationCategories, []);
    store.close();
  }
});

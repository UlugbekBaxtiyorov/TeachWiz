import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, origin } from '../test-support/auth-fixture.js';
import { catalogFixture } from '../test-support/catalog-fixture.js';
import { listingInput } from '../src/verification.js';
import { openStore } from '../src/store.js';
import { randomBytes } from 'node:crypto';

const base = { city: 'Tashkent', district: 'Yunusabad', skillLevel: 'intermediate', monthlyFee: 450000,
  subjects: ['Math'], instructionLanguages: ['uz', 'ru'], deliveryModes: ['in_person'] };
async function search(f, params = '') {
  const response = await fetch(`${f.base}/api/catalog?${params}`);
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
const ids = (result) => result.listings.map((item) => item.id);

test('all filters combine with keyword search and inclusive fee/rating boundaries', async (t) => {
  const f = await fixture(t); const c = catalogFixture(f.store);
  const match = c.add(base); f.store.recordRatingSummary(match.user.id, { scoreTotal: 48, reviewCount: 10 });
  c.add({ ...base, district: 'Chilanzar' }); c.add({ ...base, city: 'Samarkand' });
  c.add({ ...base, skillLevel: 'beginner' }); c.add({ ...base, instructionLanguages: ['en'] });
  c.add({ ...base, monthlyFee: 450001 }); c.add({ ...base, deliveryModes: ['online'] });
  const query = 'q=mAtH&city=TASHKENT&district=yunusabad&level=intermediate&minFee=450000&maxFee=450000&language=ru&mode=in_person&minRating=4.8';
  assert.deepEqual(ids(await search(f, query)), [match.listing.id]);
  assert.equal((await search(f, query.replace('4.8', '4.81'))).total, 0);
});

test('languages and modes use OR within a group and AND across groups; all-level courses match each skill', async (t) => {
  const f = await fixture(t); const c = catalogFixture(f.store);
  const uz = c.add({ ...base, instructionLanguages: ['uz'], skillLevel: 'all_levels' });
  const en = c.add({ ...base, instructionLanguages: ['en'], deliveryModes: ['online'] });
  c.add({ ...base, instructionLanguages: ['ru'] });
  assert.deepEqual(new Set(ids(await search(f, 'language=uz&language=en&mode=in_person&mode=online'))), new Set([uz.listing.id, en.listing.id]));
  assert.deepEqual(ids(await search(f, 'language=en&mode=in_person')), []);
  for (const level of ['beginner', 'advanced']) assert.deepEqual(ids(await search(f, `level=${level}`)), [uz.listing.id]);
  assert.equal((await search(f, 'language=uz&language=uz')).total, 1);
});

test('zero, missing fees and unrated providers remain distinct and sorting is stable', async (t) => {
  const f = await fixture(t); const c = catalogFixture(f.store);
  const free = c.add({ ...base, monthlyFee: 0 });
  const missing = c.add({ ...base, monthlyFee: null });
  const paid = c.add({ ...base, monthlyFee: 450000 });
  f.store.recordRatingSummary(free.user.id, { scoreTotal: 449, reviewCount: 100 });
  f.store.recordRatingSummary(paid.user.id, { scoreTotal: 45, reviewCount: 10 });
  assert.deepEqual(ids(await search(f, 'maxFee=0')), [free.listing.id]);
  assert.equal((await search(f, 'minFee=0')).total, 2);
  assert.deepEqual(ids(await search(f, 'sort=price_asc')), [free.listing.id, paid.listing.id, missing.listing.id]);
  assert.deepEqual(ids(await search(f, 'sort=price_desc')), [paid.listing.id, free.listing.id, missing.listing.id]);
  assert.deepEqual(ids(await search(f, 'sort=rating')), [paid.listing.id, free.listing.id, missing.listing.id]);
  assert.deepEqual(ids(await search(f, 'minRating=4.5')), [paid.listing.id]);
  assert.equal((await search(f, 'minRating=0')).total, 2);
  const unrated = (await search(f)).listings.find((item) => item.id === missing.listing.id);
  assert.equal(unrated.rating, null); assert.equal(unrated.reviewCount, 0); assert.equal(unrated.monthlyFee, null);
  await f.restart(); assert.equal((await search(f, 'minRating=4.5')).total, 1);
});

test('private metadata and ratings never enter results or location choices, and filters precede pagination', async (t) => {
  const f = await fixture(t); const c = catalogFixture(f.store);
  const first = c.add({ ...base, city: "O‘rta Chirchiq", district: 'Example district' });
  const hidden = c.add({ ...base, approved: false, city: 'Secret City' });
  f.store.recordRatingSummary(hidden.user.id, { scoreTotal: 50, reviewCount: 10 });
  for (let index = 0; index < 30; index++) c.add({ ...base, city: 'Other city', monthlyFee: 100000 });
  const found = await search(f, 'city=O%27rta%20Chirchiq&minFee=450000');
  assert.deepEqual(ids(found), [first.listing.id]);
  assert.ok(!JSON.stringify(found.locations).includes('Secret City'));
  assert.equal((await search(f, 'minRating=5')).total, 0);
  const db = new DatabaseSync(f.filename); db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(first.user.id); db.close();
  assert.equal((await search(f, 'minFee=450000')).total, 0);
  assert.ok(!(await search(f)).locations.some((item) => item.city === "O‘rta Chirchiq"));
});

test('invalid filter ranges, enumerations, duplicates and non-finite values return 400', async (t) => {
  const f = await fixture(t);
  for (const query of ['minFee=-1', 'minFee=1.5', 'maxFee=100000001', 'minFee=500&maxFee=499', 'minFee=NaN', 'minFee=1e3',
    'maxFee=', 'minRating=5.01', 'minRating=-1', 'minRating=Infinity', 'minRating=4.555', 'city=a&city=b', 'city='+'x'.repeat(81),
    'district=%00', 'language=de', 'level=expert', 'mode=hybrid', 'sort=price', 'rating=5']) {
    assert.equal((await fetch(`${f.base}/api/catalog?${query}`)).status, 400, query);
  }
});

test('new submission metadata reaches owner/admin review without allowing forged rating or approval fields', async (t) => {
  const f = await fixture(t); const c = catalogFixture(f.store); const user = c.add({ approved: false }).user;
  const token = randomBytes(32).toString('hex'); f.store.createSession(token, user.id, Date.now() + 100000, '', Date.now());
  const input = { ...base, title: 'Filterable lessons', description: 'Practice with a teacher.' };
  const request = (body) => fetch(`${f.base}/api/listings/submit`, { method: 'POST', headers: { Cookie: `teachwiz_session=${token}`, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await request(input); assert.equal(response.status, 201);
  const listing = (await response.json()).listing;
  for (const row of [f.store.listingsFor(user.id).find((item) => item.id === listing.id), f.store.pendingListings().find((item) => item.id === listing.id)]) {
    for (const key of ['city', 'district', 'skillLevel', 'monthlyFee', 'instructionLanguages', 'deliveryModes']) assert.deepEqual(row[key], input[key]);
    assert.equal(row.status, 'pending');
  }
  for (const invalid of [{ monthlyFee: '450000' }, { monthlyFee: -1 }, { monthlyFee: 1.5 }, { monthlyFee: 100000001 },
    { city: '', district: 'Some district' }, { skillLevel: 'expert' }, { instructionLanguages: ['de'] }, { instructionLanguages: 'uz' },
    { deliveryModes: ['hybrid'] }, { rating: 5 }, { reviewCount: 20 }, { status: 'approved' }]) {
    assert.equal((await request({ ...input, ...invalid })).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await fetch(`${f.base}/api/ratings`, { method: 'POST' })).status, 404);
  assert.throws(() => f.store.recordRatingSummary(user.id, { scoreTotal: 11, reviewCount: 2 }), { status: 400 });
  assert.throws(() => listingInput({ ...input, city: 'x'.repeat(81) }), { status: 400 });
  assert.equal(listingInput({ ...input, city: '  New\n City ' }).city, 'New City');
});

test('schema v3 migrates existing search metadata without inventing price, location or ratings', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'teachwiz-v3-filters-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = join(dir, 'existing.sqlite');
  let store = openStore(filename); const item = catalogFixture(store).add({ subjects: ['Math'], preparationCategories: ['sat'] }); store.close();
  const db = new DatabaseSync(filename);
  db.exec(`DROP INDEX listings_monthly_fee; DROP TABLE provider_rating_summaries;
    ALTER TABLE listings DROP COLUMN lesson_fee; ALTER TABLE listings DROP COLUMN schedule_summary; ALTER TABLE listings DROP COLUMN contact_phone;
    ALTER TABLE listings DROP COLUMN contact_telegram; ALTER TABLE listings DROP COLUMN address; ALTER TABLE listings DROP COLUMN updated_at;
    ALTER TABLE listings DROP COLUMN city; ALTER TABLE listings DROP COLUMN district; ALTER TABLE listings DROP COLUMN skill_level;
    ALTER TABLE listings DROP COLUMN monthly_fee; ALTER TABLE listings DROP COLUMN instruction_languages; ALTER TABLE listings DROP COLUMN delivery_modes;
    PRAGMA user_version = 3;`); db.close();
  for (let pass = 0; pass < 2; pass++) {
    store = openStore(filename); const row = store.publishedListing(item.listing.id);
    assert.deepEqual(row.subjects, ['Math']); assert.deepEqual(row.preparationCategories, ['sat']);
    assert.equal(row.monthlyFee, null); assert.equal(row.rating, null); assert.equal(row.city, ''); assert.deepEqual(row.deliveryModes, []);
    store.close();
  }
});

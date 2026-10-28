import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, origin } from '../test-support/auth-fixture.js';
import { catalogFixture } from '../test-support/catalog-fixture.js';
import { listingInput, listingUpdateInput } from '../src/verification.js';
import { openStore } from '../src/store.js';

// KAN-11 / MVP-07: representatives create and edit listings with pricing, schedule, contact details and address.
const application = { providerType: 'learning_center', providerName: 'Bright Minds Center', contactDetails: 'owner@example.test', evidence: 'https://example.test/bright-minds' };
const profile = {
  title: 'Math & Physics · Grades 9–11', description: 'Small classes with guided practice.',
  subjects: ['Math', 'Physics'], skillLevel: 'intermediate', instructionLanguages: ['uz', 'ru'], deliveryModes: ['in_person'],
  city: 'Tashkent', district: 'Yunusabad', address: '12 Amir Temur Avenue, 2nd floor',
  monthlyFee: 450000, lessonFee: 60000, scheduleSummary: 'Mon · Wed · Fri, 16:00–19:00',
  contactPhone: '+998 (90) 123-45-67', contactTelegram: 'https://t.me/BrightMinds',
};
const stored = { ...profile, preparationCategories: [], contactPhone: '+998901234567', contactTelegram: 'BrightMinds' };

function identity(f, role = 'student', name = role) {
  const user = f.store.createUser(`${name}@example.test`, 'not-used-for-login', role);
  const token = randomBytes(32).toString('hex');
  f.store.createSession(token, user.id, Date.now() + 86_400_000, '', Date.now());
  return { ...user, cookie: `teachwiz_session=${token}` };
}
const call = (f, path, user, body, options = {}) => fetch(`${f.base}/api/${path}`, {
  method: body === undefined ? 'GET' : 'POST', ...options,
  headers: { Cookie: user?.cookie || '', Origin: origin, 'Content-Type': 'application/json', ...options.headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function success(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
const catalog = async (f, query = '') => (await success(await fetch(`${f.base}/api/catalog${query}`))).listings;
const pick = (item, keys = Object.keys(stored)) => Object.fromEntries(keys.map((key) => [key, item[key]]));

async function verifiedProvider(f, name = 'provider') {
  const admin = identity(f, 'admin', `${name}-admin`);
  const user = identity(f, 'student', name);
  const saved = (await success(await call(f, 'verification/submit', user, application), 201)).application;
  await success(await call(f, 'admin/verification/review', admin, { id: saved.id, decision: 'approved', reason: '' }));
  return { admin, user };
}

test('listings carry pricing, schedule, contact details and address through creation, review and publication', async (t) => {
  const f = await fixture(t);
  const { admin, user } = await verifiedProvider(f);
  const listing = (await success(await call(f, 'listings/submit', user, profile), 201)).listing;
  assert.deepEqual(pick(listing), stored);
  assert.equal(listing.published, false);
  assert.equal(listing.updatedAt, null);
  assert.deepEqual(pick((await success(await call(f, 'listings/mine', user))).listings[0]), stored);
  const queued = (await success(await call(f, 'admin/listings', admin))).listings.find((item) => item.id === listing.id);
  assert.deepEqual(pick(queued), stored);
  assert.deepEqual(await catalog(f), []);
  await success(await call(f, 'admin/listings/review', admin, { id: listing.id, decision: 'approved', reason: '' }));
  await f.restart();
  const [published] = await catalog(f);
  assert.deepEqual(pick(published), stored);
  assert.equal(published.rating, null);
  const detail = (await success(await fetch(`${f.base}/api/catalog/listing?id=${listing.id}`))).listing;
  assert.deepEqual(pick(detail), stored);
  // The legacy public feed keeps its exact contract for existing clients.
  assert.deepEqual((await success(await call(f, 'listings'))).listings, [{
    id: listing.id, title: profile.title, description: profile.description, providerType: application.providerType, providerName: application.providerName,
  }]);
});

test('contact details are normalized and invalid profile values are rejected before anything is stored', async (t) => {
  const f = await fixture(t);
  const { user } = await verifiedProvider(f);
  for (const [input, phone] of [['998901234567', '998901234567'], ['+998 90 123 45 67', '+998901234567'], ['90-123-45-67', '901234567'], ['', ''], [undefined, '']]) {
    assert.equal(listingInput({ ...profile, contactPhone: input }).contactPhone, phone, String(input));
  }
  for (const [input, username] of [['@bright_minds', 'bright_minds'], ['t.me/BrightMinds', 'BrightMinds'], ['https://t.me/bright_minds/', 'bright_minds'],
    ['HTTP://T.ME/Bright_Minds', 'Bright_Minds'], ['', ''], [undefined, '']]) {
    assert.equal(listingInput({ ...profile, contactTelegram: input }).contactTelegram, username, String(input));
  }
  assert.equal(listingInput({ ...profile, scheduleSummary: '  Mon \n Wed  ' }).scheduleSummary, 'Mon Wed');
  assert.equal(listingInput({ title: 'Minimal', description: 'Only the required fields.' }).lessonFee, null);
  for (const invalid of [
    { contactPhone: '12345' }, { contactPhone: 'call me' }, { contactPhone: '+1 (555) 123-4567 ext 9' }, { contactPhone: '+' + '9'.repeat(16) }, { contactPhone: 5 },
    { contactTelegram: 'abcd' }, { contactTelegram: '1abcde' }, { contactTelegram: 'bright-minds' }, { contactTelegram: 'https://example.com/brightminds' },
    { contactTelegram: 'x'.repeat(33) }, { contactTelegram: ['brightminds'] },
    { lessonFee: -1 }, { lessonFee: 1.5 }, { lessonFee: '60000' }, { lessonFee: 100000001 },
    { scheduleSummary: 'x'.repeat(301) }, { scheduleSummary: 'bad\u0000text' }, { address: 'x'.repeat(201) }, { address: {} },
    { published: true }, { status: 'approved' }, { updatedAt: 1 },
  ]) {
    assert.throws(() => listingInput({ ...profile, ...invalid }), { status: 400 }, JSON.stringify(invalid));
    assert.equal((await call(f, 'listings/submit', user, { ...profile, ...invalid })).status, 400, JSON.stringify(invalid));
  }
  assert.deepEqual((await success(await call(f, 'listings/mine', user))).listings, []);
});

test('owners edit listings in place; every edit returns the listing to review and hides it until approved again', async (t) => {
  const f = await fixture(t);
  const { admin, user } = await verifiedProvider(f);
  const listing = (await success(await call(f, 'listings/submit', user, profile), 201)).listing;
  await success(await call(f, 'admin/listings/review', admin, { id: listing.id, decision: 'approved', reason: '' }));
  assert.equal((await catalog(f))[0].monthlyFee, 450000);
  f.advance(60_000);
  const changes = { ...profile, title: 'Math, Physics & Chemistry', monthlyFee: 500000, lessonFee: null, scheduleSummary: 'Sat · Sun, 10:00–13:00', contactTelegram: '@bright_minds', address: '' };
  const edited = (await success(await call(f, 'listings/update', user, { id: listing.id, ...changes }))).listing;
  assert.equal(edited.id, listing.id);
  assert.equal(edited.status, 'pending');
  assert.equal(edited.published, false);
  assert.equal(edited.reviewReason, '');
  assert.equal(edited.reviewedAt, null);
  assert.ok(edited.updatedAt > edited.submittedAt);
  assert.deepEqual(pick(edited), { ...stored, ...changes, contactPhone: stored.contactPhone, contactTelegram: 'bright_minds' });
  assert.deepEqual(await catalog(f), []);
  assert.equal((await fetch(`${f.base}/api/catalog/listing?id=${listing.id}`)).status, 404);
  assert.equal((await success(await call(f, 'listings/mine', user))).listings[0].published, false);
  const queued = (await success(await call(f, 'admin/listings', admin))).listings;
  assert.equal(queued.length, 1);
  assert.equal(queued[0].title, changes.title);
  await success(await call(f, 'admin/listings/review', admin, { id: listing.id, decision: 'rejected', reason: 'Add the address back.' }));
  assert.equal((await success(await call(f, 'listings/mine', user))).listings[0].reviewReason, 'Add the address back.');
  const resubmitted = (await success(await call(f, 'listings/update', user, { id: listing.id, ...changes, address: profile.address }))).listing;
  assert.equal(resubmitted.status, 'pending');
  assert.equal(resubmitted.reviewReason, '');
  await success(await call(f, 'admin/listings/review', admin, { id: listing.id, decision: 'approved', reason: '' }));
  await f.restart();
  const [published] = await catalog(f);
  assert.equal(published.title, changes.title);
  assert.equal(published.monthlyFee, 500000);
  assert.equal(published.lessonFee, null);
  assert.equal(published.address, profile.address);
  assert.equal((await success(await call(f, 'listings/mine', user))).listings[0].published, true);
  const db = new DatabaseSync(f.filename);
  const audit = db.prepare('SELECT reviewed_by, reviewed_at, updated_at FROM listings WHERE id = ?').get(listing.id);
  db.close();
  assert.equal(audit.reviewed_by, admin.id);
  assert.ok(audit.reviewed_at >= audit.updated_at);
});

test('listing edits enforce ownership, the role matrix, identifiers, CSRF and content checks', async (t) => {
  const f = await fixture(t);
  const { admin, user } = await verifiedProvider(f);
  const { user: other } = await verifiedProvider(f, 'other');
  const listing = (await success(await call(f, 'listings/submit', user, profile), 201)).listing;
  const body = { id: listing.id, ...profile, title: 'Hijacked' };
  assert.equal((await call(f, 'listings/update', other, body)).status, 404);
  assert.equal((await call(f, 'listings/update', user, { ...body, id: randomUUID() })).status, 404);
  assert.equal((await call(f, 'listings/update', user, { ...body, id: 'not-a-uuid' })).status, 400);
  assert.equal((await call(f, 'listings/update', user, profile)).status, 400);
  assert.equal((await call(f, 'listings/update', user, { ...body, userId: other.id })).status, 400);
  assert.equal((await call(f, 'listings/update', user, { ...body, title: '' })).status, 400);
  assert.equal((await call(f, 'listings/update', undefined, body)).status, 401);
  assert.equal((await call(f, 'listings/update', admin, body)).status, 403);
  assert.equal((await call(f, 'listings/update', user, body, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(f, 'listings/update', user, body, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await call(f, 'listings/update', user, undefined)).status, 405);
  assert.equal((await call(f, 'listings/update', user, { ...body, description: 'x'.repeat(8200) })).status, 413);
  assert.throws(() => listingUpdateInput({ ...body, id: listing.id.toUpperCase() }), { status: 400 });
  const unchanged = (await success(await call(f, 'listings/mine', user))).listings[0];
  assert.equal(unchanged.title, profile.title);
  assert.equal(unchanged.updatedAt, null);
  assert.deepEqual((await success(await call(f, 'listings/mine', other))).listings, []);
});

test('schema v4 databases migrate to v5 with existing listings intact and empty profile details', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'teachwiz-v4-listings-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = join(dir, 'existing.sqlite');
  let store = openStore(filename);
  const item = catalogFixture(store).add({ monthlyFee: 300000, subjects: ['Math'] });
  const before = store.publishedListing(item.listing.id);
  store.close();
  const db = new DatabaseSync(filename);
  db.exec(`ALTER TABLE listings DROP COLUMN lesson_fee; ALTER TABLE listings DROP COLUMN schedule_summary; ALTER TABLE listings DROP COLUMN contact_phone;
    ALTER TABLE listings DROP COLUMN contact_telegram; ALTER TABLE listings DROP COLUMN address; ALTER TABLE listings DROP COLUMN updated_at;
    PRAGMA user_version = 4;`);
  db.close();
  for (let pass = 0; pass < 2; pass++) {
    store = openStore(filename);
    const row = store.publishedListing(item.listing.id);
    assert.deepEqual(row, { ...before, lessonFee: null, scheduleSummary: '', contactPhone: '', contactTelegram: '', address: '' });
    assert.equal(store.listingsFor(item.user.id)[0].updatedAt, null);
    store.close();
  }
  const migrated = new DatabaseSync(filename);
  assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, 5);
  assert.equal(migrated.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  migrated.close();
});

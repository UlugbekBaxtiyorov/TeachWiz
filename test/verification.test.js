import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, digest } from '../src/store.js';
import { fixture, origin } from '../test-support/auth-fixture.js';

const application = { providerType: 'tutor', providerName: 'Math tutor', contactDetails: 'tutor@example.test', evidence: 'Teaching at Example Academy. Public profile: https://example.test/tutor' };
const listing = { title: 'Algebra lessons', description: 'Small groups and individual algebra lessons.' };

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
const submit = async (f, user, input = application) => (await success(await call(f, 'verification/submit', user, input), 201)).application;
const review = (f, admin, id, decision = 'approved', reason = '') => call(f, 'admin/verification/review', admin, { id, decision, reason });
const submitListing = async (f, user) => (await success(await call(f, 'listings/submit', user, listing), 201)).listing;
const reviewListing = (f, admin, id, decision = 'approved', reason = '') => call(f, 'admin/listings/review', admin, { id, decision, reason });
function update(f, sql, ...values) {
  const db = new DatabaseSync(f.filename);
  try { db.prepare(sql).run(...values); } finally { db.close(); }
}

test('tutor and learning center applications require admin approval; existing sessions gain only representative access', async (t) => {
  const f = await fixture(t);
  const admin = identity(f, 'admin');
  for (const providerType of ['tutor', 'learning_center']) {
    const user = identity(f, 'student', providerType);
    const saved = await submit(f, user, { ...application, providerType });
    assert.equal(saved.status, 'pending');
    assert.equal(saved.reviewedAt, null);
    assert.equal((await f.session(user.cookie)).status, 200);
    assert.equal((await call(f, 'workspaces/representative', user)).status, 403);
    const queue = await success(await call(f, 'admin/verification', admin));
    assert.equal(queue.applications[0].applicantEmail, user.email);
    assert.equal(queue.applications[0].evidence, application.evidence);
    const result = await success(await review(f, admin, saved.id));
    assert.equal(result.application.status, 'approved');
    assert.equal((await success(await f.session(user.cookie))).user.role, 'representative');
    assert.equal((await call(f, 'workspaces/representative', user)).status, 200);
    assert.equal((await call(f, 'workspaces/admin', user)).status, 403);
    assert.equal((await success(await call(f, 'verification', user))).verified, true);
    assert.equal((await success(await call(f, 'admin/verification', admin))).accounts.student, 0);
    assert.equal((await call(f, 'verification/submit', user, application)).status, 409);
  }
  await f.restart();
  assert.equal((await success(await call(f, 'admin/verification', admin))).applications.length, 0);
});

test('rejection requires a reason; resubmission preserves immutable history and the old review cannot affect it', async (t) => {
  const f = await fixture(t);
  const user = identity(f);
  const admin = identity(f, 'admin');
  const first = await submit(f, user);
  assert.equal((await review(f, admin, first.id, 'rejected', '   ')).status, 400);
  await success(await review(f, admin, first.id, 'rejected', 'Please provide a public teaching profile.'));
  assert.equal(f.store.findUser(user.email).role, 'student');
  const second = await submit(f, user, { ...application, evidence: 'Updated public teaching profile.' });
  assert.notEqual(first.id, second.id);
  assert.equal((await review(f, admin, first.id)).status, 409);
  await f.restart();
  const history = await success(await call(f, 'verification', user));
  assert.deepEqual(history.applications.map((a) => a.status), ['pending', 'rejected']);
  assert.equal(history.applications[1].reviewReason, 'Please provide a public teaching profile.');
  assert.equal(history.applications[1].evidence, application.evidence);
  assert.equal(history.verified, false);
  await success(await review(f, admin, second.id));
  const db = new DatabaseSync(f.filename);
  const audit = db.prepare('SELECT reviewed_by, reviewed_at FROM representative_applications WHERE id = ?').get(second.id);
  db.close();
  assert.equal(audit.reviewed_by, admin.id);
  assert.ok(audit.reviewed_at > 0);
});

test('all verification and listing APIs enforce the role matrix before processing request bodies', async (t) => {
  const f = await fixture(t);
  const actors = { guest: undefined, student: identity(f), representative: identity(f, 'representative'), admin: identity(f, 'admin') };
  const routes = [
    ['verification', undefined, ['student', 'representative']],
    ['verification/submit', {}, ['student', 'representative']],
    ['listings/mine', undefined, ['student', 'representative']],
    ['listings/submit', {}, ['student', 'representative']],
    ['admin/verification', undefined, ['admin']],
    ['admin/verification/review', {}, ['admin']],
    ['admin/listings', undefined, ['admin']],
    ['admin/listings/review', {}, ['admin']],
  ];
  for (const [role, user] of Object.entries(actors)) {
    for (const [path, body, allowed] of routes) {
      const response = await call(f, path, user, body);
      assert.equal(response.status, role === 'guest' ? 401 : !allowed.includes(role) ? 403 : body ? 400 : 200, `${role} -> ${path}`);
    }
    assert.equal((await call(f, 'listings', user)).status, 200);
  }
  const user = actors.student;
  await submit(f, user);
  const other = identity(f, 'student', 'other');
  assert.deepEqual((await success(await call(f, `verification?userId=${user.id}`, other))).applications, []);
  await submitListing(f, user);
  assert.deepEqual((await success(await call(f, `listings/mine?userId=${user.id}`, other))).listings, []);
});

test('client role/owner/status injection, invalid input, CSRF, unsupported methods and oversized bodies cannot write', async (t) => {
  const f = await fixture(t);
  const user = identity(f);
  const admin = identity(f, 'admin');
  for (const input of [null, [], {}, { ...application, providerType: 'admin' }, { ...application, evidence: ' ' },
    { ...application, providerName: 'x'.repeat(121) }, { ...application, evidence: 'bad\u0000text' },
    ...['role', 'userId', 'status', 'reviewedBy'].map((key) => ({ ...application, [key]: 'approved' }))]) {
    assert.equal((await call(f, 'verification/submit', user, input)).status, 400);
  }
  const writes = [
    ['verification/submit', user, application],
    ['listings/submit', user, listing],
    ['admin/verification/review', admin, {}],
    ['admin/listings/review', admin, {}],
  ];
  for (const [path, actor, body] of writes) {
    assert.equal((await call(f, path, actor, body, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call(f, path, actor, body, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await call(f, path, actor, undefined)).status, 405);
    assert.equal((await call(f, path, actor, { text: 'x'.repeat(8200) })).status, 413);
  }
  const saved = await submit(f, user);
  assert.equal((await call(f, 'admin/verification/review?role=admin', user,
    { id: saved.id, decision: 'approved' }, { headers: { 'X-Role': 'admin' } })).status, 403);
  assert.equal((await call(f, 'verification/submit/', user, application)).status, 404);
  assert.equal(f.store.findUser(user.email).role, 'student');
  assert.equal((await call(f, 'listings/submit', user, { ...listing, status: 'approved' })).status, 400);
  assert.equal((await call(f, 'listings/submit', user, { ...listing, userId: admin.id })).status, 400);
});

test('duplicate submissions and competing admin decisions produce one durable result', async (t) => {
  const f = await fixture(t);
  const user = identity(f);
  const admin = identity(f, 'admin');
  const another = identity(f, 'admin', 'another-admin');
  const submissions = await Promise.all([call(f, 'verification/submit', user, application), call(f, 'verification/submit', user, application)]);
  assert.deepEqual(submissions.map((r) => r.status).sort(), [201, 409]);
  const id = (await submissions.find((r) => r.status === 201).json()).application.id;
  const decisions = await Promise.all([review(f, admin, id), review(f, another, id, 'rejected', 'Not enough evidence.')]);
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
  const winner = (await decisions.find((r) => r.status === 200).json()).application;
  await f.restart();
  const history = (await success(await call(f, 'verification', user))).applications;
  assert.equal(history.length, 1);
  assert.equal(history[0].status, winner.status);
  assert.equal(f.store.findUser(user.email).role, winner.status === 'approved' ? 'representative' : 'student');
});

test('listings remain private through application and listing review, and public data excludes verification details', async (t) => {
  const f = await fixture(t);
  const user = identity(f);
  const admin = identity(f, 'admin');
  assert.equal((await call(f, 'listings/submit', user, listing)).status, 403);
  const app = await submit(f, user);
  const draft = await submitListing(f, user);
  assert.equal(draft.published, false);
  const publicListings = async () => (await success(await call(f, 'listings'))).listings;
  assert.deepEqual(await publicListings(), []);
  assert.equal((await reviewListing(f, admin, draft.id)).status, 409);
  await success(await review(f, admin, app.id));
  assert.deepEqual(await publicListings(), []);
  const reviewed = await success(await reviewListing(f, admin, draft.id));
  assert.equal(reviewed.listing.published, true);
  assert.equal((await reviewListing(f, admin, draft.id, 'rejected', 'Stale decision')).status, 409);
  await f.restart();
  assert.deepEqual(await publicListings(), [{ id: draft.id, ...listing, providerType: application.providerType, providerName: application.providerName }]);
  const own = (await success(await call(f, 'listings/mine', user))).listings;
  assert.equal(own[0].published, true);
  update(f, "UPDATE users SET role = 'student' WHERE id = ?", user.id);
  assert.deepEqual(await publicListings(), []);
  assert.equal((await success(await call(f, 'listings/mine', user))).listings[0].published, false);
});

test('a representative role without verification cannot publish; rejection never publishes a listing', async (t) => {
  const f = await fixture(t);
  const user = identity(f, 'representative');
  const admin = identity(f, 'admin');
  const app = await submit(f, user);
  const draft = await submitListing(f, user);
  assert.equal((await success(await call(f, 'verification', user))).verified, false);
  assert.equal((await reviewListing(f, admin, draft.id)).status, 409);
  assert.equal((await reviewListing(f, admin, draft.id, 'rejected')).status, 400);
  await success(await reviewListing(f, admin, draft.id, 'rejected', 'Please improve the description.'));
  await success(await review(f, admin, app.id));
  assert.deepEqual((await success(await call(f, 'listings'))).listings, []);
  assert.equal((await success(await call(f, 'listings/mine', user))).listings[0].reviewReason, 'Please improve the description.');
});

test('self-review, deleted applications, changed roles and expired sessions cannot bypass moderation', async (t) => {
  const f = await fixture(t);
  const user = identity(f);
  const admin = identity(f, 'admin');
  const app = await submit(f, user);
  const draft = await submitListing(f, user);
  update(f, "UPDATE users SET role = 'admin' WHERE id = ?", user.id);
  assert.equal((await review(f, user, app.id)).status, 403);
  assert.equal((await reviewListing(f, user, draft.id, 'rejected', 'Own listing')).status, 403);
  assert.equal((await review(f, admin, app.id)).status, 403);
  update(f, "UPDATE users SET role = 'student' WHERE id = ?", user.id);
  update(f, "UPDATE users SET role = 'student' WHERE id = ?", admin.id);
  assert.equal((await review(f, admin, app.id)).status, 403);
  update(f, "UPDATE users SET role = 'admin' WHERE id = ?", admin.id);
  update(f, 'DELETE FROM representative_applications WHERE id = ?', app.id);
  assert.equal((await review(f, admin, app.id)).status, 404);
  assert.equal((await reviewListing(f, admin, draft.id)).status, 409);
  f.advance(2 * 86_400_000);
  assert.equal((await call(f, 'verification', user)).status, 401);
  assert.equal((await review(f, admin, app.id)).status, 401);
  assert.deepEqual((await success(await call(f, 'listings'))).listings, []);
});

test('a failed review rolls back role promotion and leaves the application pending', async (t) => {
  const f = await fixture(t);
  const user = identity(f);
  const admin = identity(f, 'admin');
  const app = await submit(f, user);
  const db = new DatabaseSync(f.filename);
  db.exec("CREATE TRIGGER fail_review BEFORE UPDATE ON representative_applications BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;");
  db.close();
  assert.equal((await review(f, admin, app.id)).status, 500);
  assert.equal(f.store.findUser(user.email).role, 'student');
  assert.equal((await success(await call(f, 'verification', user))).applications[0].status, 'pending');
});

test('competing listing decisions cannot overwrite each other and removing verification hides a published listing', async (t) => {
  const f = await fixture(t);
  const user = identity(f);
  const admin = identity(f, 'admin');
  const app = await submit(f, user);
  const draft = await submitListing(f, user);
  await success(await review(f, admin, app.id));
  const decisions = await Promise.all([reviewListing(f, admin, draft.id), reviewListing(f, admin, draft.id, 'rejected', 'Not ready.')]);
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
  const another = await submitListing(f, user);
  await success(await reviewListing(f, admin, another.id));
  assert.ok((await success(await call(f, 'listings'))).listings.some((row) => row.id === another.id));
  update(f, 'DELETE FROM representative_applications WHERE id = ?', app.id);
  assert.deepEqual((await success(await call(f, 'listings'))).listings, []);
  assert.equal(f.store.findUser(user.email).role, 'representative');
});

test('schema v1 migrates without altering accounts, sessions or rate limits, and repeated opens are safe', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'teachwiz-migrate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = join(dir, 'old.sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL) STRICT;
    CREATE TABLE auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT;
    PRAGMA user_version = 1;`);
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('old-user', 'old@example.test', 'existing-hash', 'student', 100);
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest('old-token'), 'old-user', 9000);
  db.prepare('INSERT INTO auth_limits VALUES (?, ?, ?)').run(digest('limit'), 10, 9000);
  db.close();
  for (let pass = 0; pass < 2; pass++) {
    const store = openStore(filename);
    try {
      assert.equal(store.findUser('old@example.test').password_hash, 'existing-hash');
      assert.equal(store.sessionUser('old-token', 1000).id, 'old-user');
      assert.equal(store.allowAttempt('limit', 10, 1000), false);
      assert.deepEqual(store.applicationsFor('old-user'), []);
      assert.deepEqual(store.publishedListings(), []);
    } finally { store.close(); }
  }
  const migrated = new DatabaseSync(filename);
  assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(migrated.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  migrated.close();
});

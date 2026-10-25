import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { fixture, origin } from '../test-support/auth-fixture.js';

function identity(f, role, name) {
  const user = f.store.createUser(`${name}@example.test`, 'not-used', role);
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  f.store.createSession(token, user.id, now + 86_400_000, '', now);
  return { ...user, cookie: `teachwiz_session=${token}` };
}

function request(f, providerId, student, body, method = 'POST') {
  return fetch(`${f.base}/api/providers/${providerId}/reviews`, {
    method,
    headers: {
      Origin: origin,
      Cookie: student?.cookie || '',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function seedProvider(f, name = 'provider') {
  const provider = identity(f, 'representative', name);
  const admin = identity(f, 'admin', `${name}-admin`);
  const now = Date.now();
  const db = f.store;
  db.submitApplication(provider.id, {
    providerType: 'learning_center',
    providerName: 'Bright Minds Center',
    contactDetails: 'center@example.test',
    evidence: 'Approved test provider',
  }, now);
  const application = db.applicationsFor(provider.id)[0];
  db.reviewApplication(admin.id, { id: application.id, decision: 'approved', reason: '' }, now + 1);
  return { provider, admin };
}

async function json(response) {
  const body = await response.json();
  return { status: response.status, body };
}

test('public provider reviews return arithmetic average, count, and review text', async (t) => {
  const f = await fixture(t);
  const { provider } = seedProvider(f);
  const studentA = identity(f, 'student', 'student-a');
  const studentB = identity(f, 'student', 'student-b');

  let result = await json(await request(f, provider.id, undefined, undefined, 'GET'));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.reviews, { average: 0, count: 0, reviews: [] });

  result = await json(await request(f, provider.id, studentA, { rating: 5, text: 'Excellent teachers.' }));
  assert.equal(result.status, 201);
  assert.equal(result.body.summary.average, 5);
  assert.equal(result.body.summary.count, 1);

  result = await json(await request(f, provider.id, studentB, { rating: 4, text: 'Very good center.' }));
  assert.equal(result.status, 201);
  assert.equal(result.body.summary.average, 4.5);
  assert.equal(result.body.summary.count, 2);
  assert.deepEqual(result.body.summary.reviews.map(({ rating, text }) => ({ rating, text })), [
    { rating: 4, text: 'Very good center.' },
    { rating: 5, text: 'Excellent teachers.' },
  ]);

  result = await json(await request(f, provider.id, undefined, undefined, 'GET'));
  assert.equal(result.status, 200);
  assert.equal(result.body.reviews.average, 4.5);
  assert.equal(result.body.reviews.count, 2);
});

test('a student can submit only one review for the same provider', async (t) => {
  const f = await fixture(t);
  const { provider } = seedProvider(f);
  const student = identity(f, 'student', 'student');

  assert.equal((await json(await request(f, provider.id, student, { rating: 5, text: 'First review' }))).status, 201);
  const duplicate = await json(await request(f, provider.id, student, { rating: 1, text: 'Second review' }));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /already reviewed/i);

  const summary = await json(await request(f, provider.id, undefined, undefined, 'GET'));
  assert.equal(summary.body.reviews.count, 1);
  assert.equal(summary.body.reviews.reviews[0].text, 'First review');
});

test('review input is validated server-side and only students can create reviews', async (t) => {
  const f = await fixture(t);
  const { provider } = seedProvider(f);
  const student = identity(f, 'student', 'student');
  const representative = identity(f, 'representative', 'other-representative');
  const admin = identity(f, 'admin', 'other-admin');

  for (const rating of [0, 6, 1.5, '5', null]) {
    const result = await json(await request(f, provider.id, student, { rating, text: 'Invalid rating' }));
    assert.equal(result.status, 400, `rating ${JSON.stringify(rating)}`);
  }
  for (const body of [
    { rating: 5, text: '' },
    { rating: 5, text: ' '.repeat(5) },
    { rating: 5, text: 'x'.repeat(2001) },
    { rating: 5, text: 'bad\u0000text' },
    { rating: 5, text: 'ok', extra: true },
  ]) {
    assert.equal((await json(await request(f, provider.id, student, body))).status, 400);
  }

  assert.equal((await json(await request(f, provider.id, representative, { rating: 5, text: 'No' }))).status, 403);
  assert.equal((await json(await request(f, provider.id, admin, { rating: 5, text: 'No' }))).status, 403);
  assert.equal((await json(await request(f, provider.id, undefined, { rating: 5, text: 'No' }))).status, 401);
});

test('review endpoint rejects unknown providers and unsupported methods', async (t) => {
  const f = await fixture(t);
  const student = identity(f, 'student', 'student');
  const unknownProvider = randomUUID();

  assert.equal((await json(await request(f, unknownProvider, undefined, undefined, 'GET'))).status, 404);
  assert.equal((await json(await request(f, unknownProvider, student, { rating: 5, text: 'No' }))).status, 404);
  const response = await fetch(`${f.base}/api/providers/${unknownProvider}/reviews`, {
    method: 'PUT',
    headers: { Origin: origin, Cookie: student.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 5, text: 'No' }),
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, POST');
  await response.text();
});

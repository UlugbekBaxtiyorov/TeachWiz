import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/store.js';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'teachwiz-reviews-'));
  const filename = join(dir, 'app.sqlite');
  const store = openStore(filename);
  const db = new DatabaseSync(filename);
  const provider = store.createUser(`provider-${randomUUID()}@example.test`, 'hash', 'representative', 1);
  const student = store.createUser(`student-${randomUUID()}@example.test`, 'hash', 'student', 1);
  db.prepare(`INSERT INTO representative_applications
    (id,user_id,provider_type,provider_name,contact_details,evidence,status,submitted_at,reviewed_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), provider.id, 'tutor', 'Test Tutor', 'test', 'test', 'approved', 1, 2);
  const providerId = randomUUID();
  db.prepare(`INSERT INTO listings
    (id,user_id,title,description,status,submitted_at,reviewed_at)
    VALUES (?,?,?,?,?,?,?)`).run(providerId, provider.id, 'Test Tutor', 'Test', 'approved', 1, 2);
  db.close();
  return { store, providerId, studentId: student.id, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('student can submit one 1-5 review and provider summary uses arithmetic average', async () => {
  const f = await setup();
  f.store.submitReview(f.studentId, { providerId: f.providerId, rating: 4, text: 'Good tutor.' }, 10);
  const summary = f.store.reviewsFor(f.providerId);
  assert.equal(summary.reviewCount, 1);
  assert.equal(summary.averageRating, 4);
  assert.equal(summary.reviews[0].rating, 4);
  assert.equal(summary.reviews[0].text, 'Good tutor.');
  f.store.close();
  await f.cleanup();
});

test('same student cannot review the same provider twice', async () => {
  const f = await setup();
  f.store.submitReview(f.studentId, { providerId: f.providerId, rating: 5, text: 'Excellent.' }, 10);
  assert.throws(() => f.store.submitReview(f.studentId, { providerId: f.providerId, rating: 1, text: 'Changed my mind.' }, 20), /already reviewed/);
  f.store.close();
  await f.cleanup();
});

test('database enforces rating range', async () => {
  const f = await setup();
  for (const rating of [0, 6, 1.5]) {
    assert.throws(() => f.store.submitReview(f.studentId, { providerId: f.providerId, rating, text: 'Review' }));
  }
  f.store.close();
  await f.cleanup();
});

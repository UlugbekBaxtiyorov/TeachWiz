import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/store.js';

function seedProvider(store, filename) {
  const db = new DatabaseSync(filename);
  const provider = store.createUser(`provider-${randomUUID()}@example.test`, 'hash', 'representative', 1);
  const student = store.createUser(`student-${randomUUID()}@example.test`, 'hash', 'student', 1);
  db.prepare(`INSERT INTO representative_applications
    (id,user_id,provider_type,provider_name,contact_details,evidence,status,submitted_at,reviewed_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), provider.id, 'tutor', 'Test Tutor', 'test', 'test', 'approved', 1, 2);
  const listingId = randomUUID();
  db.prepare(`INSERT INTO listings
    (id,user_id,title,description,status,submitted_at,reviewed_at)
    VALUES (?,?,?,?,?,?,?)`).run(listingId, provider.id, 'Test Tutor', 'Test', 'approved', 1, 2);
  db.close();
  return { providerId: listingId, studentId: student.id };
}

test('student can submit one 1-5 review and provider summary uses arithmetic average', () => {
  const filename = ':memory:';
  const store = openStore(filename);
  const { providerId, studentId } = seedProvider(store, filename);
  store.submitReview(studentId, { providerId, rating: 4, text: 'Good tutor.' }, 10);
  const summary = store.reviewsFor(providerId);
  assert.equal(summary.reviewCount, 1);
  assert.equal(summary.averageRating, 4);
  assert.equal(summary.reviews[0].rating, 4);
  assert.equal(summary.reviews[0].text, 'Good tutor.');
  store.close();
});

test('same student cannot review the same provider twice', () => {
  const store = openStore(':memory:');
  const { providerId, studentId } = seedProvider(store, ':memory:');
  store.submitReview(studentId, { providerId, rating: 5, text: 'Excellent.' }, 10);
  assert.throws(() => store.submitReview(studentId, { providerId, rating: 1, text: 'Changed my mind.' }, 20), /already reviewed/);
  store.close();
});

test('rating must be an integer from 1 through 5', () => {
  const store = openStore(':memory:');
  const { providerId, studentId } = seedProvider(store, ':memory:');
  for (const rating of [0, 6, 1.5]) {
    assert.throws(() => store.submitReview(studentId, { providerId, rating, text: 'Review' }));
  }
  store.close();
});

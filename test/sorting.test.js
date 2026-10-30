import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fixture, origin } from '../test-support/auth-fixture.js';
import { catalogFixture } from '../test-support/catalog-fixture.js';

// KAN-16 / MVP-06 / REQ-09: reorder active results by monthly fee (asc/desc) or average star rating (desc).
// Equal values use stable listing-id tie-breakers.
async function search(f, params = '') {
  const response = await fetch(`${f.base}/api/catalog?${params}`);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function allPages(f, params) {
  const first = await search(f, params);
  const pages = [first];
  for (let page = 2; page <= first.pages; page++) pages.push(await search(f, `${params}&page=${page}`));
  return pages;
}
const ids = (result) => result.listings.map((item) => item.id);
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function student(f, name) {
  const user = f.store.createUser(`${name}@example.test`, 'not-used', 'student');
  const token = randomBytes(32).toString('hex');
  f.store.createSession(token, user.id, Date.now() + 86_400_000, '', Date.now());
  return { ...user, cookie: `teachwiz_session=${token}` };
}
async function review(f, listingId, reviewer, rating) {
  const response = await fetch(`${f.base}/api/providers/${listingId}/reviews`, {
    method: 'POST', headers: { Origin: origin, Cookie: reviewer.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, text: `Rated ${rating}` }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

test('monthly fee sorts order every page by fee, keep missing fees last and break ties by listing id', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const fees = [300000, 300000, null, 100000, 300000, 450000, null, 100000, 0, 0];
  const created = [];
  for (let index = 0; index < 30; index++) {
    const monthlyFee = fees[index % fees.length];
    created.push({ id: catalog.add({ monthlyFee, title: `Listing ${index}` }).listing.id, monthlyFee });
  }
  const priced = created.filter((item) => item.monthlyFee !== null);
  const missing = created.filter((item) => item.monthlyFee === null).sort((a, b) => byId(a.id, b.id)).map((item) => item.id);
  const ascending = priced.sort((a, b) => a.monthlyFee - b.monthlyFee || byId(a.id, b.id)).map((item) => item.id);
  const descending = [...priced].sort((a, b) => b.monthlyFee - a.monthlyFee || byId(a.id, b.id)).map((item) => item.id);
  for (const [sort, expected] of [['price_asc', [...ascending, ...missing]], ['price_desc', [...descending, ...missing]]]) {
    const pages = await allPages(f, `sort=${sort}`);
    assert.equal(pages.length, 2, sort);
    assert.deepEqual(pages.flatMap(ids), expected, sort);
    // The same request twice yields the same order: tie-breaking does not depend on insertion or timing.
    assert.deepEqual(ids(await search(f, `sort=${sort}`)), ids(pages[0]), sort);
  }
  assert.deepEqual(ids(await search(f, 'sort=price_asc&maxFee=0')), created.filter((item) => item.monthlyFee === 0).map((item) => item.id).sort(byId));
  await f.restart();
  assert.deepEqual((await allPages(f, 'sort=price_asc')).flatMap(ids), [...ascending, ...missing]);
});

test('rating sort uses the arithmetic average of real student reviews, highest first, unrated last, ties by id', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((name) => catalog.add({ providerName: `Provider ${name}`, monthlyFee: 200000 }).listing.id);
  const reviewers = [1, 2, 3].map((index) => student(f, `reviewer-${index}`));
  await review(f, a, reviewers[0], 5); await review(f, a, reviewers[1], 4);
  await review(f, b, reviewers[0], 4); await review(f, b, reviewers[1], 5);
  await review(f, c, reviewers[0], 3);
  const tied = [a, b].sort(byId);
  let result = await search(f, 'sort=rating');
  assert.deepEqual(ids(result), [...tied, c, d]);
  assert.deepEqual(result.listings.map((item) => [item.rating, item.reviewCount]), [[4.5, 2], [4.5, 2], [3, 1], [null, 0]]);
  // A new review moves the average immediately; the stored summary is updated in the review's transaction.
  await review(f, b, reviewers[2], 5);
  result = await search(f, 'sort=rating');
  assert.deepEqual(ids(result), [b, a, c, d]);
  assert.equal(result.listings[0].rating, 14 / 3);
  assert.deepEqual(ids(await search(f, 'sort=rating&minRating=4')), [b, a]);
  assert.deepEqual(ids(await search(f, 'sort=rating&q=provider')), [b, a, c, d]);
  await f.restart();
  assert.deepEqual(ids(await search(f, 'sort=rating')), [b, a, c, d]);
  // The public reviews endpoint and the catalog agree on the average.
  const summary = await (await fetch(`${f.base}/api/providers/${b}/reviews`)).json();
  assert.equal(summary.reviews.average, 14 / 3);
});

test('sort parameters are validated, repeated sorts are rejected and the default order is unchanged', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const older = catalog.add({ monthlyFee: 500000 }).listing.id;
  const newer = catalog.add({ monthlyFee: 100000 }).listing.id;
  assert.deepEqual(ids(await search(f)), [newer, older]);
  assert.deepEqual(ids(await search(f, 'sort=relevance')), [newer, older]);
  assert.deepEqual(ids(await search(f, 'sort=newest')), [newer, older]);
  assert.deepEqual(ids(await search(f, 'sort=price_asc')), [newer, older]);
  assert.deepEqual(ids(await search(f, 'sort=price_desc')), [older, newer]);
  // An empty sort means the default order, matching the search form's blank selection.
  assert.deepEqual(ids(await search(f, 'sort=')), [newer, older]);
  for (const query of ['sort=fee', 'sort=PRICE_ASC', 'sort=rating&sort=price_asc', 'sort=rating_desc', 'order=price_asc']) {
    assert.equal((await fetch(`${f.base}/api/catalog?${query}`)).status, 400, query);
  }
});

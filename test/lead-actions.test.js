import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../test-support/auth-fixture.js';
import { catalogFixture } from '../test-support/catalog-fixture.js';

// MVP-08 / REQ-11: profiles offer one-tap tel: dialing and t.me chat launchers without forcing sign-in.
const contact = { contactPhone: '+998 (90) 123-45-67', contactTelegram: 'https://t.me/Bright_Minds' };
const guest = (f, path) => fetch(`${f.base}${path}`);

test('signed-out visitors receive normalized contact details for published listings only', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  const live = catalog.add({ ...contact, providerName: 'Bright Minds Center' });
  catalog.add({ providerName: 'Quiet tutor', providerType: 'tutor' });
  catalog.add({ approved: false, contactPhone: '+998 99 000 00 00', contactTelegram: 'hidden_pending' });
  catalog.add({ verified: false, contactPhone: '+998 99 111 11 11', contactTelegram: 'hidden_unverified' });
  const results = (await (await guest(f, '/api/catalog')).json()).listings;
  assert.equal(results.length, 2);
  const shown = results.find((item) => item.id === live.listing.id);
  assert.equal(shown.contactPhone, '+998901234567');
  assert.equal(shown.contactTelegram, 'Bright_Minds');
  const quiet = results.find((item) => item.id !== live.listing.id);
  assert.equal(quiet.contactPhone, '');
  assert.equal(quiet.contactTelegram, '');
  const serialized = JSON.stringify(results);
  for (const hidden of ['998990000000', 'hidden_pending', '998991111111', 'hidden_unverified', 'private@example.test']) assert.ok(!serialized.includes(hidden), hidden);
  const detail = (await (await guest(f, `/api/catalog/listing?id=${live.listing.id}`)).json()).listing;
  assert.equal(detail.contactPhone, '+998901234567');
  assert.equal(detail.contactTelegram, 'Bright_Minds');
  await f.restart();
  assert.equal((await (await guest(f, `/api/catalog/listing?id=${live.listing.id}`)).json()).listing.contactTelegram, 'Bright_Minds');
});

test('stored contact values can only produce safe tel: and t.me links', async (t) => {
  const f = await fixture(t); const catalog = catalogFixture(f.store);
  for (const [phone, telegram] of [['998901234567', 'brightminds'], ['+1 555 123 4567', '@Bright_Minds_2024'], ['90-123-45-67', 't.me/Bright_Minds']]) {
    const { listing } = catalog.add({ contactPhone: phone, contactTelegram: telegram });
    const item = (await (await guest(f, `/api/catalog/listing?id=${listing.id}`)).json()).listing;
    assert.match(item.contactPhone, /^\+?\d{7,15}$/, phone);
    assert.match(item.contactTelegram, /^[A-Za-z][A-Za-z0-9_]{4,31}$/, telegram);
    assert.equal(new URL(`tel:${item.contactPhone}`).protocol, 'tel:');
    assert.equal(new URL(`https://t.me/${encodeURIComponent(item.contactTelegram)}`).pathname, `/${item.contactTelegram}`);
  }
  for (const invalid of [
    { contactTelegram: 'javascript:alert(1)' }, { contactTelegram: '../../evil' }, { contactTelegram: 'name?start=1' }, { contactTelegram: 'name with spaces' },
    { contactPhone: 'tel:+998901234567' }, { contactPhone: '+998 90 123 45 67;ext=1' }, { contactPhone: '+99890123456x' },
  ]) {
    assert.throws(() => catalog.add(invalid), { status: 400 }, JSON.stringify(invalid));
  }
});

test('catalog cards, the listing page and the center profile ship Telegram and call launchers that need no session', async (t) => {
  const f = await fixture(t);
  for (const [path, markers] of [
    ['/catalog-view.js', ['https://t.me/', 'tel:', 'contactActions']],
    ['/listing', ['src="/catalog.js"']],
    ['/centers/bright-minds', ['id="center-telegram"', 'id="center-call"', 'rel="noopener noreferrer"']],
    ['/center-reviews.js', ['https://t.me/', 'tel:', '/api/catalog/listing']],
  ]) {
    const response = await guest(f, path);
    assert.equal(response.status, 200, path);
    const body = await response.text();
    for (const marker of markers) assert.ok(body.includes(marker), `${path} should contain ${marker}`);
  }
  // The pages' data sources are public routes: no cookie, no Origin header, still 200.
  for (const path of ['/api/catalog', '/api/listings']) assert.equal((await guest(f, path)).status, 200, path);
});

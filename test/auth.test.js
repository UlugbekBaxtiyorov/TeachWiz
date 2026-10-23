import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { createApp } from '../src/server.js';
import { openStore, digest } from '../src/store.js';
import { provisionAdmin } from '../src/create-admin.js';

const password = 'a long test passphrase 123';
const origin = 'http://localhost:3000';
const account = (email = 'student@example.test') => ({ email, password });
const cookieFrom = (response) => response.headers.get('set-cookie').split(';')[0];

async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'teachwiz-test-'));
  const filename = join(dir, 'app.sqlite');
  let time = Date.now();
  let store = openStore(filename);
  let app = await createApp({ store, origin, now: () => time, ...options });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => {
    await new Promise((resolve) => app.close(resolve));
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  let base = `http://127.0.0.1:${app.address().port}`;
  return {
    get store() { return store; },
    get base() { return base; },
    filename,
    async restart() {
      await new Promise((resolve) => app.close(resolve));
      store.close();
      store = openStore(filename);
      app = await createApp({ store, origin, now: () => time, ...options });
      app.listen(0, '127.0.0.1');
      await once(app, 'listening');
      base = `http://127.0.0.1:${app.address().port}`;
    },
    advance: (ms) => { time += ms; },
    post: (route, body = {}, cookie = '', headers = {}) => fetch(`${base}/api/auth/${route}`, {
      method: 'POST', headers: { Origin: options.origin || origin, 'Content-Type': 'application/json', Cookie: cookie, ...headers },
      body: JSON.stringify(body),
    }),
    session: (cookie = '') => fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } }),
  };
}

test('signup, session, login rotation and logout revoke the server-side session', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.session()).status, 401);
  const signup = await f.post('signup', account(' Student@Example.test '));
  assert.equal(signup.status, 201);
  assert.deepEqual(Object.keys(await signup.clone().json()), ['user']);
  const { user } = await signup.json();
  assert.equal(user.email, 'student@example.test');
  assert.equal(user.role, 'student');
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'role']);
  assert.match(signup.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=86400/);
  assert.equal(signup.headers.get('cache-control'), 'no-store');
  const first = cookieFrom(signup);
  assert.equal((await f.session(first)).status, 200);
  const login = await f.post('login', account(), first);
  assert.equal(login.status, 200);
  const second = cookieFrom(login);
  assert.notEqual(second, first);
  assert.equal((await f.session(first)).status, 401);
  assert.equal((await f.session(second)).status, 200);
  const logout = await f.post('logout', {}, second);
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.session(second)).status, 401);
  assert.equal((await f.post('logout', {}, second)).status, 204);
});

test('database stores unique salted hashes and hashed session tokens, never plaintext', async (t) => {
  const f = await fixture(t);
  const signup = await f.post('signup', account());
  await f.post('signup', account('another@example.test'));
  const one = f.store.findUser('student@example.test');
  const two = f.store.findUser('another@example.test');
  assert.match(one.password_hash, /^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.notEqual(one.password_hash, two.password_hash);
  assert.ok(!one.password_hash.includes(password));
  const rawToken = cookieFrom(signup).split('=')[1];
  const db = new DatabaseSync(f.filename, { readOnly: true });
  assert.ok(db.prepare('SELECT token_hash FROM sessions').all().some((row) => row.token_hash === digest(rawToken)));
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM sessions').all()).includes(rawToken));
  db.close();
  assert.equal((await stat(f.filename)).mode & 0o777, 0o600);
});

test('wrong passwords and unknown accounts return the same generic login error', async (t) => {
  const f = await fixture(t);
  await f.post('signup', account());
  const wrong = await f.post('login', { email: account().email, password: 'a different passphrase' });
  const unknown = await f.post('login', account('missing@example.test'));
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal(wrong.headers.get('set-cookie'), null);
});

test('concurrent duplicate signup creates exactly one account', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([f.post('signup', account()), f.post('signup', account('STUDENT@example.test'))]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const db = new DatabaseSync(f.filename, { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS total FROM users').get().total, 1);
  db.close();
});

test('rejects invalid input and client-controlled roles', async (t) => {
  const f = await fixture(t);
  for (const body of [null, [], {}, { email: 'bad', password }, { email: account().email, password: 'short' },
    { email: account().email, password: 'x'.repeat(129) }, { ...account(), role: 'admin' }, { ...account(), role: 'representative' }]) {
    assert.equal((await f.post('signup', body)).status, 400);
  }
  assert.equal(f.store.findUser(account().email), undefined);
});

test('CSRF checks protect all mutations, including logout; malformed requests fail safely', async (t) => {
  const f = await fixture(t);
  const signup = await f.post('signup', account());
  const cookie = cookieFrom(signup);
  for (const route of ['signup', 'login', 'logout']) {
    assert.equal((await f.post(route, account(), cookie, { Origin: 'https://attacker.test' })).status, 403);
    assert.equal((await f.post(route, account(), cookie, { Origin: '' })).status, 403);
  }
  assert.equal((await f.session(cookie)).status, 200);
  assert.equal((await f.post('login', account(), '', { 'Content-Type': 'text/plain' })).status, 415);
  const badJson = await fetch(`${f.base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(badJson.status, 400);
  assert.equal((await f.post('login', { ...account(), password: 'x'.repeat(9000) })).status, 413);
  assert.equal((await fetch(`${f.base}/api/auth/logout`)).status, 405);
  assert.equal((await fetch(`${f.base}/src/store.js`)).status, 404);
});

test('expired and fabricated sessions are rejected', async (t) => {
  const f = await fixture(t);
  const signup = await f.post('signup', account());
  const cookie = cookieFrom(signup);
  assert.equal((await f.session(`${cookie}; ${cookie}`)).status, 401);
  assert.equal((await f.session('teachwiz_session=' + 'f'.repeat(64))).status, 401);
  f.advance(86_400_000);
  assert.equal((await f.session(cookie)).status, 401);
});

test('users and sessions survive server restart, revocation remains effective', async (t) => {
  const f = await fixture(t);
  const response = await f.post('signup', account());
  const token = cookieFrom(response).split('=')[1];
  await f.restart();
  assert.equal((await f.session(cookieFrom(response))).status, 200);
  assert.equal(f.store.findUser(account().email).role, 'student');
  f.store.deleteSession(token);
  await f.restart();
  assert.equal((await f.session(cookieFrom(response))).status, 401);
});

test('production cookies are host-only, Secure and require HTTPS configuration', async (t) => {
  const f = await fixture(t, { secure: true, origin: 'https://teachwiz.example' });
  const signup = await f.post('signup', account());
  assert.equal(signup.status, 201);
  const cookie = signup.headers.get('set-cookie');
  assert.match(cookie, /^__Host-teachwiz_session=/);
  assert.match(cookie, /; Secure$/);
  assert.ok(!cookie.includes('Domain='));
  await assert.rejects(createApp({ store: f.store, origin, secure: true }), /Invalid APP_ORIGIN/);
});

test('per-account limits survive server restart and expire', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await f.post('login', account())).status, 401);
  const blocked = await f.post('login', account());
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '600');
  await f.restart();
  assert.equal((await f.post('login', account())).status, 429);
  f.advance(600_001);
  assert.equal((await f.post('login', account())).status, 401);
});

test('IP limits also block attempts with changing emails; forwarded headers are untrusted', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 30; i++) assert.equal((await f.post('login', { email: `user${i}@example.test`, password: 'short' })).status, 400);
  assert.equal((await f.post('login', account(), '', { 'X-Forwarded-For': '192.0.2.10' })).status, 429);
});

test('pre-provisioned admins can log in; provisioning never promotes an existing student', async (t) => {
  const f = await fixture(t);
  await f.post('signup', account());
  await assert.rejects(provisionAdmin(f.store, account().email, password), /already exists/);
  assert.equal(f.store.findUser(account().email).role, 'student');
  const cli = spawnSync(process.execPath, ['src/create-admin.js', 'admin@example.test'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, DATABASE_PATH: f.filename },
    input: password + '\n', encoding: 'utf8',
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(!cli.stdout.includes(password));
  const login = await f.post('login', account('admin@example.test'));
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.role, 'admin');
});

test('excess concurrent password work is rejected without creating an account', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([0, 1, 2].map((i) => f.post('signup', account(`load${i}@example.test`))));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 201, 503]);
  const rejected = results.findIndex((r) => r.status === 503);
  assert.equal(f.store.findUser(`load${rejected}@example.test`), undefined);
});

test('serves the responsive UI pages, sign-in page and self-hosted font', async (t) => {
  const app = await fixture(t);
  for (const [path, type, text] of [
    ['/', 'text/html', 'Find the right tutor or learning center'],
    ['/search', 'text/html', 'results in Tashkent'],
    ['/centers/bright-minds', 'text/html', 'Bright Minds Center'],
    ['/login', 'text/html', 'id="auth-form"'],
    ['/ui.css', 'text/css', '@font-face'],
    ['/fonts/manrope-latin.woff2', 'font/woff2', 'wOF2'],
  ]) {
    const response = await fetch(`${app.base}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type), path);
    assert.ok((await response.text()).includes(text), path);
    assert.match(response.headers.get('content-security-policy'), /font-src 'self'/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { requirePermission, permissionsFor } from '../src/access.js';
import { hashPassword } from '../src/password.js';
import { fixture, password, cookieFrom } from '../test-support/auth-fixture.js';

const roles = ['student', 'representative', 'admin'];
let passwordHash;
async function signIn(f, role) {
  passwordHash ??= await hashPassword(password);
  const email = `${role}@example.test`;
  f.store.createUser(email, passwordHash, role);
  const response = await f.post('login', { email, password });
  assert.equal(response.status, 200);
  return cookieFrom(response);
}
const workspace = (f, role, cookie = '', options = {}) => fetch(`${f.base}/api/workspaces/${role}`, {
  ...options, headers: { Cookie: cookie, ...options.headers },
});
function changeRole(f, from, to) {
  const db = new DatabaseSync(f.filename);
  try { db.prepare('UPDATE users SET role = ? WHERE email = ?').run(to, `${from}@example.test`); }
  finally { db.close(); }
}

test('direct API requests enforce the full guest/student/representative/admin matrix', async (t) => {
  const f = await fixture(t);
  const cookies = { guest: '' };
  for (const role of roles) cookies[role] = await signIn(f, role);
  for (const [role, cookie] of Object.entries(cookies)) {
    assert.equal((await f.session(cookie)).status, role === 'guest' ? 401 : 200);
    for (const target of roles) {
      const response = await workspace(f, target, cookie);
      const expected = role === 'guest' ? 401 : role === target ? 200 : 403;
      assert.equal(response.status, expected, `${role} -> ${target}`);
      const body = await response.json();
      if (expected !== 200) {
        assert.deepEqual(Object.keys(body), ['error']);
        continue;
      }
      assert.equal(body.workspace, role);
      assert.equal(body.user.email, `${role}@example.test`);
      assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'role']);
      if (role === 'admin') assert.deepEqual(body.accounts, { student: 1, representative: 1, admin: 1 });
      else assert.equal(body.accounts, undefined);
    }
  }
});

test('admin statistics count real accounts without exposing other users or credential hashes', async (t) => {
  const f = await fixture(t);
  const cookie = await signIn(f, 'admin');
  f.store.createUser('other@example.test', passwordHash, 'student');
  const response = await workspace(f, 'admin', cookie);
  const body = await response.json();
  assert.deepEqual(body.accounts, { student: 1, representative: 0, admin: 1 });
  assert.ok(!JSON.stringify(body).includes('other@example.test'));
  assert.ok(!JSON.stringify(body).includes(passwordHash));
});

test('client headers, query parameters, cookies and login bodies cannot grant roles', async (t) => {
  const f = await fixture(t);
  const student = await signIn(f, 'student');
  for (const options of [
    { headers: { 'X-Role': 'admin', 'X-User-Role': 'admin', Authorization: 'Bearer admin' } },
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HTTP-Method-Override': 'GET' }, body: JSON.stringify({ role: 'admin' }) },
    { headers: { Cookie: `${student}; role=admin; user=admin` } },
  ]) assert.equal((await workspace(f, 'admin', student, options)).status, 403);
  assert.equal((await fetch(`${f.base}/api/workspaces/admin?role=admin&userId=admin`, { headers: { Cookie: student } })).status, 403);
  assert.equal((await f.post('login', { email: 'student@example.test', password, role: 'admin' })).status, 400);
  assert.equal(f.store.findUser('student@example.test').role, 'student');
});

test('missing, malformed, fabricated and duplicated session cookies cannot access any workspace', async (t) => {
  const f = await fixture(t);
  const admin = await signIn(f, 'admin');
  for (const cookie of ['', 'teachwiz_session=admin', 'teachwiz_session=' + 'f'.repeat(64), `${admin}; ${admin}`]) {
    for (const role of roles) assert.equal((await workspace(f, role, cookie)).status, 401);
  }
});

test('expiry, logout and account deletion revoke access to protected APIs', async (t) => {
  const f = await fixture(t);
  let cookie = await signIn(f, 'admin');
  f.advance(86_400_001);
  assert.equal((await workspace(f, 'admin', cookie)).status, 401);
  cookie = await signIn(f, 'admin');
  await f.post('logout', {}, cookie);
  assert.equal((await workspace(f, 'admin', cookie)).status, 401);
  cookie = await signIn(f, 'admin');
  const db = new DatabaseSync(f.filename);
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('DELETE FROM users WHERE email = ?').run('admin@example.test');
  db.close();
  assert.equal((await workspace(f, 'admin', cookie)).status, 401);
});

test('the current database role takes effect immediately and survives server restart', async (t) => {
  const f = await fixture(t);
  const cookie = await signIn(f, 'admin');
  changeRole(f, 'admin', 'student');
  assert.equal((await workspace(f, 'admin', cookie)).status, 403);
  assert.equal((await workspace(f, 'student', cookie)).status, 200);
  assert.equal((await (await f.session(cookie)).json()).user.role, 'student');
  await f.restart();
  assert.equal((await workspace(f, 'admin', cookie)).status, 403);
  assert.equal((await workspace(f, 'student', cookie)).status, 200);
  changeRole(f, 'admin', 'representative');
  assert.equal((await workspace(f, 'student', cookie)).status, 403);
  assert.equal((await workspace(f, 'representative', cookie)).status, 200);
});

test('method changes and encoded or normalized paths do not bypass authorization', async (t) => {
  const f = await fixture(t);
  const student = await signIn(f, 'student');
  const admin = await signIn(f, 'admin');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    assert.equal((await workspace(f, 'admin', '', { method })).status, 401);
    assert.equal((await workspace(f, 'admin', student, { method })).status, 403);
    const response = await workspace(f, 'admin', admin, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  }
  assert.equal((await workspace(f, 'student/../admin', student)).status, 403);
  for (const path of ['%61dmin', 'admin/', 'admin/users', 'unknown']) {
    assert.equal((await workspace(f, path, student)).status, 404);
  }
});

test('unknown roles and missing or unknown policies fail closed, without mutable grants', () => {
  for (const role of ['guest', 'unknown', '__proto__', 'constructor', 'toString']) {
    const user = { id: 'untrusted', role };
    for (const permission of ['account:read', 'workspace:student', 'workspace:representative', 'workspace:admin']) {
      assert.throws(() => requirePermission(user, permission), { status: 403 });
    }
  }
  for (const permission of [undefined, null, '', 'workspace:unknown']) {
    assert.throws(() => requirePermission({ id: 'admin', role: 'admin' }, permission), { status: 403 });
  }
  const user = { id: 'student', role: 'student' };
  permissionsFor(user).push('workspace:admin');
  assert.throws(() => requirePermission(user, 'workspace:admin'), { status: 403 });
  assert.throws(() => requirePermission(null, 'account:read'), { status: 401 });
});

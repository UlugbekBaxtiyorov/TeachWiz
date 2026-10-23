import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openStore } from './store.js';
import { credentials, hashPassword, verifyPassword } from './password.js';
import { requirePermission } from './access.js';
import { applicationInput, reviewInput, listingInput } from './verification.js';

const SESSION_SECONDS = 86_400;
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/verification.js', ['verification.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

// Every API route has an explicit policy. Unknown routes never reach a handler.
const apiRoutes = new Map([
  ['/api/auth/signup', { method: 'POST', public: true }],
  ['/api/auth/login', { method: 'POST', public: true }],
  // Clearing an absent/expired session remains safe and idempotent for guests.
  ['/api/auth/logout', { method: 'POST', public: true }],
  ['/api/auth/session', { method: 'GET', permission: 'account:read' }],
  ['/api/workspaces/student', { method: 'GET', permission: 'workspace:student', workspace: 'student' }],
  ['/api/workspaces/representative', { method: 'GET', permission: 'workspace:representative', workspace: 'representative' }],
  ['/api/workspaces/admin', { method: 'GET', permission: 'workspace:admin', workspace: 'admin' }],
  ['/api/verification', { method: 'GET', permission: 'verification:own' }],
  ['/api/verification/submit', { method: 'POST', permission: 'verification:own' }],
  ['/api/admin/verification', { method: 'GET', permission: 'verification:review' }],
  ['/api/admin/verification/review', { method: 'POST', permission: 'verification:review' }],
  ['/api/listings', { method: 'GET', public: true }],
  ['/api/listings/mine', { method: 'GET', permission: 'listings:own' }],
  ['/api/listings/submit', { method: 'POST', permission: 'listings:own' }],
  ['/api/admin/listings', { method: 'GET', permission: 'listings:review' }],
  ['/api/admin/listings/review', { method: 'POST', permission: 'listings:review' }],
]);

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 8192) chunks.push(chunk);
  }
  if (size > 8192) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Send valid JSON.'), { status: 400 });
  }
}

export async function createApp({ store, origin, secure = false, now = Date.now }) {
  const configured = new URL(origin);
  if (configured.origin !== origin || !['http:', 'https:'].includes(configured.protocol)
      || (secure && configured.protocol !== 'https:')) throw new Error('Invalid APP_ORIGIN.');
  const cookieName = secure ? '__Host-teachwiz_session' : 'teachwiz_session';
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const tokenFrom = (req) => {
    const tokens = (req.headers.cookie || '').split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookieName}=`));
    if (tokens.length !== 1) return '';
    const token = tokens[0].slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : '';
  };
  // Unknown emails perform the same password derivation as existing users.
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  const assets = new Map(await Promise.all([...files].map(async ([url, [name, type]]) =>
    [url, { body: await readFile(new URL(`../public/${name}`, import.meta.url)), type }])));
  let activeHashes = 0;

  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && assets.has(path)) {
        const { body, type } = assets.get(path);
        res.writeHead(200, { 'Content-Type': type });
        return res.end(body);
      }
      const route = apiRoutes.get(path);
      if (!route) return json(res, 404, { error: 'Not found.' });
      // Resolve the current database role on every protected request. Client
      // headers, query parameters, bodies and stale browser state are ignored.
      let sessionUser;
      if (route.public !== true) {
        sessionUser = store.sessionUser(tokenFrom(req), now());
        requirePermission(sessionUser, route.permission);
      }
      if (req.method !== route.method) {
        res.setHeader('Allow', route.method);
        return json(res, 405, { error: `Use ${route.method}.` });
      }
      if (path === '/api/auth/session') return json(res, 200, { user: sessionUser });
      if (path === '/api/verification') return json(res, 200, {
        applications: store.applicationsFor(sessionUser.id), verified: store.isVerifiedRepresentative(sessionUser.id),
      });
      if (path === '/api/admin/verification') return json(res, 200, {
        applications: store.pendingApplications(), accounts: { student: 0, representative: 0, admin: 0, ...store.userCounts() },
      });
      if (path === '/api/listings') return json(res, 200, { listings: store.publishedListings() });
      if (path === '/api/listings/mine') return json(res, 200, { listings: store.listingsFor(sessionUser.id) });
      if (path === '/api/admin/listings') return json(res, 200, { listings: store.pendingListings() });
      if (route.workspace) {
        const result = { workspace: route.workspace, user: sessionUser };
        if (route.workspace === 'admin') {
          result.accounts = { student: 0, representative: 0, admin: 0, ...store.userCounts() };
        }
        return json(res, 200, result);
      }
      // Require a configured origin; never trust Host or forwarded headers for CSRF checks.
      if (req.headers.origin !== origin) return json(res, 403, { error: 'Request origin is not allowed.' });
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return json(res, 415, { error: 'Use application/json.' });
      }
      const body = await readJson(req);
      if (path === '/api/verification/submit') {
        return json(res, 201, { application: store.submitApplication(sessionUser.id, applicationInput(body), now()) });
      }
      if (path === '/api/admin/verification/review') {
        return json(res, 200, { application: store.reviewApplication(sessionUser.id, reviewInput(body), now()) });
      }
      if (path === '/api/listings/submit') {
        return json(res, 201, { listing: store.submitListing(sessionUser.id, listingInput(body), now()) });
      }
      if (path === '/api/admin/listings/review') {
        return json(res, 200, { listing: store.reviewListing(sessionUser.id, reviewInput(body), now()) });
      }
      if (path === '/api/auth/logout') {
        store.deleteSession(tokenFrom(req));
        res.setHeader('Set-Cookie', cookie('', 0));
        res.writeHead(204);
        return res.end();
      }
      const ipAllowed = store.allowAttempt(`ip:${req.socket.remoteAddress}`, 30, now());
      if (!ipAllowed) {
        res.setHeader('Retry-After', '600');
        return json(res, 429, { error: 'Too many attempts. Try again in 10 minutes.' });
      }
      let input;
      try { input = credentials(body); } catch (error) { return json(res, 400, { error: error.message }); }
      if (!store.allowAttempt(`email:${input.email}`, 10, now())) {
        res.setHeader('Retry-After', '600');
        return json(res, 429, { error: 'Too many attempts. Try again in 10 minutes.' });
      }
      // Bound expensive scrypt work rather than queueing unbounded allocations.
      if (activeHashes >= 2) return json(res, 503, { error: 'Sign-in is busy. Please try again shortly.' });
      activeHashes++;
      let user;
      try {
        if (path === '/api/auth/signup') {
          const passwordHash = await hashPassword(input.password);
          user = store.createUser(input.email, passwordHash, 'student', now());
          if (!user) return json(res, 409, { error: 'Unable to create an account with these details. Try signing in.' });
        } else {
          const found = store.findUser(input.email);
          const valid = await verifyPassword(input.password, found?.password_hash || dummyHash);
          if (!found || !valid) return json(res, 401, { error: 'Email or password is incorrect.' });
          user = { id: found.id, email: found.email, role: found.role };
        }
      } finally { activeHashes--; }
      const token = randomBytes(32).toString('hex');
      const time = now();
      store.createSession(token, user.id, time + SESSION_SECONDS * 1000, tokenFrom(req), time);
      res.setHeader('Set-Cookie', cookie(token, SESSION_SECONDS));
      return json(res, path.endsWith('signup') ? 201 : 200, { user });
    } catch (error) {
      json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const secure = process.env.NODE_ENV === 'production';
  if (secure && !process.env.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production.');
  const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
  const store = openStore(process.env.DATABASE_PATH);
  const server = await createApp({ store, origin, secure });
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`TeachWiz listening on ${origin}`));
  const shutdown = () => server.close(() => { store.close(); process.exit(0); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

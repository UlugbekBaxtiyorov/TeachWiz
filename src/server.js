import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openStore } from './store.js';
import { credentials, hashPassword, verifyPassword } from './password.js';

const SESSION_SECONDS = 86_400;
const files = new Map([
  ['/', ['home.html', 'text/html; charset=utf-8']],
  ['/search', ['search.html', 'text/html; charset=utf-8']],
  ['/centers/bright-minds', ['center.html', 'text/html; charset=utf-8']],
  ['/login', ['login.html', 'text/html; charset=utf-8']],
  ['/account', ['account.html', 'text/html; charset=utf-8']],
  ['/saved', ['saved.html', 'text/html; charset=utf-8']],
  ['/for-centers', ['for-centers.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/account.js', ['account.js', 'text/javascript; charset=utf-8']],
  ['/ui.css', ['ui.css', 'text/css; charset=utf-8']],
  ['/fonts/manrope-latin.woff2', ['fonts/manrope-latin.woff2', 'font/woff2']],
  ['/fonts/Manrope-OFL.txt', ['fonts/Manrope-OFL.txt', 'text/plain; charset=utf-8']],
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
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && assets.has(path)) {
        const { body, type } = assets.get(path);
        res.writeHead(200, { 'Content-Type': type });
        return res.end(body);
      }
      if (req.method === 'GET' && path === '/api/auth/session') {
        const user = store.sessionUser(tokenFrom(req), now());
        return json(res, user ? 200 : 401, user ? { user } : { error: 'Sign in to continue.' });
      }
      if (!['/api/auth/signup', '/api/auth/login', '/api/auth/logout'].includes(path)) {
        return json(res, 404, { error: 'Not found.' });
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'Use POST.' });
      }
      // Require a configured origin; never trust Host or forwarded headers for CSRF checks.
      if (req.headers.origin !== origin) return json(res, 403, { error: 'Request origin is not allowed.' });
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return json(res, 415, { error: 'Use application/json.' });
      }
      const body = await readJson(req);
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

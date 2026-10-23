import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { openStore } from '../src/store.js';

export const password = 'a long test passphrase 123';
export const origin = 'http://localhost:3000';
export const account = (email = 'student@example.test') => ({ email, password });
export const cookieFrom = (response) => response.headers.get('set-cookie').split(';')[0];

export async function fixture(t, options = {}) {
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

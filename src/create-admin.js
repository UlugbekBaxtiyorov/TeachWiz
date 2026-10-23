import { pathToFileURL } from 'node:url';
import { openStore } from './store.js';
import { credentials, hashPassword } from './password.js';

export async function provisionAdmin(store, email, password) {
  const input = credentials({ email, password });
  const user = store.createUser(input.email, await hashPassword(input.password), 'admin');
  if (!user) throw new Error('Account already exists; existing accounts are never promoted or overwritten.');
  return user;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let store;
  try {
    if (process.argv.length !== 3 || process.stdin.isTTY) {
      throw new Error('Usage: npm run admin:create -- admin@example.com (password via stdin).');
    }
    let password = '';
    for await (const chunk of process.stdin) {
      password += chunk.toString('utf8');
      if (password.length > 1024) throw new Error('Password input is too large.');
    }
    password = password.replace(/\r?\n$/, '');
    store = openStore(process.env.DATABASE_PATH);
    await provisionAdmin(store, process.argv[2], password);
    console.log('Admin account created.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { store?.close(); }
}

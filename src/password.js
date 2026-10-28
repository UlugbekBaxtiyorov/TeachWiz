import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export function credentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['email', 'password'].includes(key))) {
    throw new Error('Provide only email and password.');
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  if (typeof body.password !== 'string' || [...body.password].length < 8
      || [...body.password].length > 128) {
    throw new Error('Use a password with 8 to 128 characters.');
  }
  return { email, password: body.password };
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, options);
  return `scrypt-v1$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [version, salt, hash] = encoded.split('$');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt)
      || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual = await derive(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

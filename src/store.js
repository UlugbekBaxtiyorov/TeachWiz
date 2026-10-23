import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const digest = (value) => createHash('sha256').update(value).digest('hex');

export function openStore(filename = resolve('data/teachwiz.sqlite')) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) {
    db.close();
    throw new Error('Database schema is newer than this application.');
  }
  if (version === 0) db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'representative', 'admin')),
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX sessions_expiry ON sessions(expires_at);
    CREATE TABLE auth_limits (
      key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    PRAGMA user_version = 1;
    COMMIT;
  `);

  return {
    close: () => db.close(),
    userCounts: () => Object.fromEntries(db.prepare('SELECT role, count(*) AS count FROM users GROUP BY role').all()
      .map(({ role, count }) => [role, count])),
    findUser: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
    createUser(email, passwordHash, role = 'student', now = Date.now()) {
      const id = randomUUID();
      const result = db.prepare(`INSERT INTO users VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO NOTHING`).run(id, email, passwordHash, role, now);
      return result.changes ? { id, email, role } : null;
    },
    createSession(token, userId, expiresAt, previousToken, now) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (previousToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(previousToken));
        db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), userId, expiresAt);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    sessionUser(token, now) {
      return db.prepare(`SELECT u.id, u.email, u.role FROM sessions s
        JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
        .get(digest(token), now);
    },
    deleteSession: (token) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token)),
    allowAttempt(key, maxAttempts, now, windowMs = 600_000) {
      db.prepare('DELETE FROM auth_limits WHERE expires_at <= ?').run(now);
      const row = db.prepare(`INSERT INTO auth_limits VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`)
        .get(digest(key), now + windowMs);
      return row.attempts <= maxAttempts;
    },
  };
}

# TeachWiz

JavaScript backend and browser client. This first slice implements [KAN-8](https://teachwiz.atlassian.net/browse/KAN-8) / [GitHub #2](https://github.com/UlugbekBaxtiyorov/TeachWiz/issues/2): email sign-up, login, persisted sessions, logout, and pre-provisioned admins.

## Run locally

Use **Node.js 24.19 or later**. There are no third-party dependencies to install.

```sh
npm start
```

Open **http://localhost:3000**. Sign in at **/login**. Use that exact origin: write requests from a different origin (including `127.0.0.1`) are rejected. `npm run dev` restarts the server when source files change. `npm test` runs the HTTP integration tests against temporary databases using the actual password hashing parameters.

Users and sessions persist in `data/teachwiz.sqlite`, which is excluded from Git. The application uses Node's built-in `node:sqlite` API, which is a release-candidate API in Node 24; pin and test the Node version when deploying.

## Create an admin

Admins cannot register through the website. Provision an account before its first login, using the same `DATABASE_PATH` as the server. Passwords are read from stdin, never from command arguments. In **bash**, use:

```bash
read -r -s -p 'Admin password: ' admin_password
printf '\n'
printf '%s' "$admin_password" | npm run admin:create -- admin@example.com
unset admin_password
```

Use 15–128 characters. The command fails for an existing email and never changes its password or role. There are no seeded credentials. This creates an account; it does not verify ownership of the email address.

## API

All write requests require an `Origin` header equal to `APP_ORIGIN` and `Content-Type: application/json`. Requests are limited to 8 KiB. No cross-origin API access is enabled.

| Method | Endpoint | Request / behavior |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{ "email": "you@example.com", "password": "a long unique passphrase" }`; creates a student and session (201) |
| POST | `/api/auth/login` | Same input; creates a new session and revokes the session presented in the request (200) |
| GET | `/api/auth/session` | Returns `{ user: { id, email, role } }`, or 401 |
| POST | `/api/auth/logout` | `{}`; destroys the presented session and clears its cookie (204, idempotent) |

Emails are trimmed and treated case-insensitively. Passwords are preserved exactly (including spaces). Roles are read from the database and cannot be submitted during registration. Other devices retain their sessions when one device logs out.

## Security and deployment boundaries

- Passwords use asynchronous scrypt (`N=131072`, `r=8`, `p=1`), a random 16-byte salt, and constant-time hash comparison. This follows the [OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). At most two password derivations run concurrently (roughly 256 MiB combined); excess requests receive 503.
- Sessions use random 32-byte opaque tokens. Only SHA-256 token digests are stored. Sessions expire after 24 hours, survive restarts, rotate at login, and are revoked server-side on logout. Cookies use `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Auth attempts are limited to 10 per normalized email and 30 per socket IP in a 10-minute window. Limits are stored in SQLite and survive process restarts. Forwarded IP headers are deliberately ignored. Behind a reverse proxy, all requests share its IP limit: configure a trusted edge limiter before internet deployment rather than trusting arbitrary headers.
- The default listener is `127.0.0.1:3000`. `PORT`, `HOST`, `DATABASE_PATH`, and `APP_ORIGIN` configure the server. In production set `NODE_ENV=production` and an explicit HTTPS `APP_ORIGIN`; insecure production origins fail startup. Production cookies have `Secure` and the `__Host-` prefix. Terminate TLS at a trusted proxy.
- Keep the SQLite file on a persistent local disk, restrict service-account access, and back it up securely. Use one application instance for this MVP. Multi-host deployment requires shared storage and rate limiting designed for that topology.
- This ticket implements authentication. Endpoint role authorization is KAN-7. Representative verification is KAN-9. Email verification, password recovery, MFA, and production deployment are separate follow-ups.

## Layout

`src/server.js` serves the API and an explicit allowlist of static files. `src/store.js` owns the initial SQLite schema and persistence; `src/password.js` owns credentials and password hashing. `src/create-admin.js` is the local provisioning command. `public/` contains the browser client: the responsive home (`/`), search (`/search`) and center profile (`/centers/bright-minds`) pages from [KAN-13](https://teachwiz.atlassian.net/browse/KAN-13) share `ui.css` and a self-hosted Manrope font (SIL OFL, `public/fonts/Manrope-OFL.txt`), and `login.html` with `app.js` is the sign-in page; `test/` exercises the HTTP API, persistence, abuse controls, and admin flow.

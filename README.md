# TeachWiz

JavaScript backend and browser client. Implements [KAN-8](https://teachwiz.atlassian.net/browse/KAN-8) / [GitHub #2](https://github.com/UlugbekBaxtiyorov/TeachWiz/issues/2) authentication and [KAN-7](https://teachwiz.atlassian.net/browse/KAN-7) / [GitHub #1](https://github.com/UlugbekBaxtiyorov/TeachWiz/issues/1) role-based access.

## Run locally

Use **Node.js 24.19 or later**. There are no third-party dependencies to install.

```sh
npm start
```

Open **http://localhost:3000**. Use that exact origin: write requests from a different origin (including `127.0.0.1`) are rejected. `npm run dev` restarts the server when source files change. `npm test` runs the HTTP integration tests against temporary databases using the actual password hashing parameters.

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

## Role-based access

The server checks every protected API request against the current session and database role. Guests have no account or database role. Public registration always creates a student; admin accounts are provisioned by the CLI. Representative assignment belongs to the manual verification workflow in KAN-9; there is no public role-changing endpoint.

| API | Guest | Student | Representative | Admin |
| --- | --- | --- | --- | --- |
| `POST /api/auth/signup`, `/login`, `/logout` | Allowed | Allowed | Allowed | Allowed |
| `GET /api/auth/session` | 401 | Allowed | Allowed | Allowed |
| `GET /api/workspaces/student` | 401 | Allowed | 403 | 403 |
| `GET /api/workspaces/representative` | 401 | 403 | Allowed | 403 |
| `GET /api/workspaces/admin` | 401 | 403 | 403 | Allowed |

Workspace responses contain only the signed-in user's account; the admin workspace additionally reports aggregate account counts by role. The browser exposes the user's workspace and handles session expiry or a changed role. API checks also apply when the UI is bypassed, including unsupported HTTP methods. A missing, revoked, or expired session returns `401`; a valid session without the required permission returns `403`. Unknown routes return `404`, and authorized requests using unsupported methods return `405`.

Roles are independent personas. Admin does not implicitly impersonate a student or representative; administrative operations receive their own explicit permissions. This is the conservative implementation choice because KAN-7 does not specify role inheritance. Role changes take effect on the next request, without waiting for the session to expire. Client-supplied roles are never trusted. Unknown roles, unknown permissions and omitted policies deny access.

When adding an API, declare its method and permission in `apiRoutes` in `src/server.js`, add explicit grants in `src/access.js`, and test the full role matrix with direct requests. Use `public: true` only for deliberately public operations. Protected write handlers must retain the existing Origin/content-type checks. Business features must also enforce resource ownership and approval status; workspace access alone does not grant access to another representative's listings. Listing CRUD/moderation, reviews, and representative verification remain in their own tickets and have no placeholder API implementations here.

## Security and deployment boundaries

- Passwords use asynchronous scrypt (`N=131072`, `r=8`, `p=1`), a random 16-byte salt, and constant-time hash comparison. This follows the [OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). At most two password derivations run concurrently (roughly 256 MiB combined); excess requests receive 503.
- Sessions use random 32-byte opaque tokens. Only SHA-256 token digests are stored. Sessions expire after 24 hours, survive restarts, rotate at login, and are revoked server-side on logout. Cookies use `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Auth attempts are limited to 10 per normalized email and 30 per socket IP in a 10-minute window. Limits are stored in SQLite and survive process restarts. Forwarded IP headers are deliberately ignored. Behind a reverse proxy, all requests share its IP limit: configure a trusted edge limiter before internet deployment rather than trusting arbitrary headers.
- The default listener is `127.0.0.1:3000`. `PORT`, `HOST`, `DATABASE_PATH`, and `APP_ORIGIN` configure the server. In production set `NODE_ENV=production` and an explicit HTTPS `APP_ORIGIN`; insecure production origins fail startup. Production cookies have `Secure` and the `__Host-` prefix. Terminate TLS at a trusted proxy.
- Keep the SQLite file on a persistent local disk, restrict service-account access, and back it up securely. Use one application instance for this MVP. Multi-host deployment requires shared storage and rate limiting designed for that topology.
- Authentication and role-based API access are implemented. Representative verification is KAN-9. Email verification, password recovery, MFA, and production deployment are separate follow-ups.

## Layout

`src/server.js` serves the API and an explicit allowlist of static files. `src/access.js` defines role grants and denies unauthorized requests. `src/store.js` owns the initial SQLite schema and persistence; `src/password.js` owns credentials and password hashing. `src/create-admin.js` is the local provisioning command. `public/` contains the JavaScript client; `test/` exercises authentication, the four-role API matrix, role changes, spoofing, and revocation. `test-support/` holds the shared HTTP test fixture.

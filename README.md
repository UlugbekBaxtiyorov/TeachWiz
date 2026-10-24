# TeachWiz
![CI Pipeline](https://github.com/UlugbekBaxtiyorov/TeachWiz/actions/workflows/ci.yml/badge.svg)

**Team PATRIOTS - Roles & Responsibilities**
* **Akbar:** Team Lead & QA/DevOps (Sprint Planning, CI/CD, Testing)
* **Ulugbek:** Backend Engineer (Database Schema, REST API, Auth)
* **Shernur:** Frontend Engineer (UI Integration, API Binding)
* **Sabina:** UI/UX Designer (Wireframes, Responsive Layouts)

JavaScript backend and browser client. Implements [KAN-8](https://teachwiz.atlassian.net/browse/KAN-8) / [GitHub #2](https://github.com/UlugbekBaxtiyorov/TeachWiz/issues/2) authentication, [KAN-7](https://teachwiz.atlassian.net/browse/KAN-7) / [GitHub #1](https://github.com/UlugbekBaxtiyorov/TeachWiz/issues/1) role-based access, and [KAN-9](https://teachwiz.atlassian.net/browse/KAN-9) / [GitHub #3](https://github.com/UlugbekBaxtiyorov/TeachWiz/issues/3) representative verification.

## Run locally

Use **Node.js 24.19 or later**. There are no third-party dependencies to install.

```sh
npm start
```

Open **http://localhost:3000**. Sign in at **/login**; **/account** shows the account, its role-specific workspace and verification workflow. Use that exact origin: write requests from a different origin (including `127.0.0.1`) are rejected. `npm run dev` restarts the server when source files change. `npm test` runs the HTTP integration tests against temporary databases using the actual password hashing parameters.

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

The server checks every protected API request against the current session and database role. Guests have no account or database role. Public registration always creates a student; admin accounts are provisioned by the CLI. Only an admin's approval of a verification application grants representative access; there is no self-service role-changing endpoint.

| API | Guest | Student | Representative | Admin |
| --- | --- | --- | --- | --- |
| `POST /api/auth/signup`, `/login`, `/logout` | Allowed | Allowed | Allowed | Allowed |
| `GET /api/auth/session` | 401 | Allowed | Allowed | Allowed |
| `GET /api/workspaces/student` | 401 | Allowed | 403 | 403 |
| `GET /api/workspaces/representative` | 401 | 403 | Allowed | 403 |
| `GET /api/workspaces/admin` | 401 | 403 | 403 | Allowed |

Workspace responses contain only the signed-in user's account; the admin workspace additionally reports aggregate account counts by role. The browser exposes the user's workspace and handles session expiry or a changed role. API checks also apply when the UI is bypassed, including unsupported HTTP methods. A missing, revoked, or expired session returns `401`; a valid session without the required permission returns `403`. Unknown routes return `404`, and authorized requests using unsupported methods return `405`.

Roles are independent personas. Admin does not implicitly impersonate a student or representative; administrative operations receive their own explicit permissions. This is the conservative implementation choice because KAN-7 does not specify role inheritance. Role changes take effect on the next request, without waiting for the session to expire. Client-supplied roles are never trusted. Unknown roles, unknown permissions and omitted policies deny access.

When adding an API, declare its method and permission in `apiRoutes` in `src/server.js`, add explicit grants in `src/access.js`, and test the full role matrix with direct requests. Use `public: true` only for deliberately public operations. Protected write handlers must retain the existing Origin/content-type checks. Business features must also enforce resource ownership and approval status; workspace access alone does not grant access to another representative's listings.

## Representative verification and publication

Sign in and go to **/account**. The verification workspace opens automatically. Students and existing representatives can apply as a **tutor** or **learning center**, supplying a provider name, contact details and supporting information. The administrator uses their own workspace to review the submitted details and independently check the evidence. There is no automatic identity or email verification, and the application does not download submitted URLs or accept identity-document uploads.

The account UI uses the responsive design boards’ Manrope typography, green/cream palette, rounded cards and mobile navigation. It shows application progress, submitted details, review notes, resubmission and application history. Admins see separate representative and listing queues, with listing approval disabled until verification. The boards do not include a dedicated verification screen; this flow extends their existing visual language.

Applications follow `pending → approved` or `pending → rejected`. Pending applicants retain their existing role. Approval and the assignment of the representative role happen in one database transaction, and existing sessions see the role on their next request. Rejection requires a reason, leaves the role unchanged, and allows a new application. Previous details, decisions, reviewer account IDs, timestamps and reasons remain stored. Each account can have only one pending or approved application; duplicate submissions, stale decisions and competing reviews return `409`. Admins cannot review their own applications or listings. Applicants can see only their own submissions, while the admin queue includes contact details and supporting information.

**Publication requires two approvals:** an approved representative application and an approved listing, together with the owner's current representative role. A raw role assignment never counts as verification. Applicants can submit private title/description listings while verification is pending. An admin cannot approve a listing until the representative is verified; approving a representative does not publish their pending listings. Rejected listings remain private, with the reason visible to their owner. An applicant may submit a corrected listing as a new submission. The public API checks the current role and both approval records on every read, including after a restart, and never returns applicant email, contact details, evidence or review notes.

This ticket includes a minimal listing submission/moderation flow to enforce the publication boundary. Full profile fields (pricing, schedule, address, contact actions), listing editing/deletion, search and the public browsing UI remain in the listing-management/search tickets. There is no verification revocation UI in this ticket. Do not directly assign representative roles to bypass verification.

| Method | Endpoint | Access / request |
| --- | --- | --- |
| GET | `/api/verification` | Student/representative: own application history and current `verified` flag |
| POST | `/api/verification/submit` | Student/representative: `{ "providerType": "tutor", "providerName": "Example tutor", "contactDetails": "Public contact details", "evidence": "Supporting information" }`; `providerType` also accepts `learning_center` |
| GET | `/api/admin/verification` | Admin: oldest 100 pending applications |
| POST | `/api/admin/verification/review` | Admin: `{ "id": "application UUID", "decision": "approved", "reason": "Optional note" }`; `rejected` requires a nonblank reason |
| GET | `/api/listings/mine` | Student/representative: own listings, decision notes and actual `published` state |
| POST | `/api/listings/submit` | Student/representative with an application: `{ "title": "Algebra lessons", "description": "Lesson details" }`; always private and pending |
| GET | `/api/admin/listings` | Admin: oldest 100 pending listings, including representative verification status |
| POST | `/api/admin/listings/review` | Admin: same review input as applications, using a listing UUID |
| GET | `/api/listings` | Public: latest 100 publishable listings with provider name/type and title/description only |

Unknown input fields, including owner IDs, roles and approval states, are rejected. The session identifies the applicant and reviewer. All new writes use the same Origin, JSON content-type and 8 KiB request-size checks as authentication. Queue refresh loads the next entries after reviews; the UI reports when a queue reaches the 100-entry limit. Use **Refresh status** to reload applications and listings; account access is refreshed when the server reports a role change.

SQLite schema version 2 is applied automatically at startup to fresh and version 1 databases without replacing users, password hashes, sessions or rate limits. Back up the database before upgrading. The previous binary rejects version 2, so rollback requires the matching database backup rather than running old code against the upgraded database.

## Security and deployment boundaries

- Passwords use asynchronous scrypt (`N=131072`, `r=8`, `p=1`), a random 16-byte salt, and constant-time hash comparison. This follows the [OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). At most two password derivations run concurrently (roughly 256 MiB combined); excess requests receive 503.
- Sessions use random 32-byte opaque tokens. Only SHA-256 token digests are stored. Sessions expire after 24 hours, survive restarts, rotate at login, and are revoked server-side on logout. Cookies use `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Auth attempts are limited to 10 per normalized email and 30 per socket IP in a 10-minute window. Limits are stored in SQLite and survive process restarts. Forwarded IP headers are deliberately ignored. Behind a reverse proxy, all requests share its IP limit: configure a trusted edge limiter before internet deployment rather than trusting arbitrary headers.
- The default listener is `127.0.0.1:3000`. `PORT`, `HOST`, `DATABASE_PATH`, and `APP_ORIGIN` configure the server. In production set `NODE_ENV=production` and an explicit HTTPS `APP_ORIGIN`; insecure production origins fail startup. Production cookies have `Secure` and the `__Host-` prefix. Terminate TLS at a trusted proxy.
- Keep the SQLite file on a persistent local disk, restrict service-account access, and back it up securely. Use one application instance for this MVP. Multi-host deployment requires shared storage and rate limiting designed for that topology.
- Authentication, role-based API access and manual representative verification are implemented. Email verification, password recovery, MFA, and production deployment are separate follow-ups.

## Layout

`src/server.js` serves the API and an explicit allowlist of static files. `src/access.js` defines role grants. `src/store.js` owns SQLite schema migrations and account persistence; `src/provider-store.js` handles transactional verification and publication, and `src/verification.js` validates those inputs. `src/password.js` owns credentials and password hashing. `src/create-admin.js` is the local provisioning command.

`public/` contains the responsive home (`/`), search (`/search`) and center profile (`/centers/bright-minds`) pages from [KAN-13](https://teachwiz.atlassian.net/browse/KAN-13). These pages, `/saved`, `/for-centers`, `/login` (`login.html` with `app.js`) and `/account` (`account.html` with `account.js`) share `ui.css` and a self-hosted Manrope font (SIL OFL, `public/fonts/Manrope-OFL.txt`). The account page exposes role-specific workspaces, admin totals and the verification/moderation UI (`verification.js`). `test/` exercises authentication, authorization, verification, publication, competing reviews, migration and UI asset serving. `test-support/` holds the shared HTTP test fixture.

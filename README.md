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

Use 8–128 characters. The command fails for an existing email and never changes its password or role. There are no seeded credentials. This creates an account; it does not verify ownership of the email address.

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

SQLite schema version 4 is applied automatically at startup to fresh and version 1/2/3 databases without replacing users, password hashes, sessions or rate limits. Back up the database before upgrading. The previous binary rejects version 4, so rollback requires the matching database backup rather than running old code against the upgraded database.

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

## Subject and keyword search (KAN-10)

`/search` and the home-page catalog use approved data from SQLite. `GET /api/catalog` searches provider names, listing titles, subjects and the standardized IELTS, SAT and Presidential School preparation categories. Matching is case-insensitive (including Cyrillic), normalizes Unicode/spacing and Uzbek apostrophe variants, and requires every search word to match. SQL parameters and literal substring matching keep `%`, `_` and quotes literal. Verification contact details and private review notes are never searchable or returned.

Query parameters: `q` (up to 150 characters), repeatable `category` (`ielts`, `sat`, `presidential_school`, OR within this group), `type` (`tutors`, `centers`, `courses`), `sort` (`relevance`, `newest`), and `page` (1–99999). Different filters combine with AND. Courses includes all listings. Responses contain `listings`, `total`, `page`, `pageSize` (24), and `pages`. Filtering precedes pagination across the entire approved catalog. Relevance prioritizes a matching provider name, then submission time with a stable tie-breaker. Invalid or unknown filters return 400.

`GET /api/catalog/listing?id=<UUID>` and `/listing?id=<UUID>` show a single public listing. Both catalog APIs enforce the same current-role and two-approval publication checks as `/api/listings`; unavailable/private details return 404. The existing `/api/listings` contract remains compatible.

Listings accept optional `subjects` (up to 12 names, 60 characters each) and `preparationCategories` (the three canonical keys). New UI submissions collect subjects; older API clients and migrated listings default to empty arrays. Owners and admins see these fields before review. Schema v3 adds these columns without rewriting existing records. Back up the database before upgrading; older binaries cannot open v3.

The responsive search, cards and details extend the supplied design boards. URLs preserve search state for sharing, reload and Back/Forward; mobile filters expand in place. Results, empty states and errors use live-region announcements, request cancellation prevents stale results, and all user content is rendered as text. The home page now shows real approved listings instead of static ratings and distances.

Run `npm run demo` to view the complete app with synthetic listings and accounts at http://localhost:3113. This uses only in-memory SQLite and never opens the persistent database. Sign in as `student@example.test`, `provider1@example.test` or `admin@example.test` with demo-only password `Teachwiz demo passphrase 123`. Restarting resets the examples.

## Multi-criteria filters (KAN-15)

The same `/api/catalog` endpoint accepts `city` and `district` (exact, case-insensitive, up to 80 characters), repeatable `level` (`beginner`, `intermediate`, `advanced`, `all_levels`), `language` (`uz`, `ru`, `en`) and `mode` (`in_person`, `online`), inclusive `minFee` / `maxFee` (whole UZS, 0–100000000), and `minRating` (0–5, up to two decimal places). Values inside a repeated group use OR; groups combine with AND and keyword search. An `all_levels` listing matches each skill level. City/district options are derived only from currently published listings; changing city clears the selected district.

Only an explicitly entered `monthlyFee` is used for price filtering; course/hourly/per-lesson fees are never converted. A zero fee is valid. Missing fees are `null`, excluded by any price bound and sorted last. The additional sort values are `price_asc`, `price_desc` and `rating`, with deterministic submission-time ordering for ties. Unknown/invalid filters and reversed fee ranges return 400.

Schema v4 adds location, level, monthly fee, instruction languages and delivery modes to listings, plus `provider_rating_summaries`. Legacy rows retain unknown/empty values instead of invented defaults. All new fields are visible in representative submissions and admin review; they do not bypass publication checks. Optional API fields preserve compatibility with earlier clients; new UI submissions require subjects, a level and at least one language/mode.

Ratings are provider-level aggregates of 1–5 star reviews. Search uses the unrounded average; unrated providers have `rating: null`, `reviewCount: 0` and do not satisfy a rating threshold. Every review accepted by `POST /api/providers/{id}/reviews` (MVP-09) updates `provider_rating_summaries` in the same transaction, so catalog ratings always equal the stored reviews. `store.recordRatingSummary(userId, {scoreTotal, reviewCount})` remains a trusted backend seam (used by tests and the demo) and has no HTTP write route. Representatives cannot set rating/approval fields through listing submission. Demo aggregates are synthetic, not real reviews.

The design-aligned sidebar, mobile quick filters, removable filter chips, cards and public listing details display the same stored data. Use `npm run demo` to inspect both tickets together with authentication, verification and admin review. The search PR depends on #21; the filters PR depends on the search PR.

# TeachWiz — Requirements Traceability Matrix (RTM)

**Project:** TeachWiz  
**Repository:** [UlugbekBaxtiyorov/TeachWiz](https://github.com/UlugbekBaxtiyorov/TeachWiz)  
**Purpose:** Map each tracked requirement to its Jira issue, implementation location, and verification evidence.

> Jira is used to track requirements and work items. This document is the RTM because it explicitly connects each requirement to implementation and verification evidence.

## Traceability matrix

| Requirement | Requirement / feature | Jira issue | Implementation / evidence | Verification method | Status |
|---|---|---|---|---|---|
| REQ-07 | Role-based access control | KAN-7 | `src/access.js`, `src/server.js`, account UI and authorization tests | Authorization and role-permission tests | Implemented; verify against latest CI |
| REQ-08 | User authentication | KAN-8 | Server authentication/session logic, password utilities, login UI and authentication tests | Authentication integration tests | Implemented; verify against latest CI |
| REQ-09 | Representative verification | KAN-9 | Provider store, verification logic/UI and related tests | Verification and publication-boundary tests | Implemented; verify against latest CI |
| REQ-10 | Subject and keyword search | KAN-10 | Server search/catalog logic, search UI and catalog tests | Search integration tests | Implemented; verify against latest CI |
| REQ-11 | Listing management | KAN-11 | Provider/listing store, account UI and listing tests | Listing submission and moderation tests | Implemented; verify against latest CI |
| REQ-13 | Responsive UI / core pages | KAN-13 | Public HTML pages, shared styles and frontend scripts | UI/integration tests plus manual desktop/tablet checks | Implemented; manual responsive check recommended |
| REQ-14 | Ratings and reviews | KAN-17 | Provider store, `public/center-reviews.js`, `public/center.html`, `test/reviews.test.js` | Review tests; previously reported 38-test CI run passed | Implemented; previously CI verified |
| REQ-15 | Multi-criteria filters | KAN-15 | Server catalog/filter logic, search UI and catalog tests | Filter integration tests | Implemented; verify against latest CI |
| REQ-16 | Multi-language UI (Uzbek, Russian, English) | KAN-14 | `public/i18n.js`, `public/locales/en.json`, `ru.json`, `uz.json`, server HTML injection and `test/i18n.test.js` | Locale dictionary tests, language-switch/persistence tests and manual page-navigation check | Implemented; final CI/manual verification pending |
| REQ-17 | Sorting / rating-aware catalog | KAN-16 | Server catalog sorting logic, search UI and catalog tests | Sorting and stable-ordering tests | Implemented; verify against latest CI |
| REQ-18 | CI/CD and test automation | KAN-18 | `.github/workflows/ci.yml`, test suite and package scripts | GitHub Actions workflow on pushes and pull requests | Workflow present; verify latest run |

## How to read this matrix

- **Requirement:** requirement identifier used for project traceability.
- **Jira issue:** the corresponding work item in Jira.
- **Implementation / evidence:** source files and tests associated with the requirement.
- **Verification method:** how the implementation is checked.
- **Status:** implementation and verification state based on the project information available when this document was prepared.

## Coverage summary

The matrix covers authentication, authorization, representative verification, search, listing management, responsive UI, ratings and reviews, filtering, multilingual UI, sorting, and CI/test automation.

## Verification notes

1. A source file existing does not by itself prove that a requirement works end-to-end. Run the relevant tests and perform manual checks where indicated.
2. The multilingual UI implementation was added to ensure the language module is loaded across HTML pages and that Uzbek, Russian, and English locale dictionaries are available. Confirm the latest GitHub Actions run and manually test switching languages while navigating between pages before marking REQ-16 fully verified.
3. The ratings/reviews implementation previously passed a 38-test CI run. Re-run the current `main` branch workflow if a fresh verification record is required.
4. Update the status column whenever Jira scope, implementation, or test evidence changes.

## Suggested project report wording

> The TeachWiz Requirements Traceability Matrix links requirements tracked in Jira to their implementation files and verification methods in GitHub. This provides traceability from each requirement through development to testing; Jira is the tracking system, while this document is the RTM.

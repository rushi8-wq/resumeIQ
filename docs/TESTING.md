# Testing

## Isolated integration database

Tests use real MongoDB persistence, not a memory substitute. They delete only `resumeiq_test` and refuse any other database name. Default test URI is mongodb://127.0.0.1:27018/resumeiq_test. Keep it separate from development data.

```sh
# Option A: installed MongoDB; leave process running in its terminal.
mkdir -p /tmp/resumeiq-test-db
mongod --dbpath /tmp/resumeiq-test-db --bind_ip 127.0.0.1 --port 27018
# Option B instead of A:
docker run --rm -p 127.0.0.1:27018:27017 mongo:8
# In another terminal:
npm test
npm run build
```

Auth integration coverage: database readiness, hashed persistence and safe profile output, HttpOnly cookies, anonymous access denial, CSRF/origin rejection, strict validation/mass assignment, bcrypt byte limit, case-insensitive uniqueness, fresh-client login, invalid password, logout token revocation, expired sessions, forged JWT, no-store responses and malformed JSON. Config tests reject missing secrets/insecure production settings.

## Browser journeys

```sh
cp -n server/.env.example server/.env
# Configure development MongoDB and random JWT_SECRET.
npx playwright install chromium
npm run test:e2e
```

Playwright starts dedicated fixture/dev servers and refuses to reuse an existing server. Browser tests use only the dedicated resumeiq_e2e database. Journey covers register→dashboard→reload→logout→login→theme and public/dashboard overflow at 320, 768, 1024 and 1440px. Screenshots are saved to docs/screenshots. CI uses a separate resumeiq_e2e database. Test accounts are retained locally for investigation, not automatically deleted from a developer's database.

Later milestones add parsing fixtures (PDF/DOCX/scans/zip bombs/oversized files), token normalization and scoring invariants, cross-user access checks, mocked AI and prompt-injection/evidence tests, job deduplication and full analysis→optimization→discovery E2E coverage. These suites have been implemented in the milestone sections below.

## Manual UI review

Inspect landing, login, register and workspace at 320, 768, 1024 and 1440px. Tab through fields/actions, confirm visible focus, show/hide password, native validation, meaningful server errors, loading states and dashboard light/dark theme. Browser automation may require a browser installation; if unavailable report the limit separately from passing API/build checks.

## Local result — November 2, 2026

9/9 backend/config tests passed against the installed MongoDB instance, 2/2 Chromium journeys passed, and the Vite production build passed. npm install audit reported 0 vulnerabilities. Screenshots of the landing page and empty dashboard were captured and reviewed. Cloud configuration files have not been exercised against deployed infrastructure.

## Milestone 2 verification

The suite now includes real generated PDF and DOCX fixtures (`server/test/fixtures/documents.js`), rules/normalization tests, worker parser tests and MongoDB-backed resume CRUD/security tests. Run `npm test` with the existing isolated database on port 27018. New coverage includes the inclusive 5 MiB boundary, oversized/empty/forged/malformed files, strict XML/macro/expanded ZIP rejection, sparse/scanned warnings, owner isolation, CSRF on upload/PATCH/DELETE, strict update validation, large corrections and stale-version rejection. The prior authentication/config suite remains enabled (its feature availability expectation now correctly reports resumeUpload=true).

For browser tests, stop any existing dev server so Playwright launches against a dedicated database:

```sh
MONGODB_URI=mongodb://127.0.0.1:27018/resumeiq_e2e \
CLIENT_URL=http://127.0.0.1:5173 NODE_ENV=test npm run test:e2e
npm run build
```

Use the configured development JWT secret or supply a test-only JWT_SECRET of at least 32 characters. Browser tests create unique test accounts; the resume journey deletes its own uploaded records. It tests file selection, drag-and-drop, invalid/oversized errors, parsing, correction persistence across reload, skill normalization, library visibility, dashboard count, explicit delete confirmation, and 320/768/1024/1440px overflow. Existing login and theme journeys remain enabled. Screenshots: docs/screenshots/resume-preview.png, landing.png, dashboard.png.

Local Milestone 2 result: **25/25 backend/unit/integration tests, 3/3 Chromium journeys, and production frontend build passed**. npm installation audit reported zero known vulnerabilities. Tests use Node 25 on this workstation; CI/Docker target Node 22. Cloud configuration and container builds were not executed in this milestone. Later matching/AI/provider tests remain deferred.

## Milestone 3 verification — November 3, 2026

The complete backend suite contains **48 passing tests**, including all Milestone 1/2 tests. New fixtures are in `server/test/fixtures/matching.js`; unit tests cover normalized/exact skills, missing evidence, TF-IDF properties, score math/redistribution/bounds, determinism, missing education/experience, explicit years, qualification alternatives, credentials, malformed input, consent, mocked embeddings/vector validation and local fallback. MongoDB integration tests cover creation/detail/history/jobs/statistics, latest saved corrections and immutable prior snapshots, cross-user access, CSRF/auth/validation, analysis deletion, resume cascade deletion, and in-flight edit conflicts.

All **4 Chromium journeys** passed, including prior authentication and resume workflows. `e2e/matching.spec.js` registers a test account, handles no-resume state, uploads a genuine DOCX, saves corrected fields, selects the resume, pastes requirements, analyzes, validates fallback/gaps, reloads, checks responsive overflow at 320/768/1024/1440px, reopens history and deletes its own test records. The result screenshot is `docs/screenshots/match-analysis.png`. Production frontend build passed; Recharts score visualization is loaded separately from the initial application bundle.

```sh
# Isolated MongoDB on port 27018, as above:
npm test
# Stop an existing dev server first; use the dedicated E2E database.
MONGODB_URI=mongodb://127.0.0.1:27018/resumeiq_e2e \
CLIENT_URL=http://127.0.0.1:5173 NODE_ENV=test EMBEDDING_PROVIDER=disabled npm run test:e2e
npm run build
```

External providers are replaced by test adapters/fetch mocks; no live API keys, paid calls or real third-party resume transmission are used. Local tests ran on the workstation's Node 25; CI remains Node 22. The install audit reported zero known vulnerabilities. Container/cloud builds and a live embedding-provider smoke test were not performed; do not infer those from local success.

## Milestone 4 verification

All **64 backend/unit/integration tests** passed, including prior milestone suites. New `ai.test.js` covers strict response schemas, independently enforced classifications, evidence references, source-pinned requirement citations, conservative aliases, invented claims/numbers/qualifiers, factual confirmation, input minimization, provider model selection/caching and sanitized errors. `ai-api.test.js` exercises real MongoDB persistence, consent, accept/reject/revert, previews/approved saves, unchanged originals, version history/deletion, cross-user ownership, CSRF, daily quota, stale revisions, malformed provider output, unavailable provider and cascade cleanup. External generation is mocked in automated tests.

All **five Chromium journeys** passed, including `optimization.spec.js`: create a real resume/match, enforce consent, generate classified test suggestions, reject a gap, edit/accept a bullet, calculate, approve/save, reload history, test 320/768/1024/1440px overflow, revert decisions and delete saved versions. Existing authentication, matching and resume journeys remain active. The E2E server is `server/test/e2e-server.js`, not production startup: it requires a dedicated `resumeiq_e2e` database and injects a clearly named fixture provider. Production source/Docker do not import it, and real keys are not used. Two browser workers respect the existing two-upload concurrency cap. Test screenshots display fixture-model intentionally.

```sh
# Isolated MongoDB on 27018, as documented above:
npm test
# Stop any existing servers on 4000/5173 before E2E; fixtures are automatic.
MONGODB_URI=mongodb://127.0.0.1:27018/resumeiq_e2e npm run test:e2e
npm run build
```

Playwright now starts a dedicated test API and the regular Vite client separately; it refuses to reuse existing dev servers so a test cannot accidentally spend a real user's Groq quota. Test accounts persist for investigation; generated resume/analysis/version fixtures are deleted by successful journeys.

Live checks also verified the user's privately configured Groq key, model discovery and real JSON generation using **fictional data only**. openai/gpt-oss-20b returned keyword guidance and a supported edit from “Built a React app” to “Built a React application.” No personal resume/job content was sent during smoke tests. Live calls are distinct from mocked regression tests. Production build and install audit (zero known vulnerabilities) passed. Container/cloud deployment and a live embedding-based optimization comparison were not tested.

## Milestone 5 verification — November 3, 2026

New unit tests in `server/test/jobs.test.js` exercise source normalization, HTML conversion, canonical source URLs, missing metadata, invalid envelopes/documents, cursor traversal, timeouts/size bounds and nonsoftware relevance. `jobs-api.test.js` runs against real isolated MongoDB and covers deduplication, exact consistency with M3 scoring, ranking, filters/pagination, recommendation-cache invalidation, persistent hourly sync leases under concurrency/restart, provider outages/stale fallback, expiry, bookmark persistence/idempotency, authentication/CSRF/validation, cross-user access denial and deletion cascades.

`e2e/jobs.spec.js` covers resume selection, ranked results, location filtering, matched/missing skill display, detail/component/source links, save/reload/remove, and overflow at 320/768/1024/1440px. Browser sources are explicitly labeled **Automated-test fixtures**. The test-only server injects the job adapter; no production fallback returns synthetic jobs. Existing authentication, parsing, matching and Groq journeys remain enabled.

Run with MongoDB on port27018:

```sh
npm test
npm run test:e2e
npm run build
```

No real provider key is needed for automated tests. Unit/API tests guard `resumeiq_test`; Playwright guards `resumeiq_e2e`. Do not point these commands at a development or production database. Tests create unique browser accounts; fixture jobs/test data remain in the dedicated E2E database for inspection. The production entrypoint does not import test fixtures.

Live public-provider verification is separate: the actual Jobicy adapter fetched and normalized 300 listings (zero skipped) on November3,2026. Metadata and two original URLs are in `docs/examples/live-job-provider.json`. No real resume was transmitted. This confirms the API/normalization boundary, not each employer’s current availability. Provider terms, limits and scope are documented in `JOB_PROVIDER_INTEGRATION.md`. No public deployment or cloud build was performed.

Final local result: **79/79 backend/unit/integration tests, 6/6 Chromium journeys, and the production Vite build passed**. All prior Milestone 1–4 tests remain enabled. Responsive discovery overflow checks passed at 320, 768, 1024 and 1440 pixels. Tests ran on the workstation’s Node 25; CI targets Node 22.

## AI suggestion failure regression — November 11, 2026

All **86 backend tests**, **6 Chromium journeys**, and the production build passed. The new fixture `server/test/fixtures/groq-invalid-target.json` contains a real provider response to fictional input, showing the invalid `skills` edit target; it contains no actual user's resume. Unit tests verify strict target-ID schema/normalization, explicit source citations, empty results, invalid JSON/incomplete responses, error categories and diagnostic redaction. API tests verify safe 502 messages, no persistence of invalid output, empty keyword success versus invalid empty bullet output, quotas and provider failure categories. Existing evidence, invented-claim, consent, ownership and Milestones 1–5 tests remain enabled.

The optimization Chromium journey first intercepts one request with a controlled 502, asserts the useful error is shown, consent remains checked and no fake cards appear, then retries against the fixture API and completes edit/accept/reject/revert, preview, saved versions and responsive checks. It is not a live Groq browser test. The separate opt-in `node server/test/groq-live-check.mjs --live` verified real Groq model access and authenticated suggestion/bullet/edit/recalculation APIs with fictional records only. Its safe summary is `docs/examples/groq-fix-live-check.json`: keywords 201, six suggestions; selected bullet 201; edit/accept 200; recalculation 200, 63.08% to 63.08%, with unchanged algorithm version. No increase was manufactured.

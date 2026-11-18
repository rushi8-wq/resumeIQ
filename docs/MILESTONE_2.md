# Milestone 2 delivery

Resume upload, parsing, structured review and owner-scoped CRUD extend the working Milestone 1 app. No matching, AI suggestions or job feed functionality was introduced.

## Changed files

Backend additions:

- `server/src/models/Resume.js`: persisted owner-linked data, timestamps, status and revision counter.
- `server/src/routes/resumes.js`: authenticated upload/list/detail/update/delete, upload limits and concurrency guard.
- `server/src/services/parsing/{structured,parseDocument,documentWorker,inspectDocx}.js`: rule extraction, skill aliases, bounded worker parsing, PDF/DOCX and ZIP/XML validation.
- `server/src/validation/resume.js`: strict correction request validation.

Backend integration changes:

- `server/src/app.js`: resume routing, 256 KiB JSON limit only for resume routes, real owner-scoped dashboard resume count, milestone/feature reporting.
- `server/src/index.js`: initialize Resume indexes at startup.
- `server/.env.example`: align development CLIENT_URL with Vite's 127.0.0.1 preview URL.
- `server/package.json`, root `package-lock.json`: upload/parser dependencies and genuine fixture-generation dev dependencies.
- Existing JWT, session, authentication routes, CSRF implementation, MongoDB connection and User/Session models were reused unchanged.

Frontend additions:

- `client/src/components/WorkspaceLayout.jsx`: reuse the existing shell/navigation/theme/sign-out across dashboard and resume routes; add accessible mobile navigation.
- `client/src/components/resume/{ResumeUpload,ResumeEditor,ResumeSource}.jsx`: drag/drop and file selection, progress, editable fields and read-only source/delete panel.
- `client/src/pages/{Resumes,ResumePreview}.jsx`: library pagination, saved details, corrections and delete flow.

Frontend integration changes:

- `client/src/main.jsx`: protected nested resume routes.
- `client/src/pages/Dashboard.jsx`: shared shell, active upload link and real resume count.
- `client/src/pages/Landing.jsx`: reflect available resume upload/review.
- `client/src/lib/api.js`: preserve the existing CSRF fetch and support multipart progress plus PATCH/DELETE options.
- `client/src/styles.css`: responsive resume library/editor styles using existing tokens.

Tests and documentation:

- `server/test/{parsing,resumes}.test.js`, `server/test/fixtures/documents.js`: unit, real parser and MongoDB integration coverage.
- `server/test/auth.test.js`: update only the now-available resumeUpload feature expectation.
- `e2e/resumes.spec.js`: end-to-end upload/edit/reload/list/count/delete and security error journey.
- `README.md`, `docs/{ARCHITECTURE,API_DOCUMENTATION,DATABASE_SCHEMA,TESTING}.md`: current implementation/setup/API/schema and verification notes.
- `docs/{RESUME_PARSING,MILESTONE_2}.md`: parsing limits and delivery inventory.
- `docs/screenshots/{resume-preview,dashboard,landing}.png`: current browser captures.

## Validation and manual verification

25 backend/unit/integration tests passed, including prior authentication coverage. All 3 Chromium tests and the production build passed. The real MongoDB test and E2E databases are separate from application data. No cloud deployment was attempted. See [README](../README.md#verify-milestone-2) for the manual upload/correct/reload/delete checklist and [Resume parsing](RESUME_PARSING.md) for OCR, format and heuristic limitations.

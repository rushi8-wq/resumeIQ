# Milestone 4 delivery — Groq Cloud

The requested Groq integration and complete optimization workflow extend M1–3. No Milestone 5 job discovery was added.

## Created

- `server/src/services/ai/{provider,guardrails,recalculate,lifecycle}.js`: official Groq SDK, account-aware model selection, bounded prompts/JSON validation, conservative evidence checks, unchanged M3 scoring and deletion cleanup.
- `server/src/routes/ai.js`, `server/src/validation/ai.js`: authenticated/CSRF-protected generation, decisions, previews, explicit version approval and history/deletion.
- `server/src/models/{AISuggestion,OptimizedResumeVersion,AIUsage}.js`: private suggestions/audits, immutable revised evidence versions and persistent daily quotas.
- `client/src/pages/{Optimization,OptimizationHome}.jsx`, `useOptimization.js`: analysis selection, workflow state and API actions.
- `client/src/components/optimization/{SuggestionCard,OptimizationPreview,VersionHistory}.jsx`: consent/review/edit/accept/reject/revert, deterministic comparisons and saved-history UI.
- `server/test/{ai,ai-api}.test.js`, `server/test/fixtures/ai.js`, `server/test/e2e-server.js`, `e2e/optimization.spec.js`: safety/provider/persistence and explicit browser fixtures.
- `docs/MILESTONE_4.md`, `docs/screenshots/optimization.png`: delivery inventory and fixture-screen capture.

## Modified

- `server/package.json`, `package-lock.json`: official groq-sdk dependency.
- `server/src/config/env.js`, `server/.env.example`: Groq provider/key/model and quota configuration. Existing ignored `server/.env` was extended without overwriting MongoDB/JWT values; the user pasted their key privately. Its value is not in source/docs/chat.
- `server/src/{app,index}.js`: AI routes/body limits, model indexes and milestone/feature status.
- `server/src/routes/match.js`, `server/src/services/matching/persistence.js`: cascade AI deletion with parent analysis/resume. The matching engine itself is unchanged.
- `client/src/main.jsx`, `components/WorkspaceLayout.jsx`, `pages/{MatchResult,Dashboard}.jsx`, `styles.css`: navigation, optimizer links, low-score invitation, availability and responsive styles.
- `playwright.config.js`: separate isolated fixture API, regular frontend and two browser workers; no real-key use or reuse of dev API during automated tests.
- `e2e/matching.spec.js`: update only the former “coming in M4” notice expectation to the working optimizer invitation.
- `README.md`, `docs/{AI_INTEGRATION,API_DOCUMENTATION,DATABASE_SCHEMA,MATCHING_ALGORITHM,TESTING,ARCHITECTURE,DEPLOYMENT}.md`: configuration, contracts, limits, safeguards, math and verification.
- Existing screenshots refreshed by regression journeys. JWT/session mechanics, User/Resume schemas and M3 scoring calculations remain intact.

## Verification and limits

64 backend tests, five Chromium journeys and production build passed; prior milestone tests remain active. Real Groq model access and fictional keyword/bullet generation passed with openai/gpt-oss-20b. No personal resume data was transmitted during verification. API key remains in ignored backend `.env` only.

Human review is required: lexical guards and user attestations cannot independently prove every real-world claim. Rewrites can require extra confirmation or be rejected conservatively. New numbers cannot be added, learning-only gaps cannot be scored, and gains are never guaranteed. Histories/cleanup use compensating MongoDB writes, not crash-atomic distributed transactions. Generation supports Groq (including accessible Groq-hosted Llama) or disabled mode; M3 optional OpenAI embeddings are separate. Job discovery and optimized PDF/DOCX export remain outside this delivery.

See [manual steps](../README.md#verify-milestone-4--groq-cloud), [integration](AI_INTEGRATION.md), and [test commands](TESTING.md).

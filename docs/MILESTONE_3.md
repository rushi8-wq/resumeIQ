# Milestone 3 delivery

Complete backend-calculated matching, saved analysis/results/history, and private job description records extend the existing M1/M2 product. No AI rewriting, fabricated suggestions or job discovery was added.

## Files created

- `server/src/config/scoring.js`: validated, versioned configurable scoring weights.
- `server/src/services/matching/{text,jobParser,score,embeddings,persistence}.js`: shared canonical TF-IDF/cosine, requirement extraction, evidence/experience/qualification scoring, consented provider adapter, and lifecycle cleanup.
- `server/src/models/{JobDescription,MatchAnalysis}.js`: private durable input/result records and indexes.
- `server/src/routes/match.js`, `server/src/validation/match.js`: owner-scoped matching/history/detail/delete/jobs/config APIs and strict validation.
- `client/src/pages/{JobMatch,MatchResult,MatchHistory}.jsx`: complete input, results and history workflows.
- `client/src/components/match/{ScoreSummary,MatchEvidence,MatchProcessing}.jsx`: lazy-loaded Recharts circle, component bars/evidence, per-analysis consent and loading state.
- `server/test/{matching,match-api}.test.js`, `server/test/fixtures/matching.js`, `e2e/matching.spec.js`: unit, real persistence/security, mocked embedding and complete browser coverage.
- `docs/{MILESTONE_3.md,examples/match-analysis.json}` and `docs/screenshots/match-analysis.png`: delivery inventory, actual calculated fixture result and browser capture.

## Files modified

- `server/src/{app,index}.js`: routers, startup indexes, dedicated match JSON limit and real analysis dashboard metrics.
- `server/src/config/env.js`, `server/.env.example`: optional provider/model/key and weight settings; existing secrets are untouched.
- `server/src/services/parsing/structured.js`: add shared prose alias normalization without changing upload parsing behavior.
- `server/src/routes/resumes.js`: cascade deletion of private analysis snapshots and associated job descriptions.
- `client/src/main.jsx`, `components/WorkspaceLayout.jsx`, `pages/{Dashboard,ResumePreview,Landing}.jsx`, `components/resume/ResumeSource.jsx`, `styles.css`: protected navigation, active matching links, current availability/deletion text and responsive styles.
- `client/package.json`, root `package-lock.json`: Recharts dependency.
- `README.md`, `docs/{API_DOCUMENTATION,DATABASE_SCHEMA,MATCHING_ALGORITHM,TESTING,ARCHITECTURE}.md`: current implementation, math, API/schema/privacy/limits and exact verification commands.
- Existing screenshot captures are refreshed by regression journeys. Authentication/session/User/Resume schemas remain unchanged.

## Verification

48 backend/unit/integration tests, all 4 Chromium journeys and production build passed locally. These include the existing milestone regressions. External provider behavior is mocked, not a claim of a verified live/paid API call. Cloud deployment and container execution are not part of this milestone.

See [README manual checklist](../README.md#verify-milestone-3), [algorithm](MATCHING_ALGORITHM.md) and [calculated fixture output](examples/match-analysis.json). The local baseline is deterministic vocabulary/evidence alignment, not official ATS or hiring prediction. Finite dictionaries, sparse/ambiguous requirements, explicit-only tenure and limited qualification inference are disclosed in each result. Production multi-document crash consistency remains an operational limitation of compensating writes.

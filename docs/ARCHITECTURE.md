# System architecture

## Delivered foundation

The React client uses an AuthContext to restore `/auth/me`, an Axios client with credentialed requests, and a protected route. Mutations first fetch a double-submit CSRF token, then send it in a header. The Express app factory is separate from startup so integration tests exercise the same middleware without opening a server port. Startup validates environment, connects MongoDB, initializes indexes, then listens; shutdown closes HTTP and database connections.

User, Session, Resume, JobDescription and MatchAnalysis are implemented collections. JWTs contain identity and a random session ID, not personal profile data. Every authenticated request verifies the JWT and an unexpired database session. Logout deletes that session, preventing replay. This adds a database read but supports immediate revocation. Passwords use bcrypt cost 12 and are excluded from ordinary queries. Sessions have a seven-day expiry and TTL cleanup; expiry is also checked in application logic because TTL cleanup is asynchronous.

Security middleware applies Helmet, exact-origin CORS, request size limits, CSRF tokens, origin checks, and rate limiting. Request logs exclude bodies, cookies and headers. Production cookies are Secure and HttpOnly. These choices follow the [Express production security guidance](https://expressjs.com/en/advanced/best-practice-security/).

## Planned complete folder boundaries

```text
client/src/
  components/{forms,layout,scores,resume,jobs}/
  context/{AuthContext,ThemeContext}.jsx
  lib/{api,formatters}.js
  pages/{Landing,Auth,Dashboard,ResumeUpload,MatchAnalysis,
         AISuggestions,Optimization,JobDiscovery,SavedJobs,History,Settings}.jsx
server/src/
  config/{env,database,scoring}.js
  models/{User,Session,Resume,JobDescription,MatchAnalysis,AISuggestion,
          DiscoveredJob,SavedJob}.js
  middleware/{errors,authenticate,validate,upload}.js
  routes/{auth,resumes,match,ai,jobs,settings}.js
  services/
    parsing/{pdf,docx,structured,normalize}.js
    matching/{skills,tfidf,semantic,experience,education,score}.js
    ai/{provider,openai,llama,suggestions,optimize}.js
    jobs/{provider,adapters,normalize,deduplicate,rank}.js
    exports/{pdf,docx}.js
  workers/{syncJobs,retention}.js
  app.js, index.js
server/test/{unit,integration,fixtures}/
e2e/
```

These future files are a design, not empty implementation stubs. Adapters will be added with tests in their corresponding milestone.

## Production boundaries and scaling

Vercel serves static frontend assets. Render runs the Node API. Atlas holds durable records. Prefer same-site custom domains for frontend and API; cross-site cookies require SameSite=None and may still face browser third-party-cookie restrictions. A separate worker synchronizes permitted job feeds with backoff, provider rate limits, locks, and idempotent upserts. CPU-heavy extraction should move to bounded workers with timeouts. Shared rate limiting and worker coordination are needed before multi-instance deployment.

Uploads are capped at 5 MB and inspected by signature and document structure. Milestone 2 parses in bounded worker threads, retains only extracted text/structured information, and exposes ownership-scoped CRUD. Sparse text produces an explicit OCR/review warning. See [Resume parsing](RESUME_PARSING.md) for limits. Ownership checks remain required when future analysis, suggestion and saved-job routes are implemented.

## Milestone gates

M1: auth persistence, revocation and CSRF tests plus client build. M2: valid/malicious/oversized/scanned document fixtures and cross-user deletion. M3: deterministic score/weight/evidence invariants. M4: consent and unsupported-claim rejection, mocked AI. M5: provider normalization, deduplication and ranking. M6: persistence and ownership across complete journeys. M7: cloud smoke tests, monitoring, deletion/retention audit and deployment rollback.

## Milestone 2 integration

`/api/resumes` is mounted after the existing CSRF guard and applies the existing authentication middleware before receiving file bytes. Multer memory storage creates no temporary disk files. File signatures and DOCX ZIP/XML inspection precede extraction. A worker runs pdf-parse or Mammoth and deterministic section/skill extraction with a 15-second timeout. Parser exceptions and stdout/stderr are not forwarded into logs or responses. The upload request creates a completed record only on success; malformed documents leave no partial records.

Resume corrections replace the complete validated structuredData object and use an atomic version condition to prevent lost updates (409 on stale version). Original extracted text is read-only. Every CRUD database filter includes userId. The dashboard now counts that user's Resume records. The shared WorkspaceLayout moves existing navigation/theme/sign-out behavior out of Dashboard so the library and editor reuse the same shell; authentication is unchanged.

## Milestone 3 integration

The new match router reuses existing authentication, cookie and CSRF middleware. Strict input validation feeds a pure deterministic job parser/scorer. Optional embeddings implement a small similarity-provider interface; fixed provider URL, bounded input, timeout, vector validation and explicit consent protect private data. Local fallback remains fully functional offline. Scoring configuration is validated at startup and snapshotted/versioned.

Analysis creation reads current saved structured resume data, computes results, checks revision/existence, creates private JD/result records and compensates failed writes. Snapshot references preserve explanations across resume edits; lifecycle cleanup removes snapshots when their resume is deleted. Dashboard aggregates real private counts/average. Results/history endpoints use owner-scoped queries and stable pagination.

React adds JobMatch, MatchResult and MatchHistory within the existing WorkspaceLayout; field input/consent, lazy-loaded Recharts score summary and evidence views are separate components. No changes to JWT/session mechanics were required. See [Matching algorithm](MATCHING_ALGORITHM.md) for mathematical behavior and [M3 inventory](MILESTONE_3.md) for concrete files.

## Milestone 4 integration

The Groq provider layer is separate from the existing M3 embedding adapter and mathematical scorer. Existing auth/CSRF and owner-scoped models are reused. Generation flows through provider/model configuration, disclosure/consent, bounded/redacted evidence, quota reservation, official SDK request, strict JSON/schema checks and independent source/claim guards before persistence. No fake production fallback exists.

Decision endpoints use per-suggestion revisions; recalculation uses exact original scoring inputs and verified accepted edits. Explicit preview approval creates OptimizedResumeVersion instead of altering Resume/MatchAnalysis. AI history is included in parent deletion cleanup. React adds OptimizationHome/Optimization, a data/action hook, suggestion decision cards, score/draft preview and saved-version history within the existing layout. A separate test-only API entrypoint supplies deterministic fixtures for Chromium while normal startup always uses configured Groq or reports unavailability.

## Milestone 5 integration

`/api/jobs` adds authenticated discovery, recommendations, source status, details and private bookmarks within the existing app factory. Jobicy is the real production adapter. The provider boundary separates public retrieval/normalization from MongoDB catalog management and private resume scoring. Local search filters are user-selected preferences; no resume data or search terms are sent to the source. Unsupported target platforms expose external links only.

`JobProviderState` coordinates on-demand synchronization with an atomic persistent hourly reservation and failure backoff. Sequential cursor pages form one bounded pass; catalog records deduplicate by source/ID and canonical URL. There is no background sync worker in this delivery. Discovery excludes listings seven days after their last observation; saved references remain readable with expiry warnings. Fetching is not verification that a vacancy is open.

`JobRecommendation` reuses the existing M3 scorer and configuration with local TF-IDF, caching per owner/resume/job and invalidating on resume revision, job content or scoring configuration changes. It never calls Groq or the optional embeddings provider. Resume deletion also removes private recommendation evidence and bookmarks. The frontend’s Jobs, JobDetail and SavedJobs pages share WorkspaceLayout and the current palette/controls. The dashboard now counts actual owner-scoped SavedJob records. JWT, CSRF and AI consent behavior remain unchanged. Source contracts and limits are in JOB_PROVIDER_INTEGRATION.md. Deployment remains deferred.

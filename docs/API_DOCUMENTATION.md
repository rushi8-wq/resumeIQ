# REST API

Base: `/api`. JSON errors: `{ "error": { "message": "…", "fields": [{ "field": "email", "message": "…" }] } }`. Never return password hashes, cookies or provider secrets in response bodies. All responses are `Cache-Control: no-store`.

## Implemented in Milestone 1

| Method | Route          | Contract                                                                    |
| ------ | -------------- | --------------------------------------------------------------------------- |
| GET    | /health        | 200 database connected; 503 disconnected; status, database, milestone       |
| GET    | /auth/csrf     | Sets HTTP-only CSRF cookie and returns `{csrfToken}`; fetch before mutation |
| POST   | /auth/register | `{name,email,password}`; 201 `{user}` and session cookie                    |
| POST   | /auth/login    | `{email,password}`; 200 `{user}` and session cookie                         |
| POST   | /auth/logout   | Authenticated; revoke session, clear cookie, 204                            |
| GET    | /auth/me       | Authenticated; 200 `{user}`                                                 |
| GET    | /dashboard     | Authenticated; foundation metrics and feature availability                  |

Every POST, PATCH, and DELETE requires `x-csrf-token` matching the csrf cookie. Browser clients use credentials. Origin, if present, must equal CLIENT_URL. Password registration minimum 12 characters, max 72 UTF-8 bytes; names 2–100, emails max 254. Unknown input keys rejected. Email is canonicalized to lowercase. Sessions expire in seven days, no automatic refresh.

Status codes: 400 validation/malformed JSON; 401 unauthenticated/expired/wrong credentials; 403 CSRF/origin; 404 unknown route; 409 duplicate email; 413 oversized JSON; 429 rate limit; 500 generic internal failure; 503 health database unavailable. Base rate 300 requests per 15 minutes per IP; auth mutations 60 per 15 minutes. In-memory limits are per instance.

```sh
curl -c /tmp/resumeiq.cookies http://localhost:4000/api/auth/csrf
# Copy csrfToken from JSON into TOKEN below.
curl -b /tmp/resumeiq.cookies -c /tmp/resumeiq.cookies \
  -H 'Content-Type: application/json' -H 'x-csrf-token: TOKEN' \
  -d '{"name":"Alex Morgan","email":"alex@example.com","password":"a-long-unique-passphrase"}' \
  http://localhost:4000/api/auth/register
curl -b /tmp/resumeiq.cookies http://localhost:4000/api/auth/me
```

## Planned APIs (not implemented)

M2 resume endpoints are implemented below.

M3 matching routes are implemented below.

M4 Groq optimization routes are implemented below. Document export remains deferred.

M5 job routes are implemented below. Profile/preferences editing and account deletion remain future work. Match-analysis deletion is implemented.

All future list routes use bounded page/limit (max 100), stable sorting and total metadata. Each private query must include userId; cross-user identifiers return 404. Do not treat this planned API list as currently working functionality.

## Resume APIs — implemented Milestone 2

The omitted identifiers in the brief's view/update/delete paths are implemented as `:id`. All endpoints require a valid existing session. All mutations require the existing CSRF header/cookie pair and allowed Origin. Authentication runs before Multer buffers the document.

| Method | Route           | Input / response                                                                                                        |
| ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| POST   | /resumes/upload | Multipart field `resume`, exactly one PDF/DOCX file, no extra form fields; 201 `{resume}` after parsing and persistence |
| GET    | /resumes        | `page=1`, `limit=20` (max 100), stable newest-first order; 200 `{resumes, pagination: {page,limit,total,pages}}`        |
| GET    | /resumes/:id    | 200 `{resume}` including original text and editable structured fields                                                   |
| PATCH  | /resumes/:id    | JSON `{structuredData, version}`; 200 `{resume}` with incremented version, reviewed status/time                         |
| DELETE | /resumes/:id    | 204; removes parsed text and structured information                                                                     |

Resume JSON fields: id, originalFilename, fileType, fileSize, extractedText, structuredData, parsingStatus, warnings, parserVersion, uploadedAt, createdAt, updatedAt, version and optional reviewedAt. List records omit text, structured data and warnings. userId and Mongoose internal __v are not returned.

PATCH replaces all structured fields; it is not a partial nested merge. Preserve fields not being edited. Unknown keys, ownership/metadata changes, invalid emails and invalid list entries return 400. Sections use arrays of literal entries, not inferred role/date/degree objects. Empty name/email/arrays are allowed. The current `version` is mandatory; stale updates return 409 and leave the current record intact. Reload the detail, reconcile corrections, and retry. API bodies on resume routes are limited to 256 KiB; other JSON limits are unchanged.

```json
{
  "version": 1,
  "structuredData": {
    "name": "Alex Morgan",
    "email": "alex@example.com",
    "education": ["B.Sc. Computer Science - Example University, 2022"],
    "skills": ["React", "JavaScript"],
    "projects": ["Built a personal React dashboard"],
    "workExperience": [],
    "certifications": [],
    "achievements": []
  }
}
```

```sh
# Use an authenticated cookie jar and fetch a fresh CSRF token first.
curl -b /tmp/resumeiq.cookies -c /tmp/resumeiq.cookies http://localhost:4000/api/auth/csrf
# Substitute its csrfToken below. Do not send resume content as a query parameter.
curl -b /tmp/resumeiq.cookies -H 'x-csrf-token: TOKEN' \
  -F 'resume=@/absolute/path/to/resume.pdf' http://localhost:4000/api/resumes/upload
curl -b /tmp/resumeiq.cookies http://localhost:4000/api/resumes
```

Upload errors: 400 missing/empty/unexpected multipart fields or files; 413 larger than 5,242,880 bytes; 415 unsupported content or extension/content mismatch; 422 malformed/encrypted/unsupported/over-limit document or parsing timeout. Valid sparse/scanned documents return 201 with needs_review and OCR guidance, not invented content. 429 means two uploads are already in progress on this API instance, or the normal rate limit was reached. Cross-user/nonexistent/malformed IDs return 404 for detail/update/delete. No rejected upload is stored, no raw file is retained, and no AI call is made.

## Matching APIs — implemented Milestone 3

All endpoints use existing session authentication; POST/DELETE also require the existing CSRF header/cookie and allowed Origin. IDs from another account return 404. No API accepts client-provided scores or parsed requirements.

| Method | Route             | Contract                                                                                                                                      |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /match/config     | Configured weight snapshot, algorithm prefix, and public embedding availability/provider/model; no keys                                       |
| POST   | /match/analyze    | `{resumeId, description, title?, company?, embeddingConsent?}`; 201 `{analysis, jobDescription}` after calculation and MongoDB persistence    |
| GET    | /match/history    | page/limit (default 1/20, max limit 100); newest-first `{analyses, pagination}` summaries                                                     |
| GET    | /match/:id        | 200 `{analysis, jobDescription}`, including saved evidence and original private job text                                                      |
| DELETE | /match/:id        | 204; deletes the result and its single associated JobDescription, preserving the Resume                                                       |
| GET    | /job-descriptions | Owner-scoped page/limit metadata list `{jobDescriptions, pagination}`; omits description/parsedRequirements (available through result detail) |

POST fields: valid owner Resume ObjectId; description 30–15,000 characters with at least five readable words; optional trimmed title/company max 150 each; boolean embeddingConsent defaults false. Match JSON requests are capped at 64 KiB, so Unicode byte limits can apply before the character limit. Unknown keys, empty/malformed input and invalid resume IDs return 400; invalid/non-owned detail IDs return 404. Auth/CSRF errors retain 401/403. Provider failures do not fabricate embedding scores: return a saved, labeled local fallback and limitation. A changed/deleted resume during analysis returns 409 with no successful saved result. `/history` and `/config` are registered before `/:id`.

```json
{
  "resumeId": "COPY_AN_OWNED_RESUME_ID",
  "title": "Full Stack Developer",
  "company": "Example Studio",
  "description": "Required skills: React, Node.js, Docker\nPreferred skills: AWS\nResponsibilities:\nBuild React applications and REST APIs.",
  "embeddingConsent": false
}
```

Analysis output includes overallScore (0–100 or null), interpretation, componentScores (score/applicability/baseWeight/effectiveWeight/contribution/explanation), skillCoverage, matchedSkills with field/text evidence, missingSkills, relevantProjects/relevantExperience, experienceChecks, qualificationChecks/gaps, confidence/limitations/explanations, semantic method/model/local baseline, algorithmVersion, weight snapshot, disclaimer, timestamps, linked IDs and resumeSnapshot. The snapshot excludes name/email fields. Contact snippets can still exist in private resume evidence; redaction is applied only to external embedding input and is best effort. History omits the full evidence/description to minimize payload and exposure.

Each analysis creates a private JobDescription owned by the same user. Multiple analyses of identical pasted text intentionally create separate history inputs. Resume revisions are read from MongoDB at analysis time, checked for concurrent changes, and recorded. Historical analysis snapshots do not change on PATCH /resumes/:id. DELETE /resumes/:id now also deletes those private analyses and their job descriptions; deletion never crosses user ownership. Dashboard analyses/averageScore are database-derived (arithmetic mean of non-null stored scores).

Persistence uses normal MongoDB writes compatible with the existing standalone local setup. Failed creation attempts compensate by deleting their newly created records. Multi-document writes/deletes are not a crash-atomic transaction; production operations should add reconciliation/transactional lifecycle handling on an appropriate replica set before claiming crash consistency.

## AI optimization APIs — implemented Milestone 4

All routes require the existing authenticated session; POST/PATCH/DELETE require the existing CSRF pair and Origin checks. All database queries are owner-scoped. AI JSON bodies are capped at 128 KiB; unknown input fields are rejected. Generation never uses a fabricated fallback.

| Method | Route                       | Contract                                                                                                      |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | /ai/config                  | Public provider/model/configuration status and quota limits; may check Groq models; no secrets                |
| POST   | /ai/suggestions             | `{analysisId, consent:true}`; 201 `{suggestions, model, evidenceSubset}`                                      |
| POST   | /ai/optimize                | `{analysisId, section:"projects"                                                                              | "workExperience", index, consent:true}`; selected-bullet generation, 201 same shape |
| GET    | /ai/suggestions/:analysisId | Owner's latest 100 suggestion records for that analysis, newest first                                         |
| PATCH  | /ai/suggestions/:id         | `{status:"pending"                                                                                            | "accepted"                                                                          | "rejected", revision, editedText?, confirmed?, confirmationEvidence?}`; 200 `{suggestion}` |
| DELETE | /ai/suggestions/:id         | 204; independent saved versions remain intact                                                                 |
| POST   | /ai/recalculate             | `{analysisId, suggestionIds:[...], save?:false, embeddingConsent?:false}`; 200 `{preview}`                    |
| POST   | /ai/recalculate             | Same with `save:true, previewHash` from reviewed preview; 201 `{version}`; identical saves return same record |
| GET    | /ai/versions/:resumeId      | `{versions, pagination}` with page/limit, maximum ten full versions per page                                  |
| DELETE | /ai/versions/:versionId     | 204                                                                                                           |

Each decision must include current suggestion `revision` (starting at 1, incrementing on mutation). Accepted suggestions must have a source bullet and pass the factual guard. Confirmation-required or newly factual edited text needs confirmed=true and at least 20 characters of factual supporting evidence. Skill gaps cannot be accepted regardless of confirmation. New or changed numeric claims remain blocked. Reject/revert do not alter saved optimized versions. Editing a pending proposal is supported through the same PATCH; accepting/editing a source whose resume revision changed requires a new match.

Preview accepts 1–20 unique suggestion IDs belonging to the same owner/analysis. Every ID must currently be accepted; duplicate targets conflict. It returns revisedStructuredData, appliedChanges, originalScore, revisedScore, improvement in percentage points, algorithmVersion, weights, revisedAnalysis and previewHash. It performs no generation call. Local analyses remain local; embedding analyses require fresh explicit embedding consent and reproducibility of the original model/score. A save must supply the exact previewHash and does not overwrite Resume or MatchAnalysis.

```json
{
  "analysisId": "OWNED_ANALYSIS_ID",
  "suggestionIds": ["OWNED_ACCEPTED_SUGGESTION_ID"],
  "save": false,
  "embeddingConsent": false
}
```

Errors: 400 invalid shape/confirmation/unsupported edit/skill-gap acceptance; 401 unauthenticated; 403 CSRF/origin or missing fresh embedding consent; 404 non-owned or nonexistent resource; 409 stale source/decision/hash, conflicting bullet edits or baseline/model drift; 413 oversized AI input; 429 app generation quota/concurrency or Groq quota; 502 invalid/truncated JSON, evidence/target mismatch; 503 missing/rejected provider key/model or provider timeout/unavailability. Consent=false is a validation failure (400), never an implicit opt-in. Private provider response bodies are suppressed.

Generation is limited to five operations per user per 15 minutes and a database-backed daily quota (10 by default, failed attempts included). History/config and local decisions do not consume generation quota. Deleting an analysis/resume cascades generated suggestions and versions; deleting an individual suggestion does not rewrite historical versions. [Full integration/limitations](AI_INTEGRATION.md).

## Jobs — implemented Milestone 5

All routes require a valid session. Mutations retain CSRF and origin protection. Jobs-specific limit: 60 requests/minute/IP, plus the global API limit. Query/body fields use strict schemas. Job listings are shared public source data; selected resumes, recommendations and bookmarks are private to their owner. Invalid IDs on details/deletion return 404; malformed query/body values return 400. Missing or foreign resume references return 404.

| Method | Path                     | Contract                                                                                                                                                                                              |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/jobs`                  | Optional `resumeId`; filters below. Returns `{jobs,pagination,provider,resume}`.                                                                                                                      |
| GET    | `/jobs/recommended`      | Same response; owned `resumeId` required.                                                                                                                                                             |
| GET    | `/jobs/providers/status` | `{providers}`: source cache/configuration/coverage and external-only platforms. No upstream request.                                                                                                  |
| GET    | `/jobs/saved`            | Owner-only `{jobs:[{id,resumeId,savedAt,job}],pagination}`; page/limit only. Expired jobs remain visible.                                                                                             |
| POST   | `/jobs/save`             | Strict `{jobId,resumeId}`; requires active discovered job and owned resume. 201 `{saved:{id,jobId,resumeId,savedAt}}`. Repeated save is idempotent per owner+job and updates selected resume context. |
| DELETE | `/jobs/saved/:id`        | The ID is the bookmark ID, not the job ID. Owner-scoped delete; 204 or 404.                                                                                                                           |
| GET    | `/jobs/:id`              | Optional owned `resumeId` for score; `{job,provider}`. Includes expired status, description, source URL and score details.                                                                            |

List queries: `keyword` (literal substring of title/company/description, max120), `location` (literal substring of source eligibility, max120), `workMode` (`remote`,`hybrid`,`onsite`,or empty), `employmentType` (`internship`,`full-time`,`contract`,`part-time`,or empty), `experienceLevel` (case-insensitive substring, max60), `minScore` (0–100, default0; positive requires resume), `source` (`all` or `jobicy`), `sort` (`score` default or `date`), `page` (1–10000, default1), `limit` (1–50, default12). These filters are current job preferences. Employment/work-mode filtering is exact; absent metadata does not satisfy a nonempty filter. Source-specific level labels are not inferred from job titles. Pagination follows scoring/filtering and includes `{page,limit,total,pages}`.

Each job includes normalized source fields, null/empty missing metadata, `fetchedAt`, nullable `lastVerifiedAt`, `expiresAt`, `descriptionTruncated`, optional `recommendation` and owner-specific `savedId`. Recommendation includes matchScore (nullable), componentScores, matchedSkills/ missingSkills with required/preferred groups, explanation, limitations, algorithmVersion, calculatedAt and resumeVersion. A job detail score is recalculated from current saved resume data; a bookmark is not an immutable historical score snapshot. No client can supply a match percentage.

Provider metadata includes state `live|cached|stale|unavailable`, last successful fetchedAt, nextFetchAt, failure timestamp, partialCoverage and availableJobs. The automated-test adapter additionally declares `fixture:true`; production never injects it. A fresh fetch is not an individual availability verification. A provider outage can return 200 with stale/empty data and an explicit source state, rather than a fabricated list. Expired listings are excluded from discovery and cannot be newly saved. Detail/status/bookmark routes do not refresh the source. No external resume processing occurs during recommendations.

Example: `GET /api/jobs/recommended?resumeId=OWNED_RESUME_ID&keyword=marketing&location=India&workMode=remote&minScore=20&sort=score&page=1&limit=12`.

## AI error codes

AI failures return `{error:{message,code}}`; messages are controlled by the backend and safe for display. Generic internal exceptions outside this classified path remain masked. No raw Groq body, prompt or response text is returned. Existing authentication, CSRF, validation and quota rules remain.

| HTTP | Code                                                                                  | Meaning / action                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 503  | AI_ACCESS_DENIED                                                                      | Groq denied credentials/permissions; check backend configuration.                                                                                               |
| 429  | AI_RATE_LIMITED                                                                       | Upstream quota/rate limit; wait/check usage. May include numeric `retryAfter` and Retry-After header. Local request/day limits have separate explicit messages. |
| 503  | AI_MODEL_UNAVAILABLE                                                                  | Selected model absent/inactive; verify GROQ_MODEL. No silent pinned-model replacement.                                                                          |
| 503  | AI_CONFIGURATION                                                                      | Groq rejected model/request settings.                                                                                                                           |
| 504  | AI_TIMEOUT                                                                            | Upstream timeout; no suggestions saved.                                                                                                                         |
| 503  | AI_NETWORK_ERROR                                                                      | SDK connection failure.                                                                                                                                         |
| 502  | AI_PROVIDER_ERROR                                                                     | Groq server-side failure.                                                                                                                                       |
| 502  | AI_INVALID_RESPONSE / AI_INVALID_JSON / AI_INCOMPLETE_RESPONSE                        | Rejected generated JSON or incomplete completion.                                                                                                               |
| 502  | AI_SCHEMA_INVALID / AI_TARGET_INVALID / AI_EVIDENCE_INVALID / AI_INVALID_BULLET_COUNT | Provider output failed structural, target, citation or count validation. No invalid suggestions saved.                                                          |
| 500  | AI_INTERNAL_ERROR                                                                     | Unexpected application error, without exposing exception text.                                                                                                  |

`GET /ai/config` may report safe `error` and `errorCode` when unavailable. Successful keyword generation may return 201 with `suggestions:[]` when no safe useful change exists. The UI explains this; it does not substitute sample guidance. Single-bullet optimization still requires exactly one valid edit. The provider-only targetId representation is normalized internally; public API suggestion fields and saved model relationships remain compatible.

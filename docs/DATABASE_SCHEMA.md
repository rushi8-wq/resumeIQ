# MongoDB schema design

User and Session were implemented in Milestone 1; Resume is implemented in Milestone 2. JobDescription and MatchAnalysis are implemented in Milestone 3; AISuggestion, OptimizedResumeVersion and AIUsage are implemented in Milestone 4; DiscoveredJob, SavedJob, JobRecommendation and JobProviderState are implemented in Milestone 5.

| Collection                   | Fields and relationships                                                                                                                                                                  | Indexes and constraints                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| User (implemented)           | name, normalized email, passwordHash (query-excluded), jobPreferences, aiConsent=false, createdAt, updatedAt                                                                              | unique email; strict schema; bounded strings; password never returned            |
| Session (implemented)        | random string _id, userId→User, expiresAt, timestamps                                                                                                                                     | userId; TTL expiresAt; explicit expiry check on every request                    |
| Resume (implemented)         | userId→User, originalFilename, extractedText, typed structuredData (identity, education, skills, experience, projects, certifications, achievements), uploadedAt, version, parentResumeId | userId+uploadedAt; bounded text; version≥1; account ownership                    |
| JobDescription (implemented) | userId→User, title, company, description, parsedRequirements (required/preferred skills, years, education, certifications, responsibilities, limitations/evidence), source, createdAt     | userId+createdAt; no private descriptions shared across users                    |
| MatchAnalysis (implemented)  | userId→User, resumeId, jobDescriptionId, overallScore, componentScores, matchedSkills/evidence, missingSkills, explanation, algorithmVersion, embeddingModel/version, createdAt           | userId+createdAt; resumeId; scores in [0,100]; immutable inputs/version snapshot |
| AISuggestion (implemented)   | userId, analysisId, keyword, category, explanation, evidence offsets, suggestedText, verificationStatus, userConfirmedAt, provider/model                                                  | userId+analysisId; enumerated status; references validated for same owner        |

Retention plan: raw documents discarded after extraction unless explicitly retained; provide immediate user deletion of parsed text and derived analyses/suggestions. Account deletion removes owned records and sessions. A scheduled retention worker must enforce an explicitly documented policy for inactive data. Do not apply TTL blindly to shared jobs referenced by saved jobs. Backups need their own expiry policy. Milestone 2 implements resume deletion. Automated retention and account-wide deletion remain planned.

Use a least-privilege Atlas application user, encrypted connections, IP/network access restrictions, and no credentials in source. Do not log resume text, email/password bodies or tokens. Add migrations for future indexes before enabling corresponding features.

## Resume — implemented schema

- `userId`: required User ObjectId; never accepted from client input or exposed in resume JSON.
- `originalFilename`: sanitized basename, at most 200 characters; raw upload is not retained.
- `fileType`: pdf or docx; `fileSize`: bytes, at most 5,242,880.
- `extractedText`: original parser text, at most 100,000 characters, immutable through public API.
- `structuredData`: name (string, max 150), email (string or empty, max 254), education, skills, projects, workExperience, certifications, achievements (arrays of strings). Each array has at most 100 entries; skills max 120 characters per entry, other entries max 2,000. Empty strings/arrays represent absent data. API email updates are validated, and unknown fields are rejected.
- `parsingStatus`: parsed (no extraction warnings, not reviewed), needs_review (sparse/missing/limited extraction), or reviewed (user saved corrections).
- `warnings`: original extraction notes retained after review; `parserVersion`: rules-v1.
- `uploadedAt`: immutable timestamp; `createdAt`/`updatedAt`: Mongoose timestamps; optional `reviewedAt`.
- `version`: starts at 1 and increments atomically on each successful correction save. This is a concurrency revision counter, not an archived resume-version history (future milestone).
- Compound index `{userId: 1, uploadedAt: -1, _id: -1}` supports stable owner-scoped pagination.

GET list responses omit extractedText, structuredData and warnings. Detail/upload/update responses include these private fields for the authenticated owner. Deletion removes the MongoDB record and its parsed data immediately; infrastructure backups have their own retention policy. Rejected malformed uploads create no record. Valid sparse/scanned files are saved with needs_review so the owner can complete the fields manually.

## JobDescription — implemented Milestone 3

`userId` (required User reference), title/company (optional max 150), description (required max 15,000), parsedRequirements (internal parser result), createdAt/updatedAt. The parser output contains required/preferred/ambiguous skills; programming language/framework/tool categories; education, certification and explicit-year requirements; responsibilities; skill source clauses; and limitations. These nested results are stored as internal Mixed data, produced by backend rules after validated text input; clients cannot write them directly. Compound index `{userId:1, createdAt:-1, _id:-1}` supports stable private pagination.

## MatchAnalysis — implemented Milestone 3

Required userId/resumeId/jobDescriptionId references; overallScore (nullable Number constrained to 0–100); componentScores, matchedSkills, missingSkills and skillCoverage; relevantProjects/Experience; experienceChecks, qualificationChecks/Gaps; confidence (low or medium), limitations, explanations, interpretation; semantic method/model/baseline/externalProcessingUsed; weights; algorithmVersion; disclaimer; embeddingConsent and optional embeddingConsentedAt; createdAt/updatedAt.

resumeSnapshot stores filename, saved revision, parsing/review status and the saved evidence arrays used for scoring; it omits name/email identity fields. jobSnapshot holds title/company for efficient history. Nested result/snapshot data are internal Mixed fields; public POST has a strict Zod input contract and cannot accept result fields. No raw embedding vectors or contact fields are deliberately added to snapshots; existing evidence can itself contain personal text and remains private.

Indexes: `{userId:1, createdAt:-1, _id:-1}`, `{userId:1, resumeId:1}`, and unique `{jobDescriptionId:1}` (one private JD per analysis). All reads, lists, statistics and mutations filter by userId. IDs and internal ownership keys are never trusted from the client. History exposes bounded summaries; detail exposes private snapshots to the owner.

An analysis uses the latest persisted resume revision and keeps a stable snapshot across future edits. Deleting an analysis also removes its private JD. Deleting a resume cascades to analyses/evidence snapshots and associated JDs, including version checks around concurrent creation. Failures use compensating cleanup rather than multi-document transactions so the standalone development MongoDB remains supported. Crash-atomic consistency and account-wide retention remain future operational work.

## AISuggestion — Milestone 4

Owner User, MatchAnalysis and Resume references; sourceResumeVersion; batchId; keyword/category/importance; model rationale; authoritative job requirement; actual cited evidence with section/index/text; source section/index/originalText; original suggestedText and current editedText; verificationStatus (supported/confirmation_required/skill_gap); decision status (pending/accepted/rejected); factual confirmation/evidence, decidedAt, revision; provider/model; consentedAt; guardNotes; batch token usage; timestamps. The original model text remains preserved separately from user edits. Decisions record current state/timestamp/revision rather than an immutable event stream. Evidence/source targets are backend-validated, never trusted client metadata.

Indexes `{userId,analysisId,createdAt:-1}` and `{userId,resumeId}` support private retrieval and lifecycle cleanup. Record string/array bounds are enforced through input/AI schemas and Mongoose string bounds. User ID is omitted from public JSON. Token usage repeats batch totals on each suggestion and must not be summed across a batch as if per-item usage.

## OptimizedResumeVersion — Milestone 4

userId, originalResumeId, analysisId, sourceResumeVersion, revisedStructuredData (scored evidence arrays plus contact fields copied locally from the owned original resume), acceptedSuggestionIds, approved appliedChanges snapshots (original/revised text plus confirmations/revisions), originalScore/revisedScore/improvement, exact algorithmVersion/weight snapshot, complete revisedAnalysis, previewHash and timestamps. Scores remain bounded 0–100 or null; improvement is percentage points and can be zero or negative. Versions are immutable via API; there is no update endpoint. Unique `{userId,analysisId,previewHash}` makes repeated identical approvals idempotent. Additional indexes scope history by owner/original resume and analysis.

These are separate evidence versions, not new original Resume uploads; contact fields are restored locally from the owned original resume and never included in the Groq generation request. Creating one does not alter the original Resume version, extractedText, structuredData or historical MatchAnalysis. Original/revised payloads remain private. Stored approved-change snapshots remain readable after an individual suggestion is deleted, so delete the version itself to remove that copy.

## AIUsage — Milestone 4

userId, UTC day string, count, expiresAt and timestamps; no resume/job text or provider key. Unique `{userId,day}` enforces an atomic persistent quota reservation; TTL on expiresAt cleans counters after roughly 32 days. Failed provider attempts count. Short-window rate/concurrency limits remain process-local.

Deleting a MatchAnalysis deletes its suggestions and optimized versions. Deleting a Resume cascades those records across analyses plus private JDs. Failed writes use compensating cleanup on the existing standalone MongoDB setup; crash-atomic multi-document deletion/creation and account-wide cleanup remain operational limitations, not claimed as transactional guarantees.

## Job discovery — implemented Milestone 5

- **DiscoveredJob:** shared public `source`, `externalId`, `title`, `company`, nullable `location`, `workMode`, `employmentType[]`, nullable `experienceLevel`, `experienceRequirements[]`, nullable `{min,max,currency,period}` salary, plaintext `description` (max15,000 after normalization), `descriptionTruncated`, `parsedRequirements`, required/preferred skill arrays, canonical `applicationUrl`, nullable `postedAt`, required `fetchedAt`, nullable `lastVerifiedAt`, `expiresAt`, SHA-256 `contentHash`, and timestamps. Unique `{source,externalId}` and `{applicationUrl}`; `{expiresAt,postedAt}` supports active discovery. Only trusted adapter output writes this collection. No client-write endpoint. Expired records remain stored for bookmarks; queries enforce expiration without TTL deletion of shared references.
- **SavedJob:** required `userId→User`, `jobId→DiscoveredJob`, `resumeId→Resume`, `savedAt`. Unique `{userId,jobId}` makes saving idempotent; `{userId,savedAt}` supports private pagination and `{userId,resumeId}` supports deletion cascades. The resume must belong to the session user. API returns the bookmark’s own ID and never another owner’s records.
- **JobRecommendation:** private required owner/resume/job references, `resumeVersion`, `jobHash`, `configVersion`, nullable `matchScore`, `componentScores`, `explanation`, `algorithmVersion`, internal full scoring `result`, `calculatedAt`. Unique `{userId,resumeId,jobId}` and seven-day TTL on `calculatedAt`. Cache results can contain resume evidence and are never shared across users. Owner/version/content/config checks precede reuse. API exposes a bounded recommendation summary rather than internal ownership keys.
- **JobProviderState:** unique source, `nextFetchAt`, last successful `fetchedAt`, optional `failedAt`, `hasMore`, `skipped`. Atomic conditional reservation prevents a new sync pass for one hour, including after failure or a process restart. Feed cache is shared; this state contains no resume data.

Startup initializes the new indexes with existing indexes. Resume deletion removes its private SavedJob and JobRecommendation records, preserving shared public job records and other owners. An in-flight scoring request checks the resume revision again and clears its stale results if the resume changed/disappeared. Standalone MongoDB remains supported; compensating cleanup is used rather than requiring replica-set transactions. Multi-collection crash atomicity and physical retention of unreferenced expired public jobs remain future operational work.

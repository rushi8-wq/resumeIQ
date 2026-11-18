# AI resume optimization — Milestone 4 with Groq Cloud

Groq is the primary generation provider. It proposes keyword guidance and conservative bullet wording; the existing Milestone 3 backend computes every percentage. Milestone 5 job discovery remains separate. AI optimization never automatically overwrites a resume, fabricates fallback suggestions or guarantees a score increase.

## Exact configuration location

Open `server/.env` in the existing checkout. Preserve MONGODB_URI, JWT_SECRET, CLIENT_URL and the other existing settings. The file is ignored by `.gitignore` and not copied into the backend Docker image.

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=PASTE_YOUR_KEY_HERE
GROQ_MODEL=auto
AI_DAILY_REQUEST_LIMIT=10
```

Never share the key in chat or put it in VITE variables. Only `.env.example` with an empty key belongs in source control. The user configured the real key directly in server/.env during this delivery; its value is intentionally not documented. Restart `npm run dev` after editing environment values (source watch does not guarantee dotenv reload).

`npm ci` installs the official `groq-sdk`. `GROQ_MODEL=auto` queries the authenticated models list, preferring an available openai/gpt-oss-20b, then openai/gpt-oss-120b. Both support strict structured output. Available model IDs are cached for five minutes. Pin any accessible supported text model by setting GROQ_MODEL to its exact ID; there is no silent substitution when a pinned model is unavailable. Auto-selection fails explicitly if no candidate is accessible. A listing does not by itself establish generation permissions; a live fictional-fixture call verified actual generation on openai/gpt-oss-20b during delivery. [Groq supported models](https://console.groq.com/docs/models).

`AI_PROVIDER=disabled` disables generation. Groq-hosted Llama models use the same official SDK; a separate OpenAI-generation/local-Llama adapter is not shipped because the explicit requirement selected Groq Cloud. The small provider contract (`name`, `resolveModel()`, `generate(payload)`) permits future adapters. M3 optional OpenAI embeddings remain separate and unchanged; GROQ_API_KEY does not configure them.

## Request and response controls

The SDK runs only server-side against the fixed Groq API origin, with logging explicitly off, a 15-second request timeout and no automatic retries. Generation also has a 20-second abort signal, temperature 0 and a 2,500-completion-token cap. GPT-OSS requests use low reasoning effort. The provider sends system instructions plus JSON document data, requests JSON Schema with strict:true on GPT-OSS models, rejects truncated completions and malformed JSON, then validates against Zod and the existing factual/evidence guards. Explicitly pinned non-GPT-OSS models use JSON Object Mode with the schema in the prompt and the same local validation, so compliance is less reliable. Auto-selection uses only the strict-output candidates. JSON format does not establish factual truth. [Official SDK](https://github.com/groq/groq-typescript), [Groq structured-output modes](https://console.groq.com/docs/structured-outputs).

Provider auth/model failures, rate limits, timeouts, malformed responses and unsupported references produce actionable errors. Private provider error bodies are never forwarded. There is no deterministic or mock content returned when real generation is unavailable. Tests have an explicitly separate fixture provider, never used by production startup.

## Consent and data minimization

Each POST /ai/suggestions or /ai/optimize requires `consent:true`. The form explains provider, resolved model and data sent; its checkbox is unchecked initially and reset after each successful generation. Existing profile aiConsent is not treated as blanket permission.

Keyword mode sends up to the first 30 saved evidence entries plus classified job skills, up to ten responsibilities and up to 30 source clauses. Single-bullet mode sends only that bullet plus relevant job context. Name/email identity fields are omitted; detected email and phone-like snippets in evidence and job clauses are redacted. Redaction is best effort and **does not guarantee anonymization**. The full generation input is capped at 24,000 UTF-8 bytes without silently truncating individual entries; larger inputs return 413 and suggest a single shorter bullet. Provider data policies apply; the app makes no blanket claim about external retention. [Groq data documentation](https://console.groq.com/docs/your-data).

Generating, deciding or previewing against an analysis whose underlying resume revision has since changed returns 409 where a current source is required. Old suggestions and saved versions remain viewable until explicitly deleted or their parent analysis/resume is deleted.

## Classification and factual guards

Suggestions contain keyword, category, required/preferred importance, rationale, verified job requirement, cited evidence IDs/text, editable source target, proposed text and verificationStatus.

- **supported**: the cited evidence explicitly demonstrates the keyword and the proposed edit passes conservative source checks.
- **confirmation_required**: evidence is indirect or the edit introduces factual terms beyond the source. Accepting requires a checked factual attestation and at least 20 characters of actual supporting evidence for that project/role.
- **skill_gap**: missing support. Learning guidance only; no editable bullet and no current-score effect. Even an arbitrary confirmed=true cannot make a skill-gap suggestion applicable. Add real experience to the original resume and analyze again when appropriate.

The backend never trusts the model's classification alone. It verifies evidence IDs and targets against the specific analysis snapshot, verifies that keywords belong to the job, and uses actual parsed job clauses rather than persisting model-written citations. Unsupported support claims are downgraded. Proposed source targets must cite their original bullet.

Edits are limited to existing projects/workExperience bullets. Every proposed/edited factual term must occur in the source or explicitly supplied confirmation, with a small alias/connector vocabulary for wording changes. Known technology aliases share M2 normalization. Numerical claims must remain exactly the same as the original, including order; user confirmation does not permit invented or changed numbers. Negation/qualification markers such as no, not, without, expected, training and pursuing must be preserved. Instructional/link/script-like proposed text is rejected. The original resume and analysis are never overwritten.

These guards are conservative lexical checks, **not independent verification of every real-world or semantic claim**. Rearrangements, synonyms and context can still require human scrutiny; users must review every approved sentence. False-positive confirmation prompts and rejected legitimate paraphrases are expected. If an accurate new claim cannot pass, correct the original resume in M2 and create a new match rather than bypassing checks.

## Review, preview and persistence

PATCH /ai/suggestions/:id supports pending/accepted/rejected, an edited proposal and factual confirmation. Revision counters prevent lost updates. Reject/revert decisions remain in the current suggestion record with timestamps; original AI text, edited text, model, evidence and consent time are retained. Decisions are not a full event-sourced audit trail. Genuine gaps cannot be accepted. A suggestion without a target cannot be applied.

Recalculation applies only the explicitly supplied accepted suggestions from the same owner/analysis. Two accepted edits to one bullet conflict until reconciled. Each edit is validated again. It reuses the exact M3 scoreMatch function, original job text/requirements, original weight snapshot, method and algorithm version. It first reproduces the original score; mismatch returns 409. For embedding-based analyses, fresh embedding consent and the original provider/model are required; fallback or baseline drift refuses comparison rather than manufacturing a gain.

The returned preview contains original/revised scores, percentage-point difference, revised draft (including contact fields copied locally from the original resume, never sent to Groq), applied changes, remaining gaps, full revised analysis and a SHA-256 previewHash. Saving requires `save:true` and the exact current previewHash after user review. Identical approved saves are idempotent. OptimizedResumeVersion keeps a new immutable evidence snapshot and approved-change audit, independent from the original Resume. Scores can increase, decrease or remain unchanged.

## Quotas and costs

Per-user generation limit: five operations per 15 minutes. MongoDB enforces a persistent UTC-day quota (default 10, configurable 1–100 through AI_DAILY_REQUEST_LIMIT), including failed provider attempts. The SDK does not automatically retry a failed generation. Two concurrent generation operations are allowed per API instance. Read/config, decisions and local previews do not consume generation quota; provider model discovery may make a metadata request. Usage tokens are saved with each suggestion batch; they are not a billed-cost receipt. Preview/save of an embedding analysis may incur separate OpenAI embedding calls.

Actual availability, charges and limits depend on model/account. Keep provider spend/rate limits configured in Groq Cloud; application quotas are not a currency spend guarantee. Check current [Groq pricing/model table](https://console.groq.com/docs/models) and account usage before changing limits.

## Deletion and operational limits

Users can delete individual suggestions and optimized versions. Deleting a suggestion leaves already saved versions intact because they contain an independent approved audit; delete those versions too when removing that content. Deleting a match analysis cascades to its suggestions/versions; deleting a resume cascades through all associated analysis/AI data. Usage counters retain only user ID/date/count/expiry, not resume text, and expire after roughly 32 days. Multi-document operations use compensating cleanup rather than crash-atomic transactions; replica-set transactional/reconciliation operations and distributed rate-limit storage remain future production work. Daily quota uniqueness is database-backed across instances; short-window/concurrency limits are process-local.

The suggestion API returns the latest 100 records per analysis. Version history is paginated with at most ten full versions per page. Very large/long-running histories need broader pagination/archival before scale-out.

## November 11, 2026 — keyword suggestion 502 fix

Fictional live requests reproduced two response-contract failures: JSON Object Mode emitted `section:"skills"` (not an editable bullet section), and another response selected a project/work target without citing that source bullet. Existing local guards correctly rejected these as 502. The global handler then masked the safe explanation with a generic message, while logs omitted validation stage/code. The original user request/response was not retained; its Pino status/duration alone cannot establish which historical validator branch failed. These concrete failures were reproduced directly, without using a private resume.

The Groq wire schema now uses an explicit `targetId` constrained to actual project/work evidence IDs (or null), with dynamic evidence-ID enums and strict output. The adapter derives public section/index from that real record and treats the explicit target ID as its source citation. It does not manufacture evidence or qualifications. Non-editable proposals have their proposed edit text discarded, preventing application; genuine gaps still cannot be accepted. Keyword mode may return a successful empty array; bullet mode still requires exactly one valid edit. There are no fake fallback suggestions. All previous factual, numerical, qualifier, ownership, consent and scoring checks remain.

Errors now expose only controlled public messages and stable codes. Internal exceptions remain masked. Diagnostic logs allowlist provider/stage/model/status, safe request IDs, finish reason and schema issue paths/codes; they never log prompts, response text, raw upstream errors, credentials, input values or resume content. 429 may include bounded numeric Retry-After. The frontend displays the safe server message, keeps consent on failure for an explicit retry, and explains successful empty results.

No `.env` change is required. Keep `GROQ_MODEL=auto`, or optionally pin `openai/gpt-oss-20b`. The existing key/model access and actual generation were verified. Restart the backend after updating code. See [incident report and changed files](AI_SUGGESTION_FIX.md), [safe live summary](examples/groq-fix-live-check.json), and [API error codes](API_DOCUMENTATION.md#ai-error-codes).

An optional check uses only fictional data, a dedicated localhost database, and actual Groq quota:

```sh
# MongoDB must be available on localhost:27018.
node server/test/groq-live-check.mjs --live
```

It verifies model discovery, authenticated resume selection/match retrieval, explicit consent, keyword generation, persisted recommendations, a selected bullet if needed, manual edit/accept and deterministic recalculation. It removes its own fictional records and saves only safe summary metadata. Automated tests never invoke it or make live Groq calls.

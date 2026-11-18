# AI keyword suggestion 502 investigation — November 11, 2026

## Evidence and root cause

The original Pino line reports the HTTP outcome, not the Groq cause. Its original request/response was not retained, so that historical validator branch cannot be proven from the supplied log alone. No private resume was replayed or sent to Groq.

Using the existing key and `GROQ_MODEL=auto`, the actual models API selected the accessible `openai/gpt-oss-20b`. Initial minimal and fuller fictional calls succeeded. A fictional skills-only resume then reproduced a **1,514 ms** generation whose valid JSON contained `section:"skills"` twice. Only projects/workExperience/null are editable target sections. Zod rejected suggestions[0].section and suggestions[1].section; validateSuggestions raised 502. This captured fictional response is the regression fixture groq-invalid-target.json.

A full authenticated fictional workflow also reproduced a **1,489 ms** 502: a valid chosen bullet was missing from its evidenceIds. The existing guard correctly rejected the uncited edit. These are response-contract/validation failures; the successful metadata/generation checks do not support blaming the key, a retired model or a rate limit. No authentication, rate-limit, model-unavailability, network or Groq server error occurred in the successful final live check. Those error classes are tested using injected failures.

Previously the adapter requested JSON Object Mode with a prose pseudo-schema. It guaranteed JSON syntax, not target/citation consistency. The shared 5xx handler replaced the deliberate safe validation message with “Something went wrong”; Pino lacked validation stage/code. [Groq structured-output documentation](https://console.groq.com/docs/structured-outputs) distinguishes JSON syntax mode from strict schema enforcement.

## Final fix

- Use strict JSON Schema output for supported GPT-OSS models. Auto prefers 20b, then 120b; discovery checks active account-accessible model IDs and caches them for five minutes. Explicit pins are never silently replaced.
- Use a provider-only targetId whose enum contains actual editable evidence IDs. This ID is an explicit source citation; derive public section/index from the saved record. Additional evidence IDs are constrained to real sent evidence. This avoids independently generated section/index/citation fields drifting apart. A complex union schema was rejected by Groq's discriminator compiler during investigation; the final compact schema was accepted in the live check.
- Validate the wire schema, map to the existing public schema, then preserve all original keyword/job grounding, evidence, claim/number/qualifier, confirmation, consent and ownership guards. Strip proposed edit text from non-editable guidance; it cannot be applied. No fabricated suggestion fallback, no score algorithm changes.
- Permit an empty keyword result when no safe improvement exists; retain exactly one valid result for single-bullet mode.
- Classify access, quota, model/configuration, network, timeout, provider, schema/evidence and internal failures with safe messages/codes. Parse Groq SDK nested error envelopes. Log allowlisted metadata only; never raw provider messages/bodies, prompts or resume text. Disable automatic SDK retries so failed generations do not silently create additional billed attempts.
- Display useful server errors and empty results in the frontend. The browser test verifies error → explicit retry → suggestions → edit/accept → recalculate.

## Files modified

- server/src/services/ai/provider.js — strict request format, model selection, explicit target normalization and bounded generation.
- server/src/services/ai/errors.js — new safe provider error classifier.
- server/src/services/ai/guardrails.js — classified schema/evidence errors; factual checks retained.
- server/src/validation/ai.js — shared strict wire schema, four additional evidence IDs plus the explicit target citation; empty keyword result support.
- server/src/routes/ai.js — classification context, safe configuration diagnostics and bullet-result validation.
- server/src/middleware/errors.js — controlled AI public errors and allowlisted diagnostics; generic exceptions stay private.
- client/src/lib/api.js — useful client timeout message.
- client/src/pages/useOptimization.js, Optimization.jsx — meaningful generation/empty states.
- server/test/ai.test.js, ai-api.test.js — contract, guard, HTTP and diagnostics regressions.
- server/test/fixtures/groq-invalid-target.json — captured fictional reproduction.
- server/test/groq-live-check.mjs — explicit opt-in, isolated, fictional live API workflow.
- e2e/optimization.spec.js — safe error display/retry and complete optimization regression.
- docs/examples/groq-fix-live-check.json — safe successful live summary.
- README.md, docs/AI_INTEGRATION.md, API_DOCUMENTATION.md, TESTING.md and this report — updated behavior and verification.
- Existing docs/screenshots/*.png artifacts were regenerated by the unchanged screenshot steps in the browser suite.

## Results and setup

**86 backend/unit/API tests passed; all 6 Chromium journeys passed; Vite production build passed.** Tests use fixture providers and dedicated test databases. Responsive optimization checks cover 320/768/1024/1440 pixels.

The real Groq check used fictional data only and produced six keyword suggestions (four supported guidance entries, two learning gaps) with HTTP201. It additionally improved a selected bullet (201), manually edited/accepted it (200), and recalculated (200): **63.08% → 63.08%, change 0**, with the same M3 algorithm version. Source citations and claim guards remained active. Only safe summary metadata is stored in examples/groq-fix-live-check.json; its temporary fictional database records were removed.

No API key, dependency upgrade or `.env` modification is required. Keep GROQ_MODEL=auto; pinning openai/gpt-oss-20b is optional. Restart the backend (`npm run dev` from the repository root), select the current saved resume/match, open AI Optimization, consent and generate. Errors now explain the category instead of only a generic 502. Genuine gaps stay non-applicable; supported target edits can be reviewed and accepted, then recalculated. No deployment was performed.

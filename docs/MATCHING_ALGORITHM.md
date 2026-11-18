# Matching algorithm — implemented Milestone 3

ResumeIQ estimates resume-to-job alignment. It is **not an official employer ATS score or hiring probability**. The backend computes percentages; no LLM invents a score. Groq optimization is implemented separately in Milestone 4; job discovery remains deferred.

## Inputs and provenance

Analysis reads the latest persisted `Resume.structuredData`, not the original `extractedText` or unsaved browser edits. Current skills, projects, workExperience, education, certifications and achievements form the evidence corpus. Name/email fields are omitted. Each result stores the input resume revision and an evidence snapshot, full private job description, parsed requirements, weights, algorithm version, similarity method/model, limitations, and consent metadata. Later corrections do not mutate old results. A version/existence check rejects in-flight resume changes with 409.

## Parsing and normalization

Job requirements use explicit Required/Requirements/Minimum Qualifications and Preferred/Nice-to-have headings, or explicit mandatory/preferred wording. Responsibilities are preserved as literal clauses. Skill source clauses are returned in `skillEvidence`. Unscoped, negated, conflicting mixed-scope and multi-skill OR alternatives remain ambiguous rather than becoming invented mandatory requirements. Ambiguous skills are excluded from coverage and disclosed. Preferred skills also required elsewhere are counted only in required skills.

Reuse Milestone 2 aliases: JS→JavaScript, ReactJS→React, Node→Node.js, Mongo→MongoDB, Postgres→PostgreSQL. Canonical matching uses token boundaries so Java does not match JavaScript, and C++, C# and .NET stay distinct. Evidence contains the saved field name and literal text. Explicit simple negations are excluded from supporting evidence. Skills remain claims/mentions, not independently verified qualifications. The technology vocabulary is finite; unfamiliar technologies are not inferred.

Degree requirements support diploma, associate, bachelor, master and doctorate plus recognized explicit fields (computer science, software engineering, information technology, mathematics, business, engineering). A matching field and at least the requested degree level must appear in saved education. In-progress/expected qualifications are not treated as completed. Alternative/equivalent or unrecognized fields are marked unevaluable and disclosed. Named credentials currently support PMP, CISSP, AWS Certified Solutions Architect, AWS Certified Developer and Certified Kubernetes Administrator/CKA. They must appear in saved certifications, not merely skills; preparation/training/in-progress/expired mentions do not earn credit. Unknown certifications/licenses remain manual-review gaps, excluded from the automatic denominator.

## Formula and default weights

Each applicable component has score `s_i` in [0,100], nonnegative weight `w_i`, and applicability `a_i` in {0,1}:

**Overall = round2( Σ(a_i × w_i × s_i) / Σ(a_i × w_i) ).**

Effective weight = `100 × w_i / Σ(applicable weights)`; contribution in percentage points = `w_i × s_i / Σ(applicable weights)`. Scores, effective weights and contributions are shown rounded to two decimals. The overall skill-weighted calculation uses unrounded skill ratios; experience relevance uses displayed two-decimal pairwise overlap. Display rounding can make sums differ slightly. If all nonzero-weight components are unevaluable, overallScore is null and interpretation is Insufficient information.

| Component key   | Initial weight | Actual calculation                                                                                                                          |
| --------------- | -------------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| requiredSkills  |             35 | 100 × canonical required skills with saved evidence / unique required skills                                                                |
| experience      |             25 | Arithmetic mean of best saved project/work TF-IDF relevance and mandatory explicit-year coverage, considering only applicable subcomponents |
| semantic        |             20 | 100 × clamped cosine of configured embeddings when consented/available; otherwise local TF-IDF cosine, prominently labeled fallback         |
| preferredSkills |             10 | 100 × canonical preferred skills with saved evidence / unique preferred skills                                                              |
| qualifications  |             10 | 100 × matched automatically evaluable mandatory degree/credential requirements / automatically evaluable mandatory qualifications           |

Absence of a job requirement makes a component inapplicable. Absence of resume evidence for an applicable requirement earns **zero**, not weight redistribution or full credit. A missing required skill, absent education, or no project/work evidence cannot receive perfect coverage. Configuration may explicitly set a component weight to zero.

Experience duration only uses explicit numeric years in saved workExperience entries that mention all recognized skills in that requirement. A range uses its lower bound; decimals are supported; overlapping job dates and project durations are not added or inferred. Missing explicit years score zero. Best project/work relevance is the maximum pairwise lexical overlap against the job description, only applicable when responsibilities are recognized. Returned relevant entries are the top five positive matches per section. This is a heuristic and does not verify seniority, employment duration or accomplishment quality.

Example redistribution: requiredSkills=0, semantic=100, all other components not applicable ⇒ `(35×0 + 20×100)/(35+20) = 36.36`. The missing required evidence remains zero. With all five components applicable and values `[100,0,50,100,100]`, the known weighted result is 65.00 (covered by a unit test).

## Local TF-IDF fallback

Canonicalize technology aliases in prose; lowercase; tokenize Unicode words while preserving C++, C#, .NET and technology punctuation; remove a fixed stop-word list. For each pair of documents:

- `tf(t,d) = count(t,d) / total retained tokens(d)`.
- `idf(t) = ln((1+N)/(1+df(t))) + 1`, with N=2.
- Vector component = tf × idf; cosine = dot(A,B)/(norm(A)×norm(B)).
- Zero vectors or disjoint vocabularies score zero. Clamp results to [0,1].

The semantic component uses the full pasted job description against the saved evidence corpus (or structured job text for direct engine callers). Local mode is lexical similarity, **not embedding-based semantic understanding**. It does not understand paraphrases, negation or employer screening rules. It remains operational without a key or network connection. The baseline is deterministic for fixed input and configuration.

## Optional embeddings and consent

Default `EMBEDDING_PROVIDER=disabled`. To enable, set `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL` (default text-embedding-3-small), and backend-only `OPENAI_API_KEY`. The form discloses provider/model/data fields and requires a fresh, unchecked-by-default per-analysis consent checkbox. A configured provider alone never sends private text.

The adapter uses the [official embeddings request contract](https://developers.openai.com/api/reference/resources/embeddings/methods/create): two inputs, model, and float encoding. It omits identity fields and redacts detected email/phone-like snippets; redaction is best effort, not anonymization. Input size is bounded to 6,000 UTF-8 bytes per document without silent truncation; timeout is eight seconds. Provider errors, excess input or invalid/zero/mismatched vectors trigger a disclosed TF-IDF fallback. Redirects are disabled. Error bodies/keys/text/vectors are not logged or exposed. Only the computed cosine, actual method/model and consent metadata are stored. No raw embedding vectors or global cache are retained.

Model ID and actual similarity method are included in algorithmVersion; remote model internals may change, so historical snapshots remain the source of truth and scores from different versions/methods should not be treated as directly comparable. The backend aggregation remains deterministic given the same vectors/configuration; no live provider call occurs in automated tests.

## Configuration and versioning

`server/src/config/scoring.js` validates the five weight keys. Optional `MATCH_WEIGHTS_JSON` replaces all weights, for example:

```dotenv
MATCH_WEIGHTS_JSON={"requiredSkills":35,"experience":25,"semantic":20,"preferredSkills":10,"qualifications":10}
```

Values must be finite, nonnegative, at most 100, with at least one positive. Invalid configuration fails startup. `hybrid-v1:w<12-character-config-hash>:tfidf-v1` or `hybrid-v1:w<hash>:embeddings:<model>` identifies the implementation, weight snapshot and actual similarity path. Future scoring behavior changes must increment the implementation version, not silently overwrite historical results.

## Interpretation, confidence and limitations

80–100 strong; 60–<80 good; 40–<60 partial; 0–<40 low. Below 50 the UI explicitly offers the AI Optimization workspace. Suggestions are available at any score and require consent; none are fabricated when the provider is unavailable.

Confidence is an explicit heuristic, not a calibrated probability: medium requires recognized mandatory skills, explicit responsibilities, no remaining ambiguous skills, and a reviewed resume; otherwise low. It never claims high confidence. Sparse descriptions, finite dictionaries, manual-review qualifications, unreviewed parsing and provider fallback are disclosed in limitations.

Unknown requirements, complex alternatives, unusual headings, unsupported education abbreviations, incidental/negative skill mentions and lexical overlap can under/overstate real suitability. This is an explainable baseline, not a trained ranking system or a guarantee of meeting every requirement. See the calculated [fixture output](examples/match-analysis.json) for a complete real engine result.

## Milestone 4 score comparisons

`server/src/services/ai/recalculate.js` calls the existing scoreMatch function for the original snapshot and an accepted-edit draft. It reconstructs the original weight configuration, pins the original job inputs, method and algorithmVersion, and refuses to compare when the baseline cannot be reproduced. No LLM percentage is accepted. Skill-gap guidance never changes data; rejected/unaccepted suggestions cannot enter a draft. Confirmed factual additions are recorded explicitly and validated against supplied evidence; user confirmation is not independent fact verification.

The comparison returns original/revised values and `round2(revised-original)` percentage points, plus full components, remaining gaps and applied source edits. New versions require an explicit reviewed previewHash. Local TF-IDF does not call Groq/OpenAI during recalculation. Embedding-based originals require fresh embedding consent and the original model; unavailable provider, fallback or drift returns an error instead of changing methods to inflate a result. The original Resume and analysis stay unchanged.

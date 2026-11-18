# Resume parsing — Milestone 2

## Setup

Run `npm ci` from the repository root to install the lockfile dependencies. Keep the existing backend `.env`, JWT secret and MongoDB connection. No AI key, external parsing service, OCR engine, or temporary-upload directory is required. Use the exact CLIENT_URL browser origin; the environment example uses http://127.0.0.1:5173. Run the existing `npm run dev` command.

## Pipeline

1. Existing CSRF guard and JWT/session authentication protect the request.
2. Limit concurrent uploads to two per API instance; Multer accepts a single in-memory `resume` file. Enforce an inclusive 5 MiB maximum (5,242,880 bytes). No uploaded file is written to disk.
3. Inspect magic bytes and require a matching .pdf/.docx extension. Do not trust the client MIME type. DOCX additionally requires a valid ZIP, the Word document content type and main document XML. Reject encrypted archives, macro parts, duplicates and malformed XML; inspect XML with saxes and reject DTD/entity declarations. yauzl validates archive entries without extracting them to paths.
4. Run extraction in a worker thread: pdf-parse for PDF and Mammoth extractRawText for DOCX. Terminate after 15 seconds. Worker V8 heap limits are 128 MiB old generation / 32 MiB young generation; these are not a hard total-process/native-memory sandbox. Upload buffers and parser resources are discarded after processing, including failure. Parser stdout/stderr and exception text are suppressed to avoid leaking private content into logs.
5. Extract structured information with deterministic rules, save MongoDB data linked to the signed-in owner, and return a preview. No external AI processing occurs.

The extraction APIs follow [pdf-parse](https://www.npmjs.com/package/pdf-parse) and [Mammoth raw-text extraction](https://github.com/mwilliamson/mammoth.js#extracting-raw-text). Upload limits follow the [Multer middleware contract](https://expressjs.com/en/resources/middleware/multer/).

## Limits and supported formats

PDF: text-based, unencrypted, up to 100 pages. DOCX: standard UTF-8 XML in a Word Open XML archive, at most 500 entries, 20 MiB total expanded data, 4 MiB per XML/relationship part. Parsed text: at most 100,000 characters. Larger/unsupported documents return 422; compressed size alone does not determine safety. ZIP entries are streamed and actual expanded bytes are bounded before Mammoth opens the archive. Legacy .doc, macro-enabled .docm, images and arbitrary ZIP files are unsupported. Strict XML validation may reject a document Word would repair; exporting a fresh PDF/DOCX is the supported recovery.

OCR is not implemented. Scanned/image-only PDFs may yield no readable text: save a needs_review record, explain the OCR limitation, and allow manual entry or a new text-based upload. Do not call a document successfully understood merely because its file container was valid.

## Structured rules and limits

A plausible leading two-to-five-token name and the first explicit email are extracted; ambiguous headers leave a blank name. Standard section headings (including inline `Skills: ...`) route literal text lines into education, skills, projects, workExperience, certifications and achievements. Name max 150 characters; email max 254. Arrays have at most 100 entries, with 120 characters per skill and 2,000 per other entry. If extraction shortens/omits oversized section entries, the original text remains available and a warning is added. Corrections must fit the API's 256 KiB JSON body limit.

Known technology mentions use token boundaries and canonical aliases (ReactJS→React, JS→JavaScript, Node→Node.js, Mongo→MongoDB); C++, C# and .NET remain distinct. Explicit unknown skill labels in a skill section are retained. Skill mentions are not verified qualifications. Review and remove incidental/negated terms before confirming the preview. Dates, achievements, years of experience, degrees and certifications are never generated or inferred. There is no matching score in this milestone.

Multi-column PDF reading order, embedded fonts, unusual headings, languages and complex tables may cause missing or misgrouped information. This is conservative heuristic extraction, not semantic understanding. Unrecognized content is still available in the original extracted text. Users correct arrays with one entry per line; empty fields are allowed. Saving preserves extractedText, canonicalizes skill aliases, marks reviewed, and atomically increments the revision counter. Historical optimized versions are a future feature.

## Privacy and retention

Only parsed text, structured information, safe filename metadata and parsing notes are retained in MongoDB. Queries, dashboard counts and deletes are scoped to authenticated userId. Responses use no-store; React renders text rather than document HTML. Server logs omit multipart bodies and parser output. The original upload cannot be downloaded because it is not retained. Delete from the resume detail screen to remove the parsed record. Account-wide deletion, scheduled retention and backup-expiry policy remain future work.

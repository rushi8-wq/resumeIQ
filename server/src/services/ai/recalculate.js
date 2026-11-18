import { createHash } from 'node:crypto';
import { HttpError } from '../../middleware/errors.js';
import { scoringConfig } from '../../config/scoring.js';
import { scoreMatch } from '../matching/score.js';
import { round as roundNumber } from '../matching/text.js';
import { createEmbeddingProvider } from '../matching/embeddings.js';
import { assertAccepted } from './guardrails.js';
export async function recalculate(
  analysis,
  job,
  suggestions,
  env,
  { embeddingConsent = false, identity = {} } = {},
) {
  const config = scoringConfig({
    MATCH_WEIGHTS_JSON: JSON.stringify(analysis.weights),
  });
  if (!analysis.algorithmVersion.startsWith(config.version + ':'))
    throw new HttpError(
      409,
      'This analysis uses an incompatible scoring version. Run a new match first.',
    );
  const original = structuredClone(analysis.resumeSnapshot.structuredData);
  const revised = { ...identity, ...structuredClone(original) };
  const targets = new Set();
  const appliedChanges = [];
  for (const s of suggestions) {
    if (s.status !== 'accepted')
      throw new HttpError(
        400,
        'Only accepted suggestions can enter a score preview.',
      );
    const text = s.editedText || s.suggestedText;
    assertAccepted(s, text, s.confirmed, s.confirmationEvidence);
    const key = s.section + ':' + s.index;
    if (targets.has(key))
      throw new HttpError(
        409,
        'Multiple accepted suggestions target the same bullet. Keep one and reject or revert the others.',
      );
    targets.add(key);
    if (revised[s.section]?.[s.index] !== s.originalText)
      throw new HttpError(
        409,
        'The suggestion source does not match the analysis snapshot. Request fresh suggestions.',
      );
    revised[s.section][s.index] = text;
    appliedChanges.push({
      suggestionId: s.id,
      revision: s.revision,
      keyword: s.keyword,
      section: s.section,
      index: s.index,
      originalText: s.originalText,
      revisedText: text,
      verificationStatus: s.verificationStatus,
      confirmed: s.confirmed,
      confirmationEvidence: s.confirmationEvidence,
    });
  }
  let provider = null;
  let consent = false;
  if (analysis.semantic.method === 'embeddings') {
    if (!embeddingConsent)
      throw new HttpError(
        403,
        'Fresh embedding consent is required to recalculate this embedding-based analysis.',
      );
    provider = createEmbeddingProvider({
      ...env,
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_MODEL: analysis.semantic.model,
    });
    consent = true;
    if (!provider)
      throw new HttpError(
        503,
        'The original embedding provider is unavailable. Recalculate an explicitly local match instead.',
      );
  } else if (analysis.semantic.method !== 'tfidf-v1')
    throw new HttpError(
      409,
      'Unsupported original scoring method. Run a new match.',
    );
  const requirements = {
    ...job.parsedRequirements,
    sourceText: job.description,
  };
  const options = {
    config,
    provider,
    consent,
    resumeReviewed: analysis.resumeSnapshot.parsingStatus === 'reviewed',
  };
  const baseline = await scoreMatch(original, requirements, options);
  const result = await scoreMatch(revised, requirements, options);
  if (
    baseline.algorithmVersion !== analysis.algorithmVersion ||
    result.algorithmVersion !== analysis.algorithmVersion ||
    baseline.overallScore !== analysis.overallScore
  )
    throw new HttpError(
      409,
      'The original score or model cannot be reproduced exactly. No misleading comparison was saved; run a new match.',
    );
  const previewHash = createHash('sha256')
    .update(
      JSON.stringify({
        analysisId: analysis.id,
        sourceRevision: analysis.resumeSnapshot.version,
        algorithmVersion: result.algorithmVersion,
        appliedChanges,
        revised,
      }),
    )
    .digest('hex');
  return {
    revisedStructuredData: revised,
    appliedChanges,
    originalScore: analysis.overallScore,
    revisedScore: result.overallScore,
    improvement:
      analysis.overallScore === null || result.overallScore === null
        ? null
        : roundNumber(result.overallScore - analysis.overallScore),
    algorithmVersion: result.algorithmVersion,
    weights: analysis.weights,
    revisedAnalysis: result,
    previewHash,
  };
}

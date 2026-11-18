import { extractSkills, normalizeSkills } from '../parsing/structured.js';
import { tfidfSimilarity, hasPositiveMention, round, tokens } from './text.js';
import { degree, credentialMention } from './jobParser.js';
import { scoringConfig } from '../../config/scoring.js';
export const DISCLAIMER =
  'Estimated resume-to-job alignment, not an official ATS score or hiring probability.';
export function resumeEvidence(data) {
  return [
    'skills',
    'projects',
    'workExperience',
    'education',
    'certifications',
    'achievements',
  ].flatMap((section) =>
    (data[section] || []).filter(Boolean).map((text) => ({ section, text })),
  );
}
export function skillCoverage(requirements, evidence) {
  const matched = [],
    missing = [];
  for (const skill of normalizeSkills(requirements)) {
    const support = evidence.filter(
      (e) =>
        (extractSkills(e.text).includes(skill) ||
          normalizeSkills([e.text]).includes(skill)) &&
        hasPositiveMention(e.text, skill),
    );
    if (support.length) matched.push({ skill, evidence: support.slice(0, 3) });
    else missing.push(skill);
  }
  return {
    matched,
    missing,
    score: requirements.length
      ? (100 * matched.length) / normalizeSkills(requirements).length
      : null,
  };
}
export function weightedScore(values, weights) {
  const applicable = Object.entries(weights).filter(
    ([key, w]) => w > 0 && values[key] !== null && Number.isFinite(values[key]),
  );
  const total = applicable.reduce((sum, [, w]) => sum + w, 0);
  const componentScores = Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => {
      const active =
        total > 0 &&
        weight > 0 &&
        values[key] !== null &&
        Number.isFinite(values[key]);
      const score = active ? Math.max(0, Math.min(100, values[key])) : null;
      return [
        key,
        {
          score: score === null ? null : round(score),
          applicable: active,
          baseWeight: weight,
          effectiveWeight: active ? round((100 * weight) / total) : 0,
          contribution: active ? round((score * weight) / total) : 0,
        },
      ];
    }),
  );
  return {
    overallScore: total
      ? round(
          applicable.reduce(
            (sum, [key, w]) =>
              sum + Math.max(0, Math.min(100, values[key])) * w,
            0,
          ) / total,
        )
      : null,
    componentScores,
  };
}
export async function scoreMatch(
  data,
  requirements,
  {
    config = scoringConfig(),
    provider = null,
    consent = false,
    resumeReviewed = true,
  } = {},
) {
  const evidence = resumeEvidence(data);
  const resumeText = evidence.map((e) => e.text).join('\n');
  const required = skillCoverage(requirements.requiredSkills, evidence);
  const preferred = skillCoverage(requirements.preferredSkills, evidence);
  const jobText = [
    ...requirements.requiredSkills,
    ...requirements.preferredSkills,
    ...requirements.responsibilities,
    ...requirements.experience.map((e) => e.text),
    ...requirements.education.map((e) => e.text),
    ...(requirements.certifications || []).map((e) => e.text),
  ].join('\n');
  // Caller supplies the full job text only when there is no structured requirement content.
  const target = requirements.sourceText || jobText || '';
  const lexical = tfidfSimilarity(resumeText, target);
  let similarity = lexical;
  let semanticMethod = 'tfidf-v1';
  let model = null;
  const limitations = [
    ...requirements.limitations,
    'Text overlap measures vocabulary relevance; it does not verify skills, tenure, seniority, or hiring suitability.',
  ];
  if (provider && consent && resumeText && target) {
    try {
      const result = await provider.similarity(resumeText, target);
      similarity = result.value;
      semanticMethod = 'embeddings';
      model = result.model;
    } catch {
      limitations.push(
        'Embeddings were unavailable or the input exceeded provider limits. Local TF-IDF fallback was used.',
      );
    }
  } else
    limitations.push(
      provider
        ? 'External embedding processing was not consented to; local TF-IDF fallback was used.'
        : 'Embeddings are not configured; local TF-IDF fallback was used.',
    );
  if (!resumeReviewed)
    limitations.push(
      'This resume has not been marked reviewed. Parsing errors can affect the result.',
    );
  const relevant = evidence
    .filter((e) => ['projects', 'workExperience'].includes(e.section))
    .map((e) => ({
      ...e,
      relevance: round(tfidfSimilarity(e.text, target) * 100),
    }))
    .sort((a, b) => b.relevance - a.relevance);
  const requiredYears = requirements.experience.filter((e) => e.required);
  const durationChecks = requiredYears.map((req) => {
    const entries = (data.workExperience || []).filter((text) =>
      req.skills.every(
        (skill) =>
          extractSkills(text).includes(skill) &&
          hasPositiveMention(text, skill),
      ),
    );
    const years = entries.flatMap((text) =>
      [
        ...text.matchAll(
          /(?<![\d.])(\d{1,2}(?:\.\d+)?)(?:\s*[-–]\s*\d{1,2}(?:\.\d+)?)?\+?\s+years?\b/gi,
        ),
      ].map((m) => Number(m[1])),
    );
    const demonstrated = years.length ? Math.max(...years) : 0;
    return {
      requirement: req.text,
      requiredYears: req.minimumYears,
      demonstratedYears: demonstrated,
      score: req.minimumYears
        ? Math.min(1, demonstrated / req.minimumYears) * 100
        : 0,
      evidence: entries.filter((t) => /\d+\+?\s+years?\b/i.test(t)),
      explanation:
        'Only explicitly stated years in saved work experience are counted; dates and project durations are not converted into tenure.',
    };
  });
  const relevance = requirements.responsibilities.length
    ? relevant[0]?.relevance || 0
    : null;
  const duration = durationChecks.length
    ? durationChecks.reduce((sum, c) => sum + c.score, 0) /
      durationChecks.length
    : null;
  const experience = [relevance, duration].filter((v) => v !== null);
  const experienceScore = experience.length
    ? experience.reduce((a, b) => a + b, 0) / experience.length
    : null;
  const levels = {
    diploma: 1,
    associate: 2,
    bachelor: 3,
    master: 4,
    doctorate: 5,
  };
  const qualificationChecks = [
    ...requirements.education,
    ...(requirements.certifications || []),
  ]
    .filter((e) => e.required)
    .map((req) => {
      if (Object.hasOwn(req, 'credential')) {
        const support = (data.certifications || []).filter((text) => {
          const mention =
            req.credential && credentialMention(text, req.credential);
          return (
            mention &&
            hasPositiveMention(text, mention) &&
            !/\b(?:prep|training|course|studying|candidate|pursuing|expired|in.progress)\b/i.test(
              text,
            )
          );
        });
        return {
          requirement: req.text,
          evaluable: req.evaluable,
          matched: req.evaluable && support.length > 0,
          evidence: req.evaluable ? support : [],
          explanation: req.evaluable
            ? 'The named credential must appear explicitly in saved certifications.'
            : 'Unrecognized certification or license requires manual verification and is excluded from scoring.',
        };
      }
      const support = (data.education || []).filter(
        (text) =>
          hasPositiveMention(text, req.degree) &&
          !/\b(?:pursuing|expected|in.progress|candidate|studying|ongoing)\b/i.test(
            text,
          ) &&
          levels[degree(text)] >= levels[req.degree] &&
          (!req.field || text.toLowerCase().includes(req.field)),
      );
      return {
        requirement: req.text,
        evaluable: req.evaluable,
        matched: req.evaluable && support.length > 0,
        evidence: req.evaluable ? support : [],
        explanation: req.evaluable
          ? 'Degree level and any recognized explicit field must be demonstrated in saved education.'
          : 'Alternative/equivalent or unrecognized qualification cannot be evaluated automatically.',
      };
    });
  const evaluable = qualificationChecks.filter((c) => c.evaluable);
  const qualifications = evaluable.length
    ? (100 * evaluable.filter((c) => c.matched).length) / evaluable.length
    : null;
  const values = {
    requiredSkills: required.score,
    experience: experienceScore,
    semantic: tokens(target).length ? similarity * 100 : null,
    preferredSkills: preferred.score,
    qualifications,
  };
  const explanations = {
    requiredSkills:
      required.score === null
        ? 'No explicit required technical skills were recognized.'
        : 'Exact canonical required skill coverage; absent evidence earns zero.',
    preferredSkills:
      preferred.score === null
        ? 'No explicit preferred technical skills were recognized.'
        : 'Exact canonical preferred skill coverage.',
    experience:
      experienceScore === null
        ? 'No assessable mandatory duration or explicit responsibilities were provided.'
        : 'Average of best project/work text relevance and mandatory explicit-years coverage, where applicable.',
    semantic:
      semanticMethod === 'embeddings'
        ? 'Clamped cosine similarity of configured provider embeddings.'
        : 'Local TF-IDF cosine similarity fallback; lexical overlap, not embedding-based semantic understanding.',
    qualifications:
      qualifications === null
        ? 'No automatically assessable mandatory qualification requirements were provided.'
        : 'Coverage of explicit degree levels/fields and recognized named certifications. Missing evidence earns zero.',
  };
  const weighted = weightedScore(values, config.weights);
  for (const [key, component] of Object.entries(weighted.componentScores))
    component.explanation = explanations[key];
  const overall = weighted.overallScore;
  const confidence =
    requirements.requiredSkills.length > 0 &&
    requirements.responsibilities.length > 0 &&
    requirements.ambiguousSkills.length === 0 &&
    resumeReviewed
      ? 'medium'
      : 'low';
  return {
    ...weighted,
    interpretation:
      overall === null
        ? 'Insufficient information'
        : overall >= 80
          ? 'Strong alignment'
          : overall >= 60
            ? 'Good alignment'
            : overall >= 40
              ? 'Partial alignment'
              : 'Low alignment',
    matchedSkills: { required: required.matched, preferred: preferred.matched },
    missingSkills: { required: required.missing, preferred: preferred.missing },
    skillCoverage: {
      required: required.score === null ? null : round(required.score),
      preferred: preferred.score === null ? null : round(preferred.score),
    },
    relevantProjects: relevant
      .filter((e) => e.section === 'projects' && e.relevance > 0)
      .slice(0, 5),
    relevantExperience: relevant
      .filter((e) => e.section === 'workExperience' && e.relevance > 0)
      .slice(0, 5),
    experienceChecks: durationChecks,
    qualificationChecks,
    qualificationGaps: qualificationChecks.filter((c) => !c.matched),
    confidence,
    limitations: [...new Set(limitations)],
    explanations: Object.values(explanations),
    semantic: {
      method: semanticMethod,
      model,
      localTfidfScore: round(lexical * 100),
      externalProcessingUsed: semanticMethod === 'embeddings',
    },
    algorithmVersion: `${config.version}:${semanticMethod}${model ? ':' + model : ''}`,
    weights: config.weights,
    disclaimer: DISCLAIMER,
  };
}

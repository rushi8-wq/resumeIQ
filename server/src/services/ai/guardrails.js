import { responseSchema } from '../../validation/ai.js';
import {
  normalizeSkill,
  extractSkills,
  canonicalizeSkillTerms,
} from '../parsing/structured.js';
import { hasPositiveMention } from '../matching/text.js';
import { HttpError, AIError } from '../../middleware/errors.js';
export function redact(text) {
  return text
    .replace(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[redacted-email]',
    )
    .replace(/\+?\d[\d ()-]{8,}\d/g, '[redacted-number]');
}
export function evidenceRecords(data) {
  return [
    'skills',
    'projects',
    'workExperience',
    'education',
    'certifications',
    'achievements',
  ].flatMap((section) =>
    (data[section] || []).map((text, index) => ({
      id: `${section}:${index}`,
      section,
      index,
      text,
    })),
  );
}
const aliases = {
  built: 'developed',
  created: 'developed',
  build: 'developed',
  develop: 'developed',
  developing: 'developed',
  developed: 'developed',
  app: 'application',
  apps: 'application',
  applications: 'application',
  using: 'use',
  uses: 'use',
  used: 'use',
  use: 'use',
  implemented: 'implemented',
  implementing: 'implemented',
};
const connectors = new Set(
  'a an the and with for of in on to by as through using use that which this these into from via'.split(
    ' ',
  ),
);
function claimTokens(text) {
  return (
    canonicalizeSkillTerms(text)
      .toLowerCase()
      .match(/\.net|c\+\+|c#|[\p{L}\p{N}]+(?:[./-][\p{L}\p{N}]+)*/gu) || []
  )
    .map((t) => aliases[t] || t)
    .filter((t) => !connectors.has(t));
}
export function validateEdit(original, revised, confirmation = '') {
  const issues = [];
  if (!revised.trim()) return ['An accepted edit cannot be empty.'];
  const numbers = (t) => t.match(/\d+(?:[.,]\d+)?%?/g) || [];
  if (JSON.stringify(numbers(original)) !== JSON.stringify(numbers(revised)))
    issues.push(
      'Numerical claims must remain identical to the original bullet.',
    );
  const qualifiers = [
    'no',
    'not',
    'without',
    'never',
    'prep',
    'training',
    'expected',
    'pursuing',
    'candidate',
    'studying',
    'assisted',
    'learning',
    'intern',
    'internship',
    'junior',
    'trainee',
    'volunteer',
    'contract',
    'supporting',
    'contributed',
  ];
  for (const qualifier of qualifiers) {
    const pattern = new RegExp(
      '(?:^|[^a-z])' + qualifier + '(?=$|[^a-z])',
      'i',
    );
    if (pattern.test(original) && !pattern.test(revised))
      issues.push('Preserve factual qualifiers such as ' + qualifier + '.');
  }
  const allowed = new Set(claimTokens(original + ' ' + confirmation));
  const added = [
    ...new Set(claimTokens(revised).filter((t) => !allowed.has(t))),
  ];
  if (added.length)
    issues.push(
      'New factual terms need explicit supporting confirmation: ' +
        added.join(', '),
    );
  const originalSkills = new Set(extractSkills(original + ' ' + confirmation));
  if (extractSkills(revised).some((s) => !originalSkills.has(s)))
    issues.push(
      'A technology is not demonstrated in this bullet or confirmed evidence.',
    );
  if (
    /https?:|ignore (?:previous|system)|system prompt|<script|api[_ -]?key/i.test(
      revised,
    )
  )
    issues.push('Unsafe or instructional content cannot be applied.');
  return issues;
}
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function phrasePresent(text, keyword) {
  const normalized = canonicalizeSkillTerms(text).toLowerCase();
  const term = escape(canonicalizeSkillTerms(keyword).toLowerCase());
  return (
    new RegExp('(?:^|[^a-z0-9_])' + term + '(?=$|[^a-z0-9_])', 'i').test(
      normalized,
    ) && hasPositiveMention(text, normalizeSkill(keyword))
  );
}
export function preparePayload(
  analysis,
  job,
  { mode = 'keywords', section, index } = {},
) {
  const all = evidenceRecords(analysis.resumeSnapshot.structuredData);
  const records =
    mode === 'bullet'
      ? all.filter((e) => e.section === section && e.index === index)
      : all.slice(0, 30);
  const input = {
    mode,
    requirements: {
      requiredSkills: job.parsedRequirements.requiredSkills,
      preferredSkills: job.parsedRequirements.preferredSkills,
      responsibilities: job.parsedRequirements.responsibilities
        .slice(0, 10)
        .map(redact),
      skillEvidence: job.parsedRequirements.skillEvidence
        .slice(0, 30)
        .map((e) => ({ ...e, text: redact(e.text) })),
    },
    missingSkills: analysis.missingSkills,
    evidence: records.map((e) => ({ ...e, text: redact(e.text) })),
    ...(mode === 'bullet' ? { selectedBullet: `${section}:${index}` } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 24000)
    throw new HttpError(
      413,
      'The evidence is too large for an AI request. Optimize a single shorter bullet instead.',
    );
  return { payload: input, records };
}
export function validateSuggestions(
  raw,
  analysis,
  job,
  records,
  { section, index } = {},
) {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success)
    throw new AIError(
      502,
      'AI_SCHEMA_INVALID',
      'Groq returned suggestions in an invalid format. No suggestions were saved. Please try again.',
      { stage: 'schema', validationIssues: parsed.error.issues },
    );
  const all = evidenceRecords(analysis.resumeSnapshot.structuredData);
  const recordMap = new Map(records.map((e) => [e.id, e]));
  const required = job.parsedRequirements.requiredSkills;
  const preferred = job.parsedRequirements.preferredSkills;
  return parsed.data.suggestions.map((item) => {
    const keyword = normalizeSkill(item.keyword);
    const isRequired = required.includes(keyword),
      isPreferred = preferred.includes(keyword);
    if (
      !isRequired &&
      !isPreferred &&
      !phrasePresent(job.description, item.keyword)
    )
      throw new AIError(
        502,
        'AI_EVIDENCE_INVALID',
        'Groq proposed a keyword absent from this job. No suggestions were saved.',
      );
    // Persist an authoritative source clause rather than an LLM paraphrase/citation.
    const requirement =
      job.parsedRequirements.skillEvidence.find(
        (e) =>
          e.skill === keyword &&
          e.classification === (isRequired ? 'required' : 'preferred'),
      )?.text ||
      job.parsedRequirements.responsibilities.find((text) =>
        phrasePresent(text, item.keyword),
      ) ||
      job.description;
    if (item.evidenceIds.some((id) => !recordMap.has(id)))
      throw new AIError(
        502,
        'AI_EVIDENCE_INVALID',
        'Groq cited nonexistent evidence. No suggestions were saved.',
      );
    if ((item.section === null) !== (item.index === null))
      throw new AIError(
        502,
        'AI_TARGET_INVALID',
        'Groq returned an invalid bullet target. No suggestions were saved.',
        { stage: 'target' },
      );
    const target = item.section
      ? all.find((e) => e.section === item.section && e.index === item.index)
      : null;
    if (item.section && !target)
      throw new AIError(
        502,
        'AI_TARGET_INVALID',
        'Groq targeted a nonexistent resume bullet. No suggestions were saved.',
        { stage: 'target' },
      );
    if (section && (item.section !== section || item.index !== index))
      throw new AIError(
        502,
        'AI_EVIDENCE_INVALID',
        'Groq edited a different bullet. No edit was saved.',
      );
    const cited = item.evidenceIds.map((id) => recordMap.get(id));
    const direct = cited.some((e) => phrasePresent(e.text, keyword));
    let verificationStatus = item.verificationStatus;
    const guardNotes = [];
    if (!direct && verificationStatus === 'supported') {
      verificationStatus = cited.length ? 'confirmation_required' : 'skill_gap';
      guardNotes.push(
        'The claimed support was not present in the cited evidence.',
      );
    }
    if (!cited.length) verificationStatus = 'skill_gap';
    const problems =
      target && item.suggestedText
        ? validateEdit(target.text, item.suggestedText)
        : [];
    if (problems.length && verificationStatus === 'supported') {
      verificationStatus = 'confirmation_required';
      guardNotes.push(...problems);
    }
    if (target && item.suggestedText && !item.evidenceIds.includes(target.id))
      throw new AIError(
        502,
        'AI_EVIDENCE_INVALID',
        'The proposed edit does not cite its source bullet.',
      );
    return {
      keyword,
      importance: isRequired
        ? 'required'
        : isPreferred
          ? 'preferred'
          : item.importance,
      category: isRequired
        ? 'required_skill'
        : isPreferred
          ? 'preferred_skill'
          : 'domain_terminology',
      explanation: item.explanation,
      requirement: requirement.slice(0, 2000),
      evidence: cited.map((e) => ({
        id: e.id,
        section: e.section,
        index: e.index,
        text: e.text,
      })),
      section: verificationStatus === 'skill_gap' ? null : item.section,
      index: verificationStatus === 'skill_gap' ? null : item.index,
      originalText:
        verificationStatus === 'skill_gap' ? '' : target?.text || '',
      suggestedText:
        verificationStatus === 'skill_gap' ? '' : item.suggestedText,
      verificationStatus,
      guardNotes,
    };
  });
}
export function assertAccepted(suggestion, text, confirmed, evidence) {
  if (suggestion.verificationStatus === 'skill_gap')
    throw new HttpError(
      400,
      'Skill gaps are learning recommendations and cannot be applied to a resume.',
    );
  if (!suggestion.section || !suggestion.originalText)
    throw new HttpError(400, 'This suggestion has no editable source bullet.');
  const baselineIssues = validateEdit(suggestion.originalText, text);
  const needsConfirmation =
    suggestion.verificationStatus === 'confirmation_required' ||
    baselineIssues.length > 0;
  if (needsConfirmation && (!confirmed || evidence.trim().length < 20))
    throw new HttpError(
      400,
      'Confirm the actual experience and supply at least 20 characters of factual supporting evidence before accepting.',
    );
  if (
    needsConfirmation &&
    /\b(?:will|planning|plan to|want to|hope to|future|intend|would like|not|no|didn't|didn’t|don't|doesn't|haven't|never|without|lack)\b/i.test(
      evidence,
    )
  )
    throw new HttpError(
      400,
      'Confirmation must describe real demonstrated experience, not a future learning plan or a denial of experience.',
    );

  const problems = validateEdit(
    suggestion.originalText,
    text,
    needsConfirmation ? evidence : '',
  );
  if (problems.length) throw new HttpError(400, problems.join(' '));
  return needsConfirmation;
}

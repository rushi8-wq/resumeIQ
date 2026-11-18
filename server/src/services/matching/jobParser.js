import { extractSkills, normalizeSkills } from '../parsing/structured.js';
const preferred =
  /\b(preferred|optional|nice[- ]to[- ]have|bonus|desirable|ideally)\b/i;
const required =
  /\b(required|require|must|mandatory|minimum|essential|need(?:ed)?|at least)\b/i;
const responsibility =
  /^(responsibilities|what you(?:'ll| will) do|your role|duties|about the role)\s*:?$/i;
const credentials = [
  ['PMP', /\bpmp\b/i],
  ['CISSP', /\bcissp\b/i],
  [
    'AWS Certified Solutions Architect',
    /\baws certified solutions architect\b/i,
  ],
  ['AWS Certified Developer', /\baws certified developer\b/i],
  [
    'Certified Kubernetes Administrator',
    /\b(?:certified kubernetes administrator|cka)\b/i,
  ],
];
export function credentialMention(text, credential) {
  return (
    text.match(
      credentials.find(([name]) => name === credential)?.[1] || /(?!) /,
    )?.[0] || null
  );
}
const fieldNames = [
  'computer science',
  'software engineering',
  'information technology',
  'mathematics',
  'business',
  'engineering',
];
export function degree(text) {
  const kind = /ph\.?d|doctorate|doctoral/i.test(text)
    ? 'doctorate'
    : /\bmasters?\b|master's|\bm\.?sc?\.?\b/i.test(text)
      ? 'master'
      : /\bbachelors?\b|bachelor's|\bb\.?sc?\.?\b|\bbtech\b|\bb\.tech\b/i.test(
            text,
          )
        ? 'bachelor'
        : /associate/i.test(text)
          ? 'associate'
          : /diploma/i.test(text)
            ? 'diploma'
            : null;
  return kind;
}
export function parseJob(description) {
  const result = {
    requiredSkills: [],
    preferredSkills: [],
    ambiguousSkills: [],
    programmingLanguages: [],
    frameworks: [],
    toolsAndPlatforms: [],
    education: [],
    certifications: [],
    experience: [],
    responsibilities: [],
    skillEvidence: [],
    limitations: [],
  };
  let section = null;
  const lines = description
    .replace(/\r\n?/g, '\n')
    .split(/\n|;|(?<=[!?])\s+/)
    .map((s) => s.replace(/^[\s•*\-]+/, '').trim())
    .filter(Boolean);
  for (const original of lines) {
    const colon = original.match(/^([^:]{2,60}):\s*(.*)$/);
    const heading = colon ? colon[1] : original;
    if (
      /^(required skills|requirements|minimum qualifications|required certifications|qualifications|must[- ]haves?|essential skills|what you bring)$/i.test(
        heading,
      )
    ) {
      section = 'required';
      if (!colon?.[2]) continue;
    } else if (
      /^(preferred skills|preferred qualifications|preferred certifications|nice[- ]to[- ]haves?|bonus skills|desirable)$/i.test(
        heading,
      )
    ) {
      section = 'preferred';
      if (!colon?.[2]) continue;
    } else if (responsibility.test(heading)) {
      section = 'responsibilities';
      if (!colon?.[2]) continue;
    } else if (
      /^(about us|benefits|our stack|tech stack|technology stack|about the company)$/i.test(
        heading,
      )
    ) {
      section = null;
      if (!colon?.[2]) continue;
    }
    const line = colon && heading !== original ? colon[2] : original;
    if (!line) continue;
    // Independently scoped clauses handle common mixed required/preferred sentences.
    const clauses = line.split(
      /\s+but\s+|,\s*(?=(?:preferred|optional|nice[- ]to[- ]have|bonus)\b)/i,
    );
    for (const clause of clauses) {
      const skills = extractSkills(clause);
      const optional = preferred.test(clause);
      const mandatory = required.test(clause);
      const negated =
        /\b(?:not required|not mandatory|not needed|must not|do not|no .{0,50} required)\b/i.test(
          clause,
        );
      const mixed =
        (optional && mandatory && !negated) ||
        (skills.length > 1 && /\bor\b/i.test(clause));
      const mode = negated
        ? 'ambiguous'
        : mixed
          ? 'ambiguous'
          : optional
            ? 'preferred'
            : mandatory
              ? 'required'
              : section === 'required'
                ? 'required'
                : section === 'preferred'
                  ? 'preferred'
                  : 'ambiguous';
      result[`${mode}Skills`].push(...skills);
      for (const skill of skills)
        result.skillEvidence.push({
          skill,
          classification: mode,
          text: clause,
        });
      if (
        section === 'responsibilities' ||
        /^(?:you will |you'll |build\b|develop\b|design\b|maintain\b|implement\b|collaborate\b|deliver\b|responsible for\b)/i.test(
          clause,
        )
      )
        result.responsibilities.push(clause);
      const years = clause.match(
        /(?<![\d.])(\d{1,2}(?:\.\d+)?)(?:\s*[-–]\s*\d{1,2}(?:\.\d+)?)?\+?\s+years?\b/i,
      );
      if (
        years &&
        /experience|working|development|engineering/i.test(clause) &&
        mode !== 'ambiguous'
      )
        result.experience.push({
          text: clause,
          minimumYears: Number(years[1]),
          required: mode === 'required',
          skills,
        });
      const credential = credentials.find(([, pattern]) =>
        pattern.test(clause),
      );
      if (
        mode !== 'ambiguous' &&
        (credential || /certification|certified|licen[cs]e/i.test(clause))
      ) {
        result.certifications.push({
          text: clause,
          credential: credential?.[0] || null,
          required: mode === 'required',
          evaluable: !!credential && !/\bor\b/i.test(clause),
        });
      }
      const qualification = degree(clause);
      if (qualification && mode !== 'ambiguous') {
        const field =
          fieldNames.find((f) => clause.toLowerCase().includes(f)) || null;
        const alternative = /\bor\b|equivalent/i.test(clause);
        const remaining = clause
          .toLowerCase()
          .replace(
            /\b(?:bachelor'?s?|master'?s?|degree|ph\.?d|doctorate|doctoral|diploma|associate'?s?|b\.?sc?|m\.?sc?|btech|b\.tech|a|an|the|at|least|in|of|required|preferred|optional|minimum|is|must|be|have|qualification|qualifications)\b\.?/gi,
            '',
          )
          .replace(/[^\p{L}\p{N}]/gu, '');
        const unknownField = !field && !!remaining;
        result.education.push({
          text: clause,
          degree: qualification,
          field,
          required: mode === 'required',
          evaluable: !alternative && !unknownField,
        });
      }
    }
  }
  result.requiredSkills = normalizeSkills(result.requiredSkills);
  result.preferredSkills = normalizeSkills(result.preferredSkills).filter(
    (s) => !result.requiredSkills.includes(s),
  );
  result.ambiguousSkills = normalizeSkills(result.ambiguousSkills).filter(
    (s) =>
      !result.requiredSkills.includes(s) && !result.preferredSkills.includes(s),
  );
  const skills = [...result.requiredSkills, ...result.preferredSkills];
  result.programmingLanguages = skills.filter((s) =>
    [
      'JavaScript',
      'TypeScript',
      'Python',
      'Java',
      'C++',
      'C#',
      'SQL',
      'HTML',
      'CSS',
    ].includes(s),
  );
  result.frameworks = skills.filter((s) =>
    [
      'React',
      'Express',
      'Next.js',
      'Vue',
      'Angular',
      '.NET',
      'Tailwind CSS',
      'TensorFlow',
      'PyTorch',
    ].includes(s),
  );
  result.toolsAndPlatforms = skills.filter(
    (s) =>
      !result.programmingLanguages.includes(s) &&
      !result.frameworks.includes(s),
  );
  result.responsibilities = [...new Set(result.responsibilities)];
  if (result.ambiguousSkills.length)
    result.limitations.push(
      'Some skill mentions have no unambiguous required/preferred scope and were excluded from skill coverage.',
    );
  if (!result.requiredSkills.length)
    result.limitations.push(
      'No explicit mandatory technical skills were recognized. Required-skill coverage is not applicable.',
    );
  if ([...result.education, ...result.certifications].some((e) => !e.evaluable))
    result.limitations.push(
      'Alternative or unrecognized education/certification qualifications cannot be evaluated reliably and were excluded from qualification scoring.',
    );
  if (description.length < 150 || !skills.length)
    result.limitations.push(
      'The job description is sparse or lacks recognized skill requirements; alignment confidence is low.',
    );
  result.limitations.push(
    'Skill extraction uses a finite technology dictionary; unrecognized technologies and unrecognized qualifications may require manual review.',
  );
  return result;
}

export const PARSER_VERSION = 'rules-v1';
const technologies = {
  JavaScript: ['javascript', 'js'],
  TypeScript: ['typescript', 'ts'],
  React: ['react', 'reactjs', 'react.js'],
  'Node.js': ['node.js', 'nodejs', 'node'],
  MongoDB: ['mongodb', 'mongo'],
  Express: ['express', 'express.js', 'expressjs'],
  Python: ['python'],
  Java: ['java'],
  'C++': ['c++'],
  'C#': ['c#'],
  '.NET': ['.net', 'dotnet'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3'],
  SQL: ['sql'],
  PostgreSQL: ['postgresql', 'postgres'],
  MySQL: ['mysql'],
  Git: ['git'],
  GitHub: ['github'],
  Docker: ['docker'],
  Kubernetes: ['kubernetes', 'k8s'],
  AWS: ['aws', 'amazon web services'],
  Azure: ['azure'],
  'Google Cloud': ['gcp', 'google cloud'],
  Redis: ['redis'],
  'Next.js': ['next.js', 'nextjs'],
  Vue: ['vue', 'vue.js', 'vuejs'],
  Angular: ['angular'],
  'Tailwind CSS': ['tailwind', 'tailwind css'],
  'REST APIs': ['rest api', 'rest apis', 'restful apis'],
  GraphQL: ['graphql'],
  'CI/CD': ['ci/cd'],
  'GitHub Actions': ['github actions'],
  Linux: ['linux'],
  Figma: ['figma'],
  TensorFlow: ['tensorflow'],
  PyTorch: ['pytorch'],
};
const aliases = new Map(
  Object.entries(technologies).flatMap(([canonical, names]) =>
    names.map((n) => [n, canonical]),
  ),
);
export function normalizeSkill(value) {
  const clean = value.trim().replace(/\s+/g, ' ');
  return aliases.get(clean.toLowerCase()) || clean;
}
export function normalizeSkills(values) {
  return [
    ...new Map(
      values
        .map(normalizeSkill)
        .filter(Boolean)
        .map((s) => [s.toLowerCase(), s]),
    ).values(),
  ];
}
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function extractSkills(text) {
  return Object.entries(technologies)
    .filter(([, names]) =>
      names.some((n) =>
        new RegExp(
          `(?<![\\p{L}\\p{N}_+#.])${escape(n)}(?![\\p{L}\\p{N}_+#])`,
          'iu',
        ).test(text),
      ),
    )
    .map(([name]) => name);
}
const headings = {
  education: [
    'education',
    'academic background',
    'academic qualifications',
    'qualifications',
  ],
  skills: [
    'skills',
    'technical skills',
    'technologies',
    'technical proficiency',
    'core competencies',
    'programming languages',
    'frameworks',
    'tools',
  ],
  projects: [
    'projects',
    'personal projects',
    'academic projects',
    'selected projects',
    'project experience',
  ],
  workExperience: [
    'experience',
    'work experience',
    'professional experience',
    'employment history',
    'internships',
  ],
  certifications: [
    'certifications',
    'certificates',
    'licenses',
    'licenses and certifications',
  ],
  achievements: [
    'achievements',
    'awards',
    'honors',
    'awards and achievements',
    'accomplishments',
  ],
  ignored: [
    'summary',
    'professional summary',
    'profile',
    'objective',
    'career objective',
    'interests',
    'languages',
    'references',
    'publications',
    'volunteering',
  ],
};
const headingMap = new Map(
  Object.entries(headings).flatMap(([field, names]) =>
    names.map((n) => [n, field]),
  ),
);
export function extractStructured(text) {
  const structuredData = {
    name: '',
    email: '',
    education: [],
    skills: [],
    projects: [],
    workExperience: [],
    certifications: [],
    achievements: [],
  };
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  structuredData.email =
    text.match(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/i,
    )?.[0] || '';
  if (structuredData.email.length > 254) structuredData.email = '';
  const first = lines[0]?.replace(/^name\s*:\s*/i, '') || '';
  // Only a plausible leading name is extracted; ambiguous layouts remain editable blanks.
  if (
    /^[\p{L}][\p{L}.'’\-]+(?:\s+[\p{L}][\p{L}.'’\-]*){1,4}$/u.test(first) &&
    !/resume|curriculum|engineer|developer|designer|manager|university|experience|skills|education|profile|summary|certification|project/i.test(
      first,
    )
  )
    structuredData.name = first.length <= 150 ? first : '';
  let current = null;
  let sections = 0;
  for (const line of lines) {
    const match = line.match(/^([^:]{2,60}):\s*(.*)$/);
    const heading = (match ? match[1] : line)
      .replace(/[\s:–—-]+$/g, '')
      .toLowerCase();
    if (headingMap.has(heading)) {
      current = headingMap.get(heading);
      sections++;
      if (match?.[2]) add(current, match[2]);
    } else if (current) add(current, line);
  }
  function add(field, line) {
    if (field === 'ignored') return;
    const clean = line.replace(/^[•●▪\-*]\s*/, '').trim();
    if (!clean) return;
    if (field === 'skills')
      structuredData.skills.push(
        ...clean
          .split(/[,;|•]/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    else structuredData[field].push(clean);
  }
  const limited = Object.entries(structuredData).some(
    ([key, values]) =>
      Array.isArray(values) &&
      (values.length > 100 ||
        values.some((s) => s.length > (key === 'skills' ? 120 : 2000))),
  );
  structuredData.skills = normalizeSkills([
    ...structuredData.skills,
    ...extractSkills(text),
  ])
    .slice(0, 100)
    .map((s) => s.slice(0, 120));
  for (const key of [
    'education',
    'projects',
    'workExperience',
    'certifications',
    'achievements',
  ])
    structuredData[key] = structuredData[key]
      .slice(0, 100)
      .map((s) => s.slice(0, 2000));
  const warnings = [];
  if (limited)
    warnings.push(
      'Some entries exceeded the structured preview limits and were shortened or omitted. Check the extracted text before saving corrections.',
    );
  if (text.replace(/\s/g, '').length < 40)
    warnings.push(
      'Very little readable text was found. Scanned PDFs require OCR, which is not available. You can enter missing information manually or upload a text-based document.',
    );
  if (!structuredData.name)
    warnings.push(
      'A name could not be identified confidently. Please enter it manually.',
    );
  if (!structuredData.email)
    warnings.push(
      'No email address was identified. Please check the contact information.',
    );
  if (!sections)
    warnings.push(
      'No standard section headings were identified. Review the extracted text and complete the sections manually.',
    );
  return {
    structuredData,
    warnings,
    parsingStatus: warnings.length ? 'needs_review' : 'parsed',
    parserVersion: PARSER_VERSION,
  };
}

// Shared prose normalization for matching; the upload parser's existing behavior is unchanged.
export function canonicalizeSkillTerms(text) {
  const names = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_+#.])(?:${names.map(escape).join('|')})(?![\\p{L}\\p{N}_+#])`,
    'giu',
  );
  return text.replace(pattern, (value) => normalizeSkill(value).toLowerCase());
}

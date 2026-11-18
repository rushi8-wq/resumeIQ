import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSkills,
  canonicalizeSkillTerms,
} from '../src/services/parsing/structured.js';
import { parseJob } from '../src/services/matching/jobParser.js';
import { tokens, tfidfSimilarity } from '../src/services/matching/text.js';
import {
  skillCoverage,
  scoreMatch,
  weightedScore,
} from '../src/services/matching/score.js';
import { DEFAULT_WEIGHTS, scoringConfig } from '../src/config/scoring.js';
import { createEmbeddingProvider } from '../src/services/matching/embeddings.js';
import { analyzeSchema } from '../src/validation/match.js';
import { matchingResume, matchingJob } from './fixtures/matching.js';
const req = () => ({ ...parseJob(matchingJob), sourceText: matchingJob });
test('matching shares upload aliases including punctuation-sensitive skills', () => {
  assert.deepEqual(
    normalizeSkills(['JS', 'JavaScript', 'ReactJS', 'Node', 'Postgres']),
    ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
  );
  assert.equal(
    canonicalizeSkillTerms('JS ReactJS Postgres'),
    'javascript react postgresql',
  );
  assert.deepEqual(tokens('C++ C# .NET'), ['c++', 'c#', '.net']);
});
test('job parser distinguishes required, preferred, languages, frameworks, tools and evidence', () => {
  const r = req();
  assert.deepEqual(r.requiredSkills, [
    'JavaScript',
    'React',
    'Node.js',
    'PostgreSQL',
    'Docker',
  ]);
  assert.deepEqual(r.preferredSkills, ['AWS']);
  assert.ok(r.programmingLanguages.includes('JavaScript'));
  assert.ok(r.frameworks.includes('React'));
  assert.ok(r.toolsAndPlatforms.includes('Docker'));
  assert.equal(r.education[0].degree, 'bachelor');
  assert.equal(r.experience[0].minimumYears, 3);
  assert.equal(r.responsibilities.length, 1);
  assert.ok(r.skillEvidence.every((e) => e.text));
});
test('ambiguous, negated and mixed-scope skill mentions never become mandatory guesses', () => {
  const r = parseJob(
    'Our stack:\nReact\nDocker is not required.\nReact required and AWS preferred.',
  );
  assert.deepEqual(r.requiredSkills, []);
  assert.ok(r.ambiguousSkills.includes('React'));
  assert.ok(r.ambiguousSkills.includes('Docker'));
  assert.ok(r.limitations.length);
  const alternative = parseJob('Required skills: React or Angular');
  assert.deepEqual(alternative.requiredSkills, []);
  assert.deepEqual(alternative.ambiguousSkills, ['React', 'Angular']);
  const simple = parseJob('React is required but Docker is preferred.');
  assert.deepEqual(simple.requiredSkills, ['React']);
  assert.deepEqual(simple.preferredSkills, ['Docker']);
});
test('exact skills return evidence and gaps without substring false positives', () => {
  const coverage = skillCoverage(
    ['Java', 'JavaScript', 'React', 'C++'],
    [
      { section: 'skills', text: 'JavaScript' },
      { section: 'projects', text: 'Developed ReactJS applications.' },
      { section: 'workExperience', text: 'No C++ experience' },
    ],
  );
  assert.equal(coverage.score, 50);
  assert.deepEqual(coverage.missing, ['Java', 'C++']);
  assert.equal(coverage.matched[1].evidence[0].section, 'projects');
  assert.equal(skillCoverage([], []).score, null);
});
test('TF-IDF cosine has identity, symmetry, zero-vector and disjoint properties', () => {
  assert.ok(
    Math.abs(tfidfSimilarity('react docker', 'react docker') - 1) < 1e-10,
  );
  assert.equal(tfidfSimilarity('react', 'python'), 0);
  assert.equal(tfidfSimilarity('', 'react'), 0);
  assert.equal(tfidfSimilarity('the and of', 'react'), 0);
  assert.equal(tfidfSimilarity('JS Postgres', 'JavaScript PostgreSQL'), 1);
  assert.equal(
    tfidfSimilarity('react node', 'node python'),
    tfidfSimilarity('node python', 'react node'),
  );
});
test('weighted scoring computes known values and redistributes only excluded weights', () => {
  const r = weightedScore(
    {
      requiredSkills: 100,
      experience: 0,
      semantic: 50,
      preferredSkills: 100,
      qualifications: 100,
    },
    DEFAULT_WEIGHTS,
  );
  assert.equal(r.overallScore, 65);
  const missing = weightedScore(
    {
      requiredSkills: 0,
      experience: null,
      semantic: 100,
      preferredSkills: null,
      qualifications: null,
    },
    DEFAULT_WEIGHTS,
  );
  assert.equal(missing.overallScore, 36.36);
  assert.equal(missing.componentScores.experience.applicable, false);
  assert.equal(missing.componentScores.requiredSkills.effectiveWeight, 63.64);
  assert.equal(
    weightedScore(
      Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, null])),
      DEFAULT_WEIGHTS,
    ).overallScore,
    null,
  );
});
test('invalid weights fail; valid configuration changes are versioned', () => {
  assert.throws(() => scoringConfig({ MATCH_WEIGHTS_JSON: 'bad' }));
  assert.throws(() =>
    scoringConfig({
      MATCH_WEIGHTS_JSON: JSON.stringify({ ...DEFAULT_WEIGHTS, semantic: -1 }),
    }),
  );
  assert.throws(() =>
    scoringConfig({
      MATCH_WEIGHTS_JSON: JSON.stringify(
        Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, 0])),
      ),
    }),
  );
  assert.notEqual(
    scoringConfig().version,
    scoringConfig({
      MATCH_WEIGHTS_JSON: JSON.stringify({ ...DEFAULT_WEIGHTS, semantic: 10 }),
    }).version,
  );
});
test('missing experience and education earn zero when required, never full credit', async () => {
  const result = await scoreMatch(
    { skills: [], projects: [], workExperience: [], education: [] },
    req(),
  );
  assert.equal(result.overallScore, 0);
  assert.equal(result.componentScores.qualifications.score, 0);
  assert.equal(result.componentScores.experience.score, 0);
  assert.equal(result.qualificationGaps.length, 1);
  assert.equal(result.experienceChecks[0].demonstratedYears, 0);
});
test('unspecified or unevaluable components disclose exclusion and redistribution', async () => {
  const r = await scoreMatch(matchingResume, {
    ...parseJob('React is required for this development role.'),
    sourceText: 'React is required for this development role.',
  });
  assert.equal(r.componentScores.experience.score, null);
  assert.equal(r.componentScores.preferredSkills.score, null);
  assert.equal(r.componentScores.qualifications.score, null);
  const alternative = await scoreMatch(matchingResume, {
    ...parseJob(
      'Requirements:\nBachelor degree in computer science or equivalent experience required.',
    ),
    sourceText: 'Bachelor degree or equivalent experience required.',
  });
  assert.equal(alternative.componentScores.qualifications.score, null);
  assert.equal(alternative.qualificationGaps[0].evaluable, false);
});
test('degree fields and explicit tenure must be supported; decimals and ranges use lower bounds', async () => {
  const r = await scoreMatch(
    {
      ...matchingResume,
      education: ['B.Sc. Business'],
      workExperience: ['2.5 years of React experience'],
    },
    req(),
  );
  assert.equal(r.componentScores.qualifications.score, 0);
  assert.equal(r.experienceChecks[0].demonstratedYears, 2.5);
  const range = await scoreMatch(
    { ...matchingResume, workExperience: ['2-4 years of React experience'] },
    req(),
  );
  assert.equal(range.experienceChecks[0].demonstratedYears, 2);
});
test('algorithm is deterministic, bounded, includes evidence and labels local fallback', async () => {
  const first = await scoreMatch(matchingResume, req());
  const second = await scoreMatch(matchingResume, req());
  assert.deepEqual(first, second);
  assert.ok(first.overallScore >= 0 && first.overallScore <= 100);
  assert.equal(first.semantic.method, 'tfidf-v1');
  assert.deepEqual(first.missingSkills.required, ['Docker']);
  assert.deepEqual(first.missingSkills.preferred, ['AWS']);
  assert.ok(first.relevantProjects.length);
  assert.match(first.disclaimer, /hiring probability/);
  assert.match(first.algorithmVersion, /hybrid-v1/);
  for (const value of [-100, 0, 15, 50, 100, 300]) {
    const r = weightedScore(
      Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, value])),
      DEFAULT_WEIGHTS,
    );
    assert.ok(r.overallScore >= 0 && r.overallScore <= 100);
  }
});
test('external embeddings require explicit per-analysis consent; failure uses a labeled fallback', async () => {
  let calls = 0;
  const provider = {
    async similarity() {
      calls++;
      return { value: 0.75, model: 'test-embedding-model' };
    },
  };
  const local = await scoreMatch(matchingResume, req(), { provider });
  assert.equal(calls, 0);
  assert.equal(local.semantic.method, 'tfidf-v1');
  const remote = await scoreMatch(matchingResume, req(), {
    provider,
    consent: true,
  });
  assert.equal(calls, 1);
  assert.equal(remote.componentScores.semantic.score, 75);
  assert.equal(remote.semantic.externalProcessingUsed, true);
  assert.match(remote.algorithmVersion, /test-embedding-model/);
  const failure = await scoreMatch(matchingResume, req(), {
    provider: {
      async similarity() {
        throw new Error('secret provider failure');
      },
    },
    consent: true,
  });
  assert.equal(failure.semantic.method, 'tfidf-v1');
  assert.match(failure.limitations.join(' '), /unavailable/);
  assert.ok(!JSON.stringify(failure).includes('secret provider failure'));
});
test('embedding adapter validates vectors and redacts contact snippets without real API calls', async () => {
  let payload;
  const env = {
    EMBEDDING_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-only',
    EMBEDDING_MODEL: 'test-model',
  };
  const provider = createEmbeddingProvider(env, {
    fetchImpl: async (url, options) => {
      payload = JSON.parse(options.body);
      assert.equal(url, 'https://api.openai.com/v1/embeddings');
      return {
        ok: true,
        json: async () => ({
          model: 'test-model',
          data: [
            { index: 1, embedding: [1, 0] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      };
    },
  });
  assert.equal(
    (await provider.similarity('React email person@example.com', 'React'))
      .value,
    1,
  );
  assert.ok(!JSON.stringify(payload).includes('person@example.com'));
  const bad = createEmbeddingProvider(env, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [0, 0] },
          { index: 1, embedding: [1, 0] },
        ],
      }),
    }),
  });
  await assert.rejects(bad.similarity('react', 'react'));
  assert.equal(createEmbeddingProvider({}), null);
});
test('empty, malformed and mass-assigned job input is rejected', () => {
  const valid = {
    resumeId: '123456789012345678901234',
    description: matchingJob,
  };
  assert.ok(analyzeSchema.safeParse(valid).success);
  for (const description of [
    '',
    '   ',
    '!!!!'.repeat(50),
    'React',
    'x'.repeat(16000),
  ])
    assert.ok(!analyzeSchema.safeParse({ ...valid, description }).success);
  assert.ok(!analyzeSchema.safeParse({ ...valid, userId: 'attacker' }).success);
});

test('named certifications require saved certification evidence, not just skill mentions', async () => {
  const job =
    'PMP certification is required for this project management position.';
  const requirements = { ...parseJob(job), sourceText: job };
  const absent = await scoreMatch(
    { ...matchingResume, skills: ['PMP'], certifications: [] },
    requirements,
  );
  assert.equal(absent.componentScores.qualifications.score, 0);
  const present = await scoreMatch(
    {
      ...matchingResume,
      certifications: ['PMP - Project Management Institute'],
    },
    requirements,
  );
  assert.equal(present.componentScores.qualifications.score, 100);
  const falsePositive = await scoreMatch(
    { ...matchingResume, certifications: ['NO-PMP-SUFFIX'] },
    requirements,
  );
  assert.equal(falsePositive.componentScores.qualifications.score, 0);
  const unknownDegree = await scoreMatch(matchingResume, {
    ...parseJob('A Bachelor degree in astrophysics is required for this role.'),
    sourceText: 'A Bachelor degree in astrophysics is required for this role.',
  });
  assert.equal(unknownDegree.componentScores.qualifications.score, null);
  const unknownJob =
    'A professional industry certification is required for this position.';
  const unknown = await scoreMatch(matchingResume, {
    ...parseJob(unknownJob),
    sourceText: unknownJob,
  });
  assert.equal(unknown.componentScores.qualifications.score, null);
  assert.equal(unknown.qualificationGaps[0].evaluable, false);
});

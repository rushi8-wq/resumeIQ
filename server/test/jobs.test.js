import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createJobicyProvider,
  normalizeJob,
} from '../src/services/jobs/provider.js';
import { rawJob } from './fixtures/jobs.js';
import { scoreMatch } from '../src/services/matching/score.js';
import { matchingResume } from './fixtures/matching.js';
test('provider normalization removes HTML, retains source fields, canonicalizes URLs and parses requirements', () => {
  const job = normalizeJob({
    ...rawJob,
    url: rawJob.url + '?tracking=true#apply',
    jobTitle: 'Full &amp; Stack',
  });
  assert.equal(job.title, 'Full & Stack');
  assert.equal(job.applicationUrl, rawJob.url);
  assert.ok(!job.description.includes('<br>'));
  assert.ok(job.requiredSkills.includes('React'));
  assert.ok(job.requiredSkills.includes('Docker'));
  assert.equal(job.salary, null);
  assert.equal(job.workMode, 'remote');
});
test('missing metadata remains unknown and malformed/untrusted records are rejected', () => {
  const j = normalizeJob({
    ...rawJob,
    jobType: undefined,
    jobGeo: undefined,
    jobLevel: undefined,
    pubDate: 'invalid',
  });
  assert.equal(j.location, null);
  assert.equal(j.experienceLevel, null);
  assert.equal(j.postedAt, null);
  assert.deepEqual(j.employmentType, []);
  for (const change of [
    { url: 'javascript:alert(1)' },
    { url: 'https://evil.test/jobs/1' },
    { id: null },
    { jobDescription: '' },
  ])
    assert.throws(() => normalizeJob({ ...rawJob, ...change }));
});
test('provider handles sequential cursor pages and skips invalid individual records', async () => {
  const calls = [];
  const provider = createJobicyProvider({
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          jobs:
            calls.length === 1
              ? [rawJob, { id: 'bad' }]
              : [
                  {
                    ...rawJob,
                    id: 1003,
                    url: 'https://jobicy.com/jobs/1003-developer',
                  },
                ],
          hasMore: calls.length === 1,
          nextCursor: calls.length === 1 ? 'opaque token' : null,
        }),
      );
    },
  });
  const result = await provider.searchJobs({});
  assert.equal(result.jobs.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.hasMore, false);
  assert.ok(calls[1].includes('cursor=opaque+token'));
  assert.equal(
    (await provider.getJobDetails('1001')).title,
    'Full Stack Developer',
  );
});
test('invalid source responses and upstream outages fail safely', async () => {
  for (const response of [
    new Response('{}'),
    new Response('bad-json'),
    new Response('', { status: 429 }),
    new Response(JSON.stringify({ jobs: [{}], hasMore: false })),
  ]) {
    const p = createJobicyProvider({ fetchImpl: async () => response });
    await assert.rejects(() => p.searchJobs({}));
  }
});
test('source timeout and oversized response are bounded', async () => {
  let signal;
  const p = createJobicyProvider({
    fetchImpl: async (u, o) => {
      signal = o.signal;
      throw new Error('network');
    },
  });
  await assert.rejects(() => p.searchJobs({}));
  assert.ok(signal instanceof AbortSignal);
  const big = createJobicyProvider({
    fetchImpl: async () => new Response('a'.repeat(8 * 1024 * 1024 + 1)),
  });
  await assert.rejects(() => big.searchJobs({}));
});
test('existing engine supports nonsoftware text and keeps exact software scoring', async () => {
  const j = normalizeJob(rawJob);
  const actual = await scoreMatch(matchingResume, {
    ...j.parsedRequirements,
    sourceText: j.description,
  });
  assert.ok(actual.overallScore > 0);
  assert.ok(actual.missingSkills.required.includes('Docker'));
  const marketing = normalizeJob({
    ...rawJob,
    jobDescription:
      '<h2>Responsibilities:</h2><p>Develop marketing campaigns and brand messaging. Manage customer acquisition strategy.</p>',
  });
  const relevant = await scoreMatch(
    {
      skills: ['Marketing'],
      projects: [
        'Develop marketing campaigns and brand messaging. Manage customer acquisition strategy.',
      ],
      workExperience: [],
      education: [],
      certifications: [],
      achievements: [],
    },
    { ...marketing.parsedRequirements, sourceText: marketing.description },
  );
  const irrelevant = await scoreMatch(matchingResume, {
    ...marketing.parsedRequirements,
    sourceText: marketing.description,
  });
  assert.ok(relevant.overallScore > irrelevant.overallScore);
});

test('null optional fields and truncated descriptions are explicit rather than invented', () => {
  const j = normalizeJob({
    ...rawJob,
    jobGeo: null,
    jobType: null,
    jobLevel: null,
    pubDate: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    jobDescription:
      '<p>' + 'Requirements are described in detail. '.repeat(1000) + '</p>',
  });
  assert.equal(j.location, null);
  assert.equal(j.salary, null);
  assert.equal(j.descriptionTruncated, true);
  assert.equal(j.description.length, 15000);
  assert.ok(j.parsedRequirements.limitations.some((s) => s.includes('15,000')));
});

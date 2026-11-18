import { convert } from 'html-to-text';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parseJob } from '../matching/jobParser.js';
const rawSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  url: z.string().url(),
  jobTitle: z.string().min(1).max(500),
  companyName: z.string().min(1).max(500),
  jobDescription: z.string().min(1).max(250000),
  jobGeo: z.string().max(1000).nullable().optional(),
  jobType: z.array(z.string()).max(10).nullable().optional(),
  jobLevel: z.string().max(100).nullable().optional(),
  pubDate: z.string().nullable().optional(),
  salaryMin: z.number().nonnegative().nullable().optional(),
  salaryMax: z.number().nonnegative().nullable().optional(),
  salaryCurrency: z.string().max(10).nullable().optional(),
  salaryPeriod: z.string().max(30).nullable().optional(),
});
export function normalizeJob(raw) {
  const r = rawSchema.parse(raw);
  const url = new URL(r.url);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'jobicy.com' ||
    !url.pathname.startsWith('/jobs/') ||
    url.username ||
    url.password
  )
    throw new Error('Unsafe source URL');
  url.search = '';
  url.hash = '';
  const text = (s) =>
    convert(s, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    }).trim();
  const fullDescription = text(r.jobDescription);
  const description = fullDescription.slice(0, 15000);
  const descriptionTruncated = fullDescription.length > description.length;
  if (!description) throw new Error('Empty description');
  const parsedRequirements = parseJob(description);
  if (descriptionTruncated)
    parsedRequirements.limitations.push(
      'Source description exceeded 15,000 characters; scoring uses the displayed excerpt. Review the full source listing.',
    );
  if (!text(r.jobTitle) || !text(r.companyName))
    throw new Error('Empty title or company');
  const postedAt =
    r.pubDate && Number.isFinite(Date.parse(r.pubDate))
      ? new Date(r.pubDate)
      : null;
  const job = {
    source: 'jobicy',
    externalId: String(r.id),
    title: text(r.jobTitle),
    company: text(r.companyName),
    location: r.jobGeo?.trim() || null,
    workMode: 'remote',
    employmentType: r.jobType?.map((s) => s.toLowerCase()) || [],
    experienceLevel: r.jobLevel?.toLowerCase() || null,
    description,
    descriptionTruncated,
    parsedRequirements,
    requiredSkills: parsedRequirements.requiredSkills,
    preferredSkills: parsedRequirements.preferredSkills,
    experienceRequirements: parsedRequirements.experience,
    applicationUrl: url.href,
    postedAt,
    salary:
      r.salaryMin != null || r.salaryMax != null
        ? {
            min: r.salaryMin ?? null,
            max: r.salaryMax ?? null,
            currency: r.salaryCurrency ?? null,
            period: r.salaryPeriod ?? null,
          }
        : null,
  };
  return {
    ...job,
    contentHash: createHash('sha256').update(JSON.stringify(job)).digest('hex'),
  };
}
export function createJobicyProvider({ fetchImpl = fetch, maxPages = 3 } = {}) {
  let lastJobs = [];
  return {
    name: 'jobicy',
    normalizeJob,
    async searchJobs() {
      const jobs = [];
      let cursor;
      let hasMore = false;
      let skipped = 0;
      for (let page = 0; page < maxPages; page++) {
        const url = new URL('https://jobicy.com/api/jobs');
        url.searchParams.set('count', '100');
        if (cursor) url.searchParams.set('cursor', cursor);
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(12000),
          redirect: 'error',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Job source unavailable');
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 8 * 1024 * 1024)
              throw new Error('Source response too large');
            chunks.push(Buffer.from(value));
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const data = z
          .object({
            jobs: z.array(z.unknown()).max(100),
            hasMore: z.boolean(),
            nextCursor: z.string().max(5000).nullable().optional(),
          })
          .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        for (const raw of data.jobs) {
          try {
            jobs.push(normalizeJob(raw));
          } catch {
            skipped++;
          }
        }
        if (data.jobs.length && !jobs.length)
          throw new Error('No valid source records');
        hasMore = data.hasMore;
        cursor = data.nextCursor;
        if (!hasMore) break;
        if (!cursor) throw new Error('Missing pagination cursor');
      }
      lastJobs = jobs;
      return { jobs, hasMore, skipped };
    },
    async getJobDetails(jobId) {
      return lastJobs.find((j) => j.externalId === String(jobId)) || null;
    },
    getSourceStatus() {
      return {
        source: 'jobicy',
        name: 'Jobicy',
        configured: true,
        attributionUrl: 'https://jobicy.com',
        coverage:
          'Remote roles across industries; location eligibility varies. Public feed covers recent publications, not all vacancies.',
        syncIntervalMinutes: 60,
      };
    },
  };
}
export const externalSources = [
  {
    source: 'linkedin',
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/jobs/search/',
    mode: 'external-search',
    reason: 'No authorized job-search API configured.',
  },
  {
    source: 'wellfound',
    name: 'Wellfound',
    url: 'https://wellfound.com/jobs',
    mode: 'external-search',
    reason: 'No authorized job-search API configured.',
  },
  {
    source: 'naukri',
    name: 'Naukri',
    url: 'https://www.naukri.com/',
    mode: 'external-search',
    reason: 'No authorized job-search API configured.',
  },
  {
    source: 'instahyre',
    name: 'Instahyre',
    url: 'https://www.instahyre.com/',
    mode: 'external-search',
    reason: 'No authorized job-search API configured.',
  },
];

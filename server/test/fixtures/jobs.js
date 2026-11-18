import { normalizeJob } from '../../src/services/jobs/provider.js';
import { matchingJob } from './matching.js';
export const rawJob = {
  id: 1001,
  url: 'https://jobicy.com/jobs/1001-full-stack-developer',
  jobTitle: 'Full Stack Developer',
  companyName: 'Fixture Studio',
  jobDescription: matchingJob.replaceAll('\n', '<br>'),
  jobGeo: 'USA, Europe',
  jobType: ['Full-Time'],
  jobLevel: 'Senior',
  pubDate: '2026-11-01T09:00:00Z',
};
export function fixtureJobProvider() {
  const jobs = [
    normalizeJob(rawJob),
    normalizeJob({
      ...rawJob,
      id: 1002,
      url: 'https://jobicy.com/jobs/1002-marketing-manager',
      jobTitle: 'Marketing Manager',
      jobDescription:
        '<h2>Responsibilities:</h2><p>Develop marketing campaigns, manage budgets and deliver customer acquisition strategy for consumer brands. Collaborate with sales and manage brand messaging.</p>',
      jobGeo: 'India',
      jobLevel: 'Midlevel',
    }),
  ];
  return {
    name: 'jobicy',
    normalizeJob,
    async searchJobs() {
      return { jobs, hasMore: false, skipped: 0 };
    },
    async getJobDetails(id) {
      return jobs.find((j) => j.externalId === String(id)) || null;
    },
    getSourceStatus() {
      return {
        source: 'jobicy',
        name: 'Jobicy automated-test fixture',
        configured: true,
        fixture: true,
      };
    },
  };
}

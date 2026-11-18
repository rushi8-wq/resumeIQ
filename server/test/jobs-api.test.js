import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { Resume } from '../src/models/Resume.js';
import { DiscoveredJob } from '../src/models/DiscoveredJob.js';
import { SavedJob } from '../src/models/SavedJob.js';
import { JobRecommendation } from '../src/models/JobRecommendation.js';
import { JobProviderState } from '../src/models/JobProviderState.js';
import { fixtureJobProvider } from './fixtures/jobs.js';
import { matchingResume } from './fixtures/matching.js';
import { scoreMatch } from '../src/services/matching/score.js';
import { createCatalog, SYNC_INTERVAL } from '../src/services/jobs/catalog.js';
const uri =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/resumeiq_test';
if (!/\/resumeiq_test(?:[?]|$)/.test(uri))
  throw new Error('Dedicated test DB required');
const env = readEnv({
  NODE_ENV: 'test',
  MONGODB_URI: uri,
  JWT_SECRET: 'jobs-test-secret-with-at-least-32-characters',
  CLIENT_URL: 'http://localhost:5173',
});
let calls = 0,
  fail = false;
const fixture = fixtureJobProvider();
const provider = {
  ...fixture,
  async searchJobs() {
    calls++;
    if (fail) throw new Error('source failure');
    const r = await fixture.searchJobs();
    return {
      ...r,
      jobs: [
        ...r.jobs,
        r.jobs[0],
        { ...r.jobs[0], externalId: 'duplicate-url' },
      ],
    };
  },
};
const app = createApp(env, { logging: false, jobProvider: provider });
const models = Object.values(mongoose.models);
const clean = () => Promise.all(models.map((m) => m.deleteMany({})));
before(async () => {
  await connectDatabase(uri);
  await Promise.all(models.map((m) => m.init()));
});
beforeEach(async () => {
  await clean();
  calls = 0;
  fail = false;
});
after(async () => {
  await clean();
  await mongoose.disconnect();
});
async function owner(email = 'jobs@example.com') {
  const agent = request.agent(app);
  const token = (await agent.get('/api/auth/csrf')).body.csrfToken;
  const user = (
    await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ name: 'Alex', email, password: 'secure jobs test password' })
      .expect(201)
  ).body.user;
  const resume = await Resume.create({
    userId: user.id,
    originalFilename: 'resume.docx',
    fileType: 'docx',
    fileSize: 100,
    extractedText: 'private',
    structuredData: matchingResume,
    parsingStatus: 'reviewed',
    parserVersion: 'rules-v1',
  });
  return { agent, token, user, resume };
}
const url = (o) => `/api/jobs/recommended?resumeId=${o.resume.id}`;
test('live sync deduplicates, ranks with unchanged engine, caches scores and filters locally', async () => {
  const o = await owner();
  const first = (await o.agent.get(url(o)).expect(200)).body;
  assert.equal(first.provider.state, 'live');
  assert.equal(first.jobs.length, 2);
  assert.equal(calls, 1);
  assert.equal(await DiscoveredJob.countDocuments(), 2);
  assert.equal(first.jobs[0].title, 'Full Stack Developer');
  const j = await DiscoveredJob.findById(first.jobs[0].id);
  const expected = await scoreMatch(matchingResume, {
    ...j.parsedRequirements,
    sourceText: j.description,
  });
  assert.equal(first.jobs[0].recommendation.matchScore, expected.overallScore);
  assert.ok(!JSON.stringify(first).includes('alex@example.com'));
  const again = (await o.agent.get(url(o)).expect(200)).body;
  assert.equal(again.provider.state, 'cached');
  assert.equal(calls, 1);
  assert.equal(
    again.jobs[0].recommendation.calculatedAt,
    first.jobs[0].recommendation.calculatedAt,
  );
  assert.equal(
    (await o.agent.get(url(o) + '&location=India')).body.jobs.length,
    1,
  );
  assert.equal(
    (await o.agent.get(url(o) + '&workMode=onsite')).body.jobs.length,
    0,
  );
  assert.equal(
    (await o.agent.get(url(o) + '&keyword=marketing')).body.jobs.length,
    1,
  );
  assert.equal(
    (await o.agent.get(url(o) + '&minScore=100')).body.jobs.length,
    0,
  );
  assert.equal(
    (await o.agent.get(url(o) + '&limit=1&page=2')).body.pagination.total,
    2,
  );
  await Resume.updateOne({ _id: o.resume.id }, { $inc: { version: 1 } });
  const changed = (await o.agent.get(url(o))).body;
  assert.equal(changed.jobs[0].recommendation.resumeVersion, 2);
  await DiscoveredJob.updateOne(
    { _id: j._id },
    { $set: { contentHash: 'changed' } },
  );
  await o.agent.get(url(o)).expect(200);
  assert.equal(
    (await JobRecommendation.findOne({ jobId: j._id })).jobHash,
    'changed',
  );
});
test('private bookmarks persist, are idempotent and deny cross-user access and CSRF', async () => {
  const one = await owner(),
    two = await owner('other-jobs@example.com');
  const jobs = (await one.agent.get(url(one))).body.jobs;
  const body = { jobId: jobs[0].id, resumeId: one.resume.id };
  await one.agent.post('/api/jobs/save').send(body).expect(403);
  await two.agent
    .post('/api/jobs/save')
    .set('x-csrf-token', two.token)
    .send(body)
    .expect(404);
  const saved = (
    await one.agent
      .post('/api/jobs/save')
      .set('x-csrf-token', one.token)
      .send(body)
      .expect(201)
  ).body.saved;
  await one.agent
    .post('/api/jobs/save')
    .set('x-csrf-token', one.token)
    .send(body)
    .expect(201);
  assert.equal(await SavedJob.countDocuments(), 1);
  assert.equal(
    (await one.agent.get('/api/jobs/saved')).body.jobs[0].id,
    saved.id,
  );
  assert.equal((await two.agent.get('/api/jobs/saved')).body.jobs.length, 0);
  await two.agent
    .delete(`/api/jobs/saved/${saved.id}`)
    .set('x-csrf-token', two.token)
    .expect(404);
  await two.agent.get(url(one)).expect(404);
  await two.agent
    .get(`/api/jobs/${jobs[0].id}?resumeId=${one.resume.id}`)
    .expect(404);
  assert.equal(
    (await one.agent.get('/api/dashboard')).body.metrics.savedJobs,
    1,
  );
  await one.agent
    .delete(`/api/jobs/saved/${saved.id}`)
    .set('x-csrf-token', one.token)
    .expect(204);
  assert.equal(await SavedJob.countDocuments(), 0);
});
test('outages use stale cache, respect persistent hourly throttle and expire listings without falsely verifying them', async () => {
  const o = await owner();
  const first = (await o.agent.get(url(o))).body;
  assert.equal(first.jobs[0].lastVerifiedAt, null);
  await JobProviderState.updateOne(
    { source: 'jobicy' },
    { $set: { nextFetchAt: new Date(0) } },
  );
  fail = true;
  const stale = (await o.agent.get(url(o)).expect(200)).body;
  assert.equal(stale.provider.state, 'stale');
  assert.equal(stale.jobs.length, 2);
  assert.equal(calls, 2);
  await o.agent.get(url(o));
  assert.equal(calls, 2);
  await DiscoveredJob.updateMany({}, { $set: { expiresAt: new Date(0) } });
  const expired = (await o.agent.get(url(o))).body;
  assert.equal(expired.provider.state, 'unavailable');
  assert.equal(expired.jobs.length, 0);
});
test('concurrent catalogs acquire one persistent sync lease; restarted catalog honors cooldown', async () => {
  const a = createCatalog(provider),
    b = createCatalog(provider);
  await Promise.all([a.refresh(), b.refresh(), a.refresh()]);
  assert.equal(calls, 1);
  await createCatalog(provider).refresh();
  assert.equal(calls, 1);
  const state = await JobProviderState.findOne();
  assert.ok(+state.nextFetchAt > Date.now() + SYNC_INTERVAL - 10000);
});
test('anonymous access, invalid input and unknown IDs are rejected', async () => {
  for (const p of [
    '/api/jobs',
    '/api/jobs/recommended',
    '/api/jobs/saved',
    '/api/jobs/providers/status',
    '/api/jobs/000000000000000000000000',
  ])
    await request(app).get(p).expect(401);
  const o = await owner();
  for (const p of [
    '/api/jobs?limit=51',
    '/api/jobs?minScore=101',
    '/api/jobs?source=linkedin',
    '/api/jobs?owner=bad',
    '/api/jobs/recommended',
    '/api/jobs?minScore=10',
  ])
    await o.agent.get(p).expect(400);
  await o.agent.get('/api/jobs/bad').expect(404);
  await o.agent.get('/api/jobs/000000000000000000000000').expect(404);
  await o.agent
    .post('/api/jobs/save')
    .set('x-csrf-token', o.token)
    .send({ jobId: 'bad', resumeId: o.resume.id })
    .expect(400);
  const status = (await o.agent.get('/api/jobs/providers/status')).body;
  assert.equal(status.providers.length, 5);
  assert.equal(calls, 0);
});
test('deleting resumes removes bookmarks and recommendation evidence', async () => {
  const o = await owner();
  const j = (await o.agent.get(url(o))).body.jobs[0];
  await o.agent
    .post('/api/jobs/save')
    .set('x-csrf-token', o.token)
    .send({ jobId: j.id, resumeId: o.resume.id })
    .expect(201);
  await o.agent
    .delete(`/api/resumes/${o.resume.id}`)
    .set('x-csrf-token', o.token)
    .expect(204);
  assert.equal(await JobRecommendation.countDocuments(), 0);
  assert.equal(await SavedJob.countDocuments(), 0);
  assert.equal(await DiscoveredJob.countDocuments(), 2);
});

test('successful empty source differs from outage and stale source age is explicit', async () => {
  const empty = createCatalog({
    ...fixture,
    name: 'empty-test',
    async searchJobs() {
      return { jobs: [], hasMore: false };
    },
  });
  assert.equal((await empty.refresh()).state, 'live');
  assert.equal((await empty.status()).state, 'cached');
  await JobProviderState.updateOne(
    { source: 'empty-test' },
    { $set: { fetchedAt: new Date(Date.now() - SYNC_INTERVAL - 1000) } },
  );
  assert.equal((await empty.status()).state, 'unavailable');
});
test('expired bookmarks remain readable but cannot be newly saved; recommendation config changes invalidate cache', async () => {
  const o = await owner();
  const first = (await o.agent.get(url(o))).body.jobs[0];
  const bookmark = (
    await o.agent
      .post('/api/jobs/save')
      .set('x-csrf-token', o.token)
      .send({ jobId: first.id, resumeId: o.resume.id })
  ).body.saved;
  await JobRecommendation.updateOne(
    { jobId: first.id },
    { $set: { configVersion: 'old-config' } },
  );
  await o.agent.get(url(o)).expect(200);
  assert.notEqual(
    (await JobRecommendation.findOne({ jobId: first.id })).configVersion,
    'old-config',
  );
  await DiscoveredJob.updateOne(
    { _id: first.id },
    { $set: { expiresAt: new Date(0) } },
  );
  assert.equal(
    (await o.agent.get('/api/jobs/saved')).body.jobs[0].job.expired,
    true,
  );
  assert.equal(
    (await o.agent.get(`/api/jobs/${first.id}?resumeId=${o.resume.id}`)).body
      .job.expired,
    true,
  );
  await o.agent
    .post('/api/jobs/save')
    .set('x-csrf-token', o.token)
    .send({ jobId: first.id, resumeId: o.resume.id })
    .expect(404);
  await o.agent
    .delete(`/api/jobs/saved/${bookmark.id}`)
    .set('x-csrf-token', o.token)
    .expect(204);
});

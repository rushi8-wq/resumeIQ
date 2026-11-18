import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Resume } from '../src/models/Resume.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { MatchAnalysis } from '../src/models/MatchAnalysis.js';
import { matchingJob, matchingResume } from './fixtures/matching.js';
const uri =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/resumeiq_test';
if (!/\/resumeiq_test(?:[?]|$)/.test(uri))
  throw new Error('TEST_MONGODB_URI must select resumeiq_test');
const env = readEnv({
  NODE_ENV: 'test',
  MONGODB_URI: uri,
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
  CLIENT_URL: 'http://localhost:5173',
});
let calls = 0;
const app = createApp(env, {
  logging: false,
  embeddingProvider: {
    async similarity() {
      calls++;
      return { value: 0.8, model: 'mock-embedding' };
    },
  },
});
const models = [MatchAnalysis, JobDescription, Resume, Session, User];
const clean = () => Promise.all(models.map((m) => m.deleteMany({})));
before(async () => {
  await connectDatabase(uri);
  await Promise.all(models.map((m) => m.init()));
});
beforeEach(async () => {
  calls = 0;
  await clean();
});
after(async () => {
  await clean();
  await mongoose.disconnect();
});
async function owner(email = 'matching@example.com') {
  const agent = request.agent(app);
  const {
    body: { csrfToken: token },
  } = await agent.get('/api/auth/csrf');
  const {
    body: { user },
  } = await agent
    .post('/api/auth/register')
    .set('x-csrf-token', token)
    .send({
      name: 'Alex Morgan',
      email,
      password: 'correct horse battery staple',
    })
    .expect(201);
  const resume = await Resume.create({
    userId: user.id,
    originalFilename: 'resume.docx',
    fileType: 'docx',
    fileSize: 100,
    extractedText:
      'Old raw text mentions Kubernetes but is not current saved evidence.',
    structuredData: matchingResume,
    parsingStatus: 'reviewed',
    parserVersion: 'rules-v1',
  });
  return { agent, token, user, resume };
}
function analyze(o, more = {}) {
  return o.agent
    .post('/api/match/analyze')
    .set('x-csrf-token', o.token)
    .send({
      resumeId: o.resume.id,
      title: 'Full Stack Developer',
      company: 'Example Studio',
      description: matchingJob,
      ...more,
    });
}
test('authenticated analysis persists actual results, references, history, job list and dashboard metrics', async () => {
  const o = await owner();
  const {
    body: { analysis: a, jobDescription: j },
  } = await analyze(o).expect(201);
  assert.ok(a.overallScore > 0 && a.overallScore < 100);
  assert.equal(a.userId, undefined);
  assert.equal(j.userId, undefined);
  assert.equal(a.resumeSnapshot.version, 1);
  assert.equal(a.resumeSnapshot.structuredData.email, undefined);
  assert.deepEqual(a.missingSkills.required, ['Docker']);
  assert.equal(calls, 0);
  assert.equal(await MatchAnalysis.countDocuments(), 1);
  assert.equal(await JobDescription.countDocuments(), 1);
  assert.equal(
    (await o.agent.get(`/api/match/${a.id}`).expect(200)).body.analysis
      .overallScore,
    a.overallScore,
  );
  const history = (await o.agent.get('/api/match/history?limit=1').expect(200))
    .body;
  assert.equal(history.pagination.total, 1);
  assert.equal(history.analyses[0].resumeSnapshot.structuredData, undefined);
  const jobs = (await o.agent.get('/api/job-descriptions').expect(200)).body;
  assert.equal(jobs.jobDescriptions[0].id, j.id);
  assert.equal(jobs.jobDescriptions[0].description, undefined);
  const dashboard = (await o.agent.get('/api/dashboard').expect(200)).body;
  assert.equal(dashboard.metrics.analyses, 1);
  assert.equal(dashboard.metrics.averageScore, a.overallScore);
  assert.equal(dashboard.features.analysis, true);
});
test('latest saved corrections override original upload; prior results remain immutable', async () => {
  const o = await owner();
  const first = (await analyze(o).expect(201)).body.analysis;
  const data = {
    ...matchingResume,
    skills: ['Docker'],
    projects: [],
    workExperience: [],
    education: [],
    certifications: [],
    achievements: [],
  };
  await o.agent
    .patch(`/api/resumes/${o.resume.id}`)
    .set('x-csrf-token', o.token)
    .send({ structuredData: data, version: 1 })
    .expect(200);
  const second = (await analyze(o).expect(201)).body.analysis;
  assert.equal(second.resumeSnapshot.version, 2);
  assert.deepEqual(
    second.matchedSkills.required.map((s) => s.skill),
    ['Docker'],
  );
  assert.ok(second.missingSkills.required.includes('React'));
  assert.notEqual(second.overallScore, first.overallScore);
  const original = (await o.agent.get(`/api/match/${first.id}`).expect(200))
    .body.analysis;
  assert.equal(original.resumeSnapshot.version, 1);
  assert.equal(original.overallScore, first.overallScore);
  const kubernetes = (
    await analyze(o, {
      description:
        'Required skills:\nKubernetes is required for this infrastructure engineering role.',
    }).expect(201)
  ).body.analysis;
  assert.deepEqual(kubernetes.missingSkills.required, ['Kubernetes']);
});
test('cross-user access is denied for resumes, analyses, histories, job lists and deletion', async () => {
  const one = await owner();
  const two = await owner('other-matching@example.com');
  const {
    body: { analysis: a },
  } = await analyze(one).expect(201);
  await analyze(two, { resumeId: one.resume.id }).expect(404);
  await two.agent.get(`/api/match/${a.id}`).expect(404);
  await two.agent
    .delete(`/api/match/${a.id}`)
    .set('x-csrf-token', two.token)
    .expect(404);
  assert.equal(
    (await two.agent.get('/api/match/history')).body.pagination.total,
    0,
  );
  assert.equal(
    (await two.agent.get('/api/job-descriptions')).body.pagination.total,
    0,
  );
  assert.equal(
    (await two.agent.get('/api/dashboard')).body.metrics.analyses,
    0,
  );
  assert.equal(await MatchAnalysis.countDocuments(), 1);
});
test('CSRF, anonymous access, invalid IDs and validation remain enforced', async () => {
  const o = await owner();
  await o.agent
    .post('/api/match/analyze')
    .send({ resumeId: o.resume.id, description: matchingJob })
    .expect(403);
  const anonymous = request.agent(app);
  const {
    body: { csrfToken },
  } = await anonymous.get('/api/auth/csrf');
  await anonymous
    .post('/api/match/analyze')
    .set('x-csrf-token', csrfToken)
    .send({ resumeId: o.resume.id, description: matchingJob })
    .expect(401);
  for (const path of [
    '/api/match/history',
    '/api/match/config',
    '/api/job-descriptions',
    '/api/match/000000000000000000000000',
  ])
    await request(app).get(path).expect(401);
  await analyze(o, { description: 'bad' }).expect(400);
  await analyze(o, { userId: 'injected' }).expect(400);
  await analyze(o, { resumeId: 'invalid' }).expect(400);
  await o.agent.get('/api/match/bad-id').expect(404);
  await o.agent.get('/api/match/history?limit=101').expect(400);
  assert.equal(await MatchAnalysis.countDocuments(), 0);
  assert.equal(await JobDescription.countDocuments(), 0);
});
test('delete analysis removes its job description but preserves the resume', async () => {
  const o = await owner();
  const {
    body: { analysis: a },
  } = await analyze(o).expect(201);
  await o.agent.delete(`/api/match/${a.id}`).expect(403);
  await o.agent
    .delete(`/api/match/${a.id}`)
    .set('x-csrf-token', o.token)
    .expect(204);
  await o.agent.get(`/api/match/${a.id}`).expect(404);
  assert.equal(await Resume.countDocuments(), 1);
  assert.equal(await JobDescription.countDocuments(), 0);
  assert.equal(
    (await o.agent.get('/api/match/history')).body.pagination.total,
    0,
  );
});
test('deleting a resume also removes private analysis snapshots and associated jobs', async () => {
  const o = await owner();
  await analyze(o).expect(201);
  await analyze(o).expect(201);
  await o.agent
    .delete(`/api/resumes/${o.resume.id}`)
    .set('x-csrf-token', o.token)
    .expect(204);
  assert.equal(await MatchAnalysis.countDocuments(), 0);
  assert.equal(await JobDescription.countDocuments(), 0);
});
test('remote embeddings require consent and record the selected method', async () => {
  const o = await owner();
  await analyze(o).expect(201);
  assert.equal(calls, 0);
  const {
    body: { analysis: a },
  } = await analyze(o, { embeddingConsent: true }).expect(201);
  assert.equal(calls, 1);
  assert.equal(a.semantic.externalProcessingUsed, true);
  assert.ok(a.embeddingConsentedAt);
  assert.equal(a.componentScores.semantic.score, 80);
});
test('in-flight edits prevent stale analyses and leave no partial records', async () => {
  const o = await owner();
  const changing = createApp(env, {
    logging: false,
    embeddingProvider: {
      async similarity() {
        await Resume.updateOne({ _id: o.resume.id }, { $inc: { version: 1 } });
        return { value: 0.5, model: 'test' };
      },
    },
  });
  const agent = request.agent(changing);
  const {
    body: { csrfToken },
  } = await agent.get('/api/auth/csrf');
  await agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrfToken)
    .send({ email: o.user.email, password: 'correct horse battery staple' })
    .expect(200);
  await agent
    .post('/api/match/analyze')
    .set('x-csrf-token', csrfToken)
    .send({
      resumeId: o.resume.id,
      description: matchingJob,
      embeddingConsent: true,
    })
    .expect(409);
  assert.equal(await MatchAnalysis.countDocuments(), 0);
  assert.equal(await JobDescription.countDocuments(), 0);
});

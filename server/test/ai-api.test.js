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
import { MatchAnalysis } from '../src/models/MatchAnalysis.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { AISuggestion } from '../src/models/AISuggestion.js';
import { OptimizedResumeVersion } from '../src/models/OptimizedResumeVersion.js';
import { AIUsage } from '../src/models/AIUsage.js';
import { matchingResume, matchingJob } from './fixtures/matching.js';
import { fixtureAIProvider } from './fixtures/ai.js';
const uri =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/resumeiq_test';
if (!/resumeiq_test$/.test(uri)) throw new Error('Test database required');
const env = readEnv({
  NODE_ENV: 'test',
  MONGODB_URI: uri,
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
  CLIENT_URL: 'http://localhost:5173',
  AI_PROVIDER: 'groq',
  GROQ_API_KEY: 'test-only',
  GROQ_MODEL: 'fixture-model',
});
const models = [
  AIUsage,
  AISuggestion,
  OptimizedResumeVersion,
  MatchAnalysis,
  JobDescription,
  Resume,
  Session,
  User,
];
const clean = () => Promise.all(models.map((m) => m.deleteMany({})));
let calls = 0;
const fixture = fixtureAIProvider();
const provider = {
  ...fixture,
  async generate(payload) {
    calls++;
    return fixture.generate(payload);
  },
};
const app = createApp(env, { logging: false, aiProvider: provider });
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
async function owner(email = 'ai@example.com', application = app) {
  const agent = request.agent(application);
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
    extractedText: 'Original unchanged',
    structuredData: matchingResume,
    parsingStatus: 'reviewed',
    parserVersion: 'rules-v1',
  });
  const {
    body: { analysis },
  } = await agent
    .post('/api/match/analyze')
    .set('x-csrf-token', token)
    .send({ resumeId: resume.id, description: matchingJob })
    .expect(201);
  return { agent, token, user, resume, analysis };
}
const post = (o, path, body) =>
  o.agent
    .post('/api/ai/' + path)
    .set('x-csrf-token', o.token)
    .send(body);
async function generated(o) {
  return (
    await post(o, 'suggestions', {
      analysisId: o.analysis.id,
      consent: true,
    }).expect(201)
  ).body.suggestions;
}
async function accepted(o) {
  const items = await generated(o);
  const item = items.find((s) => s.verificationStatus === 'supported');
  return (
    await o.agent
      .patch(`/api/ai/suggestions/${item.id}`)
      .set('x-csrf-token', o.token)
      .send({ status: 'accepted', revision: item.revision })
      .expect(200)
  ).body.suggestion;
}
test('generation enforces consent, persists actual classified responses, and records usage', async () => {
  const o = await owner();
  await post(o, 'suggestions', {
    analysisId: o.analysis.id,
    consent: false,
  }).expect(400);
  assert.equal(calls, 0);
  const items = await generated(o);
  assert.ok(items.some((s) => s.verificationStatus === 'skill_gap'));
  assert.equal(items[0].provider, 'test-fixture');
  assert.ok(items[0].consentedAt);
  assert.equal(items[0].userId, undefined);
  assert.equal((await AIUsage.findOne()).count, 1);
  assert.equal(
    (await o.agent.get(`/api/ai/suggestions/${o.analysis.id}`).expect(200)).body
      .suggestions.length,
    items.length,
  );
});
test('accept/edit/reject/revert, deterministic preview and approved version save preserve originals', async () => {
  const o = await owner();
  const before = (await Resume.findById(o.resume.id)).toObject();
  const item = await accepted(o);
  const {
    body: { preview },
  } = await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [item.id],
  }).expect(200);
  assert.equal(preview.originalScore, o.analysis.overallScore);
  assert.equal(preview.algorithmVersion, o.analysis.algorithmVersion);
  assert.equal(preview.revisedStructuredData.projects[0], item.suggestedText);
  assert.ok(Number.isFinite(preview.improvement));
  await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [item.id],
    save: true,
  }).expect(409);
  const {
    body: { version },
  } = await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [item.id],
    save: true,
    previewHash: preview.previewHash,
  }).expect(201);
  assert.equal(version.originalScore, o.analysis.overallScore);
  assert.equal(version.revisedStructuredData.name, matchingResume.name);
  assert.equal(version.revisedStructuredData.email, matchingResume.email);
  assert.equal(await OptimizedResumeVersion.countDocuments(), 1);
  await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [item.id],
    save: true,
    previewHash: preview.previewHash,
  }).expect(201);
  assert.equal(await OptimizedResumeVersion.countDocuments(), 1);
  const after = (await Resume.findById(o.resume.id)).toObject();
  assert.deepEqual(after, before);
  assert.equal(
    (await MatchAnalysis.findById(o.analysis.id)).overallScore,
    o.analysis.overallScore,
  );
  assert.equal(
    (await o.agent.get(`/api/ai/versions/${o.resume.id}`).expect(200)).body
      .versions.length,
    1,
  );
  const rejected = (
    await o.agent
      .patch(`/api/ai/suggestions/${item.id}`)
      .set('x-csrf-token', o.token)
      .send({ status: 'rejected', revision: item.revision })
      .expect(200)
  ).body.suggestion;
  await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [item.id],
  }).expect(400);
  await o.agent
    .patch(`/api/ai/suggestions/${item.id}`)
    .set('x-csrf-token', o.token)
    .send({ status: 'pending', revision: rejected.revision })
    .expect(200);
  await o.agent
    .delete(`/api/ai/versions/${version.id}`)
    .set('x-csrf-token', o.token)
    .expect(204);
  assert.equal(await OptimizedResumeVersion.countDocuments(), 0);
});
test('unsupported claims and skill gaps cannot enter the score', async () => {
  const o = await owner();
  const items = await generated(o);
  const gap = items.find((s) => s.verificationStatus === 'skill_gap');
  await o.agent
    .patch(`/api/ai/suggestions/${gap.id}`)
    .set('x-csrf-token', o.token)
    .send({
      status: 'accepted',
      revision: 1,
      confirmed: true,
      confirmationEvidence: 'I would like to learn this technology.',
    })
    .expect(400);
  const source = items.find((s) => s.verificationStatus === 'supported');
  await o.agent
    .patch(`/api/ai/suggestions/${source.id}`)
    .set('x-csrf-token', o.token)
    .send({
      status: 'accepted',
      revision: 1,
      editedText: 'Led 100 engineers at Google.',
    })
    .expect(400);
  await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [source.id],
  }).expect(400);
  const editedText = source.suggestedText.slice(0, -1) + ' with Docker.';
  const acceptedResponse = await o.agent
    .patch(`/api/ai/suggestions/${source.id}`)
    .set('x-csrf-token', o.token)
    .send({
      status: 'accepted',
      revision: 1,
      editedText,
      confirmed: true,
      confirmationEvidence:
        'I implemented Docker for this actual React dashboard project.',
    })
    .expect(200);
  assert.equal(acceptedResponse.body.suggestion.confirmed, true);
  const confirmedPreview = await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [source.id],
  }).expect(200);
  assert.ok(
    !confirmedPreview.body.preview.revisedAnalysis.missingSkills.required.includes(
      'Docker',
    ),
  );
});
test('authenticated single-bullet optimization, stale revisions and source updates are validated', async () => {
  const o = await owner();
  const {
    body: { suggestions },
  } = await post(o, 'optimize', {
    analysisId: o.analysis.id,
    consent: true,
    section: 'projects',
    index: 0,
  }).expect(201);
  assert.equal(suggestions.length, 1);
  await post(o, 'optimize', {
    analysisId: o.analysis.id,
    consent: true,
    section: 'projects',
    index: 99,
  }).expect(400);
  const s = suggestions[0];
  await o.agent
    .patch(`/api/ai/suggestions/${s.id}`)
    .set('x-csrf-token', o.token)
    .send({ status: 'rejected', revision: 1 })
    .expect(200);
  await o.agent
    .patch(`/api/ai/suggestions/${s.id}`)
    .set('x-csrf-token', o.token)
    .send({ status: 'accepted', revision: 1 })
    .expect(409);
  await Resume.updateOne({ _id: o.resume.id }, { $inc: { version: 1 } });
  await post(o, 'suggestions', {
    analysisId: o.analysis.id,
    consent: true,
  }).expect(409);
});
test('cross-user access, authentication and CSRF cover generated content and versions', async () => {
  const a = await owner();
  const b = await owner('other-ai@example.com');
  const item = await accepted(a);
  const {
    body: { preview },
  } = await post(a, 'recalculate', {
    analysisId: a.analysis.id,
    suggestionIds: [item.id],
  }).expect(200);
  const {
    body: { version },
  } = await post(a, 'recalculate', {
    analysisId: a.analysis.id,
    suggestionIds: [item.id],
    save: true,
    previewHash: preview.previewHash,
  }).expect(201);
  await post(b, 'suggestions', {
    analysisId: a.analysis.id,
    consent: true,
  }).expect(404);
  await b.agent.get(`/api/ai/suggestions/${a.analysis.id}`).expect(404);
  await b.agent.get(`/api/ai/versions/${a.resume.id}`).expect(404);
  await b.agent
    .delete(`/api/ai/versions/${version.id}`)
    .set('x-csrf-token', b.token)
    .expect(404);
  await b.agent
    .patch(`/api/ai/suggestions/${item.id}`)
    .set('x-csrf-token', b.token)
    .send({ status: 'accepted', revision: 1 })
    .expect(404);
  await a.agent
    .post('/api/ai/suggestions')
    .send({ analysisId: a.analysis.id, consent: true })
    .expect(403);
  await request(app).get('/api/ai/config').expect(401);
  await a.agent.delete(`/api/ai/versions/${version.id}`).expect(403);
});
test('invalid provider output is not persisted and no-key mode is explicit', async () => {
  const bad = createApp(env, {
    logging: false,
    aiProvider: {
      name: 'invalid',
      async generate() {
        return {
          data: { suggestions: [{ invented: 'claim' }] },
          model: 'invalid',
        };
      },
    },
  });
  const o = await owner('bad-ai@example.com', bad);
  await post(o, 'suggestions', {
    analysisId: o.analysis.id,
    consent: true,
  }).expect(502);
  assert.equal(await AISuggestion.countDocuments(), 0);
  const disabled = createApp(env, { logging: false, aiProvider: null });
  const d = await owner('disabled-ai@example.com', disabled);
  await post(d, 'suggestions', {
    analysisId: d.analysis.id,
    consent: true,
  }).expect(503);
});
test('persistent daily quotas bound costs and failed generations count toward the cap', async () => {
  const limited = createApp(
    { ...env, AI_DAILY_REQUEST_LIMIT: 1 },
    { logging: false, aiProvider: provider },
  );
  const o = await owner('quota@example.com', limited);
  await generated(o);
  await post(o, 'suggestions', {
    analysisId: o.analysis.id,
    consent: true,
  }).expect(429);
  assert.equal(calls, 1);
});
test('analysis and resume deletion cascade AI history without touching other owners', async () => {
  const o = await owner();
  const item = await accepted(o);
  const {
    body: { preview },
  } = await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [item.id],
  }).expect(200);
  await post(o, 'recalculate', {
    analysisId: o.analysis.id,
    suggestionIds: [item.id],
    save: true,
    previewHash: preview.previewHash,
  }).expect(201);
  await o.agent
    .delete(`/api/match/${o.analysis.id}`)
    .set('x-csrf-token', o.token)
    .expect(204);
  assert.equal(await AISuggestion.countDocuments(), 0);
  assert.equal(await OptimizedResumeVersion.countDocuments(), 0);
  assert.equal(await Resume.countDocuments(), 1);
});

test('schema failures expose safe useful details, empty results succeed, and no invalid data is persisted', async () => {
  const { readFile } = await import('node:fs/promises');
  const raw = JSON.parse(
    await readFile(
      new URL('./fixtures/groq-invalid-target.json', import.meta.url),
      'utf8',
    ),
  );
  const bad = createApp(env, {
    logging: false,
    aiProvider: {
      name: 'captured-fictional-response',
      async generate() {
        return { data: raw, model: 'openai/gpt-oss-20b' };
      },
    },
  });
  const o = await owner('schema-regression@example.com', bad);
  const result = await post(o, 'suggestions', {
    analysisId: o.analysis.id,
    consent: true,
  }).expect(502);
  assert.equal(result.body.error.code, 'AI_SCHEMA_INVALID');
  assert.match(result.body.error.message, /invalid format/);
  assert.equal(
    result.body.error.message.includes('Something went wrong'),
    false,
  );
  assert.equal(await AISuggestion.countDocuments(), 0);
  const empty = createApp(env, {
    logging: false,
    aiProvider: {
      name: 'empty',
      async generate() {
        return { data: { suggestions: [] }, model: 'fixture-model' };
      },
    },
  });
  const e = await owner('empty-ai@example.com', empty);
  const success = await post(e, 'suggestions', {
    analysisId: e.analysis.id,
    consent: true,
  }).expect(201);
  assert.deepEqual(success.body.suggestions, []);
  await post(e, 'optimize', {
    analysisId: e.analysis.id,
    consent: true,
    section: 'projects',
    index: 0,
  }).expect(502);
});
test('provider errors have distinct HTTP codes and public messages without leaked provider bodies', async () => {
  const { default: Groq } = await import('groq-sdk');
  for (const [raw, status, code] of [
    [
      {
        status: 429,
        headers: new Headers({ 'retry-after': '5' }),
        message: 'private secret',
      },
      429,
      'AI_RATE_LIMITED',
    ],
    [{ status: 500, message: 'private secret' }, 502, 'AI_PROVIDER_ERROR'],
    [
      new Groq.APIConnectionTimeoutError({ message: 'private secret' }),
      504,
      'AI_TIMEOUT',
    ],
    [new Error('private secret'), 500, 'AI_INTERNAL_ERROR'],
  ]) {
    const failing = createApp(env, {
      logging: false,
      aiProvider: {
        async generate() {
          throw raw;
        },
      },
    });
    const o = await owner(`${code.toLowerCase()}@example.com`, failing);
    const result = await post(o, 'suggestions', {
      analysisId: o.analysis.id,
      consent: true,
    }).expect(status);
    assert.equal(result.body.error.code, code);
    assert.ok(!JSON.stringify(result.body).includes('private secret'));
    if (status === 429) assert.equal(result.headers['retry-after'], '5');
  }
});

// Opt-in diagnostic. Fictional data only; no live requests in the automated suite.
// Run from the repository root: node server/test/groq-live-check.mjs --live
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { createAIProvider } from '../src/services/ai/provider.js';
import { Resume } from '../src/models/Resume.js';
import { matchingResume, matchingJob } from './fixtures/matching.js';
if (!process.argv.includes('--live'))
  throw new Error(
    'Explicit --live is required; this uses Groq quota with fictional data.',
  );
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
const uri = 'mongodb://127.0.0.1:27018/resumeiq_groq_check';
const env = readEnv({
  ...process.env,
  NODE_ENV: 'test',
  MONGODB_URI: uri,
  CLIENT_URL: 'http://127.0.0.1:5173',
  JWT_SECRET: 'fictional-smoke-test-secret-at-least-32-characters',
  EMBEDDING_PROVIDER: 'disabled',
});
const summary = {
  checkedOn: new Date().toISOString().slice(0, 10),
  fictionalDataOnly: true,
  requestedModel: env.GROQ_MODEL,
  stages: [],
};
let userId;
let stage = 'models';
try {
  const provider = createAIProvider(env);
  assert.ok(provider, 'Groq must be configured');
  summary.resolvedModel = await provider.resolveModel();
  summary.stages.push({
    stage: 'models',
    available: true,
    model: summary.resolvedModel,
  });
  await connectDatabase(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp(env, { logging: false, aiProvider: provider });
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
  const register = await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({
      name: 'Fictional Candidate',
      email: `groq-check-${Date.now()}@resumeiq.invalid`,
      password: 'fictional smoke test password',
    });
  assert.equal(register.status, 201);
  userId = register.body.user.id;
  const resume = await Resume.create({
    userId,
    originalFilename: 'fictional-live-check.docx',
    fileType: 'docx',
    fileSize: 100,
    extractedText: 'Fictional diagnostic only',
    structuredData: matchingResume,
    parsingStatus: 'reviewed',
    parserVersion: 'rules-v1',
  });
  const library = await agent.get('/api/resumes');
  assert.ok(library.body.resumes.some((r) => r.id === resume.id));
  const analysisResponse = await agent
    .post('/api/match/analyze')
    .set('x-csrf-token', csrf)
    .send({
      resumeId: resume.id,
      description: matchingJob,
      title: 'Fictional Full Stack Developer',
    });
  assert.equal(analysisResponse.status, 201);
  const analysis = analysisResponse.body.analysis;
  await agent.get(`/api/match/${analysis.id}`).expect(200);
  const post = (path, body) =>
    agent.post(`/api/ai/${path}`).set('x-csrf-token', csrf).send(body);
  await post('suggestions', { analysisId: analysis.id, consent: false }).expect(
    400,
  );
  stage = 'keywords';
  const start = Date.now();
  const generated = await post('suggestions', {
    analysisId: analysis.id,
    consent: true,
  });
  summary.stages.push({
    stage,
    httpStatus: generated.status,
    durationMs: Date.now() - start,
    ...(generated.body.error
      ? {
          errorCode: generated.body.error.code,
          message: generated.body.error.message,
        }
      : {}),
    count: generated.body.suggestions?.length,
    categories: generated.body.suggestions?.map((s) => s.verificationStatus),
  });
  assert.equal(generated.status, 201);
  await agent.get(`/api/ai/suggestions/${analysis.id}`).expect(200);
  let editable = generated.body.suggestions.find(
    (s) => s.section && s.verificationStatus !== 'skill_gap',
  );
  if (!editable) {
    stage = 'bullet';
    const bullet = await post('optimize', {
      analysisId: analysis.id,
      consent: true,
      section: 'projects',
      index: 0,
    });
    summary.stages.push({
      stage,
      httpStatus: bullet.status,
      ...(bullet.body.error ? { errorCode: bullet.body.error.code } : {}),
    });
    assert.equal(bullet.status, 201);
    editable = bullet.body.suggestions[0];
  }
  assert.ok(editable.section && editable.verificationStatus !== 'skill_gap');
  stage = 'edit_and_accept';
  const editedText = editable.originalText.replace(/^Built/, 'Developed');
  const decision = await agent
    .patch(`/api/ai/suggestions/${editable.id}`)
    .set('x-csrf-token', csrf)
    .send({
      status: 'accepted',
      revision: editable.revision,
      editedText,
      confirmed: true,
      confirmationEvidence: editable.originalText,
    });
  summary.stages.push({ stage, httpStatus: decision.status });
  assert.equal(decision.status, 200);
  stage = 'recalculate';
  const recalculated = await post('recalculate', {
    analysisId: analysis.id,
    suggestionIds: [editable.id],
  });
  assert.equal(recalculated.status, 200);
  assert.equal(
    recalculated.body.preview.algorithmVersion,
    analysis.algorithmVersion,
  );
  summary.stages.push({
    stage,
    httpStatus: recalculated.status,
    originalScore: recalculated.body.preview.originalScore,
    optimizedScore: recalculated.body.preview.revisedScore,
    improvement: recalculated.body.preview.improvement,
    algorithmUnchanged: true,
  });
  summary.success = true;
} catch (error) {
  summary.success = false;
  summary.failure = {
    stage,
    name: error.name,
    code: error.code?.startsWith?.('AI_') ? error.code : undefined,
  };
  process.exitCode = 1;
} finally {
  if (userId && mongoose.connection.readyState === 1)
    await Promise.all(
      Object.values(mongoose.models)
        .filter((m) => m.schema.path('userId'))
        .map((m) => m.deleteMany({ userId })),
    );
  if (userId) await mongoose.models.User?.deleteOne({ _id: userId });
  await mongoose.disconnect();
  console.log(JSON.stringify(summary, null, 2));
  await writeFile(
    new URL('../../docs/examples/groq-fix-live-check.json', import.meta.url),
    JSON.stringify(summary, null, 2) + '\n',
  );
}

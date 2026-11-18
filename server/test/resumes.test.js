import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import { readEnv } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Resume } from '../src/models/Resume.js';
import { docxFixture, pdfFixture } from './fixtures/documents.js';
const uri =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/resumeiq_test';
if (!/\/resumeiq_test(?:[?]|$)/.test(uri))
  throw new Error('TEST_MONGODB_URI must select resumeiq_test');
const app = createApp(
  readEnv({
    NODE_ENV: 'test',
    MONGODB_URI: uri,
    JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
    CLIENT_URL: 'http://localhost:5173',
  }),
  { logging: false },
);
const clean = () =>
  Promise.all([
    Resume.deleteMany({}),
    User.deleteMany({}),
    Session.deleteMany({}),
  ]);
before(async () => {
  await connectDatabase(uri);
  await Promise.all([User.init(), Session.init(), Resume.init()]);
});
beforeEach(clean);
after(async () => {
  await clean();
  await mongoose.disconnect();
});
async function account(email = 'owner@example.com') {
  const agent = request.agent(app);
  const {
    body: { csrfToken: token },
  } = await agent.get('/api/auth/csrf').expect(200);
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
  return { agent, token, user };
}
const upload = (owner, buffer, name = 'resume.docx') =>
  owner.agent
    .post('/api/resumes/upload')
    .set('x-csrf-token', owner.token)
    .attach('resume', buffer, {
      filename: name,
      contentType: 'application/octet-stream',
    });
test('upload, paginated list, read, corrected save, reload, count and delete persist in MongoDB', async () => {
  const owner = await account();
  const response = await upload(owner, await docxFixture()).expect(201);
  const resume = response.body.resume;
  assert.equal(resume.structuredData.name, 'Alex Morgan');
  assert.equal(resume.userId, undefined);
  assert.equal(resume.version, 1);
  assert.equal(resume.parsingStatus, 'parsed');
  assert.match(resume.extractedText, /ReactJS/);
  const stored = await Resume.findById(resume.id);
  assert.equal(String(stored.userId), owner.user.id);
  assert.equal(stored.originalFilename, 'resume.docx');
  const list = (
    await owner.agent.get('/api/resumes?page=1&limit=1').expect(200)
  ).body;
  assert.equal(list.pagination.total, 1);
  assert.equal(list.resumes[0].extractedText, undefined);
  assert.equal(list.resumes[0].structuredData, undefined);
  assert.equal(
    (await owner.agent.get('/api/dashboard').expect(200)).body.metrics.resumes,
    1,
  );
  const structuredData = {
    ...resume.structuredData,
    name: 'Alex Taylor',
    skills: ['JS', 'JavaScript', 'ReactJS'],
  };
  const changed = (
    await owner.agent
      .patch(`/api/resumes/${resume.id}`)
      .set('x-csrf-token', owner.token)
      .send({ structuredData, version: 1 })
      .expect(200)
  ).body.resume;
  assert.equal(changed.version, 2);
  assert.equal(changed.parsingStatus, 'reviewed');
  assert.ok(changed.reviewedAt);
  assert.deepEqual(changed.structuredData.skills, ['JavaScript', 'React']);
  assert.equal(changed.extractedText, resume.extractedText);
  assert.equal(
    (await owner.agent.get(`/api/resumes/${resume.id}`).expect(200)).body.resume
      .structuredData.name,
    'Alex Taylor',
  );
  await owner.agent
    .patch(`/api/resumes/${resume.id}`)
    .set('x-csrf-token', owner.token)
    .send({ structuredData, version: 1 })
    .expect(409);
  await owner.agent
    .delete(`/api/resumes/${resume.id}`)
    .set('x-csrf-token', owner.token)
    .expect(204);
  await owner.agent.get(`/api/resumes/${resume.id}`).expect(404);
  assert.equal(await Resume.countDocuments(), 0);
  assert.equal(
    (await owner.agent.get('/api/dashboard').expect(200)).body.metrics.resumes,
    0,
  );
});
test('PDF content is parsed and empty/scanned documents have review status', async () => {
  const owner = await account();
  const normal = await upload(owner, await pdfFixture(), 'resume.pdf').expect(
    201,
  );
  assert.equal(normal.body.resume.fileType, 'pdf');
  assert.ok(normal.body.resume.structuredData.education.length);
  const blank = await upload(owner, await pdfFixture(''), 'scanned.pdf').expect(
    201,
  );
  assert.equal(blank.body.resume.parsingStatus, 'needs_review');
  assert.match(blank.body.resume.warnings.join(' '), /OCR/);
});
test('all private endpoints reject anonymous access', async () => {
  await request(app).get('/api/resumes').expect(401);
  await request(app).get('/api/resumes/000000000000000000000000').expect(401);
  const agent = request.agent(app);
  const {
    body: { csrfToken },
  } = await agent.get('/api/auth/csrf');
  for (const method of ['post', 'patch', 'delete'])
    await agent[method](
      method === 'post'
        ? '/api/resumes/upload'
        : '/api/resumes/000000000000000000000000',
    )
      .set('x-csrf-token', csrfToken)
      .expect(401);
});
test('ownership isolates list, counts, details, updates and deletes', async () => {
  const owner = await account();
  const other = await account('other@example.com');
  const {
    body: { resume },
  } = await upload(owner, await docxFixture()).expect(201);
  assert.equal(
    (await other.agent.get('/api/resumes').expect(200)).body.pagination.total,
    0,
  );
  assert.equal(
    (await other.agent.get('/api/dashboard')).body.metrics.resumes,
    0,
  );
  await other.agent.get(`/api/resumes/${resume.id}`).expect(404);
  await other.agent
    .patch(`/api/resumes/${resume.id}`)
    .set('x-csrf-token', other.token)
    .send({ structuredData: resume.structuredData, version: 1 })
    .expect(404);
  await other.agent
    .delete(`/api/resumes/${resume.id}`)
    .set('x-csrf-token', other.token)
    .expect(404);
  assert.equal(await Resume.countDocuments(), 1);
});
test('upload and mutations retain CSRF protection', async () => {
  const owner = await account();
  await owner.agent
    .post('/api/resumes/upload')
    .attach('resume', await docxFixture(), 'resume.docx')
    .expect(403);
  const {
    body: { resume },
  } = await upload(owner, await docxFixture()).expect(201);
  await owner.agent
    .patch(`/api/resumes/${resume.id}`)
    .send({ structuredData: resume.structuredData, version: 1 })
    .expect(403);
  await owner.agent.delete(`/api/resumes/${resume.id}`).expect(403);
  assert.equal(await Resume.countDocuments(), 1);
});
test('rejects invalid content, forged extensions, oversized files and malformed documents', async () => {
  const owner = await account();
  await upload(owner, Buffer.from('not a PDF'), 'resume.pdf').expect(415);
  await upload(owner, await docxFixture(), 'resume.pdf').expect(415);
  await upload(owner, Buffer.alloc(5 * 1024 * 1024 + 1), 'large.pdf').expect(
    413,
  );
  await upload(owner, Buffer.from('%PDF-broken'), 'broken.pdf').expect(422);
  await upload(owner, Buffer.from('PK\x03\x04broken'), 'broken.docx').expect(
    422,
  );
  await upload(owner, Buffer.alloc(0), 'empty.pdf').expect(400);
  await owner.agent
    .post('/api/resumes/upload')
    .set('x-csrf-token', owner.token)
    .expect(400);
  await owner.agent
    .post('/api/resumes/upload')
    .set('x-csrf-token', owner.token)
    .attach('unexpected', await docxFixture(), 'resume.docx')
    .expect(400);
  assert.equal(await Resume.countDocuments(), 0);
});
test('strict update validation prevents metadata/ownership injection and invalid data', async () => {
  const owner = await account();
  const {
    body: { resume },
  } = await upload(owner, await docxFixture()).expect(201);
  for (const body of [
    {
      userId: '000000000000000000000000',
      structuredData: resume.structuredData,
      version: 1,
    },
    {
      structuredData: { ...resume.structuredData, email: 'not-email' },
      version: 1,
    },
    {
      structuredData: { ...resume.structuredData, skills: ['x'.repeat(121)] },
      version: 1,
    },
    { structuredData: resume.structuredData },
  ])
    await owner.agent
      .patch(`/api/resumes/${resume.id}`)
      .set('x-csrf-token', owner.token)
      .send(body)
      .expect(400);
  await owner.agent.get('/api/resumes/not-an-id').expect(404);
  await owner.agent.get('/api/resumes?limit=101').expect(400);
  assert.equal((await Resume.findById(resume.id)).version, 1);
});

test('the 5 MB boundary is inclusive and large structured corrections are accepted', async () => {
  const owner = await account();
  const pdf = await pdfFixture();
  const exact = Buffer.concat([
    pdf,
    Buffer.alloc(5 * 1024 * 1024 - pdf.length, 32),
  ]);
  const {
    body: { resume },
  } = await upload(owner, exact, 'exact.pdf').expect(201);
  const structuredData = {
    ...resume.structuredData,
    projects: Array.from(
      { length: 30 },
      (_, i) => `Project ${i} ` + 'a'.repeat(1400),
    ),
  };
  await owner.agent
    .patch(`/api/resumes/${resume.id}`)
    .set('x-csrf-token', owner.token)
    .send({ structuredData, version: 1 })
    .expect(200);
  assert.equal(
    (await Resume.findById(resume.id)).structuredData.projects.length,
    30,
  );
});

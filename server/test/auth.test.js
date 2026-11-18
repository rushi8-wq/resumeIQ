import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import { readEnv } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
const uri =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/resumeiq_test';
// Never run destructive test cleanup against a non-test database.
if (!/\/resumeiq_test(?:[?]|$)/.test(uri))
  throw new Error('TEST_MONGODB_URI must select resumeiq_test');
const env = readEnv({
  NODE_ENV: 'test',
  MONGODB_URI: uri,
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
  CLIENT_URL: 'http://localhost:5173',
});
const app = createApp(env, { logging: false });
const values = {
  name: 'Alex Morgan',
  email: 'alex@example.com',
  password: 'correct horse battery staple',
};
before(async () => {
  await connectDatabase(uri);
  await Promise.all([User.init(), Session.init()]);
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
});
after(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
  await mongoose.disconnect();
});
async function agentWithCsrf() {
  const agent = request.agent(app);
  const response = await agent.get('/api/auth/csrf').expect(200);
  return { agent, token: response.body.csrfToken };
}
test('health reflects real MongoDB readiness', async () => {
  const r = await request(app).get('/api/health').expect(200);
  assert.equal(r.body.database, 'connected');
});
test('register persists a hash, sets HTTP-only cookie, and protects profile', async () => {
  const { agent, token } = await agentWithCsrf();
  const response = await agent
    .post('/api/auth/register')
    .set('x-csrf-token', token)
    .send(values)
    .expect(201);
  assert.equal(response.body.user.email, values.email);
  assert.equal(response.body.user.passwordHash, undefined);
  assert.equal(response.body.user.aiConsent, false);
  assert.match(response.headers['set-cookie'].join(';'), /HttpOnly/);
  const stored = await User.findOne({ email: values.email }).select(
    '+passwordHash',
  );
  assert.notEqual(stored.passwordHash, values.password);
  assert.match(stored.passwordHash, /^\$2/);
  assert.equal(
    (await agent.get('/api/auth/me').expect(200)).body.user.id,
    stored.id,
  );
  assert.equal(
    (await agent.get('/api/dashboard').expect(200)).body.features.resumeUpload,
    true,
  );
});
test('anonymous users cannot access private endpoints', async () => {
  await request(app).get('/api/auth/me').expect(401);
  await request(app).get('/api/dashboard').expect(401);
});
test('CSRF and hostile origins are rejected before writes', async () => {
  await request(app).post('/api/auth/register').send(values).expect(403);
  const { agent, token } = await agentWithCsrf();
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', token)
    .set('Origin', 'https://attacker.example')
    .send(values)
    .expect(403);
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', 'z'.repeat(64))
    .send(values)
    .expect(403);
  assert.equal(await User.countDocuments(), 0);
});
test('invalid input, mass assignment, duplicate emails, and bcrypt byte limit', async () => {
  const { agent, token } = await agentWithCsrf();
  const post = (body) =>
    agent.post('/api/auth/register').set('x-csrf-token', token).send(body);
  await post({ ...values, password: 'short' }).expect(400);
  await post({ ...values, aiConsent: true }).expect(400);
  await post({ ...values, password: '🔐'.repeat(20) }).expect(400);
  await post(values).expect(201);
  await post({ ...values, email: 'ALEX@example.com' }).expect(409);
  assert.equal(await User.countDocuments(), 1);
});
test('login survives a new client; logout revokes replayed JWT', async () => {
  const first = await agentWithCsrf();
  await first.agent
    .post('/api/auth/register')
    .set('x-csrf-token', first.token)
    .send(values)
    .expect(201);
  const { agent, token } = await agentWithCsrf();
  await agent
    .post('/api/auth/login')
    .set('x-csrf-token', token)
    .send({ email: values.email, password: 'wrong' })
    .expect(401);
  const login = await agent
    .post('/api/auth/login')
    .set('x-csrf-token', token)
    .send({ email: values.email, password: values.password })
    .expect(200);
  const cookie = login.headers['set-cookie']
    .find((c) => c.startsWith('resumeiq_session='))
    .split(';')[0];
  await agent.get('/api/auth/me').expect(200);
  await agent.post('/api/auth/logout').set('x-csrf-token', token).expect(204);
  await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
});
test('session expiry and forged cookies do not authenticate', async () => {
  const { agent, token } = await agentWithCsrf();
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', token)
    .send(values)
    .expect(201);
  await Session.updateMany({}, { $set: { expiresAt: new Date(0) } });
  await agent.get('/api/auth/me').expect(401);
  await request(app)
    .get('/api/auth/me')
    .set('Cookie', 'resumeiq_session=forged')
    .expect(401);
});
test('private responses are not cacheable and JSON parser errors are controlled', async () => {
  const r = await request(app).get('/api/auth/csrf').expect(200);
  assert.equal(r.headers['cache-control'], 'no-store');
  await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{bad')
    .expect(400);
});

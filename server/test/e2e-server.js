import { fixtureJobProvider } from './fixtures/jobs.js';
// Explicit automated-test entrypoint, never imported by production src or Docker.
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { fixtureAIProvider } from './fixtures/ai.js';
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/resumeiq_e2e';
if (!uri.endsWith('/resumeiq_e2e'))
  throw new Error('E2E server requires a dedicated resumeiq_e2e database');
const env = readEnv({
  ...process.env,
  NODE_ENV: 'test',
  MONGODB_URI: uri,
  JWT_SECRET: 'e2e-only-test-secret-at-least-32-characters',
  CLIENT_URL: 'http://127.0.0.1:5173',
  AI_PROVIDER: 'groq',
  GROQ_API_KEY: 'fixture-only-no-network',
  GROQ_MODEL: 'fixture-model',
  EMBEDDING_PROVIDER: 'disabled',
});
await connectDatabase(uri);
const app = createApp(env, {
  logging: false,
  aiProvider: fixtureAIProvider(),
  jobProvider: fixtureJobProvider(),
});
await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
const server = app.listen(4000, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    }),
  );

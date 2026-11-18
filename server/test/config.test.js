import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEnv } from '../src/config/env.js';
const base = {
  MONGODB_URI: 'mongodb://localhost/resumeiq',
  JWT_SECRET: 'a'.repeat(32),
};
test('rejects missing secrets and insecure production URLs', () => {
  assert.throws(() => readEnv({}));
  assert.throws(() => readEnv({ ...base, JWT_SECRET: 'short' }));
  assert.throws(() =>
    readEnv({
      ...base,
      NODE_ENV: 'production',
      CLIENT_URL: 'http://example.com',
    }),
  );
  assert.throws(() => readEnv({ ...base, COOKIE_SAME_SITE: 'none' }));
  assert.equal(
    readEnv({
      ...base,
      NODE_ENV: 'production',
      CLIENT_URL: 'https://example.com',
    }).PORT,
    4000,
  );
});

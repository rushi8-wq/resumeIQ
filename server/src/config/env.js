import 'dotenv/config';
import { z } from 'zod';
import { scoringConfig } from './scoring.js';
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//),
  JWT_SECRET: z.string().min(32),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  MATCH_WEIGHTS_JSON: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['disabled', 'openai']).default('disabled'),
  EMBEDDING_MODEL: z.string().min(1).max(100).default('text-embedding-3-small'),
  OPENAI_API_KEY: z.string().optional(),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  AI_PROVIDER: z.enum(['disabled', 'groq']).default('groq'),
  GROQ_API_KEY: z.string().trim().optional(),
  GROQ_MODEL: z.string().trim().min(1).max(150).default('auto'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
});
export function readEnv(input = process.env) {
  const env = schema.parse(input);
  if (env.NODE_ENV === 'production' && !env.CLIENT_URL.startsWith('https://'))
    throw new Error('Production CLIENT_URL must use HTTPS');
  if (env.COOKIE_SAME_SITE === 'none' && env.NODE_ENV !== 'production')
    throw new Error('SameSite=None requires production HTTPS');
  scoringConfig(env);
  return env;
}

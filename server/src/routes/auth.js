import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { User, publicUser } from '../models/User.js';
import { Session } from '../models/Session.js';
import { HttpError } from '../middleware/errors.js';
import {
  authenticate,
  createSession,
  cookieOptions,
  SESSION_MS,
} from '../services/auth.js';
const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase().trim());
const password = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .refine(
    (s) => Buffer.byteLength(s, 'utf8') <= 72,
    'Use at most 72 UTF-8 bytes.',
  );
export function authRoutes(env) {
  const router = Router();
  const requireAuth = authenticate(env);
  // Double-submit token delivered in JSON so cross-origin clients need no cookie access.
  router.get('/csrf', (req, res) => {
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie('resumeiq_csrf', csrfToken, {
      ...cookieOptions(env),
      maxAge: SESSION_MS,
    });
    res.json({ csrfToken });
  });
  router.post('/register', async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(2).max(100), email, password })
      .strict()
      .parse(req.body);
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
    });
    await createSession(res, user, env);
    res.status(201).json({ user: publicUser(user) });
  });
  const dummyHash = bcrypt.hashSync('constant-timing-placeholder', 12);
  router.post('/login', async (req, res) => {
    const input = z
      .object({ email, password: z.string().min(1).max(200) })
      .strict()
      .parse(req.body);
    const user = await User.findOne({ email: input.email }).select(
      '+passwordHash',
    );
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash || dummyHash,
    );
    if (!user || !valid)
      throw new HttpError(401, 'Email or password is incorrect.');
    await createSession(res, user, env);
    res.json({ user: publicUser(user) });
  });
  router.get('/me', requireAuth, (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  router.post('/logout', requireAuth, async (req, res) => {
    await Session.deleteOne({ _id: req.sessionId });
    res.clearCookie('resumeiq_session', cookieOptions(env));
    res.status(204).end();
  });
  return router;
}

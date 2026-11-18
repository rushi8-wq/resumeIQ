import { randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { HttpError } from '../middleware/errors.js';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export function cookieOptions(env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
  };
}
export async function createSession(res, user, env) {
  const sessionId = randomBytes(32).toString('hex');
  await Session.create({
    _id: sessionId,
    userId: user._id,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: user.id,
    jwtid: sessionId,
    expiresIn: '7d',
    issuer: 'resumeiq',
    audience: 'resumeiq-web',
    algorithm: 'HS256',
  });
  res.cookie('resumeiq_session', token, {
    ...cookieOptions(env),
    maxAge: SESSION_MS,
  });
}
export function authenticate(env) {
  return async (req, res, next) => {
    let payload;
    try {
      payload = jwt.verify(req.cookies.resumeiq_session, env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'resumeiq',
        audience: 'resumeiq-web',
      });
    } catch {
      throw new HttpError(401, 'Please sign in to continue.');
    }
    const session = await Session.findOne({
      _id: payload.jti,
      userId: payload.sub,
      expiresAt: { $gt: new Date() },
    });
    if (!session)
      throw new HttpError(
        401,
        'Your session has expired. Please sign in again.',
      );
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, 'Please sign in to continue.');
    req.user = user;
    req.sessionId = payload.jti;
    next();
  };
}
export function csrfGuard(env) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (
      req.get('origin') &&
      req.get('origin') !== new URL(env.CLIENT_URL).origin
    )
      throw new HttpError(403, 'Request origin is not allowed.');
    const token = req.get('x-csrf-token');
    const cookie = req.cookies.resumeiq_csrf;
    if (
      !token ||
      !cookie ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !/^[a-f0-9]{64}$/.test(cookie) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(cookie))
    )
      throw new HttpError(
        403,
        'Security token is missing or expired. Refresh and try again.',
      );
    next();
  };
}

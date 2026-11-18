import { jobRoutes } from './routes/jobs.js';
import { SavedJob } from './models/SavedJob.js';
import express from 'express';
import { aiRoutes } from './routes/ai.js';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { MatchAnalysis } from './models/MatchAnalysis.js';
import { matchRoutes, jobDescriptionRoutes } from './routes/match.js';
import { Resume } from './models/Resume.js';
import { resumeRoutes } from './routes/resumes.js';
import { authRoutes } from './routes/auth.js';
import { csrfGuard, authenticate } from './services/auth.js';
import { errorHandler } from './middleware/errors.js';
export function createApp(
  env,
  { logging = true, embeddingProvider, aiProvider, jobProvider } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  if (logging)
    app.use(
      pinoHttp({
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url?.split('?')[0],
          }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.use('/api/resumes', express.json({ limit: '256kb' }));
  app.use('/api/match', express.json({ limit: '64kb' }));
  app.use('/api/ai', express.json({ limit: '128kb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.get('/api/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      database: ready ? 'connected' : 'disconnected',
      milestone: 5,
    });
  });
  app.use('/api', csrfGuard(env));
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.NODE_ENV === 'test' ? 1000 : 60,
      skip: (req) => req.method === 'GET',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    authRoutes(env),
  );
  app.use('/api/resumes', resumeRoutes(env));
  app.use('/api/match', matchRoutes(env, { embeddingProvider }));
  app.use('/api/job-descriptions', jobDescriptionRoutes(env));
  app.use('/api/ai', aiRoutes(env, { aiProvider }));
  app.use('/api/jobs', jobRoutes(env, { jobProvider }));
  app.get('/api/dashboard', authenticate(env), async (req, res) => {
    const [stats] = await MatchAnalysis.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          average: { $avg: '$overallScore' },
        },
      },
    ]);
    res.json({
      milestone: 5,
      features: {
        authentication: true,
        resumeUpload: true,
        analysis: true,
        optimization: true,
        discovery: true,
      },
      metrics: {
        resumes: await Resume.countDocuments({ userId: req.user._id }),
        analyses: stats?.count || 0,
        averageScore:
          stats?.average == null ? null : Math.round(stats.average * 100) / 100,
        savedJobs: await SavedJob.countDocuments({ userId: req.user._id }),
      },
    });
  });
  app.use((req, res) =>
    res.status(404).json({ error: { message: 'Endpoint not found.' } }),
  );
  app.use(errorHandler);
  return app;
}

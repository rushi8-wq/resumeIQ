import { deleteAnalysisAI } from '../services/ai/lifecycle.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../services/auth.js';
import { HttpError } from '../middleware/errors.js';
import { Resume } from '../models/Resume.js';
import { JobDescription, publicJob } from '../models/JobDescription.js';
import { MatchAnalysis, publicAnalysis } from '../models/MatchAnalysis.js';
import { analyzeSchema, paginationSchema } from '../validation/match.js';
import { parseJob } from '../services/matching/jobParser.js';
import { scoreMatch } from '../services/matching/score.js';
import { scoringConfig } from '../config/scoring.js';
import {
  createEmbeddingProvider,
  embeddingAvailability,
} from '../services/matching/embeddings.js';
export function matchRoutes(env, { embeddingProvider } = {}) {
  const router = Router();
  router.use(authenticate(env));
  const config = scoringConfig(env);
  const provider =
    embeddingProvider === undefined
      ? createEmbeddingProvider(env)
      : embeddingProvider;
  router.get('/config', (req, res) =>
    res.json({
      weights: config.weights,
      algorithmVersion: config.version,
      embeddings: embeddingAvailability(env),
    }),
  );
  router.post('/analyze', async (req, res) => {
    const input = analyzeSchema.parse(req.body);
    const resume = await Resume.findOne({
      _id: input.resumeId,
      userId: req.user._id,
    });
    if (!resume) throw new HttpError(404, 'Resume not found.');
    const saved = resume.structuredData.toObject();
    const { name, email, ...structuredData } = saved;
    const parsedRequirements = parseJob(input.description);
    const result = await scoreMatch(
      structuredData,
      { ...parsedRequirements, sourceText: input.description },
      {
        config,
        provider,
        consent: input.embeddingConsent,
        resumeReviewed: resume.parsingStatus === 'reviewed',
      },
    );
    const latest = {
      _id: resume._id,
      userId: req.user._id,
      version: resume.version,
    };
    if (!(await Resume.exists(latest)))
      throw new HttpError(
        409,
        'The resume changed or was deleted during analysis. Select the latest saved version and try again.',
      );
    let job, analysis;
    try {
      job = await JobDescription.create({
        userId: req.user._id,
        title: input.title,
        company: input.company,
        description: input.description,
        parsedRequirements,
      });
      analysis = await MatchAnalysis.create({
        userId: req.user._id,
        resumeId: resume._id,
        jobDescriptionId: job._id,
        resumeSnapshot: {
          originalFilename: resume.originalFilename,
          version: resume.version,
          parsingStatus: resume.parsingStatus,
          structuredData,
        },
        jobSnapshot: { title: job.title, company: job.company },
        ...result,
        embeddingConsent: input.embeddingConsent,
        ...(input.embeddingConsent ? { embeddingConsentedAt: new Date() } : {}),
      });
      if (!(await Resume.exists(latest)))
        throw new HttpError(
          409,
          'The resume changed or was deleted during analysis. Please analyze again.',
        );
      res.status(201).json({
        analysis: publicAnalysis(analysis),
        jobDescription: publicJob(job),
      });
    } catch (error) {
      if (analysis)
        await MatchAnalysis.deleteOne({
          _id: analysis._id,
          userId: req.user._id,
        });
      if (job)
        await JobDescription.deleteOne({ _id: job._id, userId: req.user._id });
      throw error;
    }
  });
  router.get('/history', async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const query = { userId: req.user._id };
    const [items, total] = await Promise.all([
      MatchAnalysis.find(query)
        .select(
          'resumeId jobDescriptionId resumeSnapshot.originalFilename resumeSnapshot.version jobSnapshot overallScore interpretation semantic.method confidence algorithmVersion createdAt',
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      MatchAnalysis.countDocuments(query),
    ]);
    res.json({
      analyses: items.map(publicAnalysis),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
  router.param('id', (req, res, next, id) =>
    mongoose.isObjectIdOrHexString(id)
      ? next()
      : next(new HttpError(404, 'Analysis not found.')),
  );
  router.get('/:id', async (req, res) => {
    const analysis = await MatchAnalysis.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!analysis) throw new HttpError(404, 'Analysis not found.');
    const job = await JobDescription.findOne({
      _id: analysis.jobDescriptionId,
      userId: req.user._id,
    });
    if (!job) throw new HttpError(404, 'Job description not found.');
    res.json({
      analysis: publicAnalysis(analysis),
      jobDescription: publicJob(job),
    });
  });
  router.delete('/:id', async (req, res) => {
    const analysis = await MatchAnalysis.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!analysis) throw new HttpError(404, 'Analysis not found.');
    await deleteAnalysisAI(req.user._id, analysis._id);
    await JobDescription.deleteOne({
      _id: analysis.jobDescriptionId,
      userId: req.user._id,
    });
    res.status(204).end();
  });
  return router;
}
export function jobDescriptionRoutes(env) {
  const router = Router();
  router.use(authenticate(env));
  router.get('/', async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const query = { userId: req.user._id };
    const [items, total] = await Promise.all([
      JobDescription.find(query)
        .select('-description -parsedRequirements')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      JobDescription.countDocuments(query),
    ]);
    res.json({
      jobDescriptions: items.map(publicJob),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
  return router;
}

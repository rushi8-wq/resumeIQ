import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../services/auth.js';
import { HttpError, AIError } from '../middleware/errors.js';
import { MatchAnalysis } from '../models/MatchAnalysis.js';
import { Resume } from '../models/Resume.js';
import { JobDescription } from '../models/JobDescription.js';
import { AISuggestion, publicSuggestion } from '../models/AISuggestion.js';
import {
  OptimizedResumeVersion,
  publicVersion,
} from '../models/OptimizedResumeVersion.js';
import { AIUsage } from '../models/AIUsage.js';
import {
  generationSchema,
  bulletSchema,
  decisionSchema,
  recalculateSchema,
} from '../validation/ai.js';
import { paginationSchema } from '../validation/match.js';
import {
  aiAvailability,
  createAIProvider,
  providerError,
} from '../services/ai/provider.js';
import {
  preparePayload,
  validateSuggestions,
  assertAccepted,
} from '../services/ai/guardrails.js';
import { recalculate } from '../services/ai/recalculate.js';
export function aiRoutes(env, { aiProvider } = {}) {
  const router = Router();
  router.use(authenticate(env));
  const provider =
    aiProvider === undefined ? createAIProvider(env) : aiProvider;
  const aiLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => req.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        message:
          'AI request limit reached (5 requests per 15 minutes). Try again later.',
      },
    },
  });
  let active = 0;
  for (const name of ['analysisId', 'resumeId', 'versionId', 'id'])
    router.param(name, (req, res, next, id) =>
      mongoose.isObjectIdOrHexString(id)
        ? next()
        : next(new HttpError(404, 'Resource not found.')),
    );
  async function context(userId, id, { current = true } = {}) {
    const analysis = await MatchAnalysis.findOne({ _id: id, userId });
    if (!analysis) throw new HttpError(404, 'Analysis not found.');
    const [resume, job] = await Promise.all([
      Resume.findOne({ _id: analysis.resumeId, userId }),
      JobDescription.findOne({ _id: analysis.jobDescriptionId, userId }),
    ]);
    if (!resume || !job)
      throw new HttpError(404, 'Analysis references are unavailable.');
    if (current && resume.version !== analysis.resumeSnapshot.version)
      throw new HttpError(
        409,
        'This resume changed after analysis. Run a new match before optimizing.',
      );
    return { analysis, resume, job };
  }
  router.get('/config', async (req, res) => {
    const config = aiAvailability(env);
    if (provider) {
      try {
        config.model = await provider.resolveModel();
        config.configured = true;
      } catch (error) {
        config.configured = false;
        const failure = providerError(error);
        config.error = failure.message;
        config.errorCode = failure.code;
        req.log?.warn(
          { ai: failure.diagnostics, code: failure.code },
          'AI configuration unavailable',
        );
      }
    }
    res.json({
      ...config,
      dailyLimit: env.AI_DAILY_REQUEST_LIMIT || 10,
      perWindowLimit: 5,
    });
  });
  async function generate(req, res, mode) {
    const input = (mode === 'bullet' ? bulletSchema : generationSchema).parse(
      req.body,
    );
    const { analysis, resume, job } = await context(
      req.user._id,
      input.analysisId,
    );
    if (!provider)
      throw new HttpError(
        503,
        'Groq is not configured. Set AI_PROVIDER=groq, GROQ_API_KEY and GROQ_MODEL in server/.env.',
      );
    const { payload, records } = preparePayload(analysis, job, {
      mode,
      section: input.section,
      index: input.index,
    });
    if (mode === 'bullet' && records.length !== 1)
      throw new HttpError(
        400,
        'Choose an existing project or work-experience bullet.',
      );
    if (active >= 2)
      throw new HttpError(429, 'AI processing is busy. Try again shortly.');
    active++;
    try {
      const day = new Date().toISOString().slice(0, 10);
      try {
        await AIUsage.findOneAndUpdate(
          {
            userId: req.user._id,
            day,
            count: { $lt: env.AI_DAILY_REQUEST_LIMIT || 10 },
          },
          {
            $inc: { count: 1 },
            $setOnInsert: { expiresAt: new Date(Date.now() + 32 * 86400000) },
          },
          { upsert: true, new: true },
        );
      } catch (error) {
        if (error.code === 11000)
          throw new HttpError(
            429,
            'Daily AI request quota reached. Check back tomorrow (UTC).',
          );
        throw error;
      }
      let output;
      try {
        output = await provider.generate(payload);
      } catch (error) {
        throw providerError(error);
      }
      let checked;
      try {
        checked = validateSuggestions(output.data, analysis, job, records, {
          section: input.section,
          index: input.index,
        });
        if (mode === 'bullet' && checked.length !== 1)
          throw new AIError(
            502,
            'AI_INVALID_BULLET_COUNT',
            'Groq must return exactly one edit for a selected bullet. No suggestions were saved.',
            { stage: 'bullet_count' },
          );
      } catch (error) {
        if (error instanceof AIError)
          error.withContext({ model: output.model, ...output.diagnostics });
        throw error;
      }
      if (
        !(await Resume.exists({
          _id: resume._id,
          userId: req.user._id,
          version: resume.version,
        })) ||
        !(await MatchAnalysis.exists({
          _id: analysis._id,
          userId: req.user._id,
        }))
      )
        throw new HttpError(
          409,
          'The resume or analysis changed while AI was running. Request suggestions again.',
        );
      const batchId = randomUUID();
      let inserted = [];
      try {
        inserted = await AISuggestion.insertMany(
          checked.map((item) => ({
            ...item,
            userId: req.user._id,
            analysisId: analysis._id,
            resumeId: resume._id,
            sourceResumeVersion: resume.version,
            batchId,
            provider: provider.name || 'groq',
            model: output.model,
            consentedAt: new Date(),
            usage: output.usage,
          })),
        );
        if (
          !(await MatchAnalysis.exists({
            _id: analysis._id,
            userId: req.user._id,
          })) ||
          !(await Resume.exists({
            _id: resume._id,
            userId: req.user._id,
            version: resume.version,
          }))
        )
          throw new HttpError(
            409,
            'The source was changed or deleted. Request suggestions again.',
          );
        res.status(201).json({
          suggestions: inserted.map(publicSuggestion),
          model: output.model,
          evidenceSubset:
            mode === 'keywords'
              ? 'Up to the first 30 saved evidence entries were sent.'
              : 'Only the selected bullet was sent.',
        });
      } catch (error) {
        await AISuggestion.deleteMany({ userId: req.user._id, batchId });
        throw error;
      }
    } finally {
      active--;
    }
  }
  router.post('/suggestions', aiLimit, (req, res) =>
    generate(req, res, 'keywords'),
  );
  router.post('/optimize', aiLimit, (req, res) => generate(req, res, 'bullet'));
  router.get('/suggestions/:analysisId', async (req, res) => {
    await context(req.user._id, req.params.analysisId, { current: false });
    const suggestions = await AISuggestion.find({
      userId: req.user._id,
      analysisId: req.params.analysisId,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100);
    res.json({ suggestions: suggestions.map(publicSuggestion) });
  });
  router.patch('/suggestions/:id', async (req, res) => {
    const input = decisionSchema.parse(req.body);
    const item = await AISuggestion.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!item) throw new HttpError(404, 'Suggestion not found.');
    await context(req.user._id, item.analysisId, {
      current: input.status === 'accepted',
    });
    const text =
      input.editedText === undefined
        ? item.editedText || item.suggestedText
        : input.editedText;
    const requires =
      input.status === 'accepted'
        ? assertAccepted(
            item,
            text,
            input.confirmed,
            input.confirmationEvidence,
          )
        : false;
    const result = await AISuggestion.findOneAndUpdate(
      { _id: item._id, userId: req.user._id, revision: input.revision },
      {
        $set: {
          status: input.status,
          editedText: text,
          confirmed: input.status === 'accepted' && requires,
          confirmationEvidence:
            input.status === 'accepted' && requires
              ? input.confirmationEvidence
              : '',
          decidedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!result)
      throw new HttpError(
        409,
        'This suggestion changed in another window. Reload before editing.',
      );
    res.json({ suggestion: publicSuggestion(result) });
  });
  router.delete('/suggestions/:id', async (req, res) => {
    const deleted = await AISuggestion.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!deleted) throw new HttpError(404, 'Suggestion not found.');
    res.status(204).end();
  });
  router.post('/recalculate', async (req, res) => {
    const input = recalculateSchema.parse(req.body);
    const { analysis, resume, job } = await context(
      req.user._id,
      input.analysisId,
    );
    const found = await AISuggestion.find({
      userId: req.user._id,
      analysisId: analysis._id,
      _id: { $in: input.suggestionIds },
    });
    if (found.length !== input.suggestionIds.length)
      throw new HttpError(404, 'Suggestion not found.');
    const suggestions = input.suggestionIds.map((id) =>
      found.find((item) => item.id === id),
    );
    const preview = await recalculate(analysis, job, suggestions, env, {
      embeddingConsent: input.embeddingConsent,
      identity: {
        name: resume.structuredData.name,
        email: resume.structuredData.email,
      },
    });
    if (!input.save) return res.json({ preview });
    if (input.previewHash !== preview.previewHash)
      throw new HttpError(
        409,
        'Preview changed or is missing. Recalculate and review it before saving.',
      );
    if (
      !(await Resume.exists({
        _id: resume._id,
        userId: req.user._id,
        version: resume.version,
      })) ||
      !(await MatchAnalysis.exists({ _id: analysis._id, userId: req.user._id }))
    )
      throw new HttpError(
        409,
        'Source changed. Run a new match before saving.',
      );
    let version = await OptimizedResumeVersion.findOne({
      userId: req.user._id,
      analysisId: analysis._id,
      previewHash: preview.previewHash,
    });
    if (!version) {
      try {
        version = await OptimizedResumeVersion.create({
          userId: req.user._id,
          originalResumeId: resume._id,
          analysisId: analysis._id,
          sourceResumeVersion: resume.version,
          acceptedSuggestionIds: input.suggestionIds,
          ...preview,
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        version = await OptimizedResumeVersion.findOne({
          userId: req.user._id,
          analysisId: analysis._id,
          previewHash: preview.previewHash,
        });
      }
    }
    if (
      !(await MatchAnalysis.exists({ _id: analysis._id, userId: req.user._id }))
    ) {
      await OptimizedResumeVersion.deleteOne({
        _id: version._id,
        userId: req.user._id,
      });
      throw new HttpError(409, 'Source analysis was deleted.');
    }
    res.status(201).json({ version: publicVersion(version) });
  });
  router.get('/versions/:resumeId', async (req, res) => {
    if (
      !(await Resume.exists({ _id: req.params.resumeId, userId: req.user._id }))
    )
      throw new HttpError(404, 'Resume not found.');
    const { page, limit } = paginationSchema.parse(req.query);
    const bounded = Math.min(limit, 10);
    const query = {
      userId: req.user._id,
      originalResumeId: req.params.resumeId,
    };
    const [versions, total] = await Promise.all([
      OptimizedResumeVersion.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * bounded)
        .limit(bounded),
      OptimizedResumeVersion.countDocuments(query),
    ]);
    res.json({
      versions: versions.map(publicVersion),
      pagination: {
        page,
        limit: bounded,
        total,
        pages: Math.ceil(total / bounded),
      },
    });
  });
  router.delete('/versions/:versionId', async (req, res) => {
    if (
      !(await OptimizedResumeVersion.findOneAndDelete({
        _id: req.params.versionId,
        userId: req.user._id,
      }))
    )
      throw new HttpError(404, 'Optimized version not found.');
    res.status(204).end();
  });
  return router;
}

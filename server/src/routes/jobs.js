import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../services/auth.js';
import { HttpError } from '../middleware/errors.js';
import { Resume } from '../models/Resume.js';
import { SavedJob } from '../models/SavedJob.js';
import { DiscoveredJob, publicDiscoveredJob } from '../models/DiscoveredJob.js';
import {
  createJobicyProvider,
  externalSources,
} from '../services/jobs/provider.js';
import { createCatalog } from '../services/jobs/catalog.js';
import { recommend } from '../services/jobs/recommend.js';
import { scoringConfig } from '../config/scoring.js';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const query = z
  .object({
    resumeId: id.optional(),
    keyword: z.string().trim().max(120).default(''),
    location: z.string().trim().max(120).default(''),
    workMode: z.enum(['', 'remote', 'hybrid', 'onsite']).default(''),
    employmentType: z
      .enum(['', 'internship', 'full-time', 'contract', 'part-time'])
      .default(''),
    experienceLevel: z.string().trim().max(60).default(''),
    minScore: z.coerce.number().min(0).max(100).default(0),
    source: z.enum(['all', 'jobicy']).default('all'),
    sort: z.enum(['score', 'date']).default('score'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
export function jobRoutes(env, { jobProvider = createJobicyProvider() } = {}) {
  const router = Router();
  router.use(authenticate(env));
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: env.NODE_ENV === 'test' ? 500 : 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  const catalog = createCatalog(jobProvider);
  const config = scoringConfig(env);
  async function ownedResume(userId, resumeId) {
    const r = await Resume.findOne({ _id: resumeId, userId });
    if (!r) throw new HttpError(404, 'Resume not found.');
    return r;
  }
  router.get('/providers/status', async (req, res) =>
    res.json({ providers: [await catalog.status(), ...externalSources] }),
  );
  async function listing(req, res) {
    const f = query.parse(req.query);
    if (req.path === '/recommended' && !f.resumeId)
      throw new HttpError(400, 'Select a resume for recommendations.');
    if (f.minScore > 0 && !f.resumeId)
      throw new HttpError(400, 'Select a resume to filter by alignment.');
    const resume = f.resumeId
      ? await ownedResume(req.user._id, f.resumeId)
      : null;
    const provider = await catalog.refresh();
    let jobs = await DiscoveredJob.find({
      source: 'jobicy',
      expiresAt: { $gt: new Date() },
    })
      .sort({ postedAt: -1, _id: 1 })
      .lean();
    const includes = (s, v) =>
      (s || '').toLowerCase().includes(v.toLowerCase());
    jobs = jobs.filter(
      (j) =>
        includes(j.title + ' ' + j.company + ' ' + j.description, f.keyword) &&
        includes(j.location, f.location) &&
        (!f.workMode || j.workMode === f.workMode) &&
        (!f.employmentType || j.employmentType.includes(f.employmentType)) &&
        includes(j.experienceLevel, f.experienceLevel),
    );
    let results = resume
      ? await recommend(req.user._id, resume, jobs, config)
      : jobs.map((job) => ({ job, recommendation: null }));
    results = results.filter(
      (r) =>
        f.minScore === 0 ||
        (r.recommendation?.matchScore != null &&
          r.recommendation.matchScore >= f.minScore),
    );
    results.sort((a, b) =>
      f.sort === 'score' && resume
        ? (b.recommendation.matchScore ?? -1) -
            (a.recommendation.matchScore ?? -1) ||
          String(a.job._id).localeCompare(String(b.job._id))
        : +new Date(b.job.postedAt || 0) - +new Date(a.job.postedAt || 0) ||
          String(a.job._id).localeCompare(String(b.job._id)),
    );
    const saved = await SavedJob.find({ userId: req.user._id }).lean();
    const savedMap = new Map(
      saved.map((s) => [String(s.jobId), String(s._id)]),
    );
    const total = results.length;
    res.json({
      jobs: results
        .slice((f.page - 1) * f.limit, f.page * f.limit)
        .map((r) => ({
          ...publicDiscoveredJob(r.job),
          recommendation: r.recommendation,
          savedId: savedMap.get(String(r.job._id)) || null,
        })),
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        pages: Math.ceil(total / f.limit),
      },
      provider,
      resume: resume
        ? {
            id: resume.id,
            version: resume.version,
            filename: resume.originalFilename,
          }
        : null,
    });
  }
  router.get('/', listing);
  router.get('/recommended', listing);
  router.post('/save', async (req, res) => {
    const input = z
      .object({ jobId: id, resumeId: id })
      .strict()
      .parse(req.body);
    const resume = await ownedResume(req.user._id, input.resumeId);
    if (
      !(await DiscoveredJob.exists({
        _id: input.jobId,
        expiresAt: { $gt: new Date() },
      }))
    )
      throw new HttpError(404, 'Active job not found.');
    const saved = await SavedJob.findOneAndUpdate(
      { userId: req.user._id, jobId: input.jobId },
      { $set: { resumeId: resume._id }, $setOnInsert: { savedAt: new Date() } },
      { new: true, upsert: true, runValidators: true },
    );
    if (!(await Resume.exists({ _id: resume._id, userId: req.user._id }))) {
      await SavedJob.deleteOne({ _id: saved._id });
      throw new HttpError(409, 'Resume was deleted.');
    }
    res.status(201).json({
      saved: {
        id: saved.id,
        jobId: String(saved.jobId),
        resumeId: String(saved.resumeId),
        savedAt: saved.savedAt,
      },
    });
  });
  router.get('/saved', async (req, res) => {
    const { page, limit } = query
      .pick({ page: true, limit: true })
      .strict()
      .parse(req.query);
    const filter = { userId: req.user._id };
    const items = await SavedJob.find(filter)
      .sort({ savedAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('jobId')
      .lean();
    const total = await SavedJob.countDocuments(filter);
    res.json({
      jobs: items.map((s) => ({
        id: String(s._id),
        resumeId: String(s.resumeId),
        savedAt: s.savedAt,
        job: s.jobId
          ? {
              ...publicDiscoveredJob(s.jobId),
              expired: +s.jobId.expiresAt <= Date.now(),
            }
          : null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
  router.delete('/saved/:id', async (req, res) => {
    if (!id.safeParse(req.params.id).success)
      throw new HttpError(404, 'Saved job not found.');
    if (
      !(await SavedJob.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id,
      }))
    )
      throw new HttpError(404, 'Saved job not found.');
    res.status(204).end();
  });
  router.get('/:id', async (req, res) => {
    if (!id.safeParse(req.params.id).success)
      throw new HttpError(404, 'Job not found.');
    const input = z
      .object({ resumeId: id.optional() })
      .strict()
      .parse(req.query);
    const resume = input.resumeId
      ? await ownedResume(req.user._id, input.resumeId)
      : null;
    const job = await DiscoveredJob.findById(req.params.id).lean();
    if (!job) throw new HttpError(404, 'Job not found.');
    const saved = await SavedJob.findOne({
      userId: req.user._id,
      jobId: job._id,
    });
    const recommendation = resume
      ? (await recommend(req.user._id, resume, [job], config))[0].recommendation
      : null;
    res.json({
      job: {
        ...publicDiscoveredJob(job),
        expired: +job.expiresAt <= Date.now(),
        recommendation,
        savedId: saved?.id || null,
      },
      provider: await catalog.status(),
    });
  });
  return router;
}

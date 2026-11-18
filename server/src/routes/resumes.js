import { deleteResumeAnalyses } from '../services/matching/persistence.js';
import { Router } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../services/auth.js';
import { HttpError } from '../middleware/errors.js';
import { Resume, publicResume } from '../models/Resume.js';
import {
  MAX_FILE_SIZE,
  inspectFile,
  parseDocument,
} from '../services/parsing/parseDocument.js';
import { normalizeSkills } from '../services/parsing/structured.js';
import { resumeUpdateSchema } from '../validation/resume.js';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE + 1, files: 1, fields: 0, parts: 1 },
}).single('resume');
function receive(req, res, next) {
  upload(req, res, (error) => {
    if (error)
      return next(
        new HttpError(
          error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Resume files must be 5 MB or smaller.'
            : 'Upload exactly one file in the resume field, without extra fields.',
        ),
      );
    next();
  });
}
export function resumeRoutes(env) {
  const router = Router();
  router.use(authenticate(env));
  let activeUploads = 0;
  router.post(
    '/upload',
    (req, res, next) => {
      if (activeUploads >= 2)
        return next(
          new HttpError(
            429,
            'Resume processing is busy. Please try again shortly.',
          ),
        );
      activeUploads++;
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          activeUploads--;
        }
      };
      res.once('finish', release);
      req.releaseUpload = release;
      res.once('close', () => {
        if (!req.parsing) release();
      });
      next();
    },
    receive,
    async (req, res) => {
      if (!req.file)
        throw new HttpError(400, 'Choose a PDF or DOCX resume to upload.');
      try {
        const fileType = inspectFile(req.file.buffer, req.file.originalname);
        req.parsing = true;
        const result = await parseDocument(req.file.buffer, fileType);
        if (req.aborted || res.destroyed) return;
        const originalFilename =
          req.file.originalname
            .split(/[\\/]/)
            .pop()
            .replace(/[\x00-\x1f\x7f]/g, '')
            .slice(0, 200) || `resume.${fileType}`;
        const resume = await Resume.create({
          userId: req.user._id,
          originalFilename,
          fileType,
          fileSize: req.file.size,
          ...result,
        });
        res.status(201).json({ resume: publicResume(resume) });
      } finally {
        delete req.file;
        req.parsing = false;
        req.releaseUpload();
      }
    },
  );
  router.get('/', async (req, res) => {
    const { page, limit } = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const query = { userId: req.user._id };
    const [items, total] = await Promise.all([
      Resume.find(query)
        .select('-extractedText -structuredData -warnings')
        .sort({ uploadedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Resume.countDocuments(query),
    ]);
    res.json({
      resumes: items.map(publicResume),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
  router.param('id', (req, res, next, id) => {
    if (!mongoose.isObjectIdOrHexString(id))
      return next(new HttpError(404, 'Resume not found.'));
    next();
  });
  router.get('/:id', async (req, res) => {
    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!resume) throw new HttpError(404, 'Resume not found.');
    res.json({ resume: publicResume(resume) });
  });
  router.patch('/:id', async (req, res) => {
    const { structuredData, version } = resumeUpdateSchema.parse(req.body);
    structuredData.skills = normalizeSkills(structuredData.skills);
    const owned = { _id: req.params.id, userId: req.user._id };
    const resume = await Resume.findOneAndUpdate(
      { ...owned, version },
      {
        $set: {
          structuredData,
          parsingStatus: 'reviewed',
          reviewedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!resume) {
      if (await Resume.exists(owned))
        throw new HttpError(
          409,
          'This resume changed in another window. Reload it before saving.',
        );
      throw new HttpError(404, 'Resume not found.');
    }
    res.json({ resume: publicResume(resume) });
  });
  router.delete('/:id', async (req, res) => {
    const deleted = await Resume.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!deleted) throw new HttpError(404, 'Resume not found.');
    await deleteResumeAnalyses(req.user._id, deleted._id);
    res.status(204).end();
  });
  return router;
}

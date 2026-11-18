import { JobRecommendation } from '../../models/JobRecommendation.js';
import { Resume } from '../../models/Resume.js';
import { scoreMatch } from '../matching/score.js';
import { HttpError } from '../../middleware/errors.js';
export async function recommend(userId, resume, jobs, config) {
  const cached = await JobRecommendation.find({
    userId,
    resumeId: resume._id,
  }).lean();
  const byId = new Map(cached.map((c) => [String(c.jobId), c]));
  const data = resume.structuredData.toObject();
  delete data.name;
  delete data.email;
  const results = [];
  for (const job of jobs) {
    let rec = byId.get(String(job._id));
    if (
      !rec ||
      rec.resumeVersion !== resume.version ||
      rec.jobHash !== job.contentHash ||
      rec.configVersion !== config.version
    ) {
      const result = await scoreMatch(
        data,
        { ...job.parsedRequirements, sourceText: job.description },
        { config, resumeReviewed: resume.parsingStatus === 'reviewed' },
      );
      const explanation = `${result.interpretation} using saved skills, projects, experience and education. ${result.matchedSkills.required.length} recognized required skills matched; ${result.missingSkills.required.length} missing. Local text similarity also contributes. Eligibility and hiring outcomes require your review.`;
      rec = await JobRecommendation.findOneAndUpdate(
        { userId, resumeId: resume._id, jobId: job._id },
        {
          $set: {
            resumeVersion: resume.version,
            jobHash: job.contentHash,
            configVersion: config.version,
            matchScore: result.overallScore,
            componentScores: result.componentScores,
            explanation,
            algorithmVersion: result.algorithmVersion,
            result,
            calculatedAt: new Date(),
          },
        },
        { new: true, upsert: true, runValidators: true },
      );
    }
    results.push({
      job,
      recommendation: {
        matchScore: rec.matchScore,
        componentScores: rec.componentScores,
        explanation: rec.explanation,
        algorithmVersion: rec.algorithmVersion,
        calculatedAt: rec.calculatedAt,
        resumeVersion: rec.resumeVersion,
        matchedSkills: rec.result.matchedSkills,
        missingSkills: rec.result.missingSkills,
        limitations: rec.result.limitations,
      },
    });
  }
  if (
    !(await Resume.exists({ _id: resume._id, userId, version: resume.version }))
  ) {
    await JobRecommendation.deleteMany({
      userId,
      resumeId: resume._id,
      resumeVersion: resume.version,
    });
    throw new HttpError(
      409,
      'Resume changed or was deleted. Select the latest version and try again.',
    );
  }
  return results;
}

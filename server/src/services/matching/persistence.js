import { SavedJob } from '../../models/SavedJob.js';
import { JobRecommendation } from '../../models/JobRecommendation.js';
import { deleteResumeAI } from '../ai/lifecycle.js';
import { MatchAnalysis } from '../../models/MatchAnalysis.js';
import { JobDescription } from '../../models/JobDescription.js';
export async function deleteResumeAnalyses(userId, resumeId) {
  await deleteResumeAI(userId, resumeId);
  await Promise.all([
    SavedJob.deleteMany({ userId, resumeId }),
    JobRecommendation.deleteMany({ userId, resumeId }),
  ]);
  const analyses = await MatchAnalysis.find({ userId, resumeId }).select(
    'jobDescriptionId',
  );
  await MatchAnalysis.deleteMany({ userId, resumeId });
  await JobDescription.deleteMany({
    userId,
    _id: { $in: analyses.map((a) => a.jobDescriptionId) },
  });
}

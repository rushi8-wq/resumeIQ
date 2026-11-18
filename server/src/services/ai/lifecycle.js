import { AISuggestion } from '../../models/AISuggestion.js';
import { OptimizedResumeVersion } from '../../models/OptimizedResumeVersion.js';
export async function deleteAnalysisAI(userId, analysisId) {
  await Promise.all([
    AISuggestion.deleteMany({ userId, analysisId }),
    OptimizedResumeVersion.deleteMany({ userId, analysisId }),
  ]);
}
export async function deleteResumeAI(userId, resumeId) {
  await Promise.all([
    AISuggestion.deleteMany({ userId, resumeId }),
    OptimizedResumeVersion.deleteMany({ userId, originalResumeId: resumeId }),
  ]);
}

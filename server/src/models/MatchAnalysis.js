import mongoose from 'mongoose';
const mixed = mongoose.Schema.Types.Mixed;
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: true,
    },
    jobDescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobDescription',
      required: true,
    },
    resumeSnapshot: { type: mixed, required: true },
    jobSnapshot: { type: mixed, required: true },
    overallScore: { type: Number, min: 0, max: 100, default: null },
    componentScores: { type: mixed, required: true },
    matchedSkills: { type: mixed, required: true },
    missingSkills: { type: mixed, required: true },
    skillCoverage: { type: mixed, required: true },
    relevantProjects: { type: [mixed], default: [] },
    relevantExperience: { type: [mixed], default: [] },
    experienceChecks: { type: [mixed], default: [] },
    qualificationChecks: { type: [mixed], default: [] },
    qualificationGaps: { type: [mixed], default: [] },
    confidence: { type: String, enum: ['low', 'medium'], required: true },
    limitations: { type: [String], required: true },
    explanations: { type: [String], required: true },
    interpretation: { type: String, required: true },
    semantic: { type: mixed, required: true },
    weights: { type: mixed, required: true },
    algorithmVersion: { type: String, required: true },
    disclaimer: { type: String, required: true },
    embeddingConsent: { type: Boolean, default: false },
    embeddingConsentedAt: Date,
  },
  { timestamps: true, strict: 'throw' },
);
schema.index({ userId: 1, createdAt: -1, _id: -1 });
schema.index({ userId: 1, resumeId: 1 });
schema.index({ jobDescriptionId: 1 }, { unique: true });
export const MatchAnalysis = mongoose.model('MatchAnalysis', schema);
export function publicAnalysis(doc) {
  const { _id, userId, __v, ...data } = doc.toObject();
  return {
    id: String(_id),
    ...data,
    resumeId: String(data.resumeId),
    jobDescriptionId: String(data.jobDescriptionId),
  };
}

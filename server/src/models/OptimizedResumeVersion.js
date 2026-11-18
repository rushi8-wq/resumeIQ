import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    originalResumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: true,
    },
    analysisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchAnalysis',
      required: true,
    },
    sourceResumeVersion: { type: Number, required: true },
    revisedStructuredData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    acceptedSuggestionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      required: true,
    },
    appliedChanges: { type: [mongoose.Schema.Types.Mixed], required: true },
    originalScore: { type: Number, min: 0, max: 100, default: null },
    revisedScore: { type: Number, min: 0, max: 100, default: null },
    improvement: { type: Number, default: null },
    algorithmVersion: { type: String, required: true },
    weights: { type: mongoose.Schema.Types.Mixed, required: true },
    revisedAnalysis: { type: mongoose.Schema.Types.Mixed, required: true },
    previewHash: { type: String, required: true },
  },
  { timestamps: true, strict: 'throw' },
);
schema.index({ userId: 1, originalResumeId: 1, createdAt: -1 });
schema.index({ userId: 1, analysisId: 1 });
schema.index({ userId: 1, analysisId: 1, previewHash: 1 }, { unique: true });
export const OptimizedResumeVersion = mongoose.model(
  'OptimizedResumeVersion',
  schema,
);
export function publicVersion(doc) {
  const { _id, userId, __v, ...data } = doc.toObject();
  return { id: String(_id), ...data };
}

import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    resumeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    resumeVersion: { type: Number, required: true },
    jobHash: { type: String, required: true },
    configVersion: { type: String, required: true },
    matchScore: { type: Number, default: null },
    componentScores: mongoose.Schema.Types.Mixed,
    explanation: String,
    algorithmVersion: String,
    result: mongoose.Schema.Types.Mixed,
    calculatedAt: { type: Date, default: Date.now },
  },
  { strict: 'throw' },
);
schema.index({ userId: 1, resumeId: 1, jobId: 1 }, { unique: true });
schema.index({ calculatedAt: 1 }, { expireAfterSeconds: 604800 });
export const JobRecommendation = mongoose.model('JobRecommendation', schema);

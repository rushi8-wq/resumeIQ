import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    analysisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchAnalysis',
      required: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: true,
    },
    sourceResumeVersion: { type: Number, required: true },
    batchId: { type: String, required: true },
    keyword: { type: String, required: true, maxlength: 100 },
    category: {
      type: String,
      enum: [
        'required_skill',
        'preferred_skill',
        'responsibility',
        'domain_terminology',
      ],
      required: true,
    },
    importance: {
      type: String,
      enum: ['required', 'preferred'],
      required: true,
    },
    explanation: { type: String, required: true, maxlength: 1000 },
    requirement: { type: String, required: true, maxlength: 2000 },
    evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    section: {
      type: String,
      enum: ['projects', 'workExperience', null],
      default: null,
    },
    index: { type: Number, default: null },
    originalText: { type: String, default: '', maxlength: 2000 },
    suggestedText: { type: String, default: '', maxlength: 2000 },
    editedText: { type: String, default: '', maxlength: 2000 },
    verificationStatus: {
      type: String,
      enum: ['supported', 'confirmation_required', 'skill_gap'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
    confirmed: { type: Boolean, default: false },
    confirmationEvidence: { type: String, default: '', maxlength: 2000 },
    decidedAt: Date,
    revision: { type: Number, default: 1 },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    consentedAt: { type: Date, required: true },
    guardNotes: { type: [String], default: [] },
    usage: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, strict: 'throw' },
);
schema.index({ userId: 1, analysisId: 1, createdAt: -1 });
schema.index({ userId: 1, resumeId: 1 });
export const AISuggestion = mongoose.model('AISuggestion', schema);
export function publicSuggestion(doc) {
  const { _id, userId, __v, ...data } = doc.toObject();
  return {
    id: String(_id),
    ...data,
    analysisId: String(data.analysisId),
    resumeId: String(data.resumeId),
  };
}

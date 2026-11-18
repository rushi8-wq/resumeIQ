import mongoose from 'mongoose';
const entries = {
  type: [String],
  default: [],
  validate: (v) => v.length <= 100 && v.every((s) => s.length <= 2000),
};
const structuredSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', maxlength: 150 },
    email: { type: String, default: '', maxlength: 254 },
    education: entries,
    skills: {
      ...entries,
      validate: (v) => v.length <= 100 && v.every((s) => s.length <= 120),
    },
    projects: entries,
    workExperience: entries,
    certifications: entries,
    achievements: entries,
  },
  { _id: false, strict: 'throw' },
);
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    originalFilename: { type: String, required: true, maxlength: 200 },
    fileType: { type: String, enum: ['pdf', 'docx'], required: true },
    fileSize: { type: Number, min: 1, max: 5 * 1024 * 1024, required: true },
    extractedText: { type: String, default: '', maxlength: 100000 },
    structuredData: { type: structuredSchema, required: true },
    parsingStatus: {
      type: String,
      enum: ['parsed', 'needs_review', 'reviewed'],
      required: true,
    },
    warnings: { type: [String], default: [] },
    parserVersion: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now, immutable: true },
    reviewedAt: Date,
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, strict: 'throw' },
);
schema.index({ userId: 1, uploadedAt: -1, _id: -1 });
export const Resume = mongoose.model('Resume', schema);
export function publicResume(resume) {
  const value = resume.toObject();
  const { userId, __v, _id, ...fields } = value;
  return { id: String(_id), ...fields };
}

import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, default: '', maxlength: 150 },
    company: { type: String, default: '', maxlength: 150 },
    description: { type: String, required: true, maxlength: 15000 },
    parsedRequirements: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, strict: 'throw' },
);
schema.index({ userId: 1, createdAt: -1, _id: -1 });
export const JobDescription = mongoose.model('JobDescription', schema);
export function publicJob(doc) {
  const { _id, userId, __v, ...data } = doc.toObject();
  return { id: String(_id), ...data };
}

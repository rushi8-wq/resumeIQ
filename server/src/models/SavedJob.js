import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DiscoveredJob',
      required: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: true,
    },
    savedAt: { type: Date, default: Date.now },
  },
  { strict: 'throw' },
);
schema.index({ userId: 1, jobId: 1 }, { unique: true });
schema.index({ userId: 1, savedAt: -1 });
schema.index({ userId: 1, resumeId: 1 });
export const SavedJob = mongoose.model('SavedJob', schema);

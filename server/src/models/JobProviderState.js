import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    source: { type: String, unique: true, required: true },
    nextFetchAt: Date,
    fetchedAt: Date,
    failedAt: Date,
    hasMore: Boolean,
    skipped: Number,
  },
  { strict: 'throw' },
);
export const JobProviderState = mongoose.model('JobProviderState', schema);

import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, default: null },
    workMode: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite', null],
      default: null,
    },
    employmentType: [String],
    experienceLevel: { type: String, default: null },
    description: { type: String, required: true },
    descriptionTruncated: { type: Boolean, default: false },
    parsedRequirements: { type: mongoose.Schema.Types.Mixed, required: true },
    requiredSkills: [String],
    preferredSkills: [String],
    experienceRequirements: [mongoose.Schema.Types.Mixed],
    salary: { type: mongoose.Schema.Types.Mixed, default: null },
    applicationUrl: { type: String, required: true },
    postedAt: { type: Date, default: null },
    fetchedAt: { type: Date, required: true },
    lastVerifiedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    contentHash: { type: String, required: true },
  },
  { timestamps: true, strict: 'throw' },
);
schema.index({ source: 1, externalId: 1 }, { unique: true });
schema.index({ applicationUrl: 1 }, { unique: true });
schema.index({ expiresAt: 1, postedAt: -1 });
export const DiscoveredJob = mongoose.model('DiscoveredJob', schema);
export function publicDiscoveredJob(doc) {
  const { _id, __v, ...rest } = doc.toObject ? doc.toObject() : doc;
  return { ...rest, id: String(_id) };
}

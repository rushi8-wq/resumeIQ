import mongoose from 'mongoose';
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    aiConsent: { type: Boolean, default: false },
    jobPreferences: {
      locations: { type: [String], default: [] },
      workModes: {
        type: [String],
        enum: ['remote', 'hybrid', 'onsite'],
        default: [],
      },
      employmentTypes: {
        type: [String],
        enum: ['internship', 'full-time', 'contract'],
        default: [],
      },
    },
  },
  { timestamps: true, strict: 'throw' },
);
export const User = mongoose.model('User', userSchema);
export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    aiConsent: user.aiConsent,
    jobPreferences: user.jobPreferences,
    createdAt: user.createdAt,
  };
}

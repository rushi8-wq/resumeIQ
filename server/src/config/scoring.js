import { createHash } from 'node:crypto';
import { z } from 'zod';
export const DEFAULT_WEIGHTS = Object.freeze({
  requiredSkills: 35,
  experience: 25,
  semantic: 20,
  preferredSkills: 10,
  qualifications: 10,
});
const weightsSchema = z
  .object(
    Object.fromEntries(
      Object.keys(DEFAULT_WEIGHTS).map((k) => [
        k,
        z.number().finite().min(0).max(100),
      ]),
    ),
  )
  .strict()
  .refine(
    (w) => Object.values(w).some((v) => v > 0),
    'At least one weight must be positive.',
  );
export function scoringConfig(env = {}) {
  const weights = weightsSchema.parse(
    env.MATCH_WEIGHTS_JSON
      ? JSON.parse(env.MATCH_WEIGHTS_JSON)
      : DEFAULT_WEIGHTS,
  );
  const signature = createHash('sha256')
    .update(
      JSON.stringify(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, weights[k]])),
    )
    .digest('hex')
    .slice(0, 12);
  return { weights, version: `hybrid-v1:w${signature}` };
}

import { z } from 'zod';
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const targetSection = z.enum(['projects', 'workExperience']);
export const responseSchema = z
  .object({
    suggestions: z
      .array(
        z
          .object({
            keyword: z.string().trim().min(1).max(100),
            importance: z.enum(['required', 'preferred']),
            explanation: z.string().trim().min(1).max(1000),
            requirement: z.string().trim().min(1).max(2000),
            evidenceIds: z.array(z.string().max(80)).max(5),
            section: targetSection.nullable(),
            index: z.number().int().min(0).max(99).nullable(),
            suggestedText: z.string().trim().max(2000),
            verificationStatus: z.enum([
              'supported',
              'confirmation_required',
              'skill_gap',
            ]),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
// The provider cites one explicit target ID; the adapter derives section/index.
// The public suggestion schema and all evidence/claim checks stay authoritative.
export const groqResponseSchema = z
  .object({
    suggestions: z
      .array(
        responseSchema.shape.suggestions.element
          .omit({ section: true, index: true })
          .extend({
            targetId: z.string().min(1).max(80).nullable(),
            evidenceIds: z.array(z.string().max(80)).max(4),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const groqResponseJsonSchema = z.toJSONSchema(groqResponseSchema);
delete groqResponseJsonSchema.$schema;
export const generationSchema = z
  .object({ analysisId: objectId, consent: z.literal(true) })
  .strict();
export const bulletSchema = generationSchema
  .extend({ section: targetSection, index: z.number().int().min(0).max(99) })
  .strict();
export const decisionSchema = z
  .object({
    status: z.enum(['pending', 'accepted', 'rejected']),
    editedText: z.string().trim().max(2000).optional(),
    confirmed: z.boolean().default(false),
    confirmationEvidence: z.string().trim().max(2000).default(''),
    revision: z.number().int().min(1),
  })
  .strict();
export const recalculateSchema = z
  .object({
    analysisId: objectId,
    suggestionIds: z
      .array(objectId)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    save: z.boolean().default(false),
    previewHash: z.string().length(64).optional(),
    embeddingConsent: z.boolean().default(false),
  })
  .strict();

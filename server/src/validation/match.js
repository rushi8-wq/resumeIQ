import { z } from 'zod';
export const analyzeSchema = z
  .object({
    resumeId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, 'Choose a valid saved resume.'),
    title: z.string().trim().max(150).default(''),
    company: z.string().trim().max(150).default(''),
    description: z
      .string()
      .trim()
      .min(
        30,
        'Paste a more complete job description (at least 30 characters).',
      )
      .max(15000)
      .refine(
        (s) => (s.match(/\p{L}+/gu) || []).length >= 5,
        'Provide readable job description text, with at least five words.',
      ),
    embeddingConsent: z.boolean().default(false),
  })
  .strict();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

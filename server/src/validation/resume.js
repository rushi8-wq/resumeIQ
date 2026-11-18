import { z } from 'zod';
const entries = z.array(z.string().trim().min(1).max(2000)).max(100);
export const structuredDataSchema = z
  .object({
    name: z.string().trim().max(150),
    email: z.union([z.literal(''), z.email().max(254)]),
    education: entries,
    skills: z.array(z.string().trim().min(1).max(120)).max(100),
    projects: entries,
    workExperience: entries,
    certifications: entries,
    achievements: entries,
  })
  .strict();
export const resumeUpdateSchema = z
  .object({
    structuredData: structuredDataSchema,
    version: z.number().int().min(1),
  })
  .strict();

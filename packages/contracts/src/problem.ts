import { z } from 'zod';

/**
 * RFC 9457 problem details. Strict on purpose: the schema is the allow-list of what an error
 * response may contain, so a stack trace or SQL fragment cannot be attached by accident.
 */
export const problemSchema = z.strictObject({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.int().min(400).max(599),
  code: z.string().min(1),
  detail: z.string().optional(),
  requestId: z.string().min(1),
});

export type Problem = z.infer<typeof problemSchema>;

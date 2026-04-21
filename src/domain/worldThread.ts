import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const worldThreadStatusSchema = z.enum(['open', 'resolved', 'parked'])
export const worldThreadPrioritySchema = z.enum(['primary', 'secondary', 'background'])

export const worldThreadSchema = z.object({
  id: z.string(),
  key: z.string(),
  draftId: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  status: worldThreadStatusSchema.default('open'),
  priority: worldThreadPrioritySchema.default('secondary'),
  linkedEntityKeys: z.array(z.string()).default([]),
  sourceTurnId: z.string().nullable().default(null),
  lastTurnId: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const worldThreadUpdateInputSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  status: worldThreadStatusSchema.optional(),
  priority: worldThreadPrioritySchema.optional(),
  linkedEntityKeys: z.array(z.string()).optional(),
  sourceTurnId: z.string().nullable().optional(),
  lastTurnId: z.string().nullable().optional(),
  metadata: looseRecordSchema.optional(),
})

export type WorldThread = z.infer<typeof worldThreadSchema>
export type WorldThreadUpdateInput = z.infer<typeof worldThreadUpdateInputSchema>

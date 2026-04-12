import { z } from 'zod'
import { isoDateSchema, isoDateTimeSchema, positiveIntSchema, sleepTypeSchema } from './base.js'
import { monthlyAnalysisSchema, weeklyAnalysisSchema } from './analysis.js'

export const errorResponseSchema = z
  .object({
    message: z.string().trim().min(1)
  })
  .strict()

export const okResponseSchema = z
  .object({
    ok: z.literal(true)
  })
  .strict()

export const userSchema = z
  .object({
    id: positiveIntSchema,
    username: z.string().min(1)
  })
  .strict()

export const boardSchema = z
  .object({
    id: positiveIntSchema,
    name: z.string().min(1),
    description: z.string(),
    birthDate: isoDateSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict()

export const sessionSchema = z
  .object({
    id: positiveIntSchema,
    boardId: positiveIntSchema,
    type: sleepTypeSchema,
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema.nullable(),
    note: z.string(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict()

export const paginationSchema = z
  .object({
    page: positiveIntSchema,
    pageSize: positiveIntSchema,
    total: z.number().int().nonnegative(),
    totalPages: positiveIntSchema,
    hasPrev: z.boolean(),
    hasNext: z.boolean()
  })
  .strict()

export const authResponseSchema = z
  .object({
    user: userSchema
  })
  .strict()

export const boardsResponseSchema = z
  .object({
    boards: z.array(boardSchema)
  })
  .strict()

export const boardResponseSchema = z
  .object({
    board: boardSchema
  })
  .strict()

export const sessionResponseSchema = z
  .object({
    session: sessionSchema
  })
  .strict()

export const sessionsResponseSchema = z
  .object({
    sessions: z.array(sessionSchema),
    pagination: paginationSchema
  })
  .strict()

export const weeklyAnalysisResponseSchema = z
  .object({
    board: boardSchema,
    analysis: weeklyAnalysisSchema
  })
  .strict()

export const monthlyAnalysisResponseSchema = z
  .object({
    board: boardSchema,
    analysis: monthlyAnalysisSchema
  })
  .strict()

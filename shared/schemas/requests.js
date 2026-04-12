import { z } from 'zod'
import {
  isoMonthSchema,
  isoWeekSchema,
  nullableDateTimeInputSchema,
  nullableIsoDateInputSchema,
  nullableTrimmedStringSchema,
  positiveIntLikeSchema,
  sleepTypeSchema,
  timezoneSchema
} from './base.js'

export const idParamsSchema = z
  .object({
    id: positiveIntLikeSchema
  })
  .strict()

export const loginBodySchema = z
  .object({
    username: z.string().trim().min(1, '用户名不能为空'),
    password: z.string().min(1, '密码不能为空')
  })
  .strict()

export const createBoardBodySchema = z
  .object({
    name: z.string().trim().min(1, '名称不能为空'),
    description: nullableTrimmedStringSchema.optional().transform((value) => value ?? ''),
    birthDate: nullableIsoDateInputSchema.optional().transform((value) => value ?? null)
  })
  .strict()

export const updateBoardBodySchema = z
  .object({
    name: z.string().trim().min(1, '名称不能为空').optional(),
    description: nullableTrimmedStringSchema.optional(),
    birthDate: nullableIsoDateInputSchema.optional()
  })
  .strict()

export const listSessionsQuerySchema = z
  .object({
    type: z.union([sleepTypeSchema, z.literal('all')]).optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional()
  })
  .strict()
  .transform((value) => ({
    type: value.type || 'all',
    page: value.page || 1,
    pageSize: value.pageSize || value.limit || 20
  }))

export const createSessionBodySchema = z
  .object({
    type: sleepTypeSchema,
    startAt: z.string().trim().min(1, '入睡时间不能为空'),
    endAt: nullableDateTimeInputSchema.optional().transform((value) => value ?? null),
    note: nullableTrimmedStringSchema.optional().transform((value) => value ?? ''),
    timezone: timezoneSchema.optional()
  })
  .strict()

export const updateSessionBodySchema = z
  .object({
    type: sleepTypeSchema.optional(),
    startAt: z.string().trim().min(1, '入睡时间不能为空').optional(),
    endAt: nullableDateTimeInputSchema.optional(),
    note: nullableTrimmedStringSchema.optional(),
    timezone: timezoneSchema.optional()
  })
  .strict()

export const weeklyAnalysisQuerySchema = z
  .object({
    week: isoWeekSchema.optional(),
    tz: timezoneSchema.optional()
  })
  .strict()

export const monthlyAnalysisQuerySchema = z
  .object({
    month: isoMonthSchema.optional(),
    tz: timezoneSchema.optional()
  })
  .strict()

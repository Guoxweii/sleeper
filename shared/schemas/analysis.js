import { z } from 'zod'
import {
  clockSchema,
  isoDateSchema,
  isoDateTimeSchema,
  isoMonthSchema,
  isoWeekSchema,
  reviewDimensionKeySchema,
  reviewProfileIdSchema,
  reviewStatusSchema,
  sleepTypeSchema,
  timezoneSchema
} from './base.js'

const analysisTypeTotalsSchema = z
  .object({
    label: z.string().min(1),
    minutes: z.number().int().nonnegative(),
    percentage: z.number().nonnegative()
  })
  .strict()

const analysisTotalsSchema = z
  .object({
    totalMinutes: z.number().int().nonnegative(),
    averageDailyMinutes: z.number().int().nonnegative(),
    activeDays: z.number().int().nonnegative(),
    sessionsCount: z.number().int().nonnegative(),
    averageSleepTime: clockSchema.nullable(),
    averageWakeTime: clockSchema.nullable(),
    byType: z
      .object({
        night: analysisTypeTotalsSchema,
        nap: analysisTypeTotalsSchema,
        fragmented: analysisTypeTotalsSchema
      })
      .strict()
  })
  .strict()

const analysisDailyItemSchema = z
  .object({
    date: isoDateSchema,
    label: z.string().min(1),
    minutes: z.number().int().nonnegative(),
    hours: z.number().nonnegative()
  })
  .strict()

const analysisReviewDimensionSchema = z
  .object({
    key: reviewDimensionKeySchema,
    label: z.string().min(1),
    score: z.number().int().min(0).max(100),
    status: reviewStatusSchema,
    message: z.string().min(1)
  })
  .strict()

const analysisReviewAgeSchema = z
  .object({
    years: z.number().int().nonnegative(),
    months: z.number().int().nonnegative(),
    totalMonths: z.number().int().nonnegative()
  })
  .strict()

const analysisReviewSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    level: z.string().min(1),
    summary: z.string().min(1),
    dimensions: z.array(analysisReviewDimensionSchema),
    suggestions: z.array(z.string().min(1)),
    meta: z
      .object({
        source: z.enum(['birth_date', 'default']),
        profileId: reviewProfileIdSchema,
        profileLabel: z.string().min(1),
        age: analysisReviewAgeSchema.nullable(),
        recommendedDurationHours: z.string().min(1),
        recommendedSleepTime: clockSchema,
        recommendedWakeTime: clockSchema
      })
      .strict()
  })
  .strict()

const analysisSourceRecordSchema = z
  .object({
    type: sleepTypeSchema,
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema
  })
  .strict()

export const weeklyAnalysisSchema = z
  .object({
    week: isoWeekSchema,
    timezone: timezoneSchema,
    range: z
      .object({
        startAt: isoDateTimeSchema,
        endAt: isoDateTimeSchema
      })
      .strict(),
    assignmentRule: z.literal('wake_day'),
    totals: analysisTotalsSchema,
    daily: z.array(analysisDailyItemSchema),
    review: analysisReviewSchema,
    sourceRecords: z.array(analysisSourceRecordSchema)
  })
  .strict()

export const monthlyAnalysisSchema = z
  .object({
    month: isoMonthSchema,
    timezone: timezoneSchema,
    range: z
      .object({
        startAt: isoDateTimeSchema,
        endAt: isoDateTimeSchema
      })
      .strict(),
    assignmentRule: z.literal('wake_day'),
    totals: analysisTotalsSchema,
    daily: z.array(analysisDailyItemSchema),
    review: analysisReviewSchema,
    sourceRecords: z.array(analysisSourceRecordSchema)
  })
  .strict()

import { z } from 'zod'

function isValidTimeZone(value) {
  try {
    Intl.DateTimeFormat('zh-CN', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const ISO_WEEK_REGEX = /^\d{4}-W\d{2}$/
const ISO_MONTH_REGEX = /^\d{4}-\d{2}$/
const CLOCK_REGEX = /^\d{2}:\d{2}$/

export const nullableTrimmedStringSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (value == null ? '' : value.trim()))

export const nullableIsoDateInputSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined || value === null) {
      return null
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  .pipe(
    z.union([
      z.string().regex(ISO_DATE_REGEX, {
        message: '日期格式无效'
      }),
      z.null()
    ])
  )

export const nullableDateTimeInputSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined || value === null) {
      return null
    }

    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  .pipe(z.union([z.string().min(1), z.null()]))

export const positiveIntSchema = z.number().int().positive()

export const positiveIntLikeSchema = z.coerce.number().int().positive()

export const isoDateSchema = z.string().regex(ISO_DATE_REGEX)

export const isoWeekSchema = z.string().regex(ISO_WEEK_REGEX)

export const isoMonthSchema = z.string().regex(ISO_MONTH_REGEX)

export const isoDateTimeSchema = z.string().datetime({ offset: true })

export const clockSchema = z.string().regex(CLOCK_REGEX)

export const timezoneSchema = z.string().trim().min(1).refine(isValidTimeZone, {
  message: '无效时区'
})

export const sleepTypeSchema = z.enum(['night', 'nap', 'fragmented'])

export const reviewStatusSchema = z.enum(['excellent', 'good', 'attention', 'poor', 'insufficient'])

export const reviewDimensionKeySchema = z.enum(['duration', 'timing', 'regularity', 'structure'])

export const reviewProfileIdSchema = z.enum(['infant', 'toddler', 'preschool', 'school_age', 'teen', 'adult'])

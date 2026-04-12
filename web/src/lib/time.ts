import { DateTime } from 'luxon'
import type { SleepType } from '../../../shared/index.ts'

export interface SessionTypeOption {
  value: SleepType
  label: string
}

export interface IsoWeekParts {
  weekYear: number
  weekNumber: number
}

export interface IsoMonthParts {
  year: number
  month: number
}

export interface IsoWeekOption {
  value: string
  weekNumber: number
  rangeText: string
  label: string
}

export interface MonthOption {
  value: string
  month: number
  rangeText: string
  label: string
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const SESSION_TYPE_OPTIONS: SessionTypeOption[] = [
  { value: 'night', label: '夜间睡眠' },
  { value: 'nap', label: '午睡' },
  { value: 'fragmented', label: '零星睡眠' }
]

export function formatTypeLabel(type: SleepType): string {
  const found = SESSION_TYPE_OPTIONS.find((option) => option.value === type)
  return found ? found.label : type
}

export function toDatetimeLocalInput(isoString: string | null | undefined): string {
  if (!isoString) {
    return ''
  }

  const dt = DateTime.fromISO(isoString, { zone: 'utc' }).toLocal()
  if (!dt.isValid) {
    return ''
  }

  return dt.toFormat("yyyy-LL-dd'T'HH:mm")
}

export function formatDateTime(isoString: string | null | undefined, fallback = '-'): string {
  if (!isoString) {
    return fallback
  }

  const dt = DateTime.fromISO(isoString, { zone: 'utc' }).toLocal()
  if (!dt.isValid) {
    return fallback
  }

  return dt.toFormat('MM-dd HH:mm')
}

export function formatDateTimeWithWeekday(isoString: string | null | undefined, fallback = '-'): string {
  if (!isoString) {
    return fallback
  }

  const dt = DateTime.fromISO(isoString, { zone: 'utc' }).toLocal()
  if (!dt.isValid) {
    return fallback
  }

  const weekday = WEEKDAY_LABELS[dt.weekday - 1] || ''
  return `${weekday} ${dt.toFormat('MM-dd HH:mm')}`.trim()
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(Math.round(Number(minutes) || 0), 0)
  const hours = Math.floor(safe / 60)
  const remainMinutes = safe % 60

  if (hours > 0 && remainMinutes > 0) {
    return `${hours}小时${remainMinutes}分`
  }

  if (hours > 0) {
    return `${hours}小时`
  }

  return `${remainMinutes}分`
}

export function minutesBetween(startIso: string, endIso: string): number {
  const start = DateTime.fromISO(startIso, { zone: 'utc' })
  const end = DateTime.fromISO(endIso, { zone: 'utc' })
  if (!start.isValid || !end.isValid) {
    return 0
  }
  return Math.max(0, Math.round(end.diff(start, 'minutes').minutes))
}

export function currentIsoWeek(): string {
  const now = DateTime.local()
  return `${now.weekYear}-W${String(now.weekNumber).padStart(2, '0')}`
}

export function currentIsoMonth(): string {
  const now = DateTime.local()
  return `${now.year}-${String(now.month).padStart(2, '0')}`
}

export function parseIsoWeekValue(value: string | null | undefined): IsoWeekParts | null {
  const match = /^([0-9]{4})-W([0-9]{2})$/.exec(value || '')
  if (!match) {
    return null
  }

  return {
    weekYear: Number(match[1]),
    weekNumber: Number(match[2])
  }
}

export function parseIsoMonthValue(value: string | null | undefined): IsoMonthParts | null {
  const match = /^([0-9]{4})-([0-9]{2})$/.exec(value || '')
  if (!match) {
    return null
  }

  return {
    year: Number(match[1]),
    month: Number(match[2])
  }
}

export function buildRecentYears(baseYear: number, count = 3): number[] {
  if (!Number.isFinite(baseYear) || count < 1) {
    return []
  }

  return Array.from({ length: count }, (_, index) => baseYear - index)
}

export function buildIsoWeekOptions(weekYear: number): IsoWeekOption[] {
  if (!Number.isFinite(weekYear)) {
    return []
  }

  const now = DateTime.local()
  const maxWeekNumber = weekYear === now.weekYear ? now.weekNumber : 53
  const options = []

  for (let weekNumber = 1; weekNumber <= maxWeekNumber; weekNumber += 1) {
    const start = DateTime.fromObject(
      {
        weekYear,
        weekNumber,
        weekday: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
      },
      { zone: 'local' }
    )

    if (!start.isValid || start.weekYear !== weekYear || start.weekNumber !== weekNumber) {
      continue
    }

    const end = start.plus({ days: 6 })
    const value = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`
    const rangeText = `${start.toFormat('MM/dd')} - ${end.toFormat('MM/dd')}`

    options.push({
      value,
      weekNumber,
      rangeText,
      label: `第 ${weekNumber} 周（${rangeText}）`
    })
  }

  if (weekYear === now.weekYear) {
    options.reverse()
  }

  return options
}

export function buildMonthOptions(year: number): MonthOption[] {
  if (!Number.isFinite(year)) {
    return []
  }

  const now = DateTime.local()
  const maxMonth = year === now.year ? now.month : 12

  return Array.from({ length: maxMonth }, (_, index) => {
    const month = index + 1
    const start = DateTime.fromObject(
      {
        year,
        month,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
      },
      { zone: 'local' }
    )
    const end = start.endOf('month')
    const value = `${year}-${String(month).padStart(2, '0')}`
    const rangeText = `${start.toFormat('MM/dd')} - ${end.toFormat('MM/dd')}`

    return {
      value,
      month,
      rangeText,
      label: `${month} 月（${rangeText}）`
    }
  })
}

export function formatIsoWeekSummary(value: string): string {
  const parsed = parseIsoWeekValue(value)
  if (!parsed) {
    return ''
  }

  const match = buildIsoWeekOptions(parsed.weekYear).find((item) => item.weekNumber === parsed.weekNumber)
  if (!match) {
    return `${parsed.weekYear} 年第 ${parsed.weekNumber} 周`
  }

  return `${parsed.weekYear} 年第 ${parsed.weekNumber} 周 · ${match.rangeText}`
}

export function formatIsoMonthSummary(value: string): string {
  const parsed = parseIsoMonthValue(value)
  if (!parsed) {
    return ''
  }

  const match = buildMonthOptions(parsed.year).find((item) => item.month === parsed.month)
  if (!match) {
    return `${parsed.year} 年 ${parsed.month} 月`
  }

  return `${parsed.year} 年 ${parsed.month} 月 · ${match.rangeText}`
}

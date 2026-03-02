import { DateTime } from 'luxon'

export const SESSION_TYPE_OPTIONS = [
  { value: 'night', label: '夜间睡眠' },
  { value: 'nap', label: '午睡' },
  { value: 'fragmented', label: '零星睡眠' }
]

export function formatTypeLabel(type) {
  const found = SESSION_TYPE_OPTIONS.find((option) => option.value === type)
  return found ? found.label : type
}

export function toDatetimeLocalInput(isoString) {
  if (!isoString) {
    return ''
  }

  const dt = DateTime.fromISO(isoString, { zone: 'utc' }).toLocal()
  if (!dt.isValid) {
    return ''
  }

  return dt.toFormat("yyyy-LL-dd'T'HH:mm")
}

export function formatDateTime(isoString, fallback = '-') {
  if (!isoString) {
    return fallback
  }

  const dt = DateTime.fromISO(isoString, { zone: 'utc' }).toLocal()
  if (!dt.isValid) {
    return fallback
  }

  return dt.toFormat('MM-dd HH:mm')
}

export function formatDuration(minutes) {
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

export function minutesBetween(startIso, endIso) {
  const start = DateTime.fromISO(startIso, { zone: 'utc' })
  const end = DateTime.fromISO(endIso, { zone: 'utc' })
  if (!start.isValid || !end.isValid) {
    return 0
  }
  return Math.max(0, Math.round(end.diff(start, 'minutes').minutes))
}

export function currentIsoWeek() {
  const now = DateTime.local()
  return `${now.weekYear}-W${String(now.weekNumber).padStart(2, '0')}`
}

export function currentIsoMonth() {
  const now = DateTime.local()
  return `${now.year}-${String(now.month).padStart(2, '0')}`
}

import { DateTime } from 'luxon'

const TYPE_LABELS = {
  night: '夜间睡眠',
  nap: '午睡',
  fragmented: '零星睡眠'
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function toIsoWeek(weekYear, weekNumber) {
  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`
}

function toIsoMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function parseWeekOrCurrent(week, timezone) {
  if (!week) {
    const now = DateTime.now().setZone(timezone)
    return {
      weekYear: now.weekYear,
      weekNumber: now.weekNumber
    }
  }

  const match = /^([0-9]{4})-W([0-9]{2})$/.exec(week)
  if (!match) {
    throw new Error('week 参数格式必须为 YYYY-Www')
  }

  return {
    weekYear: Number(match[1]),
    weekNumber: Number(match[2])
  }
}

function parseMonthOrCurrent(month, timezone) {
  if (!month) {
    const now = DateTime.now().setZone(timezone)
    return {
      year: now.year,
      month: now.month
    }
  }

  const match = /^([0-9]{4})-([0-9]{2})$/.exec(month)
  if (!match) {
    throw new Error('month 参数格式必须为 YYYY-MM')
  }

  return {
    year: Number(match[1]),
    month: Number(match[2])
  }
}

function clockMinutes(dateTime) {
  return dateTime.hour * 60 + dateTime.minute
}

function averageClockMinutes(values) {
  if (!values.length) {
    return null
  }

  const ratio = (2 * Math.PI) / 1440
  const sum = values.reduce(
    (acc, minutes) => {
      const radians = minutes * ratio
      acc.sin += Math.sin(radians)
      acc.cos += Math.cos(radians)
      return acc
    },
    { sin: 0, cos: 0 }
  )

  let angle = Math.atan2(sum.sin, sum.cos)
  if (angle < 0) {
    angle += 2 * Math.PI
  }

  return Math.round((angle / (2 * Math.PI)) * 1440) % 1440
}

function formatClock(minutes) {
  if (minutes === null) {
    return null
  }

  const normalized = ((minutes % 1440) + 1440) % 1440
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function clampDurationMinutes(start, end) {
  const minutes = end.diff(start, 'minutes').minutes
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0
  }

  return minutes
}

function buildAnalysisByWakeDay(rows, rangeStartLocal, rangeEndLocal, timezone, labels) {
  const typeMinutes = {
    night: 0,
    nap: 0,
    fragmented: 0
  }
  const dayMinutes = labels.map(() => 0)
  const sleepClockSamples = []
  const wakeClockSamples = []
  const rangeStartMs = rangeStartLocal.toMillis()
  const rangeEndMs = rangeEndLocal.toMillis()
  let sessionsCount = 0

  for (const row of rows) {
    const startLocal = DateTime.fromISO(row.start_at, { zone: 'utc' }).setZone(timezone)
    const endLocal = row.end_at
      ? DateTime.fromISO(row.end_at, { zone: 'utc' }).setZone(timezone)
      : DateTime.invalid('Missing end_at')

    if (!startLocal.isValid || !endLocal.isValid) {
      continue
    }

    const wakeMs = endLocal.toMillis()
    if (wakeMs < rangeStartMs || wakeMs >= rangeEndMs) {
      continue
    }

    const minutes = clampDurationMinutes(startLocal, endLocal)
    if (minutes <= 0) {
      continue
    }

    if (!Object.prototype.hasOwnProperty.call(typeMinutes, row.type)) {
      continue
    }

    const wakeDayStart = endLocal.startOf('day')
    const offsetDays = Math.floor(wakeDayStart.diff(rangeStartLocal, 'days').days)
    if (offsetDays < 0 || offsetDays >= dayMinutes.length) {
      continue
    }

    typeMinutes[row.type] += minutes
    dayMinutes[offsetDays] += minutes
    if (row.type === 'night') {
      sleepClockSamples.push(clockMinutes(startLocal))
      wakeClockSamples.push(clockMinutes(endLocal))
    }
    sessionsCount += 1
  }

  const totalMinutes = Object.values(typeMinutes).reduce((sum, value) => sum + value, 0)
  const activeDays = dayMinutes.filter((minutes) => minutes > 0).length

  const byType = Object.entries(typeMinutes).reduce((acc, [type, minutes]) => {
    const ratio = totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0
    acc[type] = {
      label: TYPE_LABELS[type],
      minutes: Math.round(minutes),
      percentage: Number(ratio.toFixed(1))
    }
    return acc
  }, {})

  const daily = dayMinutes.map((minutes, index) => {
    const currentDate = rangeStartLocal.plus({ days: index })
    return {
      date: currentDate.toISODate(),
      label: labels[index],
      minutes: Math.round(minutes),
      hours: Number((minutes / 60).toFixed(2))
    }
  })

  return {
    assignmentRule: 'wake_day',
    totals: {
      totalMinutes: Math.round(totalMinutes),
      averageDailyMinutes: activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0,
      activeDays,
      sessionsCount,
      averageSleepTime: formatClock(averageClockMinutes(sleepClockSamples)),
      averageWakeTime: formatClock(averageClockMinutes(wakeClockSamples)),
      byType
    },
    daily
  }
}

export function resolveWeek(week, timezone) {
  const zoneNow = DateTime.now().setZone(timezone)
  if (!zoneNow.isValid) {
    throw new Error('无效时区，请传入 IANA 格式时区，例如 Asia/Shanghai')
  }

  const parsed = parseWeekOrCurrent(week, timezone)
  const weekStart = DateTime.fromObject(
    {
      weekYear: parsed.weekYear,
      weekNumber: parsed.weekNumber,
      weekday: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    },
    { zone: timezone }
  )

  if (!weekStart.isValid) {
    throw new Error('week 参数无效，无法解析对应周')
  }

  const weekEnd = weekStart.plus({ days: 7 })

  return {
    weekId: toIsoWeek(parsed.weekYear, parsed.weekNumber),
    startLocal: weekStart,
    endLocal: weekEnd,
    startUtc: weekStart.toUTC().toISO({ suppressMilliseconds: true }),
    endUtc: weekEnd.toUTC().toISO({ suppressMilliseconds: true })
  }
}

export function resolveMonth(month, timezone) {
  const zoneNow = DateTime.now().setZone(timezone)
  if (!zoneNow.isValid) {
    throw new Error('无效时区，请传入 IANA 格式时区，例如 Asia/Shanghai')
  }

  const parsed = parseMonthOrCurrent(month, timezone)
  const monthStart = DateTime.fromObject(
    {
      year: parsed.year,
      month: parsed.month,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    },
    { zone: timezone }
  )

  if (!monthStart.isValid) {
    throw new Error('month 参数无效，无法解析对应月份')
  }

  const monthEnd = monthStart.plus({ months: 1 })

  return {
    monthId: toIsoMonth(parsed.year, parsed.month),
    startLocal: monthStart,
    endLocal: monthEnd,
    daysInMonth: monthStart.daysInMonth,
    startUtc: monthStart.toUTC().toISO({ suppressMilliseconds: true }),
    endUtc: monthEnd.toUTC().toISO({ suppressMilliseconds: true })
  }
}

export function buildWeeklyAnalysis(rows, weekRange, timezone) {
  const base = buildAnalysisByWakeDay(rows, weekRange.startLocal, weekRange.endLocal, timezone, WEEKDAY_LABELS)

  return {
    week: weekRange.weekId,
    timezone,
    range: {
      startAt: weekRange.startLocal.toISO(),
      endAt: weekRange.endLocal.toISO()
    },
    assignmentRule: base.assignmentRule,
    totals: base.totals,
    daily: base.daily
  }
}

export function buildMonthlyAnalysis(rows, monthRange, timezone) {
  const dayLabels = Array.from({ length: monthRange.daysInMonth }, (_, index) => `${index + 1}日`)
  const base = buildAnalysisByWakeDay(
    rows,
    monthRange.startLocal,
    monthRange.endLocal,
    timezone,
    dayLabels
  )

  return {
    month: monthRange.monthId,
    timezone,
    range: {
      startAt: monthRange.startLocal.toISO(),
      endAt: monthRange.endLocal.toISO()
    },
    assignmentRule: base.assignmentRule,
    totals: base.totals,
    daily: base.daily
  }
}

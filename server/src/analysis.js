import { DateTime } from 'luxon'

const TYPE_LABELS = {
  night: '夜间睡眠',
  nap: '午睡',
  fragmented: '零星睡眠'
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const SLEEP_PROFILES = [
  {
    id: 'infant',
    label: '婴儿（4-11个月）',
    minMonths: 0,
    maxMonths: 11,
    minMinutes: 12 * 60,
    maxMinutes: 16 * 60,
    targetSleepMinutes: 20 * 60 + 30,
    targetWakeMinutes: 7 * 60
  },
  {
    id: 'toddler',
    label: '幼儿（1-2岁）',
    minMonths: 12,
    maxMonths: 35,
    minMinutes: 11 * 60,
    maxMinutes: 14 * 60,
    targetSleepMinutes: 20 * 60 + 45,
    targetWakeMinutes: 7 * 60
  },
  {
    id: 'preschool',
    label: '学龄前（3-5岁）',
    minMonths: 36,
    maxMonths: 71,
    minMinutes: 10 * 60,
    maxMinutes: 13 * 60,
    targetSleepMinutes: 21 * 60,
    targetWakeMinutes: 7 * 60
  },
  {
    id: 'school_age',
    label: '学龄期（6-12岁）',
    minMonths: 72,
    maxMonths: 155,
    minMinutes: 9 * 60,
    maxMinutes: 12 * 60,
    targetSleepMinutes: 21 * 60 + 30,
    targetWakeMinutes: 6 * 60 + 45
  },
  {
    id: 'teen',
    label: '青少年（13-17岁）',
    minMonths: 156,
    maxMonths: 215,
    minMinutes: 8 * 60,
    maxMinutes: 10 * 60,
    targetSleepMinutes: 22 * 60 + 30,
    targetWakeMinutes: 7 * 60
  },
  {
    id: 'adult',
    label: '成人（18岁+）',
    minMonths: 216,
    maxMonths: 2400,
    minMinutes: 7 * 60,
    maxMinutes: 9 * 60,
    targetSleepMinutes: 23 * 60,
    targetWakeMinutes: 7 * 60
  }
]

const DEFAULT_PROFILE = SLEEP_PROFILES[SLEEP_PROFILES.length - 1]

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

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function circularDistanceMinutes(a, b) {
  const diff = Math.abs(a - b)
  return Math.min(diff, 1440 - diff)
}

function signedClockDifferenceMinutes(value, target) {
  const normalized = ((value - target + 720) % 1440 + 1440) % 1440
  return normalized - 720
}

function formatHourValue(minutes) {
  const hours = minutes / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

function formatSleepHourRange(profile) {
  return `${formatHourValue(profile.minMinutes)}-${formatHourValue(profile.maxMinutes)}`
}

function resolveAgeContext(boardBirthDate, referenceLocal, timezone) {
  if (!boardBirthDate) {
    return {
      source: 'default',
      age: null,
      profile: DEFAULT_PROFILE
    }
  }

  const birthDate = DateTime.fromISO(boardBirthDate, { zone: timezone }).startOf('day')
  if (!birthDate.isValid) {
    return {
      source: 'default',
      age: null,
      profile: DEFAULT_PROFILE
    }
  }

  const referenceDay = referenceLocal.startOf('day')
  if (birthDate > referenceDay) {
    return {
      source: 'default',
      age: null,
      profile: DEFAULT_PROFILE
    }
  }

  const totalMonths = Math.floor(referenceDay.diff(birthDate, 'months').months)
  const profile =
    SLEEP_PROFILES.find((item) => totalMonths >= item.minMonths && totalMonths <= item.maxMonths) || DEFAULT_PROFILE

  return {
    source: 'birth_date',
    age: {
      years: Math.floor(totalMonths / 12),
      months: totalMonths % 12,
      totalMonths
    },
    profile
  }
}

function averageCircularDistance(values, center) {
  if (!values.length || center === null) {
    return 0
  }

  const total = values.reduce((sum, value) => sum + circularDistanceMinutes(value, center), 0)
  return total / values.length
}

function scoreStatus(score) {
  if (score >= 85) {
    return 'excellent'
  }
  if (score >= 70) {
    return 'good'
  }
  if (score >= 55) {
    return 'attention'
  }
  return 'poor'
}

function scoreLevel(score) {
  if (score >= 85) {
    return '优秀'
  }
  if (score >= 70) {
    return '良好'
  }
  if (score >= 55) {
    return '需关注'
  }
  return '待改善'
}

function buildDurationDimension({ averageDailyMinutes, activeDays, profile }) {
  const recommendedRange = formatSleepHourRange(profile)
  if (activeDays === 0) {
    return {
      key: 'duration',
      label: '长短（时长）',
      score: 35,
      status: 'insufficient',
      message: '当前有效记录不足，暂时无法判断睡眠时长是否达标。',
      suggestion: `建议先连续记录 5-7 天，再按 ${profile.label} 建议的 ${recommendedRange} 小时复盘。`
    }
  }

  const shortfall = Math.max(0, profile.minMinutes - averageDailyMinutes)
  const excess = Math.max(0, averageDailyMinutes - profile.maxMinutes)
  let score =
    100 -
    shortfall * 0.22 -
    excess * 0.16 -
    Math.max(0, 5 - activeDays) * 4

  let message = `平均每日睡眠约 ${Math.round(averageDailyMinutes)} 分钟，已落在 ${profile.label} 建议范围（${recommendedRange} 小时）内。`
  let suggestion = '保持当前节奏，优先稳定夜间连续睡眠。'

  if (shortfall > 0) {
    score -= shortfall >= 90 ? 12 : 6
    message = `平均每日睡眠约 ${Math.round(averageDailyMinutes)} 分钟，低于 ${profile.label} 建议范围（${recommendedRange} 小时）。`
    suggestion = '建议优先提前入睡 15-30 分钟，先补足夜间主睡眠。'
  } else if (excess > 0) {
    score -= excess >= 120 ? 9 : 4
    message = `平均每日睡眠约 ${Math.round(averageDailyMinutes)} 分钟，高于 ${profile.label} 建议范围（${recommendedRange} 小时）。`
    suggestion = '建议固定起床时间，避免白天长时间补觉造成节律后移。'
  }

  const finalScore = clampScore(score)
  return {
    key: 'duration',
    label: '长短（时长）',
    score: finalScore,
    status: scoreStatus(finalScore),
    message,
    suggestion
  }
}

function buildTimingDimension({ averageSleepClockMinutes, averageWakeClockMinutes, nightSamples, profile }) {
  if (!nightSamples) {
    return {
      key: 'timing',
      label: '早晚（入睡/醒来）',
      score: 40,
      status: 'insufficient',
      message: '夜间睡眠记录不足，暂时无法判断作息早晚节律。',
      suggestion: '建议补充夜间入睡和醒来记录，便于评估作息早晚。'
    }
  }

  const targetSleep = profile.targetSleepMinutes
  const targetWake = profile.targetWakeMinutes
  const sleepDistance = circularDistanceMinutes(averageSleepClockMinutes, targetSleep)
  const wakeDistance = circularDistanceMinutes(averageWakeClockMinutes, targetWake)
  let score = 100 - sleepDistance * 0.22 - wakeDistance * 0.16

  const sleepTime = formatClock(averageSleepClockMinutes)
  const wakeTime = formatClock(averageWakeClockMinutes)
  const sleepOffset = signedClockDifferenceMinutes(averageSleepClockMinutes, targetSleep)
  const wakeOffset = signedClockDifferenceMinutes(averageWakeClockMinutes, targetWake)
  const bedtimeLate = sleepOffset > 75
  const bedtimeEarly = sleepOffset < -90
  const wakeLate = wakeOffset > 75
  const wakeEarly = wakeOffset < -90

  let message = `平均入睡 ${sleepTime}、平均醒来 ${wakeTime}，与 ${profile.label} 建议作息较接近。`
  let suggestion = '保持当前入睡与起床节奏，周末与工作日差异尽量控制在 1 小时内。'

  if (bedtimeLate) {
    score -= 8
    message = `平均入睡 ${sleepTime} 偏晚，可能压缩夜间高质量睡眠窗口。`
    suggestion = '建议每 2-3 天将入睡时间提前 10-15 分钟，逐步回到更早的入睡区间。'
  } else if (bedtimeEarly) {
    score -= 4
    message = `平均入睡 ${sleepTime} 明显偏早，需观察是否伴随夜间易醒。`
    suggestion = '若夜间容易醒来，可微调晚间节奏并保持稳定起床时间。'
  } else if (wakeLate) {
    score -= 6
    message = `平均醒来 ${wakeTime} 偏晚，昼夜节律有后移倾向。`
    suggestion = '可先固定起床时间，再根据白天状态微调夜间入睡时间。'
  } else if (wakeEarly) {
    score -= 4
    message = `平均醒来 ${wakeTime} 偏早，需关注是否存在睡眠时长不足。`
    suggestion = '若白天困倦明显，可适度提前就寝，优先补足夜间时长。'
  }

  const finalScore = clampScore(score)
  return {
    key: 'timing',
    label: '早晚（入睡/醒来）',
    score: finalScore,
    status: scoreStatus(finalScore),
    message,
    suggestion
  }
}

function buildRegularityDimension({ activeDailyValues, activeDays, sleepClockSamples, averageSleepClockMinutes }) {
  if (activeDays <= 2) {
    return {
      key: 'regularity',
      label: '规律性',
      score: 40,
      status: 'insufficient',
      message: '记录天数较少，暂时难以判断睡眠规律性。',
      suggestion: '建议连续记录至少一周，重点观察每日入睡时间和时长波动。'
    }
  }

  const spread = Math.max(...activeDailyValues) - Math.min(...activeDailyValues)
  const hasBedtimeSamples = sleepClockSamples.length >= 2 && averageSleepClockMinutes !== null
  const bedtimeDeviation = hasBedtimeSamples ? averageCircularDistance(sleepClockSamples, averageSleepClockMinutes) : 0
  let score = 100 - spread * 0.2 - bedtimeDeviation * 0.28 - Math.max(0, 5 - activeDays) * 5
  let message = '每日时长和入睡时间波动较小，规律性较好。'
  let suggestion = '继续保持相对固定的上床与起床时间，巩固稳定作息。'

  if (!hasBedtimeSamples) {
    score -= 8
    message = '夜间入睡样本偏少，规律性主要基于每日时长波动评估。'
    suggestion = '建议补充夜间入睡记录，以便更准确评估作息规律。'
  } else if (spread >= 180 || bedtimeDeviation >= 90) {
    score -= 10
    message = '每日睡眠时长和入睡时间波动较大，规律性有待提升。'
    suggestion = '建议先固定起床时间，再把入睡时间波动控制在 1 小时内。'
  } else if (spread >= 120 || bedtimeDeviation >= 60) {
    score -= 4
    message = '作息存在一定波动，整体规律性中等。'
    suggestion = '可设定稳定的睡前流程，减少晚间作息漂移。'
  }

  const finalScore = clampScore(score)
  return {
    key: 'regularity',
    label: '规律性',
    score: finalScore,
    status: scoreStatus(finalScore),
    message,
    suggestion
  }
}

function buildStructureDimension({ byType }) {
  const nightRatio = byType.night?.percentage || 0
  const napRatio = byType.nap?.percentage || 0
  const fragmentedRatio = byType.fragmented?.percentage || 0

  let score = 100
  if (nightRatio < 65) {
    score -= (65 - nightRatio) * 1.2
  }
  if (fragmentedRatio > 15) {
    score -= (fragmentedRatio - 15) * 1.8
  }
  if (napRatio > 35) {
    score -= (napRatio - 35) * 0.8
  }

  let message = '夜间睡眠占比较好，睡眠结构总体较均衡。'
  let suggestion = '保持夜间连续睡眠优先，白天补觉控制在短时范围内。'

  if (fragmentedRatio >= 25) {
    score -= 8
    message = '零星睡眠占比偏高，可能影响恢复效率与夜间连续性。'
    suggestion = '建议优先减少夜间中断，优化睡前环境并降低晚间干扰。'
  } else if (nightRatio < 55) {
    score -= 8
    message = '夜间睡眠占比较低，主睡眠时段仍需加强。'
    suggestion = '可逐步把午睡时长迁移到夜间，提升夜间主睡眠占比。'
  }

  const finalScore = clampScore(score)
  return {
    key: 'structure',
    label: '睡眠结构',
    score: finalScore,
    status: scoreStatus(finalScore),
    message,
    suggestion
  }
}

function buildProfessionalReview({
  averageDailyMinutes,
  activeDays,
  byType,
  dailyValues,
  sleepClockSamples,
  averageSleepClockMinutes,
  averageWakeClockMinutes,
  boardBirthDate,
  referenceDateLocal,
  timezone
}) {
  const ageContext = resolveAgeContext(boardBirthDate, referenceDateLocal, timezone)
  const profile = ageContext.profile
  const activeDailyValues = dailyValues.filter((value) => value > 0)
  const hasNightSamples = sleepClockSamples.length >= 2 && averageSleepClockMinutes !== null && averageWakeClockMinutes !== null

  const dimensions = [
    buildDurationDimension({ averageDailyMinutes, activeDays, profile }),
    buildTimingDimension({
      averageSleepClockMinutes,
      averageWakeClockMinutes,
      nightSamples: hasNightSamples,
      profile
    }),
    buildRegularityDimension({
      activeDailyValues,
      activeDays,
      sleepClockSamples,
      averageSleepClockMinutes
    }),
    buildStructureDimension({ byType })
  ]

  const duration = dimensions.find((item) => item.key === 'duration')
  const timing = dimensions.find((item) => item.key === 'timing')
  const regularity = dimensions.find((item) => item.key === 'regularity')
  const structure = dimensions.find((item) => item.key === 'structure')

  const weightedScore = clampScore(
    duration.score * 0.35 + timing.score * 0.25 + regularity.score * 0.25 + structure.score * 0.15
  )

  const sortedByScore = [...dimensions].sort((a, b) => a.score - b.score)
  const weakDimensions = sortedByScore.filter((item) => item.status === 'poor' || item.status === 'attention')
  const suggestions = Array.from(
    new Set((weakDimensions.length ? weakDimensions : sortedByScore).map((item) => item.suggestion).filter(Boolean))
  ).slice(0, 3)

  if (!suggestions.length) {
    suggestions.push('整体状态较稳定，继续保持固定作息并持续记录趋势变化。')
  }

  const recommendedDurationHours = formatSleepHourRange(profile)
  const basisText =
    ageContext.source === 'birth_date'
      ? `${ageContext.age.years}岁${ageContext.age.months > 0 ? `${ageContext.age.months}个月` : ''}`
      : '未设置生日，按成人'

  let summary = `${scoreLevel(weightedScore)}（${weightedScore} 分）。`
  if (weakDimensions.length) {
    summary += `当前主要需要关注：${weakDimensions.map((item) => item.label).join('、')}。`
  } else {
    summary += '各维度整体均衡，当前节律保持较好。'
  }
  summary += `评测基准：${basisText}，建议日睡眠 ${recommendedDurationHours} 小时。`

  return {
    score: weightedScore,
    level: scoreLevel(weightedScore),
    summary,
    dimensions: dimensions.map((item) => ({
      key: item.key,
      label: item.label,
      score: item.score,
      status: item.status,
      message: item.message
    })),
    suggestions,
    meta: {
      source: ageContext.source,
      profileId: profile.id,
      profileLabel: profile.label,
      age: ageContext.age,
      recommendedDurationHours,
      recommendedSleepTime: formatClock(profile.targetSleepMinutes),
      recommendedWakeTime: formatClock(profile.targetWakeMinutes)
    }
  }
}

function buildAnalysisByWakeDay(rows, rangeStartLocal, rangeEndLocal, timezone, labels, options = {}) {
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
  const averageSleepClockMinutes = averageClockMinutes(sleepClockSamples)
  const averageWakeClockMinutes = averageClockMinutes(wakeClockSamples)

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

  const review = buildProfessionalReview({
    averageDailyMinutes: activeDays > 0 ? totalMinutes / activeDays : 0,
    activeDays,
    byType,
    dailyValues: dayMinutes,
    sleepClockSamples,
    averageSleepClockMinutes,
    averageWakeClockMinutes,
    boardBirthDate: options.boardBirthDate || null,
    referenceDateLocal: rangeEndLocal.minus({ days: 1 }),
    timezone
  })

  return {
    assignmentRule: 'wake_day',
    totals: {
      totalMinutes: Math.round(totalMinutes),
      averageDailyMinutes: activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0,
      activeDays,
      sessionsCount,
      averageSleepTime: formatClock(averageSleepClockMinutes),
      averageWakeTime: formatClock(averageWakeClockMinutes),
      byType
    },
    daily,
    review
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

export function buildWeeklyAnalysis(rows, weekRange, timezone, options = {}) {
  const base = buildAnalysisByWakeDay(rows, weekRange.startLocal, weekRange.endLocal, timezone, WEEKDAY_LABELS, options)

  return {
    week: weekRange.weekId,
    timezone,
    range: {
      startAt: weekRange.startLocal.toISO(),
      endAt: weekRange.endLocal.toISO()
    },
    assignmentRule: base.assignmentRule,
    totals: base.totals,
    daily: base.daily,
    review: base.review
  }
}

export function buildMonthlyAnalysis(rows, monthRange, timezone, options = {}) {
  const dayLabels = Array.from({ length: monthRange.daysInMonth }, (_, index) => `${index + 1}日`)
  const base = buildAnalysisByWakeDay(
    rows,
    monthRange.startLocal,
    monthRange.endLocal,
    timezone,
    dayLabels,
    options
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
    daily: base.daily,
    review: base.review
  }
}

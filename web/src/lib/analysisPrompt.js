import { DateTime } from 'luxon'
import { formatTypeLabel } from './time'
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function formatRecordDateTime(isoString, timezone) {
  if (!isoString) {
    return '-'
  }

  const dt = DateTime.fromISO(isoString, { zone: 'utc' }).setZone(timezone)
  if (!dt.isValid) {
    return isoString
  }

  const weekday = WEEKDAY_LABELS[dt.weekday - 1] || ''
  return `${dt.toFormat('yyyy-LL-dd HH:mm')} ${weekday}`.trim()
}

function formatSourceRecords(analysis, timezone) {
  const rows = analysis?.sourceRecords || []
  if (!rows.length) {
    return ['- 当前统计范围内无可用记录']
  }

  return rows.map((item, index) => {
    const startAt = formatRecordDateTime(item.startAt, timezone)
    const endAt = formatRecordDateTime(item.endAt, timezone)
    return `${index + 1}. ${formatTypeLabel(item.type)} | 入睡：${startAt} | 苏醒：${endAt}`
  })
}

function periodText(scope, analysis) {
  const period = analysis?.period || {}
  if (scope === 'weekly') {
    return `周 ${period.week || '-'}（${period.startDate || '-'} ~ ${period.endDate || '-'}）`
  }
  return `月 ${period.month || '-'}（${period.startDate || '-'} ~ ${period.endDate || '-'}）`
}

function calculateAgeText(boardBirthDate, timezone, referenceDate) {
  if (!boardBirthDate) {
    return '未设置'
  }

  const birthDate = DateTime.fromISO(boardBirthDate, { zone: timezone }).startOf('day')
  if (!birthDate.isValid) {
    return '无效日期'
  }

  const ref = (referenceDate || DateTime.local().setZone(timezone)).startOf('day')
  if (!ref.isValid || birthDate > ref) {
    return '无效日期'
  }

  const totalMonths = Math.floor(ref.diff(birthDate, 'months').months)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12

  if (years <= 0) {
    return `${months}个月`
  }

  return months > 0 ? `${years}岁${months}个月` : `${years}岁`
}

function buildAgeContext(analysis, boardBirthDate, timezone) {
  const meta = analysis?.review?.meta || null
  if (meta?.age) {
    const ageText =
      meta.age.years > 0
        ? `${meta.age.years}岁${meta.age.months > 0 ? `${meta.age.months}个月` : ''}`
        : `${meta.age.months}个月`
    return {
      ageText
    }
  }

  const periodEnd = analysis?.period?.endDate
  const referenceDate = periodEnd
    ? DateTime.fromISO(periodEnd, { zone: timezone }).minus({ days: 1 })
    : DateTime.local().setZone(timezone)

  return {
    ageText: calculateAgeText(boardBirthDate, timezone, referenceDate)
  }
}

export function buildAiConsultPrompt({ scope, boardName, boardBirthDate, analysis, timezone }) {
  if (!analysis) {
    return ''
  }

  const recordCount = analysis?.sourceRecords?.length || 0
  const ageContext = buildAgeContext(analysis, boardBirthDate, analysis.timezone || timezone)

  const lines = [
    '以下是用户提供的睡眠原始数据，请你作为独立睡眠顾问重新分析。',
    '',
    '【用户信息】',
    `- 看板：${boardName || '-'}`,
    `- 出生日期：${boardBirthDate || '未设置'}`,
    `- 年龄：${ageContext.ageText}`,
    '',
    '【数据上下文】',
    `- 统计周期：${periodText(scope, analysis)}`,
    `- 时区：${analysis.timezone || timezone}`,
    `- 统计规则：${analysis.assignmentRule === 'wake_day' ? '整段睡眠按苏醒日归属' : analysis.assignmentRule || '-'}`,
    `- 原始记录数：${recordCount}`,
    '',
    '【睡眠原始记录】',
    ...formatSourceRecords(analysis, analysis.timezone || timezone),
    '',
    '【输出规则（请严格遵守）】',
    '1. 仅基于以上原始记录和年龄分析，不要引用“系统评分/系统结论”。',
    '2. 先做数据质量检查：样本是否足够、是否存在缺失或异常记录。',
    '3. 先自行从原始记录计算关键指标（总量、日均、入睡/醒来趋势、类型占比、日波动），再给结论。',
    '4. 输出结构必须包含以下 6 部分：',
    '   A. 年龄对应建议睡眠范围（写明你采用的参考区间）',
    '   B. 睡眠时长评估（基于你计算的总量、日均、偏多或偏少）',
    '   C. 早晚节律评估（入睡/醒来是否偏早偏晚）',
    '   D. 规律性评估（日波动、作息稳定度）',
    '   E. 睡眠结构评估（夜间/午睡/零星占比）',
    '   F. 可执行建议（3-5条，按优先级排序）',
    '5. 每条结论都要引用至少一个你从原始记录计算出的数值证据。',
    '6. 对不确定的部分必须明确写出“证据不足”并说明还需要哪些数据。',
    '7. 最后给出一句总评，格式：总体判断：xxx。'
  ]

  return lines.join('\n')
}

export async function copyTextToClipboard(text) {
  if (!text) {
    throw new Error('empty text')
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined') {
    throw new Error('clipboard unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!ok) {
    throw new Error('copy failed')
  }
}

import { errorResponseSchema } from '../../../shared/index.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const CLIENT_FIELD_LABELS = {
  username: '用户名',
  password: '密码',
  name: '名称',
  description: '描述',
  birthDate: '出生日期',
  type: '类型',
  startAt: '入睡时间',
  endAt: '苏醒时间',
  note: '备注',
  timezone: '时区'
}

function clientFieldLabel(path) {
  const target = path[path.length - 1]
  if (typeof target === 'string' && CLIENT_FIELD_LABELS[target]) {
    return CLIENT_FIELD_LABELS[target]
  }

  return '请求数据'
}

function formatClientValidationError(error, fallbackMessage = '请求数据格式无效') {
  const issue = error.issues?.[0]
  if (!issue) {
    return fallbackMessage
  }

  if (issue.code === 'unrecognized_keys' && issue.keys?.length) {
    return `包含不支持的字段：${issue.keys.join('、')}`
  }

  const label = clientFieldLabel(issue.path || [])

  if (issue.code === 'too_small' && issue.origin === 'string') {
    return `${label}不能为空`
  }

  if (issue.code === 'invalid_type') {
    return `${label}参数类型无效`
  }

  if (issue.code === 'invalid_value') {
    return `${label}参数无效`
  }

  if (issue.code === 'invalid_format') {
    if (label === '出生日期') {
      return '出生日期格式必须为 YYYY-MM-DD'
    }

    return `${label}格式无效`
  }

  if (issue.code === 'custom') {
    return issue.message || fallbackMessage
  }

  return issue.message || fallbackMessage
}

function parseBodyWithSchema(schema, payload) {
  if (!schema) {
    return payload
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    const error = new Error(formatClientValidationError(result.error))
    error.cause = result.error
    throw error
  }

  return result.data
}

function parseResponseWithSchema(schema, payload, fallbackMessage) {
  if (!schema) {
    return payload
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    const error = new Error(fallbackMessage)
    error.cause = result.error
    throw error
  }

  return result.data
}

async function request(path, options = {}) {
  const method = options.method || 'GET'
  const body = parseBodyWithSchema(options.bodySchema, options.body)
  const headers = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(payload)
    const error = new Error(parsedError.success ? parsedError.data.message : '请求失败')
    error.status = response.status
    throw error
  }

  return parseResponseWithSchema(options.responseSchema, payload, '服务返回数据格式不符合预期')
}

export const api = {
  get(path, options = {}) {
    return request(path, options)
  },
  post(path, body, options = {}) {
    return request(path, { ...options, method: 'POST', body })
  },
  patch(path, body, options = {}) {
    return request(path, { ...options, method: 'PATCH', body })
  },
  delete(path, options = {}) {
    return request(path, { ...options, method: 'DELETE' })
  }
}

import { z } from 'zod'
import { errorResponseSchema } from '../../../shared/index.ts'

type ApiSchema = z.ZodTypeAny | undefined

type SchemaOutput<TSchema extends ApiSchema> = TSchema extends z.ZodTypeAny ? z.output<TSchema> : unknown

interface RequestOptions<TBodySchema extends ApiSchema = undefined, TResponseSchema extends ApiSchema = undefined> {
  method?: string
  body?: unknown
  bodySchema?: TBodySchema
  responseSchema?: TResponseSchema
  headers?: HeadersInit
}

interface ApiError extends Error {
  status?: number
  cause?: unknown
}

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

function clientFieldLabel(path: PropertyKey[]): string {
  const target = path[path.length - 1]
  if (typeof target === 'string' && CLIENT_FIELD_LABELS[target]) {
    return CLIENT_FIELD_LABELS[target]
  }

  return '请求数据'
}

function formatClientValidationError(error: z.ZodError, fallbackMessage = '请求数据格式无效'): string {
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

function parseBodyWithSchema<TSchema extends ApiSchema>(schema: TSchema, payload: unknown): SchemaOutput<TSchema> {
  if (!schema) {
    return payload as SchemaOutput<TSchema>
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    const error: ApiError = new Error(formatClientValidationError(result.error))
    error.cause = result.error
    throw error
  }

  return result.data as SchemaOutput<TSchema>
}

function parseResponseWithSchema<TSchema extends ApiSchema>(
  schema: TSchema,
  payload: unknown,
  fallbackMessage: string
): SchemaOutput<TSchema> {
  if (!schema) {
    return payload as SchemaOutput<TSchema>
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    const error: ApiError = new Error(fallbackMessage)
    error.cause = result.error
    throw error
  }

  return result.data as SchemaOutput<TSchema>
}

async function request<TBodySchema extends ApiSchema = undefined, TResponseSchema extends ApiSchema = undefined>(
  path: string,
  options: RequestOptions<TBodySchema, TResponseSchema> = {}
): Promise<SchemaOutput<TResponseSchema>> {
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
    const error: ApiError = new Error(parsedError.success ? parsedError.data.message : '请求失败')
    error.status = response.status
    throw error
  }

  return parseResponseWithSchema(options.responseSchema, payload, '服务返回数据格式不符合预期')
}

export const api = {
  get<TResponseSchema extends ApiSchema = undefined>(
    path: string,
    options: RequestOptions<undefined, TResponseSchema> = {}
  ): Promise<SchemaOutput<TResponseSchema>> {
    return request(path, options)
  },
  post<TBodySchema extends ApiSchema = undefined, TResponseSchema extends ApiSchema = undefined>(
    path: string,
    body: unknown,
    options: RequestOptions<TBodySchema, TResponseSchema> = {}
  ): Promise<SchemaOutput<TResponseSchema>> {
    return request(path, { ...options, method: 'POST', body })
  },
  patch<TBodySchema extends ApiSchema = undefined, TResponseSchema extends ApiSchema = undefined>(
    path: string,
    body: unknown,
    options: RequestOptions<TBodySchema, TResponseSchema> = {}
  ): Promise<SchemaOutput<TResponseSchema>> {
    return request(path, { ...options, method: 'PATCH', body })
  },
  delete<TResponseSchema extends ApiSchema = undefined>(
    path: string,
    options: RequestOptions<undefined, TResponseSchema> = {}
  ): Promise<SchemaOutput<TResponseSchema>> {
    return request(path, { ...options, method: 'DELETE' })
  }
}

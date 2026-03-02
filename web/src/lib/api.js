const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const method = options.method || 'GET'
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    const error = new Error(payload?.message || '请求失败')
    error.status = response.status
    throw error
  }

  return payload
}

export const api = {
  get(path) {
    return request(path)
  },
  post(path, body) {
    return request(path, { method: 'POST', body })
  },
  patch(path, body) {
    return request(path, { method: 'PATCH', body })
  },
  delete(path) {
    return request(path, { method: 'DELETE' })
  }
}

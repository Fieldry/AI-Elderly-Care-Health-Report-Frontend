const backendOrigin = (import.meta.env.VITE_BACKEND_ORIGIN || '').trim()
const legacyApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
const speechSocketUrl = (import.meta.env.VITE_STT_WS_URL || '').trim()

export class ApiError extends Error {
  status: number
  payload?: unknown

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export interface SseEventPayload {
  event: string
  data: string
  id?: string
}

function normalizePath(path: string) {
  if (!path.startsWith('/')) {
    return `/${path}`
  }
  return path
}

function stripTrailingSlashes(value: string) {
  return value.replace(/\/+$/, '')
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function isAbsoluteWsUrl(value: string) {
  return /^wss?:\/\//i.test(value)
}

function isProtocolRelativeUrl(value: string) {
  return /^\/\//.test(value)
}

function looksLikeHost(value: string) {
  return /^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(value)
}

function resolveWindowHttpOrigin() {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8001'
  }

  return window.location.origin
}

function resolveWindowWsOrigin() {
  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:8001'
  }

  return window.location.origin.replace(/^http/i, 'ws')
}

function normalizeHttpBase(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue || trimmedValue.startsWith('/')) {
    return ''
  }

  if (isAbsoluteHttpUrl(trimmedValue)) {
    return stripTrailingSlashes(trimmedValue)
  }

  if (isProtocolRelativeUrl(trimmedValue)) {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    return stripTrailingSlashes(`${protocol}${trimmedValue}`)
  }

  if (looksLikeHost(trimmedValue)) {
    return stripTrailingSlashes(`http://${trimmedValue}`)
  }

  return ''
}

function normalizeWsEndpoint(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return ''
  }

  if (isAbsoluteWsUrl(trimmedValue)) {
    return stripTrailingSlashes(trimmedValue)
  }

  if (isAbsoluteHttpUrl(trimmedValue)) {
    return stripTrailingSlashes(trimmedValue.replace(/^http/i, 'ws'))
  }

  if (isProtocolRelativeUrl(trimmedValue)) {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return stripTrailingSlashes(`${protocol}${trimmedValue}`)
  }

  if (trimmedValue.startsWith('/')) {
    return `${resolveWindowWsOrigin()}${trimmedValue}`
  }

  if (looksLikeHost(trimmedValue)) {
    return stripTrailingSlashes(`ws://${trimmedValue}`)
  }

  return ''
}

const configuredBackendBase = normalizeHttpBase(backendOrigin || legacyApiBaseUrl)

function mergeHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers)
  return nextHeaders
}

function tryParseJson(text: string) {
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function resolveErrorMessage(status: number, statusText: string, payload: unknown, fallbackText: string) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const detail = record.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }

    const message = record.message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  if (fallbackText.trim()) {
    return fallbackText
  }

  if (status === 401) {
    return '登录状态已失效，请重新进入。'
  }

  if (status === 403) {
    return '当前账号没有访问该资源的权限。'
  }

  return `${status} ${statusText}`
}

function dispatchSseEvent(block: string, onEvent: (event: SseEventPayload) => void) {
  const lines = block.split(/\r?\n/)
  let event = 'message'
  let id = ''
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message'
      continue
    }

    if (line.startsWith('id:')) {
      id = line.slice(3).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return
  }

  onEvent({
    event,
    data: dataLines.join('\n'),
    id: id || undefined
  })
}

export function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

export function asArray<T = unknown>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : []
}

export function getString(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!record) {
    return ''
  }

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return ''
}

export function getNumber(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!record) {
    return null
  }

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const numericValue = Number(value)
      if (Number.isFinite(numericValue)) {
        return numericValue
      }
    }
  }

  return null
}

export function buildBackendUrl(path: string) {
  const normalizedPath = normalizePath(path)
  if (!configuredBackendBase) {
    return normalizedPath
  }

  try {
    return new URL(normalizedPath, ensureTrailingSlash(configuredBackendBase)).toString()
  } catch {
    return `${resolveWindowHttpOrigin()}${normalizedPath}`
  }
}

export function buildWebSocketUrl(path: string) {
  const normalizedPath = normalizePath(path)
  const configuredSocketUrl = normalizeWsEndpoint(speechSocketUrl)
  if (configuredSocketUrl) {
    return configuredSocketUrl
  }

  if (configuredBackendBase) {
    try {
      const httpUrl = new URL(normalizedPath, ensureTrailingSlash(configuredBackendBase)).toString()
      return httpUrl.replace(/^http/i, 'ws')
    } catch {
      return `${resolveWindowWsOrigin()}${normalizedPath}`
    }
  }

  return `${resolveWindowWsOrigin()}${normalizedPath}`
}

export function buildJsonHeaders(headers?: HeadersInit) {
  const nextHeaders = mergeHeaders(headers)
  nextHeaders.set('Content-Type', 'application/json')
  return nextHeaders
}

export function buildAuthHeaders(token?: string, headers?: HeadersInit) {
  const nextHeaders = mergeHeaders(headers)
  if (token) {
    nextHeaders.set('Authorization', `Bearer ${token}`)
  }
  return nextHeaders
}

export async function request(path: string, init?: RequestInit) {
  const response = await fetch(buildBackendUrl(path), init)
  if (response.ok) {
    return response
  }

  const rawText = await response.text()
  const parsedPayload = tryParseJson(rawText)
  throw new ApiError(
    resolveErrorMessage(response.status, response.statusText, parsedPayload, rawText),
    response.status,
    parsedPayload ?? rawText
  )
}

export async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await request(path, init)
  return (await response.json()) as T
}

export async function requestBlob(path: string, init?: RequestInit) {
  const response = await request(path, init)
  return response.blob()
}

export async function consumeSse(
  path: string,
  init: RequestInit,
  onEvent: (event: SseEventPayload) => void
) {
  const response = await request(path, init)
  if (!response.body) {
    throw new Error('后端没有返回可读取的流式内容。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, {
      stream: true
    })

    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''

    for (const block of blocks) {
      dispatchSseEvent(block, onEvent)
    }
  }

  buffer += decoder.decode()
  const trimmedBuffer = buffer.trim()
  if (trimmedBuffer) {
    dispatchSseEvent(trimmedBuffer, onEvent)
  }
}

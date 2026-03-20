import { asArray, asRecord, buildAuthHeaders, buildJsonHeaders, consumeSse, getNumber, getString, requestJson } from '@/api/core'
import type {
  ChatMessage,
  ChatMessageResponse,
  ChatProgressResponse,
  ChatStartResponse,
  SessionDetail,
  SessionMetadata
} from '@/types'

interface StreamAccumulator {
  message: string
  state: string
  progress: number
  completed: boolean
  chunkCount: number
}

function normalizeSessionMetadata(value: unknown): SessionMetadata | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const sessionId = getString(record, 'session_id', 'sessionId')
  const createdAt = getString(record, 'created_at', 'createdAt')
  if (!sessionId || !createdAt) {
    return null
  }

  return {
    session_id: sessionId,
    sessionId,
    user_id: getString(record, 'user_id', 'userId') || undefined,
    userId: getString(record, 'user_id', 'userId') || undefined,
    created_at: createdAt,
    createdAt,
    status: getString(record, 'status') || undefined,
    title: getString(record, 'title') || undefined,
    has_report: Boolean(record.has_report ?? record.hasReport),
    hasReport: Boolean(record.has_report ?? record.hasReport),
    has_profile: Boolean(record.has_profile ?? record.hasProfile),
    hasProfile: Boolean(record.has_profile ?? record.hasProfile),
    files: asArray<string>(record.files).filter((item) => typeof item === 'string')
  }
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const roleValue = getString(record, 'role', 'speaker')
  const content = getString(record, 'content', 'message', 'text')
  if (!content) {
    return null
  }

  const role = roleValue === 'assistant' || roleValue === 'system' ? roleValue : 'user'
  return {
    role,
    content,
    timestamp: getString(record, 'timestamp', 'created_at', 'createdAt') || undefined
  }
}

function normalizeSessionDetail(value: unknown): SessionDetail {
  const record = asRecord(value)
  const metadata = normalizeSessionMetadata(record?.metadata ?? record) || {
    session_id: '',
    created_at: ''
  }
  const conversationSource = record?.conversation ?? record?.history ?? record?.messages
  const reportSource = record?.reports ?? record?.report_list ?? []

  return {
    metadata,
    conversation: asArray(conversationSource).map(normalizeChatMessage).filter(Boolean) as ChatMessage[],
    profile: asRecord(record?.profile),
    reports: asArray<Record<string, unknown>>(reportSource).map((item) => asRecord(item) || {}).filter(Boolean)
  }
}

function buildChatStreamPath(sessionId: string, message: string) {
  const query = new URLSearchParams({
    sessionId,
    message
  })

  return `/chat/stream?${query.toString()}`
}

function appendStreamText(currentText: string, nextText: string) {
  if (!nextText) {
    return currentText
  }

  if (!currentText) {
    return nextText
  }

  if (nextText.startsWith(currentText)) {
    return nextText
  }

  return `${currentText}${nextText}`
}

function applyStreamPayload(accumulator: StreamAccumulator, payload: unknown, rawData: string, onDelta?: (value: string) => void) {
  const record = asRecord(payload)
  if (!record) {
    const textChunk = rawData.trim()
    if (!textChunk || textChunk === '[DONE]') {
      return
    }

    accumulator.message = appendStreamText(accumulator.message, textChunk)
    accumulator.chunkCount += 1
    onDelta?.(textChunk)
    return
  }

  const messageChunk =
    getString(record, 'delta', 'content', 'message', 'text', 'chunk') ||
    getString(asRecord(record.data), 'delta', 'content', 'message', 'text', 'chunk')

  if (messageChunk) {
    const nextMessage = appendStreamText(accumulator.message, messageChunk)
    const delta = nextMessage.startsWith(accumulator.message)
      ? nextMessage.slice(accumulator.message.length)
      : messageChunk
    accumulator.message = nextMessage
    if (delta) {
      accumulator.chunkCount += 1
      onDelta?.(delta)
    }
  }

  const state = getString(record, 'state')
  if (state) {
    accumulator.state = state
  }

  const progress = getNumber(record, 'progress')
  if (progress !== null) {
    accumulator.progress = progress
  }

  if (typeof record.completed === 'boolean') {
    accumulator.completed = record.completed
  }

  const nestedRecord = asRecord(record.data)
  if (nestedRecord) {
    const nestedState = getString(nestedRecord, 'state')
    if (nestedState) {
      accumulator.state = nestedState
    }

    const nestedProgress = getNumber(nestedRecord, 'progress')
    if (nestedProgress !== null) {
      accumulator.progress = nestedProgress
    }

    if (typeof nestedRecord.completed === 'boolean') {
      accumulator.completed = nestedRecord.completed
    }
  }
}

export function startChat() {
  return requestJson<ChatStartResponse>('/chat/start', {
    method: 'POST'
  })
}

export function sendChatMessage(
  sessionId: string,
  message: string,
  token: string,
  context?: Record<string, unknown>
) {
  return requestJson<ChatMessageResponse>('/chat/message', {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify({
      sessionId,
      message,
      context
    })
  })
}

export async function streamChatMessage(
  sessionId: string,
  message: string,
  token: string,
  onDelta?: (value: string) => void
): Promise<ChatMessageResponse> {
  const accumulator: StreamAccumulator = {
    message: '',
    state: 'collecting',
    progress: 0,
    completed: false,
    chunkCount: 0
  }

  await consumeSse(
    buildChatStreamPath(sessionId, message),
    {
      method: 'GET',
      headers: buildAuthHeaders(token)
    },
    (event) => {
      let payload: unknown = null
      if (event.data.trim()) {
        try {
          payload = JSON.parse(event.data) as unknown
        } catch {
          payload = null
        }
      }
      applyStreamPayload(accumulator, payload, event.data, onDelta)
    }
  )

  if (!accumulator.chunkCount && !accumulator.message) {
    throw new Error('流式对话没有返回可用内容。')
  }

  return {
    message: accumulator.message.trim(),
    state: accumulator.state,
    progress: accumulator.progress,
    completed: accumulator.completed
  } satisfies ChatMessageResponse
}

export async function getChatHistory(sessionId: string, token: string) {
  const response = await requestJson<unknown>(`/chat/history/${sessionId}`, {
    headers: buildAuthHeaders(token)
  })
  return asArray(response).map(normalizeChatMessage).filter(Boolean) as ChatMessage[]
}

export async function getChatProfile(sessionId: string, token: string) {
  const response = await requestJson<unknown>(`/chat/profile/${sessionId}`, {
    headers: buildAuthHeaders(token)
  })
  return asRecord(response) || {}
}

export async function getChatProgress(sessionId: string, token: string) {
  const response = await requestJson<unknown>(`/chat/progress/${sessionId}`, {
    headers: buildAuthHeaders(token)
  })

  const record = asRecord(response) || {}
  const missingFieldsSource = asRecord(record.missingFields ?? record.missing_fields)
  const missingFields = Object.fromEntries(
    Object.entries(missingFieldsSource || {}).map(([group, fields]) => [
      group,
      asArray<string>(fields).filter((item) => typeof item === 'string')
    ])
  )

  return {
    state: getString(record, 'state') || 'collecting',
    progress: getNumber(record, 'progress') ?? 0,
    completedGroups: asArray<string>(record.completedGroups ?? record.completed_groups).filter(
      (item) => typeof item === 'string'
    ),
    pendingGroups: asArray<string>(record.pendingGroups ?? record.pending_groups).filter(
      (item) => typeof item === 'string'
    ),
    missingFields
  } satisfies ChatProgressResponse
}

export async function listSessions(token?: string) {
  const response = await requestJson<unknown>('/api/sessions', {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response)
  const source = record?.sessions ?? record?.data ?? response
  return asArray(source).map(normalizeSessionMetadata).filter(Boolean) as SessionMetadata[]
}

export async function getSessionDetail(sessionId: string, token?: string) {
  const response = await requestJson<unknown>(`/api/sessions/${sessionId}`, {
    headers: buildAuthHeaders(token)
  })
  return normalizeSessionDetail(response)
}

export function saveSessionProfile(sessionId: string, payload: Record<string, unknown>, token: string) {
  return requestJson<Record<string, unknown>>(`/api/sessions/${sessionId}/profile`, {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify(payload)
  })
}

export function deleteSession(sessionId: string, token: string) {
  return requestJson<{ success?: boolean }>(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token)
  })
}

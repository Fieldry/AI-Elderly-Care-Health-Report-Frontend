import { asArray, asRecord, buildAuthHeaders, buildJsonHeaders, consumeSse, getNumber, getString, requestJson } from '@/api/core'
import type {
  ChatInteraction,
  ChatInteractionField,
  ChatInteractionItem,
  ChatOption,
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
  interaction: ChatInteraction | null
}

function normalizeChatOption(value: unknown): ChatOption | null {
  const record = asRecord(value)
  const label = getString(record, 'label')
  const optionValue = getString(record, 'value')
  if (!label || !optionValue) {
    return null
  }
  return {
    label,
    value: optionValue
  }
}

function normalizeChatInteractionField(value: unknown): ChatInteractionField | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }
  const key = getString(record, 'key')
  const label = getString(record, 'label')
  if (!key || !label) {
    return null
  }
  return {
    key,
    label,
    type: getString(record, 'type') || undefined,
    options: asArray(record.options).map(normalizeChatOption).filter(Boolean) as ChatOption[],
    allow_custom: Boolean(record.allow_custom ?? record.allowCustom),
    custom_key: getString(record, 'custom_key', 'customKey') || undefined,
    placeholder: getString(record, 'placeholder') || undefined
  }
}

function normalizeChatInteractionItem(value: unknown): ChatInteractionItem | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }
  const key = getString(record, 'key')
  const label = getString(record, 'label')
  if (!key || !label) {
    return null
  }
  return { key, label }
}

function normalizeChatInteraction(value: unknown): ChatInteraction | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }
  const id = getString(record, 'id')
  const groupId = getString(record, 'groupId', 'group_id')
  const groupName = getString(record, 'groupName', 'group_name')
  const kind = getString(record, 'kind')
  const prompt = getString(record, 'prompt')
  if (!id || !groupId || !groupName || !kind || !prompt) {
    return null
  }

  const normalizedFields = asArray(record.fields)
    .map((item) => normalizeChatInteractionField(item) || (typeof item === 'string' ? item : null))
    .filter(Boolean) as Array<ChatInteractionField | string>

  return {
    id,
    groupId,
    groupName,
    kind,
    prompt,
    allowFreeText: Boolean(record.allowFreeText ?? record.allow_free_text),
    submitLabel: getString(record, 'submitLabel', 'submit_label') || undefined,
    field: getString(record, 'field') || undefined,
    options: asArray(record.options).map(normalizeChatOption).filter(Boolean) as ChatOption[],
    items: asArray(record.items).map(normalizeChatInteractionItem).filter(Boolean) as ChatInteractionItem[],
    fields: normalizedFields
  }
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

    const nestedInteraction = normalizeChatInteraction(nestedRecord.interaction)
    if (nestedInteraction || nestedRecord.interaction === null) {
      accumulator.interaction = nestedInteraction
    }
  }

  const interaction = normalizeChatInteraction(record.interaction)
  if (interaction || record.interaction === null) {
    accumulator.interaction = interaction
  }
}

export async function startChat() {
  const response = await requestJson<unknown>('/chat/start', {
    method: 'POST'
  })
  const record = asRecord(response) || {}
  return {
    userId: getString(record, 'userId', 'user_id') || '',
    sessionId: getString(record, 'sessionId', 'session_id') || '',
    welcomeMessage: getString(record, 'welcomeMessage', 'welcome_message') || '',
    interaction: normalizeChatInteraction(record.interaction),
    accessToken: getString(record, 'accessToken', 'access_token') || '',
    userType: getString(record, 'userType', 'user_type') || undefined,
    expiresAt: getString(record, 'expiresAt', 'expires_at') || undefined
  } satisfies ChatStartResponse
}

export function sendChatMessage(
  sessionId: string,
  message: string,
  token: string,
  context?: Record<string, unknown>,
  answer?: Record<string, unknown>
) {
  return requestJson<ChatMessageResponse>('/chat/message', {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify({
      sessionId,
      message,
      context,
      answer
    })
  }).then((response) => {
    const record = asRecord(response) || {}
    return {
      message: getString(record, 'message') || '',
      state: getString(record, 'state') || 'collecting',
      progress: getNumber(record, 'progress') ?? 0,
      completed: Boolean(record.completed),
      interaction: normalizeChatInteraction(record.interaction)
    } satisfies ChatMessageResponse
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
    chunkCount: 0,
    interaction: null
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
    completed: accumulator.completed,
    interaction: accumulator.interaction
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
    missingFields,
    interaction: normalizeChatInteraction(record.interaction)
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

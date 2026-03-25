import {
  asArray,
  asRecord,
  buildAuthHeaders,
  buildJsonHeaders,
  consumeSse,
  getString,
  requestJson
} from '@/api/core'
import type { ChatMessage, CounselingSessionInfo } from '@/types'

function normalizeCounselingSessionInfo(value: unknown): CounselingSessionInfo | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const sessionId = getString(record, 'sessionId', 'session_id')
  const userId = getString(record, 'userId', 'user_id')
  const createdAt = getString(record, 'createdAt', 'created_at')
  const updatedAt = getString(record, 'updatedAt', 'updated_at')

  if (!sessionId || !userId || !createdAt || !updatedAt) {
    return null
  }

  return {
    sessionId,
    userId,
    title: getString(record, 'title') || '心理咨询',
    status: getString(record, 'status') || 'active',
    createdAt,
    updatedAt
  }
}

function normalizeCounselingMessage(value: unknown): ChatMessage | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const content = getString(record, 'content', 'message', 'text')
  if (!content) {
    return null
  }

  const roleValue = getString(record, 'role')
  const role = roleValue === 'assistant' || roleValue === 'system' ? roleValue : 'user'

  return {
    role,
    content,
    timestamp: getString(record, 'createdAt', 'created_at', 'timestamp') || undefined
  }
}

function buildCounselingStreamPath(sessionId: string, message: string) {
  const query = new URLSearchParams({
    message
  })

  return `/counseling/sessions/${sessionId}/stream?${query.toString()}`
}

export async function createCounselingSession(token: string) {
  const response = await requestJson<unknown>('/counseling/sessions', {
    method: 'POST',
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response) || {}

  return {
    sessionId: getString(record, 'sessionId', 'session_id') || '',
    createdAt: getString(record, 'createdAt', 'created_at') || ''
  }
}

export async function listCounselingSessions(token: string) {
  const response = await requestJson<unknown>('/counseling/sessions', {
    headers: buildAuthHeaders(token)
  })

  return asArray(response).map(normalizeCounselingSessionInfo).filter(Boolean) as CounselingSessionInfo[]
}

export async function getCounselingHistory(sessionId: string, token: string) {
  const response = await requestJson<unknown>(`/counseling/sessions/${sessionId}/history`, {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response)
  const source = record?.messages ?? response

  return asArray(source).map(normalizeCounselingMessage).filter(Boolean) as ChatMessage[]
}

export async function sendCounselingMessage(sessionId: string, message: string, token: string) {
  const response = await requestJson<unknown>(`/counseling/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify({
      message
    })
  })

  const normalizedMessage = normalizeCounselingMessage(response)
  if (!normalizedMessage) {
    throw new Error('心理咨询服务没有返回有效回复。')
  }

  return normalizedMessage
}

export async function streamCounselingMessage(
  sessionId: string,
  message: string,
  token: string,
  onDelta?: (value: string) => void
) {
  let content = ''
  let hasContent = false

  await consumeSse(
    buildCounselingStreamPath(sessionId, message),
    {
      method: 'GET',
      headers: buildAuthHeaders(token)
    },
    (event) => {
      const raw = event.data.trim()
      if (!raw || raw === '[DONE]') {
        return
      }

      let payload: unknown = null
      try {
        payload = JSON.parse(raw) as unknown
      } catch {
        payload = null
      }

      const payloadRecord = asRecord(payload)
      const errorMessage = getString(payloadRecord, 'error')
      if (errorMessage) {
        throw new Error(errorMessage)
      }

      const chunk = getString(payloadRecord, 'content') || raw
      if (!chunk) {
        return
      }

      content += chunk
      hasContent = true
      onDelta?.(chunk)
    }
  )

  if (!hasContent || !content.trim()) {
    throw new Error('心理咨询服务没有返回可用内容。')
  }

  return {
    role: 'assistant',
    content: content.trim()
  } satisfies ChatMessage
}

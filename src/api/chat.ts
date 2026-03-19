import { buildJsonHeaders, requestJson } from '@/api/core'
import type {
  ChatMessage,
  ChatMessageResponse,
  ChatStartResponse,
  SessionDetail,
  SessionMetadata
} from '@/types'

export function startChat() {
  return requestJson<ChatStartResponse>('/chat/start', {
    method: 'POST'
  })
}

export function sendChatMessage(
  sessionId: string,
  message: string,
  context?: Record<string, unknown>
) {
  return requestJson<ChatMessageResponse>('/chat/message', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      sessionId,
      message,
      context
    })
  })
}

export function getChatHistory(sessionId: string) {
  return requestJson<ChatMessage[]>(`/chat/history/${sessionId}`)
}

export function getChatProfile(sessionId: string) {
  return requestJson<Record<string, unknown>>(`/chat/profile/${sessionId}`)
}

export async function listSessions() {
  const response = await requestJson<{ sessions: SessionMetadata[] }>('/api/sessions')
  return response.sessions || []
}

export function getSessionDetail(sessionId: string) {
  return requestJson<SessionDetail>(`/api/sessions/${sessionId}`)
}

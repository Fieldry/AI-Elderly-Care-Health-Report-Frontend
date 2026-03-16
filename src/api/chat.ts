import http from './http'
import type {
  ChatMessage,
  ChatMessageResponse,
  ChatProgressResponse,
  ChatStartResponse,
  SessionDetail,
  SessionMetadata
} from '@/types'

const apiOrigin = import.meta.env.VITE_BACKEND_ORIGIN || ''

function withOrigin(path: string): string {
  return `${apiOrigin}${path}`
}

export async function startChat(): Promise<ChatStartResponse> {
  const response = await fetch(withOrigin('/chat/start'), {
    method: 'POST'
  })
  if (!response.ok) {
    throw new Error(`启动会话失败: ${response.status}`)
  }
  return response.json()
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
  context?: Record<string, unknown>
): Promise<ChatMessageResponse> {
  const response = await fetch(withOrigin('/chat/message'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId,
      message,
      context
    })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`发送消息失败: ${text || response.statusText}`)
  }
  return response.json()
}

export async function getChatProgress(sessionId: string): Promise<ChatProgressResponse> {
  const response = await fetch(withOrigin(`/chat/progress/${sessionId}`))
  if (!response.ok) {
    throw new Error(`获取会话进度失败: ${response.status}`)
  }
  return response.json()
}

export async function getChatProfile(sessionId: string): Promise<Record<string, unknown>> {
  const response = await fetch(withOrigin(`/chat/profile/${sessionId}`))
  if (!response.ok) {
    throw new Error(`获取会话画像失败: ${response.status}`)
  }
  return response.json()
}

export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const response = await fetch(withOrigin(`/chat/history/${sessionId}`))
  if (!response.ok) {
    throw new Error(`获取聊天记录失败: ${response.status}`)
  }
  return response.json()
}

export async function listSessions(): Promise<SessionMetadata[]> {
  const { data } = await http.get<{ sessions: SessionMetadata[] }>('/api/sessions')
  return data.sessions || []
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const { data } = await http.get<SessionDetail>(`/api/sessions/${sessionId}`)
  return data
}

export async function deleteSession(sessionId: string): Promise<void> {
  await http.delete(`/api/sessions/${sessionId}`)
}

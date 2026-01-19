import api from './index'
import type { UserProfile } from '@/stores/userProfile'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ChatResponse {
  message: string
  nextQuestion?: string
  fieldToUpdate?: string
  completed?: boolean
}

/**
 * 发送对话消息
 */
export async function sendMessage(
  message: string,
  sessionId: string,
  context?: Partial<UserProfile>
): Promise<ChatResponse> {
  return api.post('/chat/message', {
    message,
    sessionId,
    context
  })
}

/**
 * 获取对话历史
 */
export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  return api.get(`/chat/history/${sessionId}`)
}

/**
 * 开始新的评估对话
 */
export async function startAssessment(): Promise<{ sessionId: string; welcomeMessage: string }> {
  return api.post('/chat/start')
}

/**
 * 流式对话 - 使用 SSE
 */
export function streamChat(
  message: string,
  sessionId: string,
  onMessage: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): () => void {
  const eventSource = new EventSource(
    `/api/chat/stream?message=${encodeURIComponent(message)}&sessionId=${sessionId}`
  )

  eventSource.onmessage = (event) => {
    if (event.data === '[DONE]') {
      eventSource.close()
      onComplete()
    } else {
      onMessage(event.data)
    }
  }

  eventSource.onerror = (error) => {
    eventSource.close()
    onError(new Error('Stream connection failed'))
  }

  // 返回取消函数
  return () => {
    eventSource.close()
  }
}

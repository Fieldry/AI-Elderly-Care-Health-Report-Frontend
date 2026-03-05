import type { AgentStatusEvent, ReportData } from '@/types'

const apiOrigin = import.meta.env.VITE_BACKEND_ORIGIN || ''

function withOrigin(path: string): string {
  return `${apiOrigin}${path}`
}

interface ReportStreamPayload {
  profile: Record<string, unknown>
  sessionId: string
}

interface ReportStreamHandlers {
  onStatus?: (event: AgentStatusEvent) => void
  onChunk?: (chunk: string) => void
  onComplete?: (report: ReportData) => void
  onError?: (message: string) => void
}

function parseLineData(raw: string): string | null {
  if (!raw.startsWith('data:')) {
    return null
  }
  return raw.slice(5).trim()
}

export async function streamReport(
  payload: ReportStreamPayload,
  handlers: ReportStreamHandlers
): Promise<void> {
  const response = await fetch(withOrigin('/report/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(`报告流式生成失败: ${text || response.statusText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      const lines = frame.split('\n')
      for (const line of lines) {
        const data = parseLineData(line)
        if (!data) {
          continue
        }
        if (data === '[DONE]') {
          return
        }

        try {
          const parsed = JSON.parse(data) as {
            type: string
            data?: unknown
          }

          if (parsed.type === 'agent_status' && parsed.data) {
            handlers.onStatus?.(parsed.data as AgentStatusEvent)
          } else if (parsed.type === 'report_chunk' && parsed.data) {
            const chunk = (parsed.data as { content?: string })?.content || ''
            if (chunk) {
              handlers.onChunk?.(chunk)
            }
          } else if (parsed.type === 'complete' && parsed.data) {
            handlers.onComplete?.(parsed.data as ReportData)
          } else if (parsed.type === 'error') {
            const message =
              (parsed.data as { message?: string })?.message || '报告生成失败，请稍后重试。'
            handlers.onError?.(message)
          }
        } catch {
          handlers.onError?.('流式响应解析失败，请稍后重试。')
        }
      }
    }
  }
}

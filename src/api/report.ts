import api from './index'
import type { UserProfile } from '@/stores/userProfile'

export interface ReportData {
  summary: string
  healthPortrait: {
    functionalStatus: string
    strengths: string[]
    problems: string[]
  }
  riskFactors: {
    shortTerm: RiskItem[]
    midTerm: RiskItem[]
  }
  recommendations: {
    priority1: RecommendationItem[]
    priority2: RecommendationItem[]
    priority3: RecommendationItem[]
  }
  generatedAt: string
}

export interface RiskItem {
  name: string
  level: 'high' | 'medium' | 'low'
  description: string
  timeframe: string
}

export interface RecommendationItem {
  id: string
  title: string
  description: string
  category: string
  completed?: boolean
}

export interface AgentStatus {
  agent: string
  status: 'pending' | 'running' | 'completed' | 'error'
  message?: string
}

/**
 * 生成健康评估报告
 */
export async function generateReport(profile: UserProfile): Promise<ReportData> {
  return api.post('/report/generate', { profile })
}

/**
 * 流式生成报告 - 支持打字机效果
 */
export async function streamReport(
  profile: UserProfile,
  onChunk: (chunk: string) => void,
  onAgentStatus: (status: AgentStatus) => void,
  onComplete: (report: ReportData) => void,
  onError: (error: Error) => void
): Promise<() => void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'

  try {
    const response = await fetch(`${baseUrl}/report/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ profile })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder()
    let cancelled = false

    const processStream = async () => {
      try {
        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n').filter(line => line.trim())

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') {
                return
              }
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'agent_status') {
                  onAgentStatus(parsed.data)
                } else if (parsed.type === 'chunk') {
                  onChunk(parsed.data)
                } else if (parsed.type === 'complete') {
                  onComplete(parsed.data)
                }
              } catch {
                // 普通文本块
                onChunk(data)
              }
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          onError(error as Error)
        }
      }
    }

    processStream()

    return () => {
      cancelled = true
      reader.cancel()
    }
  } catch (error) {
    onError(error as Error)
    return () => {}
  }
}

/**
 * 获取已生成的报告
 */
export async function getReport(reportId: string): Promise<ReportData> {
  return api.get(`/report/${reportId}`)
}

/**
 * 导出报告为 PDF
 */
export async function exportReportPDF(reportId: string): Promise<Blob> {
  const response = await api.get(`/report/${reportId}/export/pdf`, {
    responseType: 'blob'
  })
  return response as unknown as Blob
}

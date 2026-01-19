import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReportData, RiskItem, RecommendationItem } from '@/api/report'

// 报告状态
export type ReportStatus = 'idle' | 'generating' | 'completed' | 'error'

export const useReportResultStore = defineStore('reportResult', () => {
  // 状态
  const reportData = ref<ReportData | null>(null)
  const status = ref<ReportStatus>('idle')
  const errorMessage = ref<string>('')
  const markdownContent = ref<string>('')  // 原始 Markdown 内容
  const generatedAt = ref<string>('')

  // 用户交互状态：已确认的建议
  const confirmedRecommendations = ref<Set<string>>(new Set())

  // 计算属性：是否有报告
  const hasReport = computed(() => reportData.value !== null)

  // 计算属性：高风险因素数量
  const highRiskCount = computed(() => {
    if (!reportData.value) return 0
    const { shortTerm, midTerm } = reportData.value.riskFactors
    return [...shortTerm, ...midTerm].filter(r => r.level === 'high').length
  })

  // 计算属性：建议完成进度
  const recommendationProgress = computed(() => {
    if (!reportData.value) return { completed: 0, total: 0, percentage: 0 }

    const { priority1, priority2, priority3 } = reportData.value.recommendations
    const total = priority1.length + priority2.length + priority3.length
    const completed = confirmedRecommendations.value.size

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    }
  })

  // 计算属性：所有建议列表
  const allRecommendations = computed(() => {
    if (!reportData.value) return []
    const { priority1, priority2, priority3 } = reportData.value.recommendations
    return [
      ...priority1.map(r => ({ ...r, priority: 1 })),
      ...priority2.map(r => ({ ...r, priority: 2 })),
      ...priority3.map(r => ({ ...r, priority: 3 }))
    ]
  })

  // 方法：设置报告数据
  function setReportData(data: ReportData) {
    reportData.value = data
    generatedAt.value = data.generatedAt || new Date().toISOString()
    status.value = 'completed'
  }

  // 方法：设置 Markdown 内容
  function setMarkdownContent(content: string) {
    markdownContent.value = content
  }

  // 方法：追加 Markdown 内容 (流式输出)
  function appendMarkdownContent(chunk: string) {
    markdownContent.value += chunk
  }

  // 方法：设置状态
  function setStatus(newStatus: ReportStatus, error?: string) {
    status.value = newStatus
    if (error) {
      errorMessage.value = error
    }
  }

  // 方法：确认建议
  function confirmRecommendation(recommendationId: string) {
    confirmedRecommendations.value.add(recommendationId)
  }

  // 方法：取消确认建议
  function unconfirmRecommendation(recommendationId: string) {
    confirmedRecommendations.value.delete(recommendationId)
  }

  // 方法：检查建议是否已确认
  function isRecommendationConfirmed(recommendationId: string): boolean {
    return confirmedRecommendations.value.has(recommendationId)
  }

  // 方法：重置报告
  function resetReport() {
    reportData.value = null
    status.value = 'idle'
    errorMessage.value = ''
    markdownContent.value = ''
    generatedAt.value = ''
    confirmedRecommendations.value.clear()
  }

  // 方法：从 Markdown 解析报告结构 (简化版)
  function parseMarkdownToReport(markdown: string): Partial<ReportData> {
    // 这是一个简化的解析器，实际项目中可能需要更复杂的解析逻辑
    const sections = markdown.split(/(?=^#{1,2}\s)/m)

    let summary = ''
    const riskFactors: { shortTerm: RiskItem[], midTerm: RiskItem[] } = {
      shortTerm: [],
      midTerm: []
    }

    sections.forEach(section => {
      if (section.includes('报告总结') || section.includes('概述')) {
        summary = section.replace(/^#+\s*[^\n]+\n/, '').trim()
      }
      // 可以继续添加其他解析逻辑
    })

    return {
      summary,
      riskFactors
    }
  }

  return {
    // 状态
    reportData,
    status,
    errorMessage,
    markdownContent,
    generatedAt,
    confirmedRecommendations,
    // 计算属性
    hasReport,
    highRiskCount,
    recommendationProgress,
    allRecommendations,
    // 方法
    setReportData,
    setMarkdownContent,
    appendMarkdownContent,
    setStatus,
    confirmRecommendation,
    unconfirmRecommendation,
    isRecommendationConfirmed,
    resetReport,
    parseMarkdownToReport
  }
})

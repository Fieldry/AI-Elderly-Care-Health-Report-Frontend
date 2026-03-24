import type { ProfileRecord } from '@/utils/profile'

export interface NormalizedReportSection {
  title: string
  items: string[]
}

export interface ReportRecommendationPreviewItem {
  id: string
  priorityLabel: string
  title: string
  description: string
}

export interface NormalizedReport {
  generatedAt: string
  summary: string
  sections: NormalizedReportSection[]
  markdown: string
  rawJson: string
}

function asObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asTimestampString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }

  return ''
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function formatRiskItems(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const record = asObject(item)
      if (!record) {
        return ''
      }

      const name = asString(record.name)
      const description = asString(record.description)
      const timeframe = asString(record.timeframe)

      return [name, description, timeframe ? `时间范围：${timeframe}` : ''].filter(Boolean).join('，')
    })
    .filter(Boolean)
}

function formatRecommendationItems(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const record = asObject(item)
      if (!record) {
        return ''
      }

      const title = asString(record.title)
      const description = asString(record.description)
      return [title, description].filter(Boolean).join('：')
    })
    .filter(Boolean)
}

function resolvePayload(report: Record<string, unknown>) {
  const explicitPayload = asObject(report.report)
  if (explicitPayload) {
    return explicitPayload
  }

  const nestedPayload = asObject(report.report_data)
  if (nestedPayload) {
    return nestedPayload
  }

  const contentPayload = asObject(report.content)
  if (contentPayload) {
    const contentReport = asObject(contentPayload.report)
    if (contentReport) {
      return contentReport
    }

    const contentReportData = asObject(contentPayload.report_data)
    if (contentReportData) {
      return contentReportData
    }

    return contentPayload
  }

  return report
}

export function getReportId(report: Record<string, unknown> | null | undefined) {
  if (!report) {
    return ''
  }

  return (
    asString(report.reportId) ||
    asString(report.report_id) ||
    asString(report.id) ||
    asString(asObject(report.report)?.reportId) ||
    asString(asObject(report.report)?.report_id)
  )
}

export function getSequentialReportName(order: number, prefix = '历史报告') {
  const normalizedOrder = Number.isFinite(order) && order > 0 ? Math.floor(order) : 1
  return `${prefix} ${normalizedOrder}`
}

export function getReportGeneratedAt(report: Record<string, unknown> | null | undefined) {
  if (!report) {
    return ''
  }

  const payload = resolvePayload(report)
  const metadata = asObject(payload.metadata)

  return (
    asTimestampString(report.generated_at) ||
    asTimestampString(report.generatedAt) ||
    asTimestampString(report.created_at) ||
    asTimestampString(report.createdAt) ||
    asTimestampString(report.updated_at) ||
    asTimestampString(report.updatedAt) ||
    asTimestampString(report.report_time) ||
    asTimestampString(report.reportTime) ||
    asTimestampString(payload.generated_at) ||
    asTimestampString(payload.generatedAt) ||
    asTimestampString(payload.created_at) ||
    asTimestampString(payload.createdAt) ||
    asTimestampString(metadata?.generated_at) ||
    asTimestampString(metadata?.generatedAt) ||
    asTimestampString(metadata?.created_at) ||
    asTimestampString(metadata?.createdAt)
  )
}

export function normalizeReportRecord(report: Record<string, unknown> | null | undefined) {
  if (!report) {
    return null
  }

  const payload = resolvePayload(report)
  const reportId = getReportId(report)
  const generatedAt = getReportGeneratedAt(report)

  return {
    ...report,
    reportId: reportId || undefined,
    generated_at: generatedAt || undefined,
    generatedAt: generatedAt || undefined,
    report: payload
  }
}

export function getReportRecommendationPreview(
  report: Record<string, unknown> | null | undefined,
  limit = 4
) {
  const normalizedRecord = normalizeReportRecord(report)
  if (!normalizedRecord) {
    return [] as ReportRecommendationPreviewItem[]
  }

  const payload = resolvePayload(normalizedRecord)
  const recommendations = asObject(payload.recommendations)
  if (!recommendations) {
    return [] as ReportRecommendationPreviewItem[]
  }

  const priorityPairs = [
    ['priority1', '优先级一'],
    ['priority2', '优先级二'],
    ['priority3', '优先级三']
  ] as const

  const items: ReportRecommendationPreviewItem[] = []

  for (const [key, priorityLabel] of priorityPairs) {
    const recommendationItems = Array.isArray(recommendations[key]) ? recommendations[key] : []
    for (const item of recommendationItems) {
      const record = asObject(item)
      if (!record) {
        continue
      }

      const title = asString(record.title)
      const description = asString(record.description)
      if (!title && !description) {
        continue
      }

      items.push({
        id: asString(record.id) || `${key}-${items.length + 1}`,
        priorityLabel,
        title: title || description,
        description
      })
    }
  }

  return items.slice(0, Math.max(1, limit))
}

export function normalizeLatestReport(reports: Array<Record<string, unknown>> | null | undefined) {
  if (!reports || reports.length === 0) {
    return null
  }

  const latest =
    [...reports]
      .map((report) => normalizeReportRecord(report))
      .filter(Boolean)
      .sort((left, right) => {
        const leftTime = asString(left?.generated_at || left?.generatedAt)
        const rightTime = asString(right?.generated_at || right?.generatedAt)
        return rightTime.localeCompare(leftTime)
      })[0] || null

  if (!latest) {
    return null
  }

  const payload = resolvePayload(latest)
  const summary = asString(payload.summary)
  const markdown = asString(payload.markdown || payload.content)
  const rawJson = JSON.stringify(payload, null, 2)

  const sections: NormalizedReportSection[] = []
  const healthPortrait = asObject(payload.healthPortrait)
  if (healthPortrait) {
    const portraitItems = [
      asString(healthPortrait.functionalStatus),
      ...asStringArray(healthPortrait.strengths).map((item) => `优势：${item}`),
      ...asStringArray(healthPortrait.problems).map((item) => `关注点：${item}`)
    ].filter(Boolean)

    if (portraitItems.length > 0) {
      sections.push({
        title: '健康画像',
        items: portraitItems
      })
    }
  }

  const riskFactors = asObject(payload.riskFactors)
  if (riskFactors) {
    const riskItems = [
      ...formatRiskItems(riskFactors.shortTerm).map((item) => `近期：${item}`),
      ...formatRiskItems(riskFactors.midTerm).map((item) => `中期：${item}`)
    ]

    if (riskItems.length > 0) {
      sections.push({
        title: '风险因素',
        items: riskItems
      })
    }
  }

  const recommendations = asObject(payload.recommendations)
  if (recommendations) {
    const recommendationItems = [
      ...formatRecommendationItems(recommendations.priority1).map((item) => `优先级一：${item}`),
      ...formatRecommendationItems(recommendations.priority2).map((item) => `优先级二：${item}`),
      ...formatRecommendationItems(recommendations.priority3).map((item) => `优先级三：${item}`)
    ]

    if (recommendationItems.length > 0) {
      sections.push({
        title: '行动建议',
        items: recommendationItems
      })
    }
  }

  const warmMessage = asString(payload.warmMessage)
  if (warmMessage) {
    sections.push({
      title: '温馨寄语',
      items: [warmMessage]
    })
  }

  return {
    generatedAt: asString(latest.generated_at || latest.generatedAt),
    summary,
    sections,
    markdown,
    rawJson
  } satisfies NormalizedReport
}

export function mergeProfileSnapshots(...profiles: Array<ProfileRecord | null | undefined>) {
  return profiles.reduce<ProfileRecord>((merged, profile) => {
    if (!profile) {
      return merged
    }

    return {
      ...merged,
      ...profile
    }
  }, {})
}

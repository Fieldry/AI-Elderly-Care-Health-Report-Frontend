import type { ProfileRecord } from '@/utils/profile'

export interface NormalizedReportSection {
  title: string
  items: string[]
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

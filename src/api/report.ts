import { asArray, asRecord, buildAuthHeaders, buildJsonHeaders, consumeSse, getString, requestBlob, requestJson } from '@/api/core'
import type { ReportGenerateResponse } from '@/types'

interface ReportStreamAccumulator {
  content: string
  finalPayload: Record<string, unknown> | null
  chunkCount: number
}

function tryParseJson(rawValue: string) {
  if (!rawValue.trim()) {
    return null
  }

  try {
    return JSON.parse(rawValue) as unknown
  } catch {
    return null
  }
}

function resolveProfilePayload(profile: Record<string, unknown> | null | undefined) {
  return profile || {}
}

function appendChunk(currentValue: string, nextValue: string) {
  if (!nextValue) {
    return currentValue
  }

  if (!currentValue) {
    return nextValue
  }

  if (nextValue.startsWith(currentValue)) {
    return nextValue
  }

  return `${currentValue}${nextValue}`
}

function applyReportStreamPayload(
  accumulator: ReportStreamAccumulator,
  payload: unknown,
  rawData: string,
  onDelta?: (value: string) => void
) {
  const record = asRecord(payload)
  if (!record) {
    const textChunk = rawData.trim()
    if (!textChunk || textChunk === '[DONE]') {
      return
    }

    accumulator.content = appendChunk(accumulator.content, textChunk)
    accumulator.chunkCount += 1
    onDelta?.(textChunk)
    return
  }

  const dataRecord = asRecord(record.data)
  const textChunk =
    getString(record, 'delta', 'content', 'message', 'text', 'chunk') ||
    getString(dataRecord, 'delta', 'content', 'message', 'text', 'chunk')

  if (textChunk) {
    const nextContent = appendChunk(accumulator.content, textChunk)
    const delta = nextContent.startsWith(accumulator.content)
      ? nextContent.slice(accumulator.content.length)
      : textChunk
    accumulator.content = nextContent
    if (delta) {
      accumulator.chunkCount += 1
      onDelta?.(delta)
    }
  }

  const reportRecord =
    asRecord(record.report) ||
    asRecord(dataRecord?.report) ||
    (getString(record, 'reportId', 'report_id') ? record : null)

  if (reportRecord) {
    accumulator.finalPayload = reportRecord
  }
}

function normalizeGenerateResponse(value: unknown) {
  const record = asRecord(value) || {}
  const reportRecord = asRecord(record.report)

  return {
    reportId: getString(record, 'reportId', 'report_id') || undefined,
    sessionId: getString(record, 'sessionId', 'session_id') || undefined,
    report: reportRecord || undefined,
    reports: asArray<Record<string, unknown>>(record.reports).map((item) => asRecord(item) || {}).filter(Boolean)
  } satisfies ReportGenerateResponse
}

export async function generateReport(
  sessionId: string,
  profile: Record<string, unknown>,
  token: string
): Promise<ReportGenerateResponse> {
  const response = await requestJson<unknown>('/report/generate', {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify({
      sessionId,
      profile: resolveProfilePayload(profile)
    })
  })

  return normalizeGenerateResponse(response)
}

export async function streamGenerateReport(
  sessionId: string,
  profile: Record<string, unknown>,
  token: string,
  onDelta?: (value: string) => void
): Promise<ReportGenerateResponse> {
  const accumulator: ReportStreamAccumulator = {
    content: '',
    finalPayload: null,
    chunkCount: 0
  }

  await consumeSse(
    '/report/stream',
    {
      method: 'POST',
      headers: buildJsonHeaders(buildAuthHeaders(token)),
      body: JSON.stringify({
        sessionId,
        profile: resolveProfilePayload(profile)
      })
    },
    (event) => {
      const parsedPayload = tryParseJson(event.data)
      applyReportStreamPayload(accumulator, parsedPayload, event.data, onDelta)
    }
  )

  if (!accumulator.chunkCount && !accumulator.finalPayload) {
    throw new Error('流式报告没有返回可用内容。')
  }

  const report = accumulator.finalPayload || (accumulator.content ? { markdown: accumulator.content } : null)
  return {
    reportId: getString(accumulator.finalPayload, 'reportId', 'report_id') || undefined,
    report: report || undefined
  } satisfies ReportGenerateResponse
}

export async function generateReportForElderly(elderlyId: string, token: string): Promise<ReportGenerateResponse> {
  const response = await requestJson<unknown>(`/report/generate/${elderlyId}`, {
    method: 'POST',
    headers: buildAuthHeaders(token)
  })
  return normalizeGenerateResponse(response)
}

export async function getReportDetail(reportId: string, token: string) {
  const response = await requestJson<unknown>(`/report/${reportId}`, {
    headers: buildAuthHeaders(token)
  })
  return asRecord(response) || {}
}

export function exportReportPdf(reportId: string, token: string) {
  return requestBlob(`/report/${reportId}/export/pdf`, {
    headers: buildAuthHeaders(token)
  })
}

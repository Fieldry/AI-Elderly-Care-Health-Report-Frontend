import { asArray, asRecord, buildAuthHeaders, requestJson } from '@/api/core'

export async function getElderlyProfile(token: string) {
  const response = await requestJson<unknown>('/elderly/me/profile', {
    headers: buildAuthHeaders(token)
  })
  return asRecord(response) || {}
}

export async function getElderlyReports(token: string) {
  const response = await requestJson<unknown>('/elderly/me/reports', {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response)
  const source = record?.data ?? record?.reports ?? response
  return asArray<Record<string, unknown>>(source).map((item) => asRecord(item) || {}).filter(Boolean)
}

export async function getElderlyReportDetail(reportId: string, token: string) {
  const response = await requestJson<unknown>(`/elderly/me/reports/${reportId}`, {
    headers: buildAuthHeaders(token)
  })
  return asRecord(response) || {}
}

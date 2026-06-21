import { asArray, asRecord, buildAuthHeaders, requestJson } from '@/api/core'

function normalizeBindCodeFromRecord(record: Record<string, unknown> | null | undefined): string {
  if (!record) {
    return ''
  }

  const candidates = [
    record.bindCode,
    record.bind_code,
    record.bindingCode,
    record.binding_code,
    record.elderBindCode,
    record.elder_bind_code,
    record.elderlyBindCode,
    record.elderly_bind_code,
    record.inviteCode,
    record.invite_code
  ]

  const matched = candidates.find((value) => typeof value === 'string' || typeof value === 'number')
  return matched === undefined || matched === null ? '' : String(matched).trim()
}

export async function getElderlyProfile(token: string) {
  const response = await requestJson<unknown>('/elderly/me/profile', {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response) || {}
  const dataRecord = asRecord(record.data)
  const nestedProfile = asRecord(record.profile) || asRecord(dataRecord?.profile)
  const bindCode =
    normalizeBindCodeFromRecord(record) ||
    normalizeBindCodeFromRecord(nestedProfile) ||
    normalizeBindCodeFromRecord(dataRecord)

  return {
    ...record,
    bindCode: bindCode || undefined,
    bind_code: bindCode || undefined,
    profile: nestedProfile || asRecord(record.profile) || record.profile || {}
  }
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

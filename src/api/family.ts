import { buildJsonHeaders, requestJson } from '@/api/core'
import type { FamilyElderlyDetail, FamilyElderlySummary, FamilyReportsResponse } from '@/types'

function buildAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  }
}

export async function listFamilyElderly(token: string) {
  const response = await requestJson<{ data: FamilyElderlySummary[] }>('/family/elderly-list', {
    headers: buildAuthHeaders(token)
  })

  return response.data || []
}

export function getFamilyElderly(elderlyId: string, token: string) {
  return requestJson<FamilyElderlyDetail>(`/family/elderly/${elderlyId}`, {
    headers: buildAuthHeaders(token)
  })
}

export function updateFamilyElderly(elderlyId: string, token: string, payload: Record<string, unknown>) {
  return requestJson<{ success: boolean }>(`/family/elderly/${elderlyId}`, {
    method: 'PUT',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify(payload)
  })
}

export async function getFamilyReports(elderlyId: string, token: string) {
  const response = await requestJson<FamilyReportsResponse>(`/family/reports/${elderlyId}`, {
    headers: buildAuthHeaders(token)
  })

  return response.data || []
}

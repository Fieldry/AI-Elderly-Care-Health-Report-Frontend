import {
  asArray,
  asRecord,
  buildAuthHeaders,
  buildJsonHeaders,
  getNumber,
  getString,
  requestJson
} from '@/api/core'
import type {
  DoctorElderlyDetail,
  DoctorElderlySummary,
  DoctorFollowup,
  DoctorFollowupCreatePayload,
  DoctorManagementState,
  DoctorManagementUpdatePayload,
  DoctorOverview,
  SessionMetadata
} from '@/types'

function optionalString(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  const value = getString(record, ...keys)
  return value || undefined
}

function nullableString(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  const value = getString(record, ...keys)
  return value || null
}

function normalizeSessionMetadata(value: unknown): SessionMetadata | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const sessionId = getString(record, 'session_id', 'sessionId')
  const createdAt = getString(record, 'created_at', 'createdAt')
  if (!sessionId || !createdAt) {
    return null
  }

  return {
    session_id: sessionId,
    sessionId,
    user_id: optionalString(record, 'user_id', 'userId'),
    userId: optionalString(record, 'user_id', 'userId'),
    created_at: createdAt,
    createdAt,
    status: optionalString(record, 'status'),
    title: optionalString(record, 'title'),
    has_report: Boolean(record.has_report ?? record.hasReport),
    hasReport: Boolean(record.has_report ?? record.hasReport),
    has_profile: Boolean(record.has_profile ?? record.hasProfile),
    hasProfile: Boolean(record.has_profile ?? record.hasProfile),
    files: asArray<string>(record.files).filter((item) => typeof item === 'string')
  }
}

function normalizeDoctorManagementState(value: unknown): DoctorManagementState {
  const record = asRecord(value) || {}

  return {
    elderly_user_id: optionalString(record, 'elderly_user_id'),
    doctor_id: optionalString(record, 'doctor_id'),
    is_key_case: Boolean(record.is_key_case),
    management_status: getString(record, 'management_status') || 'normal',
    contacted_family: Boolean(record.contacted_family),
    arranged_revisit: Boolean(record.arranged_revisit),
    referred: Boolean(record.referred),
    next_followup_at: nullableString(record, 'next_followup_at'),
    last_followup_at: nullableString(record, 'last_followup_at'),
    last_followup_type: nullableString(record, 'last_followup_type'),
    updated_by: nullableString(record, 'updated_by'),
    updated_at: nullableString(record, 'updated_at')
  }
}

function normalizeDoctorFollowup(value: unknown): DoctorFollowup | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const followupId = getString(record, 'followup_id', 'followupId')
  const elderlyId = getString(record, 'elderly_user_id', 'elderlyUserId')
  const visitType = getString(record, 'visit_type', 'visitType')
  const findings = getString(record, 'findings')
  const createdAt = getString(record, 'created_at', 'createdAt')
  const updatedAt = getString(record, 'updated_at', 'updatedAt')

  if (!followupId || !elderlyId || !visitType || !findings || !createdAt || !updatedAt) {
    return null
  }

  return {
    followup_id: followupId,
    elderly_user_id: elderlyId,
    doctor_id: getString(record, 'doctor_id', 'doctorId'),
    visit_type: visitType,
    findings,
    recommendations: asArray<string>(record.recommendations).filter((item) => typeof item === 'string'),
    contacted_family: Boolean(record.contacted_family),
    arranged_revisit: Boolean(record.arranged_revisit),
    referred: Boolean(record.referred),
    next_followup_at: nullableString(record, 'next_followup_at'),
    notes: getString(record, 'notes'),
    created_at: createdAt,
    updated_at: updatedAt
  }
}

function normalizeDoctorOverview(value: unknown): DoctorOverview | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const ageValue = getNumber(record, 'age')
  const age = ageValue ?? (typeof record.age === 'string' ? record.age : null)

  return {
    elderly_id: optionalString(record, 'elderly_id'),
    age,
    sex: nullableString(record, 'sex'),
    residence: nullableString(record, 'residence'),
    living_arrangement: nullableString(record, 'living_arrangement'),
    marital_status: nullableString(record, 'marital_status'),
    chronic_conditions: asArray<string>(record.chronic_conditions).filter((item) => typeof item === 'string'),
    chronic_summary: getString(record, 'chronic_summary') || '暂无明确慢病记录',
    current_risk_level: getString(record, 'current_risk_level') || 'unknown',
    functional_status_level: getString(record, 'functional_status_level') || 'unknown',
    functional_status_text: getString(record, 'functional_status_text') || '暂无功能状态描述',
    risk_tags: asArray<string>(record.risk_tags).filter((item) => typeof item === 'string'),
    recent_change: getString(record, 'recent_change') || '暂无近期变化',
    last_assessment_at: nullableString(record, 'last_assessment_at'),
    main_problems: asArray<string>(record.main_problems).filter((item) => typeof item === 'string'),
    high_risk_reasons: asArray<string>(record.high_risk_reasons).filter((item) => typeof item === 'string'),
    summary: getString(record, 'summary') || '暂无报告总结',
    recommended_actions: asArray<string>(record.recommended_actions).filter((item) => typeof item === 'string'),
    latest_report_review: asRecord(record.latest_report_review),
    doctor_management: record.doctor_management ? normalizeDoctorManagementState(record.doctor_management) : null,
    latest_followup: normalizeDoctorFollowup(record.latest_followup)
  }
}

function normalizeDoctorElderlySummary(value: unknown): DoctorElderlySummary | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const elderlyId = getString(record, 'elderly_id', 'elderlyId')
  if (!elderlyId) {
    return null
  }

  return {
    elderly_id: elderlyId,
    elderlyId,
    name: getString(record, 'name') || `老人-${elderlyId.slice(0, 8)}`,
    created_at: getString(record, 'created_at'),
    updated_at: getString(record, 'updated_at'),
    has_profile: Boolean(record.has_profile),
    has_report: Boolean(record.has_report),
    session_count: getNumber(record, 'session_count') ?? 0,
    report_count: getNumber(record, 'report_count') ?? 0,
    latest_session_id: optionalString(record, 'latest_session_id'),
    latest_report_id: optionalString(record, 'latest_report_id'),
    overview: normalizeDoctorOverview(record.overview),
    management: normalizeDoctorManagementState(record.management),
    latest_followup: normalizeDoctorFollowup(record.latest_followup)
  }
}

function normalizeDoctorElderlyDetail(value: unknown): DoctorElderlyDetail {
  const record = asRecord(value) || {}
  const elderlyId = getString(record, 'elderly_id', 'elderlyId')

  return {
    elderly_id: elderlyId,
    elderlyId: elderlyId || undefined,
    name: getString(record, 'name') || (elderlyId ? `老人-${elderlyId.slice(0, 8)}` : '未命名老人'),
    created_at: getString(record, 'created_at'),
    updated_at: getString(record, 'updated_at'),
    profile: asRecord(record.profile) || {},
    sessions: asArray(record.sessions).map(normalizeSessionMetadata).filter(Boolean) as SessionMetadata[],
    reports: asArray<Record<string, unknown>>(record.reports).map((item) => asRecord(item) || {}).filter(Boolean),
    overview: normalizeDoctorOverview(record.overview),
    management: normalizeDoctorManagementState(record.management),
    followups: asArray(record.followups).map(normalizeDoctorFollowup).filter(Boolean) as DoctorFollowup[]
  }
}

export async function listDoctorElderly(token: string) {
  const response = await requestJson<unknown>('/doctor/elderly-list', {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response)
  const source = record?.data ?? response
  return asArray(source).map(normalizeDoctorElderlySummary).filter(Boolean) as DoctorElderlySummary[]
}

export async function getDoctorElderlyDetail(elderlyId: string, token: string) {
  const response = await requestJson<unknown>(`/doctor/elderly/${elderlyId}`, {
    headers: buildAuthHeaders(token)
  })
  return normalizeDoctorElderlyDetail(response)
}

export async function getDoctorFollowups(elderlyId: string, token: string) {
  const response = await requestJson<unknown>(`/doctor/elderly/${elderlyId}/followups`, {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response)
  const source = record?.data ?? response
  return asArray(source).map(normalizeDoctorFollowup).filter(Boolean) as DoctorFollowup[]
}

export async function createDoctorFollowup(elderlyId: string, token: string, payload: DoctorFollowupCreatePayload) {
  const response = await requestJson<unknown>(`/doctor/elderly/${elderlyId}/followups`, {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify(payload)
  })
  return normalizeDoctorFollowup(response)
}

export async function updateDoctorManagement(
  elderlyId: string,
  token: string,
  payload: DoctorManagementUpdatePayload
) {
  const response = await requestJson<unknown>(`/doctor/elderly/${elderlyId}/management`, {
    method: 'PATCH',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify(payload)
  })
  return normalizeDoctorManagementState(response)
}

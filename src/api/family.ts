import { asArray, asRecord, buildAuthHeaders, buildJsonHeaders, getNumber, getString, requestJson } from '@/api/core'
import type { ChatMessage, FamilyElderlyDetail, FamilyElderlySummary, FamilySessionState } from '@/types'

function normalizeFamilyElderlySummary(value: unknown): FamilyElderlySummary | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const elderlyId = getString(record, 'elderly_id', 'elderlyId', 'id')
  if (!elderlyId) {
    return null
  }

  const completionRate = getNumber(record, 'completion_rate', 'completionRate') ?? 0
  const createdAt = getString(record, 'created_at', 'createdAt')

  return {
    elderly_id: elderlyId,
    elderlyId,
    name: getString(record, 'name') || '未命名老人',
    relation: getString(record, 'relation') || '家庭成员',
    completion_rate: completionRate,
    completionRate,
    created_at: createdAt,
    createdAt
  }
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const content = getString(record, 'content', 'message', 'text')
  if (!content) {
    return null
  }

  const roleValue = getString(record, 'role', 'speaker')
  return {
    role: roleValue === 'assistant' || roleValue === 'system' ? roleValue : 'user',
    content,
    timestamp: getString(record, 'timestamp', 'created_at', 'createdAt') || undefined
  }
}

function normalizeFamilySessionState(value: unknown) {
  const record = asRecord(value) || {}
  const dataRecord = asRecord(record.data) || record
  const sessionId =
    getString(dataRecord, 'sessionId', 'session_id') || getString(record, 'sessionId', 'session_id')
  const elderlyId =
    getString(dataRecord, 'elderlyId', 'elderly_id') || getString(record, 'elderlyId', 'elderly_id')
  const greeting = getString(record, 'greeting') || getString(dataRecord, 'greeting') || undefined
  const reply = getString(record, 'reply') || getString(dataRecord, 'reply') || undefined
  const message =
    reply ||
    greeting ||
    getString(record, 'message') ||
    getString(dataRecord, 'message') ||
    undefined

  return {
    sessionId,
    session_id: sessionId || undefined,
    elderlyId: elderlyId || undefined,
    elderly_id: elderlyId || undefined,
    greeting,
    reply,
    message,
    state: getString(record, 'state') || getString(dataRecord, 'state') || undefined,
    progress: getNumber(record, 'progress') ?? getNumber(dataRecord, 'progress') ?? undefined,
    completed:
      typeof record.completed === 'boolean'
        ? record.completed
        : typeof dataRecord.completed === 'boolean'
          ? dataRecord.completed
          : undefined,
    conversation: asArray(record.conversation ?? record.history ?? dataRecord.conversation ?? dataRecord.history)
      .map(normalizeChatMessage)
      .filter(Boolean) as ChatMessage[],
    collectedFields: asArray<string>(record.collected_fields ?? record.collectedFields ?? dataRecord.collected_fields ?? dataRecord.collectedFields).filter(
      (item) => typeof item === 'string'
    ),
    missingFields: asArray<string>(record.missing_fields ?? record.missingFields ?? dataRecord.missing_fields ?? dataRecord.missingFields).filter(
      (item) => typeof item === 'string'
    ),
    profile: asRecord(record.profile ?? dataRecord.profile),
    reports: asArray<Record<string, unknown>>(record.reports ?? dataRecord.reports)
      .map((item) => asRecord(item) || {})
      .filter(Boolean)
  } satisfies FamilySessionState
}

export async function listFamilyElderly(token: string) {
  const response = await requestJson<unknown>('/family/elderly-list', {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response)
  const source = record?.data ?? record?.elderly_list ?? record?.items ?? response

  return asArray(source).map(normalizeFamilyElderlySummary).filter(Boolean) as FamilyElderlySummary[]
}

export async function getFamilyElderly(elderlyId: string, token: string) {
  const response = await requestJson<unknown>(`/family/elderly/${elderlyId}`, {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response) || {}
  const nestedProfile = asRecord(record.profile ?? asRecord(record.data)?.profile)

  return {
    elderly_id: getString(record, 'elderly_id', 'elderlyId') || elderlyId,
    elderlyId: getString(record, 'elderly_id', 'elderlyId') || elderlyId,
    profile: nestedProfile || {}
  } satisfies FamilyElderlyDetail
}

export function updateFamilyElderly(elderlyId: string, token: string, payload: Record<string, unknown>) {
  return requestJson<{ success: boolean }>(`/family/elderly/${elderlyId}`, {
    method: 'PUT',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify(payload)
  })
}

export async function getFamilyReports(elderlyId: string, token: string) {
  const response = await requestJson<unknown>(`/family/reports/${elderlyId}`, {
    headers: buildAuthHeaders(token)
  })
  const record = asRecord(response)
  const source = record?.data ?? record?.reports ?? response
  return asArray<Record<string, unknown>>(source).map((item) => asRecord(item) || {}).filter(Boolean)
}

export async function startFamilySession(elderlyId: string, token: string) {
  const response = await requestJson<unknown>(`/family/session/start/${elderlyId}`, {
    method: 'POST',
    headers: buildAuthHeaders(token)
  })

  return normalizeFamilySessionState(response)
}

export async function sendFamilySessionMessage(sessionId: string, token: string, message: string) {
  const response = await requestJson<unknown>(`/family/session/${sessionId}/message`, {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify({
      content: message
    })
  })

  return normalizeFamilySessionState(response)
}

export async function getFamilySessionInfo(sessionId: string, token: string) {
  const response = await requestJson<unknown>(`/family/session/${sessionId}/info`, {
    headers: buildAuthHeaders(token)
  })
  return normalizeFamilySessionState(response)
}

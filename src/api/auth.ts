import { buildAuthHeaders, buildJsonHeaders, requestJson } from '@/api/core'
import type { AuthResponse, FamilyBindPayload, FamilyRegisterPayload, Role } from '@/types'

export function loginWithPassword(phone: string, password: string, role: Extract<Role, 'family' | 'doctor'> = 'family') {
  return requestJson<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ phone, password, role })
  })
}

export function registerFamilyAccount(payload: FamilyRegisterPayload) {
  return requestJson<AuthResponse>('/auth/family/register', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify(payload)
  })
}

export function bindFamilyElderly(token: string, payload: FamilyBindPayload) {
  return requestJson<{ success?: boolean; elderly_ids?: string[] }>('/auth/family/bind', {
    method: 'POST',
    headers: buildJsonHeaders(buildAuthHeaders(token)),
    body: JSON.stringify(payload)
  })
}

export async function logoutWithToken(token?: string) {
  try {
    await requestJson<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      headers: buildAuthHeaders(token)
    })
  } catch {
    // The backend logout endpoint is non-critical in the current demo flow.
  }
}

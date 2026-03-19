import { buildJsonHeaders, requestJson } from '@/api/core'
import type { AuthResponse } from '@/types'

export function loginWithPassword(phone: string, password: string) {
  return requestJson<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ phone, password })
  })
}

export async function logoutWithToken(token?: string) {
  try {
    await requestJson<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
  } catch {
    // The backend logout endpoint is non-critical in the current demo flow.
  }
}

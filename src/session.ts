import { computed, reactive } from 'vue'

import type { AuthSession, Role } from '@/types'

const STORAGE_KEY = 'ai-elderly-care.session'

function readSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

const state = reactive({
  session: readSession()
})

export function getStoredSession() {
  return state.session
}

export function setStoredSession(nextSession: AuthSession) {
  state.session = nextSession
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession))
  }
}

export function clearStoredSession() {
  state.session = null
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

export function roleHomePath(role: Role) {
  if (role === 'elderly') {
    return '/elderly/assessment'
  }
  if (role === 'family') {
    return '/family/hub'
  }
  return '/doctor/hub'
}

export function useAuthSession() {
  const session = computed(() => state.session)
  const isLoggedIn = computed(() => !!state.session)

  return {
    session,
    isLoggedIn
  }
}

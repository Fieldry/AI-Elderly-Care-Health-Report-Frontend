import { computed, reactive } from 'vue'

import type { AuthSession, FamilyAuthSession, Role } from '@/types'

const STORAGE_KEY = 'ai-elderly-care.session'
const FAMILY_SESSION_MAP_KEY = 'ai-elderly-care.family-session-map'

function isRole(value: unknown): value is Role {
  return value === 'elderly' || value === 'family' || value === 'doctor'
}

function normalizeSession(raw: unknown): AuthSession | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as Record<string, unknown>
  if (!isRole(record.role) || typeof record.userName !== 'string') {
    return null
  }

  const token = typeof record.token === 'string' ? record.token : ''
  const backendRole = typeof record.backendRole === 'string' ? record.backendRole : undefined
  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : undefined

  if (record.role === 'elderly') {
    const userId = typeof record.userId === 'string' ? record.userId : ''
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
    if (!token || !userId || !sessionId) {
      return null
    }

    return {
      token,
      userName: record.userName,
      role: 'elderly',
      backendRole,
      expiresAt,
      userId,
      sessionId,
      userType: typeof record.userType === 'string' ? record.userType : undefined
    }
  }

  if (record.role === 'family') {
    if (!token) {
      return null
    }

    const elderlyIds = Array.isArray(record.elderlyIds)
      ? record.elderlyIds.filter((item): item is string => typeof item === 'string')
      : []

    return {
      token,
      userName: record.userName,
      role: 'family',
      backendRole,
      expiresAt,
      familyId: typeof record.familyId === 'string' ? record.familyId : undefined,
      elderlyIds
    }
  }

  if (!token) {
    return null
  }

  return {
    token,
    userName: record.userName,
    role: 'doctor',
    backendRole,
    expiresAt
  }
}

function readFamilySessionMap() {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>
  }

  const raw = window.localStorage.getItem(FAMILY_SESSION_MAP_KEY)
  if (!raw) {
    return {} as Record<string, string>
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  } catch {
    window.localStorage.removeItem(FAMILY_SESSION_MAP_KEY)
    return {} as Record<string, string>
  }
}

function writeFamilySessionMap(nextMap: Record<string, string>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FAMILY_SESSION_MAP_KEY, JSON.stringify(nextMap))
}

function readSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return normalizeSession(JSON.parse(raw))
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

const state = reactive({
  session: readSession(),
  familySessionMap: readFamilySessionMap()
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

export function isFamilySession(session: AuthSession | null): session is FamilyAuthSession {
  return session?.role === 'family'
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

export function setStoredElderlySessionSessionId(sessionId: string) {
  const currentSession = state.session
  if (!currentSession || currentSession.role !== 'elderly') {
    return
  }

  const nextSession = {
    ...currentSession,
    sessionId
  } satisfies AuthSession

  setStoredSession(nextSession)
}

export function getStoredFamilyConversationSessionId(elderlyId: string) {
  return state.familySessionMap[elderlyId] || ''
}

export function setStoredFamilyConversationSessionId(elderlyId: string, sessionId: string) {
  state.familySessionMap = {
    ...state.familySessionMap,
    [elderlyId]: sessionId
  }
  writeFamilySessionMap(state.familySessionMap)
}

export function clearStoredFamilyConversationSessionId(elderlyId: string) {
  if (!state.familySessionMap[elderlyId]) {
    return
  }

  const nextMap = { ...state.familySessionMap }
  delete nextMap[elderlyId]
  state.familySessionMap = nextMap
  writeFamilySessionMap(nextMap)
}

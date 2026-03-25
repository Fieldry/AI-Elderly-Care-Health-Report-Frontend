import { computed, reactive } from 'vue'

import type {
  AuthSession,
  ChatInteraction,
  ChatMessage,
  ElderlyAuthSession,
  FamilyAuthSession,
  Role,
  SessionMetadata
} from '@/types'

const STORAGE_KEY = 'ai-elderly-care.session'
const LAST_ELDERLY_SESSION_KEY = 'ai-elderly-care.last-elderly-session'
const ELDERLY_SESSION_SNAPSHOT_KEY = 'ai-elderly-care.elderly-session-snapshots'
const ELDERLY_COUNSELING_SESSION_MAP_KEY = 'ai-elderly-care.elderly-counseling-session-map'
const FAMILY_SESSION_MAP_KEY = 'ai-elderly-care.family-session-map'
const FAMILY_CONVERSATION_SNAPSHOT_KEY = 'ai-elderly-care.family-conversation-snapshots'

interface ElderlySessionSnapshot {
  sessionId: string
  userId: string
  metadata: SessionMetadata
  messages: ChatMessage[]
  profile?: Record<string, unknown>
  reports?: Array<Record<string, unknown>>
  conversationState?: string
  completionPercent?: number | null
  currentInteraction?: ChatInteraction | null
}

interface FamilyConversationSnapshot {
  sessionId: string
  messages: ChatMessage[]
  state?: string
  collectedFields?: string[]
  missingFields?: string[]
}

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

function readElderlyCounselingSessionMap() {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>
  }

  const raw = window.localStorage.getItem(ELDERLY_COUNSELING_SESSION_MAP_KEY)
  if (!raw) {
    return {} as Record<string, string>
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  } catch {
    window.localStorage.removeItem(ELDERLY_COUNSELING_SESSION_MAP_KEY)
    return {} as Record<string, string>
  }
}

function writeElderlyCounselingSessionMap(nextMap: Record<string, string>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ELDERLY_COUNSELING_SESSION_MAP_KEY, JSON.stringify(nextMap))
}

function normalizeSessionMetadata(raw: unknown): SessionMetadata | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as Record<string, unknown>
  const sessionId = typeof record.session_id === 'string'
    ? record.session_id
    : typeof record.sessionId === 'string'
      ? record.sessionId
      : ''
  const createdAt = typeof record.created_at === 'string'
    ? record.created_at
    : typeof record.createdAt === 'string'
      ? record.createdAt
      : ''

  if (!sessionId || !createdAt) {
    return null
  }

  const files = Array.isArray(record.files)
    ? record.files.filter((item): item is string => typeof item === 'string')
    : []

  return {
    session_id: sessionId,
    sessionId,
    user_id: typeof record.user_id === 'string' ? record.user_id : typeof record.userId === 'string' ? record.userId : undefined,
    userId: typeof record.user_id === 'string' ? record.user_id : typeof record.userId === 'string' ? record.userId : undefined,
    created_at: createdAt,
    createdAt,
    status: typeof record.status === 'string' ? record.status : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    has_report: Boolean(record.has_report ?? record.hasReport),
    hasReport: Boolean(record.has_report ?? record.hasReport),
    has_profile: Boolean(record.has_profile ?? record.hasProfile),
    hasProfile: Boolean(record.has_profile ?? record.hasProfile),
    files
  }
}

function normalizeChatMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as Record<string, unknown>
  const content = typeof record.content === 'string' ? record.content : ''
  if (!content.trim()) {
    return null
  }

  const role = record.role === 'assistant' || record.role === 'system' ? record.role : 'user'
  return {
    role,
    content,
    timestamp: typeof record.timestamp === 'string' ? record.timestamp : undefined
  }
}

function normalizeRecord(raw: unknown) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function normalizeRecordArray(raw: unknown) {
  return Array.isArray(raw)
    ? raw.map((item) => normalizeRecord(item)).filter(Boolean) as Array<Record<string, unknown>>
    : []
}

function normalizeElderlySessionSnapshot(raw: unknown): ElderlySessionSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as Record<string, unknown>
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
  const userId = typeof record.userId === 'string' ? record.userId : ''
  const metadata = normalizeSessionMetadata(record.metadata)

  if (!sessionId || !userId || !metadata) {
    return null
  }

  return {
    sessionId,
    userId,
    metadata,
    messages: Array.isArray(record.messages)
      ? record.messages.map(normalizeChatMessage).filter(Boolean) as ChatMessage[]
      : [],
    profile: normalizeRecord(record.profile) || undefined,
    reports: normalizeRecordArray(record.reports),
    conversationState: typeof record.conversationState === 'string' ? record.conversationState : undefined,
    completionPercent:
      typeof record.completionPercent === 'number'
        ? record.completionPercent
        : record.completionPercent === null
          ? null
          : undefined,
    currentInteraction: normalizeRecord(record.currentInteraction) as ChatInteraction | null | undefined
  }
}

function readLastElderlySession() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(LAST_ELDERLY_SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = normalizeSession(JSON.parse(raw))
    return parsed?.role === 'elderly' ? parsed : null
  } catch {
    window.localStorage.removeItem(LAST_ELDERLY_SESSION_KEY)
    return null
  }
}

function writeLastElderlySession(session: ElderlyAuthSession | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!session) {
    window.localStorage.removeItem(LAST_ELDERLY_SESSION_KEY)
    return
  }

  window.localStorage.setItem(LAST_ELDERLY_SESSION_KEY, JSON.stringify(session))
}

function readElderlySessionSnapshots() {
  if (typeof window === 'undefined') {
    return {} as Record<string, ElderlySessionSnapshot>
  }

  const raw = window.localStorage.getItem(ELDERLY_SESSION_SNAPSHOT_KEY)
  if (!raw) {
    return {} as Record<string, ElderlySessionSnapshot>
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([sessionId, snapshot]) => [sessionId, normalizeElderlySessionSnapshot(snapshot)] as const)
        .filter((entry): entry is [string, ElderlySessionSnapshot] => !!entry[1])
    )
  } catch {
    window.localStorage.removeItem(ELDERLY_SESSION_SNAPSHOT_KEY)
    return {} as Record<string, ElderlySessionSnapshot>
  }
}

function writeElderlySessionSnapshots(nextSnapshots: Record<string, ElderlySessionSnapshot>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ELDERLY_SESSION_SNAPSHOT_KEY, JSON.stringify(nextSnapshots))
}

function normalizeFamilyConversationSnapshot(raw: unknown): FamilyConversationSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as Record<string, unknown>
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
  if (!sessionId) {
    return null
  }

  return {
    sessionId,
    messages: Array.isArray(record.messages)
      ? record.messages.map(normalizeChatMessage).filter(Boolean) as ChatMessage[]
      : [],
    state: typeof record.state === 'string' ? record.state : undefined,
    collectedFields: Array.isArray(record.collectedFields)
      ? record.collectedFields.filter((item): item is string => typeof item === 'string')
      : [],
    missingFields: Array.isArray(record.missingFields)
      ? record.missingFields.filter((item): item is string => typeof item === 'string')
      : []
  }
}

function readFamilyConversationSnapshots() {
  if (typeof window === 'undefined') {
    return {} as Record<string, FamilyConversationSnapshot>
  }

  const raw = window.localStorage.getItem(FAMILY_CONVERSATION_SNAPSHOT_KEY)
  if (!raw) {
    return {} as Record<string, FamilyConversationSnapshot>
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([elderlyId, snapshot]) => [elderlyId, normalizeFamilyConversationSnapshot(snapshot)] as const)
        .filter((entry): entry is [string, FamilyConversationSnapshot] => !!entry[1])
    )
  } catch {
    window.localStorage.removeItem(FAMILY_CONVERSATION_SNAPSHOT_KEY)
    return {} as Record<string, FamilyConversationSnapshot>
  }
}

function writeFamilyConversationSnapshots(nextSnapshots: Record<string, FamilyConversationSnapshot>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FAMILY_CONVERSATION_SNAPSHOT_KEY, JSON.stringify(nextSnapshots))
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
  lastElderlySession: readLastElderlySession(),
  elderlySessionSnapshots: readElderlySessionSnapshots(),
  elderlyCounselingSessionMap: readElderlyCounselingSessionMap(),
  familySessionMap: readFamilySessionMap(),
  familyConversationSnapshots: readFamilyConversationSnapshots()
})

export function getStoredSession() {
  return state.session
}

export function setStoredSession(nextSession: AuthSession) {
  state.session = nextSession
  if (nextSession.role === 'elderly') {
    state.lastElderlySession = nextSession
    writeLastElderlySession(nextSession)
  }
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

export function getStoredElderlySession() {
  return state.lastElderlySession
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
  if (state.session?.role === 'elderly') {
    const nextSession = {
      ...state.session,
      sessionId
    } satisfies AuthSession

    setStoredSession(nextSession)
  }

  if (state.lastElderlySession) {
    state.lastElderlySession = {
      ...state.lastElderlySession,
      sessionId
    }
    writeLastElderlySession(state.lastElderlySession)
  }
}

export function getStoredElderlySessionSnapshots(userId?: string) {
  const snapshots = Object.values(state.elderlySessionSnapshots)
  if (!userId) {
    return snapshots
  }

  return snapshots.filter((snapshot) => snapshot.userId === userId)
}

export function getStoredElderlySessionSnapshot(sessionId: string) {
  return state.elderlySessionSnapshots[sessionId] || null
}

export function setStoredElderlySessionSnapshot(snapshot: ElderlySessionSnapshot) {
  state.elderlySessionSnapshots = {
    ...state.elderlySessionSnapshots,
    [snapshot.sessionId]: snapshot
  }
  writeElderlySessionSnapshots(state.elderlySessionSnapshots)
}

export function clearStoredElderlySessionSnapshot(sessionId: string) {
  if (!state.elderlySessionSnapshots[sessionId]) {
    return
  }

  const nextSnapshots = { ...state.elderlySessionSnapshots }
  delete nextSnapshots[sessionId]
  state.elderlySessionSnapshots = nextSnapshots
  writeElderlySessionSnapshots(nextSnapshots)
}

export function getStoredFamilyConversationSessionId(elderlyId: string) {
  return state.familySessionMap[elderlyId] || ''
}

export function getStoredElderlyCounselingSessionId(userId: string) {
  return state.elderlyCounselingSessionMap[userId] || ''
}

export function setStoredElderlyCounselingSessionId(userId: string, sessionId: string) {
  state.elderlyCounselingSessionMap = {
    ...state.elderlyCounselingSessionMap,
    [userId]: sessionId
  }
  writeElderlyCounselingSessionMap(state.elderlyCounselingSessionMap)
}

export function clearStoredElderlyCounselingSessionId(userId: string) {
  if (!state.elderlyCounselingSessionMap[userId]) {
    return
  }

  const nextMap = { ...state.elderlyCounselingSessionMap }
  delete nextMap[userId]
  state.elderlyCounselingSessionMap = nextMap
  writeElderlyCounselingSessionMap(nextMap)
}

export function getStoredFamilyConversationSnapshot(elderlyId: string) {
  return state.familyConversationSnapshots[elderlyId] || null
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
    clearStoredFamilyConversationSnapshot(elderlyId)
    return
  }

  const nextMap = { ...state.familySessionMap }
  delete nextMap[elderlyId]
  state.familySessionMap = nextMap
  writeFamilySessionMap(nextMap)
  clearStoredFamilyConversationSnapshot(elderlyId)
}

export function clearStoredFamilyConversationSessions() {
  state.familySessionMap = {}
  state.familyConversationSnapshots = {}
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(FAMILY_SESSION_MAP_KEY)
    window.localStorage.removeItem(FAMILY_CONVERSATION_SNAPSHOT_KEY)
  }
}

export function setStoredFamilyConversationSnapshot(elderlyId: string, snapshot: FamilyConversationSnapshot) {
  state.familyConversationSnapshots = {
    ...state.familyConversationSnapshots,
    [elderlyId]: {
      sessionId: snapshot.sessionId,
      messages: snapshot.messages,
      state: snapshot.state,
      collectedFields: snapshot.collectedFields || [],
      missingFields: snapshot.missingFields || []
    }
  }
  writeFamilyConversationSnapshots(state.familyConversationSnapshots)
}

export function clearStoredFamilyConversationSnapshot(elderlyId: string) {
  if (!state.familyConversationSnapshots[elderlyId]) {
    return
  }

  const nextSnapshots = { ...state.familyConversationSnapshots }
  delete nextSnapshots[elderlyId]
  state.familyConversationSnapshots = nextSnapshots
  writeFamilyConversationSnapshots(nextSnapshots)
}

export function updateStoredFamilyElderlyIds(elderlyIds: string[]) {
  const currentSession = state.session
  if (!currentSession || currentSession.role !== 'family') {
    return
  }

  setStoredSession({
    ...currentSession,
    elderlyIds
  })
}

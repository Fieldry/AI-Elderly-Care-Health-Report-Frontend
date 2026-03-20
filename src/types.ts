export type Role = 'elderly' | 'family' | 'doctor'

export interface AuthResponse {
  token: string
  user_name: string
  role?: string
  expires_at?: string
  family_id?: string
  elderly_ids?: string[]
}

export interface FamilyRegisterPayload {
  name: string
  phone: string
  password: string
  elderlyId: string
  relation: string
}

export interface FamilyBindPayload {
  elderlyId: string
  relation: string
}

interface BaseAuthSession {
  token: string
  userName: string
  role: Role
  backendRole?: string
  expiresAt?: string
}

export interface ElderlyAuthSession extends BaseAuthSession {
  role: 'elderly'
  userId: string
  sessionId: string
  userType?: string
}

export interface FamilyAuthSession extends BaseAuthSession {
  role: 'family'
  familyId?: string
  elderlyIds: string[]
}

export interface DoctorAuthSession extends BaseAuthSession {
  role: 'doctor'
}

export type AuthSession = ElderlyAuthSession | FamilyAuthSession | DoctorAuthSession

export interface ChatStartResponse {
  userId: string
  sessionId: string
  welcomeMessage: string
  accessToken: string
  userType?: string
  expiresAt?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

export interface ChatMessageResponse {
  message: string
  state: string
  progress: number
  completed: boolean
}

export interface ChatProgressResponse {
  state: string
  progress: number
  completedGroups: string[]
  pendingGroups: string[]
  missingFields: Record<string, string[]>
}

export interface SessionMetadata {
  session_id: string
  sessionId?: string
  user_id?: string
  userId?: string
  created_at: string
  createdAt?: string
  status?: string
  title?: string
  has_report?: boolean
  hasReport?: boolean
  has_profile?: boolean
  hasProfile?: boolean
  files?: string[]
}

export interface SessionDetail {
  metadata: SessionMetadata
  conversation: ChatMessage[] | null
  profile: Record<string, unknown> | null
  reports: Array<Record<string, unknown>>
}

export interface HealthStatus {
  status: string
  timestamp: string
  service: string
}

export interface FamilyElderlySummary {
  elderly_id: string
  elderlyId?: string
  name: string
  relation: string
  completion_rate: number
  completionRate?: number
  created_at: string
  createdAt?: string
}

export interface FamilyElderlyDetail {
  elderly_id: string
  elderlyId?: string
  profile: Record<string, unknown>
}

export interface FamilyReportsResponse {
  data: Array<Record<string, unknown>>
}

export interface FamilySessionState {
  sessionId: string
  message?: string
  state?: string
  progress?: number
  completed?: boolean
  conversation?: ChatMessage[]
  profile?: Record<string, unknown> | null
  reports?: Array<Record<string, unknown>>
}

export interface ReportGenerateResponse {
  reportId?: string
  sessionId?: string
  report?: Record<string, unknown>
  reports?: Array<Record<string, unknown>>
}

export type Role = 'elderly' | 'family' | 'doctor'

export interface AuthResponse {
  token: string
  user_name: string
  role?: string
}

export interface AuthSession {
  token: string
  userName: string
  role: Role
  backendRole?: string
}

export interface ChatStartResponse {
  userId: string
  sessionId: string
  welcomeMessage: string
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

export interface SessionMetadata {
  session_id: string
  user_id?: string
  created_at: string
  status?: string
  title?: string
  has_report?: boolean
  has_profile?: boolean
  files?: string[]
}

export interface SessionDetail {
  metadata: SessionMetadata
  conversation: ChatMessage[] | null
  profile: Record<string, unknown> | null
  reports: Array<Record<string, unknown>>
}

export interface FamilyElderlySummary {
  elderly_id: string
  name: string
  relation: string
  completion_rate: number
  created_at: string
}

export interface FamilyElderlyDetail {
  elderly_id: string
  profile: Record<string, unknown>
}

export interface FamilyReportsResponse {
  data: Array<Record<string, unknown>>
}

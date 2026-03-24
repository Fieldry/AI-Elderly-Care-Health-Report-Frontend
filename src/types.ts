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
  interaction?: ChatInteraction | null
  accessToken: string
  userType?: string
  expiresAt?: string
}

export interface ChatOption {
  label: string
  value: string
}

export interface ChatInteractionField {
  key: string
  label: string
  type?: string
  options?: ChatOption[]
  allow_custom?: boolean
  custom_key?: string
  placeholder?: string
}

export interface ChatInteractionItem {
  key: string
  label: string
}

export interface ChatInteraction {
  id: string
  groupId: string
  groupName: string
  kind: string
  prompt: string
  allowFreeText?: boolean
  submitLabel?: string
  field?: string
  options?: ChatOption[]
  items?: ChatInteractionItem[]
  fields?: Array<ChatInteractionField | string>
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
  interaction?: ChatInteraction | null
}

export interface ChatProgressResponse {
  state: string
  progress: number
  completedGroups: string[]
  pendingGroups: string[]
  missingFields: Record<string, string[]>
  interaction?: ChatInteraction | null
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
  session_id?: string
  elderlyId?: string
  elderly_id?: string
  greeting?: string
  reply?: string
  message?: string
  state?: string
  progress?: number
  completed?: boolean
  collectedFields?: string[]
  missingFields?: string[]
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

export interface DoctorManagementState {
  elderly_user_id?: string
  doctor_id?: string
  is_key_case: boolean
  management_status: string
  contacted_family: boolean
  arranged_revisit: boolean
  referred: boolean
  next_followup_at?: string | null
  last_followup_at?: string | null
  last_followup_type?: string | null
  updated_by?: string | null
  updated_at?: string | null
}

export interface DoctorFollowup {
  followup_id: string
  elderly_user_id: string
  doctor_id: string
  visit_type: string
  findings: string
  recommendations: string[]
  contacted_family: boolean
  arranged_revisit: boolean
  referred: boolean
  next_followup_at?: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface DoctorOverview {
  elderly_id?: string
  age?: number | string | null
  sex?: string | null
  residence?: string | null
  living_arrangement?: string | null
  marital_status?: string | null
  chronic_conditions: string[]
  chronic_summary: string
  current_risk_level: string
  functional_status_level: string
  functional_status_text: string
  risk_tags: string[]
  recent_change: string
  last_assessment_at?: string | null
  main_problems: string[]
  high_risk_reasons: string[]
  summary: string
  recommended_actions: string[]
  latest_report_review?: Record<string, unknown> | null
  doctor_management?: DoctorManagementState | null
  latest_followup?: DoctorFollowup | null
}

export interface DoctorElderlySummary {
  elderly_id: string
  elderlyId?: string
  name: string
  created_at: string
  updated_at: string
  has_profile: boolean
  has_report: boolean
  session_count: number
  report_count: number
  latest_session_id?: string
  latest_report_id?: string
  overview: DoctorOverview | null
  management: DoctorManagementState
  latest_followup?: DoctorFollowup | null
}

export interface DoctorElderlyDetail {
  elderly_id: string
  elderlyId?: string
  name: string
  created_at: string
  updated_at: string
  profile: Record<string, unknown>
  sessions: SessionMetadata[]
  reports: Array<Record<string, unknown>>
  overview: DoctorOverview | null
  management: DoctorManagementState
  followups: DoctorFollowup[]
}

export interface DoctorFollowupCreatePayload {
  visitType: '门诊' | '电话' | '上门'
  findings: string
  recommendations: string[]
  contactedFamily: boolean
  arrangedRevisit: boolean
  referred: boolean
  nextFollowupAt?: string
  notes: string
}

export interface DoctorManagementUpdatePayload {
  isKeyCase?: boolean
  managementStatus?: string
  contactedFamily?: boolean
  arrangedRevisit?: boolean
  referred?: boolean
  nextFollowupAt?: string
}

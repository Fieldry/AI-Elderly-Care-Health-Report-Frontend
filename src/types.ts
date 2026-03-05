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

export interface ChatProgressResponse {
  state: string
  progress: number
  completedGroups: string[]
  pendingGroups: string[]
  missingFields: Record<string, string[]>
}

export interface AgentStatusEvent {
  agent: string
  status: string
  message?: string
}

export interface RiskItem {
  name: string
  level: string
  description: string
  timeframe: string
}

export interface RecommendationItem {
  id: string
  title: string
  description: string
  category: string
  completed: boolean
}

export interface ReportData {
  summary: string
  healthPortrait: {
    functionalStatus: string
    strengths: string[]
    problems: string[]
  }
  riskFactors: {
    shortTerm: RiskItem[]
    midTerm: RiskItem[]
  }
  recommendations: {
    priority1: RecommendationItem[]
    priority2: RecommendationItem[]
    priority3: RecommendationItem[]
  }
  generatedAt: string
}

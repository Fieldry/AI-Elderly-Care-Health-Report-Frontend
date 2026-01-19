import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 消息类型
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean        // 是否正在流式输出
  agentName?: string           // 当前工作的 Agent 名称
  metadata?: Record<string, unknown>  // 额外元数据
}

// Agent 状态
export interface AgentState {
  name: string
  displayName: string
  status: 'pending' | 'running' | 'completed' | 'error'
  message?: string
  startTime?: number
  endTime?: number
}

// 定义 Agent 列表
export const AGENT_LIST: { name: string; displayName: string }[] = [
  { name: 'StatusAgent', displayName: '失能等级判定' },
  { name: 'RiskAgent', displayName: '风险预测分析' },
  { name: 'AdviceAgent', displayName: '个性化建议生成' },
  { name: 'ReportAgent', displayName: '报告整合输出' }
]

export const useChatSessionStore = defineStore('chatSession', () => {
  // 状态
  const sessionId = ref<string>('')
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const isGeneratingReport = ref(false)
  const currentStreamingMessage = ref<string>('')
  const agentStates = ref<AgentState[]>([])
  const mode = ref<'chat' | 'questionnaire'>('chat')  // 对话模式 / 问卷模式

  // 计算属性：最后一条消息
  const lastMessage = computed(() => {
    return messages.value.length > 0
      ? messages.value[messages.value.length - 1]
      : null
  })

  // 计算属性：对话轮数
  const conversationRounds = computed(() => {
    return messages.value.filter(m => m.role === 'user').length
  })

  // 计算属性：当前活跃的 Agent
  const currentActiveAgent = computed(() => {
    return agentStates.value.find(a => a.status === 'running')
  })

  // 生成唯一消息 ID
  function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 生成会话 ID
  function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 方法：开始新会话
  function startNewSession() {
    sessionId.value = generateSessionId()
    messages.value = []
    agentStates.value = []
    currentStreamingMessage.value = ''
    isLoading.value = false
    isGeneratingReport.value = false

    // 添加欢迎消息
    addMessage({
      role: 'assistant',
      content: '您好！我是您的健康评估助手。我将通过一些问题来了解您的健康状况，帮助生成个性化的健康评估报告。\n\n请问，您今年多大年纪了？'
    })
  }

  // 方法：添加消息
  function addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
    const newMessage: ChatMessage = {
      ...message,
      id: generateMessageId(),
      timestamp: Date.now()
    }
    messages.value.push(newMessage)
    return newMessage.id
  }

  // 方法：更新消息内容 (用于流式输出)
  function updateMessageContent(messageId: string, content: string, append = false) {
    const message = messages.value.find(m => m.id === messageId)
    if (message) {
      message.content = append ? message.content + content : content
    }
  }

  // 方法：完成消息流式输出
  function finishStreamingMessage(messageId: string) {
    const message = messages.value.find(m => m.id === messageId)
    if (message) {
      message.isStreaming = false
    }
    currentStreamingMessage.value = ''
  }

  // 方法：初始化 Agent 状态
  function initAgentStates() {
    agentStates.value = AGENT_LIST.map(agent => ({
      name: agent.name,
      displayName: agent.displayName,
      status: 'pending' as const
    }))
  }

  // 方法：更新 Agent 状态
  function updateAgentState(
    agentName: string,
    status: AgentState['status'],
    message?: string
  ) {
    const agent = agentStates.value.find(a => a.name === agentName)
    if (agent) {
      agent.status = status
      agent.message = message
      if (status === 'running') {
        agent.startTime = Date.now()
      } else if (status === 'completed' || status === 'error') {
        agent.endTime = Date.now()
      }
    }
  }

  // 方法：切换模式
  function setMode(newMode: 'chat' | 'questionnaire') {
    mode.value = newMode
  }

  // 方法：设置加载状态
  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  // 方法：设置报告生成状态
  function setGeneratingReport(generating: boolean) {
    isGeneratingReport.value = generating
    if (generating) {
      initAgentStates()
    }
  }

  // 方法：清空会话
  function clearSession() {
    messages.value = []
    agentStates.value = []
    currentStreamingMessage.value = ''
  }

  return {
    // 状态
    sessionId,
    messages,
    isLoading,
    isGeneratingReport,
    currentStreamingMessage,
    agentStates,
    mode,
    // 计算属性
    lastMessage,
    conversationRounds,
    currentActiveAgent,
    // 方法
    startNewSession,
    addMessage,
    updateMessageContent,
    finishStreamingMessage,
    initAgentStates,
    updateAgentState,
    setMode,
    setLoading,
    setGeneratingReport,
    clearSession
  }
})

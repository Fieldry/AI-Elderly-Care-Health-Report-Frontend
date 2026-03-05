<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  getChatHistory,
  getChatProfile,
  getChatProgress,
  getSessionDetail,
  listSessions,
  sendChatMessage,
  startChat
} from '@/api/chat'
import { streamReport } from '@/api/report'
import type { AgentStatusEvent, ChatMessage, ReportData, SessionMetadata } from '@/types'

const router = useRouter()

const sessions = ref<SessionMetadata[]>([])
const activeSessionId = ref('')
const messages = ref<ChatMessage[]>([])

const inputText = ref('')
const isSending = ref(false)
const loadingSession = ref(false)
const actionError = ref('')

const progress = ref(0)
const progressState = ref('greeting')
const completedGroups = ref<string[]>([])
const pendingGroups = ref<string[]>([])

const isGeneratingReport = ref(false)
const reportEvents = ref<AgentStatusEvent[]>([])
const reportData = ref<ReportData | null>(null)
const reportError = ref('')

const chatBodyRef = ref<HTMLElement | null>(null)

const progressPercent = computed(() => Math.round(progress.value * 100))
const canGenerateReport = computed(
  () => !!activeSessionId.value && progress.value >= 0.9 && !isGeneratingReport.value
)

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function typewriterFill(messageIndex: number, content: string) {
  const step = content.length > 400 ? 6 : content.length > 200 ? 4 : 2
  for (let i = 0; i < content.length; i += step) {
    const current = messages.value[messageIndex]
    if (!current) {
      return
    }
    current.content += content.slice(i, i + step)
    await sleep(14)
  }
}

function mapConversation(items: ChatMessage[] | null | undefined): ChatMessage[] {
  if (!items || !items.length) {
    return []
  }
  return items.map((item) => ({
    role: item.role,
    content: item.content,
    timestamp: item.timestamp
  }))
}

function formatDateTime(value?: string) {
  if (!value) {
    return '--'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function stateLabel(state: string) {
  const map: Record<string, string> = {
    greeting: '初始引导',
    collecting: '信息采集中',
    confirming: '待确认',
    generating: '生成中',
    completed: '已完成',
    follow_up: '报告后答疑'
  }
  return map[state] || state
}

function summarizeSession(meta: SessionMetadata) {
  if (meta.title) {
    return meta.title
  }
  return `会话 ${meta.session_id.slice(0, 8)}`
}

async function refreshSessions() {
  sessions.value = await listSessions()
}

function loadLatestReportFromSession(reports: Array<Record<string, unknown>>) {
  if (!reports.length) {
    reportData.value = null
    return
  }

  const sorted = [...reports].sort((a, b) => {
    const ta = String(a.generated_at || '')
    const tb = String(b.generated_at || '')
    return tb.localeCompare(ta)
  })

  const latest = sorted[0]
  const reportPayload = latest.report_data as ReportData | undefined
  reportData.value = reportPayload || null
}

async function syncProgress(sessionId: string) {
  const result = await getChatProgress(sessionId)
  progress.value = result.progress
  progressState.value = result.state
  completedGroups.value = result.completedGroups
  pendingGroups.value = result.pendingGroups
}

async function selectSession(sessionId: string) {
  if (!sessionId) {
    return
  }

  loadingSession.value = true
  actionError.value = ''
  reportError.value = ''
  reportEvents.value = []

  try {
    activeSessionId.value = sessionId
    const detail = await getSessionDetail(sessionId)

    let sessionMessages = mapConversation(detail.conversation)
    if (!sessionMessages.length) {
      sessionMessages = mapConversation(await getChatHistory(sessionId))
    }
    messages.value = sessionMessages

    loadLatestReportFromSession(detail.reports)
    await syncProgress(sessionId)
  } catch (error) {
    actionError.value = (error as Error).message
  } finally {
    loadingSession.value = false
  }
}

async function createNewSession() {
  actionError.value = ''
  reportError.value = ''
  reportEvents.value = []
  reportData.value = null

  try {
    const session = await startChat()
    activeSessionId.value = session.sessionId
    messages.value = [
      {
        role: 'assistant',
        content: session.welcomeMessage
      }
    ]
    progress.value = 0
    progressState.value = 'greeting'
    completedGroups.value = []
    pendingGroups.value = []

    await refreshSessions()
  } catch (error) {
    actionError.value = (error as Error).message
  }
}

async function ensureActiveSession() {
  if (activeSessionId.value) {
    return
  }
  await createNewSession()
}

async function sendMessage() {
  if (!inputText.value.trim() || isSending.value) {
    return
  }

  await ensureActiveSession()
  if (!activeSessionId.value) {
    return
  }

  actionError.value = ''

  const userMessage = inputText.value.trim()
  inputText.value = ''

  messages.value.push({ role: 'user', content: userMessage })
  messages.value.push({ role: 'assistant', content: '' })
  const assistantIndex = messages.value.length - 1

  isSending.value = true
  try {
    const response = await sendChatMessage(activeSessionId.value, userMessage)

    progress.value = response.progress
    progressState.value = response.state

    await typewriterFill(assistantIndex, response.message)
    await refreshSessions()
  } catch (error) {
    messages.value[assistantIndex].content = '抱歉，消息发送失败，请稍后重试。'
    actionError.value = (error as Error).message
  } finally {
    isSending.value = false
  }
}

async function generateReport() {
  if (!canGenerateReport.value || !activeSessionId.value) {
    return
  }

  isGeneratingReport.value = true
  reportError.value = ''
  reportEvents.value = []

  try {
    const profile = await getChatProfile(activeSessionId.value)

    await streamReport(
      {
        sessionId: activeSessionId.value,
        profile
      },
      {
        onStatus(event) {
          reportEvents.value.push(event)
        },
        onComplete(report) {
          reportData.value = report
          progressState.value = 'completed'
          progress.value = Math.max(progress.value, 1)
        },
        onError(message) {
          reportError.value = message
        }
      }
    )

    await refreshSessions()
  } catch (error) {
    reportError.value = (error as Error).message
  } finally {
    isGeneratingReport.value = false
  }
}

watch(
  () => [messages.value.length, reportEvents.value.length, reportData.value?.generatedAt],
  async () => {
    await nextTick()
    if (chatBodyRef.value) {
      chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
    }
  }
)

onMounted(async () => {
  try {
    await refreshSessions()
    if (sessions.value.length > 0) {
      await selectSession(sessions.value[0].session_id)
    } else {
      await createNewSession()
    }
  } catch (error) {
    actionError.value = (error as Error).message
  }
})
</script>

<template>
  <main class="assessment-page">
    <header class="assessment-header">
      <button class="ghost-btn" @click="router.push('/')">返回首页</button>
      <h1>健康评估对话</h1>
      <button class="ghost-btn" :disabled="isSending || isGeneratingReport" @click="createNewSession">
        新建评估
      </button>
    </header>

    <div class="assessment-layout">
      <aside class="history-sidebar">
        <div class="history-topbar">
          <h2>历史会话</h2>
          <button class="ghost-btn" @click="refreshSessions">刷新</button>
        </div>

        <div class="session-list">
          <button
            v-for="session in sessions"
            :key="session.session_id"
            class="session-item"
            :class="{ active: session.session_id === activeSessionId }"
            @click="selectSession(session.session_id)"
          >
            <p class="session-title">{{ summarizeSession(session) }}</p>
            <p class="session-meta">{{ formatDateTime(session.created_at) }}</p>
            <p class="session-tags">
              <span v-if="session.has_report">已生成报告</span>
              <span v-else>评估中</span>
            </p>
          </button>
        </div>
      </aside>

      <section class="chat-section">
        <div class="progress-card">
          <div class="progress-head">
            <p>信息收集进度</p>
            <p>{{ progressPercent }}% · {{ stateLabel(progressState) }}</p>
          </div>
          <div class="progress-track">
            <div class="progress-bar" :style="{ width: `${progressPercent}%` }" />
          </div>
        </div>

        <div ref="chatBodyRef" class="chat-body">
          <div
            v-for="(message, idx) in messages"
            :key="`${message.role}-${idx}`"
            class="message-row"
            :class="message.role"
          >
            <p class="message-role">{{ message.role === 'user' ? '您' : '助手' }}</p>
            <div class="message-bubble">{{ message.content }}</div>
          </div>

          <div v-if="loadingSession" class="hint-text">会话加载中...</div>
          <div v-if="reportEvents.length" class="report-events">
            <h3>报告生成状态</h3>
            <p v-for="(event, idx) in reportEvents" :key="`event-${idx}`">
              [{{ event.agent }}] {{ event.status }} {{ event.message || '' }}
            </p>
          </div>
          <div v-if="reportError" class="error-text">{{ reportError }}</div>
          <div v-if="actionError" class="error-text">{{ actionError }}</div>
        </div>

        <div class="chat-actions">
          <textarea
            v-model="inputText"
            placeholder="请输入老人健康情况，例如：80岁女性，近一年行动不便，需要协助洗澡。"
            :disabled="isSending || isGeneratingReport"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <div class="action-row">
            <button class="primary-btn" :disabled="isSending || !inputText.trim()" @click="sendMessage">
              {{ isSending ? '发送中...' : '发送' }}
            </button>
            <button class="accent-btn" :disabled="!canGenerateReport" @click="generateReport">
              {{ isGeneratingReport ? '报告生成中...' : '生成最终报告' }}
            </button>
          </div>
          <p class="hint-text">当进度达到 90% 以上后，可点击“生成最终报告”。</p>
        </div>

        <article v-if="reportData" class="report-panel">
          <h2>健康报告结果</h2>
          <p class="report-time">生成时间：{{ formatDateTime(reportData.generatedAt) }}</p>

          <section>
            <h3>1. 健康总结</h3>
            <p>{{ reportData.summary }}</p>
          </section>

          <section>
            <h3>2. 健康画像</h3>
            <p>{{ reportData.healthPortrait.functionalStatus }}</p>
            <p>优势：{{ reportData.healthPortrait.strengths.join('、') || '暂无' }}</p>
            <p>问题：{{ reportData.healthPortrait.problems.join('、') || '暂无' }}</p>
          </section>

          <section>
            <h3>3. 风险因素</h3>
            <p class="report-label">短期风险（1-4周）</p>
            <ul>
              <li v-for="item in reportData.riskFactors.shortTerm" :key="`s-${item.name}`">
                {{ item.name }}（{{ item.level }}）：{{ item.description }}
              </li>
            </ul>
            <p class="report-label">中期风险（1-6月）</p>
            <ul>
              <li v-for="item in reportData.riskFactors.midTerm" :key="`m-${item.name}`">
                {{ item.name }}（{{ item.level }}）：{{ item.description }}
              </li>
            </ul>
          </section>

          <section>
            <h3>4. 行动建议</h3>
            <p class="report-label">优先级 A</p>
            <ul>
              <li v-for="item in reportData.recommendations.priority1" :key="item.id">
                {{ item.title }}：{{ item.description }}
              </li>
            </ul>
            <p class="report-label">优先级 B</p>
            <ul>
              <li v-for="item in reportData.recommendations.priority2" :key="item.id">
                {{ item.title }}：{{ item.description }}
              </li>
            </ul>
            <p class="report-label">优先级 C</p>
            <ul>
              <li v-for="item in reportData.recommendations.priority3" :key="item.id">
                {{ item.title }}：{{ item.description }}
              </li>
            </ul>
          </section>
        </article>
      </section>
    </div>
  </main>
</template>

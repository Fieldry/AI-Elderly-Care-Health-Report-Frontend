<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/core'
import {
  deleteSession,
  getChatHistory,
  getChatProfile,
  getChatProgress,
  getSessionDetail,
  listSessions,
  sendChatMessage,
  startChat,
  streamChatMessage
} from '@/api/chat'
import { getElderlyProfile, getElderlyReportDetail, getElderlyReports } from '@/api/elderly'
import { exportReportPdf, generateReport, streamGenerateReport } from '@/api/report'
import ProfileOverview from '@/components/ProfileOverview.vue'
import ReportSummary from '@/components/ReportSummary.vue'
import { useGoogleStreamingSpeech } from '@/composables/useGoogleStreamingSpeech'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { clearStoredSession, setStoredElderlySessionSessionId, setStoredSession, useAuthSession } from '@/session'
import type { ChatMessage, ChatMessageResponse, ChatStartResponse, SessionMetadata } from '@/types'
import { PROFILE_FIELD_LABELS, getMissingCoreFields } from '@/utils/profile'
import { getReportGeneratedAt, getReportId, normalizeReportRecord } from '@/utils/report'
import { mergeProfileSnapshots } from '@/utils/report'

const router = useRouter()
const { session } = useAuthSession()

const sessionId = ref('')
const sessions = ref<SessionMetadata[]>([])
const messages = ref<ChatMessage[]>([])
const profile = ref<Record<string, unknown>>({})
const reports = ref<Array<Record<string, unknown>>>([])
const inputText = ref('')
const loading = ref(false)
const sessionsLoading = ref(false)
const sending = ref(false)
const deleting = ref(false)
const generatingReport = ref(false)
const conversationState = ref('greeting')
const errorMessage = ref('')
const reportGenerationText = ref('')
const completionPercent = ref<number | null>(null)
const completedGroups = ref<string[]>([])
const pendingGroups = ref<string[]>([])
const progressMissingFields = ref<Record<string, string[]>>({})
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)
const selectedReportLoading = ref(false)
const downloadingReportId = ref('')

const chatBodyRef = ref<HTMLElement | null>(null)

const elderlyToken = computed(() =>
  session.value?.role === 'elderly' ? session.value.token : ''
)
const activeReport = computed(() => {
  if (!selectedReportId.value) {
    return null
  }

  return reports.value.find((item) => getReportId(item) === selectedReportId.value) || null
})
const sortedReports = computed(() =>
  [...reports.value].sort((left, right) =>
    getReportGeneratedAt(right).localeCompare(getReportGeneratedAt(left))
  )
)
const progressPercentLabel = computed(() =>
  completionPercent.value === null ? '未获取' : `${completionPercent.value}%`
)
const missingFieldLabels = computed(() => {
  const backendFields = Object.values(progressMissingFields.value)
    .flat()
    .map((field) => PROFILE_FIELD_LABELS[field] || field)
  const fallbackFields = getMissingCoreFields(profile.value)
  return Array.from(new Set([...(backendFields.length > 0 ? backendFields : []), ...fallbackFields]))
})
const sessionStatusText = computed(() => {
  const map: Record<string, string> = {
    greeting: '开始评估',
    collecting: '信息采集中',
    confirming: '待确认',
    generating: '生成报告中',
    completed: '评估已完成',
    follow_up: '报告后答疑'
  }

  return map[conversationState.value] || '信息采集中'
})
const sessionTitle = computed(() => {
  if (!sessionId.value) {
    return '会话准备中'
  }

  return `会话 ${sessionId.value.slice(0, 8)}`
})

const {
  isSupported: isGoogleVoiceSupported,
  isConnecting: isGoogleVoiceConnecting,
  isListening: isGoogleVoiceListening,
  errorMessage: googleVoiceError,
  speechEvent: googleSpeechEvent,
  start: startGoogleVoiceRecognition,
  stop: stopGoogleVoiceRecognition,
  abort: abortGoogleVoiceRecognition
} = useGoogleStreamingSpeech({
  lang: 'cmn-Hans-CN',
  onTranscript(value) {
    inputText.value = value
  }
})

const {
  isListening: isBrowserVoiceListening,
  isSupported: isBrowserVoiceSupported,
  errorMessage: browserVoiceError,
  start: startBrowserVoiceRecognition,
  stop: stopBrowserVoiceRecognition,
  abort: abortBrowserVoiceRecognition
} = useSpeechRecognition({
  lang: 'zh-CN',
  onTranscript(value) {
    inputText.value = value
  }
})

const voiceErrorMessage = computed(() => googleVoiceError.value || browserVoiceError.value || '')
const isVoiceAvailable = computed(() => isGoogleVoiceSupported.value || isBrowserVoiceSupported.value)
const isVoiceActive = computed(
  () => isGoogleVoiceConnecting.value || isGoogleVoiceListening.value || isBrowserVoiceListening.value
)
const voiceButtonLabel = computed(() => {
  if (isGoogleVoiceConnecting.value) {
    return '连接语音中...'
  }

  return isVoiceActive.value ? '停止语音输入' : '语音输入'
})
const voiceHintText = computed(() => {
  if (!isVoiceAvailable.value) {
    return '当前浏览器暂不支持语音输入，请改用文本输入。'
  }

  if (isGoogleVoiceListening.value || isGoogleVoiceConnecting.value) {
    if (googleSpeechEvent.value === 'end') {
      return '检测到停顿，正在整理最后一句。'
    }
    return '正在实时转写，请继续说话。'
  }

  if (isBrowserVoiceListening.value) {
    return '当前使用浏览器语音识别作为备用方案。'
  }

  return '点击语音输入即可说话。'
})

function formatDateTime(value: string) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function normalizeProgressPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null
  }

  const normalizedValue = value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, Math.round(normalizedValue)))
}

function isForbidden(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

function clearVoiceInput() {
  abortGoogleVoiceRecognition()
  abortBrowserVoiceRecognition()
}

function applyStartedSession(response: ChatStartResponse) {
  setStoredSession({
    token: response.accessToken,
    userName: '长者本人',
    role: 'elderly',
    backendRole: response.userType || 'elderly',
    expiresAt: response.expiresAt,
    userId: response.userId,
    sessionId: response.sessionId,
    userType: response.userType
  })
}

async function scrollChatToBottom() {
  await nextTick()
  chatBodyRef.value?.scrollTo({
    top: chatBodyRef.value.scrollHeight,
    behavior: 'smooth'
  })
}

async function revealAssistantMessage(messageIndex: number, content: string) {
  const step = content.length > 160 ? 5 : 3
  for (let index = 0; index < content.length; index += step) {
    const message = messages.value[messageIndex]
    if (!message) {
      return
    }

    message.content += content.slice(index, index + step)
    await scrollChatToBottom()
    await new Promise((resolve) => window.setTimeout(resolve, 18))
  }
}

function resetSelectedReport() {
  selectedReportId.value = ''
  selectedReportDetail.value = null
}

async function refreshSessions(token: string) {
  sessionsLoading.value = true

  try {
    const response = await listSessions(token)
    sessions.value = response.sort((left, right) => right.created_at.localeCompare(left.created_at))
  } finally {
    sessionsLoading.value = false
  }
}

async function refreshReportCollection(token: string) {
  const response = await getElderlyReports(token)
  reports.value = response

  if (selectedReportId.value && !response.some((item) => getReportId(item) === selectedReportId.value)) {
    resetSelectedReport()
  }
}

async function refreshProgressState(targetSessionId: string, token: string) {
  const progress = await getChatProgress(targetSessionId, token)
  conversationState.value = progress.state || 'collecting'
  completionPercent.value = normalizeProgressPercent(progress.progress)
  completedGroups.value = progress.completedGroups
  pendingGroups.value = progress.pendingGroups
  progressMissingFields.value = progress.missingFields
}

async function refreshSessionArtifacts(targetSessionId: string, token: string) {
  const [detail, latestProfile, selfProfile] = await Promise.all([
    getSessionDetail(targetSessionId, token),
    getChatProfile(targetSessionId, token).catch(() => ({})),
    getElderlyProfile(token).catch(() => ({}))
  ])

  profile.value = mergeProfileSnapshots(selfProfile, detail.profile || {}, latestProfile)
  reports.value = detail.reports?.length > 0 ? detail.reports : reports.value
}

async function openReportDetail(reportId: string) {
  if (!elderlyToken.value || !reportId) {
    return
  }

  selectedReportId.value = reportId
  selectedReportLoading.value = true

  try {
    selectedReportDetail.value = await getElderlyReportDetail(reportId, elderlyToken.value)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载报告详情失败，请稍后重试。'
  } finally {
    selectedReportLoading.value = false
  }
}

async function loadExistingSession(targetSessionId: string, token: string) {
  loading.value = true
  errorMessage.value = ''
  clearVoiceInput()

  try {
    sessionId.value = targetSessionId
    setStoredElderlySessionSessionId(targetSessionId)
    const detail = await getSessionDetail(targetSessionId, token)
    const conversation =
      detail.conversation && detail.conversation.length > 0
        ? detail.conversation
        : await getChatHistory(targetSessionId, token)

    messages.value = conversation
    profile.value = mergeProfileSnapshots(detail.profile || {})
    reports.value = detail.reports || []

    await Promise.all([
      refreshProgressState(targetSessionId, token).catch(() => {}),
      refreshSessionArtifacts(targetSessionId, token),
      refreshReportCollection(token),
      refreshSessions(token)
    ])
  } finally {
    loading.value = false
    await scrollChatToBottom()
  }
}

async function createNewSession() {
  loading.value = true
  sending.value = false
  errorMessage.value = ''
  clearVoiceInput()
  resetSelectedReport()

  try {
    const response = await startChat()
    applyStartedSession(response)
    sessionId.value = response.sessionId
    messages.value = [
      {
        role: 'assistant',
        content: response.welcomeMessage
      }
    ]
    completionPercent.value = null
    completedGroups.value = []
    pendingGroups.value = []
    progressMissingFields.value = {}
    profile.value = {}
    reports.value = []
    conversationState.value = 'greeting'

    await Promise.allSettled([
      refreshSessions(response.accessToken),
      refreshProgressState(response.sessionId, response.accessToken),
      refreshReportCollection(response.accessToken)
    ])
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '启动评估失败，请检查后端服务是否可用。'
  } finally {
    loading.value = false
    await scrollChatToBottom()
  }
}

async function initializeAssessment() {
  const currentSession = session.value

  if (!currentSession || currentSession.role !== 'elderly') {
    await createNewSession()
    return
  }

  try {
    await loadExistingSession(currentSession.sessionId, currentSession.token)
  } catch (error) {
    if (isForbidden(error)) {
      clearStoredSession()
    }
    await createNewSession()
  }
}

async function handleSend() {
  if (!sessionId.value || sending.value || !inputText.value.trim() || !elderlyToken.value) {
    return
  }

  const messageText = inputText.value.trim()
  inputText.value = ''
  sending.value = true
  errorMessage.value = ''
  clearVoiceInput()

  messages.value.push({
    role: 'user',
    content: messageText
  })
  messages.value.push({
    role: 'assistant',
    content: ''
  })

  const assistantIndex = messages.value.length - 1
  await scrollChatToBottom()

  try {
    let response: ChatMessageResponse

    try {
      response = await streamChatMessage(sessionId.value, messageText, elderlyToken.value, async (chunk) => {
        const assistantMessage = messages.value[assistantIndex]
        if (!assistantMessage) {
          return
        }

        assistantMessage.content += chunk
        await scrollChatToBottom()
      })

      if (!messages.value[assistantIndex]?.content && response.message) {
        await revealAssistantMessage(assistantIndex, response.message)
      }
    } catch {
      messages.value[assistantIndex].content = ''
      response = await sendChatMessage(sessionId.value, messageText, elderlyToken.value)
      await revealAssistantMessage(assistantIndex, response.message)
    }

    conversationState.value = response.state || 'collecting'
    completionPercent.value = normalizeProgressPercent(response.progress)

    await Promise.all([
      refreshProgressState(sessionId.value, elderlyToken.value).catch(() => {}),
      refreshSessionArtifacts(sessionId.value, elderlyToken.value),
      refreshSessions(elderlyToken.value),
      refreshReportCollection(elderlyToken.value)
    ])
  } catch (error) {
    if (isForbidden(error)) {
      clearStoredSession()
    }
    errorMessage.value =
      error instanceof Error ? error.message : '发送失败，请稍后重试。'
  } finally {
    sending.value = false
  }
}

async function handleGenerateReport() {
  if (!sessionId.value || !elderlyToken.value || generatingReport.value) {
    return
  }

  generatingReport.value = true
  errorMessage.value = ''
  reportGenerationText.value = ''
  conversationState.value = 'generating'

  try {
    let reportId = ''

    try {
      const response = await streamGenerateReport(sessionId.value, profile.value, elderlyToken.value, (chunk) => {
        reportGenerationText.value += chunk
      })

      reportId = response.reportId || getReportId(response.report || null)
      if (!reportGenerationText.value && response.report) {
        reportGenerationText.value = JSON.stringify(response.report, null, 2)
      }
    } catch {
      const response = await generateReport(sessionId.value, profile.value, elderlyToken.value)
      reportId = response.reportId || ''
      if (!reportGenerationText.value && response.report) {
        reportGenerationText.value = JSON.stringify(response.report, null, 2)
      }
    }

    await Promise.all([
      refreshReportCollection(elderlyToken.value),
      refreshSessionArtifacts(sessionId.value, elderlyToken.value),
      refreshSessions(elderlyToken.value),
      refreshProgressState(sessionId.value, elderlyToken.value).catch(() => {})
    ])

    if (reportId) {
      await openReportDetail(reportId)
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '生成报告失败，请稍后重试。'
  } finally {
    generatingReport.value = false
  }
}

async function handleDeleteSession() {
  if (!sessionId.value || !elderlyToken.value || deleting.value) {
    return
  }

  const confirmed = window.confirm('删除当前评估会话后，对话、画像与关联报告将无法在当前列表继续查看。是否继续？')
  if (!confirmed) {
    return
  }

  deleting.value = true
  errorMessage.value = ''

  try {
    await deleteSession(sessionId.value, elderlyToken.value)
    resetSelectedReport()

    const remainingSessions = sessions.value.filter((item) => item.session_id !== sessionId.value)
    sessions.value = remainingSessions

    if (remainingSessions.length > 0) {
      await loadExistingSession(remainingSessions[0].session_id, elderlyToken.value)
    } else {
      await createNewSession()
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '删除会话失败，请稍后重试。'
  } finally {
    deleting.value = false
  }
}

async function handleDownloadReport(reportId: string) {
  if (!reportId || !elderlyToken.value) {
    return
  }

  downloadingReportId.value = reportId
  errorMessage.value = ''

  try {
    const blob = await exportReportPdf(reportId, elderlyToken.value)
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `${reportId}.pdf`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    if (error instanceof ApiError && error.status === 501) {
      errorMessage.value = '后端尚未实现 PDF 导出，目前只能查看在线报告内容。'
    } else {
      errorMessage.value =
        error instanceof Error ? error.message : '导出 PDF 失败，请稍后重试。'
    }
  } finally {
    downloadingReportId.value = ''
  }
}

async function switchSession(targetSessionId: string) {
  if (!elderlyToken.value || targetSessionId === sessionId.value) {
    return
  }

  await loadExistingSession(targetSessionId, elderlyToken.value)
}

async function toggleVoiceInput() {
  if (!sessionId.value) {
    return
  }

  if (isVoiceActive.value) {
    stopGoogleVoiceRecognition()
    stopBrowserVoiceRecognition()
    return
  }

  if (isGoogleVoiceSupported.value) {
    try {
      await startGoogleVoiceRecognition(sessionId.value, inputText.value)
      return
    } catch {
      // Fall through to the browser implementation below.
    }
  }

  if (isBrowserVoiceSupported.value) {
    startBrowserVoiceRecognition(inputText.value)
  }
}

watch(
  messages,
  async () => {
    await scrollChatToBottom()
  },
  {
    deep: true
  }
)

onMounted(async () => {
  await initializeAssessment()
})
</script>

<template>
  <div class="page-width role-page elderly-page">
    <section class="assessment-layout">
      <article class="surface-card chat-card">
        <header class="chat-card__header">
          <div>
            <h2>对话采集</h2>
            <p>请直接描述您的身体情况、慢病、生活能力和日常习惯。</p>
          </div>
          <span class="status-badge">{{ sessionTitle }}</span>
        </header>

        <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

        <div ref="chatBodyRef" class="chat-stream">
          <article
            v-for="(message, index) in messages"
            :key="`${message.role}-${index}`"
            class="message-bubble"
            :class="`message-bubble--${message.role}`"
          >
            <span class="message-bubble__role">{{ message.role === 'assistant' ? '健康助手' : '我' }}</span>
            <div class="message-bubble__content">
              {{ message.content || '...' }}
            </div>
          </article>

          <div v-if="loading" class="empty-tip">正在准备当前评估会话...</div>
          <div v-if="!loading && messages.length === 0" class="empty-tip">
            尚未开始会话，系统将自动创建新的评估记录。
          </div>
        </div>

        <footer class="chat-composer">
          <label class="composer-label" for="elderly-input">描述当前情况</label>
          <textarea
            id="elderly-input"
            v-model="inputText"
            class="composer-textarea"
            :disabled="loading || sending"
            placeholder="例如：老人 82 岁，男，最近走路容易喘，晚上睡眠一般。"
            rows="4"
            @keydown.enter.exact.prevent="handleSend"
          />
          <div class="composer-actions">
            <div class="voice-panel">
              <button
                class="secondary-button voice-button"
                type="button"
                :disabled="loading || !isVoiceAvailable"
                @click="toggleVoiceInput"
              >
                {{ voiceButtonLabel }}
              </button>
              <p>{{ voiceErrorMessage || voiceHintText }}</p>
            </div>
            <button class="primary-button composer-submit" type="button" :disabled="loading || sending" @click="handleSend">
              {{ sending ? '发送中...' : '发送' }}
            </button>
          </div>
        </footer>
      </article>

      <aside class="side-panel">
        <section class="surface-card summary-card">
          <p class="eyebrow">长者端</p>
          <h1>健康评估对话</h1>
          <p class="summary-card__text">
            用对话和语音逐步采集老人健康信息，右侧同步查看状态、结构化画像和当前可用报告。
          </p>

          <div class="summary-stats">
            <div class="summary-stat">
              <span>当前状态</span>
              <strong>{{ sessionStatusText }}</strong>
            </div>
            <div class="summary-stat">
              <span>关键信息完整度</span>
              <strong>{{ progressPercentLabel }}</strong>
            </div>
          </div>

          <div v-if="completedGroups.length > 0 || pendingGroups.length > 0" class="group-status">
            <p v-if="completedGroups.length > 0">已完成：{{ completedGroups.join('、') }}</p>
            <p v-if="pendingGroups.length > 0">待补充：{{ pendingGroups.join('、') }}</p>
          </div>

          <div class="summary-card__actions">
            <button class="secondary-button summary-card__action" type="button" @click="createNewSession">
              开始新评估
            </button>
            <button
              class="primary-button summary-card__action"
              type="button"
              :disabled="!sessionId || generatingReport"
              @click="handleGenerateReport"
            >
              {{ generatingReport ? '生成中...' : '生成报告' }}
            </button>
            <button
              class="ghost-button summary-card__action"
              type="button"
              :disabled="!sessionId || deleting"
              @click="handleDeleteSession"
            >
              {{ deleting ? '删除中...' : '删除当前会话' }}
            </button>
            <button class="ghost-button summary-card__action" type="button" @click="router.push('/access/elderly')">
              返回首页
            </button>
          </div>
        </section>

        <section class="surface-card session-card">
          <div class="panel-header">
            <h3>我的会话</h3>
            <span>{{ sessionsLoading ? '同步中' : `${sessions.length} 条` }}</span>
          </div>

          <div v-if="sessions.length > 0" class="session-list scroll-panel">
            <button
              v-for="item in sessions"
              :key="item.session_id"
              class="session-item"
              :class="{ 'is-active': item.session_id === sessionId }"
              type="button"
              @click="switchSession(item.session_id)"
            >
              <strong>{{ item.title || `会话 ${item.session_id.slice(0, 8)}` }}</strong>
              <span>{{ formatDateTime(item.created_at) }}</span>
            </button>
          </div>
          <p v-else class="session-card__empty">当前还没有可恢复的历史会话。</p>
        </section>

        <section v-if="missingFieldLabels.length > 0" class="surface-card hint-card">
          <h3>建议继续补充</h3>
          <div class="hint-chip-list">
            <span v-for="field in missingFieldLabels" :key="field" class="hint-chip">{{ field }}</span>
          </div>
        </section>

        <ProfileOverview :profile="profile" />
        <ReportSummary :reports="reports" />

        <section class="surface-card report-list-card">
          <div class="panel-header">
            <h3>报告列表</h3>
            <span>{{ sortedReports.length }} 份</span>
          </div>

          <div v-if="sortedReports.length > 0" class="report-list scroll-panel">
            <article
              v-for="report in sortedReports"
              :key="getReportId(report) || JSON.stringify(report)"
              class="report-item"
            >
              <div>
                <strong>{{ getReportId(report) || '未命名报告' }}</strong>
                <p>{{ formatDateTime(getReportGeneratedAt(report)) }}</p>
              </div>
              <div class="report-item__actions">
                <button class="secondary-button" type="button" @click="openReportDetail(getReportId(report))">
                  查看详情
                </button>
                <button
                  class="ghost-button"
                  type="button"
                  :disabled="downloadingReportId === getReportId(report)"
                  @click="handleDownloadReport(getReportId(report))"
                >
                  {{ downloadingReportId === getReportId(report) ? '导出中...' : '导出 PDF' }}
                </button>
              </div>
            </article>
          </div>
          <p v-else class="session-card__empty">当前还没有返回任何报告。</p>
        </section>

        <section v-if="generatingReport && reportGenerationText" class="surface-card stream-card">
          <div class="panel-header">
            <h3>流式生成中</h3>
          </div>
          <pre class="stream-card__content">{{ reportGenerationText }}</pre>
        </section>

        <section v-if="selectedReportId" class="surface-card report-detail-card">
          <div class="panel-header">
            <h3>报告详情</h3>
            <span>{{ selectedReportLoading ? '加载中' : selectedReportId }}</span>
          </div>

          <div v-if="selectedReportLoading" class="session-card__empty">正在加载报告详情...</div>
          <ReportSummary
            v-else
            :reports="[normalizeReportRecord(selectedReportDetail || activeReport || {}) || {}]"
            title="当前报告"
            empty-title="报告详情为空"
            empty-description="当前报告没有返回可展示的结构化内容。"
          />
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.elderly-page {
  padding-top: 16px;
}

.assessment-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
  gap: 22px;
  align-items: start;
}

.chat-card {
  padding: 24px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  height: clamp(42rem, calc(100vh - 9.5rem), 52rem);
}

.chat-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.chat-card__header h2 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 1.8rem;
}

.chat-card__header p {
  margin: 8px 0 0;
  color: var(--ink-muted);
  font-size: 1.05rem;
}

.status-badge {
  padding: 10px 14px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand-strong);
  white-space: nowrap;
  font-weight: 700;
}

.error-banner {
  margin: 16px 0 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(183, 75, 75, 0.08);
  color: var(--danger);
}

.chat-stream {
  margin-top: 18px;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 14px;
  padding-right: 6px;
}

.message-bubble {
  max-width: 90%;
  padding: 18px 20px;
  border-radius: 26px;
  display: grid;
  gap: 10px;
  box-shadow: 0 14px 30px rgba(35, 84, 99, 0.08);
}

.message-bubble--assistant {
  justify-self: start;
  background: rgba(255, 255, 255, 0.94);
}

.message-bubble--user {
  justify-self: end;
  background: rgba(83, 169, 183, 0.14);
}

.message-bubble__role {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--brand-strong);
}

.message-bubble__content {
  color: var(--ink-strong);
  line-height: 1.8;
  white-space: pre-wrap;
}

.empty-tip {
  align-self: center;
  justify-self: center;
  color: var(--ink-muted);
}

.chat-composer {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.composer-label {
  color: var(--ink-strong);
  font-weight: 700;
}

.composer-textarea {
  resize: none;
  border-radius: 24px;
  padding: 16px 18px;
  min-height: 120px;
}

.composer-actions {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.voice-panel {
  display: grid;
  gap: 10px;
  color: var(--ink-muted);
  flex: 1;
}

.voice-panel p {
  margin: 0;
  line-height: 1.7;
}

.composer-submit {
  min-width: 8rem;
}

.side-panel {
  display: grid;
  gap: 18px;
}

.summary-card,
.session-card,
.report-list-card,
.stream-card,
.report-detail-card {
  padding: 22px;
}

.summary-card h1 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(2rem, 3vw, 2.8rem);
}

.summary-card__text {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.8;
}

.summary-stats {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.summary-stat {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(83, 169, 183, 0.12);
}

.summary-stat span,
.group-status p,
.report-item p,
.session-item span,
.session-card__empty {
  color: var(--ink-muted);
}

.summary-stat strong {
  display: block;
  margin-top: 8px;
  color: var(--ink-strong);
  font-size: 1.35rem;
}

.group-status {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.group-status p {
  margin: 0;
  line-height: 1.7;
}

.summary-card__actions {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-card__action {
  width: 100%;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.panel-header h3 {
  margin: 0;
  color: var(--ink-strong);
}

.panel-header span {
  color: var(--ink-muted);
}

.session-list,
.report-list {
  margin-top: 16px;
  display: grid;
  gap: 12px;
  max-height: 18rem;
  overflow: auto;
}

.session-item,
.report-item {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.84);
}

.session-item {
  display: grid;
  gap: 6px;
  text-align: left;
}

.session-item strong,
.report-item strong {
  color: var(--ink-strong);
}

.session-item.is-active {
  border-color: rgba(43, 134, 150, 0.32);
  background: rgba(83, 169, 183, 0.12);
}

.hint-card {
  padding: 22px;
}

.hint-card h3 {
  margin: 0 0 14px;
  color: var(--ink-strong);
}

.hint-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hint-chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(83, 169, 183, 0.12);
  color: var(--brand-strong);
  font-weight: 700;
}

.report-item {
  display: grid;
  gap: 12px;
}

.report-item p {
  margin: 6px 0 0;
}

.report-item__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stream-card__content {
  margin: 16px 0 0;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--ink-strong);
  white-space: pre-wrap;
  max-height: 18rem;
  overflow: auto;
}

@media (max-width: 1100px) {
  .assessment-layout {
    grid-template-columns: 1fr;
  }

  .chat-card {
    height: auto;
    min-height: 42rem;
  }
}

@media (max-width: 720px) {
  .summary-card__actions,
  .summary-stats {
    grid-template-columns: 1fr;
  }

  .composer-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

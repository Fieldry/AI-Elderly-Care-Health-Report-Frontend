<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'

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
import { getElderlyProfile, getElderlyReportDetail } from '@/api/elderly'
import { exportReportPdf } from '@/api/report'
import ProfileOverview from '@/components/ProfileOverview.vue'
import { useGoogleStreamingSpeech } from '@/composables/useGoogleStreamingSpeech'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import {
  clearStoredElderlySessionSnapshot,
  getStoredElderlySession,
  getStoredElderlySessionSnapshot,
  getStoredElderlySessionSnapshots,
  setStoredElderlySessionSessionId,
  setStoredElderlySessionSnapshot,
  setStoredSession,
  useAuthSession
} from '@/session'
import type {
  ChatInteraction,
  ChatInteractionField,
  ChatMessage,
  ChatMessageResponse,
  ChatStartResponse,
  ElderlyAuthSession,
  SessionMetadata
} from '@/types'
import { getReportGeneratedAt, getReportId, normalizeLatestReport, normalizeReportRecord } from '@/utils/report'
import { mergeProfileSnapshots } from '@/utils/report'

const router = useRouter()
const { session } = useAuthSession()

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false
})

function renderMessageContent(content: string | undefined): string {
  if (!content) return '...'
  return md.render(content)
}

const elderlyAccessSession = ref<ElderlyAuthSession | null>(null)

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
const currentInteraction = ref<ChatInteraction | null>(null)
const interactionModalVisible = ref(false)
const interactionValues = ref<Record<string, unknown>>({})
const errorMessage = ref('')
const copyIdButtonText = ref('复制我的号码')
const completionPercent = ref<number | null>(null)
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)
const selectedReportLoading = ref(false)
const downloadingReportId = ref('')
const openingSessionReportId = ref('')

const chatBodyRef = ref<HTMLElement | null>(null)
const interactionModalTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const suppressModalReopen = ref(false)

const elderlyToken = computed(() => elderlyAccessSession.value?.token || '')
const activeReport = computed(() => {
  if (!selectedReportId.value) {
    return null
  }

  return reports.value.find((item) => getReportId(item) === selectedReportId.value) || null
})
const selectedReportRecord = computed(() => {
  const source = selectedReportDetail.value || activeReport.value || null
  return source ? normalizeReportRecord(source) : null
})
const selectedReportView = computed(() =>
  selectedReportRecord.value ? normalizeLatestReport([selectedReportRecord.value]) : null
)
const selectedReportPointSections = computed(() => {
  const normalizedReport = selectedReportView.value
  if (!normalizedReport) {
    return []
  }

  const sections = normalizedReport.sections
    .map((section) => ({
      title: section.title,
      items: Array.from(new Set(section.items.map((item) => item.trim()).filter(Boolean)))
    }))
    .filter((section) => section.items.length > 0)

  const markdownPoints = extractReportPoints(normalizedReport.markdown).filter((item) => {
    if (normalizedReport.summary && item === normalizedReport.summary.trim()) {
      return false
    }

    return !sections.some((section) => section.items.includes(item))
  })

  if (markdownPoints.length > 0) {
    sections.push({
      title: '报告要点',
      items: markdownPoints
    })
  }

  if (sections.length > 0) {
    return sections
  }

  if (normalizedReport.summary) {
    return [
      {
        title: '报告摘要',
        items: [normalizedReport.summary]
      }
    ]
  }

  return []
})
const elderlyUserId = computed(() => elderlyAccessSession.value?.userId || '')
const progressPercentLabel = computed(() =>
  completionPercent.value === null ? '未获取' : `${completionPercent.value}%`
)
const sessionStatusText = computed(() => {
  return getConversationStateText(conversationState.value)
})
const isChatInputMode = computed(
  () => !currentInteraction.value || currentInteraction.value.kind === 'chat'
)
const showInteractionModal = computed(
  () => Boolean(currentInteraction.value && !isChatInputMode.value && interactionModalVisible.value && !generatingReport.value)
)
const interactionEntryLabel = computed(() =>
  currentInteraction.value?.kind === 'confirm' ? '打开确认卡片' : '打开选择题卡片'
)
const interactionPendingText = computed(() =>
  interactionModalVisible.value
    ? '题卡当前已打开，也可以先取消并稍后继续。'
    : '您已暂停当前题卡，可随时重新打开继续作答。'
)
const canConfirmReport = computed(
  () => currentInteraction.value?.kind === 'confirm' && !sending.value && !loading.value
)
const interactionFields = computed(() =>
  Array.isArray(currentInteraction.value?.fields)
    ? (currentInteraction.value?.fields?.filter((field): field is ChatInteractionField =>
        typeof field === 'object' && !!field && 'key' in field && 'label' in field
      ) || [])
    : []
)
const interactionItems = computed(() =>
  Array.isArray(currentInteraction.value?.items) ? currentInteraction.value.items : []
)
const interactionOptions = computed(() =>
  Array.isArray(currentInteraction.value?.options) ? currentInteraction.value.options : []
)

function getConversationStateText(value: string | undefined) {
  const map: Record<string, string> = {
    greeting: '开始评估',
    collecting: '信息采集中',
    confirming: '待确认',
    generating: '生成报告中',
    completed: '评估已完成',
    follow_up: '报告后答疑'
  }

  return map[value || ''] || '信息采集中'
}

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
    return '连接中'
  }

  return isVoiceActive.value ? '停止' : '语音'
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

function cloneJson<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T
}

function resetInteractionValues(interaction: ChatInteraction | null) {
  if (!interaction) {
    interactionValues.value = {}
    return
  }

  if (interaction.kind === 'multi_select') {
    interactionValues.value = {
      selected: []
    }
    return
  }

  if (interaction.kind === 'confirm') {
    interactionValues.value = {
      action: ''
    }
    return
  }

  const nextValues: Record<string, unknown> = {}

  if (interaction.kind === 'matrix_single_choice') {
    for (const item of interaction.items || []) {
      nextValues[item.key] = ''
    }
  }

  if (interaction.kind === 'form_card') {
    for (const field of interactionFields.value) {
      nextValues[field.key] = ''
      if (field.custom_key) {
        nextValues[field.custom_key] = ''
      }
    }
  }

  if (interaction.kind === 'single_choice' && interaction.field) {
    nextValues[interaction.field] = ''
  }

  interactionValues.value = nextValues
}

function getInteractionFieldValue(key: string) {
  const value = interactionValues.value[key]
  return typeof value === 'string' ? value : ''
}

function setInteractionFieldValue(key: string, value: string) {
  interactionValues.value = {
    ...interactionValues.value,
    [key]: value
  }
}

function toggleInteractionMultiSelect(key: string) {
  const selected = Array.isArray(interactionValues.value.selected)
    ? [...(interactionValues.value.selected as string[])]
    : []

  const nextSelected = selected.includes(key)
    ? selected.filter((item) => item !== key)
    : [...selected, key]

  interactionValues.value = {
    ...interactionValues.value,
    selected: nextSelected
  }
}

function describeInteractionAnswer(interaction: ChatInteraction, values: Record<string, unknown>): string {
  if (interaction.kind === 'single_choice' && interaction.field) {
    const answer = getStringValue(values[interaction.field])
    return answer || '已提交选项'
  }

  if (interaction.kind === 'matrix_single_choice') {
    return (interaction.items || [])
      .map((item) => `${item.label}：${getStringValue(values[item.key])}`)
      .filter((item) => item.replace(/：$/, '') !== '')
      .join('；')
  }

  if (interaction.kind === 'multi_select') {
    const selected = new Set(Array.isArray(values.selected) ? values.selected.map((item) => String(item)) : [])
    const labels = (interaction.items || [])
      .filter((item) => selected.has(item.key))
      .map((item) => item.label)
    return labels.length > 0 ? `已选择：${labels.join('、')}` : '已选择：无'
  }

  if (interaction.kind === 'form_card') {
    return interactionFields.value
      .map((field) => {
        const value = getStringValue(values[field.key])
        return value ? `${field.label}：${value}` : ''
      })
      .filter(Boolean)
      .join('；')
  }

  if (interaction.kind === 'confirm') {
    return values.action === 'confirm' ? '确认生成报告' : '需要修改信息'
  }

  return '已提交答案'
}

function getStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function extractReportPoints(markdown: string) {
  if (!markdown.trim()) {
    return []
  }

  return Array.from(
    new Set(
      markdown
        .split(/\r?\n/)
        .map((line) =>
          line
            .trim()
            .replace(/^\s*(?:#{1,6}|[-*+]|>\s*|\d+[.)])\s*/, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .trim()
        )
        .filter(Boolean)
    )
  )
}

function sortReportsByGeneratedAt(items: Array<Record<string, unknown>>) {
  return [...items].sort((left, right) =>
    getReportGeneratedAt(right).localeCompare(getReportGeneratedAt(left))
  )
}

function getSessionCreatedAt(item: SessionMetadata) {
  return item.created_at || item.createdAt || ''
}

function sortSessionsByCreatedAt(items: SessionMetadata[]) {
  return [...items].sort((left, right) => getSessionCreatedAt(right).localeCompare(getSessionCreatedAt(left)))
}

function dedupeSessions(items: SessionMetadata[]) {
  return Array.from(
    items.reduce((map, item) => {
      if (item.session_id) {
        map.set(item.session_id, item)
      }
      return map
    }, new Map<string, SessionMetadata>()).values()
  )
}

function createSessionMetadata(sessionIdValue: string, userIdValue: string, createdAt = new Date().toISOString()) {
  const hasProfile = Object.keys(profile.value || {}).length > 0
  const hasReport = reports.value.length > 0

  return {
    session_id: sessionIdValue,
    sessionId: sessionIdValue,
    user_id: userIdValue,
    userId: userIdValue,
    created_at: createdAt,
    createdAt,
    status: conversationState.value,
    has_profile: hasProfile,
    hasProfile,
    has_report: hasReport,
    hasReport,
    files: []
  } satisfies SessionMetadata
}

function upsertSessionMetadata(metadata: SessionMetadata) {
  sessions.value = sortSessionsByCreatedAt(dedupeSessions([metadata, ...sessions.value]))
}

function getLocalSessionMetadata(userId = elderlyUserId.value) {
  if (!userId) {
    return [] as SessionMetadata[]
  }

  return sortSessionsByCreatedAt(
    dedupeSessions(getStoredElderlySessionSnapshots(userId).map((snapshot) => snapshot.metadata))
  )
}

function hydrateSessionsFromLocal(userId = elderlyUserId.value) {
  const localSessions = getLocalSessionMetadata(userId)
  sessions.value = localSessions
  return localSessions
}

function updateActiveElderlySession(nextSession: ElderlyAuthSession | null) {
  elderlyAccessSession.value = nextSession
}

function updateCurrentSessionId(nextSessionId: string) {
  sessionId.value = nextSessionId

  if (elderlyAccessSession.value) {
    elderlyAccessSession.value = {
      ...elderlyAccessSession.value,
      sessionId: nextSessionId
    }
  }

  setStoredElderlySessionSessionId(nextSessionId)
}

function resolveSnapshotMetadata(targetSessionId = sessionId.value) {
  const existingMetadata =
    sessions.value.find((item) => item.session_id === targetSessionId) ||
    getStoredElderlySessionSnapshot(targetSessionId)?.metadata

  if (existingMetadata) {
    const normalizedMetadata = {
      ...existingMetadata,
      user_id: existingMetadata.user_id || existingMetadata.userId || elderlyUserId.value,
      userId: existingMetadata.userId || existingMetadata.user_id || elderlyUserId.value,
      status: conversationState.value || existingMetadata.status,
      has_profile: Object.keys(profile.value || {}).length > 0,
      hasProfile: Object.keys(profile.value || {}).length > 0,
      has_report: reports.value.length > 0,
      hasReport: reports.value.length > 0
    } satisfies SessionMetadata

    upsertSessionMetadata(normalizedMetadata)
    return normalizedMetadata
  }

  const metadata = createSessionMetadata(targetSessionId, elderlyUserId.value)
  upsertSessionMetadata(metadata)
  return metadata
}

function persistCurrentSnapshot(metadata = resolveSnapshotMetadata()) {
  if (!sessionId.value || !elderlyUserId.value) {
    return
  }

  setStoredElderlySessionSnapshot({
    sessionId: sessionId.value,
    userId: elderlyUserId.value,
    metadata,
    messages: messages.value.map((message) => ({ ...message })),
    profile: Object.keys(profile.value || {}).length > 0 ? cloneJson(profile.value) : undefined,
    reports: cloneJson(reports.value),
    conversationState: conversationState.value,
    completionPercent: completionPercent.value,
    currentInteraction: currentInteraction.value ? cloneJson(currentInteraction.value) : null
  })
}

function setCurrentInteraction(nextInteraction: ChatInteraction | null | undefined) {
  const previousId = currentInteraction.value?.id || ''
  const nextId = nextInteraction?.id || ''
  currentInteraction.value = nextInteraction ? cloneJson(nextInteraction) : null
  if (previousId !== nextId) {
    resetInteractionValues(currentInteraction.value)
  }
}

function applyStoredSessionSnapshot(targetSessionId: string, message: string) {
  const snapshot = getStoredElderlySessionSnapshot(targetSessionId)
  if (!snapshot) {
    return false
  }

  updateCurrentSessionId(snapshot.sessionId)
  messages.value = snapshot.messages.map((entry) => ({ ...entry }))
  profile.value = cloneJson(snapshot.profile || {})
  reports.value = cloneJson(snapshot.reports || [])
  conversationState.value = snapshot.conversationState || 'collecting'
  completionPercent.value = normalizeProgressPercent(snapshot.completionPercent)
  setCurrentInteraction(snapshot.currentInteraction || null)
  upsertSessionMetadata(snapshot.metadata)

  if (selectedReportId.value && !reports.value.some((item) => getReportId(item) === selectedReportId.value)) {
    resetSelectedReport()
  }

  errorMessage.value = message
  return true
}

function resolvePreferredElderlySession() {
  const currentSession = session.value
  if (currentSession?.role === 'elderly') {
    return currentSession
  }

  return getStoredElderlySession()
}

function resolveInitialSessionId(preferredSession: ElderlyAuthSession, availableSessions: SessionMetadata[]) {
  if (availableSessions.some((item) => item.session_id === preferredSession.sessionId)) {
    return preferredSession.sessionId
  }

  return availableSessions[0]?.session_id || preferredSession.sessionId
}

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

function openInteractionModal() {
  if (!currentInteraction.value || isChatInputMode.value || generatingReport.value) {
    return
  }

  interactionModalVisible.value = true
}

function dismissInteractionModal() {
  interactionModalVisible.value = false
}

function getSessionLabel(item: SessionMetadata, index: number) {
  if (item.title?.trim()) {
    return item.title
  }

  return `历史评估 ${sessions.value.length - index}`
}

function hasSessionReport(item: SessionMetadata) {
  return Boolean(item.has_report ?? item.hasReport)
}

function getLatestReportId(items: Array<Record<string, unknown>>) {
  return getReportId(sortReportsByGeneratedAt(items)[0] || null)
}

async function copyElderlyUserId() {
  if (!elderlyUserId.value) {
    copyIdButtonText.value = 'ID 未就绪'
    window.setTimeout(() => {
      copyIdButtonText.value = '复制我的号码'
    }, 1600)
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(elderlyUserId.value)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = elderlyUserId.value
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    copyIdButtonText.value = '已复制'
  } catch {
    copyIdButtonText.value = '复制失败'
  }

  window.setTimeout(() => {
    copyIdButtonText.value = '复制我的号码'
  }, 1800)
}

function applyStartedSession(response: ChatStartResponse) {
  const nextSession = {
    token: response.accessToken,
    userName: '长者本人',
    role: 'elderly',
    backendRole: response.userType || 'elderly',
    expiresAt: response.expiresAt,
    userId: response.userId,
    sessionId: response.sessionId,
    userType: response.userType
  } satisfies ElderlyAuthSession

  updateActiveElderlySession(nextSession)
  setStoredSession(nextSession)
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

function closeReportModal() {
  resetSelectedReport()
}

async function refreshSessions(token: string) {
  sessionsLoading.value = true

  try {
    const response = await listSessions(token)
    const nextSessions = sortSessionsByCreatedAt(dedupeSessions([...response, ...getLocalSessionMetadata()]))
    sessions.value = nextSessions
    return nextSessions
  } catch {
    return hydrateSessionsFromLocal()
  } finally {
    sessionsLoading.value = false
  }
}

async function refreshProgressState(targetSessionId: string, token: string) {
  const progress = await getChatProgress(targetSessionId, token)
  conversationState.value = progress.state || 'collecting'
  completionPercent.value = normalizeProgressPercent(progress.progress)
  setCurrentInteraction(progress.interaction || null)
}

async function refreshSessionArtifacts(targetSessionId: string, token: string) {
  const [latestProfileResult, selfProfileResult] = await Promise.allSettled([
    getChatProfile(targetSessionId, token),
    getElderlyProfile(token)
  ])

  const latestProfile = latestProfileResult.status === 'fulfilled' ? latestProfileResult.value : {}
  const selfProfile = selfProfileResult.status === 'fulfilled' ? selfProfileResult.value : {}

  profile.value = mergeProfileSnapshots(selfProfile, profile.value || {}, latestProfile)
}

async function refreshCurrentSessionReports(targetSessionId: string, token: string) {
  const detail = await getSessionDetail(targetSessionId, token)
  reports.value = detail.reports || []

  if (selectedReportId.value && !reports.value.some((item) => getReportId(item) === selectedReportId.value)) {
    resetSelectedReport()
  }

  persistCurrentSnapshot(resolveSnapshotMetadata(targetSessionId))
  return detail.reports || []
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
    updateCurrentSessionId(targetSessionId)
    const detail = await getSessionDetail(targetSessionId, token)
    const conversation =
      detail.conversation && detail.conversation.length > 0
        ? detail.conversation
        : await getChatHistory(targetSessionId, token)

    const detailMetadata =
      detail.metadata?.session_id && (detail.metadata.user_id || detail.metadata.userId)
        ? detail.metadata
        : createSessionMetadata(targetSessionId, elderlyUserId.value)

    messages.value = conversation
    profile.value = mergeProfileSnapshots(detail.profile || {})
    reports.value = detail.reports || []
    upsertSessionMetadata({
      ...detailMetadata,
      user_id: detailMetadata.user_id || detailMetadata.userId || elderlyUserId.value,
      userId: detailMetadata.userId || detailMetadata.user_id || elderlyUserId.value
    })

    if (selectedReportId.value && !reports.value.some((item) => getReportId(item) === selectedReportId.value)) {
      resetSelectedReport()
    }

    persistCurrentSnapshot(resolveSnapshotMetadata(targetSessionId))

    await Promise.allSettled([
      refreshProgressState(targetSessionId, token).catch(() => {}),
      refreshSessionArtifacts(targetSessionId, token),
      refreshSessions(token)
    ])
    persistCurrentSnapshot(resolveSnapshotMetadata(targetSessionId))
    return detail
  } catch (error) {
    if (applyStoredSessionSnapshot(targetSessionId, '')) {
      return null
    }
    throw error
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
    updateCurrentSessionId(response.sessionId)
    messages.value = [
      {
        role: 'assistant',
        content: response.welcomeMessage
      }
    ]
    completionPercent.value = null
    profile.value = {}
    reports.value = []
    conversationState.value = 'collecting'
    setCurrentInteraction(response.interaction || null)
    persistCurrentSnapshot(createSessionMetadata(response.sessionId, response.userId))

    await Promise.allSettled([
      refreshSessions(response.accessToken),
      refreshProgressState(response.sessionId, response.accessToken)
    ])
    persistCurrentSnapshot(resolveSnapshotMetadata(response.sessionId))
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '启动评估失败，请检查后端服务是否可用。'
  } finally {
    loading.value = false
    await scrollChatToBottom()
  }
}

async function handleStartNewAssessment() {
  if (elderlyUserId.value || sessions.value.length > 0) {
    const confirmed = window.confirm('这会创建新的老人档案与独立评估记录，不会续接当前会话。是否继续？')
    if (!confirmed) {
      return
    }
  }

  await createNewSession()
}

async function initializeAssessment() {
  const preferredSession = resolvePreferredElderlySession()

  if (!preferredSession) {
    await createNewSession()
    return
  }

  updateActiveElderlySession(preferredSession)
  hydrateSessionsFromLocal(preferredSession.userId)

  try {
    const availableSessions = await refreshSessions(preferredSession.token)
    const targetSessionId = resolveInitialSessionId(preferredSession, availableSessions)
    await loadExistingSession(targetSessionId, preferredSession.token)
  } catch {
    const localSessions = hydrateSessionsFromLocal(preferredSession.userId)
    const localTargetSessionId =
      resolveInitialSessionId(preferredSession, localSessions) || localSessions[0]?.session_id || ''

    if (localTargetSessionId && applyStoredSessionSnapshot(localTargetSessionId, '已恢复本机保存的评估内容。')) {
      return
    }

    await createNewSession()
  }
}

async function finalizeInteractionResponse(response: ChatMessageResponse) {
  conversationState.value = response.state || 'collecting'
  completionPercent.value = normalizeProgressPercent(response.progress)
  setCurrentInteraction(response.interaction || null)

  const refreshTasks: Array<Promise<unknown>> = [
    refreshProgressState(sessionId.value, elderlyToken.value).catch(() => {}),
    refreshSessionArtifacts(sessionId.value, elderlyToken.value),
    refreshSessions(elderlyToken.value)
  ]

  if (response.completed) {
    refreshTasks.push(refreshCurrentSessionReports(sessionId.value, elderlyToken.value))
  }

  await Promise.allSettled(refreshTasks)
  persistCurrentSnapshot()
}

async function handleSend() {
  if (!sessionId.value || sending.value || !inputText.value.trim() || !elderlyToken.value || !isChatInputMode.value) {
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

    await finalizeInteractionResponse(response)
  } catch (error) {
    if (!messages.value[assistantIndex]?.content) {
      messages.value.splice(assistantIndex, 1)
    }

    persistCurrentSnapshot()
    errorMessage.value =
      isForbidden(error)
        ? '当前会话暂时无法继续同步，请稍后重试或先查看已保存内容。'
        : error instanceof Error
          ? error.message
          : '发送失败，请稍后重试。'
  } finally {
    sending.value = false
  }
}

async function submitStructuredInteraction(values: Record<string, unknown>) {
  if (!sessionId.value || !elderlyToken.value || sending.value || !currentInteraction.value) {
    return false
  }

  const interaction = cloneJson(currentInteraction.value)
  const userDisplayText = describeInteractionAnswer(interaction, values)
  sending.value = true
  generatingReport.value = interaction.kind === 'confirm'
  errorMessage.value = ''
  clearVoiceInput()

  messages.value.push({
    role: 'user',
    content: userDisplayText
  })
  messages.value.push({
    role: 'assistant',
    content: ''
  })

  const assistantIndex = messages.value.length - 1
  await scrollChatToBottom()

  try {
    const response = await sendChatMessage(
      sessionId.value,
      '',
      elderlyToken.value,
      undefined,
      {
        interactionId: interaction.id,
        values
      }
    )
    await revealAssistantMessage(assistantIndex, response.message)
    await finalizeInteractionResponse(response)
    return true
  } catch (error) {
    if (!messages.value[assistantIndex]?.content) {
      messages.value.splice(assistantIndex, 1)
    }

    persistCurrentSnapshot()
    errorMessage.value =
      isForbidden(error)
        ? '当前会话暂时无法继续同步，请稍后重试或先查看已保存内容。'
        : error instanceof Error
          ? error.message
          : '提交失败，请稍后重试。'
    return false
  } finally {
    sending.value = false
    generatingReport.value = false
  }
}

function isInteractionValueSelected(key: string, value: string) {
  return getInteractionFieldValue(key) === value
}

async function handleCurrentInteractionSubmit() {
  if (!currentInteraction.value) {
    return
  }

  errorMessage.value = ''
  const interaction = currentInteraction.value

  if (interaction.kind === 'single_choice' && interaction.field) {
    const value = getInteractionFieldValue(interaction.field)
    if (!value) {
      errorMessage.value = '请先选择一个答案。'
      return
    }
    await submitStructuredInteraction({ [interaction.field]: value })
    return
  }

  if (interaction.kind === 'matrix_single_choice') {
    const values: Record<string, unknown> = {}
    for (const item of interactionItems.value) {
      const value = getInteractionFieldValue(item.key)
      if (!value) {
        errorMessage.value = `请先完成“${item.label}”这一项。`
        return
      }
      values[item.key] = value
    }
    await submitStructuredInteraction(values)
    return
  }

  if (interaction.kind === 'multi_select') {
    const selected = Array.isArray(interactionValues.value.selected)
      ? interactionValues.value.selected.map((item) => String(item))
      : []
    await submitStructuredInteraction({ selected })
    return
  }

  if (interaction.kind === 'form_card') {
    const values: Record<string, unknown> = {}
    for (const field of interactionFields.value) {
      const fieldValue = getInteractionFieldValue(field.key)
      if (!fieldValue) {
        errorMessage.value = `请先填写“${field.label}”。`
        return
      }
      values[field.key] = fieldValue
      if (field.custom_key) {
        values[field.custom_key] = getInteractionFieldValue(field.custom_key)
      }
    }
    await submitStructuredInteraction(values)
  }
}

async function handleConfirmReportGeneration() {
  if (!currentInteraction.value || currentInteraction.value.kind !== 'confirm') {
    return
  }

  dismissInteractionModal()
  suppressModalReopen.value = true
  const submitted = await submitStructuredInteraction({ action: 'confirm' })
  if (!submitted && currentInteraction.value?.kind === 'confirm') {
    suppressModalReopen.value = false
    interactionModalVisible.value = true
  }
}

async function handleConfirmChoice(action: 'confirm' | 'modify') {
  if (!currentInteraction.value || currentInteraction.value.kind !== 'confirm') {
    return
  }

  if (action === 'confirm') {
    await handleConfirmReportGeneration()
    return
  }

  await submitStructuredInteraction({ action })
}

async function handleGenerateReport() {
  if (!canConfirmReport.value) {
    return
  }
  await handleConfirmReportGeneration()
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
    const deletingSessionId = sessionId.value
    await deleteSession(sessionId.value, elderlyToken.value)
    resetSelectedReport()
    clearStoredElderlySessionSnapshot(deletingSessionId)

    const remainingSessions = sessions.value.filter((item) => item.session_id !== deletingSessionId)
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

async function handleOpenSessionReport(item: SessionMetadata) {
  if (!elderlyToken.value || !item.session_id || !hasSessionReport(item) || openingSessionReportId.value) {
    return
  }

  openingSessionReportId.value = item.session_id
  errorMessage.value = ''

  try {
    const targetReports =
      item.session_id === sessionId.value
        ? reports.value.length > 0
          ? reports.value
          : await refreshCurrentSessionReports(item.session_id, elderlyToken.value)
        : (await loadExistingSession(item.session_id, elderlyToken.value))?.reports || []

    const latestReportId = getLatestReportId(targetReports)
    if (!latestReportId) {
      errorMessage.value = '当前会话还没有可查看的报告。'
      return
    }

    await openReportDetail(latestReportId)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '打开报告失败，请稍后重试。'
  } finally {
    openingSessionReportId.value = ''
  }
}

async function toggleVoiceInput() {
  if (!sessionId.value || !isChatInputMode.value) {
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
  () => [currentInteraction.value?.id || '', currentInteraction.value?.kind || '', isChatInputMode.value] as const,
  (nextValue, previousValue) => {
    const [interactionId, interactionKind, chatInputMode] = nextValue

    if (!interactionId || chatInputMode) {
      if (interactionModalTimer.value) {
        clearTimeout(interactionModalTimer.value)
        interactionModalTimer.value = null
      }
      interactionModalVisible.value = false
      return
    }

    const changed = !previousValue
      || interactionId !== previousValue[0]
      || interactionKind !== previousValue[1]

    if (!changed) {
      return
    }

    if (interactionModalTimer.value) {
      clearTimeout(interactionModalTimer.value)
      interactionModalTimer.value = null
    }

    if (suppressModalReopen.value) {
      suppressModalReopen.value = false
      return
    }

    interactionModalTimer.value = setTimeout(() => {
      interactionModalVisible.value = true
      interactionModalTimer.value = null
    }, 800)
  },
  {
    immediate: true
  }
)

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
          <div class="chat-card__intro">
            <h2>对话采集</h2>
          </div>
          <div class="chat-card__header-actions">
            <p>这是您的号码，可复制给您的家属绑定</p>
            <button
              class="secondary-button copy-id-button"
              type="button"
              :disabled="!elderlyUserId"
              @click="copyElderlyUserId"
            >
              {{ copyIdButtonText }}
            </button>
          </div>
        </header>

        <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

        <div ref="chatBodyRef" class="chat-stream">
          <article
            v-for="(message, index) in messages"
            :key="`${message.role}-${index}`"
            class="message-bubble"
            :class="`message-bubble--${message.role}`"
          >
            <span class="message-bubble__avatar">{{ message.role === 'assistant' ? '健' : '我' }}</span>
            <div class="message-bubble__panel">
              <div class="message-bubble__meta">
                <span class="message-bubble__role">{{ message.role === 'assistant' ? '健康助手' : '我' }}</span>
                <span v-if="message.timestamp" class="message-bubble__time">
                  {{ formatDateTime(message.timestamp) }}
                </span>
              </div>
              <div class="message-bubble__content markdown-body" v-html="renderMessageContent(message.content)"></div>
            </div>
          </article>

          <div v-if="loading" class="empty-tip">正在准备当前评估会话...</div>
          <div v-if="!loading && messages.length === 0" class="empty-tip">
            尚未开始会话，系统将自动创建新的评估记录。
          </div>
        </div>

        <footer class="chat-composer">
          <div class="composer-shell">
            <template v-if="generatingReport">
              <div class="composer-shell__header">
                <label class="composer-label">报告生成中</label>
              </div>
              <div class="composer-disabled">
                <p class="composer-disabled__title">
                  <span class="generating-spinner" />
                  正在生成报告
                </p>
                <p class="composer-disabled__text">
                  请您稍等4-5分钟，报告正在生成中......
                </p>
                <p class="composer-disabled__text composer-disabled__steps">
                  正在进行：失能状态判定 → 风险预测 → 健康画像 → 行动计划 → 报告生成
                </p>
              </div>
            </template>

            <template v-else-if="isChatInputMode">
              <div class="composer-shell__header">
                <label class="composer-label" for="elderly-input">描述当前情况</label>
              </div>
              <textarea
                id="elderly-input"
                v-model="inputText"
                class="composer-textarea"
                :disabled="loading || sending"
                placeholder="例如：我今年 82 岁。"
                rows="1"
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
                    <span class="voice-button__dot" :class="{ 'is-live': isVoiceActive }" />
                    {{ voiceButtonLabel }}
                  </button>
                  <div class="voice-panel__copy">
                    <strong>{{ isVoiceActive ? '正在聆听' : '语音输入' }}</strong>
                  </div>
                </div>
                <button
                  class="primary-button composer-submit"
                  type="button"
                  :disabled="loading || sending"
                  @click="handleSend"
                >
                  {{ sending ? '发送中...' : '发送' }}
                </button>
              </div>
            </template>

            <template v-else-if="currentInteraction">
              <div class="composer-shell__header">
                <span class="composer-label">{{ currentInteraction.groupName || '当前题卡' }}</span>
              </div>
              <div class="interaction-pending">
                <p class="interaction-pending__title">当前有待完成的题卡</p>
                <p class="interaction-pending__text">{{ interactionPendingText }}</p>
                <div class="composer-actions composer-actions--card interaction-pending__actions">
                  <button class="primary-button composer-submit" type="button" @click="openInteractionModal">
                    {{ interactionEntryLabel }}
                  </button>
                  <button
                    class="secondary-button composer-submit"
                    type="button"
                    :disabled="!interactionModalVisible"
                    @click="dismissInteractionModal"
                  >
                    {{ interactionModalVisible ? '暂停答题' : '已暂停' }}
                  </button>
                </div>
              </div>
            </template>
          </div>
        </footer>
      </article>

      <aside class="side-panel">
        <section class="surface-card summary-card">
          <p class="eyebrow">长者端</p>
          <h1>健康评估对话</h1>

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

          <div class="summary-card__actions">
            <button class="secondary-button summary-card__action" type="button" @click="handleStartNewAssessment">
              新建独立评估
            </button>
            <button
              class="secondary-button summary-card__action"
              type="button"
              :disabled="loading || !elderlyToken"
              @click="router.push('/elderly/counseling')"
            >
              进入心理咨询
            </button>
            <button
              class="primary-button summary-card__action"
              type="button"
              :disabled="!canConfirmReport"
              @click="handleGenerateReport"
            >
              {{ generatingReport ? '生成中...' : '确认并生成报告' }}
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
            <div>
              <h3>会话与报告</h3>
            </div>
            <span>{{ sessionsLoading ? '同步中' : `${sessions.length} 条` }}</span>
          </div>

          <div v-if="sessions.length > 0" class="session-list scroll-panel">
            <article
              v-for="(item, index) in sessions"
              :key="item.session_id"
              class="session-item"
              :class="{ 'is-active': item.session_id === sessionId }"
            >
              <div class="session-item__head">
                <div class="session-item__copy">
                  <strong>{{ getSessionLabel(item, index) }}</strong>
                  <span>{{ formatDateTime(item.created_at) }}</span>
                </div>
              </div>

              <div class="session-item__meta">
                <span class="status-chip" :class="{ 'status-chip--active': item.session_id === sessionId }">
                  {{ getConversationStateText(item.session_id === sessionId ? conversationState : item.status) }}
                </span>
                <span class="status-chip" :class="{ 'status-chip--ready': hasSessionReport(item) }">
                  {{ hasSessionReport(item) ? '报告已生成' : '报告未生成' }}
                </span>
                <button
                  v-if="hasSessionReport(item)"
                  class="ghost-button session-item__action"
                  type="button"
                  :disabled="openingSessionReportId === item.session_id"
                  @click="handleOpenSessionReport(item)"
                >
                  {{ openingSessionReportId === item.session_id ? '打开中...' : '查看报告' }}
                </button>
              </div>
            </article>
          </div>
          <p v-else class="session-card__empty">当前还没有可恢复的历史会话。</p>
        </section>

        <ProfileOverview :profile="profile" />

      </aside>
    </section>

    <div v-if="showInteractionModal && currentInteraction" class="interaction-modal">
      <article
        class="surface-card interaction-modal__card"
        role="dialog"
        aria-modal="true"
        :aria-label="currentInteraction.groupName || '选择题卡片'"
      >
        <header class="interaction-modal__header">
          <div>
            <p class="eyebrow">{{ currentInteraction.groupName || '题卡问题' }}</p>
            <h3>{{ currentInteraction.kind === 'confirm' ? '请确认当前信息' : '请完成当前题目' }}</h3>
          </div>
        </header>

        <div class="interaction-modal__body">
          <div class="interaction-card">
            <p class="interaction-card__prompt interaction-modal__prompt">{{ currentInteraction.prompt }}</p>

            <div v-if="currentInteraction.kind === 'single_choice' && currentInteraction.field" class="choice-grid">
              <button
                v-for="option in interactionOptions"
                :key="option.value"
                class="choice-chip"
                :class="{ 'is-selected': isInteractionValueSelected(currentInteraction.field, option.value) }"
                type="button"
                @click="setInteractionFieldValue(currentInteraction.field, option.value)"
              >
                {{ option.label }}
              </button>
            </div>

            <div v-else-if="currentInteraction.kind === 'matrix_single_choice'" class="matrix-card">
              <div v-for="item in interactionItems" :key="item.key" class="matrix-row">
                <p class="matrix-row__label">{{ item.label }}</p>
                <div class="choice-grid choice-grid--compact">
                  <button
                    v-for="option in interactionOptions"
                    :key="`${item.key}-${option.value}`"
                    class="choice-chip choice-chip--small"
                    :class="{ 'is-selected': isInteractionValueSelected(item.key, option.value) }"
                    type="button"
                    @click="setInteractionFieldValue(item.key, option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>

            <div v-else-if="currentInteraction.kind === 'multi_select'" class="multi-card">
              <button
                v-for="item in interactionItems"
                :key="item.key"
                class="choice-chip choice-chip--check"
                :class="{ 'is-selected': Array.isArray(interactionValues.selected) && interactionValues.selected.includes(item.key) }"
                type="button"
                @click="toggleInteractionMultiSelect(item.key)"
              >
                {{ item.label }}
              </button>
            </div>

            <div v-else-if="currentInteraction.kind === 'form_card'" class="form-card">
              <label v-for="field in interactionFields" :key="field.key" class="form-card__field">
                <span>{{ field.label }}</span>
                <select
                  class="composer-select"
                  :value="getInteractionFieldValue(field.key)"
                  @change="setInteractionFieldValue(field.key, String(($event.target as HTMLSelectElement).value || ''))"
                >
                  <option value="">请选择</option>
                  <option v-for="option in field.options || []" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <input
                  v-if="field.custom_key && getInteractionFieldValue(field.key) === '其他'"
                  class="composer-input"
                  :value="getInteractionFieldValue(field.custom_key)"
                  :placeholder="field.placeholder || '请补充说明'"
                  @input="setInteractionFieldValue(field.custom_key, String(($event.target as HTMLInputElement).value || ''))"
                />
              </label>
            </div>

            <div v-else-if="currentInteraction.kind === 'confirm'" class="confirm-card">
              <button class="primary-button composer-submit" type="button" :disabled="sending" @click="handleConfirmChoice('confirm')">
                {{ sending || generatingReport ? '生成中...' : '确认生成报告' }}
              </button>
              <button class="secondary-button composer-submit" type="button" :disabled="sending" @click="handleConfirmChoice('modify')">
                修改信息
              </button>
              <button class="ghost-button composer-submit" type="button" :disabled="sending || generatingReport" @click="dismissInteractionModal">
                取消
              </button>
            </div>

            <div
              v-if="currentInteraction.kind !== 'confirm'"
              class="composer-actions composer-actions--card"
            >
              <button
                class="secondary-button composer-submit"
                type="button"
                :disabled="sending"
                @click="dismissInteractionModal"
              >
                取消
              </button>
              <button
                class="primary-button composer-submit"
                type="button"
                :disabled="loading || sending"
                @click="handleCurrentInteractionSubmit"
              >
                {{ sending ? '提交中...' : (currentInteraction.submitLabel || '提交答案') }}
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-if="selectedReportId" class="report-modal" @click.self="closeReportModal">
      <article class="surface-card report-modal__card">
        <header class="report-modal__header">
          <div>
            <p class="eyebrow">报告详情</p>
            <h3>{{ selectedReportId }}</h3>
            <p>
              {{ selectedReportLoading ? '正在同步当前报告内容' : formatDateTime(selectedReportView?.generatedAt || '') }}
            </p>
          </div>

          <div class="report-modal__actions">
            <button
              class="ghost-button report-modal__action"
              type="button"
              :disabled="selectedReportLoading || downloadingReportId === selectedReportId"
              @click="handleDownloadReport(selectedReportId)"
            >
              {{ downloadingReportId === selectedReportId ? '导出中...' : '导出 PDF' }}
            </button>
            <button class="secondary-button report-modal__action" type="button" @click="closeReportModal">
              关闭
            </button>
          </div>
        </header>

        <div v-if="selectedReportLoading" class="report-modal__loading">正在加载报告详情...</div>

        <div v-else-if="selectedReportView" class="report-modal__body">
          <article v-if="selectedReportView.summary" class="report-modal__summary">
            <strong>摘要</strong>
            <p>{{ selectedReportView.summary }}</p>
          </article>

          <section
            v-for="section in selectedReportPointSections"
            :key="section.title"
            class="report-modal__section"
          >
            <h4>{{ section.title }}</h4>
            <ul class="report-modal__list">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
          </section>

          <div
            v-if="!selectedReportView.summary && selectedReportPointSections.length === 0"
            class="report-modal__empty"
          >
            当前报告没有返回可展示的内容。
          </div>
        </div>

        <div v-else class="report-modal__empty">当前报告没有返回可展示的内容。</div>
      </article>
    </div>
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
  position: relative;
  overflow: hidden;
  padding: 28px;
  display: flex;
  flex-direction: column;
  height: clamp(42rem, calc(100vh - 9.5rem), 52rem);
  background:
    radial-gradient(circle at top right, rgba(153, 220, 202, 0.18), transparent 24rem),
    linear-gradient(180deg, rgba(252, 254, 255, 0.98), rgba(236, 247, 248, 0.94));
}

.chat-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.36), transparent 42%),
    radial-gradient(circle at 12% 100%, rgba(83, 169, 183, 0.14), transparent 26%);
  pointer-events: none;
}

.chat-card > * {
  position: relative;
  z-index: 1;
}

.chat-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.chat-card__intro {
  max-width: 20rem;
}

.chat-card__header-actions {
  display: grid;
  gap: 10px;
  justify-items: end;
  max-width: 20rem;
}

.chat-card__header h2 {
  margin: 10px 0 0;
  color: var(--ink-strong);
  font-size: clamp(2rem, 3vw, 2.65rem);
}

.chat-card__header p {
  margin: 8px 0 0;
  color: var(--ink-muted);
  font-size: 1rem;
}

.chat-card__header-actions p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.6;
  text-align: right;
  font-size: 0.95rem;
}

.chat-card__lead {
  max-width: 32rem;
  line-height: 1.8;
}

.chat-card__meta {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.chat-card__meta-pill {
  padding: 16px 18px;
  border-radius: 22px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 28px rgba(47, 98, 114, 0.07);
}

.chat-card__meta-pill span {
  color: var(--ink-muted);
  font-size: 0.92rem;
}

.chat-card__meta-pill strong {
  display: block;
  margin-top: 8px;
  color: var(--ink-strong);
  font-size: 1.18rem;
}

.copy-id-button {
  min-width: 9.5rem;
  min-height: 2.75rem;
  border-radius: 999px;
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
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 16px;
  padding: 22px 18px;
  padding-right: 12px;
  border-radius: 28px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(240, 248, 250, 0.88));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 18px 32px rgba(35, 84, 99, 0.05);
}

.message-bubble {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: flex-start;
  max-width: 92%;
}

.message-bubble--assistant {
  justify-self: start;
}

.message-bubble--user {
  justify-self: end;
  grid-template-columns: minmax(0, 1fr) auto;
}

.message-bubble__avatar {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.95rem;
  font-weight: 800;
}

.message-bubble--assistant .message-bubble__avatar {
  background: linear-gradient(135deg, var(--brand), var(--brand-strong));
  color: white;
  box-shadow: 0 12px 24px rgba(43, 134, 150, 0.2);
}

.message-bubble--user .message-bubble__avatar {
  order: 2;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(83, 169, 183, 0.18);
  color: var(--brand-strong);
}

.message-bubble__panel {
  padding: 16px 18px;
  border-radius: 24px;
  box-shadow: 0 14px 30px rgba(35, 84, 99, 0.08);
}

.message-bubble--assistant .message-bubble__panel {
  background: rgba(255, 255, 255, 0.96);
}

.message-bubble--user .message-bubble__panel {
  background: rgba(83, 169, 183, 0.14);
}

.message-bubble__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.message-bubble__role {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--brand-strong);
}

.message-bubble__time {
  color: var(--ink-muted);
  font-size: 0.82rem;
}

.message-bubble__content {
  color: var(--ink-strong);
  line-height: 1.8;
}

.message-bubble__content.markdown-body :deep(p) {
  margin: 0 0 8px;
}

.message-bubble__content.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.message-bubble__content.markdown-body :deep(h1),
.message-bubble__content.markdown-body :deep(h2),
.message-bubble__content.markdown-body :deep(h3),
.message-bubble__content.markdown-body :deep(h4) {
  margin: 0 0 8px;
  font-size: 1.05rem;
  color: var(--ink-strong);
}

.message-bubble__content.markdown-body :deep(ul),
.message-bubble__content.markdown-body :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}

.message-bubble__content.markdown-body :deep(li) {
  margin-bottom: 4px;
}

.message-bubble__content.markdown-body :deep(strong) {
  color: var(--ink-strong);
}

.empty-tip {
  padding: 16px 18px;
  border-radius: 20px;
  border: 1px dashed rgba(83, 169, 183, 0.24);
  background: rgba(255, 255, 255, 0.62);
  align-self: center;
  justify-self: center;
  color: var(--ink-muted);
}

.chat-composer {
  margin-top: 18px;
}

.composer-shell {
  padding: 18px;
  border-radius: 28px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 34px rgba(47, 98, 114, 0.08);
}

.composer-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.composer-shell__header span {
  color: var(--ink-muted);
  font-size: 0.92rem;
}

.composer-label {
  color: var(--ink-strong);
  font-weight: 700;
}

.composer-textarea {
  resize: none;
  border-radius: 22px;
  padding: 16px 18px;
  min-height: 30px;
  min-width: 650px;
  line-height: 1.8;
  border-color: rgba(83, 169, 183, 0.16);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 249, 252, 0.96));
}

.composer-disabled {
  padding: 18px 20px;
  border-radius: 24px;
  border: 1px solid rgba(83, 169, 183, 0.14);
  background: linear-gradient(180deg, rgba(245, 249, 251, 0.96), rgba(236, 244, 246, 0.94));
}

.composer-disabled__title,
.composer-disabled__text {
  margin: 0;
}

.composer-disabled__title {
  color: var(--ink-strong);
  font-weight: 700;
}

.composer-disabled__text {
  margin-top: 6px;
  color: var(--ink-muted);
  line-height: 1.7;
}

.composer-disabled__steps {
  font-size: 0.92rem;
}

.generating-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(83, 169, 183, 0.2);
  border-top-color: var(--brand-strong);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.interaction-card {
  display: grid;
  gap: 16px;
}

.interaction-pending {
  padding: 18px 20px;
  border-radius: 24px;
  border: 1px dashed rgba(83, 169, 183, 0.24);
  background: linear-gradient(180deg, rgba(247, 251, 253, 0.96), rgba(239, 247, 249, 0.92));
}

.interaction-pending__title,
.interaction-pending__text {
  margin: 0;
}

.interaction-pending__title {
  color: var(--ink-strong);
  font-weight: 700;
}

.interaction-pending__text {
  margin-top: 6px;
  color: var(--ink-muted);
  line-height: 1.7;
}

.interaction-pending__actions {
  margin-top: 16px;
}

.interaction-card__prompt {
  margin: 0;
  color: var(--ink-strong);
  line-height: 1.7;
}

.choice-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.choice-grid--compact {
  gap: 8px;
}

.choice-chip {
  border: 1px solid rgba(83, 169, 183, 0.18);
  background: rgba(248, 252, 255, 0.94);
  color: var(--ink-strong);
  border-radius: 999px;
  min-height: 2.75rem;
  padding: 0.6rem 1rem;
  text-align: left;
  transition: all 120ms ease;
}

.choice-chip--small {
  min-height: 2.35rem;
  padding: 0.45rem 0.85rem;
}

.choice-chip--check {
  border-radius: 18px;
}

.choice-chip.is-selected {
  border-color: rgba(43, 134, 150, 0.36);
  background: rgba(83, 169, 183, 0.16);
  color: var(--brand-strong);
  box-shadow: inset 0 0 0 1px rgba(43, 134, 150, 0.08);
}

.matrix-card,
.form-card {
  display: grid;
  gap: 14px;
}

.matrix-row {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  background: rgba(246, 251, 253, 0.92);
  border: 1px solid rgba(83, 169, 183, 0.1);
}

.matrix-row__label {
  margin: 0;
  color: var(--ink-strong);
  font-weight: 700;
}

.form-card__field {
  display: grid;
  gap: 8px;
  color: var(--ink-strong);
}

.composer-select,
.composer-input {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(83, 169, 183, 0.16);
  background: rgba(255, 255, 255, 0.96);
  padding: 0.85rem 0.95rem;
  color: var(--ink-strong);
}

.confirm-card {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.composer-actions {
  margin-top: 14px;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}

.composer-actions--card {
  justify-content: flex-end;
}

.voice-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: min(100%, 20rem);
}

.voice-panel__copy {
  display: grid;
  gap: 4px;
}

.voice-panel__copy strong {
  color: var(--ink-strong);
  font-size: 0.96rem;
}

.voice-panel p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.6;
}

.voice-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 4.6rem;
  min-height: 2.4rem;
  padding: 0 12px;
  border-radius: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

.voice-button__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(83, 169, 183, 0.3);
}

.voice-button__dot.is-live {
  background: var(--brand-strong);
  box-shadow: 0 0 0 5px rgba(83, 169, 183, 0.14);
}

.composer-submit {
  min-width: 7.6rem;
  min-height: 3rem;
}

.side-panel {
  display: grid;
  gap: 18px;
}

.summary-card,
.session-card,
.stream-card {
  padding: 22px;
}

.summary-card {
  background: linear-gradient(180deg, rgba(249, 252, 255, 0.9), rgba(237, 247, 248, 0.94));
}

.session-card,
.stream-card {
  background: rgba(248, 252, 255, 0.88);
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
.session-card__empty {
  color: var(--ink-muted);
}

.summary-stat strong {
  display: block;
  margin-top: 8px;
  color: var(--ink-strong);
  font-size: 1.35rem;
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
  align-items: flex-start;
}

.panel-header h3 {
  margin: 0;
  color: var(--ink-strong);
}

.panel-header p,
.panel-header span {
  margin: 6px 0 0;
  color: var(--ink-muted);
}

.session-list {
  margin-top: 16px;
  display: grid;
  gap: 14px;
  max-height: 24rem;
  overflow: auto;
}

.session-item {
  padding: 16px;
  border-radius: 22px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.84);
  display: grid;
  gap: 14px;
}

.session-item strong {
  color: var(--ink-strong);
}

.session-item.is-active {
  border-color: rgba(43, 134, 150, 0.32);
  background: rgba(83, 169, 183, 0.12);
  box-shadow: inset 0 0 0 1px rgba(43, 134, 150, 0.06);
}

.session-item__head,
.session-item__actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.session-item__copy {
  display: grid;
  gap: 6px;
}

.session-item__copy span {
  color: var(--ink-muted);
}

.session-item__marker {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(83, 169, 183, 0.12);
  color: var(--brand-strong);
  font-size: 0.84rem;
  font-weight: 700;
}

.session-item__meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(239, 246, 251, 0.96);
  color: var(--ink-muted);
  font-size: 0.9rem;
}

.status-chip--active {
  background: rgba(83, 169, 183, 0.14);
  color: var(--brand-strong);
}

.status-chip--ready {
  background: rgba(71, 162, 135, 0.12);
  color: #2f7b63;
}

.session-item__action {
  min-width: 6.75rem;
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

.interaction-modal {
  position: fixed;
  inset: 0;
  z-index: 38;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 43, 61, 0.22);
  backdrop-filter: blur(9px);
}

.interaction-modal__card {
  width: min(860px, calc(100vw - 40px));
  max-height: min(84vh, 960px);
  padding: 30px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top right, rgba(137, 207, 192, 0.14), transparent 18rem),
    linear-gradient(180deg, rgba(254, 255, 255, 0.99), rgba(242, 249, 250, 0.97));
  box-shadow: 0 34px 80px rgba(18, 45, 65, 0.22);
}

.interaction-modal__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.interaction-modal__header h3 {
  margin: 10px 0 0;
  color: var(--ink-strong);
  font-size: clamp(1.85rem, 2.8vw, 2.4rem);
}

.interaction-modal__body {
  margin-top: 22px;
  overflow: auto;
  padding-right: 4px;
}

.interaction-modal__prompt {
  font-size: clamp(1.08rem, 1.5vw, 1.26rem);
  line-height: 1.85;
}

.interaction-modal :deep(.eyebrow) {
  font-size: 0.96rem;
}

.interaction-modal .interaction-card {
  gap: 20px;
}

.interaction-modal .choice-grid {
  gap: 14px;
}

.interaction-modal .choice-chip {
  min-height: 3.35rem;
  padding: 0.82rem 1.32rem;
  border-radius: 22px;
  font-size: 1.06rem;
}

.interaction-modal .choice-chip--small {
  min-height: 3rem;
  padding: 0.72rem 1.12rem;
}

.interaction-modal .choice-chip--check {
  border-radius: 22px;
}

.interaction-modal .matrix-card,
.interaction-modal .form-card {
  gap: 16px;
}

.interaction-modal .matrix-row {
  gap: 14px;
  padding: 18px;
}

.interaction-modal .matrix-row__label,
.interaction-modal .form-card__field span {
  font-size: 1.04rem;
}

.interaction-modal .composer-select,
.interaction-modal .composer-input {
  min-height: 3.3rem;
  padding: 0.98rem 1.08rem;
  border-radius: 18px;
  font-size: 1.02rem;
}

.interaction-modal .confirm-card {
  gap: 14px;
}

.interaction-modal .composer-actions--card {
  margin-top: 4px;
}

.interaction-modal .composer-submit {
  min-width: 8.8rem;
  min-height: 3.3rem;
  font-size: 1.03rem;
}

.report-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 43, 61, 0.28);
  backdrop-filter: blur(10px);
}

.report-modal__card {
  width: min(760px, calc(100vw - 32px));
  max-height: min(80vh, 920px);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top right, rgba(137, 207, 192, 0.12), transparent 18rem),
    linear-gradient(180deg, rgba(254, 255, 255, 0.98), rgba(244, 250, 251, 0.96));
  box-shadow: 0 32px 80px rgba(18, 45, 65, 0.24);
}

.report-modal__header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.report-modal__header h3 {
  margin: 10px 0 0;
  color: var(--ink-strong);
  font-size: clamp(1.55rem, 2.3vw, 2rem);
}

.report-modal__header p:last-child {
  margin: 8px 0 0;
  color: var(--ink-muted);
}

.report-modal__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.report-modal__action {
  min-width: 6.75rem;
}

.report-modal__loading,
.report-modal__empty {
  margin-top: 20px;
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(83, 169, 183, 0.12);
  color: var(--ink-muted);
}

.report-modal__body {
  margin-top: 20px;
  display: grid;
  gap: 16px;
  overflow: auto;
  padding-right: 4px;
}

.report-modal__summary,
.report-modal__section {
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.9);
}

.report-modal__summary strong,
.report-modal__section h4 {
  margin: 0;
  color: var(--ink-strong);
}

.report-modal__summary p {
  margin: 10px 0 0;
  color: var(--ink);
  line-height: 1.8;
}

.report-modal__list {
  margin: 12px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

.report-modal__list li {
  color: var(--ink);
  line-height: 1.7;
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
  .chat-card {
    padding: 20px;
  }

  .chat-card__meta,
  .summary-card__actions,
  .summary-stats {
    grid-template-columns: 1fr;
  }

  .chat-stream {
    padding: 18px 14px;
  }

  .chat-card__header,
  .composer-shell__header,
  .composer-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .chat-card__header-actions {
    justify-items: stretch;
    max-width: none;
  }

  .chat-card__header-actions p {
    text-align: left;
  }

  .message-bubble {
    max-width: 100%;
  }

  .message-bubble,
  .message-bubble--user {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .message-bubble--user .message-bubble__avatar {
    order: 0;
  }

  .voice-panel {
    align-items: flex-start;
  }

  .session-item__actions {
    align-items: stretch;
  }

  .session-item__action,
  .report-modal__action {
    width: 100%;
  }

  .interaction-modal {
    padding: 14px;
  }

  .interaction-modal__card {
    width: 100%;
    max-height: calc(100vh - 28px);
    padding: 20px;
  }

  .interaction-modal__header {
    flex-direction: column;
    align-items: stretch;
  }

  .report-modal {
    padding: 14px;
  }

  .report-modal__card {
    width: 100%;
    max-height: calc(100vh - 28px);
    padding: 18px;
  }

  .report-modal__header,
  .report-modal__actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

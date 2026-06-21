<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
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
import chatAssistantAvatar from '@/assets/lanhu/chat-assistant-avatar.png'
import chatUserAvatar from '@/assets/lanhu/chat-user-avatar.png'
import iconCounselingAction from '@/assets/lanhu/icon-counseling-action.png'
import iconDialogue from '@/assets/lanhu/icon-dialogue.png'
import iconLargeText from '@/assets/lanhu/icon-large-text.png'
import iconNewAssessment from '@/assets/lanhu/icon-new-assessment.png'
import iconVoice from '@/assets/lanhu/icon-voice.png'
import { useGoogleStreamingSpeech } from '@/composables/useGoogleStreamingSpeech'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis'
import {
  clearStoredElderlySession,
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

function isLikelyBoldBoundary(line: string, index: number) {
  if (index <= 0) {
    return true
  }

  return /[\s([{>【「『“‘:：\-，。！？；、]/.test(line[index - 1])
}

function normalizeBrokenBoldLine(line: string) {
  const starRuns = Array.from(line.matchAll(/\*+/g))
  if (starRuns.length < 2) {
    return line
  }

  let normalizedLine = line
  let offset = 0

  for (let index = 0; index < starRuns.length - 1; index += 1) {
    const currentRun = starRuns[index]
    const nextRun = starRuns[index + 1]
    const currentLength = currentRun[0].length
    const nextLength = nextRun[0].length

    if (
      !(
        (currentLength === 1 && nextLength === 2) ||
        (currentLength === 2 && nextLength === 1)
      )
    ) {
      continue
    }

    const currentIndex = currentRun.index ?? 0
    const nextIndex = nextRun.index ?? 0
    if (!isLikelyBoldBoundary(line, currentIndex)) {
      continue
    }

    const contentBetween = line.slice(
      currentIndex + currentLength,
      nextIndex
    )
    if (!contentBetween.trim() || /^\s|\s$/.test(contentBetween)) {
      continue
    }

    if (currentLength === 1) {
      const insertIndex = currentIndex + offset
      normalizedLine = `${normalizedLine.slice(0, insertIndex)}*${normalizedLine.slice(insertIndex)}`
      offset += 1
    }

    if (nextLength === 1) {
      const insertIndex = nextIndex + offset
      normalizedLine = `${normalizedLine.slice(0, insertIndex)}*${normalizedLine.slice(insertIndex)}`
      offset += 1
    }
  }

  return normalizedLine
}

function normalizeMessageMarkdown(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => normalizeBrokenBoldLine(line))
    .join('\n')
}

function normalizeBindCodeFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const source = payload as Record<string, unknown>
  const candidates = [
    source.bindCode,
    source.bind_code,
    source.bindingCode,
    source.binding_code,
    source.elderBindCode,
    source.elder_bind_code,
    source.elderlyBindCode,
    source.elderly_bind_code,
    source.inviteCode,
    source.invite_code
  ]

  const matched = candidates.find((value) => typeof value === 'string' || typeof value === 'number')
  if (matched === undefined || matched === null) {
    const nestedSources = [source.profile, source.data, source.result, source.payload]
    for (const nested of nestedSources) {
      const nestedBindCode = normalizeBindCodeFromPayload(nested)
      if (nestedBindCode) {
        return nestedBindCode
      }
    }

    return ''
  }

  return String(matched).trim()
}

function renderMessageContent(content: string | undefined): string {
  if (!content) return '...'
  return md.render(normalizeMessageMarkdown(content))
}

function normalizeWelcomeSpeechText(text: string) {
  return (text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*(?:[-*+]|>\s*|\d+[.)])\s*/gm, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[#*_`~]+/g, '')
    .replace(/[（(【\[][^）)\]】\n]{1,40}[）)\]】]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

let welcomeAudio: HTMLAudioElement | null = null
let welcomeAudioUrl = ''
let welcomeTtsAbortController: AbortController | null = null
let isAssessmentPageActive = true

function stopWelcomeAudio() {
  welcomeTtsAbortController?.abort()
  welcomeTtsAbortController = null

  if (welcomeAudio) {
    welcomeAudio.pause()
    welcomeAudio.onended = null
    welcomeAudio.onerror = null
    welcomeAudio = null
  }

  if (welcomeAudioUrl) {
    URL.revokeObjectURL(welcomeAudioUrl)
    welcomeAudioUrl = ''
  }

  if (speakingMessageIndex.value === 0) {
    speakingMessageIndex.value = null
  }
}

function stopAllAssessmentAudio() {
  stopWelcomeAudio()
  stopSpeaking()
}

async function speakWelcomeMessage() {
  const firstMessage = messages.value[0]
  const welcomeText = firstMessage?.role === 'assistant'
    ? normalizeWelcomeSpeechText(firstMessage.content)
    : ''
  if (!welcomeText) {
    return
  }

  await nextTick()
  autoSpeakAssistantMessage(welcomeText, 0)
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
const interactionLaunchRequested = ref(false)
const shouldOpenNextInteraction = ref(false)
const interactionValues = ref<Record<string, unknown>>({})
const errorMessage = ref('')
const copyIdButtonText = ref('复制号码')
const completionPercent = ref<number | null>(null)
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)
const selectedReportLoading = ref(false)
const downloadingReportId = ref('')
const openingSessionReportId = ref('')
const largeTextMode = ref(false)
const speakingMessageIndex = ref<number | null>(null)
const promptedInteractionMessageId = ref('')
const interactionMissingFields = ref<string[]>([])

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
const selectedReportSpeechText = computed(() => {
  const normalizedReport = selectedReportView.value
  if (!normalizedReport) {
    return ''
  }

  const parts = ['健康评估与照护行动计划']
  if (normalizedReport.summary) {
    parts.push(`摘要：${normalizedReport.summary}`)
  }

  for (const section of selectedReportPointSections.value) {
    parts.push(section.title)
    parts.push(...section.items)
  }

  return normalizeWelcomeSpeechText(parts.join('。'))
})
const elderlyUserId = computed(() => elderlyAccessSession.value?.userId || '')
const elderlyBindCode = computed(() => elderlyAccessSession.value?.bindCode || '')
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
  () => Boolean(
    currentInteraction.value &&
    !isChatInputMode.value &&
    interactionLaunchRequested.value &&
    interactionModalVisible.value &&
    !generatingReport.value
  )
)
const interactionEntryLabel = computed(() =>
  currentInteraction.value?.kind === 'confirm' ? '打开确认卡片' : '打开选择题卡片'
)
const CARD_INTERACTION_NOTICE =
  '这几道题为方便您回答，会直接弹出一个小卡片，请点击下方按钮打开卡片，您可以根据实际情况进行选择。'
const CONFIRM_INTERACTION_NOTICE =
  '信息已经收集得差不多了。请点击下方按钮打开确认卡片，确认无误后就可以生成报告。'
const SKIP_VALUE = '__SKIPPED__'
const INTERACTION_SPEECH_INDEX = -1
const REPORT_SPEECH_INDEX = -2
const inputPlaceholder = computed(() =>
  sending.value
    ? '正在发送，请稍候。'
    : '请按上方问题回答，也可以补充您觉得重要的情况。'
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
  speak: speakText,
  stop: stopSpeaking,
  isSpeaking: isTtsSpeaking,
  isPending: isTtsPending,
  isSupported: isTtsSupported
} = useSpeechSynthesis({
  lang: 'zh-CN',
  rate: 0.9,
  preferChinese: true
})
const isReportAudioActive = computed(
  () => speakingMessageIndex.value === REPORT_SPEECH_INDEX && (isTtsSpeaking.value || isTtsPending.value)
)

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

watch([isTtsSpeaking, isTtsPending], ([speaking, pending]) => {
  if (!speaking && !pending) {
    speakingMessageIndex.value = null
  }
})

function cloneJson<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T
}

function resetInteractionValues(interaction: ChatInteraction | null) {
  interactionMissingFields.value = []

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
  interactionMissingFields.value = interactionMissingFields.value.filter((item) => item !== key)
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

function isInteractionFieldMissing(key: string | undefined) {
  return Boolean(key && interactionMissingFields.value.includes(key))
}

function getInteractionMissingLabels(interaction: ChatInteraction) {
  if (interaction.kind === 'single_choice' && interaction.field) {
    return getInteractionFieldValue(interaction.field)
      ? []
      : [{ key: interaction.field, label: interaction.prompt || '当前题目' }]
  }

  if (interaction.kind === 'matrix_single_choice') {
    return interactionItems.value
      .filter((item) => !getInteractionFieldValue(item.key))
      .map((item) => ({ key: item.key, label: item.label }))
  }

  if (interaction.kind === 'form_card') {
    return interactionFields.value
      .filter((field) => !getInteractionFieldValue(field.key))
      .map((field) => ({ key: field.key, label: field.label }))
  }

  return []
}

function setMissingInteractionFields(missing: Array<{ key: string; label: string }>) {
  interactionMissingFields.value = missing.map((item) => item.key)
  errorMessage.value = ''
}

function buildInteractionSubmitValues(interaction: ChatInteraction) {
  if (interaction.kind === 'single_choice' && interaction.field) {
    return { [interaction.field]: getInteractionFieldValue(interaction.field) }
  }

  if (interaction.kind === 'matrix_single_choice') {
    return Object.fromEntries(
      interactionItems.value.map((item) => [item.key, getInteractionFieldValue(item.key)])
    )
  }

  if (interaction.kind === 'multi_select') {
    const selected = Array.isArray(interactionValues.value.selected)
      ? interactionValues.value.selected.map((item) => String(item))
      : []
    return { selected }
  }

  if (interaction.kind === 'form_card') {
    const values: Record<string, unknown> = {}
    for (const field of interactionFields.value) {
      values[field.key] = getInteractionFieldValue(field.key)
      if (field.custom_key) {
        values[field.custom_key] = getInteractionFieldValue(field.custom_key)
      }
    }
    return values
  }

  return {}
}

function buildInteractionSkipValues(interaction: ChatInteraction) {
  if (interaction.kind === 'single_choice' && interaction.field) {
    const value = getInteractionFieldValue(interaction.field)
    return { [interaction.field]: value || SKIP_VALUE }
  }

  if (interaction.kind === 'matrix_single_choice') {
    return Object.fromEntries(
      interactionItems.value.map((item) => [item.key, getInteractionFieldValue(item.key) || SKIP_VALUE])
    )
  }

  if (interaction.kind === 'multi_select') {
    const selected = Array.isArray(interactionValues.value.selected)
      ? interactionValues.value.selected.map((item) => String(item))
      : []
    return { selected: selected.length > 0 ? selected : SKIP_VALUE }
  }

  if (interaction.kind === 'form_card') {
    const values: Record<string, unknown> = {}
    for (const field of interactionFields.value) {
      const value = getInteractionFieldValue(field.key)
      values[field.key] = value || SKIP_VALUE
      if (field.custom_key && value) {
        values[field.custom_key] = getInteractionFieldValue(field.custom_key)
      }
    }
    return values
  }

  return {}
}

function describeInteractionAnswer(interaction: ChatInteraction, values: Record<string, unknown>): string {
  if (interaction.kind === 'single_choice' && interaction.field) {
    const answer = getStringValue(values[interaction.field])
    if (answer === SKIP_VALUE) {
      return `跳过：${interaction.prompt}`
    }
    return answer || '已提交选项'
  }

  if (interaction.kind === 'matrix_single_choice') {
    if ((interaction.items || []).every((item) => getStringValue(values[item.key]) === SKIP_VALUE)) {
      return `跳过：${interaction.prompt}`
    }
    return (interaction.items || [])
      .map((item) => {
        const value = getStringValue(values[item.key])
        return value === SKIP_VALUE ? `${item.label}：跳过` : `${item.label}：${value}`
      })
      .filter((item) => item.replace(/：$/, '') !== '')
      .join('；')
  }

  if (interaction.kind === 'multi_select') {
    if (values.selected === SKIP_VALUE) {
      return `跳过：${interaction.prompt}`
    }
    const selected = new Set(Array.isArray(values.selected) ? values.selected.map((item) => String(item)) : [])
    const labels = (interaction.items || [])
      .filter((item) => selected.has(item.key))
      .map((item) => item.label)
    return labels.length > 0 ? `已选择：${labels.join('、')}` : '已选择：无'
  }

  if (interaction.kind === 'form_card') {
    if (interactionFields.value.every((field) => getStringValue(values[field.key]) === SKIP_VALUE)) {
      return `跳过：${interaction.prompt}`
    }
    return interactionFields.value
      .map((field) => {
        const value = getStringValue(values[field.key])
        if (value === SKIP_VALUE) {
          return `${field.label}：跳过`
        }
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

function isCardInteraction(interaction: ChatInteraction | null | undefined) {
  return Boolean(interaction && interaction.kind !== 'chat' && interaction.kind !== 'confirm')
}

function getInteractionNoticeText(interaction: ChatInteraction | null | undefined) {
  if (!interaction || interaction.kind === 'chat') {
    return ''
  }

  return interaction.kind === 'confirm' ? CONFIRM_INTERACTION_NOTICE : CARD_INTERACTION_NOTICE
}

function isInteractionLaunchMessage(message: ChatMessage, index: number) {
  const expectedText = getInteractionNoticeText(currentInteraction.value)
  if (!expectedText || message.role !== 'assistant' || message.content.trim() !== expectedText) {
    return false
  }

  for (let messageIndex = messages.value.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const candidate = messages.value[messageIndex]
    if (candidate.role === 'assistant' && candidate.content.trim() === expectedText) {
      return messageIndex === index
    }
  }

  return false
}

function shouldShowInteractionScrollHint(interaction: ChatInteraction | null | undefined) {
  return Boolean(interaction && ['g4_badl', 'g5_iadl'].includes(interaction.id))
}

function appendInteractionPromptMessage() {
  const interaction = currentInteraction.value
  if (!isCardInteraction(interaction) || !interaction?.prompt.trim()) {
    return
  }

  if (promptedInteractionMessageId.value === interaction.id) {
    return
  }

  promptedInteractionMessageId.value = interaction.id
  messages.value.push({
    role: 'assistant',
    content: interaction.prompt
  })
  persistCurrentSnapshot()
  void nextTick().then(scrollChatToBottom)
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

function getLocalSessionMetadata(userId?: string) {
  return sortSessionsByCreatedAt(
    dedupeSessions(getStoredElderlySessionSnapshots(userId).map((snapshot) => snapshot.metadata))
  )
}

function hydrateSessionsFromLocal(userId?: string) {
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
    accessSession: elderlyAccessSession.value ? cloneJson(elderlyAccessSession.value) : undefined,
    messages: messages.value.map((message) => ({ ...message })),
    profile: Object.keys(profile.value || {}).length > 0 ? cloneJson(profile.value) : undefined,
    reports: cloneJson(reports.value),
    conversationState: conversationState.value,
    completionPercent: completionPercent.value,
    currentInteraction: currentInteraction.value ? cloneJson(currentInteraction.value) : null
  })
}

function setCurrentInteraction(nextInteraction: ChatInteraction | null | undefined) {
  const previousInteraction = currentInteraction.value
  const normalizedInteraction = nextInteraction ? cloneJson(nextInteraction) : null
  const hasInteractionChanged =
    (previousInteraction?.id || '') !== (normalizedInteraction?.id || '') ||
    (previousInteraction?.kind || '') !== (normalizedInteraction?.kind || '') ||
    (previousInteraction?.prompt || '') !== (normalizedInteraction?.prompt || '')
  const shouldAutoOpen =
    shouldOpenNextInteraction.value &&
    Boolean(normalizedInteraction && normalizedInteraction.kind !== 'chat' && normalizedInteraction.kind !== 'confirm')

  currentInteraction.value = normalizedInteraction
  if (!normalizedInteraction || normalizedInteraction.kind === 'chat') {
    if (interactionModalTimer.value) {
      clearTimeout(interactionModalTimer.value)
      interactionModalTimer.value = null
    }
    shouldOpenNextInteraction.value = false
    interactionLaunchRequested.value = false
    interactionModalVisible.value = false
    resetInteractionValues(currentInteraction.value)
    return
  }

  if (shouldAutoOpen) {
    if (interactionModalTimer.value) {
      clearTimeout(interactionModalTimer.value)
      interactionModalTimer.value = null
    }
    shouldOpenNextInteraction.value = false
    interactionLaunchRequested.value = true
    interactionModalVisible.value = true
  } else if (hasInteractionChanged) {
    interactionLaunchRequested.value = false
    interactionModalVisible.value = false
  }

  if (hasInteractionChanged) {
    resetInteractionValues(currentInteraction.value)
  }
}

function applyStoredSessionSnapshot(targetSessionId: string, message: string) {
  const snapshot = getStoredElderlySessionSnapshot(targetSessionId)
  if (!snapshot) {
    return false
  }

  if (snapshot.accessSession) {
    updateActiveElderlySession(snapshot.accessSession)
    setStoredSession(snapshot.accessSession)
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

  if (isTtsSpeaking.value || isTtsPending.value) {
    stopSpeaking()
  }
  interactionLaunchRequested.value = true
  interactionModalVisible.value = true
  appendInteractionPromptMessage()
}

function speakInteractionPrompt() {
  const promptText = currentInteraction.value?.prompt?.trim()
  if (!promptText || !isTtsSupported.value) {
    return
  }

  if (speakingMessageIndex.value === INTERACTION_SPEECH_INDEX && (isTtsSpeaking.value || isTtsPending.value)) {
    stopSpeaking()
    return
  }

  if (isTtsSpeaking.value || isTtsPending.value) {
    stopSpeaking()
  }

  speakingMessageIndex.value = INTERACTION_SPEECH_INDEX
  void speakText(promptText).catch(() => {
    if (speakingMessageIndex.value === INTERACTION_SPEECH_INDEX) {
      speakingMessageIndex.value = null
    }
  })
}

function dismissInteractionModal() {
  interactionLaunchRequested.value = false
  interactionModalVisible.value = false
  interactionMissingFields.value = []
}

function toggleLargeTextMode() {
  largeTextMode.value = !largeTextMode.value
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

function applyBindCode(nextBindCode: string) {
  const bindCode = nextBindCode.trim()
  if (!bindCode) {
    return
  }

  if (elderlyAccessSession.value?.bindCode === bindCode) {
    return
  }

  if (elderlyAccessSession.value) {
    const nextSession = {
      ...elderlyAccessSession.value,
      bindCode
    } satisfies ElderlyAuthSession
    elderlyAccessSession.value = nextSession
    setStoredSession(nextSession)
  }
}

async function resolveBindCodeForCopy() {
  if (elderlyBindCode.value) {
    return elderlyBindCode.value
  }

  if (!elderlyToken.value) {
    console.warn('[绑定码] elderlyToken 为空，无法请求老人资料')
    return ''
  }

  try {
    const selfProfile = await getElderlyProfile(elderlyToken.value)
    console.log('[绑定码] getElderlyProfile 返回：', selfProfile)
    const bindCode = normalizeBindCodeFromPayload(selfProfile)
    if (!bindCode) {
      console.warn('[绑定码] 老人资料中未找到号码字段')
      return ''
    }
    applyBindCode(bindCode)
    return bindCode
  } catch (error) {
    console.error('[绑定码] getElderlyProfile 请求失败：', error)
    errorMessage.value = '号码获取失败，请检查后端是否返回了号码。'
    return ''
  }
}

async function copyBindCode() {
  const bindCode = await resolveBindCodeForCopy()

  if (!bindCode) {
    copyIdButtonText.value = '号码未就绪'
    window.setTimeout(() => {
      copyIdButtonText.value = '复制号码'
    }, 1600)
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(bindCode)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = bindCode
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
    copyIdButtonText.value = '复制号码'
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
    userType: response.userType,
    bindCode: normalizeBindCodeFromPayload(response)
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
  if (isReportAudioActive.value) {
    stopSpeaking()
  }
  resetSelectedReport()
}

function handleSpeakReport() {
  handleSpeakMessage(selectedReportSpeechText.value, REPORT_SPEECH_INDEX)
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

  const selfBindCode = normalizeBindCodeFromPayload(selfProfile)
  if (selfBindCode && elderlyAccessSession.value && elderlyAccessSession.value.bindCode !== selfBindCode) {
    const nextSession = {
      ...elderlyAccessSession.value,
      bindCode: selfBindCode
    } satisfies ElderlyAuthSession
    elderlyAccessSession.value = nextSession
    setStoredSession(nextSession)
  }
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
  stopSpeaking()

  try {
    const localSnapshot = getStoredElderlySessionSnapshot(targetSessionId)
    const effectiveToken = localSnapshot?.accessSession?.token || token
    if (localSnapshot?.accessSession) {
      updateActiveElderlySession(localSnapshot.accessSession)
      setStoredSession(localSnapshot.accessSession)
    }

    updateCurrentSessionId(targetSessionId)
    const detail = await getSessionDetail(targetSessionId, effectiveToken)
    const conversation =
      detail.conversation && detail.conversation.length > 0
        ? detail.conversation
        : await getChatHistory(targetSessionId, effectiveToken)

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
      refreshProgressState(targetSessionId, effectiveToken).catch(() => {}),
      refreshSessionArtifacts(targetSessionId, effectiveToken),
      refreshSessions(effectiveToken)
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
  stopSpeaking()
  resetSelectedReport()

  try {
    persistCurrentSnapshot()
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
      refreshProgressState(response.sessionId, response.accessToken),
      refreshSessionArtifacts(response.sessionId, response.accessToken)
    ])
    persistCurrentSnapshot(resolveSnapshotMetadata(response.sessionId))
    await speakWelcomeMessage()
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
  if (session.value?.role !== 'elderly') {
    setStoredSession(preferredSession)
  }
  hydrateSessionsFromLocal()

  try {
    const availableSessions = await refreshSessions(preferredSession.token)
    const targetSessionId = resolveInitialSessionId(preferredSession, availableSessions)
    await loadExistingSession(targetSessionId, preferredSession.token)
  } catch (error) {
    if (isForbidden(error)) {
      clearStoredElderlySession()
      clearStoredElderlySessionSnapshot(preferredSession.sessionId)
      await createNewSession()
      return
    }

    const localSessions = hydrateSessionsFromLocal()
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
  stopSpeaking()

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

    if (isCardInteraction(response.interaction)) {
      messages.value[assistantIndex].content = CARD_INTERACTION_NOTICE
    }

    await finalizeInteractionResponse(response)
    autoSpeakAssistantMessage(messages.value[assistantIndex]?.content || response.message, assistantIndex)
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
  const canContinueWithNextCard = interaction.kind !== 'confirm'
  sending.value = true
  generatingReport.value = interaction.kind === 'confirm'
  errorMessage.value = ''
  clearVoiceInput()
  stopSpeaking()

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
    if (isCardInteraction(response.interaction) && canContinueWithNextCard) {
      messages.value.splice(assistantIndex, 1)
    } else {
      await revealAssistantMessage(assistantIndex, response.message)
    }
    shouldOpenNextInteraction.value = canContinueWithNextCard
    promptedInteractionMessageId.value = ''
    await finalizeInteractionResponse(response)
    if (!isCardInteraction(response.interaction)) {
      autoSpeakAssistantMessage(messages.value[assistantIndex]?.content || response.message, assistantIndex)
    }
    return true
  } catch (error) {
    shouldOpenNextInteraction.value = false
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

function autoSpeakAssistantMessage(content: string, index: number) {
  const nextContent = content.trim()
  if (!nextContent || !isTtsSupported.value) {
    return
  }

  if (isTtsSpeaking.value || isTtsPending.value) {
    stopSpeaking()
  }

  speakingMessageIndex.value = index
  void speakText(nextContent).catch(() => {
    if (speakingMessageIndex.value === index) {
      speakingMessageIndex.value = null
    }
  })
}

function handleSpeakMessage(content: string, index: number) {
  const nextContent = content.trim()
  if (!nextContent || !isTtsSupported.value) {
    return
  }

  if (isSpeechIndexActive(index)) {
    stopSpeaking()
    return
  }

  if (isTtsSpeaking.value || isTtsPending.value) {
    stopSpeaking()
  }

  speakingMessageIndex.value = index
  void speakText(nextContent).catch(() => {
    if (speakingMessageIndex.value === index) {
      speakingMessageIndex.value = null
    }
  })
}

function isSpeechIndexActive(index: number) {
  return speakingMessageIndex.value === index && (isTtsSpeaking.value || isTtsPending.value)
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

  const missing = getInteractionMissingLabels(interaction)
  if (missing.length > 0) {
    setMissingInteractionFields(missing)
    return
  }

  interactionMissingFields.value = []
  await submitStructuredInteraction(buildInteractionSubmitValues(interaction))
}

async function handleSkipInteraction() {
  if (!currentInteraction.value || currentInteraction.value.kind === 'confirm') {
    return
  }

  errorMessage.value = ''
  const interaction = currentInteraction.value
  const missing = getInteractionMissingLabels(interaction)
  const confirmMessage = missing.length > 0
    ? `确定跳过未完成的项目吗？已选择的内容会正常提交，未选择的 ${missing.map((item) => `“${item.label}”`).join('、')} 会标记为空缺。`
    : '确定跳过当前题卡吗？'
  const confirmed = window.confirm(confirmMessage)
  if (!confirmed) {
    return
  }

  interactionMissingFields.value = []
  await submitStructuredInteraction(buildInteractionSkipValues(interaction))
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
      interactionLaunchRequested.value = false
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
  },
  {
    immediate: true
  }
)

watch(showInteractionModal, async (visible, previousVisible) => {
  if (!visible || previousVisible) {
    return
  }

  if (currentInteraction.value?.kind === 'confirm') {
    return
  }

  await nextTick()
  appendInteractionPromptMessage()
  speakInteractionPrompt()
})

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
  isAssessmentPageActive = true
  await initializeAssessment()
})

onUnmounted(() => {
  isAssessmentPageActive = false
  clearVoiceInput()
  stopAllAssessmentAudio()
})

onBeforeRouteLeave(() => {
  isAssessmentPageActive = false
  clearVoiceInput()
  stopAllAssessmentAudio()
})
</script>

<template>
  <div class="page-width role-page elderly-page" :class="{ 'elderly-page--large-text': largeTextMode }">
    <section class="assessment-layout">
      <article class="surface-card chat-card">
        <header class="chat-card__header">
          <div class="chat-card__intro">
            <p class="eyebrow">长者端</p>
            <h2>对话采集</h2>
            <p class="chat-card__lead">按大字号对话、语音输入和结构化题卡，逐步完成健康信息采集。</p>
          </div>
          <div class="chat-card__header-actions">
            <p>这是您的号码，可复制给您的家属绑定</p>
            <strong class="elderly-bind-code">
              {{ elderlyBindCode || '号码生成中...' }}
            </strong>
            <div class="chat-card__header-tools">
              <button
                class="secondary-button copy-id-button"
                type="button"
                :disabled="!elderlyUserId || loading"
                @click="copyBindCode"
              >
                <img class="tool-icon" :src="iconDialogue" alt="" />
                {{ copyIdButtonText }}
              </button>
              <button class="secondary-button copy-id-button" type="button" @click="toggleLargeTextMode">
                <img class="tool-icon" :src="iconLargeText" alt="" />
                {{ largeTextMode ? '标准字号' : '大字模式' }}
              </button>
            </div>
          </div>
        </header>

        <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

        <div ref="chatBodyRef" class="chat-stream">
          <article
            v-for="(message, index) in messages"
            :key="`${message.role}-${index}`"
            class="message-bubble"
            :class="[
              `message-bubble--${message.role}`,
              { 'message-bubble--notice': isInteractionLaunchMessage(message, index) }
            ]"
          >
            <span class="message-bubble__avatar">
              <img
                :src="message.role === 'assistant' ? chatAssistantAvatar : chatUserAvatar"
                :alt="message.role === 'assistant' ? '健康助手' : '我'"
              />
            </span>
            <div class="message-bubble__panel">
              <div class="message-bubble__meta">
                <span class="message-bubble__role">{{ message.role === 'assistant' ? '健康助手' : '我' }}</span>
                <span v-if="message.timestamp" class="message-bubble__time">
                  {{ formatDateTime(message.timestamp) }}
                </span>
                <button
                  v-if="message.role === 'assistant' && message.content && isTtsSupported"
                  class="speech-button"
                  :class="{ 'speech-button--active': isSpeechIndexActive(index) }"
                  type="button"
                  :aria-label="isSpeechIndexActive(index) ? '停止朗读' : '朗读这条回复'"
                  @click="handleSpeakMessage(message.content, index)"
                >
                  {{ isSpeechIndexActive(index) ? '停止' : '朗读' }}
                </button>
              </div>
              <div class="message-bubble__content markdown-body" v-html="renderMessageContent(message.content)"></div>
              <button
                v-if="isInteractionLaunchMessage(message, index)"
                class="primary-button notice-launch-button"
                type="button"
                @click="openInteractionModal"
              >
                {{ interactionEntryLabel }}
              </button>
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
                <label class="composer-label">评估进行中</label>
              </div>
              <div class="composer-disabled">
                <p class="composer-disabled__title">
                  <span class="generating-spinner" />
                  评估进行中
                </p>
                <p class="composer-disabled__text">
                  请您稍等4-5分钟，我们正在为您准备评估报告
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
                :placeholder="inputPlaceholder"
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
                    <img class="tool-icon" :src="iconVoice" alt="" />
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
              <div class="interaction-launcher">
                <button class="primary-button composer-submit" type="button" @click="openInteractionModal">
                  {{ interactionEntryLabel }}
                </button>
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
              <img class="tool-icon" :src="iconNewAssessment" alt="" />
              新建独立评估
            </button>
            <button
              class="secondary-button summary-card__action"
              type="button"
              :disabled="loading || !elderlyToken"
              @click="router.push('/elderly/counseling')"
            >
              <img class="tool-icon" :src="iconCounselingAction" alt="" />
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
              role="button"
              tabindex="0"
              @click="switchSession(item.session_id)"
              @keydown.enter.prevent="switchSession(item.session_id)"
              @keydown.space.prevent="switchSession(item.session_id)"
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
                  @click.stop="handleOpenSessionReport(item)"
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
            <div class="interaction-card__prompt-row">
              <p class="interaction-card__prompt interaction-modal__prompt">{{ currentInteraction.prompt }}</p>
              <button
                class="speech-button speech-button--inline"
                :class="{ 'speech-button--active': isSpeechIndexActive(INTERACTION_SPEECH_INDEX) }"
                type="button"
                :aria-label="isSpeechIndexActive(INTERACTION_SPEECH_INDEX) ? '停止朗读题目' : '朗读题目'"
                @click="speakInteractionPrompt"
              >
                {{ isSpeechIndexActive(INTERACTION_SPEECH_INDEX) ? '停止' : '朗读' }}
              </button>
            </div>
            <p v-if="shouldShowInteractionScrollHint(currentInteraction)" class="interaction-card__scroll-hint">
              您可以上下滑动查看所有问题
            </p>

            <template v-if="currentInteraction.kind === 'single_choice' && currentInteraction.field">
              <div class="choice-grid">
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
              <p
                v-if="isInteractionFieldMissing(currentInteraction.field)"
                class="interaction-card__error"
              >
                请先选择这一项。
              </p>
            </template>

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
                <p v-if="isInteractionFieldMissing(item.key)" class="interaction-card__error">
                  请先选择“{{ item.label }}”。
                </p>
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
              <section v-for="field in interactionFields" :key="field.key" class="form-card__field form-card__field--choice">
                <p class="form-card__field-label">{{ field.label }}</p>
                <div class="choice-grid choice-grid--compact">
                  <button
                    v-for="option in field.options || []"
                    :key="`${field.key}-${option.value}`"
                    class="choice-chip choice-chip--small"
                    :class="{ 'is-selected': isInteractionValueSelected(field.key, option.value) }"
                    type="button"
                    @click="setInteractionFieldValue(field.key, option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <p v-if="isInteractionFieldMissing(field.key)" class="interaction-card__error">
                  请先选择“{{ field.label }}”。
                </p>
                <input
                  v-if="field.custom_key && getInteractionFieldValue(field.key) === '其他'"
                  class="composer-input"
                  :value="getInteractionFieldValue(field.custom_key)"
                  :placeholder="field.placeholder || '请补充说明'"
                  @input="setInteractionFieldValue(field.custom_key, String(($event.target as HTMLInputElement).value || ''))"
                />
              </section>
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
                class="primary-button composer-submit"
                type="button"
                :disabled="loading || sending"
                @click="handleCurrentInteractionSubmit"
              >
                {{ sending ? '提交中...' : (currentInteraction.submitLabel || '提交答案') }}
              </button>
              <button
                class="secondary-button composer-submit composer-submit--light"
                type="button"
                :disabled="sending"
                @click="dismissInteractionModal"
              >
                取消
              </button>
              <button
                class="ghost-button composer-submit composer-submit--light"
                type="button"
                :disabled="loading || sending"
                @click="handleSkipInteraction"
              >
                跳过
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
            <h3>健康评估与照护行动计划</h3>
            <p>
              {{ selectedReportLoading ? '正在同步当前报告内容' : formatDateTime(selectedReportView?.generatedAt || '') }}
            </p>
          </div>

          <div class="report-modal__actions">
            <button
              class="secondary-button report-modal__action"
              type="button"
              :disabled="selectedReportLoading || !selectedReportSpeechText"
              @click="handleSpeakReport"
            >
              {{ isReportAudioActive ? '停止朗读' : '朗读报告' }}
            </button>
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
          <article class="report-modal__notice">
            本报告内容仅供健康管理参考，不能替代医生诊断和治疗建议。如有身体不适，请及时就医并遵医嘱。
          </article>

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
  height: clamp(48rem, calc(100vh - 7rem), 60rem);
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
}

.chat-card__intro {
  max-width: 32rem;
}

.chat-card__header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  max-width: 24rem;
}

.chat-card__header-tools {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
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

.tool-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  margin-right: 8px;
  flex-shrink: 0;
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

.message-bubble--notice .message-bubble__panel {
  border: 1px solid rgba(83, 169, 183, 0.18);
  background: rgba(235, 248, 249, 0.96);
}

.notice-launch-button {
  margin-top: 12px;
  min-height: 2.8rem;
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

.speech-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3.5rem;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(83, 169, 183, 0.18);
  background: rgba(255, 255, 255, 0.82);
  color: var(--brand-strong);
  font-size: 0.86rem;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(35, 84, 99, 0.08);
}

.speech-button:hover {
  border-color: rgba(83, 169, 183, 0.34);
  background: rgba(235, 248, 249, 0.96);
}

.speech-button--active {
  border-color: rgba(43, 134, 150, 0.36);
  background: rgba(83, 169, 183, 0.16);
  color: var(--ink-strong);
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
  min-height: 4rem;
  width: 100%;
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

.interaction-card__prompt-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.interaction-card__prompt-row .interaction-card__prompt {
  margin: 0;
  flex: 1;
}

.speech-button--inline {
  flex-shrink: 0;
  margin-top: 2px;
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

.interaction-launcher {
  display: flex;
  justify-content: flex-end;
}

.interaction-card__prompt {
  margin: 0;
  color: var(--ink-strong);
  line-height: 1.7;
}

.interaction-card__scroll-hint {
  margin: -6px 0 0;
  color: var(--ink-muted);
  font-size: 0.98rem;
  line-height: 1.6;
}

.interaction-card__error {
  margin: 6px 0 0;
  color: #c43d3d;
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1.5;
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

.form-card__field--choice {
  padding: 14px;
  border-radius: 20px;
  background: rgba(246, 251, 253, 0.92);
  border: 1px solid rgba(83, 169, 183, 0.1);
}

.form-card__field-label {
  margin: 0;
  color: var(--ink-strong);
  font-weight: 700;
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
  width: min(860px, calc(100vw - 32px));
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
  font-size: clamp(1.42rem, 2vw, 1.9rem);
  white-space: nowrap;
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
.report-modal__notice,
.report-modal__section {
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.9);
}

.report-modal__notice {
  border-color: rgba(190, 143, 55, 0.22);
  background: rgba(255, 250, 236, 0.94);
  color: #7a5a21;
  line-height: 1.75;
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

.elderly-page--large-text .chat-card__header p,
.elderly-page--large-text .message-bubble__content,
.elderly-page--large-text .composer-textarea,
.elderly-page--large-text .voice-panel__copy strong,
.elderly-page--large-text .summary-stat span,
.elderly-page--large-text .session-item__copy,
.elderly-page--large-text .status-chip,
.elderly-page--large-text .report-modal__body {
  font-size: 1.12rem;
}

.elderly-page--large-text .message-bubble__content,
.elderly-page--large-text .report-modal__body {
  line-height: 1.95;
}

.elderly-page--large-text .choice-chip,
.elderly-page--large-text .composer-submit,
.elderly-page--large-text .secondary-button,
.elderly-page--large-text .primary-button,
.elderly-page--large-text .ghost-button {
  font-size: 1.05rem;
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

/* Design-shot layout override */
.elderly-page {
  width: 100%;
  margin: 0;
  padding-right: 28px;
  padding-left: 28px;
  padding-top: 0;
  background: #eef7f8;
}

.assessment-layout {
  min-height: calc(100vh - 122px);
  height: calc(100vh - 122px);
  grid-template-columns: minmax(0, 1fr) 372px;
  gap: 0;
  align-items: stretch;
  background: #eef7f8;
  border-radius: 0;
  overflow: hidden;
}

.chat-card {
  height: calc(100vh - 122px);
  min-height: 760px;
  padding: 0 24px 222px 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #eef7f8;
  box-shadow: none;
}

.chat-card::before {
  display: none;
}

.chat-card__header {
  min-height: 68px;
  padding: 22px 0 10px 0;
  display: flex;
  align-items: center;
  gap: 28px;
}

.chat-card__intro {
  display: flex;
  align-items: center;
  gap: 34px;
  max-width: none;
}

.chat-card__intro .eyebrow,
.chat-card__lead {
  display: none;
}

.chat-card__header h2 {
  margin: 0;
  color: #05080c;
  font-size: 1.86rem;
  line-height: 1.2;
  font-weight: 900;
}

.chat-card__header-actions {
  max-width: none;
  flex: 1;
  align-items: center;
  justify-content: flex-start;
  gap: 20px;
}

.chat-card__header-actions p {
  color: #8b939a;
  text-align: left;
  font-size: 1.05rem;
}

.chat-card__header-tools {
  gap: 8px;
}

.copy-id-button {
  min-width: auto;
  min-height: 34px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: #2b8696;
  box-shadow: none;
  font-weight: 900;
}

.chat-stream {
  flex: 1;
  margin-top: 0;
  padding: 18px 18px 28px 0;
  gap: 58px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  scrollbar-color: rgba(171, 181, 187, 0.55) transparent;
}

.message-bubble {
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  max-width: 100%;
}

.message-bubble--assistant {
  justify-self: stretch;
}

.message-bubble--user {
  justify-self: end;
  width: min(420px, 38%);
  grid-template-columns: minmax(0, 1fr) 56px;
}

.message-bubble__avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: transparent;
  box-shadow: none;
}

.message-bubble__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-bubble--assistant .message-bubble__avatar,
.message-bubble--user .message-bubble__avatar {
  background: transparent;
  border: 0;
  box-shadow: none;
}

.message-bubble--assistant .message-bubble__panel {
  width: min(100%, 1330px);
  padding: 22px 26px 24px;
  border-radius: 0 16px 16px 16px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: none;
}

.message-bubble--user .message-bubble__panel {
  padding: 14px 20px;
  border-radius: 14px;
  background: #4aa0a3;
  color: #fff;
  box-shadow: none;
}

.message-bubble__meta {
  justify-content: flex-start;
  gap: 18px;
  margin-bottom: 14px;
}

.message-bubble__role {
  color: #6b7378;
  font-size: 1rem;
}

.message-bubble__time {
  color: #8d969c;
  font-size: 1rem;
}

.message-bubble--user .message-bubble__meta {
  justify-content: flex-end;
  margin-bottom: 8px;
}

.message-bubble--user .message-bubble__role,
.message-bubble--user .message-bubble__time,
.message-bubble--user .message-bubble__content {
  color: #fff;
}

.message-bubble--user .message-bubble__content.markdown-body :deep(*) {
  color: #fff;
}

.message-bubble__content {
  color: #353535;
  font-size: 1.08rem;
  line-height: 1.85;
}

.message-bubble__content.markdown-body :deep(strong),
.message-bubble__content.markdown-body :deep(h1),
.message-bubble__content.markdown-body :deep(h2),
.message-bubble__content.markdown-body :deep(h3),
.message-bubble__content.markdown-body :deep(h4) {
  color: #05080c;
  font-weight: 900;
}

.message-bubble__content.markdown-body :deep(p:last-child),
.message-bubble__content.markdown-body :deep(h4:last-child) {
  color: #2b969d;
  font-weight: 900;
}

.message-bubble--user .message-bubble__content.markdown-body :deep(p),
.message-bubble--user .message-bubble__content.markdown-body :deep(p:last-child),
.message-bubble--user .message-bubble__content.markdown-body :deep(strong),
.message-bubble--user .message-bubble__content.markdown-body :deep(h1),
.message-bubble--user .message-bubble__content.markdown-body :deep(h2),
.message-bubble--user .message-bubble__content.markdown-body :deep(h3),
.message-bubble--user .message-bubble__content.markdown-body :deep(h4),
.message-bubble--user .message-bubble__content.markdown-body :deep(h4:last-child) {
  color: #fff;
}

.speech-button {
  min-width: 42px;
  min-height: 28px;
  box-shadow: none;
}

.chat-composer {
  position: absolute;
  right: 24px;
  bottom: 0;
  left: 0;
  margin: 0;
}

.composer-shell {
  min-height: 200px;
  padding: 24px 28px;
  border: 1px solid rgba(185, 202, 213, 0.6);
  border-radius: 0 24px 24px 24px;
  background: #fff;
  box-shadow: 0 -6px 20px rgba(58, 73, 84, 0.08);
}

.composer-shell__header {
  margin-bottom: 20px;
}

.composer-label {
  color: #05080c;
  font-size: 1.08rem;
  font-weight: 900;
}

.composer-textarea {
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #05080c;
  font-size: 1.1rem;
  box-shadow: none;
}

.composer-actions {
  margin-top: 22px;
}

.voice-button {
  min-width: 174px;
  min-height: 52px;
  border-radius: 999px;
  color: #05080c;
  border-color: rgba(185, 202, 213, 0.8);
  background: #fff;
  font-size: 1.06rem;
}

.voice-panel__copy {
  display: none;
}

.composer-submit {
  min-width: 170px;
  min-height: 58px;
  border-radius: 999px;
  background: linear-gradient(135deg, #61bcc4, #168b9f);
  font-size: 1.08rem;
  font-weight: 900;
}

.side-panel {
  height: calc(100vh - 122px);
  padding-left: 24px;
  border-left: 1px solid rgba(175, 190, 198, 0.65);
  gap: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.summary-card,
.session-card,
.side-panel :deep(.profile-overview) {
  padding: 18px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.summary-card h1 {
  margin: 0 0 18px;
  color: #05080c;
  font-size: 1.9rem;
  line-height: 1.25;
  font-weight: 900;
}

.summary-card .eyebrow {
  float: right;
  margin-top: 8px;
  letter-spacing: 0;
  text-transform: none;
  font-size: 1rem;
  color: #2b969d;
}

.summary-stats {
  margin-top: 0;
  padding: 18px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  border: 2px solid rgba(43, 150, 157, 0.55);
  border-radius: 12px;
  background: #fff;
}

.summary-stat {
  padding: 0;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.summary-stat span {
  color: #8b939a;
  font-size: 1rem;
}

.summary-stat strong {
  margin: 0;
  color: #2b969d;
  font-size: 1.34rem;
  font-weight: 900;
}

.summary-card__actions {
  margin-top: 22px;
  grid-template-columns: 1fr;
  gap: 16px;
}

.summary-card__action {
  min-height: 58px;
  border: 0;
  border-radius: 999px;
  background: #d8e9ec;
  color: #2b969d;
  box-shadow: none;
  font-weight: 900;
  font-size: 1.04rem;
}

.summary-card__action.primary-button {
  color: #2b969d;
  background: #d8e9ec;
}

.summary-card__actions .ghost-button {
  background: #fff;
  color: #8b939a;
  border: 1px solid rgba(185, 202, 213, 0.8);
}

.panel-header,
.session-card > .panel-header {
  padding: 18px 16px;
  border-radius: 12px 12px 0 0;
  background: #fff;
  border-bottom: 1px solid rgba(225, 229, 232, 0.8);
}

.panel-header h3 {
  color: #05080c;
  font-size: 1.15rem;
}

.session-list {
  margin-top: 0;
  padding: 16px;
  max-height: 210px;
  background: #fff;
  border-radius: 0 0 12px 12px;
}

.session-item {
  padding: 14px;
  border-radius: 12px;
  border-color: rgba(43, 150, 157, 0.3);
  box-shadow: none;
}

.status-chip {
  min-height: 28px;
  background: #edf5f5;
  color: #2b969d;
}

@media (max-width: 1100px) {
  .assessment-layout {
    grid-template-columns: 1fr;
    min-height: calc(100vh - 122px);
    height: auto;
    overflow: visible;
  }

  .chat-card {
    height: auto;
    min-height: 720px;
  }

  .side-panel {
    padding-left: 0;
    border-left: 0;
    height: auto;
    overflow: visible;
  }
}

.message-bubble--user .message-bubble__content,
.message-bubble--user .message-bubble__content.markdown-body :deep(*),
.message-bubble--user .message-bubble__content.markdown-body :deep(p:last-child),
.message-bubble--user .message-bubble__content.markdown-body :deep(h4:last-child) {
  color: #fff !important;
}

.session-item {
  cursor: pointer;
}

.session-item:focus-visible {
  outline: 3px solid rgba(36, 127, 218, 0.36);
  outline-offset: 3px;
}

.interaction-modal,
.report-modal {
  overflow-y: auto;
  overscroll-behavior: contain;
  align-items: flex-start;
  padding: clamp(12px, 3vh, 28px);
}

.interaction-modal__card,
.report-modal__card {
  max-height: calc(100dvh - clamp(24px, 6vh, 56px));
  min-height: 0;
}

.interaction-modal__body,
.report-modal__body {
  min-height: 0;
}

.interaction-modal .composer-actions--card {
  gap: 10px;
}

.interaction-modal .composer-submit--light {
  background: #f4fafb;
  border: 1px solid rgba(185, 202, 213, 0.8);
  color: #627482;
  box-shadow: none;
}

.interaction-modal .composer-submit--light:hover {
  background: #fff;
  border-color: rgba(83, 169, 183, 0.26);
  color: #2b8696;
}

.interaction-modal .interaction-card__error {
  color: #c43d3d;
}

@media (max-width: 720px) {
  .interaction-modal .composer-actions--card {
    display: grid;
    grid-template-columns: 1fr;
  }

  .interaction-modal .composer-submit,
  .report-modal__action {
    width: 100%;
  }
}

@media (max-height: 720px) {
  .interaction-modal__card,
  .report-modal__card {
    padding: 18px;
  }

  .interaction-modal__header h3,
  .report-modal__header h3 {
    font-size: 1.5rem;
  }
}
</style>

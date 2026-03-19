<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { getChatHistory, getChatProfile, getSessionDetail, sendChatMessage, startChat } from '@/api/chat'
import ProfileOverview from '@/components/ProfileOverview.vue'
import ReportSummary from '@/components/ReportSummary.vue'
import { useGoogleStreamingSpeech } from '@/composables/useGoogleStreamingSpeech'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import type { ChatMessage } from '@/types'
import { estimateProfileCompletion, getMissingCoreFields } from '@/utils/profile'
import { mergeProfileSnapshots } from '@/utils/report'

const STORAGE_KEY = 'ai-elderly-care.current-session'

const sessionId = ref('')
const messages = ref<ChatMessage[]>([])
const profile = ref<Record<string, unknown>>({})
const reports = ref<Array<Record<string, unknown>>>([])
const inputText = ref('')
const loading = ref(false)
const sending = ref(false)
const conversationState = ref('greeting')
const errorMessage = ref('')

const chatBodyRef = ref<HTMLElement | null>(null)

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

const progressPercent = computed(() => Math.round(estimateProfileCompletion(profile.value) * 100))
const missingCoreFields = computed(() => getMissingCoreFields(profile.value))
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

const statusText = computed(() => {
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

function readStoredSessionId() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.localStorage.getItem(STORAGE_KEY) || ''
}

function storeSessionId(nextSessionId: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, nextSessionId)
}

function clearVoiceInput() {
  abortGoogleVoiceRecognition()
  abortBrowserVoiceRecognition()
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

async function refreshSessionArtifacts(targetSessionId: string) {
  const [detail, latestProfile] = await Promise.all([
    getSessionDetail(targetSessionId),
    getChatProfile(targetSessionId).catch(() => ({}))
  ])

  profile.value = mergeProfileSnapshots(detail.profile || {}, latestProfile)
  reports.value = detail.reports || []
}

async function loadExistingSession(targetSessionId: string) {
  loading.value = true
  errorMessage.value = ''
  clearVoiceInput()

  try {
    sessionId.value = targetSessionId
    const detail = await getSessionDetail(targetSessionId)
    const conversation =
      detail.conversation && detail.conversation.length > 0
        ? detail.conversation
        : await getChatHistory(targetSessionId)

    messages.value = conversation
    profile.value = mergeProfileSnapshots(detail.profile || {})
    reports.value = detail.reports || []
    storeSessionId(targetSessionId)
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

  try {
    const response = await startChat()
    sessionId.value = response.sessionId
    storeSessionId(response.sessionId)
    messages.value = [
      {
        role: 'assistant',
        content: response.welcomeMessage
      }
    ]
    profile.value = {}
    reports.value = []
    conversationState.value = 'greeting'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '启动评估失败，请检查后端服务是否可用。'
  } finally {
    loading.value = false
    await scrollChatToBottom()
  }
}

async function initializeAssessment() {
  const storedSessionId = readStoredSessionId()

  if (!storedSessionId) {
    await createNewSession()
    return
  }

  try {
    await loadExistingSession(storedSessionId)
  } catch {
    await createNewSession()
  }
}

async function handleSend() {
  if (!sessionId.value || sending.value || !inputText.value.trim()) {
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
  await scrollChatToBottom()

  try {
    const response = await sendChatMessage(sessionId.value, messageText)
    conversationState.value = response.state || 'collecting'

    messages.value.push({
      role: 'assistant',
      content: ''
    })

    const assistantIndex = messages.value.length - 1
    await revealAssistantMessage(assistantIndex, response.message)
    await refreshSessionArtifacts(sessionId.value)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '发送失败，请稍后重试。'
  } finally {
    sending.value = false
  }
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
    <section class="elderly-hero surface-card">
      <div>
        <p class="eyebrow">老人端</p>
        <h1>健康评估对话</h1>
        <p class="elderly-hero__text">
          用对话和语音逐步采集老人健康信息，右侧同步查看结构化画像和当前可用报告。
        </p>
      </div>

      <div class="elderly-hero__meta">
        <div class="hero-stat">
          <span>当前状态</span>
          <strong>{{ statusText }}</strong>
        </div>
        <div class="hero-stat">
          <span>关键信息完整度</span>
          <strong>{{ progressPercent }}%</strong>
        </div>
        <button class="secondary-button" type="button" @click="createNewSession">开始新评估</button>
      </div>
    </section>

    <section class="assessment-layout">
      <article class="surface-card chat-card">
        <header class="chat-card__header">
          <div>
            <h2>对话采集</h2>
            <p>请直接描述老人的身体情况、慢病、生活能力和日常习惯。</p>
          </div>
          <span class="status-badge">{{ sessionId ? `会话 ${sessionId.slice(0, 8)}` : '会话准备中' }}</span>
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
        <section v-if="missingCoreFields.length > 0" class="surface-card hint-card">
          <h3>建议继续补充</h3>
          <div class="hint-chip-list">
            <span v-for="field in missingCoreFields" :key="field" class="hint-chip">{{ field }}</span>
          </div>
        </section>

        <ProfileOverview :profile="profile" />
        <ReportSummary :reports="reports" />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.elderly-page {
  display: grid;
  gap: 22px;
}

.elderly-hero {
  padding: 30px 32px;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
  align-items: center;
}

.elderly-hero h1 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(2.5rem, 4vw, 3.6rem);
}

.elderly-hero__text {
  margin: 0;
  color: var(--ink-muted);
  font-size: 1.25rem;
  line-height: 1.8;
}

.elderly-hero__meta {
  display: grid;
  gap: 14px;
}

.hero-stat {
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.hero-stat span {
  display: block;
  color: var(--ink-muted);
  margin-bottom: 8px;
}

.hero-stat strong {
  color: var(--ink-strong);
  font-size: 1.6rem;
}

.assessment-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
  gap: 22px;
}

.chat-card {
  padding: 24px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  min-height: 42rem;
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
  box-shadow: var(--shadow-card);
}

.message-bubble--assistant {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.message-bubble--user {
  margin-left: auto;
  background: linear-gradient(135deg, rgba(101, 186, 191, 0.16), rgba(83, 169, 183, 0.28));
  border: 1px solid rgba(83, 169, 183, 0.24);
}

.message-bubble__role {
  color: var(--ink-muted);
  font-size: 0.92rem;
  font-weight: 700;
}

.message-bubble__content {
  max-height: 18rem;
  overflow: auto;
  padding-right: 4px;
  color: var(--ink-strong);
  font-size: 1.35rem;
  line-height: 1.9;
  white-space: pre-wrap;
}

.empty-tip {
  padding: 24px;
  border-radius: 18px;
  border: 1px dashed var(--line);
  color: var(--ink-muted);
}

.chat-composer {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.composer-label {
  color: var(--ink-strong);
  font-size: 1.1rem;
  font-weight: 700;
}

.composer-textarea {
  width: 100%;
  min-height: 9rem;
  padding: 18px;
  border-radius: 24px;
  resize: vertical;
  color: var(--ink-strong);
  font-size: 1.28rem;
  line-height: 1.8;
}

.composer-actions {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-end;
}

.voice-panel {
  display: grid;
  gap: 8px;
  flex: 1;
}

.voice-button {
  width: fit-content;
}

.voice-panel p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.7;
}

.composer-submit {
  min-width: 132px;
}

.side-panel {
  display: grid;
  gap: 18px;
  align-content: start;
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
  gap: 10px;
  flex-wrap: wrap;
}

.hint-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(120, 164, 199, 0.16);
  color: var(--ink);
}

@media (max-width: 1080px) {
  .elderly-hero,
  .assessment-layout {
    grid-template-columns: 1fr;
  }

  .chat-card {
    min-height: 36rem;
  }
}

@media (max-width: 720px) {
  .elderly-hero,
  .chat-card {
    padding: 22px;
  }

  .composer-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .voice-button,
  .composer-submit {
    width: 100%;
  }

  .message-bubble {
    max-width: 100%;
  }

  .message-bubble__content {
    font-size: 1.16rem;
  }
}
</style>

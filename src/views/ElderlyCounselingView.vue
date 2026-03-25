<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/core'
import {
  createCounselingSession,
  getCounselingHistory,
  listCounselingSessions,
  sendCounselingMessage,
  streamCounselingMessage
} from '@/api/counseling'
import { useGoogleStreamingSpeech } from '@/composables/useGoogleStreamingSpeech'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import {
  getStoredElderlyCounselingSessionId,
  getStoredElderlySession,
  setStoredElderlyCounselingSessionId,
  useAuthSession
} from '@/session'
import type { ChatMessage, CounselingSessionInfo, ElderlyAuthSession } from '@/types'

const COUNSELING_WELCOME_MESSAGE =
  '您好，我是心理咨询助手。您可以把最近的心情、担心的事，或者想找人聊聊的内容慢慢告诉我，我会认真听您说。'

const router = useRouter()
const { session } = useAuthSession()

const elderlyAccessSession = ref<ElderlyAuthSession | null>(null)
const sessions = ref<CounselingSessionInfo[]>([])
const activeSessionId = ref('')
const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const loading = ref(false)
const sessionsLoading = ref(false)
const sending = ref(false)
const creatingSession = ref(false)
const errorMessage = ref('')

const chatBodyRef = ref<HTMLElement | null>(null)

const elderlyToken = computed(() => elderlyAccessSession.value?.token || '')
const elderlyUserId = computed(() => elderlyAccessSession.value?.userId || '')
const activeSession = computed(
  () => sessions.value.find((item) => item.sessionId === activeSessionId.value) || null
)
const activeSessionStatusText = computed(() => getSessionStatusText(activeSession.value?.status))
const currentSessionLabel = computed(() => {
  if (!activeSession.value) {
    return '未选择'
  }

  return activeSession.value.title?.trim() || '心理咨询'
})
const currentUpdatedAtText = computed(() => formatDateTime(activeSession.value?.updatedAt || ''))
const isSessionEnded = computed(() => activeSession.value?.status === 'ended')

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

function resolvePreferredElderlySession() {
  const currentSession = session.value
  if (currentSession?.role === 'elderly') {
    return currentSession
  }

  return getStoredElderlySession()
}

function updateActiveElderlySession(nextSession: ElderlyAuthSession | null) {
  elderlyAccessSession.value = nextSession
}

function getSessionStatusText(status: string | undefined) {
  const map: Record<string, string> = {
    active: '咨询中',
    ended: '已结束'
  }

  return map[status || ''] || '咨询中'
}

function sortSessionsByUpdatedAt(items: CounselingSessionInfo[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime()
    const rightTime = new Date(right.updatedAt).getTime()
    return rightTime - leftTime
  })
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

function isAuthError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

function getSessionLabel(item: CounselingSessionInfo, index: number) {
  if (item.title?.trim()) {
    return item.title
  }

  return `心理咨询 ${sessions.value.length - index}`
}

function upsertSessionInfo(sessionInfo: CounselingSessionInfo) {
  const nextSessions = sessions.value.filter((item) => item.sessionId !== sessionInfo.sessionId)
  sessions.value = sortSessionsByUpdatedAt([sessionInfo, ...nextSessions])
}

function clearVoiceInput() {
  abortGoogleVoiceRecognition()
  abortBrowserVoiceRecognition()
}

function buildWelcomeMessages() {
  return [
    {
      role: 'assistant',
      content: COUNSELING_WELCOME_MESSAGE
    }
  ] satisfies ChatMessage[]
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

async function refreshSessions(token: string) {
  sessionsLoading.value = true

  try {
    const nextSessions = sortSessionsByUpdatedAt(await listCounselingSessions(token))
    sessions.value = nextSessions
    return nextSessions
  } finally {
    sessionsLoading.value = false
  }
}

async function loadSession(targetSessionId: string, token: string) {
  loading.value = true
  errorMessage.value = ''
  clearVoiceInput()

  try {
    activeSessionId.value = targetSessionId
    const history = await getCounselingHistory(targetSessionId, token)
    messages.value = history.length > 0 ? history : buildWelcomeMessages()

    if (elderlyUserId.value) {
      setStoredElderlyCounselingSessionId(elderlyUserId.value, targetSessionId)
    }
  } finally {
    loading.value = false
    await scrollChatToBottom()
  }
}

async function createAndOpenSession(skipConfirm = false) {
  if (!elderlyToken.value || !elderlyUserId.value || creatingSession.value || loading.value || sending.value) {
    return
  }

  if (!skipConfirm && sessions.value.length > 0) {
    const confirmed = window.confirm('这会创建新的心理咨询会话，当前聊天会保留在历史列表中。是否继续？')
    if (!confirmed) {
      return
    }
  }

  creatingSession.value = true
  errorMessage.value = ''
  clearVoiceInput()

  try {
    const response = await createCounselingSession(elderlyToken.value)
    const sessionInfo = {
      sessionId: response.sessionId,
      userId: elderlyUserId.value,
      title: '心理咨询',
      status: 'active',
      createdAt: response.createdAt || new Date().toISOString(),
      updatedAt: response.createdAt || new Date().toISOString()
    } satisfies CounselingSessionInfo

    activeSessionId.value = sessionInfo.sessionId
    messages.value = buildWelcomeMessages()
    inputText.value = ''
    upsertSessionInfo(sessionInfo)
    setStoredElderlyCounselingSessionId(elderlyUserId.value, sessionInfo.sessionId)

    await refreshSessions(elderlyToken.value)
    await scrollChatToBottom()
  } catch (error) {
    if (isAuthError(error)) {
      await router.replace('/elderly/assessment')
      return
    }

    errorMessage.value =
      error instanceof Error ? error.message : '创建心理咨询会话失败，请稍后重试。'
  } finally {
    creatingSession.value = false
  }
}

async function initializeCounseling() {
  const preferredSession = resolvePreferredElderlySession()
  if (!preferredSession) {
    await router.replace('/elderly/assessment')
    return
  }

  updateActiveElderlySession(preferredSession)

  try {
    const availableSessions = await refreshSessions(preferredSession.token)
    const preferredCounselingSessionId = getStoredElderlyCounselingSessionId(preferredSession.userId)
    const targetSessionId = availableSessions.some((item) => item.sessionId === preferredCounselingSessionId)
      ? preferredCounselingSessionId
      : availableSessions[0]?.sessionId || ''

    if (!targetSessionId) {
      await createAndOpenSession(true)
      return
    }

    await loadSession(targetSessionId, preferredSession.token)
  } catch (error) {
    if (isAuthError(error)) {
      await router.replace('/elderly/assessment')
      return
    }

    errorMessage.value =
      error instanceof Error ? error.message : '加载心理咨询内容失败，请稍后重试。'
  }
}

async function handleSelectSession(targetSessionId: string) {
  if (!elderlyToken.value || !targetSessionId || targetSessionId === activeSessionId.value || loading.value) {
    return
  }

  try {
    await loadSession(targetSessionId, elderlyToken.value)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '切换会话失败，请稍后重试。'
  }
}

async function handleSend() {
  if (!activeSessionId.value || !elderlyToken.value || !inputText.value.trim() || sending.value || isSessionEnded.value) {
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
    let assistantMessage: ChatMessage

    try {
      assistantMessage = await streamCounselingMessage(
        activeSessionId.value,
        messageText,
        elderlyToken.value,
        async (chunk) => {
          const message = messages.value[assistantIndex]
          if (!message) {
            return
          }

          message.content += chunk
          await scrollChatToBottom()
        }
      )

      if (!messages.value[assistantIndex]?.content && assistantMessage.content) {
        await revealAssistantMessage(assistantIndex, assistantMessage.content)
      }
    } catch {
      messages.value[assistantIndex].content = ''
      assistantMessage = await sendCounselingMessage(activeSessionId.value, messageText, elderlyToken.value)
      await revealAssistantMessage(assistantIndex, assistantMessage.content)
    }

    const updatedAt = assistantMessage.timestamp || new Date().toISOString()
    upsertSessionInfo({
      sessionId: activeSessionId.value,
      userId: elderlyUserId.value,
      title: activeSession.value?.title || '心理咨询',
      status: activeSession.value?.status || 'active',
      createdAt: activeSession.value?.createdAt || updatedAt,
      updatedAt
    })

    await refreshSessions(elderlyToken.value)
  } catch (error) {
    if (!messages.value[assistantIndex]?.content) {
      messages.value.splice(assistantIndex, 1)
    }

    if (isAuthError(error)) {
      await router.replace('/elderly/assessment')
      return
    }

    errorMessage.value =
      error instanceof Error ? error.message : '发送失败，请稍后重试。'
  } finally {
    sending.value = false
  }
}

async function toggleVoiceInput() {
  if (isVoiceActive.value) {
    stopGoogleVoiceRecognition()
    stopBrowserVoiceRecognition()
    return
  }

  if (!activeSessionId.value) {
    return
  }

  errorMessage.value = ''

  try {
    if (isGoogleVoiceSupported.value) {
      await startGoogleVoiceRecognition(activeSessionId.value, inputText.value)
      return
    }

    if (isBrowserVoiceSupported.value) {
      startBrowserVoiceRecognition(inputText.value)
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '语音输入暂时不可用，请改用文字。'
  }
}

onMounted(async () => {
  await initializeCounseling()
})
</script>

<template>
  <div class="page-width elderly-page">
    <section class="counseling-layout">
      <article class="surface-card chat-card">
        <header class="chat-card__header">
          <div class="chat-card__intro">
            <h2>心理咨询对话</h2>
            <p class="chat-card__lead">
              用陪伴式对话聊聊最近的情绪、烦心事和生活状态。
              <br>
              您可以慢慢说，我们会尽量用温和、清晰的方式回应。
            </p>
          </div>

          <div class="chat-card__header-actions">
            <button class="ghost-button" type="button" @click="router.push('/elderly/assessment')">
              返回健康评估
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
            <span class="message-bubble__avatar">{{ message.role === 'assistant' ? '咨' : '我' }}</span>
            <div class="message-bubble__panel">
              <div class="message-bubble__meta">
                <span class="message-bubble__role">{{ message.role === 'assistant' ? '心理咨询助手' : '我' }}</span>
                <span v-if="message.timestamp" class="message-bubble__time">
                  {{ formatDateTime(message.timestamp) }}
                </span>
              </div>
              <div class="message-bubble__content">
                {{ message.content || '...' }}
              </div>
            </div>
          </article>

          <div v-if="loading" class="empty-tip">正在准备当前咨询会话...</div>
          <div v-if="!loading && messages.length === 0" class="empty-tip">
            当前还没有对话内容，点击右侧“新建会话”即可开始。
          </div>
        </div>

        <footer class="chat-composer">
          <div class="composer-shell">
            <template v-if="isSessionEnded">
              <div class="composer-shell__header">
                <label class="composer-label">当前会话已结束</label>
              </div>
              <div class="composer-disabled">
                <p class="composer-disabled__title">该会话目前为只读状态</p>
                <p class="composer-disabled__text">如需继续咨询，请新建一个新的咨询会话。</p>
              </div>
            </template>

            <template v-else>
              <div class="composer-shell__header">
                <label class="composer-label" for="counseling-input">想聊点什么</label>
              </div>
              <textarea
                id="counseling-input"
                v-model="inputText"
                class="composer-textarea"
                :disabled="loading || sending || creatingSession"
                placeholder="例如：这几天总觉得心里发闷，晚上睡不太好，想找人聊聊。"
                rows="1"
                @keydown.enter.exact.prevent="handleSend"
              />
              <div class="composer-actions">
                <div class="voice-panel">
                  <button
                    class="secondary-button voice-button"
                    type="button"
                    :disabled="loading || creatingSession || !isVoiceAvailable"
                    @click="toggleVoiceInput"
                  >
                    <span class="voice-button__dot" :class="{ 'is-live': isVoiceActive }" />
                    {{ voiceButtonLabel }}
                  </button>
                  <div class="voice-panel__copy">
                    <strong>{{ isVoiceActive ? '正在聆听' : '语音输入' }}</strong>
                    <span v-if="voiceErrorMessage">{{ voiceErrorMessage }}</span>
                  </div>
                </div>
                <button
                  class="primary-button composer-submit"
                  type="button"
                  :disabled="loading || sending || creatingSession || !inputText.trim()"
                  @click="handleSend"
                >
                  {{ sending ? '发送中...' : '发送' }}
                </button>
              </div>
            </template>
          </div>
        </footer>
      </article>

      <aside class="side-panel">
        <section class="surface-card summary-card">
          <p class="eyebrow">情感陪伴</p>
          <h2>当前咨询概况</h2>
          <p class="summary-card__text">
            咨询会话会保存在右侧列表里，方便后续继续交流或回看历史内容。
          </p>

          <div class="summary-stats">
            <div class="summary-stat">
              <span>当前会话</span>
              <strong>{{ currentSessionLabel }}</strong>
            </div>
            <div class="summary-stat">
              <span>当前状态</span>
              <strong>{{ activeSessionStatusText }}</strong>
            </div>
            <div class="summary-stat">
              <span>会话数量</span>
              <strong>{{ sessions.length }}</strong>
            </div>
            <div class="summary-stat">
              <span>最近更新</span>
              <strong>{{ currentUpdatedAtText }}</strong>
            </div>
          </div>

          <div class="summary-card__actions">
            <button
              class="primary-button summary-card__action"
              type="button"
              :disabled="loading || sending || creatingSession"
              @click="createAndOpenSession()"
            >
              {{ creatingSession ? '创建中...' : '新建会话' }}
            </button>
            <button class="secondary-button summary-card__action" type="button" @click="router.push('/elderly/assessment')">
              返回健康评估
            </button>
          </div>
        </section>

        <section class="surface-card session-card">
          <div class="panel-header">
            <div>
              <h3>会话列表</h3>
              <p>保留最近的咨询记录，支持随时切换继续对话。</p>
            </div>
            <span>{{ sessionsLoading ? '同步中' : `${sessions.length} 条` }}</span>
          </div>

          <div v-if="sessions.length > 0" class="session-list">
            <button
              v-for="(item, index) in sessions"
              :key="item.sessionId"
              class="session-item"
              :class="{ 'is-active': item.sessionId === activeSessionId }"
              type="button"
              @click="handleSelectSession(item.sessionId)"
            >
              <div class="session-item__head">
                <div class="session-item__copy">
                  <strong>{{ getSessionLabel(item, index) }}</strong>
                  <span>创建于 {{ formatDateTime(item.createdAt) }}</span>
                </div>
                <span v-if="item.sessionId === activeSessionId" class="session-item__marker">当前</span>
              </div>

              <div class="session-item__meta">
                <span
                  class="status-chip"
                  :class="{ 'status-chip--active': item.sessionId === activeSessionId }"
                >
                  {{ getSessionStatusText(item.status) }}
                </span>
                <span class="status-chip">{{ formatDateTime(item.updatedAt) }}</span>
              </div>
            </button>
          </div>

          <p v-else class="session-card__empty">当前还没有心理咨询历史会话。</p>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.elderly-page {
  padding-top: 16px;
}

.counseling-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
  gap: 22px;
  align-items: start;
}

.chat-card {
  position: relative;
  overflow: hidden;
  padding: 24px;
  display: flex;
  flex-direction: column;
  min-height: clamp(38rem, calc(100vh - 10.5rem), 46rem);
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
  gap: 14px;
  align-items: flex-start;
}

.chat-card__intro {
  max-width: 38rem;
}

.chat-card__header-actions {
  display: grid;
  gap: 10px;
  justify-items: end;
}

.chat-card__header h1 {
  margin: 8px 0 0;
  color: var(--ink-strong);
  font-size: clamp(1.9rem, 2.7vw, 2.4rem);
}

.chat-card__lead {
  margin: 10px 0 0;
  color: var(--ink-muted);
  line-height: 1.75;
}

.error-banner {
  margin: 16px 0 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(183, 75, 75, 0.08);
  color: var(--danger);
}

.chat-stream {
  margin-top: 14px;
  flex: none;
  height: clamp(19rem, calc(100vh - 28rem), 26rem);
  min-height: 19rem;
  overflow-y: auto;
  overflow-x: hidden;
  display: grid;
  gap: 14px;
  padding: 18px 16px;
  padding-right: 10px;
  border-radius: 28px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(240, 248, 250, 0.88));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 18px 32px rgba(35, 84, 99, 0.05);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(78, 135, 197, 0.45) rgba(232, 241, 248, 0.9);
  overscroll-behavior: contain;
}

.chat-stream::-webkit-scrollbar {
  width: 10px;
}

.chat-stream::-webkit-scrollbar-track {
  background: rgba(232, 241, 248, 0.9);
  border-radius: 999px;
}

.chat-stream::-webkit-scrollbar-thumb {
  background: rgba(78, 135, 197, 0.45);
  border-radius: 999px;
  border: 2px solid rgba(232, 241, 248, 0.9);
}

.message-bubble {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
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
  padding: 14px 16px;
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
  white-space: pre-wrap;
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
  margin-top: 14px;
}

.composer-shell {
  padding: 16px;
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
  width: 100%;
  resize: none;
  border-radius: 22px;
  padding: 14px 16px;
  min-height: 6rem;
  line-height: 1.7;
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

.composer-actions {
  margin-top: 14px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.composer-submit {
  min-width: 7rem;
}

.voice-panel {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.voice-button {
  min-width: 6.5rem;
}

.voice-button__dot {
  width: 10px;
  height: 10px;
  margin-right: 8px;
  border-radius: 999px;
  background: rgba(78, 135, 197, 0.4);
}

.voice-button__dot.is-live {
  background: #e97a49;
  box-shadow: 0 0 0 8px rgba(233, 122, 73, 0.14);
}

.voice-panel__copy {
  display: grid;
  gap: 4px;
}

.voice-panel__copy strong {
  color: var(--ink-strong);
}

.voice-panel__copy span {
  color: var(--ink-muted);
  font-size: 0.9rem;
}

.side-panel {
  display: grid;
  gap: 18px;
}

.summary-card,
.session-card {
  padding: 22px;
}

.summary-card {
  background: linear-gradient(180deg, rgba(249, 252, 255, 0.9), rgba(237, 247, 248, 0.94));
}

.session-card {
  background: rgba(248, 252, 255, 0.88);
}

.summary-card h2 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(1.9rem, 3vw, 2.4rem);
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
  font-size: 1.2rem;
  line-height: 1.5;
}

.summary-card__actions {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-card__action {
  width: 100%;
  white-space: nowrap;
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
  max-height: 32rem;
  overflow: auto;
}

.session-item {
  width: 100%;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid rgba(83, 169, 183, 0.12);
  background: rgba(255, 255, 255, 0.84);
  display: grid;
  gap: 14px;
  text-align: left;
}

.session-item strong {
  color: var(--ink-strong);
}

.session-item.is-active {
  border-color: rgba(43, 134, 150, 0.32);
  background: rgba(83, 169, 183, 0.12);
  box-shadow: inset 0 0 0 1px rgba(43, 134, 150, 0.06);
}

.session-item__head {
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

@media (max-width: 1080px) {
  .counseling-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .chat-card {
    min-height: auto;
  }

  .chat-stream {
    height: 24rem;
  }
}

@media (max-width: 768px) {
  .chat-card,
  .summary-card,
  .session-card {
    padding: 20px;
  }

  .chat-card__header,
  .composer-actions,
  .panel-header {
    grid-template-columns: minmax(0, 1fr);
  }

  .summary-stats,
  .summary-card__actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .message-bubble,
  .message-bubble--user {
    max-width: 100%;
  }
}
</style>

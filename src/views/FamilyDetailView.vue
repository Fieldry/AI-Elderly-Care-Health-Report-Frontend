<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { saveSessionProfile } from '@/api/chat'
import { ApiError } from '@/api/core'
import {
  getFamilyElderly,
  getFamilyReports,
  getFamilySessionInfo,
  sendFamilySessionMessage,
  startFamilySession,
  updateFamilyElderly
} from '@/api/family'
import { exportReportPdf, generateReportForElderly, getReportDetail } from '@/api/report'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ProfileOverview from '@/components/ProfileOverview.vue'
import ReportSummary from '@/components/ReportSummary.vue'
import {
  clearStoredFamilyConversationSessionId,
  getStoredFamilyConversationSessionId,
  setStoredFamilyConversationSessionId,
  useAuthSession
} from '@/session'
import type { ChatMessage } from '@/types'
import {
  cloneProfileForForm,
  getIdentityTitle,
  getMissingCoreFields,
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  serializeProfilePayload
} from '@/utils/profile'
import { getReportGeneratedAt, getReportId, normalizeReportRecord } from '@/utils/report'

const props = defineProps<{
  elderlyId: string
}>()

const router = useRouter()
const { session } = useAuthSession()

const loading = ref(false)
const saving = ref(false)
const reportsLoading = ref(false)
const generatingReport = ref(false)
const reportDetailLoading = ref(false)
const familySessionLoading = ref(false)
const familySessionSending = ref(false)
const downloadingReportId = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const familyReports = ref<Array<Record<string, unknown>>>([])
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)
const familySessionId = ref('')
const familySessionState = ref('')
const familyMessages = ref<ChatMessage[]>([])
const familyInput = ref('')
const profileForm = reactive<Record<string, unknown>>({})

const groupedFields = PROFILE_GROUPS.map((group) => ({
  group,
  fields: PROFILE_FIELDS.filter((field) => field.group === group)
}))

const displayTitle = computed(() =>
  getIdentityTitle(profileForm, `老人档案 ${props.elderlyId.slice(0, 8)}`)
)
const missingFields = computed(() => getMissingCoreFields(profileForm))
const sortedReports = computed(() =>
  [...familyReports.value].sort((left, right) =>
    getReportGeneratedAt(right).localeCompare(getReportGeneratedAt(left))
  )
)
const activeReport = computed(() => {
  if (!selectedReportId.value) {
    return null
  }

  return familyReports.value.find((report) => getReportId(report) === selectedReportId.value) || null
})
const familySessionStatusText = computed(() => {
  const map: Record<string, string> = {
    collecting: '信息采集中',
    confirming: '待确认',
    completed: '访谈已完成'
  }

  return map[familySessionState.value] || (familySessionId.value ? '访谈已创建' : '尚未开始')
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

function isSessionUnavailable(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)
}

function resetMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function applyFamilySessionState(payload: {
  sessionId: string
  message?: string
  state?: string
  conversation?: ChatMessage[]
  profile?: Record<string, unknown> | null
  reports?: Array<Record<string, unknown>>
}) {
  if (payload.sessionId) {
    familySessionId.value = payload.sessionId
    setStoredFamilyConversationSessionId(props.elderlyId, payload.sessionId)
  }

  if (payload.state) {
    familySessionState.value = payload.state
  }

  if (payload.conversation && payload.conversation.length > 0) {
    familyMessages.value = payload.conversation
  } else if (payload.message) {
    familyMessages.value = [
      ...familyMessages.value,
      {
        role: 'assistant',
        content: payload.message
      }
    ]
  }

  if (payload.profile) {
    const clonedProfile = cloneProfileForForm(payload.profile)
    for (const key of Object.keys(profileForm)) {
      delete profileForm[key]
    }
    Object.assign(profileForm, clonedProfile)
  }

  if (payload.reports && payload.reports.length > 0) {
    familyReports.value = payload.reports
  }
}

async function loadProfileDetail() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const detail = await getFamilyElderly(props.elderlyId, session.value.token)
    const clonedProfile = cloneProfileForForm(detail.profile || {})

    for (const key of Object.keys(profileForm)) {
      delete profileForm[key]
    }

    Object.assign(profileForm, clonedProfile)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载老人画像失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function loadReports() {
  if (!session.value?.token || session.value.role !== 'family') {
    return
  }

  reportsLoading.value = true

  try {
    familyReports.value = await getFamilyReports(props.elderlyId, session.value.token)

    if (
      selectedReportId.value &&
      !familyReports.value.some((report) => getReportId(report) === selectedReportId.value)
    ) {
      selectedReportId.value = ''
      selectedReportDetail.value = null
    }
  } catch {
    familyReports.value = []
  } finally {
    reportsLoading.value = false
  }
}

async function openReportDetail(reportId: string) {
  if (!session.value?.token || session.value.role !== 'family' || !reportId) {
    return
  }

  selectedReportId.value = reportId
  reportDetailLoading.value = true
  errorMessage.value = ''

  try {
    selectedReportDetail.value = await getReportDetail(reportId, session.value.token)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载报告详情失败，请稍后重试。'
  } finally {
    reportDetailLoading.value = false
  }
}

async function loadStoredFamilySession() {
  if (!session.value?.token || session.value.role !== 'family') {
    return
  }

  const storedSessionId = getStoredFamilyConversationSessionId(props.elderlyId)
  if (!storedSessionId) {
    familyMessages.value = []
    familySessionId.value = ''
    familySessionState.value = ''
    return
  }

  familySessionLoading.value = true

  try {
    const response = await getFamilySessionInfo(storedSessionId, session.value.token)
    applyFamilySessionState(response)
  } catch (error) {
    if (isSessionUnavailable(error)) {
      clearStoredFamilyConversationSessionId(props.elderlyId)
      familySessionId.value = ''
      familySessionState.value = ''
      familyMessages.value = []
      return
    }

    errorMessage.value =
      error instanceof Error ? error.message : '恢复家属访谈失败，请稍后重试。'
  } finally {
    familySessionLoading.value = false
  }
}

async function startInterviewSession() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  familySessionLoading.value = true
  errorMessage.value = ''

  try {
    familyMessages.value = []
    const response = await startFamilySession(props.elderlyId, session.value.token)
    applyFamilySessionState(response)
    await Promise.all([loadReports(), loadProfileDetail()])
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '启动家属访谈失败，请稍后重试。'
  } finally {
    familySessionLoading.value = false
  }
}

async function sendInterviewMessage() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  if (!familyInput.value.trim() || familySessionSending.value) {
    return
  }

  if (!familySessionId.value) {
    await startInterviewSession()
    if (!familySessionId.value) {
      return
    }
  }

  const messageText = familyInput.value.trim()
  familyInput.value = ''
  familySessionSending.value = true
  errorMessage.value = ''

  familyMessages.value = [
    ...familyMessages.value,
    {
      role: 'user',
      content: messageText
    }
  ]

  try {
    const response = await sendFamilySessionMessage(familySessionId.value, session.value.token, messageText)
    applyFamilySessionState(response)
    await Promise.all([loadReports(), loadProfileDetail()])
  } catch (error) {
    if (isSessionUnavailable(error)) {
      clearStoredFamilyConversationSessionId(props.elderlyId)
      familySessionId.value = ''
      familySessionState.value = ''
    }
    errorMessage.value =
      error instanceof Error ? error.message : '发送访谈消息失败，请稍后重试。'
  } finally {
    familySessionSending.value = false
  }
}

async function saveProfile() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  saving.value = true
  resetMessages()

  try {
    const payload = serializeProfilePayload(profileForm)
    await updateFamilyElderly(props.elderlyId, session.value.token, payload)

    let workspaceSynced = false
    if (familySessionId.value) {
      try {
        await saveSessionProfile(familySessionId.value, payload, session.value.token)
        workspaceSynced = true
      } catch (error) {
        if (isSessionUnavailable(error)) {
          clearStoredFamilyConversationSessionId(props.elderlyId)
          familySessionId.value = ''
          familySessionState.value = ''
        }
      }
    }

    successMessage.value = workspaceSynced
      ? '画像信息已保存，并同步到当前家属访谈工作区。'
      : '画像信息已保存。'
    await Promise.all([loadProfileDetail(), loadReports(), loadStoredFamilySession()])
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '保存失败，请稍后重试。'
  } finally {
    saving.value = false
  }
}

async function handleGenerateReport() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  generatingReport.value = true
  resetMessages()

  try {
    const response = await generateReportForElderly(props.elderlyId, session.value.token)
    successMessage.value = '报告已生成，正在刷新列表。'
    await loadReports()

    if (response.reportId) {
      await openReportDetail(response.reportId)
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '生成报告失败，请稍后重试。'
  } finally {
    generatingReport.value = false
  }
}

async function handleDownloadReport(reportId: string) {
  if (!session.value?.token || session.value.role !== 'family' || !reportId) {
    return
  }

  downloadingReportId.value = reportId
  errorMessage.value = ''

  try {
    const blob = await exportReportPdf(reportId, session.value.token)
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `${reportId}.pdf`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    if (error instanceof ApiError && error.status === 501) {
      errorMessage.value = '后端尚未实现 PDF 导出，目前只能查看在线报告。'
    } else {
      errorMessage.value =
        error instanceof Error ? error.message : '导出 PDF 失败，请稍后重试。'
    }
  } finally {
    downloadingReportId.value = ''
  }
}

onMounted(async () => {
  await Promise.all([loadProfileDetail(), loadReports(), loadStoredFamilySession()])
})
</script>

<template>
  <div class="page-width role-page family-detail-page">
    <section class="surface-card detail-hero">
      <div>
        <p class="eyebrow">家属端详情</p>
        <h1>{{ displayTitle }}</h1>
        <p>在这里补全画像、发起家属访谈，并为当前老人生成和查看健康报告。</p>
      </div>

      <div class="detail-hero__actions">
        <button class="secondary-button" type="button" @click="router.push('/family/hub')">返回列表</button>
        <button class="primary-button" type="button" :disabled="loading || saving" @click="saveProfile">
          {{ saving ? '保存中...' : '保存画像' }}
        </button>
        <button class="ghost-button" type="button" :disabled="generatingReport" @click="handleGenerateReport">
          {{ generatingReport ? '生成中...' : '生成报告' }}
        </button>
      </div>
    </section>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

    <section class="detail-layout">
      <article class="surface-card detail-form-card">
        <header class="detail-form-card__header">
          <div>
            <h2>画像补全</h2>
            <p>按分组补充老人基本信息、功能状态、慢病与社会支持等字段。</p>
          </div>
        </header>

        <div v-if="loading" class="loading-card">正在加载老人画像...</div>

        <div v-else class="detail-form scroll-panel">
          <section v-for="group in groupedFields" :key="group.group" class="form-group-card">
            <div class="form-group-card__header">
              <h3>{{ group.group }}</h3>
            </div>

            <div class="field-grid">
              <label v-for="field in group.fields" :key="field.key" class="field">
                <span>{{ field.label }}</span>

                <select
                  v-if="field.type === 'select'"
                  v-model="profileForm[field.key]"
                >
                  <option value="">请选择</option>
                  <option v-for="option in field.options || []" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>

                <input
                  v-else
                  v-model="profileForm[field.key]"
                  :type="field.type === 'number' ? 'number' : 'text'"
                  :placeholder="field.placeholder || `请输入${field.label}`"
                />
              </label>
            </div>
          </section>
        </div>
      </article>

      <aside class="detail-side">
        <section class="surface-card hint-card">
          <h3>仍建议补充</h3>
          <div v-if="missingFields.length > 0" class="hint-chip-list">
            <span v-for="field in missingFields" :key="field" class="hint-chip">{{ field }}</span>
          </div>
          <p v-else class="hint-card__text">核心字段已基本齐全，可继续访谈或生成报告。</p>
        </section>

        <ProfileOverview :profile="profileForm" title="当前画像预览" />

        <section class="surface-card interview-card">
          <header class="reports-shell__header">
            <h3>家属访谈</h3>
            <span>{{ familySessionStatusText }}</span>
          </header>

          <div class="interview-actions">
            <button class="secondary-button" type="button" :disabled="familySessionLoading" @click="startInterviewSession">
              {{ familySessionLoading ? '启动中...' : familySessionId ? '重新开始访谈' : '开始家属访谈' }}
            </button>
            <p v-if="familySessionId" class="interview-meta">当前会话：{{ familySessionId }}</p>
          </div>

          <div v-if="familyMessages.length > 0" class="conversation-list scroll-panel">
            <article
              v-for="(message, index) in familyMessages"
              :key="`${message.role}-${index}`"
              class="conversation-item"
            >
              <strong>{{ message.role === 'assistant' ? '助手' : '家属' }}</strong>
              <p>{{ message.content }}</p>
            </article>
          </div>

          <EmptyStateCard
            v-else
            title="尚未开始家属访谈"
            description="点击上方按钮后会为当前老人创建家属侧会话，再通过消息补充照护信息。"
          />

          <div class="interview-composer">
            <textarea
              v-model="familyInput"
              rows="4"
              :disabled="familySessionLoading || familySessionSending"
              placeholder="例如：老人最近夜间起夜增多，饭量下降，家里主要由女儿照护。"
              @keydown.enter.exact.prevent="sendInterviewMessage"
            />
            <button class="primary-button" type="button" :disabled="familySessionSending" @click="sendInterviewMessage">
              {{ familySessionSending ? '发送中...' : '发送访谈消息' }}
            </button>
          </div>
        </section>

        <section class="surface-card">
          <div class="reports-shell">
            <header class="reports-shell__header">
              <h3>报告列表</h3>
              <span>{{ reportsLoading ? '加载中' : sortedReports.length > 0 ? `${sortedReports.length} 份` : '0 份' }}</span>
            </header>

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

            <ReportSummary
              v-else
              :reports="familyReports"
              empty-title="家属端暂无报告返回"
              empty-description="当前老人还没有生成报告，可先补全画像或开始家属访谈。"
            />
          </div>
        </section>

        <section v-if="selectedReportId" class="surface-card report-detail-card">
          <div class="reports-shell__header">
            <h3>报告详情</h3>
            <span>{{ reportDetailLoading ? '加载中' : selectedReportId }}</span>
          </div>

          <div v-if="reportDetailLoading" class="loading-card">正在加载报告详情...</div>
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
.family-detail-page {
  display: grid;
  gap: 18px;
}

.detail-hero {
  padding: 28px 30px;
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.detail-hero h1 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(2rem, 3.4vw, 3rem);
}

.detail-hero p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.8;
}

.detail-hero__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.88fr);
  gap: 20px;
  align-items: start;
}

.detail-form-card {
  padding: 24px;
}

.detail-form-card__header h2 {
  margin: 0;
  color: var(--ink-strong);
}

.detail-form-card__header p {
  margin: 8px 0 0;
  color: var(--ink-muted);
}

.detail-form {
  margin-top: 18px;
  max-height: 62rem;
  overflow: auto;
  padding-right: 8px;
  display: grid;
  gap: 18px;
}

.form-group-card {
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.form-group-card__header h3 {
  margin: 0 0 14px;
  color: var(--ink-strong);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  color: var(--ink-strong);
  font-weight: 600;
}

.field input,
.field select,
.interview-composer textarea {
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
}

.interview-composer textarea {
  min-height: 120px;
  padding-top: 14px;
  resize: vertical;
}

.detail-side {
  display: grid;
  gap: 18px;
}

.hint-card,
.reports-shell,
.interview-card,
.report-detail-card {
  padding: 22px;
}

.hint-card h3,
.reports-shell__header h3 {
  margin: 0;
  color: var(--ink-strong);
}

.hint-card__text,
.interview-meta,
.report-item p,
.conversation-item p {
  color: var(--ink-muted);
}

.hint-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.hint-chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  color: var(--brand-strong);
  font-weight: 700;
}

.reports-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.reports-shell__header span {
  color: var(--ink-muted);
}

.report-list,
.conversation-list {
  margin-top: 16px;
  display: grid;
  gap: 12px;
  max-height: 20rem;
  overflow: auto;
}

.report-item,
.conversation-item {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(90, 142, 209, 0.12);
  background: rgba(255, 255, 255, 0.84);
}

.report-item {
  display: grid;
  gap: 12px;
}

.report-item p,
.conversation-item p {
  margin: 6px 0 0;
  line-height: 1.7;
}

.report-item__actions,
.interview-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.interview-actions {
  margin-top: 16px;
}

.conversation-item strong {
  color: var(--ink-strong);
}

.interview-composer {
  margin-top: 16px;
  display: grid;
  gap: 12px;
}

.loading-card,
.error-banner,
.success-banner {
  padding: 14px 16px;
  border-radius: 16px;
}

.error-banner {
  background: rgba(183, 75, 75, 0.08);
  color: var(--danger);
}

.success-banner {
  background: rgba(59, 174, 106, 0.1);
  color: #28724f;
}

@media (max-width: 980px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }

  .detail-hero {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .detail-hero,
  .detail-form-card,
  .hint-card,
  .reports-shell,
  .interview-card,
  .report-detail-card {
    padding: 20px;
  }

  .detail-hero__actions,
  .report-item__actions,
  .interview-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/core'
import {
  createDoctorFollowup,
  getDoctorElderlyDetail,
  updateDoctorManagement
} from '@/api/doctor'
import { exportReportPdf, getReportDetail } from '@/api/report'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ProfileOverview from '@/components/ProfileOverview.vue'
import ReportDetailModal from '@/components/ReportDetailModal.vue'
import { useAuthSession } from '@/session'
import type { DoctorElderlyDetail } from '@/types'
import { getIdentityTitle } from '@/utils/profile'
import { getReportGeneratedAt, getReportId, getSequentialReportName } from '@/utils/report'

const props = defineProps<{
  elderlyId: string
}>()

const managementStatusOptions = [
  { value: 'normal', label: '常规管理' },
  { value: 'priority_follow_up', label: '重点随访' }
]

const visitTypeOptions = ['电话', '门诊', '上门'] as const

const router = useRouter()
const { session } = useAuthSession()

const selectedDetail = ref<DoctorElderlyDetail | null>(null)
const detailLoading = ref(false)
const managementSaving = ref(false)
const followupSaving = ref(false)
const reportDetailLoading = ref(false)
const downloadingReportId = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)

const managementForm = reactive({
  isKeyCase: false,
  managementStatus: 'normal',
  contactedFamily: false,
  arrangedRevisit: false,
  referred: false,
  nextFollowupAt: ''
})

const followupForm = reactive({
  visitType: '电话' as (typeof visitTypeOptions)[number],
  findings: '',
  recommendationsText: '',
  contactedFamily: false,
  arrangedRevisit: false,
  referred: false,
  nextFollowupAt: '',
  notes: ''
})

const doctorToken = computed(() =>
  session.value?.role === 'doctor' ? session.value.token : ''
)
const selectedOverview = computed(() => selectedDetail.value?.overview || null)
const selectedTitle = computed(() => {
  if (!selectedDetail.value) {
    return '老人详情'
  }

  return getIdentityTitle(
    selectedDetail.value.profile || {},
    selectedDetail.value.name || `老人 ${selectedDetail.value.elderly_id.slice(0, 8)}`
  )
})
const sortedReports = computed(() =>
  [...(selectedDetail.value?.reports || [])].sort((left, right) =>
    getReportGeneratedAt(right).localeCompare(getReportGeneratedAt(left))
  )
)
const activeReport = computed(() => {
  if (!selectedReportId.value || !selectedDetail.value) {
    return null
  }

  return selectedDetail.value.reports.find((report) => getReportId(report) === selectedReportId.value) || null
})
const selectedReportTitle = computed(() => {
  if (!selectedReportId.value) {
    return '历史报告'
  }

  const reportIndex = sortedReports.value.findIndex((report) => getReportId(report) === selectedReportId.value)
  return getSequentialReportName(reportIndex + 1)
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

function formatDateTimeLocalInput(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16)
  }

  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatRiskLevel(value: string | undefined) {
  const normalizedValue = (value || '').trim().toLowerCase()
  const map: Record<string, string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    unknown: '待评估'
  }

  return map[normalizedValue] || value || '待评估'
}

function formatManagementStatus(value: string | undefined) {
  const matchedOption = managementStatusOptions.find((option) => option.value === value)
  return matchedOption?.label || value || '未设置'
}

function parseRecommendations(rawValue: string) {
  return rawValue
    .split(/\n|[;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getDoctorErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback
  }

  if (error.message.includes('The string did not match the expected pattern.')) {
    return fallback
  }

  return error.message || fallback
}

function resetFollowupForm() {
  followupForm.visitType = '电话'
  followupForm.findings = ''
  followupForm.recommendationsText = ''
  followupForm.contactedFamily = false
  followupForm.arrangedRevisit = false
  followupForm.referred = false
  followupForm.nextFollowupAt = ''
  followupForm.notes = ''
}

function closeReportModal() {
  selectedReportId.value = ''
  selectedReportDetail.value = null
}

function applyManagementForm(detail: DoctorElderlyDetail) {
  managementForm.isKeyCase = detail.management.is_key_case
  managementForm.managementStatus = detail.management.management_status || 'normal'
  managementForm.contactedFamily = detail.management.contacted_family
  managementForm.arrangedRevisit = detail.management.arranged_revisit
  managementForm.referred = detail.management.referred
  managementForm.nextFollowupAt = formatDateTimeLocalInput(detail.management.next_followup_at)
}

async function openReportDetail(reportId: string) {
  if (!doctorToken.value || !reportId) {
    return
  }

  selectedReportId.value = reportId
  reportDetailLoading.value = true
  errorMessage.value = ''

  try {
    selectedReportDetail.value = await getReportDetail(reportId, doctorToken.value)
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '加载报告详情失败，请稍后重试。')
  } finally {
    reportDetailLoading.value = false
  }
}

async function loadDoctorDetail() {
  if (!doctorToken.value || !props.elderlyId) {
    errorMessage.value = '当前医生登录已失效，请重新进入医生端。'
    return
  }

  detailLoading.value = true
  errorMessage.value = ''

  try {
    const detail = await getDoctorElderlyDetail(props.elderlyId, doctorToken.value)
    selectedDetail.value = detail
    applyManagementForm(detail)

    if (
      selectedReportId.value &&
      !detail.reports.some((report) => getReportId(report) === selectedReportId.value)
    ) {
      selectedReportId.value = ''
      selectedReportDetail.value = null
    }
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '加载老人详情失败，请稍后重试。')
    selectedDetail.value = null
  } finally {
    detailLoading.value = false
  }
}

async function saveManagement() {
  if (!doctorToken.value || !props.elderlyId) {
    errorMessage.value = '当前医生登录已失效，请重新进入医生端。'
    return
  }

  managementSaving.value = true
  errorMessage.value = ''

  try {
    await updateDoctorManagement(props.elderlyId, doctorToken.value, {
      isKeyCase: managementForm.isKeyCase,
      managementStatus: managementForm.managementStatus,
      contactedFamily: managementForm.contactedFamily,
      arrangedRevisit: managementForm.arrangedRevisit,
      referred: managementForm.referred,
      nextFollowupAt: managementForm.nextFollowupAt || undefined
    })

    successMessage.value = '管理状态已更新。'
    await loadDoctorDetail()
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '更新管理状态失败，请稍后重试。')
  } finally {
    managementSaving.value = false
  }
}

async function submitFollowup() {
  if (!doctorToken.value || !props.elderlyId) {
    errorMessage.value = '当前医生登录已失效，请重新进入医生端。'
    return
  }

  if (!followupForm.findings.trim()) {
    errorMessage.value = '请先填写本次发现。'
    return
  }

  followupSaving.value = true
  errorMessage.value = ''

  try {
    await createDoctorFollowup(props.elderlyId, doctorToken.value, {
      visitType: followupForm.visitType,
      findings: followupForm.findings.trim(),
      recommendations: parseRecommendations(followupForm.recommendationsText),
      contactedFamily: followupForm.contactedFamily,
      arrangedRevisit: followupForm.arrangedRevisit,
      referred: followupForm.referred,
      nextFollowupAt: followupForm.nextFollowupAt || undefined,
      notes: followupForm.notes.trim()
    })

    resetFollowupForm()
    successMessage.value = '随访记录已保存。'
    await loadDoctorDetail()
  } catch (error) {
    errorMessage.value = getDoctorErrorMessage(error, '保存随访记录失败，请稍后重试。')
  } finally {
    followupSaving.value = false
  }
}

async function handleDownloadReport(reportId: string) {
  if (!doctorToken.value || !reportId) {
    return
  }

  downloadingReportId.value = reportId
  errorMessage.value = ''

  try {
    const blob = await exportReportPdf(reportId, doctorToken.value)
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `${reportId}.pdf`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    if (error instanceof ApiError && error.status === 501) {
      errorMessage.value = '后端尚未实现 PDF 导出，目前仅支持在线查看报告。'
    } else {
      errorMessage.value = getDoctorErrorMessage(error, '导出 PDF 失败，请稍后重试。')
    }
  } finally {
    downloadingReportId.value = ''
  }
}

watch(() => props.elderlyId, async () => {
  selectedReportId.value = ''
  selectedReportDetail.value = null
  successMessage.value = ''
  await loadDoctorDetail()
})

onMounted(async () => {
  await loadDoctorDetail()
})
</script>

<template>
  <div class="page-width role-page doctor-detail-page">
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

    <div v-if="detailLoading && !selectedDetail" class="surface-card loading-card">正在加载老人详情...</div>

    <section v-else-if="selectedDetail" class="doctor-detail-layout">
      <div class="doctor-main-column">
        <section class="surface-card report-list-card">
          <header class="section-header">
            <div>
              <h3>报告列表</h3>
            </div>
            <span>{{ sortedReports.length }} 份</span>
          </header>

          <div v-if="sortedReports.length > 0" class="panel-list scroll-panel">
            <article
              v-for="(report, index) in sortedReports"
              :key="getReportId(report) || JSON.stringify(report)"
              class="panel-item"
            >
              <div>
                <strong>{{ getSequentialReportName(index + 1) }}</strong>
                <p>{{ formatDateTime(getReportGeneratedAt(report)) }}</p>
              </div>
              <div class="panel-actions">
                <button class="secondary-button" type="button" @click="openReportDetail(getReportId(report))">
                  查看报告
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

          <EmptyStateCard
            v-else
            title="暂无报告记录"
            description="当前老人还没有已生成的报告。"
          />
        </section>

        <ProfileOverview :profile="selectedDetail.profile" title="患者画像" />
      </div>

      <aside class="doctor-management-column">
        <section class="surface-card clinician-card">
          <header class="detail-card__header">
            <div>
              <p class="eyebrow">当前老人</p>
              <p class="detail-card__meta">
                更新时间：{{ formatDateTime(selectedDetail.updated_at || selectedDetail.created_at) }}
              </p>
            </div>

            <div class="detail-card__actions">
              <button class="secondary-button" type="button" @click="router.push('/doctor/hub')">返回总览</button>
            </div>
          </header>

          <div class="clinician-card__body">
            <div class="overview-grid">
              <article class="overview-card">
                <span>当前风险</span>
                <strong>{{ formatRiskLevel(selectedOverview?.current_risk_level) }}</strong>
              </article>
              <article class="overview-card">
                <span>管理状态</span>
                <strong>{{ formatManagementStatus(selectedDetail.management.management_status) }}</strong>
              </article>
              <article class="overview-card">
                <span>功能状态</span>
                <strong>{{ selectedOverview?.functional_status_text || '暂无' }}</strong>
              </article>
              <article class="overview-card">
                <span>慢病摘要</span>
                <strong>{{ selectedOverview?.chronic_summary || '暂无' }}</strong>
              </article>
            </div>

            <section class="workspace-section">
              <header class="section-header">
                <div>
                  <h3>医生管理状态</h3>
                  <p>这部分仅写入医生侧管理表，不会改写老人画像。</p>
                </div>
              </header>

              <form class="form-grid" @submit.prevent="saveManagement">
                <label class="field field--checkbox">
                  <input v-model="managementForm.isKeyCase" type="checkbox" />
                  <span>标记为重点个案</span>
                </label>

                <label class="field">
                  <span>管理状态</span>
                  <select v-model="managementForm.managementStatus">
                    <option v-for="option in managementStatusOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="field field--checkbox">
                  <input v-model="managementForm.contactedFamily" type="checkbox" />
                  <span>已联系家属</span>
                </label>

                <label class="field field--checkbox">
                  <input v-model="managementForm.arrangedRevisit" type="checkbox" />
                  <span>已安排复诊/复评</span>
                </label>

                <label class="field field--checkbox">
                  <input v-model="managementForm.referred" type="checkbox" />
                  <span>已转诊</span>
                </label>

                <label class="field">
                  <span>下次随访时间</span>
                  <input v-model="managementForm.nextFollowupAt" type="datetime-local" />
                </label>

                <button class="primary-button form-submit" type="submit" :disabled="managementSaving">
                  {{ managementSaving ? '保存中...' : '保存管理状态' }}
                </button>
              </form>
            </section>

            <section class="workspace-section">
              <header class="section-header">
                <div>
                  <h3>医生随访</h3>
                  <p>保存电话、门诊或上门随访记录，并同步刷新最近随访信息。</p>
                </div>
              </header>

              <div v-if="selectedDetail.followups.length > 0" class="panel-list scroll-panel">
                <article
                  v-for="followup in selectedDetail.followups"
                  :key="followup.followup_id"
                  class="panel-item"
                >
                  <div class="followup-item__top">
                    <strong>{{ followup.visit_type }}</strong>
                    <span>{{ formatDateTime(followup.created_at) }}</span>
                  </div>
                  <p>{{ followup.findings }}</p>
                  <ul v-if="followup.recommendations.length > 0" class="plain-list">
                    <li v-for="item in followup.recommendations" :key="item">{{ item }}</li>
                  </ul>
                </article>
              </div>

              <EmptyStateCard
                v-else
                title="暂无随访记录"
                description="当前老人还没有医生随访记录。"
              />

              <form class="form-grid followup-form" @submit.prevent="submitFollowup">
                <label class="field">
                  <span>随访方式</span>
                  <select v-model="followupForm.visitType">
                    <option v-for="option in visitTypeOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </label>

                <label class="field field--full">
                  <span>本次发现</span>
                  <textarea
                    v-model="followupForm.findings"
                    rows="4"
                    placeholder="例如：近一周夜间起身增多，家属反馈步态较前变慢。"
                  />
                </label>

                <label class="field field--full">
                  <span>建议措施</span>
                  <textarea
                    v-model="followupForm.recommendationsText"
                    rows="3"
                    placeholder="每行一条建议，例如：两周内复评步态"
                  />
                </label>

                <label class="field field--checkbox">
                  <input v-model="followupForm.contactedFamily" type="checkbox" />
                  <span>本次已联系家属</span>
                </label>

                <label class="field field--checkbox">
                  <input v-model="followupForm.arrangedRevisit" type="checkbox" />
                  <span>已安排复诊/复评</span>
                </label>

                <label class="field field--checkbox">
                  <input v-model="followupForm.referred" type="checkbox" />
                  <span>已转诊</span>
                </label>

                <label class="field">
                  <span>下次随访时间</span>
                  <input v-model="followupForm.nextFollowupAt" type="datetime-local" />
                </label>

                <label class="field field--full">
                  <span>补充备注</span>
                  <textarea
                    v-model="followupForm.notes"
                    rows="3"
                    placeholder="例如：建议继续观察夜间如厕风险。"
                  />
                </label>

                <button class="primary-button form-submit" type="submit" :disabled="followupSaving">
                  {{ followupSaving ? '保存中...' : '保存随访记录' }}
                </button>
              </form>
            </section>
          </div>
        </section>
      </aside>
    </section>

    <EmptyStateCard
      v-else
      title="暂无老人详情"
      description="当前老人信息暂时不可用，请返回总览重新选择。"
    />

    <ReportDetailModal
      v-if="selectedReportId"
      :report-id="selectedReportId"
      :report-title="selectedReportTitle"
      :report="selectedReportDetail || activeReport || null"
      :loading="reportDetailLoading"
      :downloading="downloadingReportId === selectedReportId"
      empty-text="当前报告没有返回可展示的结构化内容。"
      @close="closeReportModal"
      @download="handleDownloadReport(selectedReportId)"
    />
  </div>
</template>

<style scoped>
.doctor-detail-page {
  display: grid;
  gap: 18px;
}

.doctor-detail-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.92fr) minmax(0, 1.08fr);
  gap: 20px;
  align-items: start;
}

.doctor-main-column,
.doctor-management-column {
  display: grid;
  gap: 18px;
}

.report-list-card,
.clinician-card,
.loading-card {
  padding: 22px;
}

.detail-card__header,
.section-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.detail-card__header h1,
.section-header h3,
.detail-card__meta,
.section-header p,
.panel-item p,
.muted-text {
  margin: 0;
}

.detail-card__header h1 {
  margin-top: 10px;
  color: var(--ink-strong);
  font-size: clamp(2rem, 3vw, 2.5rem);
}

.detail-card__meta,
.section-header p,
.panel-item p,
.muted-text {
  margin-top: 8px;
  color: var(--ink-muted);
  line-height: 1.7;
}

.detail-card__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.clinician-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.clinician-card__body {
  display: grid;
  gap: 18px;
}

.overview-grid,
.overview-columns {
  display: grid;
  gap: 14px;
}

.overview-grid {
  margin-top: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-card,
.workspace-section,
.panel-item {
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.overview-card span,
.section-header span,
.followup-item__top span,
.session-flags {
  color: var(--ink-muted);
}

.overview-card strong,
.detail-card__header h1,
.section-header h3,
.panel-item strong,
.overview-columns h2,
.workspace-section h2 {
  color: var(--ink-strong);
}

.overview-card strong {
  display: block;
  margin-top: 10px;
  font-size: 1rem;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  color: var(--brand-strong);
  font-weight: 700;
}

.overview-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-columns h2,
.workspace-section h2 {
  margin: 0 0 10px;
  font-size: 1.05rem;
}

.plain-list {
  margin: 0;
  padding-left: 18px;
  color: var(--ink-muted);
  line-height: 1.8;
}

.panel-list {
  display: grid;
  gap: 12px;
  max-height: 24rem;
  overflow: auto;
  padding-right: 6px;
}

.panel-actions,
.followup-item__top,
.session-flags {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.conversation-item p,
.panel-item p {
  margin: 8px 0 0;
  line-height: 1.7;
}

.form-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.followup-form {
  margin-top: 18px;
}

.workspace-section :deep(.empty-state-card) {
  margin-top: 16px;
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
.field textarea {
  width: 100%;
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.94);
}

.field textarea {
  min-height: 120px;
  padding-top: 14px;
  resize: vertical;
}

.field--checkbox {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.field--checkbox input {
  width: 18px;
  height: 18px;
  margin: 0;
}

.field--checkbox span {
  font-weight: 500;
}

.field--full,
.form-submit {
  grid-column: 1 / -1;
}

.error-banner,
.success-banner {
  margin: 0;
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

.loading-card {
  color: var(--ink-muted);
}

@media (max-width: 1180px) {
  .doctor-detail-layout,
  .overview-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .report-list-card,
  .clinician-card,
  .loading-card {
    padding: 20px;
  }

  .overview-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .detail-card__header,
  .section-header,
  .panel-actions,
  .followup-item__top,
  .session-flags {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

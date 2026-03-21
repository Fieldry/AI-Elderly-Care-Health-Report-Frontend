<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/core'
import { getFamilyElderly, getFamilyReports, updateFamilyElderly } from '@/api/family'
import { exportReportPdf, generateReportForElderly, getReportDetail } from '@/api/report'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ReportDetailModal from '@/components/ReportDetailModal.vue'
import { useAuthSession } from '@/session'
import {
  cloneProfileForForm,
  getIdentityTitle,
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  serializeProfilePayload
} from '@/utils/profile'
import { getReportGeneratedAt, getReportId, getSequentialReportName } from '@/utils/report'

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
const downloadingReportId = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const familyReports = ref<Array<Record<string, unknown>>>([])
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)
const profileForm = reactive<Record<string, unknown>>({})

const groupedFields = PROFILE_GROUPS.map((group) => ({
  group,
  fields: PROFILE_FIELDS.filter((field) => field.group === group)
}))

const displayTitle = computed(() =>
  getIdentityTitle(profileForm, `老人档案 ${props.elderlyId.slice(0, 8)}`)
)
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

function resetMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function closeReportModal() {
  selectedReportId.value = ''
  selectedReportDetail.value = null
}

function applyProfileForm(profile: Record<string, unknown> | null | undefined) {
  const clonedProfile = cloneProfileForForm(profile || {})

  for (const key of Object.keys(profileForm)) {
    delete profileForm[key]
  }

  Object.assign(profileForm, clonedProfile)
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
    applyProfileForm(detail.profile)
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
    successMessage.value = '画像信息已保存。'
    await Promise.all([loadProfileDetail(), loadReports()])
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
  await Promise.all([loadProfileDetail(), loadReports()])
})
</script>

<template>
  <div class="page-width role-page family-detail-page">
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

    <section class="detail-layout">
      <article class="surface-card detail-form-card">
        <header class="detail-form-card__header">
          <div>
            <p class="eyebrow">当前老人</p>
            <h1>{{ displayTitle }}</h1>
            <p>按分组补充老人基本信息、功能状态、慢病与社会支持等字段。</p>
          </div>

          <div class="detail-form-card__actions">
            <button class="secondary-button" type="button" @click="router.push('/family/hub')">返回列表</button>
            <button class="primary-button" type="button" :disabled="loading || saving" @click="saveProfile">
              {{ saving ? '保存中...' : '保存画像' }}
            </button>
            <button class="ghost-button" type="button" :disabled="generatingReport" @click="handleGenerateReport">
              {{ generatingReport ? '生成中...' : '生成报告' }}
            </button>
          </div>
        </header>

        <div v-if="loading" class="loading-card">正在加载老人画像...</div>

        <div v-else class="detail-form scroll-panel">
          <section v-for="group in groupedFields" :key="group.group" class="form-group-card">
            <div class="form-group-card__header">
              <h2>{{ group.group }}</h2>
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
        <section class="surface-card reports-shell">
          <header class="reports-shell__header">
            <h3>报告列表</h3>
            <span>{{ reportsLoading ? '加载中' : sortedReports.length > 0 ? `${sortedReports.length} 份` : '0 份' }}</span>
          </header>

          <div v-if="sortedReports.length > 0" class="report-list scroll-panel">
            <article
              v-for="(report, index) in sortedReports"
              :key="getReportId(report) || JSON.stringify(report)"
              class="report-item"
            >
              <div>
                <strong>{{ getSequentialReportName(index + 1) }}</strong>
                <p>{{ formatDateTime(getReportGeneratedAt(report)) }}</p>
              </div>
              <div class="report-item__actions">
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
            title="家属端暂无报告返回"
            description="当前老人还没有生成报告，可先补全画像。"
          />
        </section>
      </aside>
    </section>

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
.family-detail-page {
  display: grid;
  gap: 18px;
}

.detail-layout {
  --workspace-panel-height: min(44rem, calc(100dvh - 11rem));
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.88fr);
  gap: 20px;
  align-items: start;
}

.detail-form-card,
.reports-shell,
.loading-card {
  padding: 20px;
}

.detail-form-card__header,
.reports-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.detail-form-card__header h1 {
  margin: 10px 0 0;
  color: var(--ink-strong);
  font-size: clamp(1.9rem, 2.8vw, 2.4rem);
}

.detail-form-card__header p,
.reports-shell__header span,
.report-item p {
  color: var(--ink-muted);
}

.detail-form-card__header p {
  margin: 10px 0 0;
  line-height: 1.7;
}

  .detail-form-card__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-form-card {
  height: var(--workspace-panel-height);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-form {
  margin-top: 16px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
  display: grid;
  gap: 14px;
}

.form-group-card {
  padding: 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.form-group-card__header h2 {
  margin: 0 0 14px;
  color: var(--ink-strong);
  font-size: 1.1rem;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
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
.field select {
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
}

.detail-side {
  display: grid;
  gap: 18px;
  min-height: 0;
}

.reports-shell {
  height: var(--workspace-panel-height);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.reports-shell__header h3 {
  margin: 0;
  color: var(--ink-strong);
}

.report-list {
  margin-top: 16px;
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  gap: 12px;
  overflow: auto;
  padding-right: 6px;
}

.report-item {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(90, 142, 209, 0.12);
  background: rgba(255, 255, 255, 0.84);
  display: grid;
  gap: 12px;
}

.report-item p {
  margin: 6px 0 0;
  line-height: 1.7;
}

.report-item__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
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

.loading-card {
  color: var(--ink-muted);
}

@media (max-width: 980px) {
  .detail-layout {
    grid-template-columns: 1fr;
    --workspace-panel-height: auto;
  }
}

@media (max-width: 760px) {
  .detail-form-card__header,
  .reports-shell__header {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-form-card__actions,
  .report-item__actions,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .detail-form-card__actions {
    display: grid;
  }
}

@media (max-width: 640px) {
  .detail-form-card,
  .reports-shell,
  .loading-card {
    padding: 20px;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/core'
import { bindFamilyElderly } from '@/api/auth'
import {
  getFamilyElderly,
  getFamilyReports,
  listFamilyElderly,
  unbindFamilyElderly,
  updateFamilyElderly
} from '@/api/family'
import { exportReportPdf, getReportDetail } from '@/api/report'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import ReportDetailModal from '@/components/ReportDetailModal.vue'
import iconLinkedElderly from '@/assets/lanhu/icon-linked-elderly.png'
import iconProfileEdit from '@/assets/lanhu/icon-profile-edit.png'
import {
  clearStoredFamilyConversationSessionId,
  updateStoredFamilyElderlyIds,
  useAuthSession
} from '@/session'
import type { FamilyElderlyDetail, FamilyElderlySummary } from '@/types'
import { formatProfileValue, getIdentityTitle, getMissingCoreFields } from '@/utils/profile'
import {
  getReportGeneratedAt,
  getReportId,
  getReportRecommendationPreview,
  getSequentialReportName
} from '@/utils/report'

const router = useRouter()
const { session } = useAuthSession()

const elderlyList = ref<FamilyElderlySummary[]>([])
const cardDrafts = reactive<Record<string, { name: string; relation: string }>>({})
const cardSaving = reactive<Record<string, boolean>>({})
const selectedElderlyId = ref('')
const selectedDetail = ref<FamilyElderlyDetail | null>(null)
const familyReports = ref<Array<Record<string, unknown>>>([])
const selectedReportId = ref('')
const selectedReportDetail = ref<Record<string, unknown> | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const reportsLoading = ref(false)
const reportDetailLoading = ref(false)
const binding = ref(false)
const unbindingElderlyId = ref('')
const downloadingReportId = ref('')
const showBindForm = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const bindForm = reactive({
  elderlyId: '',
  relation: '子女'
})

let detailRequestId = 0

const selectedSummary = computed(
  () => elderlyList.value.find((item) => item.elderly_id === selectedElderlyId.value) || null
)
const selectedCompletionPercent = computed(() =>
  Math.round((selectedSummary.value?.completion_rate ?? 0) * 100)
)
const selectedTitle = computed(() => {
  const fallback =
    selectedSummary.value?.name ||
    (selectedElderlyId.value ? `老人档案 ${selectedElderlyId.value.slice(0, 8)}` : '请选择一位老人')

  return getIdentityTitle(selectedDetail.value?.profile || {}, fallback)
})
const selectedMissingFields = computed(() =>
  getMissingCoreFields(selectedDetail.value?.profile || {}).slice(0, 6)
)
const selectedSummaryItems = computed(() => {
  const profile = selectedDetail.value?.profile || {}

  return [
    { label: '与老人关系', value: selectedSummary.value?.relation || '家庭成员' },
    { label: '年龄', value: formatProfileValue(profile.age) },
    { label: '性别', value: formatProfileValue(profile.sex) },
    { label: '居住地类型', value: formatProfileValue(profile.residence) },
    { label: '受教育年限', value: formatProfileValue(profile.education_years) },
    { label: '居住安排', value: formatProfileValue(profile.living_arrangement) },
    { label: '主要照护者', value: formatProfileValue(profile.caregiver) },
    { label: '健康限制', value: formatProfileValue(profile.health_limitation) },
    { label: '医保情况', value: formatProfileValue(profile.medical_insurance) }
  ]
})
const sortedReports = computed(() =>
  [...familyReports.value].sort((left, right) =>
    getReportGeneratedAt(right).localeCompare(getReportGeneratedAt(left))
  )
)
const reportCards = computed(() =>
  sortedReports.value.map((report, index) => ({
    report,
    reportId: getReportId(report),
    reportTitle: getSequentialReportName(index + 1),
    generatedAt: getReportGeneratedAt(report),
    recommendations: getReportRecommendationPreview(report, 2)
  }))
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

function formatDate(value: string) {
  if (!value) return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('zh-CN')
}

function resetMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function syncCardDrafts(records: FamilyElderlySummary[]) {
  for (const elderly of records) {
    cardDrafts[elderly.elderly_id] = {
      name: elderly.name || '',
      relation: elderly.relation || ''
    }
  }
}

function applyCardPatch(elderlyId: string, patch: { name?: string; relation?: string }) {
  const summary = elderlyList.value.find((item) => item.elderly_id === elderlyId)
  if (summary) {
    if (patch.name !== undefined) {
      summary.name = patch.name || summary.name
    }
    if (patch.relation !== undefined) {
      summary.relation = patch.relation || summary.relation
    }
  }

  if (selectedSummary.value?.elderly_id === elderlyId && selectedDetail.value?.profile) {
    if (patch.name !== undefined) {
      selectedDetail.value.profile = {
        ...selectedDetail.value.profile,
        name: patch.name || selectedDetail.value.profile.name
      }
    }
  }
}

async function saveCardDraft(elderlyId: string) {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  const draft = cardDrafts[elderlyId]
  if (!draft) {
    return
  }

  const payload: Record<string, unknown> = {}
  const nextName = draft.name.trim()
  const nextRelation = draft.relation.trim()
  const currentSummary = elderlyList.value.find((item) => item.elderly_id === elderlyId)

  if (nextName && nextName !== (currentSummary?.name || '')) {
    payload.name = nextName
  }
  if (nextRelation && nextRelation !== (currentSummary?.relation || '')) {
    payload.relation = nextRelation
  }

  if (Object.keys(payload).length === 0) {
    return
  }

  cardSaving[elderlyId] = true
  resetMessages()

  try {
    await updateFamilyElderly(elderlyId, session.value.token, payload)
    applyCardPatch(elderlyId, {
      name: nextName,
      relation: nextRelation
    })
    successMessage.value = '老人备注与关系已更新。'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '保存老人信息失败，请稍后重试。'
  } finally {
    cardSaving[elderlyId] = false
  }
}

function closeReportModal() {
  selectedReportId.value = ''
  selectedReportDetail.value = null
}

async function loadReports() {
  if (!session.value?.token || session.value.role !== 'family' || !selectedElderlyId.value) {
    familyReports.value = []
    return
  }

  reportsLoading.value = true

  try {
    familyReports.value = await getFamilyReports(selectedElderlyId.value, session.value.token)

    if (
      selectedReportId.value &&
      !familyReports.value.some((report) => getReportId(report) === selectedReportId.value)
    ) {
      closeReportModal()
    }
  } catch {
    familyReports.value = []
  } finally {
    reportsLoading.value = false
  }
}

async function selectElderly(elderlyId: string) {
  if (!session.value?.token || session.value.role !== 'family' || !elderlyId) {
    return
  }

  selectedElderlyId.value = elderlyId
  detailLoading.value = true
  errorMessage.value = ''

  const requestId = ++detailRequestId

  try {
    const detail = await getFamilyElderly(elderlyId, session.value.token)
    if (requestId !== detailRequestId) {
      return
    }

    selectedDetail.value = detail
    await loadReports()
  } catch (error) {
    if (requestId !== detailRequestId) {
      return
    }

    selectedDetail.value = null
    familyReports.value = []
    errorMessage.value =
      error instanceof Error ? error.message : '加载老人基本信息失败，请稍后重试。'
  } finally {
    if (requestId === detailRequestId) {
      detailLoading.value = false
    }
  }
}

async function loadFamilyElderly() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  loading.value = true
  resetMessages()

  try {
    const records = await listFamilyElderly(session.value.token)
    elderlyList.value = records
    syncCardDrafts(records)

    if (records.length === 0) {
      selectedElderlyId.value = ''
      selectedDetail.value = null
      familyReports.value = []
      detailLoading.value = false
      return
    }

    const nextElderlyId = records.some((item) => item.elderly_id === selectedElderlyId.value)
      ? selectedElderlyId.value
      : records[0].elderly_id

    await selectElderly(nextElderlyId)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载关联老人失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function handleBindElderly() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  if (!bindForm.elderlyId.trim()) {
    errorMessage.value = '请输入要绑定的老人绑定码。'
    return
  }

  if (!bindForm.relation.trim()) {
    errorMessage.value = '请输入与老人的关系。'
    return
  }

  binding.value = true
  resetMessages()

  try {
    const targetElderlyId = bindForm.elderlyId.trim()
    const response = await bindFamilyElderly(session.value.token, {
      elderlyId: targetElderlyId,
      relation: bindForm.relation.trim()
    })

    const mergedElderlyIds = response.elderly_ids || session.value.elderlyIds
    updateStoredFamilyElderlyIds(mergedElderlyIds)
    selectedElderlyId.value = response.elderly_id || mergedElderlyIds[0] || ''
    successMessage.value = '老人绑定成功，列表已刷新。'
    bindForm.elderlyId = ''
    bindForm.relation = '子女'
    showBindForm.value = false
    await loadFamilyElderly()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '绑定老人失败，请稍后重试。'
  } finally {
    binding.value = false
  }
}

async function handleUnbindElderly(elderlyId: string) {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  const target = elderlyList.value.find((item) => item.elderly_id === elderlyId)
  const targetName = target?.name || '该老人'
  if (!window.confirm(`确定要解除与“${targetName}”的绑定吗？解除后该老人将不再显示在家属端列表中。`)) {
    return
  }

  unbindingElderlyId.value = elderlyId
  resetMessages()

  try {
    const response = await unbindFamilyElderly(elderlyId, session.value.token)
    const remainingIds = response.elderly_ids || session.value.elderlyIds.filter((item) => item !== elderlyId)
    updateStoredFamilyElderlyIds(remainingIds)
    clearStoredFamilyConversationSessionId(elderlyId)

    elderlyList.value = elderlyList.value.filter((item) => item.elderly_id !== elderlyId)
    delete cardDrafts[elderlyId]

    if (selectedElderlyId.value === elderlyId) {
      selectedElderlyId.value = ''
      selectedDetail.value = null
      familyReports.value = []
      closeReportModal()
    }

    successMessage.value = '已解除绑定。'
    await loadFamilyElderly()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '解除绑定失败，请稍后重试。'
  } finally {
    unbindingElderlyId.value = ''
  }
}

function openElderlyDetail(elderlyId: string) {
  if (!elderlyId) return
  router.push(`/family/elderly/${elderlyId}`)
}

function openSelectedElderlyDetail() {
  openElderlyDetail(selectedElderlyId.value)
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
  await loadFamilyElderly()
})
</script>

<template>
  <div class="page-width role-page family-page">
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

    <section class="family-layout">
      <article class="surface-card record-list-card">
        <header class="record-list-card__header">
          <div class="family-hero">
            <p class="eyebrow">家属端</p>
            <div class="family-hero__title-row">
              <h1>关联老人</h1>
              <div class="family-hero__actions">
                <button class="secondary-button" type="button" @click="loadFamilyElderly">
                  <img class="tool-icon" :src="iconLinkedElderly" alt="" />
                  刷新列表
                </button>
                <button class="secondary-button" type="button" @click="showBindForm = !showBindForm">
                  <img class="tool-icon" :src="iconProfileEdit" alt="" />
                  {{ showBindForm ? '收起绑定' : '新增绑定' }}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div v-if="showBindForm" class="bind-form-shell">
          <div class="bind-form">
            <label class="field">
              <span>老人绑定码</span>
              <input v-model="bindForm.elderlyId" type="text" placeholder="请输入老人绑定码" />
            </label>
            <label class="field">
              <span>与老人关系</span>
              <input v-model="bindForm.relation" type="text" placeholder="例如 子女 / 配偶" />
            </label>
            <button class="primary-button bind-form__submit" type="button" :disabled="binding" @click="handleBindElderly">
              {{ binding ? '绑定中...' : '确认绑定' }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="loading-card">正在加载关联老人...</div>

        <div v-else-if="elderlyList.length > 0" class="record-list scroll-panel">
          <article
            v-for="elderly in elderlyList"
            :key="elderly.elderly_id"
            class="record-item"
            :class="{ 'is-active': selectedElderlyId === elderly.elderly_id }"
            role="button"
            tabindex="0"
            @click="selectElderly(elderly.elderly_id)"
            @keydown.enter.prevent="selectElderly(elderly.elderly_id)"
          >
            <div class="record-item__top">
              <label class="record-item__editable">
                <span>备注</span>
                <input
                  v-model="cardDrafts[elderly.elderly_id].name"
                  type="text"
                  placeholder="未命名"
                  :disabled="cardSaving[elderly.elderly_id]"
                  @click.stop
                  @focus.stop
                  @blur="saveCardDraft(elderly.elderly_id)"
                  @keydown.enter.prevent="saveCardDraft(elderly.elderly_id)"
                />
              </label>
              <span class="completion-badge">{{ Math.round(elderly.completion_rate * 100) }}%</span>
            </div>

            <div class="record-item__meta">
              <label class="record-item__editable record-item__editable--compact">
                <span>与老人关系</span>
                <input
                  v-model="cardDrafts[elderly.elderly_id].relation"
                  type="text"
                  placeholder="例如 子女 / 配偶"
                  :disabled="cardSaving[elderly.elderly_id]"
                  @click.stop
                  @focus.stop
                  @blur="saveCardDraft(elderly.elderly_id)"
                  @keydown.enter.prevent="saveCardDraft(elderly.elderly_id)"
                />
              </label>
              <span>关联于 {{ formatDate(elderly.created_at) }}</span>
            </div>

            <p class="record-item__summary">
              已填写核心字段约 {{ Math.round(elderly.completion_rate * 100) }}%。
              <span v-if="cardSaving[elderly.elderly_id]" class="record-item__saving">保存中...</span>
            </p>

            <div class="record-item__progress" aria-hidden="true">
              <div
                class="record-item__progress-fill"
                :style="{ width: `${Math.round(elderly.completion_rate * 100)}%` }"
              />
            </div>

            <div class="record-item__actions">
              <button
                class="ghost-button record-item__unbind"
                type="button"
                :disabled="unbindingElderlyId === elderly.elderly_id"
                @click.stop="handleUnbindElderly(elderly.elderly_id)"
              >
                {{ unbindingElderlyId === elderly.elderly_id ? '解除中...' : '解除绑定' }}
              </button>
            </div>
          </article>
        </div>

        <EmptyStateCard
          v-else
          title="暂无关联老人"
          description="当前账号下没有已绑定老人。可在上方通过老人绑定码追加绑定。"
        />
      </article>

      <article
        v-if="detailLoading"
        class="surface-card loading-card"
      >
        正在加载老人基本信息...
      </article>

      <article
        v-else-if="selectedSummary"
        class="surface-card elderly-summary-card"
        role="button"
        tabindex="0"
        @click="openSelectedElderlyDetail"
        @keydown.enter.prevent="openSelectedElderlyDetail"
        @keydown.space.prevent="openSelectedElderlyDetail"
      >
        <header class="elderly-summary-card__header">
          <div>
            <p class="eyebrow">当前老人</p>
            <h2>{{ selectedTitle }}</h2>
            <p class="elderly-summary-card__meta">
              {{ selectedSummary.relation || '家庭成员' }} · 关联时间 {{ formatDate(selectedSummary.created_at) }}
            </p>
          </div>

          <div class="summary-progress">
            <strong>{{ selectedCompletionPercent }}%</strong>
            <span>核心字段完整度</span>
          </div>
        </header>

        <div class="progress-track">
          <div class="progress-track__fill" :style="{ width: `${selectedCompletionPercent}%` }" />
        </div>

        <div class="summary-grid">
          <article
            v-for="item in selectedSummaryItems"
            :key="item.label"
            class="summary-item"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>

        <article class="summary-note">
          <strong>查看方式</strong>
          <p>点击当前卡片可进入完整详情页，继续补全画像、保存信息和查看报告。</p>
        </article>

        <div v-if="selectedMissingFields.length > 0" class="hint-chip-list">
          <span v-for="field in selectedMissingFields" :key="field" class="hint-chip">{{ field }}</span>
        </div>

        <div class="summary-cta">
          <span>查看详细信息</span>
        </div>
      </article>

      <EmptyStateCard
        v-else
        class="surface-card empty-side-card"
        title="尚未选中老人"
        description="请先从左侧列表选择一位老人。"
      />

      <section class="surface-card reports-shell">
        <header class="reports-shell__header">
          <div>
            <p class="eyebrow">家属端</p>
            <h3>报告列表</h3>
          </div>
          <span>{{ reportsLoading ? '加载中' : `${reportCards.length} 份` }}</span>
        </header>

        <div v-if="reportCards.length > 0" class="report-list scroll-panel">
          <article
            v-for="reportCard in reportCards"
            :key="reportCard.reportId || JSON.stringify(reportCard.report)"
            class="report-item"
          >
            <div class="report-item__meta">
              <strong>{{ reportCard.reportTitle }}</strong>
              <p>{{ formatDate(reportCard.generatedAt) }}</p>
            </div>

            <section class="report-item__suggestions">
              <div class="report-item__suggestions-header">
                <h4>行动建议</h4>
              </div>

              <ul v-if="reportCard.recommendations.length > 0" class="report-item__suggestion-list">
                <li
                  v-for="item in reportCard.recommendations"
                  :key="`${reportCard.reportId}-${item.id}`"
                  class="report-item__suggestion"
                >
                  <p class="report-item__suggestion-priority">{{ item.priorityLabel }}</p>
                  <strong>{{ item.title }}</strong>
                  <p v-if="item.description" class="report-item__suggestion-description">{{ item.description }}</p>
                </li>
              </ul>

              <p v-else class="report-item__suggestion-empty">当前报告未返回可展示的结构化建议内容。</p>
            </section>

            <div class="report-item__actions">
              <button
                class="secondary-button"
                type="button"
                :disabled="!reportCard.reportId"
                @click="openReportDetail(reportCard.reportId)"
              >
                查看报告
              </button>
              <button
                class="ghost-button"
                type="button"
                :disabled="!reportCard.reportId || downloadingReportId === reportCard.reportId"
                @click="handleDownloadReport(reportCard.reportId)"
              >
                {{ downloadingReportId === reportCard.reportId ? '导出中...' : '导出 PDF' }}
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
.family-page {
  display: grid;
  gap: 18px;
}

.family-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.84fr) minmax(0, 1.3fr) minmax(320px, 0.92fr);
  gap: 20px;
  align-items: start;
}

.record-list-card,
.elderly-summary-card,
.reports-shell,
.loading-card,
.empty-side-card {
  padding: 22px;
}

.family-hero {
  display: grid;
  gap: 10px;
}

.family-hero__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.family-hero h1,
.elderly-summary-card h2,
.reports-shell h3 {
  margin: 0;
  color: var(--ink-strong);
}

.family-hero h1 {
  font-size: clamp(2rem, 3vw, 2.6rem);
}

.family-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.tool-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  margin-right: 8px;
  flex-shrink: 0;
}

.bind-form-shell {
  margin-top: 18px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px dashed rgba(120, 164, 199, 0.4);
}

.bind-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: end;
}

.bind-form__submit {
  grid-column: 1 / -1;
  justify-self: end;
  width: min(100%, 12rem);
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  color: var(--ink-strong);
  font-weight: 600;
}

.field input {
  width: 100%;
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
}

.record-list {
  margin-top: 18px;
  display: grid;
  gap: 12px;
  max-height: 65rem;
  overflow: auto;
  padding-right: 6px;
}

.record-item {
  width: 100%;
  cursor: pointer;
  padding: 16px 18px;
  border-radius: 20px;
  text-align: left;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.record-item:focus-within {
  border-color: rgba(72, 111, 166, 0.34);
  background: rgba(72, 111, 166, 0.08);
}

.record-item.is-active {
  border-color: rgba(72, 111, 166, 0.34);
  background: rgba(72, 111, 166, 0.08);
}

.record-item__top,
.record-item__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.record-item__editable {
  display: grid;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}

.record-item__editable span {
  font-size: 0.82rem;
  color: var(--ink-muted);
}

.record-item__editable input {
  width: 100%;
  min-height: 40px;
  border-radius: 14px;
  padding: 0 12px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.92);
}

.record-item__editable--compact input {
  min-height: 38px;
}

.record-item__top strong,
.summary-item strong,
.summary-note strong,
.summary-progress strong,
.summary-cta span,
.report-item__meta strong {
  color: var(--ink-strong);
}

.record-item__meta {
  margin-top: 10px;
  font-size: 0.92rem;
  color: var(--ink-muted);
}

.record-item__summary {
  margin: 10px 0 0;
  line-height: 1.7;
  color: var(--ink-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.record-item__saving {
  color: var(--brand-strong);
  font-weight: 600;
}

.record-item__progress {
  height: 10px;
  margin-top: 14px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  overflow: hidden;
}

.record-item__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--brand), var(--brand-strong));
}

.record-item__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.record-item__unbind {
  min-height: 34px;
  padding: 0 12px;
  color: var(--ink-muted);
}

.completion-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.14);
  color: var(--brand-strong);
  font-weight: 700;
}

.elderly-summary-card {
  display: grid;
  gap: 18px;
  cursor: pointer;
}

.elderly-summary-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.elderly-summary-card__meta {
  margin: 10px 0 0;
  line-height: 1.7;
  color: var(--ink-muted);
}

.summary-progress {
  display: grid;
  gap: 6px;
  text-align: right;
}

.summary-progress strong {
  font-size: 1.8rem;
}

.summary-progress span {
  color: var(--ink-muted);
}

.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  overflow: hidden;
}

.progress-track__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--brand), var(--brand-strong));
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.summary-item,
.summary-note {
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.summary-item {
  display: grid;
  gap: 8px;
}

.summary-item span {
  color: var(--ink-muted);
}

.summary-item strong {
  line-height: 1.6;
  font-size: 1.08rem;
}

.summary-note p {
  margin: 8px 0 0;
  line-height: 1.7;
  color: var(--ink-muted);
}

.hint-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hint-chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  color: var(--brand-strong);
  font-weight: 700;
}

.summary-cta {
  display: flex;
  justify-content: flex-end;
}

.summary-cta span {
  min-height: 46px;
  padding: 0 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(78, 135, 197, 0.12);
  font-weight: 700;
}

.reports-shell {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.reports-shell__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.reports-shell__header span {
  color: var(--ink-muted);
}

.report-list {
  margin-top: 16px;
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  overflow: auto;
  padding-right: 6px;
}

.report-item {
  padding: 16px 18px 18px;
  border-radius: 22px;
  border: 1px solid rgba(90, 142, 209, 0.12);
  background: rgba(255, 255, 255, 0.84);
  display: grid;
  gap: 14px;
}

.report-item__meta {
  display: grid;
  gap: 4px;
}

.report-item__meta p,
.report-item__suggestion-priority,
.report-item__suggestion-description,
.report-item__suggestion-empty {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.7;
}

.report-item__suggestions {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(245, 251, 255, 0.92), rgba(238, 247, 253, 0.84));
  border: 1px solid rgba(120, 164, 199, 0.14);
}

.report-item__suggestions-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.report-item__suggestions-header h4 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 1rem;
}

.report-item__suggestion-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.report-item__suggestion {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(90, 142, 209, 0.12);
}

.report-item__suggestion strong {
  display: block;
  color: var(--ink-strong);
  line-height: 1.6;
}

.report-item__suggestion-priority {
  margin-bottom: 4px;
  font-size: 0.86rem;
  letter-spacing: 0.04em;
}

.report-item__suggestion-description {
  margin-top: 6px;
  font-size: 0.92rem;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.report-item__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: auto;
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

@media (max-width: 1240px) {
  .family-layout {
    grid-template-columns: 1fr 1fr;
  }

  .reports-shell {
    grid-column: 1 / -1;
  }
}

@media (max-width: 860px) {
  .family-layout,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .bind-form {
    grid-template-columns: 1fr;
  }

  .bind-form__submit {
    grid-column: auto;
    justify-self: stretch;
    width: 100%;
  }

  .record-list-card__header,
  .elderly-summary-card__header,
  .reports-shell__header,
  .family-hero__title-row {
    flex-direction: column;
    align-items: stretch;
  }

  .family-hero__actions,
  .report-item__actions {
    justify-content: stretch;
  }

  .report-item__actions > *,
  .family-hero__actions > * {
    width: 100%;
  }
}

/* Design-shot layout override */
.family-page {
  width: min(1840px, calc(100vw - 48px));
}

.family-layout {
  min-height: calc(100vh - 122px);
  grid-template-columns: 410px minmax(0, 1fr) 560px;
  gap: 24px;
  align-items: stretch;
}

.record-list-card,
.elderly-summary-card,
.reports-shell,
.empty-side-card,
.loading-card {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.record-list-card {
  padding: 38px 0 0;
}

.family-hero__title-row {
  display: grid;
  gap: 18px;
}

.family-hero .eyebrow {
  letter-spacing: 0;
  text-transform: none;
  color: #0876d6;
  font-size: 1.08rem;
  font-weight: 900;
}

.family-hero h1 {
  color: #05080c;
  font-size: 2rem;
  font-weight: 900;
}

.family-hero__actions {
  justify-content: flex-start;
  gap: 22px;
}

.family-hero__actions .secondary-button {
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #0876d6;
  box-shadow: none;
  font-weight: 900;
}

.bind-form-shell {
  margin-top: 24px;
  padding: 16px 24px;
  border-radius: 0;
  border: 1px dashed rgba(8, 118, 214, 0.5);
  background: transparent;
}

.bind-form {
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 14px 18px;
}

.bind-form .field {
  display: contents;
}

.bind-form .field span {
  align-self: center;
  color: #0876d6;
  font-size: 1.08rem;
  font-weight: 900;
}

.bind-form .field input {
  min-height: 46px;
  border-radius: 14px;
  background: #fff;
}

.bind-form__submit {
  grid-column: 2;
  justify-self: end;
  width: 180px;
  min-height: 46px;
  border-radius: 999px;
  background: linear-gradient(135deg, #66b3f3, #0678d8);
  font-weight: 900;
}

.record-list {
  margin-top: 24px;
  gap: 24px;
  max-height: calc(100vh - 440px);
  padding-right: 0;
}

.record-item {
  padding: 24px 22px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  box-shadow: none;
}

.record-item.is-active {
  border: 2px solid #0876d6;
  background: #fff;
}

.record-item__top strong {
  color: #0876d6;
  font-size: 1.18rem;
}

.completion-badge {
  padding: 0;
  background: transparent;
  color: #0876d6;
  font-size: 1.08rem;
}

.record-item__meta,
.record-item__summary {
  font-size: 1rem;
}

.elderly-summary-card {
  padding: 28px 24px 36px;
  border-radius: 12px;
  background: #fff;
}

.elderly-summary-card__header {
  align-items: center;
}

.elderly-summary-card .eyebrow {
  letter-spacing: 0;
  text-transform: none;
  color: #0876d6;
  font-size: 1.08rem;
}

.elderly-summary-card h2 {
  margin-top: 26px;
  color: #05080c;
  font-size: 2rem;
  font-weight: 900;
}

.elderly-summary-card__meta {
  color: #565e64;
  font-size: 1rem;
}

.summary-progress {
  min-width: 340px;
  grid-template-columns: 220px 1fr;
  align-items: center;
  text-align: left;
}

.summary-progress strong {
  color: #0876d6;
  font-size: 2rem;
}

.progress-track {
  width: 260px;
  height: 16px;
  margin-left: 330px;
  margin-top: -36px;
  background: #e6edf2;
}

.progress-track__fill {
  background: linear-gradient(90deg, #63b5f5, #0876d6);
}

.summary-grid {
  margin-top: 34px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border: 1px solid #e3e5e7;
  border-radius: 12px;
  overflow: hidden;
}

.summary-item {
  min-height: 196px;
  padding: 62px 36px;
  border: 0;
  border-right: 1px solid #e3e5e7;
  border-bottom: 1px solid #e3e5e7;
  border-radius: 0;
  background: #fff;
}

.summary-item:nth-child(3n) {
  border-right: 0;
}

.summary-item span {
  color: #6f777c;
  font-size: 1rem;
}

.summary-item strong {
  color: #05080c;
  font-size: 1.4rem;
  font-weight: 900;
}

.summary-note {
  padding: 0;
  border: 0;
  background: transparent;
}

.summary-note p {
  color: #6f777c;
  font-size: 1rem;
}

.summary-cta span {
  min-width: 210px;
  min-height: 58px;
  color: #fff;
  background: linear-gradient(135deg, #66b3f3, #0678d8);
  font-size: 1.08rem;
}

.reports-shell {
  padding: 28px 28px 36px;
  border-radius: 12px;
  background: #fff;
}

.reports-shell__header h3 {
  color: #0876d6;
  font-size: 1.18rem;
}

.report-list {
  max-height: calc(100vh - 260px);
  gap: 28px;
}

.report-item {
  padding: 22px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.report-item__meta {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 20px;
}

.report-item__meta strong {
  color: #05080c;
  font-size: 1.42rem;
  font-weight: 900;
}

.report-item__suggestions {
  padding: 22px 0 0;
  border: 0;
  background: transparent;
}

.report-item__suggestions-header h4 {
  font-size: 1.18rem;
  font-weight: 900;
}

.report-item__suggestion {
  position: relative;
  padding: 0 0 0 22px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.report-item__suggestion::before {
  content: '';
  position: absolute;
  top: 10px;
  left: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #48a0a3;
}

.report-item__suggestion-priority,
.report-item__suggestion strong {
  color: #05080c;
  font-weight: 900;
}

.report-item__suggestion-description {
  -webkit-line-clamp: 4;
  color: #30363a;
}

.report-item__actions {
  justify-content: flex-end;
  margin-top: 28px;
}

.report-item__actions .secondary-button,
.report-item__actions .ghost-button {
  min-width: 170px;
  min-height: 54px;
  border-radius: 999px;
  border: 1px solid rgba(8, 118, 214, 0.45);
  background: #fff;
  color: #0876d6;
  font-weight: 900;
}

@media (max-width: 1400px) {
  .family-layout {
    grid-template-columns: 360px minmax(0, 1fr);
  }

  .reports-shell {
    grid-column: 1 / -1;
  }
}
</style>

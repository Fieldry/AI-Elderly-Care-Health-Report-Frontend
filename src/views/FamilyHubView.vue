<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { bindFamilyElderly } from '@/api/auth'
import { getFamilyElderly, listFamilyElderly } from '@/api/family'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import { updateStoredFamilyElderlyIds, useAuthSession } from '@/session'
import type { FamilyElderlyDetail, FamilyElderlySummary } from '@/types'
import { formatProfileValue, getIdentityTitle, getMissingCoreFields } from '@/utils/profile'

const router = useRouter()
const { session } = useAuthSession()

const elderlyList = ref<FamilyElderlySummary[]>([])
const selectedElderlyId = ref('')
const selectedDetail = ref<FamilyElderlyDetail | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const binding = ref(false)
const showBindForm = ref(false)
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
    {
      label: '关系',
      value: selectedSummary.value?.relation || '家庭成员'
    },
    {
      label: '年龄',
      value: formatProfileValue(profile.age)
    },
    {
      label: '性别',
      value: formatProfileValue(profile.sex)
    },
    {
      label: '居住地类型',
      value: formatProfileValue(profile.residence)
    },
    {
      label: '受教育年限',
      value: formatProfileValue(profile.education_years)
    },
    {
      label: '居住安排',
      value: formatProfileValue(profile.living_arrangement)
    },
    {
      label: '主要照护者',
      value: formatProfileValue(profile.caregiver)
    },
    {
      label: '健康限制',
      value: formatProfileValue(profile.health_limitation)
    },
    {
      label: '医保情况',
      value: formatProfileValue(profile.medical_insurance)
    }
  ]
})

function formatDate(value: string) {
  if (!value) {
    return '--'
  }

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
  } catch (error) {
    if (requestId !== detailRequestId) {
      return
    }

    selectedDetail.value = null
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

    if (records.length === 0) {
      selectedElderlyId.value = ''
      selectedDetail.value = null
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
    errorMessage.value = '请输入要绑定的老人 ID。'
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

    const mergedElderlyIds = response.elderly_ids || Array.from(new Set([
      ...session.value.elderlyIds,
      targetElderlyId
    ]))
    updateStoredFamilyElderlyIds(mergedElderlyIds)
    selectedElderlyId.value = targetElderlyId
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

function openElderlyDetail(elderlyId: string) {
  if (!elderlyId) {
    return
  }

  router.push(`/family/elderly/${elderlyId}`)
}

function openSelectedElderlyDetail() {
  openElderlyDetail(selectedElderlyId.value)
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
          <div>
            <p class="eyebrow">家属端</p>
            <h1>关联老人</h1>
          </div>

          <div class="record-list-card__actions">
            <button class="secondary-button" type="button" @click="loadFamilyElderly">刷新列表</button>
            <button class="secondary-button" type="button" @click="showBindForm = !showBindForm">
              {{ showBindForm ? '收起绑定' : '新增绑定' }}
            </button>
          </div>
        </header>

        <div v-if="showBindForm" class="bind-form-shell">
          <div class="bind-form">
            <label class="field">
              <span>老人 ID</span>
              <input v-model="bindForm.elderlyId" type="text" placeholder="请输入老人 ID" />
            </label>
            <label class="field">
              <span>关系</span>
              <input v-model="bindForm.relation" type="text" placeholder="例如 子女 / 配偶" />
            </label>
            <button class="primary-button bind-form__submit" type="button" :disabled="binding" @click="handleBindElderly">
              {{ binding ? '绑定中...' : '确认绑定' }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="loading-card">正在加载关联老人...</div>

        <div v-else-if="elderlyList.length > 0" class="record-list scroll-panel">
          <button
            v-for="elderly in elderlyList"
            :key="elderly.elderly_id"
            class="record-item"
            :class="{ 'is-active': selectedElderlyId === elderly.elderly_id }"
            type="button"
            @click="selectElderly(elderly.elderly_id)"
          >
            <div class="record-item__top">
              <strong>{{ elderly.name || '未命名老人' }}</strong>
              <span class="completion-badge">{{ Math.round(elderly.completion_rate * 100) }}%</span>
            </div>

            <div class="record-item__meta">
              <span>{{ elderly.relation || '家庭成员' }}</span>
              <span>关联于 {{ formatDate(elderly.created_at) }}</span>
            </div>

            <p class="record-item__summary">
              已填写核心字段约 {{ Math.round(elderly.completion_rate * 100) }}%。
            </p>
          </button>
        </div>

        <EmptyStateCard
          v-else
          title="暂无关联老人"
          description="当前账号下没有已绑定老人。可在上方通过老人 ID 追加绑定。"
        />
      </article>

      <aside class="family-summary">
        <div v-if="detailLoading" class="surface-card loading-card">正在加载老人基本信息...</div>

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
      </aside>
    </section>
  </div>
</template>

<style scoped>
.family-page {
  display: grid;
  gap: 18px;
}

.family-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.82fr) minmax(0, 1.18fr);
  gap: 20px;
  align-items: start;
}

.record-list-card,
.elderly-summary-card,
.loading-card,
.empty-side-card {
  padding: 22px;
}

.record-list-card__header,
.elderly-summary-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.record-list-card__header h1,
.elderly-summary-card h2 {
  margin: 10px 0 0;
  color: var(--ink-strong);
}

.record-list-card__header h1 {
  font-size: clamp(1.9rem, 2.8vw, 2.4rem);
}

.record-list-card__header p,
.elderly-summary-card__meta,
.record-item__meta,
.record-item__summary,
.summary-note p,
.summary-item span,
.summary-progress span {
  color: var(--ink-muted);
}

.record-list-card__header p {
  margin: 10px 0 0;
  line-height: 1.7;
}

.record-list-card__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.bind-form-shell {
  margin-top: 18px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.bind-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: end;
}

.bind-form__submit {
  width: 100%;
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
  padding: 16px 18px;
  border-radius: 20px;
  text-align: left;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(120, 164, 199, 0.16);
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

.record-item__top strong,
.summary-item strong,
.summary-note strong,
.summary-progress strong,
.summary-cta span {
  color: var(--ink-strong);
}

.record-item__meta {
  margin-top: 10px;
  font-size: 0.92rem;
}

.record-item__summary {
  margin: 10px 0 0;
  line-height: 1.7;
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

.elderly-summary-card__meta {
  margin: 10px 0 0;
  line-height: 1.7;
}

.summary-progress {
  display: grid;
  gap: 6px;
  text-align: right;
}

.summary-progress strong {
  font-size: 1.8rem;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.summary-item strong {
  line-height: 1.6;
}

.summary-note p {
  margin: 8px 0 0;
  line-height: 1.7;
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

@media (max-width: 1080px) {
  .family-layout,
  .summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 780px) {
  .record-list-card__header,
  .elderly-summary-card__header,
  .record-item__top,
  .record-item__meta {
    flex-direction: column;
    align-items: stretch;
  }

  .record-list-card__actions,
  .bind-form {
    grid-template-columns: 1fr;
  }

  .record-list-card__actions {
    display: grid;
  }
}

@media (max-width: 640px) {
  .record-list-card,
  .elderly-summary-card,
  .loading-card,
  .empty-side-card {
    padding: 20px;
  }
}
</style>

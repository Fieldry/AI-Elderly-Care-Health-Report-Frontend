<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { bindFamilyElderly } from '@/api/auth'
import { listFamilyElderly } from '@/api/family'
import EmptyStateCard from '@/components/EmptyStateCard.vue'
import { updateStoredFamilyElderlyIds, useAuthSession } from '@/session'
import type { FamilyElderlySummary } from '@/types'

const router = useRouter()
const { session } = useAuthSession()

const elderlyList = ref<FamilyElderlySummary[]>([])
const loading = ref(false)
const binding = ref(false)
const showBindForm = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const bindForm = reactive({
  elderlyId: '',
  relation: '子女'
})

const linkedCount = computed(() => elderlyList.value.length)
const reportReadyCount = computed(() =>
  elderlyList.value.filter((item) => item.completion_rate >= 0.7).length
)
const averageCompletion = computed(() => {
  if (elderlyList.value.length === 0) {
    return 0
  }

  const total = elderlyList.value.reduce((sum, item) => sum + item.completion_rate, 0)
  return Math.round((total / elderlyList.value.length) * 100)
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

async function loadFamilyElderly() {
  if (!session.value?.token || session.value.role !== 'family') {
    errorMessage.value = '当前登录已失效，请重新进入家属端。'
    return
  }

  loading.value = true
  resetMessages()

  try {
    elderlyList.value = await listFamilyElderly(session.value.token)
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
    const response = await bindFamilyElderly(session.value.token, {
      elderlyId: bindForm.elderlyId.trim(),
      relation: bindForm.relation.trim()
    })

    const mergedElderlyIds = response.elderly_ids || Array.from(new Set([
      ...session.value.elderlyIds,
      bindForm.elderlyId.trim()
    ]))
    updateStoredFamilyElderlyIds(mergedElderlyIds)
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
  router.push(`/family/elderly/${elderlyId}`)
}

onMounted(async () => {
  await loadFamilyElderly()
})
</script>

<template>
  <div class="page-width role-page family-page">
    <section class="surface-card family-hero">
      <div>
        <p class="eyebrow">家属端</p>
        <h1>关联老人照护中心</h1>
        <p>
          登录后只查看当前账号已绑定的老人，补全画像、发起家属访谈，并同步查看真实报告状态。
        </p>
      </div>

      <div class="family-hero__metrics">
        <article class="metric-card">
          <span>关联老人</span>
          <strong>{{ linkedCount }}</strong>
        </article>
        <article class="metric-card">
          <span>完整度较高</span>
          <strong>{{ reportReadyCount }}</strong>
        </article>
        <article class="metric-card">
          <span>平均完整度</span>
          <strong>{{ averageCompletion }}%</strong>
        </article>
      </div>
    </section>

    <section class="surface-card bind-card">
      <div class="bind-card__header">
        <div>
          <h2>绑定更多老人</h2>
          <p>使用 `/auth/family/bind` 为当前家属账号追加绑定关系。</p>
        </div>
        <button class="secondary-button" type="button" @click="showBindForm = !showBindForm">
          {{ showBindForm ? '收起' : '新增绑定' }}
        </button>
      </div>

      <div v-if="showBindForm" class="bind-form">
        <label class="field">
          <span>老人 ID</span>
          <input v-model="bindForm.elderlyId" type="text" placeholder="请输入老人 ID" />
        </label>
        <label class="field">
          <span>关系</span>
          <input v-model="bindForm.relation" type="text" placeholder="例如 子女 / 配偶" />
        </label>
        <button class="primary-button" type="button" :disabled="binding" @click="handleBindElderly">
          {{ binding ? '绑定中...' : '确认绑定' }}
        </button>
      </div>
    </section>

    <section class="family-list-section">
      <header class="section-header">
        <div>
          <h2>已绑定老人</h2>
          <p>列表仅显示当前家属账号可访问的老人数据。</p>
        </div>
        <button class="secondary-button" type="button" @click="loadFamilyElderly">刷新列表</button>
      </header>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
      <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>

      <div v-if="loading" class="surface-card loading-card">正在加载关联老人...</div>

      <div v-else-if="elderlyList.length > 0" class="elderly-grid">
        <article v-for="elderly in elderlyList" :key="elderly.elderly_id" class="surface-card elderly-card">
          <div class="elderly-card__header">
            <div>
              <h3>{{ elderly.name || '未命名老人' }}</h3>
              <p>{{ elderly.relation || '家庭成员' }}</p>
            </div>
            <span class="completion-badge">{{ Math.round(elderly.completion_rate * 100) }}%</span>
          </div>

          <div class="elderly-card__body">
            <div class="progress-track">
              <div class="progress-track__fill" :style="{ width: `${Math.round(elderly.completion_rate * 100)}%` }" />
            </div>
            <p>关联时间：{{ formatDate(elderly.created_at) }}</p>
          </div>

          <button class="primary-button elderly-card__action" type="button" @click="openElderlyDetail(elderly.elderly_id)">
            查看并补全信息
          </button>
        </article>
      </div>

      <EmptyStateCard
        v-else
        title="暂无关联老人"
        description="当前账号下没有已绑定老人。可先注册时绑定，或在上方使用老人 ID 追加绑定。"
      />
    </section>
  </div>
</template>

<style scoped>
.family-page {
  display: grid;
  gap: 22px;
}

.family-hero,
.bind-card {
  padding: 30px 32px;
}

.family-hero {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 22px;
}

.family-hero h1,
.bind-card h2 {
  margin: 12px 0;
  color: var(--ink-strong);
  font-size: clamp(2.4rem, 4vw, 3.5rem);
}

.bind-card h2 {
  font-size: 1.6rem;
}

.family-hero p,
.bind-card p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.8;
  font-size: 1.08rem;
}

.family-hero__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  padding: 18px 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(120, 164, 199, 0.16);
}

.metric-card span {
  display: block;
  color: var(--ink-muted);
  margin-bottom: 10px;
}

.metric-card strong {
  color: var(--ink-strong);
  font-size: 1.75rem;
}

.bind-card {
  display: grid;
  gap: 18px;
}

.bind-card__header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.bind-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: end;
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
  min-height: 48px;
  border-radius: 16px;
  padding: 0 14px;
}

.family-list-section {
  display: grid;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.section-header h2 {
  margin: 0;
  color: var(--ink-strong);
}

.section-header p {
  margin: 8px 0 0;
  color: var(--ink-muted);
}

.loading-card {
  padding: 24px;
}

.elderly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 18px;
}

.elderly-card {
  padding: 22px;
  display: grid;
  gap: 16px;
}

.elderly-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.elderly-card__header h3 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 1.35rem;
}

.elderly-card__header p,
.elderly-card__body p {
  margin: 6px 0 0;
  color: var(--ink-muted);
}

.completion-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.14);
  color: var(--brand-strong);
  font-weight: 700;
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

.elderly-card__action {
  width: 100%;
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

@media (max-width: 960px) {
  .family-hero,
  .family-hero__metrics,
  .bind-form {
    grid-template-columns: 1fr;
  }

  .section-header,
  .bind-card__header {
    flex-direction: column;
  }
}

@media (max-width: 720px) {
  .family-hero,
  .bind-card {
    padding: 22px;
  }
}
</style>

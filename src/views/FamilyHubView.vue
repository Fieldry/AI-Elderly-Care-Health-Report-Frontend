<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

interface ElderlyInfo {
  elderly_id: string
  name: string
  relation: string
  completion_rate: number
  created_at: string
}

const elderlyList = ref<ElderlyInfo[]>([])
const isLoading = ref(false)
const userName = ref('')
const apiOrigin = import.meta.env.VITE_BACKEND_ORIGIN || ''
const token = computed(() => localStorage.getItem('token') || '')

async function fetchElderlyList() {
  if (!token.value) {
    ElMessage.error('请先登录')
    router.push('/login')
    return
  }

  isLoading.value = true
  try {
    const response = await fetch(`${apiOrigin}/family/elderly-list`, {
      headers: { 'Authorization': `Bearer ${token.value}` }
    })

    if (!response.ok) throw new Error('获取列表失败')

    const data = await response.json()
    elderlyList.value = data.data || []
  } catch (error) {
    ElMessage.error('获取老年人列表失败')
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN')
}

function goToSupplementInfo(elderlyId: string) {
  router.push(`/family/supplement/${elderlyId}`)
}

function goToReports(elderlyId: string) {
  router.push(`/family/reports/${elderlyId}`)
}

function handleLogout() {
  localStorage.clear()
  router.push('/login')
}

onMounted(() => {
  userName.value = localStorage.getItem('user_name') || '家属'
  fetchElderlyList()
})
</script>

<template>
  <main class="family-hub">
    <header class="hub-header">
      <div class="header-content">
        <h1>👨‍👩‍👧 家属照护中心</h1>
        <p>帮助老年人补全健康信息，生成更完整的评估报告</p>
      </div>
      <div class="header-actions">
        <span class="user-name">{{ userName }}</span>
        <button class="logout-btn" @click="handleLogout">退出登录</button>
      </div>
    </header>

    <section class="hub-content">
      <div class="section-header">
        <h2>关联的老年人</h2>
      </div>

      <div v-if="isLoading" class="loading-state">
        <p>加载中...</p>
      </div>

      <div v-else-if="elderlyList.length === 0" class="empty-state">
        <p>暂无关联的老年人</p>
        <p class="hint">请联系管理员添加老年人</p>
      </div>

      <div v-else class="elderly-grid">
        <article
          v-for="elderly in elderlyList"
          :key="elderly.elderly_id"
          class="elderly-card"
        >
          <div class="card-header">
            <h3>{{ elderly.name }}</h3>
            <span class="relation-badge">{{ elderly.relation }}</span>
          </div>

          <div class="card-body">
            <div class="completion-info">
              <p class="label">信息完整度</p>
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :style="{ width: `${elderly.completion_rate * 100}%` }"
                ></div>
              </div>
              <p class="percentage">{{ Math.round(elderly.completion_rate * 100) }}%</p>
            </div>

            <div class="info-row">
              <span class="label">关联时间</span>
              <span class="value">{{ formatDate(elderly.created_at) }}</span>
            </div>
          </div>

          <div class="card-actions">
            <button class="action-btn primary" @click="goToSupplementInfo(elderly.elderly_id)">
              ✏️ 补全信息
            </button>
            <button class="action-btn secondary" @click="goToReports(elderly.elderly_id)">
              📊 查看报告
            </button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.family-hub {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.hub-header {
  background: white;
  padding: 30px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.header-content h1 {
  margin: 0;
  font-size: 32px;
  color: #333;
}

.header-content p {
  margin: 8px 0 0;
  color: #999;
  font-size: 14px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-name {
  color: #666;
  font-size: 14px;
}

.logout-btn {
  padding: 8px 16px;
  background: #f56c6c;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.logout-btn:hover {
  background: #dd001b;
}

.hub-content {
  padding: 40px;
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  margin-bottom: 30px;
}

.section-header h2 {
  margin: 0;
  font-size: 24px;
  color: #333;
}

.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state .hint {
  margin-top: 10px;
  font-size: 14px;
  color: #bbb;
}

.elderly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.elderly-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: transform 0.3s, box-shadow 0.3s;
}

.elderly-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.card-header h3 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.relation-badge {
  background: #e6f7ff;
  color: #1890ff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.card-body {
  margin-bottom: 20px;
}

.completion-info {
  margin-bottom: 16px;
}

.completion-info .label {
  margin: 0;
  font-size: 12px;
  color: #999;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.progress-bar {
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  margin: 8px 0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #67c23a, #85ce61);
  transition: width 0.3s;
}

.percentage {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
}

.info-row .label {
  color: #999;
}

.info-row .value {
  color: #333;
  font-weight: 500;
}

.card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.action-btn.primary {
  background: #409eff;
  color: white;
}

.action-btn.primary:hover {
  background: #66b1ff;
  transform: translateY(-2px);
}

.action-btn.secondary {
  background: #f0f9ff;
  color: #409eff;
  border: 1px solid #b3d8ff;
}

.action-btn.secondary:hover {
  background: #e6f7ff;
}

@media (max-width: 768px) {
  .hub-header {
    flex-direction: column;
    gap: 20px;
    text-align: center;
  }

  .header-actions {
    width: 100%;
    justify-content: center;
  }

  .elderly-grid {
    grid-template-columns: 1fr;
  }

  .card-actions {
    grid-template-columns: 1fr;
  }
}
</style>

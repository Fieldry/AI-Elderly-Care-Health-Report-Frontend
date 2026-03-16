<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()

interface ReportVersion {
  version_id: string
  version_number: string
  completion_rate: number
  generated_by_type: string
  generated_at: string
  is_latest: boolean
}

const elderlyId = computed(() => route.params.elderly_id as string)
const versions = ref<ReportVersion[]>([])
const isLoading = ref(false)
const token = computed(() => localStorage.getItem('token') || '')
const apiOrigin = import.meta.env.VITE_BACKEND_ORIGIN || ''

async function loadVersions() {
  if (!token.value) {
    ElMessage.error('请先登录')
    router.push('/login')
    return
  }

  isLoading.value = true
  try {
    const response = await fetch(
      `${apiOrigin}/family/elderly/${elderlyId.value}/reports`,
      { headers: { 'Authorization': `Bearer ${token.value}` } }
    )

    if (!response.ok) throw new Error('加载失败')

    const data = await response.json()
    versions.value = data.data || []
  } catch (error) {
    ElMessage.error('加载报告版本失败')
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

function viewReport(versionId: string) {
  router.push(`/family/report/${elderlyId.value}/${versionId}`)
}

async function deleteVersion(versionId: string) {
  if (!confirm('确定要删除这个版本吗？')) return

  try {
    const response = await fetch(
      `${apiOrigin}/family/elderly/${elderlyId.value}/reports/${versionId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token.value}` }
      }
    )

    if (!response.ok) throw new Error('删除失败')

    ElMessage.success('删除成功')
    await loadVersions()
  } catch (error) {
    ElMessage.error('删除失败')
    console.error(error)
  }
}

function goBack() {
  router.push(`/family/edit/${elderlyId.value}`)
}

onMounted(() => {
  loadVersions()
})
</script>

<template>
  <div class="reports-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">← 返回编辑</button>
      <h1>📊 报告版本管理</h1>
    </header>

    <div class="page-container">
      <div v-if="isLoading" class="loading-state">
        <p>加载中...</p>
      </div>

      <div v-else-if="versions.length === 0" class="empty-state">
        <p>暂无报告版本</p>
        <p class="hint">完成信息编辑后，点击"生成新报告"创建报告</p>
      </div>

      <div v-else class="versions-list">
        <article
          v-for="version in versions"
          :key="version.version_id"
          class="version-card"
          :class="{ latest: version.is_latest }"
        >
          <div class="card-header">
            <div class="version-info">
              <h3>{{ version.version_number }}</h3>
              <span v-if="version.is_latest" class="latest-badge">最新版本</span>
            </div>
            <span class="generated-by">
              由{{ version.generated_by_type === 'family' ? '家属' : '老年人' }}生成
            </span>
          </div>

          <div class="card-body">
            <div class="info-row">
              <span class="label">生成时间</span>
              <span class="value">{{ formatDate(version.generated_at) }}</span>
            </div>
            <div class="info-row">
              <span class="label">完整度</span>
              <span class="value">{{ Math.round(version.completion_rate * 100) }}%</span>
            </div>
          </div>

          <div class="card-actions">
            <button class="action-btn view" @click="viewReport(version.version_id)">
              👁️ 查看
            </button>
            <button
              v-if="!version.is_latest"
              class="action-btn delete"
              @click="deleteVersion(version.version_id)"
            >
              🗑️ 删除
            </button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.page-header {
  background: white;
  padding: 24px 40px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.back-btn {
  padding: 8px 16px;
  background: #f0f9ff;
  color: #409eff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.back-btn:hover {
  background: #e6f7ff;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  color: #333;
}

.page-container {
  padding: 40px;
  max-width: 1000px;
  margin: 0 auto;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: white;
  border-radius: 8px;
  color: #999;
}

.empty-state .hint {
  margin-top: 12px;
  font-size: 13px;
  color: #bbb;
}

.versions-list {
  display: grid;
  gap: 16px;
}

.version-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  border-left: 4px solid #ddd;
  transition: all 0.3s;
}

.version-card.latest {
  border-left-color: #67c23a;
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.05), rgba(255, 255, 255, 0.95));
}

.version-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-info h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.latest-badge {
  background: #67c23a;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.generated-by {
  font-size: 13px;
  color: #999;
}

.card-body {
  margin-bottom: 16px;
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
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s;
}

.action-btn.view {
  background: #409eff;
  color: white;
}

.action-btn.view:hover {
  background: #66b1ff;
}

.action-btn.delete {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
}

.action-btn.delete:hover {
  background: #fde2e2;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    text-align: center;
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .card-actions {
    flex-direction: column;
  }
}
</style>

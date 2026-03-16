<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const elderlyId = computed(() => route.params.elderly_id as string)
const token = computed(() => localStorage.getItem('token') || '')
const apiOrigin = import.meta.env.VITE_BACKEND_ORIGIN || ''

const isLoading = ref(false)
const profile = ref<any>({})

async function loadProfile() {
  isLoading.value = true
  try {
    const response = await fetch(`${apiOrigin}/family/elderly/${elderlyId.value}`, {
      headers: { 'Authorization': `Bearer ${token.value}` }
    })
    if (!response.ok) throw new Error('加载失败')
    const data = await response.json()
    profile.value = data.profile || {}
  } catch (error) {
    ElMessage.error('加载信息失败')
  } finally {
    isLoading.value = false
  }
}

async function saveProfile() {
  try {
    const response = await fetch(`${apiOrigin}/family/elderly/${elderlyId.value}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`
      },
      body: JSON.stringify(profile.value)
    })
    if (!response.ok) throw new Error('保存失败')
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

onMounted(() => loadProfile())
</script>

<template>
  <div class="edit-page">
    <header class="page-header">
      <button class="back-btn" @click="$router.push('/family/hub')">← 返回</button>
      <h1>📝 编辑信息</h1>
      <button class="reports-btn" @click="$router.push(`/family/reports/${elderlyId}`)">📊 报告</button>
    </header>

    <div class="page-container">
      <div v-if="isLoading" class="loading">加载中...</div>
      <form v-else class="edit-form" @submit.prevent="saveProfile">
        <div class="form-group">
          <label>姓名</label>
          <input v-model="profile.name" type="text" />
        </div>
        <div class="form-group">
          <label>年龄</label>
          <input v-model.number="profile.age" type="number" />
        </div>
        <div class="form-group">
          <label>性别</label>
          <select v-model="profile.sex">
            <option value="">请选择</option>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" @click="$router.push('/family/hub')">取消</button>
          <button type="submit">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.edit-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.page-header {
  background: white;
  padding: 24px 40px;
  display: flex;
  gap: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.page-header h1 {
  margin: 0;
  flex: 1;
  font-size: 24px;
}

.back-btn,
.reports-btn {
  padding: 8px 16px;
  background: #f0f9ff;
  color: #409eff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  cursor: pointer;
}

.page-container {
  padding: 40px;
  max-width: 1000px;
  margin: 0 auto;
}

.loading {
  text-align: center;
  padding: 60px;
  color: #999;
}

.edit-form {
  background: white;
  border-radius: 8px;
  padding: 30px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 30px;
}

.form-actions button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.form-actions button[type="submit"] {
  background: #409eff;
  color: white;
}
</style>

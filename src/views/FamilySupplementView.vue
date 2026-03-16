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
const isGenerating = ref(false)
const profile = ref<any>({})
const missingFields = ref<string[]>([])

const fieldLabels: Record<string, string> = {
  age: '年龄',
  sex: '性别',
  province: '省份',
  residence: '居住地',
  education_years: '教育年限',
  marital_status: '婚姻状况',
  health_limitation: '健康限制',
  hypertension: '高血压',
  diabetes: '糖尿病',
  heart_disease: '心脏病',
  stroke: '中风',
  cataract: '白内障',
  cancer: '癌症',
  arthritis: '关节炎',
  smoking: '吸烟',
  drinking: '饮酒',
  exercise: '锻炼',
  sleep_quality: '睡眠质量',
  weight: '体重',
  height: '身高',
  vision: '视力',
  hearing: '听力',
  living_arrangement: '居住安排',
  cohabitants: '同住人数',
  financial_status: '经济状况',
  income: '月收入',
  medical_insurance: '医保',
  caregiver: '照顾者'
}

async function loadProfile() {
  isLoading.value = true
  try {
    const response = await fetch(`${apiOrigin}/family/elderly/${elderlyId.value}`, {
      headers: { 'Authorization': `Bearer ${token.value}` }
    })
    if (!response.ok) throw new Error('加载失败')
    const data = await response.json()
    profile.value = data.profile || {}
    
    // 计算缺失字段
    missingFields.value = Object.keys(fieldLabels).filter(
      key => !profile.value[key] || profile.value[key] === ''
    )
  } catch (error) {
    ElMessage.error('加载信息失败')
  } finally {
    isLoading.value = false
  }
}

async function saveAndGenerateReport() {
  try {
    // 1. 保存更新的信息
    const response = await fetch(`${apiOrigin}/family/elderly/${elderlyId.value}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`
      },
      body: JSON.stringify(profile.value)
    })
    if (!response.ok) throw new Error('保存失败')

    ElMessage.success('信息已保存，正在生成报告...')

    // 2. 生成报告（调用后端的报告生成接口）
    isGenerating.value = true
    const reportResponse = await fetch(`${apiOrigin}/report/generate/${elderlyId.value}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`
      },
      body: JSON.stringify(profile.value)
    })

    if (reportResponse.ok) {
      ElMessage.success('报告生成成功！')
      setTimeout(() => {
        router.push(`/family/reports/${elderlyId.value}`)
      }, 1000)
    } else {
      ElMessage.warning('信息已保存，报告生成中...')
      router.push(`/family/reports/${elderlyId.value}`)
    }
  } catch (error) {
    ElMessage.error('操作失败')
    console.error(error)
  } finally {
    isGenerating.value = false
  }
}

function goBack() {
  router.push('/family/hub')
}

onMounted(() => {
  loadProfile()
})
</script>

<template>
  <div class="supplement-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h1>📝 补全老人信息</h1>
    </header>

    <div class="page-container">
      <div v-if="isLoading" class="loading-state">
        <p>加载中...</p>
      </div>

      <div v-else class="supplement-content">
        <div class="info-section">
          <h2>缺失的信息字段</h2>
          <p class="section-desc">以下字段需要补全以生成更完整的报告</p>

          <div class="missing-fields">
            <div v-if="missingFields.length === 0" class="all-complete">
              <p>✓ 所有信息已完整！</p>
            </div>

            <div v-else class="fields-grid">
              <div v-for="field in missingFields" :key="field" class="field-item">
                <label>{{ fieldLabels[field] || field }}</label>
                <input
                  v-model="profile[field]"
                  type="text"
                  :placeholder="`请输入${fieldLabels[field] || field}`"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="action-section">
          <button class="btn-cancel" @click="goBack">取消</button>
          <button class="btn-generate" @click="saveAndGenerateReport" :disabled="isGenerating">
            {{ isGenerating ? '生成中...' : '保存并生成报告' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.supplement-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
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
}

.page-header h1 {
  margin: 0;
  flex: 1;
  font-size: 24px;
  color: #333;
}

.page-container {
  padding: 40px;
  max-width: 1000px;
  margin: 0 auto;
}

.loading-state {
  text-align: center;
  padding: 60px 20px;
  background: white;
  border-radius: 8px;
  color: #999;
}

.supplement-content {
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.info-section {
  margin-bottom: 30px;
}

.info-section h2 {
  margin: 0 0 10px;
  font-size: 20px;
  color: #333;
}

.section-desc {
  margin: 0 0 20px;
  color: #999;
  font-size: 14px;
}

.missing-fields {
  margin-bottom: 20px;
}

.all-complete {
  text-align: center;
  padding: 40px 20px;
  background: #f0f9ff;
  border-radius: 8px;
  color: #409eff;
  font-weight: 600;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-item label {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.field-item input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.field-item input:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.action-section {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
}

.btn-cancel,
.btn-generate {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-cancel {
  background: #f0f0f0;
  color: #333;
}

.btn-cancel:hover {
  background: #e0e0e0;
}

.btn-generate {
  background: #409eff;
  color: white;
}

.btn-generate:hover:not(:disabled) {
  background: #66b1ff;
}

.btn-generate:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    text-align: center;
  }

  .page-header h1 {
    flex: none;
  }

  .fields-grid {
    grid-template-columns: 1fr;
  }

  .action-section {
    flex-direction: column;
  }

  .btn-cancel,
  .btn-generate {
    width: 100%;
  }
}
</style>

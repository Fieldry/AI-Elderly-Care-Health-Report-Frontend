<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useReportResultStore } from '@/stores/reportResult'
import { useUserProfileStore } from '@/stores/userProfile'
import { PageHeader } from '@/components/Common'
import { HealthPortrait, RiskCard, ActionPlan } from '@/components/Report'
import MarkdownIt from 'markdown-it'

const router = useRouter()
const reportStore = useReportResultStore()
const userStore = useUserProfileStore()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
})

// 检查是否有报告数据
onMounted(() => {
  if (!reportStore.hasReport) {
    // 如果没有报告数据，重定向到评估页面
    // router.push('/assessment')
  }
})

// 格式化生成时间
const formattedDate = computed(() => {
  if (!reportStore.generatedAt) return ''
  const date = new Date(reportStore.generatedAt)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})

// 渲染 Markdown 内容
const renderedMarkdown = computed(() => {
  if (!reportStore.markdownContent) return ''
  return md.render(reportStore.markdownContent)
})

// 处理建议确认
function handleConfirm(id: string) {
  reportStore.confirmRecommendation(id)
}

function handleUnconfirm(id: string) {
  reportStore.unconfirmRecommendation(id)
}

// 返回评估页面
function goToAssessment() {
  router.push('/assessment')
}

// 导出报告
async function exportReport() {
  ElMessage.info('导出功能开发中...')
}

// 打印报告
function printReport() {
  window.print()
}

// 新建评估
function startNewAssessment() {
  userStore.resetProfile()
  reportStore.resetReport()
  router.push('/assessment')
}
</script>

<template>
  <div class="report-page">
    <PageHeader
      title="健康评估报告"
      :subtitle="formattedDate ? `生成于 ${formattedDate}` : ''"
      show-back
    >
      <template #actions>
        <el-button @click="printReport">
          <el-icon><Printer /></el-icon>
          打印
        </el-button>
        <el-button @click="exportReport">
          <el-icon><Download /></el-icon>
          导出 PDF
        </el-button>
        <el-button type="primary" @click="startNewAssessment">
          新建评估
        </el-button>
      </template>
    </PageHeader>

    <div class="report-container">
      <!-- 无报告数据时的提示 -->
      <div v-if="!reportStore.hasReport" class="empty-state">
        <el-empty description="暂无报告数据">
          <el-button type="primary" @click="goToAssessment">
            开始健康评估
          </el-button>
        </el-empty>
      </div>

      <!-- 报告内容 -->
      <template v-else>
        <!-- 报告说明 -->
        <section class="report-section report-notice">
          <el-alert
            title="报告说明"
            type="info"
            :closable="false"
            show-icon
          >
            <p>本报告基于您提供的健康信息，采用 CLHLS（中国老年健康影响因素跟踪调查）标准进行评估分析。报告结果仅供参考，具体健康问题请咨询专业医护人员。</p>
          </el-alert>
        </section>

        <!-- 报告总结 -->
        <section class="report-section">
          <div class="section-header">
            <div class="section-icon">
              <el-icon :size="24"><Document /></el-icon>
            </div>
            <div>
              <h2>健康报告总结</h2>
              <p>整体健康状况概览</p>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-content">
              {{ reportStore.reportData?.summary }}
            </div>
            <div class="summary-meta">
              <div class="meta-item">
                <span class="meta-label">评估完成度</span>
                <span class="meta-value">{{ userStore.completionPercentage }}%</span>
              </div>
              <div class="meta-item" v-if="reportStore.highRiskCount > 0">
                <span class="meta-label">高风险项</span>
                <span class="meta-value meta-value--danger">{{ reportStore.highRiskCount }} 项</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">建议完成</span>
                <span class="meta-value">{{ reportStore.recommendationProgress.completed }}/{{ reportStore.recommendationProgress.total }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 健康画像 -->
        <section class="report-section">
          <div class="section-header">
            <div class="section-icon section-icon--portrait">
              <el-icon :size="24"><User /></el-icon>
            </div>
            <div>
              <h2>您的健康画像</h2>
              <p>功能状态与优劣势分析</p>
            </div>
          </div>

          <HealthPortrait
            :functional-status="reportStore.reportData?.healthPortrait.functionalStatus || ''"
            :strengths="reportStore.reportData?.healthPortrait.strengths || []"
            :problems="reportStore.reportData?.healthPortrait.problems || []"
            :badl-score="userStore.badlScore"
            :iadl-score="userStore.iadlScore"
          />
        </section>

        <!-- 风险因素 -->
        <section class="report-section">
          <div class="section-header">
            <div class="section-icon section-icon--risk">
              <el-icon :size="24"><Warning /></el-icon>
            </div>
            <div>
              <h2>风险因素</h2>
              <p>基于数据的风险预测分析</p>
            </div>
          </div>

          <RiskCard
            :short-term-risks="reportStore.reportData?.riskFactors.shortTerm || []"
            :mid-term-risks="reportStore.reportData?.riskFactors.midTerm || []"
          />
        </section>

        <!-- 健康建议 -->
        <section class="report-section">
          <div class="section-header">
            <div class="section-icon section-icon--action">
              <el-icon :size="24"><List /></el-icon>
            </div>
            <div>
              <h2>健康建议与行动计划</h2>
              <p>个性化照护建议，请逐项确认</p>
            </div>
          </div>

          <ActionPlan
            :priority1="reportStore.reportData?.recommendations.priority1 || []"
            :priority2="reportStore.reportData?.recommendations.priority2 || []"
            :priority3="reportStore.reportData?.recommendations.priority3 || []"
            :confirmed-ids="reportStore.confirmedRecommendations"
            @confirm="handleConfirm"
            @unconfirm="handleUnconfirm"
          />
        </section>

        <!-- Markdown 原始内容（如果有） -->
        <section v-if="reportStore.markdownContent" class="report-section">
          <div class="section-header">
            <div class="section-icon">
              <el-icon :size="24"><Notebook /></el-icon>
            </div>
            <div>
              <h2>详细报告</h2>
              <p>完整的 AI 生成内容</p>
            </div>
          </div>

          <div class="markdown-content" v-html="renderedMarkdown" />
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.report-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.report-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.empty-state {
  padding: 100px 24px;
  text-align: center;
}

.report-section {
  margin-bottom: 32px;
}

.report-notice {
  :deep(.el-alert) {
    border-radius: 12px;

    p {
      margin: 8px 0 0;
      line-height: 1.7;
      color: #606266;
    }
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #1a1a2e;
  }

  p {
    margin: 4px 0 0;
    font-size: 14px;
    color: #909399;
  }
}

.section-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;

  &--portrait {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  &--risk {
    background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
  }

  &--action {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  }
}

.summary-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.summary-content {
  font-size: 16px;
  line-height: 1.8;
  color: #2c3e50;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #f0f0f0;
}

.summary-meta {
  display: flex;
  gap: 40px;
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .meta-label {
    font-size: 13px;
    color: #909399;
  }

  .meta-value {
    font-size: 20px;
    font-weight: 600;
    color: #2c3e50;

    &--danger {
      color: #F56C6C;
    }
  }
}

.markdown-content {
  background: #fff;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);

  :deep(h1), :deep(h2), :deep(h3) {
    margin: 24px 0 12px;
    font-weight: 600;
    color: #1a1a2e;
  }

  :deep(h1) { font-size: 1.6em; }
  :deep(h2) { font-size: 1.4em; }
  :deep(h3) { font-size: 1.2em; }

  :deep(p) {
    margin: 12px 0;
    line-height: 1.8;
    color: #4a4a4a;
  }

  :deep(ul), :deep(ol) {
    padding-left: 24px;
    margin: 12px 0;
  }

  :deep(li) {
    margin: 8px 0;
    line-height: 1.7;
    color: #4a4a4a;
  }

  :deep(blockquote) {
    border-left: 4px solid #667eea;
    padding-left: 16px;
    margin: 16px 0;
    color: #666;
    font-style: italic;
    background: #f8f9ff;
    padding: 16px 16px 16px 20px;
    border-radius: 0 8px 8px 0;
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid #e0e0e0;
    margin: 24px 0;
  }
}

// 打印样式
@media print {
  .report-page {
    background: #fff;
  }

  :deep(.page-header) {
    display: none;
  }

  .report-container {
    max-width: none;
    padding: 0;
  }

  .report-section {
    break-inside: avoid;
  }
}
</style>

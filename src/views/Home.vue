<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function startAssessment() {
  router.push('/assessment')
}

// 功能特点
const features = [
  {
    icon: 'ChatDotRound',
    title: '智能对话',
    description: '通过自然对话方式收集健康信息，体验友好便捷'
  },
  {
    icon: 'DataAnalysis',
    title: '专业评估',
    description: '基于 CLHLS 标准的 BADL/IADL 功能状态评估'
  },
  {
    icon: 'TrendCharts',
    title: '风险预测',
    description: '多 Agent 协作分析，预测未来健康风险'
  },
  {
    icon: 'Document',
    title: '个性报告',
    description: '生成详细的健康评估与照护行动计划'
  }
]

// 使用流程
const steps = [
  { number: 1, title: '开始对话', desc: '点击开始按钮，进入智能问诊' },
  { number: 2, title: '回答问题', desc: '根据提示回答健康相关问题' },
  { number: 3, title: '生成报告', desc: 'AI 分析数据并生成评估报告' },
  { number: 4, title: '查看建议', desc: '获取个性化健康建议和行动计划' }
]
</script>

<template>
  <div class="home-page">
    <!-- Hero 区域 -->
    <section class="hero-section">
      <div class="hero-bg">
        <div class="bg-gradient"></div>
        <div class="bg-pattern"></div>
      </div>

      <div class="hero-content">
        <div class="hero-badge">
          <el-icon><Promotion /></el-icon>
          <span>AI 智能健康评估</span>
        </div>

        <h1 class="hero-title">
          养老健康<br />
          <span class="gradient-text">智能评估助手</span>
        </h1>

        <p class="hero-description">
          基于多 Agent 协作的健康评估系统，通过智能对话收集健康数据，
          生成专业的健康评估报告与个性化照护建议
        </p>

        <div class="hero-actions">
          <el-button
            type="primary"
            size="large"
            @click="startAssessment"
            class="start-btn"
          >
            <el-icon><ChatDotRound /></el-icon>
            开始健康评估
          </el-button>

          <el-button
            size="large"
            class="learn-btn"
          >
            <el-icon><InfoFilled /></el-icon>
            了解更多
          </el-button>
        </div>

        <div class="hero-stats">
          <div class="stat-item">
            <span class="stat-value">CLHLS</span>
            <span class="stat-label">评估标准</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">4+</span>
            <span class="stat-label">Agent 协作</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">AI</span>
            <span class="stat-label">智能分析</span>
          </div>
        </div>
      </div>

      <div class="hero-illustration">
        <div class="illustration-card">
          <div class="card-header">
            <div class="card-dots">
              <span></span><span></span><span></span>
            </div>
            <span class="card-title">健康评估报告</span>
          </div>
          <div class="card-content">
            <div class="mock-line mock-line--title"></div>
            <div class="mock-line mock-line--subtitle"></div>
            <div class="mock-section">
              <div class="mock-line mock-line--short"></div>
              <div class="mock-line mock-line--medium"></div>
              <div class="mock-line mock-line--long"></div>
            </div>
            <div class="mock-chart">
              <div class="chart-bar" style="height: 60%"></div>
              <div class="chart-bar" style="height: 80%"></div>
              <div class="chart-bar" style="height: 45%"></div>
              <div class="chart-bar" style="height: 90%"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 功能特点 -->
    <section class="features-section">
      <div class="section-header">
        <h2>核心功能</h2>
        <p>智能化健康评估，全方位守护老年健康</p>
      </div>

      <div class="features-grid">
        <div
          v-for="(feature, index) in features"
          :key="index"
          class="feature-card"
          :style="{ '--delay': `${index * 0.1}s` }"
        >
          <div class="feature-icon">
            <el-icon :size="28">
              <component :is="feature.icon" />
            </el-icon>
          </div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </div>
      </div>
    </section>

    <!-- 使用流程 -->
    <section class="steps-section">
      <div class="section-header">
        <h2>使用流程</h2>
        <p>简单四步，获取专业健康评估</p>
      </div>

      <div class="steps-container">
        <div
          v-for="(step, index) in steps"
          :key="index"
          class="step-item"
        >
          <div class="step-number">{{ step.number }}</div>
          <div class="step-content">
            <h4>{{ step.title }}</h4>
            <p>{{ step.desc }}</p>
          </div>
          <div v-if="index < steps.length - 1" class="step-connector">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA 区域 -->
    <section class="cta-section">
      <div class="cta-content">
        <h2>开始您的健康评估之旅</h2>
        <p>专业的 AI 健康评估助手，为您和家人的健康保驾护航</p>
        <el-button
          type="primary"
          size="large"
          @click="startAssessment"
          class="cta-btn"
        >
          立即开始
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.home-page {
  min-height: 100vh;
  background: #fafbfc;
}

// Hero Section
.hero-section {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 80px 60px;
  gap: 60px;
  overflow: hidden;

  @media (max-width: 1024px) {
    flex-direction: column;
    padding: 60px 24px;
    text-align: center;
  }
}

.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;

  .bg-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 50%, #faf5ff 100%);
  }

  .bg-pattern {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 20% 30%, rgba(102, 126, 234, 0.08) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(118, 75, 162, 0.06) 0%, transparent 50%);
  }
}

.hero-content {
  flex: 1;
  z-index: 1;
  max-width: 600px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 20px;
  color: #667eea;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 24px;
}

.hero-title {
  font-size: 56px;
  font-weight: 800;
  line-height: 1.2;
  color: #1a1a2e;
  margin: 0 0 24px;

  @media (max-width: 768px) {
    font-size: 36px;
  }
}

.gradient-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-description {
  font-size: 18px;
  color: #606266;
  line-height: 1.8;
  margin: 0 0 32px;
}

.hero-actions {
  display: flex;
  gap: 16px;
  margin-bottom: 48px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: center;
  }
}

.start-btn {
  height: 52px;
  padding: 0 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 26px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;

  &:hover {
    background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
  }
}

.learn-btn {
  height: 52px;
  padding: 0 32px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 26px;
  background: #fff;
  border: 2px solid #e0e0e0;
  color: #606266;

  &:hover {
    border-color: #667eea;
    color: #667eea;
  }
}

.hero-stats {
  display: flex;
  align-items: center;
  gap: 32px;

  @media (max-width: 768px) {
    justify-content: center;
  }
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 13px;
  color: #909399;
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: #e0e0e0;
}

.hero-illustration {
  flex: 1;
  z-index: 1;
  display: flex;
  justify-content: center;

  @media (max-width: 1024px) {
    width: 100%;
    max-width: 400px;
  }
}

.illustration-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 20px;
  box-shadow:
    0 20px 60px rgba(102, 126, 234, 0.15),
    0 8px 24px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  transform: perspective(1000px) rotateY(-5deg) rotateX(5deg);
  transition: transform 0.3s ease;

  &:hover {
    transform: perspective(1000px) rotateY(0deg) rotateX(0deg);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.card-dots {
  display: flex;
  gap: 6px;

  span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);

    &:first-child { background: #ff6b6b; }
    &:nth-child(2) { background: #ffd93d; }
    &:last-child { background: #6bcb77; }
  }
}

.card-title {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.card-content {
  padding: 24px;
}

.mock-line {
  height: 12px;
  border-radius: 6px;
  background: #f0f0f0;
  margin-bottom: 12px;

  &--title {
    width: 60%;
    height: 20px;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    opacity: 0.2;
  }

  &--subtitle {
    width: 80%;
    height: 14px;
  }

  &--short { width: 30%; }
  &--medium { width: 50%; }
  &--long { width: 90%; }
}

.mock-section {
  margin: 24px 0;
}

.mock-chart {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  height: 80px;
  margin-top: 24px;
}

.chart-bar {
  flex: 1;
  background: linear-gradient(to top, #667eea, #764ba2);
  border-radius: 6px 6px 0 0;
  opacity: 0.3;
}

// Features Section
.features-section {
  padding: 100px 60px;

  @media (max-width: 768px) {
    padding: 60px 24px;
  }
}

.section-header {
  text-align: center;
  margin-bottom: 60px;

  h2 {
    font-size: 36px;
    font-weight: 700;
    color: #1a1a2e;
    margin: 0 0 12px;
  }

  p {
    font-size: 16px;
    color: #909399;
    margin: 0;
  }
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  background: #fff;
  padding: 32px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
  animation: fadeInUp 0.6s ease backwards;
  animation-delay: var(--delay);

  &:hover {
    transform: translateY(-8px);
    box-shadow: 0 12px 40px rgba(102, 126, 234, 0.12);

    .feature-icon {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }
  }

  h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a2e;
    margin: 16px 0 8px;
  }

  p {
    font-size: 14px;
    color: #909399;
    line-height: 1.6;
    margin: 0;
  }
}

.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

// Steps Section
.steps-section {
  padding: 100px 60px;
  background: linear-gradient(135deg, #f8f9ff 0%, #faf5ff 100%);

  @media (max-width: 768px) {
    padding: 60px 24px;
  }
}

.steps-container {
  display: flex;
  justify-content: center;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: center;
  }
}

.step-item {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #fff;
  padding: 24px 32px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
}

.step-number {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
}

.step-content {
  h4 {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a2e;
    margin: 0 0 4px;
  }

  p {
    font-size: 13px;
    color: #909399;
    margin: 0;
  }
}

.step-connector {
  color: #c0c4cc;

  @media (max-width: 768px) {
    display: none;
  }
}

// CTA Section
.cta-section {
  padding: 100px 60px;

  @media (max-width: 768px) {
    padding: 60px 24px;
  }
}

.cta-content {
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
  padding: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 24px;

  h2 {
    font-size: 32px;
    font-weight: 700;
    color: #fff;
    margin: 0 0 16px;
  }

  p {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.8);
    margin: 0 0 32px;
  }
}

.cta-btn {
  height: 52px;
  padding: 0 40px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 26px;
  background: #fff;
  color: #667eea;
  border: none;

  &:hover {
    background: rgba(255, 255, 255, 0.9);
    color: #764ba2;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

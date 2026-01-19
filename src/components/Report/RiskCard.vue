<script setup lang="ts">
import { computed } from 'vue'
import type { RiskItem } from '@/api/report'

const props = defineProps<{
  shortTermRisks: RiskItem[]
  midTermRisks: RiskItem[]
}>()

// 风险等级配置
const riskLevelConfig = {
  high: {
    color: '#F56C6C',
    bgColor: '#fef0f0',
    borderColor: '#fbc4c4',
    label: '高风险',
    icon: 'WarningFilled'
  },
  medium: {
    color: '#E6A23C',
    bgColor: '#fdf6ec',
    borderColor: '#f5dab1',
    label: '中风险',
    icon: 'Warning'
  },
  low: {
    color: '#67C23A',
    bgColor: '#f0f9eb',
    borderColor: '#c2e7b0',
    label: '低风险',
    icon: 'InfoFilled'
  }
}

// 总风险数
const totalRisks = computed(() => {
  return props.shortTermRisks.length + props.midTermRisks.length
})

// 高风险数
const highRiskCount = computed(() => {
  return [...props.shortTermRisks, ...props.midTermRisks]
    .filter(r => r.level === 'high').length
})

// 获取风险配置
function getRiskConfig(level: RiskItem['level']) {
  return riskLevelConfig[level]
}
</script>

<template>
  <div class="risk-card">
    <div class="risk-header">
      <div class="risk-icon">
        <el-icon :size="28"><Warning /></el-icon>
      </div>
      <div class="risk-title">
        <h3>风险因素</h3>
        <p>基于健康数据的风险预测</p>
      </div>
      <div class="risk-summary">
        <el-tag
          v-if="highRiskCount > 0"
          type="danger"
          size="large"
        >
          {{ highRiskCount }} 项高风险
        </el-tag>
        <el-tag v-else type="success" size="large">
          暂无高风险
        </el-tag>
      </div>
    </div>

    <div class="risk-content">
      <!-- 近期风险 -->
      <div class="risk-section">
        <div class="section-header">
          <el-icon><Timer /></el-icon>
          <span>近期风险（1年内）</span>
          <el-badge :value="shortTermRisks.length" class="risk-count" />
        </div>

        <div class="risk-timeline">
          <div
            v-for="(risk, index) in shortTermRisks"
            :key="`short-${index}`"
            class="risk-item"
            :style="{
              '--risk-color': getRiskConfig(risk.level).color,
              '--risk-bg': getRiskConfig(risk.level).bgColor,
              '--risk-border': getRiskConfig(risk.level).borderColor
            }"
          >
            <div class="risk-indicator">
              <div class="indicator-dot" />
              <div v-if="index < shortTermRisks.length - 1" class="indicator-line" />
            </div>

            <div class="risk-body">
              <div class="risk-head">
                <span class="risk-name">{{ risk.name }}</span>
                <el-tag
                  :type="risk.level === 'high' ? 'danger' : risk.level === 'medium' ? 'warning' : 'success'"
                  size="small"
                >
                  {{ getRiskConfig(risk.level).label }}
                </el-tag>
              </div>
              <p class="risk-description">{{ risk.description }}</p>
              <div class="risk-timeframe">
                <el-icon><Clock /></el-icon>
                <span>{{ risk.timeframe }}</span>
              </div>
            </div>
          </div>

          <div v-if="shortTermRisks.length === 0" class="empty-risks">
            <el-icon :size="40"><CircleCheck /></el-icon>
            <p>暂无近期风险</p>
          </div>
        </div>
      </div>

      <!-- 中期风险 -->
      <div class="risk-section">
        <div class="section-header">
          <el-icon><Calendar /></el-icon>
          <span>中期风险（1-3年）</span>
          <el-badge :value="midTermRisks.length" class="risk-count" />
        </div>

        <div class="risk-timeline">
          <div
            v-for="(risk, index) in midTermRisks"
            :key="`mid-${index}`"
            class="risk-item"
            :style="{
              '--risk-color': getRiskConfig(risk.level).color,
              '--risk-bg': getRiskConfig(risk.level).bgColor,
              '--risk-border': getRiskConfig(risk.level).borderColor
            }"
          >
            <div class="risk-indicator">
              <div class="indicator-dot" />
              <div v-if="index < midTermRisks.length - 1" class="indicator-line" />
            </div>

            <div class="risk-body">
              <div class="risk-head">
                <span class="risk-name">{{ risk.name }}</span>
                <el-tag
                  :type="risk.level === 'high' ? 'danger' : risk.level === 'medium' ? 'warning' : 'success'"
                  size="small"
                >
                  {{ getRiskConfig(risk.level).label }}
                </el-tag>
              </div>
              <p class="risk-description">{{ risk.description }}</p>
              <div class="risk-timeframe">
                <el-icon><Clock /></el-icon>
                <span>{{ risk.timeframe }}</span>
              </div>
            </div>
          </div>

          <div v-if="midTermRisks.length === 0" class="empty-risks">
            <el-icon :size="40"><CircleCheck /></el-icon>
            <p>暂无中期风险</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.risk-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.risk-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.risk-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.risk-title {
  flex: 1;
  min-width: 200px;

  h3 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 600;
    color: #1a1a2e;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: #909399;
  }
}

.risk-summary {
  flex-shrink: 0;
}

.risk-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.risk-section {
  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: #2c3e50;
    margin-bottom: 20px;

    .el-icon {
      color: #667eea;
    }

    .risk-count {
      margin-left: 4px;
    }
  }
}

.risk-timeline {
  position: relative;
  padding-left: 8px;
}

.risk-item {
  display: flex;
  gap: 16px;
  position: relative;

  &:not(:last-child) {
    padding-bottom: 20px;
  }
}

.risk-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 20px;

  .indicator-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--risk-color);
    border: 3px solid var(--risk-bg);
    box-shadow: 0 0 0 2px var(--risk-color);
    z-index: 1;
  }

  .indicator-line {
    flex: 1;
    width: 2px;
    background: linear-gradient(to bottom, var(--risk-color), #e0e0e0);
    margin-top: 4px;
  }
}

.risk-body {
  flex: 1;
  padding: 16px;
  background: var(--risk-bg);
  border: 1px solid var(--risk-border);
  border-radius: 12px;
  min-width: 0;
}

.risk-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.risk-name {
  font-size: 15px;
  font-weight: 600;
  color: #2c3e50;
}

.risk-description {
  margin: 0 0 12px;
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
}

.risk-timeframe {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;

  .el-icon {
    font-size: 14px;
  }
}

.empty-risks {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #c0c4cc;

  p {
    margin: 12px 0 0;
    font-size: 14px;
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  functionalStatus: string
  strengths: string[]
  problems: string[]
  badlScore?: number | null
  iadlScore?: number | null
}>()

// 失能等级判定
const disabilityLevel = computed(() => {
  if (props.badlScore === null || props.badlScore === undefined) {
    return { level: '未评估', color: '#909399', description: '请完成功能评估' }
  }

  if (props.badlScore === 0) {
    return { level: '完全自理', color: '#67C23A', description: '日常生活完全独立' }
  } else if (props.badlScore <= 3) {
    return { level: '轻度失能', color: '#E6A23C', description: '需要少量帮助' }
  } else if (props.badlScore <= 8) {
    return { level: '中度失能', color: '#F56C6C', description: '需要较多帮助' }
  } else {
    return { level: '重度失能', color: '#C45656', description: '需要全面照护' }
  }
})
</script>

<template>
  <div class="health-portrait">
    <div class="portrait-header">
      <div class="portrait-icon">
        <el-icon :size="28"><User /></el-icon>
      </div>
      <div class="portrait-title">
        <h3>健康画像</h3>
        <p>基于您的评估数据生成</p>
      </div>
    </div>

    <div class="portrait-content">
      <!-- 功能状态概览 -->
      <div class="status-overview">
        <div class="status-card">
          <div class="status-label">失能等级</div>
          <div
            class="status-value"
            :style="{ color: disabilityLevel.color }"
          >
            {{ disabilityLevel.level }}
          </div>
          <div class="status-desc">{{ disabilityLevel.description }}</div>
        </div>

        <div class="score-cards">
          <div class="score-card">
            <div class="score-label">BADL 评分</div>
            <div class="score-value">
              {{ badlScore !== null && badlScore !== undefined ? badlScore : '--' }}
              <span class="score-unit">/18</span>
            </div>
          </div>
          <div class="score-card">
            <div class="score-label">IADL 评分</div>
            <div class="score-value">
              {{ iadlScore !== null && iadlScore !== undefined ? iadlScore : '--' }}
              <span class="score-unit">/24</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 功能状态描述 -->
      <div v-if="functionalStatus" class="functional-status">
        <div class="section-title">
          <el-icon><InfoFilled /></el-icon>
          <span>功能状态</span>
        </div>
        <p class="status-text">{{ functionalStatus }}</p>
      </div>

      <!-- 优势与问题 -->
      <div class="strength-problem-grid">
        <!-- 优势列表 -->
        <div class="sp-card sp-card--strength">
          <div class="sp-header">
            <el-icon><CircleCheck /></el-icon>
            <span>您的优势</span>
          </div>
          <ul class="sp-list">
            <li v-for="(item, index) in strengths" :key="index">
              <el-icon class="check-icon"><Check /></el-icon>
              <span>{{ item }}</span>
            </li>
            <li v-if="strengths.length === 0" class="empty-item">
              暂无数据
            </li>
          </ul>
        </div>

        <!-- 问题列表 -->
        <div class="sp-card sp-card--problem">
          <div class="sp-header">
            <el-icon><Warning /></el-icon>
            <span>需关注问题</span>
          </div>
          <ul class="sp-list">
            <li v-for="(item, index) in problems" :key="index">
              <el-icon class="warning-icon"><WarningFilled /></el-icon>
              <span>{{ item }}</span>
            </li>
            <li v-if="problems.length === 0" class="empty-item">
              暂无数据
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.health-portrait {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.portrait-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #f0f0f0;
}

.portrait-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.portrait-title {
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

.portrait-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.status-overview {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.status-card {
  flex: 1;
  min-width: 180px;
  padding: 20px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 12px;
  text-align: center;

  .status-label {
    font-size: 14px;
    color: #666;
    margin-bottom: 8px;
  }

  .status-value {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .status-desc {
    font-size: 13px;
    color: #909399;
  }
}

.score-cards {
  display: flex;
  gap: 12px;
  flex: 1;
  min-width: 200px;
}

.score-card {
  flex: 1;
  padding: 16px;
  background: #f7f8fa;
  border-radius: 12px;
  text-align: center;

  .score-label {
    font-size: 13px;
    color: #666;
    margin-bottom: 8px;
  }

  .score-value {
    font-size: 28px;
    font-weight: 700;
    color: #2c3e50;

    .score-unit {
      font-size: 14px;
      font-weight: 400;
      color: #909399;
    }
  }
}

.functional-status {
  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: #2c3e50;
    margin-bottom: 12px;

    .el-icon {
      color: #667eea;
    }
  }

  .status-text {
    margin: 0;
    padding: 16px;
    background: #f7f8fa;
    border-radius: 10px;
    line-height: 1.7;
    color: #4a4a4a;
    font-size: 14px;
  }
}

.strength-problem-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.sp-card {
  padding: 20px;
  border-radius: 12px;

  &--strength {
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    border: 1px solid #bbf7d0;

    .sp-header {
      color: #16a34a;
    }
  }

  &--problem {
    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    border: 1px solid #fecaca;

    .sp-header {
      color: #dc2626;
    }
  }
}

.sp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}

.sp-list {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
    font-size: 14px;
    color: #4a4a4a;
    line-height: 1.5;

    &:not(:last-child) {
      border-bottom: 1px dashed rgba(0, 0, 0, 0.06);
    }
  }

  .check-icon {
    color: #16a34a;
    margin-top: 2px;
    flex-shrink: 0;
  }

  .warning-icon {
    color: #dc2626;
    margin-top: 2px;
    flex-shrink: 0;
  }

  .empty-item {
    color: #909399;
    font-style: italic;
  }
}
</style>

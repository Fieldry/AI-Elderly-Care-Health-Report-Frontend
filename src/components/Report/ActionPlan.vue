<script setup lang="ts">
import { computed } from 'vue'
import type { RecommendationItem } from '@/api/report'

const props = defineProps<{
  priority1: RecommendationItem[]
  priority2: RecommendationItem[]
  priority3: RecommendationItem[]
  confirmedIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'confirm', id: string): void
  (e: 'unconfirm', id: string): void
}>()

// 优先级配置
const priorityConfig = {
  1: {
    label: '第一优先级',
    color: '#F56C6C',
    bgColor: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
    borderColor: '#fecaca',
    icon: 'Promotion',
    description: '需要立即采取行动'
  },
  2: {
    label: '第二优先级',
    color: '#E6A23C',
    bgColor: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    borderColor: '#fde68a',
    icon: 'Bell',
    description: '近期内需要关注'
  },
  3: {
    label: '第三优先级',
    color: '#409EFF',
    bgColor: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    borderColor: '#bfdbfe',
    icon: 'Collection',
    description: '日常保健建议'
  }
}

// 完成进度
const progress = computed(() => {
  const total = props.priority1.length + props.priority2.length + props.priority3.length
  const completed = props.confirmedIds.size
  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  }
})

// 切换确认状态
function toggleConfirm(id: string) {
  if (props.confirmedIds.has(id)) {
    emit('unconfirm', id)
  } else {
    emit('confirm', id)
  }
}

// 检查是否已确认
function isConfirmed(id: string): boolean {
  return props.confirmedIds.has(id)
}
</script>

<template>
  <div class="action-plan">
    <div class="plan-header">
      <div class="plan-icon">
        <el-icon :size="28"><List /></el-icon>
      </div>
      <div class="plan-title">
        <h3>健康行动计划</h3>
        <p>个性化健康建议清单</p>
      </div>
      <div class="plan-progress">
        <el-progress
          type="circle"
          :percentage="progress.percentage"
          :width="64"
          :stroke-width="6"
          :color="progress.percentage === 100 ? '#67C23A' : '#667eea'"
        >
          <template #default>
            <span class="progress-inner">
              {{ progress.completed }}/{{ progress.total }}
            </span>
          </template>
        </el-progress>
      </div>
    </div>

    <div class="plan-content">
      <!-- 第一优先级 -->
      <el-collapse v-if="priority1.length > 0" accordion>
        <el-collapse-item name="priority1">
          <template #title>
            <div
              class="priority-header"
              :style="{ '--priority-color': priorityConfig[1].color }"
            >
              <el-icon><Promotion /></el-icon>
              <span class="priority-label">{{ priorityConfig[1].label }}</span>
              <span class="priority-count">{{ priority1.length }} 项</span>
              <span class="priority-desc">{{ priorityConfig[1].description }}</span>
            </div>
          </template>

          <div class="recommendation-list">
            <div
              v-for="item in priority1"
              :key="item.id"
              class="recommendation-item"
              :class="{ 'recommendation-item--confirmed': isConfirmed(item.id) }"
              :style="{
                background: priorityConfig[1].bgColor,
                borderColor: priorityConfig[1].borderColor
              }"
            >
              <el-checkbox
                :model-value="isConfirmed(item.id)"
                @change="toggleConfirm(item.id)"
                class="rec-checkbox"
              />
              <div class="rec-content">
                <div class="rec-title">{{ item.title }}</div>
                <div class="rec-description">{{ item.description }}</div>
                <el-tag size="small" type="info">{{ item.category }}</el-tag>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 第二优先级 -->
      <el-collapse v-if="priority2.length > 0" accordion>
        <el-collapse-item name="priority2">
          <template #title>
            <div
              class="priority-header"
              :style="{ '--priority-color': priorityConfig[2].color }"
            >
              <el-icon><Bell /></el-icon>
              <span class="priority-label">{{ priorityConfig[2].label }}</span>
              <span class="priority-count">{{ priority2.length }} 项</span>
              <span class="priority-desc">{{ priorityConfig[2].description }}</span>
            </div>
          </template>

          <div class="recommendation-list">
            <div
              v-for="item in priority2"
              :key="item.id"
              class="recommendation-item"
              :class="{ 'recommendation-item--confirmed': isConfirmed(item.id) }"
              :style="{
                background: priorityConfig[2].bgColor,
                borderColor: priorityConfig[2].borderColor
              }"
            >
              <el-checkbox
                :model-value="isConfirmed(item.id)"
                @change="toggleConfirm(item.id)"
                class="rec-checkbox"
              />
              <div class="rec-content">
                <div class="rec-title">{{ item.title }}</div>
                <div class="rec-description">{{ item.description }}</div>
                <el-tag size="small" type="info">{{ item.category }}</el-tag>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 第三优先级 -->
      <el-collapse v-if="priority3.length > 0" accordion>
        <el-collapse-item name="priority3">
          <template #title>
            <div
              class="priority-header"
              :style="{ '--priority-color': priorityConfig[3].color }"
            >
              <el-icon><Collection /></el-icon>
              <span class="priority-label">{{ priorityConfig[3].label }}</span>
              <span class="priority-count">{{ priority3.length }} 项</span>
              <span class="priority-desc">{{ priorityConfig[3].description }}</span>
            </div>
          </template>

          <div class="recommendation-list">
            <div
              v-for="item in priority3"
              :key="item.id"
              class="recommendation-item"
              :class="{ 'recommendation-item--confirmed': isConfirmed(item.id) }"
              :style="{
                background: priorityConfig[3].bgColor,
                borderColor: priorityConfig[3].borderColor
              }"
            >
              <el-checkbox
                :model-value="isConfirmed(item.id)"
                @change="toggleConfirm(item.id)"
                class="rec-checkbox"
              />
              <div class="rec-content">
                <div class="rec-title">{{ item.title }}</div>
                <div class="rec-description">{{ item.description }}</div>
                <el-tag size="small" type="info">{{ item.category }}</el-tag>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 空状态 -->
      <div
        v-if="priority1.length === 0 && priority2.length === 0 && priority3.length === 0"
        class="empty-plan"
      >
        <el-icon :size="48"><Document /></el-icon>
        <p>暂无健康建议</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.action-plan {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.plan-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.plan-title {
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

.plan-progress {
  flex-shrink: 0;

  .progress-inner {
    font-size: 14px;
    font-weight: 600;
    color: #2c3e50;
  }
}

.plan-content {
  display: flex;
  flex-direction: column;
  gap: 16px;

  :deep(.el-collapse) {
    border: none;
  }

  :deep(.el-collapse-item__header) {
    height: auto;
    padding: 16px;
    background: #f7f8fa;
    border-radius: 12px;
    border: none;

    &:hover {
      background: #f0f2f5;
    }
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
  }

  :deep(.el-collapse-item__content) {
    padding: 16px 0 0;
  }
}

.priority-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;

  .el-icon {
    color: var(--priority-color);
    font-size: 20px;
  }

  .priority-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--priority-color);
  }

  .priority-count {
    padding: 2px 10px;
    background: var(--priority-color);
    color: #fff;
    border-radius: 10px;
    font-size: 12px;
  }

  .priority-desc {
    color: #909399;
    font-size: 13px;
    margin-left: auto;
  }
}

.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recommendation-item {
  display: flex;
  gap: 16px;
  padding: 16px;
  border: 1px solid;
  border-radius: 12px;
  transition: all 0.3s ease;

  &--confirmed {
    opacity: 0.7;

    .rec-title {
      text-decoration: line-through;
      color: #909399;
    }
  }
}

.rec-checkbox {
  flex-shrink: 0;
  margin-top: 2px;
}

.rec-content {
  flex: 1;
  min-width: 0;
}

.rec-title {
  font-size: 15px;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 6px;
  line-height: 1.4;
}

.rec-description {
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
  margin-bottom: 10px;
}

.empty-plan {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #c0c4cc;

  p {
    margin: 16px 0 0;
    font-size: 14px;
  }
}
</style>

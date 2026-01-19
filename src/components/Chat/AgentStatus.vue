<script setup lang="ts">
import { computed } from 'vue'
import type { AgentState } from '@/stores/chatSession'

const props = defineProps<{
  agents: AgentState[]
  show: boolean
}>()

// Agent 图标映射
const agentIcons: Record<string, string> = {
  StatusAgent: 'DataAnalysis',
  RiskAgent: 'Warning',
  AdviceAgent: 'Promotion',
  ReportAgent: 'Document'
}

// 计算当前进度
const progress = computed(() => {
  const completed = props.agents.filter(a => a.status === 'completed').length
  return Math.round((completed / props.agents.length) * 100)
})

// 获取状态颜色
function getStatusColor(status: AgentState['status']): string {
  const colors: Record<AgentState['status'], string> = {
    pending: '#909399',
    running: '#409EFF',
    completed: '#67C23A',
    error: '#F56C6C'
  }
  return colors[status]
}

// 获取状态文本
function getStatusText(status: AgentState['status']): string {
  const texts: Record<AgentState['status'], string> = {
    pending: '等待中',
    running: '处理中...',
    completed: '已完成',
    error: '出错'
  }
  return texts[status]
}
</script>

<template>
  <Transition name="slide-fade">
    <div v-if="show" class="agent-status">
      <div class="status-header">
        <div class="status-title">
          <el-icon class="spinning"><Loading /></el-icon>
          <span>AI 正在分析中</span>
        </div>
        <div class="status-progress">
          <el-progress
            :percentage="progress"
            :stroke-width="6"
            :show-text="false"
            color="#667eea"
          />
          <span class="progress-text">{{ progress }}%</span>
        </div>
      </div>

      <div class="agent-list">
        <div
          v-for="agent in agents"
          :key="agent.name"
          class="agent-item"
          :class="`agent-item--${agent.status}`"
        >
          <div class="agent-icon">
            <el-icon v-if="agent.status === 'running'" class="spinning">
              <Loading />
            </el-icon>
            <el-icon v-else-if="agent.status === 'completed'">
              <Check />
            </el-icon>
            <el-icon v-else-if="agent.status === 'error'">
              <Close />
            </el-icon>
            <el-icon v-else>
              <Clock />
            </el-icon>
          </div>

          <div class="agent-info">
            <div class="agent-name">{{ agent.displayName }}</div>
            <div class="agent-message" v-if="agent.message">
              {{ agent.message }}
            </div>
          </div>

          <div class="agent-status-badge" :style="{ color: getStatusColor(agent.status) }">
            {{ getStatusText(agent.status) }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.agent-status {
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 16px;
  padding: 20px;
  margin: 16px 20px;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.1);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(102, 126, 234, 0.1);
}

.status-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;

  .el-icon {
    color: #667eea;
  }
}

.status-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 120px;

  .el-progress {
    flex: 1;
  }

  .progress-text {
    font-size: 14px;
    font-weight: 600;
    color: #667eea;
    min-width: 40px;
    text-align: right;
  }
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  transition: all 0.3s ease;

  &--running {
    background: linear-gradient(135deg, #e8f4fd 0%, #e0f0ff 100%);
    box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
  }

  &--completed {
    opacity: 0.85;
  }

  &--error {
    background: #fef0f0;
  }
}

.agent-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;

  .agent-item--running & {
    background: #409EFF;
    color: #fff;
  }

  .agent-item--completed & {
    background: #67C23A;
    color: #fff;
  }

  .agent-item--error & {
    background: #F56C6C;
    color: #fff;
  }
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
}

.agent-message {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.agent-status-badge {
  font-size: 12px;
  font-weight: 500;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.slide-fade-enter-active {
  transition: all 0.4s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.3s ease-in;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}
</style>

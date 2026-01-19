<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatSessionStore } from '@/stores/chatSession'
import { useUserProfileStore } from '@/stores/userProfile'
import { useReportResultStore } from '@/stores/reportResult'
import { useValidator } from '@/hooks/useValidator'
import { MessageBubble, InputArea, AgentStatus } from '@/components/Chat'
import { PageHeader } from '@/components/Common'

const router = useRouter()
const chatStore = useChatSessionStore()
const userStore = useUserProfileStore()
const reportStore = useReportResultStore()
const { canGenerateReport } = useValidator()

const messagesContainer = ref<HTMLElement | null>(null)
const showQuestionnaireMode = ref(false)

// 初始化会话
onMounted(() => {
  if (!chatStore.sessionId) {
    chatStore.startNewSession()
  }
})

// 自动滚动到底部
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  }
)

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 发送消息
async function handleSend(message: string) {
  // 添加用户消息
  chatStore.addMessage({
    role: 'user',
    content: message
  })

  chatStore.setLoading(true)

  // 模拟 AI 响应 (实际项目中应调用 API)
  setTimeout(() => {
    // 解析用户输入，更新用户画像
    parseUserInput(message)

    // 生成下一个问题
    const nextQuestion = generateNextQuestion()

    chatStore.addMessage({
      role: 'assistant',
      content: nextQuestion
    })

    chatStore.setLoading(false)
  }, 1000)
}

// 解析用户输入 (简化版)
function parseUserInput(input: string) {
  // 年龄解析
  const ageMatch = input.match(/(\d+)\s*(岁|周岁)?/)
  if (ageMatch && !userStore.profile.demographics.age) {
    userStore.updateDemographics({ age: parseInt(ageMatch[1]) })
    return
  }

  // 性别解析
  if (/男|male/i.test(input) && !userStore.profile.demographics.gender) {
    userStore.updateDemographics({ gender: 'male' })
    return
  }
  if (/女|female/i.test(input) && !userStore.profile.demographics.gender) {
    userStore.updateDemographics({ gender: 'female' })
    return
  }

  // 居住状态解析
  if (/独居|一个人住/.test(input)) {
    userStore.updateDemographics({ livingStatus: 'alone' })
    return
  }
  if (/配偶|老伴|爱人/.test(input)) {
    userStore.updateDemographics({ livingStatus: 'with_spouse' })
    return
  }
  if (/子女|儿子|女儿|孩子/.test(input)) {
    userStore.updateDemographics({ livingStatus: 'with_children' })
    return
  }
}

// 生成下一个问题 (简化版)
function generateNextQuestion(): string {
  const profile = userStore.profile

  if (!profile.demographics.age) {
    return '请问您今年多大年纪了？'
  }

  if (!profile.demographics.gender) {
    return '请问您的性别是？'
  }

  if (!profile.demographics.livingStatus) {
    return '请问您目前的居住情况是怎样的？是独居、与配偶同住，还是与子女同住呢？'
  }

  // BADL 评估
  const badl = profile.functionalStatus.badl
  if (badl.bathing === null) {
    return '接下来我想了解一下您的日常生活能力。首先，您平时洗澡需要别人帮忙吗？\n\n0 = 完全不需要帮助\n1 = 需要少量帮助\n2 = 需要较多帮助\n3 = 完全需要他人帮助'
  }

  if (badl.dressing === null) {
    return '穿衣服方面呢？您能独立完成穿脱衣服吗？\n\n0 = 完全独立\n1 = 需要少量帮助\n2 = 需要较多帮助\n3 = 完全依赖他人'
  }

  if (badl.toileting === null) {
    return '如厕方面，您能独立完成吗？\n\n0 = 完全独立\n1 = 偶尔需要帮助\n2 = 经常需要帮助\n3 = 完全依赖他人'
  }

  if (badl.feeding === null) {
    return '进食方面，您能独立完成吃饭吗？\n\n0 = 完全独立\n1 = 需要少量帮助\n2 = 需要较多帮助\n3 = 完全依赖他人'
  }

  // IADL 评估
  const iadl = profile.functionalStatus.iadl
  if (iadl.shopping === null) {
    return '现在我们来了解一下您的社会活动能力。您能独立外出购物吗？\n\n0 = 完全独立\n1 = 需要少量帮助\n2 = 需要较多帮助\n3 = 无法完成'
  }

  if (iadl.cooking === null) {
    return '做饭方面，您能独立完成吗？\n\n0 = 完全独立\n1 = 需要少量帮助\n2 = 需要较多帮助\n3 = 无法完成'
  }

  // 健康因素
  if (profile.healthFactors.chronicDiseases.length === 0 &&
      profile.healthFactors.fallHistory === null) {
    return '请问您有以下慢性病吗？（可多选）\n- 高血压\n- 糖尿病\n- 心脏病\n- 关节炎\n\n或者输入"没有"如果您没有这些疾病。'
  }

  if (profile.healthFactors.fallHistory === null) {
    return '过去一年内，您有过跌倒的经历吗？'
  }

  // 已收集足够信息
  return `感谢您的耐心回答！根据目前收集的信息，我已经对您的健康状况有了初步了解。\n\n📊 数据完成度：${userStore.completionPercentage}%\n\n您可以点击下方的"生成报告"按钮，我将为您生成详细的健康评估报告。`
}

// 生成报告
async function handleGenerateReport() {
  if (!canGenerateReport.value) {
    ElMessage.warning('请先完成基本信息填写')
    return
  }

  chatStore.setGeneratingReport(true)
  chatStore.initAgentStates()

  // 添加系统消息
  chatStore.addMessage({
    role: 'assistant',
    content: '正在为您生成健康评估报告，请稍候...'
  })

  // 模拟 Agent 链式调用
  const agents = ['StatusAgent', 'RiskAgent', 'AdviceAgent', 'ReportAgent']

  for (let i = 0; i < agents.length; i++) {
    chatStore.updateAgentState(agents[i], 'running', `正在处理...`)
    await new Promise(resolve => setTimeout(resolve, 1500))
    chatStore.updateAgentState(agents[i], 'completed', '完成')
  }

  // 模拟报告生成
  setTimeout(() => {
    reportStore.setReportData({
      summary: '综合评估显示，您的整体健康状况尚可，但存在一些需要关注的风险因素。',
      healthPortrait: {
        functionalStatus: '基本日常生活活动能力（BADL）评估显示您在大部分项目中能够独立完成。',
        strengths: ['认知功能良好', '社会支持网络稳定', '生活态度积极'],
        problems: ['存在跌倒风险', '部分日常活动需要协助']
      },
      riskFactors: {
        shortTerm: [
          { name: '跌倒风险', level: 'high', description: '根据评估数据，存在较高的跌倒风险', timeframe: '未来6个月' }
        ],
        midTerm: [
          { name: '功能退化风险', level: 'medium', description: '需关注日常活动能力的维持', timeframe: '1-2年内' }
        ]
      },
      recommendations: {
        priority1: [
          { id: '1', title: '跌倒预防', description: '安装扶手、保持地面干燥、穿防滑鞋', category: '安全' }
        ],
        priority2: [
          { id: '2', title: '适度运动', description: '每天进行15-30分钟的轻度运动', category: '运动' }
        ],
        priority3: [
          { id: '3', title: '定期体检', description: '每半年进行一次全面体检', category: '医疗' }
        ]
      },
      generatedAt: new Date().toISOString()
    })

    chatStore.setGeneratingReport(false)
    router.push('/report')
  }, 1000)
}

// 重新开始
function handleRestart() {
  chatStore.clearSession()
  userStore.resetProfile()
  reportStore.resetReport()
  chatStore.startNewSession()
}

// 切换问卷模式
function toggleQuestionnaireMode() {
  showQuestionnaireMode.value = !showQuestionnaireMode.value
}
</script>

<template>
  <div class="assessment-page">
    <PageHeader
      title="健康评估对话"
      :subtitle="`数据完成度: ${userStore.completionPercentage}%`"
      show-back
    >
      <template #actions>
        <el-button @click="toggleQuestionnaireMode">
          {{ showQuestionnaireMode ? '对话模式' : '问卷模式' }}
        </el-button>
        <el-button @click="handleRestart">重新开始</el-button>
        <el-button
          type="primary"
          :disabled="!canGenerateReport"
          :loading="chatStore.isGeneratingReport"
          @click="handleGenerateReport"
        >
          生成报告
        </el-button>
      </template>
    </PageHeader>

    <div class="chat-container">
      <!-- 进度指示器 -->
      <div class="progress-bar">
        <el-progress
          :percentage="userStore.completionPercentage"
          :stroke-width="8"
          :show-text="false"
          color="#667eea"
        />
        <span class="progress-text">{{ userStore.completionPercentage }}% 已完成</span>
      </div>

      <!-- Agent 状态面板 -->
      <AgentStatus
        :agents="chatStore.agentStates"
        :show="chatStore.isGeneratingReport"
      />

      <!-- 消息列表 -->
      <div ref="messagesContainer" class="messages-container">
        <MessageBubble
          v-for="message in chatStore.messages"
          :key="message.id"
          :role="message.role"
          :content="message.content"
          :timestamp="message.timestamp"
          :is-streaming="message.isStreaming"
          :agent-name="message.agentName"
        />

        <!-- 加载指示器 -->
        <div v-if="chatStore.isLoading" class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <!-- 输入区域 -->
      <InputArea
        :disabled="chatStore.isGeneratingReport"
        :loading="chatStore.isLoading"
        placeholder="请输入您的回答..."
        @send="handleSend"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.assessment-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.progress-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: #f8f9ff;
  border-bottom: 1px solid #f0f0f0;

  .el-progress {
    flex: 1;
  }

  .progress-text {
    font-size: 13px;
    color: #667eea;
    font-weight: 500;
    white-space: nowrap;
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
  scroll-behavior: smooth;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #e0e0e0;
    border-radius: 3px;

    &:hover {
      background: #c0c0c0;
    }
  }
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 20px 32px;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #667eea;
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}
</style>

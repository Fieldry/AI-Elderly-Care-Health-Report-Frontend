<script setup lang="ts">
import PlaceholderPanel from '@/components/PlaceholderPanel.vue'

const upcomingFeatures = [
  '支持更温和的陪伴式聊天，适合老人进行日常交流。',
  '预留情绪安抚、问候提醒和连续对话的能力扩展位。',
  '后端未接入前，先保留稳定入口，避免后续再次改路由和结构。'
]

const scenarioCards = [
  '晨间问候与状态关怀',
  '情绪低落时的安抚对话',
  '陪伴式闲聊与日常记录'
]
</script>

<template>
  <main class="role-page companion-page">
    <section class="companion-hero">
      <div>
        <span class="status-pill">情感陪伴聊天</span>
        <h1>先把入口搭好，再逐步补上陪伴式聊天能力</h1>
        <p>
          这一页当前不接真实后端，主要用于说明后续方向和保留稳定路由。等后端能力到位后，可以直接在这个页面上扩展连续对话、情绪关怀和心理支持能力。
        </p>
      </div>
    </section>

    <PlaceholderPanel
      status="功能预留中"
      title="情感陪伴聊天入口已建立"
      description="当前先展示场景与定位说明，后续将把陪伴式聊天能力接入这里，而不需要再次改首页和导航结构。"
      :bullets="upcomingFeatures"
      note="如果现在需要体验可用能力，请先进入健康评估页面。"
    >
      <template #actions>
        <RouterLink class="primary-btn" to="/elderly/assessment">先体验健康评估</RouterLink>
        <RouterLink class="ghost-btn" to="/elderly">返回老年人入口</RouterLink>
      </template>

      <div class="scenario-grid">
        <article v-for="item in scenarioCards" :key="item" class="scenario-card">
          <strong>{{ item }}</strong>
          <p>页面结构已为这一类对话场景预留空间，后续可直接接入聊天界面与会话记录。</p>
        </article>
      </div>
    </PlaceholderPanel>
  </main>
</template>

<style scoped>
.companion-page {
  display: grid;
  gap: 24px;
}

.companion-hero {
  padding: 34px;
  border-radius: 34px;
  background: linear-gradient(135deg, rgba(232, 244, 238, 0.92), rgba(249, 252, 252, 0.96));
  border: 1px solid rgba(12, 112, 109, 0.16);
  box-shadow: var(--shadow-soft);
}

.companion-hero h1 {
  margin: 16px 0 14px;
  color: var(--ink-strong);
  font-size: clamp(36px, 5vw, 56px);
  line-height: 1.08;
}

.companion-hero p,
.scenario-card p {
  margin: 0;
  color: var(--ink-muted);
  font-size: 19px;
  line-height: 1.8;
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.scenario-card {
  padding: 22px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(18, 53, 59, 0.08);
}

.scenario-card strong {
  display: inline-flex;
  margin-bottom: 10px;
  color: var(--ink-strong);
  font-size: 21px;
}

@media (max-width: 960px) {
  .scenario-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .companion-hero {
    padding: 24px;
    border-radius: 28px;
  }

  .companion-hero h1 {
    font-size: clamp(32px, 10vw, 42px);
  }

  .companion-hero p,
  .scenario-card p {
    font-size: 18px;
  }
}
</style>

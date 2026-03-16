<script setup lang="ts">
import PlaceholderPanel from '@/components/PlaceholderPanel.vue'

const familyCapabilities = [
  '后续可承接老人健康报告的家庭查看视图。',
  '预留照护重点、提醒协作和日常关注事项的展示结构。',
  '先用稳定入口承接家属角色，避免后续继续混在老人页面里。'
]

const previewCards = [
  {
    title: '照护重点概览',
    description: '用更简洁的方式帮助家属快速理解老人当前风险点与建议。'
  },
  {
    title: '协作提醒',
    description: '为家庭成员分配照护关注点、复诊事项和行动建议。'
  },
  {
    title: '报告查看入口',
    description: '为后续接入历史报告、变化趋势和跟进记录留出位置。'
  }
]
</script>

<template>
  <main class="role-page portal-page">
    <section class="portal-hero portal-hero--family">
      <div>
        <span class="status-pill">家属入口</span>
        <h1>让家属更快理解老人健康状态与照护重点</h1>
        <p>
          家属页面当前以入口预留和信息架构为主。等后端能力补齐后，这里将承接家庭查看、协作提醒和照护建议等内容。
        </p>
      </div>
    </section>

    <PlaceholderPanel
      status="结构已预留"
      title="家属端页面已纳入导航与路由"
      description="当前前端先完成家属角色的入口、页面语气和信息层次设计，确保后续新增功能时不需要再大改整体结构。"
      :bullets="familyCapabilities"
      note="目前唯一可直接体验的业务能力仍是老年人健康评估。"
    >
      <template #actions>
        <RouterLink class="primary-btn" to="/">返回首页</RouterLink>
        <RouterLink class="ghost-btn" to="/family/hub">进入家属中心</RouterLink>
      </template>

      <div class="preview-grid">
        <article v-for="card in previewCards" :key="card.title" class="preview-card">
          <strong>{{ card.title }}</strong>
          <p>{{ card.description }}</p>
        </article>
      </div>
    </PlaceholderPanel>
  </main>
</template>

<style scoped>
.portal-page {
  display: grid;
  gap: 24px;
}

.portal-hero {
  padding: 34px;
  border-radius: 34px;
  border: 1px solid rgba(31, 99, 147, 0.14);
  box-shadow: var(--shadow-soft);
}

.portal-hero--family {
  background: linear-gradient(135deg, rgba(248, 243, 236, 0.94), rgba(249, 252, 252, 0.96));
}

.portal-hero h1 {
  margin: 16px 0 14px;
  color: var(--ink-strong);
  font-size: clamp(36px, 5vw, 56px);
  line-height: 1.08;
}

.portal-hero p,
.preview-card p {
  margin: 0;
  color: var(--ink-muted);
  font-size: 19px;
  line-height: 1.8;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.preview-card {
  padding: 22px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(18, 53, 59, 0.08);
}

.preview-card strong {
  display: inline-flex;
  margin-bottom: 10px;
  color: var(--ink-strong);
  font-size: 21px;
}

@media (max-width: 960px) {
  .preview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .portal-hero {
    padding: 24px;
    border-radius: 28px;
  }

  .portal-hero h1 {
    font-size: clamp(32px, 10vw, 42px);
  }

  .portal-hero p,
  .preview-card p {
    font-size: 18px;
  }
}
</style>

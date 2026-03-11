<script setup lang="ts">
import PlaceholderPanel from '@/components/PlaceholderPanel.vue'

const doctorCapabilities = [
  '后续可展示更结构化的患者概览与风险摘要。',
  '预留医生查看建议、重点问题和跟进记录的模块位置。',
  '页面语气保持专业化，避免和老人、家属页面混在一起。'
]

const previewCards = [
  {
    title: '患者概览',
    description: '用结构化模块承接核心状态、既往重点和当次输入摘要。'
  },
  {
    title: '风险提示',
    description: '集中展示近期与中期风险因素，方便医生快速判断。'
  },
  {
    title: '专业建议支持',
    description: '为后续接入更专业的解释、标注和跟进流程预留界面。'
  }
]
</script>

<template>
  <main class="role-page portal-page">
    <section class="portal-hero portal-hero--doctor">
      <div>
        <span class="status-pill">医生入口</span>
        <h1>为专业人员预留更聚焦的患者查看与判断界面</h1>
        <p>
          医生端当前同样以前端结构和视觉分层为主，等后端支持到位后，可以在这里承接患者概览、风险摘要和专业建议等内容。
        </p>
      </div>
    </section>

    <PlaceholderPanel
      status="结构已预留"
      title="医生端路由与页面骨架已经建立"
      description="本轮先解决角色分流、路由结构和页面调性，让专业入口具备清晰位置；后续能力接入时可以直接在这个页面扩展。"
      :bullets="doctorCapabilities"
      note="现阶段可直接体验的真实业务页面仍是老年人健康评估。"
    >
      <template #actions>
        <RouterLink class="primary-btn" to="/">返回首页</RouterLink>
        <RouterLink class="ghost-btn" to="/elderly/assessment">查看已开放功能</RouterLink>
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

.portal-hero--doctor {
  background: linear-gradient(135deg, rgba(227, 237, 247, 0.92), rgba(249, 252, 252, 0.96));
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

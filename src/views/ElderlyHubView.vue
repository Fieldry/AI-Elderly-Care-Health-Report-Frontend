<script setup lang="ts">
import ElderlySubnav from '@/components/ElderlySubnav.vue'

const serviceCards = [
  {
    title: '健康报告评估',
    description:
      '通过多轮对话采集老人健康信息，逐步完成功能状态与风险因素收集，并在条件满足后生成结构化健康报告。',
    status: '已开放',
    path: '/elderly/assessment',
    actionLabel: '进入健康评估',
    highlights: ['保留现有评估能力', '支持历史会话查看', '报告生成流程可继续使用']
  },
  {
    title: '情感陪伴聊天',
    description:
      '为后续接入心理关怀、日常问候和温和陪伴式对话预留入口，让老人能够更自然地与系统建立连续互动。',
    status: '即将开放',
    path: '/elderly/companion',
    actionLabel: '查看入口说明',
    highlights: ['入口与路由已建立', '适合后续接入聊天能力', '当前先展示使用场景与预留说明']
  }
]

const elderlyDesignNotes = [
  '正文字号、按钮和输入区全部放大，降低阅读压力。',
  '页面结构更直接，优先展示可用功能与下一步操作。',
  '医疗风保持可信，但颜色和排版避免过冷、过硬。'
]
</script>

<template>
  <main class="role-page elderly-page">
    <section class="elderly-hero">
      <div class="hero-copy">
        <span class="status-pill">老年人端口</span>
        <h1>适合长者使用的健康评估与陪伴入口</h1>
        <p>
          老年人页面优先考虑大字号、清晰按钮和更直接的服务路径。当前已开放健康评估，情感陪伴聊天入口已经建立，后续可继续补充真实能力。
        </p>
      </div>

      <div class="hero-panel">
        <article>
          <strong>当前可体验</strong>
          <p>健康评估对话与报告生成流程</p>
        </article>
        <article>
          <strong>后续可扩展</strong>
          <p>情感陪伴、心理关怀与连续互动场景</p>
        </article>
      </div>
    </section>

    <ElderlySubnav />

    <section class="service-grid">
      <article v-for="service in serviceCards" :key="service.title" class="service-card">
        <div class="service-head">
          <span class="status-pill">{{ service.status }}</span>
          <h2>{{ service.title }}</h2>
        </div>

        <p>{{ service.description }}</p>

        <ul>
          <li v-for="item in service.highlights" :key="item">{{ item }}</li>
        </ul>

        <RouterLink class="primary-btn" :to="service.path">{{ service.actionLabel }}</RouterLink>
      </article>
    </section>

    <section class="design-panel">
      <div>
        <p class="section-eyebrow">适老化说明</p>
        <h2>老人入口的视觉和交互会比普通页面更大、更清晰</h2>
      </div>

      <div class="note-list">
        <article v-for="item in elderlyDesignNotes" :key="item" class="note-card">
          <p>{{ item }}</p>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.elderly-page {
  display: grid;
  gap: 26px;
}

.elderly-hero,
.design-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  gap: 22px;
  padding: 34px;
  border-radius: 34px;
  border: 1px solid rgba(12, 112, 109, 0.16);
  background: linear-gradient(135deg, rgba(223, 240, 235, 0.9), rgba(248, 252, 251, 0.95));
  box-shadow: var(--shadow-soft);
}

.hero-copy h1,
.design-panel h2 {
  margin: 16px 0 14px;
  color: var(--ink-strong);
  font-size: clamp(38px, 6vw, 58px);
  line-height: 1.08;
}

.hero-copy p,
.design-panel p,
.service-card p,
.service-card li,
.note-card p {
  margin: 0;
  color: var(--ink-muted);
  font-size: 19px;
  line-height: 1.8;
}

.hero-panel,
.service-grid,
.note-list {
  display: grid;
  gap: 16px;
}

.hero-panel article,
.service-card,
.note-card {
  padding: 24px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 18px 36px rgba(18, 58, 62, 0.08);
}

.hero-panel strong,
.service-card h2,
.design-panel h2 {
  color: var(--ink-strong);
}

.hero-panel strong {
  display: inline-flex;
  margin-bottom: 10px;
  font-size: 22px;
}

.hero-panel p {
  margin: 0;
  font-size: 18px;
  line-height: 1.7;
  color: var(--ink-muted);
}

.service-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.service-card {
  display: grid;
  gap: 18px;
}

.service-head h2 {
  margin: 14px 0 0;
  font-size: 32px;
  line-height: 1.15;
}

.service-card ul {
  margin: 0;
  padding-left: 22px;
  display: grid;
  gap: 10px;
}

.note-list {
  align-content: start;
}

@media (max-width: 980px) {
  .elderly-hero,
  .design-panel,
  .service-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .elderly-hero,
  .design-panel {
    padding: 24px;
    border-radius: 28px;
  }

  .hero-copy h1,
  .design-panel h2 {
    font-size: clamp(32px, 11vw, 42px);
  }

  .hero-copy p,
  .design-panel p,
  .service-card p,
  .service-card li,
  .note-card p {
    font-size: 18px;
  }

  .hero-panel article,
  .service-card,
  .note-card {
    padding: 20px;
    border-radius: 24px;
  }
}
</style>

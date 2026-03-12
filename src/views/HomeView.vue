<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'

interface PortalSection {
  id: string
  eyebrow: string
  title: string
  description: string
  path: string
  status: string
  highlights: string[]
  metrics: string[]
  tone: string
}

const router = useRouter()
const homeRoot = useTemplateRef('homeRoot')
const activeSectionId = ref('hero')

const portalSections: PortalSection[] = [
  {
    id: 'elderly',
    eyebrow: '老年人入口',
    title: '面向长者的健康评估与情感陪伴',
    description:
      '以更大的字号、更明确的引导和更轻的操作负担，帮助老人完成健康情况采集，并为后续陪伴式聊天预留入口。',
    path: '/elderly',
    status: '已开放健康评估',
    highlights: ['对话式健康评估', '适老化大字界面', '情感陪伴聊天入口预留'],
    metrics: ['大字号阅读', '更清晰的步骤引导', '低操作门槛'],
    tone: 'is-elderly'
  },
  {
    id: 'family',
    eyebrow: '家属入口',
    title: '帮助家属更快理解老人健康状态与照护重点',
    description:
      '首页先建立照护协作认知，子页则为后续接入家庭照护概览、提醒协作与报告查看能力预留空间。',
    path: '/family',
    status: '功能入口已预留',
    highlights: ['照护重点概览', '家庭协作提醒', '报告查看入口预留'],
    metrics: ['更快掌握重点', '便于家庭协作', '后续能力可扩展'],
    tone: 'is-family'
  },
  {
    id: 'doctor',
    eyebrow: '医生入口',
    title: '为专业人员预留结构化判断与跟进视角',
    description:
      '将老人采集到的关键信息与风险摘要整理为更易浏览的专业视图，方便医生后续查看、判断和继续补充。',
    path: '/doctor',
    status: '功能入口已预留',
    highlights: ['结构化患者概览', '风险提示入口', '专业建议支持预留'],
    metrics: ['信息更聚焦', '专业表达更清晰', '支持后续扩展'],
    tone: 'is-doctor'
  }
]

const carePillars = [
  {
    title: '早识别',
    description: '通过多轮对话尽早发现功能状态、风险因素与照护重点。'
  },
  {
    title: '易协作',
    description: '让老人、家属和医生围绕同一份健康信息展开协同。'
  },
  {
    title: '可持续',
    description: '先搭建完整入口与体验骨架，再逐步接入更多真实业务能力。'
  }
]

const sectionRailItems = computed(() => [
  { id: 'hero', label: '首屏' },
  ...portalSections.map((section) => ({ id: section.id, label: section.eyebrow.replace('入口', '') }))
])

let observer: IntersectionObserver | null = null

function goToSection(sectionId: string) {
  activeSectionId.value = sectionId
  router.push({
    path: '/',
    hash: `#${sectionId}`
  })
}

onMounted(() => {
  const root = homeRoot.value
  if (!root) {
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          const sectionId = (entry.target as HTMLElement).id
          if (sectionId && entry.intersectionRatio >= 0.4) {
            activeSectionId.value = sectionId
          }
        }
      }
    },
    {
      threshold: [0.16, 0.4, 0.65],
      rootMargin: '-18% 0px -18% 0px'
    }
  )

  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
    observer?.observe(element)
  })
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <main ref="homeRoot" class="home-page">
    <aside class="section-rail" aria-label="首页分栏导航">
      <button
        v-for="item in sectionRailItems"
        :key="item.id"
        class="section-rail__item"
        :class="{ 'is-active': activeSectionId === item.id }"
        type="button"
        @click="goToSection(item.id)"
      >
        <span class="section-rail__dot" />
        <span class="section-rail__label">{{ item.label }}</span>
      </button>
    </aside>

    <section id="hero" class="hero-section home-section page-anchor is-visible" data-reveal>
      <div class="hero-copy">
        <p class="section-eyebrow">AI Elderly Care</p>
        <h1>面向老人、家属与医生的智慧健康评估与陪伴平台</h1>
        <p class="hero-description">
          通过首页门户把三类角色放进同一条服务链路里：老人完成健康评估与后续陪伴入口的触达，家属理解照护重点，医生获得更清晰的专业查看入口。
        </p>

        <div class="pillar-list">
          <article v-for="pillar in carePillars" :key="pillar.title" class="pillar-card">
            <strong>{{ pillar.title }}</strong>
            <p>{{ pillar.description }}</p>
          </article>
        </div>
      </div>

      <aside class="hero-aside">
        <article class="signal-card">
          <span class="status-pill">项目特点</span>
          <h2>医疗可信感 + 温和陪伴感</h2>
          <p>首页先建立信任，入口再按角色分流，避免信息堆叠和使用路径混乱。</p>
        </article>

        <article class="signal-card signal-card--accent">
          <p class="signal-label">当前阶段</p>
          <ul>
            <li>老人健康评估可用</li>
            <li>陪伴聊天入口已预留</li>
            <li>家属与医生页面先完成结构占位</li>
          </ul>
        </article>
      </aside>
    </section>

    <section
      v-for="section in portalSections"
      :id="section.id"
      :key="section.id"
      class="home-section portal-section page-anchor"
      :class="section.tone"
      data-reveal
    >
      <div class="portal-copy">
        <p class="section-eyebrow">{{ section.eyebrow }}</p>
        <div class="portal-heading">
          <h2>{{ section.title }}</h2>
          <RouterLink class="primary-btn portal-entry-btn" :to="section.path">进入</RouterLink>
        </div>
        <p>{{ section.description }}</p>
        <span class="status-pill">{{ section.status }}</span>
      </div>

      <div class="portal-grid">
        <article class="feature-card">
          <h3>核心能力</h3>
          <ul>
            <li v-for="item in section.highlights" :key="item">{{ item }}</li>
          </ul>
        </article>

        <article class="feature-card">
          <h3>体验特点</h3>
          <div class="metric-cloud">
            <span v-for="metric in section.metrics" :key="metric">{{ metric }}</span>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  padding: 0 0 90px;
  position: relative;
}

.home-section {
  min-height: calc(100vh - 30px);
  display: grid;
  align-items: center;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 26px;
  padding: 22px 0;
  opacity: 0;
  transform: translateY(30px) scale(0.97);
  transition:
    opacity 0.65s ease,
    transform 0.65s ease;
  scroll-snap-align: start;
}

.home-section.is-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.section-rail {
  position: fixed;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  z-index: 8;
  display: grid;
  gap: 10px;
  padding: 14px 12px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  background: rgba(247, 251, 251, 0.76);
  box-shadow: 0 20px 40px rgba(20, 63, 67, 0.12);
  backdrop-filter: blur(14px);
}

.section-rail__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  color: var(--ink-muted);
}

.section-rail__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(18, 53, 59, 0.18);
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.section-rail__label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.section-rail__item.is-active {
  color: var(--brand-strong);
}

.section-rail__item.is-active .section-rail__dot {
  transform: scale(1.3);
  background: linear-gradient(135deg, var(--brand), var(--secondary));
}

.hero-copy,
.portal-copy {
  padding: 12px 0;
}

.hero-copy h1,
.portal-copy h2 {
  margin: 12px 0 16px;
  color: var(--ink-strong);
  line-height: 1.05;
}

.hero-copy h1 {
  font-size: clamp(44px, 7vw, 78px);
  max-width: 10ch;
}

.portal-copy h2 {
  font-size: clamp(34px, 4.6vw, 54px);
  max-width: 11ch;
}

.portal-copy h2 {
  max-width: none;
  margin: 0;
}

.hero-description,
.portal-copy p {
  margin: 0;
  max-width: 58ch;
  color: var(--ink-muted);
  font-size: 19px;
  line-height: 1.8;
}

.hero-aside,
.portal-grid {
  display: grid;
  gap: 18px;
}

.portal-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 12px 0 16px;
}

.hero-aside {
  align-content: center;
}

.signal-card,
.feature-card,
.pillar-card {
  border-radius: 30px;
  border: 1px solid rgba(255, 255, 255, 0.68);
  background: rgba(248, 252, 252, 0.84);
  box-shadow: var(--shadow-panel);
}

.signal-card {
  padding: 30px;
}

.signal-card h2 {
  margin: 18px 0 12px;
  font-size: 32px;
  line-height: 1.15;
}

.signal-card p,
.signal-card li {
  margin: 0;
  color: var(--ink-muted);
  font-size: 17px;
  line-height: 1.75;
}

.signal-card ul {
  margin: 0;
  padding-left: 20px;
}

.signal-card--accent {
  background:
    linear-gradient(145deg, rgba(221, 239, 248, 0.88), rgba(246, 252, 252, 0.94)),
    rgba(255, 255, 255, 0.82);
}

.signal-label {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--secondary);
}

.pillar-list {
  margin-top: 28px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.pillar-card {
  padding: 20px;
  background: rgba(252, 255, 255, 0.8);
}

.pillar-card strong {
  display: inline-flex;
  margin-bottom: 10px;
  color: var(--ink-strong);
  font-size: 17px;
}

.pillar-card p {
  margin: 0;
  color: var(--ink-muted);
  font-size: 15px;
  line-height: 1.7;
}

.portal-section {
  padding: 36px 38px;
  grid-template-columns: minmax(0, 1.3fr) minmax(340px, 0.9fr);
  gap: 12px;
  border-radius: 40px;
  border: 1px solid rgba(18, 53, 59, 0.08);
  background: linear-gradient(145deg, rgba(247, 251, 251, 0.78), rgba(255, 255, 255, 0.54));
  box-shadow: 0 24px 50px rgba(20, 63, 67, 0.08);
}

.portal-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.portal-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.portal-copy p {
  max-width: 66ch;
}

.portal-copy .status-pill {
  margin-top: 22px;
  align-self: flex-start;
}

.portal-entry-btn {
  min-width: 92px;
  flex-shrink: 0;
}

.feature-card {
  padding: 28px;
}

.feature-card h3 {
  margin: 0 0 16px;
  font-size: 24px;
  color: var(--ink-strong);
}

.feature-card ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

.feature-card li {
  color: var(--ink-muted);
  font-size: 17px;
  line-height: 1.7;
}

.metric-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.metric-cloud span {
  min-height: 42px;
  padding: 10px 16px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(15, 122, 119, 0.08);
  color: var(--brand-strong);
  font-size: 15px;
  font-weight: 700;
}

.portal-section.is-family {
  background: linear-gradient(145deg, rgba(248, 244, 238, 0.84), rgba(255, 255, 255, 0.58));
}

.portal-section.is-doctor {
  background: linear-gradient(145deg, rgba(227, 238, 247, 0.82), rgba(255, 255, 255, 0.58));
}

@media (max-width: 1080px) {
  .section-rail {
    display: none;
  }

  .home-section {
    grid-template-columns: 1fr;
  }

  .portal-section {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .hero-copy h1,
  .portal-copy h2 {
    max-width: none;
  }
}

@media (max-width: 760px) {
  .home-page {
    padding: 18px 0 70px;
  }

  .home-section {
    min-height: auto;
    gap: 20px;
    padding: 14px 0 28px;
  }

  .hero-copy h1 {
    font-size: clamp(38px, 13vw, 54px);
  }

  .portal-copy h2 {
    font-size: clamp(30px, 10vw, 42px);
  }

  .hero-description,
  .portal-copy p {
    font-size: 17px;
  }

  .portal-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .pillar-list,
  .portal-grid {
    grid-template-columns: 1fr;
  }

  .signal-card,
  .feature-card {
    border-radius: 24px;
  }

  .portal-section {
    padding: 24px;
    border-radius: 28px;
  }

  .signal-card,
  .feature-card {
    padding: 22px;
  }
}
</style>

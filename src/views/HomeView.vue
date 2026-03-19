<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

interface RolePanel {
  id: string
  eyebrow: string
  title: string
  description: string
  features: string[]
  actionPath: string
  actionLabel: string
}

const route = useRoute()
const landingPageRef = ref<HTMLElement | null>(null)

const rolePanels: RolePanel[] = [
  {
    id: 'elderly',
    eyebrow: '长者端',
    title: '用对话和语音，轻负担采集老年人健康画像',
    description:
      '大字号界面承接老人使用场景，通过自然对话采集基础健康、功能状态与生活习惯信息，并在可用时展示最新健康评估结果。',
    features: ['超大字号聊天区', '语音输入优先', '报告与画像同步查看'],
    actionPath: '/access/elderly',
    actionLabel: '进入长者端'
  },
  {
    id: 'family',
    eyebrow: '家属端',
    title: '把家属和老人关联起来，补全画像并持续查看照护重点',
    description:
      '家属登录后按关联老人查看健康档案，补充缺失字段，并在后端可返回数据时同步查看历史报告或当前健康总结。',
    features: ['登录后查看关联老人', '补全健康信息', '与老人共读评估结论'],
    actionPath: '/access/family',
    actionLabel: '进入家属端'
  },
  {
    id: 'doctor',
    eyebrow: '医生端',
    title: '集中查看系统内老人画像与已有报告，支持快速专业研判',
    description:
      '医生端将系统中的老人记录收拢到统一总览，查看结构化画像、对话摘要与最新报告，便于形成专业判断。',
    features: ['全量记录总览', '结构化患者画像', '报告空态清晰降级'],
    actionPath: '/access/doctor',
    actionLabel: '进入医生端'
  }
]

const overviewCards = [
  {
    title: '对话采集',
    text: '以大模型对话为主线，逐步采集基本信息、生活能力与健康因素。'
  },
  {
    title: '多方协同',
    text: '长者端采集，家属端补全，医生端查看，全流程围绕同一份健康画像展开。'
  },
  {
    title: '医疗冷静感',
    text: '整体视觉采用淡蓝色冷色调与留白布局，突出可信、清晰、低压力。'
  }
]

async function scrollToHash(hash: string) {
  if (!hash) {
    landingPageRef.value?.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
    return
  }

  await nextTick()
  const target = document.querySelector(hash)
  if (target instanceof HTMLElement) {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }
}

watch(
  () => route.hash,
  async (hash) => {
    await scrollToHash(hash)
  }
)

onMounted(async () => {
  await scrollToHash(route.hash)
})
</script>

<template>
  <div ref="landingPageRef" class="landing-page">
    <section id="overview" class="landing-section landing-section--overview">
      <div class="landing-section__content">
        <div class="landing-hero">
          <p class="eyebrow">AI Elderly Care</p>
          <h1>面向老年人的大模型健康对话系统</h1>
          <p class="hero-text">
            平台以长者端采集为起点，联动家属端和医生端查看同一份健康画像，逐步形成适合长期健康管理的评估闭环。
          </p>
          <div class="hero-actions">
            <RouterLink class="primary-button" to="/access/elderly">开始长者评估</RouterLink>
            <RouterLink class="secondary-button" to="/access/family">家属登录</RouterLink>
          </div>
        </div>

        <div class="overview-grid">
          <article v-for="item in overviewCards" :key="item.title" class="surface-card info-card">
            <strong>{{ item.title }}</strong>
            <p>{{ item.text }}</p>
          </article>
        </div>
      </div>
    </section>

    <section
      v-for="panel in rolePanels"
      :id="panel.id"
      :key="panel.id"
      class="landing-section"
      :class="`landing-section--${panel.id}`"
    >
      <div class="landing-section__content">
        <div class="role-copy">
          <p class="eyebrow">{{ panel.eyebrow }}</p>
          <h2>{{ panel.title }}</h2>
          <p class="role-copy__text">{{ panel.description }}</p>
          <RouterLink class="primary-button" :to="panel.actionPath">{{ panel.actionLabel }}</RouterLink>
        </div>

        <div class="role-feature-panel surface-card">
          <p class="role-feature-panel__title">本端重点</p>
          <ul>
            <li v-for="feature in panel.features" :key="feature">{{ feature }}</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-page {
  height: calc(100vh - 108px);
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  border-radius: 32px;
}

.landing-section {
  min-height: calc(100vh - 108px);
  scroll-snap-align: start;
  display: flex;
  align-items: center;
  padding: 28px 0;
}

.landing-section__content {
  width: min(1180px, calc(100vw - 40px));
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.3fr 0.9fr;
  gap: 24px;
  align-items: stretch;
}

.landing-section--overview {
  background:
    radial-gradient(circle at 100% 0%, rgba(134, 195, 255, 0.22), transparent 40%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(232, 243, 255, 0.9));
}

.landing-section--elderly {
  background:
    radial-gradient(circle at 0% 100%, rgba(176, 235, 221, 0.28), transparent 45%),
    linear-gradient(135deg, rgba(240, 249, 248, 0.95), rgba(231, 244, 255, 0.92));
}

.landing-section--family {
  background:
    radial-gradient(circle at 100% 100%, rgba(214, 232, 255, 0.24), transparent 46%),
    linear-gradient(135deg, rgba(246, 250, 255, 0.95), rgba(240, 246, 252, 0.92));
}

.landing-section--doctor {
  background:
    radial-gradient(circle at 100% 0%, rgba(190, 215, 255, 0.25), transparent 42%),
    linear-gradient(135deg, rgba(245, 249, 255, 0.95), rgba(229, 240, 250, 0.92));
}

.landing-hero,
.role-copy,
.role-feature-panel {
  padding: 40px;
  border-radius: 32px;
}

.landing-hero {
  background: rgba(248, 252, 255, 0.82);
  border: 1px solid rgba(122, 164, 199, 0.18);
  box-shadow: var(--shadow-soft);
}

.landing-hero h1,
.role-copy h2 {
  margin: 14px 0 16px;
  line-height: 1.08;
  color: var(--ink-strong);
}

.landing-hero h1 {
  font-size: clamp(3rem, 4vw, 4.8rem);
}

.role-copy h2 {
  font-size: clamp(2.4rem, 3.4vw, 4rem);
}

.hero-text,
.role-copy__text,
.role-feature-panel li,
.info-card p {
  font-size: 1.125rem;
  line-height: 1.8;
  color: var(--ink-muted);
}

.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 28px;
  flex-wrap: wrap;
}

.overview-grid {
  display: grid;
  gap: 16px;
}

.info-card {
  padding: 28px;
}

.info-card strong,
.role-feature-panel__title {
  display: block;
  font-size: 1.3rem;
  color: var(--ink-strong);
  margin-bottom: 12px;
}

.role-feature-panel {
  align-self: center;
}

.role-feature-panel ul {
  margin: 0;
  padding-left: 18px;
}

@media (max-width: 900px) {
  .landing-page,
  .landing-section {
    height: auto;
    min-height: unset;
  }

  .landing-page {
    overflow-y: visible;
    scroll-snap-type: none;
  }

  .landing-section__content {
    grid-template-columns: 1fr;
  }

  .landing-hero,
  .role-copy,
  .role-feature-panel {
    padding: 28px;
  }
}
</style>

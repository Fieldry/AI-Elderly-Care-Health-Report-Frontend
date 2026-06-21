<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import homeDoctorReview from '@/assets/lanhu/home-doctor-review.png'
import homeElderlyCouple from '@/assets/lanhu/home-elderly-couple.png'
import homeElderlyDialogue from '@/assets/lanhu/home-elderly-dialogue.png'
import homeFamilyCare from '@/assets/lanhu/home-family-care.png'
import iconCollaboration from '@/assets/lanhu/icon-collaboration.png'
import iconDialogue from '@/assets/lanhu/icon-dialogue.png'
import iconFamilyAccount from '@/assets/lanhu/icon-family-account.png'
import iconLargeText from '@/assets/lanhu/icon-large-text.png'
import iconLinkedElderly from '@/assets/lanhu/icon-linked-elderly.png'
import iconMedical from '@/assets/lanhu/icon-medical.png'
import iconProfileEdit from '@/assets/lanhu/icon-profile-edit.png'
import iconRecordOverview from '@/assets/lanhu/icon-record-overview.png'
import iconReportStatus from '@/assets/lanhu/icon-report-status.png'
import iconReportSync from '@/assets/lanhu/icon-report-sync.png'
import iconStructuredProfile from '@/assets/lanhu/icon-structured-profile.png'
import iconVoice from '@/assets/lanhu/icon-voice.png'

interface FeatureItem {
  title: string
  icon: string
}

interface RolePanel {
  id: string
  eyebrow: string
  titleSegments: Array<{
    text: string
    highlight?: boolean
  }>
  description: string
  features: FeatureItem[]
  illustration: string
  actionPath: string
  actionLabel: string
}

const route = useRoute()
const landingPageRef = ref<HTMLElement | null>(null)

const rolePanels: RolePanel[] = [
  {
    id: 'elderly',
    eyebrow: '长者端',
    titleSegments: [
      { text: '用' },
      { text: '对话和语音', highlight: true },
      { text: '，轻负担采集老年人健康画像' }
    ],
    description:
      '大字号界面承接老人使用场景，通过自然对话采集基础健康、功能状态与生活习惯信息，并在用时展示最新健康评估结果。',
    features: [
      { title: '超大字号聊天区', icon: iconLargeText },
      { title: '语音输入优先', icon: iconVoice },
      { title: '报告与画像同步查看', icon: iconReportSync }
    ],
    illustration: homeElderlyDialogue,
    actionPath: '/access/elderly',
    actionLabel: '进入长者端'
  },
  {
    id: 'family',
    eyebrow: '家属端',
    titleSegments: [
      { text: '把' },
      { text: '家属和老人关联起来', highlight: true },
      { text: '，\n补全画像并持续查看照护重点' }
    ],
    description:
      '家属登录后按关联老人查看健康档案，补充缺失字段，并在后端可返回数据时同步查看历史报告或当前健康总结。',
    features: [
      { title: '登录后查看关联老人', icon: iconLinkedElderly },
      { title: '补全健康信息', icon: iconProfileEdit },
      { title: '与老人共读评估结论', icon: iconFamilyAccount }
    ],
    illustration: homeFamilyCare,
    actionPath: '/access/family',
    actionLabel: '进入家属端'
  },
  {
    id: 'doctor',
    eyebrow: '医生端',
    titleSegments: [
      { text: '集中查看系统内老人画像与已有报告\n支持' },
      { text: '快速专业研判', highlight: true }
    ],
    description:
      '医生端将系统中的老人记录收拢到统一总览，查看结构化画像、对话摘要和最新报告，便于形成专业判断。',
    features: [
      { title: '全量记录总览', icon: iconRecordOverview },
      { title: '结构化患者画像', icon: iconStructuredProfile },
      { title: '报告空态清晰降级', icon: iconReportStatus }
    ],
    illustration: homeDoctorReview,
    actionPath: '/access/doctor',
    actionLabel: '进入医生端'
  }
]

const overviewCards = [
  {
    title: '对话采集',
    text: '以大模型对话为主线，逐步采集基本信息、生活能力与健康因素。',
    icon: iconDialogue
  },
  {
    title: '多方协同',
    text: '长者端采集，家属端补全，医生端查看，全流程围绕同一份健康画像展开。',
    icon: iconCollaboration
  },
  {
    title: '医疗冷静感',
    text: '整体视觉采用淡蓝色冷色调与留白布局，突出可信、清晰、低压力。',
    icon: iconMedical
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
      <div class="landing-section__content landing-section__content--overview">
        <div class="landing-hero">
          <p class="landing-kicker">AI ELDERLY CARE</p>
          <h1>面向老年人的大模型<span>健康对话系统</span></h1>
          <p class="hero-text">
            平台以长者端采集为起点，联动家属端和医生端查看同一份健康画像，逐步形成适合长期健康管理的评估闭环。
          </p>
          <div class="hero-actions">
            <RouterLink class="primary-button hero-button" to="/access/elderly">开始长者评估</RouterLink>
            <RouterLink class="secondary-button hero-button" to="/access/family">家属登录</RouterLink>
          </div>

          <div class="overview-list">
            <article v-for="item in overviewCards" :key="item.title" class="overview-item">
              <img class="overview-item__icon" :src="item.icon" alt="" />
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.text }}</p>
              </div>
            </article>
          </div>
        </div>

        <div class="hero-visual hero-visual--overview" aria-hidden="true">
          <img class="hero-visual__image" :src="homeElderlyCouple" alt="" />
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
      <div class="landing-section__content" :class="`landing-section__content--${panel.id}`">
        <div class="role-visual" :class="`role-visual--${panel.id}`" aria-hidden="true">
          <img class="role-visual__image" :src="panel.illustration" alt="" />
        </div>

        <div class="role-copy">
          <p class="role-kicker">{{ panel.eyebrow }}</p>
          <h2>
            <span
              v-for="segment in panel.titleSegments"
              :key="segment.text"
              :class="{ 'is-highlighted': segment.highlight }"
            >
              {{ segment.text }}
            </span>
          </h2>
          <p class="role-copy__text">{{ panel.description }}</p>
          <RouterLink class="primary-button role-button" :to="panel.actionPath">{{ panel.actionLabel }}</RouterLink>

          <div class="role-feature-panel" :class="`role-feature-panel--${panel.id}`">
            <p class="role-feature-panel__title">本端重点</p>
            <div class="role-feature-panel__grid">
              <article v-for="feature in panel.features" :key="feature.title" class="role-feature">
                <img :src="feature.icon" alt="" />
                <strong>{{ feature.title }}</strong>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-page {
  min-height: calc(100vh - 104px);
  overflow-y: auto;
  scroll-snap-type: y mandatory;
}

.landing-section {
  min-height: calc(100vh - 104px);
  scroll-snap-align: start;
  display: flex;
  align-items: center;
  padding: 48px 0;
  background:
    radial-gradient(circle at 12% 10%, rgba(199, 241, 240, 0.6), transparent 32%),
    radial-gradient(circle at 88% 6%, rgba(221, 236, 255, 0.78), transparent 36%),
    linear-gradient(135deg, #eefafd 0%, #f6fbff 52%, #eaf4ff 100%);
}

.landing-section__content {
  width: min(1320px, calc(100vw - 72px));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 0.92fr);
  gap: 52px;
  align-items: center;
}

.landing-section__content--overview {
  position: relative;
  display: block;
  min-height: 850px;
}

.landing-section__content--elderly,
.landing-section__content--family,
.landing-section__content--doctor {
  position: relative;
  display: block;
  min-height: 850px;
}

.landing-hero {
  position: relative;
  z-index: 1;
  padding-left: 24px;
}

.landing-kicker,
.role-kicker {
  margin: 0 0 24px;
  color: #0876d6;
  font-weight: 900;
}

.landing-kicker {
  font-size: 1.24rem;
  letter-spacing: 0.08em;
}

.role-kicker {
  font-size: 1.28rem;
}

.landing-hero h1,
.role-copy h2 {
  margin: 0;
  color: #05080c;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.18;
}

.landing-hero h1 {
  max-width: 1040px;
  font-size: 3.5rem;
  white-space: nowrap;
}

.landing-hero h1 span,
.role-copy h2 {
  white-space: pre-line;
}

.landing-hero h1 span,
.role-copy h2 .is-highlighted {
  color: #0678d8;
}

.role-copy h2 {
  max-width: 860px;
  font-size: 3rem;
}

.landing-section--elderly .role-copy h2::first-line,
.landing-section--family .role-copy h2::first-line,
.landing-section--doctor .role-copy h2::first-line {
  color: #05080c;
}

.hero-text,
.role-copy__text {
  max-width: 760px;
  margin: 30px 0 0;
  color: #7b858d;
  font-size: 1.2rem;
  line-height: 1.72;
}

.hero-actions {
  margin-top: 34px;
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
}

.hero-button,
.role-button {
  min-width: 178px;
  min-height: 58px;
  font-size: 1.08rem;
  font-weight: 800;
}

.overview-list {
  max-width: 720px;
  margin-top: 72px;
  display: grid;
  gap: 28px;
}

.overview-item {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 20px;
  align-items: center;
}

.overview-item__icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

.overview-item strong,
.role-feature strong {
  color: #0876d6;
  font-size: 1.2rem;
  font-weight: 900;
}

.overview-item p {
  margin: 8px 0 0;
  color: #858d94;
  line-height: 1.75;
  font-size: 1.05rem;
}

.hero-visual,
.role-visual {
  min-height: 520px;
  display: grid;
  place-items: center;
}

.hero-visual--overview {
  position: absolute;
  z-index: 0;
  top: 190px;
  right: -28px;
  width: min(590px, 46%);
  min-height: 0;
}

.role-visual {
  position: absolute;
  z-index: 0;
  min-height: 0;
}

.role-visual--elderly {
  top: 230px;
  left: -34px;
  width: min(620px, 48%);
}

.role-visual--family {
  top: 165px;
  right: -20px;
  width: min(610px, 47%);
}

.role-visual--doctor {
  top: 225px;
  left: -24px;
  width: min(610px, 47%);
}

.hero-visual__image,
.role-visual__image {
  width: min(620px, 100%);
  max-height: 610px;
  object-fit: contain;
  filter: drop-shadow(0 28px 38px rgba(58, 132, 205, 0.13));
}

.role-copy {
  position: relative;
  z-index: 1;
  text-align: center;
}

.landing-section--elderly .role-copy {
  width: calc(100% - 100px);
  margin-left: auto;
  padding-top: 28px;
  text-align: right;
}

.landing-section--elderly .role-copy h2 {
  max-width: none;
  white-space: nowrap;
}

.landing-section--family .role-copy {
  width: min(780px, 61%);
  padding-top: 22px;
  text-align: left;
}

.landing-section--doctor .role-copy {
  width: min(960px, 73%);
  margin-left: auto;
  padding-top: 24px;
  text-align: right;
}

.landing-section--doctor .role-copy h2 {
  max-width: none;
}

.landing-section--elderly .role-copy__text,
.landing-section--doctor .role-copy__text {
  margin-right: 0;
  margin-left: auto;
}

.role-button {
  margin-top: 34px;
}

.role-feature-panel {
  margin: 72px auto 0;
  width: min(520px, 100%);
  padding: 28px 32px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 34px rgba(49, 117, 190, 0.14);
}

.role-feature-panel--family {
  margin-left: 0;
  width: 430px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.role-feature-panel--elderly {
  width: 720px;
  margin-right: 0;
  margin-left: auto;
}

.role-feature-panel--doctor {
  width: 620px;
  margin-right: 0;
  margin-left: auto;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.role-feature-panel__title {
  margin: 0 0 22px;
  text-align: center;
  color: #05080c;
  font-size: 1.15rem;
  font-weight: 900;
}

.role-feature-panel__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.landing-section--family .role-feature-panel__grid {
  grid-template-columns: 1fr;
}

.landing-section--family .role-feature-panel__title {
  text-align: left;
}

.landing-section--doctor .role-feature-panel__title {
  text-align: right;
}

.role-feature {
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
}

.landing-section--family .role-feature {
  grid-template-columns: 64px minmax(0, 1fr);
  justify-items: start;
  align-items: center;
  padding: 12px 18px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 24px rgba(49, 117, 190, 0.1);
}

.landing-section--doctor .role-feature {
  min-height: 170px;
  padding: 24px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 14px 28px rgba(49, 117, 190, 0.12);
}

.role-feature img {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

.role-feature-panel--elderly .role-feature strong {
  white-space: nowrap;
}

@media (max-width: 980px) {
  .landing-page {
    overflow-y: visible;
    scroll-snap-type: none;
  }

  .landing-section {
    min-height: unset;
    scroll-snap-align: none;
    padding: 44px 0;
  }

  .landing-section__content,
  .landing-section__content--overview,
  .landing-section__content--elderly,
  .landing-section__content--family,
  .landing-section__content--doctor {
    width: min(100%, calc(100vw - 32px));
    grid-template-columns: 1fr;
  }

  .landing-section__content--overview {
    display: grid;
    min-height: 0;
  }

  .landing-section__content--elderly,
  .landing-section__content--family,
  .landing-section__content--doctor {
    display: grid;
    min-height: 0;
  }

  .hero-visual--overview {
    position: static;
    width: 100%;
  }

  .role-visual,
  .role-visual--elderly,
  .role-visual--family,
  .role-visual--doctor {
    position: static;
    width: 100%;
  }

  .landing-hero,
  .role-copy,
  .landing-section--family .role-copy {
    padding-left: 0;
    text-align: left;
  }

  .landing-section--elderly .role-copy,
  .landing-section--family .role-copy,
  .landing-section--doctor .role-copy {
    width: 100%;
    margin-left: 0;
    padding-top: 0;
    text-align: left;
  }

  .landing-section--elderly .role-copy h2 {
    white-space: pre-line;
  }

  .hero-visual,
  .role-visual {
    min-height: 320px;
  }

  .role-feature-panel,
  .role-feature-panel--family {
    width: 100%;
    margin-left: 0;
    margin-top: 36px;
  }

  .role-feature-panel--elderly,
  .role-feature-panel--doctor {
    width: 100%;
    margin-right: 0;
    margin-left: 0;
  }

  .role-feature-panel--elderly .role-feature strong {
    white-space: normal;
  }

  .landing-section--family .role-feature-panel__title,
  .landing-section--doctor .role-feature-panel__title {
    text-align: left;
  }

  .role-feature-panel__grid {
    grid-template-columns: 1fr;
  }

  .landing-hero h1 {
    font-size: 2.5rem;
    white-space: normal;
  }

  .role-copy h2 {
    font-size: 2.25rem;
  }
}

@media (max-width: 560px) {
  .landing-hero h1 {
    font-size: 2.15rem;
  }

  .role-copy h2 {
    font-size: 2rem;
  }
}
</style>

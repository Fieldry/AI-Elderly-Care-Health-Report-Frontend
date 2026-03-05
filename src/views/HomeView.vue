<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goAssessment() {
  router.push('/assessment')
}
</script>

<template>
  <main class="home-page">
    <section class="hero-card">
      <p class="eyebrow">AI Elderly Care</p>
      <h1>长者健康评估与报告生成平台</h1>
      <p class="intro">
        通过多轮对话收集老人健康信息，系统自动评估失能状态、风险因素，并生成结构化健康报告。
      </p>
      <ul class="feature-list">
        <li>对话式信息采集，支持多轮追问</li>
        <li>实时展示信息收集进度</li>
        <li>进度达标后一键生成报告（流式输出）</li>
      </ul>
      <button class="primary-btn" @click="goAssessment">进入评估</button>
    </section>
  </main>
</template>

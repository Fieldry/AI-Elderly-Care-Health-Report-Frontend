<script setup lang="ts">
import { useRoute } from 'vue-router'

interface ElderlyNavItem {
  label: string
  path: string
  summary: string
}

const route = useRoute()

const items: ElderlyNavItem[] = [
  {
    label: '服务总览',
    path: '/elderly',
    summary: '查看适老化功能入口'
  },
  {
    label: '健康评估',
    path: '/elderly/assessment',
    summary: '已开放'
  },
  {
    label: '情感陪伴',
    path: '/elderly/companion',
    summary: '入口预留'
  }
]

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <section class="elderly-subnav">
    <div class="elderly-subnav__intro">
      <p class="section-eyebrow">老年人入口</p>
      <h2>适老化服务导航</h2>
      <p>界面采用更大的字号与更清晰的交互路径，便于老人快速找到需要的功能。</p>
    </div>

    <div class="elderly-subnav__links">
      <RouterLink
        v-for="item in items"
        :key="item.path"
        class="subnav-chip"
        :class="{ 'is-active': isActive(item.path) }"
        :to="item.path"
      >
        <strong>{{ item.label }}</strong>
        <small>{{ item.summary }}</small>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.elderly-subnav {
  display: grid;
  grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
  gap: 20px;
  padding: 24px 28px;
  border-radius: 28px;
  border: 1px solid rgba(12, 112, 109, 0.16);
  background: linear-gradient(135deg, rgba(228, 247, 242, 0.92), rgba(248, 252, 251, 0.94));
  box-shadow: var(--shadow-soft);
}

.elderly-subnav__intro h2 {
  margin: 8px 0 10px;
  font-size: 26px;
}

.elderly-subnav__intro p:last-child {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.7;
  font-size: 17px;
}

.elderly-subnav__links {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.subnav-chip {
  min-height: 110px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.subnav-chip strong {
  font-size: 20px;
}

.subnav-chip small {
  color: var(--ink-muted);
  font-size: 15px;
}

.subnav-chip:hover {
  transform: translateY(-2px);
  border-color: rgba(12, 112, 109, 0.22);
}

.subnav-chip.is-active {
  border-color: rgba(12, 112, 109, 0.32);
  background: linear-gradient(135deg, rgba(214, 241, 235, 0.96), rgba(255, 255, 255, 0.94));
  box-shadow: 0 18px 32px rgba(21, 72, 78, 0.08);
}

@media (max-width: 960px) {
  .elderly-subnav {
    grid-template-columns: 1fr;
  }

  .elderly-subnav__links {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .elderly-subnav {
    padding: 20px;
    border-radius: 24px;
  }

  .elderly-subnav__intro h2 {
    font-size: 24px;
  }

  .subnav-chip {
    min-height: 96px;
  }
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

interface NavItem {
  label: string
  path: string
  homeHash?: string
}

const router = useRouter()
const route = useRoute()
const isMenuOpen = ref(false)

const navItems: NavItem[] = [
  { label: '首页', path: '/' },
  { label: '老年人', path: '/elderly', homeHash: '#elderly' },
  { label: '家属', path: '/family', homeHash: '#family' },
  { label: '医生', path: '/doctor', homeHash: '#doctor' }
]

const shellClassName = computed(() => {
  if (route.path === '/') {
    return 'app-shell--home'
  }
  if (route.path.startsWith('/elderly')) {
    return 'app-shell--elderly'
  }
  return 'app-shell--portal'
})

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

function isActive(item: NavItem) {
  if (route.path === '/') {
    if (!item.homeHash) {
      return !route.hash
    }
    return route.hash === item.homeHash
  }

  if (item.path === '/elderly') {
    return route.path.startsWith('/elderly')
  }

  return route.path === item.path
}

async function navigate(item: NavItem) {
  isMenuOpen.value = false

  if (route.path === '/' && item.homeHash) {
    if (route.hash === item.homeHash) {
      document.querySelector(item.homeHash)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
      return
    }

    await router.push({ path: '/', hash: item.homeHash })
    return
  }

  if (route.path === item.path) {
    if (item.path === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    return
  }

  await router.push(item.path)
}

watch(
  () => route.fullPath,
  () => {
    isMenuOpen.value = false
  }
)
</script>

<template>
  <div class="app-shell" :class="shellClassName">
    <header class="app-header">
      <div class="app-header__inner">
        <button class="brand-button" type="button" @click="navigate(navItems[0])">
          <span class="brand-mark">AI</span>
          <span class="brand-copy">
            <strong>智养健康平台</strong>
            <small>老人、家属与医生的协同入口</small>
          </span>
        </button>

        <button
          class="menu-toggle"
          type="button"
          :aria-expanded="isMenuOpen"
          aria-label="切换导航菜单"
          @click="toggleMenu"
        >
          <span />
          <span />
          <span />
        </button>

        <nav class="app-nav" :class="{ 'is-open': isMenuOpen }" aria-label="主导航">
          <button
            v-for="item in navItems"
            :key="item.label"
            class="nav-link"
            :class="{ 'is-active': isActive(item) }"
            type="button"
            @click="navigate(item)"
          >
            {{ item.label }}
          </button>
        </nav>

      </div>
    </header>

    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  position: relative;
  overflow: clip;
}

.app-shell::before,
.app-shell::after {
  content: '';
  position: fixed;
  inset: auto;
  pointer-events: none;
  z-index: -1;
  filter: blur(4px);
}

.app-shell::before {
  top: -120px;
  right: -80px;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(20, 120, 137, 0.18), transparent 72%);
}

.app-shell::after {
  left: -80px;
  bottom: 140px;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(59, 145, 123, 0.18), transparent 70%);
}

.app-header {
  position: fixed;
  top: 14px;
  left: 0;
  right: 0;
  z-index: 30;
  padding: 0 18px;
}

.app-header__inner {
  width: min(1220px, calc(100vw - 24px));
  margin: 0 auto;
  min-height: var(--nav-height);
  padding: 14px 18px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 18px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: rgba(246, 251, 251, 0.78);
  box-shadow: 0 20px 42px rgba(24, 62, 67, 0.14);
  backdrop-filter: blur(18px);
  border-radius: 24px;
}

.brand-button {
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--ink-strong);
}

.brand-mark {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--brand), var(--secondary));
  color: #fff;
  font-weight: 800;
  letter-spacing: 0.08em;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26);
}

.brand-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.brand-copy strong {
  font-size: 18px;
  line-height: 1.1;
}

.brand-copy small {
  color: var(--ink-muted);
  font-size: 12px;
  margin-top: 3px;
}

.app-nav {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.nav-link {
  min-height: 44px;
  padding: 10px 16px;
  border-radius: 999px;
  color: var(--ink);
  font-size: 15px;
  font-weight: 600;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.nav-link:hover {
  background: rgba(15, 122, 119, 0.08);
}

.nav-link.is-active {
  background: rgba(15, 122, 119, 0.14);
  color: var(--brand-strong);
}

.menu-toggle {
  display: none;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.72);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 5px;
}

.menu-toggle span {
  width: 18px;
  height: 2px;
  border-radius: 999px;
  background: var(--ink-strong);
}

.app-content {
  min-height: 100vh;
}

@media (max-width: 920px) {
  .app-header__inner {
    grid-template-columns: auto auto;
    justify-content: space-between;
  }

  .menu-toggle {
    display: inline-flex;
  }

  .app-nav {
    display: none;
  }

  .app-nav.is-open {
    display: flex;
    position: absolute;
    top: calc(100% + 10px);
    left: 0;
    right: 0;
    padding: 14px;
    flex-direction: column;
    align-items: stretch;
    background: rgba(247, 252, 252, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 22px;
    box-shadow: 0 18px 40px rgba(24, 62, 67, 0.16);
    backdrop-filter: blur(16px);
  }

  .nav-link {
    width: 100%;
    text-align: left;
  }
}

@media (max-width: 640px) {
  .app-header {
    top: 10px;
    padding: 0 10px;
  }

  .app-header__inner {
    width: calc(100vw - 20px);
    padding: 12px 14px;
    gap: 12px;
  }

  .brand-mark {
    width: 42px;
    height: 42px;
    border-radius: 14px;
  }

  .brand-copy strong {
    font-size: 16px;
  }

  .brand-copy small {
    font-size: 11px;
  }
}
</style>

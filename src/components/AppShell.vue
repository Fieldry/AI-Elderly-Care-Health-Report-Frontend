<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

import {
  clearStoredFamilyConversationSessions,
  clearStoredSession,
  roleHomePath,
  useAuthSession
} from '@/session'
import { logoutWithToken } from '@/api/auth'
import type { Role } from '@/types'

interface NavItem {
  label: string
  hash?: string
  path?: string
}

const route = useRoute()
const router = useRouter()
const { session } = useAuthSession()

const navItems: NavItem[] = [
  { label: '总览', hash: '#overview' },
  { label: '长者端', hash: '#elderly' },
  { label: '家属端', hash: '#family' },
  { label: '医生端', hash: '#doctor' }
]

const shellClassName = computed(() => {
  if (route.path.startsWith('/elderly')) {
    return 'theme-elderly'
  }
  if (route.path.startsWith('/family')) {
    return 'theme-family'
  }
  if (route.path.startsWith('/doctor')) {
    return 'theme-doctor'
  }
  return 'theme-home'
})

const currentRoleLabel = computed(() => {
  if (!session.value) {
    return ''
  }

  const map: Record<Role, string> = {
    elderly: '长者端',
    family: '家属端',
    doctor: '医生端'
  }

  return map[session.value.role]
})

function isActive(item: NavItem) {
  if (route.path === '/') {
    return item.hash ? route.hash === item.hash : !route.hash
  }

  return false
}

async function navigate(item: NavItem) {
  if (item.hash) {
    if (route.path === '/') {
      if (route.hash !== item.hash) {
        await router.push({
          path: '/',
          hash: item.hash
        })
      }

      await nextTick()
      document.querySelector(item.hash)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
      return
    }

    await router.push({
      path: '/',
      hash: item.hash
    })
    return
  }

  if (item.path) {
    await router.push(item.path)
  }
}

async function handleLogout() {
  const token = session.value?.token
  clearStoredFamilyConversationSessions()
  clearStoredSession()
  await logoutWithToken(token)
  await router.push('/')
}
</script>

<template>
  <div class="app-shell" :class="shellClassName">
    <header class="app-header">
      <div class="app-header__inner">
        <button class="brand-button" type="button" @click="router.push('/')">
          <span class="brand-button__badge">AI</span>
          <span class="brand-button__copy">
            <strong>智养健康评估平台</strong>
            <small>长者采集、家属协同、医生研判</small>
          </span>
        </button>

        <nav class="app-nav" aria-label="主导航">
          <button
            v-for="item in navItems"
            :key="item.label"
            class="app-nav__link"
            :class="{ 'is-active': isActive(item) }"
            type="button"
            @click="navigate(item)"
          >
            {{ item.label }}
          </button>
        </nav>

        <div class="app-actions">
          <div v-if="session" class="session-pill">
            <span>{{ currentRoleLabel }}</span>
            <strong>{{ session.userName }}</strong>
          </div>

          <button
            v-if="session"
            class="app-actions__primary"
            type="button"
            @click="handleLogout"
          >
            退出
          </button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

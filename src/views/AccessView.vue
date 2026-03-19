<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { loginWithPassword } from '@/api/auth'
import { roleHomePath, setStoredSession } from '@/session'
import type { Role } from '@/types'

const props = defineProps<{
  role: Role
}>()

const router = useRouter()

const roleContent = computed(() => {
  if (props.role === 'elderly') {
    return {
      title: '老人端入口',
      description: '通过大字号对话界面与语音输入采集健康信息，并查看当前可用的画像和评估结果。',
      bullets: ['适老化大字号阅读', '支持语音输入', '对话过程低干扰']
    }
  }

  if (props.role === 'family') {
    return {
      title: '家属端登录',
      description: '登录后查看已关联老人的信息画像，补全缺失数据，并同步查看健康报告返回情况。',
      bullets: ['关联老人列表', '画像字段编辑', '真实报告空态降级']
    }
  }

  return {
    title: '医生端登录',
    description: '登录后查看系统中的老人记录、画像摘要与已有报告，适合进行结构化浏览与专业研判。',
    bullets: ['全量记录查看', '结构化详情', '报告状态一目了然']
  }
})

const form = reactive({
  phone: '',
  password: ''
})

const isSubmitting = ref(false)
const errorMessage = ref('')

const requiresLogin = computed(() => props.role !== 'elderly')

async function handleContinue() {
  if (!requiresLogin.value) {
    await router.push(roleHomePath('elderly'))
    return
  }

  if (!form.phone.trim() || !form.password.trim()) {
    errorMessage.value = '请输入手机号和密码。'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const response = await loginWithPassword(form.phone.trim(), form.password.trim())
    setStoredSession({
      token: response.token,
      userName: response.user_name || (props.role === 'family' ? '家属用户' : '医生用户'),
      role: props.role,
      backendRole: response.role
    })
    await router.push(roleHomePath(props.role))
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '登录失败，请检查网络连接后重试。'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="page-width access-page">
    <section class="access-card access-card--copy">
      <p class="eyebrow">{{ roleContent.title }}</p>
      <h1>{{ roleContent.title }}</h1>
      <p class="access-card__description">{{ roleContent.description }}</p>
      <ul class="access-card__bullets">
        <li v-for="bullet in roleContent.bullets" :key="bullet">{{ bullet }}</li>
      </ul>
      <p class="access-card__note">
        当前后端登录为演示模式，前端按所选角色入口组织页面与路由，不承诺真实权限隔离。
      </p>
    </section>

    <section class="access-card access-card--form">
      <template v-if="requiresLogin">
        <h2>进入{{ role === 'family' ? '家属端' : '医生端' }}</h2>
        <label class="field">
          <span>手机号</span>
          <input v-model="form.phone" type="tel" placeholder="请输入手机号" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="请输入密码" />
        </label>
      </template>

      <template v-else>
        <h2>开始健康评估</h2>
        <p class="access-card__description">
          老人端无需登录即可直接开始当前评估会话，适合现场陪同或自主使用。
        </p>
      </template>

      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>

      <button class="primary-button access-submit" :disabled="isSubmitting" type="button" @click="handleContinue">
        {{ isSubmitting ? '提交中...' : requiresLogin ? '登录并进入' : '立即进入' }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.access-page {
  min-height: calc(100vh - 140px);
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 24px;
  align-items: center;
}

.access-card {
  padding: 38px;
  border-radius: 32px;
  border: 1px solid rgba(122, 164, 199, 0.18);
  background: rgba(248, 252, 255, 0.82);
  box-shadow: var(--shadow-soft);
}

.access-card h1,
.access-card h2 {
  margin: 14px 0;
  color: var(--ink-strong);
}

.access-card h1 {
  font-size: clamp(2.6rem, 4vw, 4rem);
}

.access-card h2 {
  font-size: 1.75rem;
}

.access-card__description,
.access-card__note,
.field span,
.field input,
.access-card__bullets li {
  font-size: 1rem;
  line-height: 1.8;
}

.access-card__description,
.access-card__note,
.access-card__bullets li {
  color: var(--ink-muted);
}

.access-card__bullets {
  padding-left: 18px;
}

.field {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.field input {
  width: 100%;
  min-height: 54px;
  border-radius: 18px;
  border: 1px solid var(--line);
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.96);
}

.form-error {
  margin: 8px 0 0;
  color: #b65151;
}

.access-submit {
  width: 100%;
  margin-top: 22px;
}

@media (max-width: 900px) {
  .access-page {
    grid-template-columns: 1fr;
    padding-top: 10px;
    padding-bottom: 30px;
  }

  .access-card {
    padding: 28px;
  }
}
</style>

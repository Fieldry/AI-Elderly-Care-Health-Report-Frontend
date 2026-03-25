<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { loginWithPassword, registerFamilyAccount } from '@/api/auth'
import { getHealthStatus } from '@/api/health'
import { roleHomePath, setStoredSession } from '@/session'
import type { AuthResponse, Role } from '@/types'

const props = defineProps<{
  role: Role
}>()

type FamilyEntryMode = 'login' | 'register'

const router = useRouter()

const roleContent = computed(() => {
  if (props.role === 'elderly') {
    return {
      title: '长者端入口',
      description: '通过大字号对话界面与语音输入采集健康信息，并查看当前可用的画像和评估结果。',
      bullets: ['适老化大字号阅读', '支持语音输入', '对话过程低干扰']
    }
  }

  if (props.role === 'family') {
    return {
      title: '家属端入口',
      description: '登录后查看已关联老人的信息画像，补全缺失数据，并同步查看健康报告返回情况。',
      bullets: ['关联老人列表', '画像字段编辑', '可直接绑定或注册家属账号']
    }
  }

  return {
    title: '医生端登录',
    description: '登录后查看系统中的老人记录、画像摘要与已有报告，适合进行结构化浏览与专业研判。',
    bullets: ['全量记录查看', '结构化详情', '报告状态一目了然']
  }
})

const familyMode = ref<FamilyEntryMode>('login')
const form = reactive({
  phone: '',
  password: '',
  name: '',
  elderlyId: '',
  relation: '子女'
})

const healthStatusText = ref('正在检查后端服务...')
const isSubmitting = ref(false)
const errorMessage = ref('')

const requiresLogin = computed(() => props.role !== 'elderly')
const isFamilyRegisterMode = computed(() => props.role === 'family' && familyMode.value === 'register')
const submitButtonLabel = computed(() => {
  if (isSubmitting.value) {
    return '提交中...'
  }

  if (!requiresLogin.value) {
    return '立即进入'
  }

  if (isFamilyRegisterMode.value) {
    return '注册并进入'
  }

  return '登录并进入'
})

function storeSessionFromResponse(response: AuthResponse) {
  if (props.role === 'family') {
    setStoredSession({
      token: response.token,
      userName: response.user_name || '家属用户',
      role: 'family',
      backendRole: response.role,
      expiresAt: response.expires_at,
      familyId: response.family_id,
      elderlyIds: response.elderly_ids || []
    })
    return
  }

  setStoredSession({
    token: response.token,
    userName: response.user_name || '医生用户',
    role: 'doctor',
    backendRole: response.role,
    expiresAt: response.expires_at
  })
}

function resetError() {
  errorMessage.value = ''
}

function validateForm() {
  if (!form.phone.trim() || !form.password.trim()) {
    errorMessage.value = '请输入手机号和密码。'
    return false
  }

  if (!isFamilyRegisterMode.value) {
    return true
  }

  if (!form.name.trim()) {
    errorMessage.value = '请输入家属姓名。'
    return false
  }

  if (!form.elderlyId.trim()) {
    errorMessage.value = '请输入要绑定的老人 ID。'
    return false
  }

  if (!form.relation.trim()) {
    errorMessage.value = '请输入与老人的关系。'
    return false
  }

  return true
}

async function handleContinue() {
  if (!requiresLogin.value) {
    await router.push(roleHomePath('elderly'))
    return
  }

  if (!validateForm()) {
    return
  }

  isSubmitting.value = true
  resetError()

  try {
    const response = isFamilyRegisterMode.value
      ? await registerFamilyAccount({
          name: form.name.trim(),
          phone: form.phone.trim(),
          password: form.password.trim(),
          elderlyId: form.elderlyId.trim(),
          relation: form.relation.trim()
        })
      : await loginWithPassword(
          form.phone.trim(),
          form.password.trim(),
          props.role === 'doctor' ? 'doctor' : 'family'
        )

    storeSessionFromResponse(response)
    await router.push(roleHomePath(props.role))
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '登录失败，请检查网络连接后重试。'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  try {
    const response = await getHealthStatus()
    healthStatusText.value = `${response.service} 当前状态：${response.status}`
  } catch {
    healthStatusText.value = '当前无法连接后端服务，请确认 API 已启动。'
  }
})
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
    </section>

    <section class="access-card access-card--form">
      <template v-if="requiresLogin">
        <div class="access-card__header">
          <h2>进入{{ role === 'family' ? '家属端' : '医生端' }}</h2>
          <div v-if="role === 'family'" class="mode-switch">
            <button
              class="mode-switch__button"
              :class="{ 'is-active': familyMode === 'login' }"
              type="button"
              @click="familyMode = 'login'"
            >
              登录
            </button>
            <button
              class="mode-switch__button"
              :class="{ 'is-active': familyMode === 'register' }"
              type="button"
              @click="familyMode = 'register'"
            >
              注册并绑定
            </button>
          </div>
        </div>

        <label v-if="isFamilyRegisterMode" class="field">
          <span>家属姓名</span>
          <input v-model="form.name" type="text" placeholder="请输入家属姓名" @input="resetError" />
        </label>
        <label class="field">
          <span>手机号</span>
          <input v-model="form.phone" type="tel" placeholder="请输入手机号" @input="resetError" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="请输入密码" @input="resetError" />
        </label>
        <label v-if="isFamilyRegisterMode" class="field">
          <span>老人 ID</span>
          <input v-model="form.elderlyId" type="text" placeholder="请输入首位绑定老人的 ID" @input="resetError" />
        </label>
        <label v-if="isFamilyRegisterMode" class="field">
          <span>关系</span>
          <input v-model="form.relation" type="text" placeholder="例如 子女 / 配偶" @input="resetError" />
        </label>
      </template>

      <template v-else>
        <h2>开始长者评估</h2>
        <p class="access-card__description">
          长者端无需登录即可直接开始当前评估会话。
        </p>
      </template>

      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>

      <button class="primary-button access-submit" :disabled="isSubmitting" type="button" @click="handleContinue">
        {{ submitButtonLabel }}
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

.access-card__header {
  display: grid;
  gap: 12px;
  margin-bottom: 6px;
}

.mode-switch {
  display: inline-flex;
  padding: 5px;
  border-radius: 999px;
  background: rgba(90, 142, 209, 0.12);
  width: fit-content;
}

.mode-switch__button {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  color: var(--ink);
}

.mode-switch__button.is-active {
  background: rgba(255, 255, 255, 0.96);
  color: var(--ink-strong);
  box-shadow: 0 10px 20px rgba(59, 111, 174, 0.12);
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

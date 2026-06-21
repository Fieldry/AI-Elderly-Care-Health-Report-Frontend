<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { loginWithPassword, registerFamilyAccount } from '@/api/auth'
import { getHealthStatus } from '@/api/health'
import accessDoctor from '@/assets/lanhu/access-doctor.png'
import accessElderly from '@/assets/lanhu/access-elderly.png'
import accessFamily from '@/assets/lanhu/access-family.png'
import iconDetails from '@/assets/lanhu/icon-details.png'
import iconFamilyAccount from '@/assets/lanhu/icon-family-account.png'
import iconLinkedElderly from '@/assets/lanhu/icon-linked-elderly.png'
import iconProfileEdit from '@/assets/lanhu/icon-profile-edit.png'
import iconRecords from '@/assets/lanhu/icon-records.png'
import iconReportClear from '@/assets/lanhu/icon-report-clear.png'
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
      eyebrow: '长者端',
      title: '长者端入口',
      description: '通过大字号对话界面与语音输入采集健康信息，并查看当前可用的画像和评估结果。',
      bullets: [
        { title: '关联老人列表', icon: iconLinkedElderly },
        { title: '画像字段编辑', icon: iconProfileEdit },
        { title: '可直接绑定或注册家属账号', icon: iconFamilyAccount }
      ],
      visual: accessElderly
    }
  }

  if (props.role === 'family') {
    return {
      eyebrow: '家属端入口',
      title: '家属端入口',
      description: '登录后查看已关联老人的信息画像，补全缺失数据，并同步查看健康报告返回情况。',
      bullets: [
        { title: '关联老人列表', icon: iconLinkedElderly },
        { title: '画像字段编辑', icon: iconProfileEdit },
        { title: '可直接绑定或注册家属账号', icon: iconFamilyAccount }
      ],
      visual: accessFamily
    }
  }

  return {
    eyebrow: '医生端登录',
    title: '医生端登录',
    description: '登录后查看系统中的老人记录、画像摘要与已有报告，适合进行结构化浏览与专业研判。',
    bullets: [
      { title: '全量记录查看', icon: iconRecords },
      { title: '结构化详情', icon: iconDetails },
      { title: '报告状态一目了然', icon: iconReportClear }
    ],
    visual: accessDoctor
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
    errorMessage.value = '请输入要绑定的老人绑定码。'
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
  <div class="access-page" :class="`access-page--${role}`">
    <section class="access-copy">
      <div class="access-copy__heading">
        <div>
          <p class="access-kicker">{{ roleContent.eyebrow }}</p>
          <h1>{{ roleContent.title }}</h1>
        </div>
        <img class="access-person" :src="roleContent.visual" alt="" />
      </div>

      <p class="access-copy__description">{{ roleContent.description }}</p>

      <div class="access-feature-list">
        <article v-for="bullet in roleContent.bullets" :key="bullet.title" class="access-feature">
          <img :src="bullet.icon" alt="" />
          <strong>{{ bullet.title }}</strong>
        </article>
      </div>
    </section>

    <section class="access-panel">
      <template v-if="requiresLogin">
        <div class="access-panel__header">
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
          <span>老人绑定码</span>
          <input v-model="form.elderlyId" type="text" placeholder="请输入首位绑定老人的绑定码" @input="resetError" />
        </label>
        <label v-if="isFamilyRegisterMode" class="field">
          <span>关系</span>
          <input v-model="form.relation" type="text" placeholder="例如 子女 / 配偶" @input="resetError" />
        </label>
      </template>

      <template v-else>
        <h2>开始长者评估</h2>
        <p class="access-panel__description">
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
  width: min(1320px, calc(100vw - 72px));
  min-height: calc(100vh - 112px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(420px, 0.9fr);
  gap: 72px;
  align-items: center;
  padding: 54px 0 72px;
}

.access-copy {
  padding-left: 24px;
}

.access-copy__heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px;
  gap: 20px;
  align-items: end;
}

.access-kicker {
  margin: 0 0 18px;
  color: #0876d6;
  font-size: 1.35rem;
  font-weight: 900;
}

.access-copy h1,
.access-panel h2 {
  margin: 0;
  color: #05080c;
  font-weight: 900;
  letter-spacing: 0;
}

.access-copy h1 {
  font-size: clamp(2.5rem, 3.4vw, 4rem);
  line-height: 1.15;
}

.access-panel h2 {
  text-align: center;
  font-size: clamp(2.1rem, 2.7vw, 3rem);
}

.access-copy__description,
.access-panel__description {
  margin: 34px 0 0;
  color: #7b858d;
  font-size: clamp(1.18rem, 1.45vw, 1.55rem);
  line-height: 1.72;
}

.access-person {
  width: 128px;
  height: 150px;
  object-fit: contain;
  filter: drop-shadow(0 18px 28px rgba(68, 144, 220, 0.13));
}

.access-feature-list {
  margin-top: 58px;
  display: grid;
  gap: 22px;
}

.access-feature {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 22px;
  align-items: center;
}

.access-feature img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}

.access-feature strong {
  color: #0876d6;
  font-size: 1.2rem;
  font-weight: 900;
}

.access-panel {
  min-height: 430px;
  padding: 58px 72px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 20px 46px rgba(60, 129, 202, 0.16);
}

.access-panel__header {
  display: grid;
  gap: 20px;
  justify-items: center;
  margin-bottom: 30px;
}

.mode-switch {
  display: inline-flex;
  gap: 28px;
  justify-content: center;
}

.mode-switch__button {
  position: relative;
  min-height: 42px;
  padding: 0 4px;
  color: #89929a;
  font-weight: 800;
}

.mode-switch__button.is-active {
  color: #0876d6;
}

.mode-switch__button.is-active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 28px;
  height: 5px;
  border-radius: 999px;
  background: #0876d6;
  transform: translateX(-50%);
}

.field {
  display: grid;
  gap: 12px;
  margin-bottom: 22px;
}

.field span {
  color: #4b555e;
  font-size: 1.02rem;
  font-weight: 800;
}

.field input {
  width: 100%;
  min-height: 58px;
  border-radius: 15px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.96);
  color: #05080c;
  font-size: 1.05rem;
}

.field input::placeholder {
  color: #a1a7ad;
}

.form-error {
  margin: 8px 0 0;
  color: #b65151;
}

.access-submit {
  min-width: 184px;
  min-height: 62px;
  margin: 34px auto 0;
  display: flex;
  font-size: 1.1rem;
  font-weight: 900;
}

@media (max-width: 900px) {
  .access-page {
    grid-template-columns: 1fr;
    width: min(100%, calc(100vw - 32px));
    gap: 36px;
    padding: 34px 0 48px;
  }

  .access-copy {
    padding-left: 0;
  }

  .access-panel {
    min-height: unset;
    padding: 36px 24px;
  }

  .access-copy__heading {
    grid-template-columns: 1fr;
  }

  .access-person {
    width: 108px;
    height: 124px;
  }
}
</style>

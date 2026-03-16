<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

const loginForm = ref({
  phone: '',
  password: ''
})

const isLoading = ref(false)
const activeTab = ref('login')

const apiOrigin = import.meta.env.VITE_BACKEND_ORIGIN || ''

async function handleLogin() {
  if (!loginForm.value.phone || !loginForm.value.password) {
    ElMessage.error('请输入手机号和密码')
    return
  }

  isLoading.value = true
  try {
    const response = await fetch(`${apiOrigin}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: loginForm.value.phone,
        password: loginForm.value.password
      })
    })

    const data = await response.json()

    if (!response.ok) {
      ElMessage.error(data.detail || '登录失败')
      return
    }

    // 保存用户信息和 token
    localStorage.setItem('token', data.token)
    localStorage.setItem('user_name', data.user_name)
    localStorage.setItem('user_type', data.role)

    ElMessage.success('登录成功')

    // 根据用户类型跳转
    if (data.role === 'elderly') {
      router.push('/elderly/hub')
    } else if (data.role === 'family') {
      router.push('/family/hub')
    } else {
      router.push('/')
    }
  } catch (error) {
    ElMessage.error('登录失败，请检查网络连接')
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <h1>AI 养老健康助手</h1>
          <p>智能健康评估与照护平台</p>
        </div>

        <div class="login-form">
          <div class="form-group">
            <label>手机号</label>
            <input
              v-model="loginForm.phone"
              type="tel"
              placeholder="请输入手机号"
              @keydown="handleKeydown"
            />
          </div>

          <div class="form-group">
            <label>密码</label>
            <input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              @keydown="handleKeydown"
            />
          </div>

          <button
            class="login-btn"
            :disabled="isLoading"
            @click="handleLogin"
          >
            {{ isLoading ? '登录中...' : '登录' }}
          </button>
        </div>

        <div class="login-footer">
          <p>首次使用？请联系管理员注册账号</p>
        </div>
      </div>

      <div class="login-info">
        <div class="info-card">
          <h3>👴 老年人入口</h3>
          <p>完成健康评估，获取个性化报告</p>
        </div>
        <div class="info-card">
          <h3>👨‍👩‍👧 家属入口</h3>
          <p>补全信息，生成升级版报告</p>
        </div>
        <div class="info-card">
          <h3>👨‍⚕️ 医生入口</h3>
          <p>查看结构化患者信息</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  max-width: 1000px;
  width: 100%;
}

.login-card {
  background: white;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.login-header h1 {
  margin: 0;
  font-size: 28px;
  color: #333;
  font-weight: 800;
}

.login-header p {
  margin: 8px 0 0;
  color: #999;
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.form-group input {
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.login-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  margin-top: 10px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-footer {
  text-align: center;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.login-footer p {
  margin: 0;
  color: #999;
  font-size: 14px;
}

.login-info {
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  gap: 20px;
}

.info-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding: 24px;
  color: white;
}

.info-card h3 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
}

.info-card p {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}

@media (max-width: 768px) {
  .login-container {
    grid-template-columns: 1fr;
  }

  .login-info {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: auto;
  }
}
</style>

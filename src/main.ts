import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Element Plus
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// App
import App from './App.vue'
import router from './router'

// Global styles
import './assets/main.css'

const app = createApp(App)

// Register Pinia
app.use(createPinia())

// Register Router
app.use(router)

// Register Element Plus with Chinese locale
app.use(ElementPlus, {
  locale: zhCn,
})

// Register all Element Plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')

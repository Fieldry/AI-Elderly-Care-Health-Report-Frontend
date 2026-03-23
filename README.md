# 智养健康评估平台 - 前端

基于 Vue 3 + TypeScript + Vite 构建的老年人健康评估管理平台前端应用。

## 环境要求

- **Node.js** >= 18
- **npm** >= 9（项目使用 npm 作为包管理器）

## 快速开始

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 配置环境变量（可选）

复制环境变量模板并根据需要修改：

```bash
cp .env.example .env
```

可配置项：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VITE_BACKEND_ORIGIN` | 后端服务地址（替代 Vite 代理） | — |
| `VITE_STT_WS_URL` | 语音识别 WebSocket 地址 | — |

> 默认情况下无需配置 `.env`，开发服务器会自动将 API 请求代理到 `http://127.0.0.1:8001`。

### 3. 启动开发服务器

```bash
npm run dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

> 请确保后端服务已在 `8001` 端口运行，或通过环境变量 `VITE_DEV_PROXY_TARGET` 指定后端地址。

### 4. 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 5. 预览生产构建

```bash
npm run preview
```

## 项目结构

```
src/
├── api/            # 后端 API 接口封装
├── components/     # 通用组件
├── composables/    # Vue 组合式函数
├── router/         # 路由配置
├── utils/          # 工具函数
├── views/          # 页面视图
├── main.ts         # 入口文件
└── styles.css      # 全局样式
```

## 技术栈

- **Vue 3** — 前端框架
- **TypeScript** — 类型安全
- **Vite** — 构建工具与开发服务器
- **Vue Router** — 路由管理
- **markdown-it** — Markdown 渲染

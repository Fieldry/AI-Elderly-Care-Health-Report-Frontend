# AI Elderly Care Health Report Frontend

## 1. 项目简介

本项目是 **"AI 养老健康 Agent"** 的前端实现。基于 **Vue 3 (Composition API)** 构建，提供一个智能对话交互界面，旨在通过多轮对话或问卷形式收集老年人健康数据（CLHLS 标准），并展示由后端多 Agent 协作生成的结构化健康评估报告。

## 2. 技术栈 (Tech Stack)

*   **核心框架**: Vue 3.x
*   **构建工具**: Vite
*   **状态管理**: Pinia (用于管理用户画像数据 UserProfile、对话历史、最终报告)
*   **路由管理**: Vue Router 4.x
*   **UI 组件库**: Element Plus (推荐) 或 Ant Design Vue (用于快速构建表单和布局)
*   **Markdown 渲染**: `markdown-it` 或 `v-md-editor` (用于渲染最终生成的 Markdown 报告)
*   **HTTP 请求**: Axios
*   **CSS 预处理**: SCSS / Less

## 3. 项目架构与设计

本项目采用 **"对话流 (Chat Flow) + 报告视图 (Report View)"** 的核心模式。

### 3.1 核心流程架构
前端充当 **Orchestrator Agent** 的用户接口层，流程如下：

1.  **数据采集阶段 (Data Collection)**:
    *   用户通过对话框输入信息。
    *   前端维护一个临时的 `UserProfile` 对象（映射 PDF 中的输入变量）。
    *   支持“问卷模式”与“自然对话模式”切换。
2.  **推理展示阶段 (Agent Reasoning)**:
    *   前端展示“正在思考”的状态，可视化后端 Agent 的执行链（StatusAgent -> RiskAgent -> ... -> ReportAgent）。
3.  **报告生成阶段 (Report Rendering)**:
    *   接收后端返回的 Markdown 流或 JSON 数据。
    *   解析并美化展示“健康评估与照护行动计划”。

### 3.2 目录结构 (Directory Structure)

```text
src/
├── assets/                # 静态资源 (Logo, Icons)
├── api/                   # API 接口定义
│   ├── chat.js            # 对话相关接口
│   └── report.js          # 报告生成接口
├── components/            # 公共组件
│   ├── Chat/              # 对话相关组件
│   │   ├── MessageBubble.vue  # 消息气泡 (支持 Markdown)
│   │   ├── InputArea.vue      # 输入框 (支持语音/文本)
│   │   └── AgentStatus.vue    # Agent 状态指示器 (显示当前哪个Agent在工作)
│   ├── Report/            # 报告相关组件
│   │   ├── HealthPortrait.vue # 健康画像卡片
│   │   ├── RiskCard.vue       # 风险因素卡片
│   │   └── ActionPlan.vue     # 行动计划清单
│   └── Common/            # 按钮,加载条等
├── hooks/                 # 组合式函数 (Composables)
│   ├── useAgentStream.js  # 处理流式打字机效果
│   └── useValidator.js    # 校验 BADL/IADL 数据完整性
├── router/                # 路由配置
├── store/                 # Pinia 状态管理
│   ├── userProfile.js     # 核心：存储 PDF 中定义的 UserProfile 结构
│   ├── chatSession.js     # 存储对话历史
│   └── reportResult.js    # 存储生成的报告数据
├── styles/                # 全局样式 (Markdown 样式重写)
├── utils/                 # 工具函数
│   ├── promptBuilder.js   # (可选) 若前端组装 Prompt
│   └── formatTime.js
└── views/
    ├── Home.vue           # 首页/项目介绍
    ├── AssessmentChat.vue # 核心评估对话页面
    └── ReportView.vue     # 最终报告展示页面
```

## 4. 核心数据模型 (Data Models)

前端需在 `store/userProfile.js` 中维护以下状态：

```javascript
// store/userProfile.js
export const useUserProfileStore = defineStore('userProfile', {
  state: () => ({
    demographics: {
      age: null,       // trueage
      gender: null,    // a1
      livingStatus: '' // 独居/同住 (social support)
    },
    functionalStatus: {
      badl: [], // [bathing, dressing, toileting, transfer, continence, feeding]
      iadl: []  // [visiting, shopping, cooking, washing, walking, lifting, crouching, transport]
    },
    healthFactors: {
      chronicDiseases: [], // [hypertension, diabetes, heart_disease...]
      mood: '',            // depression/anxiety
      cognition: ''        // simple assessment result
    },
    lifestyle: {
      exercise: '',
      diet: '',
      sleep: ''
    }
    // ...其他核心变量
  }),
  getters: {
    // 判断是否收集齐了必要信息
    isReadyForAnalysis: (state) => {
      // 逻辑：检查核心字段是否非空
    }
  }
});
```

## 5. 功能模块详解

### 5.1 智能问诊 (AssessmentChat.vue)

*   **动态交互**: 模拟医生问诊，根据 PDF 中的 `BADL` 和 `IADL` 指标进行提问。
*   **状态可视化**: 当用户回答完毕，点击“生成报告”时，界面应展示 Agent 链式调用动画：
    *   `[StatusAgent] 正在判定失能等级...`
    *   `[RiskAgent] 正在预测未来 3 年风险...`
    *   `[AdviceAgent] 正在生成个性化建议...`

### 5.2 报告渲染 (ReportView.vue)

报告页面需严格复刻您提供的样例文本风格，但进行 UI 组件化拆分：

1.  **概览区**: 对应“0. 报告说明”与“1. 健康报告总结”。建议使用醒目的提示框（Alert/Callout）展示。
2.  **画像区**: 对应“2. 您的健康画像”。使用卡片布局（Card），左侧展示“功能状态”，右侧展示“优势 vs 问题”。
3.  **风险区**: 对应“3. 风险因素”。使用时间轴（Timeline）或优先级列表展示“近期”与“中期”风险。
4.  **行动区**: 对应“4. 健康建议”。这是核心交互区，建议使用 Checkbox 列表或折叠面板（Collapse），将建议分为 **第一/二/三优先级**，方便用户打钩确认“我已收到”。

## 6. 开发与运行 (Usage)

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

## 7. 接入后端指南 (Integration)

在 `api/chat.js` 中，需要实现与后端 LLM/Agent 接口的通信。

如果后端采用流式输出 (Server-Sent Events)，前端需处理：

```javascript
// 伪代码示例
async function fetchReport(profileData) {
  const response = await fetch('/api/generate_report', {
    method: 'POST',
    body: JSON.stringify(profileData)
  });

  const reader = response.body.getReader();
  // ...循环读取流并在界面上打字机式展示 markdown
}
```

## 8. 注意事项

*   **Markdown 样式**: 提供的报告样例包含大量列表和层级，请在 `styles/markdown.scss` 中专门优化 `h1, h2, ul, li, blockquote` 的样式，以保证阅读体验温和、清晰（适合老年人家属阅读）。

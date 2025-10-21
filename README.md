<div align="center">

![CodeAware logo](media/readme.png)

</div>

<h1 align="center">CodeAware</h1>

<div align="center">

**CodeAware 是一个基于[Continue](https://github.com/continuedev/continue) 的智能代码项目学习辅助工具，帮助开发者通过结构化的项目分解与高亮对应来自主理解和编写项目代码**

</div>

<div align="center">

<a target="_blank" href="https://opensource.org/licenses/Apache-2.0" style="background:none">
    <img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" style="height: 22px;" />
</a>

<p></p>

## 主要功能特性

### 📋 需求管理 (Requirements Management)

通过智能需求分解功能，将复杂的编程任务拆解为可管理的学习目标

<!--![requirements](docs/static/img/requirements.gif)>-->

**核心组件：**
- `RequirementEditor.tsx` - 需求编辑器，支持富文本编辑
- `RequirementDisplay.tsx` - 需求展示器，以步骤形式可视化展示需求
- `RequirementSummary.tsx` - 需求摘要，提供快速概览

### 🪜 步骤生成与执行 (Step Generation)

AI 自动生成实现需求的详细步骤，并提供代码-步骤映射和高亮功能

![steps](docs/static/img/steps.gif)

**核心组件：**
- `Step.tsx` - 步骤容器，管理单个步骤的完整生命周期
- `StepTitleBar.tsx` - 步骤标题栏，显示状态和操作按钮
- `StepDescription.tsx` - 步骤描述展示
- `StepEditor.tsx` - 步骤编辑器

**步骤状态：**
- `generating` - 步骤正在生成中
- `generated` - 步骤已生成待确认
- `confirmed` - 步骤已确认
- `dirty` - 步骤内容已修改

### 🎴 知识卡片 (Knowledge Cards)

为每个步骤生成交互式知识卡片，包含概念讲解和自测题目

![knowledge-cards](docs/static/img/knowledge-cards.gif)

**核心组件：**
- `KnowledgeCard.tsx` - 知识卡片容器，管理卡片展示和交互
- `KnowledgeCardContent.tsx` - 知识内容展示
- `KnowledgeCardMCQ.tsx` - 多选题测试组件
- `KnowledgeCardSAQ.tsx` - 简答题测试组件
- `KnowledgeCardLoader.tsx` - 加载状态组件
- `KnowledgeCardToolBar.tsx` - 卡片工具栏

**知识卡片类型：**
- 概念讲解 - 详细解释相关编程概念
- 多选题（MCQ）- 测试概念理解
- 简答题（SAQ）- 深入理解验证

### 💬 交互式问答 (Interactive Q&A)

支持针对代码和步骤的实时提问，获取 AI 解答

![question-popup](docs/static/img/question-popup.gif)

**核心组件：**
- `QuestionPopup.tsx` - 问题弹窗，支持选中代码提问
- `GlobalQuestionModal.tsx` - 全局问题模态框

### 🔧 代码编辑模式 (Code Edit Mode)

智能代码编辑模式，在保留或编辑现有代码之间切换

**核心组件：**
- `CodeEditModeToggle.tsx` - 代码编辑模式开关
- 支持快照保存和恢复
- 智能代码映射更新

### 💻 AI 聊天助手 (AI Chat Assistant)

提供完整的 AI 对话功能，支持代码分析和问题解答

**核心文件：**
- `Chat.tsx` - 聊天界面主文件

</div>

## 架构设计

### 路由结构

CodeAware 基于 React Router 构建，主要路由如下（定义在 `gui/src/App.tsx`）：

```typescript
{
  path: ROUTES.HOME,
  element: <CodeAware/>,  // 主界面
},
{
  path: "/chat",
  element: <Chat />,      // AI 聊天界面
}
```

### 主要界面文件

```
gui/src/pages/codeaware/
├── CodeAware.tsx              # 主界面容器
├── Chat.tsx                   # AI 聊天界面
├── CodeAware.css             # 样式文件
└── components/               # 组件目录
    ├── Requirements/         # 需求管理组件
    │   ├── RequirementEditor.tsx
    │   ├── RequirementDisplay.tsx
    │   └── RequirementSummary.tsx
    ├── Steps/               # 步骤管理组件
    │   ├── Step.tsx
    │   ├── StepTitleBar.tsx
    │   ├── StepDescription.tsx
    │   └── StepEditor.tsx
    ├── KnowledgeCard/       # 知识卡片组件
    │   ├── KnowledgeCard.tsx
    │   ├── KnowledgeCardContent.tsx
    │   ├── KnowledgeCardMCQ.tsx
    │   └── KnowledgeCardSAQ.tsx
    ├── QuestionPopup/       # 问答组件
    │   ├── QuestionPopup.tsx
    │   └── GlobalQuestionModal.tsx
    ├── ToolBar/            # 工具栏组件
    │   └── CodeAwareToolBar.tsx
    └── CodeEditModeToggle.tsx  # 编辑模式切换
```

### 状态管理

CodeAware 使用 Redux Toolkit 进行状态管理，主要 slice：

- `codeAwareSlice` - 管理需求、步骤、知识卡片、代码映射等核心状态
- 支持的主要 thunks：
  - `generateStepsFromRequirement` - 从需求生成步骤
  - `generateKnowledgeCardThemes` - 生成知识卡片主题
  - `generateKnowledgeCardDetail` - 生成知识卡片详情
  - `generateKnowledgeCardTests` - 生成测试题目
  - `processCodeChanges` - 处理代码变更
  - `checkAndMapKnowledgeCardsToCode` - 映射知识卡片到代码

### 核心工作流程

1. **需求输入** → 用户在 RequirementEditor 中输入学习目标
2. **步骤生成** → AI 自动分解需求为具体步骤
3. **代码生成** → 为每个步骤生成对应代码
4. **知识增强** → 自动生成知识卡片和测试题
5. **交互学习** → 通过问答、测试等方式深化理解
6. **代码映射** → 实时同步代码变更与步骤关联

## 技术栈

- **前端框架**: React + TypeScript
- **状态管理**: Redux Toolkit
- **样式**: Styled Components + CSS
- **路由**: React Router
- **UI 组件**: Material-UI (部分组件)
- **图标**: Heroicons

## 开始使用

### 安装

CodeAware 是 Continue 的扩展版本，请先安装 VS Code 插件。

### 使用方法

1. 在 VS Code 中打开 CodeAware 面板
2. 在需求编辑器中输入你的学习目标或编程任务
3. 点击"生成步骤"，AI 将自动分解需求
4. 浏览生成的步骤和知识卡片
5. 通过测试题验证你的理解
6. 使用问答功能获取更多帮助

## 开发

### 构建项目

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建扩展
npm run build
```

### 主要开发任务

项目包含多个可用的构建任务（在 `.vscode/tasks.json` 中定义）：

- `vscode-extension:build` - 完整构建
- `gui:dev` - 启动 GUI 开发服务器
- `tsc:watch` - TypeScript 监听模式

## 贡献

欢迎贡献代码、报告问题或提出建议！请查看 [贡献指南](./CONTRIBUTING.md)。

## 许可证

[Apache 2.0 © 2023-2024 Continue Dev, Inc.](./LICENSE)

---

<div align="center">

**基于 [Continue](https://github.com/continuedev/continue) 开发**

</div>

<div align="center">

![CodeAware logo](media/readme.png)

</div>

<h1 align="center">CodeAware</h1>

<div align="center">

**CodeAware 是一个基于[Continue](https://github.com/continuedev/continue) 的智能代码项目学习辅助工具，帮助开发者通过结构化的项目分解、高亮对应、认知辅助知识卡片来自主理解和编写项目代码**

</div>

<div align="center">

<a target="_blank" href="https://opensource.org/licenses/Apache-2.0" style="background:none">
    <img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" style="height: 22px;" />
</a>

</div>

## 核心功能

CodeAware 提供四大核心功能，帮助开发者系统化学习和理解代码项目：

### 🎯 1. 项目分解 (Project Decomposition)

将复杂的编程任务智能分解为层级化的认知与实现步骤，提供清晰的认知路径。

#### 功能介绍

- **智能需求理解**：AI 分析用户输入的学习目标或编程任务
- - **学习目标提取**：AI提取和推断学习目标
- **层级式分解**：生成高级步骤（High-Level Steps）和详细执行步骤（Execution Steps）
- **层级映射**：自然产生高级步骤与详细步骤的对应关系

#### 交互效果实现

**核心组件：**

- `RequirementEditor.tsx` - 需求编辑器，支持富文本输入
- `RequirementDisplay.tsx` - 需求展示器，可视化高级步骤
- `RequirementDisplayHorizontal.tsx` - 需求摘要，当下滑页面空间不足的时候采用横向视图展示高级步骤
- `Step.tsx` - 步骤容器，管理步骤下的内容（包括知识卡片）
- `StepTitleBar.tsx` - 步骤标题栏，显示状态和操作按钮，默认折叠，点击时展开，同时自动折叠其它步骤展开的内容（防止内容过多）。
- `StepDescription.tsx` - 步骤描述，相当于用自然语言写了一遍这个步骤的代码。
- `StepEditor.tsx` - 步骤编辑器，支持步骤描述的编辑，更新后可以应用于步骤对应的代码生成。

**状态流转：**

```text
需求状态: empty (初始)→ editing (用户正在输入或编辑需求时) → confirmed (当用户提交了需求给AI的时候) → finalized （当AI完成了步骤生成），在后续开发中加入project coach的时候, 可以扩展这个状态以容纳更多的交互设计
步骤状态: generated (生成完成)→ editing (正在手动编辑) → confirmed (编辑完成并确认) → step_dirty (手动对步骤进行过编辑) → code_dirty (手动对代码进行了编辑， 切换回CodeAware模式时会对于这个步骤的描述进行更新)
```

#### 数据管理

**相关数据结构** (`codeAwareSlice.ts`)：

```typescript
// 程序需求
ProgramRequirement {
  requirementDescription: string;
  requirementStatus: "empty" | "editing" | "confirmed" | "finalized";
}

// 高级步骤
HighLevelStepItem {
  id: string;
  content: string;
  isCompleted: boolean;
  isHighlighted: boolean;
}

// 详细步骤
StepItem {
  id: string;
  title: string;
  abstract: string;
  stepStatus: "editing" | "generated" | "confirmed" | "step_dirty" | "code_dirty";
  knowledgeCards: KnowledgeCard[];
  knowledgeCardGenerationStatus: KnowledgeCardGenerationStatus;
  originalAbstract?: string;  // 用于突出编辑前后需求的变化
  isHighlighted: boolean;
}

// 步骤映射关系
StepToHighLevelMapping {
  stepId: string;
  highLevelStepId: string;
  highLevelStepIndex: number;
}
```

**相关 Actions：**

- `submitRequirementContent` - 提交需求内容
- `setUserRequirementStatus` - 设置需求状态
- `setHighLevelSteps` - 设置高级步骤
- `setGeneratedSteps` - 设置详细步骤
- `setStepToHighLevelMappings` - 设置步骤映射关系
- `setStepStatus` - 设置步骤状态
- `setStepAbstract` - 更新步骤摘要
- `updateHighLevelStepCompletion` - 更新高级步骤完成状态

#### 智能生成

**核心 Thunk** (`codeAwareGeneration.ts`)：

**`generateStepsFromRequirement`** - 从需求生成步骤

```typescript
输入: { userRequirement: string }
输出: {
  title: string;                        // 会话标题
  learningGoal: string;                 // 学习目标，不会显示，但会用于其它生成的上下文中
  highLevelSteps: HighLevelStepItem[];  // 高级步骤列表
  steps: StepItem[];                    // 详细步骤列表
  stepToHighLevelMappings: StepToHighLevelMapping[]; // 映射关系
}
```

_目前的步骤分解生成时，有时后面的步骤会重复前面步骤的工作，需要进一步优化prompt_

---

### 💻 2. 渐进式代码生成 (Progressive Code Generation)

逐步生成代码，每次生成对应一个或多个步骤，支持代码增量更新和智能映射。围绕着代码，也支持手动在自然语义或者代码本身层面进行修改。

#### 功能介绍

- **步骤驱动生成**：根据步骤描述逐步生成代码
- **代码对应关系**：维护代码语义块与步骤、知识卡片的对应关系
- **增量更新**：基于目前的代码进行更新
- **自然语言代码修改**：手动步骤描述修改后可以更新代码
- **代码编辑模式**：支持手动编辑代码并自动同步映射

#### 交互效果实现

**核心组件：**

- `CodeEditModeToggle.tsx` - 代码编辑模式开关
  - CodeAware 模式：允许 AI 生成和更新代码
  - 手动编辑模式：用户自由编辑，保存快照用于后续同步

**代码编辑工作流：**

1. 用户切换到编辑模式 → 保存当前代码快照
2. 用户手动编辑代码
3. 退出编辑模式 → 触发 `processCodeChanges`
4. 分析代码变更，更新代码块范围和映射关系
5. 标记受影响的步骤为 `code_dirty` 状态
6. 触发 `processCodeUpdates` → 将 diff、上下文和步骤映射传递给 LLM，最小化更新受影响步骤的代码并同步步骤摘要（知识卡片自动更新仍在计划中）

_目前代码生成后是直接更新到editor,需要增加diff展示和用户确认，以及对应的重新生成功能_

#### 数据管理

**相关数据结构** (`codeAwareSlice.ts`)：

```typescript
// 代码块
CodeChunk {
  id: string;
  content: string;
  range: [number, number];  // [起始行, 结束行]
  filePath: string;
  isHighlighted: boolean;
  disabled: boolean;
}

// 代码编辑模式状态
isCodeEditModeEnabled: boolean;
codeEditModeSnapshot: {
  filePath: string;
  content: string;
  timestamp: number;
} | null;
```

**相关 Actions：**

- `updateCodeChunks` - 添加代码块
- `updateCodeChunkRange` - 更新代码块行范围
- `setCodeChunkDisabled` - 设置代码块禁用状态
- `createOrGetCodeChunk` - 创建或获取代码块（避免重复）
- `toggleCodeEditMode` - 切换编辑模式
- `saveCodeEditModeSnapshot` - 保存代码快照
- `clearCodeEditModeSnapshot` - 清除快照
- `markStepsCodeDirty` - 标记步骤代码已修改
- `updateCodeChunkPositions` - 更新代码块位置
- `clearAllCodeAndMappings` - 清除所有代码和映射

#### 智能生成

**核心 Thunks** (`codeAwareGeneration.ts`)：

**`generateCodeFromSteps`** - 根据步骤生成代码

```typescript
输入: {
  existingCode: string;
  filepath: string;
  orderedSteps: Array<{ id, title, abstract }>;
  previouslyGeneratedSteps?: Array<{ id, title, abstract, current_corresponding_code }>;
}
输出: {
  changedCode: string;  // 完整的更新后代码
  stepsCorrespondingCode: Array<{ id: string; code: string }>;
}
```

**生成流程：**

1. **代码生成阶段**：

   - 构造包含现有代码和步骤信息的提示词。_目前是将所有的已有代码都作为上下文，但对于大项目，我们需要context engineering来适应窗口大小。_
   - 每个步骤“派出”一个LLM Agent去找到和该步骤相关的代码块。_目前这个对应出现了重叠、缺漏的情况，一种方式是我们不采用大模型找对应的办法（agentic search或者RAG），另一种方式是通过AST等静态方法去后处理修复，包括现在是每次生成代码都更新全部代码，一些无关的步骤的对应关系应该是不用更新的，这里更新只是处于rerun一下没准能修复问题的心理。_

2. **代码块处理阶段**：

   - 解析代码块信息（起始行、结束行、语义描述）
   - 提取每个代码块的实际内容
   - 建立代码块到步骤的映射关系

3. **映射创建阶段**：

   - 创建 CodeChunk 对象
   - 创建 CodeAwareMapping 映射关系
   - 更新 Redux 状态

4. **验证和日志**：
   - 验证映射完整性 (检验是不是每行代码都有步骤对应了)
   - 同步到 IDE

**`rerunStep`** - 重新运行步骤（步骤修改后更新代码）

```typescript
输入: {
  stepId: string;
  changedStepAbstract: string;
  existingCode: string;
  filepath: string;
}
```

**生成策略：**

- **最小化修改**：仅更新与修改步骤相关的代码
- **保留现有功能**：不破坏其他步骤的代码
- **智能查找**：通过语义描述定位需要修改的代码块

**`processCodeChanges`** - 处理手动代码编辑后的变更

```typescript
输入: {
  currentFilePath: string;
  currentContent: string;
}
```

**处理流程：**

1. 获取快照中的原始代码
2. 计算代码差异（diff）
3. 使用 LLM 分析变更影响的步骤
4. 更新代码块行号范围
5. 标记受影响步骤为 `code_dirty`
6. 清除快照

**`processCodeUpdates`** - 当步骤被标记为 `code_dirty` 时根据本地改动智能更新代码

```typescript
输入: {
  currentFilePath: string;
  previousContent: string;
  currentContent: string;
  codeDiff: string;
}
```

**处理流程：**

1. 组合 diff、步骤上下文与现有映射，构造最小化修改的提示词
2. 调用 LLM 生成仅包含必要变更的新版代码片段
3. 同步更新 Redux 中的代码块范围、映射关系与步骤摘要，将受影响步骤从 `code_dirty` 恢复为 `generated`

**辅助函数：**

- `processCodeChunkMappingResponse` - 处理代码块映射响应
- `validateCodeChunkMapping` - 验证映射完整性
- `calculateCodeChunkRange` - 计算代码块行号范围
- `createCodeChunksFromLineArray` - 从行数组创建代码块
- `getStepCorrespondingCode` - 获取步骤对应的所有代码

---

### 🔗 3. 关联高亮 (Link Highlights)

实现需求、步骤、知识卡片、代码块之间的智能高亮联动，帮助理解元素间的对应关系。

#### 功能介绍

- **多元素联动**：点击/选中任一元素，高亮所有相关联的元素（高级步骤、步骤、知识卡片、代码）
- **批量高亮**：支持同时处理多个高亮事件

#### 交互效果实现

**高亮触发方式：**

1. **鼠标点选** - 当用户点击高级步骤、步骤或者知识卡片
2. **代码选择** - 在 IDE 中选择代码触发

由于原先选中代码和点击展开步骤就包含了用户的语义，所以部分用户反映直接的高亮对应展示在一些时候是不必要的。我们可以考虑在这个版本中增加类似于overleaf中的↔对应键的设计，使得不希望自动触发的用户可以手动触发高亮对应。

**视觉效果：**

- GUI 中高亮元素背景色变化
- IDE 中代码行背景高亮
- 高亮状态在所有关联元素间同步

#### 数据管理

**相关数据结构** (`codeAwareSlice.ts`)：

```typescript
// 多元素映射关系
CodeAwareMapping {
  codeChunkId?: string;
  highLevelStepId?: string;
  stepId?: string;
  knowledgeCardId?: string;
  isHighlighted: boolean;
  metaInfo?: {
    codeSnippet?: string;      // 代码片段（用于模糊匹配）
    semanticDescription?: string; // 语义描述（暂时没用，使用agentic search的话可以用）
  };
}

// 高亮事件
HighlightEvent {
  sourceType: "code" | "requirement" | "step" | "knowledgeCard";
  identifier: string;  // 元素ID
  additionalInfo?: any; // 根据触发源而定的额外信息（StepItem, KnowledgeCardItem, CodeChunk等）
}

// IDE 通信标志
shouldClearIdeHighlights: boolean;
codeChunksToHighlightInIde: CodeChunk[];
```

**相关 Actions：**

- `updateHighlight` - 核心高亮更新逻辑（支持单个或批量事件）
- `clearAllHighlights` - 清除所有高亮状态
- `updateCodeAwareMappings` - 添加映射关系（自动去重）
- `removeCodeAwareMappings` - 删除指定映射
- `clearKnowledgeCardCodeMappings` - 清除知识卡片代码映射
- `resetIdeCommFlags` - 重置 IDE 通信标志

**高亮逻辑** (`updateHighlight` Reducer)：

1. **接收高亮事件**（单个或数组）
2. **查找匹配映射**：
   - 首先通过 identifier 精确匹配
   - 如果是代码类型且有 additionalInfo，使用元信息模糊匹配
3. **收集关联元素 ID**：
   - 从所有匹配的映射中提取 codeChunkId、highLevelStepId、stepId、knowledgeCardId
   - 使用 Set 去重
4. **清除旧高亮**：调用 `clearAllHighlights`
5. **设置新高亮**：
   - 遍历所有元素集合，设置 `isHighlighted = true`
   - 收集需要在 IDE 中高亮的代码块
6. **触发 IDE 高亮**：设置 `codeChunksToHighlightInIde`

---

### 🎴 4. 知识卡片交互 (Knowledge Cards Interaction)

为每个步骤生成交互式知识卡片，提供概念讲解和自测功能，增强学习体验。

#### 功能介绍

- **自动主题生成**：根据步骤内容生成相关知识点主题
- **详细内容生成**：为每个主题生成知识讲解，结合内容上下文
- **测试题生成**：生成多选题（MCQ）和简答题（SAQ）
- **智能评分**：使用 LLM 评估简答题作答
- **问答驱动生成**：根据用户提问生成相关知识卡片
- **代码关联**：知识卡片与对应代码块建立映射关系

#### 交互效果实现

**核心组件：**

- `KnowledgeCard.tsx` - 知识卡片容器，管理卡片展示和交互
- `KnowledgeCardContent.tsx` - 知识内容展示（Markdown 渲染）
- `KnowledgeCardMCQ.tsx` - 多选题测试组件
- `KnowledgeCardSAQ.tsx` - 简答题测试组件
- `KnowledgeCardLoader.tsx` - 加载状态组件
- `KnowledgeCardToolBar.tsx` - 卡片工具栏（编辑、删除、重新生成）
- `QuestionPopup.tsx` - 问题弹窗，用于在步骤内的提问
- `GlobalQuestionModal.tsx` - 全局问题模态框 (将要与前者统一)
- 选中代码提问目前采用的是vscode内联的提问框

**交互流程：**

1. **主题生成** → 第一次展开步骤时、或者用户主动提问时
2. **内容生成** → 点击卡片主题展开详细内容时懒惰生成
3. **测试生成** → 内容加载完成后自动生成测试题
4. **答题互动** → 用户选择/输入答案
5. **评分反馈** → 显示正确性和详细解释

**状态指示：**

```text
知识卡片生成状态:
empty (初始状态，连主题都没有) → "generating" (正在生成知识卡片主题) → "ready" (生成了知识卡片主题，可供查看);
```

#### 数据管理

**相关数据结构** (`codeAwareSlice.ts`)：

```typescript
// 知识卡片
KnowledgeCard {
  id: string;
  theme: string;           // 主题
  content: string;         // Markdown 格式的内容
  tests: TestItem[];       // 测试题目数组
  isLoading: boolean;      // 内容加载状态
  testsLoading: boolean;   // 题目加载状态
  disabled: boolean;       // 禁用状态
  isHighlighted: boolean;
}

// 测试题目
TestItem {
  id: string;
  stem: string;            // 题干
  question_type: "multipleChoice" | "shortAnswer";
  standard_answer: string;
  options?: string[];      // 多选题选项
  user_answer?: string;
  is_correct?: boolean;
  remarks?: string;        // 评分备注
  isLoading?: boolean;
}

// 知识卡片生成状态
KnowledgeCardGenerationStatus =
  | "not_generated"
  | "generating_themes"
  | "themes_generated"
  | "generating_content"
  | "content_generated"
  | "generating_tests"
  | "completed";
```

**相关 Actions：**

- `createKnowledgeCard` - 创建新知识卡片（仅主题）
- `updateKnowledgeCardContent` - 更新卡片内容
- `updateKnowledgeCardTests` - 更新测试题目
- `updateKnowledgeCardTitle` - 更新卡片标题（清空内容）
- `setKnowledgeCardLoading` - 设置内容加载状态
- `setKnowledgeCardTestsLoading` - 设置题目加载状态
- `setKnowledgeCardDisabled` - 设置禁用状态
- `setKnowledgeCardError` - 设置加载错误
- `resetKnowledgeCardContent` - 重置卡片内容
- `setKnowledgeCardGenerationStatus` - 设置生成状态
- `updateSaqTestResult` - 更新简答题评分结果
- `setSaqTestLoading` - 设置简答题评分加载状态

**相关 Selectors：**

- `selectTestByTestId` - 根据测试ID查找测试信息
- `selectTestLoadingState` - 获取测试加载状态

#### 智能生成

**核心 Thunks** (`codeAwareGeneration.ts`)：

**`generateKnowledgeCardThemes`** - 生成知识卡片主题列表

```typescript
输入: {
  stepId: string;
  stepTitle: string;
  stepAbstract: string;
  learningGoal: string;
  currentCode: string;
}
输出: string[]  // 主题列表
```

**生成流程：**

1. 设置生成状态为 `generating_themes`
2. 获取步骤对应的代码
3. 构造提示词（包含步骤信息、代码、学习目标）
4. LLM 生成主题列表 JSON
5. 解析并验证主题
6. 为每个主题创建空的知识卡片
7. 创建卡片到步骤的映射关系
8. 设置状态为 `themes_generated`
9. 记录交互日志

**`generateKnowledgeCardDetail`** - 生成知识卡片详细内容

```typescript
输入: {
  stepId: string;
  knowledgeCardId: string;
  knowledgeCardTheme: string;
  learningGoal: string;
  codeContext: string;
}
```

**生成流程：**

1. 设置加载状态 `isLoading = true`
2. 构造包含主题、学习目标、代码上下文的提示词
3. LLM 流式生成 Markdown 内容
4. 实时更新卡片内容（流式显示）
5. 内容生成完成后设置 `isLoading = false`
6. 自动触发测试题生成
7. 记录生成日志

**内容要求**：

- 结构化 Markdown 格式
- 包含概念解释、代码示例、应用场景
- 适应学习目标和代码上下文

**`generateKnowledgeCardTests`** - 生成测试题目

```typescript
输入: {
  stepId: string;
  knowledgeCardId: string;
  knowledgeCardTitle: string;
  knowledgeCardContent: string;
  knowledgeCardTheme: string;
  learningGoal: string;
  codeContext: string;
}
```

**生成流程：**

1. 设置题目加载状态 `testsLoading = true`
2. 构造包含卡片内容的提示词
3. LLM 生成测试题目 JSON
4. 解析题目（MCQ 和 SAQ）
5. 为每个题目生成唯一 ID
6. 更新卡片的 tests 数组
7. 设置生成状态为 `completed`
8. 记录生成日志

**题目要求**：

- 3-5 道题目
- 简答题
- 难度适中，覆盖核心知识点

**`generateKnowledgeCardThemesFromQuery`** - 根据用户提问生成知识卡片

```typescript
输入: {
  stepId: string;
  queryContext: {
    selectedCode: string;
    selectedText: string;
    query: string;
  };
  currentStep: { title, abstract };
  existingThemes: string[];
  learningGoal: string;
  task: string;
}
```

**生成策略：**

1. 分析用户问题和选中的代码/文本
2. 识别需要补充的知识点
3. 避免与现有主题重复
4. 生成 1-3 个相关主题
5. 自动创建并生成知识卡片内容

**`processSaqSubmission`** - 处理简答题提交并评分

```typescript
输入: {
  testId: string;
  userAnswer: string;
}
```

**评分流程：**

1. 设置评分加载状态
2. 获取题目信息和标准答案
3. 构造包含题目、标准答案、用户答案的提示词
4. LLM 评估答案正确性
5. 解析评分结果（正确性 + 详细评语）
6. 更新测试结果

**评分标准**：

- 内容准确性
- 概念理解深度
- 表达清晰度
  _目前用户体验后反馈题目较难，需要调整prompt以放宽判定标准，并且设置交互以允许用户自主查看答案_

**`processGlobalQuestion`** - 处理全局提问

```typescript
输入: {
  question: string;
  currentCode: string;
}
输出: {
  selectedStepId: string;
  themes: string[];
  knowledgeCardIds: string[];
}
```

**处理流程：**

1. LLM 分析问题，选择最相关的步骤
2. 生成相关知识卡片主题
3. 自动创建并展开知识卡片
4. 返回选中步骤和生成的卡片信息

### 5. 日志记录 (User Activity Logging)

CodeAware 实现了全面的用户活动日志记录系统，用于跟踪用户行为、系统生成过程和交互事件，为学习分析和系统优化提供数据支撑。

#### 日志架构

**核心组件：**

- `useCodeAwareLogger` - React Hook，提供统一的日志记录接口
- `CodeAwareWebViewLogger` - 日志记录器类，管理日志会话和事件记录
- `addCodeAwareLogEntry` - IDE 通信接口，将日志保存到文件系统

**日志会话管理：**

```typescript
// 启动日志会话
await logger.startLogSession(username, sessionName, codeAwareSessionId);

// 记录事件
await logger.addLogEntry(eventType, payload);

// 结束会话
await logger.endLogSession();
```

#### 生成与生成完成事件

记录 AI 系统的各种生成过程，包括触发、进行中状态和完成结果：

**步骤生成 (Steps Generation)：**

- `user_order_steps_generation` - 用户触发步骤生成
- `user_get_steps_generation_result` - 步骤生成完成

**代码生成 (Code Generation)：**

- `user_order_code_generation` - 用户触发代码生成
- `user_get_code_generation_result` - 代码生成完成

**知识卡片生成 (Knowledge Cards Generation)：**

- `user_order_knowledge_card_themes_generation` - 触发主题生成
- `user_get_knowledge_card_themes_generation_result` - 主题生成完成
- `user_order_knowledge_card_detail_generation` - 触发内容生成
- `user_get_knowledge_card_detail_generation_result` - 内容生成完成
- `user_order_knowledge_card_tests_generation` - 触发测试题生成
- `user_get_knowledge_card_tests_generation_result` - 测试题生成完成
- `user_order_knowledge_card_themes_from_query_generation` - 基于问题生成主题
- `user_get_knowledge_card_themes_from_query_generation_result` - 问题驱动主题生成完成

**其他生成事件：**

- `user_order_step_rerun` - 触发步骤重新运行
- `user_get_step_rerun_result` - 步骤重新运行完成
- `user_order_code_changes_processing` - 触发代码变更处理
- `user_get_code_changes_processing_result` - 代码变更处理完成
- `user_order_saq_submission_processing` - 触发简答题评分
- `user_get_saq_submission_processing_result` - 简答题评分完成
- `user_order_global_question_processing` - 触发全局问题处理
- `user_get_global_question_processing_result` - 全局问题处理完成

#### 链接高亮事件

记录用户与界面元素的高亮交互，用于分析学习路径和关注点：

**步骤相关高亮：**

- `user_view_and_highlight_step` - 用户展开并高亮步骤
- `user_finished_viewing_step` - 用户关闭步骤视图

**高级步骤高亮：**

- `user_view_and_highlight_high_level_step` - 用户点击高级步骤
- `user_finished_viewing_high_level_step` - 用户停止查看高级步骤

**知识卡片高亮：**

- `user_view_and_highlight_knowledge_card` - 用户展开知识卡片
- `user_finished_viewing_knowledge_card` - 用户关闭知识卡片

**代码映射检查：**

- `user_check_code_step_mappings` - 检查代码与步骤的映射关系

**高亮清除：**

- `user_clear_all_highlights` - 用户清除所有高亮

#### 用户交互事件

记录用户的主要操作行为，包括编辑、提交、模式切换等：

**会话管理：**

- `user_create_new_session` - 创建新学习会话
- `user_request_new_session` - 请求新会话
- `system_create_session_file` - 系统创建会话文件
- `system_create_session_file_error` - 会话文件创建错误

**需求管理：**

- `user_start_editing_requirement` - 开始编辑需求
- `user_start_edit_requirement` - 开始编辑需求内容
- `user_confirm_requirement` - 确认需求
- `user_modify_requirement` - 修改需求
- `user_no_change_requirement` - 需求无变更
- `user_regenerate_steps_completed` - 重新生成步骤完成

**代码编辑模式：**

- `user_enter_code_edit_mode` - 进入代码编辑模式
- `user_exit_code_edit_mode` - 退出代码编辑模式
- `user_click_regenerate_code_button` - 点击重新生成代码按钮

**代码操作：**

- `user_request_regenerate_code` - 请求重新生成代码
- `user_regenerate_code_completed` - 代码重新生成完成
- `user_regenerate_code_error` - 代码生成错误
- `user_regenerate_code_no_steps` - 无步骤时尝试生成代码
- `user_clear_code_and_mappings` - 清除代码和映射
- `user_clear_file_content` - 清除文件内容

**步骤操作：**

- `user_start_execute_steps` - 开始执行步骤
- `user_execute_steps_completed` - 步骤执行完成
- `user_execute_steps_batch_started` - 批量执行步骤开始
- `user_execute_steps_error` - 步骤执行错误
- `user_start_rerun_step` - 开始重新运行步骤
- `user_rerun_step_completed` - 步骤重新运行完成
- `user_rerun_step_error` - 步骤重新运行错误
- `user_edit_step_content` - 编辑步骤内容
- `user_change_step_status` - 改变步骤状态
- `user_start_edit_step_requirement` - 开始编辑步骤需求
- `user_submit_step_requirement` - 提交步骤需求

**知识卡片交互：**

- `user_start_view_knowledge_card` - 开始查看知识卡片
- `user_start_generate_knowledge_card_tests` - 开始生成知识卡片测试
- `user_switch_to_knowledge_card_test_mode` - 切换到测试模式
- `user_switch_to_knowledge_card_content_mode` - 切换到内容模式
- `user_navigate_knowledge_card_test` - 导航知识卡片测试
- `user_disable_knowledge_card` - 禁用知识卡片

**问答互动：**

- `user_submit_question` - 提交问题
- `user_submit_question_completed` - 问题提交完成
- `user_submit_question_error` - 问题提交错误
- `user_submit_global_question` - 提交全局问题
- `user_submit_global_question_completed` - 全局问题提交完成
- `user_submit_global_question_error` - 全局问题提交错误
- `user_open_global_question_modal` - 打开全局问题模态框
- `user_close_global_question_modal` - 关闭全局问题模态框
- `user_start_edit_global_question` - 开始编辑全局问题
- `user_start_edit_reference_question` - 开始编辑参考问题
- `user_submit_reference_question` - 提交参考问题

**代码选择问答：**

- `user_trigger_question_from_code_selection` - 从代码选择触发问题
- `user_trigger_question_from_code_selection_completed` - 代码选择问题完成
- `user_trigger_question_from_code_selection_error` - 代码选择问题错误

**测试答题：**

- `user_start_edit_saq_answer` - 开始编辑简答题答案
- `user_submit_saq_answer` - 提交简答题答案

**系统事件：**

- `system_knowledge_card_themes_generated` - 系统生成知识卡片主题

#### 日志数据结构

每个日志条目包含以下信息：

```typescript
{
  eventType: string; // 事件类型
  payload: {
    timestamp: string; // ISO 时间戳
    // ... 事件特定的上下文数据
  }
}
```

**常见 payload 字段：**

- `timestamp` - 事件发生时间
- `stepId` / `stepTitle` - 相关步骤信息
- `knowledgeCardId` / `knowledgeCardTheme` - 知识卡片信息
- `question` / `answer` - 问答内容
- `filePath` / `content` - 文件相关信息
- `errorMessage` - 错误信息
- `userRequirement` - 用户需求内容
- `selectedCode` / `selectedText` - 选中的代码/文本

#### 使用示例

```typescript
// 在组件中使用
const logger = useCodeAwareLogger();

// 记录用户操作
await logger.addLogEntry("user_view_knowledge_card", {
  stepId: "step-1",
  cardTheme: "JavaScript 闭包",
  timestamp: new Date().toISOString(),
});

// 在 thunk 中记录系统事件
await extra.ideMessenger.request("addCodeAwareLogEntry", {
  eventType: "user_get_code_generation_result",
  payload: {
    generatedLinesCount: 50,
    executionTime: 2.5,
    timestamp: new Date().toISOString(),
  },
});
```

## _目前还缺少历史记录的功能，以及目前存储的log中，涉及到具体内容的部分全部以文字形式存储，导致内容阶段或者冗余记录的问题，需要进一步整理格式，保证内容能够完整存储同时避免冗余_

## 架构设计

### 主要文件结构

```text
gui/src/
├── pages/codeaware/
│   ├── CodeAware.tsx              # 主界面容器
│   ├── Chat.tsx                   # AI 聊天界面
│   └── components/
│       ├── Requirements/          # 需求管理组件
│       ├── Steps/                 # 步骤管理组件
│       ├── KnowledgeCard/         # 知识卡片组件
│       ├── QuestionPopup/         # 问答组件
│       ├── ToolBar/               # 工具栏组件
│       └── CodeEditModeToggle.tsx
├── redux/
│   ├── slices/
│   │   └── codeAwareSlice.ts      # 核心状态管理
│   └── thunks/
│       └── codeAwareGeneration.ts # 异步生成逻辑
└── App.tsx                         # 路由配置
```

### 状态管理架构

**核心文件：**

- `codeAwareSlice.ts` - Redux 状态管理，定义数据结构、reducers、selectors
- `codeAwareGeneration.ts` - 异步 thunks，处理 LLM 调用和智能生成

**数据流：**

```text
用户交互 → Action → Reducer → State 更新 → UI 重渲染
           ↓
       Thunk（异步）→ LLM 调用 → 解析响应 → Dispatch Actions
```

### IDE 通信

通过 `ideMessenger` 与 VS Code 扩展通信：

- `getCurrentFile` - 获取当前文件内容
- `setHighlightedCode` - 高亮 IDE 中的代码
- `clearHighlightedCode` - 清除高亮
- `addCodeAwareLogEntry` - 记录用户交互日志
- `syncStepsToIde` - 同步步骤信息到 IDE
- `llm/complete` - 调用 LLM 完成
- `llm/streamComplete` - 流式调用 LLM

---

## 核心工作流程

### 完整学习流程

```text
1. 需求输入
   ↓
   用户在 RequirementEditor 中输入学习目标
   ↓
2. 项目分解
   ↓
   generateStepsFromRequirement
   - 生成高级步骤
   - 生成详细步骤
   - 创建需求映射
   ↓
3. 渐进式代码生成
   ↓
   用户确认步骤 → generateCodeFromSteps
   - 生成代码
   - 创建代码块
   - 建立代码映射
   ↓
4. 知识增强
   ↓
   generateKnowledgeCardThemes
   ↓
   用户展开卡片 → generateKnowledgeCardDetail
   ↓
   generateKnowledgeCardTests
   ↓
5. 交互学习
   ↓
   - 答题测试（processSaqSubmission）
   - 提问互动（processGlobalQuestion）
   - 联动高亮（updateHighlight）
   ↓
6. 代码编辑同步
   ↓
   切换编辑模式 → 手动编辑 → processCodeChanges
   - 更新代码块范围
   - 标记受影响步骤
```

---

## 开始使用

### 安装

CodeAware 是 Continue 的扩展版本，通过 VS Code 插件使用。

```bash
# 克隆仓库
git clone https://github.com/yh-zhu18thu/continue-codeaware.git
cd continue-codeaware

# 安装依赖
./scripts/install-dependencies.sh

# 构建项目
在extensions/vscode/src/extension.ts上按F5键即可
```

### 使用方法

1. 在 VS Code 中安装 CodeAware 扩展
2. 打开 CodeAware 面板
3. 输入学习目标或编程任务
4. 点击"生成步骤"开始学习旅程
5. 逐步确认步骤，查看代码生成
6. 通过知识卡片深化理解
7. 使用测试题验证学习效果

### 配置 LLM

在 VS Code 设置中配置 LLM：
请参考飞书文档中的 [配置指南和配置文件](https://swg1i19m8hf.feishu.cn/docx/N2tmdAjFZomNk7xAqyvckWSZn2d?from=from_copylink)：

---

## 开发任务(第一阶段)

### 主要开发任务

#### 1. 上下文工程与大项目支持

- **优先级**：🔥 高
- **问题**：目前将所有代码作为上下文，无法处理大项目
- **任务内容**：
  - 实现智能上下文裁剪算法
  - 基于语义相关性选择相关代码片段
  - 实现上下文窗口大小的动态调整
  - 建立上下文优先级评估机制

#### 2. 代码映射关系优化与修复

- **优先级**：🔥 高
- **问题**：步骤与代码块对应关系存在重叠、缺漏问题
- **任务内容**：
  - 重构代码块映射算法，减少重叠和缺漏
  - 实现基于AST的静态分析来后处理修复映射关系
  - 优化增量更新机制，避免每次都更新全部代码映射
  - 建立映射质量验证和自动修复机制

#### 3. 代码生成用户确认与差异展示系统

- **优先级**：🔶 中高
- **问题**：目前代码生成后直接更新到editor，缺乏用户确认机制
- **任务内容**：
  - 实现代码生成前后的diff展示界面
  - 增加用户确认/拒绝机制
  - 添加重新生成功能
  - 支持部分代码接受/拒绝的细粒度控制

#### 4. 高亮触发机制重设计

- **优先级**：🔶 中高
- **问题**：自动高亮触发在某些情况下对用户造成干扰
- **任务内容**：
  - 设计类似Overleaf的手动触发高亮对应键(↔)
  - 保留自动触发选项，但允许用户关闭
  - 实现高亮强度和范围的可配置性
  - 优化高亮的视觉效果和交互体验

#### 5. 问答界面统一重构

- **优先级**：🔶 中高
- **问题**：目前存在多套问答界面(QuestionPopup、GlobalQuestionModal、VSCode内联)
- **任务内容**：
  - 统一QuestionPopup和GlobalQuestionModal的设计和交互
  - 整合VSCode内联提问功能
  - 建立一致的问答界面设计语言
  - 优化问答工作流和用户体验

#### 6. 历史记录与会话管理系统

- **优先级**：🔶 中
- **问题**：缺少历史记录功能和会话管理
- **任务内容**：
  - 实现学习会话的保存和恢复功能
  - 建立历史记录查看和管理界面
  - 支持会话间的切换和比较
  - 实现会话状态的完整序列化

### 小型开发任务

#### 1. Prompt优化系列

- 优化步骤分解生成prompt，减少后续步骤重复前面工作的问题
- 调整知识卡片测试题难度，放宽评分标准
- 改进代码生成prompt的准确性和一致性

#### 2. 知识卡片交互改进

- 增加简答题查看标准答案的功能
- 添加知识卡片重新生成按钮
- 支持知识卡片内容的导出功能

#### 3. 日志系统优化

- 重新设计日志存储格式，避免内容冗余
- 实现日志内容的结构化存储

#### 4. 界面细节优化

- 完善RequirementDisplayHorizontal的响应式设计
- 改进代码编辑模式切换的用户体验
- 增强知识卡片加载状态的视觉反馈

#### 5. 错误处理与用户反馈

- 统一网络错误和LLM调用失败的提示
- 增加操作撤销/重做功能
- 优化长时间操作的进度提示

---

## 许可证

[Apache 2.0 © 2023-2024 Continue Dev, Inc.](./LICENSE)

---

<div align="center">

**基于 [Continue](https://github.com/continuedev/continue) 开发**

</div>

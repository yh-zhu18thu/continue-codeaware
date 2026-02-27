# CodeAware Mapping 机制重构计划

## 目标概述

将当前"点击即触发"的自动映射高亮机制改造为"显式按钮触发 + LLM查找 + 缓存"的机制，类似 Overleaf 的编辑器与 PDF 双向跳转功能。

---

## 一、当前实现分析

### 1.1 现有数据结构

**存储在 Redux State 中：**

```typescript
// codeAwareSlice.ts
interface CodeAwareSessionState {
  // 存储所有映射关系（层级和关联）
  codeAwareMappings: CodeAwareMapping[];

  // 存储步骤到高级步骤的层级关系（冗余）
  stepToHighLevelMappings: StepToHighLevelMapping[];

  // 其他数据
  codeChunks: CodeChunk[];
  highLevelSteps: HighLevelStepItem[];
  steps: StepItem[];
  // steps 下包含 knowledgeCards
}
```

**映射关系定义：**

```typescript
// core/index.d.ts
interface CodeAwareMapping {
  codeChunkId?: string;
  highLevelStepId?: string;
  stepId?: string;
  knowledgeCardId?: string;
  isHighlighted: boolean; // 当前高亮状态
}
```

### 1.2 现有触发机制

**自动触发位置：**

1. **RequirementDisplay 组件** ([RequirementDisplay.tsx:379-390](gui/src/pages/codeaware/components/Requirements/RequirementDisplay.tsx#L379-L390))

   - 用户点击高级步骤时触发 `handleChunkClick`
   - 创建 `HighlightEvent` 并调用 `onChunkFocus(highlightEvent)`

2. **Step 组件** ([Step.tsx:338-342](gui/src/pages/codeaware/components/Steps/Step.tsx#L338-L342))

   - 展开步骤时触发 `onHighlightEvent`
   - 传递 `sourceType: "step"` 和 `identifier: stepId`

3. **KnowledgeCard 组件** ([KnowledgeCard.tsx:387-391](gui/src/pages/codeaware/components/KnowledgeCard/KnowledgeCard.tsx#L387-L391))
   - 展开知识卡片时触发 `onHighlightEvent`
   - 传递 `sourceType: "knowledgeCard"` 和 `identifier: cardId`

**触发流程：**

```
用户操作
  → 组件触发 HighlightEvent
  → CodeAware.handleHighlightEvent
  → dispatch(updateHighlight(...))
  → codeAwareSlice.updateHighlight reducer
  → 查找所有匹配的 mappings
  → 高亮所有相关元素（代码、高级步骤、步骤、知识卡片）
  → 通知 IDE 高亮代码
```

### 1.3 现有高亮逻辑 ([codeAwareSlice.ts:295-580](gui/src/redux/slices/codeAwareSlice.ts#L295-L580))

**核心处理步骤：**

1. 接收一个或多个 `HighlightEvent`
2. 遍历 `codeAwareMappings` 查找所有匹配项
3. 如果未找到且是代码类型，使用 meta 信息（行号、内容）进行模糊匹配
4. 收集所有匹配的 ID（去重）
5. 清除所有现有高亮
6. 为匹配的元素设置 `isHighlighted: true`
7. 设置 `codeChunksToHighlightInIde` 通知 IDE

**问题：**

- 自动触发，用户无控制权
- 映射存储了过多冗余信息（层级关系）
- 无法区分"缓存"和"实时查找"

---

## 二、目标架构设计

### 2.1 新的交互模式

**Overleaf 风格的双向跳转：**

- 用户在左侧（代码编辑器）或右侧（语义面板）聚焦某个位置
- 点击跳转按钮（左箭头 / 右箭头）
- 系统查找对应元素并高亮（使用 LLM + 缓存）

**按钮设计：**

```
┌─────────────────┬─────────────────┐
│  Code Editor    │  Semantic Panel │
│                 │                 │
│  [→] 跳转到语义  │  [←] 跳转到代码  │
└─────────────────┴─────────────────┘
```

- **右箭头按钮（→）**：从代码跳转到语义元素

  - 根据当前光标位置/选中的代码块
  - 找到对应的 highLevelStep / step / knowledgeCard

- **左箭头按钮（←）**：从语义元素跳转到代码
  - 根据当前聚焦的语义元素
  - 找到对应的 codeChunk 并在 IDE 中高亮

### 2.2 新的数据结构

**简化的 Mapping（仅作为缓存）：**

```typescript
interface CodeAwareMapping {
  // 移除 isHighlighted 属性（不再存储状态）

  // 直接映射：code <-> semantic element
  codeChunkId: string;
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";

  // 缓存元数据
  createdAt: number; // 时间戳
  source: "llm" | "manual" | "initial"; // 来源
  confidence?: number; // LLM 置信度（可选）
}
```

**移除冗余的层级映射：**

- **删除** `stepToHighLevelMappings`
- **原因**：层级关系可以从元素本身推导
  - `highLevelSteps` 按顺序存储
  - `steps` 可通过 Flow 流程获得顺序
  - `knowledgeCards` 存储在 `steps[i].knowledgeCards` 中

**高亮状态的管理：**

- 高亮状态不存储在 mapping 中
- 仅在需要时临时设置各元素的 `isHighlighted` 标志
- 元素的 `isHighlighted` 属性保持不变（临时标记）

---

## 三、渐进式修改步骤

### 阶段 0：准备工作（不修改代码）

**目标：** 做好开发前的准备

- [ ] 创建新的功能分支：`feature/explicit-mapping`
- [ ] 备份当前关键文件
- [ ] 编写单元测试框架（针对新逻辑）
- [ ] 确认 LLM 接口可用性（测试快速查询）

---

### 阶段 1：添加 UI 按钮（不影响现有逻辑）

**目标：** 先添加界面元素，暂时不实现功能

#### 1.1 创建跳转按钮组件

**新建文件：** [gui/src/pages/codeaware/components/ToolBar/NavigationButtons.tsx](gui/src/pages/codeaware/components/ToolBar/NavigationButtons.tsx)

```typescript
interface NavigationButtonsProps {
  onJumpToSemantic: () => void; // 右箭头：代码 → 语义
  onJumpToCode: () => void; // 左箭头：语义 → 代码
  isLoading?: boolean; // 查找中状态
  disabled?: boolean;
}

// 实现双按钮组件，使用 HeroIcons 的箭头图标
// - ArrowRightIcon: 跳转到语义
// - ArrowLeftIcon: 跳转到代码
```

#### 1.2 集成到主界面

**修改文件：** [CodeAware.tsx](gui/src/pages/codeaware/CodeAware.tsx)

在合适位置（toolbar 或者两个面板之间）添加按钮组件：

```tsx
<NavigationButtons
  onJumpToSemantic={handleJumpToSemantic}
  onJumpToCode={handleJumpToCode}
  isLoading={isMappingLookupInProgress}
/>
```

**位置建议：**

- 放在中间分隔条上（类似 Overleaf）
- 或者在顶部工具栏的右侧

#### 1.3 添加临时占位处理函数

```typescript
const handleJumpToSemantic = async () => {
  console.log("TODO: 实现代码到语义的跳转");
  // 暂时显示提示
};

const handleJumpToCode = async () => {
  console.log("TODO: 实现语义到代码的跳转");
};
```

**测试点：**

- [ ] 按钮正确显示在界面上
- [ ] 点击按钮触发 console 输出
- [ ] 按钮样式符合设计规范
- [ ] Loading 状态正常显示

---

### 阶段 2：移除自动触发逻辑

**目标：** 删除现有的点击自动高亮机制

#### 2.1 修改组件中的触发逻辑

**修改文件：**

- [RequirementDisplay.tsx](gui/src/pages/codeaware/components/Requirements/RequirementDisplay.tsx#L379-L390)
- [Step.tsx](gui/src/pages/codeaware/components/Steps/Step.tsx#L338-L342)
- [KnowledgeCard.tsx](gui/src/pages/codeaware/components/KnowledgeCard/KnowledgeCard.tsx#L387-L391)

**修改内容：**

```typescript
// RequirementDisplay.tsx - 修改 handleChunkClick
// 移除：调用 onChunkFocus 触发 HighlightEvent（这会高亮代码）
// 保留：滚动到对应步骤位置
// 新增：只高亮当前点击的高级步骤（不触发代码高亮）
- if (onChunkFocus && step) {
-   const highlightEvent: HighlightEvent = {
-     sourceType: "highLevelStep",
-     identifier: chunkId,
-   }
-   onChunkFocus(highlightEvent);  // 删除这个调用
- }
+ // 仅设置当前高级步骤为高亮状态
+ dispatch(setHighlightedElement({ type: 'highLevelStep', id: chunkId }));

// Step.tsx - 修改展开时的行为
// 移除：展开时触发 HighlightEvent
// 保留：展开/折叠动画和内容显示
// 新增：点击步骤标题时高亮该步骤（不是展开时）
- if (onHighlightEvent && stepId && willBeExpanded && !wasExpanded) {
-   onHighlightEvent({
-     sourceType: "step",
-     identifier: stepId,
-   });  // 删除展开时的高亮触发
- }
+ // 在点击标题时（而非展开时）设置高亮
+ const handleTitleClick = () => {
+   dispatch(setHighlightedElement({ type: 'step', id: stepId }));
+ };

// KnowledgeCard.tsx - 修改展开时的行为
// 移除：展开时触发 HighlightEvent
// 保留：展开/折叠动画和内容显示
// 新增：点击卡片标题时高亮该卡片
- if (!wasExpanded && onHighlightEvent && cardId) {
-   onHighlightEvent({
-     sourceType: "knowledgeCard",
-     identifier: cardId,
-   });  // 删除展开时的高亮触发
- }
+ // 在点击标题时设置高亮
+ const handleTitleClick = () => {
+   dispatch(setHighlightedElement({ type: 'knowledgeCard', id: cardId }));
+ };
```

**新增 Reducer：**

```typescript
// 在 codeAwareSlice.ts 中添加
setHighlightedElement: (state, action: PayloadAction<{
  type: 'highLevelStep' | 'step' | 'knowledgeCard';
  id: string;
}>) => {
  const { type, id } = action.payload;

  // 清除所有现有高亮
  state.highLevelSteps.forEach(s => s.isHighlighted = false);
  state.steps.forEach(s => {
    s.isHighlighted = false;
    s.knowledgeCards.forEach(kc => kc.isHighlighted = false);
  });

  // 设置新的高亮元素
  if (type === 'highLevelStep') {
    const step = state.highLevelSteps.find(s => s.id === id);
    if (step) step.isHighlighted = true;
  } else if (type === 'step') {
    const step = state.steps.find(s => s.id === id);
    if (step) step.isHighlighted = true;
  } else if (type === 'knowledgeCard') {
    for (const step of state.steps) {
      const card = step.knowledgeCards.find(kc => kc.id === id);
      if (card) {
        card.isHighlighted = true;
        break;
      }
    }
  }
},
```

**保留内容：**

- 保留滚动到对应位置的逻辑（点击高级步骤时）
- 保留 `onClearHighlight` 的调用（清除所有高亮）
- 保留日志记录逻辑
- 保留展开/折叠的其他逻辑

#### 2.2 简化 Props 定义

**可选操作（视情况而定）：**

- 从组件 Props 中移除 `onHighlightEvent`
- 或保留但标记为 `deprecated`（逐步迁移）

#### 2.3 保留手动清除高亮功能

**保持不变：**

- `clearAllHighlights` action 继续工作
- 用户可以手动点击清除按钮
- 折叠元素时自动清除高亮

**测试点：**

- [ ] 点击高级步骤 → 页面滚动到对应位置 + 该步骤高亮 + 代码不高亮
- [ ] 点击步骤标题 → 该步骤高亮 + 代码不高亮
- [ ] 点击知识卡片 → 该卡片高亮 + 代码不高亮
- [ ] 展开/折叠步骤 → 不触发任何高亮变化
- [ ] 右侧同时只有一个元素处于高亮状态
- [ ] 清除高亮按钮仍然有效

---

### 阶段 3：重构 Mapping 数据结构

**目标：** 简化映射存储，移除冗余字段

#### 3.1 更新 TypeScript 类型定义

**修改文件：** [core/index.d.ts](core/index.d.ts)

```typescript
// 直接替换旧定义（不保留向后兼容）
export interface CodeAwareMapping {
  codeChunkId: string;
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";

  // 缓存元数据
  createdAt: number;
  source: "llm" | "manual" | "initial";
  confidence?: number;
}
```

**说明：**

- 直接覆盖旧的 `CodeAwareMapping` 定义
- 不需要 V2 后缀，不需要联合类型
- 现有的 mappings 数据会被清空重建

#### 3.2 更新 Redux State

**修改文件：** [codeAwareSlice.ts](gui/src/redux/slices/codeAwareSlice.ts)

```typescript
export type CodeAwareSessionState = {
  // ...其他字段...

  // 直接使用新的 mapping 类型（不需要V2后缀）
  codeAwareMappings: CodeAwareMapping[];

  // 删除冗余的层级映射
  // - stepToHighLevelMappings: StepToHighLevelMapping[];  // 删除此行

  // 添加查找状态
  mappingLookup: {
    isLoading: boolean;
    lastQuery?: {
      type: "code" | "semantic";
      elementId: string;
      timestamp: number;
    };
    error?: string;
  };
};
```

**初始化状态：**

```typescript
const initialCodeAwareState: CodeAwareSessionState = {
  // ...其他字段...
  codeAwareMappings: [], // 空数组，不需要迁移
  mappingLookup: {
    isLoading: false,
    lastQuery: undefined,
    error: undefined,
  },
};
```

#### 3.3 删除 stepToHighLevelMappings 相关代码

**删除内容：**

1. State 定义中的 `stepToHighLevelMappings` 字段
2. `setStepToHighLevelMappings` reducer
3. `selectStepToHighLevelMappings` selector
4. Generation thunk 中构建此映射的逻辑

**替代方案：**

- 需要层级关系时，直接遍历 `steps` 数组
- 使用索引作为隐式顺序
- 或在 `HighLevelStepItem` / `StepItem` 中添加 `order` 字段

**测试点：**

- [ ] 新的 mapping 类型定义正确
- [ ] 删除 stepToHighLevelMappings 后编译无错误
- [ ] State 初始化正确
- [ ] 现有功能不受影响（已有 mappings 会被清空重建）

---

### 阶段 4：实现缓存查找机制

**目标：** 实现基于缓存的映射查找，避免重复 LLM 调用

#### 4.1 添加缓存查找 Selectors

**新建文件：** [gui/src/redux/selectors/mappingSelectors.ts](gui/src/redux/selectors/mappingSelectors.ts)

```typescript
import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { CodeAwareMapping } from "core";

// 根据代码块 ID 查找语义元素
export const selectSemanticElementsByCodeChunkId = createSelector(
  (state: RootState) => state.codeAwareSession.codeAwareMappings,
  (_: RootState, codeChunkId: string) => codeChunkId,
  (mappings, codeChunkId): CodeAwareMapping[] => {
    return mappings.filter((m) => m.codeChunkId === codeChunkId);
  },
);

// 根据语义元素 ID 查找代码块
export const selectCodeChunksBySemanticElementId = createSelector(
  (state: RootState) => state.codeAwareSession.codeAwareMappings,
  (_: RootState, semanticElementId: string) => semanticElementId,
  (mappings, semanticElementId): CodeAwareMapping[] => {
    return mappings.filter((m) => m.semanticElementId === semanticElementId);
  },
);

// 检查缓存是否存在
export const hasCachedMapping = createSelector(
  (state: RootState) => state.codeAwareSession.codeAwareMappings,
  (
    _: RootState,
    params: { codeChunkId?: string; semanticElementId?: string },
  ) => params,
  (mappings, params): boolean => {
    if (params.codeChunkId) {
      return mappings.some((m) => m.codeChunkId === params.codeChunkId);
    }
    if (params.semanticElementId) {
      return mappings.some(
        (m) => m.semanticElementId === params.semanticElementId,
      );
    }
    return false;
  },
);
```

#### 4.2 实现缓存管理 Reducers

**修改文件：** [codeAwareSlice.ts](gui/src/redux/slices/codeAwareSlice.ts)

```typescript
reducers: {
  // ... 其他 reducers ...

  // 添加映射到缓存
  addMappingToCache: (state, action: PayloadAction<CodeAwareMapping>) => {
    const newMapping = action.payload;

    // 检查是否已存在相同的映射
    const exists = state.codeAwareMappings.some(
      m => m.codeChunkId === newMapping.codeChunkId &&
           m.semanticElementId === newMapping.semanticElementId
    );

    if (!exists) {
      state.codeAwareMappings.push(newMapping);
    }
  },

  // 批量添加映射
  addMappingsToBatch: (state, action: PayloadAction<CodeAwareMapping[]>) => {
    const newMappings = action.payload;
    const existingSet = new Set(
      state.codeAwareMappings.map(m => `${m.codeChunkId}-${m.semanticElementId}`)
    );

    newMappings.forEach(mapping => {
      const key = `${mapping.codeChunkId}-${mapping.semanticElementId}`;
      if (!existingSet.has(key)) {
        state.codeAwareMappings.push(mapping);
        existingSet.add(key);
      }
    });
  },

  // 清除过期缓存（可选：基于时间戳）
  cleanupExpiredMappings: (state, action: PayloadAction<number>) => {
    const expirationTime = action.payload; // 毫秒
    const now = Date.now();

    state.codeAwareMappings = state.codeAwareMappings.filter(
      m => (now - m.createdAt) < expirationTime
    );
  },

  // 设置查找状态
  setMappingLookupLoading: (state, action: PayloadAction<boolean>) => {
    state.mappingLookup.isLoading = action.payload;
  },

  setMappingLookupError: (state, action: PayloadAction<string | undefined>) => {
    state.mappingLookup.error = action.payload;
  },
}
```

**测试点：**

- [ ] 添加映射到缓存成功
- [ ] 重复映射不会被添加
- [ ] Selector 正确查找缓存
- [ ] 过期缓存可以被清理

---

### 阶段 5：实现 LLM 映射查找

**目标：** 当缓存不存在时，使用 LLM 快速查找对应关系

#### 5.1 设计 LLM Prompt

**策略选择：**

**方案一：快速定位（推荐 ✅）**

- 使用轻量级模型（GPT-3.5-turbo / Claude Haiku）
- 简单的语义匹配，一次调用返回完整结果
- 参考 codeAwareGeneration.ts 的 `ideMessenger.request("llm/complete")` 方式
- 速度目标：< 1.5s

**优势：**

- ✅ 简单直接，易于实现和调试
- ✅ 已验证可靠（codeAwareGeneration.ts 大量使用）
- ✅ 易于实现缓存和错误处理
- ✅ 可复用现有的重试机制和超时控制

**方案二：Agent Tool Call（暂不使用）**

- 使用流式 LLM + tool call 机制
- 适用于需要多步推理的复杂场景
- **不适合当前场景**：映射查找是简单匹配任务，不需要复杂推理

---

**Prompt 设计（方案一）：**

```typescript
// 代码 → 语义
function constructCodeToSemanticPrompt(
  codeContent: string,
  candidates: Array<{id: string; type: string; title: string}>,
): string {
  const candidatesList = candidates
    .slice(0, 20) // 限制候选数量
    .map((c, i) => `${i+1}. [${c.type}] ${c.id}: ${c.title.substring(0, 50)}`)
    .join('\n');

  return `你是代码语义匹配助手。快速识别代码对应的学习步骤。

代码片段（${codeContent.length} 字符）:
\`\`\`
${codeContent.substring(0, 500)}
\`\`\`

候选元素（最多选3个）:
${candidatesList}

要求：
1. 返回最相关的1-3个元素
2. 按相关性排序
3. 置信度：0-1（1最相关）

JSON格式（必须）:
{"matches":[{"id":"step-1","type":"step","confidence":0.9}]}`;
}

// 语义 → 代码
function constructSemanticToCodePrompt(
  semanticType: string,
  semanticContent: string,
  codeChunks: Array<{id: string; content: string}>,
): string {
  const chunksList = codeChunks
    .slice(0, 15) // 限制候选数量
    .map((c, i) => `${i+1}. ${c.id}: ${c.content.substring(0, 80)}...`)
    .join('\n');

  return `你是代码语义匹配助手。找到与学习步骤相关的代码。

语义元素:
import { ThunkApiType } from "../store";
import {
  selectSemanticElementsByCodeChunkId,
  selectCodeChunksBySemanticElementId,
} from "../selectors/mappingSelectors";
import {
  addMappingsToBatch,
  setMappingLookupLoading,
  setMappingLookupError,
} from "../slices/codeAwareSlice";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../selectors/modelSelectors";

interface LookupCodeToSemanticParams {
  codeChunkId: string;
  useCache?: boolean;
}

interface LookupSemanticToCodeParams {
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";
  useCache?: boolean;
}

// 代码 → 语义查找
export const lookupCodeToSemantic = createAsyncThunk<
  CodeAwareMapping[],
  LookupCodeToSemanticParams,
  ThunkApiType
>(
  "codeAware/lookupCodeToSemantic",
  async ({ codeChunkId, useCache = true }, { getState, dispatch, extra }) => {
    // 1. 检查缓存
    if (useCache) {
      const cachedMappings = selectSemanticElementsByCodeChunkId(
        getState(),
        codeChunkId,
      );
      if (cachedMappings.length > 0) {
        console.log("✅ 缓存命中，直接返回映射");
        return cachedMappings;
      }
    }

    // 2. 准备 LLM 查询数据
    const state = getState();
    const codeChunk = state.codeAwareSession.codeChunks.find(
      (c) => c.id === codeChunkId,
    );
    if (!codeChunk) {
      throw new Error(`Code chunk ${codeChunkId} not found`);
    }

    // 获取所有候选语义元素（限制数量）
    const candidates = [
      ...state.codeAwareSession.highLevelSteps.slice(0, 10).map((s) => ({
        id: s.id,
        type: "highLevelStep" as const,
        title: s.content,
      })),
      ...state.codeAwareSession.steps.slice(0, 20).map((s) => ({
        id: s.id,
        type: "step" as const,
        title: s.title,
      })),
    ];

    // 3. 获取模型配置
    const defaultModel =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);
    if (!defaultModel) {
      throw new Error("No LLM model available");
    }

    // 4. 构造 prompt
    const prompt = constructCodeToSemanticPrompt(
      codeChunk.content,
      candidates,
    );

    // 5. 调用 LLM（参考 codeAwareGeneration 的重试逻辑）
    dispatch(setMappingLookupLoading(true));

    const maxRetries = 2;
    let result: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 LLM 映射查找尝试 ${attempt}/${maxRetries}`);

        // 超时控制（1.5秒）
        const llmPromise = extra.ideMessenger.request("llm/complete", {
          prompt,
          completionOptions: {
            temperature: 0.3, // 降低温度提高确定性
            maxTokens: 500, // 限制输出长度
          },
          title: defaultModel.title,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("LLM 查询超时")), 1500),
        );

        result = await Promise.race([llmPromise, timeoutPromise]);

        if (result.status === "success" && result.content) {
          break; // 成功，跳出重试循环
        }
      } catch (error) {
        console.warn(
          `⚠️ LLM 查找第 ${attempt} 次尝试失败:`,
          error instanceof Error ? error.message : error,
        );

        // 如果是最后一次尝试，使用模糊匹配降级
        if (attempt === maxRetries) {
          console.log("🔀 LLM 查找失败，使用模糊匹配降级");
          const fallbackMappings = fuzzyMatchCodeToSemantic(
            codeChunk,
            candidates,
          );
          dispatch(addMappingsToBatch(fallbackMappings));
          dispatch(setMappingLookupLoading(false));
          return fallbackMappings;
        }

        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // 6. 解析 LLM 响应
    try {
      const parsed = JSON.parse(result.content);
      const newMappings: CodeAwareMapping[] = parsed.matches.map(
        (match: any) => ({
          codeChunkId,
          semanticElementId: match.id,
          semanticElementType: match.type,
          createdAt: Date.now(),
          source: "llm" as const,
          confidence: match.confidence,
        }),
      );

      console.log(`✅ LLM 返回 ${newMappings.length} 个映射`);

      // 7. 添加到缓存
      dispatch(addMappingsToBatch(newMappings));
      dispatch(setMappingLookupLoading(false));

      return newMappings;
    } catch (parseError) {
      console.error("❌ LLM 响应解析失败:", parseError);
      dispatch(
        setMappingLookupError("LLM 响应格式错误，使用模糊匹配降级"),
      );

      // 解析失败，使用模糊匹配
      const fallbackMappings = fuzzyMatchCodeToSemantic(codeChunk, candidates);
      dispatch(addMappingsToBatch(fallbackMappings));
      dispatch(setMappingLookupLoading(false));
      return fallbackMappings;
    }
  },
);

// 语义 → 代码查找
export const lookupSemanticToCode = createAsyncThunk<
  CodeAwareMapping[],
  LookupSemanticToCodeParams,
  ThunkApiType
>(
  "codeAware/lookupSemanticToCode",
  async (
    { semanticElementId, semanticElementType, useCache = true },
    { getState, dispatch, extra },
  ) => {
    // 1. 检查缓存
    if (useCache) {
      const cachedMappings = selectCodeChunksBySemanticElementId(
        getState(),
        semanticElementId,
        semanticElementType,
      );
      if (cachedMappings.length > 0) {
        console.log("✅ 缓存命中，直接返回映射");
        return cachedMappings;
      }
    }

    // 2. 准备数据
    const state = getState();
    let semanticContent = "";

    if (semanticElementType === "highLevelStep") {
      const hlStep = state.codeAwareSession.highLevelSteps.find(
        (s) => s.id === semanticElementId,
      );
      semanticContent = hlStep?.content || "";
    } else if (semanticElementType === "step") {
      const step = state.codeAwareSession.steps.find(
        (s) => s.id === semanticElementId,
      );
      semanticContent = `${step?.title}: ${step?.abstract || ""}`;
    } else {
      // knowledgeCard
      const card = state.codeAwareSession.steps
        .flatMap((s) => s.knowledgeCards)
        .find((kc) => kc.id === semanticElementId);
      semanticContent = `${card?.title}: ${card?.content?.substring(0, 200) || ""}`;
    }

    const codeChunks = state.codeAwareSession.codeChunks.slice(0, 15); // 限制候选数量

    // 3. 构造 prompt
    const prompt = constructSemanticToCodePrompt(
      semanticElementType,
      semanticContent,
      codeChunks,
    );

    // 4. 获取模型配置
    const defaultModel =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);
    if (!defaultModel) {
      throw new Error("No LLM model available");
    }

    // 5. 调用 LLM（同样的重试逻辑）
    dispatch(setMappingLookupLoading(true));

    const maxRetries = 2;
    let result: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const llmPromise = extra.ideMessenger.request("llm/complete", {
          prompt,
          completionOptions: {
            temperature: 0.3,
            maxTokens: 500,
          },
          title: defaultModel.title,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("LLM 查询超时")), 1500),
        );

        result = await Promise.race([llmPromise, timeoutPromise]);

        if (result.status === "success" && result.content) {
          break;
        }
      } catch (error) {
        if (attempt === maxRetries) {
          // 降级处理
          const fallbackMappings = fuzzyMatchSemanticToCode(
            semanticElementId,
            semanticElementType,
            semanticContent,
            codeChunks,
          );
          dispatch(addMappingsToBatch(fallbackMappings));
          dispatch(setMappingLookupLoading(false));
          return fallbackMappings;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // 6. 解析响应
    try {
      const parsed = JSON.parse(result.content);
      const newMappings: CodeAwareMapping[] = parsed.matches.map(
        (match: any) => ({
          codeChunkId: match.id,
          semanticElementId,
          semanticElementType,
          createdAt: Date.now(),
          source: "llm" as const,
          confidence: match.confidence,
        }),
      );

      dispatch(addMappingsToBatch(newMappings));
      dispatch(setMappingLookupLoading(false));
      return newMappings;
    } catch (parseError) {
      // 降级处理
      const fallbackMappings = fuzzyMatchSemanticToCode(
        semanticElementId,
        semanticElementType,
        semanticContent,
        codeChunks,
      );
      dispatch(addMappingsToBatch(fallbackMappings));
      dispatch(setMappingLookupLoading(false));
      return fallbackMappings;
    }
  },
);

// 辅助函数：模糊匹配降级方案（代码 → 语义）
function fuzzyMatchCodeToSemantic(
  codeChunk: any,
  candidates: Array<{ id: string; type: string; title: string }>,
): CodeAwareMapping[] {
  // 简单实现：基于关键词匹配
  const codeKeywords = extractKeywords(codeChunk.content);
  const matches = candidates
    .map((candidate) => {
      const titleKeywords = extractKeywords(candidate.title);
      const commonKeywords = codeKeywords.filter((kw) =>
        titleKeywords.includes(kw),
      );
      const score = commonKeywords.length / Math.max(codeKeywords.length, 1);
      return { candidate, score };
    })
    .filter((m) => m.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ candidate, score }) => ({
      codeChunkId: codeChunk.id,
      semanticElementId: candidate.id,
      semanticElementType: candidate.type as any,
      createdAt: Date.now(),
      source: "manual" as const, // 标记为手动匹配
      confidence: score,
    }));

  return matches;
}

// 辅助函数：模糊匹配降级方案（语义 → 代码）
function fuzzyMatchSemanticToCode(
  semanticElementId: string,
  semanticElementType: string,
  semanticContent: string,
  codeChunks: any[],
): CodeAwareMapping[] {
  const semanticKeywords = extractKeywords(semanticContent);
  const matches = codeChunks
    .map((chunk) => {
      const codeKeywords = extractKeywords(chunk.content);
      const commonKeywords = semanticKeywords.filter((kw) =>
        codeKeywords.includes(kw),
      );
      const score = commonKeywords.length / Math.max(semanticKeywords.length, 1);
      return { chunk, score };
    })
    .filter((m) => m.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ chunk, score }) => ({
      codeChunkId: chunk.id,
      semanticElementId,
      semanticElementType: semanticElementType as any,
      createdAt: Date.now(),
      source: "manual" as const,
      confidence: score,
    }));

  return matches;
}

// 辅助函数：提取关键词
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3) // 过滤短词
    .filter(
      (word) =>
        !["function", "const", "return", "import", "export"].includes(word),
    ); // 过滤常见词
}

// 辅助函数：构造 prompt（单独导出以便测试）
export function constructCodeToSemanticPrompt(
  codeContent: string,
  candidates: Array<{ id: string; type: string; title: string }>,
): string {
  const candidatesList = candidates
    .slice(0, 20)
    .map((c, i) => `${i + 1}. [${c.type}] ${c.id}: ${c.title.substring(0, 50)}`)
    .join("\n");

  return `你是代码语义匹配助手。快速识别代码对应的学习步骤。

代码片段（${codeContent.length} 字符）:
\`\`\`
${codeContent.substring(0, 500)}
\`\`\`

候选元素（最多选3个）:
${candidatesList}

要求：
1. 返回最相关的1-3个元素
2. 按相关性排序
3. 置信度：0-1（1最相关）

JSON格式（必须）:
{"matches":[{"id":"step-1","type":"step","confidence":0.9}]}`;
}

export function constructSemanticToCodePrompt(
  semanticType: string,
  semanticContent: string,
  codeChunks: Array<{ id: string; content: string }>,
): string {
  const chunksList = codeChunks
    .slice(0, 15)
    .map((c, i) => `${i + 1}. ${c.id}: ${c.content.substring(0, 80)}...`)
    .join("\n");

  return `你是代码语义匹配助手。找到与学习步骤相关的代码。

语义元素:
类型: ${semanticType}
内容: ${semanticContent.substring(0, 300)}

候选代码块:
${chunksList}

要求：
1. 返回最相关的1-3个代码块
2. 按相关性排序
3. 置信度：0-1

JSON格式（必须）:
{"matches":[{"id":"c-1","confidence":0.85}]}`

// 语义 → 代码查找（类似实现）
export const lookupSemanticToCode = createAsyncThunk<
  CodeAwareMapping[],
  LookupSemanticToCodeParams,
  { state: RootState }
>("codeAware/lookupSemanticToCode", async (params, { getState, dispatch }) => {
  // 实现类似的逻辑
  // ...
});

// 辅助函数：调用 LLM
async function callLLMForMapping(params: any): Promise<any> {
  // TODO: 接入实际的 LLM API
  // 可以复用现有的 streamChat 逻辑

  // 临时模拟实现
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        matches: [{ id: "step-1", type: "step", confidence: 0.85 }],
      });
    }, 500);
  });
}
```

#### 5.3 性能优化和错误处理

**性能优化策略：**

1. **限制候选数量**

   - 代码 → 语义：最多 20 个候选元素（10 个高级步骤 + 20 个步骤）
   - 语义 → 代码：最多 15 个代码块

2. **内容截断**

   - 代码内容：前 500 字符
   - 语义内容：前 300 字符
   - 标题：前 50 字符

3. **超时控制**

   - 单次 LLM 调用超时：1.5 秒
   - 超时后自动降级到模糊匹配

4. **重试机制**
   - 最多重试 2 次
   - 指数退避：300ms 延迟
   - 所有重试失败后使用模糊匹配降级

**错误处理：**

```typescript
// 完整的错误处理流程
try {
  result = await Promise.race([llmPromise, timeoutPromise]);
} catch (error) {
  if (error.message === "LLM 查询超时") {
    // 超时降级
    return fuzzyMatchCodeToSemantic(codeChunk, candidates);
  }

  if (attempt < maxRetries) {
    // 重试
    await delay(300);
    continue;
  }

  // 最终降级
  return fuzzyMatchCodeToSemantic(codeChunk, candidates);
}
```

**降级方案：模糊匹配**

当 LLM 查询失败、超时或解析错误时，使用基于关键词的模糊匹配：

1. 提取代码/语义文本的关键词
2. 计算关键词交集
3. 按匹配度排序，取前 3 个
4. 标记 `source: "manual"`，表示非 LLM 生成

**测试点：**

- [ ] LLM 查询返回正确 JSON 格式
- [ ] 查询时间 < 1.5s (P95)
- [ ] 缓存命中时立即返回 (< 100ms)
- [ ] 查询失败自动降级到模糊匹配
- [ ] 超时控制正常工作
- [ ] 重试机制正常工作
- [ ] 模糊匹配返回合理结果

---

### 阶段 6：实现跳转按钮功能

**目标：** 连接 UI 按钮和查找逻辑

#### 6.1 实现代码 → 语义跳转

**修改文件：** [CodeAware.tsx](gui/src/pages/codeaware/CodeAware.tsx)

```typescript
// 获取当前聚焦的代码位置
const getCurrentFocusedCode = useCallback(() => {
  // 方案 1: 使用 IDE 的光标位置
  // 通过 IDE API 获取当前文件和行号

  // 方案 2: 使用最近一次高亮的代码块
  const highlightedChunk = codeChunks.find((c) => c.isHighlighted);

  // 方案 3: 让用户先选择一个代码块
  // 显示代码块选择器

  return highlightedChunk?.id || null;
}, [codeChunks]);

const handleJumpToSemantic = useCallback(async () => {
  // 1. 获取当前聚焦的代码
  const codeChunkId = getCurrentFocusedCode();
  if (!codeChunkId) {
    // 提示用户选择代码块
    alert("请先选择或高亮一个代码块");
    return;
  }

  // 2. 查找对应的语义元素
  try {
    const mappings = await dispatch(
      lookupCodeToSemantic({ codeChunkId }),
    ).unwrap();

    if (mappings.length === 0) {
      alert("未找到相关的语义元素");
      return;
    }

    // 3. 高亮找到的语义元素
    const topMatch = mappings[0]; // 选择置信度最高的
    dispatch(
      updateHighlight({
        sourceType: topMatch.semanticElementType,
        identifier: topMatch.semanticElementId,
      }),
    );

    // 4. 滚动到对应位置
    scrollToSemanticElement(topMatch.semanticElementId);

    // 5. 记录日志
    await logger.addLogEntry("user_jump_code_to_semantic", {
      codeChunkId,
      matchedElement: topMatch.semanticElementId,
      confidence: topMatch.confidence,
      source: topMatch.source,
    });
  } catch (error) {
    console.error("跳转失败:", error);
    alert("跳转失败，请重试");
  }
}, [dispatch, codeChunks, logger]);
```

#### 6.2 实现语义 → 代码跳转

```typescript
const getCurrentFocusedSemantic = useCallback(() => {
  // 查找当前高亮或展开的语义元素

  // 优先级：knowledgeCard > step > highLevelStep
  for (const step of steps) {
    for (const card of step.knowledgeCards) {
      if (card.isHighlighted) {
        return { id: card.id, type: "knowledgeCard" as const };
      }
    }
    if (step.isHighlighted) {
      return { id: step.id, type: "step" as const };
    }
  }

  const hlStep = highLevelSteps.find((s) => s.isHighlighted);
  if (hlStep) {
    return { id: hlStep.id, type: "highLevelStep" as const };
  }

  return null;
}, [steps, highLevelSteps]);

const handleJumpToCode = useCallback(async () => {
  // 1. 获取当前聚焦的语义元素
  const semantic = getCurrentFocusedSemantic();
  if (!semantic) {
    alert("请先选择一个语义元素");
    return;
  }

  // 2. 查找对应的代码块
  try {
    const mappings = await dispatch(
      lookupSemanticToCode({
        semanticElementId: semantic.id,
        semanticElementType: semantic.type,
      }),
    ).unwrap();

    if (mappings.length === 0) {
      alert("未找到相关的代码");
      return;
    }

    // 3. 高亮找到的代码块
    const codeChunkIds = mappings.map((m) => m.codeChunkId);
    dispatch(
      updateHighlight({
        sourceType: "code",
        identifier: codeChunkIds[0],
      }),
    );

    // 4. 通知 IDE 跳转到代码位置
    const codeChunk = codeChunks.find((c) => c.id === codeChunkIds[0]);
    if (codeChunk) {
      // 调用 IDE API 跳转
      // ideMessenger.post('jumpToCode', { file: codeChunk.filePath, line: codeChunk.range[0] });
    }

    // 5. 记录日志
    await logger.addLogEntry("user_jump_semantic_to_code", {
      semanticElementId: semantic.id,
      matchedCode: codeChunkIds,
      source: mappings[0].source,
    });
  } catch (error) {
    console.error("跳转失败:", error);
    alert("跳转失败，请重试");
  }
}, [dispatch, steps, highLevelSteps, codeChunks, logger]);
```

#### 6.3 添加辅助功能

```typescript
// 滚动到语义元素
const scrollToSemanticElement = (elementId: string) => {
  const element = document.querySelector(`[data-element-id="${elementId}"]`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

// 智能选择代码块（如果没有明确聚焦）
const smartSelectCodeChunk = async () => {
  // 从 IDE 获取当前光标位置
  const cursorPosition = await ideMessenger.request("getCursorPosition", {});

  // 找到包含该位置的代码块
  const matchingChunk = codeChunks.find(
    (chunk) =>
      chunk.filePath === cursorPosition.file &&
      chunk.range[0] <= cursorPosition.line &&
      chunk.range[1] >= cursorPosition.line,
  );

  return matchingChunk?.id || null;
};
```

**测试点：**

- [ ] 点击右箭头按钮跳转到语义元素
- [ ] 点击左箭头按钮跳转到代码
- [ ] 未找到映射时有提示
- [ ] 滚动到目标元素
- [ ] IDE 正确跳转到代码位置

---

### 阶段 7：优化用户体验

**目标：** 提升交互流畅度和反馈

#### 7.1 添加 Loading 状态

```typescript
// NavigationButtons.tsx
{isLoading ? (
  <SpinnerIcon className="animate-spin" />
) : (
  <>
    <ArrowLeftIcon />
    <ArrowRightIcon />
  </>
)}
```

#### 7.2 添加多结果选择

**场景：** LLM 返回多个匹配结果时

```typescript
// 显示选择列表
const showMatchResults = (mappings: CodeAwareMapping[]) => {
  // 方案 A: 自动选择置信度最高的
  const topMatch = mappings.sort(
    (a, b) => (b.confidence || 0) - (a.confidence || 0),
  )[0];

  // 方案 B: 显示弹窗让用户选择
  if (mappings.length > 1) {
    // 显示 modal 或 dropdown
    return;
  }

  // 高亮选中的结果
  highlightElement(topMatch);
};
```

#### 7.3 添加键盘快捷键

```typescript
// CodeAware.tsx
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    // Cmd/Ctrl + →: 跳转到语义
    if ((e.metaKey || e.ctrlKey) && e.key === "ArrowRight") {
      e.preventDefault();
      handleJumpToSemantic();
    }

    // Cmd/Ctrl + ←: 跳转到代码
    if ((e.metaKey || e.ctrlKey) && e.key === "ArrowLeft") {
      e.preventDefault();
      handleJumpToCode();
    }
  };

  window.addEventListener("keydown", handleKeyPress);
  return () => window.removeEventListener("keydown", handleKeyPress);
}, [handleJumpToSemantic, handleJumpToCode]);
```

#### 7.4 添加 Toast 通知

```typescript
// 成功通知
toast.success(`找到 ${mappings.length} 个相关元素`);

// 失败通知
toast.error("未找到相关元素，请重试");

// Loading 通知
toast.info("正在查找对应关系...");
```

**测试点：**

- [ ] Loading 状态正确显示
- [ ] 多结果选择流畅
- [ ] 键盘快捷键有效
- [ ] 通知提示清晰

---

### 阶段 8：清理和测试

**目标：** 移除废弃代码，完善测试

#### 8.1 清理废弃代码

**删除内容：**

1. `updateHighlight` reducer 中的自动匹配逻辑
2. `stepToHighLevelMappings` 相关的所有代码
3. 组件中无用的 `onHighlightEvent` props（如果已迁移）
4. 旧的 `CodeAwareMapping` 类型（保留一段时间以便迁移）

#### 8.2 添加单元测试

**测试文件：** `mappingLookup.test.ts`

```typescript
import { lookupCodeToSemantic } from "./mappingLookup";

describe("Mapping Lookup", () => {
  it("should use cache when available", async () => {
    // 测试缓存命中
  });

  it("should call LLM when cache miss", async () => {
    // 测试 LLM 调用
  });

  it("should handle LLM errors gracefully", async () => {
    // 测试错误处理
  });

  it("should add new mappings to cache", async () => {
    // 测试缓存添加
  });
});
```

#### 8.3 集成测试

**测试场景：**

1. 用户点击右箭头 → 反应时间 < 2s → 正确跳转
2. 用户点击左箭头 → IDE 正确跳转
3. 点击按钮 → 缓存命中 → 即时跳转 (< 100ms)
4. 连续点击 → 不重复查询

#### 8.4 性能测试

**指标：**

- 缓存命中率 > 80%
- LLM 查询时间 < 1.5s (P95)
- 内存占用 < 50MB（缓存大小）
- 无内存泄漏

**测试点：**

- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 性能指标达标
- [ ] 无明显 Bug

---

## 四、界面变动总结

### 4.1 新增元素

1. **导航按钮组件** (`NavigationButtons.tsx`)

   - 左箭头按钮：跳转到代码
   - 右箭头按钮：跳转到语义
   - Loading 状态指示器
   - 放置位置：中间分隔条或顶部工具栏

2. **多结果选择器**（可选）

   - Modal 或 Dropdown 组件
   - 显示多个匹配结果供用户选择
   - 显示置信度评分

3. **Toast 通知**
   - 成功/失败/进行中通知
   - 自动消失或手动关闭

### 4.2 移除元素

- 无（保持现有界面元素）

### 4.3 行为变化

**之前：**

- 点击高级步骤 → 页面滚动到对应位置 + 自动高亮相关代码 + 自动高亮子步骤
- 展开步骤 → 自动高亮相关代码和知识卡片
- 展开知识卡片 → 自动高亮相关代码

**之后：**

- 点击高级步骤 → **保留**：页面滚动到对应子步骤位置 + 高亮该步骤 | **移除**：不再自动高亮代码
- 点击步骤 → 高亮该步骤 | 不自动高亮代码
- 点击知识卡片 → 高亮该卡片 | 不自动高亮代码
- 展开/折叠 → 仅展开/折叠内容，不触发高亮或跳转
- **新增**：点击导航按钮 → 使用当前高亮元素查找并跳转到对应位置

**高亮机制说明：**

- 右侧语义面板始终只有一个元素处于高亮状态（或无高亮）
- 高亮状态表示当前用户 focus 的对象
- 点击元素 → 该元素变为高亮状态（其他元素取消高亮）
- 点击"找代码对应"按钮 → 使用当前高亮的语义元素查找代码
- 点击"找语义对应"按钮 → 使用当前选中的代码块查找语义元素

---

## 五、存储结构变动总结

### 5.1 Redux State 变化

**新增字段：**

```typescript
mappingLookup: {
  isLoading: boolean;
  lastQuery?: {
    type: 'code' | 'semantic';
    elementId: string;
    timestamp: number;
  };
  error?: string;
}
```

**修改字段：**

```typescript
// 旧：
interface CodeAwareMapping {
  codeChunkId?: string;
  highLevelStepId?: string;
  stepId?: string;
  knowledgeCardId?: string;
  isHighlighted: boolean;
}

// 新：
interface CodeAwareMapping {
  codeChunkId: string;
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";
  createdAt: number;
  source: "llm" | "manual" | "initial";
  confidence?: number;
}
```

**删除字段：**

```typescript
- stepToHighLevelMappings: StepToHighLevelMapping[];
```

### 5.2 Mapping 结构变化

**旧结构：**

```typescript
interface CodeAwareMapping {
  codeChunkId?: string;
  highLevelStepId?: string;
  stepId?: string;
  knowledgeCardId?: string;
  isHighlighted: boolean; // 存储状态
}
```

**新结构：**

```typescript
interface CodeAwareMapping {
  // 必填：直接映射关系
  codeChunkId: string;
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";

  // 缓存元数据
  createdAt: number;
  source: "llm" | "manual" | "initial";
  confidence?: number;
}
```

**变化说明：**

1. **简化映射关系**：从多对多改为一对一
2. **移除状态字段**：不再存储 `isHighlighted`
3. **添加元数据**：记录创建时间、来源、置信度
4. **类型明确**：语义元素类型单独字段

---

## 六、缓存算法设计

### 6.1 缓存策略

**缓存模型：** LRU (Least Recently Used) + Time-based Expiration

**缓存键：**

- 代码 → 语义：`code:${codeChunkId}`
- 语义 → 代码：`semantic:${semanticElementId}`

**缓存值：**

```typescript
{
  mappings: CodeAwareMapping[];
  createdAt: number;
  lastAccessedAt: number;
  hitCount: number;
}
```

### 6.2 缓存生命周期

**写入时机：**

1. 初始加载时（从 LLM 批量生成）
2. 用户手动触发查找后
3. 用户确认或修正映射后

**更新时机：**

1. 代码内容变化（检测到编辑）
2. 语义元素内容变化（步骤编辑）
3. 用户手动刷新缓存

**失效时机：**

1. 超过 24 小时未访问（可配置）
2. 关联的元素被删除
3. 用户手动清除缓存

### 6.3 缓存查找流程

```
用户点击跳转按钮
  ↓
获取当前聚焦元素 ID
  ↓
查询本地缓存 (Redux State)
  ↓
命中？
  ├─ 是 → 直接返回 → 更新 lastAccessedAt
  └─ 否 → 调用 LLM 查找
         ↓
       成功？
         ├─ 是 → 写入缓存 → 返回结果
         └─ 否 → 降级处理（模糊匹配/用户选择）
```

### 6.4 缓存优化

**预加载策略：**

- 用户打开 session 时，后台预加载常用映射
- 优先加载已展开元素的映射

**内存管理：**

- 最多缓存 1000 条映射（超出时 LRU 淘汰）
- 定期清理低 confidence 的映射

**持久化：**

- 缓存保存到 localStorage（可选）
- Session 关闭时保存，下次打开时恢复

**命中率监控：**

```typescript
{
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number; // cacheHits / totalQueries
}
```

### 6.5 降级处理

**当 LLM 查找失败时：**

1. **方案 1：模糊匹配**

   - 使用文本相似度算法（如 Levenshtein）
   - 匹配关键词或代码片段

2. **方案 2：让用户选择**

   - 显示所有可能的元素列表
   - 用户手动选择正确的映射
   - 将用户选择标记为 `source: 'manual'` 并缓存

3. **方案 3：显示提示**
   - 提示用户稍后重试
   - 记录失败的查询用于分析

---

## 七、风险和注意事项

### 7.1 技术风险

1. **LLM 性能风险**

   - **问题**：LLM 查询可能较慢
   - **缓解**：使用轻量级模型 + 缓存 + 超时控制

2. **映射准确性风险**

   - **问题**：LLM 可能返回错误的映射
   - **缓解**：显示置信度 + 允许用户手动修正

3. **缓存一致性风险**
   - **问题**：代码或语义内容变化后缓存失效
   - **缓解**：监听内容变化事件 + 定期清理

### 7.2 用户体验风险

1. **学习成本**

   - **问题**：用户需要适应新的交互模式
   - **缓解**：添加引导提示 + 键盘快捷键提示

2. **等待时间**
   - **问题**：首次查找需要等待 LLM 响应
   - **缓解**：显示 Loading 状态 + 预加载

### 7.3 兼容性风险

1. **数据清空**

   - **问题**：现有的 mapping 数据会被清空
   - **缓解**：可以在第一次运行时从代码和语义元素重新生成初始映射

2. **IDE 集成**
   - **问题**：不同 IDE 的 API 可能不同
   - **缓解**：抽象 IDE 接口 + 降级处理

---

## 八、后续优化方向

### 8.1 短期优化（1-2 周）

1. **智能预加载**

   - 基于用户行为预测下一步操作
   - 提前查找可能的映射

2. **多模态匹配**

   - 结合代码语法树（AST）和语义信息
   - 提升匹配准确度

3. **批量操作**
   - 支持一次性查找多个元素的映射
   - 并行 LLM 查询提升效率

### 8.2 中期优化（1-2 月）

1. **自学习机制**

   - 记录用户的手动修正
   - 用于训练或微调模型

2. **可视化映射关系**

   - 显示代码和语义元素的连线图
   - 帮助用户理解对应关系

3. **协作功能**
   - 共享映射缓存给团队成员
   - 减少重复查询

### 8.3 长期优化（3 月+）

1. **离线模式**

   - 使用本地模型进行匹配
   - 无需依赖 LLM API

2. **增量更新**

   - 代码变化时只更新受影响的映射
   - 减少重新计算成本

3. **插件化架构**
   - 支持用户自定义匹配算法
   - 适配不同编程语言和场景

---

## 九、验收标准

### 9.1 功能完整性

- [ ] 用户可以通过按钮显式触发跳转
- [ ] 点击右箭头从代码跳转到语义
- [ ] 点击左箭头从语义跳转到代码
- [ ] 缓存机制正常工作
- [ ] LLM 查找正常工作
- [ ] 点击元素不再自动触发高亮

### 9.2 性能指标

- [ ] 缓存命中时响应时间 < 100ms
- [ ] LLM 查找时响应时间 < 2s (P95)
- [ ] 缓存命中率 > 70%
- [ ] 内存占用 < 50MB

### 9.3 用户体验

- [ ] Loading 状态清晰
- [ ] 错误提示友好
- [ ] 支持键盘快捷键
- [ ] 无明显卡顿

### 9.4 代码质量

- [ ] 所有单元测试通过
- [ ] 代码审查通过
- [ ] 无明显性能问题
- [ ] 文档完整

---

## 十、时间估算

### 总体时间线：2-3 周

| 阶段 | 任务          | 预计时间 | 依赖 |
| ---- | ------------- | -------- | ---- |
| 0    | 准备工作      | 1 天     | -    |
| 1    | 添加 UI 按钮  | 1 天     | 0    |
| 2    | 移除自动触发  | 2 天     | 1    |
| 3    | 重构数据结构  | 3 天     | 2    |
| 4    | 实现缓存机制  | 2 天     | 3    |
| 5    | 实现 LLM 查找 | 3 天     | 4    |
| 6    | 实现跳转功能  | 3 天     | 5    |
| 7    | 优化用户体验  | 2 天     | 6    |
| 8    | 清理和测试    | 3 天     | 7    |

**总计：20 天（约 3 周）**

---

## 附录

### A. 相关文件清单

**需要修改的文件：**

- `core/index.d.ts` - 类型定义
- `gui/src/redux/slices/codeAwareSlice.ts` - State 和 Reducers
- `gui/src/pages/codeaware/CodeAware.tsx` - 主组件
- `gui/src/pages/codeaware/components/Requirements/RequirementDisplay.tsx`
- `gui/src/pages/codeaware/components/Steps/Step.tsx`
- `gui/src/pages/codeaware/components/KnowledgeCard/KnowledgeCard.tsx`

**需要创建的文件：**

- `gui/src/pages/codeaware/components/ToolBar/NavigationButtons.tsx`
- `gui/src/redux/selectors/mappingSelectors.ts`
- `gui/src/redux/thunks/mappingLookup.ts`
- `gui/src/redux/thunks/__tests__/mappingLookup.test.ts`

### B. 参考资料

- [Overleaf Editor](https://www.overleaf.com/) - 参考其双向跳转交互
- [Redux Toolkit Async Thunks](https://redux-toolkit.js.org/api/createAsyncThunk)
- [LLM API 文档]（根据实际使用的模型）

---

**文档版本：** v1.0  
**创建时间：** 2026-02-27  
**作者：** GitHub Copilot  
**状态：** 待审阅

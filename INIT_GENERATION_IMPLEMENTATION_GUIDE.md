# 初始生成流程重构 - 实施指南

**版本**: 1.0  
**日期**: 2026年3月6日  
**预计完成时间**: 10-14天  
**目标**: 将内容生成流程改为在用户确认需求后一次性完成，包括任务分解、代码生成、映射建立、语义分析和知识提取

---

## 总体目的

本次重构旨在**优化CodeAware系统的初始生成体验**，将原本需要多次用户交互和增量生成的流程改造为**一次性批量生成**。

**现状问题**：

- 用户需要逐步确认每个步骤的代码生成，流程冗长
- 步骤、代码、映射关系分散在多个操作中创建，数据一致性难以保证
- 知识点提取和语义分析被延后，无法在初始阶段建立完整的知识图谱

**重构目标**：

- ✨ 用户确认需求后，系统自动完成：任务分解 → 代码生成 → 代码映射 → 语义分析 → 知识提取
- 🚀 提供清晰的进度反馈，用户只需等待而无需频繁交互
- 📊 在生成结束时即可呈现完整的知识图谱和代码结构
- 💾 支持会话保存和恢复，便于后续编辑和学习

通过这次重构，CodeAware将成为一个更加智能和高效的编程学习辅助工具。

---

## 文档使用说明

本文档为开发人员提供逐阶段的实施指导，每个阶段包括：

- ✅ **实施目标**：该阶段要完成什么
- 📋 **具体任务**：需要编写/修改的文件和代码
- 📚 **代码参考**：当前代码库中可以复用的代码
- 🧪 **验证测试**：完成后如何手动测试验证

建议按顺序完成各阶段，每个阶段完成后进行测试验证再继续。

---

## 阶段一：数据结构准备（1-2天）

### ✅ 实施目标

定义新的数据类型并更新Redux store，为后续的代码块关联和知识点提取做准备。

### 📋 任务 1.1：定义新的TypeScript类型

**文件位置**: `core/index.d.ts`

**在现有的 CodeAware 类型定义区域（约520行后）添加**:

```typescript
// CODEAWARE: 代码块之间的语义关联关系
export interface CodeChunkRelation {
  fromChunkId: string;
  toChunkId: string;
  similarity: number; // 余弦相似度，0-1
  createdAt: number;
}

// CODEAWARE: 知识点（从步骤和代码中提取的背景知识）
export interface KnowledgePoint {
  id: string; // 格式: k-{stepId}-{index}，例如 k-s-1-1
  title: string; // 知识点标题，5-10字
  content: string; // 详细描述，1-2句话
  relatedStepIds: string[]; // 关联的步骤ID列表
  category?: "syntax" | "algorithm" | "framework" | "concept"; // 知识类型
  difficulty?: "easy" | "medium" | "hard"; // 难度级别
}

// CODEAWARE: 知识点之间的关联关系
export interface KnowledgeRelation {
  fromKnowledgeId: string;
  toKnowledgeId: string;
  similarity: number; // 余弦相似度，0-1
  relationType?: "prerequisite" | "related"; // 关系类型
  createdAt: number;
}

// CODEAWARE: 初始生成流程的状态
export type InitialGenerationStatus =
  | "idle"
  | "generating-structure"
  | "generating-code"
  | "mapping-code"
  | "analyzing-chunks"
  | "extracting-knowledge"
  | "completed"
  | "error";

// CODEAWARE: 初始生成流程的详细状态
export interface InitialGenerationState {
  status: InitialGenerationStatus;
  currentPhase: string; // 当前阶段的中文描述
  progress: number; // 0-100
  errors: string[]; // 错误信息列表

  // 各阶段的详细状态（可选，用于更细粒度的控制）
  phases?: {
    taskDecomposition: "pending" | "running" | "completed" | "failed";
    codeGeneration: "pending" | "running" | "completed" | "failed";
    codeMapping: "pending" | "running" | "completed" | "failed";
    chunkAnalysis: "pending" | "running" | "completed" | "failed";
    knowledgeExtraction: "pending" | "running" | "completed" | "failed";
  };
}
```

**📚 代码参考**:

- 参考现有的 `CodeChunk`, `CodeAwareMapping` 等类型定义（`core/index.d.ts:529-650`）
- 保持命名风格一致

### 📋 任务 1.2：更新Redux Slice

**文件位置**: `gui/src/redux/slices/codeAwareSlice.ts`

**步骤 1**: 在 `CodeAwareSessionState` 类型定义中添加新字段（约45行处）:

```typescript
export type CodeAwareSessionState = {
  // ... 现有字段 ...

  // 新增：代码块关系图
  codeChunkRelations: CodeChunkRelation[];

  // 新增：知识点列表
  knowledgePoints: KnowledgePoint[];

  // 新增：知识点关系图
  knowledgeRelations: KnowledgeRelation[];

  // 新增：初始生成流程状态
  initialGeneration: InitialGenerationState;

  // 新增：存储所有的代码块（便于后续查询）
  codeChunks: CodeChunk[];
};
```

**步骤 2**: 在 `initialCodeAwareState` 中初始化这些字段（约87行处）:

```typescript
const initialCodeAwareState: CodeAwareSessionState = {
  // ... 现有字段 ...

  codeChunkRelations: [],
  knowledgePoints: [],
  knowledgeRelations: [],
  codeChunks: [],
  initialGeneration: {
    status: "idle",
    currentPhase: "",
    progress: 0,
    errors: [],
  },
};
```

**步骤 3**: 在 `reducers` 中添加新的 actions（约115行后，`reducers` 对象内）:

```typescript
// 代码块相关
setCodeChunks: (state, action: PayloadAction<CodeChunk[]>) => {
  state.codeChunks = action.payload;
},
addCodeChunk: (state, action: PayloadAction<CodeChunk>) => {
  const existingIndex = state.codeChunks.findIndex(
    (chunk) => chunk.id === action.payload.id,
  );
  if (existingIndex >= 0) {
    state.codeChunks[existingIndex] = action.payload;
  } else {
    state.codeChunks.push(action.payload);
  }
},

// 代码块关系相关
setCodeChunkRelations: (
  state,
  action: PayloadAction<CodeChunkRelation[]>,
) => {
  state.codeChunkRelations = action.payload;
},
addCodeChunkRelation: (state, action: PayloadAction<CodeChunkRelation>) => {
  state.codeChunkRelations.push(action.payload);
},

// 知识点相关
setKnowledgePoints: (state, action: PayloadAction<KnowledgePoint[]>) => {
  state.knowledgePoints = action.payload;
},
addKnowledgePoint: (state, action: PayloadAction<KnowledgePoint>) => {
  state.knowledgePoints.push(action.payload);
},

// 知识关系相关
setKnowledgeRelations: (
  state,
  action: PayloadAction<KnowledgeRelation[]>,
) => {
  state.knowledgeRelations = action.payload;
},
addKnowledgeRelation: (state, action: PayloadAction<KnowledgeRelation>) => {
  state.knowledgeRelations.push(action.payload);
},

// 初始生成状态管理
updateInitialGenerationStatus: (
  state,
  action: PayloadAction<Partial<InitialGenerationState>>,
) => {
  state.initialGeneration = {
    ...state.initialGeneration,
    ...action.payload,
  };
},
resetInitialGenerationStatus: (state) => {
  state.initialGeneration = {
    status: 'idle',
    currentPhase: '',
    progress: 0,
    errors: [],
  };
},
addInitialGenerationError: (state, action: PayloadAction<string>) => {
  state.initialGeneration.errors.push(action.payload);
},
```

**步骤 4**: 确保导出这些新的 actions（文件末尾）:

```typescript
export const {
  // ... 现有的 exports ...
  setCodeChunks,
  addCodeChunk,
  setCodeChunkRelations,
  addCodeChunkRelation,
  setKnowledgePoints,
  addKnowledgePoint,
  setKnowledgeRelations,
  addKnowledgeRelation,
  updateInitialGenerationStatus,
  resetInitialGenerationStatus,
  addInitialGenerationError,
} = codeAwareSessionSlice.actions;
```

**📚 代码参考**:

- 参考现有的 `setGeneratedSteps`, `setHighLevelSteps` 等 actions（`codeAwareSlice.ts:127-189`）
- 复用类似的 reducer 模式

### 📋 任务 1.3：创建持久化工具

**文件位置**: `gui/src/utils/codeAwareStorage.ts`（新建文件）

```typescript
import { CodeAwareSessionState } from "../redux/slices/codeAwareSlice";
import { IdeMessengerContext } from "../context/IdeMessenger";

// 持久化数据结构
interface PersistedCodeAwareSession {
  sessionId: string;
  title: string;
  timestamp: string;

  // 节点数据
  nodes: {
    highLevelSteps: any[];
    steps: any[];
    codeChunks: any[];
    knowledgePoints: any[];
  };

  // 关系数据
  relations: {
    stepToHighLevel: any[];
    codeToSemantic: any[];
    codeChunkRelations: any[];
    knowledgeRelations: any[];
  };

  // 元数据
  metadata: {
    userRequirement: string;
    learningGoal: string;
    workspaceDirectory: string;
  };
}

/**
 * 将 Redux state 转换为可持久化的格式
 */
export function serializeSessionState(
  state: CodeAwareSessionState,
): PersistedCodeAwareSession {
  return {
    sessionId: state.currentSessionId,
    title: state.title,
    timestamp: new Date().toISOString(),

    nodes: {
      highLevelSteps: state.highLevelSteps,
      steps: state.steps,
      codeChunks: state.codeChunks,
      knowledgePoints: state.knowledgePoints,
    },

    relations: {
      stepToHighLevel: state.stepToHighLevelMappings,
      codeToSemantic: state.codeAwareMappings,
      codeChunkRelations: state.codeChunkRelations,
      knowledgeRelations: state.knowledgeRelations,
    },

    metadata: {
      userRequirement: state.userRequirement?.requirementDescription || "",
      learningGoal: state.learningGoal,
      workspaceDirectory: state.workspaceDirectory,
    },
  };
}

/**
 * 将持久化格式转换回 Redux state（部分字段）
 */
export function deserializeSessionState(
  persisted: PersistedCodeAwareSession,
): Partial<CodeAwareSessionState> {
  return {
    currentSessionId: persisted.sessionId,
    title: persisted.title,
    workspaceDirectory: persisted.metadata.workspaceDirectory,

    highLevelSteps: persisted.nodes.highLevelSteps,
    steps: persisted.nodes.steps,
    codeChunks: persisted.nodes.codeChunks,
    knowledgePoints: persisted.nodes.knowledgePoints,

    stepToHighLevelMappings: persisted.relations.stepToHighLevel,
    codeAwareMappings: persisted.relations.codeToSemantic,
    codeChunkRelations: persisted.relations.codeChunkRelations,
    knowledgeRelations: persisted.relations.knowledgeRelations,

    userRequirement: persisted.metadata.userRequirement
      ? {
          requirementDescription: persisted.metadata.userRequirement,
          requirementStatus: "finalized" as const,
        }
      : null,
    learningGoal: persisted.metadata.learningGoal,
  };
}

/**
 * 保存 session 到 workspace
 * 注意：实际的文件操作需要通过 ideMessenger 调用 IDE 端实现
 */
export async function saveSessionToWorkspace(
  sessionState: CodeAwareSessionState,
  ideMessenger: any, // IdeMessengerContext 类型
): Promise<void> {
  const serialized = serializeSessionState(sessionState);
  const filename = `.codeaware/session-${serialized.sessionId}.json`;

  console.log(`💾 保存 session 到: ${filename}`);

  // TODO: 通过 ideMessenger 调用 IDE 端的文件写入
  // await ideMessenger.request('codeaware/saveSession', {
  //   filename,
  //   content: JSON.stringify(serialized, null, 2)
  // });

  console.log("✅ Session 保存完成");
}

/**
 * 从 workspace 加载 session
 */
export async function loadSessionFromWorkspace(
  sessionId: string,
  ideMessenger: any,
): Promise<Partial<CodeAwareSessionState> | null> {
  const filename = `.codeaware/session-${sessionId}.json`;

  console.log(`📂 加载 session 从: ${filename}`);

  try {
    // TODO: 通过 ideMessenger 调用 IDE 端的文件读取
    // const response = await ideMessenger.request('codeaware/loadSession', {
    //   filename
    // });
    // const persisted: PersistedCodeAwareSession = JSON.parse(response.content);
    // return deserializeSessionState(persisted);

    console.log("✅ Session 加载完成");
    return null; // 暂时返回 null
  } catch (error) {
    console.error("❌ 加载 session 失败:", error);
    return null;
  }
}

/**
 * 列出所有可用的 sessions
 */
export async function listAvailableSessions(
  ideMessenger: any,
): Promise<Array<{ sessionId: string; title: string; timestamp: string }>> {
  console.log("📋 列出可用的 sessions");

  try {
    // TODO: 通过 ideMessenger 调用 IDE 端的目录扫描
    // const response = await ideMessenger.request('codeaware/listSessions', {});
    // return response.sessions;

    return []; // 暂时返回空数组
  } catch (error) {
    console.error("❌ 列出 sessions 失败:", error);
    return [];
  }
}
```

**📚 代码参考**:

- 参考现有的 `ideMessenger.request` 调用方式（`codeAwareGeneration.ts` 中随处可见）
- JSON 序列化/反序列化的标准模式

### 🧪 阶段一验证测试

完成上述所有任务后，进行以下验证：

#### 测试 1.1：TypeScript 编译检查

```bash
cd gui
npm run type-check
# 或者直接运行
npx tsc --noEmit
```

**预期结果**: 无编译错误，所有新类型都被正确识别

#### 测试 1.2：Redux Store 初始化验证

1. 启动开发服务器：

   ```bash
   npm run dev
   ```

2. 在浏览器中打开 DevTools，在 Console 中执行：

   ```javascript
   // 获取 Redux store 的初始状态
   window.__REDUX_DEVTOOLS_EXTENSION__ &&
     console.log("Initial state:", window.store.getState().codeAwareSession);
   ```

3. 检查输出是否包含新增的字段：
   - ✅ `codeChunkRelations: []`
   - ✅ `knowledgePoints: []`
   - ✅ `knowledgeRelations: []`
   - ✅ `codeChunks: []`
   - ✅ `initialGeneration: { status: 'idle', ... }`

#### 测试 1.3：Actions 可用性测试

在浏览器 Console 中测试 dispatch 新的 actions：

```javascript
// 获取 dispatch 函数（需要在组件中暴露或使用 Redux DevTools）
// 测试更新初始生成状态
store.dispatch({
  type: "codeAwareSession/updateInitialGenerationStatus",
  payload: { status: "generating-structure", progress: 10 },
});

// 查看状态是否更新
console.log(store.getState().codeAwareSession.initialGeneration);
```

**预期结果**: 状态正确更新，无错误抛出

#### 测试 1.4：持久化工具导入测试

创建临时测试文件 `gui/src/utils/codeAwareStorage.test.ts`:

```typescript
import {
  serializeSessionState,
  deserializeSessionState,
} from "./codeAwareStorage";

// 创建一个简单的 mock state
const mockState = {
  currentSessionId: "test-123",
  title: "Test Session",
  codeChunks: [],
  knowledgePoints: [],
  // ... 其他必需字段
} as any;

// 测试序列化
const serialized = serializeSessionState(mockState);
console.log("Serialized:", serialized);

// 测试反序列化
const deserialized = deserializeSessionState(serialized);
console.log("Deserialized:", deserialized);
```

运行测试确保无语法错误。

#### ✅ 阶段一完成标志

- [ ] TypeScript 编译无错误
- [ ] Redux store 包含所有新字段
- [ ] 所有新 actions 可以正常 dispatch
- [ ] 持久化工具函数语法正确，可以导入

---

## 阶段二：Prompt开发（1-2天）

### ✅ 实施目标

开发和优化LLM prompts，用于代码块分割、映射建立和知识点提取。

### 📋 任务 2.1：创建代码块分割Prompt

**文件位置**: `core/llm/codeAwarePrompts.ts`

在文件末尾添加新的 prompt 构造函数：

```typescript
/**
 * 构造代码块语义分割的 prompt
 * 将代码分割成语义独立的代码块
 */
export function constructSplitCodeIntoChunksPrompt(
  code: string,
  startLine: number,
  steps: Array<{ id: string; title: string; abstract: string }>,
): string {
  return `你是一个代码分析专家。请将以下代码分割成语义独立的代码块（code chunks）。

## 背景信息

这段代码实现了以下步骤：
${steps.map((s, idx) => `${idx + 1}. [${s.id}] ${s.title}\n   描述: ${s.abstract}`).join("\n\n")}

## 代码内容

文件从第 ${startLine} 行开始：

\`\`\`
${code}
\`\`\`

## 任务要求

请将上述代码分割成**原子语义块**，每个块应该满足：

### 分割原则
1. **语义独立且完整**：每个代码块是一个完整的语义单元
   - ✅ 一个完整的函数定义
   - ✅ 一个完整的类定义
   - ✅ 一段完整的初始化逻辑
   - ✅ 一组相关的变量声明和赋值
   - ❌ 函数的一部分
   - ❌ 不完整的代码片段

2. **覆盖完整**：所有代码行都必须被分配到某个代码块中，不能有遗漏

3. **不重叠**：代码块之间不能有行号重叠

4. **合理粒度**：
   - 如果一个函数很长（>50行），可以考虑按照内部的逻辑段落分割
   - 如果多个小函数功能相似，可以合并为一个代码块
   - 目标：每个代码块 10-50 行左右

### 输出格式

返回严格的 JSON 格式：
\`\`\`json
{
  "code_chunks": [
    {
      "start_line": <起始行号，整数，基于 ${startLine}>,
      "end_line": <结束行号，整数，包含此行>,
      "semantic_description": "<该代码块的语义描述，10-30字>"
    }
  ]
}
\`\`\`

### 注意事项
- 起始行号从 ${startLine} 开始计数
- start_line 和 end_line 都是包含的（inclusive）
- 按行号顺序排列所有代码块
- 确保没有间隙：块1的 end_line + 1 应该等于块2的 start_line
- semantic_description 应该简洁描述代码块的功能，**不要包含实现细节**

### 示例
如果代码是：
\`\`\`python
def calculate_sum(a, b):
    return a + b

def main():
    result = calculate_sum(3, 5)
    print(result)
\`\`\`

则输出应该是：
\`\`\`json
{
  "code_chunks": [
    {
      "start_line": 1,
      "end_line": 2,
      "semantic_description": "定义求和函数"
    },
    {
      "start_line": 4,
      "end_line": 6,
      "semantic_description": "主函数：调用求和并打印结果"
    }
  ]
}
\`\`\`

现在请为上述代码生成分割结果。`;
}
```

**📚 代码参考**:

- 参考现有的 `constructGenerateStepsPrompt`（`codeAwarePrompts.ts:100-200`）
- 学习现有 prompt 的格式和说明风格

### 📋 任务 2.2：创建代码块到步骤映射Prompt

**文件位置**: `core/llm/codeAwarePrompts.ts`

在任务 2.1 后面继续添加：

```typescript
/**
 * 构造代码块到步骤映射的 prompt
 * 将已分割的代码块映射到对应的实现步骤
 */
export function constructMapCodeChunksToStepsPrompt(
  codeChunks: Array<{ id: string; description: string; codePreview: string }>,
  steps: Array<{ id: string; title: string; abstract: string }>,
): string {
  return `你是一个代码分析专家。请将代码块映射到对应的实现步骤。

## 任务目标

我们有一组实现步骤和一组代码块，请建立它们之间的一对一映射关系。

## 实现步骤列表

${steps
  .map(
    (s, idx) => `### 步骤 ${idx + 1}: [${s.id}] ${s.title}
**描述**: ${s.abstract}
`,
  )
  .join("\n")}

## 代码块列表

${codeChunks
  .map(
    (c, idx) => `### 代码块 ${idx + 1}: [${c.id}]
**语义描述**: ${c.description}
**代码预览**:
\`\`\`
${c.codePreview}${c.codePreview.length > 150 ? "\n...(更多代码)" : ""}
\`\`\`
`,
  )
  .join("\n")}

## 映射要求

请为**每个代码块**找到**最匹配**的步骤ID，遵循以下原则：

### 映射规则
1. **一对一映射**：每个代码块必须且只能对应一个步骤
2. **语义匹配**：根据代码块的功能和步骤的描述，选择最相关的步骤
3. **置信度评估**：给出 0-1 的置信度分数，表示映射的确定程度
   - 0.9-1.0: 非常确定，代码块明确实现了该步骤
   - 0.7-0.9: 比较确定，代码块主要实现了该步骤
   - 0.5-0.7: 一般确定，代码块部分实现了该步骤
   - <0.5: 不太确定，没有更好的选择

### 输出格式

返回严格的 JSON 格式：
\`\`\`json
{
  "mappings": [
    {
      "code_chunk_id": "<代码块ID>",
      "step_id": "<步骤ID>",
      "confidence": <置信度，0-1的浮点数>,
      "reason": "<简短说明映射理由，10-30字>"
    }
  ]
}
\`\`\`

### 注意事项
- 必须为所有 ${codeChunks.length} 个代码块都提供映射
- step_id 必须来自上述步骤列表中
- 如果某个步骤没有对应的代码块，这是正常的（可能该步骤还未实现）
- 如果某个代码块很难映射，选择最接近的步骤并给出较低的置信度

### 示例
\`\`\`json
{
  "mappings": [
    {
      "code_chunk_id": "c-1",
      "step_id": "s-2",
      "confidence": 0.95,
      "reason": "代码块实现了数据验证功能，完全对应步骤2"
    },
    {
      "code_chunk_id": "c-2",
      "step_id": "s-3",
      "confidence": 0.8,
      "reason": "代码块实现了数据库查询，是步骤3的主要部分"
    }
  ]
}
\`\`\`

现在请为上述代码块生成映射结果。`;
}
```

### 📋 任务 2.3：创建知识点提取Prompt

**文件位置**: `core/llm/codeAwarePrompts.ts`

继续添加：

```typescript
/**
 * 构造知识点提取的 prompt
 * 从步骤和代码中提取理解所需的背景知识
 */
export function constructExtractKnowledgePointsPrompt(
  step: { id: string; title: string; abstract: string },
  codeContext: string
): string {
  return `你是一个编程教育专家。请提取理解以下步骤所需的**前置背景知识点**。

## 步骤信息

**ID**: ${step.id}
**标题**: ${step.title}
**描述**: ${step.abstract}

## 相关代码实现

\`\`\`
${codeContext || '(该步骤暂无对应代码)'}
\`\`\`

## 任务要求

请识别理解这个步骤及其代码所需的**前置背景知识点**。

### 知识点类型

包括但不限于：

1. **编程语法知识** (category: "syntax")
   - 语言特性：如 Python 的列表推导式、JavaScript 的解构赋值
   - 特殊语法：如装饰器、泛型、异步函数
   - 示例：`{ title: "Python 装饰器", category: "syntax" }`

2. **算法和数据结构** (category: "algorithm")
   - 算法：如二分查找、动态规划、深度优先搜索
   - 数据结构：如哈希表、栈、队列、树
   - 示例：`{ title: "哈希表原理", category: "algorithm" }`

3. **框架/库知识** (category: "framework")
   - 框架概念：如 React Hooks、Django ORM
   - API 使用：如 fetch API、axios 库
   - 示例：`{ title: "React useEffect Hook", category: "framework" }`

4. **领域概念知识** (category: "concept")
   - 软件工程：如 REST API、CORS、认证授权
   - 领域特定：如机器学习中的损失函数、Web 中的会话管理
   - 示例：`{ title: "JWT 令牌机制", category: "concept" }`

### 知识点标准

提取的知识点应该：

✅ **独立可学**: 是一个可以单独学习的概念或技术
✅ **有学习价值**: 不是显而易见的常识（如"变量赋值"）
✅ **与步骤相关**: 确实是理解该步骤所必需的
✅ **粒度适中**: 不要太宽泛（❌"Python 基础"）也不要太具体（❌"第5行代码的作用"）

❌ **避免提取**:
- 过于基础的概念（如"for 循环"，除非有特殊用法）
- 过于宽泛的主题（如"面向对象编程"）
- 代码实现细节（应该在代码注释中说明）

### 难度级别

- **easy**: 初学者应该掌握的基础知识
- **medium**: 需要一定经验才能理解的知识
- **hard**: 高级概念或复杂技术

### 输出格式

返回严格的 JSON 格式：
\`\`\`json
{
  "knowledge_points": [
    {
      "title": "<知识点标题，5-10字>",
      "description": "<详细描述，说明这个知识点是什么、为什么需要它，50-150字>",
      "category": "syntax|algorithm|framework|concept",
      "difficulty": "easy|medium|hard"
    }
  ]
}
\`\`\`

### 数量要求
- 如果步骤简单且无特殊知识点：返回 0-1 个
- 一般情况：返回 2-4 个
- 如果步骤复杂涉及多个技术：最多返回 5 个

### 示例

假设步骤是 "实现用户认证中间件"，代码使用了 JWT 和 bcrypt，则可能提取：

\`\`\`json
{
  "knowledge_points": [
    {
      "title": "JWT 令牌机制",
      "description": "JSON Web Token 是一种用于在客户端和服务器之间安全传输信息的标准。它由头部、载荷和签名三部分组成，可以验证令牌的真实性和完整性。在认证场景中，服务器生成 JWT 返回给客户端，客户端在后续请求中携带 JWT 进行身份验证。",
      "category": "concept",
      "difficulty": "medium"
    },
    {
      "title": "密码哈希与加salt",
      "description": "为了安全存储用户密码，需要使用单向哈希函数（如 bcrypt）将明文密码转换为哈希值。加 salt（随机字符串）可以防止彩虹表攻击。bcrypt 还提供了可调节的计算成本，增加破解难度。",
      "category": "concept",
      "difficulty": "medium"
    },
    {
      "title": "Express 中间件机制",
      "description": "Express 中间件是一些函数，它们可以访问请求对象、响应对象和下一个中间件函数。中间件可以执行代码、修改请求和响应对象、结束请求-响应循环或调用下一个中间件。认证中间件通常在路由处理之前验证用户身份。",
      "category": "framework",
      "difficulty": "easy"
    }
  ]
}
\`\`\`

现在请为上述步骤提取知识点。`;
}
```

**📚 代码参考**:

- 参考现有的知识卡片生成 prompt（如果有）
- 保持 prompt 清晰、具体、有示例

### 📋 任务 2.4：优化现有的步骤生成Prompt

**文件位置**: `core/llm/codeAwarePrompts.ts`

找到 `constructGenerateStepsPrompt` 函数（通常在文件前面），进行以下优化：

**修改重点**:

1. 强调任务分解的清晰性
2. 引导生成更简洁的 step abstract（1-2句话，不要实现细节）
3. 确保 high-level steps 和 steps 的层次关系清晰

**参考修改示例**:

```typescript
export function constructGenerateStepsPrompt(userRequirement: string): string {
  return `你是一个专业的软件架构师和任务分解专家。请将用户需求分解为清晰的两级任务结构。

## 用户需求

${userRequirement}

## 任务目标

将上述需求分解为：
1. **高级步骤** (high-level steps): 3-6个主要的子目标或阶段
2. **详细步骤** (steps): 每个高级步骤下的具体实施步骤，总共8-15个

### 分解原则

**高级步骤应该**:
- 代表需求的主要组成部分或实现阶段
- 清晰表达"做什么"而非"怎么做"
- 用户阅读后能快速理解需求的结构
- 示例：❌ "编写代码" → ✅ "实现用户认证功能"

**详细步骤应该**:
- 是具体的、可执行的任务
- 每个步骤对应一段代码的实现
- Abstract 只说明"做什么"，1-2句话，**不要包含实现细节**
- 示例：
  - ❌ "使用 bcrypt 库对密码进行哈希，添加 salt，存储到数据库的 users 表的 password_hash 字段"
  - ✅ "对用户密码进行安全加密并存储"

### 输出格式

\`\`\`json
{
  "title": "<为整个需求起一个标题，5-10字>",
  "learning_goal": "<学习目标，说明用户通过实现这个需求能学到什么，30-80字>",
  "high_level_steps": [
    "<高级步骤1的描述，8-15字>",
    "<高级步骤2的描述，8-15字>",
    ...
  ],
  "steps": [
    {
      "title": "<步骤标题，简短动词短语，5-15字>",
      "abstract": "<步骤说明，描述做什么，避免实现细节，20-50字>",
      "task_corresponding_high_level_task": <对应的高级步骤序号，1-based>
    },
    ...
  ]
}
\`\`\`

现在请开始分解任务。`;
}
```

### 🧪 阶段二验证测试

#### 测试 2.1：Prompt函数可用性

创建测试文件 `core/llm/codeAwarePrompts.test.ts`：

```typescript
import {
  constructSplitCodeIntoChunksPrompt,
  constructMapCodeChunksToStepsPrompt,
  constructExtractKnowledgePointsPrompt,
} from "./codeAwarePrompts";

// 测试数据
const testCode = `
def calculate_sum(a, b):
    return a + b

def main():
    result = calculate_sum(3, 5)
    print(result)
`;

const testSteps = [
  {
    id: "s-1",
    title: "定义求和函数",
    abstract: "创建一个函数用于计算两个数的和",
  },
  {
    id: "s-2",
    title: "测试求和函数",
    abstract: "在主函数中调用并测试求和功能",
  },
];

// 测试 Prompt 1
console.log("=== 测试代码块分割 Prompt ===");
const prompt1 = constructSplitCodeIntoChunksPrompt(testCode, 1, testSteps);
console.log(prompt1);
console.log("\n长度:", prompt1.length, "字符");

// 测试 Prompt 2
console.log("\n=== 测试代码块映射 Prompt ===");
const testChunks = [
  {
    id: "c-1",
    description: "定义求和函数",
    codePreview: "def calculate_sum(a, b):\n    return a + b",
  },
  {
    id: "c-2",
    description: "主函数",
    codePreview: "def main():\n    result = calculate_sum(3, 5)",
  },
];
const prompt2 = constructMapCodeChunksToStepsPrompt(testChunks, testSteps);
console.log(prompt2);
console.log("\n长度:", prompt2.length, "字符");

// 测试 Prompt 3
console.log("\n=== 测试知识点提取 Prompt ===");
const prompt3 = constructExtractKnowledgePointsPrompt(
  testSteps[0],
  "def calculate_sum(a, b):\n    return a + b",
);
console.log(prompt3);
console.log("\n长度:", prompt3.length, "字符");

console.log("\n✅ 所有 Prompt 函数测试通过");
```

运行测试：

```bash
cd core
npx ts-node llm/codeAwarePrompts.test.ts
```

**预期结果**: 所有prompt都正确生成，长度合理（一般在1000-3000字符）

#### 测试 2.2：实际LLM调用测试（可选但推荐）

创建一个简单的测试脚本，实际调用 LLM 并验证返回格式：

```typescript
// 文件: core/llm/testPromptWithLLM.ts

import { constructSplitCodeIntoChunksPrompt } from "./codeAwarePrompts";

async function testPromptWithLLM() {
  const testCode = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

def main():
    for i in range(10):
        print(f"fib({i}) = {fibonacci(i)}")
`;

  const testSteps = [
    {
      id: "s-1",
      title: "实现斐波那契函数",
      abstract: "使用递归实现斐波那契数列计算",
    },
    {
      id: "s-2",
      title: "测试并输出结果",
      abstract: "生成前10个斐波那契数并打印",
    },
  ];

  const prompt = constructSplitCodeIntoChunksPrompt(testCode, 1, testSteps);

  console.log("📤 发送 Prompt 到 LLM...\n");
  console.log(prompt);
  console.log("\n---\n");

  // TODO: 实际调用 LLM API
  // const response = await callLLM(prompt);
  // console.log('📥 LLM 响应:\n', response);

  // 验证响应格式
  // const parsed = JSON.parse(response);
  // assert(parsed.code_chunks);
  // assert(parsed.code_chunks.length > 0);
  // assert(parsed.code_chunks[0].start_line);
  // assert(parsed.code_chunks[0].end_line);

  console.log("✅ Prompt 格式正确，等待实际 LLM 测试");
}

testPromptWithLLM();
```

**手动测试步骤**:

1. 复制生成的 prompt
2. 在 Claude/GPT 等 LLM 界面中粘贴
3. 检查 LLM 的返回是否符合 JSON 格式要求
4. 验证返回的内容是否合理

#### 测试 2.3：Prompt质量检查清单

对每个新 prompt，检查以下质量标准：

- [ ] **清晰的任务描述**: LLM 能理解要做什么
- [ ] **明确的输出格式**: JSON schema 清晰完整
- [ ] **有示例**: 提供了正确的输入输出示例
- [ ] **有约束条件**: 说明了应该做什么、不应该做什么
- [ ] **长度适中**: 不要太短（信息不足）也不要太长（超过 context window）
- [ ] **鲁棒性**: 考虑了边界情况的处理

#### ✅ 阶段二完成标志

- [ ] 所有 prompt 函数编译通过，无语法错误
- [ ] 测试脚本能够正确生成 prompt
- [ ] （可选）实际 LLM 调用返回了合理的结果
- [ ] 代码已提交到版本控制

```bash
git add core/llm/codeAwarePrompts.ts
git commit -m "feat: add prompts for code chunking, mapping, and knowledge extraction"
```

---

## 阶段三：核心流程实现（3-5天）

### ✅ 实施目标

实现完整的初始生成流程编排器和各个阶段的具体逻辑。

### 📋 任务 3.1：创建初始生成编排器文件

**文件位置**: `gui/src/redux/thunks/initialGeneration.ts`（新建文件）

**文件骨架**:

```typescript
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ThunkApiType } from "../store";
import {
  updateInitialGenerationStatus,
  resetInitialGenerationStatus,
  setHighLevelSteps,
  setGeneratedSteps,
  setStepToHighLevelMappings,
  setCodeChunks,
  setCodeChunkRelations,
  updateCodeAwareMappings,
  setKnowledgePoints,
  setKnowledgeRelations,
  setUserRequirementStatus,
  setCodeAwareTitle,
  setLearningGoal,
} from "../slices/codeAwareSlice";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import {
  constructSplitCodeIntoChunksPrompt,
  constructMapCodeChunksToStepsPrompt,
  constructExtractKnowledgePointsPrompt,
  constructGenerateStepsPrompt,
} from "../../../../core/llm/codeAwarePrompts";
import type {
  CodeChunk,
  CodeAwareMapping,
  CodeChunkRelation,
  KnowledgePoint,
  KnowledgeRelation,
  StepItem,
  HighLevelStepItem,
} from "core";

/**
 * 主编排器：执行完整的初始生成流程
 *
 * 流程顺序：
 * 1. Phase 1: 生成任务分解结构（10% -> 30%）
 * 2. Phase 2: 生成完整代码实现（30% -> 60%）
 * 3. Phase 3: 创建代码到步骤的映射（60% -> 75%）
 * 4. Phase 4: 分析代码块语义关联（75% -> 90%）
 * 5. Phase 5: 提取和关联知识点（90% -> 100%）
 */
export const executeInitialGeneration = createAsyncThunk<
  void,
  { userRequirement: string; targetFilePath?: string },
  ThunkApiType
>(
  "codeAware/executeInitialGeneration",
  async (
    { userRequirement, targetFilePath },
    { dispatch, getState, extra },
  ) => {
    console.log("🚀 开始执行初始生成流程");
    console.log("📋 用户需求:", userRequirement);

    try {
      // 重置状态
      dispatch(resetInitialGenerationStatus());

      // Phase 1: 生成任务分解
      dispatch(
        updateInitialGenerationStatus({
          status: "generating-structure",
          currentPhase: "正在分析需求并生成任务分解结构...",
          progress: 10,
        }),
      );

      await dispatch(generateTaskDecomposition({ userRequirement })).unwrap();
      console.log("✅ Phase 1 完成: 任务分解");

      // Phase 2: 生成完整代码
      dispatch(
        updateInitialGenerationStatus({
          status: "generating-code",
          currentPhase: "正在生成完整代码实现...（可能需要几分钟）",
          progress: 30,
        }),
      );

      const generatedFilePath = await dispatch(
        generateCompleteCode({ targetFilePath }),
      ).unwrap();
      console.log("✅ Phase 2 完成: 代码生成");

      // Phase 3: 创建代码到步骤的映射
      dispatch(
        updateInitialGenerationStatus({
          status: "mapping-code",
          currentPhase: "正在建立代码与步骤的对应关系...",
          progress: 60,
        }),
      );

      await dispatch(
        createCodeToStepMappings({ filePath: generatedFilePath }),
      ).unwrap();
      console.log("✅ Phase 3 完成: 代码映射");

      // Phase 4: 分析代码块语义关联
      dispatch(
        updateInitialGenerationStatus({
          status: "analyzing-chunks",
          currentPhase: "正在分析代码块之间的语义关联...",
          progress: 75,
        }),
      );

      await dispatch(analyzeCodeChunkRelations()).unwrap();
      console.log("✅ Phase 4 完成: 代码块关联");

      // Phase 5: 提取和关联知识点
      dispatch(
        updateInitialGenerationStatus({
          status: "extracting-knowledge",
          currentPhase: "正在提取背景知识点...",
          progress: 90,
        }),
      );

      await dispatch(extractAndLinkKnowledge()).unwrap();
      console.log("✅ Phase 5 完成: 知识提取");

      // 完成
      dispatch(
        updateInitialGenerationStatus({
          status: "completed",
          currentPhase: "初始化完成！",
          progress: 100,
        }),
      );

      console.log("🎉 初始生成流程全部完成");

      // TODO: 自动保存到workspace
      // await dispatch(saveSessionToWorkspace()).unwrap();
    } catch (error) {
      console.error("❌ 初始生成流程失败:", error);

      dispatch(
        updateInitialGenerationStatus({
          status: "error",
          currentPhase: "生成过程出错",
          progress: 0,
        }),
      );

      // 添加错误信息
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      dispatch(addInitialGenerationError(errorMessage));

      throw error;
    }
  },
);

// Phase 1: 生成任务分解
// Phase 2: 生成完整代码
// Phase 3: 创建代码到步骤的映射
// Phase 4: 分析代码块语义关联
// Phase 5: 提取和关联知识点
// 辅助函数

// 以下是各个 Phase 的具体实现...
// （将在后续任务中逐步添加）
```

### 📋 任务 3.2：实现Phase 1 - 生成任务分解

在 `initialGeneration.ts` 中添加：

```typescript
/**
 * Phase 1: 生成任务分解结构
 *
 * 输入: 用户需求
 * 输出: highLevelSteps, steps, stepToHighLevelMappings
 */
export const generateTaskDecomposition = createAsyncThunk<
  void,
  { userRequirement: string },
  ThunkApiType
>(
  "codeAware/generateTaskDecomposition",
  async ({ userRequirement }, { dispatch, extra, getState }) => {
    console.log("📝 Phase 1: 生成任务分解");

    const state = getState();
    const defaultModel =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);

    if (!defaultModel) {
      throw new Error("未找到可用的 LLM 模型");
    }

    // 构造 prompt
    const prompt = constructGenerateStepsPrompt(userRequirement);

    // 调用 LLM，带重试机制
    const maxRetries = 3;
    let result: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 尝试 ${attempt}/${maxRetries}...`);

        result = await extra.ideMessenger.request("llm/complete", {
          prompt,
          completionOptions: {},
          title: defaultModel.title,
        });

        if (result.status === "success" && result.content) {
          break;
        }
      } catch (error) {
        console.warn(`⚠️ 尝试 ${attempt} 失败:`, error);

        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          throw error;
        }
      }
    }

    if (!result || result.status !== "success") {
      throw new Error("LLM 请求失败");
    }

    // 解析响应
    console.log("📥 解析 LLM 响应...");
    const jsonResponse = JSON.parse(result.content);

    const title = jsonResponse.title || "未命名项目";
    const learningGoal = jsonResponse.learning_goal || "";
    const highLevelStepsArray = jsonResponse.high_level_steps || [];
    const stepsArray = jsonResponse.steps || [];

    console.log(
      `📊 解析结果: ${highLevelStepsArray.length} 个高级步骤, ${stepsArray.length} 个详细步骤`,
    );

    // 创建 HighLevelStepItem[]
    const highLevelSteps: HighLevelStepItem[] = highLevelStepsArray.map(
      (content: string, index: number) => ({
        id: `r-${index + 1}`,
        content,
        isHighlighted: false,
        isCompleted: false,
      }),
    );

    // 创建 StepItem[]
    const steps: StepItem[] = [];
    const stepToHighLevelMappings: any[] = [];

    stepsArray.forEach((stepData: any, index: number) => {
      const stepId = `s-${index + 1}`;

      steps.push({
        id: stepId,
        title: stepData.title || "",
        abstract: stepData.abstract || "",
        knowledgeCards: [],
        isHighlighted: false,
        stepStatus: "confirmed",
        knowledgeCardGenerationStatus: "empty",
      });

      // 建立层级映射
      const highLevelTaskRef = stepData.task_corresponding_high_level_task;
      if (highLevelTaskRef) {
        let highLevelIndex: number | null = null;

        // 尝试解析为数字
        const parsedIndex = parseInt(String(highLevelTaskRef), 10);
        if (
          !isNaN(parsedIndex) &&
          parsedIndex >= 1 &&
          parsedIndex <= highLevelStepsArray.length
        ) {
          highLevelIndex = parsedIndex;
        } else {
          // 按名称匹配
          const matchIndex = highLevelStepsArray.findIndex(
            (hl: string) => hl.trim() === String(highLevelTaskRef).trim(),
          );
          if (matchIndex !== -1) {
            highLevelIndex = matchIndex + 1;
          }
        }

        if (highLevelIndex !== null) {
          stepToHighLevelMappings.push({
            stepId,
            highLevelStepId: `r-${highLevelIndex}`,
            highLevelStepIndex: highLevelIndex,
          });
        }
      }
    });

    // 更新 Redux 状态
    dispatch(setCodeAwareTitle(title));
    dispatch(setLearningGoal(learningGoal));
    dispatch(setHighLevelSteps(highLevelSteps));
    dispatch(setGeneratedSteps(steps));
    dispatch(setStepToHighLevelMappings(stepToHighLevelMappings));
    dispatch(setUserRequirementStatus("finalized"));

    console.log("✅ Phase 1 完成");

    // Log 到 IDE
    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase1_completed",
      payload: {
        title,
        highLevelStepsCount: highLevelSteps.length,
        stepsCount: steps.length,
        timestamp: new Date().toISOString(),
      },
    });
  },
);
```

**📚 代码参考**:

- 复用现有的 `generateStepsFromRequirement`（`codeAwareGeneration.ts:867-1136`）
- 保持错误处理和重试逻辑

### 📋 任务 3.3：实现Phase 2 - 生成完整代码

在 `initialGeneration.ts` 中继续添加：

```typescript
/**
 * Phase 2: 生成完整代码实现
 *
 * 输入: 所有步骤
 * 输出: 生成的代码文件路径
 */
export const generateCompleteCode = createAsyncThunk<
  string, // 返回生成的文件路径
  { targetFilePath?: string },
  ThunkApiType
>(
  "codeAware/generateCompleteCode",
  async ({ targetFilePath }, { dispatch, getState, extra }) => {
    console.log("💻 Phase 2: 生成完整代码");

    const state = getState();
    const steps = state.codeAwareSession.steps;
    const userRequirement =
      state.codeAwareSession.userRequirement?.requirementDescription || "";

    if (steps.length === 0) {
      throw new Error("没有可用的步骤，无法生成代码");
    }

    // 确定目标文件路径
    let filepath = targetFilePath;

    if (!filepath) {
      // 请求用户选择文件路径
      try {
        const response = await extra.ideMessenger.request("getTargetFilePath", {
          prompt: "请选择要生成代码的文件",
          defaultPath: "src/main.py", // 可以根据需求类型推断
        });
        filepath = response.filePath;
      } catch (error) {
        console.warn("用户未选择文件，使用默认路径");
        filepath = "generated_code.py"; // 或其他默认值
      }
    }

    console.log(`📁 目标文件: ${filepath}`);

    // 调用现有的代码生成逻辑
    // 注意：这里复用 generateCodeFromSteps，但需要确保它能处理完整的步骤列表
    const { generateCodeFromSteps } = await import("./codeAwareGeneration");

    await dispatch(
      generateCodeFromSteps({
        existingCode: "", // 初次生成，代码为空
        filepath,
        orderedSteps: steps.map((s) => ({
          id: s.id,
          title: s.title,
          abstract: s.abstract,
        })),
        previouslyGeneratedSteps: [], // 初次生成
      }),
    ).unwrap();

    console.log("✅ Phase 2 完成");

    // Log 到 IDE
    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase2_completed",
      payload: {
        filepath,
        stepsCount: steps.length,
        timestamp: new Date().toISOString(),
      },
    });

    return filepath;
  },
);
```

**📚 代码参考**:

- 直接复用 `generateCodeFromSteps`（`codeAwareGeneration.ts:2494`）
- 复用 `streamCodeGenerationThunk`（`streamCodeGeneration.ts`）

**注意**: 这个阶段主要是编排，实际的代码生成逻辑已经存在。

### 📋 任务 3.4：实现Phase 3 - 代码到步骤的映射

这是最复杂的部分，包含代码块分割和映射两个子步骤。

在 `initialGeneration.ts` 中添加：

```typescript
/**
 * Phase 3: 创建代码到步骤的映射
 *
 * 步骤：
 * 3.1 读取生成的代码
 * 3.2 将代码分割成语义块
 * 3.3 将代码块映射到步骤
 * 3.4 存储代码块和映射关系
 */
export const createCodeToStepMappings = createAsyncThunk<
  void,
  { filePath: string },
  ThunkApiType
>(
  "codeAware/createCodeToStepMappings",
  async ({ filePath }, { dispatch, getState, extra }) => {
    console.log("🗺️ Phase 3: 创建代码到步骤的映射");

    const state = getState();
    const steps = state.codeAwareSession.steps;

    // Step 3.1: 读取生成的代码
    console.log(`📖 读取文件: ${filePath}`);

    const fileContent = await extra.ideMessenger.request("readFile", {
      filepath: filePath,
    });

    const generatedCode = fileContent.content || "";
    const codeLines = generatedCode.split("\n");
    const totalLines = codeLines.length;

    console.log(`📏 代码共 ${totalLines} 行`);

    if (totalLines === 0) {
      console.warn("⚠️ 代码文件为空，跳过映射创建");
      return;
    }

    // Step 3.2: 分割代码成语义块
    console.log("✂️ 开始分割代码块...");

    const codeChunks = await splitCodeIntoSemanticChunks(
      generatedCode,
      filePath,
      steps,
      dispatch,
      extra,
    );

    console.log(`📦 创建了 ${codeChunks.length} 个代码块`);

    // 存储代码块到 Redux
    const codeChunkObjects: CodeChunk[] = codeChunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      range: chunk.range,
      isHighlighted: false,
      disabled: false,
      filePath,
    }));

    dispatch(setCodeChunks(codeChunkObjects));

    // Step 3.3: 将代码块映射到步骤
    console.log("🔗 开始建立代码块到步骤的映射...");

    const mappings = await mapCodeChunksToSteps(
      codeChunks,
      steps,
      dispatch,
      extra,
    );

    console.log(`🔗 创建了 ${mappings.length} 个映射关系`);

    // 存储映射关系到 Redux
    dispatch(updateCodeAwareMappings(mappings));

    console.log("✅ Phase 3 完成");

    // Log
    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase3_completed",
      payload: {
        codeChunksCount: codeChunks.length,
        mappingsCount: mappings.length,
        timestamp: new Date().toISOString(),
      },
    });
  },
);

/**
 * 辅助函数: 分割代码成语义块
 */
async function splitCodeIntoSemanticChunks(
  code: string,
  filepath: string,
  steps: StepItem[],
  dispatch: any,
  extra: any,
): Promise<
  Array<{
    id: string;
    content: string;
    range: [number, number];
    semanticDescription: string;
  }>
> {
  const codeLines = code.split("\n");
  const totalLines = codeLines.length;

  // 如果代码过长，分批处理
  const CHUNK_SIZE = 500; // 每批最多 500 行
  const batches: string[][] = [];

  for (let i = 0; i < totalLines; i += CHUNK_SIZE) {
    batches.push(codeLines.slice(i, Math.min(i + CHUNK_SIZE, totalLines)));
  }

  console.log(`📦 代码分为 ${batches.length} 批处理`);

  // 获取模型
  const state = extra.getState();
  const model =
    selectJsonGenerationModel(state) || selectSelectedChatModel(state);

  const allCodeChunks: any[] = [];

  // 逐批处理
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batchCode = batches[batchIdx].join("\n");
    const startLine = batchIdx * CHUNK_SIZE + 1;

    console.log(
      `🔄 处理批次 ${batchIdx + 1}/${batches.length} (从第 ${startLine} 行开始)`,
    );

    // 构造 prompt
    const prompt = constructSplitCodeIntoChunksPrompt(
      batchCode,
      startLine,
      steps.map((s) => ({ id: s.id, title: s.title, abstract: s.abstract })),
    );

    // 调用 LLM
    const result = await extra.ideMessenger.request("llm/complete", {
      prompt,
      completionOptions: {},
      title: model.title,
    });

    if (result.status === "success") {
      const parsed = JSON.parse(result.content);
      allCodeChunks.push(...(parsed.code_chunks || []));
    } else {
      console.warn(`⚠️ 批次 ${batchIdx + 1} 处理失败`);
    }
  }

  // 转换为标准格式
  return allCodeChunks.map((chunk, idx) => {
    const startLine = chunk.start_line;
    const endLine = chunk.end_line;

    // 提取代码内容
    const chunkLines = codeLines.slice(startLine - 1, endLine);
    const content = chunkLines.join("\n");

    return {
      id: `c-${idx + 1}`,
      content,
      range: [startLine, endLine] as [number, number],
      semanticDescription: chunk.semantic_description || "",
    };
  });
}

/**
 * 辅助函数: 将代码块映射到步骤
 */
async function mapCodeChunksToSteps(
  codeChunks: Array<{
    id: string;
    content: string;
    semanticDescription: string;
  }>,
  steps: StepItem[],
  dispatch: any,
  extra: any,
): Promise<CodeAwareMapping[]> {
  const BATCH_SIZE = 20; // 每批处理 20 个代码块
  const mappings: CodeAwareMapping[] = [];

  // 获取模型
  const state = extra.getState();
  const model =
    selectJsonGenerationModel(state) || selectSelectedChatModel(state);

  // 分批处理
  for (let i = 0; i < codeChunks.length; i += BATCH_SIZE) {
    const batch = codeChunks.slice(
      i,
      Math.min(i + BATCH_SIZE, codeChunks.length),
    );

    console.log(
      `🔄 映射批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(codeChunks.length / BATCH_SIZE)}`,
    );

    // 构造 prompt
    const prompt = constructMapCodeChunksToStepsPrompt(
      batch.map((c) => ({
        id: c.id,
        description: c.semanticDescription,
        codePreview: c.content.substring(0, 200), // 只提供前 200 字符
      })),
      steps.map((s) => ({ id: s.id, title: s.title, abstract: s.abstract })),
    );

    // 调用 LLM
    const result = await extra.ideMessenger.request("llm/complete", {
      prompt,
      completionOptions: {},
      title: model.title,
    });

    if (result.status === "success") {
      const parsed = JSON.parse(result.content);

      // 转换为 CodeAwareMapping 格式
      (parsed.mappings || []).forEach((mapping: any) => {
        mappings.push({
          codeChunkId: mapping.code_chunk_id,
          semanticElementId: mapping.step_id,
          semanticElementType: "step",
          createdAt: Date.now(),
          source: "llm",
          confidence: mapping.confidence || 0.9,
        });
      });
    } else {
      console.warn(`⚠️ 映射批次处理失败`);
    }
  }

  return mappings;
}
```

**📚 代码参考**:

- 文件读取：参考现有的 `ideMessenger.request("readFile", ...)`
- 批量处理模式：可参考可能存在的其他批量LLM调用
- 映射创建：参考 `processCodeChunkMappingResponse`（`codeAwareGeneration.ts:76`）

---

### 📋 任务 3.5：实现Phase 4 - 代码块语义关联

在 `initialGeneration.ts` 中继续添加：

```typescript
/**
 * Phase 4: 分析代码块之间的语义关联
 *
 * 使用 embedding 计算代码块之间的余弦相似度
 */
export const analyzeCodeChunkRelations = createAsyncThunk<
  void,
  void,
  ThunkApiType
>(
  "codeAware/analyzeCodeChunkRelations",
  async (_, { dispatch, getState, extra }) => {
    console.log("🔍 Phase 4: 分析代码块语义关联");

    const state = getState();
    const codeChunks = state.codeAwareSession.codeChunks;

    if (codeChunks.length < 2) {
      console.log("⚠️ 代码块数量不足 2 个，跳过关联分析");
      return;
    }

    console.log(`📊 开始计算 ${codeChunks.length} 个代码块的 embeddings...`);

    // Step 4.1: 获取所有代码块的 embeddings
    const embeddings = await Promise.all(
      codeChunks.map(async (chunk) => {
        try {
          const result = await extra.ideMessenger.request("llm/embed", {
            text: chunk.content,
            model: "text-embedding-3-small", // 或从配置获取
          });

          return {
            chunkId: chunk.id,
            embedding: result.embedding as number[],
          };
        } catch (error) {
          console.warn(`⚠️ 获取 embedding 失败 (${chunk.id}):`, error);
          return null;
        }
      }),
    );

    // 过滤掉失败的
    const validEmbeddings = embeddings.filter((e) => e !== null) as Array<{
      chunkId: string;
      embedding: number[];
    }>;

    console.log(
      `✅ 成功获取 ${validEmbeddings.length}/${codeChunks.length} 个 embeddings`,
    );

    if (validEmbeddings.length < 2) {
      console.warn("⚠️ 有效 embeddings 不足，跳过关联分析");
      return;
    }

    // Step 4.2: 计算两两之间的余弦相似度
    const relations: CodeChunkRelation[] = [];
    const SIMILARITY_THRESHOLD = 0.7; // 相似度阈值

    console.log(`🔢 开始计算相似度（阈值: ${SIMILARITY_THRESHOLD}）...`);

    for (let i = 0; i < validEmbeddings.length; i++) {
      for (let j = i + 1; j < validEmbeddings.length; j++) {
        const similarity = cosineSimilarity(
          validEmbeddings[i].embedding,
          validEmbeddings[j].embedding,
        );

        if (similarity >= SIMILARITY_THRESHOLD) {
          // 双向关系
          relations.push({
            fromChunkId: validEmbeddings[i].chunkId,
            toChunkId: validEmbeddings[j].chunkId,
            similarity,
            createdAt: Date.now(),
          });

          relations.push({
            fromChunkId: validEmbeddings[j].chunkId,
            toChunkId: validEmbeddings[i].chunkId,
            similarity,
            createdAt: Date.now(),
          });
        }
      }
    }

    console.log(`🔗 建立了 ${relations.length} 个代码块关联`);

    // Step 4.3: 存储到 Redux
    dispatch(setCodeChunkRelations(relations));

    console.log("✅ Phase 4 完成");

    // Log
    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase4_completed",
      payload: {
        codeChunksCount: codeChunks.length,
        relationsCount: relations.length,
        timestamp: new Date().toISOString(),
      },
    });
  },
);

/**
 * 辅助函数: 计算余弦相似度
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error("向量维度不匹配");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}
```

**📚 代码参考**:

- Embedding调用：需要在IDE协议中实现（见阶段五）
- 余弦相似度：标准数学公式

**注意**: 如果embedding API不支持，这个阶段可以暂时跳过或使用mock数据。

### 📋 任务 3.6：实现Phase 5 - 知识点提取与关联

最后一个阶段，在 `initialGeneration.ts` 中添加：

```typescript
/**
 * Phase 5: 提取和关联知识点
 *
 * 步骤：
 * 5.1 逐个步骤提取知识点
 * 5.2 去重和合并相似知识点
 * 5.3 计算知识点 embeddings
 * 5.4 建立知识点关联关系
 */
export const extractAndLinkKnowledge = createAsyncThunk<
  void,
  void,
  ThunkApiType
>(
  "codeAware/extractAndLinkKnowledge",
  async (_, { dispatch, getState, extra }) => {
    console.log("📚 Phase 5: 提取和关联知识点");

    const state = getState();
    const steps = state.codeAwareSession.steps;
    const mappings = state.codeAwareSession.codeAwareMappings;
    const codeChunks = state.codeAwareSession.codeChunks;

    // 获取模型
    const model =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);

    // Step 5.1: 逐个步骤提取知识点
    console.log(`📖 开始为 ${steps.length} 个步骤提取知识点...`);

    const allKnowledgePoints: KnowledgePoint[] = [];

    for (const step of steps) {
      console.log(`  📝 处理步骤: ${step.id} - ${step.title}`);

      // 获取该步骤对应的代码块
      const relatedMappings = mappings.filter(
        (m) => m.semanticElementId === step.id && m.semanticElementType === "step"
      );

      const relatedCodeChunks = relatedMappings
        .map((m) => codeChunks.find((c) => c.id === m.codeChunkId))
        .filter((c) => c !== undefined);

      const codeContext = relatedCodeChunks
        .map((c) => c!.content)
        .join("\n\n");

      // 调用 LLM 提取知识点
      try {
        const prompt = constructExtractKnowledgePointsPrompt(
          {
            id: step.id,
            title: step.title,
            abstract: step.abstract,
          },
          codeContext
        );

        const result = await extra.ideMessenger.request("llm/complete", {
          prompt,
          completionOptions: {},
          title: model.title,
        });

        if (result.status === "success") {
          const parsed = JSON.parse(result.content);

          (parsed.knowledge_points || []).forEach((kp: any, idx: number} => {
            const knowledgeId = `k-${step.id}-${idx + 1}`;

            allKnowledgePoints.push({
              id: knowledgeId,
              title: kp.title,
              content: kp.description,
              relatedStepIds: [step.id],
              category: kp.category,
              difficulty: kp.difficulty || "medium",
            });
          });
        }
      } catch (error) {
        console.warn(`⚠️ 提取知识点失败 (${step.id}):`, error);
      }
    }

    console.log(`📊 提取了 ${allKnowledgePoints.length} 个知识点`);

    // Step 5.2: 去重和合并
    const uniqueKnowledgePoints = deduplicateKnowledgePoints(allKnowledgePoints);
    console.log(`🔄 去重后剩余 ${uniqueKnowledgePoints.length} 个知识点`);

    // 存储到 Redux
    dispatch(setKnowledgePoints(uniqueKnowledgePoints));

    if (uniqueKnowledgePoints.length < 2) {
      console.log("⚠️ 知识点数量不足，跳过关联分析");
      return;
    }

    // Step 5.3: 计算知识点的 embeddings
    console.log("🔍 开始计算知识点 embeddings...");

    const knowledgeEmbeddings = await Promise.all(
      uniqueKnowledgePoints.map(async (kp) => {
        try {
          const text = `${kp.title}\n${kp.content}`;

          const result = await extra.ideMessenger.request("llm/embed", {
            text,
            model: "text-embedding-3-small",
          });

          return {
            knowledgeId: kp.id,
            embedding: result.embedding as number[],
          };
        } catch (error) {
          console.warn(`⚠️ 获取 embedding 失败 (${kp.id}):`, error);
          return null;
        }
      })
    );

    const validKnowledgeEmbeddings = knowledgeEmbeddings.filter(
      (e) => e !== null
    ) as Array<{
      knowledgeId: string;
      embedding: number[];
    }>;

    console.log(`✅ 成功获取 ${validKnowledgeEmbeddings.length}/${uniqueKnowledgePoints.length} 个 embeddings`);

    // Step 5.4: 计算知识点之间的相似度
    const knowledgeRelations: KnowledgeRelation[] = [];
    const KNOWLEDGE_SIMILARITY_THRESHOLD = 0.75;

    console.log(`🔢 开始计算知识点相似度（阈值: ${KNOWLEDGE_SIMILARITY_THRESHOLD}）...`);

    for (let i = 0; i < validKnowledgeEmbeddings.length; i++) {
      for (let j = i + 1; j < validKnowledgeEmbeddings.length; j++) {
        const similarity = cosineSimilarity(
          validKnowledgeEmbeddings[i].embedding,
          validKnowledgeEmbeddings[j].embedding
        );

        if (similarity >= KNOWLEDGE_SIMILARITY_THRESHOLD) {
          // 推断关系类型
          const kp1 = uniqueKnowledgePoints.find(
            (k) => k.id === validKnowledgeEmbeddings[i].knowledgeId
          );
          const kp2 = uniqueKnowledgePoints.find(
            (k) => k.id === validKnowledgeEmbeddings[j].knowledgeId
          );

          const relationType = inferRelationType(kp1!, kp2!, similarity);

          // 双向关系
          knowledgeRelations.push({
            fromKnowledgeId: validKnowledgeEmbeddings[i].knowledgeId,
            toKnowledgeId: validKnowledgeEmbeddings[j].knowledgeId,
            similarity,
            relationType,
            createdAt: Date.now(),
          });

          knowledgeRelations.push({
            fromKnowledgeId: validKnowledgeEmbeddings[j].knowledgeId,
            toKnowledgeId: validKnowledgeEmbeddings[i].knowledgeId,
            similarity,
            relationType,
            createdAt: Date.now(),
          });
        }
      }
    }

    console.log(`🔗 建立了 ${knowledgeRelations.length} 个知识点关联`);

    // 存储到 Redux
    dispatch(setKnowledgeRelations(knowledgeRelations));

    console.log("✅ Phase 5 完成");

    // Log
    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase5_completed",
      payload: {
        knowledgePointsCount: uniqueKnowledgePoints.length,
        relationsCount: knowledgeRelations.length,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * 辅助函数: 去重知识点
 */
function deduplicateKnowledgePoints(
  points: KnowledgePoint[]
): KnowledgePoint[] {
  const uniqueMap = new Map<string, KnowledgePoint>();

  points.forEach((point) => {
    const key = point.title.toLowerCase().trim();

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, point);
    } else {
      // 合并 relatedStepIds
      const existing = uniqueMap.get(key)!;
      existing.relatedStepIds = [
        ...new Set([...existing.relatedStepIds, ...point.relatedStepIds]),
      ];
    }
  });

  return Array.from(uniqueMap.values());
}

/**
 * 辅助函数: 推断知识点关系类型
 */
function inferRelationType(
  kp1: KnowledgePoint,
  kp2: KnowledgePoint,
  similarity: number
): "prerequisite" | "related" {
  // 简单的启发式规则
  if (kp1.difficulty !== kp2.difficulty && similarity > 0.85) {
    return "prerequisite";
  }
  return "related";
}
```

**📚 代码参考**:

- 知识卡片生成：参考 `generateKnowledgeCardDetail`（`codeAwareGeneration.ts:1136`）
- 批量处理模式：参考Phase 3和4的实现

### 🧪 阶段三验证测试

由于阶段三涉及完整的流程，测试需要分层进行。

#### 测试 3.1：编译和语法检查

```bash
cd gui
npm run type-check
```

**预期结果**: 无TypeScript编译错误

#### 测试 3.2：单元测试（各Phase独立测试）

为每个Phase创建简单的mock测试：

```typescript
// 文件: gui/src/redux/thunks/initialGeneration.test.ts

import { describe, it, expect, vi } from "vitest";

describe("Initial Generation Phases", () => {
  it("Phase 1: generateTaskDecomposition should parse LLM response", () => {
    const mockResponse = {
      title: "Test Project",
      learning_goal: "Learn testing",
      high_level_steps: ["Step 1", "Step 2"],
      steps: [
        {
          title: "Task 1",
          abstract: "Do something",
          task_corresponding_high_level_task: 1,
        },
      ],
    };

    // 测试解析逻辑
    expect(mockResponse.steps.length).toBe(1);
    expect(mockResponse.high_level_steps.length).toBe(2);
  });

  // 更多单元测试...
});
```

#### 测试 3.3：集成测试（完整流程）

这需要在实际开发环境中运行：

**准备工作**:

1. 启动开发服务器：

   ```bash
   npm run dev
   ```

2. 在浏览器中打开应用

**测试步骤**:

1. **输入简单需求**:

   - 打开CodeAware界面
   - 输入需求："创建一个Python函数计算两个数的和"
   - 确认需求

2. **观察初始生成流程**:

   - ✅ 应该看到Loading Overlay
   - ✅ 进度条应该从0%增长到100%
   - ✅ 进度文本应该依次显示各个阶段
   - ✅ 整个过程应该在2-5分钟内完成（取决于LLM速度）

3. **检查Redux状态**:
   打开Redux DevTools，检查最终状态：

   ```javascript
   const state = store.getState().codeAwareSession;

   console.log("High Level Steps:", state.highLevelSteps.length);
   console.log("Steps:", state.steps.length);
   console.log("Code Chunks:", state.codeChunks.length);
   console.log("Code Mappings:", state.codeAwareMappings.length);
   console.log("Code Chunk Relations:", state.codeChunkRelations.length);
   console.log("Knowledge Points:", state.knowledgePoints.length);
   console.log("Knowledge Relations:", state.knowledgeRelations.length);
   ```

   **预期结果**:

   - ✅ highLevelSteps: 2-4个
   - ✅ steps: 3-8个
   - ✅ codeChunks: 2-10个
   - ✅ codeAwareMappings: 与codeChunks数量相同或更多
   - ✅ codeChunkRelations: 0个或更多（取决于相似度）
   - ✅ knowledgePoints: 0-20个
   - ✅ knowledgeRelations: 0个或更多

4. **检查生成的代码文件**:

   - 在IDE中打开生成的文件
   - ✅ 文件应该存在且内容合理
   - ✅ 代码应该能够运行

5. **检查UI显示**:
   - ✅ 高级步骤应该正确显示
   - ✅ 详细步骤应该正确显示
   - ✅ 步骤的层级关系应该正确（点击高级步骤能高亮对应的详细步骤）

#### 测试 3.4：错误处理测试

**测试场景1: LLM请求失败**

- 断开网络或使用无效的API密钥
- 触发初始生成流程
- **预期**:
  - ✅ 应该显示错误状态
  - ✅ 错误信息应该被记录
  - ✅ 提供重试选项

**测试场景2: 无效的JSON响应**

- Mock一个返回无效JSON的LLM响应
- **预期**:
  - ✅ 应该捕获JSON解析错误
  - ✅ 显示友好的错误消息

**测试场景3: 中途取消（如果实现了）**

- 在Phase 2或3期间取消操作
- **预期**:
  - ✅ 流程应该停止
  - ✅ 部分生成的数据应该被清理或保留（根据设计）

#### ✅ 阶段三完成标志

- [ ] 所有Phase的代码编译通过
- [ ] 单元测试通过（如果编写了）
- [ ] 完整流程测试成功（能从输入需求到生成所有数据）
- [ ] Redux状态包含所有预期的数据
- [ ] 代码文件成功生成
- [ ] 错误处理机制有效
- [ ] 代码已提交

```bash
git add gui/src/redux/thunks/initialGeneration.ts
git commit -m "feat: implement initial generation orchestrator with all 5 phases"
```

---

## 下一步行动

完成阶段一、二、三后，可以继续：

- **阶段四**: UI更新（更新LoadingOverlay，调整交互流程）
- **阶段五**: IDE协议集成（实现embedding、文件保存等）
- **阶段六**: 测试和优化
- **阶段七**: 文档和清理

每个阶段完成后都应该进行充分的测试验证，确保质量后再继续下一个阶段。

---

## 常见问题和解决方案

### Q1: TypeScript类型错误

**问题**: 导入core中的类型时出现错误

**解决**:

```bash
# 重新构建core模块
cd core
npm run build

# 或者在根目录
npm run build:core
```

### Q2: LLM请求超时

**问题**: 代码生成阶段LLM请求经常超时

**解决方案**:

- 增加超时时间配置
- 分批处理更小的代码段
- 优化prompt长度

### Q3: Embedding API不可用

**问题**: 没有embedding服务或API

**解决方案**:

- Phase 4和5可以暂时跳过
- 或使用mock数据
- 或使用本地embedding模型

### Q4: Redux DevTools不显示

**问题**: 无法查看Redux状态

**解决方案**:

```javascript
// 在浏览器Console中手动启用
window.store = require("./gui/src/redux/store").default;
```

---

## 总结

本文档提供了详细的实施指导，包括：

- ✅ 清晰的阶段划分
- ✅ 具体的代码示例和文件位置
- ✅ 代码参考和复用建议
- ✅ 详细的测试验证步骤
- ✅ 错误处理和常见问题解决

按照本文档逐步实施，应该能够顺利完成前三个阶段的开发。每个阶段完成后都应该进行充分的测试，确保质量。

祝开发顺利！🚀

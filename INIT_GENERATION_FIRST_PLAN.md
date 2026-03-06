# 概览

这是一个方案草稿用于将我的系统的内容生成过程由过程中生成转化为在伴随代码生成的同时进行生成，并且为下一步我通过系统维护用户的认知活动并推断用户的认知进展（通过用户在某一个点上的认知进展推断的更新以及根据连接）进行铺垫。为此我希望首先进行以下的梳理：

## 当前系统概述

### 现有数据结构（位于 `core/index.d.ts`）

- **HighLevelStepItem**: 高级步骤项目，包含 id、content、isHighlighted、highlightType、isCompleted
- **StepItem**: 详细步骤项目，包含 id、title、abstract、knowledgeCards、stepStatus、knowledgeCardGenerationStatus、isHighlighted
- **CodeChunk**: 代码块单位，包含 id、content、range(行号范围)、isHighlighted、disabled、filePath
- **CodeAwareMapping**: 代码块与语义元素的映射关系，包含 codeChunkId、semanticElementId、semanticElementType、createdAt、source、confidence
- **StepToHighLevelMapping**: 步骤与高级步骤的层级关系，包含 stepId、highLevelStepId、highLevelStepIndex
- **KnowledgeCardItem**: 知识卡片，包含 id、title、content、tests、isHighlighted、codeContext

### 现有Redux Store结构（位于 `gui/src/redux/slices/codeAwareSlice.ts`）

```typescript
CodeAwareSessionState {
  currentSessionId: string
  title: string
  workspaceDirectory: string
  userRequirement: ProgramRequirement | null
  learningGoal: string
  highLevelSteps: HighLevelStepItem[]
  stepToHighLevelMappings: StepToHighLevelMapping[]
  steps: StepItem[]
  codeAwareMappings: CodeAwareMapping[]
  mappingLookup: {...}
  shouldClearIdeHighlights: boolean
  codeChunksToHighlightInIde: CodeChunk[]
  codeGeneration: {...}
  codeGenerationDebugLogs: string[]
}
```

### 现有生成流程（位于 `gui/src/redux/thunks/codeAwareGeneration.ts`）

1. **paraphraseUserIntent**: 改写用户意图（可选）
2. **generateStepsFromRequirement**: 生成高级步骤和详细步骤的二级结构
   - 调用LLM生成 `title`、`learning_goal`、`high_level_steps`、`steps`
   - 创建 `HighLevelStepItem` 和 `StepItem`
   - 建立 `StepToHighLevelMapping`
   - 步骤状态设为 `confirmed`
3. **generateCodeFromSteps**: 用户手动触发为某些步骤生成代码
   - 使用 `streamCodeGenerationThunk` 流式生成代码（tool-calling方式）
   - 步骤状态更新为 `generating` -> `generated`
   - 目前不自动建立代码到步骤的映射关系
4. **现有映射创建**：之前通过 `constructFindStepRelatedCodeLinesPrompt` 来查找步骤相关代码行，但现被注释掉

### 现有UI实现（位于 `gui/src/pages/codeaware/CodeAware.tsx`）

- **LoadingOverlay**: 简单的加载遮罩层，显示 SpinnerIcon
- 显示条件: `isGeneratingSteps || hasGeneratingSteps || hasCodeDirtySteps`
- 当前没有详细的进度指示文本

# 内部结构调整

## 维护多个内部结构

我希望通过多个内部结构来表征这个程序理解过程：

### 1. Top-down语义理解模型（树结构）

**目的**: 表达任务的层次分解关系

**现有实现**:

- `HighLevelStepItem[]` (位于 `codeAwareSlice.highLevelSteps`)
- `StepItem[]` (位于 `codeAwareSlice.steps`)
- `StepToHighLevelMapping[]` (位于 `codeAwareSlice.stepToHighLevelMappings`)

**保持不变**: 由于是固定的两层树结构，现有的数据结构已经足够

### 2. Code Chunk程序原子语义关联图（新增）

**目的**: 了解"用户看懂了这段代码之后看懂另外一段的概率"

**需要新增的数据结构**:

```typescript
// 代码块之间的语义关联
interface CodeChunkRelation {
  fromChunkId: string;
  toChunkId: string;
  similarity: number; // 余弦相似度，0-1
  embedding?: number[]; // 可选：保存embedding用于后续计算
}
```

**实现方式**:

- 在生成代码块后，调用embedding API计算每个代码块的语义向量
- 计算两两之间的余弦相似度
- 超过阈值（如0.7）的代码块对建立关联边

### 3. Situation模型（边集/邻接表）

**目的**: 表达用户能够将代码语义对应到实际含义的认知

**现有实现**:

- `CodeAwareMapping` 已经记录了 `codeChunkId` 到 `semanticElementId` 的映射
- 类型为 "code -> step" 或 "code -> highLevelStep"

**改进点**:

- 当前的 `CodeAwareMapping` 就是 situation 模型的实现
- 需要在代码生成后自动建立这些映射关系（见生成顺序调整部分）

### 4. Knowledge模型（语义关联图，新增）

**目的**: 描述理解程序所需的背景知识及其之间的关联

**需要新增的数据结构**:

```typescript
// 知识点（已存在KnowledgeCardItem，但需要扩展）
interface KnowledgePoint {
  id: string;
  title: string;
  content: string;
  relatedStepIds: string[]; // 关联的步骤
  embedding?: number[]; // 语义向量
}

// 知识点之间的关联
interface KnowledgeRelation {
  fromKnowledgeId: string;
  toKnowledgeId: string;
  similarity: number; // 余弦相似度，0-1
  relationType?: "prerequisite" | "related"; // 可选：关系类型
}
```

**实现方式**:

- 扩展现有的 `KnowledgeCardItem`，为每个步骤生成相关知识点
- 汇总所有知识点后计算embedding
- 计算相似度并建立关联边

### 数据持久化要求

所有这些数据结构在满足下述统一元素表征的情况下，也希望能够单独存储方便多个session间共享

## 统一元素表征

原有的系统里有诸多元素，如high-level-step，step, code chunks (先不要管knowledge card), 如上一段所述，所有的这些元素——无论是一个结构内部的，还是结构之间相关的元素，都是紧密连接的，所以我希望用统一的数据结构去表征他们。

### 现状分析

当前系统已经有：

- `HighLevelStepItem` (id: `r-{index}`)
- `StepItem` (id: `s-{index}`)
- `CodeChunk` (id: `c-{index}`)
- `KnowledgeCardItem` (id: 由UUID生成)

这些元素虽然类型不同，但都包含基本的 `id`、`content/title`、`isHighlighted` 等属性。

### 改进方案：引入统一的Node抽象

**定义统一的Node类型**:

```typescript
// 节点类型枚举
type NodeType = "high-level-step" | "step" | "code-chunk" | "knowledge-point";

// 统一的节点接口
interface UnifiedNode {
  id: string;
  type: NodeType;
  score: number; // 0-1，用于未来的认知进展推断

  // 各类型特有的内容（使用联合类型）
  content:
    | HighLevelStepContent
    | StepContent
    | CodeChunkContent
    | KnowledgeContent;

  // 元数据
  metadata: {
    createdAt: number;
    updatedAt: number;
    version: number;
  };
}

// 各类型特有内容的定义
interface HighLevelStepContent {
  text: string;
  isCompleted: boolean;
}

interface StepContent {
  title: string;
  abstract: string;
  stepStatus: StepStatus;
  knowledgeCardGenerationStatus: KnowledgeCardGenerationStatus;
}

interface CodeChunkContent {
  code: string;
  range: [number, number];
  filePath: string;
  disabled: boolean;
}

interface KnowledgeContent {
  title: string;
  description: string;
  codeContext?: string;
}
```

### 实施建议

**阶段1（当前迭代）**:

- 保持现有的类型定义不变
- 在需要统一处理时，创建适配器函数将现有类型转换为统一格式
- 例如：`toUnifiedNode(item: HighLevelStepItem | StepItem | CodeChunk): UnifiedNode`

**阶段2（未来迭代）**:

- 逐步迁移Redux store使用统一的Node类型
- 更新UI组件以处理统一的Node类型
- 确保向后兼容性（可以从旧格式JSON恢复）

**当前迭代重点**:
暂时不进行大规模重构，保持现有类型定义，仅在需要统一操作（如保存/加载、关系图计算）时使用适配器模式

## 统一表征元素之间的连接

然后我希望通过一个邻接表或者其它表示相关关系的结构来表示所有元素之间的连接，每个连接会因为起点和终点的元素类型不同而具有不同的含义，比如code会和situation中的点相连再与对应的step相连，highlevelstep和step的边也是原来就有的。新增的边还包括知识点和步骤或者代码的关联，和代码块之间的关系。之前的highlevelstep和step的链接跳转可以用新的邻接表来维护，而注意代码和step之间的跳转需要通过situation模型中转（相当于我们在边的中间增加了一个节点来表征一个认知要点）。

### 现有的连接关系

**1. Step -> HighLevelStep** (已实现)

- 类型: `StepToHighLevelMapping[]`
- 位置: `codeAwareSlice.stepToHighLevelMappings`
- 含义: UI层级关联，表示步骤属于哪个高级步骤

**2. CodeChunk -> Step/HighLevelStep** (已实现但需完善)

- 类型: `CodeAwareMapping[]`
- 位置: `codeAwareSlice.codeAwareMappings`
- 含义: Situation模型，代码到语义的认知映射
- **当前问题**: 代码生成后不会自动建立这些映射

**3. KnowledgeCard -> Step** (隐式存在)

- 位置: `StepItem.knowledgeCards[]`
- 含义: 知识卡片隶属于某个步骤

### 需要新增的连接关系

**4. CodeChunk <-> CodeChunk** (新增)

- 类型: `CodeChunkRelation[]`
- 含义: 代码块之间的语义相似度
- 数据结构见"维护多个内部结构"部分

**5. KnowledgePoint <-> KnowledgePoint** (新增)

- 类型: `KnowledgeRelation[]`
- 含义: 知识点之间的关联和依赖
- 数据结构见"维护多个内部结构"部分

**6. KnowledgePoint -> CodeChunk** (可选，未来扩展)

- 含义: 知识点与具体代码实现的关联

### 统一的关系图数据结构

```typescript
// 边的类型
type EdgeType =
  | "hierarchical" // step -> highLevelStep
  | "semantic" // code -> step (situation模型)
  | "knowledge" // knowledgeCard -> step
  | "code-similarity" // code <-> code
  | "knowledge-relation"; // knowledge <-> knowledge

// 统一的边定义
interface Edge {
  id: string;
  type: EdgeType;
  fromNodeId: string;
  fromNodeType: NodeType;
  toNodeId: string;
  toNodeType: NodeType;

  // 权重/相似度（可选，用于相似度边）
  weight?: number;

  // 元数据
  metadata: {
    createdAt: number;
    source: "llm" | "manual" | "computed";
    confidence?: number;
  };
}

// 关系图（邻接表表示）
interface RelationGraph {
  nodes: Map<string, UnifiedNode>;
  edges: Map<string, Edge>;

  // 邻接表：从某个节点出发的所有边
  adjacencyList: Map<string, string[]>; // nodeId -> edgeIds[]

  // 逆邻接表：指向某个节点的所有边
  reverseAdjacencyList: Map<string, string[]>; // nodeId -> edgeIds[]
}
```

### 实施策略

**当前迭代**:

1. 保持现有的 `StepToHighLevelMapping` 和 `CodeAwareMapping` 不变
2. 新增 `CodeChunkRelation[]` 存储代码块关系（添加到Redux store）
3. 新增 `KnowledgeRelation[]` 存储知识点关系（添加到Redux store）
4. 创建工具函数在需要时构建统一的 `RelationGraph` 视图

**未来迭代**:

- 逐步迁移到统一的 `RelationGraph` 数据结构
- 优化图查询算法（如：找到从代码A到代码B的所有路径）

## 具体要求与实施步骤

### 要求1: Redux存储

**现有实现**:

- `gui/src/redux/slices/codeAwareSlice.ts` 已经存储了主要数据结构
- 当前Redux store包含: `highLevelSteps`, `steps`, `codeAwareMappings`, `stepToHighLevelMappings`

**本次迭代需要新增**:

```typescript
// 在 CodeAwareSessionState 中新增
export type CodeAwareSessionState = {
  // ... 现有字段 ...

  // 新增：代码块关系图
  codeChunkRelations: CodeChunkRelation[];

  // 新增：知识点（从KnowledgeCard中提取）
  knowledgePoints: KnowledgePoint[];

  // 新增：知识点关系图
  knowledgeRelations: KnowledgeRelation[];

  // 新增：初始生成流程状态
  initialGeneration: {
    status:
      | "idle"
      | "generating-structure"
      | "generating-code"
      | "mapping-code"
      | "analyzing-chunks"
      | "extracting-knowledge"
      | "completed"
      | "error";
    currentPhase: string; // 当前阶段的描述文本
    progress: number; // 0-100
    errors: string[];
  };
};
```

**对应的reducer actions**:

```typescript
// 需要新增的actions
setCodeChunkRelations(state, action: PayloadAction<CodeChunkRelation[]>)
addCodeChunkRelation(state, action: PayloadAction<CodeChunkRelation>)
setKnowledgePoints(state, action: PayloadAction<KnowledgePoint[]>)
addKnowledgePoint(state, action: PayloadAction<KnowledgePoint>)
setKnowledgeRelations(state, action: PayloadAction<KnowledgeRelation[]>)
addKnowledgeRelation(state, action: PayloadAction<KnowledgeRelation>)
updateInitialGenerationStatus(state, action: PayloadAction<{...}>)
```

**实施位置**:

- 文件: `gui/src/redux/slices/codeAwareSlice.ts`
- 在现有的state定义后添加新字段
- 在reducers中添加新的action handlers

### 要求2: Workspace持久化存储

**目标**: 将所有node和连接结构存储在workspace下的JSON文件中，方便多session共享

**实施方案**:

```typescript
// 持久化文件结构（位于workspace/.codeaware/）
{
  "sessionId": "xxx",
  "title": "xxx",
  "timestamp": "2026-03-06T...",

  // 节点数据
  "nodes": {
    "highLevelSteps": HighLevelStepItem[],
    "steps": StepItem[],
    "codeChunks": CodeChunk[],
    "knowledgePoints": KnowledgePoint[]
  },

  // 边/关系数据
  "relations": {
    "stepToHighLevel": StepToHighLevelMapping[],
    "codeToSemantic": CodeAwareMapping[],
    "codeChunkRelations": CodeChunkRelation[],
    "knowledgeRelations": KnowledgeRelation[]
  },

  // 元数据
  "metadata": {
    "userRequirement": string,
    "learningGoal": string,
    "workspaceDirectory": string
  }
}
```

**需要实现的函数**:

```typescript
// 位置: gui/src/utils/codeAwareStorage.ts (新建)

// 保存session到workspace
async function saveSessionToWorkspace(
  sessionState: CodeAwareSessionState,
  workspaceDir: string,
): Promise<void>;

// 从workspace加载session
async function loadSessionFromWorkspace(
  sessionId: string,
  workspaceDir: string,
): Promise<CodeAwareSessionState | null>;

// 列出所有可用的sessions
async function listAvailableSessions(
  workspaceDir: string,
): Promise<CodeAwareMetadata[]>;
```

**与IDE通信**:
需要新增protocol消息类型（位于 `core/protocol/...`）:

- `codeaware/saveSession`: GUI -> IDE，保存session到文件
- `codeaware/loadSession`: GUI -> IDE，从文件加载session
- `codeaware/listSessions`: GUI -> IDE，列出可用sessions

**实施步骤**:

1. 在 `core/protocol/coreWebview.ts` 或相关文件中定义新的消息类型
2. 在IDE扩展中（`extensions/vscode/`）实现文件读写handler
3. 在GUI中实现上述工具函数，通过 `ideMessenger` 调用
4. 在适当时机自动保存（如：步骤生成完成、代码生成完成）
5. 在session切换时加载之前的状态

# 生成顺序调整

在此前用户输入需求之后，此前我们直接生成了highlevelstep和step，代码并未生成，需要后期逐渐生成并且建立代码和step之间的关联。这很麻烦，由于我们是一个辅助用户做代码理解的插件，我们不希望用户在理解过程中花那么长时间去等待。所以我们现在希望在输入需求后就完成主要的生成工作，流程如下：

## 当前流程问题分析

**现有流程** (位于 `gui/src/redux/thunks/codeAwareGeneration.ts`):

1. 用户输入需求并确认
2. 调用 `generateStepsFromRequirement` 生成步骤结构
3. **用户手动点击** 某个步骤的"生成代码"按钮
4. 调用 `generateCodeFromSteps` 为选中的步骤生成代码
5. 代码生成后，映射关系创建逻辑被注释掉了

**问题**:

- 用户需要等待步骤生成完成
- 用户需要手动触发代码生成，体验割裂
- 没有自动建立代码块到步骤的映射关系
- 没有代码块语义分析和知识点提取

## 新的生成流程设计

### 整体流程编排（状态机）

```typescript
// 新的初始生成编排器
// 位置: gui/src/redux/thunks/initialGeneration.ts (新建)

export const executeInitialGeneration = createAsyncThunk<
  void,
  { userRequirement: string },
  ThunkApiType
>(
  "codeAware/executeInitialGeneration",
  async ({ userRequirement }, { dispatch, getState, extra }) => {
    try {
      // Phase 1: 生成任务分解
      dispatch(
        updateInitialGenerationStatus({
          status: "generating-structure",
          currentPhase: "正在生成任务分解结构...",
          progress: 10,
        }),
      );
      await dispatch(generateTaskDecomposition({ userRequirement })).unwrap();

      // Phase 2: 生成完整代码
      dispatch(
        updateInitialGenerationStatus({
          status: "generating-code",
          currentPhase: "正在生成完整代码实现...",
          progress: 30,
        }),
      );
      await dispatch(generateCompleteCode()).unwrap();

      // Phase 3: 代码块分割和映射
      dispatch(
        updateInitialGenerationStatus({
          status: "mapping-code",
          currentPhase: "正在建立代码与步骤的对应关系...",
          progress: 60,
        }),
      );
      await dispatch(createCodeToStepMappings()).unwrap();

      // Phase 4: 代码块语义分析（可与Phase 3部分并行）
      dispatch(
        updateInitialGenerationStatus({
          status: "analyzing-chunks",
          currentPhase: "正在分析代码块之间的关联...",
          progress: 75,
        }),
      );
      await dispatch(analyzeCodeChunkRelations()).unwrap();

      // Phase 5: 知识点提取和关联
      dispatch(
        updateInitialGenerationStatus({
          status: "extracting-knowledge",
          currentPhase: "正在提取背景知识点...",
          progress: 90,
        }),
      );
      await dispatch(extractAndLinkKnowledge()).unwrap();

      // 完成
      dispatch(
        updateInitialGenerationStatus({
          status: "completed",
          currentPhase: "初始化完成！",
          progress: 100,
        }),
      );

      // 自动保存到workspace
      await dispatch(saveSessionToWorkspace()).unwrap();
    } catch (error) {
      dispatch(
        updateInitialGenerationStatus({
          status: "error",
          currentPhase: "生成过程出错",
          progress: 0,
          errors: [error.message],
        }),
      );
      throw error;
    }
  },
);
```

### Phase 1: 生成任务分解结构

**改进现有的 `generateStepsFromRequirement`**:

**当前实现** (位于 `codeAwareGeneration.ts:867`):

- 使用 `constructGenerateStepsPrompt` 生成prompt
- 解析返回的 JSON: `{title, learning_goal, high_level_steps, steps}`
- 创建 `HighLevelStepItem[]` 和 `StepItem[]`
- 建立 `StepToHighLevelMapping[]`

**需要修改**:

1. **Prompt优化**: 更新 `constructGenerateStepsPrompt` (位于 `core/llm/codeAwarePrompts.ts`)

   ```typescript
   // 强调任务分解的清晰性
   // 移除 step.abstract 中的实现细节，只保留"做什么"
   // 返回格式保持不变，但引导LLM生成更清晰的分解
   ```

2. **移除 step description 生成**:

   - 当前的 `abstract` 字段包含详细描述
   - 改为简短的任务说明（1-2句话）
   - 详细的实现将在代码中体现

3. **函数重命名和重构**:
   ```typescript
   // 新函数名更清晰
   export const generateTaskDecomposition = createAsyncThunk<...>(
     'codeAware/generateTaskDecomposition',
     async ({ userRequirement }, { dispatch, extra, getState }) => {
       // 复用现有逻辑，但优化prompt和返回格式
       // ...
     }
   );
   ```

**实施文件**:

- `core/llm/codeAwarePrompts.ts`: 更新 `constructGenerateStepsPrompt`
- `gui/src/redux/thunks/codeAwareGeneration.ts`: 修改现有函数或新增 `generateTaskDecomposition`

## 生成完整的代码

相比较之前让用户分步去自己决定什么时候生成代码，现在我们希望一开始在建立好二级的任务分解后就生成完整的代码，这个流程直接复用原先的使用tool-calling的agentic code generation的就可以，只需要修改prompt来直接根据steps的计划生成完整代码即可。

### Phase 2: 生成完整代码实现

**复用现有实现**:

- 当前的 `generateCodeFromSteps` (位于 `codeAwareGeneration.ts:2494`) 已经使用 `streamCodeGenerationThunk`
- `streamCodeGenerationThunk` (位于 `gui/src/redux/thunks/streamCodeGeneration.ts`) 实现了tool-calling的流式代码生成

**需要修改**:

1. **自动触发**: 在Phase 1完成后自动调用，无需用户手动点击

   ```typescript
   export const generateCompleteCode = createAsyncThunk<...>(
     'codeAware/generateCompleteCode',
     async (_, { dispatch, getState, extra }) => {
       const state = getState();
       const allSteps = state.codeAwareSession.steps;
       const userRequirement = state.codeAwareSession.userRequirement?.requirementDescription;

       // 获取目标文件路径（可以让用户选择或使用默认）
       const filepath = await extra.ideMessenger.request('getTargetFilePath', {
         prompt: '请选择要生成代码的文件',
         defaultPath: 'src/main.py' // 或根据语言推断
       });

       // 调用现有的代码生成逻辑
       await dispatch(generateCodeFromSteps({
         existingCode: '', // 初次生成，代码为空
         filepath,
         orderedSteps: allSteps.map(s => ({
           id: s.id,
           title: s.title,
           abstract: s.abstract
         })),
         previouslyGeneratedSteps: [] // 初次生成，无之前的代码
       })).unwrap();
     }
   );
   ```

2. **Prompt调整**:
   - 在 `streamCodeGenerationThunk` 使用的prompt中强调"完整实现所有步骤"
   - 确保生成的代码覆盖所有 steps
   - 位置: `gui/src/redux/thunks/streamCodeGeneration.ts` 中的prompt构建部分

**注意事项**:

- 代码生成使用tool-calling，可能需要多次LLM调用
- 需要在UI上显示生成进度（通过 `initialGeneration.currentPhase` 更新）
- 生成的代码通过IDE protocol写入文件

## 建立步骤和代码之间的对应关系

此前我们更多的是通过步骤找代码，现在由于代码已经ready了，我们可以先要求大模型对于代码进行一个分成原子语义块的操作（如果代码过长，可以分批次输入给大模型），然后再由大模型将这些原子语义块对应到步骤列表上，保证每个原子语义块只对应一个步骤，如果代码块过多，也可以分批次并行发出大模型对应的请求，相关的实现可参考目前从代码到步骤映射的实现方式。

### Phase 3: 代码块分割与映射创建

**参考现有实现**:

- `processCodeChunkMappingResponse` (位于 `codeAwareGeneration.ts:76`) 处理映射响应
- 使用的格式: `{code_chunks: [{start_line, end_line, semantic_description, corresponding_steps}]}`

**实施方案**:

#### Step 3.1: 代码块语义分割

```typescript
// 位置: gui/src/redux/thunks/initialGeneration.ts

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
  const CHUNK_SIZE = 500; // 每批最多500行
  const batches: string[][] = [];

  for (let i = 0; i < totalLines; i += CHUNK_SIZE) {
    batches.push(codeLines.slice(i, Math.min(i + CHUNK_SIZE, totalLines)));
  }

  console.log(`📦 代码共 ${totalLines} 行，分为 ${batches.length} 批处理`);

  // 构造prompt（位于 core/llm/codeAwarePrompts.ts）
  const allCodeChunks: any[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batchCode = batches[batchIdx].join("\n");
    const startLine = batchIdx * CHUNK_SIZE + 1;

    const prompt = constructSplitCodeIntoChunksPrompt(
      batchCode,
      startLine,
      steps.map((s) => ({ id: s.id, title: s.title, abstract: s.abstract })),
    );

    // 调用LLM
    const result = await extra.ideMessenger.request("llm/complete", {
      prompt,
      completionOptions: {},
      title: "claude-sonnet-4", // 或从config获取
    });

    if (result.status === "success") {
      const parsed = JSON.parse(result.content);
      allCodeChunks.push(...parsed.code_chunks);
    }
  }

  // 转换为标准格式
  return allCodeChunks.map((chunk, idx) => ({
    id: `c-${idx + 1}`,
    content: codeLines.slice(chunk.start_line - 1, chunk.end_line).join("\n"),
    range: [chunk.start_line, chunk.end_line] as [number, number],
    semanticDescription: chunk.semantic_description || "",
  }));
}
```

**需要新增的Prompt** (位于 `core/llm/codeAwarePrompts.ts`):

```typescript
export function constructSplitCodeIntoChunksPrompt(
  code: string,
  startLine: number,
  steps: Array<{ id: string; title: string; abstract: string }>,
): string {
  return `
你是一个代码分析专家。请将以下代码分割成语义独立的代码块（code chunks）。

## 任务目标
这段代码实现了以下步骤：
${steps.map((s, idx) => `${idx + 1}. [${s.id}] ${s.title}: ${s.abstract}`).join("\n")}

## 代码内容
文件从第 ${startLine} 行开始：

\`\`\`
${code}
\`\`\`

## 输出要求
请将代码分割成原子语义块，每个块应该：
1. 语义独立且完整（例如：一个函数、一个类、一段初始化逻辑）
2. 指明起始和结束行号（基于上述起始行号 ${startLine}）
3. 提供简短的语义描述
4. **不要在此步骤建立与步骤的对应关系**（下一步单独处理）

返回JSON格式：
{
  "code_chunks": [
    {
      "start_line": 起始行号(整数),
      "end_line": 结束行号(整数),
      "semantic_description": "该代码块的语义描述"
    },
    ...
  ]
}

确保：
- 所有代码行都被覆盖，没有遗漏
- 代码块之间不重叠
- 按行号顺序排列
`;
}
```

#### Step 3.2: 代码块到步骤的映射

```typescript
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
  // 如果代码块过多，分批处理
  const BATCH_SIZE = 20;
  const mappings: CodeAwareMapping[] = [];

  for (let i = 0; i < codeChunks.length; i += BATCH_SIZE) {
    const batch = codeChunks.slice(
      i,
      Math.min(i + BATCH_SIZE, codeChunks.length),
    );

    const prompt = constructMapCodeChunksToStepsPrompt(
      batch.map((c) => ({
        id: c.id,
        description: c.semanticDescription,
        codePreview: c.content.substring(0, 200), // 只提供前200字符
      })),
      steps.map((s) => ({ id: s.id, title: s.title, abstract: s.abstract })),
    );

    const result = await extra.ideMessenger.request("llm/complete", {
      prompt,
      completionOptions: {},
      title: "claude-sonnet-4",
    });

    if (result.status === "success") {
      const parsed = JSON.parse(result.content);

      // 转换为 CodeAwareMapping 格式
      parsed.mappings.forEach((mapping: any) => {
        mappings.push({
          codeChunkId: mapping.code_chunk_id,
          semanticElementId: mapping.step_id,
          semanticElementType: "step",
          createdAt: Date.now(),
          source: "llm",
          confidence: mapping.confidence || 0.9,
        });
      });
    }
  }

  return mappings;
}
```

**需要新增的Prompt** (位于 `core/llm/codeAwarePrompts.ts`):

```typescript
export function constructMapCodeChunksToStepsPrompt(
  codeChunks: Array<{ id: string; description: string; codePreview: string }>,
  steps: Array<{ id: string; title: string; abstract: string }>,
): string {
  return `
你是一个代码分析专家。请将代码块映射到对应的实现步骤。

## 实现步骤
${steps.map((s, idx) => `${idx + 1}. [${s.id}] ${s.title}\n   ${s.abstract}`).join("\n\n")}

## 代码块
${codeChunks.map((c, idx) => `${idx + 1}. [${c.id}] ${c.description}\n   代码片段: ${c.codePreview}...`).join("\n\n")}

## 输出要求
请为每个代码块找到最匹配的步骤ID。要求：
1. 每个代码块**必须且只能**对应一个步骤
2. 根据语义匹配度选择最合适的步骤
3. 给出置信度评分 (0-1)

返回JSON格式：
{
  "mappings": [
    {
      "code_chunk_id": "c-1",
      "step_id": "s-1",
      "confidence": 0.95,
      "reason": "简短说明映射理由"
    },
    ...
  ]
}
`;
}
```

#### Step 3.3: 整合并存储

```typescript
export const createCodeToStepMappings = createAsyncThunk<...>(
  'codeAware/createCodeToStepMappings',
  async (_, { dispatch, getState, extra }) => {
    const state = getState();
    const generatedCode = '...'; // 从生成结果或文件中获取
    const filepath = '...';
    const steps = state.codeAwareSession.steps;

    // Step 3.1: 分割代码块
    const codeChunks = await splitCodeIntoSemanticChunks(
      generatedCode, filepath, steps, dispatch, extra
    );

    // 创建 CodeChunk 对象并存储到Redux
    codeChunks.forEach(chunk => {
      dispatch(createOrGetCodeChunk({
        ...chunk,
        isHighlighted: false,
        disabled: false,
        filePath: filepath
      }));
    });

    // Step 3.2: 建立映射关系
    const mappings = await mapCodeChunksToSteps(
      codeChunks, steps, dispatch, extra
    );

    // 存储映射到Redux
    dispatch(updateCodeAwareMappings(mappings));

    console.log(`✅ 创建了 ${codeChunks.length} 个代码块和 ${mappings.length} 个映射关系`);
  }
);
```

**实施文件总结**:

- `gui/src/redux/thunks/initialGeneration.ts`: 主要逻辑
- `core/llm/codeAwarePrompts.ts`: 新增两个prompt函数
- 利用现有的 `createOrGetCodeChunk` 和 `updateCodeAwareMappings` actions

## 建立代码块之间的关联关系（可与上一步适度并行，并使用同样的代码块划分）

我希望把上一步切分开的原子语义代码块建立语义层面的联系，我希望使用embedding来计算代码块之间的相关关系，这样子我可以估计看懂一块代码的情况下看懂另一块代码的概率几何。然后我希望在一定阈值以上的代码块之间连边，同时记录二者的余弦相似度以供之后计算

### Phase 4: 代码块语义关联分析

**目标**: 使用 embedding 计算代码块之间的语义相似度，建立 `CodeChunkRelation[]`

**实施方案**:

```typescript
// 位置: gui/src/redux/thunks/initialGeneration.ts

export const analyzeCodeChunkRelations = createAsyncThunk<...>(
  'codeAware/analyzeCodeChunkRelations',
  async (_, { dispatch, getState, extra }) => {
    const state = getState();

    // 从Redux获取所有代码块（Phase 3已创建）
    // 注意：当前 codeAwareSlice 中没有直接存储 CodeChunk[]
    // 需要从 codeAwareMappings 中提取 unique codeChunkIds，再查询
    // 或者在 Phase 3 时将 CodeChunk[] 也存储到 Redux

    // 临时方案：从 Phase 3 的结果中获取代码块列表
    // 长期方案：在 codeAwareSlice 中添加 codeChunks: CodeChunk[] 字段

    const codeChunks: Array<{
      id: string;
      content: string;
    }> = getCodeChunksFromState(state); // 辅助函数

    if (codeChunks.length < 2) {
      console.log('⚠️ 代码块数量不足，跳过关联分析');
      return;
    }

    // Step 4.1: 获取所有代码块的 embeddings
    console.log(`🔍 开始计算 ${codeChunks.length} 个代码块的embeddings...`);

    const embeddings = await Promise.all(
      codeChunks.map(async (chunk) => {
        // 调用 embedding API
        const result = await extra.ideMessenger.request('llm/embed', {
          text: chunk.content,
          model: 'text-embedding-3-small' // 或使用配置的embedding模型
        });

        return {
          chunkId: chunk.id,
          embedding: result.embedding as number[]
        };
      })
    );

    console.log(`✅ 获取了 ${embeddings.length} 个embeddings`);

    // Step 4.2: 计算两两之间的余弦相似度
    const relations: CodeChunkRelation[] = [];
    const SIMILARITY_THRESHOLD = 0.7; // 相似度阈值

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const similarity = cosineSimilarity(
          embeddings[i].embedding,
          embeddings[j].embedding
        );

        if (similarity >= SIMILARITY_THRESHOLD) {
          relations.push({
            fromChunkId: embeddings[i].chunkId,
            toChunkId: embeddings[j].chunkId,
            similarity,
            createdAt: Date.now()
          });

          // 对称关系
          relations.push({
            fromChunkId: embeddings[j].chunkId,
            toChunkId: embeddings[i].chunkId,
            similarity,
            createdAt: Date.now()
          });
        }
      }
    }

    console.log(`✅ 建立了 ${relations.length} 个代码块关联（阈值: ${SIMILARITY_THRESHOLD}）`);

    // Step 4.3: 存储到Redux
    dispatch(setCodeChunkRelations(relations));
  }
);

// 辅助函数：计算余弦相似度
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
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

**需要的IDE Protocol支持**:

在 `core/protocol/ide.ts` 或相关文件中，确保有 embedding 功能：

```typescript
// 可能需要新增或确认存在
interface EmbedRequest {
  text: string;
  model?: string;
}

interface EmbedResponse {
  embedding: number[];
}
```

**在IDE扩展中的实现** (位于 `extensions/vscode/src/`):

- 调用配置的 embedding 模型（OpenAI、Azure、或本地模型）
- 返回向量结果

**优化建议**:

1. **批量请求**: 如果 embedding API 支持，可以批量发送减少请求次数
2. **缓存 embeddings**: 可以将 embedding 结果也存储起来，避免重复计算
3. **并行度控制**: 限制并发请求数，避免API限流
4. **可配置阈值**: 将 `SIMILARITY_THRESHOLD` 放到配置中

## 根据步骤和对应代码提出各个步骤依赖的背景知识点（待对应关系建立之后），并建立全体背景知识点之间的关联关系

我希望能够抽取出各个步骤和代码背后的前置背景知识点，比如机器学习原理、代码语法这种，逐个步骤地去提取，然后把各个步骤的知识点汇总到一起计算embedding语义之间的关联程度，达到一定阈值以上的知识点连边，同时记录二者的余弦相似度以供之后计算。

### Phase 5: 知识点提取与关联

**目标**:

1. 为每个步骤提取相关的背景知识点
2. 计算知识点之间的语义相似度
3. 建立知识关联图

**实施方案**:

```typescript
// 位置: gui/src/redux/thunks/initialGeneration.ts

export const extractAndLinkKnowledge = createAsyncThunk<...>(
  'codeAware/extractAndLinkKnowledge',
  async (_, { dispatch, getState, extra }) => {
    const state = getState();
    const steps = state.codeAwareSession.steps;
    const mappings = state.codeAwareSession.codeAwareMappings;

    // Step 5.1: 逐个步骤提取知识点
    const allKnowledgePoints: KnowledgePoint[] = [];

    for (const step of steps) {
      console.log(`📚 正在为步骤 ${step.id} (${step.title}) 提取知识点...`);

      // 获取该步骤对应的代码块
      const relatedCodeChunks = mappings
        .filter(m => m.semanticElementId === step.id && m.semanticElementType === 'step')
        .map(m => m.codeChunkId);

      const codeContext = getCodeChunkContents(relatedCodeChunks, state); // 辅助函数

      // 调用LLM提取知识点
      const prompt = constructExtractKnowledgePointsPrompt(
        step,
        codeContext
      );

      const result = await extra.ideMessenger.request('llm/complete', {
        prompt,
        completionOptions: {},
        title: 'claude-sonnet-4'
      });

      if (result.status === 'success') {
        const parsed = JSON.parse(result.content);

        // 转换为 KnowledgePoint 格式
        parsed.knowledge_points.forEach((kp: any, idx: number) => {
          const knowledgeId = `k-${step.id}-${idx + 1}`; // 例如: k-s-1-1

          allKnowledgePoints.push({
            id: knowledgeId,
            title: kp.title,
            content: kp.description,
            relatedStepIds: [step.id],
            category: kp.category, // 如: 'syntax', 'algorithm', 'framework', 'concept'
            difficulty: kp.difficulty || 'medium' // 'easy', 'medium', 'hard'
          });
        });
      }
    }

    console.log(`✅ 提取了 ${allKnowledgePoints.length} 个知识点`);

    // Step 5.2: 去重和合并相似的知识点
    const uniqueKnowledgePoints = deduplicateKnowledgePoints(allKnowledgePoints);
    console.log(`✅ 去重后剩余 ${uniqueKnowledgePoints.length} 个知识点`);

    // 存储到Redux
    dispatch(setKnowledgePoints(uniqueKnowledgePoints));

    // Step 5.3: 计算知识点的 embeddings
    console.log('🔍 开始计算知识点的embeddings...');

    const knowledgeEmbeddings = await Promise.all(
      uniqueKnowledgePoints.map(async (kp) => {
        // 使用标题+内容作为embedding输入
        const text = `${kp.title}\n${kp.content}`;

        const result = await extra.ideMessenger.request('llm/embed', {
          text,
          model: 'text-embedding-3-small'
        });

        return {
          knowledgeId: kp.id,
          embedding: result.embedding as number[]
        };
      })
    );

    // Step 5.4: 计算知识点之间的相似度并建立关联
    const knowledgeRelations: KnowledgeRelation[] = [];
    const KNOWLEDGE_SIMILARITY_THRESHOLD = 0.75; // 知识点的相似度阈值可以比代码块高一些

    for (let i = 0; i < knowledgeEmbeddings.length; i++) {
      for (let j = i + 1; j < knowledgeEmbeddings.length; j++) {
        const similarity = cosineSimilarity(
          knowledgeEmbeddings[i].embedding,
          knowledgeEmbeddings[j].embedding
        );

        if (similarity >= KNOWLEDGE_SIMILARITY_THRESHOLD) {
          // 判断关系类型（可选）
          const relationType = inferRelationType(
            uniqueKnowledgePoints[i],
            uniqueKnowledgePoints[j],
            similarity
          );

          knowledgeRelations.push({
            fromKnowledgeId: knowledgeEmbeddings[i].knowledgeId,
            toKnowledgeId: knowledgeEmbeddings[j].knowledgeId,
            similarity,
            relationType,
            createdAt: Date.now()
          });

          // 对称关系
          knowledgeRelations.push({
            fromKnowledgeId: knowledgeEmbeddings[j].knowledgeId,
            toKnowledgeId: knowledgeEmbeddings[i].knowledgeId,
            similarity,
            relationType,
            createdAt: Date.now()
          });
        }
      }
    }

    console.log(`✅ 建立了 ${knowledgeRelations.length} 个知识点关联`);

    // 存储到Redux
    dispatch(setKnowledgeRelations(knowledgeRelations));
  }
);

// 辅助函数：去重知识点
function deduplicateKnowledgePoints(
  points: KnowledgePoint[]
): KnowledgePoint[] {
  const uniqueMap = new Map<string, KnowledgePoint>();

  points.forEach(point => {
    // 使用标题作为去重键（可以改进为使用embedding相似度）
    const key = point.title.toLowerCase().trim();

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, point);
    } else {
      // 合并 relatedStepIds
      const existing = uniqueMap.get(key)!;
      existing.relatedStepIds = [
        ...new Set([...existing.relatedStepIds, ...point.relatedStepIds])
      ];
    }
  });

  return Array.from(uniqueMap.values());
}

// 辅助函数：推断知识点关系类型
function inferRelationType(
  kp1: KnowledgePoint,
  kp2: KnowledgePoint,
  similarity: number
): 'prerequisite' | 'related' {
  // 简单的启发式规则
  // 如果难度不同且相似度高，可能是前置关系
  if (kp1.difficulty !== kp2.difficulty && similarity > 0.85) {
    return 'prerequisite';
  }
  return 'related';
}
```

**需要新增的Prompt** (位于 `core/llm/codeAwarePrompts.ts`):

```typescript
export function constructExtractKnowledgePointsPrompt(
  step: StepItem,
  codeContext: string,
): string {
  return `
你是一个编程教育专家。请提取理解以下步骤所需的背景知识点。

## 步骤信息
**标题**: ${step.title}
**描述**: ${step.abstract}

## 相关代码
\`\`\`
${codeContext}
\`\`\`

## 任务要求
请识别理解这个步骤及其代码所需的**前置背景知识点**，包括：
1. 编程语法知识（如：Python列表推导式、异步函数）
2. 算法和数据结构知识（如：二分查找、哈希表）
3. 框架/库知识（如：React Hooks、FastAPI路由）
4. 领域概念知识（如：机器学习中的交叉验证、Web开发中的CORS）

要求：
- 每个知识点应该是**独立的、可学习的概念**
- 避免过于宽泛（❌"Python基础"）或过于具体（❌"这一行代码的作用"）
- 优先提取**不太常见**或**需要专门学习**的知识点
- 每个步骤提取 2-5 个知识点

返回JSON格式：
{
  "knowledge_points": [
    {
      "title": "知识点标题（简短，5-10字）",
      "description": "知识点的详细描述（1-2句话）",
      "category": "syntax|algorithm|framework|concept",
      "difficulty": "easy|medium|hard"
    },
    ...
  ]
}

## 示例
如果步骤是"实现用户认证中间件"，知识点可能包括：
- {title: "JWT令牌机制", description: "...", category: "concept", difficulty: "medium"}
- {title: "HTTP请求拦截", description: "...", category: "framework", difficulty: "medium"}
`;
}
```

**扩展现有的 KnowledgeCardItem**:
虽然当前系统有 `KnowledgeCardItem`，但它主要用于UI展示。新的 `KnowledgePoint` 是从步骤中自动提取的，可以考虑：

1. 将 `KnowledgePoint` 作为新的数据类型
2. 或者将提取的知识点转换为 `KnowledgeCardItem` 并关联到相应的 `StepItem`

**实施文件总结**:

- `gui/src/redux/thunks/initialGeneration.ts`: 主要逻辑
- `core/llm/codeAwarePrompts.ts`: 新增 `constructExtractKnowledgePointsPrompt`
- `gui/src/redux/slices/codeAwareSlice.ts`: 新增 knowledge 相关的 state 和 actions

## 实施要求与UI更新

### 要求1: UI保持不变，移除Step Description

虽然生成顺序变化，生成内容增加，但是整体的UI和特效没有什么大的变化（除了不再需要step description）

**当前UI结构** (位于 `gui/src/pages/codeaware/CodeAware.tsx`):

- RequirementInput: 用户输入需求
- HighLevelStepList: 显示高级步骤
- StepList: 显示详细步骤（包含 title 和 abstract）
- 各种按钮和交互

**需要修改**:

1. **Step的显示**:

   - 保留 `step.title` 的显示
   - 保留 `step.abstract` 但可以缩短或调整样式
   - 移除任何额外的 description 字段的显示（如果有）

2. **生成代码的按钮**:

   - ❌ 移除或隐藏单个步骤的"生成代码"按钮
   - ✅ 保留用于重新生成的功能（如果步骤被修改后需要重新生成代码）

3. **自动触发流程**:
   - 在用户确认需求后，自动启动 `executeInitialGeneration`
   - 显示 Loading Overlay 并展示进度

### 要求2: 通过Loading Overlay展示进度

你需要通过原先的Loading Overlay去展示这个初始生成过程的进度，通过说明文字，当然首先你需要维护好目前的状态

**当前实现** (位于 `CodeAware.tsx:122`):

```tsx
const LoadingOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

// 当前只显示一个 SpinnerIcon
{
  (isGeneratingSteps || hasGeneratingSteps || hasCodeDirtySteps) && (
    <LoadingOverlay>
      <SpinnerIcon />
    </LoadingOverlay>
  );
}
```

**需要改进**:

```tsx
// 1. 在 CodeAware.tsx 中获取初始生成状态
const initialGenerationStatus = useSelector(
  (state: RootState) => state.codeAwareSession.initialGeneration,
);

const isInitialGenerating =
  initialGenerationStatus.status !== "idle" &&
  initialGenerationStatus.status !== "completed" &&
  initialGenerationStatus.status !== "error";

// 2. 创建增强的 LoadingOverlay 组件
const LoadingContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: ${vscBackground};
  padding: 32px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  max-width: 400px;
`;

const ProgressText = styled.div`
  color: ${vscForeground};
  font-size: 14px;
  text-align: center;
`;

const ProgressBar = styled.div<{ progress: number }>`
  width: 100%;
  height: 4px;
  background: ${lightGray};
  border-radius: 2px;
  overflow: hidden;

  &::after {
    content: "";
    display: block;
    width: ${(props) => props.progress}%;
    height: 100%;
    background: ${vscBadgeBackground};
    transition: width 0.3s ease;
  }
`;

// 3. 使用增强的 LoadingOverlay
{
  isInitialGenerating && (
    <LoadingOverlay>
      <LoadingContent>
        <SpinnerIcon />
        <ProgressText>{initialGenerationStatus.currentPhase}</ProgressText>
        <ProgressBar progress={initialGenerationStatus.progress} />
      </LoadingContent>
    </LoadingOverlay>
  );
}

// 4. 如果有错误，显示错误信息
{
  initialGenerationStatus.status === "error" && (
    <LoadingOverlay>
      <LoadingContent>
        <ErrorIcon /> {/* 可以添加一个错误图标 */}
        <ProgressText style={{ color: vscErrorForeground }}>
          生成过程出错
        </ProgressText>
        <div style={{ fontSize: "12px", color: lightGray }}>
          {initialGenerationStatus.errors.join(", ")}
        </div>
        <button
          onClick={() => {
            // 重试逻辑
            dispatch(resetInitialGenerationStatus());
          }}
        >
          重试
        </button>
      </LoadingContent>
    </LoadingOverlay>
  );
}
```

**进度文本示例**:

- Phase 1 (10%): "正在分析需求并生成任务分解..."
- Phase 2 (30%): "正在生成代码实现... (可能需要几分钟)"
- Phase 3 (60%): "正在建立代码与步骤的对应关系..."
- Phase 4 (75%): "正在分析代码块之间的语义关联..."
- Phase 5 (90%): "正在提取背景知识点..."
- Completed (100%): "初始化完成！"

### 要求3: 流程管理和状态编排

由于初步的生成过程涉及到很多顺序关系和并行生成关系，你需要合理清晰的机制来管理好这些逻辑顺序。

**实施方案**:

**1. 状态机管理** (位于 Redux slice):

```typescript
// 在 codeAwareSlice.ts 中
initialGeneration: {
  status: 'idle',
  currentPhase: '',
  progress: 0,
  errors: [],

  // 可选：记录每个阶段的完成情况
  phases: {
    taskDecomposition: 'pending' | 'running' | 'completed' | 'failed',
    codeGeneration: 'pending' | 'running' | 'completed' | 'failed',
    codeMapping: 'pending' | 'running' | 'completed' | 'failed',
    chunkAnalysis: 'pending' | 'running' | 'completed' | 'failed',
    knowledgeExtraction: 'pending' | 'running' | 'completed' | 'failed',
  }
}
```

**2. 主编排器** (位于 `initialGeneration.ts`):

```typescript
// 已在前面定义的 executeInitialGeneration
// 使用 async/await 确保顺序执行
// 使用 try-catch 处理错误和回滚

// 关键点：
// - Phase 1, 2 必须顺序执行
// - Phase 3, 4 可以部分并行（使用相同的代码块划分）
// - Phase 5 依赖于 Phase 3 的映射结果
```

**3. 并行优化**:

```typescript
// 在 Phase 3 完成代码块分割后，可以并行执行：
const [mappings, chunkRelations] = await Promise.all([
  // Phase 3.2: 映射到步骤
  mapCodeChunksToSteps(...),

  // Phase 4: 代码块关联（使用已分割的代码块）
  Promise.resolve().then(async () => {
    dispatch(updateInitialGenerationStatus({
      status: 'analyzing-chunks',
      currentPhase: '正在分析代码块关联...',
      progress: 75
    }));
    return analyzeCodeChunkRelationsImpl(...);
  })
]);
```

**4. 错误处理和回滚**:

```typescript
// 在每个 Phase 的 try-catch 中
catch (error) {
  console.error(`Phase X failed:`, error);

  // 记录错误
  dispatch(updateInitialGenerationStatus({
    status: 'error',
    errors: [...state.initialGeneration.errors, `Phase X: ${error.message}`]
  }));

  // 可选：回滚已创建的数据
  // 例如：清空已生成的steps、代码块等

  // 重新抛出错误，终止后续流程
  throw error;
}
```

**5. 进度计算**:

```typescript
// 为每个 Phase 分配权重
const PHASE_WEIGHTS = {
  taskDecomposition: 20, // 10% -> 30%
  codeGeneration: 30, // 30% -> 60%
  codeMapping: 20, // 60% -> 80%
  chunkAnalysis: 10, // 80% -> 90%
  knowledgeExtraction: 20, // 90% -> 100%  (总和=100)
};

// 在每个 Phase 内部也可以细分进度
// 例如在 Phase 2 代码生成时，根据 tool calls 的数量更新进度
```

**6. 用户体验优化**:

- 提供"取消"按钮（可选），允许用户中断生成过程
- 生成完成后，自动滚动到第一个高级步骤
- 提供"跳过某些步骤"的选项（例如：跳过知识点提取以加快速度）

## 实施步骤总结

### 阶段一：数据结构准备（1-2天）

1. ✅ 在 `core/index.d.ts` 中定义新的类型

   - `CodeChunkRelation`
   - `KnowledgePoint`
   - `KnowledgeRelation`

2. ✅ 更新 `codeAwareSlice.ts`

   - 添加新的 state 字段
   - 添加新的 reducer actions
   - 添加 `initialGeneration` 状态管理

3. ✅ 创建持久化工具
   - `gui/src/utils/codeAwareStorage.ts`
   - 定义保存/加载函数

### 阶段二：Prompt开发（1-2天）

4. ✅ 在 `core/llm/codeAwarePrompts.ts` 中新增

   - `constructSplitCodeIntoChunksPrompt`
   - `constructMapCodeChunksToStepsPrompt`
   - `constructExtractKnowledgePointsPrompt`

5. ✅ 优化现有 prompt
   - 更新 `constructGenerateStepsPrompt` 以强调任务分解

### 阶段三：核心流程实现（3-5天）

6. ✅ 创建 `gui/src/redux/thunks/initialGeneration.ts`

   - 实现 `executeInitialGeneration` 主编排器
   - 实现 Phase 1: `generateTaskDecomposition`
   - 实现 Phase 2: `generateCompleteCode`
   - 实现 Phase 3: `createCodeToStepMappings`
   - 实现 Phase 4: `analyzeCodeChunkRelations`
   - 实现 Phase 5: `extractAndLinkKnowledge`

7. ✅ 实现辅助函数
   - `cosineSimilarity`
   - `deduplicateKnowledgePoints`
   - 代码块获取和管理函数

### 阶段四：UI更新（1-2天）

8. ✅ 更新 `CodeAware.tsx`

   - 隐藏/移除单步代码生成按钮
   - 实现增强的 Loading Overlay
   - 添加进度显示和错误处理
   - 在需求确认后自动触发 `executeInitialGeneration`

9. ✅ 调整 Step 显示
   - 简化 abstract 的展示（如果需要）
   - 移除多余的 description 字段

### 阶段五：协议和IDE集成（1-2天）

10. ✅ 更新 `core/protocol/`

    - 添加 embedding API 支持（如果还没有）
    - 添加 session 保存/加载的消息类型
    - 添加获取目标文件路径的消息

11. ✅ 实现 IDE 扩展部分
    - `extensions/vscode/`: 处理新的 protocol 消息
    - 实现文件保存/加载逻辑

### 阶段六：测试和优化（2-3天）

12. ✅ 端到端测试

    - 测试完整的初始生成流程
    - 测试错误处理和恢复
    - 测试不同大小的代码生成

13. ✅ 性能优化

    - 批量 embedding 请求
    - 并行化可并行的操作
    - 添加缓存机制

14. ✅ 用户体验优化
    - 调整进度文本
    - 优化加载动画
    - 添加取消和重试功能

### 阶段七：文档和清理（1天）

15. ✅ 更新文档

    - 更新 README 说明新的初始化流程
    - 添加架构图解释新的数据结构
    - 记录 API 和配置选项

16. ✅ 代码清理
    - 移除废弃的代码和注释
    - 统一命名和格式
    - 添加必要的代码注释

## 风险和注意事项

### 技术风险

1. **LLM调用失败**: 任何一个阶段的LLM调用失败都可能导致整个流程中断

   - **缓解**: 实现重试机制、提供手动重新生成选项

2. **代码块分割质量**: LLM可能无法准确分割代码或建立映射

   - **缓解**: 提供验证和手动调整的界面

3. **Embedding API成本**: 大量的embedding计算可能增加成本
   - **缓解**: 缓存embeddings、提供本地embedding选项

### 用户体验风险

1. **等待时间过长**: 完整的初始生成可能需要几分钟

   - **缓解**: 清晰的进度提示、允许后台运行

2. **错误处理复杂**: 多阶段流程的错误恢复较复杂
   - **缓解**: 详细的错误信息、分阶段保存进度

### 数据一致性风险

1. **状态同步**: Redux、IDE文件、持久化JSON需要保持一致

   - **缓解**: 使用事务性保存、提供状态校验

2. **Session切换**: 多session间的数据隔离和加载
   - **缓解**: 使用唯一ID、完整的序列化/反序列化逻辑

## 未来扩展方向

1. **认知进展追踪**: 利用 `Node.score` 字段记录用户对每个元素的理解程度
2. **个性化推荐**: 根据用户的认知状态推荐下一步学习内容
3. **可视化**: 展示代码块关系图、知识图谱的可视化界面
4. **增量更新**: 当代码或步骤变化时，只更新受影响的部分
5. **多文件支持**: 扩展到多文件的代码生成和映射

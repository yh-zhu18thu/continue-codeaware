# CodeAware Mapping 迭代计划

> 基于当前实现和新的 clarification

## 当前实现状态总结

### ✅ 已完成（按原 plan 实现）

1. **基础架构**

   - [x] `CodeAwareMapping` 类型定义（简化版）
   - [x] `NavigationButtons` 组件
   - [x] `mappingSelectors.ts` 选择器
   - [x] `mappingLookup.ts` 基础查找逻辑
   - [x] `handleJumpToSemantic` 和 `handleJumpToCode` 处理函数
   - [x] 移除了自动高亮触发逻辑（已注释掉）

2. **Redux State**

   - [x] `codeAwareMappings: CodeAwareMapping[]`
   - [x] `mappingLookup` 状态管理

3. **用户交互**
   - [x] 左右箭头按钮
   - [x] Loading 状态显示
   - [x] 点击元素高亮（不自动触发代码高亮）

### ❌ 需要重新设计的部分

基于新的 clarification，以下部分需要重构：

1. **Code Chunk 管理**

   - ❌ 当前是静态存储在 Redux state
   - ✅ 应改为：从 editor 实时读取

2. **缓存验证**

   - ❌ 当前查找时只检查 mapping 是否存在
   - ✅ 应改为：检查 code chunk 是否仍然在代码中

3. **Code Chunk 划分**

   - ❌ 当前由 code generation 时确定
   - ✅ 应改为：按空行分割（可配置）

4. **Mapping 范围**

   - ❌ 当前包含 code → knowledgeCard
   - ✅ 应改为：只 map 到 step 级别

5. **智能缓存**
   - ❌ 当前没有利用层级关系
   - ✅ 应增加：highlevel step → step 的优化

---

## 核心设计变更

### 1. Code Chunk 动态获取机制

**原则：代码不存储在 Redux state，而是实时从 editor 读取**

#### 1.1 去除 Redux 中的 codeChunks

```typescript
// codeAwareSlice.ts - 删除此字段
export type CodeAwareSessionState = {
  // ❌ 删除：
  // codeChunks: CodeChunk[];

  // ✅ 保留：
  codeAwareMappings: CodeAwareMapping[];
  // ...
};
```

#### 1.2 实时获取代码并分割

**新建工具函数：`codeChunkUtils.ts`**

```typescript
// gui/src/utils/codeChunkUtils.ts

export interface CodeChunkSplitStrategy {
  name: string;
  split: (code: string, filePath: string) => CodeChunk[];
}

// 策略1: 按空行分割（默认）
export const splitByBlankLine: CodeChunkSplitStrategy = {
  name: "blank-line",
  split: (code: string, filePath: string): CodeChunk[] => {
    const lines = code.split("\n");
    const chunks: CodeChunk[] = [];
    let currentChunk: string[] = [];
    let startLine = 1;
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim() === "") {
        // 遇到空行，结束当前 chunk
        if (currentChunk.length > 0) {
          chunks.push({
            id: `${filePath}-chunk-${chunkIndex}`,
            content: currentChunk.join("\n"),
            filePath,
            range: [startLine, startLine + currentChunk.length - 1],
          });
          chunkIndex++;
          currentChunk = [];
        }
        startLine = i + 2; // 下一行开始
      } else {
        currentChunk.push(line);
      }
    }

    // 最后一个 chunk
    if (currentChunk.length > 0) {
      chunks.push({
        id: `${filePath}-chunk-${chunkIndex}`,
        content: currentChunk.join("\n"),
        filePath,
        range: [startLine, startLine + currentChunk.length - 1],
      });
    }

    return chunks;
  },
};

// 策略2: 按固定行数分割（备选）
export const splitByLineCount: CodeChunkSplitStrategy = {
  name: "line-count",
  split: (code: string, filePath: string, linesPerChunk = 50): CodeChunk[] => {
    // 实现略
  },
};

// 策略3: 按 AST 节点分割（未来扩展）
export const splitByAstNode: CodeChunkSplitStrategy = {
  name: "ast-node",
  split: (code: string, filePath: string): CodeChunk[] => {
    // 实现略
  },
};

// 默认导出当前策略
export const currentStrategy = splitByBlankLine;
```

#### 1.3 修改查找流程：实时读取代码

**修改 `lookupSemanticToCode`**

```typescript
// mappingLookup.ts

export const lookupSemanticToCode = createAsyncThunk<
  CodeAwareMapping[],
  LookupSemanticToCodeParams,
  ThunkApiType
>(
  "codeAware/lookupSemanticToCode",
  async (params, { getState, dispatch, extra }) => {
    const { ideMessenger } = extra;
    const state = getState();

    // 1. 检查缓存
    const cachedMappings = selectCodeChunksBySemanticElementId(
      state,
      params.semanticElementId,
    );

    // 2. 从 IDE 实时读取代码
    const currentFile = await ideMessenger.request("getCurrentFile", undefined);
    if (!currentFile) {
      throw new Error("无法获取当前文件");
    }

    // 3. 分割代码为 chunks
    const codeChunks = currentStrategy.split(
      currentFile.contents,
      currentFile.path,
    );

    // 4. 验证缓存：检查缓存的 code chunk 是否仍然存在
    if (cachedMappings.length > 0) {
      const validMappings = cachedMappings.filter((mapping) => {
        // 通过 ID 前缀或内容比对验证 chunk 是否仍然存在
        const cachedChunk = codeChunks.find(
          (chunk) => chunk.id === mapping.codeChunkId,
        );
        return cachedChunk !== undefined;
      });

      if (validMappings.length > 0) {
        console.log("✅ 缓存有效:", validMappings);
        return validMappings;
      } else {
        console.log("⚠️ 缓存失效，重新查找");
        // 删除失效的缓存
        dispatch(
          removeInvalidMappings(cachedMappings.map((m) => m.codeChunkId)),
        );
      }
    }

    // 5. 调用 LLM 查找新的映射
    // ... (原有逻辑)
  },
);
```

---

### 2. 简化 Mapping 类型

**只保留 step 级别的映射**

#### 2.1 修改类型定义

```typescript
// core/index.d.ts

export interface CodeAwareMapping {
  codeChunkId: string; // 格式: `${filePath}-chunk-${index}`
  semanticElementId: string; // 只能是 highLevelStep 或 step
  semanticElementType: "highLevelStep" | "step"; // 移除 knowledgeCard

  // 缓存元数据
  createdAt: number;
  source: "llm" | "manual" | "initial";
  confidence?: number;
}
```

#### 2.2 Knowledge Card 通过父 Step 间接映射

```typescript
// 新增辅助函数：mappingSelectors.ts

/**
 * 根据 knowledge card ID 查找其父 step 的代码映射
 */
export const selectCodeChunksByKnowledgeCardId = createSelector(
  [
    (state: RootState) => state.codeAwareSession.steps,
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (_: RootState, knowledgeCardId: string) => knowledgeCardId,
  ],
  (steps, mappings, knowledgeCardId) => {
    // 1. 找到 knowledge card 所属的 step
    let parentStepId: string | null = null;
    for (const step of steps) {
      const card = step.knowledgeCards?.find((c) => c.id === knowledgeCardId);
      if (card) {
        parentStepId = step.id;
        break;
      }
    }

    if (!parentStepId) return [];

    // 2. 返回父 step 的代码映射
    return mappings.filter((m) => m.semanticElementId === parentStepId);
  },
);
```

---

### 3. 智能缓存策略

**利用层级关系优化查找**

#### 3.1 策略1: Step → Code 时利用 HighLevel Step

```typescript
// mappingLookup.ts - 增强 lookupSemanticToCode

export const lookupSemanticToCode = createAsyncThunk<
  CodeAwareMapping[],
  LookupSemanticToCodeParams,
  ThunkApiType
>(
  "codeAware/lookupSemanticToCode",
  async (params, { getState, dispatch, extra }) => {
    const state = getState();

    // ... 前置检查 ...

    // 智能策略：如果是 step，先检查其父 highlevel step 的 mapping
    if (params.semanticElementType === "step") {
      const parentHighLevelStepId = findParentHighLevelStepId(
        state,
        params.semanticElementId,
      );

      if (parentHighLevelStepId) {
        const parentMappings = selectCodeChunksBySemanticElementId(
          state,
          parentHighLevelStepId,
        );

        if (parentMappings.length > 0) {
          // 缩小 LLM 查找范围：只在父 highlevel step 的代码块中查找
          console.log(
            `🎯 智能优化：利用父 highlevel step (${parentHighLevelStepId}) 的映射缩小范围`,
          );

          // 获取父 highlevel step 的代码块内容
          const parentCodeChunks = await getCodeChunksByIds(
            parentMappings.map((m) => m.codeChunkId),
            extra.ideMessenger,
          );

          // 只在这些代码块范围内查找
          return await performLLMSearchInScope(
            params.semanticElementId,
            parentCodeChunks,
            dispatch,
            extra.ideMessenger,
          );
        }
      }
    }

    // 降级：全范围查找
    // ... 原有逻辑 ...
  },
);

// 辅助函数：查找父 highlevel step
function findParentHighLevelStepId(
  state: RootState,
  stepId: string,
): string | null {
  // 使用 stepToHighLevelMappings（如果保留）
  const mapping = state.codeAwareSession.stepToHighLevelMappings.find(
    (m) => m.stepId === stepId,
  );
  return mapping ? mapping.highLevelStepId : null;

  // 或者：遍历 highLevelSteps 的顺序推导
  // 实现略
}
```

#### 3.2 策略2: Code → Step 时利用包含关系

```typescript
// mappingLookup.ts - 增强 lookupCodeToSemantic

export const lookupCodeToSemantic = createAsyncThunk<
  CodeAwareMapping[],
  LookupCodeToSemanticParams,
  ThunkApiType
>(
  "codeAware/lookupCodeToSemantic",
  async (params, { getState, dispatch, extra }) => {
    const state = getState();
    const { ideMessenger } = extra;

    // 获取当前代码块
    const currentFile = await ideMessenger.request("getCurrentFile", undefined);
    const codeChunks = currentStrategy.split(
      currentFile.contents,
      currentFile.path,
    );
    const targetChunk = codeChunks.find((c) => c.id === params.codeChunkId);

    if (!targetChunk) {
      throw new Error(`代码块 ${params.codeChunkId} 不存在`);
    }

    // 智能策略：检查是否有其他代码块包含此代码块
    const allMappings = state.codeAwareSession.codeAwareMappings;

    for (const mapping of allMappings) {
      const mappedChunk = codeChunks.find((c) => c.id === mapping.codeChunkId);

      if (!mappedChunk) continue;

      // 检查包含关系（行号范围）
      if (
        mappedChunk.range[0] <= targetChunk.range[0] &&
        mappedChunk.range[1] >= targetChunk.range[1]
      ) {
        console.log(
          `🎯 智能优化：目标代码块包含于已映射的代码块 ${mapping.codeChunkId}`,
        );

        // 直接返回该映射（或继承其 semantic element）
        return [
          {
            codeChunkId: params.codeChunkId,
            semanticElementId: mapping.semanticElementId,
            semanticElementType: mapping.semanticElementType,
            createdAt: Date.now(),
            source: "manual" as const, // 标记为推导得出
            confidence: (mapping.confidence || 0.9) * 0.8, // 降低置信度
          },
        ];
      }
    }

    // 降级：调用 LLM 查找
    // ... 原有逻辑 ...
  },
);
```

---

### 4. 接口设计（供复用）

**设计通用接口，供显式查看和知识卡片生成使用**

#### 4.1 核心接口

```typescript
// mappingLookup.ts

/**
 * 通用接口：建立 semantic element 到 code 的映射
 * 用于显式查看和知识卡片生成
 */
export const establishSemanticToCodeMapping = createAsyncThunk<
  CodeAwareMapping[],
  {
    semanticElementId: string;
    semanticElementType: "highLevelStep" | "step";
    forceRefresh?: boolean; // 是否强制刷新缓存
    strategy?: "smart" | "full"; // 使用智能策略还是全范围查找
  },
  ThunkApiType
>("codeAware/establishSemanticToCodeMapping", async (params, thunkAPI) => {
  // 1. 检查缓存有效性
  const validCachedMappings = await validateCachedMappings(
    params.semanticElementId,
    thunkAPI,
  );

  if (validCachedMappings.length > 0 && !params.forceRefresh) {
    return validCachedMappings;
  }

  // 2. 决定查找策略
  if (params.strategy === "smart") {
    return await smartLookup(params, thunkAPI);
  } else {
    return await fullLookup(params, thunkAPI);
  }
});

/**
 * 通用接口：建立 code 到 semantic element 的映射
 */
export const establishCodeToSemanticMapping = createAsyncThunk<
  CodeAwareMapping[],
  {
    codeSelection: {
      filePath: string;
      startLine: number;
      endLine: number;
    };
    forceRefresh?: boolean;
    strategy?: "smart" | "full";
  },
  ThunkApiType
>("codeAware/establishCodeToSemanticMapping", async (params, thunkAPI) => {
  // 实现类似逻辑
});
```

#### 4.2 在不同场景中复用

**场景1: 用户点击跳转按钮**

```typescript
// CodeAware.tsx

const handleJumpToCode = async () => {
  const result = await dispatch(
    establishSemanticToCodeMapping({
      semanticElementId: focusedElement.id,
      semanticElementType: focusedElement.type,
      strategy: "smart", // 使用智能策略
    }),
  ).unwrap();

  // 高亮结果
  highlightCodeChunks(result);
};
```

**场景2: 生成知识卡片时**

```typescript
// knowledgeCardGeneration.ts

async function generateKnowledgeCard(stepId: string) {
  // 1. 建立 step → code 的映射
  const mappings = await dispatch(
    establishSemanticToCodeMapping({
      semanticElementId: stepId,
      semanticElementType: "step",
      strategy: "smart",
    }),
  ).unwrap();

  // 2. 使用映射的代码块作为上下文生成知识卡片
  const codeContext = await getCodeChunksByIds(
    mappings.map((m) => m.codeChunkId),
    ideMessenger,
  );

  // 3. 调用 LLM 生成知识卡片
  const knowledgeCard = await generateCardWithContext(stepId, codeContext);

  return knowledgeCard;
}
```

---

## 迭代实施步骤

### 阶段 1: 移除静态 Code Chunks（1-2 天）

**目标：** 将 code chunks 从 Redux state 中移除，改为实时读取

#### 1.1 创建 Code Chunk 工具

- [ ] 创建 `gui/src/utils/codeChunkUtils.ts`
- [ ] 实现 `splitByBlankLine` 策略
- [ ] 实现 `splitByLineCount` 策略（备选）
- [ ] 编写单元测试：`codeChunkUtils.test.ts`

#### 1.2 修改 Redux State

- [ ] 从 `CodeAwareSessionState` 删除 `codeChunks` 字段
- [ ] 更新所有引用 `codeChunks` 的代码
- [ ] 修改 selectors 和 reducers

#### 1.3 测试点

- [ ] 编译无错误
- [ ] 现有功能不受影响（暂时兼容）

---

### 阶段 2: 简化 Mapping 类型（0.5 天）

**目标：** 移除 knowledgeCard 类型，只保留 step 级别

#### 2.1 修改类型定义

- [ ] 更新 `core/index.d.ts` 中的 `CodeAwareMapping`
- [ ] 移除 `semanticElementType` 中的 `"knowledgeCard"`

#### 2.2 添加间接查询

- [ ] 在 `mappingSelectors.ts` 添加 `selectCodeChunksByKnowledgeCardId`
- [ ] 通过父 step 间接查询

#### 2.3 更新现有代码

- [ ] 修改 `lookupSemanticToCode` 中的 knowledgeCard 处理逻辑
- [ ] 修改 `handleJumpToCode` 中的 knowledgeCard 处理逻辑

#### 2.4 测试点

- [ ] 点击 knowledge card 跳转时，找到父 step 的 mapping
- [ ] Knowledge card 正确高亮对应代码

---

### 阶段 3: 实现缓存验证机制（1-2 天）

**目标：** 检查缓存中的 code chunk 是否仍然存在于当前代码中

#### 3.1 实现缓存验证逻辑

- [ ] 创建 `validateCachedMappings` 函数
- [ ] 实时读取代码并分割
- [ ] 比对缓存的 code chunk ID 是否仍然存在
- [ ] 添加内容相似度检查（可选，用于代码轻微修改时）

#### 3.2 集成到查找流程

- [ ] 修改 `lookupSemanticToCode`：查找前先验证缓存
- [ ] 修改 `lookupCodeToSemantic`：查找前先验证缓存
- [ ] 添加失效缓存清理逻辑：`removeInvalidMappings`

#### 3.3 添加日志和监控

- [ ] 记录缓存命中率
- [ ] 记录缓存失效率
- [ ] 记录验证耗时

#### 3.4 测试点

- [ ] 代码未修改时，缓存有效
- [ ] 代码修改后，缓存失效并触发重新查找
- [ ] 失效的缓存被正确清理

---

### 阶段 4: 实现智能缓存策略（2-3 天）

**目标：** 利用层级关系优化查找性能

#### 4.1 实现策略1: HighLevel Step → Step

- [ ] 修改 `lookupSemanticToCode`
- [ ] 添加 `findParentHighLevelStepId` 函数
- [ ] 添加 `performLLMSearchInScope` 函数（只在指定代码范围内查找）
- [ ] 测试：查找 step 时优先使用父 highlevel step 的范围

#### 4.2 实现策略2: Code Containment

- [ ] 修改 `lookupCodeToSemantic`
- [ ] 添加包含关系检查逻辑（行号范围比对）
- [ ] 测试：包含关系正确识别

#### 4.3 性能监控

- [ ] 记录智能策略使用率
- [ ] 记录 LLM 查询范围缩小比例
- [ ] 记录查询时间对比

#### 4.4 测试点

- [ ] 查找 step 时，如果父 highlevel step 有 mapping，范围缩小
- [ ] 查找 code 时，如果包含于已映射的 code chunk，直接返回
- [ ] 性能提升明显（查询时间减少 30%+）

---

### 阶段 5: 重构为可复用接口（1 天）

**目标：** 设计通用接口，供多个场景复用

#### 5.1 创建通用接口

- [ ] 实现 `establishSemanticToCodeMapping`
- [ ] 实现 `establishCodeToSemanticMapping`
- [ ] 支持 `strategy` 参数（smart / full）
- [ ] 支持 `forceRefresh` 参数

#### 5.2 重构现有代码使用新接口

- [ ] `handleJumpToCode` 使用新接口
- [ ] `handleJumpToSemantic` 使用新接口

#### 5.3 准备未来集成

- [ ] 设计知识卡片生成时的接口调用方式
- [ ] 编写接口文档

#### 5.4 测试点

- [ ] 现有跳转功能正常
- [ ] 接口参数灵活可配置
- [ ] 接口返回结果一致

---

### 阶段 6: 测试和优化（1-2 天）

#### 6.1 完整集成测试

- [ ] 测试场景1: 用户点击跳转按钮
- [ ] 测试场景2: 代码修改后缓存失效
- [ ] 测试场景3: 智能策略生效
- [ ] 测试场景4: Knowledge card 通过父 step 跳转

#### 6.2 性能测试

- [ ] 缓存命中率 > 70%
- [ ] 缓存验证时间 < 100ms
- [ ] LLM 查询时间 < 2s (P95)
- [ ] 智能策略减少查询范围 > 30%

#### 6.3 边界情况测试

- [ ] 空文件
- [ ] 全是空行的文件
- [ ] 单行代码文件
- [ ] 代码被完全删除
- [ ] 多文件切换

#### 6.4 用户体验优化

- [ ] Loading 状态友好
- [ ] 错误提示清晰
- [ ] 日志记录完整

---

## 总体时间估算

| 阶段 | 任务                 | 预计时间 | 依赖 |
| ---- | -------------------- | -------- | ---- |
| 1    | 移除静态 Code Chunks | 1-2 天   | -    |
| 2    | 简化 Mapping 类型    | 0.5 天   | 1    |
| 3    | 实现缓存验证机制     | 1-2 天   | 1, 2 |
| 4    | 实现智能缓存策略     | 2-3 天   | 3    |
| 5    | 重构为可复用接口     | 1 天     | 4    |
| 6    | 测试和优化           | 1-2 天   | 5    |

**总计：6.5 - 11.5 天（约 1.5 - 2.5 周）**

---

## 风险和注意事项

### 技术风险

1. **代码实时读取的性能**

   - **风险**：频繁读取大文件可能影响性能
   - **缓解**：使用 debounce，缓存文件内容，增量更新

2. **Code Chunk ID 的稳定性**

   - **风险**：代码修改后 chunk ID 变化，缓存失效
   - **缓解**：使用内容哈希或相似度检查，容忍小修改

3. **智能策略的准确性**
   - **风险**：包含关系判断可能不准确
   - **缓解**：添加置信度调整，允许降级到全范围查找

### 用户体验风险

1. **缓存失效频繁**

   - **风险**：用户频繁编辑导致缓存失效，需要等待
   - **缓解**：使用相似度检查，容忍小修改

2. **首次查找慢**
   - **风险**：无缓存时需要等待 LLM
   - **缓解**：显示 Loading 状态，预加载常用映射

---

## 后续扩展方向

### 短期（1-2 月）

1. **多文件支持**

   - 支持跨文件的 code chunk 映射
   - 自动切换到对应文件

2. **更智能的分割策略**

   - 基于 AST 的分割
   - 基于语义的分割

3. **可视化映射关系**
   - 显示 code ↔ semantics 的连线
   - 高亮显示映射范围

### 中期（3-6 月）

1. **协作和共享**

   - 团队共享映射缓存
   - 减少重复 LLM 查询

2. **增量更新**

   - 代码修改时只更新受影响的 mapping
   - 提升性能

3. **自学习机制**
   - 记录用户的手动修正
   - 优化 LLM prompt

---

## 验收标准

### 功能完整性

- [ ] 用户可以通过按钮显式触发跳转
- [ ] Code chunks 实时从 editor 读取
- [ ] 缓存验证机制正常工作
- [ ] 智能缓存策略生效
- [ ] Knowledge card 通过父 step 间接映射
- [ ] 接口可复用于知识卡片生成

### 性能指标

- [ ] 缓存命中率 > 70%
- [ ] 缓存验证时间 < 100ms
- [ ] LLM 查询时间 < 2s (P95)
- [ ] 智能策略减少查询范围 > 30%

### 用户体验

- [ ] Loading 状态清晰
- [ ] 错误提示友好
- [ ] 支持键盘快捷键
- [ ] 无明显卡顿

### 代码质量

- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 代码审查通过
- [ ] 文档完整

---

## 附录

### A. Code Chunk 分割策略对比

| 策略        | 优点                   | 缺点             | 适用场景         |
| ----------- | ---------------------- | ---------------- | ---------------- |
| 按空行分割  | 简单快速，符合代码习惯 | 可能分割不合理   | 大多数代码       |
| 按固定行数  | 保证 chunk 大小均匀    | 可能切断语义块   | 长文件           |
| 按 AST 节点 | 语义准确               | 复杂，性能开销大 | 需要高精度的场景 |

### B. 相关文件清单

**需要修改的文件：**

- `core/index.d.ts` - 简化 `CodeAwareMapping` 类型
- `gui/src/redux/slices/codeAwareSlice.ts` - 删除 `codeChunks` 字段
- `gui/src/redux/selectors/mappingSelectors.ts` - 添加间接查询
- `gui/src/redux/thunks/mappingLookup.ts` - 实现新逻辑
- `gui/src/pages/codeaware/CodeAware.tsx` - 使用新接口

**需要创建的文件：**

- `gui/src/utils/codeChunkUtils.ts` - Code chunk 分割工具
- `gui/src/utils/__tests__/codeChunkUtils.test.ts` - 单元测试

---

**文档版本：** v2.0（迭代版）  
**创建时间：** 2026-03-01  
**基于：** v1.0 + 新的 clarification  
**状态：** 待审阅

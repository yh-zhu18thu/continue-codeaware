# 映射缓存机制使用指南

## 概述

第四阶段实现了基于缓存的映射查找机制，避免重复的 LLM 调用，提升性能和用户体验。

## 新增功能

### 1. Selectors (gui/src/redux/selectors/mappingSelectors.ts)

提供了多个 selector 用于查询缓存：

#### selectSemanticElementsByCodeChunkId

根据代码块 ID 查找所有关联的语义元素映射。

```typescript
import { selectSemanticElementsByCodeChunkId } from "../redux/selectors/mappingSelectors";

// 在组件中使用
const mappings = useAppSelector((state) =>
  selectSemanticElementsByCodeChunkId(state, codeChunkId),
);
```

#### selectCodeChunksBySemanticElementId

根据语义元素 ID 查找所有关联的代码块映射。

```typescript
import { selectCodeChunksBySemanticElementId } from "../redux/selectors/mappingSelectors";

const mappings = useAppSelector((state) =>
  selectCodeChunksBySemanticElementId(state, semanticElementId),
);
```

#### hasCachedMapping

检查缓存中是否存在指定的映射。

```typescript
import { hasCachedMapping } from "../redux/selectors/mappingSelectors";

// 检查代码块是否有缓存
const hasCache = useAppSelector((state) =>
  hasCachedMapping(state, { codeChunkId: "c-1" }),
);

// 检查语义元素是否有缓存
const hasCache = useAppSelector((state) =>
  hasCachedMapping(state, { semanticElementId: "step-1" }),
);
```

#### 其他 Selectors

- `selectMappingCount`: 获取所有映射的数量
- `selectMappingLookupState`: 获取映射查找状态
- `selectMappingsBySource`: 获取按来源分类的映射统计

### 2. Reducers (gui/src/redux/slices/codeAwareSlice.ts)

#### addMappingToCache

添加单个映射到缓存。

```typescript
import { addMappingToCache } from "../redux/slices/codeAwareSlice";

dispatch(
  addMappingToCache({
    codeChunkId: "c-1",
    semanticElementId: "step-1",
    semanticElementType: "step",
    createdAt: Date.now(),
    source: "llm",
    confidence: 0.95,
  }),
);
```

#### addMappingsToBatch

批量添加映射到缓存（推荐用于批量操作）。

```typescript
import { addMappingsToBatch } from "../redux/slices/codeAwareSlice";

const mappings: CodeAwareMapping[] = [
  {
    codeChunkId: "c-1",
    semanticElementId: "step-1",
    semanticElementType: "step",
    createdAt: Date.now(),
    source: "llm",
    confidence: 0.95,
  },
  {
    codeChunkId: "c-2",
    semanticElementId: "step-2",
    semanticElementType: "step",
    createdAt: Date.now(),
    source: "llm",
    confidence: 0.88,
  },
];

dispatch(addMappingsToBatch(mappings));
```

#### cleanupExpiredMappings

清除过期的映射缓存。

```typescript
import { cleanupExpiredMappings } from "../redux/slices/codeAwareSlice";

// 清除 24 小时前的缓存
const EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 小时
dispatch(cleanupExpiredMappings(EXPIRATION_TIME));
```

#### 查找状态管理

```typescript
import {
  setMappingLookupLoading,
  setMappingLookupError,
  setMappingLookupQuery,
} from "../redux/slices/codeAwareSlice";

// 设置加载状态
dispatch(setMappingLookupLoading(true));

// 设置错误信息
dispatch(setMappingLookupError("查找失败，请重试"));

// 记录查询信息
dispatch(
  setMappingLookupQuery({
    type: "code",
    elementId: "c-1",
    timestamp: Date.now(),
  }),
);
```

## 使用场景示例

### 场景 1：检查缓存并查找映射

```typescript
const handleJumpToSemantic = useCallback(async () => {
  const codeChunkId = getCurrentFocusedCode();

  // 1. 检查缓存
  const hasCache = useAppSelector((state) =>
    hasCachedMapping(state, { codeChunkId }),
  );

  if (hasCache) {
    // 2. 从缓存获取映射
    const mappings = useAppSelector((state) =>
      selectSemanticElementsByCodeChunkId(state, codeChunkId),
    );

    // 3. 使用映射高亮语义元素
    highlightSemanticElements(mappings);
  } else {
    // 4. 缓存未命中，调用 LLM（第五阶段实现）
    // await lookupCodeToSemantic(codeChunkId);
  }
}, []);
```

### 场景 2：批量添加初始映射

```typescript
const initializeMappings = useCallback(() => {
  const initialMappings: CodeAwareMapping[] = [];

  // 从现有数据生成初始映射
  codeChunks.forEach((chunk) => {
    // 根据某些逻辑关联语义元素
    const relatedStep = findRelatedStep(chunk);
    if (relatedStep) {
      initialMappings.push({
        codeChunkId: chunk.id,
        semanticElementId: relatedStep.id,
        semanticElementType: "step",
        createdAt: Date.now(),
        source: "initial",
      });
    }
  });

  dispatch(addMappingsToBatch(initialMappings));
}, [codeChunks, dispatch]);
```

### 场景 3：定期清理过期缓存

```typescript
useEffect(() => {
  // 每小时清理一次过期缓存
  const interval = setInterval(
    () => {
      const EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 小时
      dispatch(cleanupExpiredMappings(EXPIRATION_TIME));
    },
    60 * 60 * 1000,
  ); // 1 小时

  return () => clearInterval(interval);
}, [dispatch]);
```

## 性能优化建议

1. **批量操作优先**：使用 `addMappingsToBatch` 而不是多次调用 `addMappingToCache`
2. **定期清理**：设置合理的过期时间，避免缓存无限增长
3. **监控命中率**：使用 `selectMappingsBySource` 监控缓存来源分布
4. **避免重复**：添加前检查缓存是否已存在（reducers 已自动处理）

## 数据结构

### CodeAwareMapping

```typescript
interface CodeAwareMapping {
  codeChunkId: string; // 代码块 ID
  semanticElementId: string; // 语义元素 ID
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";
  createdAt: number; // 创建时间戳
  source: "llm" | "manual" | "initial"; // 来源
  confidence?: number; // 置信度（可选，0-1）
}
```

### MappingLookup State

```typescript
interface MappingLookup {
  isLoading: boolean;
  lastQuery?: {
    type: "code" | "semantic";
    elementId: string;
    timestamp: number;
  };
  error?: string;
}
```

## 下一步（第五阶段）

第四阶段实现了缓存机制的基础设施。第五阶段将实现 LLM 映射查找：

1. 创建 `mappingLookup.ts` thunk 文件
2. 实现 `lookupCodeToSemantic` 和 `lookupSemanticToCode`
3. 设计 LLM prompt 模板
4. 集成缓存查找和 LLM 查找的完整流程

## 测试

所有新增功能已通过类型检查，编译无错误。建议在实际使用前进行以下测试：

- [ ] 添加单个映射到缓存
- [ ] 批量添加映射到缓存
- [ ] 查询缓存中的映射
- [ ] 检查缓存是否存在
- [ ] 清理过期缓存
- [ ] 查找状态管理

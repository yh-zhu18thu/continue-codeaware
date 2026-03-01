# 代码块创建功能实现说明

## 📋 概述

实现了基础的代码块创建功能，用于支持"代码-语义"映射查找机制。当代码生成完成后，自动将生成的代码切分为 `CodeChunk` 对象，以便 LLM 可以查找映射关系。

## ✅ 已完成的工作

### 1. 创建代码块切分逻辑

**文件**: [`gui/src/redux/thunks/codeChunkCreation.ts`](gui/src/redux/thunks/codeChunkCreation.ts)

实现了三个 thunk：

#### `createCodeChunksFromFile`

- **策略**: 简单按行数切分（快速实现版本）
- **规则**:
  - 文件 ≤ 50 行：整个文件作为一个 chunk
  - 文件 > 50 行：每 50 行切分为一个 chunk
- **ID 格式**: `c-<filename>-<index>` (例如: `c-app-py-1`, `c-app-py-2`)
- **优点**: 实现简单、可预测、立即可用
- **缺点**: 可能在函数/类中间切分

#### `createCodeChunksFromCurrentFile`

- 从当前编辑器中的文件创建代码块
- 自动调用 IDE 的 `getCurrentFile` 获取文件内容
- 适合在代码生成完成后立即调用

#### `createCodeChunksFromFileWithAST` (TODO)

- 预留的高级版本接口
- 计划使用 AST 智能切分（tree-sitter）
- 按语义单元切分（类、函数、方法）

### 2. 集成到代码生成流程

**修改文件**: [`gui/src/pages/codeaware/CodeAware.tsx`](gui/src/pages/codeaware/CodeAware.tsx)

在两个代码生成完成的位置添加了自动创建代码块的逻辑：

1. **重新生成代码时** (Line ~1193)
2. **执行到步骤时** (Line ~1726)

```typescript
// 🆕 创建代码块（用于映射功能）
console.log("📦 开始创建代码块...");
try {
  const chunksResult = await dispatch(createCodeChunksFromCurrentFile());
  if (createCodeChunksFromCurrentFile.fulfilled.match(chunksResult)) {
    console.log(`✅ 代码块创建完成: ${chunksResult.payload.length} 个`);
  }
} catch (error) {
  console.warn("⚠️ 代码块创建失败:", error);
}
```

## 🎯 使用方法

### 自动触发（推荐）

代码生成完成后会自动创建代码块，无需手动操作。

查看控制台日志：

```
📦 开始创建代码块...
📂 正在获取当前文件...
✅ 获取到文件: /path/to/file.py
📦 开始为文件创建代码块: /path/to/file.py
📋 文件内容长度: 1234 字符
📋 文件总行数: 45
✅ 创建单个代码块: c-path-to-file-py-1 (1-45行)
🎉 完成代码块创建: 共 1 个代码块
✅ 代码块创建完成: 1 个
```

### 手动触发（调试）

如果需要手动创建代码块：

```typescript
import { createCodeChunksFromCurrentFile } from "./redux/thunks/codeChunkCreation";

// 在某个组件或处理函数中
const handleCreateChunks = async () => {
  const result = await dispatch(createCodeChunksFromCurrentFile());
  console.log("Created chunks:", result.payload);
};
```

## 📊 数据结构

创建的 `CodeChunk` 对象格式：

```typescript
{
  id: "c-app-py-1",                 // 唯一ID
  content: "def main():\n ...",     // 代码内容
  range: [1, 50],                   // 行号范围 [起始, 结束]
  filePath: "/path/to/app.py",      // 文件路径
  isHighlighted: false,             // 是否高亮
  disabled: false                   // 是否禁用
}
```

存储在 Redux state:

```typescript
state.codeAwareSession.codeChunks;
```

## 🔄 与映射功能的配合

1. **代码生成** → 自动创建代码块
2. **用户点击"跳转到代码"按钮** → LLM 查询时有候选代码块可选
3. **LLM 返回映射关系** → 根据 `codeChunkId` 查找对应的代码块
4. **高亮代码** → 在 IDE 中高亮找到的代码块

## ⚡ 性能优化建议

### 当前实现（简单切分）

- 优势：快速、可预测、易于调试
- 时间复杂度：O(n) - n 为行数
- 适用场景：验证映射功能、原型开发

### 未来优化（AST切分）

- 优势：按语义切分、更符合直觉
- 需要做的工作：
  1. 复用 `core/indexing/chunk/chunk.ts` 中的 `chunkDocumentWithoutId`
  2. 处理 chunk ID 生成逻辑
  3. 处理不支持的文件类型降级
- 估计时间：1-2天

## 🐛 调试技巧

### 检查代码块是否创建

在浏览器控制台运行：

```javascript
// 查看当前有多少代码块
$r.props.codeChunks.length;

// 查看所有代码块
$r.props.codeChunks;

// 查看第一个代码块
$r.props.codeChunks[0];
```

或在 Redux DevTools 中查看：

```
State → codeAwareSession → codeChunks
```

### 常见问题

**Q: 点击"跳转到代码"按钮没反应？**
A: 检查 `codeChunks` 数组是否为空：

```javascript
console.log("代码块数量:", $r.props.codeChunks.length);
```

如果为空，说明代码生成后没有自动创建代码块，检查控制台是否有错误。

**Q: LLM 找不到映射关系？**
A: 可能原因：

1. 代码块的内容与语义描述差异太大
2. 代码块切分太细或太粗
3. LLM prompt 需要优化

**Q: 代码块 ID 格式不一致？**
A: 当前使用的 ID 格式：`c-<sanitized-filepath>-<index>`

- 文件路径中的非字母数字字符会被替换为 `-`
- 例如：`/path/to/file.py` → `c-path-to-file-py-1`

## 📈 未来改进方向

### 短期（1-2周）

- [ ] 添加手动刷新代码块的按钮（UI）
- [ ] 支持多文件项目的代码块管理
- [ ] 优化 chunk size（根据实际使用调整）

### 中期（1-2月）

- [ ] 实现 AST 智能切分
- [ ] 支持增量更新（代码编辑后只更新变化的部分）
- [ ] 添加代码块可视化（在UI上显示）

### 长期（3月+）

- [ ] 支持不同语言的最优切分策略
- [ ] 机器学习优化切分算法
- [ ] 跨文件依赖分析

## 🔗 相关文件

- **类型定义**: [`core/index.d.ts`](core/index.d.ts) - `CodeChunk` 接口
- **Redux Slice**: [`gui/src/redux/slices/codeAwareSlice.ts`](gui/src/redux/slices/codeAwareSlice.ts) - `createOrGetCodeChunk` reducer
- **映射查找**: [`gui/src/redux/thunks/mappingLookup.ts`](gui/src/redux/thunks/mappingLookup.ts) - LLM 查找逻辑
- **已有切分实现**:
  - [`core/indexing/chunk/basic.ts`](core/indexing/chunk/basic.ts) - 基础按行切分
  - [`core/indexing/chunk/code.ts`](core/indexing/chunk/code.ts) - AST智能切分

## 📝 测试建议

1. **基础功能测试**

   - 生成一个简单文件（<50行）
   - 检查是否创建了1个代码块
   - 点击"跳转到代码"按钮，验证映射是否正常

2. **大文件测试**

   - 生成一个100行的文件
   - 检查是否创建了2个代码块（每50行一个）
   - 验证行号范围是否正确

3. **映射功能测试**
   - 生成代码后，点击某个 step
   - 点击"跳转到代码"按钮
   - 检查是否正确高亮对应的代码块

## ✅ 验收标准

- [x] 代码生成完成后自动创建代码块
- [x] 代码块正确存储到 Redux state
- [x] 代码块 ID 格式符合预期
- [x] 行号范围正确
- [x] 文件路径正确
- [x] 映射查找可以使用这些代码块
- [x] 无 TypeScript 编译错误
- [x] 控制台日志清晰易读

---

**实现日期**: 2026-02-28  
**实现者**: GitHub Copilot  
**状态**: ✅ 已完成并集成

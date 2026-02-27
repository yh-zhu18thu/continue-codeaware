# Edit File 完整流程分析

## 📋 问题描述

使用 `edit_existing_file` 工具时，界面显示 JSON 格式的 diff 而不是正常的代码 diff：

```json
{
  "code": "import streamlit as st\n...",
  "changes": [...]
}
```

## 🔄 完整流程梳理

### 1️⃣ 用户发起编辑请求

**位置**: GUI (React/Redux)

- 用户在聊天界面输入编辑需求
- 触发 `streamCodeGenerationThunk`

### 2️⃣ LLM 生成工具调用

**位置**: `gui/src/redux/thunks/streamCodeGeneration.ts`

- LLM 根据 prompt 生成 `edit_existing_file` 工具调用
- **参数结构**:
  ```json
  {
    "name": "edit_existing_file",
    "arguments": {
      "filepath": "app.py",
      "changes": "# ... existing code ...\n\ndef new_function():\n    pass\n\n# ... existing code ..."
    }
  }
  ```

**问题点**:

- Prompt 明确要求使用 `# ... existing code ...` 占位符
- 这样可以减少 token 使用量
- 但会触发后续的 LLM 处理流程

### 3️⃣ 工具参数预处理

**位置**: `core/tools/definitions/editFile.ts` - `preprocessArgs`

```typescript
preprocessArgs(args) {
  // 检查 args.changes 是否是 JSON 格式
  if (looksLikeJson(args.changes)) {
    throw new Error("Changes parameter must be raw code, not JSON");
  }
  return args;
}
```

**状态**: ✅ 通过

- 此时 `args.changes` 是字符串形式的代码（包含 lazy text）
- 不是 JSON 对象，所以能通过检查

### 4️⃣ 客户端工具调用

**位置**: `gui/src/util/clientTools/editImpl.ts`

```typescript
await ide.applyForEditTool({
  filepath: args.filepath,
  changes: args.changes, // 原始字符串
  noEdit: args.no_edit,
});
```

**状态**: ✅ 传递

- 参数正常传递给 IDE

### 5️⃣ VS Code 应用管理器

**位置**: `extensions/vscode/src/apply/ApplyManager.ts` - `applyToFile`

```typescript
async applyToFile(args) {
  const document = await vscode.workspace.openTextDocument(args.filepath);
  return handleExistingDocument(document, args.changes);
}
```

**状态**: ✅ 传递

- 打开文件并传递给处理函数

### 6️⃣ 代码块应用路由

**位置**: `core/edit/lazy/applyCodeBlock.ts`

```typescript
async function applyCodeBlock(oldFile, newLazyFile, filename, llm, abortController) {
  // 1. 尝试确定性应用 (tree-sitter based)
  if (canUseInstantApply(filename)) {
    const diffLines = await deterministicApplyLazyEdit({
      oldFile,
      newLazyFile,  // 包含 "# ... existing code ..."
      filename,
      onlyFullFileRewrite: true,
    });

    if (diffLines !== undefined) {
      return { isInstantApply: true, diffLinesGenerator: ... };
    }
  }

  // 2. 检查是否是 unified diff 格式
  if (isUnifiedDiffFormat(newLazyFile)) {
    return applyUnifiedDiff(...);
  }

  // 3. 回退到 LLM-based 应用
  return {
    isInstantApply: false,
    diffLinesGenerator: streamLazyApply(oldFile, filename, newLazyFile, llm, abortController),
  };
}
```

### 7️⃣ 确定性应用 (失败)

**位置**: `core/edit/lazy/deterministic.ts`

```typescript
async function deterministicApplyLazyEdit({
  oldFile,
  newLazyFile,
  filename,
  onlyFullFileRewrite,
}) {
  const parser = await getParserForFile(filename);
  const newTree = parser.parse(newLazyFile);

  if (onlyFullFileRewrite) {
    const hasLazyText = isLazyText(newTree.rootNode.text); // 检测 "... existing code ..."

    if (!hasLazyText) {
      return myersDiff(oldFile, newLazyFile); // ✅ 直接计算 diff
    } else {
      return undefined; // ❌ 有 lazy text，返回 undefined
    }
  }
}
```

**状态**: ❌ 失败

- **原因**: 检测到 `# ... existing code ...` lazy text
- **结果**: 返回 undefined，触发回退

### 8️⃣ LLM-based 应用 (问题所在)

**位置**: `core/edit/lazy/streamLazyApply.ts`

```typescript
async function* streamLazyApply(
  oldCode,
  filename,
  newCode,
  llm,
  abortController,
) {
  // 构建 prompt
  const promptMessages = promptFactory(oldCode, filename, newCode);
  // LLM prompt 内容:
  // "Above is ORIGINAL CODE and NEW CODE. Apply NEW CODE to ORIGINAL CODE."

  // 调用 LLM
  const lazyCompletion = llm.streamChat(promptMessages, signal);

  // 🔴 问题: LLM 返回 JSON 格式
  // 期望: "import streamlit as st\n..."
  // 实际: {"code": "import streamlit as st\n...", "changes": [...]}

  // 收集输出
  let fullOutput = "";
  for await (const message of lazyCompletion) {
    fullOutput += renderChatMessage(message);
  }

  // 检测并提取 JSON
  const jsonCheck = detectAndHandleJsonOutput(fullOutput);
  let processedOutput = fullOutput;

  if (jsonCheck.isJson && jsonCheck.extractedCode) {
    processedOutput = jsonCheck.extractedCode;
  }

  // 转换为流并处理
  const stream = stringToStream(processedOutput);
  const lines = streamLines(stream);
  const diffLines = streamDiff(oldLines, lines);

  yield* diffLines;
}
```

**状态**: 🔴 问题

- **原因**: LLM 违反 prompt 指令，返回 JSON 格式
- **尝试修复**: 检测 JSON 并提取 `code` 字段
- **当前状态**: 提取逻辑已实现，但可能还有问题

## 🔍 问题根因分析

### 为什么 LLM 返回 JSON？

1. **Prompt 冲突**:

   - 代码生成阶段 prompt: "使用 `# ... existing code ...` 占位符"
   - streamLazyApply prompt: "返回纯代码，不要用 JSON"
   - LLM 可能混淆了两个指令

2. **模型习惯**:

   - 某些 LLM 倾向于用结构化格式（JSON）返回结果
   - 即使 prompt 明确禁止

3. **Lazy text 触发**:
   - 只有当代码包含 `# ... existing code ...` 时才会进入 streamLazyApply
   - 如果代码是完整的，会走 deterministicApplyLazyEdit，不会有问题

## 💡 可能的解决方案

### 方案 1: 禁止生成 lazy text（最激进）

**修改**: `gui/src/redux/thunks/streamCodeGeneration.ts`

```typescript
**For edit_existing_file tool**:
- Generate COMPLETE code, without using placeholders like "# ... existing code ..."
- Write out all code sections explicitly
- If the file is too long, focus on the changed sections and include sufficient context
```

**优点**:

- 完全避免进入 streamLazyApply
- 使用 deterministicApplyLazyEdit 的 Myers diff（快速、准确）
- 不依赖第二次 LLM 调用

**缺点**:

- 增加 token 使用量
- 对于大文件可能超出 context 限制

### 方案 2: 强制 deterministicApplyLazyEdit 处理 lazy text（最激进）

**修改**: `core/edit/lazy/deterministic.ts`

```typescript
if (onlyFullFileRewrite) {
  const hasLazyText = isLazyText(newTree.rootNode.text);

  if (!hasLazyText) {
    return myersDiff(oldFile, newLazyFile);
  } else {
    // 新增: 直接移除 lazy text 注释，然后计算 diff
    const cleanedCode = removeLazyTextComments(newLazyFile);
    return myersDiff(oldFile, cleanedCode);
  }
}
```

**优点**:

- 简单直接
- 避免第二次 LLM 调用

**缺点**:

- 移除占位符后可能不知道该保留哪些内容
- 容易导致错误的 diff（删除不该删除的代码）

### 方案 3: 改进 JSON 提取逻辑（当前方案）

**修改**: `core/edit/lazy/streamLazyApply.ts`

- ✅ 已实现收集完整输出
- ✅ 已实现 JSON 检测
- ✅ 已实现从 `code`, `result`, `updated_code` 字段提取
- ⚠️ 需要验证是否正常工作

**优点**:

- 保持现有 token 优化（使用 lazy text）
- 作为保底方案处理 LLM 错误输出

**缺点**:

- 依赖 LLM 行为不稳定
- 增加处理复杂度

### 方案 4: 增强 streamLazyApply prompt（最保守）

**修改**: `core/edit/lazy/prompts.ts`

```typescript
const RULES = [
  "Your response should be a code block containing a rewritten version of the file.",
  "⚠️ CRITICAL: You must return ONLY the raw code.",
  '⚠️ Do NOT return JSON format like {"code": "...", "changes": [...]}',
  "⚠️ Do NOT wrap your response in any structured format (JSON, XML, YAML)",
  "⚠️ Your response must be plain code that can be directly written to a file",
  "⚠️ Do NOT add any explanations before or after the code",
  // ...
];
```

**优点**:

- 风险最低
- 不改变现有流程

**缺点**:

- 不能保证 LLM 遵守
- 可能仍需要 JSON 提取作为保底

## 🎯 推荐方案

### 组合方案: 1 + 3

1. **修改代码生成 prompt** (方案 1):

   - 对于小文件（< 500 行）: 禁止使用 lazy text
   - 对于大文件（>= 500 行）: 允许使用 lazy text，但提醒 LLM 生成完整的修改块

2. **保留 JSON 提取逻辑** (方案 3):
   - 作为保底方案
   - 即使 prompt 改进了，仍然可以处理偶发的 JSON 输出

### 实施步骤

#### 步骤 1: 修改代码生成 prompt

```typescript
// gui/src/redux/thunks/streamCodeGeneration.ts
**For edit_existing_file tool**:
- ⚠️ CRITICAL: For small files (< 500 lines), generate COMPLETE code WITHOUT placeholders
- For larger files, you may use "# ... existing code ..." but provide sufficient context (at least 5 lines before and after changes)
- Ensure the modified code sections are complete and self-contained
```

#### 步骤 2: 验证 JSON 提取

- 测试当前的 `detectAndHandleJsonOutput` 函数
- 确保能正确提取 `code` 字段
- 添加更多日志以便调试

#### 步骤 3: 添加回退机制

```typescript
// core/edit/lazy/applyCodeBlock.ts
// 如果 streamLazyApply 也失败，尝试直接使用 newLazyFile
if (processedOutput.trim().startsWith("{")) {
  // 仍然是 JSON，尝试最后的措施
  console.error(
    "Failed to extract code from JSON, using raw input as fallback",
  );
  return myersDiff(oldFile, newLazyFile);
}
```

## 📊 对比各方案的效果

| 方案                    | 稳定性     | Token 成本 | 实施难度 | 用户体验        |
| ----------------------- | ---------- | ---------- | -------- | --------------- |
| 方案 1 (禁止 lazy text) | ⭐⭐⭐⭐⭐ | 📈 高      | ⚙️ 简单  | 😊 好           |
| 方案 2 (强制处理)       | ⭐⭐       | 📉 低      | ⚙️ 中等  | 😐 差（易出错） |
| 方案 3 (JSON 提取)      | ⭐⭐⭐     | 📉 低      | ⚙️ 中等  | 😊 中等         |
| 方案 4 (改进 prompt)    | ⭐⭐       | 📉 低      | ⚙️ 简单  | 😐 不确定       |
| **组合方案 (1+3)**      | ⭐⭐⭐⭐⭐ | 📈 中等    | ⚙️ 中等  | 😊 最好         |

## 🔧 立即可以执行的修复

基于当前代码，让我修复 JSON 提取逻辑中的可能问题。

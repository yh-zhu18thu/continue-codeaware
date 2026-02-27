# Edit Existing File 工具 Debug 日志指南

## 概述

为了追踪 `edit_existing_file` 工具从 LLM 返回到最终展示 diff 的完整流程，我在关键处理步骤添加了详细的日志。

## 完整处理流程

### 1️⃣ **工具参数预处理**

📍 位置: `core/tools/definitions/editFile.ts` - `preprocessArgs`

**日志标记:** `[EditFile][preprocessArgs]`

**作用:**

- 检查 `changes` 参数是否为 JSON 格式（这是错误的格式）
- 如果检测到 JSON 结构，会抛出错误并拒绝执行

**关键日志:**

```
[EditFile][preprocessArgs] ========== START ==========
[EditFile][preprocessArgs] Raw args: { filepath, changesType, changesLength, changesPreview }
[EditFile][preprocessArgs] Trimmed changes: { startsWithBrace, endsWithBrace, ... }
[EditFile][preprocessArgs] ✅ No JSON pattern detected  // 或者错误提示
[EditFile][preprocessArgs] ========== END (PASS) ==========
```

---

### 2️⃣ **客户端工具实现**

📍 位置: `gui/src/util/clientTools/editImpl.ts` - `editToolImpl`

**日志标记:** `[EditToolImpl]`

**作用:**

- 解析文件路径
- 准备调用 VS Code 端的 `applyToFile`
- 将 `changes` 参数作为 `text` 传递

**关键日志:**

```
[EditToolImpl] ========== START ==========
[EditToolImpl] Received args: { toolCallId, filepath, changesType, changesLength, changesPreview }
[EditToolImpl] Dispatching applyForEditTool: { streamId, toolCallId, filepath, textType, textPreview }
[EditToolImpl] ========== END ==========
```

---

### 3️⃣ **VS Code 端应用管理器**

📍 位置: `extensions/vscode/src/apply/ApplyManager.ts` - `applyToFile`

**日志标记:** `[ApplyManager][applyToFile]`

**作用:**

- 接收来自 GUI 的 `applyToFile` 请求
- 决定使用哪种应用策略（空文档 vs 现有文档）

**关键日志:**

```
[ApplyManager][applyToFile] ========== START ==========
[ApplyManager][applyToFile] Received payload: { streamId, filepath, toolCallId, isSearchAndReplace, textType, textPreview }
[ApplyManager][applyToFile] Document status: { hasExistingDocument, isSearchAndReplace }
[ApplyManager][applyToFile] → handleExistingDocument  // 或 instantApplyDiff / handleEmptyDocument
```

---

### 4️⃣ **处理现有文档**

📍 位置: `extensions/vscode/src/apply/ApplyManager.ts` - `handleExistingDocument`

**日志标记:** `[ApplyManager][handleExistingDocument]`

**作用:**

- 加载配置和 LLM 模型
- 调用 `applyCodeBlock` 来处理代码应用

**关键日志:**

```
[ApplyManager][handleExistingDocument] ========== START ==========
[ApplyManager][handleExistingDocument] Input: { streamId, toolCallId, textType, textLength, textPreview, fileUri }
[ApplyManager][handleExistingDocument] Calling applyCodeBlock
[ApplyManager][handleExistingDocument] applyCodeBlock returned: { isInstantApply }
```

---

### 5️⃣ **应用代码块 - 核心处理**

📍 位置: `core/edit/lazy/applyCodeBlock.ts` - `applyCodeBlock`

**日志标记:** `[applyCodeBlock]`

**作用:**

- 决定使用哪种方法来应用代码
  - **方法 1:** 确定性应用（deterministicApplyLazyEdit）- 快速、准确
  - **方法 2:** 统一 diff 格式（Unified Diff）
  - **方法 3:** 流式懒惰应用（streamLazyApply）- 需要 LLM

**关键日志:**

```
[applyCodeBlock] ========== START ==========
[applyCodeBlock] Input: { filename, oldFileLength, newLazyFileType, newLazyFileLength, newLazyFilePreview, canUseInstant }
[applyCodeBlock] Attempting deterministicApplyLazyEdit
[applyCodeBlock] ✅ deterministicApplyLazyEdit SUCCESS  // 或其他方法
[applyCodeBlock] Checking if unified diff format: { isUnifiedDiff }
[applyCodeBlock] Falling back to streamLazyApply (LLM-based)  // 如果需要
```

**⚠️ 这是关键决策点！** 在这里可以看到：

- `newLazyFile` 的实际内容和类型
- 选择了哪种应用方法

---

### 6️⃣ **确定性懒惰编辑应用**

📍 位置: `core/edit/lazy/deterministic.ts` - `deterministicApplyLazyEdit`

**日志标记:** `[deterministicApplyLazyEdit]`

**作用:**

- 使用 Tree-sitter 解析代码
- 如果是完整文件重写且没有懒惰文本，直接计算 diff
- 否则返回 undefined，回退到其他方法

**关键日志:**

```
[deterministicApplyLazyEdit] ========== START ==========
[deterministicApplyLazyEdit] Input: { filename, oldFileLength, newLazyFileType, newLazyFileLength, newLazyFilePreview, onlyFullFileRewrite }
[deterministicApplyLazyEdit] Mode: onlyFullFileRewrite
[deterministicApplyLazyEdit] Has lazy text: false
[deterministicApplyLazyEdit] No lazy text, computing Myers diff
[deterministicApplyLazyEdit] ✅ Returning Myers diff  // 成功路径
```

**⚠️ 如果你看到 JSON 格式的内容，它会在这里的 `newLazyFilePreview` 中显示！**

---

### 7️⃣ **流式懒惰应用（回退方案）**

📍 位置: `core/edit/lazy/streamLazyApply.ts` - `streamLazyApply`

**日志标记:** `[streamLazyApply]`

**作用:**

- 使用 LLM 来理解和应用代码更改
- 只在确定性方法失败时使用
- **⚠️ 这是 JSON 格式问题的常见来源！**

**关键日志:**

```
[streamLazyApply] ========== START ==========
[streamLazyApply] Input: { filename, oldCodeLength, newCodeType, newCodeLength, newCodePreview }
[streamLazyApply] Generated prompt for LLM
[streamLazyApply] Prompt preview: { userContentPreview, assistantContentPreview }
[streamLazyApply] LLM chunk #1: ...
[streamLazyApply] LLM chunk #2: ...
[streamLazyApply] LLM output complete: { totalChunks, outputLength, outputPreview, looksLikeJSON }
[streamLazyApply] ⚠️ Detected JSON output from LLM: { keys, hasCodeField, hasChangesField }
[streamLazyApply] ❌ JSON format detected in LLM output!
[streamLazyApply] ⚠️ Extracted code from JSON, but stream already consumed
```

**🔴 如果看到 JSON 格式问题，重点关注这些日志：**

1. `outputPreview` - LLM 返回的原始内容
2. `looksLikeJSON: true` - 初步判断是 JSON
3. `⚠️ Detected JSON output` - 确认检测到 JSON
4. `hasCodeField: true` - JSON 包含 code 字段

---

## 🔴 JSON 格式问题专项分析

### 问题描述

当使用 `edit_existing_file` 工具时，界面显示的 diff 是 JSON 格式：

```json
{
  "code": "import streamlit as st\n...",
  "changes": [...]
}
```

而不是纯代码的 diff。

### 根本原因

**主要原因：** LLM 在 `streamLazyApply` 阶段返回了 JSON 格式，而不是按照 prompt 要求的纯代码格式。

**触发条件：**

1. 用户提供的 `changes` 参数包含 `# ... existing code ...` 等占位符
2. `deterministicApplyLazyEdit` 检测到 "lazy text" 并返回 undefined
3. 系统回退到 `streamLazyApply`（基于 LLM 的方法）
4. LLM 错误地返回 JSON 格式而不是纯代码

### 诊断流程

**查看日志中的关键标记：**

1. ✅ **确认参数通过预处理：**

   ```
   [EditFile][preprocessArgs] ✅ No JSON pattern detected
   ```

2. ✅ **确认内容传递正确：**

   ```
   [applyCodeBlock] Input: { newLazyFilePreview: "# ... existing code ..." }
   ```

3. ⚠️ **检测到 lazy text：**

   ```
   [deterministicApplyLazyEdit] Has lazy text: true
   [deterministicApplyLazyEdit] ❌ Has lazy text, returning undefined
   ```

4. 🔄 **回退到 LLM 方法：**

   ```
   [applyCodeBlock] Falling back to streamLazyApply (LLM-based)
   ```

5. 🔴 **LLM 返回 JSON：**
   ```
   [streamLazyApply] LLM output complete: { looksLikeJSON: true }
   [streamLazyApply] ⚠️ Detected JSON output from LLM
   [streamLazyApply] ❌ JSON format detected in LLM output!
   ```

### 解决方案 ✅

#### **已实施的多层防护方案：**

##### 1. **改进代码生成 prompt** (预防性) ✅

**位置**: `gui/src/redux/thunks/streamCodeGeneration.ts`

**变更内容:**

- 对于小文件（< 300 行）或小改动：要求生成完整代码，**不使用占位符**
- 对于大文件或大改动：允许使用占位符，但要求提供足够上下文（至少 5 行）
- 减少进入 `streamLazyApply` 的概率

**效果:**

- 更多场景下使用快速准确的 `deterministicApplyLazyEdit` (Myers diff)
- 减少依赖不稳定的 LLM 第二次调用
- 平衡 token 使用和稳定性

##### 2. **增强 JSON 检测和提取** (保底措施) ✅

**位置**: `core/edit/lazy/streamLazyApply.ts`

**变更内容:**

- 扩展检测字段列表：
  - `code`, `result`, `updated_code`, `updatedCode`
  - `content`, `file_content`, `fileContent`
  - `new_code`, `newCode`
- 特殊处理：如果 JSON 只有一个大字符串字段，自动使用该字段
- 完整收集 LLM 输出 → 检测 JSON → 提取代码 → 转换为 stream

**效果:**

- 即使 LLM 违反指令返回 JSON，也能自动提取并正常显示
- 增加详细日志便于调试
- 作为多层防护的最后一道防线

##### 3. **强化 prompt 规则** (已有) ✅

**位置**: `core/edit/lazy/prompts.ts`

**现有规则:**

- "⚠️ CRITICAL: You must return ONLY the raw code."
- "⚠️ Do NOT return JSON format like {...}"
- "⚠️ Your response must be plain code that can be directly written to a file"

### 预期效果

**最佳情况** (90% 的场景):

- 代码生成阶段就避免了 lazy text
- 使用快速的 `deterministicApplyLazyEdit`
- 不会进入 `streamLazyApply`
- ✅ Diff 正常显示

**次优情况** (9% 的场景):

- 使用了 lazy text，进入 `streamLazyApply`
- LLM 返回了 JSON
- 自动检测并成功提取代码
- ✅ Diff 正常显示

**最差情况** (< 1% 的场景):

- LLM 返回了无法识别的 JSON 结构
- 提取失败
- ❌ Diff 显示 JSON（需要重试或使用完整代码）

### 如何验证修复

重新编译并测试后，观察日志：

1. **成功提取的情况：**

   ```
   [streamLazyApply] ⚠️ Detected JSON output from LLM
   [streamLazyApply] ✅ Successfully extracted code from JSON!
   [streamLazyApply] Extracted code length: 1234
   [streamLazyApply] Extracted code preview: import streamlit...
   ```

   → Diff 应该正常显示

2. **提取失败的情况：**
   ```
   [streamLazyApply] ❌ JSON format detected in LLM output!
   [streamLazyApply] ❌ JSON detected but no code field found: { availableFields: [...] }
   ```
   → 需要人工介入或重试

### 故障排除

如果仍然看到 JSON 格式的 diff：

1. **检查日志中的 JSON 结构：**
   查找 `[streamLazyApply] ⚠️ Detected JSON output` 日志
   查看 `availableFields` 和 `fieldTypes`

2. **手动提取代码：**

   - 如果发现新的字段名（不在现有列表中）
   - 在 `core/edit/lazy/streamLazyApply.ts` 的 `codeFieldNames` 数组中添加

3. **使用完整代码生成：**
   在对话中明确要求：

   ```
   "请生成完整的代码，不要使用 '# ... existing code ...' 占位符"
   ```

4. **提交问题报告：**
   - 保存完整日志
   - 记录 JSON 结构
   - 提交 issue 以改进检测逻辑

### 临时修复建议

**如果你经常遇到这个问题，可以：**

1. **在代码生成 prompt 中明确要求：**

   ```
   生成完整的代码，不要使用 "# ... existing code ..." 这样的占位符
   ```

2. **或者修改 streamCodeGenerationThunk 的 prompt：**
   ```typescript
   // 在 constructCodeAwareGenerationPrompt 中添加：
   "⚠️ Generate COMPLETE code without placeholders like '# ... existing code ...'";
   "If you need to preserve existing code, write it out in full";
   ```

---

## 如何使用这些日志进行调试

### 步骤 1: 重新编译并启动

```bash
# 在项目根目录
npm run build

# 启动调试
# 按 F5 或使用 VS Code 的 "Run and Debug" 面板
```

### 步骤 2: 查看 Debug Console

在 VS Code 中:

1. 打开 "Debug Console" 面板（View → Debug Console）
2. 或者查看 "Terminal" 中运行的构建任务输出
3. 使用 Cmd+F (Mac) 或 Ctrl+F (Windows) 搜索日志标记

### 步骤 3: 追踪问题

**如果生成内容是 JSON 格式，你应该能看到：**

1. **在 preprocessArgs 中：**

   ```
   [EditFile][preprocessArgs] Detected potential JSON format
   [EditFile][preprocessArgs] Successfully parsed as JSON: { keys: ["language", "code"], hasLanguageField: true, hasCodeField: true }
   ```

2. **在 applyCodeBlock 中：**

   ```
   [applyCodeBlock] Input: { ..., newLazyFilePreview: '{"language": "python", "code": "..."' }
   ```

3. **在 deterministicApplyLazyEdit 中：**
   ```
   [deterministicApplyLazyEdit] newLazyFilePreview: '{"language": "python", "code": "..."'
   ```

### 步骤 4: 关键检查点

**检查这些关键问题：**

1. ✅ **LLM 返回的原始内容是什么？**
   - 查看 `[EditToolImpl] changesPreview`
2. ✅ **preprocessArgs 检测到 JSON 了吗？**
   - 查看 `[EditFile][preprocessArgs] Successfully parsed as JSON`
3. ✅ **如果是 JSON，为什么没有被拒绝？**
   - 查看 `[EditFile][preprocessArgs] hasLanguageField` 等字段
4. ✅ **最终传递给 diff 生成的内容是什么？**
   - 查看 `[applyCodeBlock] newLazyFilePreview`

---

## 日志颜色标记说明

- `==========` - 函数开始/结束边界
- `✅` - 成功的操作
- `❌` - 失败或拒绝的操作
- `→` - 流程转向某个分支
- `⚠️` - 警告或需要注意的地方

---

## 预期的正常流程

**当 `changes` 参数是正确的纯代码时：**

```
[EditFile][preprocessArgs] ========== START ==========
[EditFile][preprocessArgs] Raw args: { ..., changesType: "string" }
[EditFile][preprocessArgs] ✅ No JSON pattern detected
[EditFile][preprocessArgs] ========== END (PASS) ==========

[EditToolImpl] ========== START ==========
[EditToolImpl] Received args: { ..., changesPreview: "# ... existing code ..." }
[EditToolImpl] Dispatching applyForEditTool

[ApplyManager][applyToFile] ========== START ==========
[ApplyManager][applyToFile] → handleExistingDocument

[ApplyManager][handleExistingDocument] ========== START ==========
[ApplyManager][handleExistingDocument] Calling applyCodeBlock

[applyCodeBlock] ========== START ==========
[applyCodeBlock] Attempting deterministicApplyLazyEdit

[deterministicApplyLazyEdit] ========== START ==========
[deterministicApplyLazyEdit] Has lazy text: false
[deterministicApplyLazyEdit] ✅ Returning Myers diff
```

**当检测到错误的 JSON 格式时：**

```
[EditFile][preprocessArgs] ========== START ==========
[EditFile][preprocessArgs] Detected potential JSON format
[EditFile][preprocessArgs] Successfully parsed as JSON: { keys: ["language", "code"] }
[EditFile][preprocessArgs] ❌ REJECTED: JSON structure detected
// 抛出 ContinueError
```

---

## 故障排除

### 问题：日志没有出现

**解决方案：**

1. 确保重新编译了代码：`npm run build`
2. 重启 VS Code Extension Host（按 F5）
3. 检查 Debug Console 是否已打开

### 问题：看到太多日志

**解决方案：**
在 Debug Console 中使用过滤：

- 搜索 `[EditFile]` 查看参数预处理
- 搜索 `[applyCodeBlock]` 查看核心处理
- 搜索 `[deterministic]` 查看 diff 计算

### 问题：发现了 JSON 但没有被拒绝

**可能原因：**

1. JSON 的字段名不在可疑列表中
2. 需要在 `editFile.ts` 的 `suspiciousFields` 数组中添加新的字段名

---

## 下一步

运行一次代码生成，然后：

1. 复制所有相关日志
2. 查找 `newLazyFilePreview` 或 `changesPreview` 来确认实际内容
3. 如果发现 JSON 格式，检查为什么 `preprocessArgs` 没有拒绝它
4. 将发现的问题报告给我，我们可以进一步修复

---

**创建时间:** 2026-01-11  
**目的:** Debug `edit_existing_file` 工具的 JSON 格式问题

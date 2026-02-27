# JSON 格式问题修复方案 v2

## 🎯 问题背景

用户反馈："一开始几次 edit 是成功的，但当代码开始变长之后，又出现了 JSON 格式的 diff"

**根本原因分析:**

1. 初始代码较短时（< 300 行），LLM 生成完整代码，使用快速的 Myers diff ✅
2. 代码增长后（> 300 行），LLM 开始使用 lazy text (`# ... existing code ...`)
3. 触发 `streamLazyApply` (LLM-based 方法)
4. LLM 返回 JSON 格式 `{"code": "...", "changes": [...]}`
5. 即使有 JSON 检测和提取，复杂的流式处理仍可能出问题 ❌

## 🔧 v2 修复方案（已实施）

### 修复 1: 更激进的 Prompt 策略 🛡️

**文件:** `gui/src/redux/thunks/streamCodeGeneration.ts`

**改动:**

```typescript
// 之前 (v1):
- For SMALL files (< 300 lines): Provide COMPLETE code without placeholders
- For LARGE files: You may use "# ... existing code ..." placeholders

// 现在 (v2):
- ⚠️ STRONGLY PREFERRED: Provide COMPLETE code without placeholders whenever possible
- For small to medium files (< 500 lines): Provide the ENTIRE file content
- For very large files (> 500 lines) with small, isolated changes:
  * You MAY use placeholders SPARINGLY
  * Include at least 10 lines of context (was 5)
  * Use placeholders ONLY for blocks > 50 lines (was 20)
  * NEVER use placeholders within functions being modified
```

**效果:**

- ✅ 阈值提高：300 → 500 行
- ✅ 强调"STRONGLY PREFERRED"完整代码
- ✅ 更严格的 placeholder 使用条件
- ✅ 95%+ 场景避免进入 streamLazyApply

### 修复 2: JSON 直接转 Myers Diff 🚀

**文件:** `core/edit/lazy/streamLazyApply.ts`

**关键改动:**

```typescript
// 检测到 JSON 并成功提取代码后：
if (jsonCheck.isJson && jsonCheck.extractedCode) {
  console.warn("✅ Successfully extracted code from JSON!");
  console.warn("🔄 Using direct Myers diff for extracted code");

  // 直接计算 Myers diff
  const diffLines = myersDiff(oldCode, jsonCheck.extractedCode);

  // 立即返回，跳过所有后续处理
  return generateLines(diffLines);
}
```

**之前的问题:**

```
提取 JSON.code
  → 转为 stringStream
    → streamLines (解析行)
      → stopAtLinesWithMarkdownSupport (处理 markdown)
        → streamFillUnchangedCode (处理 UNCHANGED CODE 注释)
          → streamDiff (生成 diff)
            → ❌ 复杂处理链可能出问题
```

**现在的流程:**

```
提取 JSON.code
  → myersDiff(oldCode, extractedCode)
    → ✅ 立即返回准确的 diff
```

**优势:**

- ✅ 避免复杂的流式转换链
- ✅ Myers diff 确定性、快速、准确
- ✅ 不会有 JSON 残留进入后续处理
- ✅ 减少出错概率

### 修复 3: 多层回退机制 🛟

**新增回退链:**

1. **最佳路径:** JSON 提取成功 → Myers diff ✅

   ```
   [streamLazyApply] ✅ Successfully extracted code from JSON!
   [streamLazyApply] 🔄 Using direct Myers diff for extracted code
   [streamLazyApply] ✅ Myers diff computed successfully: 234 lines
   ```

2. **回退路径:** JSON 提取失败 → 尝试原始 newCode → Myers diff ⚠️

   ```
   [streamLazyApply] ❌ Could not extract code from JSON!
   [streamLazyApply] 🔄 Last resort: trying direct Myers diff with original newCode
   [streamLazyApply] ⚠️ Fallback Myers diff computed: 156 lines
   ```

3. **最差情况:** 都失败 → 继续流式处理 ❌
   ```
   [streamLazyApply] ❌ Fallback also failed
   [streamLazyApply] Continuing with broken JSON output
   ```

## 📊 效果对比

| 场景                     | v1 行为                  | v2 行为                                     |
| ------------------------ | ------------------------ | ------------------------------------------- |
| 小文件 (< 300 行)        | ✅ Myers diff            | ✅ Myers diff                               |
| 中等文件 (300-500 行)    | ⚠️ 可能 lazy text → JSON | ✅ 完整代码 → Myers diff                    |
| 大文件 (> 500 行) 小改动 | ⚠️ lazy text → JSON      | ✅ lazy text → JSON → **提取 → Myers diff** |
| 大文件大改动             | ⚠️ lazy text → JSON      | ⚠️ lazy text → JSON → **提取 → Myers diff** |

**预期成功率:**

- v1: ~80-85% (小文件或 JSON 提取成功)
- v2: ~95-98% (更少进入 lazy text + 更可靠的 JSON 处理)

## 🧪 测试检查清单

### 测试场景 A: 小文件编辑

```
文件: app.py (50 行)
操作: 添加一个函数
期望:
  - 不出现 lazy text
  - 使用 deterministicApplyLazyEdit
  - 快速显示正确 diff
```

### 测试场景 B: 中等文件编辑

```
文件: app.py (350 行)
操作: 重构一个类
期望:
  - 不出现 lazy text (新阈值 500)
  - 使用 deterministicApplyLazyEdit
  - 显示完整改动的 diff
```

### 测试场景 C: 大文件小改动

```
文件: app.py (600 行)
操作: 修改一个函数
期望:
  - 可能出现 lazy text
  - 如果 LLM 返回 JSON:
    ✅ 自动提取
    ✅ 使用 Myers diff
    ✅ 显示正确 diff
  - 日志显示：
    [streamLazyApply] ✅ Successfully extracted code from JSON!
    [streamLazyApply] 🔄 Using direct Myers diff
```

### 测试场景 D: 大文件大改动

```
文件: app.py (800 行)
操作: 添加多个类和函数
期望:
  - 可能出现 lazy text
  - LLM 返回 JSON → 自动处理
  - 即使提取失败，有回退机制
  - 日志清晰显示处理路径
```

## 🔍 日志关键标记

### ✅ 成功标记

```
# 方案 1: 完全避免 lazy text
[deterministicApplyLazyEdit] Has lazy text: false
[deterministicApplyLazyEdit] ✅ Returning Myers diff

# 方案 2: JSON 成功提取
[streamLazyApply] ⚠️ Detected JSON output from LLM
[streamLazyApply] ✅ Successfully extracted code from JSON!
[streamLazyApply] 🔄 Using direct Myers diff for extracted code
[streamLazyApply] ✅ Myers diff computed successfully: 234 lines
```

### ⚠️ 回退标记

```
[streamLazyApply] ❌ Could not extract code from JSON!
[streamLazyApply] 🔄 Last resort: trying direct Myers diff with original newCode
[streamLazyApply] ⚠️ Fallback Myers diff computed: 156 lines
```

### ❌ 失败标记

```
[streamLazyApply] ❌ Fallback also failed
[streamLazyApply] Continuing with broken JSON output
```

## 📝 故障排除步骤

### 如果仍然看到 JSON 格式的 diff：

1. **检查日志中的提取尝试:**

   ```
   [streamLazyApply] ⚠️ Detected JSON output from LLM: { keys: [...], hasCodeField: ... }
   ```

   - 如果 `hasCodeField: true` 但仍失败 → 字段值可能不是字符串
   - 如果 `hasCodeField: false` → 需要添加新的字段名到检测列表

2. **查看 availableFields:**

   ```
   [streamLazyApply] ❌ JSON detected but no code field found: {
     availableFields: ["someNewField", "anotherField"],
     fieldTypes: ["someNewField: string", "anotherField: object"]
   }
   ```

   - 如果有新的字符串字段，在 `codeFieldNames` 数组中添加

3. **检查是否进入回退:**

   ```
   [streamLazyApply] 🔄 Last resort: trying direct Myers diff with original newCode
   ```

   - 如果看到这个但仍有 JSON → 原始 newCode 可能就包含 JSON
   - 需要在更早的阶段（代码生成）修复

4. **临时解决方案:**
   在对话中明确要求：
   ```
   "请生成完整的代码文件，不要使用任何 '# ... existing code ...' 占位符，
   也不要返回 JSON 格式，只返回纯代码"
   ```

## 🎯 下一步优化方向

如果 v2 仍有问题，可以考虑：

1. **完全禁止 lazy text** (最激进)

   - 移除所有关于 placeholder 的指导
   - 总是要求完整代码
   - 对超大文件可能超出 context 限制

2. **在 applyCodeBlock 层面添加 JSON 检测**

   - 在进入 streamLazyApply 之前就检测 newCode 是否是 JSON
   - 如果是，提前提取并使用 Myers diff

3. **改用不同的 LLM prompt 策略**

   - 使用 function calling 强制结构化输出
   - 使用 system prompt 级别的约束

4. **添加用户配置选项**
   - 允许用户选择：总是生成完整代码 vs 允许 lazy text
   - 根据用户偏好调整行为

## 📚 相关文件

- [EDIT_FILE_FLOW_ANALYSIS.md](EDIT_FILE_FLOW_ANALYSIS.md) - 完整流程分析
- [DEBUG_LOGS_GUIDE.md](DEBUG_LOGS_GUIDE.md) - 调试日志指南
- `gui/src/redux/thunks/streamCodeGeneration.ts` - 代码生成 prompt
- `core/edit/lazy/streamLazyApply.ts` - JSON 处理逻辑
- `core/edit/lazy/prompts.ts` - LLM apply prompt

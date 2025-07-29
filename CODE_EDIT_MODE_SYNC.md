# Code Edit Mode 代码变化同步功能

## 功能概述

实现了在 Code Edit Mode 和 CodeAware Mode 之间切换时的代码变化检测和同步功能。

## 主要特性

### 1. 代码快照保存
- 进入 Code Edit Mode 时自动保存当前代码状态
- 保存文件路径、完整内容和时间戳
- 支持从 IDE 切换和本地 Toggle 按钮切换

### 2. 代码变化检测
- 离开 Code Edit Mode 时自动检测代码变化
- 使用 `diff` 库进行精确的行级差异比较
- 过滤掉仅有空白字符的变化，只关注真实的代码编辑

### 3. Step 状态更新
- 检测哪些 Code Chunk 受到了代码变化的影响
- 将受影响的 Step 自动标记为 `code_dirty` 状态
- 只有状态为 `generated` 的 Step 会被标记为 `code_dirty`

### 4. Code Chunk 位置重新计算
- 对于未受影响的 Code Chunk，重新计算其在文件中的行号位置
- 考虑添加/删除行对其他代码块位置的影响
- 保持 Code Chunk 映射关系的准确性

## 技术实现

### Redux State 扩展
```typescript
// 新增字段
codeEditModeSnapshot: {
    filePath: string;
    content: string;
    timestamp: number;
} | null;
```

### 新增 Actions
- `saveCodeEditModeSnapshot` - 保存代码快照
- `clearCodeEditModeSnapshot` - 清除代码快照
- `markStepsCodeDirty` - 标记 Step 为 code_dirty
- `updateCodeChunkPositions` - 更新 Code Chunk 位置

### 新增 Thunk
- `processCodeChanges` - 处理代码变化的主要逻辑
  - 计算代码差异
  - 识别真实编辑（排除空白字符变化）
  - 确定受影响的 Code Chunk 和 Step
  - 重新计算未受影响的 Code Chunk 位置

### UI 集成
- 在 `CodeAware.tsx` 中监听 Code Edit Mode 状态变化
- 支持从 IDE 和本地 Toggle 按钮的双向切换
- 自动触发快照保存和变化处理

## 使用流程

1. **进入 Code Edit Mode**
   - 用户点击 Toggle 按钮或通过 IDE 切换
   - 系统自动获取当前文件内容并保存快照
   - UI 禁用 CodeAware 相关操作

2. **在 IDE 中编辑代码**
   - 用户在 IDE 编辑器中自由编辑代码
   - 系统不干预编辑过程

3. **退出 Code Edit Mode**
   - 用户再次点击 Toggle 按钮或通过 IDE 切换
   - 系统自动获取当前文件内容
   - 与快照进行比较，计算真实变化
   - 更新相关 Step 状态和 Code Chunk 位置
   - 清除快照数据

## 错误处理

- 如果无法获取当前文件内容，会记录警告但不影响模式切换
- 如果代码变化处理失败，会记录错误并清除快照
- 确保系统始终处于一致状态

## 日志输出

系统提供详细的控制台日志：
- 📸 代码快照保存
- 📊 代码变化统计
- 🔍 真实编辑识别
- 📍 Code Chunk 分析
- 🎯 受影响的 Step
- ✅ 处理完成状态

## 依赖

- `diff` 库用于代码差异计算
- `@types/diff` 提供类型定义
- Redux Toolkit 用于状态管理
- IDE Messenger 用于与编辑器通信

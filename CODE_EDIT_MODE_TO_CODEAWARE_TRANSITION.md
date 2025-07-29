# Code Edit Mode to CodeAware Transition Implementation

## 概述

实现了从代码编辑模式切换回CodeAware模式时的完整逻辑处理，包括代码变更检测、步骤状态更新、知识卡片处理和UI反馈。

## 实现功能

### 1. 代码变更检测与处理 (`processCodeChanges`)

- **功能**: 检测代码编辑模式退出时的代码变更
- **检测逻辑**: 
  - 使用 `diffLines` 对比快照代码和当前代码
  - 识别实质性变更（排除纯空白字符变更）
  - 计算受影响的代码块和步骤
- **状态更新**: 
  - 标记受影响的步骤为 `code_dirty` 状态
  - 更新未受影响代码块的位置信息
  - 自动触发后续的代码更新处理

### 2. 代码更新处理 (`processCodeUpdates`)

- **功能**: 处理标记为 `code_dirty` 的步骤
- **处理流程**:
  1. 禁用相关代码块并删除映射关系
  2. 调用LLM分析代码变更影响
  3. 根据LLM响应更新步骤和知识卡片
  4. 创建新的代码块和映射关系
  5. 将步骤状态更新为 `generated`

### 3. LLM提示词构建 (`constructProcessCodeChangesPrompt`)

- **输入参数**:
  - `current_code`: 更新后的完整代码
  - `code_diff`: 格式化的代码差异字符串
  - `relevant_steps`: 受影响的步骤信息列表

- **输出格式**:
```json
{
  "updated_steps": [{
    "id": "step_id",
    "needs_update": true/false,
    "title": "更新后的标题",
    "abstract": "更新后的摘要",
    "corresponding_code": "对应的代码片段"
  }],
  "knowledge_cards": [{
    "id": "card_id", 
    "needs_update": true/false,
    "title": "更新后的标题",
    "corresponding_code": "对应的代码片段"
  }]
}
```

### 4. UI加载状态处理

- **加载指示器**: 当任何步骤处于 `code_dirty` 状态时显示Loading Overlay
- **状态检测**: 
  ```typescript
  const hasCodeDirtySteps = steps.some(step => step.stepStatus === "code_dirty");
  ```
- **UI更新**: 两个LoadingOverlay都更新为包含 `hasCodeDirtySteps` 条件

### 5. 步骤和知识卡片更新逻辑

#### 步骤更新:
- 如果 `needs_update: true`:
  - 更新步骤标题和摘要
  - 创建新的代码块和映射关系
- 状态变更: `code_dirty` → `generated`

#### 知识卡片更新:
- 如果 `needs_update: true`:
  - 更新知识卡片标题
  - 清空现有内容和测试题
  - 标记为需要重新生成内容状态
- 创建新的代码块和映射关系

### 6. 代码块管理

- **禁用处理**: 受影响的旧代码块被标记为 `disabled: true`
- **映射清理**: 删除相关步骤的所有映射关系
- **新建创建**: 为更新后的步骤和知识卡片创建新的代码块
- **位置计算**: 使用 `calculateCodeChunkRange` 计算新代码块的行号范围

## 使用示例

### 输入示例:
```json
{
   "current_code": "df = pd.read_csv(csv_filename)\n\nprint(\"数据集概览:\")\nprint(\"\n标签分布:\")\n print(df['label'].value_counts())\nprint(df.head())\n\n# 删除包含任何缺失值的行\ndf.dropna(inplace=True)",
   "code_diff": "+ print(\"\n标签分布:\") + print(df['label'].value_counts())",
   "relevant_steps": [{
       "id": "s-2",
       "title": "查看数据的样式",
       "abstract": "读入数据后，可以去查看一下数据的格式并保证读取正确性。使用筛选表格前几行的方法（head函数）采样表格数据，并打印出来",
       "knowledge_cards": [{
           "id": "s-2-kc-1",
           "title": "查看数据表格的目的"
       }]
   }]
}
```

### 输出示例:
```json
{
    "updated_steps": [{
         "id": "s-2",
        "needs_update": true,
         "title": "查看数据的样式和标签分布",
         "abstract": "读入数据后，可以去查看一下数据的格式和标签的分布来判断数据的质量。使用筛选表格前几行的方法（head函数）采样表格数据，并打印出来。然后用value_counts来打印表格中label列的取值统计",
         "corresponding_code": "df = pd.read_csv(csv_filename)\n\nprint(\"数据集概览:\")\nprint(\"\n标签分布:\")\n print(df['label'].value_counts())\nprint(df.head())\n\n# 删除包含任何缺失值的行\ndf.dropna(inplace=True)"
     }],
         "knowledge_cards": [{
             "id": "s-2-kc-1",
             "needs_update": true,
             "title": "查看数据取值范围的目的",
             "corresponding_code": "print(df['label'].value_counts())"  
         }]
}
```

## 技术细节

## 技术细节

### 错误处理和重试机制
- **LLM调用重试**: 所有关键LLM调用都实现了最多3次重试，使用指数退避策略（2s, 4s, 8s）
- **状态恢复**: 任何阶段失败时自动恢复步骤状态，防止永久卡顿
  - `processCodeUpdates`失败时：将`code_dirty`状态恢复为`generated`
  - `generateCodeFromSteps`失败时：将`generating`状态恢复为`confirmed`
  - `generateStepsFromRequirement`失败时：将状态恢复为`editing`
- **部分失败处理**: 单个步骤或知识卡片处理失败不影响其他项目的处理
- **JSON解析错误处理**: LLM响应解析失败时的完整状态恢复

### 性能优化
- 动态导入diff库避免bundle体积增大
- 批量处理多个受影响的步骤
- 有效的状态更新减少不必要的re-render

### 状态一致性
- 确保代码块、映射关系和步骤状态的一致性
- 原子性操作避免中间状态不一致
- 错误情况下的状态回滚机制

## 文件修改清单

1. **core/llm/codeAwarePrompts.ts**: 添加 `constructProcessCodeChangesPrompt` 函数
2. **gui/src/redux/thunks/codeAwareGeneration.ts**: 
   - 添加 `processCodeUpdates` thunk
   - 修改 `processCodeChanges` thunk
   - 导入新的prompt构建函数
3. **gui/src/pages/codeaware/CodeAware.tsx**: 
   - 添加 `hasCodeDirtySteps` 状态检测
   - 更新Loading Overlay条件

## 测试验证

- [x] TypeScript编译无错误
- [x] 所有模块编译成功
- [ ] 集成测试验证代码变更检测
- [ ] 端到端测试验证完整流程

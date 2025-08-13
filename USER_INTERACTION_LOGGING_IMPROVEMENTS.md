# CodeAware 用户交互日志系统改进

## 概述

基于用户需求，我们对CodeAware中的用户交互日志系统进行了全面改进，将原本记录抽象ID信息的做法改为记录具体的内容信息，以提供更有价值的用户行为分析数据。

## 改进内容

### ✅ 已完成的改进

#### 1. 步骤生成相关日志

**改进前:**
- 只记录 `stepId`, `stepsCount` 等抽象信息

**改进后:**
- `user_get_steps_generation_result`: 记录具体的步骤详情
  - `stepsDetails`: 包含每个步骤的标题和摘要（截取前200字符）
  - `highLevelStepsDetails`: 包含高级步骤的序号和内容

#### 2. 知识卡片主题生成日志

**改进前:**
- 记录 `stepId`, `stepTitle`, `stepAbstract`

**改进后:**
- `user_order_knowledge_card_themes_generation`: 记录步骤标题和摘要内容
- `user_get_knowledge_card_themes_generation_result`: 记录生成的主题详情
  - `themesDetails`: 包含每个主题的标题

#### 3. 知识卡片内容生成日志

**改进前:**
- 记录 `stepId`, `knowledgeCardId`, `knowledgeCardTheme`

**改进后:**
- `user_order_knowledge_card_detail_generation`: 记录知识卡片主题和学习目标
- `user_get_knowledge_card_detail_generation_result`: 记录生成内容的详情
  - `contentSummary`: 内容摘要（前200字符）

#### 4. 知识卡片测试生成日志

**改进前:**
- 记录 `stepId`, `knowledgeCardId`, `knowledgeCardTitle`

**改进后:**
- `user_order_knowledge_card_tests_generation`: 记录知识卡片标题和主题
- `user_get_knowledge_card_tests_generation_result`: 记录测试题详情
  - `testsDetails`: 包含每个测试题的类型、题干、标准答案和选项

#### 5. 基于查询的主题生成日志

**改进前:**
- 记录 `stepId`, `query`, `selectedCode`

**改进后:**
- `user_order_knowledge_card_themes_from_query_generation`: 记录查询内容和代码片段（截取前200字符）
  - `existingThemesDetails`: 现有主题详情
- `user_get_knowledge_card_themes_from_query_generation_result`: 记录生成的主题详情

#### 6. 代码生成日志

**改进前:**
- 记录 `filepath`, `stepsCount`, `previouslyGeneratedStepsCount`

**改进后:**
- `user_order_code_generation`: 记录步骤详情
  - `stepsDetails`: 包含每个步骤的标题和摘要
- `user_get_code_generation_result`: 记录步骤与代码的对应关系
  - `stepsCodeDetails`: 包含步骤标题、代码长度和代码预览

#### 7. 步骤重新运行日志

**改进前:**
- 记录 `stepId`, `changedStepAbstract`

**改进后:**
- `user_order_step_rerun`: 记录变更的步骤摘要（截取前200字符）
- `user_get_step_rerun_result`: 记录更新后的摘要内容

#### 8. 用户编辑行为日志

**改进前:**
- 记录 `stepId`, `originalContent`, `newContent`

**改进后:**
- `user_start_edit_step_requirement`: 记录步骤标题和原始内容（截取前200字符）
- `user_submit_step_requirement`: 记录原始内容和新内容（截取前200字符）

#### 9. SAQ答案编辑日志

**改进前:**
- 记录问题和答案的完整内容

**改进后:**
- `user_start_edit_saq_answer`: 记录问题内容（截取前200字符）
- `user_submit_saq_answer`: 记录问题（截取前200字符）和答案（截取前500字符）

#### 10. 问题提交日志

**改进前:**
- 记录完整的选中文本和问题

**改进后:**
- `user_start_edit_reference_question`: 记录选中文本（截取前200字符）
- `user_submit_reference_question`: 记录选中文本（截取前200字符）和问题（截取前300字符）

#### 11. 查看与高亮交互日志

**改进前:**
- 记录 `stepId`, `cardId`, `codeChunkId`

**改进后:**
- `user_view_and_highlight_step`: 记录步骤标题、内容摘要、高级步骤序号、状态和知识卡片数量
- `user_finished_viewing_step`: 记录步骤标题和内容摘要
- `user_view_and_highlight_knowledge_card`: 记录卡片标题、内容摘要和测试项数量
- `user_finished_viewing_knowledge_card`: 记录卡片标题和内容摘要
- `user_view_and_highlight_code_chunk`: 记录文件路径、代码范围、代码内容摘要和选中内容
- `user_finished_viewing_code_chunk`: 记录文件路径、代码范围和代码内容摘要

#### 12. 知识卡片禁用日志

**改进前:**
- 记录 `cardId`, `stepId`

**改进后:**
- `user_disable_knowledge_card`: 记录卡片标题

#### 13. 需求编辑日志

**改进前:**
- 记录完整的需求内容

**改进后:**
- `user_start_edit_requirement`: 记录当前需求（截取前300字符）
- `user_confirm_requirement`: 记录需求内容和原始需求（截取前300字符）

## 设计原则

### 1. 内容优先
- 记录具体的文本内容而非抽象的ID
- 提供足够的上下文信息用于行为分析

### 2. 长度控制
- 对长文本进行合理截取，避免日志过大
- 保留关键信息的同时控制存储成本

### 3. 可读性增强
- 日志内容直观易懂，便于后续分析
- 包含时间戳和必要的元数据

### 4. 隐私保护
- 截取适当长度，避免记录过多敏感信息
- 保持分析价值与隐私保护的平衡

## 分析价值提升

通过这些改进，日志系统现在能够支持：

1. **内容质量分析**: 分析用户输入的需求、问题和答案的质量
2. **学习路径追踪**: 基于具体内容了解用户的学习轨迹
3. **交互模式识别**: 通过内容分析识别用户的交互模式
4. **功能使用效果评估**: 基于生成内容评估AI功能的实际效果
5. **用户体验优化**: 通过内容分析识别用户痛点和改进机会

## 兼容性

- 所有改进都保持了原有的事件类型命名
- 日志结构向后兼容，新增字段不会影响现有分析工具
- 时间戳格式保持一致

## 总结

这次改进将日志系统从"记录用户做了什么"提升到"记录用户具体做了什么内容"，为深入的用户行为分析和产品改进提供了更有价值的数据基础。

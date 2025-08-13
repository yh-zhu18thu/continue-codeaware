# CodeAware 用户交互日志系统

## 概述

本文档描述了CodeAware中精简化的用户交互日志系统。该系统专注于9个核心用户行为类别，以用户为中心的事件命名，提供高质量的行为分析数据。

## 核心日志类别

### 1. Session创建
- **user_create_new_session**: 用户创建新的CodeAware会话
- **user_request_new_session**: 用户请求新会话（重置当前状态）

### 2. 需求的编辑与确认
- **user_start_editing_requirement**: 用户开始编辑项目需求
- **user_confirm_requirement**: 用户确认需求并触发步骤生成
- **user_modify_requirement**: 用户修改需求并重新生成步骤
- **user_no_change_requirement**: 用户确认需求无变化

### 3. 生成的开始与完成
#### 步骤生成
- **user_order_steps_generation**: 用户触发步骤生成
- **user_get_steps_generation_result**: 用户获得步骤生成结果

#### 知识卡片内容生成
- **user_order_knowledge_card_detail_generation**: 用户触发知识卡片详细内容生成
- **user_get_knowledge_card_detail_generation_result**: 用户获得知识卡片内容生成结果

#### 知识卡片测试生成
- **user_order_knowledge_card_tests_generation**: 用户触发知识卡片测试生成
- **user_get_knowledge_card_tests_generation_result**: 用户获得知识卡片测试生成结果

#### 知识卡片主题生成
- **user_order_knowledge_card_themes_generation**: 用户触发知识卡片主题生成
- **user_get_knowledge_card_themes_generation_result**: 用户获得知识卡片主题生成结果

#### 基于查询的主题生成
- **user_order_knowledge_card_themes_from_query_generation**: 用户基于查询触发主题生成
- **user_get_knowledge_card_themes_from_query_generation_result**: 用户获得基于查询的主题生成结果

#### 代码生成
- **user_order_code_generation**: 用户触发代码生成
- **user_get_code_generation_result**: 用户获得代码生成结果

#### 步骤重新运行
- **user_order_step_rerun**: 用户触发步骤重新运行
- **user_get_step_rerun_result**: 用户获得步骤重新运行结果

#### 代码变更处理
- **user_order_code_changes_processing**: 用户触发代码变更处理
- **user_get_code_changes_processing_result**: 用户获得代码变更处理结果

#### SAQ提交处理
- **user_order_saq_submission_processing**: 用户触发SAQ提交处理
- **user_get_saq_submission_processing_result**: 用户获得SAQ提交处理结果

#### 全局问题处理
- **user_order_global_question_processing**: 用户触发全局问题处理
- **user_get_global_question_processing_result**: 用户获得全局问题处理结果

### 4. 用户开始编辑问题到提交
- **user_start_edit_global_question**: 用户开始编辑全局问题
- **user_start_edit_reference_question**: 用户开始编辑引用问题（基于选中文本）
- **user_submit_reference_question**: 用户提交引用问题
- **user_start_edit_code_question**: 用户开始编辑针对代码的问题（基于选中代码）
- **user_submit_code_question**: 用户提交针对代码的问题

### 5. 用户开始编辑答案到提交
- **user_start_edit_saq_answer**: 用户开始编辑SAQ答案
- **user_submit_saq_answer**: 用户提交SAQ答案

### 6. 用户编辑步骤需求

- **user_start_edit_step_requirement**: 用户开始编辑具体步骤需求
- **user_submit_step_requirement**: 用户提交编辑后的步骤需求

### 7. 用户代码编辑模式切换

- **user_enter_code_edit_mode**: 用户进入代码编辑模式
- **user_exit_code_edit_mode**: 用户退出代码编辑模式
- **user_click_regenerate_code_button**: 用户点击重新生成代码按钮

### 8. 用户展开查看与高亮交互

- **user_view_and_highlight_step**: 用户查看并高亮步骤
- **user_finished_viewing_step**: 用户完成查看步骤
- **user_view_and_highlight_knowledge_card**: 用户查看并高亮知识卡片
- **user_finished_viewing_knowledge_card**: 用户完成查看知识卡片
- **user_view_and_highlight_code_chunk**: 用户查看并高亮代码块
- **user_finished_viewing_code_chunk**: 用户完成查看代码块
- **user_view_and_highlight_high_level_step**: 用户查看并高亮高级步骤
- **user_finished_viewing_high_level_step**: 用户完成查看高级步骤

### 9. 用户删除知识卡片

- **user_disable_knowledge_card**: 用户禁用/删除知识卡片

## 日志数据格式

每个日志条目包含：

- **事件类型**: 符合用户中心命名约定的事件名称
- **时间戳**: ISO格式的事件发生时间
- **上下文数据**: 相关的用户状态和操作参数
- **会话信息**: 当前会话标识符

## 实现状态

### ✅ 已完成

- Session创建和管理日志
- 需求编辑与确认流程日志
- 所有AI生成功能的开始/完成日志
- 问题编辑开始日志（全局问题、引用问题）
- SAQ答案编辑开始和提交日志
- 步骤需求编辑开始和提交日志
- 代码编辑模式切换日志
- 查看与高亮交互日志（已统一为 user_view_and_highlight_* 系列事件）
- 知识卡片删除/禁用日志

### 🎯 重要改进

**事件简化与去重**: 已移除与 user_view_and_highlight_* 系列重合的旧事件：

- ❌ `user_check_highlight_mappings` - 已由 `user_view_and_highlight_*` 替代
- ❌ `user_check_knowledge_card_mappings` - 已由 `user_view_and_highlight_knowledge_card` 替代  
- ❌ `user_check_step_mappings` - 已由 `user_view_and_highlight_step` 替代
- ❌ `user_toggle_step_expansion` - 已由 `user_view_and_highlight_step` 和 `user_finished_viewing_step` 替代
- ❌ `system_knowledge_card_content_generated` - 系统事件，不属于用户交互范畴
- ❌ `system_step_generated` - 系统事件，不属于用户交互范畴
- ❌ `user_clear_code_selection` - 冗余的代码选择事件
- ❌ `user_check_clear_selection_mappings` - 冗余的代码映射检查事件
- ❌ `user_change_code_selection` - 冗余的代码选择变化事件
- ❌ `user_check_code_selection_mappings` - 冗余的代码映射检查事件

**内容优先记录**: 所有日志事件已从记录抽象ID信息改为记录具体内容信息：

- **步骤生成**: 记录步骤标题、摘要和高级步骤详情，而非仅仅步骤ID
- **知识卡片生成**: 记录主题标题、内容摘要和测试题详情，而非仅仅卡片ID
- **代码生成**: 记录步骤与代码的具体对应关系和代码预览
- **用户编辑**: 记录编辑的具体内容摘要，便于分析用户行为模式
- **查看交互**: 记录查看的具体内容摘要，了解用户关注点

**长度控制**: 对长文本进行合理截取（通常200-300字符），保持分析价值的同时控制日志大小

## 设计原则

1. **用户中心**: 所有事件命名以用户行为为出发点
2. **配对完整**: 每个"开始"事件都有对应的"完成"或"结果"事件
3. **上下文丰富**: 记录足够的上下文信息用于后续分析
4. **精简聚焦**: 只记录对用户行为分析有价值的核心事件
5. **可扩展性**: 事件结构支持未来功能扩展
6. **首次触发**: `user_start_edit_*` 事件只在用户首次获得焦点时记录，避免重复记录

## 技术实现说明

### 防重复记录机制

为了确保 `user_start_edit_*` 事件只在用户首次开始编辑时记录，各组件采用以下策略：

- **Web组件（React）**: 使用 `onFocus` 事件配合 `hasStartedEditingRef` 标志位
- **VS Code扩展**: 在输入验证器中检测首次输入配合标志位
- **按钮触发的编辑**: 直接在点击事件中记录（如步骤编辑、需求编辑）

这确保了即使用户频繁操作（如快速输入、多次focus等），每个编辑会话也只记录一次开始事件。

## 分析价值

该日志系统支持以下分析：

- 用户学习路径和模式识别
- AI生成功能使用效率分析
- 用户编辑行为和投入度评估
- 交互障碍点识别和优化
- 功能使用频率和成功率统计

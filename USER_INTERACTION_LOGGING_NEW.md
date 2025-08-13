# CodeAware 用户交互日志系统

本文档描述了为 CodeAware 插件的核心用户交互日志记录功能。日志系统专注于记录关键的用户行为和系统响应，帮助分析用户学习模式和系统性能。

## 🎯 主要目标

1. **用户行为追踪**: 记录用户的关键交互和决策点
2. **生成任务监控**: 跟踪AI生成任务的开始和完成
3. **编辑行为分析**: 记录用户编辑内容的时长和模式
4. **高亮交互记录**: 追踪用户查看和高亮代码的行为

## 📊 核心日志事件

### 1. 会话管理

- `user_request_new_session` - 用户请求创建新会话
- `user_create_new_session` - 用户成功创建新会话并输入信息

### 2. 需求编辑与确认

- `user_start_edit_requirement` - 用户开始编辑需求（点击编辑按钮）
- `user_start_editing_requirement` - 用户实际开始输入内容（首次输入）
- `user_confirm_requirement` - 用户确认需求（触发步骤生成）

### 3. AI生成任务 - 开始与完成

- `user_order_steps_generation` - 用户触发步骤生成
- `user_get_steps_generation_result` - 步骤生成完成并返回结果

- `user_order_knowledge_card_detail_generation` - 用户触发知识卡片内容生成
- `user_get_knowledge_card_detail_generation_result` - 知识卡片内容生成完成

- `user_order_knowledge_card_tests_generation` - 用户触发知识卡片测试题生成
- `user_get_knowledge_card_tests_generation_result` - 知识卡片测试题生成完成

- `user_order_knowledge_card_themes_generation` - 用户触发知识卡片主题生成
- `user_get_knowledge_card_themes_generation_result` - 知识卡片主题生成完成

- `user_order_knowledge_card_themes_from_query_generation` - 用户从问题触发主题生成
- `user_get_knowledge_card_themes_from_query_generation_result` - 问题主题生成完成

- `user_order_code_generation` - 用户触发代码生成
- `user_get_code_generation_result` - 代码生成完成

- `user_order_step_rerun` - 用户触发步骤重新运行
- `user_get_step_rerun_result` - 步骤重新运行完成

- `user_order_code_changes_processing` - 用户触发代码变化处理
- `user_get_code_changes_processing_result` - 代码变化处理完成

- `user_order_saq_submission_processing` - 用户提交简答题答案
- `user_get_saq_submission_processing_result` - 简答题评估完成

- `user_order_global_question_processing` - 用户提交全局问题
- `user_get_global_question_processing_result` - 全局问题处理完成

### 4. 问题编辑与提交

- `user_start_edit_global_question` - 用户开始编辑全局问题
- `user_start_editing_global_question` - 用户实际开始输入全局问题内容
- `user_submit_global_question` - 用户提交全局问题

- `user_start_edit_reference_question` - 用户开始编辑引用问题
- `user_start_editing_reference_question` - 用户实际开始输入引用问题内容
- `user_submit_reference_question` - 用户提交引用问题

### 5. 答案编辑与提交

- `user_start_edit_saq_answer` - 用户开始编辑简答题答案
- `user_start_editing_saq_answer` - 用户实际开始输入答案内容
- `user_submit_saq_answer` - 用户提交简答题答案

### 6. 代码编辑模式

- `user_enter_code_edit_mode` - 用户进入代码编辑模式
- `user_exit_code_edit_mode` - 用户退出代码编辑模式

### 7. 查看与高亮交互

- `user_view_and_highlight_code_chunk` - 用户查看代码块并触发高亮
- `user_view_and_highlight_step` - 用户查看步骤并触发高亮
- `user_view_and_highlight_knowledge_card` - 用户查看知识卡片并触发高亮
- `user_view_and_highlight_high_level_step` - 用户查看高级步骤并触发高亮

### 8. 知识卡片管理

- `user_disable_knowledge_card` - 用户禁用知识卡片

## 🔧 实现细节

### 日志格式

每个日志条目包含：

```json
{
  "timestamp": "2025-08-13T10:30:00.000Z",
  "codeAwareSessionId": "session-uuid",
  "eventType": "user_order_steps_generation",
  "payload": {
    "userRequirement": "创建一个计算器应用",
    "timestamp": "2025-08-13T10:30:00.000Z"
  }
}
```

### 核心文件修改

1. **codeAwareGeneration.ts** - 生成任务开始和完成日志
   - 在每个thunk函数开始时记录用户触发事件
   - 在成功完成时记录结果获取事件

2. **CodeAware.tsx** - 主组件交互日志
   - 会话创建日志
   - 高亮触发日志
   - 代码编辑模式切换日志

3. **RequirementEditor.tsx** - 需求编辑日志
   - 编辑开始和实际输入时间记录
   - 确认操作记录

4. **步骤和知识卡片组件** - 查看和交互日志
   - 展开查看时的高亮触发
   - 问题提交流程
   - 答案编辑和提交

## 📈 分析价值

### 用户行为追踪

- **生成任务效率**: 追踪用户从触发到获得结果的时间
- **编辑模式使用**: 了解用户如何使用代码编辑功能
- **内容查看模式**: 分析用户查看步骤和知识卡片的模式

### 学习路径分析

- **高亮交互频率**: 用户查看和高亮代码的活跃程度
- **问题提交模式**: 用户提问的类型和频率
- **知识卡片使用**: 测试参与度和学习效果

## 🎉 总结

精简后的日志系统专注于：

- **核心交互事件**: 只记录对用户学习和系统性能分析最重要的事件
- **以用户为中心**: 所有事件命名都以用户行为为出发点
- **生成任务监控**: 完整追踪AI生成任务的生命周期
- **学习行为分析**: 重点关注用户的学习和编程行为模式

这套精简的日志系统为 CodeAware 的用户体验优化和学习效果评估提供了关键数据基础。

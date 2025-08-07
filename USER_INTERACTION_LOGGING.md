# CodeAware 用户交互日志系统

本文档描述了为 CodeAware 插件添加的全面用户交互日志记录功能。这些日志帮助我们了解用户行为模式、交互时间和使用偏好。

## 🎯 主要目标

1. **用户行为分析**: 了解用户如何与系统交互
2. **性能监控**: 跟踪生成任务的完成时间和用户等待时间
3. **编辑持续时间**: 记录用户编辑需求、步骤等内容的时间
4. **交互路径**: 追踪用户从开始到完成任务的路径

## 📊 日志事件分类

### 1. 会话管理事件
- `user_request_new_session` - 用户请求创建新会话
- `user_create_new_session` - 用户成功创建新会话

### 2. 需求管理事件
- `user_start_edit_requirement` - 用户开始编辑需求
- `user_start_editing_requirement` - 用户实际开始输入内容
- `user_focus_requirement_editor` - 用户聚焦到需求编辑器
- `user_confirm_requirement` - 用户确认需求
- `user_modify_requirement` - 用户修改需求
- `user_no_change_requirement` - 用户未修改需求直接确认
- `user_request_regenerate_steps` - 用户请求重新生成步骤

### 3. 步骤操作事件
- `user_toggle_step_expansion` - 用户切换步骤展开状态
- `user_start_execute_steps` - 用户开始执行步骤
- `user_execute_steps_completed` - 用户完成步骤执行
- `user_start_rerun_step` - 用户开始重新运行步骤
- `user_rerun_step_completed` - 用户完成步骤重新运行

### 4. 知识卡片交互事件
- `user_start_view_knowledge_card` - 用户开始查看知识卡片
- `user_toggle_knowledge_card` - 用户切换知识卡片展开
- `user_disable_knowledge_card` - 用户禁用知识卡片
- `user_navigate_to_previous_test` - 用户导航到上一个测试
- `user_navigate_to_next_test` - 用户导航到下一个测试

### 5. 测试交互事件
- `user_select_mcq_option` - 用户选择选择题选项
- `user_submit_mcq_answer` - 用户提交选择题答案
- `user_submit_saq_answer` - 用户提交简答题答案
- `user_retry_saq_answer` - 用户重试简答题答案

### 6. 问题提交事件
- `user_click_add_question_button` - 用户点击添加问题按钮
- `user_submit_question_from_popup` - 用户从弹窗提交问题
- `user_cancel_question_popup` - 用户取消问题弹窗
- `user_trigger_question_from_code_selection` - 用户从代码选择触发问题

### 7. 代码选择事件
- `user_change_code_selection` - 用户更改代码选择
- `user_clear_code_selection` - 用户清除代码选择
- `user_check_code_selection_mappings` - 检查代码选择映射关系
- `user_check_clear_selection_mappings` - 检查清除选择的映射关系

### 8. 系统生成完成事件
- `system_knowledge_card_themes_generated` - 知识卡片主题生成完成
- `system_knowledge_card_content_generated` - 知识卡片内容生成完成
- `system_step_generated` - 步骤生成完成

## 🔧 实现细节

### 核心文件修改

1. **CodeAware.tsx** - 主组件日志记录
   - 添加了状态变化监听
   - 生成完成事件监听
   - 会话管理日志

2. **RequirementEditor.tsx** - 需求编辑日志
   - 编辑开始时间追踪
   - 用户焦点事件记录
   - 编辑持续时间计算

3. **Step.tsx** - 步骤交互日志
   - 展开/折叠状态变化
   - 问题提交功能
   - 步骤相关用户操作

4. **KnowledgeCard.tsx** - 知识卡片日志
   - 展开状态切换
   - 测试导航
   - 卡片禁用功能

5. **useSetup.ts** - 代码选择日志
   - 代码选择变化事件
   - 映射关系检查
   - 选择清除事件

### 日志格式

每个日志条目包含：
```json
{
  "timestamp": "2025-08-07T10:30:00.000Z",
  "codeAwareSessionId": "session-uuid",
  "eventType": "user_toggle_step_expansion",
  "payload": {
    "stepId": "step-1",
    "wasExpanded": false,
    "willBeExpanded": true,
    "stepTitle": "数据处理步骤",
    "timestamp": "2025-08-07T10:30:00.000Z"
  }
}
```

## 📈 分析价值

### 时间分析
- **编辑持续时间**: 追踪用户编辑需求、步骤的时间
- **等待时间**: 记录用户从操作到系统响应的时间
- **任务完成时间**: 从开始到确认的整个流程时间

### 行为模式
- **交互频率**: 用户使用各种功能的频率
- **路径分析**: 用户完成任务的典型路径
- **错误模式**: 用户容易遇到困难的地方

### 功能使用
- **知识卡片利用率**: 哪些知识卡片被查看最多
- **测试参与度**: 用户是否积极参与自测
- **问题提交频率**: 用户提问的活跃程度

## 🔮 未来扩展

1. **A/B测试支持**: 为不同功能设计提供数据基础
2. **个性化推荐**: 基于用户行为推荐学习内容
3. **智能提示**: 根据使用模式提供操作建议
4. **性能优化**: 识别并优化慢响应的功能

## 🎉 总结

通过全面的用户交互日志记录，CodeAware 现在能够：
- 深入了解用户行为和使用模式
- 识别用户体验的痛点和改进机会
- 为产品决策提供数据支持
- 监控和优化系统性能

这套日志系统为 CodeAware 的持续改进和用户体验优化提供了强有力的数据基础。

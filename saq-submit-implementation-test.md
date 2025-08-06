# SAQ Submit Logic 实现测试

这个文件用于测试SAQ提交逻辑的实现。

## 实现内容

1. **新的Selector**: `selectTestByTestId` 
   - 根据testId获取对应的test信息，包括题干（stem）和标准答案（standard_answer）

2. **新的Action**: `updateSaqTestResult`
   - 更新SAQ测试结果到Redux store，包括用户答案、是否正确和评语

3. **新的Prompt函数**: `constructEvaluateSaqAnswerPrompt`
   - 构建评估SAQ答案的LLM prompt，用于判断用户答案是否正确

4. **新的Thunk**: `processSaqSubmission`
   - 异步处理SAQ提交逻辑，调用LLM评估用户答案并更新store

5. **更新onSaqSubmit实现**
   - 在CodeAware.tsx中调用新的thunk处理SAQ提交

## 测试步骤

1. 用户在知识卡片的SAQ组件中输入答案
2. 点击提交按钮触发onSaqSubmit
3. onSaqSubmit调用processSaqSubmission thunk
4. thunk根据testId获取test信息（题干和标准答案）
5. 调用LLM评估用户答案
6. 将评估结果（是否正确+评语）更新到Redux store
7. UI更新显示评估结果

## 文件变更

- `/core/llm/codeAwarePrompts.ts` - 添加评估prompt函数
- `/gui/src/redux/slices/codeAwareSlice.ts` - 添加selector和action
- `/gui/src/redux/thunks/codeAwareGeneration.ts` - 添加处理thunk
- `/gui/src/pages/codeaware/CodeAware.tsx` - 更新onSaqSubmit实现

## generateCodeFromSteps 步骤状态修复

### 🐛 问题描述
在 `generateCodeFromSteps` 函数中，步骤状态只有在成功应用代码到IDE后才会设置为 `generated`。这导致了以下问题：
- 如果获取当前文件失败，步骤状态不会更新
- 如果应用代码到IDE失败，步骤状态仍然保持在 `generating`
- 用户无法看到步骤已经完成的状态

### ✅ 修复方案
将步骤状态设置从IDE应用成功的条件块中移出，在代码生成成功后立即执行：

```typescript
// 之前：只有在IDE应用成功时才设置
if (currentFileResponse.status === "success" && currentFileResponse.content) {
    // ... 应用代码到IDE
    console.log("✅ 代码已成功应用到IDE文件");
    
    // 标记所有相关步骤为已生成 (只有在这里才执行)
    orderedSteps.forEach(step => {
        dispatch(setStepStatus({ stepId: step.id, status: 'generated' }));
    });
}

// 现在：代码生成成功后立即设置，不依赖IDE应用结果
orderedSteps.forEach(step => {
    dispatch(setStepStatus({ stepId: step.id, status: 'generated' }));
});
console.log("✅ 所有步骤状态已更新为 'generated'");

// 尝试将生成的代码应用到当前文件 (独立的操作)
try {
    // ... IDE应用逻辑
} catch (applyError) {
    // 即使应用失败，步骤状态也已经正确设置
}
```

### 🎯 修复效果
1. **步骤状态准确性**: 代码生成成功后，步骤状态立即反映为 `generated`
2. **IDE独立性**: IDE应用失败不影响步骤状态的正确性
3. **用户体验**: 用户可以看到步骤完成状态，即使代码应用遇到问题
4. **step_dirty 支持**: 为后续的 `step_dirty` 功能提供正确的状态基础

### 🔄 与 step_dirty 功能的关系
这个修复确保了：
- 步骤在代码生成后正确变为 `generated` 状态
- 用户可以在 `generated` 状态下编辑步骤
- 编辑后能正确触发 `step_dirty` 状态转换
- `step_dirty` 状态下的重新生成功能能正常工作

### 📝 测试建议
1. 执行步骤生成代码，验证状态立即变为 `generated`
2. 测试IDE文件获取失败的情况，确认步骤状态仍然正确
3. 测试IDE代码应用失败的情况，确认步骤状态不受影响
4. 验证在 `generated` 状态下可以正常编辑并触发 `step_dirty`

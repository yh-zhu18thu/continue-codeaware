## step_dirty 功能实现总结

### 🎯 主要问题解决

1. **重新运行逻辑位置调整**
   - ❌ 从 `codeAwareSlice.ts` 中移除了 `rerunStepGeneration` reducer
   - ✅ 在 `CodeAware.tsx` 中实现了完整的 `handleRerunStep` 逻辑
   - 这样可以在组件中调用 LLM 生成逻辑

2. **编辑确认后状态修复**
   - ✅ 更新了 `setStepAbstract` 逻辑，智能检测内容变化
   - 只有在内容真正发生变化时才设置为 `step_dirty`
   - 如果编辑后内容与原始内容相同，保持 `generated` 状态

3. **无变更时状态保持**
   - ✅ 增强了状态检测逻辑，支持内容恢复的情况
   - 如果在 `step_dirty` 状态下编辑回原始内容，会自动恢复为 `generated`

### 🔄 完整工作流程

1. **初始状态**: 步骤完成后 → `generated` 状态
2. **编辑触发**: 点击编辑按钮 → `editing` 状态
3. **智能判断**: 确认编辑后
   - 内容有变化 → `step_dirty` 状态
   - 内容无变化 → 保持 `generated` 状态
   - 恢复原始内容 → 从 `step_dirty` 回到 `generated`
4. **重新生成**: 在 `step_dirty` 状态下点击刷新按钮
   - 状态变为 `generating`
   - 调用重新生成逻辑
   - 完成后变为 `generated`

### 📊 状态转换图

```
generated ←→ editing
    ↓         ↓
    ↓    (有变化)
    ↓         ↓
    ↓    step_dirty ←→ editing
    ↓         ↓
    ↓    (点击刷新)
    ↓         ↓
    ←─── generating
```

### 🧠 智能特性

- **内容比较**: 使用 `previousStepAbstract` 保存原始内容
- **状态恢复**: 支持编辑后撤销到原始状态
- **按钮适配**: 根据状态显示不同的操作按钮
- **权限控制**: 只在合适的状态下允许相应操作

### 📝 后续开发

- 在 `handleRerunStep` 中实现具体的 LLM 调用逻辑
- 考虑使用差异信息来优化代码生成
- 添加更详细的错误处理和用户反馈

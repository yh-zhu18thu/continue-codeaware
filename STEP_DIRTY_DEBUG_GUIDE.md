# Step_Dirty 状态调试指南

## 调试信息位置

已在以下关键位置添加了详细的调试信息：

### 1. Redux Slice (codeAwareSlice.ts)

#### setStepAbstract 调试信息
- **调用开始**: `[DEBUG] setStepAbstract called`
- **状态前**: `[DEBUG] Step before modification`
- **分支执行**: `[DEBUG] Branch: [分支名称]`
- **状态后**: `[DEBUG] Step after modification`

#### setStepStatus 调试信息
- **调用开始**: `[DEBUG] setStepStatus called`
- **状态前**: `[DEBUG] Step before status change`
- **编辑模式**: `[DEBUG] Entering editing mode from [状态]`
- **状态后**: `[DEBUG] Step after status change`

### 2. Step 组件 (Step.tsx)

#### handleEditStep 调试信息
- **调用**: `[DEBUG] handleEditStep called for step`
- **状态更改**: `[DEBUG] Calling onStepStatusChange to set editing status`

#### handleConfirmEdit 调试信息
- **调用**: `[DEBUG] handleConfirmEdit called for step`
- **内容更新**: `[DEBUG] Calling onStepEdit with new content`
- **状态更改**: `[DEBUG] Calling onStepStatusChange to set confirmed status`

### 3. CodeAware 组件 (CodeAware.tsx)

#### handleStepEdit 调试信息
- **调用**: `[DEBUG] handleStepEdit called in CodeAware`
- **步骤状态**: `[DEBUG] Step found before setStepAbstract`

#### handleStepStatusChange 调试信息
- **调用**: `[DEBUG] handleStepStatusChange called in CodeAware`
- **步骤状态**: `[DEBUG] Step found before setStepStatus`

## 调试流程

### 正常的step_dirty工作流程应该看到以下日志：

#### 1. 用户点击编辑按钮
```
[DEBUG] handleEditStep called for step: {stepId, currentStatus: "generated", currentContent: "原始内容"}
[DEBUG] Calling onStepStatusChange to set editing status
[DEBUG] handleStepStatusChange called in CodeAware: {stepId, newStatus: "editing"}
[DEBUG] Step found before setStepStatus: {currentStatus: "generated", currentAbstract: "原始内容", previousStepAbstract: undefined}
[DEBUG] setStepStatus called: {stepId, newStatus: "editing", stepFound: true}
[DEBUG] Step before status change: {currentStatus: "generated", currentAbstract: "原始内容", previousStepAbstract: undefined}
[DEBUG] Entering editing mode from generated
[DEBUG] Saving current abstract as previousStepAbstract: "原始内容"
[DEBUG] Step after status change: {newStatus: "editing", currentAbstract: "原始内容", finalPreviousStepAbstract: "原始内容"}
```

#### 2. 用户修改内容并确认
```
[DEBUG] handleConfirmEdit called for step: {stepId, currentStatus: "editing", oldContent: "原始内容", newContent: "修改后内容", contentChanged: true}
[DEBUG] Calling onStepEdit with new content
[DEBUG] handleStepEdit called in CodeAware: {stepId, newContent: "修改后内容"}
[DEBUG] Step found before setStepAbstract: {currentStatus: "editing", currentAbstract: "原始内容", previousStepAbstract: "原始内容", abstractWillChange: true}
[DEBUG] setStepAbstract called: {stepId, newAbstract: "修改后内容", stepFound: true}
[DEBUG] Step before modification: {currentStatus: "editing", currentAbstract: "原始内容", previousStepAbstract: "原始内容", abstractChanged: true}
[DEBUG] Branch: editing state handling
[DEBUG] Has previousStepAbstract: "原始内容"
[DEBUG] Content different from original, setting to step_dirty
[DEBUG] Step after modification: {newStatus: "step_dirty", newAbstract: "修改后内容", finalPreviousStepAbstract: "原始内容"}
[DEBUG] Calling onStepStatusChange to set confirmed status
```

**注意**: 最后的"set confirmed status"调用应该不会改变状态，因为在setStepAbstract中已经设置为step_dirty了。

### 3. 如果最终没有出现step_dirty状态，检查：

1. **previousStepAbstract是否正确保存**
   - 在进入editing状态时应该看到："Saving current abstract as previousStepAbstract"
   
2. **内容比较是否正确**
   - 在setStepAbstract的editing分支中应该看到："Content different from original, setting to step_dirty"
   
3. **状态是否被后续调用覆盖**
   - setStepAbstract执行后，后续的setStepStatus(confirmed)不应该改变step_dirty状态

## 常见问题排查

### 问题1: previousStepAbstract没有保存
- 检查setStepStatus日志中是否有"Entering editing mode from generated"
- 检查是否有"Saving current abstract as previousStepAbstract"

### 问题2: 内容比较错误
- 检查setStepAbstract日志中的"abstractChanged"字段
- 检查"Has previousStepAbstract"和具体的比较结果

### 问题3: 状态被覆盖
- 检查setStepAbstract执行后是否有额外的setStepStatus调用
- 检查最终的状态是否正确

## 清理调试信息

完成调试后，可以通过搜索`[DEBUG]`来找到并删除所有调试信息。

## 浏览器控制台使用

1. 打开浏览器开发者工具 (F12)
2. 切换到Console标签
3. 执行step编辑操作
4. 查看带有`[DEBUG]`前缀的日志输出
5. 按照上述流程对比期望的日志输出

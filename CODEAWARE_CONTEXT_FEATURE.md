# CodeAware 上下文同步功能实现文档

## 概述

本文档描述了CodeAware系统中用户需求和步骤信息同步到IDE并用于代码补全上下文的功能实现。

## 功能特性

### 1. 用户需求同步
- 当用户确认需求后，通过Protocol将需求内容发送到IDE
- 存储在`CodeAwareCompletionManager`中供代码补全使用

### 2. 步骤信息同步
- 自动同步当前步骤和下一步骤的标题到IDE
- 初始生成时发送空的当前步骤和第一个步骤的标题
- 步骤切换时更新并同步新的当前/下一步骤信息

### 3. 代码补全上下文增强
- 将CodeAware上下文信息添加到代码补全的prompt中
- 为LLM提供任务背景和步骤指导

## 实现组件

### 1. Protocol层 (core/protocol/ideWebview.ts)
添加了两个新的消息类型：
```typescript
syncCodeAwareRequirement: [{ userRequirement: string }, void];
syncCodeAwareSteps: [{ currentStep: string; nextStep: string }, void];
```

### 2. IDE处理层 (extensions/vscode/src/extension/VsCodeMessenger.ts)
实现了protocol消息的处理：
- `syncCodeAwareRequirement`: 将用户需求存储到CompletionManager
- `syncCodeAwareSteps`: 将步骤信息存储到CompletionManager

### 3. 完成管理器 (extensions/vscode/src/autocomplete/codeAwareCompletionManager.ts)
单例模式的上下文管理器：
```typescript
interface CodeAwareContext {
  userRequirement: string;
  currentStep: string;
  nextStep: string;
}
```

主要方法：
- `setUserRequirement(requirement: string)`: 设置用户需求
- `setCurrentStep(step: string)`: 设置当前步骤
- `setNextStep(step: string)`: 设置下一步骤
- `getContext()`: 获取完整上下文
- `getContextString()`: 获取格式化的上下文字符串

### 4. 补全提供器增强 (extensions/vscode/src/autocomplete/completionProvider.ts)
修改了AutocompleteInput以包含CodeAware上下文：
```typescript
codeAwareContext?: {
  userRequirement?: string;
  currentStep?: string;
  nextStep?: string;
};
```

### 5. 模板渲染增强 (core/autocomplete/templating/index.ts)
- 添加了`enhancePrefixWithCodeAwareContext`函数来增强prefix
- 修改了`renderStringTemplate`函数以支持上下文变量
- 更新了`renderPrompt`函数以集成CodeAware上下文

### 6. Redux状态管理 (gui/src/redux/slices/codeAwareSlice.ts)
添加了步骤管理功能：
- `currentStepIndex`: 当前步骤索引（-1表示未开始）
- `setCurrentStepIndex`: 设置当前步骤索引
- `goToNextStep`: 前进到下一步
- `goToPreviousStep`: 返回到上一步

### 7. 异步操作 (gui/src/redux/thunks/codeAwareGeneration.ts)
- `generateStepsFromRequirement`: 在生成步骤后自动同步到IDE
- `updateCurrentStep`: 步骤切换时同步到IDE

## 数据流程

### 需求同步流程
```
用户确认需求 
    ↓
generateStepsFromRequirement 执行
    ↓
Redux状态更新
    ↓
syncCodeAwareRequirement protocol消息
    ↓
VsCodeMessenger 处理
    ↓
CodeAwareCompletionManager 存储
```

### 步骤同步流程
```
步骤切换/生成
    ↓
updateCurrentStep thunk执行
    ↓
Redux状态更新 (currentStepIndex)
    ↓
syncCodeAwareSteps protocol消息
    ↓
VsCodeMessenger 处理
    ↓
CodeAwareCompletionManager 存储
```

### 代码补全增强流程
```
用户触发代码补全
    ↓
CompletionProvider 获取CodeAware上下文
    ↓
enhancePrefixWithCodeAwareContext 增强prefix
    ↓
模板渲染包含上下文信息
    ↓
LLM生成基于上下文的补全
```

## 上下文格式

在代码补全中，上下文会以注释形式添加到prefix前：
```typescript
// Task: 实现一个计算器程序
// Current Step: 创建基本的加减乘除函数
// Next Step: 添加用户界面

[原始代码...]
```

## 使用示例

### 1. 手动更新步骤
```typescript
import { updateCurrentStep } from '../redux/thunks/codeAwareGeneration';

// 切换到第1步（索引为0）
dispatch(updateCurrentStep({ stepIndex: 0 }));
```

### 2. 获取当前上下文
```typescript
import { CodeAwareCompletionManager } from './codeAwareCompletionManager';

const manager = CodeAwareCompletionManager.getInstance();
const context = manager.getContext();
console.log('Current context:', context);
```

## 错误处理

- Protocol消息发送失败时记录警告，不影响主流程
- CodeAware上下文获取失败时使用空上下文，补全正常进行
- 单例模式确保上下文管理器的一致性

## 扩展性

### 添加新的上下文信息
1. 在`CodeAwareContext`接口中添加新字段
2. 在`CodeAwareCompletionManager`中添加对应的setter方法
3. 在模板渲染中处理新的上下文信息
4. 添加相应的protocol消息类型（如需要）

### 自定义模板变量
在`renderStringTemplate`函数中添加新的Handlebars变量：
```typescript
return compiledTemplate({
  // 现有变量...
  customVariable: codeAwareContext?.customField || "",
});
```

## 性能考虑

- 使用单例模式避免重复创建管理器实例
- 异步导入CompletionManager减少初始加载时间
- 上下文信息只在有变化时才同步，避免不必要的通信

## 调试信息

系统会在控制台输出相关日志：
- `"CodeAware: User requirement synced: [requirement]"`
- `"CodeAware: Steps synced - Current: [current] Next: [next]"`
- `"CodeAware: Step updated - Current: [current] Next: [next]"`
- `"CodeAware: Failed to sync context to IDE: [error]"`

这些日志帮助开发者了解上下文同步的状态和排查问题。

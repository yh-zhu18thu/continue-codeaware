# CodeAware: Create and Open File Feature

## 概述

在用户创建新的CodeAware session时，系统现在会自动创建并打开一个以session名称命名的Python文件。

## 功能详情

### 新增的协议方法

在 `core/protocol/ide.ts` 中新增了 `createAndOpenFile` 方法：

```typescript
// CodeAware: Create and open a new file
createAndOpenFile: [
  {
    filename: string;
    content?: string;
  },
  void,
];
```

### VS Code IDE 实现

在 `VsCodeIde.ts` 中实现了 `createAndOpenFile` 方法：

```typescript
async createAndOpenFile(filename: string, content: string = ""): Promise<void> {
  // 在工作区根目录创建文件
  // 写入提供的内容
  // 在编辑器中打开文件
}
```

### GUI 集成

在 `CodeAware.tsx` 的 `handleSessionInfoSubmit` 回调中集成了这个功能：

1. 当用户提交session信息（用户ID和session名称）时
2. 系统会创建一个名为 `{sessionName}.py` 的Python文件
3. 文件包含基础的注释头部，包括：
   - Session名称
   - 用户名
   - 创建日期
   - TODO注释提示用户添加代码

### 错误处理

- 如果没有打开工作区，会抛出错误
- 文件创建失败会记录错误日志但不会阻止session创建
- 所有错误都会记录到CodeAware日志系统中

## 使用流程

1. 用户点击创建新session
2. 输入用户ID和session名称
3. 系统自动：
   - 创建新的CodeAware session
   - 开始日志记录
   - 创建 `{sessionName}.py` 文件
   - 在VS Code中打开该文件
   - 记录文件创建事件

## 日志事件

新增了以下日志事件：
- `system_create_session_file`: 成功创建session文件
- `system_create_session_file_error`: 创建session文件失败

## 文件模板

创建的Python文件包含以下模板内容：

```python
# CodeAware Session: {sessionName}
# User: {username}
# Created: {date}

# TODO: Add your code here

```

这个功能提高了用户体验，让用户可以立即开始编码，而不需要手动创建文件。

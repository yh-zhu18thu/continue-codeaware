# CodeStudy Logger

这是一个为Continue插件实现的用户行为日志记录系统，用于研究和分析用户与AI代码助手的交互行为。

## 功能特性

- 以JSONL格式存储日志文件
- 每个CodeStudy会话对应一个独立的日志文件
- 记录用户发送消息和AI完成响应的详细内容
- 支持会话管理和文件自动创建

## 实现的组件

### 1. 核心服务 (`core/codeStudy/`)

- **CodeStudyLoggerService.ts**: 核心日志服务，负责文件管理和日志写入
- **types.ts**: 类型定义
- **index.ts**: 导出文件

### 2. 协议扩展 (`core/protocol/core.ts`)

添加了三个新的协议消息：

- `codeStudy/startLogSession`: 开始新的日志会话
- `codeStudy/addLogEntry`: 添加日志条目  
- `codeStudy/endLogSession`: 结束日志会话

### 3. GUI组件

- **CodeStudySessionDialog.tsx**: 用户输入用户名和会话名的对话框
- **codeStudyLogger.ts**: WebView中的日志工具类

### 4. Chat组件集成 (`Chat.tsx`)

- 在newSession事件时弹出用户信息输入对话框
- 记录用户发送消息事件
- 记录AI完成响应事件

## 日志格式

每个日志条目包含以下字段：

```json
{
  "timestamp": "2025-08-13T10:30:00.000Z",
  "sessionId": "session-uuid-here", 
  "eventType": "user_send_message",
  "payload": {
    "message": "用户输入的消息内容",
    "timestamp": "2025-08-13T10:30:00.000Z"
  }
}
```

## 支持的事件类型

1. **session_start**: 会话开始
   - payload: { username, sessionName, codeStudySessionId }

2. **user_send_message**: 用户发送消息
   - payload: { message, timestamp }

3. **ai_complete_response**: AI完成响应
   - payload: { response, timestamp }

4. **session_end**: 会话结束
   - payload: { sessionDuration }

## 文件存储

日志文件存储在工作区的 `.codestudy-logs/` 文件夹中。

文件命名格式：`{username}_{sessionName}_{sessionId}.jsonl`

## 使用方法

1. 启动Continue插件
2. 点击新建会话按钮
3. 在弹出的对话框中输入用户名和会话名称
4. 开始正常使用聊天功能
5. 系统会自动记录用户消息发送和AI响应完成事件

## 开发说明

如需扩展更多事件类型，可以：

1. 在 `codeStudyLogger.ts` 中添加新的日志方法
2. 在相应的组件中调用日志方法
3. 更新事件类型文档

## 注意事项

- 确保工作区有写入权限
- 日志文件可能包含敏感代码内容，请注意数据安全
- 大量的聊天记录可能产生较大的日志文件

# HighlightCodeManager 用户交互清除高亮功能测试

## 功能说明

新增的功能允许 HighlightCodeManager 在检测到用户与编辑器交互时自动清除代码高亮，并通知 webview 更新 UI 状态。

## 实现的交互事件

1. **文本选择变化** (`onDidChangeTextEditorSelection`)
   - 当用户点击鼠标、按键盘移动光标或选择文本时触发
   - 检测光标位置或选择区域的变化

2. **活动编辑器变化** (`onDidChangeActiveTextEditor`) 
   - 当用户切换文件标签页时触发
   - 确保在切换文件时清除高亮

3. **文档内容变化** (`onDidChangeTextDocument`)
   - 当用户输入或编辑文本时触发
   - 在用户开始编辑代码时清除高亮

## 工作流程

1. **初始化**: HighlightCodeManager 在构造函数中设置事件监听器
2. **高亮应用**: 当通过 `highlightCodeChunk()` 方法应用高亮时，会存储活动装饰
3. **用户交互检测**: 当检测到用户在有高亮的文件中进行交互时：
   - 清除该文件的所有高亮装饰
   - 通过回调通知 VsCodeExtension
   - VsCodeExtension 向 webview 发送 "codeSelectionCleared" 消息
4. **Webview 响应**: useSetup.ts 中的监听器接收事件并调用 `clearAllHighlights()`

## 测试步骤

### 手动测试
1. 在代码中创建一个高亮 (通过 CodeAware 功能)
2. 进行以下操作之一：
   - 点击代码的任意位置
   - 使用键盘导航 (方向键、Page Up/Down等)
   - 选择一段文本
   - 开始输入文本
   - 切换到其他文件标签页
3. 观察高亮是否被清除
4. 检查浏览器控制台是否有相应的日志输出

### 预期结果
- 高亮应该立即被清除
- 控制台应该显示: "User interaction detected in file: [filepath], clearing highlights"
- 控制台应该显示: "Notified webview of highlight cleared for file: [filepath]"
- WebView 中的 CodeAware 状态应该被重置

## 性能考虑

- 只有在文件确实有活动高亮时才会触发清除逻辑
- 使用了高效的 Map 数据结构来跟踪活动装饰
- 事件监听器会在 dispose 时正确清理，避免内存泄漏

## 错误处理

- 检查编辑器和文档的有效性
- 只处理 file:// 协议的文档，忽略虚拟文件
- 在回调执行时捕获并记录错误，不影响扩展的其他功能

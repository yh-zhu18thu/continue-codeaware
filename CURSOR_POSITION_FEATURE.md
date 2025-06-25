// CodeAware 光标位置检测功能测试说明

## 功能概述
我已经实现了在 VS Code 中检测光标位置变化并与 webview 通信的功能。

## 实现的组件：

### 1. Protocol 层 (core/protocol/ideWebview.ts)
添加了两个新的消息类型：
- `cursorPositionChanged`: 光标位置变化事件
- `codeSelectionChanged`: 代码选择变化事件

### 2. VS Code Extension (extensions/vscode/src/extension/VsCodeExtension.ts)
添加了 `vscode.window.onDidChangeTextEditorSelection` 监听器：
- 当光标位置变化时，发送光标所在行号和上下10行代码
- 当用户选中代码时，发送选中的行号范围和内容

### 3. Webview 处理 (gui/src/hooks/useSetup.ts)
添加了两个 webview 监听器来处理来自 IDE 的消息：
- 检查光标位置或选中代码是否属于某个 CodeChunk
- 如果匹配，触发 `updateHighlight` action

### 4. 调试面板 (gui/src/pages/codeaware/CodeAware.tsx)
添加了一个固定位置的调试面板，显示：
- CodeChunks 总数
- Mappings 总数
- 当前高亮的 CodeChunks
- 最近的光标位置和选择信息

## 测试步骤：

1. 确保项目编译无错误
2. 启动 VS Code extension
3. 打开 CodeAware webview
4. 在编辑器中移动光标或选择代码
5. 查看：
   - 浏览器控制台的调试信息
   - webview 右上角的调试面板
   - 如果有匹配的 CodeChunk，应该触发高亮

## 数据流程：

```
VS Code Editor 光标变化 
    ↓
VsCodeExtension 监听器
    ↓
Protocol 消息 (cursorPositionChanged/codeSelectionChanged)
    ↓
useSetup webview 监听器
    ↓
检查 CodeChunks 匹配
    ↓
触发 updateHighlight action
    ↓
更新 Redux state 和 UI 高亮
```

## 后续优化：

1. 可以添加去抖动机制避免频繁触发
2. 可以添加更精确的代码内容匹配算法
3. 可以添加配置选项控制功能开关
4. 可以优化调试面板的显示效果

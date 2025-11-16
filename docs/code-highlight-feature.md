# CodeChunk高亮功能实现文档

## 概述

本文档描述了如何实现从webview向IDE发送CodeChunk对象并在IDE中高亮相应代码的功能。

## 架构设计

### 1. 协议层 (Protocol Layer)

在 `core/protocol/ideWebview.ts` 中添加了新的消息类型：

```typescript
export type ToIdeFromWebviewProtocol = {
  // ... 其他消息类型
  highlightCodeChunk: [{ codeChunk: CodeChunk; filepath: string }, void];
  clearCodeHighlight: [undefined, void];
}
```

### 2. IDE处理层 (IDE Handler Layer)

在 `extensions/vscode/src/extension/VsCodeMessenger.ts` 中实现了消息处理器：

```typescript
this.onWebview("highlightCodeChunk", async (msg) => {
  const { codeChunk, filepath } = msg.data;
  
  // 打开文件
  const uri = vscode.Uri.parse(filepath);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  
  // 创建高亮范围
  const [startLine, endLine] = codeChunk.lineRange;
  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
  );
  
  // 应用高亮装饰
  const decorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editor.wordHighlightBorder'),
    // ... 其他样式配置
  });
  
  editor.setDecorations(decorationType, [range]);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  
  // 10秒后自动清除高亮
  setTimeout(() => {
    decorationType.dispose();
  }, 10000);
});
```

### 3. Webview通信层 (Webview Communication Layer)

#### 工具函数 (`gui/src/util/ideHighlight.ts`)

```typescript
// 使用IdeMessenger发送高亮请求
export function highlightCodeInIDE(
  ideMessenger: IIdeMessenger, 
  codeChunk: CodeChunk, 
  filepath?: string
) {
  const data = {
    codeChunk,
    filepath: filepath || getCurrentFilePath(codeChunk)
  };
  
  ideMessenger.post("highlightCodeChunk", data);
}

// 全局便捷函数（在Redux中使用）
export function highlightCodeInIDEGlobal(codeChunk: CodeChunk, filepath?: string) {
  if (globalIdeMessenger) {
    highlightCodeInIDE(globalIdeMessenger, codeChunk, filepath);
  }
}
```

#### React Hook (`gui/src/hooks/useCodeHighlight.tsx`)

```typescript
export function useCodeHighlight() {
  const ideMessenger = useContext(IdeMessengerContext);
  const highlightHandler = createHighlightHandler(ideMessenger);
  
  const highlightCodeChunk = async (codeChunk: CodeChunk, filepath: string) => {
    await highlightHandler.highlightAsync(codeChunk, filepath);
  };

  return { highlightCodeChunk, highlightMultipleCodeChunks, clearHighlights };
}
```

#### 应用初始化 (`gui/src/hooks/useAppInit.ts`)

```typescript
export function useIdeHighlightInit() {
  const ideMessenger = useContext(IdeMessengerContext);
  
  useEffect(() => {
    if (ideMessenger) {
      setGlobalIdeMessenger(ideMessenger);
    }
  }, [ideMessenger]);
}
```

### 4. Redux集成层 (Redux Integration Layer)

在 `gui/src/redux/slices/codeAwareSlice.ts` 中集成了IDE通信：

```typescript
// 更新代码块高亮时自动通知IDE
codeChunkIds.forEach(codeChunkId => {
  const codeChunk = state.codeChunks.find(chunk => chunk.id === codeChunkId);
  if (codeChunk) {
    codeChunk.isHighlighted = true;
    // 使用全局messenger通知IDE高亮这个代码块
    try {
      highlightCodeInIDEGlobal(codeChunk);
    } catch (error) {
      console.error("Failed to highlight code in IDE:", error);
    }
  }
});
```

## 使用方法

### 1. 应用初始化

首先，在应用根组件中添加初始化器：

```typescript
import { AppInitializer } from './components/AppInitializer';

function App() {
  return (
    <AppInitializer>
      {/* 你的应用内容 */}
    </AppInitializer>
  );
}
```

### 2. 在React组件中使用

```typescript
import { useCodeHighlight } from '../hooks/useCodeHighlight';

function MyComponent() {
  const { highlightCodeChunk, clearHighlights } = useCodeHighlight();
  
  const handleChunkClick = (chunk: CodeChunk) => {
    const filepath = "file:///workspace/main.py";
    highlightCodeChunk(chunk, filepath);
  };
  
  return (
    <div>
      <button onClick={() => handleChunkClick(someCodeChunk)}>
        高亮代码
      </button>
      <button onClick={clearHighlights}>
        清除高亮
      </button>
    </div>
  );
}
```

### 3. 在Redux中使用

Redux slice会自动处理IDE高亮，无需额外配置：

```typescript
import { useAppDispatch } from '../redux/hooks';
import { updateHighlight } from '../redux/slices/codeAwareSlice';

function MyComponent() {
  const dispatch = useAppDispatch();
  
  const handleHighlight = (sourceType: string, identifier: string) => {
    dispatch(updateHighlight({
      sourceType,
      identifier,
      additionalInfo: someCodeChunk
    }));
    // Redux slice会自动处理IDE高亮
  };
}
```

### 4. 直接使用工具函数

```typescript
import { useContext } from 'react';
import { IdeMessengerContext } from '../context/IdeMessenger';
import { highlightCodeInIDE } from '../util/ideHighlight';

function MyComponent() {
  const ideMessenger = useContext(IdeMessengerContext);
  
  const handleDirectHighlight = (chunk: CodeChunk) => {
    highlightCodeInIDE(ideMessenger, chunk, "file:///workspace/main.py");
  };
}
```

## CodeChunk数据结构

```typescript
export type CodeChunk = {
  id: string;                    // 唯一标识符
  content: string;               // 代码内容
  lineRange: [number, number];   // 行范围 [起始行, 结束行]
  isHighlighted: boolean;        // 高亮状态
}
```

## 消息流程

1. **Webview触发**: 用户在webview中点击代码块
2. **消息发送**: Webview通过postMessage发送highlightCodeChunk消息
3. **IDE接收**: VsCodeMessenger接收并处理消息
4. **文件操作**: IDE打开指定文件并定位到指定行
5. **高亮应用**: 创建装饰器并应用高亮效果
6. **自动清除**: 10秒后自动清除高亮效果

## 扩展功能

### 1. 持久化高亮管理

可以扩展实现一个全局的装饰器管理器：

```typescript
class HighlightManager {
  private decorations: Map<string, vscode.TextEditorDecorationType> = new Map();
  
  addHighlight(id: string, decoration: vscode.TextEditorDecorationType) {
    this.decorations.set(id, decoration);
  }
  
  removeHighlight(id: string) {
    const decoration = this.decorations.get(id);
    if (decoration) {
      decoration.dispose();
      this.decorations.delete(id);
    }
  }
  
  clearAll() {
    this.decorations.forEach(decoration => decoration.dispose());
    this.decorations.clear();
  }
}
```

### 2. 自定义高亮样式

可以根据代码块类型应用不同的高亮样式：

```typescript
function getDecorationTypeForChunk(codeChunk: CodeChunk) {
  if (codeChunk.content.includes('def ') || codeChunk.content.includes('function ')) {
    // 函数定义样式
    return functionDecorationType;
  } else if (codeChunk.content.includes('class ')) {
    // 类定义样式
    return classDecorationType;
  } else {
    // 默认样式
    return defaultDecorationType;
  }
}
```

### 3. 错误处理增强

```typescript
export function highlightCodeInIDE(codeChunk: CodeChunk, filepath?: string) {
  try {
    // 验证输入
    if (!codeChunk || !codeChunk.lineRange || codeChunk.lineRange.length !== 2) {
      throw new Error("Invalid CodeChunk object");
    }
    
    // 验证行范围
    const [startLine, endLine] = codeChunk.lineRange;
    if (startLine < 0 || endLine < startLine) {
      throw new Error("Invalid line range");
    }
    
    // 发送消息...
  } catch (error) {
    console.error("Failed to highlight code:", error);
    // 可以显示用户友好的错误消息
  }
}
```

## 注意事项

1. **文件路径**: 确保提供正确的文件URI格式 (`file:///path/to/file`)
2. **行号**: 行号从0开始计数
3. **性能**: 避免同时高亮太多代码块，使用批量处理
4. **错误处理**: 始终包含适当的错误处理逻辑
5. **清理**: 装饰器会自动清理，但在必要时也可以手动清理

## 测试

可以使用提供的演示组件测试功能：

```typescript
import { CodeChunkHighlightDemo } from '../hooks/useCodeHighlight';

function App() {
  return (
    <div>
      <CodeChunkHighlightDemo />
    </div>
  );
}
```

这个功能为CodeAware应用提供了强大的代码导航和可视化能力，使用户能够在webview界面和IDE编辑器之间无缝切换和定位代码。

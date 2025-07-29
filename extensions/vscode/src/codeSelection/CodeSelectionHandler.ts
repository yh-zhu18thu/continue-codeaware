import * as vscode from "vscode";

import { VsCodeWebviewProtocol } from "../webviewProtocol";

export class CodeSelectionHandler {
  private disposables: vscode.Disposable[] = [];
  private currentQuickPick: vscode.QuickPick<vscode.QuickPickItem> | undefined;
  private selectionTimeout: NodeJS.Timeout | undefined;

  constructor(
    private webviewProtocol: VsCodeWebviewProtocol,
    context: vscode.ExtensionContext
  ) {
    this.setupSelectionListener();
    context.subscriptions.push(this);
  }

  private setupSelectionListener() {
    const disposable = vscode.window.onDidChangeTextEditorSelection(
      this.handleSelectionChange.bind(this)
    );
    this.disposables.push(disposable);
  }

  private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    // 清除之前的定时器
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }

    // 关闭之前的QuickPick
    if (this.currentQuickPick) {
      this.currentQuickPick.dispose();
      this.currentQuickPick = undefined;
    }

    const editor = event.textEditor;
    const selection = event.selections[0];

    // 只处理有选中内容的情况
    if (selection.isEmpty || editor.document.uri.scheme !== 'file') {
      return;
    }

    // 防抖处理，避免频繁触发
    this.selectionTimeout = setTimeout(() => {
      this.showCodeAwareQuickPick(editor, selection);
    }, 500); // 500ms 防抖
  }

  private showCodeAwareQuickPick(
    editor: vscode.TextEditor, 
    selection: vscode.Selection
  ) {
    const selectedText = editor.document.getText(selection);
    
    // 如果选中的文本太短，不显示QuickPick
    if (selectedText.trim().length < 10) {
      return;
    }

    const quickPick = vscode.window.createQuickPick();
    quickPick.title = "CodeAware Actions";
    quickPick.placeholder = "选择一个动作...";
    
    quickPick.items = [
      {
        label: "$(question) 向 CodeAware 提问",
        description: "基于选中的代码向 CodeAware 提问",
        detail: `选中代码: ${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}`
      },
      {
        label: "$(close) 取消",
        description: "取消操作"
      }
    ];

    quickPick.onDidChangeSelection(items => {
      if (items[0]?.label.includes("提问")) {
        this.handleCodeAwareQuestion(editor, selection, selectedText);
      }
      quickPick.dispose();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      this.currentQuickPick = undefined;
    });

    this.currentQuickPick = quickPick;
    quickPick.show();
  }

  private async handleCodeAwareQuestion(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    selectedText: string
  ) {
    try {
      // 获取用户输入的问题
      const question = await vscode.window.showInputBox({
        prompt: "请输入您的问题",
        placeHolder: "例如：这段代码是如何工作的？",
        validateInput: (value) => {
          if (!value.trim()) {
            return "问题不能为空";
          }
          return null;
        }
      });

      if (!question) {
        return; // 用户取消了输入
      }

      // 准备发送给CodeAware的数据
      const questionData = {
        selectedCode: selectedText,
        selectedText: selectedText,
        question: question.trim(),
        filePath: editor.document.uri.fsPath,
        selectedLines: [selection.start.line + 1, selection.end.line + 1] as [number, number],
        // 获取更多上下文信息
        contextInfo: {
          fileName: editor.document.fileName,
          language: editor.document.languageId,
          // 可以添加更多上下文，如周围的代码等
        }
      };

      // 发送给CodeAware前端
      await this.webviewProtocol.request("codeAwareQuestionFromSelection", questionData);

      // 显示成功消息
      vscode.window.showInformationMessage("问题已发送到 CodeAware！");

      // 可选：自动打开CodeAware面板
      await vscode.commands.executeCommand("continue.continueGUIView.focus");

    } catch (error) {
      console.error("Failed to send question to CodeAware:", error);
      vscode.window.showErrorMessage("发送问题到 CodeAware 失败，请重试。");
    }
  }

  dispose() {
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }
    if (this.currentQuickPick) {
      this.currentQuickPick.dispose();
    }
    this.disposables.forEach(d => d.dispose());
  }
}

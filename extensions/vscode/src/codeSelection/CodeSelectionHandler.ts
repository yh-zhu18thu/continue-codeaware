import { codeAwareLogger } from "core/util/codeAwareLogger";
import * as vscode from "vscode";

import { VsCodeWebviewProtocol } from "../webviewProtocol";

export class CodeSelectionHandler {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private webviewProtocol: VsCodeWebviewProtocol,
    context: vscode.ExtensionContext
  ) {
    // 注册命令处理器
    this.registerCommands(context);
    context.subscriptions.push(this);
  }

  private registerCommands(context: vscode.ExtensionContext) {
    // 注册 CodeAware 提问命令
    const askCodeAwareCommand = vscode.commands.registerCommand(
      "continue.askCodeAware",
      async (uri: vscode.Uri, range: vscode.Range, selectedText: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== uri.toString()) {
          vscode.window.showErrorMessage("无法找到对应的编辑器");
          return;
        }

        const selection = new vscode.Selection(range.start, range.end);
        await this.handleCodeAwareQuestion(editor, selection, selectedText);
      }
    );

    this.disposables.push(askCodeAwareCommand);
  }

  private async handleCodeAwareQuestion(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    selectedText: string
  ) {
    try {
      let hasStartedEditing = false;

      // 获取用户输入的问题
      const question = await vscode.window.showInputBox({
        prompt: "请输入您的问题",
        placeHolder: "例如：这段代码是如何工作的？",
        validateInput: (value) => {
          // 记录用户开始编辑针对代码的问题（只在首次输入时记录）
          if (!hasStartedEditing && value.trim()) {
            hasStartedEditing = true;
            try {
              codeAwareLogger.addLogEntry("user_start_edit_code_question", {
                selectedText: selectedText,
                filePath: editor.document.uri.fsPath,
                selectedLines: [selection.start.line + 1, selection.end.line + 1] as [number, number],
                fileName: editor.document.fileName,
                language: editor.document.languageId,
                timestamp: new Date().toISOString()
              });
            } catch (error) {
              console.error("Failed to log user_start_edit_code_question:", error);
            }
          }

          if (!value.trim()) {
            return "问题不能为空";
          }
          return null;
        }
      });

      if (!question) {
        return; // 用户取消了输入
      }

      // 记录用户提交针对代码的问题
      await codeAwareLogger.addLogEntry("user_submit_code_question", {
        selectedText: selectedText,
        question: question.trim(),
        filePath: editor.document.uri.fsPath,
        selectedLines: [selection.start.line + 1, selection.end.line + 1] as [number, number],
        fileName: editor.document.fileName,
        language: editor.document.languageId,
        timestamp: new Date().toISOString()
      });

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
    this.disposables.forEach(d => d.dispose());
  }
}

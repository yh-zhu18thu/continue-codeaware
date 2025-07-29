import * as vscode from "vscode";

import { VsCodeWebviewProtocol } from "../webviewProtocol";

export class CodeAwareActionProvider implements vscode.CodeActionProvider {
  constructor(private webviewProtocol: VsCodeWebviewProtocol) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    // 只在有选中文本的情况下提供动作
    if (range.isEmpty) {
      return [];
    }

    const selectedText = document.getText(range);
    
    // 如果选中的文本太短，不显示动作
    if (selectedText.trim().length < 10) {
      return [];
    }

    const codeAction = new vscode.CodeAction(
      "向 CodeAware 提问",
      vscode.CodeActionKind.Empty
    );
    
    codeAction.command = {
      command: "continue.askCodeAware",
      title: "向 CodeAware 提问",
      arguments: [document.uri, range, selectedText]
    };

    // 设置图标和描述
    codeAction.diagnostics = [];
    codeAction.isPreferred = false;

    return [codeAction];
  }
}

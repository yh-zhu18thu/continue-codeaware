import * as vscode from "vscode";

import { VsCodeWebviewProtocol } from "../webviewProtocol";

export class CodeAwareActionProvider implements vscode.CodeActionProvider {
  constructor(private webviewProtocol: VsCodeWebviewProtocol) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
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

    const annotateAction = new vscode.CodeAction(
      "生成代码注释",
      vscode.CodeActionKind.Empty,
    );

    annotateAction.command = {
      command: "continue.generateCodeAnnotation",
      title: "生成代码注释",
    };
    annotateAction.isPreferred = false;

    return [annotateAction];
  }
}

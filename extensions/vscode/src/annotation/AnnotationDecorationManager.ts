import * as path from "node:path";

import * as vscode from "vscode";

/**
 * 在有注释的行显示 gutter icon，让用户一眼看到哪些代码有 CodeAware 注释。
 */
export class AnnotationDecorationManager implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType;
  /** filePath → Set of annotated line ranges */
  private annotatedRanges: Map<string, vscode.Range[]> = new Map();

  constructor(extensionPath: string) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.file(
        path.join(extensionPath, "media", "annotation-icon.svg"),
      ),
      gutterIconSize: "contain",
      overviewRulerColor: "rgba(100, 200, 255, 0.7)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  /** 添加或更新指定文件的注释范围 */
  setRanges(filePath: string, ranges: vscode.Range[]): void {
    this.annotatedRanges.set(filePath, ranges);
    this.refresh(filePath);
  }

  /** 移除指定文件的某个范围 */
  removeRange(filePath: string, range: vscode.Range): void {
    const ranges = this.annotatedRanges.get(filePath);
    if (ranges) {
      const filtered = ranges.filter(
        (r) =>
          !(r.start.line === range.start.line && r.end.line === range.end.line),
      );
      this.annotatedRanges.set(filePath, filtered);
      this.refresh(filePath);
    }
  }

  /** 刷新指定文件的 decoration 显示 */
  private refresh(filePath: string): void {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.fsPath === filePath,
    );
    if (!editor) {
      return;
    }

    const ranges = this.annotatedRanges.get(filePath) || [];
    editor.setDecorations(this.decorationType, ranges);
  }

  /** 刷新所有可见编辑器的 decoration */
  refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const filePath = editor.document.uri.fsPath;
      const ranges = this.annotatedRanges.get(filePath) || [];
      editor.setDecorations(this.decorationType, ranges);
    }
  }

  /** 清除指定文件的所有 decoration */
  clearFile(filePath: string): void {
    this.annotatedRanges.delete(filePath);
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.fsPath === filePath,
    );
    if (editor) {
      editor.setDecorations(this.decorationType, []);
    }
  }

  dispose(): void {
    this.decorationType.dispose();
    this.annotatedRanges.clear();
  }
}

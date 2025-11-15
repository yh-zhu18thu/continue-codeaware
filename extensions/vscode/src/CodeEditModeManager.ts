import * as vscode from "vscode";

/**
 * 代码编辑模式管理器
 * 管理代码编辑权限，在webview-only模式下阻止用户编辑代码
 */
export class CodeEditModeManager {
  private isCodeEditModeEnabled: boolean = true;
  private disposables: vscode.Disposable[] = [];
  private lastActiveEditor: vscode.TextEditor | undefined;
  private documentSnapshots: Map<vscode.TextDocument, string> = new Map();
  private preventionActive: boolean = false;
  private programmaticUpdateInProgress: boolean = false;
  private restoringContent: boolean = false;
  private onModeChangeCallback?: (enabled: boolean) => Promise<void>;

  constructor() {
    this.setupEventListeners();
  }

  /**
   * 设置模式切换回调函数
   * @param callback 当模式切换时调用的回调函数
   */
  public setOnModeChangeCallback(
    callback: (enabled: boolean) => Promise<void>,
  ): void {
    this.onModeChangeCallback = callback;
  }

  /**
   * 设置代码编辑模式
   * @param enabled true: 代码编辑模式（允许编辑），false: webview-only模式（禁止编辑）
   */
  public async setCodeEditMode(enabled: boolean): Promise<void> {
    const wasEnabled = this.isCodeEditModeEnabled;
    this.isCodeEditModeEnabled = enabled;

    // 如果从代码编辑模式切换到webview-only模式，先自动保存
    if (wasEnabled && !enabled && this.onModeChangeCallback) {
      try {
        await this.onModeChangeCallback(enabled);
        console.log("💾 Auto-saved before switching to webview-only mode");
      } catch (error) {
        console.error("Failed to auto-save before mode switch:", error);
      }
    }

    if (enabled) {
      this.enableCodeEditing();
    } else {
      this.disableCodeEditing();
    }

    console.log(
      `📝 CodeEditModeManager: Code editing ${enabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * 获取当前代码编辑模式状态
   */
  public getCodeEditMode(): boolean {
    return this.isCodeEditModeEnabled;
  }

  /**
   * 允许程序化更新，临时禁用拦截
   */
  public allowProgrammaticUpdate(): void {
    this.programmaticUpdateInProgress = true;
    console.log("🔄 CodeEditModeManager: Programmatic update started");
  }

  /**
   * 结束程序化更新，重新启用拦截
   */
  public endProgrammaticUpdate(): void {
    this.programmaticUpdateInProgress = false;

    // 更新Python文档的快照以反映程序化更新后的状态
    if (!this.isCodeEditModeEnabled) {
      vscode.window.visibleTextEditors.forEach((editor) => {
        if (this.shouldBlockEdit(editor.document)) {
          this.captureDocumentSnapshot(editor.document);
        }
      });
    }

    console.log(
      "✅ CodeEditModeManager: Programmatic update ended, snapshots updated",
    );
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听活动编辑器变化
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.lastActiveEditor = editor;
        if (
          !this.isCodeEditModeEnabled &&
          editor &&
          this.shouldBlockEdit(editor.document)
        ) {
          this.captureDocumentSnapshot(editor.document);
          this.applyReadOnlyMode(editor);
        }
      }),
    );

    // 监听文档变化并阻止编辑
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          !this.isCodeEditModeEnabled &&
          !this.preventionActive &&
          !this.programmaticUpdateInProgress &&
          !this.restoringContent
        ) {
          this.handleDocumentChange(event);
        }
      }),
    );

    // 监听文档保存尝试
    this.disposables.push(
      vscode.workspace.onWillSaveTextDocument((event) => {
        if (
          !this.isCodeEditModeEnabled &&
          !this.programmaticUpdateInProgress &&
          !this.restoringContent
        ) {
          // 只阻止 .py 文件的保存
          if (this.shouldBlockEdit(event.document)) {
            // 如果在webview-only模式下，阻止用户主动保存Python文件，但允许程序化保存
            event.waitUntil(
              Promise.reject(
                new Error("Python文件编辑已禁用，请先切换到代码编辑模式"),
              ),
            );
          }
        }
      }),
    );

    // 初始化当前打开的Python文档快照
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (this.shouldBlockEdit(editor.document)) {
        this.captureDocumentSnapshot(editor.document);
      }
    });
  }

  /**
   * 启用代码编辑
   */
  private enableCodeEditing(): void {
    // 清理文档快照
    this.documentSnapshots.clear();

    // 移除Python文件的只读状态
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (this.shouldBlockEdit(editor.document)) {
        this.removeReadOnlyMode(editor);
      }
    });

    // 显示状态栏信息
    vscode.window.setStatusBarMessage("📝 代码编辑模式已启用", 3000);
  }

  /**
   * 禁用代码编辑
   */
  private disableCodeEditing(): void {
    // 只捕获Python文档的快照
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (this.shouldBlockEdit(editor.document)) {
        this.captureDocumentSnapshot(editor.document);
      }
    });

    // 对Python文件应用只读模式
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (this.shouldBlockEdit(editor.document)) {
        this.applyReadOnlyMode(editor);
      }
    });

    // 显示状态栏信息
    vscode.window.setStatusBarMessage(
      "🚫 Python文件编辑已禁用（webview-only模式）",
      3000,
    );
  }

  /**
   * 捕获文档快照
   */
  private captureDocumentSnapshot(document: vscode.TextDocument): void {
    this.documentSnapshots.set(document, document.getText());
  }

  /**
   * 检查是否应该阻止编辑该文件
   */
  private shouldBlockEdit(document: vscode.TextDocument): boolean {
    // 只阻止编辑 .py 文件
    return document.fileName.toLowerCase().endsWith(".py");
  }

  /**
   * 处理文档变化
   */
  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    const document = event.document;

    // 只对 .py 文件进行编辑阻止
    if (!this.shouldBlockEdit(document)) {
      return;
    }

    const originalContent = this.documentSnapshots.get(document);

    console.log(
      `📝 CodeEditModeManager: Python file change detected in ${document.fileName}`,
    );
    console.log(`   - isCodeEditModeEnabled: ${this.isCodeEditModeEnabled}`);
    console.log(`   - preventionActive: ${this.preventionActive}`);
    console.log(
      `   - programmaticUpdateInProgress: ${this.programmaticUpdateInProgress}`,
    );

    if (!originalContent) {
      // 如果没有快照，立即捕获当前内容作为基准
      console.log("📸 Capturing new Python file snapshot");
      this.captureDocumentSnapshot(document);
      return;
    }

    // 检查是否有实际的内容变化
    if (event.contentChanges.length > 0) {
      console.log(`🚫 Blocking user edit of Python file in webview-only mode`);

      // 设置防止递归标志
      this.preventionActive = true;

      // 恢复到原始内容
      this.restoreDocumentContent(document, originalContent)
        .then(() => {
          this.preventionActive = false;
          this.showEditDisabledWarning();
        })
        .catch((error) => {
          console.error("Failed to restore document content:", error);
          this.preventionActive = false;
        });
    }
  }

  /**
   * 恢复文档内容
   */
  private async restoreDocumentContent(
    document: vscode.TextDocument,
    originalContent: string,
  ): Promise<void> {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document === document,
    );
    if (!editor) {
      return;
    }

    // 设置恢复内容标志，防止触发文档变化事件
    this.restoringContent = true;

    try {
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      );

      await editor.edit(
        (editBuilder) => {
          editBuilder.replace(fullRange, originalContent);
        },
        { undoStopBefore: false, undoStopAfter: false },
      );

      // 立即保存文件以解决未保存状态问题
      await document.save();
      console.log(
        `💾 CodeEditModeManager: Saved file after restoring content: ${document.fileName}`,
      );
    } catch (error) {
      console.error(
        `❌ CodeEditModeManager: Failed to restore/save file:`,
        error,
      );
    } finally {
      // 重置恢复内容标志
      this.restoringContent = false;
    }
  }

  /**
   * 显示编辑禁用警告
   */
  private showEditDisabledWarning(): void {
    vscode.window
      .showWarningMessage(
        "Python文件编辑已禁用。请切换到代码编辑模式后再进行修改。",
        "切换到代码编辑模式",
      )
      .then((selection) => {
        if (selection === "切换到代码编辑模式") {
          vscode.window.showInformationMessage(
            "请在CodeAware面板中点击编辑模式按钮切换",
          );
        }
      });
  }

  /**
   * 应用只读模式到编辑器
   */
  private applyReadOnlyMode(editor: vscode.TextEditor): void {
    // 确保有文档快照
    this.captureDocumentSnapshot(editor.document);

    // 显示只读模式提示
    vscode.window.setStatusBarMessage(
      `🚫 ${editor.document.fileName.split("/").pop()} (Python文件) 处于只读模式`,
      2000,
    );
  }

  /**
   * 移除只读模式
   */
  private removeReadOnlyMode(editor: vscode.TextEditor): void {
    // 从快照中移除该文档
    this.documentSnapshots.delete(editor.document);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.documentSnapshots.clear();
  }
}

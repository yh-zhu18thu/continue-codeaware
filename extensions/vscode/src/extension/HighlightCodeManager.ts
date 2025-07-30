import * as vscode from "vscode";

interface CodeChunk {
  filePath: string;
  range: [number, number];
}

export class HighlightCodeManager implements vscode.Disposable {
  private activeDecorations: Map<string, vscode.TextEditorDecorationType> = new Map();
  private blinkTimeouts: Map<string, NodeJS.Timeout[]> = new Map();
  private disposables: vscode.Disposable[] = [];
  private onHighlightClearedCallback?: (filePath: string) => void;

  constructor() {
    this.setupUserInteractionListeners();
  }

  /**
   * Sets up listeners for user interactions that should clear highlights
   */
  private setupUserInteractionListeners(): void {
    // Listen for text editor selection changes (mouse clicks, keyboard navigation)
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.handleUserInteraction(event.textEditor);
      })
    );

    // Listen for active text editor changes (switching between files)
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.handleUserInteraction(editor);
        }
      })
    );

    // Listen for text document changes (typing)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        // Find editors showing this document
        const editors = vscode.window.visibleTextEditors.filter(
          editor => editor.document === event.document
        );
        editors.forEach(editor => this.handleUserInteraction(editor));
      })
    );
  }

  /**
   * Handles user interaction in an editor by clearing highlights for that file
   * @param editor The text editor where interaction occurred
   */
  private handleUserInteraction(editor: vscode.TextEditor): void {
    if (!editor || editor.document.uri.scheme !== 'file') {
      return;
    }

    const filePath = editor.document.uri.fsPath;

    // Check if there are active highlights for this file
    if (this.hasActiveHighlights(filePath)) {
      console.log(`User interaction detected in file: ${filePath}, clearing highlights`);
      
      // Clear highlights for this file
      this.clearHighlightForFile(filePath);
      
      // Notify callback if set (to inform webview)
      if (this.onHighlightClearedCallback) {
        this.onHighlightClearedCallback(filePath);
      }
    }
  }

  /**
   * Sets a callback to be called when highlights are cleared due to user interaction
   * @param callback The callback function to call with the file path
   */
  setOnHighlightClearedCallback(callback: (filePath: string) => void): void {
    this.onHighlightClearedCallback = callback;
  }

  /**
   * Checks if there are active highlights for a specific file
   * @param filepath The file path to check
   * @returns True if there are active highlights for the file
   */
  hasActiveHighlights(filepath: string): boolean {
    const normalizedFilepath = this.normalizeFilePath(filepath);
    return this.activeDecorations.has(normalizedFilepath) || this.activeDecorations.has(filepath);
  }

  /**
   * Highlights a code chunk in the specified file
   * @param codeChunk The code chunk to highlight
   */
  async highlightCodeChunk(codeChunk: CodeChunk): Promise<void> {
    const filepath = codeChunk.filePath;
    console.log(`Highlighting code chunk in file: ${filepath}, range: ${codeChunk.range}`);
    try {
      // Normalize the filepath for comparison
      const normalizedFilepath = this.normalizeFilePath(filepath);
      
      // First try to find an existing editor for the file
      let editor = vscode.window.visibleTextEditors.find(e => 
        this.normalizeFilePath(e.document.fileName) === normalizedFilepath ||
        this.normalizeFilePath(e.document.uri.fsPath) === normalizedFilepath
      );
      
      // If no editor is found, try to open the file
      if (!editor) {
        try {
          const uri = vscode.Uri.file(filepath);
          const document = await vscode.workspace.openTextDocument(uri);
          editor = await vscode.window.showTextDocument(document);
        } catch (openError) {
          console.warn(`Failed to open file ${filepath}:`, openError);
          return;
        }
      }
      
      if (!editor) {
        console.warn(`No editor available for file ${filepath}`);
        return;
      }
        
      const [startLine, endLine] = codeChunk.range;
      
      // Check if file is empty
      if (editor.document.lineCount === 0) {
        console.warn(`Cannot highlight in empty file ${filepath}`);
        return;
      }
      
      // Convert from 1-based to 0-based line numbers if needed
      const adjustedStartLine = Math.max(0, startLine - 1);
      const adjustedEndLine = Math.max(0, endLine - 1);
      
      // Validate line numbers (now 0-based)
      if (adjustedStartLine < 0 || adjustedStartLine >= editor.document.lineCount ||
          adjustedEndLine < 0 || adjustedEndLine >= editor.document.lineCount ||
          adjustedStartLine > adjustedEndLine) {
          console.warn(`Invalid line range [${startLine}, ${endLine}] (0-based: [${adjustedStartLine}, ${adjustedEndLine}]) for file ${filepath}. File has ${editor.document.lineCount} lines.`);
          return;
        }
        
        const range = new vscode.Range(
            new vscode.Position(adjustedStartLine, 0),
            new vscode.Position(adjustedEndLine, editor.document.lineAt(adjustedEndLine).text.length)
        );        // Create decoration type for highlighting with better visual feedback
        const permanentDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.15)', // 淡黄色背景，透明度15%
            border: '1px solid rgba(255, 255, 0, 0.3)', // 淡黄色边框，透明度30%
            borderRadius: '3px',
            overviewRulerColor: 'rgba(255, 255, 0, 0.5)',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            isWholeLine: false,
        });

        // Create decoration type for blinking effect
        const blinkDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 120, 215, 0.2)', // 淡蓝色背景，透明度20%
            border: '1px solid rgba(0, 120, 215, 0.4)', // 淡蓝色边框，透明度40%
            borderRadius: '3px',
            isWholeLine: false,
        });
        
        // Clear any existing highlights for this file before applying new one
        this.clearHighlightForFile(normalizedFilepath);
        
        // Apply blinking effect first
        await this.applyBlinkEffect(editor, range, blinkDecorationType, permanentDecorationType);
        
        // Store permanent decoration for management using normalized path
        this.activeDecorations.set(normalizedFilepath, permanentDecorationType);
        
        // Reveal the range in the editor
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      
    } catch (error) {
      console.error('Error highlighting code chunk:', error);
      vscode.window.showErrorMessage(`Failed to highlight code: ${error}`);
    }
  }

  /**
   * Clears the highlight for a specific file
   * @param filepath The file path to clear highlights for
   */
  clearHighlightForFile(filepath: string): void {
    const normalizedFilepath = this.normalizeFilePath(filepath);
    
    // Clear any active timeouts - check both original and normalized paths
    const timeouts = this.blinkTimeouts.get(filepath) || this.blinkTimeouts.get(normalizedFilepath);
    if (timeouts) {
      timeouts.forEach(timeout => clearTimeout(timeout));
      this.blinkTimeouts.delete(filepath);
      this.blinkTimeouts.delete(normalizedFilepath);
    }
    
    // Clear decoration - check both original and normalized paths
    const decoration = this.activeDecorations.get(filepath) || this.activeDecorations.get(normalizedFilepath);
    if (decoration) {
      decoration.dispose();
      this.activeDecorations.delete(filepath);
      this.activeDecorations.delete(normalizedFilepath);
    }
  }

  /**
   * Clears all active code highlights
   */
  clearAllHighlights(): void {
    // Clear all timeouts
    for (const [filepath, timeouts] of this.blinkTimeouts) {
      timeouts.forEach(timeout => clearTimeout(timeout));
    }
    this.blinkTimeouts.clear();
    
    // Clear all decorations
    for (const [filepath, decoration] of this.activeDecorations) {
      decoration.dispose();
    }
    this.activeDecorations.clear();
  }

  /**
   * Disposes of the manager and cleans up all decorations
   */
  dispose(): void {
    this.clearAllHighlights();
    
    // Dispose of all event listeners
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
    
    // Clear callback reference
    this.onHighlightClearedCallback = undefined;
  }

  /**
   * Normalizes file paths for comparison by converting to lowercase on case-insensitive systems
   * and resolving to absolute path
   * @param filepath The file path to normalize
   * @returns The normalized file path
   */
  private normalizeFilePath(filepath: string): string {
    // Convert to absolute path using VS Code's URI system
    const uri = vscode.Uri.file(filepath);
    const normalizedPath = uri.fsPath;
    
    // On case-insensitive file systems (like macOS and Windows), convert to lowercase
    // for consistent comparison
    return process.platform === 'win32' || process.platform === 'darwin' 
      ? normalizedPath.toLowerCase() 
      : normalizedPath;
  }

  /**
   * Applies a blinking effect before setting permanent highlight
   * @param editor The text editor
   * @param range The range to highlight
   * @param blinkDecorationType The decoration for blinking
   * @param permanentDecorationType The permanent decoration
   */
  private async applyBlinkEffect(
    editor: vscode.TextEditor,
    range: vscode.Range,
    blinkDecorationType: vscode.TextEditorDecorationType,
    permanentDecorationType: vscode.TextEditorDecorationType
  ): Promise<void> {
    const filepath = this.normalizeFilePath(editor.document.uri.fsPath);
    const timeouts: NodeJS.Timeout[] = [];
    
    // Clear any existing timeouts for this file
    const existingTimeouts = this.blinkTimeouts.get(filepath);
    if (existingTimeouts) {
      existingTimeouts.forEach(timeout => clearTimeout(timeout));
    }
    
    // Blink 3 times (on-off-on-off-on-off)
    const blinkCount = 3;
    const blinkDuration = 200; // milliseconds
    
    for (let i = 0; i < blinkCount; i++) {
      // Blink on
      const onTimeout = setTimeout(() => {
        editor.setDecorations(blinkDecorationType, [range]);
      }, i * blinkDuration * 2);
      timeouts.push(onTimeout);
      
      // Blink off
      const offTimeout = setTimeout(() => {
        editor.setDecorations(blinkDecorationType, []);
      }, i * blinkDuration * 2 + blinkDuration);
      timeouts.push(offTimeout);
    }
    
    // Apply permanent highlight after blinking
    const finalTimeout = setTimeout(() => {
      editor.setDecorations(permanentDecorationType, [range]);
      blinkDecorationType.dispose();
      
      // Clean up timeouts
      this.blinkTimeouts.delete(filepath);
    }, blinkCount * blinkDuration * 2);
    timeouts.push(finalTimeout);
    
    // Store timeouts for cleanup
    this.blinkTimeouts.set(filepath, timeouts);
  }
}

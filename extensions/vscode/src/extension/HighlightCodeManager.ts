import * as vscode from "vscode";

interface CodeChunk {
  filePath: string;
  range: [number, number];
}

export class HighlightCodeManager {
  private activeDecorations: Map<string, vscode.TextEditorDecorationType> = new Map();
  private blinkTimeouts: Map<string, NodeJS.Timeout[]> = new Map();

  /**
   * Highlights a code chunk in the specified file
   * @param codeChunk The code chunk to highlight
   */
  async highlightCodeChunk(codeChunk: CodeChunk): Promise<void> {
    const filepath = codeChunk.filePath;
    
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
            backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editor.wordHighlightBorder'),
            borderRadius: '3px',
            overviewRulerColor: new vscode.ThemeColor('editor.wordHighlightBorder'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            isWholeLine: false,
        });

        // Create decoration type for blinking effect
        const blinkDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            border: '2px solid',
            borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
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

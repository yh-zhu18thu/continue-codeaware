import * as vscode from "vscode";

interface CodeChunk {
  filePath: string;
  lineRange: [number, number];
}

export class HighlightCodeManager {
  private activeDecorations: Map<string, vscode.TextEditorDecorationType> = new Map();

  /**
   * Highlights a code chunk in the specified file
   * @param codeChunk The code chunk to highlight
   */
  async highlightCodeChunk(codeChunk: CodeChunk): Promise<void> {
    const filepath = codeChunk.filePath;
    
    try {
      // Open the file if it's not already open
      const uri = vscode.Uri.parse(filepath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      
      // Create the range from the CodeChunk lineRange
      const [startLine, endLine] = codeChunk.lineRange;
      
      // Validate line numbers
      if (startLine < 0 || startLine >= document.lineCount || 
          endLine < 0 || endLine >= document.lineCount ||
          startLine > endLine) {
        console.warn(`Invalid line range [${startLine}, ${endLine}] for file ${filepath}`);
        return;
      }
      
      const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
      );
      
      // Create decoration type for highlighting with better visual feedback
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editor.wordHighlightBorder'),
        borderRadius: '3px',
        overviewRulerColor: new vscode.ThemeColor('editor.wordHighlightBorder'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        isWholeLine: false,
      });
      
      // Clear any existing highlights for this file before applying new one
      this.clearHighlightForFile(filepath);
      
      // Apply the decoration
      editor.setDecorations(decorationType, [range]);
      
      // Store decoration for management
      this.activeDecorations.set(filepath, decorationType);
      
      // Reveal the range in the editor
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      
      // Auto-remove highlight after 10 seconds
      setTimeout(() => {
        this.clearHighlightForFile(filepath);
      }, 10000);
      
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
    const decoration = this.activeDecorations.get(filepath);
    if (decoration) {
      decoration.dispose();
      this.activeDecorations.delete(filepath);
    }
  }

  /**
   * Clears all active code highlights
   */
  clearAllHighlights(): void {
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
}

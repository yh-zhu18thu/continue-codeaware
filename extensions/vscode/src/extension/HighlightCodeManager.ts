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
      // Open the file if it's not already open
      /* CATODO: open the directed file in the editor 
      const uri = vscode.Uri.parse(filepath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);*/
       

      // Create the range from the CodeChunk lineRange
        const editor = vscode.window.activeTextEditor;
        const [startLine, endLine] = codeChunk.range;
        if (!editor) {
          console.warn(`No active editor found for file ${filepath}`);
          return;
        }
      
        // Validate line numbers
        if (startLine < 0 || startLine >= editor.document.lineCount ||
            endLine < 0 || endLine >= editor.document.lineCount ||
            startLine > endLine) {
            console.warn(`Invalid line range [${startLine}, ${endLine}] for file ${filepath}`);
            return;
        }
        
        const range = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
        );
        
        // Create decoration type for highlighting with better visual feedback
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
        this.clearHighlightForFile(filepath);
        
        // Apply blinking effect first
        await this.applyBlinkEffect(editor, range, blinkDecorationType, permanentDecorationType);
        
        // Store permanent decoration for management
        this.activeDecorations.set(filepath, permanentDecorationType);
        
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
    // Clear any active timeouts
    const timeouts = this.blinkTimeouts.get(filepath);
    if (timeouts) {
      timeouts.forEach(timeout => clearTimeout(timeout));
      this.blinkTimeouts.delete(filepath);
    }
    
    // Clear decoration
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
    const filepath = editor.document.uri.toString();
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

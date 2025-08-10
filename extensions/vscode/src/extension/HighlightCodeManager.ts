import * as vscode from "vscode";

interface CodeChunk {
  filePath: string;
  range: [number, number];
}

export class HighlightCodeManager implements vscode.Disposable {
  private activeDecorations: Map<string, vscode.TextEditorDecorationType[]> = new Map();
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

    // Listen for visible text editors changes (opening new editors, closing editors)
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        // When editors change, check for interactions in all visible editors
        editors.forEach(editor => {
          if (editor.document.uri.scheme === 'file') {
            this.handleUserInteraction(editor);
          }
        });
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
    const normalizedFilePath = this.normalizeFilePath(filePath);

    // Check if there are active highlights for this file
    if (this.hasActiveHighlights(filePath)) {
      console.log(`User interaction detected in file: ${filePath}, clearing highlights`);
      console.log(`Active decorations before clear:`, Array.from(this.activeDecorations.keys()));
      console.log(`Active timeouts before clear:`, Array.from(this.blinkTimeouts.keys()));
      
      // Clear highlights for this file
      this.clearHighlightForFile(filePath);
      
      console.log(`Active decorations after clear:`, Array.from(this.activeDecorations.keys()));
      console.log(`Active timeouts after clear:`, Array.from(this.blinkTimeouts.keys()));
      
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
    const decorations = this.activeDecorations.get(normalizedFilepath) || this.activeDecorations.get(filepath);
    return Boolean(decorations && decorations.length > 0);
  }

  /**
   * Highlights multiple code chunks simultaneously
   * @param codeChunks Array of code chunks to highlight
   */
  async highlightCodeChunks(codeChunks: CodeChunk[]): Promise<void> {
    if (!codeChunks || codeChunks.length === 0) {
      return;
    }

    console.log(`Highlighting ${codeChunks.length} code chunks`);

    // Group code chunks by file path
    const chunksByFile = new Map<string, CodeChunk[]>();
    codeChunks.forEach(chunk => {
      const normalizedPath = this.normalizeFilePath(chunk.filePath);
      if (!chunksByFile.has(normalizedPath)) {
        chunksByFile.set(normalizedPath, []);
      }
      chunksByFile.get(normalizedPath)!.push(chunk);
    });

    // Process each file
    for (const [normalizedFilepath, chunks] of chunksByFile) {
      await this.highlightCodeChunksInFile(normalizedFilepath, chunks);
    }
  }

  /**
   * Merges overlapping ranges to avoid color overlay issues
   * @param ranges Array of ranges to merge
   * @returns Array of non-overlapping ranges
   * 
   * Example:
   * Input: [Range(1-5), Range(3-7), Range(10-12), Range(11-15)]
   * Output: [Range(1-7), Range(10-15)]
   */
  private mergeOverlappingRanges(ranges: vscode.Range[]): vscode.Range[] {
    if (ranges.length <= 1) {
      return ranges;
    }

    // Sort ranges by start line, then by start character
    const sortedRanges = [...ranges].sort((a, b) => {
      if (a.start.line !== b.start.line) {
        return a.start.line - b.start.line;
      }
      return a.start.character - b.start.character;
    });

    const mergedRanges: vscode.Range[] = [];
    let currentRange = sortedRanges[0];

    for (let i = 1; i < sortedRanges.length; i++) {
      const nextRange = sortedRanges[i];
      
      // Check if ranges overlap or are adjacent
      const currentEnd = currentRange.end;
      const nextStart = nextRange.start;
      
      // Ranges overlap if:
      // 1. Next range starts before current range ends
      // 2. Next range starts on the same line as current range ends
      const overlaps = 
        nextStart.line < currentEnd.line ||
        (nextStart.line === currentEnd.line && nextStart.character <= currentEnd.character);
      
      if (overlaps) {
        // Merge the ranges by extending current range to cover both
        const newEnd = currentEnd.line > nextRange.end.line ||
                      (currentEnd.line === nextRange.end.line && currentEnd.character >= nextRange.end.character)
                      ? currentEnd
                      : nextRange.end;
        
        currentRange = new vscode.Range(currentRange.start, newEnd);
      } else {
        // No overlap, add current range to results and move to next
        mergedRanges.push(currentRange);
        currentRange = nextRange;
      }
    }
    
    // Add the last range
    mergedRanges.push(currentRange);
    
    console.log(`Merged ${ranges.length} ranges into ${mergedRanges.length} non-overlapping ranges`);
    return mergedRanges;
  }

  /**
   * Highlights multiple code chunks in a single file
   * @param normalizedFilepath The normalized file path
   * @param codeChunks Array of code chunks in the same file
   */
  private async highlightCodeChunksInFile(normalizedFilepath: string, codeChunks: CodeChunk[]): Promise<void> {
    if (!codeChunks || codeChunks.length === 0) {
      return;
    }

    // Use the original file path from the first chunk for opening
    const originalFilepath = codeChunks[0].filePath;
    console.log(`Highlighting ${codeChunks.length} code chunks in file: ${originalFilepath}`);

    try {
      // First try to find an existing editor for the file
      let editor = vscode.window.visibleTextEditors.find(e => 
        this.normalizeFilePath(e.document.fileName) === normalizedFilepath ||
        this.normalizeFilePath(e.document.uri.fsPath) === normalizedFilepath
      );
      
      // If no editor is found, try to open the file
      if (!editor) {
        try {
          const uri = vscode.Uri.file(originalFilepath);
          const document = await vscode.workspace.openTextDocument(uri);
          editor = await vscode.window.showTextDocument(document);
        } catch (openError) {
          console.warn(`Failed to open file ${originalFilepath}:`, openError);
          return;
        }
      }
      
      if (!editor) {
        console.warn(`No editor available for file ${originalFilepath}`);
        return;
      }
      
      // Check if file is empty
      if (editor.document.lineCount === 0) {
        console.warn(`Cannot highlight in empty file ${originalFilepath}`);
        return;
      }

      // Clear any existing highlights for this file before applying new ones
      this.clearHighlightForFile(normalizedFilepath);

      // First, collect all valid ranges from the chunks
      const allValidRanges: vscode.Range[] = [];

      for (const chunk of codeChunks) {
        const [startLine, endLine] = chunk.range;
        
        // Convert from 1-based to 0-based line numbers if needed
        const adjustedStartLine = Math.max(0, startLine - 1);
        const adjustedEndLine = Math.max(0, endLine - 1);
        
        // Validate line numbers (now 0-based)
        if (adjustedStartLine < 0 || adjustedStartLine >= editor.document.lineCount ||
            adjustedEndLine < 0 || adjustedEndLine >= editor.document.lineCount ||
            adjustedStartLine > adjustedEndLine) {
            console.warn(`Invalid line range [${startLine}, ${endLine}] (0-based: [${adjustedStartLine}, ${adjustedEndLine}]) for file ${originalFilepath}. File has ${editor.document.lineCount} lines.`);
            continue;
        }
        
        const range = new vscode.Range(
            new vscode.Position(adjustedStartLine, 0),
            new vscode.Position(adjustedEndLine, editor.document.lineAt(adjustedEndLine).text.length)
        );

        allValidRanges.push(range);
      }

      if (allValidRanges.length === 0) {
        console.warn(`No valid ranges found for file ${originalFilepath}`);
        return;
      }

      // Merge overlapping ranges to avoid color overlay
      const mergedRanges = this.mergeOverlappingRanges(allValidRanges);

      // Create decorations for each merged range
      const decorations: vscode.TextEditorDecorationType[] = [];
      for (let i = 0; i < mergedRanges.length; i++) {
        const permanentDecorationType = vscode.window.createTextEditorDecorationType({
          backgroundColor: 'rgba(255, 255, 0, 0.15)', // 淡黄色背景，透明度15%
          border: '1px solid rgba(255, 255, 0, 0.3)', // 淡黄色边框，透明度30%
          borderRadius: '3px',
          overviewRulerColor: 'rgba(255, 255, 0, 0.5)',
          overviewRulerLane: vscode.OverviewRulerLane.Right,
          isWholeLine: false,
        });
        decorations.push(permanentDecorationType);
      }

      // Apply blinking effect for all merged ranges simultaneously
      await this.applyBlinkEffectForMultipleRanges(editor, mergedRanges, decorations, normalizedFilepath);
      
      // Reveal the first range in the editor
      if (mergedRanges.length > 0) {
        editor.revealRange(mergedRanges[0], vscode.TextEditorRevealType.InCenter);
      }
      
    } catch (error) {
      console.error('Error highlighting code chunks:', error);
      vscode.window.showErrorMessage(`Failed to highlight code: ${error}`);
    }
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
        
        // Apply blinking effect first (this will handle storing the decoration)
        await this.applyBlinkEffect(editor, range, blinkDecorationType, permanentDecorationType, normalizedFilepath);
        
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
    console.log(`Clearing highlights for file: ${filepath} (normalized: ${normalizedFilepath})`);
    
    // Clear any active timeouts - check both original and normalized paths
    const timeouts = this.blinkTimeouts.get(filepath) || this.blinkTimeouts.get(normalizedFilepath);
    if (timeouts) {
      console.log(`Clearing ${timeouts.length} timeouts for file: ${normalizedFilepath}`);
      timeouts.forEach(timeout => clearTimeout(timeout));
      this.blinkTimeouts.delete(filepath);
      this.blinkTimeouts.delete(normalizedFilepath);
    }
    
    // Clear decorations - check both original and normalized paths
    const decorations = this.activeDecorations.get(filepath) || this.activeDecorations.get(normalizedFilepath);
    if (decorations && decorations.length > 0) {
      console.log(`Found ${decorations.length} decorations to clear for file: ${normalizedFilepath}`);
      
      // Find the editor for this file and clear its decorations
      const editor = vscode.window.visibleTextEditors.find(e => 
        this.normalizeFilePath(e.document.fileName) === normalizedFilepath ||
        this.normalizeFilePath(e.document.uri.fsPath) === normalizedFilepath
      );
      
      if (editor) {
        console.log(`Clearing decorations from editor for file: ${normalizedFilepath}`);
        // Clear each decoration from the editor
        decorations.forEach(decoration => {
          editor.setDecorations(decoration, []);
          decoration.dispose();
        });
      } else {
        console.log(`No visible editor found for file: ${normalizedFilepath}`);
        // Still dispose of the decorations even if no editor is found
        decorations.forEach(decoration => decoration.dispose());
      }
      
      this.activeDecorations.delete(filepath);
      this.activeDecorations.delete(normalizedFilepath);
      console.log(`Decorations disposed and removed from map for file: ${normalizedFilepath}`);
    } else {
      console.log(`No decorations found for file: ${normalizedFilepath}`);
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
    for (const [filepath, decorations] of this.activeDecorations) {
      // Find the editor for this file and clear its decorations
      const normalizedFilepath = this.normalizeFilePath(filepath);
      const editor = vscode.window.visibleTextEditors.find(e => 
        this.normalizeFilePath(e.document.fileName) === normalizedFilepath ||
        this.normalizeFilePath(e.document.uri.fsPath) === normalizedFilepath
      );
      
      if (editor) {
        // Clear each decoration from the editor
        decorations.forEach(decoration => {
          editor.setDecorations(decoration, []);
        });
      }
      
      // Dispose of all decorations
      decorations.forEach(decoration => decoration.dispose());
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
   * @param normalizedFilepath The normalized file path for storage
   */
  private async applyBlinkEffect(
    editor: vscode.TextEditor,
    range: vscode.Range,
    blinkDecorationType: vscode.TextEditorDecorationType,
    permanentDecorationType: vscode.TextEditorDecorationType,
    normalizedFilepath?: string
  ): Promise<void> {
    const filepath = normalizedFilepath || this.normalizeFilePath(editor.document.uri.fsPath);
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
        // Check if highlights for this file have been cleared during blinking
        if (!this.blinkTimeouts.has(filepath)) {
          blinkDecorationType.dispose();
          permanentDecorationType.dispose();
          return;
        }
        editor.setDecorations(blinkDecorationType, [range]);
      }, i * blinkDuration * 2);
      timeouts.push(onTimeout);
      
      // Blink off
      const offTimeout = setTimeout(() => {
        // Check if highlights for this file have been cleared during blinking
        if (!this.blinkTimeouts.has(filepath)) {
          blinkDecorationType.dispose();
          permanentDecorationType.dispose();
          return;
        }
        editor.setDecorations(blinkDecorationType, []);
      }, i * blinkDuration * 2 + blinkDuration);
      timeouts.push(offTimeout);
    }
    
    // Apply permanent highlight after blinking
    const finalTimeout = setTimeout(() => {
      // Check if highlights for this file have been cleared during blinking
      if (!this.blinkTimeouts.has(filepath)) {
        blinkDecorationType.dispose();
        permanentDecorationType.dispose();
        return;
      }
      
      editor.setDecorations(permanentDecorationType, [range]);
      blinkDecorationType.dispose();
      
      // Store the permanent decoration for management (as array)
      const existingDecorations = this.activeDecorations.get(filepath) || [];
      existingDecorations.push(permanentDecorationType);
      this.activeDecorations.set(filepath, existingDecorations);
      
      // Clean up timeouts
      this.blinkTimeouts.delete(filepath);
    }, blinkCount * blinkDuration * 2);
    timeouts.push(finalTimeout);
    
    // Store timeouts for cleanup
    this.blinkTimeouts.set(filepath, timeouts);
  }

  /**
   * Applies a blinking effect for multiple ranges before setting permanent highlights
   * @param editor The text editor
   * @param ranges The ranges to highlight
   * @param permanentDecorationTypes The permanent decorations for each range
   * @param normalizedFilepath The normalized file path for storage
   */
  private async applyBlinkEffectForMultipleRanges(
    editor: vscode.TextEditor,
    ranges: vscode.Range[],
    permanentDecorationTypes: vscode.TextEditorDecorationType[],
    normalizedFilepath: string
  ): Promise<void> {
    if (ranges.length !== permanentDecorationTypes.length) {
      throw new Error('Ranges and decoration types arrays must have the same length');
    }

    const filepath = normalizedFilepath;
    const timeouts: NodeJS.Timeout[] = [];
    
    // Clear any existing timeouts for this file
    const existingTimeouts = this.blinkTimeouts.get(filepath);
    if (existingTimeouts) {
      existingTimeouts.forEach(timeout => clearTimeout(timeout));
    }

    // Create a single blink decoration type for all ranges
    const blinkDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(0, 120, 215, 0.2)', // 淡蓝色背景，透明度20%
      border: '1px solid rgba(0, 120, 215, 0.4)', // 淡蓝色边框，透明度40%
      borderRadius: '3px',
      isWholeLine: false,
    });
    
    // Blink 3 times (on-off-on-off-on-off)
    const blinkCount = 3;
    const blinkDuration = 200; // milliseconds
    
    for (let i = 0; i < blinkCount; i++) {
      // Blink on - apply blink decoration to all ranges
      const onTimeout = setTimeout(() => {
        // Check if highlights for this file have been cleared during blinking
        if (!this.blinkTimeouts.has(filepath)) {
          blinkDecorationType.dispose();
          permanentDecorationTypes.forEach(decoration => decoration.dispose());
          return;
        }
        editor.setDecorations(blinkDecorationType, ranges);
      }, i * blinkDuration * 2);
      timeouts.push(onTimeout);
      
      // Blink off - remove blink decoration from all ranges
      const offTimeout = setTimeout(() => {
        // Check if highlights for this file have been cleared during blinking
        if (!this.blinkTimeouts.has(filepath)) {
          blinkDecorationType.dispose();
          permanentDecorationTypes.forEach(decoration => decoration.dispose());
          return;
        }
        editor.setDecorations(blinkDecorationType, []);
      }, i * blinkDuration * 2 + blinkDuration);
      timeouts.push(offTimeout);
    }
    
    // Apply permanent highlights after blinking
    const finalTimeout = setTimeout(() => {
      // Check if highlights for this file have been cleared during blinking
      if (!this.blinkTimeouts.has(filepath)) {
        blinkDecorationType.dispose();
        permanentDecorationTypes.forEach(decoration => decoration.dispose());
        return;
      }
      
      // Apply each permanent decoration to its corresponding range
      for (let i = 0; i < ranges.length; i++) {
        editor.setDecorations(permanentDecorationTypes[i], [ranges[i]]);
      }
      
      blinkDecorationType.dispose();
      
      // Store all permanent decorations for management
      this.activeDecorations.set(filepath, [...permanentDecorationTypes]);
      
      // Clean up timeouts
      this.blinkTimeouts.delete(filepath);
    }, blinkCount * blinkDuration * 2);
    timeouts.push(finalTimeout);
    
    // Store timeouts for cleanup
    this.blinkTimeouts.set(filepath, timeouts);
  }
}

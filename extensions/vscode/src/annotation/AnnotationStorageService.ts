import * as crypto from "node:crypto";
import * as fs from "node:fs";

import * as vscode from "vscode";

/** 存储的注释数据模型 */
export interface StoredAnnotation {
  id: string;
  filePath: string;
  /** 选中代码的内容哈希，用于文本锚定重定位 */
  anchorHash: string;
  /** 选中代码原文（用于在文件中搜索重定位） */
  anchorText: string;
  startLine: number;
  endLine: number;
  annotationText: string;
  createdAt: number;
}

const STORAGE_KEY = "codeaware.annotations";

/**
 * 注释持久化存储服务。
 * 使用 workspaceState 存储注释，通过锚定文本在文件编辑后重定位行号。
 */
export class AnnotationStorageService {
  constructor(private context: vscode.ExtensionContext) {}

  /** 计算代码片段的内容哈希 */
  static hashCode(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  }

  /** 获取所有注释 */
  private getAll(): StoredAnnotation[] {
    return this.context.workspaceState.get<StoredAnnotation[]>(STORAGE_KEY, []);
  }

  /** 保存所有注释 */
  private async saveAll(annotations: StoredAnnotation[]): Promise<void> {
    await this.context.workspaceState.update(STORAGE_KEY, annotations);
  }

  /** 保存一条注释 */
  async save(annotation: StoredAnnotation): Promise<void> {
    const all = this.getAll();
    const idx = all.findIndex((a) => a.id === annotation.id);
    if (idx >= 0) {
      all[idx] = annotation;
    } else {
      all.push(annotation);
    }
    await this.saveAll(all);
  }

  /** 删除一条注释 */
  async delete(id: string): Promise<void> {
    const all = this.getAll().filter((a) => a.id !== id);
    await this.saveAll(all);
  }

  /** 获取指定文件的所有注释 */
  getByFile(filePath: string): StoredAnnotation[] {
    return this.getAll().filter((a) => a.filePath === filePath);
  }

  /**
   * 尝试通过锚定文本在文档中重新定位注释的行号。
   * 如果找到匹配文本，返回更新后的行范围；否则返回 null。
   */
  static relocateInDocument(
    document: vscode.TextDocument,
    annotation: StoredAnnotation,
  ): { startLine: number; endLine: number } | null {
    const docText = document.getText();
    const anchorText = annotation.anchorText;

    // 首先尝试精确匹配
    const idx = docText.indexOf(anchorText);
    if (idx >= 0) {
      const startPos = document.positionAt(idx);
      const endPos = document.positionAt(idx + anchorText.length);
      return { startLine: startPos.line, endLine: endPos.line };
    }

    // 精确匹配失败：尝试逐行匹配（忽略前后空白）
    const anchorLines = anchorText.split("\n").map((l) => l.trim());
    const docLines = docText.split("\n");

    for (let i = 0; i <= docLines.length - anchorLines.length; i++) {
      let match = true;
      for (let j = 0; j < anchorLines.length; j++) {
        if (docLines[i + j].trim() !== anchorLines[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return {
          startLine: i,
          endLine: i + anchorLines.length - 1,
        };
      }
    }

    return null;
  }

  /** 更新已保存注释的文字内容 */
  async updateText(id: string, newText: string): Promise<void> {
    const all = this.getAll();
    const annotation = all.find((a) => a.id === id);
    if (annotation) {
      annotation.annotationText = newText;
      await this.saveAll(all);
    }
  }

  /** 清理已不存在文件的注释 */
  async cleanupStaleAnnotations(): Promise<number> {
    const all = this.getAll();
    const valid = all.filter((a) => {
      try {
        return fs.existsSync(a.filePath);
      } catch {
        return false;
      }
    });
    const removed = all.length - valid.length;
    if (removed > 0) {
      await this.saveAll(valid);
    }
    return removed;
  }
}

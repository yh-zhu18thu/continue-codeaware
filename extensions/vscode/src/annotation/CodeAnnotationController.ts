import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

import {
  AnnotationStorageService,
  StoredAnnotation,
} from "./AnnotationStorageService";

// ====== Prompt 模板（集中定义，方便修改语言和风格） ======

/** 注释生成的系统提示词 */
const ANNOTATION_SYSTEM_PROMPT =
  "You are a code explanation assistant helping a non-programmer understand code. Assume the user has minimal coding background. Use plain, everyday language and life-like analogies when helpful. Respond in Chinese. Output only the explanation, do not output the code itself.";

/** 构建用户提示词 */
function buildUserPrompt(
  code: string,
  language: string,
  fileName: string,
  contextCode?: string,
): string {
  const contextSection = contextCode
    ? `\n以下是选中代码的上下文（帮助你理解语境，但不需要解释这部分）：\n\`\`\`${language}\n${contextCode}\n\`\`\`\n`
    : "";

  return `请用中文为以下代码添加解释，帮助一个没有编程基础的用户理解它。要求：
1. 先用一句大白话总结这段代码整体在做什么，让用户先有全局认识
2. 然后按逻辑段落逐段解释，把用户当作非程序员，用日常生活的类比和通俗语言
3. 引用代码中的关键词（如 \`variableName\`、\`functionName()\`）来说明它们的作用，让用户能对应到代码中的具体位置
4. 每段解释用 1-2 句短句，简洁实用，只解释最关键的行为
${contextSection}
需要解释的代码（文件：${fileName}）：
\`\`\`${language}
${code}
\`\`\``;
}

/** 深入提问的系统提示词 */
const FOLLOWUP_SYSTEM_PROMPT =
  "You are a code explanation assistant for non-programmers. The user has seen a basic explanation of some code and wants to understand a specific detail. Respond in Chinese with plain, everyday language. Keep it concise (2-3 sentences). Use analogies when helpful.";

/** 构建深入提问的用户提示词 */
function buildFollowUpPrompt(
  code: string,
  language: string,
  existingAnnotation: string,
  question: string,
): string {
  return `以下是一段 ${language} 代码及其已有注释：

代码：
\`\`\`${language}
${code}
\`\`\`

已有注释：
${existingAnnotation}

用户追问：${question}

请用中文简洁回答。`;
}

// ===========================================================

/** Comment 的作者信息 */
const ANNOTATION_AUTHOR: vscode.CommentAuthorInformation = {
  name: "CodeAware",
};

/**
 * 自定义 Comment 实现，支持编辑模式和持久化 ID 关联。
 */
class AnnotationComment implements vscode.Comment {
  body: string | vscode.MarkdownString;
  mode: vscode.CommentMode;
  author: vscode.CommentAuthorInformation;
  /** 关联的 StoredAnnotation ID */
  savedBody?: string;

  constructor(
    body: string,
    public readonly annotationId: string,
    mode: vscode.CommentMode = vscode.CommentMode.Preview,
  ) {
    this.body = new vscode.MarkdownString(body);
    this.mode = mode;
    this.author = ANNOTATION_AUTHOR;
    this.savedBody = body;
  }
}

/**
 * 代码注释控制器。
 * 使用 VS Code Comment Controller API 在编辑器中展示非侵入式注释。
 * 不修改文件内容，不影响 mapping 系统。
 */
export class CodeAnnotationController implements vscode.Disposable {
  private commentController: vscode.CommentController;
  private storage: AnnotationStorageService;
  private threads: Map<string, vscode.CommentThread> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private context: vscode.ExtensionContext,
    storage: AnnotationStorageService,
  ) {
    this.storage = storage;

    // 启动时清理已不存在文件的注释
    void this.storage.cleanupStaleAnnotations().then((removed) => {
      if (removed > 0) {
        console.log(`[CodeAware] Cleaned up ${removed} stale annotation(s)`);
      }
    });

    this.commentController = vscode.comments.createCommentController(
      "codeaware-annotations",
      "CodeAware 代码注释",
    );
    this.commentController.commentingRangeProvider = undefined; // 不提供「+」按钮，仅通过命令创建

    this.disposables.push(this.commentController);

    // 打开文件时恢复持久注释
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.uri.scheme === "file") {
          this.restoreAnnotationsForFile(doc);
        }
      }),
    );

    // 编辑器切换时恢复
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.uri.scheme === "file") {
          this.restoreAnnotationsForFile(editor.document);
        }
      }),
    );

    // 恢复当前已打开文件的注释
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.scheme === "file") {
        this.restoreAnnotationsForFile(editor.document);
      }
    }
  }

  /**
   * 为选中代码创建注释（由命令调用）。
   * @param annotationText LLM 生成的注释文字
   * @param editor 当前编辑器
   * @param range 选中范围
   * @param selectedCode 选中代码原文
   * @param persist 是否立即持久化（默认 true）
   */
  async createAnnotation(
    annotationText: string,
    editor: vscode.TextEditor,
    range: vscode.Range,
    selectedCode: string,
    persist: boolean = true,
  ): Promise<string> {
    const id = uuidv4();
    const thread = this.commentController.createCommentThread(
      editor.document.uri,
      range,
      [new AnnotationComment(annotationText, id)],
    );
    thread.canReply = false;
    thread.label = "CodeAware 注释";
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

    this.threads.set(id, thread);

    if (persist) {
      const annotation: StoredAnnotation = {
        id,
        filePath: editor.document.uri.fsPath,
        anchorHash: AnnotationStorageService.hashCode(selectedCode),
        anchorText: selectedCode,
        startLine: range.start.line,
        endLine: range.end.line,
        annotationText,
        createdAt: Date.now(),
      };
      await this.storage.save(annotation);
    }

    return id;
  }

  /** 删除（关闭）注释 */
  async deleteAnnotation(thread: vscode.CommentThread): Promise<void> {
    const comment = thread.comments[0] as AnnotationComment | undefined;
    if (comment?.annotationId) {
      await this.storage.delete(comment.annotationId);
      this.threads.delete(comment.annotationId);
    }
    thread.dispose();
  }

  /** 深入提问：用户对已有注释追问，LLM 回答后追加为新 comment */
  async askFollowUp(
    thread: vscode.CommentThread,
    question: string,
    answerFn: (
      code: string,
      language: string,
      existingAnnotation: string,
      question: string,
    ) => Promise<string>,
  ): Promise<void> {
    const document = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === thread.uri.toString(),
    );
    if (!document) {
      return;
    }

    const code = document.getText(thread.range);
    const language = document.languageId;

    // 获取已有注释内容
    const firstComment = thread.comments[0] as AnnotationComment;
    const existingAnnotation =
      typeof firstComment.body === "string"
        ? firstComment.body
        : firstComment.body.value;

    // 追加用户提问
    const userComment = new AnnotationComment(
      question,
      firstComment.annotationId,
    );
    userComment.author = { name: "You" };

    // 追加加载状态
    const loadingComment = new AnnotationComment(
      "⏳ 正在思考...",
      firstComment.annotationId,
    );
    thread.comments = [...thread.comments, userComment, loadingComment];

    try {
      const answer = await answerFn(
        code,
        language,
        existingAnnotation,
        question,
      );
      const answerComment = new AnnotationComment(
        answer,
        firstComment.annotationId,
      );
      // 替换 loading comment 为实际回答
      const comments = [...thread.comments];
      comments[comments.length - 1] = answerComment;
      thread.comments = comments;
    } catch {
      // 移除 loading comment
      const comments = [...thread.comments];
      comments.pop();
      thread.comments = comments;
      void vscode.window.showErrorMessage("提问失败");
    }
  }

  /** 获取深入提问的 system prompt */
  static getFollowUpSystemPrompt(): string {
    return FOLLOWUP_SYSTEM_PROMPT;
  }

  /** 构建深入提问的 user prompt */
  static buildFollowUpPrompt(
    code: string,
    language: string,
    existingAnnotation: string,
    question: string,
  ): string {
    return buildFollowUpPrompt(code, language, existingAnnotation, question);
  }

  /** 保存用户编辑后的注释文字 */
  async saveEdit(thread: vscode.CommentThread): Promise<void> {
    const comment = thread.comments[0] as AnnotationComment;
    if (!comment) {
      return;
    }

    const bodyText =
      typeof comment.body === "string" ? comment.body : comment.body.value;

    comment.savedBody = bodyText;
    comment.mode = vscode.CommentMode.Preview;
    // 重新包装为 MarkdownString 以正确渲染
    comment.body = new vscode.MarkdownString(bodyText);
    thread.comments = [comment];

    await this.storage.updateText(comment.annotationId, bodyText);
  }

  /** 取消编辑，恢复原文 */
  cancelEdit(thread: vscode.CommentThread): void {
    const comment = thread.comments[0] as AnnotationComment;
    if (!comment || !comment.savedBody) {
      return;
    }
    comment.body = new vscode.MarkdownString(comment.savedBody);
    comment.mode = vscode.CommentMode.Preview;
    thread.comments = [comment];
  }

  /** 进入编辑模式 */
  editAnnotation(thread: vscode.CommentThread): void {
    const comment = thread.comments[0] as AnnotationComment;
    if (!comment) {
      return;
    }

    const bodyText =
      typeof comment.body === "string" ? comment.body : comment.body.value;

    comment.savedBody = bodyText;
    comment.body = bodyText; // 编辑模式需要纯文本
    comment.mode = vscode.CommentMode.Editing;
    thread.comments = [comment];
  }

  /** 恢复指定文件的持久注释 */
  private restoreAnnotationsForFile(document: vscode.TextDocument): void {
    const filePath = document.uri.fsPath;
    const saved = this.storage.getByFile(filePath);

    for (const annotation of saved) {
      // 跳过已经显示的注释
      if (this.threads.has(annotation.id)) {
        continue;
      }

      // 尝试重定位
      const relocated = AnnotationStorageService.relocateInDocument(
        document,
        annotation,
      );

      if (relocated) {
        const range = new vscode.Range(
          relocated.startLine,
          0,
          relocated.endLine,
          document.lineAt(relocated.endLine).text.length,
        );
        const thread = this.commentController.createCommentThread(
          document.uri,
          range,
          [new AnnotationComment(annotation.annotationText, annotation.id)],
        );
        thread.canReply = false;
        thread.label = "CodeAware 注释";
        thread.collapsibleState =
          vscode.CommentThreadCollapsibleState.Collapsed;

        this.threads.set(annotation.id, thread);

        // 如果行号变了，更新存储
        if (
          relocated.startLine !== annotation.startLine ||
          relocated.endLine !== annotation.endLine
        ) {
          annotation.startLine = relocated.startLine;
          annotation.endLine = relocated.endLine;
          void this.storage.save(annotation);
        }
      }
      // 如果无法定位，静默跳过（注释对应的代码可能已被删除）
    }
  }

  /** 获取注释生成的 system prompt */
  static getSystemPrompt(): string {
    return ANNOTATION_SYSTEM_PROMPT;
  }

  /** 构建用户 prompt */
  static buildUserPrompt(
    code: string,
    language: string,
    fileName: string,
    contextCode?: string,
  ): string {
    return buildUserPrompt(code, language, fileName, contextCode);
  }

  dispose(): void {
    for (const thread of this.threads.values()) {
      thread.dispose();
    }
    this.threads.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

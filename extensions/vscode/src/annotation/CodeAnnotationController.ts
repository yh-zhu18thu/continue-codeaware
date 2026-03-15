import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

import {
  AnnotationStorageService,
  StoredAnnotation,
} from "./AnnotationStorageService";

// ====== Prompt 模板（集中定义，方便修改语言和风格） ======

/** 注释生成的系统提示词 */
const ANNOTATION_SYSTEM_PROMPT =
  "你是一个代码注释助手。你需要用中文为代码添加逐段注释，帮助用户理解每一部分代码的含义。直接引用代码中的关键符号（如变量名、函数名、类名等）来讲解，语气自然流畅，像在给同事讲解代码一样。只输出注释内容，不要输出代码本身。";

/** 构建用户提示词 */
function buildUserPrompt(
  code: string,
  language: string,
  fileName: string,
): string {
  return `请用中文为以下 ${language} 代码添加注释。要求：
1. 按代码的逻辑段落来讲解，每段用一两句话说明
2. 直接引用代码中的关键词（如 \`variableName\`、\`functionName()\`）来说明它们的作用，不要用"第几行"这种方式
3. 如果有类型定义、接口、条件分支等，说清楚它们的含义和用途
4. 最后简要总结这段代码整体在做什么

文件：${fileName}

\`\`\`${language}
${code}
\`\`\``;
}

/** 深入提问的系统提示词 */
const FOLLOWUP_SYSTEM_PROMPT =
  "你是一个代码解释助手。用户已经看到了一段代码的基础注释，现在想深入了解某些细节。请用中文简洁回答用户的追问，结合代码上下文给出具体解释。";

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
  ): string {
    return buildUserPrompt(code, language, fileName);
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

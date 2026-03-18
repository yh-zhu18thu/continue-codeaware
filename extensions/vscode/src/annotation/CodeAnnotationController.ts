import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

import {
  AnnotationStorageService,
  StoredAnnotation,
} from "./AnnotationStorageService";

// ====== Prompt 模板（集中定义，方便修改语言和风格） ======

/** 注释生成的系统提示词 */
const ANNOTATION_SYSTEM_PROMPT =
  "You are a code explanation assistant helping a non-programmer understand code. Assume the user has minimal coding background. Use plain, everyday language and life-like analogies when helpful. When explaining, always reference specific code symbols (like `variableName`, `functionName()`) so the user can map your explanation to the actual code. Naturally mention the underlying concepts or knowledge points involved (e.g., '这里用到了循环的概念' or '这涉及到条件判断的思想') so the user knows what to explore further. Respond in Chinese. Output only the explanation, do not output the code itself.";

/** 构建用户提示词 */
function buildUserPrompt(
  code: string,
  language: string,
  fileName: string,
  contextCode?: string,
  knowledgeContext?: Array<{
    title: string;
    content: string;
    masteryScore: number;
  }>,
): string {
  const contextSection = contextCode
    ? `\n以下是选中代码的上下文（帮助你理解语境，但不需要解释这部分）：\n\`\`\`${language}\n${contextCode}\n\`\`\`\n`
    : "";

  let knowledgeSection = "";
  if (knowledgeContext && knowledgeContext.length > 0) {
    const knowledgeItems = knowledgeContext
      .map((kp) => {
        const masteryLabel =
          kp.masteryScore < 0.3
            ? "❗用户不熟悉"
            : kp.masteryScore < 0.6
              ? "❓用户略知"
              : "✅用户已掌握";
        return `- **${kp.title}** (${masteryLabel}): ${kp.content}`;
      })
      .join("\n");
    knowledgeSection = `\n
## 用户背景知识掌握情况

以下是与这段代码相关的背景知识点及用户当前的掌握程度：
${knowledgeItems}

请根据用户的掌握情况调整解释策略：
- 对于用户不熟悉的知识点，请着重解释相关的代码符号和语法，用类比和通俗语言让用户理解
- 对于用户已掌握的知识点，可以简要提及或跳过
`;
  }

  return `请用中文为以下代码添加解释，帮助一个没有编程基础的用户理解它。要求：
1. 先用一句大白话总结这段代码整体在做什么，让用户先有全局认识
2. 然后按逻辑段落逐段解释**工作原理**，每段必须引用代码中的关键符号（如 \`variableName\`、\`functionName()\`）来说明它们具体做了什么，让用户能对应到代码中
3. 每段解释用 1-2 句短句，简洁实用，重点讲清楚"这段代码是怎么工作的"而不仅仅是"这段代码要做什么"
4. 在解释中自然地提及涉及到的编程概念或知识点（如"这里用到了**循环**的思想"、"这涉及**条件判断**"），方便用户知道可以进一步了解什么
5. 把用户当作非程序员，用日常生活的类比和通俗语言
${contextSection}${knowledgeSection}
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

  constructor(
    body: string,
    public readonly annotationId: string,
    mode: vscode.CommentMode = vscode.CommentMode.Preview,
  ) {
    this.body = new vscode.MarkdownString(body);
    this.mode = mode;
    this.author = ANNOTATION_AUTHOR;
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

  /** 从 CommentThread 中提取注释信息（用于 pin 等操作） */
  getAnnotationInfo(thread: vscode.CommentThread): {
    annotationId: string;
    filePath: string;
    lineRange: [number, number];
    title: string;
  } | null {
    const comment = thread.comments[0] as AnnotationComment | undefined;
    if (!comment?.annotationId) {
      return null;
    }
    const bodyText =
      typeof comment.body === "string" ? comment.body : comment.body.value;
    // 取注释正文前 30 个字符作为标题
    const title = bodyText.length > 30 ? bodyText.slice(0, 30) + "…" : bodyText;
    return {
      annotationId: comment.annotationId,
      filePath: thread.uri.fsPath,
      lineRange: [thread.range.start.line + 1, thread.range.end.line + 1],
      title,
    };
  }

  /** 展开指定注释的 CommentThread（用于 pin 导航） */
  revealAnnotation(annotationId: string): void {
    const thread = this.threads.get(annotationId);
    if (thread) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    }
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
    knowledgeContext?: Array<{
      title: string;
      content: string;
      masteryScore: number;
    }>,
  ): string {
    return buildUserPrompt(
      code,
      language,
      fileName,
      contextCode,
      knowledgeContext,
    );
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

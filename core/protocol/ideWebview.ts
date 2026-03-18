import { ToIdeFromWebviewOrCoreProtocol } from "./ide";
import { ToWebviewFromIdeOrCoreProtocol } from "./webview";

import {
  AcceptOrRejectDiffPayload,
  AddToChatPayload,
  ApplyState,
  ApplyToFilePayload,
  CodeChunk,
  ContextItemWithId,
  HighlightedCodePayload,
  MessageContent,
  RangeInFile,
  RangeInFileWithContents,
  SetCodeToEditPayload,
  ShowFilePayload,
} from "../";

export type ToIdeFromWebviewProtocol = ToIdeFromWebviewOrCoreProtocol & {
  openUrl: [string, void];
  applyToFile: [ApplyToFilePayload, void];
  overwriteFile: [{ filepath: string; prevFileContent: string | null }, void];
  showTutorial: [undefined, void];
  showFile: [ShowFilePayload, void];
  toggleDevTools: [undefined, void];
  reloadWindow: [undefined, void];
  focusEditor: [undefined, void];
  toggleFullScreen: [{ newWindow?: boolean } | undefined, void];
  insertAtCursor: [{ text: string }, void];
  copyText: [{ text: string }, void];
  "jetbrains/isOSREnabled": [undefined, boolean];
  "jetbrains/onLoad": [
    undefined,
    {
      windowId: string;
      serverUrl: string;
      workspacePaths: string[];
      vscMachineId: string;
      vscMediaUrl: string;
    },
  ];
  "jetbrains/getColors": [undefined, Record<string, string | null | undefined>];
  "vscode/openMoveRightMarkdown": [undefined, void];
  acceptDiff: [AcceptOrRejectDiffPayload, void];
  rejectDiff: [AcceptOrRejectDiffPayload, void];
  "edit/sendPrompt": [
    {
      prompt: MessageContent;
      range: RangeInFileWithContents;
    },
    string | undefined,
  ];
  "edit/addCurrentSelection": [undefined, void];
  "edit/clearDecorations": [undefined, void];
  "session/share": [{ sessionId: string }, void];
  createBackgroundAgent: [
    {
      content: MessageContent;
      contextItems: ContextItemWithId[];
      selectedCode: RangeInFile[];
      organizationId?: string;
      agent?: string;
    },
    void,
  ];
  listBackgroundAgents: [
    { organizationId?: string; limit?: number },
    {
      agents: Array<{
        id: string;
        name: string | null;
        status: string;
        repoUrl: string;
        createdAt: string;
        metadata?: {
          github_repo?: string;
        };
      }>;
      totalCount: number;
    },
  ];
  openAgentLocally: [
    {
      agentSessionId: string;
    },
    void,
  ];
  "edit/exit": [{ shouldFocusEditor: boolean }, void];
  //CodeAware: 代码高亮相关
  highlightCodeChunk: [CodeChunk, void];
  clearCodeHighlight: [undefined, void];
  //CodeAware: 向ide同步当前的任务描述和当前/下一步骤等
  syncCodeAwareRequirement: [{ userRequirement: string }, void];
  syncCodeAwareSteps: [
    { currentStep: string; nextStep: string; stepFinished?: boolean },
    void,
  ];
  //CodeAware: 获取完整的CodeAware上下文
  getCodeAwareContext: [
    undefined,
    {
      userRequirement: string;
      currentStep: string;
      nextStep: string;
      stepFinished: boolean;
    },
  ];
  //CodeAware: 设置代码编辑模式
  setCodeEditMode: [{ enabled: boolean }, void];
  //CodeAware: 日志记录相关
  startCodeAwareLogSession: [
    { username: string; sessionName: string; codeAwareSessionId: string },
    void,
  ];
  addCodeAwareLogEntry: [{ eventType: string; payload: any }, void];
  endCodeAwareLogSession: [undefined, void];
  // CodeAware: 跳转并展开代码注释
  revealCodeAnnotation: [
    {
      annotationId: string;
      filePath: string;
      lineRange: [number, number];
    },
    void,
  ];
};

export type ToWebviewFromIdeProtocol = ToWebviewFromIdeOrCoreProtocol & {
  setInactive: [undefined, void];
  newSessionWithPrompt: [{ prompt: string }, void];
  userInput: [{ input: string }, void];
  focusContinueInput: [undefined, void];
  focusContinueInputWithoutClear: [undefined, void];
  focusContinueInputWithNewSession: [undefined, void];
  highlightedCode: [HighlightedCodePayload, void];
  setCodeToEdit: [SetCodeToEditPayload, void];
  navigateTo: [{ path: string; toggle?: boolean }, void];
  addModel: [undefined, void];

  focusContinueSessionId: [{ sessionId: string | undefined }, void];
  newSession: [undefined, void];
  loadAgentSession: [{ session: any }, void];
  setTheme: [{ theme: any }, void];
  setColors: [{ [key: string]: string }, void];
  "jetbrains/editorInsetRefresh": [undefined, void];
  "jetbrains/isOSREnabled": [boolean, void];
  setupApiKey: [undefined, void];
  setupLocalConfig: [undefined, void];
  incrementFtc: [undefined, void];
  openOnboardingCard: [undefined, void];
  applyCodeFromChat: [undefined, void];
  updateApplyState: [ApplyState, void];
  exitEditMode: [undefined, void];
  focusEdit: [undefined, void];
  generateRule: [undefined, void];
  addToChat: [AddToChatPayload, void];
  focusEditWithoutClear: [undefined, void];
  // CodeAware: 代码选择事件
  codeSelectionChanged: [
    {
      filePath: string;
      selectedLines: [number, number];
      selectedContent: string;
    },
    void,
  ];
  // CodeAware: 代码选择取消事件
  codeSelectionCleared: [
    {
      filePath: string;
    },
    void,
  ];
  // CodeAware: 代码注释查看事件
  codeExplanationEvent: [
    {
      filePath: string;
      selectedLines: [number, number];
      language: string;
      action: "view" | "followup" | "edit" | "delete";
      question?: string;
    },
    void,
  ];
  // CodeAware: 代码补全事件
  codeCompletionGenerated: [
    {
      prefixCode: string;
      completionText: string;
      range: [number, number];
      filePath: string;
    },
    void,
  ];
  // CodeAware: 代码补全取消事件
  codeCompletionRejected: [undefined, void];
  // CodeAware: 代码补全确认事件
  codeCompletionAccepted: [
    {
      completionId?: string;
      outcome?: any;
    },
    void,
  ];
  // CodeAware: 代码注释 pin 切换事件
  codeAnnotationPinToggle: [
    {
      annotationId: string;
      filePath: string;
      lineRange: [number, number];
      title: string;
    },
    void,
  ];
  // CodeAware: 代码编辑模式状态变化事件
  didChangeCodeEditMode: [
    {
      enabled: boolean;
    },
    void,
  ];
  // CodeAware: sidebar 位置变化事件
  setSidebarPosition: [{ position: "left" | "right" }, void];
};

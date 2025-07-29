import { ToIdeFromWebviewOrCoreProtocol } from "./ide";
import { ToWebviewFromIdeOrCoreProtocol } from "./webview";

import type {
    ApplyState,
    CodeChunk,
    CodeToEdit,
    EditStatus,
    MessageContent,
    RangeInFileWithContents
} from "../";

export type ToIdeFromWebviewProtocol = ToIdeFromWebviewOrCoreProtocol & {
  openUrl: [string, void];
  // We pass the `curSelectedModel` because we currently cannot access the
  // default model title in the GUI from JB
  applyToFile: [
    {
      text: string;
      streamId: string;
      curSelectedModelTitle: string;
      filepath?: string;
    },
    void,
  ];
  overwriteFile: [{ filepath: string; prevFileContent: string | null }, void];
  showTutorial: [undefined, void];
  showFile: [{ filepath: string }, void];
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
  "jetbrains/getColors": [undefined, Record<string, string>];
  "vscode/openMoveRightMarkdown": [undefined, void];
  setGitHubAuthToken: [{ token: string }, void];
  acceptDiff: [{ filepath: string; streamId?: string }, void];
  rejectDiff: [{ filepath: string; streamId?: string }, void];
  "edit/sendPrompt": [
    {
      prompt: MessageContent;
      range: RangeInFileWithContents;
      selectedModelTitle: string;
    },
    void,
  ];
  "edit/exit": [{ shouldFocusEditor: boolean }, void];
  //CodeAware: 代码高亮相关
  highlightCodeChunk: [CodeChunk, void];
  clearCodeHighlight: [undefined, void];
  //CodeAware: 向ide同步当前的任务描述和当前/下一步骤等
  syncCodeAwareRequirement: [{ userRequirement: string }, void];
  syncCodeAwareSteps: [{ currentStep: string; nextStep: string; stepFinished?: boolean }, void];
  //CodeAware: 获取完整的CodeAware上下文
  getCodeAwareContext: [undefined, { userRequirement: string; currentStep: string; nextStep: string; stepFinished: boolean }];
  //CodeAware: 设置代码编辑模式
  setCodeEditMode: [{ enabled: boolean }, void];
};

export type ToWebviewFromIdeProtocol = ToWebviewFromIdeOrCoreProtocol & {
  setInactive: [undefined, void];
  submitMessage: [{ message: any }, void]; // any -> JSONContent from TipTap
  newSessionWithPrompt: [{ prompt: string }, void];
  userInput: [{ input: string }, void];
  focusContinueInput: [undefined, void];
  focusContinueInputWithoutClear: [undefined, void];
  focusContinueInputWithNewSession: [undefined, void];
  highlightedCode: [
    {
      rangeInFileWithContents: RangeInFileWithContents;
      prompt?: string;
      shouldRun?: boolean;
    },
    void,
  ];
  addCodeToEdit: [CodeToEdit, void];
  navigateTo: [{ path: string; toggle?: boolean }, void];
  addModel: [undefined, void];

  focusContinueSessionId: [{ sessionId: string | undefined }, void];
  newSession: [undefined, void];
  setTheme: [{ theme: any }, void];
  setColors: [{ [key: string]: string }, void];
  "jetbrains/editorInsetRefresh": [undefined, void];
  "jetbrains/isOSREnabled": [boolean, void];
  addApiKey: [undefined, void];
  setupLocalConfig: [undefined, void];
  incrementFtc: [undefined, void];
  openOnboardingCard: [undefined, void];
  applyCodeFromChat: [undefined, void];
  updateApplyState: [ApplyState, void];
  setEditStatus: [{ status: EditStatus; fileAfterEdit?: string }, void];
  exitEditMode: [undefined, void];
  focusEdit: [undefined, void];
  focusEditWithoutClear: [undefined, void];
  // CodeAware: 代码选择事件
  codeSelectionChanged: [{
    filePath: string;
    selectedLines: [number, number];
    selectedContent: string;
  }, void];
  // CodeAware: 代码选择取消事件
  codeSelectionCleared: [{
    filePath: string;
  }, void];
  // CodeAware: 代码补全事件
  codeCompletionGenerated: [{
    prefixCode: string;
    completionText: string;
    range: [number, number];
    filePath: string;
  }, void];
  // CodeAware: 代码补全取消事件
  codeCompletionRejected: [undefined, void];
  // CodeAware: 代码补全确认事件
  codeCompletionAccepted: [{
    completionId?: string;
    outcome?: any;
  }, void];
  // CodeAware: 代码编辑模式状态变化事件
  didChangeCodeEditMode: [{
    enabled: boolean;
  }, void];
};

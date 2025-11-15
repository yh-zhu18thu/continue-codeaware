import { ConfigResult } from "@continuedev/config-yaml";
import { SerializedOrgWithProfiles } from "../config/ProfileLifecycleManager.js";
import { ControlPlaneSessionInfo } from "../control-plane/AuthTypes.js";
import type {
  BrowserSerializedContinueConfig,
  ContextItemWithId,
  ContextProviderName,
  IndexingProgressUpdate,
  IndexingStatus,
  PackageDocsResult,
} from "../index.js";

export type ToWebviewFromIdeOrCoreProtocol = {
  configUpdate: [
    {
      result: ConfigResult<BrowserSerializedContinueConfig>;
      profileId: string | null;
      organizations: SerializedOrgWithProfiles[];
      selectedOrgId: string | null;
    },
    void,
  ];
  getDefaultModelTitle: [undefined, string | undefined];
  indexProgress: [IndexingProgressUpdate, void]; // Codebase
  "indexing/statusUpdate": [IndexingStatus, void]; // Docs, etc.
  refreshSubmenuItems: [
    {
      providers: "all" | "dependsOnIndexing" | ContextProviderName[];
    },
    void,
  ];
  didCloseFiles: [{ uris: string[] }, void];
  isContinueInputFocused: [undefined, boolean];
  addContextItem: [
    {
      historyIndex: number;
      item: ContextItemWithId;
    },
    void,
  ];
  setTTSActive: [boolean, void];
  getWebviewHistoryLength: [undefined, number];
  getCurrentSessionId: [undefined, string];
  "jetbrains/setColors": [Record<string, string | null | undefined>, void];
  sessionUpdate: [{ sessionInfo: ControlPlaneSessionInfo | undefined }, void];
  toolCallPartialOutput: [{ toolCallId: string; contextItems: any[] }, void];
  freeTrialExceeded: [undefined, void];
  "docs/suggestions": [PackageDocsResult[], void];
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
  // CodeAware: 处理从代码选择发起的提问
  codeAwareQuestionFromSelection: [
    {
      selectedCode: string;
      selectedText: string;
      question: string;
      filePath: string;
      selectedLines: [number, number];
      contextInfo: {
        fileName: string;
        language: string;
      };
    },
    void,
  ];
};

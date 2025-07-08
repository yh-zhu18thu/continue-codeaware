import { useCallback, useContext, useEffect, useRef } from "react";
import { VSC_THEME_COLOR_VARS } from "../components";
import { IdeMessengerContext } from "../context/IdeMessenger";

import { ConfigResult } from "@continuedev/config-yaml";
import { BrowserSerializedContinueConfig } from "core";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { selectCodeAwareContext, selectCodeChunks, updateHighlight } from "../redux/slices/codeAwareSlice";
import { setConfigError, setConfigResult } from "../redux/slices/configSlice";
import { updateIndexingStatus } from "../redux/slices/indexingSlice";
import { updateDocsSuggestions } from "../redux/slices/miscSlice";
import {
  addContextItemsAtIndex,
  setInactive,
} from "../redux/slices/sessionSlice";
import { setTTSActive } from "../redux/slices/uiSlice";
import { analyzeCompletionAndUpdateStep } from "../redux/thunks/codeAwareGeneration";
import { selectProfileThunk } from "../redux/thunks/profileAndOrg";
import { refreshSessionMetadata } from "../redux/thunks/session";
import { streamResponseThunk } from "../redux/thunks/streamResponse";
import { updateFileSymbolsFromHistory } from "../redux/thunks/updateFileSymbols";
import { isJetBrains } from "../util";
import { setLocalStorage } from "../util/localStorage";
import { useWebviewListener } from "./useWebviewListener";

function useSetup() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const history = useAppSelector((store) => store.session.history);
  const defaultModelTitle = useAppSelector(
    (store) => store.config.defaultModelTitle,
  );
  
  // 使用 selector 获取 CodeAware 相关数据
  const codeChunks = useAppSelector(selectCodeChunks);
  const codeAwareContext = useAppSelector(selectCodeAwareContext);

  const hasLoadedConfig = useRef(false);

  const handleConfigUpdate = useCallback(
    async (
      initial: boolean,
      result: {
        result: ConfigResult<BrowserSerializedContinueConfig>;
        profileId: string | null;
      },
    ) => {
      const { result: configResult, profileId } = result;
      if (initial && hasLoadedConfig.current) {
        return;
      }
      hasLoadedConfig.current = true;
      dispatch(setConfigResult(configResult));
      dispatch(selectProfileThunk(profileId));

      // Perform any actions needed with the config
      if (configResult.config?.ui?.fontSize) {
        setLocalStorage("fontSize", configResult.config.ui.fontSize);
        document.body.style.fontSize = `${configResult.config.ui.fontSize}px`;
      }
    },
    [dispatch, hasLoadedConfig],
  );

  const loadConfig = useCallback(
    async (initial: boolean) => {
      const result = await ideMessenger.request(
        "config/getSerializedProfileInfo",
        undefined,
      );
      if (result.status === "error") {
        return;
      }
      await handleConfigUpdate(initial, result.content);
    },
    [ideMessenger, handleConfigUpdate],
  );

  // Load config from the IDE
  useEffect(() => {
    loadConfig(true);
    const interval = setInterval(() => {
      if (hasLoadedConfig.current) {
        // Init to run on initial config load
        ideMessenger.post("docs/getSuggestedDocs", undefined);
        ideMessenger.post("docs/initStatuses", undefined);
        dispatch(updateFileSymbolsFromHistory());
        dispatch(refreshSessionMetadata({}));

        // This triggers sending pending status to the GUI for relevant docs indexes
        clearInterval(interval);
        return;
      }
      loadConfig(true);
    }, 2_000);

    return () => clearInterval(interval);
  }, [hasLoadedConfig, loadConfig, ideMessenger]);

  useWebviewListener(
    "configUpdate",
    async (update) => {
      if (!update) {
        return;
      }
      await handleConfigUpdate(false, update);
    },
    [loadConfig],
  );

  // Load symbols for chat on any session change
  const sessionId = useAppSelector((state) => state.session.id);
  useEffect(() => {
    if (sessionId) {
      dispatch(updateFileSymbolsFromHistory());
    }
  }, [sessionId]);

  // ON LOAD
  useEffect(() => {
    // Override persisted state
    dispatch(setInactive());

    const jetbrains = isJetBrains();
    for (const colorVar of VSC_THEME_COLOR_VARS) {
      if (jetbrains) {
        const cached = localStorage.getItem(colorVar);
        if (cached) {
          document.body.style.setProperty(colorVar, cached);
        }
      }

      // Remove alpha channel from colors
      const value = getComputedStyle(document.documentElement).getPropertyValue(
        colorVar,
      );
      if (colorVar.startsWith("#") && value.length > 7) {
        document.body.style.setProperty(colorVar, value.slice(0, 7));
      }
    }

    if (jetbrains) {
      // Save theme colors to local storage for immediate loading in JetBrains
      ideMessenger.request("jetbrains/getColors", undefined).then((result) => {
        if (result.status === "success") {
          Object.entries(result.content).forEach(([key, value]) => {
            document.body.style.setProperty(key, value);
            document.documentElement.style.setProperty(key, value);
          });
        }
      });

      // Tell JetBrains the webview is ready
      ideMessenger.request("jetbrains/onLoad", undefined).then((result) => {
        if (result.status === "error") {
          return;
        }

        const msg = result.content;
        (window as any).windowId = msg.windowId;
        (window as any).serverUrl = msg.serverUrl;
        (window as any).workspacePaths = msg.workspacePaths;
        (window as any).vscMachineId = msg.vscMachineId;
        (window as any).vscMediaUrl = msg.vscMediaUrl;
      });

      for (const colorVar of VSC_THEME_COLOR_VARS) {
        if (document.body.style.getPropertyValue(colorVar)) {
          localStorage.setItem(
            colorVar,
            document.body.style.getPropertyValue(colorVar),
          );
        }
      }
    }
  }, []);

  useWebviewListener(
    "jetbrains/setColors",
    async (data) => {
      Object.entries(data).forEach(([key, value]) => {
        document.body.style.setProperty(key, value);
        document.documentElement.style.setProperty(key, value);
      });
    },
    [],
  );

  useWebviewListener("docs/suggestions", async (data) => {
    dispatch(updateDocsSuggestions(data));
  });

  // IDE event listeners
  useWebviewListener(
    "getWebviewHistoryLength",
    async () => {
      return history.length;
    },
    [history],
  );

  useWebviewListener(
    "getCurrentSessionId",
    async () => {
      return sessionId;
    },
    [sessionId],
  );

  useWebviewListener("setInactive", async () => {
    dispatch(setInactive());
  });

  useWebviewListener("setTTSActive", async (status) => {
    dispatch(setTTSActive(status));
  });

  useWebviewListener("configError", async (error) => {
    dispatch(setConfigError(error));
  });

  // TODO - remove?
  useWebviewListener("submitMessage", async (data) => {
    dispatch(
      streamResponseThunk({
        editorState: data.message,
        modifiers: { useCodebase: false, noContext: true },
      }),
    );
  });

  useWebviewListener("addContextItem", async (data) => {
    dispatch(
      addContextItemsAtIndex({
        index: data.historyIndex,
        contextItems: [data.item],
      }),
    );
  });

  useWebviewListener("indexing/statusUpdate", async (data) => {
    dispatch(updateIndexingStatus(data));
  });

  useWebviewListener(
    "getDefaultModelTitle",
    async () => {
      return defaultModelTitle;
    },
    [defaultModelTitle],
  );

  // CodeAware: 监听代码补全生成事件
  useWebviewListener("codeCompletionGenerated", async (data) => {
    const { prefixCode, completionText, range, filePath } = data;
    
    console.log("CodeAware: Code completion generated:", {
      prefixLength: prefixCode.length,
      completionLength: completionText.length,
      range,
      filePath
    });

    // 分发thunk来处理代码补全分析
    dispatch(analyzeCompletionAndUpdateStep({
      prefixCode,
      completionText,
      range,
      filePath
    }));
  });

  // CodeAware: 监听光标位置变化事件
  useWebviewListener("cursorPositionChanged", async (data) => {
    const { filePath, lineNumber, contextLines, startLine, endLine } = data;

    // 检查当前聚焦的代码位置是否属于某个 CodeChunk
    const matchedChunks: string[] = [];

    for (const chunk of codeChunks) {
      // 检查文件路径和行号范围
      if (
        chunk.filePath === filePath &&
        lineNumber >= chunk.range[0] &&
        lineNumber <= chunk.range[1]
      ) {
        matchedChunks.push(chunk.id);

        // 触发高亮更新
        dispatch(
          updateHighlight({
            sourceType: "code",
            identifier: chunk.id,
            additionalInfo: chunk,
          }),
        );
        break;
      }
    }

    // 发送调试信息到控制台
    /*console.log("Cursor Position Changed:", {
      filePath,
      lineNumber,
      matchedChunks,
      totalCodeChunks: codeChunks.length,
    });*/
  }, [codeChunks, dispatch]);

  // CodeAware: 监听代码选择变化事件
  useWebviewListener("codeSelectionChanged", async (data) => {
    const { filePath, selectedLines, selectedContent } = data;

    // 检查选中的代码是否属于某个 CodeChunk
    const matchedChunks: string[] = [];

    for (const chunk of codeChunks) {
      // 检查文件路径和行号范围是否有重叠
      if (chunk.filePath === filePath) {
        const hasOverlap =
          selectedLines[0] <= chunk.range[1] &&
          selectedLines[1] >= chunk.range[0];

        if (hasOverlap) {
          matchedChunks.push(chunk.id);

          // 触发高亮更新
          dispatch(
            updateHighlight({
              sourceType: "code",
              identifier: chunk.id,
              additionalInfo: chunk,
            }),
          );
          break;
        }
      }
    }

    // 发送调试信息到控制台
    console.log("Code Selection Changed:", {
      filePath,
      selectedLines,
      selectedContent: selectedContent.substring(0, 100) + "...", // 只显示前100个字符
      matchedChunks,
      totalCodeChunks: codeChunks.length,
    });
  }, [codeChunks, dispatch]);

  useWebviewListener(
    "getCodeAwareContext",
    async () => {
      console.log("CodeAwar GUI: Fetching context from store, using cached context", codeAwareContext);
      return {
        userRequirement: codeAwareContext.userRequirement || "",
        currentStep: codeAwareContext.currentStep || "",
        nextStep: codeAwareContext.nextStep || "",
      };
    },
    [codeAwareContext],
  );
}

export default useSetup;

import { useCallback, useContext, useEffect, useRef } from "react";
import { VSC_THEME_COLOR_VARS } from "../components";
import { IdeMessengerContext } from "../context/IdeMessenger";

import { ConfigResult } from "@continuedev/config-yaml";
import { BrowserSerializedContinueConfig } from "core";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { clearAllHighlights, selectCodeChunks, updateHighlight } from "../redux/slices/codeAwareSlice";
import { setConfigError, setConfigResult } from "../redux/slices/configSlice";
import { updateIndexingStatus } from "../redux/slices/indexingSlice";
import { updateDocsSuggestions } from "../redux/slices/miscSlice";
import {
  addContextItemsAtIndex,
  setInactive,
} from "../redux/slices/sessionSlice";
import { setTTSActive } from "../redux/slices/uiSlice";
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


  // CodeAware: 监听代码选择取消事件
  useWebviewListener("codeSelectionCleared", async (data) => {
    const { filePath } = data;

    console.log("Code Selection Cleared:", {
      filePath,
      previousSelection: codeChunks.filter(chunk => chunk.isHighlighted)
    });

    // 清除所有高亮
    dispatch(clearAllHighlights());
  }, [dispatch]);

  // CodeAware: 监听代码选择变化事件
  useWebviewListener("codeSelectionChanged", async (data) => {
    const { filePath, selectedLines, selectedContent } = data;

    console.log("Code Selection sent to webview:", {
      filePath,
      selectedLines,
      selectedContent: selectedContent.substring(0, 100) + "...", // 只
      // 显示前100个字符
    });

    // 存储符合条件的代码块
    const fullyContainedChunks = []; // 选区完全包含的代码块
    const overlappingChunks = []; // 有重叠的代码块（包括反向包含的情况）

    for (const chunk of codeChunks) {
      // 如果 CodeChunk 的文件路径不匹配，跳过
      if (chunk.filePath !== filePath) {
        continue;
      }

      // 计算重叠的行数
      const overlapStart = Math.max(selectedLines[0], chunk.range[0]);
      const overlapEnd = Math.min(selectedLines[1], chunk.range[1]);
      const overlapLines = overlapEnd - overlapStart + 1;

      // 至少有一行重叠
      if (overlapLines > 0) {
        // 检查选区是否完全包含该代码块
        if (selectedLines[0] <= chunk.range[0] && selectedLines[1] >= chunk.range[1]) {
          fullyContainedChunks.push(chunk);
        } else {
          // 计算重叠比例（重叠行数占该chunk总行数的比例）
          const chunkTotalLines = chunk.range[1] - chunk.range[0] + 1;
          const overlapRatio = overlapLines / chunkTotalLines;
          
          overlappingChunks.push({
            chunk,
            overlapRatio,
            overlapLines
          });
        }
      }
    }

    // 准备要高亮的事件列表
    const highlightEvents = [];

    // 1. 添加所有被选区完全包含的代码块
    fullyContainedChunks.forEach(chunk => {
      highlightEvents.push({
        sourceType: "code" as const,
        identifier: chunk.id,
        additionalInfo: chunk,
      });
    });

    // 2. 如果没有完全包含的代码块，或者需要补充重叠的代码块
    if (overlappingChunks.length > 0) {
      // 按重叠比例降序排序
      overlappingChunks.sort((a, b) => b.overlapRatio - a.overlapRatio);
      
      // 选择重叠比例最大的代码块
      const bestOverlappingChunk = overlappingChunks[0];
      
      // 如果没有完全包含的代码块，或者最佳重叠比例足够高（>= 50%），则添加到高亮列表
      if (fullyContainedChunks.length === 0 || bestOverlappingChunk.overlapRatio >= 0.5) {
        highlightEvents.push({
          sourceType: "code" as const,
          identifier: bestOverlappingChunk.chunk.id,
          additionalInfo: bestOverlappingChunk.chunk,
        });
      }
    }

    // 如果有要高亮的代码块，触发高亮更新
    if (highlightEvents.length > 0) {
      dispatch(updateHighlight(highlightEvents));
    }

    // 发送调试信息到控制台
    console.log("Code Selection Changed:", {
      filePath,
      selectedLines,
      selectedContent: selectedContent.substring(0, 100) + "...", // 只显示前100个字符
      fullyContainedCount: fullyContainedChunks.length,
      overlappingCount: overlappingChunks.length,
      highlightEventsCount: highlightEvents.length,
      bestOverlapRatio: overlappingChunks.length > 0 ? overlappingChunks[0].overlapRatio : null,
      CodeChunks: codeChunks,
    });
  }, [codeChunks, dispatch]);
}

export default useSetup;

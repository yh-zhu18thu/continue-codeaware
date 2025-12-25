import { HighlightEvent, KnowledgeCardItem, StepItem, StepStatus } from "core";
import {
  Key,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { lightGray, vscForeground } from "../../components";
import { SessionInfoDialog } from "../../components/dialogs/SessionInfoDialog";
import { PageHeader } from "../../components/PageHeader";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  clearAllCodeAndMappings,
  clearAllHighlights,
  clearCodeEditModeSnapshot,
  newCodeAwareSession, // Add this import
  resetIdeCommFlags,
  resetSessionExceptRequirement, // Add this import
  saveCodeEditModeSnapshot, // Add this import
  selectCurrentSessionId,
  selectIsCodeEditModeEnabled, // Add this import for code edit mode
  selectIsRequirementInEditMode, // Import submitRequirementContent
  selectIsStepsGenerated,
  selectLearningGoal, // Add this import
  selectTask,
  selectTitle, // Add this import for reading title
  setCodeEditMode, // Add this import for code edit mode action
  setKnowledgeCardDisabled, // Add this import for knowledge card disable
  setKnowledgeCardGenerationStatus, // Add this import for knowledge card generation status
  setStepAbstract, // Add this import for step editing
  setStepStatus, // Add this import for step status change
  setUserRequirementStatus,
  submitRequirementContent, // Add this import
  updateHighlight,
} from "../../redux/slices/codeAwareSlice";
import {
  checkAndMapKnowledgeCardsToCode,
  checkAndUpdateHighLevelStepCompletion,
  generateCodeFromSteps,
  generateKnowledgeCardDetail,
  generateKnowledgeCardTests, // 新增：导入测试题生成thunk
  generateKnowledgeCardThemes,
  generateKnowledgeCardThemesFromQuery,
  generateStepsFromRequirement,
  getStepCorrespondingCode,
  processCodeChanges,
  processGlobalQuestion,
  processSaqSubmission,
  rerunStep,
} from "../../redux/thunks/codeAwareGeneration";
import { useCodeAwareLogger } from "../../util/codeAwareWebViewLogger";
import "./CodeAware.css";
import CodeEditModeToggle from "./components/CodeEditModeToggle"; // Import the toggle component
import GlobalQuestionModal from "./components/QuestionPopup/GlobalQuestionModal";
import RequirementDisplay from "./components/Requirements/RequirementDisplay"; // Import RequirementDisplay
import RequirementDisplayHorizontal from "./components/Requirements/RequirementDisplayHorizontal"; // Import RequirementDisplayHorizontal
import RequirementEditor from "./components/Requirements/RequirementEditor"; // Import RequirementEditor
import Step from "./components/Steps/Step"; // Import Step

// Helper function to find the most relevant step for a given code selection
const findMostRelevantStepForSelection = (
  filePath: string,
  selectedLines: [number, number],
  allMappings: any[],
  codeChunks: any[],
  steps: any[],
): string | null => {
  // Find code chunks that overlap with the selected range
  const overlappingChunks = codeChunks.filter((chunk) => {
    if (chunk.filePath !== filePath || chunk.disabled) {
      return false;
    }

    // Check if the chunk's range overlaps with the selected range
    const [chunkStart, chunkEnd] = chunk.range;
    const [selectionStart, selectionEnd] = selectedLines;

    // There's an overlap if selection start is before chunk end AND selection end is after chunk start
    return selectionStart <= chunkEnd && selectionEnd >= chunkStart;
  });

  if (overlappingChunks.length === 0) {
    return null;
  }

  // Find mappings for these overlapping chunks
  const relevantMappings = allMappings.filter((mapping) =>
    overlappingChunks.some((chunk) => chunk.id === mapping.codeChunkId),
  );

  if (relevantMappings.length === 0) {
    return null;
  }

  // Count occurrences of each step in the mappings
  const stepCounts: Record<string, number> = {};
  relevantMappings.forEach((mapping) => {
    if (mapping.stepId) {
      stepCounts[mapping.stepId] = (stepCounts[mapping.stepId] || 0) + 1;
    }
  });

  // Find the step with the most mappings (most relevant)
  let mostRelevantStepId: string | null = null;
  let maxCount = 0;

  for (const [stepId, count] of Object.entries(stepCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostRelevantStepId = stepId;
    }
  }

  // Verify the step still exists
  if (
    mostRelevantStepId &&
    steps.some((step) => step.id === mostRelevantStepId)
  ) {
    return mostRelevantStepId;
  }

  return null;
};

// 全局样式：
const CodeAwareDiv = styled.div`
  position: relative;
  background-color: transparent;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100vh; /* 设置固定高度 */
  box-sizing: border-box;
  overflow-x: hidden; /* 防止水平滚动 */
  overflow-y: hidden; /* 禁用外层滚动 */
  display: flex;
  flex-direction: column;

  & > * {
    position: relative;
    max-width: 100%;
    box-sizing: border-box;
  }

  .thread-message {
    margin: 0px 0px 0px 1px;
  }

  /* 确保所有 markdown 内容都不会溢出 */
  .wmde-markdown {
    max-width: 100% !important;
    overflow-x: hidden !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
  }

  .wmde-markdown pre {
    max-width: 100% !important;
    overflow-x: auto !important;
    white-space: pre-wrap !important;
    word-wrap: break-word !important;
  }

  .wmde-markdown code {
    max-width: 100% !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
  }

  /* 确保所有表格都能适应容器 */
  .wmde-markdown table {
    max-width: 100% !important;
    table-layout: fixed !important;
    width: 100% !important;
  }

  .wmde-markdown td,
  .wmde-markdown th {
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
  }
`;

const LoadingOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;

  /* 隐藏滚动条但保持滚动功能 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* Internet Explorer 10+ */

  &::-webkit-scrollbar {
    display: none; /* Safari and Chrome */
  }
`;

const SpinnerIcon = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid ${lightGray};
  border-top: 2px solid ${vscForeground};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

export const CodeAware = () => {
  //import the idemessenger that will communicate between core, gui and IDE
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();

  // CodeAware logger
  const logger = useCodeAwareLogger();

  // Dialog state for session info
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);

  //CodeAware: 增加一个指令，使得可以发送当前所选择的知识卡片id
  //CATODO: 参照着codeContextProvider的实现，利用上getAllSnippets的获取最近代码的功能，然后再通过coreToWebview的路径发送更新过来。

  //从redux中获取项目需求相关的数据
  // 当前requirement部分应该使用
  const isEditMode = useAppSelector(selectIsRequirementInEditMode);
  const isStepsGenerated = useAppSelector(selectIsStepsGenerated); // Use the selector
  const isCodeEditModeEnabled = useAppSelector(selectIsCodeEditModeEnabled); // Get code edit mode state
  const sessionTitle = useAppSelector(selectTitle); // Get title from codeAwareSlice
  const currentSessionId = useAppSelector(selectCurrentSessionId); // Get current session ID
  // 获取可能有的requirement内容
  const userRequirement = useAppSelector(
    (state) => state.codeAwareSession.userRequirement,
  );
  const userRequirementStatus = useAppSelector(
    (state) => state.codeAwareSession.userRequirement?.requirementStatus,
  );

  // 计算要显示的title：只有在requirement为finalized时才显示session title，否则显示"CodeAware"
  const displayTitle =
    userRequirementStatus === "finalized" ? sessionTitle : "CodeAware";

  const steps = useAppSelector((state) => state.codeAwareSession.steps); // Get steps data

  // 预先获取所有步骤的高级步骤索引，避免在 map 函数中使用 hook
  const stepToHighLevelIndexMap = useAppSelector((state) => {
    const mappings = state.codeAwareSession.stepToHighLevelMappings;
    const map = new Map<string, number | null>();
    steps.forEach((step) => {
      const mapping = mappings.find((m) => m.stepId === step.id);
      map.set(step.id, mapping ? mapping.highLevelStepIndex : null);
    });
    return map;
  });

  // 监听steps变化，同步给IDE
  useEffect(() => {
    // 只有在有步骤的情况下才同步
    if (steps.length > 0) {
      const syncToIde = async () => {
        try {
          await ideMessenger?.request("syncCodeAwareSteps", {
            currentStep: "",
            nextStep: "",
            stepFinished: false,
          });

          console.log("📡 [CodeAware] Successfully synced steps to IDE:", {
            stepsCount: steps.length,
          });
        } catch (error) {
          console.warn("⚠️ [CodeAware] Failed to sync steps to IDE:", error);
        }
      };

      syncToIde();
    }
  }, [steps.length, ideMessenger]);

  // Sync code edit mode state to IDE
  useEffect(() => {
    const syncCodeEditModeToIde = async () => {
      try {
        await ideMessenger?.request("setCodeEditMode", {
          enabled: isCodeEditModeEnabled,
        });

        console.log("📡 [CodeAware] Code edit mode synced to IDE:", {
          isCodeEditModeEnabled,
        });
      } catch (error) {
        console.warn(
          "⚠️ [CodeAware] Failed to sync code edit mode to IDE:",
          error,
        );
      }
    };

    syncCodeEditModeToIde();
  }, [isCodeEditModeEnabled, ideMessenger]);

  // Monitor knowledge card generation completion and log events
  const prevStepsRef = useRef<StepItem[]>([]);
  useEffect(() => {
    const currentSteps = steps;
    const previousSteps = prevStepsRef.current;

    // Check for knowledge card generation status changes
    currentSteps.forEach((currentStep) => {
      const previousStep = previousSteps.find((s) => s.id === currentStep.id);

      if (previousStep) {
        // Log knowledge card generation completion
        if (
          previousStep.knowledgeCardGenerationStatus === "generating" &&
          currentStep.knowledgeCardGenerationStatus === "ready"
        ) {
          logger.addLogEntry("system_knowledge_card_themes_generated", {
            stepId: currentStep.id,
            stepTitle: currentStep.title,
            knowledgeCardCount: currentStep.knowledgeCards.length,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Log individual knowledge card content generation completion
      currentStep.knowledgeCards.forEach((currentCard) => {
        const previousCard = previousStep?.knowledgeCards.find(
          (c) => c.id === currentCard.id,
        );

        if (
          previousCard &&
          previousCard.content === "::LOADING::" &&
          currentCard.content !== "::LOADING::" &&
          currentCard.content &&
          currentCard.content.trim() !== ""
        ) {
        }
      });
    });

    // Update the ref with current steps
    prevStepsRef.current = [...currentSteps];
  }, [steps, logger]);

  // Handle local code edit mode changes (from toggle button)
  useEffect(() => {
    const handleLocalCodeEditModeChange = async () => {
      const previousMode = prevCodeEditModeRef.current;
      const currentMode = isCodeEditModeEnabled;

      // Update the ref to current state
      prevCodeEditModeRef.current = currentMode;

      // Only process if the mode actually changed
      if (previousMode === currentMode) {
        return;
      }

      if (currentMode && !previousMode) {
        // Entering code edit mode - save current code snapshot
        try {
          const currentFileResponse = await ideMessenger?.request(
            "getCurrentFile",
            undefined,
          );

          if (
            currentFileResponse &&
            currentFileResponse.status === "success" &&
            currentFileResponse.content
          ) {
            const currentFile = currentFileResponse.content;

            dispatch(
              saveCodeEditModeSnapshot({
                filePath: currentFile.path,
                content: currentFile.contents || "",
              }),
            );

            console.log("📸 [CodeAware] Code snapshot saved (local toggle):", {
              filePath: currentFile.path,
              contentLength: (currentFile.contents || "").length,
            });
          } else {
            console.warn(
              "⚠️ [CodeAware] Could not get current file for snapshot (local toggle)",
            );
          }
        } catch (error) {
          console.error(
            "❌ [CodeAware] Failed to save code snapshot (local toggle):",
            error,
          );
        }
      } else if (!currentMode && previousMode) {
        // Exiting code edit mode - process code changes
        try {
          const currentFileResponse = await ideMessenger?.request(
            "getCurrentFile",
            undefined,
          );

          if (
            currentFileResponse &&
            currentFileResponse.status === "success" &&
            currentFileResponse.content
          ) {
            const currentFile = currentFileResponse.content;

            console.log(
              "🔄 [CodeAware] Processing code changes (local toggle)...",
            );

            // Process code changes in the background
            await dispatch(
              processCodeChanges({
                currentFilePath: currentFile.path,
                currentContent: currentFile.contents || "",
              }),
            );

            console.log(
              "✅ [CodeAware] Code changes processed successfully (local toggle)",
            );
          } else {
            console.warn(
              "⚠️ [CodeAware] Could not get current file for change processing (local toggle)",
            );
          }

          // Clear the snapshot after processing
          dispatch(clearCodeEditModeSnapshot());
        } catch (error) {
          console.error(
            "❌ [CodeAware] Failed to process code changes (local toggle):",
            error,
          );
          // Clear snapshot even if processing failed
          dispatch(clearCodeEditModeSnapshot());
        }
      }
    };

    handleLocalCodeEditModeChange();
  }, [isCodeEditModeEnabled, ideMessenger, dispatch]);

  // Add dialog handlers
  const handleSessionInfoSubmit = useCallback(
    async (username: string, sessionName: string) => {
      // First create new session
      dispatch(newCodeAwareSession());

      // Start logging session
      await logger.startLogSession(username, sessionName, currentSessionId);

      // Log session creation
      await logger.addLogEntry("user_create_new_session", {
        username,
        sessionName,
        timestamp: new Date().toISOString(),
      });

      // CodeAware: Create and open a new Python file with session name
      try {
        const pythonFilename = `${sessionName}.py`;

        /*await ideMessenger?.request("createAndOpenFile", {
          filename: pythonFilename,
          content: "",
        });*/

        console.log(
          `📄 [CodeAware] Created and opened Python file: ${pythonFilename}`,
        );

        // Log file creation
        await logger.addLogEntry("system_create_session_file", {
          filename: pythonFilename,
          username,
          sessionName,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(
          "❌ [CodeAware] Failed to create and open Python file:",
          error,
        );

        // Log the error but don't prevent session creation
        await logger.addLogEntry("system_create_session_file_error", {
          error: error instanceof Error ? error.message : String(error),
          username,
          sessionName,
          timestamp: new Date().toISOString(),
        });
      }

      // Close dialog
      setIsSessionDialogOpen(false);
    },
    [dispatch, logger, currentSessionId, ideMessenger],
  );

  const handleSessionInfoCancel = useCallback(() => {
    setIsSessionDialogOpen(false);
  }, []);

  // Add webview listener for new session event to initialize CodeAware session
  useWebviewListener(
    "newSession",
    async () => {
      // Log new session request
      await logger.addLogEntry("user_request_new_session", {
        timestamp: new Date().toISOString(),
      });

      // Show dialog to get user info
      setIsSessionDialogOpen(true);
    },
    [dispatch, logger],
  );

  // Add webview listener for code edit mode changes from IDE
  useWebviewListener(
    "didChangeCodeEditMode",
    async (data: { enabled: boolean }) => {
      console.log(
        "📡 [CodeAware] Received code edit mode change from IDE:",
        data,
      );

      const currentCodeEditMode = isCodeEditModeEnabled;

      if (data.enabled && !currentCodeEditMode) {
        // Log: 用户进入代码编辑模式
        await logger.addLogEntry("user_enter_code_edit_mode", {
          timestamp: new Date().toISOString(),
        });

        // Entering code edit mode - save current code snapshot
        try {
          const currentFileResponse = await ideMessenger?.request(
            "getCurrentFile",
            undefined,
          );

          if (
            currentFileResponse &&
            currentFileResponse.status === "success" &&
            currentFileResponse.content
          ) {
            const currentFile = currentFileResponse.content;

            dispatch(
              saveCodeEditModeSnapshot({
                filePath: currentFile.path,
                content: currentFile.contents || "",
              }),
            );

            console.log("📸 [CodeAware] Code snapshot saved:", {
              filePath: currentFile.path,
              contentLength: (currentFile.contents || "").length,
            });
          } else {
            console.warn(
              "⚠️ [CodeAware] Could not get current file for snapshot",
            );
          }
        } catch (error) {
          console.error("❌ [CodeAware] Failed to save code snapshot:", error);
        }
      } else if (!data.enabled && currentCodeEditMode) {
        // Log: 用户退出代码编辑模式
        await logger.addLogEntry("user_exit_code_edit_mode", {
          timestamp: new Date().toISOString(),
        });

        // Exiting code edit mode - process code changes
        try {
          const currentFileResponse = await ideMessenger?.request(
            "getCurrentFile",
            undefined,
          );

          if (
            currentFileResponse &&
            currentFileResponse.status === "success" &&
            currentFileResponse.content
          ) {
            const currentFile = currentFileResponse.content;

            console.log("🔄 [CodeAware] Processing code changes...");

            // Process code changes in the background
            await dispatch(
              processCodeChanges({
                currentFilePath: currentFile.path,
                currentContent: currentFile.contents || "",
              }),
            );

            console.log("✅ [CodeAware] Code changes processed successfully");
          } else {
            console.warn(
              "⚠️ [CodeAware] Could not get current file for change processing",
            );
          }

          // Clear the snapshot after processing
          dispatch(clearCodeEditModeSnapshot());
        } catch (error) {
          console.error(
            "❌ [CodeAware] Failed to process code changes:",
            error,
          );
          // Clear snapshot even if processing failed
          dispatch(clearCodeEditModeSnapshot());
        }
      }

      // Update the code edit mode state
      dispatch(setCodeEditMode(data.enabled));
    },
    [dispatch, ideMessenger, isCodeEditModeEnabled],
  );

  // Get IDE communication flags
  const shouldClearIdeHighlights = useAppSelector(
    (state) => state.codeAwareSession.shouldClearIdeHighlights,
  );
  const codeChunksToHighlightInIde = useAppSelector(
    (state) => state.codeAwareSession.codeChunksToHighlightInIde,
  );

  // Get all the mappings:
  const allMappings = useAppSelector(
    (state) => state.codeAwareSession.codeAwareMappings,
  );

  // Check if we should show loading overlay
  const isGeneratingSteps = userRequirementStatus === "confirmed";

  // Check if any step is in generating state
  const hasGeneratingSteps = steps.some(
    (step) => step.stepStatus === "generating",
  );

  // Check if any step is in code_dirty state (processing code changes)
  const hasCodeDirtySteps = steps.some(
    (step) => step.stepStatus === "code_dirty",
  );

  // log all the data for debugging
  useEffect(() => {
    console.log("All mappings length: ", allMappings.length);
    console.log("All Mappings:", allMappings);
  }, [allMappings]);

  // 设置全局样式：
  const codeAwareDivRef = useRef<HTMLDivElement>(null);

  // Track previous code edit mode state for local toggles
  const prevCodeEditModeRef = useRef<boolean>(isCodeEditModeEnabled);

  // CodeAware: 调试状态 - 跟踪最近的光标位置和选择信息
  const [debugInfo, setDebugInfo] = useState<{
    lastCursorPosition?: {
      filePath: string;
      lineNumber: number;
      startLine: number;
      endLine: number;
    };
    lastSelection?: {
      filePath: string;
      selectedLines: [number, number];
      selectedContent: string;
    };
    matchedCodeChunks: string[];
  }>({
    matchedCodeChunks: [],
  });

  const codeGenDebugLogs = useAppSelector(
    (state) => state.codeAwareSession.codeGenerationDebugLogs,
  );
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Track steps that should be force expanded due to code selection questions
  const [forceExpandedSteps, setForceExpandedSteps] = useState<Set<string>>(
    new Set(),
  );

  // Track steps that were expanded due to global questions (should remain expanded)
  const [globalQuestionExpandedSteps, setGlobalQuestionExpandedSteps] =
    useState<Set<string>>(new Set());

  // Track currently expanded step for auto-collapse functionality
  const [currentlyExpandedStepId, setCurrentlyExpandedStepId] = useState<
    string | null
  >(null);

  // Track whether RequirementDisplay is visible in viewport
  const [isRequirementDisplayVisible, setIsRequirementDisplayVisible] =
    useState<boolean>(true);
  const requirementDisplayRef = useRef<HTMLDivElement>(null);

  // Track step refs for scrolling functionality
  const stepRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollableContentRef = useRef<HTMLDivElement>(null);

  // Track whether auto-scroll should be temporarily disabled (e.g., when expanding knowledge cards)
  const [isAutoScrollDisabled, setIsAutoScrollDisabled] =
    useState<boolean>(false);
  const autoScrollDisableTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoScrollDisabledRef = useRef<boolean>(false); // Immediate ref for sync access

  // Global question modal state
  const [isGlobalQuestionModalOpen, setIsGlobalQuestionModalOpen] =
    useState<boolean>(false);
  const [isGlobalQuestionLoading, setIsGlobalQuestionLoading] =
    useState<boolean>(false);

  // Effect to remove steps from forceExpandedSteps when their status changes from generating to checked
  // But keep global question expanded steps expanded
  useEffect(() => {
    steps.forEach((step) => {
      if (
        forceExpandedSteps.has(step.id) &&
        step.knowledgeCardGenerationStatus === "ready" &&
        !globalQuestionExpandedSteps.has(step.id)
      ) {
        // Don't remove global question expanded steps
        setForceExpandedSteps((prev) => {
          const newSet = new Set(prev);
          newSet.delete(step.id);
          return newSet;
        });
        console.log(
          `🔄 [CodeAware] Removed step ${step.id} from force expanded list as status is now checked`,
        );
      }
    });
  }, [steps, forceExpandedSteps, globalQuestionExpandedSteps]);

  // Auto-scroll to highlighted steps
  useEffect(() => {
    const highlightedSteps = steps.filter((step) => step.isHighlighted);

    if (highlightedSteps.length === 0) {
      return;
    }

    // Don't auto-scroll if auto-scroll is temporarily disabled
    // This prevents jarring page movements when users expand knowledge cards
    if (isAutoScrollDisabled || isAutoScrollDisabledRef.current) {
      console.log(
        "📍 [CodeAware] Skipping auto-scroll because auto-scroll is temporarily disabled",
      );
      return;
    }

    // Get the scrollable container
    const scrollContainer = scrollableContentRef.current;
    if (!scrollContainer) {
      return;
    }

    // Small delay to ensure DOM is updated
    const scrollTimeout = setTimeout(() => {
      // Get refs for all highlighted steps
      const highlightedStepElements = highlightedSteps
        .map((step) => stepRefsMap.current.get(step.id))
        .filter((element): element is HTMLDivElement => element !== undefined);

      if (highlightedStepElements.length === 0) {
        return;
      }

      // Calculate the bounding box that contains all highlighted steps
      let minTop = Infinity;
      let maxBottom = -Infinity;

      highlightedStepElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        // Convert to relative positions within the scroll container
        const relativeTop =
          rect.top - containerRect.top + scrollContainer.scrollTop;
        const relativeBottom =
          rect.bottom - containerRect.top + scrollContainer.scrollTop;

        minTop = Math.min(minTop, relativeTop);
        maxBottom = Math.max(maxBottom, relativeBottom);
      });

      // Calculate the center point of all highlighted steps
      const centerY = (minTop + maxBottom) / 2;
      const containerHeight = scrollContainer.clientHeight;

      // Calculate scroll position to center the highlighted area
      const targetScrollTop = centerY - containerHeight / 2;

      // Ensure we don't scroll beyond the container bounds
      const maxScrollTop = scrollContainer.scrollHeight - containerHeight;
      const finalScrollTop = Math.max(
        0,
        Math.min(targetScrollTop, maxScrollTop),
      );

      // Smooth scroll to the calculated position
      scrollContainer.scrollTo({
        top: finalScrollTop,
        behavior: "smooth",
      });

      console.log(
        `📍 [CodeAware] Auto-scrolling to ${highlightedSteps.length} highlighted step(s)`,
        {
          stepIds: highlightedSteps.map((s) => s.id),
          minTop,
          maxBottom,
          centerY,
          targetScrollTop: finalScrollTop,
        },
      );
    }, 100); // Small delay to ensure DOM updates are complete

    return () => {
      clearTimeout(scrollTimeout);
    };
  }, [steps, isAutoScrollDisabled]); // Include isAutoScrollDisabled to respond to auto-scroll state changes

  // Function to register step ref
  const registerStepRef = useCallback(
    (stepId: string, element: HTMLDivElement | null) => {
      if (element) {
        stepRefsMap.current.set(stepId, element);
      } else {
        stepRefsMap.current.delete(stepId);
      }
    },
    [],
  );

  // 获取当前 CodeChunks 用于调试
  const codeChunks = useAppSelector(
    (state) => state.codeAwareSession.codeChunks,
  );

  // Create a memoized map of test loading states and results
  const testStatesMap = useMemo(() => {
    const map = new Map();
    steps.forEach((step) => {
      step.knowledgeCards.forEach((kc) => {
        kc.tests?.forEach((test) => {
          // Extract result from test question if it exists
          let result:
            | { userAnswer: string; isCorrect: boolean; remarks: string }
            | undefined;
          if (
            test.question.type === "shortAnswer" &&
            test.question.answer &&
            test.question.result !== "unanswered"
          ) {
            result = {
              userAnswer: test.question.answer,
              isCorrect: test.question.result === "correct",
              remarks: test.question.remarks || "",
            };
          }

          map.set(test.id, {
            isLoading: (test as any).isLoading || false,
            result,
          });
        });
      });
    });
    return map;
  }, [steps]);

  // IntersectionObserver to track RequirementDisplay visibility
  useEffect(() => {
    const currentRef = requirementDisplayRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // RequirementDisplay 至少要有 20% 可见才认为是可见的
        setIsRequirementDisplayVisible(entry.intersectionRatio > 0.2);
      },
      {
        threshold: [0, 0.2, 0.5, 1.0],
        rootMargin: "0px 0px -20px 0px", // 稍微向上偏移以提前触发
      },
    );

    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [userRequirementStatus, isEditMode]); // 在需求状态或编辑模式变化时重新设置 observer

  const handleRequirementContentChange = useCallback(
    (hasChanges: boolean) => {
      if (!userRequirement) return;

      const currentStatus = userRequirement.requirementStatus;

      // 简化逻辑：当用户开始输入时，从empty状态切换到editing状态
      if (currentStatus === "empty" && hasChanges) {
        dispatch(setUserRequirementStatus("editing"));
      }
    },
    [dispatch, userRequirement],
  );

  const AIHandleRequirementConfirmation = useCallback(
    async (requirement: string) => {
      // Expect requirement from editor
      // Disable in code edit mode
      if (isCodeEditModeEnabled) {
        console.warn(
          "⚠️ Requirement confirmation is disabled in code edit mode",
        );
        return;
      }

      if (!userRequirement) {
        return;
      }

      // Log requirement confirmation
      await logger.addLogEntry("user_confirm_requirement", {
        requirement:
          requirement.trim().length > 300
            ? requirement.trim().substring(0, 300) + "..."
            : requirement.trim(),
        originalRequirement:
          userRequirement.requirementDescription.length > 300
            ? userRequirement.requirementDescription.substring(0, 300) + "..."
            : userRequirement.requirementDescription,
        timestamp: new Date().toISOString(),
      });

      // 检查是否有修改：比较新的requirement和原来的requirementDescription
      const originalRequirement = userRequirement.requirementDescription;
      const hasChanges = requirement.trim() !== originalRequirement.trim();

      dispatch(submitRequirementContent(requirement)); // Submit content first

      if (!hasChanges) {
        // 没有修改，直接回到finalized状态
        console.log("No changes detected, returning to finalized state");
        dispatch(setUserRequirementStatus("finalized"));
        await logger.addLogEntry("user_no_change_requirement", {
          requirement: requirement.trim(),
        });
        return;
      }

      // 有修改，重新生成步骤
      console.log("Changes detected, regenerating steps");
      await logger.addLogEntry("user_modify_requirement", {
        oldRequirement: originalRequirement,
        newRequirement: requirement.trim(),
      });
      // Reset session except requirement first to ensure clean state
      dispatch(resetSessionExceptRequirement());
      dispatch(setUserRequirementStatus("confirmed"));
      dispatch(
        generateStepsFromRequirement({ userRequirement: requirement }),
      ).then(async () => {
        console.log("Steps generated from requirement");
        await logger.addLogEntry("user_regenerate_steps_completed", {
          requirement: requirement.trim(),
        });
      });
    },
    [dispatch, userRequirement, isCodeEditModeEnabled, logger],
  );

  const handleEditRequirement = useCallback(async () => {
    // Disable in code edit mode
    if (isCodeEditModeEnabled) {
      console.warn("⚠️ Requirement editing is disabled in code edit mode");
      return;
    }

    await logger.addLogEntry("user_start_edit_requirement", {
      currentRequirement: userRequirement?.requirementDescription
        ? userRequirement.requirementDescription.length > 300
          ? userRequirement.requirementDescription.substring(0, 300) + "..."
          : userRequirement.requirementDescription
        : "",
    });

    dispatch(setUserRequirementStatus("editing"));
  }, [dispatch, isCodeEditModeEnabled, logger, userRequirement]);

  const handleRegenerateCode = useCallback(async () => {
    // Disable in code edit mode
    if (isCodeEditModeEnabled) {
      console.warn("⚠️ Code regeneration is disabled in code edit mode");
      return;
    }

    await logger.addLogEntry("user_request_regenerate_code", {
      timestamp: new Date().toISOString(),
    });

    try {
      console.log("🔄 [CodeAware] Starting code regeneration...");

      // 1. Clear all code chunks and mappings
      dispatch(clearAllCodeAndMappings());

      await logger.addLogEntry("user_clear_code_and_mappings", {
        timestamp: new Date().toISOString(),
      });

      // 2. Get current file content
      const currentFileResponse = await ideMessenger?.request(
        "getCurrentFile",
        undefined,
      );

      if (
        !currentFileResponse ||
        currentFileResponse.status !== "success" ||
        !currentFileResponse.content
      ) {
        throw new Error("无法获取当前文件内容");
      }

      const currentFile = currentFileResponse.content;

      // 3. Clear the file content in IDE
      try {
        await ideMessenger?.request("writeFile", {
          path: currentFile.path,
          contents: "",
        });
        console.log("📄 [CodeAware] Cleared file content in IDE");

        await logger.addLogEntry("user_clear_file_content", {
          filePath: currentFile.path,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("⚠️ [CodeAware] Failed to clear file content:", error);
        // Continue even if clearing fails
      }

      // 4. Find all generated steps
      const generatedSteps = steps.filter(
        (step) => step.stepStatus === "generated",
      );

      if (generatedSteps.length === 0) {
        console.log("📝 [CodeAware] No generated steps found");
        ideMessenger?.post("showToast", [
          "info",
          "没有已生成的步骤需要重新生成代码。",
        ]);

        await logger.addLogEntry("user_regenerate_code_no_steps", {
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 5. Set all generated steps to generating status
      generatedSteps.forEach((step) => {
        dispatch(setStepStatus({ stepId: step.id, status: "generating" }));
      });

      console.log(
        `📋 [CodeAware] Found ${generatedSteps.length} generated steps to regenerate code`,
      );

      // 6. Prepare ordered steps for code generation
      const orderedSteps = generatedSteps.map((step) => ({
        id: step.id,
        title: step.title,
        abstract: step.abstract,
        knowledge_cards: step.knowledgeCards.map((kc) => ({
          id: kc.id,
          title: kc.title,
        })),
      }));

      // 7. Generate code from steps
      console.log(
        "🚀 [CodeAware] Starting code generation from generated steps...",
      );
      const result = await dispatch(
        generateCodeFromSteps({
          existingCode: "", // Start with empty code
          filepath: currentFile.path,
          orderedSteps: orderedSteps,
          previouslyGeneratedSteps: undefined, // No previous steps since we're regenerating everything
        }),
      );

      if (generateCodeFromSteps.fulfilled.match(result)) {
        console.log(
          "✅ [CodeAware] Code regeneration completed!",
          result.payload,
        );

        // Set all steps back to generated status
        generatedSteps.forEach((step) => {
          dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
        });

        // Check and update high level step completion
        dispatch(checkAndUpdateHighLevelStepCompletion());

        ideMessenger?.post("showToast", [
          "info",
          `成功重新生成了 ${generatedSteps.length} 个步骤的代码！`,
        ]);

        await logger.addLogEntry("user_regenerate_code_completed", {
          stepsCount: generatedSteps.length,
          stepIds: generatedSteps.map((s) => s.id),
          timestamp: new Date().toISOString(),
        });
      } else if (generateCodeFromSteps.rejected.match(result)) {
        console.error(
          "❌ [CodeAware] Code regeneration failed:",
          result.error.message,
        );

        // Restore steps to generated status on failure
        generatedSteps.forEach((step) => {
          dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
        });

        ideMessenger?.post("showToast", [
          "error",
          "代码重新生成失败，请重试。",
        ]);

        await logger.addLogEntry("user_regenerate_code_error", {
          error: result.error.message || "Code regeneration failed",
          stepsCount: generatedSteps.length,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("❌ [CodeAware] Error during code regeneration:", error);

      // Restore all generating steps to generated status on error
      const generatingSteps = steps.filter(
        (step) => step.stepStatus === "generating",
      );
      generatingSteps.forEach((step) => {
        dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
      });

      ideMessenger?.post("showToast", [
        "error",
        "代码重新生成过程中发生错误，请重试。",
      ]);

      await logger.addLogEntry("user_regenerate_code_error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }, [steps, ideMessenger, dispatch, isCodeEditModeEnabled, logger]);

  // CodeAware: 获取学习目标和代码上下文
  const learningGoal = useAppSelector(selectLearningGoal);
  const task = useAppSelector(selectTask);

  // 处理生成知识卡片内容
  const handleGenerateKnowledgeCardContent = useCallback(
    async (
      stepId: string,
      cardId: string,
      theme: string,
      learningGoal: string,
      codeContext: string,
    ) => {
      console.log("Generating knowledge card content for:", {
        stepId,
        cardId,
        theme,
      });

      // Log knowledge card generation
      await logger.addLogEntry("user_start_view_knowledge_card", {
        stepId,
        cardId,
        theme,
        learningGoal,
      });

      // 如果没有提供代码上下文，从mapping中获取和cardId绑定的code chunk的内容
      let contextToUse = codeContext;
      if (!contextToUse) {
        // 从mapping中查找与cardId绑定的code chunk
        const cardMappings = allMappings.filter(
          (mapping) => mapping.knowledgeCardId === cardId,
        );
        console.log(
          `Found ${cardMappings.length} mappings for card ${cardId}:`,
          cardMappings,
        );

        if (cardMappings.length > 0) {
          // 获取所有相关的code chunk内容
          const codeChunkContents: string[] = [];

          cardMappings.forEach((mapping) => {
            if (mapping.codeChunkId) {
              const codeChunk = codeChunks.find(
                (chunk) => chunk.id === mapping.codeChunkId,
              );
              if (codeChunk && !codeChunk.disabled) {
                codeChunkContents.push(codeChunk.content);
              }
            }
          });

          // 合并所有相关的代码块内容作为上下文
          if (codeChunkContents.length > 0) {
            contextToUse = codeChunkContents.join(
              "\n\n// --- Related Code Chunk ---\n\n",
            );
            console.log(
              `Using code context from ${codeChunkContents.length} code chunks for card ${cardId}`,
            );
          } else {
            console.warn(
              `No valid code chunks found for card ${cardId}, using empty context`,
            );
            contextToUse = "";
          }
        } else {
          console.warn(
            `No mappings found for card ${cardId}, using empty context`,
          );
          contextToUse = "";
        }
      }

      dispatch(
        generateKnowledgeCardDetail({
          stepId,
          knowledgeCardId: cardId,
          knowledgeCardTheme: theme,
          learningGoal: learningGoal || "提升编程技能和理解相关概念",
          codeContext: contextToUse,
        }),
      );
    },
    [dispatch, allMappings, codeChunks, logger],
  );

  // 处理生成知识卡片测试题
  const handleGenerateKnowledgeCardTests = useCallback(
    async (
      stepId: string,
      cardId: string,
      title: string,
      content: string,
      theme: string,
      learningGoal: string,
      codeContext: string,
    ) => {
      console.log("Generating knowledge card tests for:", {
        stepId,
        cardId,
        title,
        theme,
      });

      // Log test generation
      await logger.addLogEntry("user_start_generate_knowledge_card_tests", {
        stepId,
        cardId,
        title,
        theme,
        learningGoal,
      });

      // 如果没有提供代码上下文，从mapping中获取和cardId绑定的code chunk的内容
      let contextToUse = codeContext;
      if (!contextToUse) {
        // 从mapping中查找与cardId绑定的code chunk
        const cardMappings = allMappings.filter(
          (mapping) => mapping.knowledgeCardId === cardId,
        );
        console.log(
          `Found ${cardMappings.length} mappings for card ${cardId}:`,
          cardMappings,
        );

        if (cardMappings.length > 0) {
          // 获取所有相关的code chunk内容
          const codeChunkContents: string[] = [];

          cardMappings.forEach((mapping) => {
            if (mapping.codeChunkId) {
              const codeChunk = codeChunks.find(
                (chunk) => chunk.id === mapping.codeChunkId,
              );
              if (codeChunk && !codeChunk.disabled) {
                codeChunkContents.push(codeChunk.content);
              }
            }
          });

          // 合并所有相关的代码块内容作为上下文
          if (codeChunkContents.length > 0) {
            contextToUse = codeChunkContents.join(
              "\n\n// --- Related Code Chunk ---\n\n",
            );
            console.log(
              `Using code context from ${codeChunkContents.length} code chunks for card ${cardId}`,
            );
          } else {
            console.warn(
              `No valid code chunks found for card ${cardId}, using empty context`,
            );
            contextToUse = "";
          }
        } else {
          console.warn(
            `No mappings found for card ${cardId}, using empty context`,
          );
          contextToUse = "";
        }
      }

      dispatch(
        generateKnowledgeCardTests({
          stepId,
          knowledgeCardId: cardId,
          knowledgeCardTitle: title,
          knowledgeCardContent: content,
          knowledgeCardTheme: theme,
          learningGoal: learningGoal || "提升编程技能和理解相关概念",
          codeContext: contextToUse,
        }),
      );
    },
    [dispatch, allMappings, codeChunks, logger],
  );

  // 处理生成知识卡片主题列表
  const handleGenerateKnowledgeCardThemes = useCallback(
    (
      stepId: string,
      stepTitle: string,
      stepAbstract: string,
      learningGoalFromProps: string,
    ) => {
      // 使用 Redux state 中的学习目标，如果提供了参数则使用参数
      const learningGoalToUse =
        learningGoalFromProps || learningGoal || "提升编程技能和理解相关概念";

      console.log("Generating knowledge card themes for:", {
        stepId,
        stepTitle,
        stepAbstract,
        learningGoalToUse,
      });

      dispatch(
        generateKnowledgeCardThemes({
          stepId,
          stepTitle,
          stepAbstract,
          learningGoal: learningGoalToUse,
        }),
      );
    },
    [dispatch, learningGoal],
  );

  // 处理禁用知识卡片
  const handleDisableKnowledgeCard = useCallback(
    (stepId: string, cardId: string) => {
      console.log("Disabling knowledge card:", { stepId, cardId });
      dispatch(setKnowledgeCardDisabled({ stepId, cardId, disabled: true }));
    },
    [dispatch],
  );

  const handleHighlightEvent = useCallback(
    async (e: HighlightEvent) => {
      // Special handling for knowledge card highlight events
      if (e.sourceType === "knowledgeCard") {
        // For knowledge cards, we want to highlight related elements but NOT trigger auto-scroll
        // We'll use the normal highlight logic but with a flag to prevent auto-scroll
        console.log(
          "📝 [CodeAware] Handling knowledge card highlight event:",
          e.identifier,
        );

        // Temporarily disable auto-scroll for knowledge card highlights
        setIsAutoScrollDisabled(true);
        isAutoScrollDisabledRef.current = true; // Immediate disable

        // Clear any existing timeout
        if (autoScrollDisableTimeoutRef.current) {
          clearTimeout(autoScrollDisableTimeoutRef.current);
        }

        // Use normal highlight logic
        dispatch(
          updateHighlight({
            sourceType: e.sourceType,
            identifier: e.identifier,
            additionalInfo: e.additionalInfo,
          }),
        );

        // Keep auto-scroll disabled longer for knowledge cards to completely prevent scrolling
        autoScrollDisableTimeoutRef.current = setTimeout(() => {
          setIsAutoScrollDisabled(false);
          isAutoScrollDisabledRef.current = false; // Re-enable immediate ref
          autoScrollDisableTimeoutRef.current = null;
          console.log(
            "📝 [CodeAware] Re-enabled auto-scroll after knowledge card highlight",
          );
        }, 3000); // Even longer delay to ensure no auto-scroll occurs

        return;
      }

      // Normal highlight logic for other types
      if (!e.additionalInfo) {
        dispatch(
          updateHighlight({
            sourceType: e.sourceType,
            identifier: e.identifier,
          }),
        );
      } else {
        dispatch(
          updateHighlight({
            sourceType: e.sourceType,
            identifier: e.identifier,
            additionalInfo: e.additionalInfo,
          }),
        );
      }
    },
    [dispatch, allMappings, codeChunks, logger],
  );

  const removeHighlightEvent = useCallback(async () => {
    await logger.addLogEntry("user_clear_all_highlights", {
      timestamp: new Date().toISOString(),
    });

    // Re-enable auto-scroll when highlights are cleared
    setIsAutoScrollDisabled(false);
    isAutoScrollDisabledRef.current = false; // Clear immediate ref
    if (autoScrollDisableTimeoutRef.current) {
      clearTimeout(autoScrollDisableTimeoutRef.current);
      autoScrollDisableTimeoutRef.current = null;
    }
    // Dispatch action to clear all highlights
    dispatch(clearAllHighlights());
  }, [dispatch, logger]);

  // Add new functions for step operations
  const executeUntilStep = useCallback(
    async (stepId: string) => {
      // Disable in code edit mode
      if (isCodeEditModeEnabled) {
        console.warn("⚠️ Code execution is disabled in code edit mode");
        return;
      }

      console.log(`执行到步骤: ${stepId}`);

      // Log step execution
      await logger.addLogEntry("user_start_execute_steps", {
        stepId,
        timestamp: new Date().toISOString(),
      });

      try {
        // 1. 根据step_id获取截止到该步骤的所有未执行步骤信息
        const targetStepIndex = steps.findIndex((step) => step.id === stepId);
        if (targetStepIndex === -1) {
          console.error(`Step with id ${stepId} not found`);
          await logger.addLogEntry("user_execute_steps_error", {
            stepId,
            error: "Step not found",
          });
          return;
        }

        // 获取从开始到目标步骤的所有未执行步骤（stepStatus 不是 "generated"）
        const unexecutedSteps = steps
          .slice(0, targetStepIndex + 1)
          .filter((step) => step.stepStatus !== "generated");

        // 获取所有已生成的步骤（stepStatus 是 "generated"）
        const generatedSteps = steps.filter(
          (step) => step.stepStatus === "generated",
        );

        // 设置未执行步骤的状态为"generating"
        for (const step of unexecutedSteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "generating" }));
        }

        // 提取未执行步骤信息
        const stepsInfo = unexecutedSteps.map((step) => ({
          id: step.id,
          title: step.title,
          abstract: step.abstract,
          knowledgeCards: step.knowledgeCards.map((card) => ({
            id: card.id,
            title: card.title,
          })),
        }));

        console.log("📋 未执行的步骤信息:", stepsInfo);
        console.log("📋 已生成的步骤数量:", generatedSteps.length);

        if (unexecutedSteps.length === 0) {
          console.log("All steps up to target already executed");
          await logger.addLogEntry("user_execute_steps_completed", {
            stepId,
            message: "All steps already executed",
          });
          return;
        }

        await logger.addLogEntry("user_execute_steps_batch_started", {
          stepId,
          unexecutedStepsCount: unexecutedSteps.length,
          unexecutedStepIds: unexecutedSteps.map((s) => s.id),
        });

        // 2. 通过ideMessenger获取当前文件的所有代码（如果有打开的文件）
        // 如果没有打开的文件，将由agent通过tool calling创建新文件
        let currentFile = null;
        const currentFileResponse = await ideMessenger?.request(
          "getCurrentFile",
          undefined,
        );

        if (currentFileResponse && currentFileResponse.status === "success") {
          currentFile = currentFileResponse.content;
        }

        // 如果没有当前文件，创建一个默认的文件对象
        // Agent将通过tool calling来创建实际的文件
        if (!currentFile) {
          console.log("💡 没有打开的文件，agent将通过tool calling创建新文件");
          currentFile = {
            path: "untitled.ts", // 默认文件名，agent可以通过tool指定其他名称
            isUntitled: true,
            contents: "", // 从空文件开始
          };
          await logger.addLogEntry("user_execute_steps_no_file", {
            stepId,
            message: "No current file, agent will create one via tool calling",
          });
        }

        console.log("📁 当前文件信息:", {
          path: currentFile.path,
          isUntitled: currentFile.isUntitled,
          contentLength: currentFile.contents?.length || 0,
        });

        // 3. 收集已生成步骤的对应代码信息
        const previouslyGeneratedStepsInfo = await Promise.all(
          generatedSteps.map(async (step) => {
            // 获取该步骤对应的代码内容
            const correspondingCode = await getStepCorrespondingCode(
              step.id,
              allMappings,
              codeChunks,
              ideMessenger,
            );

            return {
              id: step.id,
              title: step.title,
              abstract: step.abstract, // Add the missing abstract property
              knowledge_cards: step.knowledgeCards.map((card) => ({
                id: card.id,
                title: card.title,
              })),
              current_corresponding_code: correspondingCode,
            };
          }),
        );

        console.log(
          "📋 已生成步骤的对应代码信息:",
          previouslyGeneratedStepsInfo.map((step) => ({
            id: step.id,
            title: step.title,
            codeLength: step.current_corresponding_code?.length || 0,
          })),
        );

        // 4. 调用新的代码生成thunk
        const orderedSteps = stepsInfo.map((step) => ({
          id: step.id,
          title: step.title,
          abstract: step.abstract,
          knowledge_cards: step.knowledgeCards.map((kc) => ({
            id: kc.id,
            title: kc.title,
          })),
        }));

        console.log("🚀 开始生成代码...");
        const result = await dispatch(
          generateCodeFromSteps({
            existingCode: currentFile.contents || "",
            filepath: currentFile.path,
            orderedSteps: orderedSteps,
            previouslyGeneratedSteps:
              previouslyGeneratedStepsInfo.length > 0
                ? previouslyGeneratedStepsInfo
                : undefined,
          }),
        );

        if (generateCodeFromSteps.fulfilled.match(result)) {
          console.log("✅ 代码生成完成!", result.payload);
          // 注意：generateCodeFromSteps已在内部设置步骤状态为"generated"
          // 和调用checkAndUpdateHighLevelStepCompletion，无需在此重复

          console.log("✨ 代码生成和步骤状态更新已完成，可以继续其他操作");
        } else if (generateCodeFromSteps.rejected.match(result)) {
          console.error("❌ 代码生成失败:", result.error.message);
          // 恢复步骤状态为"confirmed"并显示错误提示
          for (const step of unexecutedSteps) {
            dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
          }
          // 显示错误提示
          ideMessenger?.post("showToast", ["error", "代码生成失败，请重试。"]);
        }
      } catch (error) {
        console.error("❌ 执行到步骤时发生错误:", error);
        await logger.addLogEntry("user_execute_steps_error", {
          stepId,
          error: error instanceof Error ? error.message : String(error),
        });
        // 恢复相关步骤状态为"confirmed"
        const targetStepIndex = steps.findIndex((step) => step.id === stepId);
        if (targetStepIndex !== -1) {
          const unexecutedSteps = steps
            .slice(0, targetStepIndex + 1)
            .filter((step) => step.stepStatus !== "generated");
          for (const step of unexecutedSteps) {
            dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
          }
        }
        // 显示错误提示
        ideMessenger?.post("showToast", [
          "error",
          "代码生成过程中发生错误，请重试。",
        ]);
      }
    },
    [
      steps,
      ideMessenger,
      dispatch,
      isCodeEditModeEnabled,
      allMappings,
      codeChunks,
      logger,
    ],
  );

  // Handle rerun step when step is dirty
  const handleRerunStep = useCallback(
    async (stepId: string) => {
      // Disable in code edit mode
      if (isCodeEditModeEnabled) {
        console.warn("⚠️ Step rerun is disabled in code edit mode");
        return;
      }

      console.log(`重新运行步骤: ${stepId}`);

      await logger.addLogEntry("user_start_rerun_step", {
        stepId,
        timestamp: new Date().toISOString(),
      });

      try {
        // 找到对应的步骤
        const step = steps.find((s) => s.id === stepId);
        if (!step) {
          console.error(`Step with id ${stepId} not found`);
          await logger.addLogEntry("user_rerun_step_error", {
            stepId,
            error: "Step not found",
          });
          return;
        }

        // 只有在step_dirty状态下才允许重新运行
        if (step.stepStatus !== "step_dirty") {
          console.warn(
            `Step ${stepId} is not in step_dirty status, current status: ${step.stepStatus}`,
          );
          await logger.addLogEntry("user_rerun_step_error", {
            stepId,
            error: `Invalid step status: ${step.stepStatus}, expected: step_dirty`,
          });
          return;
        }

        // 设置状态为generating
        dispatch(setStepStatus({ stepId, status: "generating" }));

        // 获取当前文件内容
        const currentFileResponse = await ideMessenger?.request(
          "getCurrentFile",
          undefined,
        );

        if (
          !currentFileResponse ||
          currentFileResponse.status !== "success" ||
          !currentFileResponse.content
        ) {
          throw new Error("无法获取当前文件内容");
        }

        const currentFile = currentFileResponse.content;
        const filepath = currentFile.path;
        const existingCode = currentFile.contents;

        // 使用修改后的abstract作为新的步骤描述
        const changedStepAbstract = step.abstract;

        // 调用rerunStep thunk
        await dispatch(
          rerunStep({
            stepId,
            changedStepAbstract,
            existingCode,
            filepath,
          }),
        ).unwrap();

        // 成功完成后设置状态为generated
        dispatch(setStepStatus({ stepId, status: "generated" }));

        // 检查并更新高级步骤的完成状态
        dispatch(checkAndUpdateHighLevelStepCompletion());

        console.log("✅ 步骤重新运行成功");
        ideMessenger?.post("showToast", ["info", "步骤重新运行成功！"]);

        await logger.addLogEntry("user_rerun_step_completed", {
          stepId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ 重新运行步骤时发生错误:", error);
        await logger.addLogEntry("user_rerun_step_error", {
          stepId,
          error: error instanceof Error ? error.message : String(error),
        });
        // 恢复状态
        dispatch(setStepStatus({ stepId, status: "step_dirty" }));
        ideMessenger?.post("showToast", [
          "error",
          "重新生成代码失败，请重试。",
        ]);
      }
    },
    [steps, dispatch, ideMessenger, isCodeEditModeEnabled, logger],
  );

  const handleStepEdit = useCallback(
    async (stepId: string, newContent: string) => {
      // Disable in code edit mode
      if (isCodeEditModeEnabled) {
        console.warn("⚠️ Step editing is disabled in code edit mode");
        return;
      }

      await logger.addLogEntry("user_edit_step_content", {
        stepId,
        newContent: newContent.substring(0, 200), // Log first 200 chars to avoid huge logs
        timestamp: new Date().toISOString(),
      });

      // Update step abstract in Redux store
      dispatch(setStepAbstract({ stepId, abstract: newContent }));
    },
    [dispatch, isCodeEditModeEnabled, logger],
  );

  const handleStepStatusChange = useCallback(
    async (stepId: string, newStatus: StepStatus) => {
      await logger.addLogEntry("user_change_step_status", {
        stepId,
        newStatus,
        timestamp: new Date().toISOString(),
      });

      // Update step status in Redux store
      dispatch(setStepStatus({ stepId, status: newStatus }));
    },
    [dispatch, logger],
  );

  const handleStepExpansionChange = useCallback(
    async (stepId: string, isExpanded: boolean) => {
      console.log(`Step ${stepId} expansion changed to: ${isExpanded}`);

      if (isExpanded) {
        // When a step is expanded, immediately set it as the currently expanded step
        // This ensures the step stays expanded while other steps are collapsed
        setCurrentlyExpandedStepId(stepId);

        // 检查知识卡片是否有代码映射，如果没有则生成映射
        try {
          await dispatch(checkAndMapKnowledgeCardsToCode({ stepId }));
          console.log(`✅ 完成步骤 ${stepId} 的知识卡片代码映射检查`);
        } catch (error) {
          console.warn(`⚠️ 步骤 ${stepId} 的知识卡片代码映射检查失败:`, error);
          // 不抛出错误，让展开操作继续进行
        }
      } else {
        // When a step is collapsed, clear the currently expanded step if it's this one
        setCurrentlyExpandedStepId((prev) => (prev === stepId ? null : prev));

        // Also remove from both force expanded sets when manually collapsed
        setForceExpandedSteps((prev) => {
          const newSet = new Set(prev);
          newSet.delete(stepId);
          return newSet;
        });
        setGlobalQuestionExpandedSteps((prev) => {
          const newSet = new Set(prev);
          newSet.delete(stepId);
          return newSet;
        });
      }
    },
    [
      dispatch,
      logger,
      setCurrentlyExpandedStepId,
      setForceExpandedSteps,
      setGlobalQuestionExpandedSteps,
    ],
  );

  const handleQuestionSubmit = useCallback(
    async (stepId: string, selectedText: string, question: string) => {
      console.log("处理步骤问题提交:", { stepId, selectedText, question });

      await logger.addLogEntry("user_submit_question", {
        stepId,
        selectedText: selectedText.substring(0, 200), // Log first 200 chars
        question: question.substring(0, 200), // Log first 200 chars
        timestamp: new Date().toISOString(),
      });

      // 通过stepId查找对应的步骤信息
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        console.error("未找到对应的步骤:", stepId);
        await logger.addLogEntry("user_submit_question_error", {
          stepId,
          error: "Step not found",
        });
        return;
      }

      // 获取现有的知识卡片主题（直接从step中获取）
      const existingThemes = step.knowledgeCards.map((kc) => kc.title);

      // 获取学习目标和任务描述
      const taskDescription = task?.requirementDescription || "";

      try {
        // 调用新的 thunk 来生成知识卡片主题
        const result = await dispatch(
          generateKnowledgeCardThemesFromQuery({
            stepId,
            queryContext: {
              selectedCode: "", // 可以后续扩展从IDE获取选中的代码
              selectedText: selectedText || "",
              query: question,
            },
            currentStep: {
              title: step.title,
              abstract: step.abstract,
            },
            existingThemes,
            learningGoal: learningGoal || "",
            task: taskDescription,
          }),
        );

        // 如果生成成功，设置状态为checked
        if (generateKnowledgeCardThemesFromQuery.fulfilled.match(result)) {
          dispatch(
            setKnowledgeCardGenerationStatus({
              stepId,
              status: "ready",
            }),
          );
          console.log(
            "✅ Knowledge card themes generated successfully, status set to checked",
          );

          await logger.addLogEntry("user_submit_question_completed", {
            stepId,
            timestamp: new Date().toISOString(),
          });
        } else if (
          generateKnowledgeCardThemesFromQuery.rejected.match(result)
        ) {
          console.error(
            "❌ Failed to generate knowledge card themes:",
            result.error.message,
          );
          await logger.addLogEntry("user_submit_question_error", {
            stepId,
            error:
              result.error.message ||
              "Failed to generate knowledge card themes",
          });
          // 如果生成失败，保持generating状态或设置为empty
          dispatch(
            setKnowledgeCardGenerationStatus({
              stepId,
              status: "empty",
            }),
          );
        }
      } catch (error) {
        console.error("❌ Error in handleQuestionSubmit:", error);
        await logger.addLogEntry("user_submit_question_error", {
          stepId,
          error: error instanceof Error ? error.message : String(error),
        });
        dispatch(
          setKnowledgeCardGenerationStatus({
            stepId,
            status: "empty",
          }),
        );
      }
    },
    [steps, learningGoal, task, dispatch, logger],
  );

  // Handle global question submission
  const handleGlobalQuestionSubmit = useCallback(
    async (question: string) => {
      console.log("处理全局提问:", { question });

      setIsGlobalQuestionLoading(true);

      await logger.addLogEntry("user_submit_global_question", {
        question: question.substring(0, 200), // Log first 200 chars
        timestamp: new Date().toISOString(),
      });

      try {
        // 获取当前代码
        const currentFileResponse = await ideMessenger?.request(
          "getCurrentFile",
          undefined,
        );

        if (
          !currentFileResponse ||
          currentFileResponse.status !== "success" ||
          !currentFileResponse.content
        ) {
          throw new Error("无法获取当前文件内容");
        }

        const currentCode = currentFileResponse.content.contents || "";

        // 调用全局提问处理thunk
        const result = await dispatch(
          processGlobalQuestion({
            question,
            currentCode,
          }),
        );

        if (processGlobalQuestion.fulfilled.match(result)) {
          const { selectedStepId, themes, knowledgeCardIds } = result.payload;

          console.log("✅ Global question processed successfully:", {
            selectedStepId,
            themes,
            knowledgeCardIds,
          });

          // 关闭对话框
          setIsGlobalQuestionModalOpen(false);

          // 高亮选择的步骤
          dispatch(
            updateHighlight({
              sourceType: "step",
              identifier: selectedStepId,
            }),
          );

          // 强制展开该步骤
          setForceExpandedSteps((prev) => new Set([...prev, selectedStepId]));
          setGlobalQuestionExpandedSteps(
            (prev) => new Set([...prev, selectedStepId]),
          ); // Mark as global question expanded
          setCurrentlyExpandedStepId(selectedStepId);

          // 高亮生成的知识卡片
          // 给知识卡片一些时间被创建，然后高亮它们
          setTimeout(() => {
            knowledgeCardIds.forEach((cardId) => {
              dispatch(
                updateHighlight({
                  sourceType: "knowledgeCard",
                  identifier: cardId,
                }),
              );
            });
          }, 100);

          // 显示成功消息
          ideMessenger?.post("showToast", [
            "info",
            `已为您找到相关步骤并生成了 ${themes.length} 个知识卡片主题`,
          ]);

          await logger.addLogEntry("user_submit_global_question_completed", {
            selectedStepId,
            themesCount: themes.length,
            knowledgeCardIds,
            stepExpanded: true, // Log that step was expanded
            timestamp: new Date().toISOString(),
          });
        } else if (processGlobalQuestion.rejected.match(result)) {
          console.error(
            "❌ Failed to process global question:",
            result.error.message,
          );
          await logger.addLogEntry("user_submit_global_question_error", {
            error: result.error.message || "Failed to process global question",
          });

          ideMessenger?.post("showToast", [
            "error",
            "处理问题时发生错误，请重试",
          ]);
        }
      } catch (error) {
        console.error("❌ Error in handleGlobalQuestionSubmit:", error);
        await logger.addLogEntry("user_submit_global_question_error", {
          error: error instanceof Error ? error.message : String(error),
        });

        ideMessenger?.post("showToast", [
          "error",
          "处理问题时发生错误，请重试",
        ]);
      } finally {
        setIsGlobalQuestionLoading(false);
      }
    },
    [
      dispatch,
      ideMessenger,
      logger,
      setForceExpandedSteps,
      setCurrentlyExpandedStepId,
    ],
  );

  // Handle opening global question modal
  const handleOpenGlobalQuestion = useCallback(async () => {
    console.log("打开全局提问对话框");

    await logger.addLogEntry("user_open_global_question_modal", {
      timestamp: new Date().toISOString(),
    });

    setIsGlobalQuestionModalOpen(true);
  }, [logger]);

  // Handle closing global question modal
  const handleCloseGlobalQuestion = useCallback(async () => {
    console.log("关闭全局提问对话框");

    await logger.addLogEntry("user_close_global_question_modal", {
      timestamp: new Date().toISOString(),
    });

    setIsGlobalQuestionModalOpen(false);
  }, [logger]);

  // Add webview listener for questions from code selection
  useWebviewListener(
    "codeAwareQuestionFromSelection",
    async (data: {
      selectedCode: string;
      selectedText: string;
      question: string;
      filePath: string;
      selectedLines: [number, number];
      contextInfo: {
        fileName: string;
        language: string;
      };
    }) => {
      console.log(
        "📝 [CodeAware] Received question from code selection:",
        data,
      );

      await logger.addLogEntry("user_trigger_question_from_code_selection", {
        selectedText: data.selectedText.substring(0, 200),
        question: data.question.substring(0, 200),
        filePath: data.filePath,
        selectedLines: data.selectedLines,
        fileName: data.contextInfo.fileName,
        language: data.contextInfo.language,
        timestamp: new Date().toISOString(),
      });

      try {
        // 检查是否有活跃的步骤，如果没有则提示用户
        if (steps.length === 0) {
          await logger.addLogEntry(
            "user_trigger_question_from_code_selection_error",
            {
              error: "No steps available",
            },
          );
          ideMessenger?.post("showToast", [
            "warning",
            "请先在 CodeAware 中设置项目需求，然后生成步骤。",
          ]);
          return;
        }

        // 根据选中范围和mapping找到最直接对应的step
        const targetStepId = findMostRelevantStepForSelection(
          data.filePath,
          data.selectedLines,
          allMappings,
          codeChunks,
          steps,
        );

        let stepIdToUse: string;
        if (!targetStepId) {
          // 如果没有找到直接对应的step，使用最后一个步骤
          const lastStep = steps[steps.length - 1];
          stepIdToUse = lastStep.id;
          console.log(
            "🔍 [CodeAware] No direct mapping found, using last step:",
            stepIdToUse,
          );

          await logger.addLogEntry("user_check_code_step_mappings", {
            result: "no_direct_mapping",
            selectedStepId: stepIdToUse,
          });
        } else {
          stepIdToUse = targetStepId;
          console.log("🎯 [CodeAware] Found most relevant step:", stepIdToUse);

          await logger.addLogEntry("user_check_code_step_mappings", {
            result: "direct_mapping_found",
            selectedStepId: stepIdToUse,
          });
        }

        // 设置知识卡片生成状态为generating
        dispatch(
          setKnowledgeCardGenerationStatus({
            stepId: stepIdToUse,
            status: "generating",
          }),
        );

        // 强制展开该步骤
        setForceExpandedSteps((prev) => new Set(prev).add(stepIdToUse));

        // 提交问题生成知识卡片
        handleQuestionSubmit(stepIdToUse, data.selectedText, data.question);

        // 显示成功提示
        ideMessenger?.post("showToast", [
          "info",
          `Questions added. Generating knowledge cards...`,
        ]);

        await logger.addLogEntry(
          "user_trigger_question_from_code_selection_completed",
          {
            stepId: stepIdToUse,
            timestamp: new Date().toISOString(),
          },
        );
      } catch (error) {
        console.error(
          "❌ [CodeAware] Failed to process question from selection:",
          error,
        );
        await logger.addLogEntry(
          "user_trigger_question_from_code_selection_error",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        ideMessenger?.post("showToast", [
          "error",
          "处理问题时发生错误，请重试。",
        ]);
      }
    },
    [
      steps,
      allMappings,
      codeChunks,
      handleQuestionSubmit,
      ideMessenger,
      dispatch,
      setForceExpandedSteps,
    ],
  );

  // Add keyboard event listener for Escape key to clear highlights
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        removeHighlightEvent();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [removeHighlightEvent]);

  // Handle IDE communication for highlights
  useEffect(() => {
    if (shouldClearIdeHighlights) {
      // Clear all highlights in IDE
      try {
        ideMessenger?.post("clearCodeHighlight", undefined);
      } catch (error) {
        console.error("Failed to clear highlights in IDE:", error);
      }
      // Reset the flag
      dispatch(resetIdeCommFlags());
    }
  }, [shouldClearIdeHighlights, ideMessenger, dispatch]);

  useEffect(() => {
    console.log("Code chunks to highlight in IDE:", codeChunksToHighlightInIde);
    if (codeChunksToHighlightInIde.length > 0) {
      try {
        // Use the new highlightCodeChunks method to avoid merging
        ideMessenger?.post("highlightCodeChunks", codeChunksToHighlightInIde);
      } catch (error) {
        console.error("Failed to highlight code chunks in IDE:", error);
      }

      // Reset the flag
      dispatch(resetIdeCommFlags());
    }
  }, [codeChunksToHighlightInIde, ideMessenger, dispatch]);

  // Cleanup effect for auto-scroll disable timeout
  useEffect(() => {
    return () => {
      if (autoScrollDisableTimeoutRef.current) {
        clearTimeout(autoScrollDisableTimeoutRef.current);
        autoScrollDisableTimeoutRef.current = null;
      }
      isAutoScrollDisabledRef.current = false; // Reset ref on cleanup
    };
  }, []);

  return (
    <CodeAwareDiv
      ref={codeAwareDivRef}
      onClick={(e) => {
        // Check if the click is on the main container itself (not a child)
        if (e.target === e.currentTarget) {
          removeHighlightEvent();
        }
      }}
    >
      {/* CodeAware Header with Edit Mode Toggle - 固定在顶部 */}
      <PageHeader
        title={displayTitle}
        onGlobalQuestion={handleOpenGlobalQuestion}
        showGlobalQuestionButton={
          userRequirementStatus === "finalized" && steps.length > 0
        }
        rightContent={
          <CodeEditModeToggle
            onRegenerateCode={handleRegenerateCode}
            showRegenerateCode={userRequirementStatus === "finalized"}
          />
        }
      />

      {/* RequirementSummary - 只在 RequirementDisplay 不可见且不在编辑模式且需求已确认时显示 */}
      {!isRequirementDisplayVisible &&
        !isEditMode &&
        userRequirementStatus === "finalized" && (
          <RequirementDisplayHorizontal
            onChunkFocus={handleHighlightEvent}
            onClearHighlight={removeHighlightEvent}
          />
        )}

      {/* Debug panel for CodeAware streaming output */}
      <div className="mt-2 px-4">
        <button
          className="rounded border border-gray-600 bg-[#0b1224] px-2 py-1 text-xs text-gray-100 hover:bg-[#111a30]"
          onClick={() => setShowDebugPanel((v) => !v)}
        >
          {showDebugPanel ? "隐藏 Debug 面板" : "显示 Debug 面板"} (
          {codeGenDebugLogs.length})
        </button>
        {showDebugPanel && (
          <div className="mt-2 max-h-64 space-y-1 overflow-auto rounded border border-gray-700 bg-[#0b1224] p-2 font-mono text-xs text-gray-100">
            {codeGenDebugLogs.length === 0 ? (
              <div className="text-gray-400">暂无流式输出</div>
            ) : (
              codeGenDebugLogs.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap break-words">
                  {line}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 可滚动的内容区域 */}
      <ScrollableContent ref={scrollableContentRef}>
        {/* Requirement Section */}
        {isEditMode ? (
          <RequirementEditor
            onConfirm={AIHandleRequirementConfirmation}
            onContentChange={handleRequirementContentChange}
            disabled={isCodeEditModeEnabled} // Disable in code edit mode
          />
        ) : (
          <div ref={requirementDisplayRef}>
            <RequirementDisplay
              onEdit={handleEditRequirement}
              onChunkFocus={handleHighlightEvent} // Pass the highlight event handler
              onClearHighlight={removeHighlightEvent} // Pass the clear highlight function
              disabled={isCodeEditModeEnabled} // Disable in code edit mode
            />
          </div>
        )}

        {isStepsGenerated && (
          <div className={`pt-[8px] ${steps.length > 0 ? "flex-1" : ""}`}>
            {steps.map((step: StepItem, index: Key | null | undefined) => {
              // 从预先计算的 Map 中获取该步骤对应的高级步骤序号
              const highLevelStepIndex =
                stepToHighLevelIndexMap.get(step.id) ?? null;

              return (
                <Step
                  key={step.id} // Use step.id for proper React tracking
                  title={step.title}
                  content={step.abstract}
                  highLevelStepIndex={highLevelStepIndex}
                  isHighlighted={step.isHighlighted}
                  stepId={step.id}
                  stepStatus={step.stepStatus}
                  knowledgeCardGenerationStatus={
                    step.knowledgeCardGenerationStatus
                  } // Pass knowledge card generation status
                  forceExpanded={forceExpandedSteps.has(step.id)} // Force expand when marked for expansion
                  shouldCollapse={
                    currentlyExpandedStepId !== null &&
                    currentlyExpandedStepId !== step.id &&
                    !forceExpandedSteps.has(step.id) &&
                    !globalQuestionExpandedSteps.has(step.id)
                  } // Don't collapse force expanded or global question expanded steps
                  onHighlightEvent={handleHighlightEvent}
                  onClearHighlight={removeHighlightEvent} // Pass the clear highlight function
                  onExecuteUntilStep={executeUntilStep} // Pass execute until step function
                  onRerunStep={handleRerunStep} // Pass rerun step function
                  onStepEdit={handleStepEdit} // Pass step edit function
                  onStepStatusChange={handleStepStatusChange} // Pass step status change function
                  onStepExpansionChange={handleStepExpansionChange} // Pass step expansion change function
                  onGenerateKnowledgeCardThemes={
                    handleGenerateKnowledgeCardThemes
                  } // Pass knowledge card themes generation function
                  onDisableKnowledgeCard={handleDisableKnowledgeCard} // Pass knowledge card disable function
                  onQuestionSubmit={handleQuestionSubmit} // Pass question submit function
                  onRegisterRef={registerStepRef} // Pass step ref registration function
                  disabled={isCodeEditModeEnabled} // Disable in code edit mode
                  knowledgeCards={step.knowledgeCards.map(
                    (kc: KnowledgeCardItem, kcIndex: number) => {
                      // 使用testStatesMap获取测试项目数据
                      const testItems =
                        kc.tests?.map((test) => {
                          const testState = testStatesMap.get(test.id) || {
                            isLoading: false,
                            result: undefined,
                          };

                          return {
                            id: test.id,
                            questionType: test.questionType,
                            // MCQ specific props
                            mcqQuestion:
                              test.questionType === "multipleChoice" &&
                              test.question.type === "multipleChoice"
                                ? test.question.stem
                                : undefined,
                            mcqOptions:
                              test.questionType === "multipleChoice" &&
                              test.question.type === "multipleChoice"
                                ? test.question.options
                                : undefined,
                            mcqCorrectAnswer:
                              test.questionType === "multipleChoice" &&
                              test.question.type === "multipleChoice"
                                ? test.question.standard_answer
                                : undefined,
                            // SAQ specific props
                            saqQuestion:
                              test.questionType === "shortAnswer" &&
                              test.question.type === "shortAnswer"
                                ? test.question.stem
                                : undefined,
                            saqAnswer:
                              test.questionType === "shortAnswer" &&
                              test.question.type === "shortAnswer"
                                ? test.question.standard_answer
                                : undefined,
                            // Loading and result state
                            isLoading: testState.isLoading,
                            result: testState.result,
                          };
                        }) || [];

                      return {
                        title: kc.title,
                        markdownContent: kc.content || "", // 提供默认空字符串
                        testItems: testItems, // 传递所有测试项目

                        // Highlight props
                        isHighlighted: kc.isHighlighted,
                        cardId: kc.id || `${step.id}-card-${kcIndex}`,

                        // Disabled state
                        disabled: kc.disabled,

                        // Loading states
                        isTestsLoading: (kc as any).isTestsLoading || false, // 获取测试题加载状态

                        // 事件处理函数
                        onMcqSubmit: (
                          testId: string,
                          isCorrect: boolean,
                          selectedOption: string,
                        ) => {
                          console.log(
                            `MCQ Result for ${kc.title} (Test ${testId}): ${isCorrect ? "Correct" : "Incorrect"}, Selected: ${selectedOption}`,
                          );
                          // TODO: 实现 MCQ 提交逻辑，更新测试结果到 Redux store
                        },

                        onSaqSubmit: (testId: string, answer: string) => {
                          console.log(
                            `SAQ Answer for ${kc.title} (Test ${testId}): ${answer}`,
                          );
                          // 调用处理SAQ提交的thunk
                          dispatch(
                            processSaqSubmission({
                              testId,
                              userAnswer: answer,
                            }),
                          );
                        },

                        // Default states - 只有title时默认折叠
                        defaultTestMode: false,
                        defaultExpanded: Boolean(kc.content), // 有内容时展开，只有title时折叠

                        // Lazy loading props
                        stepId: step.id,
                        learningGoal: learningGoal,
                        codeContext: kc.codeContext || "",
                        onGenerateContent: handleGenerateKnowledgeCardContent,
                        onGenerateTests: handleGenerateKnowledgeCardTests, // 新增：测试题生成回调
                      };
                    },
                  )}
                  // isActive can be determined by currentFocusedFlowId if needed
                  // isActive={step.id === currentFocusedFlowId}
                />
              );
            })}
          </div>
        )}
      </ScrollableContent>

      {/* Loading Overlay */}
      {(isGeneratingSteps || hasGeneratingSteps || hasCodeDirtySteps) && (
        <LoadingOverlay>
          <SpinnerIcon />
        </LoadingOverlay>
      )}

      {/* Session Info Dialog */}
      <SessionInfoDialog
        isOpen={isSessionDialogOpen}
        onSubmit={handleSessionInfoSubmit}
        onCancel={handleSessionInfoCancel}
      />

      {/* Global Question Modal */}
      <GlobalQuestionModal
        isOpen={isGlobalQuestionModalOpen}
        onClose={handleCloseGlobalQuestion}
        onSubmit={handleGlobalQuestionSubmit}
        isLoading={isGlobalQuestionLoading}
      />
    </CodeAwareDiv>
  );
};

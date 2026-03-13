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
import {
  applyKnowledgeCardInteraction,
  emitMasteryUpdateLogs,
  KnowledgeCardInteraction,
} from "../../redux/cognitive/masteryTrackingEngine";
import { routeCognitiveTrigger } from "../../redux/cognitive/triggerRouter";
import { CognitiveInteractionEvent } from "../../redux/cognitive/types";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  clearAllCodeAndMappings,
  clearAllHighlights,
  newCodeAwareSession,
  recordCognitiveEvent,
  resetIdeCommFlags,
  resetSessionExceptRequirement,
  selectCodeAwareSessionState,
  selectCognitiveTrace,
  selectCurrentSessionId,
  selectIsRequirementInEditMode,
  selectIsStepsGenerated,
  selectLearningGoal,
  selectTask,
  selectTitle,
  setKnowledgeCardDisabled,
  setKnowledgeCardFeedback,
  setKnowledgeCardGenerationStatus,
  setKnowledgeCardViewMode,
  setLatestIntentForStep,
  setNodeMasteryScores,
  setStepAbstract,
  setStepStatus,
  setUserRequirementStatus,
  submitRequirementContent,
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
  getStepCorrespondingCode,
  processGlobalQuestion,
  processSaqSubmission,
  rerunStep,
} from "../../redux/thunks/codeAwareGeneration";
import {
  executeInitialGeneration,
  exportKnowledgeStateArtifacts,
} from "../../redux/thunks/initialGeneration";
import {
  establishCodeToSemanticMapping,
  establishSemanticToCodeMapping,
} from "../../redux/thunks/mappingLookup"; // 新的接口
import { useCodeAwareLogger } from "../../util/codeAwareWebViewLogger";
import { buildCodeAwareCognitiveEdges } from "../../utils/codeAwareRelationGraph";
import "./CodeAware.css";
import GlobalQuestionModal from "./components/QuestionPopup/GlobalQuestionModal";
import RequirementDisplay from "./components/Requirements/RequirementDisplay"; // Import RequirementDisplay
import RequirementDisplayHorizontal from "./components/Requirements/RequirementDisplayHorizontal"; // Import RequirementDisplayHorizontal
import RequirementEditor from "./components/Requirements/RequirementEditor"; // Import RequirementEditor
import Step from "./components/Steps/Step"; // Import Step
import { NavigationButtons } from "./components/ToolBar/NavigationButtons"; // Import NavigationButtons
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

const LoadingCard = styled.div`
  min-width: 360px;
  max-width: 560px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const LoadingTitle = styled.div`
  color: var(--vscode-editor-foreground);
  font-size: 14px;
  font-weight: 600;
`;

const LoadingPhase = styled.div`
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
`;

const LoadingErrorBox = styled.div`
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px;
  padding: 8px;
  background: var(--vscode-inputValidation-errorBackground);
  color: var(--vscode-errorForeground);
  font-size: 12px;
`;

const LoadingActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const RetryButton = styled.button`
  border: 1px solid var(--vscode-button-border);
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--vscode-button-hoverBackground);
  }
`;

const HeaderActionButton = styled.button`
  border: 1px solid var(--vscode-button-border);
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 8px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 999px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $progress: number }>`
  height: 100%;
  width: ${(props) => `${Math.max(0, Math.min(100, props.$progress))}%`};
  background: var(--vscode-progressBar-background);
  transition: width 240ms ease;
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
  const [isExportingKnowledgeState, setIsExportingKnowledgeState] =
    useState(false);

  // Navigation buttons state
  const [isMappingLookupInProgress, setIsMappingLookupInProgress] =
    useState(false);

  // Track code selection state
  const [currentCodeSelection, setCurrentCodeSelection] = useState<{
    filePath: string;
    selectedLines: [number, number];
    selectedContent: string;
  } | null>(null);

  // Listen to code selection events from IDE
  useWebviewListener("codeSelectionChanged", async (data) => {
    console.log("[CA:UI] 代码选中变化:", data);
    setCurrentCodeSelection(data);
  });

  useWebviewListener("codeSelectionCleared", async () => {
    console.log("[CA:UI] 代码选中已清除");
    setCurrentCodeSelection(null);
  });

  //CodeAware: 增加一个指令，使得可以发送当前所选择的知识卡片id
  //CATODO: 参照着codeContextProvider的实现，利用上getAllSnippets的获取最近代码的功能，然后再通过coreToWebview的路径发送更新过来。

  //从redux中获取项目需求相关的数据
  // 当前requirement部分应该使用
  const isEditMode = useAppSelector(selectIsRequirementInEditMode);
  const isStepsGenerated = useAppSelector(selectIsStepsGenerated); // Use the selector
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
  const codeAwareSessionState = useAppSelector(selectCodeAwareSessionState);

  // Get high level steps for navigation
  const highLevelSteps = useAppSelector(
    (state) => state.codeAwareSession.highLevelSteps,
  );

  // 从 Redux 中获取步骤到高级步骤的映射
  const stepToHighLevelMappings = useAppSelector(
    (state) => state.codeAwareSession.stepToHighLevelMappings,
  );

  // 根据 stepToHighLevelMappings 构建 stepId -> highLevelStepIndex 的 Map
  const stepToHighLevelIndexMap = useMemo(() => {
    const map = new Map<string, number | null>();
    stepToHighLevelMappings.forEach((mapping) => {
      map.set(mapping.stepId, mapping.highLevelStepIndex);
    });
    return map;
  }, [stepToHighLevelMappings]);

  const cognitiveTrace = useAppSelector(selectCognitiveTrace);
  const knowledgeNodeTitleById = useMemo(() => {
    return Object.fromEntries(
      codeAwareSessionState.knowledgePoints.map((point) => [
        point.id,
        point.title,
      ]),
    );
  }, [codeAwareSessionState.knowledgePoints]);

  const recordCognitiveInteraction = useCallback(
    (event: Omit<CognitiveInteractionEvent, "id" | "timestamp">) => {
      const now = Date.now();
      const eventWithTimestamp: CognitiveInteractionEvent = {
        ...event,
        id: `cog-ui-${now}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: now,
      };

      dispatch(recordCognitiveEvent(eventWithTimestamp));

      const recentEvents = cognitiveTrace.events.slice(-30);
      const nextRecentEvents = [...recentEvents, eventWithTimestamp].slice(-30);
      const decision = routeCognitiveTrigger({
        currentEvent: eventWithTimestamp,
        recentEvents: nextRecentEvents,
        stepVisitStats: cognitiveTrace.stepVisitStats,
      });

      console.info("[CognitiveTrace][Event]", {
        id: eventWithTimestamp.id,
        type: eventWithTimestamp.type,
        stepId: eventWithTimestamp.stepId,
        knowledgeCardId: eventWithTimestamp.knowledgeCardId,
        timestamp: eventWithTimestamp.timestamp,
        isoTime: new Date(eventWithTimestamp.timestamp).toISOString(),
        localTime: new Date(eventWithTimestamp.timestamp).toLocaleString(),
        recentWindowSize: nextRecentEvents.length,
      });

      console.info("[CognitiveTrace][Decision]", {
        eventType: eventWithTimestamp.type,
        targetStepId: decision.intent.targetStepId,
        reason: decision.intent.reason,
        intentTypes: decision.intent.intentTypes,
        preferredInitialView: decision.intent.preferredInitialView,
        shouldGenerateCards: decision.shouldGenerateCards,
        maxCards: decision.maxCards,
      });

      console.info("[CA:UI:PhaseG][IntentRoute]", {
        tag: "CA_PHASE_G_INTENT_ROUTE",
        eventType: eventWithTimestamp.type,
        sourceStepId: eventWithTimestamp.stepId,
        routedStepId: decision.intent.targetStepId,
        intentTypes: decision.intent.intentTypes,
        reason: decision.intent.reason,
        preferredInitialView: decision.intent.preferredInitialView,
        shouldGenerateCards: decision.shouldGenerateCards,
        maxCards: decision.maxCards,
      });

      dispatch(
        setLatestIntentForStep({
          stepId: decision.intent.targetStepId,
          summary: {
            intentTypes: decision.intent.intentTypes,
            preferredInitialView: decision.intent.preferredInitialView,
            reason: decision.intent.reason,
            updatedAt: Date.now(),
          },
        }),
      );

      return decision;
    },
    [cognitiveTrace.events, cognitiveTrace.stepVisitStats, dispatch],
  );

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

          console.log("[CA:UI] Successfully synced steps to IDE:", {
            stepsCount: steps.length,
          });
        } catch (error) {
          console.warn("[CA:UI] Failed to sync steps to IDE:", error);
        }
      };

      syncToIde();
    }
  }, [steps.length, ideMessenger]);

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
          void logger.addLogEntry("system_knowledge_card_themes_generated", {
            stepId: currentStep.id,
            stepTitle: currentStep.title,
            knowledgeCardCount: currentStep.knowledgeCards.length,
            timestamp: new Date().toISOString(),
          });

          const themeExamples = currentStep.knowledgeCards
            .slice(0, 3)
            .map((card) => card.title);
          console.log("[CA:UI] Knowledge card themes generated", {
            stepId: currentStep.id,
            stepTitle: currentStep.title,
            count: currentStep.knowledgeCards.length,
            themesExample: themeExamples,
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
          console.log("[CA:UI] Knowledge card content generated", {
            stepId: currentStep.id,
            stepTitle: currentStep.title,
            cardId: currentCard.id,
            cardTitle: currentCard.title,
            contentExample:
              currentCard.content.length > 180
                ? `${currentCard.content.slice(0, 180)}...`
                : currentCard.content,
          });
        }
      });
    });

    // Update the ref with current steps
    prevStepsRef.current = [...currentSteps];
  }, [steps, logger]);

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
          ` [CA:UI] Created and opened Python file: ${pythonFilename}`,
        );

        // Log file creation
        await logger.addLogEntry("system_create_session_file", {
          filename: pythonFilename,
          username,
          sessionName,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(" [CA:UI] Failed to create and open Python file:", error);

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

  const initialGeneration = useAppSelector(
    (state) => state.codeAwareSession.initialGeneration,
  );
  const isInitialGenerationError = initialGeneration.status === "error";
  const isInitialGenerationRunning =
    initialGeneration.status !== "idle" &&
    initialGeneration.status !== "completed" &&
    initialGeneration.status !== "error";
  const showLoadingOverlay =
    isInitialGenerationError ||
    isInitialGenerationRunning ||
    isGeneratingSteps ||
    hasGeneratingSteps ||
    hasCodeDirtySteps;

  const handleRetryInitialGeneration = useCallback(() => {
    const requirement = userRequirement?.requirementDescription?.trim() || "";
    if (!requirement) {
      return;
    }

    void logger.addLogEntry("user_retry_initial_generation", {
      requirement:
        requirement.length > 300
          ? `${requirement.substring(0, 300)}...`
          : requirement,
      timestamp: new Date().toISOString(),
    });

    dispatch(resetSessionExceptRequirement());
    dispatch(setUserRequirementStatus("confirmed"));
    void dispatch(executeInitialGeneration({ userRequirement: requirement }))
      .unwrap()
      .catch(async (error) => {
        await logger.addLogEntry("user_retry_initial_generation_failed", {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      });
  }, [dispatch, logger, userRequirement]);

  const handleExportKnowledgeState = useCallback(async () => {
    try {
      setIsExportingKnowledgeState(true);
      const result = await dispatch(exportKnowledgeStateArtifacts()).unwrap();

      ideMessenger?.post("showToast", [
        "info",
        "知识状态已导出到 .knowledge_state/ 目录",
      ]);

      await logger.addLogEntry("user_export_knowledge_state", {
        edgesPath: result.edgesPath,
        nodeMasteryPath: result.nodeMasteryPath,
        nodeIndexPath: result.nodeIndexPath,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CA:UI] 导出知识状态失败:", error);
      ideMessenger?.post("showToast", [
        "warning",
        "导出知识状态失败，请查看控制台日志。",
      ]);
    } finally {
      setIsExportingKnowledgeState(false);
    }
  }, [dispatch, ideMessenger, logger]);

  // log all the data for debugging
  useEffect(() => {
    console.log("[CA:UI] All mappings length: ", allMappings.length);
    console.log("[CA:UI] All Mappings:", allMappings);
  }, [allMappings]);

  // 设置全局样式：
  const codeAwareDivRef = useRef<HTMLDivElement>(null);

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

  // Navigation button handlers
  const handleJumpToSemantic = useCallback(async () => {
    console.log("[CA:UI:Nav] 代码 → 语义");

    try {
      setIsMappingLookupInProgress(true);

      // 1. 获取当前选中的代码
      if (!currentCodeSelection) {
        console.warn("[CA:UI] 未选中代码");
        await logger.addLogEntry("user_click_jump_to_semantic_no_selection", {
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log("[CA:UI] 当前代码选择:", currentCodeSelection);

      // 2. 使用新的通用接口查找语义元素（支持实时读取和缓存验证）
      const result = await dispatch(
        establishCodeToSemanticMapping({
          codeSelection: {
            filePath: currentCodeSelection.filePath,
            startLine: currentCodeSelection.selectedLines[0],
            endLine: currentCodeSelection.selectedLines[1],
          },
          forceRefresh: false, // 使用缓存
          strategy: "smart", // 使用智能策略
        }),
      ).unwrap();

      if (!result || result.mappings.length === 0) {
        console.warn("[CA:UI] 未找到对应的语义元素");
        await logger.addLogEntry("user_click_jump_to_semantic_no_result", {
          codeSelection: currentCodeSelection,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const uniqueSemanticMappings = Array.from(
        new Map(
          result.mappings.map((mapping) => [
            `${mapping.semanticElementType}-${mapping.semanticElementId}`,
            mapping,
          ]),
        ).values(),
      );

      console.log("[CA:UI] 找到语义元素:", uniqueSemanticMappings);

      const mappedStep = uniqueSemanticMappings.find(
        (mapping) => mapping.semanticElementType === "step",
      );
      if (mappedStep) {
        recordCognitiveInteraction({
          type: "code_to_step",
          stepId: mappedStep.semanticElementId,
          payload: {
            source: "jump_to_semantic",
            codeChunkId: result.chunk.id,
          },
        });
      }

      // 4. 同时高亮所有关联语义元素
      dispatch(
        updateHighlight(
          uniqueSemanticMappings.map((mapping) => ({
            sourceType: mapping.semanticElementType,
            identifier: mapping.semanticElementId,
          })),
        ),
      );

      // 5. 滚动到首个语义元素
      const firstMatch = uniqueSemanticMappings[0];
      const element = firstMatch
        ? document.querySelector(
            `[data-${firstMatch.semanticElementType}-id="${firstMatch.semanticElementId}"]`,
          )
        : null;
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      await logger.addLogEntry("user_click_jump_to_semantic_success", {
        codeChunkId: result.chunk.id,
        semanticElementIds: uniqueSemanticMappings.map(
          (mapping) =>
            `${mapping.semanticElementType}:${mapping.semanticElementId}`,
        ),
        matchedCount: uniqueSemanticMappings.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CA:UI] 跳转失败:", error);
      await logger.addLogEntry("user_click_jump_to_semantic_error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsMappingLookupInProgress(false);
    }
  }, [currentCodeSelection, dispatch, logger, recordCognitiveInteraction]);

  const handleJumpToCode = useCallback(async () => {
    console.log("[CA:UI:Nav] 语义 → 代码");

    try {
      setIsMappingLookupInProgress(true);

      // 1. 获取当前高亮的语义元素
      let focusedElement: {
        id: string;
        type: "highLevelStep" | "step";
      } | null = null;

      const highlightedStep = steps.find((step) => step.isHighlighted);
      const highlightedHls = highLevelSteps.find((hls) => hls.isHighlighted);

      // 优先选择 step，避免 highLevelStep 抢占导致 step_to_code 事件漏记
      if (highlightedStep) {
        focusedElement = { id: highlightedStep.id, type: "step" };
      } else if (highlightedHls) {
        focusedElement = { id: highlightedHls.id, type: "highLevelStep" };
      }

      if (!focusedElement) {
        console.warn("[CA:UI] 未选中语义元素");
        await logger.addLogEntry("user_click_jump_to_code_no_selection", {
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log("[CA:UI] 找到高亮的语义元素:", focusedElement);

      if (focusedElement.type === "step") {
        recordCognitiveInteraction({
          type: "step_to_code",
          stepId: focusedElement.id,
          payload: {
            source: "jump_to_code",
          },
        });
      } else {
        const mappedStep = stepToHighLevelMappings.find(
          (mapping) => mapping.highLevelStepId === focusedElement.id,
        );

        if (mappedStep?.stepId) {
          recordCognitiveInteraction({
            type: "step_to_code",
            stepId: mappedStep.stepId,
            payload: {
              source: "jump_to_code",
              derivedFrom: "highLevelStep",
              highLevelStepId: focusedElement.id,
            },
          });

          console.info("[CognitiveTrace][JumpToCode] derived step_to_code", {
            highLevelStepId: focusedElement.id,
            derivedStepId: mappedStep.stepId,
          });
        } else {
          console.warn(
            "[CA:UI] [CognitiveTrace][JumpToCode] no mapped step found for highlighted highLevelStep",
            {
              highLevelStepId: focusedElement.id,
            },
          );
        }
      }

      // 2. 使用新的通用接口查找代码块（支持实时读取和缓存验证）
      const result = await dispatch(
        establishSemanticToCodeMapping({
          semanticElementId: focusedElement.id,
          semanticElementType: focusedElement.type,
          forceRefresh: false, // 使用缓存
          strategy: "smart", // 使用智能策略
        }),
      ).unwrap();

      if (!result || result.mappings.length === 0) {
        console.warn("[CA:UI] 未找到对应的代码块");
        await logger.addLogEntry("user_click_jump_to_code_no_result", {
          semanticElementId: focusedElement.id,
          semanticElementType: focusedElement.type,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const mappingChunkIds = Array.from(
        new Set(result.mappings.map((mapping) => mapping.codeChunkId)),
      );

      const matchedChunks = result.chunks.filter((chunk) =>
        mappingChunkIds.includes(chunk.id),
      );

      if (matchedChunks.length === 0) {
        console.warn("[CA:UI] 未找到可高亮的代码块", mappingChunkIds);
        return;
      }

      console.log("[CA:UI] 找到代码块:", matchedChunks);

      // 5. 通知 IDE 高亮代码
      await ideMessenger?.post("highlightCodeChunks", matchedChunks);

      // 6. 高亮所有关联代码块（在界面上）
      dispatch(
        updateHighlight(
          matchedChunks.map((chunk) => ({
            sourceType: "code",
            identifier: chunk.id,
            additionalInfo: chunk,
          })),
        ),
      );

      await logger.addLogEntry("user_click_jump_to_code_success", {
        semanticElementId: focusedElement.id,
        semanticElementType: focusedElement.type,
        codeChunkIds: matchedChunks.map((chunk) => chunk.id),
        matchedCount: matchedChunks.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CA:UI] 跳转失败:", error);
      await logger.addLogEntry("user_click_jump_to_code_error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsMappingLookupInProgress(false);
    }
  }, [
    highLevelSteps,
    steps,
    stepToHighLevelMappings,
    dispatch,
    ideMessenger,
    logger,
    recordCognitiveInteraction,
  ]);

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
          ` [CA:UI] Removed step ${step.id} from force expanded list as status is now checked`,
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
        " [CA:UI] Skipping auto-scroll because auto-scroll is temporarily disabled",
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
        ` [CA:UI] Auto-scrolling to ${highlightedSteps.length} highlighted step(s)`,
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
        console.log(
          "[CA:UI] No changes detected, returning to finalized state",
        );
        dispatch(setUserRequirementStatus("finalized"));
        await logger.addLogEntry("user_no_change_requirement", {
          requirement: requirement.trim(),
        });
        return;
      }

      // 有修改，重新生成步骤
      console.log("[CA:UI] Changes detected, regenerating steps");
      await logger.addLogEntry("user_modify_requirement", {
        oldRequirement: originalRequirement,
        newRequirement: requirement.trim(),
      });
      // Reset session except requirement first to ensure clean state
      dispatch(resetSessionExceptRequirement());
      dispatch(setUserRequirementStatus("confirmed"));
      void dispatch(executeInitialGeneration({ userRequirement: requirement }))
        .unwrap()
        .then(async () => {
          console.log("[CA:UI] Initial generation flow completed");
          await logger.addLogEntry("user_regenerate_steps_completed", {
            requirement: requirement.trim(),
          });
        })
        .catch(async (error) => {
          console.error("[CA:UI] Initial generation flow failed", error);
          await logger.addLogEntry("user_regenerate_steps_failed", {
            requirement: requirement.trim(),
            error: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [dispatch, userRequirement, logger],
  );

  const handleEditRequirement = useCallback(async () => {
    await logger.addLogEntry("user_start_edit_requirement", {
      currentRequirement: userRequirement?.requirementDescription
        ? userRequirement.requirementDescription.length > 300
          ? userRequirement.requirementDescription.substring(0, 300) + "..."
          : userRequirement.requirementDescription
        : "",
    });

    dispatch(setUserRequirementStatus("editing"));
  }, [dispatch, logger, userRequirement]);

  const handleRegenerateCode = useCallback(async () => {
    await logger.addLogEntry("user_request_regenerate_code", {
      timestamp: new Date().toISOString(),
    });

    try {
      console.log("[CA:UI] Starting code regeneration...");

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
        console.log("[CA:UI] Cleared file content in IDE");

        await logger.addLogEntry("user_clear_file_content", {
          filePath: currentFile.path,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("[CA:UI] Failed to clear file content:", error);
        // Continue even if clearing fails
      }

      // 4. Find all generated steps
      const generatedSteps = steps.filter(
        (step) => step.stepStatus === "generated",
      );

      if (generatedSteps.length === 0) {
        console.log("[CA:UI] No generated steps found");
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
        ` [CA:UI] Found ${generatedSteps.length} generated steps to regenerate code`,
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
      console.log(" [CA:UI] Starting code generation from generated steps...");
      const result = await dispatch(
        generateCodeFromSteps({
          existingCode: "", // Start with empty code
          filepath: currentFile.path,
          orderedSteps: orderedSteps,
          previouslyGeneratedSteps: undefined, // No previous steps since we're regenerating everything
        }),
      );

      if (generateCodeFromSteps.fulfilled.match(result)) {
        console.log(" [CA:UI] Code regeneration completed!", result.payload);

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
          " [CA:UI] Code regeneration failed:",
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
      console.error("[CA:UI] Error during code regeneration:", error);

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
  }, [steps, ideMessenger, dispatch, logger]);

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
      console.log("[CA:UI] Generating knowledge card content for:", {
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
        // Knowledge card 现在通过其父 step 映射到代码
        // 使用新的接口实时获取代码
        console.log(
          `[CA:UI] 查找 knowledge card ${cardId} 的父 step ${stepId} 的代码`,
        );

        try {
          const result = await dispatch(
            establishSemanticToCodeMapping({
              semanticElementId: stepId,
              semanticElementType: "step",
              forceRefresh: false,
              strategy: "smart",
            }),
          ).unwrap();

          if (result && result.chunks.length > 0) {
            // 使用找到的代码块作为上下文
            contextToUse = result.chunks
              .map((c) => c.content)
              .join("\n\n// --- Related Code Chunk ---\n\n");
            console.log(
              `[CA:UI] 使用来自父 step ${stepId} 的 ${result.chunks.length} 个代码块作为上下文`,
            );
          } else {
            console.warn(
              `[CA:UI] 父 step ${stepId} 没有找到代码块，使用空上下文`,
            );
            contextToUse = "";
          }
        } catch (error) {
          console.error(`[CA:UI] 查找代码失败:`, error);
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
    [dispatch, logger],
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
      console.log("[CA:UI] Generating knowledge card tests for:", {
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
        // Knowledge card 现在通过其父 step 映射到代码
        // 使用新的接口实时获取代码
        console.log(
          `[CA:UI] 查找 knowledge card ${cardId} 的父 step ${stepId} 的代码`,
        );

        try {
          const result = await dispatch(
            establishSemanticToCodeMapping({
              semanticElementId: stepId,
              semanticElementType: "step",
              forceRefresh: false,
              strategy: "smart",
            }),
          ).unwrap();

          if (result && result.chunks.length > 0) {
            // 使用找到的代码块作为上下文
            contextToUse = result.chunks
              .map((c) => c.content)
              .join("\n\n// --- Related Code Chunk ---\n\n");
            console.log(
              `[CA:UI] 使用来自父 step ${stepId} 的 ${result.chunks.length} 个代码块作为上下文`,
            );
          } else {
            console.warn(
              `[CA:UI] 父 step ${stepId} 没有找到代码块，使用空上下文`,
            );
            contextToUse = "";
          }
        } catch (error) {
          console.error(`[CA:UI] 查找代码失败:`, error);
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
    [dispatch, logger],
  );

  // 处理禁用知识卡片
  const handleDisableKnowledgeCard = useCallback(
    (stepId: string, cardId: string) => {
      console.log("[CA:UI] Disabling knowledge card:", { stepId, cardId });
      dispatch(setKnowledgeCardDisabled({ stepId, cardId, disabled: true }));
    },
    [dispatch],
  );

  const handleHighlightEvent = useCallback(
    async (e: HighlightEvent) => {
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
    [dispatch, logger],
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
      console.log(`[CA:UI] 执行到步骤: ${stepId}`);

      // Log step execution
      await logger.addLogEntry("user_start_execute_steps", {
        stepId,
        timestamp: new Date().toISOString(),
      });

      try {
        // 1. 根据step_id获取截止到该步骤的所有未执行步骤信息
        const targetStepIndex = steps.findIndex((step) => step.id === stepId);
        if (targetStepIndex === -1) {
          console.error(`[CA:UI] Step with id ${stepId} not found`);
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

        console.log("[CA:UI] 未执行的步骤信息:", stepsInfo);
        console.log("[CA:UI] 已生成的步骤数量:", generatedSteps.length);

        if (unexecutedSteps.length === 0) {
          console.log("[CA:UI] All steps up to target already executed");
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
          console.log(
            "[CA:UI] 没有打开的文件，agent将通过tool calling创建新文件",
          );
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

        console.log("[CA:UI] 当前文件信息:", {
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
          "[CA:UI]  已生成步骤的对应代码信息:",
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

        console.log("[CA:UI] 开始生成代码...");
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
          console.log("[CA:UI] 代码生成完成!", result.payload);
          // 注意：generateCodeFromSteps已在内部设置步骤状态为"generated"
          // 和调用checkAndUpdateHighLevelStepCompletion，无需在此重复

          console.log("[CA:UI] 代码生成和步骤状态更新已完成，可以继续其他操作");
        } else if (generateCodeFromSteps.rejected.match(result)) {
          console.error("[CA:UI] 代码生成失败:", result.error.message);
          // 恢复步骤状态为"confirmed"并显示错误提示
          for (const step of unexecutedSteps) {
            dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
          }
          // 显示错误提示
          ideMessenger?.post("showToast", ["error", "代码生成失败，请重试。"]);
        }
      } catch (error) {
        console.error("[CA:UI] 执行到步骤时发生错误:", error);
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
    [steps, ideMessenger, dispatch, allMappings, logger],
  );

  // Handle rerun step when step is dirty
  const handleRerunStep = useCallback(
    async (stepId: string) => {
      console.log(`[CA:UI] 重新运行步骤: ${stepId}`);

      await logger.addLogEntry("user_start_rerun_step", {
        stepId,
        timestamp: new Date().toISOString(),
      });

      try {
        // 找到对应的步骤
        const step = steps.find((s) => s.id === stepId);
        if (!step) {
          console.error(`[CA:UI] Step with id ${stepId} not found`);
          await logger.addLogEntry("user_rerun_step_error", {
            stepId,
            error: "Step not found",
          });
          return;
        }

        // 只有在step_dirty状态下才允许重新运行
        if (step.stepStatus !== "step_dirty") {
          console.warn(
            `[CA:UI] Step ${stepId} is not in step_dirty status, current status: ${step.stepStatus}`,
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

        console.log("[CA:UI] 步骤重新运行成功");
        ideMessenger?.post("showToast", ["info", "步骤重新运行成功！"]);

        await logger.addLogEntry("user_rerun_step_completed", {
          stepId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("[CA:UI] 重新运行步骤时发生错误:", error);
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
    [steps, dispatch, ideMessenger, logger],
  );

  const handleStepEdit = useCallback(
    async (stepId: string, newContent: string) => {
      await logger.addLogEntry("user_edit_step_content", {
        stepId,
        newContent: newContent.substring(0, 200), // Log first 200 chars to avoid huge logs
        timestamp: new Date().toISOString(),
      });

      // Update step abstract in Redux store
      dispatch(setStepAbstract({ stepId, abstract: newContent }));
    },
    [dispatch, logger],
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
      console.log(`[CA:UI] Step ${stepId} expansion changed to: ${isExpanded}`);

      const decision = recordCognitiveInteraction({
        type: isExpanded ? "step_expand" : "step_collapse",
        stepId,
        payload: {
          source: "step_panel_toggle",
        },
      });

      if (isExpanded) {
        // When a step is expanded, immediately set it as the currently expanded step
        // This ensures the step stays expanded while other steps are collapsed
        setCurrentlyExpandedStepId(stepId);

        // Phase D intent-aware generation gate:
        // only generate when router resolves this expanded step as the intent target.
        const expandedStep = steps.find((step) => step.id === stepId);
        const canGenerateFromIntent =
          decision.shouldGenerateCards &&
          decision.intent.targetStepId === stepId &&
          decision.intent.intentTypes.length > 0;
        const isGenerationIdle =
          expandedStep?.knowledgeCardGenerationStatus !== "generating";

        if (expandedStep && canGenerateFromIntent && isGenerationIdle) {
          await dispatch(
            generateKnowledgeCardThemes({
              stepId,
              stepTitle: expandedStep.title,
              stepAbstract: expandedStep.abstract,
              learningGoal: learningGoal || "提升编程技能和理解相关概念",
            }),
          );
        }

        // 检查知识卡片是否有代码映射，如果没有则生成映射
        try {
          await dispatch(checkAndMapKnowledgeCardsToCode({ stepId }));
          console.log(`[CA:UI] 完成步骤 ${stepId} 的知识卡片代码映射检查`);
        } catch (error) {
          console.warn(
            `[CA:UI] 步骤 ${stepId} 的知识卡片代码映射检查失败:`,
            error,
          );
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
      recordCognitiveInteraction,
      steps,
      learningGoal,
      setCurrentlyExpandedStepId,
      setForceExpandedSteps,
      setGlobalQuestionExpandedSteps,
    ],
  );

  const handleKnowledgeCardExpansionChange = useCallback(
    (stepId: string, cardId: string, isExpanded: boolean) => {
      if (!isExpanded) {
        return;
      }

      recordCognitiveInteraction({
        type: "knowledge_card_open",
        stepId,
        knowledgeCardId: cardId,
        payload: {
          source: "knowledge_card_panel_toggle",
        },
      });
    },
    [recordCognitiveInteraction],
  );

  const handleKnowledgeCardViewModeChange = useCallback(
    (
      stepId: string,
      cardId: string,
      viewMode: "read" | "self-test" | "answer",
    ) => {
      dispatch(
        setKnowledgeCardViewMode({
          stepId,
          cardId,
          viewMode,
        }),
      );

      recordCognitiveInteraction({
        type: "knowledge_card_view_mode_change",
        stepId,
        knowledgeCardId: cardId,
        payload: {
          viewMode,
        },
      });

      if (viewMode === "read" || viewMode === "self-test") {
        const step = codeAwareSessionState.steps.find((s) => s.id === stepId);
        const card = step?.knowledgeCards.find((k) => k.id === cardId);
        const linkedKnowledgeNodeIds = card?.linkedKnowledgeNodeIds || [];
        const linkedMasteryNodes = card?.linkedMasteryNodes || [];

        const interaction: KnowledgeCardInteraction = {
          type: "view-major",
          value: viewMode,
        };

        const result = applyKnowledgeCardInteraction({
          linkedKnowledgeNodeIds,
          linkedMasteryNodes,
          interaction,
          nodeMasteryScores: codeAwareSessionState.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(codeAwareSessionState),
        });

        if (result.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(result.updatedScores));
          emitMasteryUpdateLogs({
            interaction,
            linkedKnowledgeNodeIds,
            linkedMasteryNodes,
            changedNodeIds: result.changedNodeIds,
            debug: result.debug,
            knowledgeNodeTitleById,
          });
        }
      }
    },
    [
      codeAwareSessionState,
      dispatch,
      knowledgeNodeTitleById,
      recordCognitiveInteraction,
    ],
  );

  const handleKnowledgeCardFeedback = useCallback(
    (stepId: string, cardId: string, feedback: "understood" | "uncertain") => {
      dispatch(
        setKnowledgeCardFeedback({
          stepId,
          cardId,
          feedback,
        }),
      );

      recordCognitiveInteraction({
        type: "knowledge_card_feedback",
        stepId,
        knowledgeCardId: cardId,
        payload: {
          feedback,
        },
      });

      const step = codeAwareSessionState.steps.find((s) => s.id === stepId);
      const card = step?.knowledgeCards.find((k) => k.id === cardId);
      const linkedKnowledgeNodeIds = card?.linkedKnowledgeNodeIds || [];
      const linkedMasteryNodes = card?.linkedMasteryNodes || [];

      const interaction: KnowledgeCardInteraction = {
        type: "feedback",
        value: feedback,
      };

      const result = applyKnowledgeCardInteraction({
        linkedKnowledgeNodeIds,
        linkedMasteryNodes,
        interaction,
        nodeMasteryScores: codeAwareSessionState.nodeMasteryScores,
        cognitiveEdges: buildCodeAwareCognitiveEdges(codeAwareSessionState),
      });

      if (result.changedNodeIds.length > 0) {
        dispatch(setNodeMasteryScores(result.updatedScores));
        emitMasteryUpdateLogs({
          interaction,
          linkedKnowledgeNodeIds,
          linkedMasteryNodes,
          changedNodeIds: result.changedNodeIds,
          debug: result.debug,
          knowledgeNodeTitleById,
        });
      }
    },
    [
      codeAwareSessionState,
      dispatch,
      knowledgeNodeTitleById,
      recordCognitiveInteraction,
    ],
  );

  const handleQuestionSubmit = useCallback(
    async (stepId: string, selectedText: string, question: string) => {
      console.log("[CA:UI] 处理步骤问题提交:", {
        stepId,
        selectedText,
        question,
      });

      const decision = recordCognitiveInteraction({
        type: "question_submit_step",
        stepId,
        payload: {
          selectedText,
          question,
        },
      });

      await logger.addLogEntry("user_submit_question", {
        stepId,
        selectedText: selectedText.substring(0, 200), // Log first 200 chars
        question: question.substring(0, 200), // Log first 200 chars
        timestamp: new Date().toISOString(),
      });

      // 通过stepId查找对应的步骤信息
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        console.error("[CA:UI] 未找到对应的步骤:", stepId);
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
            intentOverride: decision.intent,
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
            "[CA:UI]  Knowledge card themes generated successfully, status set to checked",
          );

          await logger.addLogEntry("user_submit_question_completed", {
            stepId,
            timestamp: new Date().toISOString(),
          });
        } else if (
          generateKnowledgeCardThemesFromQuery.rejected.match(result)
        ) {
          console.error(
            "[CA:UI]  Failed to generate knowledge card themes:",
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
        console.error("[CA:UI] Error in handleQuestionSubmit:", error);
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
    [steps, learningGoal, task, dispatch, logger, recordCognitiveInteraction],
  );

  // Handle global question submission
  const handleGlobalQuestionSubmit = useCallback(
    async (question: string) => {
      console.log("[CA:UI] 处理全局提问:", { question });

      const decision = recordCognitiveInteraction({
        type: "question_submit_global",
        payload: {
          question,
        },
      });

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
            intentOverride: decision.intent,
          }),
        );

        if (processGlobalQuestion.fulfilled.match(result)) {
          const { selectedStepId, themes, knowledgeCardIds } = result.payload;

          dispatch(
            setLatestIntentForStep({
              stepId: selectedStepId,
              summary: {
                intentTypes: decision.intent.intentTypes,
                preferredInitialView: decision.intent.preferredInitialView,
                reason: decision.intent.reason,
                updatedAt: Date.now(),
              },
            }),
          );

          console.log("[CA:UI] Global question processed successfully:", {
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
            "[CA:UI]  Failed to process global question:",
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
        console.error("[CA:UI] Error in handleGlobalQuestionSubmit:", error);
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
      recordCognitiveInteraction,
    ],
  );

  // Handle opening global question modal
  const handleOpenGlobalQuestion = useCallback(async () => {
    console.log("[CA:UI] 打开全局提问对话框");

    await logger.addLogEntry("user_open_global_question_modal", {
      timestamp: new Date().toISOString(),
    });

    setIsGlobalQuestionModalOpen(true);
  }, [logger]);

  // Handle closing global question modal
  const handleCloseGlobalQuestion = useCallback(async () => {
    console.log("[CA:UI] 关闭全局提问对话框");

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
      console.log(" [CA:UI] Received question from code selection:", data);

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
        let targetStepId: string | null = null;
        try {
          const result = await dispatch(
            establishCodeToSemanticMapping({
              codeSelection: {
                filePath: data.filePath,
                startLine: data.selectedLines[0],
                endLine: data.selectedLines[1],
              },
              strategy: "smart",
            }),
          );
          if (
            result.payload &&
            typeof result.payload === "object" &&
            "mappings" in result.payload
          ) {
            const mappings = (result.payload as any).mappings as any[];
            // 优先选择 step 类型的 mapping
            const stepMapping = mappings.find(
              (m: any) => m.semanticElementType === "step",
            );
            if (stepMapping) {
              targetStepId = stepMapping.semanticElementId;
            } else if (mappings.length > 0) {
              // 如果没有 step，使用第一个 mapping
              targetStepId = mappings[0].semanticElementId;
            }
          }
        } catch (error) {
          console.error(
            " [CA:UI] Error finding step for code selection:",
            error,
          );
        }

        let stepIdToUse: string;
        if (!targetStepId) {
          // 如果没有找到直接对应的step，使用最后一个步骤
          const lastStep = steps[steps.length - 1];
          stepIdToUse = lastStep.id;
          console.log(
            " [CA:UI] No direct mapping found, using last step:",
            stepIdToUse,
          );

          await logger.addLogEntry("user_check_code_step_mappings", {
            result: "no_direct_mapping",
            selectedStepId: stepIdToUse,
          });
        } else {
          stepIdToUse = targetStepId;
          console.log("[CA:UI] Found most relevant step:", stepIdToUse);

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
          " [CA:UI] Failed to process question from selection:",
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
        console.error("[CA:UI] Failed to clear highlights in IDE:", error);
      }
      // Reset the flag
      dispatch(resetIdeCommFlags());
    }
  }, [shouldClearIdeHighlights, ideMessenger, dispatch]);

  useEffect(() => {
    console.log(
      "[CA:UI] Code chunks to highlight in IDE:",
      codeChunksToHighlightInIde,
    );
    if (codeChunksToHighlightInIde.length > 0) {
      try {
        // Use the new highlightCodeChunks method to avoid merging
        ideMessenger?.post("highlightCodeChunks", codeChunksToHighlightInIde);
      } catch (error) {
        console.error("[CA:UI] Failed to highlight code chunks in IDE:", error);
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
          <HeaderActionButton
            onClick={handleExportKnowledgeState}
            disabled={isExportingKnowledgeState}
            title="导出/更新认知状态文件到 .knowledge_state/"
          >
            {isExportingKnowledgeState ? "导出中..." : "导出知识状态"}
          </HeaderActionButton>
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

      {/* Navigation Buttons - 显式跳转按钮 */}
      {userRequirementStatus === "finalized" && steps.length > 0 && (
        <div className="mt-2 px-4">
          <NavigationButtons
            onJumpToSemantic={handleJumpToSemantic}
            onJumpToCode={handleJumpToCode}
            isLoading={isMappingLookupInProgress}
          />
        </div>
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
          />
        ) : (
          <div ref={requirementDisplayRef}>
            <RequirementDisplay
              onEdit={handleEditRequirement}
              onChunkFocus={handleHighlightEvent} // Pass the highlight event handler
              onClearHighlight={removeHighlightEvent} // Pass the clear highlight function
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
                  onKnowledgeCardExpansionChange={
                    handleKnowledgeCardExpansionChange
                  }
                  onKnowledgeCardViewModeChange={
                    handleKnowledgeCardViewModeChange
                  }
                  onKnowledgeCardFeedback={handleKnowledgeCardFeedback}
                  onDisableKnowledgeCard={handleDisableKnowledgeCard} // Pass knowledge card disable function
                  onQuestionSubmit={handleQuestionSubmit} // Pass question submit function
                  onRegisterRef={registerStepRef} // Pass step ref registration function
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
                        question: kc.question,
                        viewMode: kc.viewMode,
                        feedback: kc.feedback,
                        markdownContent: kc.content || "", // 提供默认空字符串
                        testItems: testItems, // 传递所有测试项目

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
                            `[CA:UI] MCQ Result for ${kc.title} (Test ${testId}): ${isCorrect ? "Correct" : "Incorrect"}, Selected: ${selectedOption}`,
                          );
                          // TODO: 实现 MCQ 提交逻辑，更新测试结果到 Redux store
                        },

                        onSaqSubmit: (testId: string, answer: string) => {
                          console.log(
                            `[CA:UI] SAQ Answer for ${kc.title} (Test ${testId}): ${answer}`,
                          );
                          // 调用处理SAQ提交的thunk
                          void dispatch(
                            processSaqSubmission({
                              testId,
                              userAnswer: answer,
                            }),
                          )
                            .unwrap()
                            .then((submission) => {
                              if (!submission) {
                                return;
                              }

                              recordCognitiveInteraction({
                                type: "knowledge_card_answer_result",
                                stepId: submission.stepId,
                                knowledgeCardId: submission.knowledgeCardId,
                                payload: {
                                  testId,
                                  answerLength: answer.length,
                                  correctness: submission.correctness,
                                },
                              });

                              const linkedKnowledgeNodeIds =
                                kc.linkedKnowledgeNodeIds || [];
                              const linkedMasteryNodes =
                                kc.linkedMasteryNodes || [];
                              const interaction: KnowledgeCardInteraction = {
                                type: "answer",
                                correctness: submission.correctness,
                              };

                              const result = applyKnowledgeCardInteraction({
                                linkedKnowledgeNodeIds,
                                linkedMasteryNodes,
                                interaction,
                                nodeMasteryScores:
                                  codeAwareSessionState.nodeMasteryScores,
                                cognitiveEdges: buildCodeAwareCognitiveEdges(
                                  codeAwareSessionState,
                                ),
                              });

                              if (result.changedNodeIds.length > 0) {
                                dispatch(
                                  setNodeMasteryScores(result.updatedScores),
                                );
                                emitMasteryUpdateLogs({
                                  interaction,
                                  linkedKnowledgeNodeIds,
                                  linkedMasteryNodes,
                                  changedNodeIds: result.changedNodeIds,
                                  debug: result.debug,
                                  knowledgeNodeTitleById,
                                });
                              }
                            })
                            .catch((error) => {
                              console.error(
                                "[CA:UI] [MasteryTracking] SAQ submission handling failed",
                                error,
                              );
                            });
                        },

                        // Default states - 由 viewMode 控制初始视图
                        defaultTestMode: kc.viewMode === "answer",
                        // 新生成主题后默认折叠，由用户自主展开后再触发内容懒加载
                        defaultExpanded: false,

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
      {showLoadingOverlay && (
        <LoadingOverlay>
          <LoadingCard>
            <LoadingTitle>
              {isInitialGenerationError
                ? "初始化失败"
                : isInitialGenerationRunning
                  ? "正在初始化项目"
                  : "正在处理请求"}
            </LoadingTitle>

            <div className="flex items-center gap-2">
              <SpinnerIcon />
              <LoadingPhase>
                {isInitialGenerationError
                  ? "初始化过程中出现错误，请查看详情并重试。"
                  : isInitialGenerationRunning
                    ? initialGeneration.currentPhase || "正在准备..."
                    : "正在执行中，请稍候..."}
              </LoadingPhase>
            </div>

            {isInitialGenerationRunning && (
              <>
                <ProgressTrack>
                  <ProgressFill $progress={initialGeneration.progress} />
                </ProgressTrack>
                <LoadingPhase>{`${initialGeneration.progress}%`}</LoadingPhase>
              </>
            )}

            {isInitialGenerationError && (
              <>
                <LoadingErrorBox>
                  {(initialGeneration.errors || []).length > 0
                    ? initialGeneration.errors.join("\n")
                    : "未知错误"}
                </LoadingErrorBox>
                <LoadingActions>
                  <RetryButton onClick={handleRetryInitialGeneration}>
                    重新尝试初始化
                  </RetryButton>
                </LoadingActions>
              </>
            )}
          </LoadingCard>
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

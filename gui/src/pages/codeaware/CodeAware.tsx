import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import {
  HighlightEvent,
  KnowledgeCardItem,
  MasteryNodeRef,
  PinnedItem,
  StepItem,
  StepStatus,
} from "core";
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
import { useSidebarPosition } from "../../hooks/useSidebarPosition";
import {
  useTimedMasteryTracker,
  type TimedViewResult,
} from "../../hooks/useTimedMasteryTracker";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import {
  applyKnowledgeCardInteraction,
  emitMasteryUpdateLogs,
  KnowledgeCardInteraction,
} from "../../redux/cognitive/masteryTrackingEngine";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  addGlobalQAMessage,
  addPinnedItem,
  appendKnowledgeCardContent,
  clearAllCodeAndMappings,
  clearAllHighlights,
  clearGlobalQASession,
  newCodeAwareSession,
  removePinnedItem,
  resetIdeCommFlags,
  resetSessionExceptRequirement,
  selectCodeAwareSessionState,
  selectCurrentSessionId,
  selectIsRequirementInEditMode,
  selectIsStepsGenerated,
  selectLearningGoal,
  selectTask,
  selectTitle,
  setKnowledgeCardDisabled,
  setKnowledgeCardFeedback,
  setKnowledgeCardGenerationStatus,
  setKnowledgeCardViewedAt,
  setKnowledgeCardViewMode,
  setNodeMasteryScores,
  setStepStatus,
  setUserRequirementStatus,
  startGlobalQASession,
  submitRequirementContent,
  toggleMasteryIndicators,
  togglePinnedItem,
  updateHighlight,
} from "../../redux/slices/codeAwareSlice";
import {
  checkAndMapKnowledgeCardsToCode,
  checkAndUpdateHighLevelStepCompletion,
  convertQAToKnowledgeCard,
  generateCodeFromSteps,
  generateKnowledgeCardDetail,
  generateKnowledgeCardTests, // 新增：导入测试题生成thunk
  generateKnowledgeCardThemesFromQuery,
  generatePrerequisiteKnowledgeCards,
  getStepCorrespondingCode,
  processSaqSubmission,
  rerunStep,
} from "../../redux/thunks/codeAwareGeneration";
import {
  generateGlobalConfusionCandidates,
  generateStepConfusionCandidates,
} from "../../redux/thunks/confusionCandidates";
import { respondToConfusionQA } from "../../redux/thunks/confusionQA";
import {
  executeInitialGeneration,
  exportKnowledgeStateArtifacts,
} from "../../redux/thunks/initialGeneration";
import {
  establishCodeToSemanticMapping,
  establishSemanticToCodeMapping,
} from "../../redux/thunks/mappingLookup";
import {
  detectPresetTrigger,
  exportPresetSnapshot,
  loadPresetSnapshot,
} from "../../redux/thunks/presetSnapshot";
import { useCodeAwareLogger } from "../../util/codeAwareWebViewLogger";
import { buildCodeAwareCognitiveEdges } from "../../utils/codeAwareRelationGraph";
import {
  calculateMaxReadingTimeMs,
  calculateMinReadingTimeMs,
  estimateCodeWordCount,
} from "../../utils/readingTimeUtils";
import {
  computeSituationGroups,
  toSituationNodeId,
} from "../../utils/situationGrouping";
import "./CodeAware.css";
import GlobalInteractionOverlay, {
  OverlayTab,
} from "./components/GlobalOverlay/GlobalInteractionOverlay";
import RequirementDisplay from "./components/Requirements/RequirementDisplay";
import RequirementDisplayHorizontal from "./components/Requirements/RequirementDisplayHorizontal";
import RequirementEditor from "./components/Requirements/RequirementEditor";
import ActionToast, {
  type ActionToastAction,
} from "./components/shared/ActionToast";
import type { ConfusionMessage } from "./components/shared/ConfusionPanel";
import Step from "./components/Steps/Step";
import { NavigationButtons } from "./components/ToolBar/NavigationButtons";
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
  const [isExportingPreset, setIsExportingPreset] = useState(false);

  // Navigation buttons state
  const [isMappingLookupInProgress, setIsMappingLookupInProgress] =
    useState(false);
  const sidebarPosition = useSidebarPosition();

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
    // 当用户在编辑器中选中了新的代码，清除两侧的高亮
    dispatch(clearAllHighlights());
  });

  useWebviewListener("codeSelectionCleared", async () => {
    console.log("[CA:UI] 代码选中已清除");
    setCurrentCodeSelection(null);
    // 代码选中清除时，也清除两侧高亮
    dispatch(clearAllHighlights());
  });

  // CodeAware: 监听代码注释查看事件
  useWebviewListener("codeExplanationEvent", async (data) => {
    console.log("[CA:UI] 代码注释事件:", data);

    void logger.addLogEntry("user_code_explanation_event", {
      action: data.action,
      filePath: data.filePath,
      selectedLines: data.selectedLines,
      language: data.language,
      question: data.question ? data.question.substring(0, 200) : undefined,
    });

    // Flush any existing pending view
    handleFlushTimedViewMastery();

    if (data.action === "view" || data.action === "followup") {
      // Find code chunks that overlap with the annotation line range
      const codeChunks = codeAwareSessionState.codeChunks;
      const matchedRefs: MasteryNodeRef[] = [];
      const [selStart, selEnd] = data.selectedLines;

      codeChunks.forEach((chunk) => {
        const [chunkStart, chunkEnd] = chunk.range;
        if (chunkStart <= selEnd && chunkEnd >= selStart) {
          matchedRefs.push({ nodeId: chunk.id, nodeType: "code-chunk" });
        }
      });

      // Also include situation node refs so code-level signals propagate to step mastery
      const chunkIds = matchedRefs.map((r) => r.nodeId);
      const sitRefs = computeSituationRefsForCodeChunks(
        chunkIds,
        data.selectedLines,
      );
      matchedRefs.push(...sitRefs);

      if (matchedRefs.length > 0) {
        const lineCount = selEnd - selStart + 1;
        const estimatedWords = estimateCodeWordCount(lineCount);
        const minMs = Math.max(
          (estimatedWords / 200) * 60 * 1000,
          5000, // at least 5s for code explanation
        );

        startDetailTracking({
          type: "code",
          masteryNodeRefs: matchedRefs,
          startTime: Date.now(),
          minReadingTimeMs: minMs,
          maxReadingTimeMs: minMs * 2,
          firstThresholdEmitted: false,
          secondThresholdEmitted: false,
          metadata: {
            filePath: data.filePath,
            selectedLines: data.selectedLines,
            action: data.action,
          },
        });

        console.info("[CA:Mastery:PhaseG][TrackingStart:Detail]", {
          tag: "CA_PHASE_G_MASTERY",
          type: "code",
          nodeIds: matchedRefs.map((r) => r.nodeId),
          minReadingTimeMs: minMs,
          source: "codeExplanationEvent",
        });
      }
    }
  });

  // CodeAware: 监听代码注释 pin 切换事件（从 IDE CommentThread 标题栏触发）
  useWebviewListener("codeAnnotationPinToggle", async (data) => {
    console.log("[CA:UI] 代码注释 pin 切换:", data);
    const { annotationId, filePath, lineRange, title } = data;

    // Determine current pin state to apply correct mastery direction
    const currentPinnedItems = latestPinnedItemsRef.current;
    const currentState = latestCognitiveStateRef.current;
    const wasPinned = currentPinnedItems.some(
      (p) => p.level === "code" && p.targetId === annotationId,
    );

    dispatch(
      togglePinnedItem({
        id: `pin-code-${annotationId}-${Date.now()}`,
        level: "code",
        targetId: annotationId,
        title,
        filePath,
        lineRange,
        pinnedAt: Date.now(),
      }),
    );

    // Apply mastery update based on pin direction
    const linkedMasteryNodes: MasteryNodeRef[] = [];
    if (lineRange) {
      const [selStart, selEnd] = lineRange;
      currentState.codeChunks.forEach((chunk) => {
        const [chunkStart, chunkEnd] = chunk.range;
        if (chunkStart <= selEnd && chunkEnd >= selStart) {
          linkedMasteryNodes.push({
            nodeId: chunk.id,
            nodeType: "code-chunk",
          });
        }
      });
      // Also include situation node refs
      const chunkIds = linkedMasteryNodes.map((r) => r.nodeId);
      const sitRefs = computeSituationRefsForCodeChunks(chunkIds, lineRange);
      linkedMasteryNodes.push(...sitRefs);
    }

    if (linkedMasteryNodes.length > 0) {
      const interaction: KnowledgeCardInteraction = {
        type: "pin",
        value: wasPinned ? "unpin" : "pin",
      };
      const result = applyKnowledgeCardInteraction({
        linkedMasteryNodes,
        interaction,
        nodeMasteryScores: currentState.nodeMasteryScores,
        cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
      });
      if (result.changedNodeIds.length > 0) {
        dispatch(setNodeMasteryScores(result.updatedScores));
        emitMasteryUpdateLogs({
          interaction,
          linkedMasteryNodes,
          changedNodeIds: result.changedNodeIds,
          debug: result.debug,
          knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
        });
      }
    }

    void logger.addLogEntry("user_toggle_annotation_pin", {
      annotationId,
      filePath,
      lineRange,
      title,
      action: wasPinned ? "unpin" : "pin",
    });
  });

  // CodeAware: 监听代码注释折叠事件 — 发出 collapse mastery 信号
  useWebviewListener("codeExplanationCollapsed", async (data) => {
    console.log("[CA:UI] 代码注释折叠:", data);
    const { annotationId, filePath, selectedLines } = data;

    manuallyCollapsedAnnotationsRef.current.add(annotationId);

    // Flush any pending timed view
    handleFlushTimedViewMastery();

    // Find code chunks that overlap
    const codeChunks = codeAwareSessionState.codeChunks;
    const linkedMasteryNodes: MasteryNodeRef[] = [];
    const [selStart, selEnd] = selectedLines;
    codeChunks.forEach((chunk) => {
      const [chunkStart, chunkEnd] = chunk.range;
      if (chunkStart <= selEnd && chunkEnd >= selStart) {
        linkedMasteryNodes.push({ nodeId: chunk.id, nodeType: "code-chunk" });
      }
    });
    // Also include situation node refs
    const collapseChunkIds = linkedMasteryNodes.map((r) => r.nodeId);
    const collapseSitRefs = computeSituationRefsForCodeChunks(
      collapseChunkIds,
      selectedLines,
    );
    linkedMasteryNodes.push(...collapseSitRefs);

    if (linkedMasteryNodes.length > 0) {
      const interaction: KnowledgeCardInteraction = { type: "collapse" };
      const currentState = latestCognitiveStateRef.current;
      const result = applyKnowledgeCardInteraction({
        linkedMasteryNodes,
        interaction,
        nodeMasteryScores: currentState.nodeMasteryScores,
        cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
      });
      if (result.changedNodeIds.length > 0) {
        dispatch(setNodeMasteryScores(result.updatedScores));
        emitMasteryUpdateLogs({
          interaction,
          linkedMasteryNodes,
          changedNodeIds: result.changedNodeIds,
          debug: result.debug,
          knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
        });
      }
    }

    void logger.addLogEntry("user_collapse_code_explanation", {
      annotationId,
      filePath,
      selectedLines,
      matchedChunks: linkedMasteryNodes.length,
    });
  });

  // CodeAware: 监听代码注释展开事件 — 如果之前手动折叠过则发出 re-expand 信号
  useWebviewListener("codeExplanationExpanded", async (data) => {
    console.log("[CA:UI] 代码注释展开:", data);
    const { annotationId, filePath, selectedLines } = data;

    if (manuallyCollapsedAnnotationsRef.current.has(annotationId)) {
      const codeChunks = codeAwareSessionState.codeChunks;
      const linkedMasteryNodes: MasteryNodeRef[] = [];
      const [selStart, selEnd] = selectedLines;
      codeChunks.forEach((chunk) => {
        const [chunkStart, chunkEnd] = chunk.range;
        if (chunkStart <= selEnd && chunkEnd >= selStart) {
          linkedMasteryNodes.push({ nodeId: chunk.id, nodeType: "code-chunk" });
        }
      });
      // Also include situation node refs
      const expandChunkIds = linkedMasteryNodes.map((r) => r.nodeId);
      const expandSitRefs = computeSituationRefsForCodeChunks(
        expandChunkIds,
        selectedLines,
      );
      linkedMasteryNodes.push(...expandSitRefs);

      if (linkedMasteryNodes.length > 0) {
        const interaction: KnowledgeCardInteraction = { type: "re-expand" };
        const currentState = latestCognitiveStateRef.current;
        const result = applyKnowledgeCardInteraction({
          linkedMasteryNodes,
          interaction,
          nodeMasteryScores: currentState.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
        });
        if (result.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(result.updatedScores));
          emitMasteryUpdateLogs({
            interaction,
            linkedMasteryNodes,
            changedNodeIds: result.changedNodeIds,
            debug: result.debug,
            knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
          });
        }
      }
    }

    void logger.addLogEntry("user_expand_code_explanation", {
      annotationId,
      filePath,
      selectedLines,
      wasManuallyCollapsed:
        manuallyCollapsedAnnotationsRef.current.has(annotationId),
    });
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

  /**
   * Given matched code chunk IDs and a selected line range, compute the
   * corresponding situation node refs so that code-level mastery signals
   * also update the situation layer (which feeds step mastery).
   */
  const computeSituationRefsForCodeChunks = useCallback(
    (
      matchedChunkIds: string[],
      selectedLines: [number, number],
    ): MasteryNodeRef[] => {
      const groups = computeSituationGroups(
        codeAwareSessionState.codeAwareMappings,
        codeAwareSessionState.codeChunks,
      );
      const [selStart, selEnd] = selectedLines;
      const sitRefs: MasteryNodeRef[] = [];
      const matchedSet = new Set(matchedChunkIds);

      groups.forEach((g) => {
        // Only consider groups that contain at least one of the matched code chunks
        const hasOverlap = g.codeChunkIds.some((id) => matchedSet.has(id));
        if (!hasOverlap) return;

        // Also verify line range overlap
        const [gStart, gEnd] = g.lineRange;
        if (selStart > gEnd || selEnd < gStart) return;

        // Compute coverage ratio
        const overlapStart = Math.max(selStart, gStart);
        const overlapEnd = Math.min(selEnd, gEnd);
        const overlapLines = Math.max(0, overlapEnd - overlapStart + 1);
        const coverageRatio = overlapLines / g.lineCount;

        g.stepIds.forEach((stepId) => {
          sitRefs.push({
            nodeId: toSituationNodeId(stepId, g.groupId),
            nodeType: "situation",
            weight: coverageRatio,
          });
        });
      });

      return sitRefs;
    },
    [codeAwareSessionState.codeAwareMappings, codeAwareSessionState.codeChunks],
  );

  // CodeAware: 响应 IDE 查询代码相关背景知识和掌握度
  useWebviewListener(
    "queryCodeKnowledgeContext",
    async (data) => {
      const { filePath, startLine, endLine } = data;
      const codeChunks = codeAwareSessionState.codeChunks;
      const knowledgeToCodeChunkRelations =
        codeAwareSessionState.knowledgeToCodeChunkRelations;
      const knowledgePoints = codeAwareSessionState.knowledgePoints;
      const nodeMasteryScores = codeAwareSessionState.nodeMasteryScores;

      // Find code chunks that overlap with the selected lines
      const matchedChunkIds = new Set<string>();
      codeChunks.forEach((chunk) => {
        if (chunk.filePath !== filePath) return;
        const [chunkStart, chunkEnd] = chunk.range;
        if (chunkStart <= endLine && chunkEnd >= startLine) {
          matchedChunkIds.add(chunk.id);
        }
      });

      // Find knowledge points linked to matched code chunks
      const linkedKnowledgeIds = new Set<string>();
      knowledgeToCodeChunkRelations.forEach((rel) => {
        if (matchedChunkIds.has(rel.codeChunkId)) {
          linkedKnowledgeIds.add(rel.knowledgeId);
        }
      });

      // Build response with mastery scores
      const masteryMap = new Map(
        nodeMasteryScores.map((s) => [s.nodeId, s.score]),
      );

      const result = knowledgePoints
        .filter((kp) => linkedKnowledgeIds.has(kp.id))
        .map((kp) => ({
          id: kp.id,
          title: kp.title,
          content: kp.content,
          category: kp.category,
          difficulty: kp.difficulty,
          masteryScore: masteryMap.get(kp.id) ?? 0,
        }));

      return { knowledgePoints: result };
    },
    [codeAwareSessionState],
  );

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

  const knowledgeNodeTitleById = useMemo(() => {
    return Object.fromEntries(
      codeAwareSessionState.knowledgePoints.map((point) => [
        point.id,
        point.title,
      ]),
    );
  }, [codeAwareSessionState.knowledgePoints]);

  // --- Timed passive viewing mastery tracker (two-slot: step + detail) ---
  const {
    startStepTracking,
    startDetailTracking,
    flushStepView,
    flushDetailView,
    flushAllViews,
    peekAndFlushIfReady,
    getTrackingStatus,
    clearAll: clearTimedViews,
  } = useTimedMasteryTracker();

  // Refs to hold latest state — avoids stale closures in interval & pin handlers
  const latestCognitiveStateRef = useRef(codeAwareSessionState);
  const latestPinnedItemsRef = useRef<PinnedItem[]>([]);
  const latestKnowledgeNodeTitleByIdRef = useRef(knowledgeNodeTitleById);
  useEffect(() => {
    latestCognitiveStateRef.current = codeAwareSessionState;
  }, [codeAwareSessionState]);
  useEffect(() => {
    latestKnowledgeNodeTitleByIdRef.current = knowledgeNodeTitleById;
  }, [knowledgeNodeTitleById]);

  /** Apply mastery update for a single flushed result.
   *  Reads latest state from ref to avoid stale closure issues. */
  const applyTimedViewResult = useCallback(
    (flushed: TimedViewResult): void => {
      const currentState = latestCognitiveStateRef.current;
      const interaction: KnowledgeCardInteraction =
        flushed.signal === "overtime"
          ? { type: "timed-view-overtime", value: flushed.type }
          : { type: "timed-view", value: flushed.type };

      const result = applyKnowledgeCardInteraction({
        linkedMasteryNodes: flushed.masteryNodeRefs,
        interaction,
        nodeMasteryScores: currentState.nodeMasteryScores,
        cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
      });

      if (result.changedNodeIds.length > 0) {
        dispatch(setNodeMasteryScores(result.updatedScores));
        emitMasteryUpdateLogs({
          interaction,
          linkedMasteryNodes: flushed.masteryNodeRefs,
          changedNodeIds: result.changedNodeIds,
          debug: result.debug,
          knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
        });
      }
    },
    [dispatch],
  );

  /** Flush ALL pending views (step + detail) and apply mastery updates.
   *  Use when attention is leaving the current step entirely. */
  const handleFlushTimedViewMastery = useCallback((): void => {
    const results = flushAllViews();
    results.forEach(applyTimedViewResult);
  }, [flushAllViews, applyTimedViewResult]);

  /** Flush only detail-level pending view. Step tracking stays alive.
   *  Use when switching between knowledge cards within the same step. */
  const handleFlushDetailTimedView = useCallback((): void => {
    const flushed = flushDetailView();
    flushed.forEach(applyTimedViewResult);
  }, [flushDetailView, applyTimedViewResult]);

  /** Called by Step / KnowledgeCard when user starts viewing content. */
  const handleStartTimedView = useCallback(
    (args: {
      type: "step" | "knowledge-card";
      masteryNodeRefs: MasteryNodeRef[];
      text: string;
    }) => {
      if (args.masteryNodeRefs.length === 0) {
        return;
      }

      const minReadingTimeMs = calculateMinReadingTimeMs(args.text);
      const maxReadingTimeMs = calculateMaxReadingTimeMs(args.text);
      const config = {
        type: args.type,
        masteryNodeRefs: args.masteryNodeRefs,
        startTime: Date.now(),
        minReadingTimeMs,
        maxReadingTimeMs,
        firstThresholdEmitted: false,
        secondThresholdEmitted: false,
        metadata: {
          nodeIds: args.masteryNodeRefs.map((r) => r.nodeId),
        },
      };

      console.info(
        `[CA:Mastery:PhaseG][TrackingStart:${args.type === "step" ? "Step" : "Detail"}]`,
        {
          tag: "CA_PHASE_G_MASTERY",
          type: args.type,
          nodeIds: args.masteryNodeRefs.map((r) => r.nodeId),
          minReadingTimeMs,
        },
      );

      if (args.type === "step") {
        // Flush both slots when switching steps
        handleFlushTimedViewMastery();
        const flushed = startStepTracking(config);
        flushed.forEach(applyTimedViewResult);
      } else {
        // Detail-level: only flush detail slot, step stays alive
        handleFlushDetailTimedView();
        const flushed = startDetailTracking(config);
        flushed.forEach(applyTimedViewResult);
      }
    },
    [
      handleFlushTimedViewMastery,
      handleFlushDetailTimedView,
      startStepTracking,
      startDetailTracking,
    ],
  );

  // Periodic flush: check every 3s if any timed-view has met its threshold
  useEffect(() => {
    const intervalId = setInterval(() => {
      const status = getTrackingStatus();
      const results = peekAndFlushIfReady();
      if (results.length > 0) {
        results.forEach(applyTimedViewResult);
        console.info("[CA:Mastery:PhaseG][PeriodicFlush]", {
          tag: "CA_PHASE_G_MASTERY",
          flushedSlots: results.map((r) => ({
            type: r.type,
            durationMs: r.durationMs,
            nodeCount: r.masteryNodeRefs.length,
          })),
        });
      } else if (status.step || status.detail) {
        console.debug("[CA:Mastery:PhaseG][PeriodicCheck:NotReady]", {
          tag: "CA_PHASE_G_MASTERY",
          step: status.step,
          detail: status.detail,
        });
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [peekAndFlushIfReady, getTrackingStatus, applyTimedViewResult]);

  // Cleanup timed view on unmount
  useEffect(() => {
    return () => {
      clearTimedViews();
    };
  }, [clearTimedViews]);

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
      } catch (error) {
        console.error(" [CA:UI] Failed to create and open Python file:", error);
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
      await logger.addLogEntry("user_request_new_session", {});

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

  // Mastery indicators toggle
  const showMasteryIndicators = useAppSelector(
    (state) => state.codeAwareSession.showMasteryIndicators,
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
    });

    dispatch(resetSessionExceptRequirement());
    dispatch(setUserRequirementStatus("confirmed"));
    void dispatch(executeInitialGeneration({ userRequirement: requirement }))
      .unwrap()
      .catch(async (error) => {
        await logger.addLogEntry("user_retry_initial_generation", {
          result: "error",
          requirement:
            requirement.length > 300
              ? `${requirement.substring(0, 300)}...`
              : requirement,
          error: error instanceof Error ? error.message : String(error),
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

  const handleExportPreset = useCallback(async () => {
    try {
      setIsExportingPreset(true);
      const result = await dispatch(exportPresetSnapshot()).unwrap();

      ideMessenger?.post("showToast", [
        "info",
        `预设 "${result.presetName}" 已导出到 .codeaware-presets/ 目录`,
      ]);

      await logger.addLogEntry("user_export_preset", {
        presetName: result.presetName,
        snapshotPath: result.snapshotPath,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 用户取消导出不算错误
      if (msg.includes("导出取消")) {
        console.log("[CA:UI] 预设导出已取消");
      } else {
        console.error("[CA:UI] 导出预设失败:", error);
        ideMessenger?.post("showToast", ["warning", `导出预设失败: ${msg}`]);
      }
    } finally {
      setIsExportingPreset(false);
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

    // Flush any pending timed view before starting new navigation
    handleFlushTimedViewMastery();

    try {
      setIsMappingLookupInProgress(true);

      // 1. 获取当前选中的代码
      if (!currentCodeSelection) {
        console.warn("[CA:UI] 未选中代码");
        await logger.addLogEntry(
          "user_click_jump_to_semantic_no_selection",
          {},
        );
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
        await logger.addLogEntry("user_click_jump_to_semantic", {
          result: "no_result",
          selectedCodeText: currentCodeSelection.selectedContent
            ? currentCodeSelection.selectedContent.substring(0, 300)
            : "",
          filePath: currentCodeSelection.filePath,
          selectedLines: currentCodeSelection.selectedLines,
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

      // 4. 同时高亮所有关联语义元素，并保留代码侧高亮
      //    构建代码块高亮事件（从查找结果中获取）
      const codeHighlightEvent: HighlightEvent = {
        sourceType: "code",
        identifier: result.chunk.id,
        additionalInfo: result.chunk,
      };
      dispatch(
        updateHighlight([
          codeHighlightEvent,
          ...uniqueSemanticMappings.map((mapping) => ({
            sourceType: mapping.semanticElementType,
            identifier: mapping.semanticElementId,
          })),
        ]),
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

      await logger.addLogEntry("user_click_jump_to_semantic", {
        result: "success",
        codeChunkId: result.chunk.id,
        selectedCodeText: result.chunk.content
          ? result.chunk.content.substring(0, 300)
          : "",
        semanticElementIds: uniqueSemanticMappings.map(
          (mapping) =>
            `${mapping.semanticElementType}:${mapping.semanticElementId}`,
        ),
        matchedStepTitles: uniqueSemanticMappings
          .filter((m) => m.semanticElementType === "step")
          .map((m) => {
            const step = steps.find((s) => s.id === m.semanticElementId);
            return step?.title || m.semanticElementId;
          }),
        matchedCount: uniqueSemanticMappings.length,
      });

      // Start situation tracking for the matched step(s)
      const stepMappings = uniqueSemanticMappings.filter(
        (m) => m.semanticElementType === "step",
      );
      if (stepMappings.length > 0) {
        const groups = computeSituationGroups(
          codeAwareSessionState.codeAwareMappings,
          codeAwareSessionState.codeChunks,
        );
        const selStart = currentCodeSelection.selectedLines[0];
        const selEnd = currentCodeSelection.selectedLines[1];
        const sitRefs: MasteryNodeRef[] = [];
        stepMappings.forEach((m) => {
          groups
            .filter((g) => {
              // Only keep groups whose line range overlaps with the selection
              if (!g.stepIds.includes(m.semanticElementId)) {
                return false;
              }
              const [gStart, gEnd] = g.lineRange;
              return selStart <= gEnd && selEnd >= gStart;
            })
            .forEach((g) => {
              // Compute coverage ratio: how much of this group's lines are selected
              const [gStart, gEnd] = g.lineRange;
              const overlapStart = Math.max(selStart, gStart);
              const overlapEnd = Math.min(selEnd, gEnd);
              const overlapLines = Math.max(0, overlapEnd - overlapStart + 1);
              const coverageRatio = overlapLines / g.lineCount;
              sitRefs.push({
                nodeId: toSituationNodeId(m.semanticElementId, g.groupId),
                nodeType: "situation",
                weight: coverageRatio,
              });
            });
        });
        if (sitRefs.length > 0) {
          startDetailTracking({
            type: "situation",
            masteryNodeRefs: sitRefs,
            startTime: Date.now(),
            minReadingTimeMs: 4000, // fixed 4s threshold for navigation
            maxReadingTimeMs: 8000,
            firstThresholdEmitted: false,
            secondThresholdEmitted: false,
            metadata: { source: "code-to-step" },
          });
          console.info("[CA:Mastery:PhaseG][TrackingStart:Detail]", {
            tag: "CA_PHASE_G_MASTERY",
            type: "situation",
            nodeIds: sitRefs.map((r) => r.nodeId),
            minReadingTimeMs: 4000,
            source: "code-to-step",
          });
        }
      }
    } catch (error) {
      console.error("[CA:UI] 跳转失败:", error);
      await logger.addLogEntry("user_click_jump_to_semantic", {
        result: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsMappingLookupInProgress(false);
    }
  }, [
    currentCodeSelection,
    dispatch,
    logger,
    handleFlushTimedViewMastery,
    codeAwareSessionState.codeAwareMappings,
    codeAwareSessionState.codeChunks,
    startDetailTracking,
  ]);

  const handleJumpToCode = useCallback(async () => {
    console.log("[CA:UI:Nav] 语义 → 代码");

    // Flush any pending timed view before starting new navigation
    handleFlushTimedViewMastery();

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
        await logger.addLogEntry("user_click_jump_to_code_no_selection", {});
        return;
      }

      console.log("[CA:UI] 找到高亮的语义元素:", focusedElement);

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
        await logger.addLogEntry("user_click_jump_to_code", {
          result: "no_result",
          semanticElementId: focusedElement.id,
          semanticElementType: focusedElement.type,
          semanticElementTitle: (() => {
            const step = steps.find((s) => s.id === focusedElement!.id);
            if (step) return step.title;
            const hls = highLevelSteps.find((h) => h.id === focusedElement!.id);
            return hls?.content || focusedElement!.id;
          })(),
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

      // 6. 高亮所有关联代码块，同时保留步骤侧高亮
      const stepHighlightEvent: HighlightEvent = {
        sourceType: focusedElement.type,
        identifier: focusedElement.id,
      };
      dispatch(
        updateHighlight([
          stepHighlightEvent,
          ...matchedChunks.map((chunk) => ({
            sourceType: "code" as const,
            identifier: chunk.id,
            additionalInfo: chunk,
          })),
        ]),
      );

      await logger.addLogEntry("user_click_jump_to_code", {
        result: "success",
        semanticElementId: focusedElement.id,
        semanticElementType: focusedElement.type,
        semanticElementTitle: (() => {
          const step = steps.find((s) => s.id === focusedElement!.id);
          if (step) return step.title;
          const hls = highLevelSteps.find((h) => h.id === focusedElement!.id);
          return hls?.content || focusedElement!.id;
        })(),
        matchedCodeChunks: matchedChunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content ? chunk.content.substring(0, 200) : "",
          filePath: chunk.filePath,
          lineRange: chunk.range,
        })),
        matchedCount: matchedChunks.length,
      });

      // Start situation tracking for the focused step
      if (focusedElement.type === "step") {
        const groups = computeSituationGroups(
          codeAwareSessionState.codeAwareMappings,
          codeAwareSessionState.codeChunks,
        );
        const sitRefs: MasteryNodeRef[] = [];
        groups
          .filter((g) => g.stepIds.includes(focusedElement!.id))
          .forEach((g) => {
            sitRefs.push({
              nodeId: toSituationNodeId(focusedElement!.id, g.groupId),
              nodeType: "situation",
            });
          });
        if (sitRefs.length > 0) {
          startDetailTracking({
            type: "situation",
            masteryNodeRefs: sitRefs,
            startTime: Date.now(),
            minReadingTimeMs: 4000, // fixed 4s threshold for navigation
            maxReadingTimeMs: 8000,
            firstThresholdEmitted: false,
            secondThresholdEmitted: false,
            metadata: { source: "step-to-code" },
          });
          console.info("[CA:Mastery:PhaseG][TrackingStart:Detail]", {
            tag: "CA_PHASE_G_MASTERY",
            type: "situation",
            nodeIds: sitRefs.map((r) => r.nodeId),
            minReadingTimeMs: 4000,
            source: "step-to-code",
          });
        }
      }
    } catch (error) {
      console.error("[CA:UI] 跳转失败:", error);
      await logger.addLogEntry("user_click_jump_to_code", {
        result: "error",
        error: error instanceof Error ? error.message : String(error),
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
    handleFlushTimedViewMastery,
    codeAwareSessionState.codeAwareMappings,
    codeAwareSessionState.codeChunks,
    startDetailTracking,
  ]);

  // Track steps that should be force expanded due to code selection questions
  const [forceExpandedSteps, setForceExpandedSteps] = useState<Set<string>>(
    new Set(),
  );

  // Track steps that were expanded due to global questions (should remain expanded)
  const [globalQuestionExpandedSteps, setGlobalQuestionExpandedSteps] =
    useState<Set<string>>(new Set());

  // Track manually collapsed steps/cards for re-expand mastery signal
  const manuallyCollapsedStepsRef = useRef<Set<string>>(new Set());
  const manuallyCollapsedCardsRef = useRef<Set<string>>(new Set());
  const manuallyCollapsedAnnotationsRef = useRef<Set<string>>(new Set());

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

  // ActionToast state for pin reminders (Phase D & E)
  const [activeToast, setActiveToast] = useState<{
    key: number;
    message: string;
    actions: ActionToastAction[];
  } | null>(null);
  // Track steps already suggested for pinning (avoid repeated prompts)
  const pinSuggestedStepsRef = useRef<Set<string>>(new Set());
  // Track pinned KCs already prompted for unpin on collapse (avoid repeated prompts)
  const unpinPromptedKCsRef = useRef<Set<string>>(new Set());
  // Refs for pin handlers (avoid TDZ — these are defined later in the render)
  const handleStepPinRef = useRef<(stepId: string) => void>(() => {});
  const handlePinRemoveRef = useRef<(itemId: string) => void>(() => {});

  // Global overlay state (replaces old GlobalQuestionModal)
  const [isGlobalOverlayOpen, setIsGlobalOverlayOpen] =
    useState<boolean>(false);
  const [globalOverlayTab, setGlobalOverlayTab] =
    useState<OverlayTab>("confusion");

  // Confusion candidates state (step & global levels)
  const [stepConfusionCandidates, setStepConfusionCandidates] = useState<
    { id: string; label: string; description?: string }[]
  >([]);
  const [stepConfusionCandidatesLoading, setStepConfusionCandidatesLoading] =
    useState(false);
  const [globalConfusionCandidates, setGlobalConfusionCandidates] = useState<
    { id: string; label: string; description?: string }[]
  >([]);
  const [
    globalConfusionCandidatesLoading,
    setGlobalConfusionCandidatesLoading,
  ] = useState(false);

  // Pinned items from Redux
  const pinnedItems = useAppSelector(
    (state) => state.codeAwareSession.pinnedItems,
  );
  // Sync pinnedItems to ref for stale-closure-safe access
  useEffect(() => {
    latestPinnedItemsRef.current = pinnedItems;
  }, [pinnedItems]);

  // Global QA session from Redux
  const globalQASession = useAppSelector(
    (state) => state.codeAwareSession.globalQASession,
  );

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

      // 检测是否为预设密语 (@preset:name)
      const presetName = detectPresetTrigger(requirement);
      if (presetName) {
        console.log(`[CA:UI] 检测到预设密语: ${presetName}`);
        await logger.addLogEntry("user_load_preset", {
          presetName,
        });
        dispatch(resetSessionExceptRequirement());
        dispatch(submitRequirementContent(requirement));
        dispatch(setUserRequirementStatus("confirmed"));
        void dispatch(loadPresetSnapshot({ presetName }))
          .unwrap()
          .then(async () => {
            console.log(`[CA:UI] 预设 "${presetName}" 加载完成`);
            await logger.addLogEntry("user_load_preset_result", {
              result: "success",
              presetName,
            });
          })
          .catch(async (error) => {
            console.error(`[CA:UI] 预设 "${presetName}" 加载失败`, error);
            await logger.addLogEntry("user_load_preset_result", {
              result: "error",
              presetName,
              error: error instanceof Error ? error.message : String(error),
            });
          });
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
          await logger.addLogEntry("user_regenerate_steps_result", {
            result: "success",
            requirement: requirement.trim(),
          });
        })
        .catch(async (error) => {
          console.error("[CA:UI] Initial generation flow failed", error);
          await logger.addLogEntry("user_regenerate_steps_result", {
            result: "error",
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
    await logger.addLogEntry("user_request_regenerate_code", {});

    try {
      console.log("[CA:UI] Starting code regeneration...");

      // 1. Clear all code chunks and mappings
      dispatch(clearAllCodeAndMappings());

      await logger.addLogEntry("user_clear_code_and_mappings", {});

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

        await logger.addLogEntry("user_regenerate_code_result", {
          result: "no_steps",
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

        await logger.addLogEntry("user_regenerate_code_result", {
          result: "success",
          stepsCount: generatedSteps.length,
          stepIds: generatedSteps.map((s) => s.id),
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

        await logger.addLogEntry("user_regenerate_code_result", {
          result: "error",
          error: result.error.message || "Code regeneration failed",
          stepsCount: generatedSteps.length,
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

      await logger.addLogEntry("user_regenerate_code_result", {
        result: "error",
        error: error instanceof Error ? error.message : String(error),
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
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
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
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
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

  // 记录知识卡片首次查看
  const handleKnowledgeCardFirstView = useCallback(
    (stepId: string, cardId: string) => {
      dispatch(setKnowledgeCardViewedAt({ stepId, cardId }));
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
    await logger.addLogEntry("user_clear_all_highlights", {});

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
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
      });

      try {
        // 1. 根据step_id获取截止到该步骤的所有未执行步骤信息
        const targetStepIndex = steps.findIndex((step) => step.id === stepId);
        if (targetStepIndex === -1) {
          console.error(`[CA:UI] Step with id ${stepId} not found`);
          await logger.addLogEntry("user_execute_steps_result", {
            result: "error",
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
          await logger.addLogEntry("user_execute_steps_result", {
            result: "success",
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
          await logger.addLogEntry("user_execute_steps_result", {
            result: "no_file",
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
        await logger.addLogEntry("user_execute_steps_result", {
          result: "error",
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
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
      });

      try {
        // 找到对应的步骤
        const step = steps.find((s) => s.id === stepId);
        if (!step) {
          console.error(`[CA:UI] Step with id ${stepId} not found`);
          await logger.addLogEntry("user_rerun_step_result", {
            result: "error",
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
          await logger.addLogEntry("user_rerun_step_result", {
            result: "error",
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

        await logger.addLogEntry("user_rerun_step_result", {
          result: "success",
          stepId,
        });
      } catch (error) {
        console.error("[CA:UI] 重新运行步骤时发生错误:", error);
        await logger.addLogEntry("user_rerun_step_result", {
          result: "error",
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

  const handleStepStatusChange = useCallback(
    async (stepId: string, newStatus: StepStatus) => {
      await logger.addLogEntry("user_change_step_status", {
        stepId,
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
        newStatus,
      });

      // Update step status in Redux store
      dispatch(setStepStatus({ stepId, status: newStatus }));
    },
    [dispatch, logger, steps],
  );

  const handleStepExpansionChange = useCallback(
    async (stepId: string, isExpanded: boolean) => {
      console.log(`[CA:UI] Step ${stepId} expansion changed to: ${isExpanded}`);

      const currentState = latestCognitiveStateRef.current;

      if (isExpanded) {
        // Re-expand mastery signal: only if user previously manually collapsed this step
        if (manuallyCollapsedStepsRef.current.has(stepId)) {
          const reExpandInteraction: KnowledgeCardInteraction = {
            type: "re-expand",
          };
          const reExpandResult = applyKnowledgeCardInteraction({
            linkedMasteryNodes: [{ nodeId: stepId, nodeType: "step" }],
            interaction: reExpandInteraction,
            nodeMasteryScores: currentState.nodeMasteryScores,
            cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
          });
          if (reExpandResult.changedNodeIds.length > 0) {
            dispatch(setNodeMasteryScores(reExpandResult.updatedScores));
            emitMasteryUpdateLogs({
              interaction: reExpandInteraction,
              linkedMasteryNodes: [{ nodeId: stepId, nodeType: "step" }],
              changedNodeIds: reExpandResult.changedNodeIds,
              debug: reExpandResult.debug,
              knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
            });
          }
        }

        // 首次展开时，生成前置背景知识卡片
        const expandedStep = steps.find((step) => step.id === stepId);
        const isGenerationIdle =
          expandedStep?.knowledgeCardGenerationStatus !== "generating";
        const isFirstExpansion =
          expandedStep?.knowledgeCardGenerationStatus === "empty";

        if (expandedStep && isFirstExpansion && isGenerationIdle) {
          await dispatch(generatePrerequisiteKnowledgeCards({ stepId }));
        }

        // Phase E: suggest pinning if step was viewed before and is not pinned
        if (
          expandedStep &&
          !isFirstExpansion &&
          !pinSuggestedStepsRef.current.has(stepId) &&
          !latestPinnedItemsRef.current.some(
            (p) => p.level === "step" && p.targetId === stepId,
          )
        ) {
          pinSuggestedStepsRef.current.add(stepId);
          setActiveToast({
            key: Date.now(),
            message: "这块是不是有点难，要不要码住待会儿再学？",
            actions: [
              {
                label: "码住",
                variant: "primary",
                onClick: () => handleStepPinRef.current(stepId),
              },
              { label: "不用了", onClick: () => {} },
            ],
          });
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
        }
      } else {
        // Collapse mastery signal: strong positive (user finished viewing)
        manuallyCollapsedStepsRef.current.add(stepId);

        // Flush pending timed views first (attention is leaving)
        handleFlushTimedViewMastery();

        const collapseInteraction: KnowledgeCardInteraction = {
          type: "collapse",
        };
        const collapseResult = applyKnowledgeCardInteraction({
          linkedMasteryNodes: [{ nodeId: stepId, nodeType: "step" }],
          interaction: collapseInteraction,
          nodeMasteryScores: latestCognitiveStateRef.current.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(
            latestCognitiveStateRef.current,
          ),
        });
        if (collapseResult.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(collapseResult.updatedScores));
          emitMasteryUpdateLogs({
            interaction: collapseInteraction,
            linkedMasteryNodes: [{ nodeId: stepId, nodeType: "step" }],
            changedNodeIds: collapseResult.changedNodeIds,
            debug: collapseResult.debug,
            knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
          });
        }

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

        // Phase D: remind to unpin if step is currently pinned
        const pinnedStep = latestPinnedItemsRef.current.find(
          (p) => p.level === "step" && p.targetId === stepId,
        );
        if (pinnedStep) {
          setActiveToast({
            key: Date.now(),
            message: "这块弄清楚了吗？可以取消码住哦",
            actions: [
              {
                label: "取消码住",
                variant: "primary",
                onClick: () => handlePinRemoveRef.current(pinnedStep.id),
              },
              { label: "还没弄懂", onClick: () => {} },
            ],
          });
        }
      }
    },
    [
      dispatch,
      steps,
      setForceExpandedSteps,
      setGlobalQuestionExpandedSteps,
      handleFlushTimedViewMastery,
    ],
  );

  const handleKnowledgeCardExpansionChange = useCallback(
    (_stepId: string, cardId: string, isExpanded: boolean) => {
      const currentState = latestCognitiveStateRef.current;

      if (isExpanded) {
        // Re-expand mastery signal: only if user previously manually collapsed this card
        if (manuallyCollapsedCardsRef.current.has(cardId)) {
          // Find the card's linked mastery nodes
          const step = steps.find((s) => s.id === _stepId);
          const card = step?.knowledgeCards.find((k) => k.id === cardId);
          const linkedMasteryNodes = card?.linkedMasteryNodes || [];
          const linkedKnowledgeNodeIds = card?.linkedKnowledgeNodeIds || [];

          if (
            linkedMasteryNodes.length > 0 ||
            linkedKnowledgeNodeIds.length > 0
          ) {
            const reExpandInteraction: KnowledgeCardInteraction = {
              type: "re-expand",
            };
            const reExpandResult = applyKnowledgeCardInteraction({
              linkedMasteryNodes,
              linkedKnowledgeNodeIds,
              interaction: reExpandInteraction,
              nodeMasteryScores: currentState.nodeMasteryScores,
              cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
            });
            if (reExpandResult.changedNodeIds.length > 0) {
              dispatch(setNodeMasteryScores(reExpandResult.updatedScores));
              emitMasteryUpdateLogs({
                interaction: reExpandInteraction,
                linkedMasteryNodes,
                linkedKnowledgeNodeIds,
                changedNodeIds: reExpandResult.changedNodeIds,
                debug: reExpandResult.debug,
                knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
              });
            }
          }
        }
      } else {
        // Collapse mastery signal: strong positive (user finished viewing this card)
        manuallyCollapsedCardsRef.current.add(cardId);

        // Flush only detail-level view (step tracking stays alive)
        handleFlushDetailTimedView();

        // Find the card's linked mastery nodes
        const step = steps.find((s) => s.id === _stepId);
        const card = step?.knowledgeCards.find((k) => k.id === cardId);
        const linkedMasteryNodes = card?.linkedMasteryNodes || [];
        const linkedKnowledgeNodeIds = card?.linkedKnowledgeNodeIds || [];

        if (
          linkedMasteryNodes.length > 0 ||
          linkedKnowledgeNodeIds.length > 0
        ) {
          const collapseInteraction: KnowledgeCardInteraction = {
            type: "collapse",
          };
          const collapseResult = applyKnowledgeCardInteraction({
            linkedMasteryNodes,
            linkedKnowledgeNodeIds,
            interaction: collapseInteraction,
            nodeMasteryScores:
              latestCognitiveStateRef.current.nodeMasteryScores,
            cognitiveEdges: buildCodeAwareCognitiveEdges(
              latestCognitiveStateRef.current,
            ),
          });
          if (collapseResult.changedNodeIds.length > 0) {
            dispatch(setNodeMasteryScores(collapseResult.updatedScores));
            emitMasteryUpdateLogs({
              interaction: collapseInteraction,
              linkedMasteryNodes,
              linkedKnowledgeNodeIds,
              changedNodeIds: collapseResult.changedNodeIds,
              debug: collapseResult.debug,
              knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
            });
          }
        }

        // Phase D: remind to unpin when a pinned knowledge card is collapsed
        if (!unpinPromptedKCsRef.current.has(cardId)) {
          const pinnedKC = latestPinnedItemsRef.current.find(
            (p) => p.level === "knowledge-card" && p.targetId === cardId,
          );
          if (pinnedKC) {
            unpinPromptedKCsRef.current.add(cardId);
            setActiveToast({
              key: Date.now(),
              message: "这块弄清楚了吗？可以取消码住哦",
              actions: [
                {
                  label: "取消码住",
                  variant: "primary",
                  onClick: () => handlePinRemoveRef.current(pinnedKC.id),
                },
                { label: "还没弄懂", onClick: () => {} },
              ],
            });
          }
        }
      }
    },
    [dispatch, steps, handleFlushDetailTimedView],
  );

  const handleKnowledgeCardViewModeChange = useCallback(
    (
      stepId: string,
      cardId: string,
      viewMode: "read" | "self-test" | "answer",
    ) => {
      // Flush only detail-level view (step tracking stays alive)
      handleFlushDetailTimedView();

      dispatch(
        setKnowledgeCardViewMode({
          stepId,
          cardId,
          viewMode,
        }),
      );
    },
    [dispatch, handleFlushDetailTimedView],
  );

  const handleKnowledgeCardFeedback = useCallback(
    (stepId: string, cardId: string, feedback: "understood" | "uncertain") => {
      // Flush only detail-level view (step tracking stays alive)
      handleFlushDetailTimedView();

      dispatch(
        setKnowledgeCardFeedback({
          stepId,
          cardId,
          feedback,
        }),
      );
    },
    [dispatch, handleFlushDetailTimedView],
  );

  const handleQuestionSubmit = useCallback(
    async (stepId: string, selectedText: string, question: string) => {
      console.log("[CA:UI] 处理步骤问题提交:", {
        stepId,
        selectedText,
        question,
      });

      await logger.addLogEntry("user_submit_question", {
        stepId,
        selectedText: selectedText.substring(0, 200), // Log first 200 chars
        question: question.substring(0, 200), // Log first 200 chars
      });

      // 通过stepId查找对应的步骤信息
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        console.error("[CA:UI] 未找到对应的步骤:", stepId);
        await logger.addLogEntry("user_submit_question_result", {
          result: "error",
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
            "[CA:UI]  Knowledge card themes generated successfully, status set to checked",
          );

          await logger.addLogEntry("user_submit_question_result", {
            result: "success",
            stepId,
          });
        } else if (
          generateKnowledgeCardThemesFromQuery.rejected.match(result)
        ) {
          console.error(
            "[CA:UI]  Failed to generate knowledge card themes:",
            result.error.message,
          );
          await logger.addLogEntry("user_submit_question_result", {
            result: "error",
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
        await logger.addLogEntry("user_submit_question_result", {
          result: "error",
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

  // Handle global confusion ask — ConfusionPanel onAsk callback
  const handleGlobalConfusionAsk = useCallback(
    async (
      question: string,
      conversationHistory: Array<{
        role: "user" | "assistant";
        content: string;
      }>,
    ): Promise<string> => {
      await logger.addLogEntry("user_submit_global_confusion_question", {
        question: question.substring(0, 200),
      });

      let currentCode = "";
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
          currentCode = currentFileResponse.content.contents || "";
        }
      } catch {
        // Continue without code context
      }

      const result = await dispatch(
        respondToConfusionQA({
          question,
          context: {
            level: "global",
            conversationHistory,
            learningGoal: learningGoal || "",
            taskDescription: task?.requirementDescription || "",
            currentCode,
          },
        }),
      ).unwrap();
      return result.response;
    },
    [dispatch, ideMessenger, logger, learningGoal, task],
  );

  // Handle global confusion end — convert messages to knowledge card
  const handleGlobalConfusionEnd = useCallback(
    async (messages: ConfusionMessage[]) => {
      // Close overlay immediately so user can continue learning
      setIsGlobalOverlayOpen(false);

      if (messages.length === 0) {
        return;
      }

      await logger.addLogEntry("user_end_global_confusion", {
        messageCount: messages.length,
        conversation: messages.map((m) => ({
          role: m.role,
          content:
            m.content.length > 500
              ? m.content.substring(0, 500) + "..."
              : m.content,
        })),
      });

      // Populate globalQASession for convertQAToKnowledgeCard
      dispatch(startGlobalQASession());
      for (const msg of messages) {
        dispatch(
          addGlobalQAMessage({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          }),
        );
      }

      try {
        const result = await dispatch(convertQAToKnowledgeCard()).unwrap();
        const { stepId, cardId } = result;

        setActiveToast({
          key: Date.now(),
          message: "知识卡片已添加到相关步骤",
          actions: [{ label: "知道了", onClick: () => {} }],
        });

        await logger.addLogEntry("user_global_confusion_card_created", {
          stepId,
          stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
          cardId,
        });
      } catch (error) {
        console.error(
          "[CA:UI] Failed to convert global confusion to card:",
          error,
        );
        setActiveToast({
          key: Date.now(),
          message: "问答转化为知识卡片失败",
          actions: [{ label: "知道了", onClick: () => {} }],
        });
      } finally {
        dispatch(clearGlobalQASession());
      }
    },
    [dispatch, logger, steps],
  );

  // Handle global "待学" — like confusion end but with negative mastery signal + auto-pin
  const handleGlobalPendingLearn = useCallback(
    async (messages: ConfusionMessage[]) => {
      setIsGlobalOverlayOpen(false);

      if (messages.length === 0) return;

      await logger.addLogEntry("user_global_pending_learn", {
        messageCount: messages.length,
        conversation: messages.map((m) => ({
          role: m.role,
          content:
            m.content.length > 500
              ? m.content.substring(0, 500) + "..."
              : m.content,
        })),
      });

      // Populate globalQASession for convertQAToKnowledgeCard
      dispatch(startGlobalQASession());
      for (const msg of messages) {
        dispatch(
          addGlobalQAMessage({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          }),
        );
      }

      try {
        const result = await dispatch(convertQAToKnowledgeCard()).unwrap();
        const { stepId, cardId } = result;

        // Apply negative mastery signal to the NEW card's linked nodes
        const freshState = latestCognitiveStateRef.current;
        const targetStep = freshState.steps.find((s) => s.id === stepId);
        const targetCard = targetStep?.knowledgeCards.find(
          (k) => k.id === cardId,
        );
        const linkedMasteryNodes = targetCard?.linkedMasteryNodes || [
          { nodeId: stepId, nodeType: "step" as const },
        ];
        const linkedKnowledgeNodeIds = targetCard?.linkedKnowledgeNodeIds || [];
        const interaction: KnowledgeCardInteraction = {
          type: "confusion",
          value: "ask",
        };
        const masteryResult = applyKnowledgeCardInteraction({
          linkedMasteryNodes,
          linkedKnowledgeNodeIds,
          interaction,
          nodeMasteryScores: freshState.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(freshState),
        });
        if (masteryResult.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(masteryResult.updatedScores));
          emitMasteryUpdateLogs({
            interaction,
            linkedMasteryNodes,
            linkedKnowledgeNodeIds,
            changedNodeIds: masteryResult.changedNodeIds,
            debug: masteryResult.debug,
            knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
          });
        }

        // Auto-pin the new card to 待学 list
        dispatch(
          addPinnedItem({
            id: `pin-pending-${cardId}`,
            level: "knowledge-card",
            targetId: cardId,
            title: targetCard?.title || "待学知识点",
            stepId,
            pinnedAt: Date.now(),
          }),
        );

        setActiveToast({
          key: Date.now(),
          message: "知识卡片已添加到待学列表",
          actions: [{ label: "知道了", onClick: () => {} }],
        });
      } catch (error) {
        console.error(
          "[CA:UI] Failed to convert global pending-learn to card:",
          error,
        );
        setActiveToast({
          key: Date.now(),
          message: "问答转化为知识卡片失败",
          actions: [{ label: "知道了", onClick: () => {} }],
        });
      } finally {
        dispatch(clearGlobalQASession());
      }
    },
    [dispatch, logger, steps, codeAwareSessionState],
  );

  // Global overlay open/close
  const handleOpenGlobalOverlay = useCallback(
    (tab: OverlayTab) => {
      setGlobalOverlayTab(tab);
      setIsGlobalOverlayOpen(true);
      void logger.addLogEntry("user_open_global_overlay", {
        tab,
      });

      // Generate global confusion candidates when confusion tab opens
      if (tab === "confusion") {
        setGlobalConfusionCandidatesLoading(true);
        setGlobalConfusionCandidates([]);
        void dispatch(generateGlobalConfusionCandidates())
          .unwrap()
          .then((result) => {
            setGlobalConfusionCandidates(result);
          })
          .catch((error) => {
            console.warn(
              "[CA:UI] Failed to generate global confusion candidates:",
              error,
            );
          })
          .finally(() => {
            setGlobalConfusionCandidatesLoading(false);
          });
      }
    },
    [dispatch, logger],
  );

  const handleCloseGlobalOverlay = useCallback(() => {
    setIsGlobalOverlayOpen(false);
    void logger.addLogEntry("user_close_global_overlay", {});
  }, [logger]);

  // Pin navigation: scroll to target item
  const handlePinNavigate = useCallback(
    (item: PinnedItem) => {
      setIsGlobalOverlayOpen(false);

      if (item.level === "step") {
        // Highlight and scroll to step
        dispatch(
          updateHighlight({ sourceType: "step", identifier: item.targetId }),
        );
        setForceExpandedSteps((prev) => new Set([...prev, item.targetId]));
      } else if (item.level === "knowledge-card" && item.stepId) {
        // Expand parent step and highlight knowledge card
        dispatch(
          updateHighlight({ sourceType: "step", identifier: item.stepId }),
        );
        setForceExpandedSteps((prev) => new Set([...prev, item.stepId!]));
      } else if (item.level === "code" && item.filePath && item.lineRange) {
        // 跳转到 IDE 中对应文件/行并展开注释 CommentThread
        ideMessenger?.post("revealCodeAnnotation", {
          annotationId: item.targetId,
          filePath: item.filePath,
          lineRange: item.lineRange,
        });
      }

      void logger.addLogEntry("user_navigate_to_pinned_item", {
        pinnedItemId: item.id,
        level: item.level,
        targetId: item.targetId,
        itemTitle: item.title || item.targetId,
      });
    },
    [dispatch, logger, ideMessenger, setForceExpandedSteps],
  );

  // Pin removal (from global overlay) — also applies mastery update (unpin = confident)
  const handlePinRemove = useCallback(
    (itemId: string) => {
      const currentPinnedItems = latestPinnedItemsRef.current;
      const currentState = latestCognitiveStateRef.current;
      const item = currentPinnedItems.find((p) => p.id === itemId);

      dispatch(removePinnedItem(itemId));

      // Apply mastery increase for unpin
      if (item) {
        let linkedMasteryNodes: MasteryNodeRef[] = [];

        if (item.level === "step") {
          linkedMasteryNodes = [{ nodeId: item.targetId, nodeType: "step" }];
        } else if (item.level === "knowledge-card" && item.stepId) {
          const step = steps.find((s) => s.id === item.stepId);
          const card = step?.knowledgeCards.find((k) => k.id === item.targetId);
          linkedMasteryNodes = card?.linkedMasteryNodes || [];
        } else if (item.level === "code") {
          const codeChunks = currentState.codeChunks;
          if (item.lineRange) {
            const [selStart, selEnd] = item.lineRange;
            codeChunks.forEach((chunk) => {
              const [chunkStart, chunkEnd] = chunk.range;
              if (chunkStart <= selEnd && chunkEnd >= selStart) {
                linkedMasteryNodes.push({
                  nodeId: chunk.id,
                  nodeType: "code-chunk",
                });
              }
            });
          }
        }

        if (linkedMasteryNodes.length > 0) {
          const interaction: KnowledgeCardInteraction = {
            type: "pin",
            value: "unpin",
          };
          const result = applyKnowledgeCardInteraction({
            linkedMasteryNodes,
            interaction,
            nodeMasteryScores: currentState.nodeMasteryScores,
            cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
          });
          if (result.changedNodeIds.length > 0) {
            dispatch(setNodeMasteryScores(result.updatedScores));
            emitMasteryUpdateLogs({
              interaction,
              linkedMasteryNodes,
              changedNodeIds: result.changedNodeIds,
              debug: result.debug,
              knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
            });
          }
        }
      }

      void logger.addLogEntry("user_remove_pin", {
        pinnedItemId: itemId,
        level: item?.level,
        targetId: item?.targetId,
        itemTitle: item?.title || item?.targetId,
      });
    },
    [dispatch, logger, steps],
  );

  // Step-level confusion handler — opens panel and generates mastery-based candidates
  const handleStepConfusion = useCallback(
    async (stepId: string) => {
      await logger.addLogEntry("user_step_confusion", {
        stepId,
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
      });
      // Generate mastery-based candidates asynchronously
      setStepConfusionCandidatesLoading(true);
      setStepConfusionCandidates([]);
      try {
        const result = await dispatch(
          generateStepConfusionCandidates({ stepId }),
        ).unwrap();
        setStepConfusionCandidates(result);
      } catch (error) {
        console.warn(
          "[CA:UI] Failed to generate step confusion candidates:",
          error,
        );
      } finally {
        setStepConfusionCandidatesLoading(false);
      }
    },
    [dispatch, logger, steps],
  );

  // Step-level confusion Q&A ask handler
  const handleStepConfusionAsk = useCallback(
    async (
      stepId: string,
      question: string,
      conversationHistory: Array<{
        role: "user" | "assistant";
        content: string;
      }>,
    ): Promise<string> => {
      const step = steps.find((s) => s.id === stepId);
      const result = await dispatch(
        respondToConfusionQA({
          question,
          context: {
            level: "step",
            stepId,
            conversationHistory,
            learningGoal: learningGoal || "",
            taskDescription: task?.requirementDescription || "",
          },
        }),
      ).unwrap();
      return result.response;
    },
    [dispatch, steps, learningGoal, task],
  );

  // Step-level confusion Q&A end handler — creates new knowledge card
  const handleStepConfusionEnd = useCallback(
    async (stepId: string, messages: ConfusionMessage[]) => {
      await logger.addLogEntry("user_step_confusion_end", {
        stepId,
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
        messageCount: messages.length,
        conversation: messages.map((m) => ({
          role: m.role,
          content:
            m.content.length > 500
              ? m.content.substring(0, 500) + "..."
              : m.content,
        })),
      });

      if (messages.length === 0) return;

      // Apply mastery "understanding complete" update
      const interaction: KnowledgeCardInteraction = {
        type: "understanding-complete",
      };
      const masteryResult = applyKnowledgeCardInteraction({
        linkedMasteryNodes: [{ nodeId: stepId, nodeType: "step" }],
        interaction,
        nodeMasteryScores: codeAwareSessionState.nodeMasteryScores,
        cognitiveEdges: buildCodeAwareCognitiveEdges(codeAwareSessionState),
      });
      if (masteryResult.changedNodeIds.length > 0) {
        dispatch(setNodeMasteryScores(masteryResult.updatedScores));
        emitMasteryUpdateLogs({
          interaction,
          linkedMasteryNodes: [{ nodeId: stepId, nodeType: "step" }],
          changedNodeIds: masteryResult.changedNodeIds,
          debug: masteryResult.debug,
          knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
        });
      }

      // Convert Q&A to knowledge card via existing thunk
      // First populate globalQASession so convertQAToKnowledgeCard can pick it up
      dispatch(startGlobalQASession());
      for (const msg of messages) {
        dispatch(
          addGlobalQAMessage({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          }),
        );
      }

      try {
        const result = await dispatch(convertQAToKnowledgeCard()).unwrap();
        const { stepId: targetStepId, cardId } = result;

        setActiveToast({
          key: Date.now(),
          message: "知识卡片已添加到相关步骤",
          actions: [{ label: "知道了", onClick: () => {} }],
        });

        await logger.addLogEntry("user_step_confusion_card_created", {
          stepId: targetStepId,
          stepTitle:
            steps.find((s) => s.id === targetStepId)?.title || targetStepId,
          cardId,
        });
      } catch (error) {
        console.error(
          "[CA:UI] Failed to convert step confusion to card:",
          error,
        );
        setActiveToast({
          key: Date.now(),
          message: "问答转化为知识卡片失败",
          actions: [{ label: "知道了", onClick: () => {} }],
        });
      } finally {
        dispatch(clearGlobalQASession());
      }
    },
    [dispatch, logger, steps, codeAwareSessionState],
  );

  // Step-level "待学" handler — negative mastery signal + create card + auto-pin
  const handleStepPendingLearn = useCallback(
    async (stepId: string, messages: ConfusionMessage[]) => {
      await logger.addLogEntry("user_step_pending_learn", {
        stepId,
        stepTitle: steps.find((s) => s.id === stepId)?.title || stepId,
        messageCount: messages.length,
        conversation: messages.map((m) => ({
          role: m.role,
          content:
            m.content.length > 500
              ? m.content.substring(0, 500) + "..."
              : m.content,
        })),
      });

      if (messages.length === 0) return;

      // Convert Q&A to knowledge card first
      dispatch(startGlobalQASession());
      for (const msg of messages) {
        dispatch(
          addGlobalQAMessage({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          }),
        );
      }

      try {
        const result = await dispatch(convertQAToKnowledgeCard()).unwrap();
        const { stepId: targetStepId, cardId } = result;

        // Apply negative mastery signal to the NEW card's linked nodes
        const freshState = latestCognitiveStateRef.current;
        const targetStep = freshState.steps.find((s) => s.id === targetStepId);
        const targetCard = targetStep?.knowledgeCards.find(
          (k) => k.id === cardId,
        );
        const linkedMasteryNodes = targetCard?.linkedMasteryNodes || [
          { nodeId: targetStepId, nodeType: "step" as const },
        ];
        const linkedKnowledgeNodeIds = targetCard?.linkedKnowledgeNodeIds || [];
        const interaction: KnowledgeCardInteraction = {
          type: "confusion",
          value: "ask",
        };
        const masteryResult = applyKnowledgeCardInteraction({
          linkedMasteryNodes,
          linkedKnowledgeNodeIds,
          interaction,
          nodeMasteryScores: freshState.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(freshState),
        });
        if (masteryResult.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(masteryResult.updatedScores));
          emitMasteryUpdateLogs({
            interaction,
            linkedMasteryNodes,
            linkedKnowledgeNodeIds,
            changedNodeIds: masteryResult.changedNodeIds,
            debug: masteryResult.debug,
            knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
          });
        }

        // Auto-pin the new card
        dispatch(
          addPinnedItem({
            id: `pin-pending-${cardId}`,
            level: "knowledge-card",
            targetId: cardId,
            title: targetCard?.title || "待学知识点",
            stepId: targetStepId,
            pinnedAt: Date.now(),
          }),
        );

        setActiveToast({
          key: Date.now(),
          message: "知识卡片已添加到待学列表",
          actions: [{ label: "知道了", onClick: () => {} }],
        });
      } catch (error) {
        console.error(
          "[CA:UI] Failed to convert step pending-learn to card:",
          error,
        );
        setActiveToast({
          key: Date.now(),
          message: "问答转化为知识卡片失败",
          actions: [{ label: "知道了", onClick: () => {} }],
        });
      } finally {
        dispatch(clearGlobalQASession());
      }
    },
    [dispatch, logger, steps, codeAwareSessionState],
  );

  // Debounce ref for pin handlers — prevents stale closure issues on rapid clicks
  const lastPinTimestampRef = useRef<number>(0);
  const PIN_DEBOUNCE_MS = 300;

  // Step-level pin handler (uses refs to avoid stale closure)
  const handleStepPin = useCallback(
    (stepId: string) => {
      const now = Date.now();
      if (now - lastPinTimestampRef.current < PIN_DEBOUNCE_MS) return;
      lastPinTimestampRef.current = now;

      const step = steps.find((s) => s.id === stepId);
      if (!step) return;

      const currentPinnedItems = latestPinnedItemsRef.current;
      const currentState = latestCognitiveStateRef.current;
      const alreadyPinned = currentPinnedItems.some(
        (p) => p.level === "step" && p.targetId === stepId,
      );

      const linkedMasteryNodes: MasteryNodeRef[] = [
        { nodeId: stepId, nodeType: "step" },
      ];
      const interaction: KnowledgeCardInteraction = {
        type: "pin",
        value: alreadyPinned ? "unpin" : "pin",
      };

      if (alreadyPinned) {
        const pin = currentPinnedItems.find(
          (p) => p.level === "step" && p.targetId === stepId,
        );
        if (pin) dispatch(removePinnedItem(pin.id));
      } else {
        const newPin: PinnedItem = {
          id: `pin-step-${stepId}-${now}`,
          level: "step",
          targetId: stepId,
          title: step.title,
          pinnedAt: now,
        };
        dispatch(addPinnedItem(newPin));
      }

      const result = applyKnowledgeCardInteraction({
        linkedMasteryNodes,
        interaction,
        nodeMasteryScores: currentState.nodeMasteryScores,
        cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
      });
      if (result.changedNodeIds.length > 0) {
        dispatch(setNodeMasteryScores(result.updatedScores));
        emitMasteryUpdateLogs({
          interaction,
          linkedMasteryNodes,
          changedNodeIds: result.changedNodeIds,
          debug: result.debug,
          knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
        });
      }

      void logger.addLogEntry("user_toggle_step_pin", {
        stepId,
        stepTitle: step.title,
        action: alreadyPinned ? "unpin" : "pin",
      });
    },
    [dispatch, logger, steps],
  );

  // Sync pin handler refs (avoids TDZ in earlier useCallbacks)
  handleStepPinRef.current = handleStepPin;
  handlePinRemoveRef.current = handlePinRemove;

  // Knowledge card level pin handler (uses refs to avoid stale closure)
  const handleKnowledgeCardPin = useCallback(
    (stepId: string, cardId: string) => {
      const now = Date.now();
      if (now - lastPinTimestampRef.current < PIN_DEBOUNCE_MS) return;
      lastPinTimestampRef.current = now;

      const step = steps.find((s) => s.id === stepId);
      const card = step?.knowledgeCards.find((k) => k.id === cardId);
      if (!card) return;

      const currentPinnedItems = latestPinnedItemsRef.current;
      const currentState = latestCognitiveStateRef.current;
      const alreadyPinned = currentPinnedItems.some(
        (p) => p.level === "knowledge-card" && p.targetId === cardId,
      );

      const linkedMasteryNodes = card.linkedMasteryNodes || [];
      const interaction: KnowledgeCardInteraction = {
        type: "pin",
        value: alreadyPinned ? "unpin" : "pin",
      };

      if (alreadyPinned) {
        const pin = currentPinnedItems.find(
          (p) => p.level === "knowledge-card" && p.targetId === cardId,
        );
        if (pin) dispatch(removePinnedItem(pin.id));
      } else {
        const newPin: PinnedItem = {
          id: `pin-kc-${cardId}-${now}`,
          level: "knowledge-card",
          targetId: cardId,
          title: card.title,
          stepId,
          pinnedAt: now,
        };
        dispatch(addPinnedItem(newPin));
      }

      const result = applyKnowledgeCardInteraction({
        linkedMasteryNodes,
        interaction,
        nodeMasteryScores: currentState.nodeMasteryScores,
        cognitiveEdges: buildCodeAwareCognitiveEdges(currentState),
      });
      if (result.changedNodeIds.length > 0) {
        dispatch(setNodeMasteryScores(result.updatedScores));
        emitMasteryUpdateLogs({
          interaction,
          linkedMasteryNodes,
          changedNodeIds: result.changedNodeIds,
          debug: result.debug,
          knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
        });
      }

      void logger.addLogEntry("user_toggle_kc_pin", {
        stepId,
        cardId,
        cardTitle: card.title,
        action: alreadyPinned ? "unpin" : "pin",
      });
    },
    [dispatch, logger, steps],
  );

  // Knowledge card level confusion ask handler
  const handleKCConfusionAsk = useCallback(
    async (
      stepId: string,
      cardId: string,
      question: string,
      conversationHistory: Array<{
        role: "user" | "assistant";
        content: string;
      }>,
    ): Promise<string> => {
      const step = steps.find((s) => s.id === stepId);
      const card = step?.knowledgeCards.find((k) => k.id === cardId);

      await logger.addLogEntry("user_kc_confusion_ask", {
        stepId,
        cardId,
        cardTitle: card?.title || cardId,
        question: question.substring(0, 200),
      });

      // Apply mastery decrease for confusion
      if (card) {
        const interaction: KnowledgeCardInteraction = {
          type: "confusion",
          value: "ask",
        };
        const linkedMasteryNodes = card.linkedMasteryNodes || [];
        const linkedKnowledgeNodeIds = card.linkedKnowledgeNodeIds || [];
        const result = applyKnowledgeCardInteraction({
          linkedMasteryNodes,
          linkedKnowledgeNodeIds,
          interaction,
          nodeMasteryScores: codeAwareSessionState.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(codeAwareSessionState),
        });
        if (result.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(result.updatedScores));
          emitMasteryUpdateLogs({
            interaction,
            linkedMasteryNodes,
            linkedKnowledgeNodeIds,
            changedNodeIds: result.changedNodeIds,
            debug: result.debug,
            knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
          });
        }
      }

      const result = await dispatch(
        respondToConfusionQA({
          question,
          context: {
            level: "knowledge-card",
            stepId,
            cardId,
            currentContent: card?.content || "",
            conversationHistory,
            learningGoal: learningGoal || "",
            taskDescription: task?.requirementDescription || "",
          },
        }),
      ).unwrap();
      return result.response;
    },
    [dispatch, steps, logger, learningGoal, task, codeAwareSessionState],
  );

  // Knowledge card level confusion end handler — updates the current card content
  const handleKCConfusionEnd = useCallback(
    async (stepId: string, cardId: string, messages: ConfusionMessage[]) => {
      const step = steps.find((s) => s.id === stepId);
      await logger.addLogEntry("user_kc_confusion_end", {
        stepId,
        cardId,
        cardTitle:
          step?.knowledgeCards.find((k) => k.id === cardId)?.title || cardId,
        messageCount: messages.length,
        conversation: messages.map((m) => ({
          role: m.role,
          content:
            m.content.length > 500
              ? m.content.substring(0, 500) + "..."
              : m.content,
        })),
      });

      if (messages.length === 0) return;

      // Apply mastery "understanding complete" update
      const card = step?.knowledgeCards.find((k) => k.id === cardId);
      if (card) {
        const interaction: KnowledgeCardInteraction = {
          type: "understanding-complete",
        };
        const linkedMasteryNodes = card.linkedMasteryNodes || [];
        const linkedKnowledgeNodeIds = card.linkedKnowledgeNodeIds || [];
        const result = applyKnowledgeCardInteraction({
          linkedMasteryNodes,
          linkedKnowledgeNodeIds,
          interaction,
          nodeMasteryScores: codeAwareSessionState.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(codeAwareSessionState),
        });
        if (result.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(result.updatedScores));
          emitMasteryUpdateLogs({
            interaction,
            linkedMasteryNodes,
            linkedKnowledgeNodeIds,
            changedNodeIds: result.changedNodeIds,
            debug: result.debug,
            knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
          });
        }
      }

      // Summarize the Q&A and append to card content
      const qaSnippets = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n\n");

      if (qaSnippets.trim()) {
        dispatch(
          appendKnowledgeCardContent({
            stepId,
            cardId,
            additionalContent: `**补充说明**\n\n${qaSnippets}`,
          }),
        );
      }
    },
    [dispatch, steps, logger, codeAwareSessionState],
  );

  // Knowledge card level "待学" handler — negative mastery signal + append content + auto-pin
  const handleKCPendingLearn = useCallback(
    async (stepId: string, cardId: string, messages: ConfusionMessage[]) => {
      const step = steps.find((s) => s.id === stepId);
      const card = step?.knowledgeCards.find((k) => k.id === cardId);

      await logger.addLogEntry("user_kc_pending_learn", {
        stepId,
        cardId,
        cardTitle: card?.title || cardId,
        messageCount: messages.length,
        conversation: messages.map((m) => ({
          role: m.role,
          content:
            m.content.length > 500
              ? m.content.substring(0, 500) + "..."
              : m.content,
        })),
      });

      if (messages.length === 0) return;

      // Apply negative mastery signal (confusion-ask)
      if (card) {
        const interaction: KnowledgeCardInteraction = {
          type: "confusion",
          value: "ask",
        };
        const linkedMasteryNodes = card.linkedMasteryNodes || [];
        const linkedKnowledgeNodeIds = card.linkedKnowledgeNodeIds || [];
        const result = applyKnowledgeCardInteraction({
          linkedMasteryNodes,
          linkedKnowledgeNodeIds,
          interaction,
          nodeMasteryScores: codeAwareSessionState.nodeMasteryScores,
          cognitiveEdges: buildCodeAwareCognitiveEdges(codeAwareSessionState),
        });
        if (result.changedNodeIds.length > 0) {
          dispatch(setNodeMasteryScores(result.updatedScores));
          emitMasteryUpdateLogs({
            interaction,
            linkedMasteryNodes,
            linkedKnowledgeNodeIds,
            changedNodeIds: result.changedNodeIds,
            debug: result.debug,
            knowledgeNodeTitleById: latestKnowledgeNodeTitleByIdRef.current,
          });
        }
      }

      // Append Q&A content to the card
      const qaSnippets = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n\n");

      if (qaSnippets.trim()) {
        dispatch(
          appendKnowledgeCardContent({
            stepId,
            cardId,
            additionalContent: `**补充说明**\n\n${qaSnippets}`,
          }),
        );
      }

      // Auto-pin the card if not already pinned
      const alreadyPinned = pinnedItems.some(
        (p) => p.level === "knowledge-card" && p.targetId === cardId,
      );
      if (!alreadyPinned) {
        dispatch(
          addPinnedItem({
            id: `pin-pending-${cardId}`,
            level: "knowledge-card",
            targetId: cardId,
            title: card?.title || "待学知识点",
            stepId,
            pinnedAt: Date.now(),
          }),
        );
      }

      setActiveToast({
        key: Date.now(),
        message: "已加入待学列表",
        actions: [{ label: "知道了", onClick: () => {} }],
      });
    },
    [dispatch, steps, logger, codeAwareSessionState, pinnedItems],
  );

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
            selectedStepTitle:
              steps.find((s) => s.id === stepIdToUse)?.title || stepIdToUse,
            selectedCodeText: data.selectedCode
              ? data.selectedCode.substring(0, 300)
              : "",
          });
        } else {
          stepIdToUse = targetStepId;
          console.log("[CA:UI] Found most relevant step:", stepIdToUse);

          await logger.addLogEntry("user_check_code_step_mappings", {
            result: "direct_mapping_found",
            selectedStepId: stepIdToUse,
            selectedStepTitle:
              steps.find((s) => s.id === stepIdToUse)?.title || stepIdToUse,
            selectedCodeText: data.selectedCode
              ? data.selectedCode.substring(0, 300)
              : "",
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
        onGlobalConfusion={() => handleOpenGlobalOverlay("confusion")}
        onGlobalPins={() => handleOpenGlobalOverlay("pins")}
        showActionButtons={
          userRequirementStatus === "finalized" && steps.length > 0
        }
        pinCount={pinnedItems.length}
        rightContent={
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <HeaderActionButton
              onClick={() => dispatch(toggleMasteryIndicators())}
              title={showMasteryIndicators ? "隐藏掌握度" : "显示掌握度"}
              style={{ padding: "6px 8px", minWidth: "auto" }}
            >
              {showMasteryIndicators ? (
                <EyeIcon style={{ width: 16, height: 16 }} />
              ) : (
                <EyeSlashIcon style={{ width: 16, height: 16 }} />
              )}
            </HeaderActionButton>
            <HeaderActionButton
              onClick={handleExportKnowledgeState}
              disabled={isExportingKnowledgeState}
              title="导出/更新认知状态文件到 .knowledge_state/"
            >
              {isExportingKnowledgeState ? "导出中..." : "导出知识状态"}
            </HeaderActionButton>
            <HeaderActionButton
              onClick={handleExportPreset}
              disabled={isExportingPreset}
              title="导出当前状态为预设快照（用于用户测试）"
            >
              {isExportingPreset ? "导出中..." : "导出预设"}
            </HeaderActionButton>
          </div>
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

      {/* Navigation Buttons - 边缘跳转导航条（移至 CodeAwareDiv 底部作为绝对定位浮层） */}

      {/* Debug panel (UI hidden, logic preserved) */}

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
                  onHighlightEvent={handleHighlightEvent}
                  onClearHighlight={removeHighlightEvent}
                  onStepConfusion={handleStepConfusion}
                  onStepConfusionAsk={handleStepConfusionAsk}
                  onStepConfusionEnd={handleStepConfusionEnd}
                  onStepPendingLearn={handleStepPendingLearn}
                  stepConfusionCandidates={stepConfusionCandidates}
                  stepConfusionCandidatesLoading={
                    stepConfusionCandidatesLoading
                  }
                  onStepPin={handleStepPin}
                  isPinned={pinnedItems.some(
                    (p) => p.level === "step" && p.targetId === step.id,
                  )}
                  onStepStatusChange={handleStepStatusChange}
                  onStepExpansionChange={handleStepExpansionChange}
                  onKnowledgeCardExpansionChange={
                    handleKnowledgeCardExpansionChange
                  }
                  onKnowledgeCardViewModeChange={
                    handleKnowledgeCardViewModeChange
                  }
                  onKnowledgeCardFeedback={handleKnowledgeCardFeedback}
                  onKnowledgeCardFirstView={handleKnowledgeCardFirstView}
                  onDisableKnowledgeCard={handleDisableKnowledgeCard}
                  onQuestionSubmit={handleQuestionSubmit}
                  onRegisterRef={registerStepRef}
                  onStartTimedView={handleStartTimedView}
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

                        // Source and viewed state
                        source: kc.source,
                        viewedAt: kc.viewedAt,

                        // Loading states
                        isTestsLoading: (kc as any).isTestsLoading || false, // 获取测试题加载状态

                        // Mastery node refs for timed view tracking
                        linkedMasteryNodes: kc.linkedMasteryNodes,
                        linkedKnowledgeNodeIds: kc.linkedKnowledgeNodeIds,

                        // Unified action callbacks for knowledge card level
                        isPinned: pinnedItems.some(
                          (p) =>
                            p.level === "knowledge-card" &&
                            p.targetId ===
                              (kc.id || `${step.id}-card-${kcIndex}`),
                        ),
                        onConfusionAsk: (
                          cardId: string,
                          question: string,
                          conversationHistory: Array<{
                            role: "user" | "assistant";
                            content: string;
                          }>,
                        ) => {
                          return handleKCConfusionAsk(
                            step.id,
                            cardId,
                            question,
                            conversationHistory,
                          );
                        },
                        onConfusionEnd: (
                          cardId: string,
                          messages: ConfusionMessage[],
                        ) => {
                          void handleKCConfusionEnd(step.id, cardId, messages);
                        },
                        onPendingLearn: (
                          cardId: string,
                          messages: ConfusionMessage[],
                        ) => {
                          void handleKCPendingLearn(step.id, cardId, messages);
                        },
                        onPin: (cardId: string) => {
                          handleKnowledgeCardPin(step.id, cardId);
                        },

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

                              // SAQ correctness no longer triggers mastery update
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
                        onGenerateTests: handleGenerateKnowledgeCardTests,
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

      {/* Global Interaction Overlay (replaces old GlobalQuestionModal) */}
      <GlobalInteractionOverlay
        isOpen={isGlobalOverlayOpen}
        initialTab={globalOverlayTab}
        onClose={handleCloseGlobalOverlay}
        onConfusionAsk={handleGlobalConfusionAsk}
        onConfusionEnd={handleGlobalConfusionEnd}
        onPendingLearn={handleGlobalPendingLearn}
        confusionCandidates={globalConfusionCandidates}
        confusionCandidatesLoading={globalConfusionCandidatesLoading}
        pinnedItems={pinnedItems}
        onPinNavigate={handlePinNavigate}
        onPinRemove={handlePinRemove}
      />

      {/* ActionToast for pin reminders */}
      {activeToast && (
        <ActionToast
          key={activeToast.key}
          message={activeToast.message}
          actions={activeToast.actions}
          onDismiss={() => setActiveToast(null)}
        />
      )}

      {/* Edge Navigation Buttons - 贴在 webview 靠近编辑器的边缘，垂直居中 */}
      {userRequirementStatus === "finalized" && steps.length > 0 && (
        <NavigationButtons
          onJumpToSemantic={handleJumpToSemantic}
          onJumpToCode={handleJumpToCode}
          canJumpToCode={
            steps.some((s) => s.isHighlighted) ||
            highLevelSteps.some((h) => h.isHighlighted)
          }
          canJumpToSemantic={currentCodeSelection !== null}
          isLoading={isMappingLookupInProgress}
          sidebarPosition={sidebarPosition}
        />
      )}
    </CodeAwareDiv>
  );
};

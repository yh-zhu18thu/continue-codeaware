import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import type { MasteryNodeRef } from "core";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscForeground,
} from "../../../../components";
import { useAppSelector } from "../../../../redux/hooks";
import { selectKnowledgeCardMastery } from "../../../../redux/selectors/masterySelectors";
import { useCodeAwareLogger } from "../../../../util/codeAwareWebViewLogger";
import { masteryScoreToColor } from "../../../../utils/masteryColor";
import KnowledgeCardContent from "./KnowledgeCardContent";
import KnowledgeCardLoader from "./KnowledgeCardLoader";
import KnowledgeCardMCQ from "./KnowledgeCardMCQ";
import KnowledgeCardSAQ from "./KnowledgeCardSAQ";
import KnowledgeCardToolBar from "./KnowledgeCardToolBar";

const KnowledgeCardContainer = styled.div<{ isHovered?: boolean }>`
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 防止内容撑开 */
  display: flex;
  flex-direction: column;
  background-color: #000000; /* 设置背景为黑色 */
  border-radius: ${defaultBorderRadius};
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
  border: 1px solid ${lightGray}44;
  margin: 3px 0; /* Remove auto centering, keep vertical margin */
  overflow: hidden;
  transition: box-shadow 0.2s ease-in-out;
  box-sizing: border-box;
  box-shadow: ${({ isHovered }) => {
    if (isHovered)
      return "0 6px 12px rgba(0, 0, 0, 0.15), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
    return "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
  }};
`;

const ContentArea = styled.div<{ isVisible: boolean }>`
  padding: ${({ isVisible }) => (isVisible ? "2px" : "0")}; /* 减少内边距 */
  display: ${({ isVisible }) => (isVisible ? "block" : "none")};
  transition: all 0.15s ease-in-out;
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 防止内容撑开 */
  flex-grow: 1;
  overflow-y: auto;
  overflow-x: hidden;
  color: ${vscForeground};
  box-sizing: border-box;
`;

const InteractionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid ${lightGray}22;
  flex-wrap: wrap;
`;

const ViewModeGroup = styled.div`
  display: inline-flex;
  border: 1px solid ${lightGray}44;
  border-radius: 6px;
  overflow: hidden;
`;

const ViewModeButton = styled.button<{ active: boolean }>`
  border: none;
  background: ${({ active }) => (active ? "#202a1f" : "#121212")};
  color: ${({ active }) => (active ? "#7de58b" : vscForeground)};
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;

  &:not(:last-child) {
    border-right: 1px solid ${lightGray}33;
  }
`;

const FeedbackGroup = styled.div`
  display: inline-flex;
  gap: 6px;
`;

const FeedbackButton = styled.button<{
  active: boolean;
  tone: "good" | "warn";
}>`
  border: 1px solid
    ${({ active, tone }) => {
      if (tone === "good") {
        return active ? "#3fb950" : `${lightGray}44`;
      }
      return active ? "#d29922" : `${lightGray}44`;
    }};
  background: ${({ active, tone }) => {
    if (!active) {
      return "#121212";
    }
    return tone === "good" ? "#1d3b20" : "#3a2d10";
  }};
  color: ${vscForeground};
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
`;

const QuestionPanel = styled.div`
  margin: 8px;
  border: 1px solid ${lightGray}33;
  border-radius: 8px;
  background: #111111;
  padding: 12px;
`;

const QuestionTitle = styled.div`
  font-size: 11px;
  color: #c6c6c6;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const QuestionText = styled.div`
  font-size: 13px;
  line-height: 1.5;
  color: ${vscForeground};
`;

const QuestionHint = styled.div`
  margin-top: 10px;
  font-size: 11px;
  color: #9b9b9b;
`;

const TestContainer = styled.div`
  position: relative;
  margin-top: 16px;
  margin-bottom: 50px; /* 为导航按钮留出空间，避免重叠 */
  min-height: 100px;
  padding: 16px;
  background-color: #111111; /* 深灰色背景，比主容器稍亮 */
  border-radius: ${defaultBorderRadius};
  border: 1px solid ${lightGray}22;
`;

const TestNavigationContainer = styled.div`
  position: absolute;
  bottom: -45px; /* 调整到容器外部，避免重叠 */
  left: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: #1a1a1a; /* 深色背景 */
  border: 1px solid ${lightGray}33;
  border-radius: ${defaultBorderRadius};
  box-shadow: 0 2px 4px -1px rgb(0 0 0 / 0.1);
`;

const TestNavigationButton = styled.button<{ disabled: boolean }>`
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  color: ${vscForeground};
  border: none;
  border-radius: 4px;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  transition: all 0.15s ease-in-out;

  &:hover:enabled {
    background-color: ${lightGray}22;
  }
`;

const TestCounter = styled.span`
  color: ${vscForeground};
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
`;

export interface TestItem {
  id: string;
  questionType: "multipleChoice" | "shortAnswer";
  // SAQ specific props
  saqQuestion?: string;
  saqAnswer?: string;
  // MCQ specific props
  mcqQuestion?: string;
  mcqOptions?: string[];
  mcqCorrectAnswer?: string;
  // Loading and result state
  isLoading?: boolean;
  result?: {
    userAnswer: string;
    isCorrect: boolean;
    remarks: string;
  };
}

export interface KnowledgeCardProps {
  // Toolbar props
  title: string;
  onQuestionMarkClick?: () => void; // Renamed from onQuestionClick for clarity
  onChatClick?: () => void;
  onAddToCollectionClick?: () => void;

  // Content props
  markdownContent?: string; // 内容现在是可选的
  question?: string;
  viewMode?: "read" | "self-test" | "answer";
  feedback?: "understood" | "uncertain";

  // Multiple test items support
  testItems: TestItem[]; // Array of test items, ordered from newest to oldest

  // Callback functions for test interactions
  onSaqSubmit?: (testId: string, answer: string) => void;
  onMcqSubmit?: (
    testId: string,
    isCorrect: boolean,
    selectedOption: string,
  ) => void;
  onGenerateTests?: (
    stepId: string,
    cardId: string,
    title: string,
    content: string,
    theme: string,
    learningGoal: string,
    codeContext: string,
  ) => void; // 新增：生成测试题的回调

  // Toggle functionality props
  defaultTestMode?: boolean;
  defaultExpanded?: boolean;
  shouldCollapse?: boolean; // External signal to collapse the card

  // Deprecated highlight props kept only for compatibility. They are ignored.
  isHighlighted?: boolean;
  cardId?: string;
  onClearHighlight?: () => void;
  onExpansionChange?: (cardId: string, isExpanded: boolean) => void; // Callback for expansion state change
  onViewModeChange?: (
    cardId: string,
    viewMode: "read" | "self-test" | "answer",
  ) => void;
  onFeedback?: (cardId: string, feedback: "understood" | "uncertain") => void;

  // Lazy loading props
  stepId?: string;
  learningGoal?: string;
  codeContext?: string;
  onGenerateContent?: (
    stepId: string,
    cardId: string,
    theme: string,
    learningGoal: string,
    codeContext: string,
  ) => void;

  // Disable functionality
  disabled?: boolean;
  onDisable?: (stepId: string, cardId: string) => void;

  // Loading states
  isTestsLoading?: boolean; // 新增：测试题加载状态

  // Timed mastery tracking
  linkedMasteryNodes?: MasteryNodeRef[];
  linkedKnowledgeNodeIds?: string[];
  onStartTimedView?: (args: {
    type: "step" | "knowledge-card";
    masteryNodeRefs: MasteryNodeRef[];
    text: string;
  }) => void;
}

const KnowledgeCard: React.FC<KnowledgeCardProps> = ({
  title,
  markdownContent = "", // 为markdownContent提供默认空字符串
  question,
  viewMode,
  feedback,
  onChatClick,
  onAddToCollectionClick,
  testItems = [],
  onMcqSubmit,
  onSaqSubmit,
  onGenerateTests, // 新增：生成测试题的回调
  defaultTestMode = false,
  defaultExpanded = true,
  shouldCollapse = false, // External collapse signal
  cardId,
  onExpansionChange,
  onViewModeChange,
  onFeedback,
  stepId,
  learningGoal = "",
  codeContext = "",
  onGenerateContent,
  disabled = false,
  onDisable,
  isTestsLoading = false, // 新增：测试题加载状态
  linkedMasteryNodes,
  linkedKnowledgeNodeIds,
  onStartTimedView,
}) => {
  const logger = useCodeAwareLogger();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [currentViewMode, setCurrentViewMode] = useState<
    "read" | "self-test" | "answer"
  >(viewMode || (defaultTestMode ? "answer" : "read"));
  const [currentFeedback, setCurrentFeedback] = useState<
    "understood" | "uncertain" | undefined
  >(feedback);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isContentLoadingLocal, setIsContentLoadingLocal] = useState(false);
  const hasTriggeredInitialContentLoadRef = useRef(false);
  const hasStartedTimedViewRef = useRef(false);
  const isContentMissing = markdownContent.trim().length === 0;

  // Mastery: compute mastery from all linked nodes
  const allMasteryNodeRefs: MasteryNodeRef[] = [
    ...(linkedMasteryNodes ?? []),
    ...(linkedKnowledgeNodeIds ?? []).map((id) => ({
      nodeId: id,
      nodeType: "background-knowledge" as const,
    })),
  ];
  const showMasteryIndicators = useAppSelector(
    (state) => state.codeAwareSession.showMasteryIndicators,
  );
  const kcMastery = useAppSelector((state) =>
    allMasteryNodeRefs.length > 0
      ? selectKnowledgeCardMastery(state, allMasteryNodeRefs)
      : null,
  );
  const kcMasteryScore =
    showMasteryIndicators && kcMastery ? kcMastery.score : null;
  const kcMasteryColor =
    kcMasteryScore !== null ? masteryScoreToColor(kcMasteryScore) : undefined;

  const triggerLazyContentGeneration = useCallback(() => {
    if (
      hasTriggeredInitialContentLoadRef.current ||
      !isExpanded ||
      currentViewMode !== "read" ||
      !isContentMissing ||
      !onGenerateContent ||
      !stepId ||
      !cardId ||
      disabled
    ) {
      return;
    }

    hasTriggeredInitialContentLoadRef.current = true;
    setIsContentLoadingLocal(true);
    console.log("Triggering lazy loading for knowledge card:", cardId);
    onGenerateContent(stepId, cardId, title, learningGoal, codeContext);
  }, [
    cardId,
    codeContext,
    currentViewMode,
    disabled,
    isContentMissing,
    isExpanded,
    learningGoal,
    onGenerateContent,
    stepId,
    title,
  ]);

  useEffect(() => {
    hasTriggeredInitialContentLoadRef.current = false;
    hasStartedTimedViewRef.current = false;
    setIsContentLoadingLocal(false);
  }, [cardId]);

  useEffect(() => {
    // Keep loading animation visible before/while Redux loading state lands.
    if (markdownContent === "::LOADING::") {
      setIsContentLoadingLocal(true);
      return;
    }

    if (!isContentMissing) {
      setIsContentLoadingLocal(false);
    }
  }, [markdownContent, isContentMissing]);

  useEffect(() => {
    triggerLazyContentGeneration();
  }, [triggerLazyContentGeneration]);

  // Start timed view tracking when lazy-loaded content arrives
  useEffect(() => {
    if (
      !isExpanded ||
      hasStartedTimedViewRef.current ||
      !markdownContent ||
      markdownContent === "::LOADING::" ||
      markdownContent.trim().length === 0
    ) {
      return;
    }

    if (!onStartTimedView) {
      return;
    }

    const nodeRefs: MasteryNodeRef[] = [
      ...(linkedMasteryNodes ?? []),
      ...(linkedKnowledgeNodeIds ?? []).map((id) => ({
        nodeId: id,
        nodeType: "background-knowledge" as const,
      })),
    ];

    if (nodeRefs.length > 0) {
      hasStartedTimedViewRef.current = true;
      onStartTimedView({
        type: "knowledge-card",
        masteryNodeRefs: nodeRefs,
        text: markdownContent,
      });
    }
  }, [
    isExpanded,
    markdownContent,
    onStartTimedView,
    linkedMasteryNodes,
    linkedKnowledgeNodeIds,
  ]);

  useEffect(() => {
    if (viewMode && viewMode !== currentViewMode) {
      setCurrentViewMode(viewMode);
    }
  }, [viewMode, currentViewMode]);

  useEffect(() => {
    setCurrentFeedback(feedback);
  }, [feedback]);

  // 新增：保存每个测试题的用户输入状态（不持久存储，仅在内存中）
  const [testInputStates, setTestInputStates] = useState<{
    [testId: string]: {
      // SAQ 相关状态
      saqContent?: string;
      saqIsRetrying?: boolean;
      // MCQ 相关状态
      mcqSelectedOption?: string;
      mcqSubmitted?: boolean;
    };
  }>({});

  // 新增：更新SAQ输入内容的函数
  const updateSaqContent = (testId: string, content: string) => {
    setTestInputStates((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        saqContent: content,
      },
    }));
  };

  // 新增：更新SAQ重试状态的函数
  const updateSaqRetryState = (testId: string, isRetrying: boolean) => {
    setTestInputStates((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        saqIsRetrying: isRetrying,
      },
    }));
  };

  // 新增：更新MCQ选择状态的函数
  const updateMcqSelection = (testId: string, selectedOption: string) => {
    setTestInputStates((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        mcqSelectedOption: selectedOption,
      },
    }));
  };

  // 新增：更新MCQ提交状态的函数
  const updateMcqSubmitState = (testId: string, submitted: boolean) => {
    setTestInputStates((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        mcqSubmitted: submitted,
      },
    }));
  };

  // Handle mouse enter/leave for hover effects
  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Handle external collapse signal
  useEffect(() => {
    if (shouldCollapse && isExpanded) {
      setIsExpanded(false);
    }
  }, [shouldCollapse, isExpanded]);

  const handleToggle = async () => {
    const wasExpanded = isExpanded;

    setIsExpanded(!isExpanded);

    // Log knowledge card expansion/collapse events
    if (cardId) {
      if (!wasExpanded) {
        // Start timed view tracking for knowledge card mastery
        // (only for cards that already have content; lazy-loaded cards
        //  are handled by the useEffect that watches markdownContent)
        if (
          onStartTimedView &&
          markdownContent &&
          markdownContent !== "::LOADING::" &&
          markdownContent.trim().length > 0
        ) {
          const nodeRefs: MasteryNodeRef[] = [
            ...(linkedMasteryNodes ?? []),
            ...(linkedKnowledgeNodeIds ?? []).map((id) => ({
              nodeId: id,
              nodeType: "background-knowledge" as const,
            })),
          ];
          if (nodeRefs.length > 0) {
            hasStartedTimedViewRef.current = true;
            onStartTimedView({
              type: "knowledge-card",
              masteryNodeRefs: nodeRefs,
              text: markdownContent,
            });
          }
        }

        // Log knowledge card viewing start
        await logger.addLogEntry("user_view_and_highlight_knowledge_card", {
          cardTitle: title,
          cardContent: markdownContent
            ? markdownContent.length > 200
              ? markdownContent.substring(0, 200) + "..."
              : markdownContent
            : "",
          testItemsCount: testItems.length,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Log knowledge card viewing end
        await logger.addLogEntry("user_finished_viewing_knowledge_card", {
          cardTitle: title,
          cardContent: markdownContent
            ? markdownContent.length > 200
              ? markdownContent.substring(0, 200) + "..."
              : markdownContent
            : "",
          testItemsCount: testItems.length,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Notify parent component about expansion change
    if (onExpansionChange && cardId) {
      onExpansionChange(cardId, !wasExpanded);
    }

    // If card is being collapsed
    if (wasExpanded) {
    }

    if (!wasExpanded) {
      triggerLazyContentGeneration();
    }
  };

  const switchViewMode = async (nextMode: "read" | "self-test" | "answer") => {
    if (nextMode === currentViewMode) {
      return;
    }

    if (nextMode === "answer" && testItems.length === 0) {
      if (markdownContent && onGenerateTests && stepId && cardId) {
        onGenerateTests(
          stepId,
          cardId,
          title,
          markdownContent,
          title,
          learningGoal,
          codeContext,
        );
      }
    }

    setCurrentViewMode(nextMode);
    if (cardId && onViewModeChange) {
      onViewModeChange(cardId, nextMode);
    }

    await logger.addLogEntry("user_switch_knowledge_card_view_mode", {
      cardTitle: title,
      viewMode: nextMode,
      timestamp: new Date().toISOString(),
    });
  };

  const onQuestionMarkClick = async () => {
    await switchViewMode(currentViewMode === "answer" ? "read" : "answer");
  };

  const handleFeedback = async (value: "understood" | "uncertain") => {
    setCurrentFeedback(value);
    if (cardId && onFeedback) {
      onFeedback(cardId, value);
    }
    await logger.addLogEntry("user_knowledge_card_feedback", {
      cardTitle: title,
      feedback: value,
      timestamp: new Date().toISOString(),
    });
  };

  const handlePreviousTest = async () => {
    const newIndex = Math.max(currentTestIndex - 1, 0);
    if (newIndex !== currentTestIndex) {
      // Log test navigation
      await logger.addLogEntry("user_navigate_knowledge_card_test", {
        cardTitle: title,
        direction: "previous",
        fromTestIndex: currentTestIndex,
        toTestIndex: newIndex,
        fromTestPreview: testItems[currentTestIndex]
          ? {
              questionType: testItems[currentTestIndex].questionType,
              question:
                testItems[currentTestIndex].questionType === "multipleChoice"
                  ? testItems[currentTestIndex].mcqQuestion
                  : testItems[currentTestIndex].saqQuestion,
            }
          : null,
        toTestPreview: testItems[newIndex]
          ? {
              questionType: testItems[newIndex].questionType,
              question:
                testItems[newIndex].questionType === "multipleChoice"
                  ? testItems[newIndex].mcqQuestion
                  : testItems[newIndex].saqQuestion,
            }
          : null,
        timestamp: new Date().toISOString(),
      });
      setCurrentTestIndex(newIndex);
    }
  };

  const handleNextTest = async () => {
    const newIndex = Math.min(currentTestIndex + 1, testItems.length - 1);
    if (newIndex !== currentTestIndex) {
      // Log test navigation
      await logger.addLogEntry("user_navigate_knowledge_card_test", {
        cardTitle: title,
        direction: "next",
        fromTestIndex: currentTestIndex,
        toTestIndex: newIndex,
        fromTestPreview: testItems[currentTestIndex]
          ? {
              questionType: testItems[currentTestIndex].questionType,
              question:
                testItems[currentTestIndex].questionType === "multipleChoice"
                  ? testItems[currentTestIndex].mcqQuestion
                  : testItems[currentTestIndex].saqQuestion,
            }
          : null,
        toTestPreview: testItems[newIndex]
          ? {
              questionType: testItems[newIndex].questionType,
              question:
                testItems[newIndex].questionType === "multipleChoice"
                  ? testItems[newIndex].mcqQuestion
                  : testItems[newIndex].saqQuestion,
            }
          : null,
        timestamp: new Date().toISOString(),
      });
      setCurrentTestIndex(newIndex);
    }
  };
  const currentTest = testItems[currentTestIndex];

  // Check if user has answered any question correctly
  const hasCorrectAnswer = testItems.some(
    (test) => test.result?.isCorrect === true,
  );

  // Handle disable card
  const handleDisableCard = async () => {
    await logger.addLogEntry("user_disable_knowledge_card", {
      cardTitle: title,
      timestamp: new Date().toISOString(),
    });

    if (stepId && cardId && onDisable) {
      onDisable(stepId, cardId);
    }
  };

  return (
    <KnowledgeCardContainer
      isHovered={isHovered}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <KnowledgeCardToolBar
        title={title}
        isExpanded={isExpanded}
        onToggle={handleToggle}
        onQuestionClick={onQuestionMarkClick} // Pass to the actual prop name in KnowledgeCardToolBar
        onDisableClick={handleDisableCard} // Add disable functionality
        isQuestionDisabled={
          !markdownContent ||
          markdownContent === "::LOADING::" ||
          markdownContent.startsWith("加载失败:") ||
          markdownContent.startsWith("生成失败")
        } // 只有在有知识卡片内容时才能生成测试题
        isHighlighted={false}
        isFlickering={false}
        isTestMode={currentViewMode === "answer"} // 传递答题模式状态
        hasCorrectAnswer={hasCorrectAnswer} // 传递正确答案状态
        masteryScore={kcMasteryScore}
        masteryColor={kcMasteryColor}
      />
      <ContentArea isVisible={isExpanded}>
        <InteractionBar>
          <ViewModeGroup>
            <ViewModeButton
              active={currentViewMode === "read"}
              onClick={() => void switchViewMode("read")}
            >
              查阅
            </ViewModeButton>
            <ViewModeButton
              active={currentViewMode === "self-test"}
              onClick={() => void switchViewMode("self-test")}
            >
              自测
            </ViewModeButton>
            <ViewModeButton
              active={currentViewMode === "answer"}
              onClick={() => void switchViewMode("answer")}
            >
              答题
            </ViewModeButton>
          </ViewModeGroup>

          <FeedbackGroup>
            <FeedbackButton
              active={currentFeedback === "understood"}
              tone="good"
              onClick={() => void handleFeedback("understood")}
            >
              懂了
            </FeedbackButton>
            <FeedbackButton
              active={currentFeedback === "uncertain"}
              tone="warn"
              onClick={() => void handleFeedback("uncertain")}
            >
              存疑
            </FeedbackButton>
          </FeedbackGroup>
        </InteractionBar>

        {currentViewMode === "read" &&
          (markdownContent === "::LOADING::" ||
            (isContentLoadingLocal && isContentMissing)) && (
            <KnowledgeCardLoader text="Generating knowledge card contents" />
          )}

        {currentViewMode === "read" &&
          markdownContent &&
          markdownContent !== "::LOADING::" &&
          !markdownContent.startsWith("加载失败:") &&
          !markdownContent.startsWith("生成失败") && (
            <KnowledgeCardContent
              markdownContent={markdownContent}
              isHighlighted={false}
              isFlickering={false}
            />
          )}

        {currentViewMode === "read" &&
          markdownContent &&
          (markdownContent.startsWith("加载失败:") ||
            markdownContent.startsWith("生成失败")) && (
            <div
              style={{
                padding: "12px",
                color: "#ff6b6b",
                fontSize: "14px",
                textAlign: "center",
                backgroundColor: "#ff6b6b11",
                borderRadius: "6px",
                margin: "8px",
                border: "1px solid #ff6b6b33",
              }}
            >
              <div style={{ marginBottom: "8px", fontWeight: "500" }}>
                {markdownContent}
              </div>
              <button
                style={{
                  backgroundColor: "#4ade80",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 12px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "500",
                }}
                onClick={() => {
                  if (onGenerateContent && stepId && cardId) {
                    setIsContentLoadingLocal(true);
                    onGenerateContent(
                      stepId,
                      cardId,
                      title,
                      learningGoal,
                      codeContext,
                    );
                  }
                }}
              >
                重新生成
              </button>
            </div>
          )}

        {currentViewMode === "read" &&
          isContentMissing &&
          markdownContent !== "::LOADING::" &&
          !isContentLoadingLocal && (
            <div
              style={{
                padding: "12px",
                color: "#888",
                fontSize: "14px",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              此知识卡片暂无详细内容
            </div>
          )}

        {currentViewMode === "self-test" && (
          <QuestionPanel>
            <QuestionTitle>Self-check Prompt</QuestionTitle>
            <QuestionText>
              {question || "暂无问题，可切换到答题视图生成并完成自测。"}
            </QuestionText>
            <QuestionHint>先尝试口头作答，再进入答题视图验证。</QuestionHint>
          </QuestionPanel>
        )}

        {currentViewMode === "answer" &&
          testItems.length === 0 &&
          isTestsLoading && (
            <KnowledgeCardLoader text="Generating self-test questions" />
          )}

        {currentViewMode === "answer" &&
          testItems.length === 0 &&
          !isTestsLoading && (
            <div
              style={{
                padding: "12px",
                color: "#888",
                fontSize: "14px",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              暂无测试题
            </div>
          )}

        {currentViewMode === "answer" &&
          testItems.length > 0 &&
          currentTest && (
            <TestContainer>
              {/* Test navigation controls */}
              {testItems.length > 1 && (
                <TestNavigationContainer>
                  <TestNavigationButton
                    onClick={handlePreviousTest}
                    disabled={
                      currentTestIndex <= 0
                    } /* 修正：在第一题时禁用向前按钮 */
                    title="上一题"
                  >
                    <ChevronLeftIcon width={14} height={14} />
                  </TestNavigationButton>
                  <TestCounter>
                    {currentTestIndex + 1}/{testItems.length}
                  </TestCounter>
                  <TestNavigationButton
                    onClick={handleNextTest}
                    disabled={
                      currentTestIndex >= testItems.length - 1
                    } /* 修正：在最后一题时禁用向后按钮 */
                    title="下一题"
                  >
                    <ChevronRightIcon width={14} height={14} />
                  </TestNavigationButton>
                </TestNavigationContainer>
              )}

              {/* Render current test */}
              {currentTest.questionType === "multipleChoice" &&
                onMcqSubmit &&
                currentTest.mcqQuestion &&
                currentTest.mcqOptions &&
                currentTest.mcqCorrectAnswer && (
                  <KnowledgeCardMCQ
                    question={currentTest.mcqQuestion}
                    options={currentTest.mcqOptions}
                    correctAnswer={currentTest.mcqCorrectAnswer}
                    onSubmit={(isCorrect, selectedOption) =>
                      onMcqSubmit(currentTest.id, isCorrect, selectedOption)
                    }
                    // 传递保存的状态
                    initialSelectedOption={
                      testInputStates[currentTest.id]?.mcqSelectedOption
                    }
                    initialSubmitted={
                      testInputStates[currentTest.id]?.mcqSubmitted || false
                    }
                    // 传递状态更新回调
                    onSelectionChange={(selectedOption) =>
                      updateMcqSelection(currentTest.id, selectedOption)
                    }
                    onSubmitStateChange={(submitted) =>
                      updateMcqSubmitState(currentTest.id, submitted)
                    }
                  />
                )}

              {currentTest.questionType === "shortAnswer" &&
                onSaqSubmit &&
                currentTest.saqQuestion && (
                  <KnowledgeCardSAQ
                    question={currentTest.saqQuestion}
                    onSubmitAnswer={(answer) =>
                      onSaqSubmit(currentTest.id, answer)
                    }
                    isLoading={currentTest.isLoading}
                    result={currentTest.result}
                    // 传递保存的状态
                    initialContent={testInputStates[currentTest.id]?.saqContent}
                    initialIsRetrying={
                      testInputStates[currentTest.id]?.saqIsRetrying || false
                    }
                    // 传递状态更新回调
                    onContentChange={(content) =>
                      updateSaqContent(currentTest.id, content)
                    }
                    onRetryStateChange={(isRetrying) =>
                      updateSaqRetryState(currentTest.id, isRetrying)
                    }
                  />
                )}
            </TestContainer>
          )}
      </ContentArea>
    </KnowledgeCardContainer>
  );
};

export default KnowledgeCard;

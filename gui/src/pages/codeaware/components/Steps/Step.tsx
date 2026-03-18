import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import {
  HighlightEvent,
  KnowledgeCardGenerationStatus,
  MasteryNodeRef,
  StepStatus,
} from "core";
import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  vscBackground,
  vscForeground,
  vscInputBorder,
} from "../../../../components";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks";
import { selectStepMastery } from "../../../../redux/selectors/masterySelectors";
import {
  clearElementHighlight,
  setHighlightedElement,
} from "../../../../redux/slices/codeAwareSlice";
import { useCodeAwareLogger } from "../../../../util/codeAwareWebViewLogger";
import { masteryScoreToColor } from "../../../../utils/masteryColor";
import KnowledgeCard, {
  KnowledgeCardProps,
} from "../KnowledgeCard/KnowledgeCard";
import KnowledgeCardLoader from "../KnowledgeCard/KnowledgeCardLoader";
import ConfusionPanel, {
  ConfusionCandidate,
  ConfusionMessage,
} from "../shared/ConfusionPanel";
import StepAbstract from "./StepAbstract";
import StepEditor from "./StepEditor";
import StepTitleBar from "./StepTitleBar";

const StepContainer = styled.div<{
  isHovered: boolean;
  stepStatus?: StepStatus;
}>`
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 防止内容撑开 */
  display: flex;
  flex-direction: column;
  background-color: ${vscBackground};
  margin: 12px 0px; /* 减少垂直间距 */
  transition:
    box-shadow 0.2s ease-in-out,
    opacity 0.2s ease-in-out;
  box-shadow: ${({ isHovered }) =>
    isHovered
      ? "0 6px 16px rgba(0, 0, 0, 0.12)"
      : "0 2px 4px rgba(0, 0, 0, 0.1)"};
  border-radius: 4px;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  // Different opacity for different states
  opacity: ${({ stepStatus }) => {
    if (stepStatus === "generating") return 0.8; // Dimmed when generating
    if (stepStatus === "generated") return 0.9; // Slightly dimmed when generated but not confirmed
    return 1; // Full opacity for confirmed and dirty states
  }};
`;

const ContentArea = styled.div<{ isVisible: boolean }>`
  padding: ${({ isVisible }) => (isVisible ? "2px" : "0")}; /* 减少内边距 */
  padding-top: 0;
  display: ${({ isVisible }) => (isVisible ? "block" : "none")};
  transition: all 0.15s ease-in-out;
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 防止内容撑开 */
  overflow: hidden;
  box-sizing: border-box;
`;

const KnowledgeCardsContainer = styled.div<{ isHovered: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* Left align the knowledge cards */
  gap: 4px; /* 减少卡片间隙 */
  margin-top: 4px; /* 减少顶部间距 */
  margin-left: 20px; /* 向右缩进 */
  width: calc(100% - 20px); /* 减去左边距以防止溢出 */
  max-width: calc(100% - 20px);
  min-width: 0; /* 防止内容撑开 */
  overflow: hidden;
  box-sizing: border-box;
`;

const KnowledgeCardLoaderContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const ConfusionButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 8px;
  padding: 4px 0;
`;

const ConfusionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: transparent;
  color: var(--vscode-descriptionForeground);
  border: 1px dashed ${vscInputBorder};
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover {
    color: ${vscForeground};
    border-color: var(--vscode-focusBorder, #007acc);
    background-color: rgba(0, 122, 204, 0.06);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

interface StepProps {
  title: string;
  content: string;
  knowledgeCards: KnowledgeCardProps[];
  highLevelStepIndex?: number | null; // 高级步骤序号，从1开始
  isActive?: boolean;
  defaultExpanded?: boolean;
  forceExpanded?: boolean; // Force expand the step (overrides defaultExpanded)
  shouldCollapse?: boolean; // External signal to collapse the step
  isHighlighted?: boolean;
  stepId?: string;
  stepStatus?: StepStatus; // Use StepStatus type from core
  knowledgeCardGenerationStatus?: KnowledgeCardGenerationStatus; // Add knowledge card generation status
  onHighlightEvent?: (event: HighlightEvent) => void;
  onClearHighlight?: () => void;
  onStepConfusion?: (stepId: string) => void; // Confusion button handler (opens panel & generates candidates)
  onStepConfusionAsk?: (stepId: string, question: string) => Promise<string>; // Ask question in confusion panel
  onStepConfusionEnd?: (stepId: string, messages: ConfusionMessage[]) => void; // End confusion Q&A
  stepConfusionCandidates?: ConfusionCandidate[]; // Mastery-based candidates
  stepConfusionCandidatesLoading?: boolean; // Whether candidates are loading
  onStepSelfTest?: (stepId: string) => void; // Self-test handler
  onStepPin?: (stepId: string) => void; // Pin handler
  isPinned?: boolean; // Whether this step is pinned
  onStepEdit?: (stepId: string, newContent: string) => void; // Callback for step edit
  onStepStatusChange?: (stepId: string, newStatus: StepStatus) => void; // Callback for status change
  onDisableKnowledgeCard?: (stepId: string, cardId: string) => void; // Callback for disabling knowledge card
  onQuestionSubmit?: (
    stepId: string,
    selectedText: string,
    question: string,
  ) => void; // Callback for question submission
  onRegisterRef?: (stepId: string, element: HTMLDivElement | null) => void; // Callback for registering step ref
  onStepExpansionChange?: (stepId: string, isExpanded: boolean) => void; // Callback for step expansion state change
  onKnowledgeCardExpansionChange?: (
    stepId: string,
    cardId: string,
    isExpanded: boolean,
  ) => void;
  onKnowledgeCardViewModeChange?: (
    stepId: string,
    cardId: string,
    viewMode: "read" | "self-test" | "answer",
  ) => void;
  onKnowledgeCardFeedback?: (
    stepId: string,
    cardId: string,
    feedback: "understood" | "uncertain",
  ) => void;
  onStartTimedView?: (args: {
    type: "step" | "knowledge-card";
    masteryNodeRefs: MasteryNodeRef[];
    text: string;
  }) => void;
  disabled?: boolean; // Optional disabled state for code edit mode
}

const Step: React.FC<StepProps> = ({
  title,
  content: description,
  knowledgeCards,
  highLevelStepIndex = null,
  isActive = false,
  defaultExpanded = false, // Changed to false for collapsed by default
  forceExpanded = false, // Force expand parameter
  shouldCollapse = false, // External collapse signal
  isHighlighted = false,
  stepId,
  stepStatus = "confirmed", // Default to confirmed for backward compatibility
  knowledgeCardGenerationStatus = "empty", // Default to empty for backward compatibility
  onHighlightEvent,
  onClearHighlight,
  onStepConfusion,
  onStepConfusionAsk,
  onStepConfusionEnd,
  stepConfusionCandidates = [],
  stepConfusionCandidatesLoading = false,
  onStepSelfTest,
  onStepPin,
  isPinned = false,
  onStepEdit,
  onStepStatusChange,
  onDisableKnowledgeCard,
  onQuestionSubmit,
  onRegisterRef,
  onStepExpansionChange,
  onKnowledgeCardExpansionChange,
  onKnowledgeCardViewModeChange,
  onKnowledgeCardFeedback,
  onStartTimedView,
  disabled = false,
}) => {
  const logger = useCodeAwareLogger();
  const dispatch = useAppDispatch();

  // Get the full step from Redux to access highlightType
  const fullStep = useAppSelector((state) =>
    state.codeAwareSession.steps.find((s) => s.id === stepId),
  );
  const highlightType = fullStep?.highlightType;

  // Mastery：计算该 step 关联 situation 节点的加权平均掌握度
  const showMasteryIndicators = useAppSelector(
    (state) => state.codeAwareSession.showMasteryIndicators,
  );
  const stepMastery = useAppSelector((state) =>
    stepId ? selectStepMastery(state, stepId) : null,
  );
  const masteryScore =
    showMasteryIndicators && stepMastery ? stepMastery.score : null;
  const masteryColor =
    masteryScore !== null ? masteryScoreToColor(masteryScore) : undefined;

  const [isExpanded, setIsExpanded] = useState(
    forceExpanded || defaultExpanded,
  );
  const [isFlickering, setIsFlickering] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isStepConfusionOpen, setIsStepConfusionOpen] = useState(false);
  const [shouldKeepHighlighted, setShouldKeepHighlighted] = useState(false);
  const [isUserExpanding, setIsUserExpanding] = useState(false); // Track if user is actively expanding this step
  const [shouldCollapseCards, setShouldCollapseCards] = useState(false); // Signal to collapse all knowledge cards
  const [currentlyExpandedCardId, setCurrentlyExpandedCardId] = useState<
    string | null
  >(null); // Track currently expanded knowledge card
  const flickerTimeoutRef = useRef<(NodeJS.Timeout | null)[]>([]);

  // Check if step is in editing mode based on stepStatus
  const isEditing = stepStatus === "editing";

  // Handle mouse enter/leave for hover effects only
  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Handle forceExpanded changes - only expand when forceExpanded becomes true
  useEffect(() => {
    if (forceExpanded && !isExpanded) {
      setIsExpanded(true);
    }
    // Note: We don't force collapse when forceExpanded becomes false
    // This allows users to manually control the step after force expansion ends
  }, [forceExpanded, isExpanded]);

  // Handle external collapse signal
  useEffect(() => {
    // Don't collapse if user is actively expanding this step
    if (shouldCollapse && isExpanded && !isUserExpanding) {
      setIsExpanded(false);

      // Trigger knowledge cards collapse when step is externally collapsed
      setShouldCollapseCards(true);
      setTimeout(() => setShouldCollapseCards(false), 100); // Reset after brief delay

      // Don't notify parent component about external collapse to avoid infinite loops
      // The parent already knows about this state change since it initiated it

      // Clear local highlights when externally collapsed
      // Don't call onClearHighlight() as it clears ALL highlights globally
      setIsFlickering(false);
      setShouldKeepHighlighted(false);
      // Clear all existing timeouts
      flickerTimeoutRef.current.forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
      flickerTimeoutRef.current = [];

      // Note: We don't call onClearHighlight() here because it would clear
      // highlights for the newly expanded step as well
    }
  }, [shouldCollapse, isExpanded, isUserExpanding]);

  // Handle flickering effect when isHighlighted becomes true
  useEffect(() => {
    // Clear any existing timeouts to prevent race conditions
    flickerTimeoutRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout);
    });
    flickerTimeoutRef.current = [];

    if (isHighlighted) {
      // Start flickering when highlighted, regardless of expanded state
      // The title bar should always flicker to indicate highlighting
      setIsFlickering(true);

      // For 'primary' highlights, keep highlighted after flickering
      // For 'related' highlights, clear after flickering
      const shouldKeepAfterFlicker = highlightType === "primary";
      setShouldKeepHighlighted(shouldKeepAfterFlicker);

      // Create a flickering effect with multiple flashes (3 cycles, 600ms each = 1800ms total)
      let timeoutIndex = 0;
      for (let i = 0; i < 3; i++) {
        // Turn off flickering
        const timeoutOff = setTimeout(
          () => {
            setIsFlickering(false);
          },
          300 + i * 600,
        );
        flickerTimeoutRef.current[timeoutIndex++] = timeoutOff;

        // Turn on flickering
        const timeoutOn = setTimeout(
          () => {
            setIsFlickering(true);
          },
          600 + i * 600,
        );
        flickerTimeoutRef.current[timeoutIndex++] = timeoutOn;
      }

      // Final timeout to turn off flickering (at 1800ms)
      const finalTimeout = setTimeout(() => {
        setIsFlickering(false);

        // If this is a 'related' highlight, clear it after flickering
        if (highlightType === "related" && stepId) {
          dispatch(clearElementHighlight({ type: "step", id: stepId }));
          console.log(
            `[CA:UI] Auto-cleared related highlight for step ${stepId}`,
          );
        }
        // For 'primary' highlights, keep shouldKeepHighlighted as true
      }, 1800);
      flickerTimeoutRef.current[timeoutIndex] = finalTimeout;
    } else {
      // When isHighlighted becomes false, clear both flickering and persistent highlight
      setIsFlickering(false);
      setShouldKeepHighlighted(false);
    }

    // Cleanup function to clear timeouts when component unmounts or effect re-runs
    return () => {
      flickerTimeoutRef.current.forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
      flickerTimeoutRef.current = [];
    };
  }, [isHighlighted, stepId, highlightType, dispatch]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Only cleanup flicker timeouts
    };
  }, []);

  const handleToggle = async () => {
    const wasExpanded = isExpanded;
    const willBeExpanded = !isExpanded;

    setIsExpanded(willBeExpanded);

    // 阶段2修改：点击标题时高亮，而不是展开时
    if (stepId) {
      // 设置高亮状态（不触发代码高亮）
      dispatch(setHighlightedElement({ type: "step", id: stepId }));
    }

    // Log step expansion/collapse events
    if (stepId) {
      if (willBeExpanded && !wasExpanded) {
        // Start timed view tracking for step mastery
        if (onStartTimedView && description) {
          onStartTimedView({
            type: "step",
            masteryNodeRefs: [{ nodeId: stepId, nodeType: "step" }],
            text: description,
          });
        }

        // Log step viewing start
        await logger.addLogEntry("user_view_and_highlight_step", {
          stepTitle: title,
          stepContent: description
            ? description.length > 200
              ? description.substring(0, 200) + "..."
              : description
            : "",
          highLevelStepIndex,
          stepStatus,
          knowledgeCardsCount: knowledgeCards.filter((card) => !card.disabled)
            .length,
          timestamp: new Date().toISOString(),
        });
      } else if (wasExpanded && !willBeExpanded) {
        // Log step viewing end
        await logger.addLogEntry("user_finished_viewing_step", {
          stepTitle: title,
          stepContent: description
            ? description.length > 200
              ? description.substring(0, 200) + "..."
              : description
            : "",
          highLevelStepIndex,
          stepStatus,
          knowledgeCardsCount: knowledgeCards.filter((card) => !card.disabled)
            .length,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Set protection flag when user is expanding
    if (willBeExpanded && !wasExpanded) {
      setIsUserExpanding(true);
      // Clear the protection flag after a short delay
      setTimeout(() => {
        setIsUserExpanding(false);
      }, 50); // Longer than the notification delay to ensure protection
    }

    // If step is being collapsed, clear all highlights and immediately stop flickering
    if (wasExpanded) {
      // Trigger knowledge cards collapse when step is manually collapsed
      setShouldCollapseCards(true);
      setTimeout(() => setShouldCollapseCards(false), 100); // Reset after brief delay

      // Immediately stop any flickering animation
      setIsFlickering(false);
      setShouldKeepHighlighted(false); // Clear persistent highlight when collapsing
      // Clear all existing timeouts
      flickerTimeoutRef.current.forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
      flickerTimeoutRef.current = [];

      // Only clear global highlights when manually collapsing (user action)
      // This allows auto-collapse to work without interfering with new step highlights
      if (onClearHighlight) {
        onClearHighlight();
      }
    }

    // 阶段2修改：移除展开时的高亮触发
    // 保留以前的注释以便理解
    // Trigger highlight event only when expanding from collapsed state
    // if (onHighlightEvent && stepId && willBeExpanded && !wasExpanded) {
    // onHighlightEvent({
    // sourceType: "step",
    // identifier: stepId,
    // });
    // }

    // Notify parent component about expansion state change with a small delay
    // This ensures the highlight event is processed before other steps are collapsed
    if (stepId && onStepExpansionChange) {
      if (willBeExpanded) {
        // For expansion, add a tiny delay to ensure highlight processing
        setTimeout(() => {
          onStepExpansionChange(stepId, willBeExpanded);
        }, 10);
      } else {
        // For collapse, notify immediately
        onStepExpansionChange(stepId, willBeExpanded);
      }
    }

    // Knowledge card generation is routed by cognitive intent in parent (CodeAware.tsx).
    // Keep Step focused on local expand/collapse UI behavior.
  };

  const handleExecuteUntilStep = () => {
    // Preserved as no-op; execute-until-step removed from UI
  };

  const handleRerunStep = () => {
    // Preserved as no-op; rerun removed from UI
  };

  const handleConfusionClick = async () => {
    if (stepId) {
      setIsStepConfusionOpen(true);
      // trigger candidate generation in parent
      if (onStepConfusion) {
        onStepConfusion(stepId);
      }
    }
  };

  const handleSelfTestClick = () => {
    if (stepId && onStepSelfTest) {
      onStepSelfTest(stepId);
    }
  };

  const handlePinClick = () => {
    if (stepId && onStepPin) {
      onStepPin(stepId);
    }
  };

  const handleEditStep = async () => {
    if (disabled) {
      console.warn("[CA:UI] Step editing is disabled in code edit mode");
      return;
    }

    // Log step editing start
    await logger.addLogEntry("user_start_edit_step_requirement", {
      stepTitle: title || "",
      originalContent: description
        ? description.substring(0, 200) +
          (description.length > 200 ? "..." : "")
        : "",
      timestamp: new Date().toISOString(),
    });

    // Trigger edit mode by changing status to "editing"
    if (stepId && onStepStatusChange) {
      onStepStatusChange(stepId, "editing");
    }
  };

  const handleConfirmEdit = async (newContent: string) => {
    if (disabled) {
      console.warn("[CA:UI] Step editing is disabled in code edit mode");
      return;
    }

    // Log step editing submission
    await logger.addLogEntry("user_submit_step_requirement", {
      stepTitle: title || "",
      originalContent: description
        ? description.substring(0, 200) +
          (description.length > 200 ? "..." : "")
        : "",
      newContent: newContent
        ? newContent.substring(0, 200) + (newContent.length > 200 ? "..." : "")
        : "",
      timestamp: new Date().toISOString(),
    });

    if (stepId && onStepEdit) {
      onStepEdit(stepId, newContent);
    }

    // Note: We don't call onStepStatusChange here anymore because setStepAbstract
    // in the Redux slice will intelligently determine the correct status based on content changes
  };

  const handleKnowledgeCardExpansionChange = async (
    cardId: string,
    isExpanded: boolean,
  ) => {
    console.log(
      `[CA:UI] Knowledge Card ${cardId} expansion changed to: ${isExpanded}`,
    );

    if (isExpanded) {
      // When a knowledge card is expanded, set it as the currently expanded card
      setCurrentlyExpandedCardId(cardId);
    } else {
      // When a knowledge card is collapsed, clear the currently expanded card if it's this one
      setCurrentlyExpandedCardId((prev) => (prev === cardId ? null : prev));
    }

    if (stepId && onKnowledgeCardExpansionChange) {
      onKnowledgeCardExpansionChange(stepId, cardId, isExpanded);
    }
  };

  return (
    <StepContainer
      ref={(element) => {
        if (stepId && onRegisterRef) {
          onRegisterRef(stepId, element);
        }
      }}
      isHovered={isHovered}
      stepStatus={stepStatus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <StepTitleBar
        title={title}
        highLevelStepIndex={highLevelStepIndex}
        isActive={isActive}
        isExpanded={isExpanded}
        isHighlighted={isHighlighted || shouldKeepHighlighted}
        isFlickering={isFlickering}
        stepStatus={stepStatus}
        isViewed={
          knowledgeCardGenerationStatus === "generating" ||
          knowledgeCardGenerationStatus === "checked"
        }
        masteryScore={masteryScore}
        masteryColor={masteryColor}
        isPinned={isPinned}
        onToggle={handleToggle}
        onSelfTest={handleSelfTestClick}
        onPin={handlePinClick}
        disabled={disabled}
      />
      <ContentArea isVisible={isExpanded}>
        {isEditing ? (
          <StepEditor
            markdownContent={description}
            isVisible={isExpanded}
            onConfirm={handleConfirmEdit}
          />
        ) : (
          <StepAbstract
            markdownContent={description}
            isVisible={isExpanded}
            onEdit={
              stepStatus === "confirmed" ||
              stepStatus === "generated" ||
              stepStatus === "step_dirty"
                ? handleEditStep
                : undefined
            }
            onQuestionSubmit={(selectedText, question) => {
              if (stepId) {
                onQuestionSubmit?.(stepId, selectedText, question);
              }
            }}
          />
        )}
        {knowledgeCards.filter((card) => !card.disabled).length > 0 && (
          <KnowledgeCardsContainer isHovered={isHovered}>
            {knowledgeCards
              .filter((cardProps) => !cardProps.disabled)
              .map((cardProps, index) => {
                const cardId = cardProps.cardId || `card-${index}`;
                const shouldCollapseThisCard =
                  shouldCollapseCards ||
                  (currentlyExpandedCardId !== null &&
                    currentlyExpandedCardId !== cardId);

                return (
                  <KnowledgeCard
                    key={cardId}
                    {...cardProps}
                    cardId={cardId}
                    shouldCollapse={shouldCollapseThisCard} // Pass collapse signal with auto-collapse logic
                    onDisable={onDisableKnowledgeCard}
                    onExpansionChange={handleKnowledgeCardExpansionChange} // Pass expansion change handler
                    onStartTimedView={onStartTimedView}
                    onViewModeChange={(cardId, viewMode) => {
                      if (stepId && onKnowledgeCardViewModeChange) {
                        onKnowledgeCardViewModeChange(stepId, cardId, viewMode);
                      }
                    }}
                    onFeedback={(cardId, feedback) => {
                      if (stepId && onKnowledgeCardFeedback) {
                        onKnowledgeCardFeedback(stepId, cardId, feedback);
                      }
                    }}
                  />
                );
              })}
          </KnowledgeCardsContainer>
        )}
        {/* Show loading animation when generating knowledge card themes */}
        {knowledgeCardGenerationStatus === "generating" && (
          <KnowledgeCardLoaderContainer>
            <KnowledgeCardLoader text="Generating knowledge card themes" />
          </KnowledgeCardLoaderContainer>
        )}

        {/* Confusion Panel - replaces old ConfusionButton */}
        {knowledgeCardGenerationStatus !== "generating" && isExpanded && (
          <ConfusionButtonContainer>
            {isStepConfusionOpen ? (
              <ConfusionPanel
                isOpen={isStepConfusionOpen}
                candidates={stepConfusionCandidates}
                candidatesLoading={stepConfusionCandidatesLoading}
                onAsk={async (q) => {
                  if (stepId && onStepConfusionAsk) {
                    return onStepConfusionAsk(stepId, q);
                  }
                  return "暂不可用";
                }}
                onEnd={(msgs) => {
                  if (stepId && onStepConfusionEnd) {
                    onStepConfusionEnd(stepId, msgs);
                  }
                  setIsStepConfusionOpen(false);
                }}
                onClose={() => setIsStepConfusionOpen(false)}
              />
            ) : (
              <ConfusionButton onClick={handleConfusionClick}>
                <QuestionMarkCircleIcon />
                我有疑惑
              </ConfusionButton>
            )}
          </ConfusionButtonContainer>
        )}
      </ContentArea>
    </StepContainer>
  );
};

export default Step;

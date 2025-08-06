import { PlusIcon } from '@heroicons/react/24/outline';
import { HighlightEvent, KnowledgeCardGenerationStatus, StepStatus } from "core";
import React, { useEffect, useRef, useState } from 'react';
import styled from "styled-components";
import { vscBackground, vscForeground, vscInputBorder } from "../../../../components";
import KnowledgeCard, { KnowledgeCardProps } from '../KnowledgeCard/KnowledgeCard';
import KnowledgeCardLoader from '../KnowledgeCard/KnowledgeCardLoader';
import QuestionPopup from '../QuestionPopup/QuestionPopup';
import StepDescription from './StepDescription';
import StepEditor from './StepEditor';
import StepTitleBar from './StepTitleBar';

const StepContainer = styled.div<{ isHovered: boolean; stepStatus?: StepStatus }>`
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 防止内容撑开 */
  display: flex;
  flex-direction: column;
  background-color: ${vscBackground};
  margin: 12px 0px; /* 减少垂直间距 */
  transition: box-shadow 0.2s ease-in-out, opacity 0.2s ease-in-out;
  box-shadow: ${({ isHovered }) => isHovered ? '0 6px 16px rgba(0, 0, 0, 0.12)' : '0 2px 4px rgba(0, 0, 0, 0.1)'};
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
  padding: ${({ isVisible }) => isVisible ? '2px' : '0'}; /* 减少内边距 */
  padding-top: 0;
  display: ${({ isVisible }) => isVisible ? 'block' : 'none'};
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

const AddQuestionButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 8px;
  padding: 0px 0;
  position: relative;
  z-index: 100;
`;

const AddQuestionButton = styled.button`
  background-color: transparent;
  color: ${vscForeground};
  border: 1px solid ${vscInputBorder};
  border-radius: 50%;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: #007acc;
  }
  
  &:active {
    background-color: rgba(255, 255, 255, 0.2);
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
  onExecuteUntilStep?: (stepId: string) => void;
  onRerunStep?: (stepId: string) => void; // Callback for rerun step
  onStepEdit?: (stepId: string, newContent: string) => void; // Callback for step edit
  onStepStatusChange?: (stepId: string, newStatus: StepStatus) => void; // Callback for status change
  onGenerateKnowledgeCardThemes?: (stepId: string, stepTitle: string, stepAbstract: string, learningGoal: string) => void; // Callback for generating knowledge card themes
  onDisableKnowledgeCard?: (stepId: string, cardId: string) => void; // Callback for disabling knowledge card
  onQuestionSubmit?: (stepId: string, selectedText: string, question: string) => void; // Callback for question submission
  onRegisterRef?: (stepId: string, element: HTMLDivElement | null) => void; // Callback for registering step ref
  onStepExpansionChange?: (stepId: string, isExpanded: boolean) => void; // Callback for step expansion state change
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
  onExecuteUntilStep,
  onRerunStep,
  onStepEdit,
  onStepStatusChange,
  onGenerateKnowledgeCardThemes,
  onDisableKnowledgeCard,
  onQuestionSubmit,
  onRegisterRef,
  onStepExpansionChange,
  disabled = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(forceExpanded || defaultExpanded);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [shouldKeepHighlighted, setShouldKeepHighlighted] = useState(false);
  const [showQuestionPopup, setShowQuestionPopup] = useState(false);
  const [isUserExpanding, setIsUserExpanding] = useState(false); // Track if user is actively expanding this step
  const [shouldCollapseCards, setShouldCollapseCards] = useState(false); // Signal to collapse all knowledge cards
  const [currentlyExpandedCardId, setCurrentlyExpandedCardId] = useState<string | null>(null); // Track currently expanded knowledge card
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
      setShouldKeepHighlighted(true); // Mark that we should keep highlighted after flickering
      
      // Create a flickering effect with multiple flashes
      let timeoutIndex = 0;
      for (let i = 0; i < 3; i++) {
        // Turn off flickering
        const timeoutOff = setTimeout(() => {
          setIsFlickering(false);
        }, 200 + (i * 400));
        flickerTimeoutRef.current[timeoutIndex++] = timeoutOff;
        
        // Turn on flickering
        const timeoutOn = setTimeout(() => {
          setIsFlickering(true);
        }, 400 + (i * 400));
        flickerTimeoutRef.current[timeoutIndex++] = timeoutOn;
      }
      
      // Final timeout to turn off flickering but keep highlighted
      const finalTimeout = setTimeout(() => {
        setIsFlickering(false);
        // Keep shouldKeepHighlighted as true to maintain the highlight
      }, 200 + (3 * 400));
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
  }, [isHighlighted, stepId]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Only cleanup flicker timeouts
    };
  }, []);

  const handleToggle = () => {
    const wasExpanded = isExpanded;
    const willBeExpanded = !isExpanded;
    setIsExpanded(willBeExpanded);
    
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
    
    // Trigger highlight event only when expanding from collapsed state
    if (onHighlightEvent && stepId && willBeExpanded && !wasExpanded) {
      onHighlightEvent({
        sourceType: "step",
        identifier: stepId,
      });
    }

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

    // Trigger knowledge card theme generation when expanding for the first time 
    // and knowledge card generation status is "empty"
    // BUT NOT when the expansion is forced (e.g., from code selection question)
    if (willBeExpanded && !wasExpanded && 
        knowledgeCardGenerationStatus === "empty" && 
        knowledgeCards.length === 0 &&
        !forceExpanded && // Don't auto-generate when force expanded
        stepId && onGenerateKnowledgeCardThemes) {
      // Use setTimeout to ensure UI update happens first
      setTimeout(() => {
        onGenerateKnowledgeCardThemes(stepId, title, description, ""); // learningGoal will be passed from parent
      }, 100);
    }
  };

  const handleExecuteUntilStep = () => {
    if (disabled) {
      console.warn("⚠️ Execute until step is disabled in code edit mode");
      return;
    }
    if (stepId && onExecuteUntilStep) {
      onExecuteUntilStep(stepId);
    }
  };

  const handleRerunStep = () => {
    if (disabled) {
      console.warn("⚠️ Rerun step is disabled in code edit mode");
      return;
    }
    if (stepId && onRerunStep) {
      onRerunStep(stepId);
    }
  };

  const handleEditStep = () => {
    if (disabled) {
      console.warn("⚠️ Step editing is disabled in code edit mode");
      return;
    }
    // Trigger edit mode by changing status to "editing"
    if (stepId && onStepStatusChange) {
      onStepStatusChange(stepId, "editing");
    }
  };

  const handleConfirmEdit = (newContent: string) => {
    if (disabled) {
      console.warn("⚠️ Step editing is disabled in code edit mode");
      return;
    }
    if (stepId && onStepEdit) {
      onStepEdit(stepId, newContent);
    }
    
    // Note: We don't call onStepStatusChange here anymore because setStepAbstract
    // in the Redux slice will intelligently determine the correct status based on content changes
  };

  const handleAddQuestionClick = () => {
    setShowQuestionPopup(true);
  };

  const handleQuestionSubmit = (question: string) => {
    if (stepId && onQuestionSubmit) {
      onQuestionSubmit(stepId, '', question); // Empty string for selectedText
    }
    setShowQuestionPopup(false);
  };

  const handleQuestionCancel = () => {
    setShowQuestionPopup(false);
  };

  const handleKnowledgeCardExpansionChange = (cardId: string, isExpanded: boolean) => {
    console.log(`Knowledge Card ${cardId} expansion changed to: ${isExpanded}`);
    
    if (isExpanded) {
      // When a knowledge card is expanded, set it as the currently expanded card
      setCurrentlyExpandedCardId(cardId);
    } else {
      // When a knowledge card is collapsed, clear the currently expanded card if it's this one
      setCurrentlyExpandedCardId(prev => prev === cardId ? null : prev);
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
        onToggle={handleToggle}
        onExecuteUntilStep={handleExecuteUntilStep}
        onRerunStep={handleRerunStep}
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
          <StepDescription 
            markdownContent={description} 
            isVisible={isExpanded}
            onEdit={stepStatus === "confirmed" || stepStatus === "generated" || stepStatus === "step_dirty" ? handleEditStep : undefined}
            onQuestionSubmit={(selectedText, question) => {
              if (stepId) {
                onQuestionSubmit?.(stepId, selectedText, question);
              }
            }}
          />
        )}
        {knowledgeCards.filter(card => !card.disabled).length > 0 && (
          <KnowledgeCardsContainer isHovered={isHovered}>
            {knowledgeCards
              .filter(cardProps => !cardProps.disabled)
              .map((cardProps, index) => {
                const cardId = cardProps.cardId || `card-${index}`;
                const shouldCollapseThisCard = shouldCollapseCards || (currentlyExpandedCardId !== null && currentlyExpandedCardId !== cardId);
                
                return (
                  <KnowledgeCard 
                    key={cardId} 
                    {...cardProps} 
                    cardId={cardId}
                    shouldCollapse={shouldCollapseThisCard} // Pass collapse signal with auto-collapse logic
                    onHighlightEvent={onHighlightEvent}
                    onClearHighlight={onClearHighlight}
                    onDisable={onDisableKnowledgeCard}
                    onExpansionChange={handleKnowledgeCardExpansionChange} // Pass expansion change handler
                  />
                );
              })}
          </KnowledgeCardsContainer>
        )}
        {/* Show loading animation when generating knowledge card themes */}
        {knowledgeCardGenerationStatus === "generating" && (
          <KnowledgeCardLoaderContainer>
            <KnowledgeCardLoader text="正在生成知识卡片主题..." />
          </KnowledgeCardLoaderContainer>
        )}
        
        {/* Add Question Button - only show when not editing and knowledgeCardGenerationStatus is "checked" */}
        {knowledgeCardGenerationStatus === "checked" && (
          <AddQuestionButtonContainer>
            <AddQuestionButton onClick={handleAddQuestionClick}>
              <PlusIcon width={16} height={16} />
            </AddQuestionButton>
          </AddQuestionButtonContainer>
        )}
      </ContentArea>
      
      {/* Question Popup */}
      {showQuestionPopup && (
        <QuestionPopup
          onSubmit={handleQuestionSubmit}
          onCancel={handleQuestionCancel}
        />
      )}
    </StepContainer>
  );
};

export default Step;

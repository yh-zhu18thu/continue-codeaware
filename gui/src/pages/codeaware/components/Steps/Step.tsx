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

const StepContainer = styled.div<{ isHovered: boolean }>`
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 防止内容撑开 */
  display: flex;
  flex-direction: column;
  background-color: ${vscBackground};
  margin: 12px 0px; /* 减少垂直间距 */
  transition: box-shadow 0.2s ease-in-out;
  box-shadow: ${({ isHovered }) => isHovered ? '0 6px 16px rgba(0, 0, 0, 0.12)' : '0 2px 4px rgba(0, 0, 0, 0.1)'};
  border-radius: 4px;
  overflow: hidden;
  box-sizing: border-box;
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
  align-items: center; /* Center the knowledge cards horizontally */
  gap: 4px; /* 减少卡片间隙 */
  margin-top: 4px; /* 减少顶部间距 */
  width: 100%;
  max-width: 100%;
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
  padding: 8px 0;
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
  isActive?: boolean;
  defaultExpanded?: boolean;
  isHighlighted?: boolean;
  stepId?: string;
  stepStatus?: StepStatus; // Use StepStatus type from core
  knowledgeCardGenerationStatus?: KnowledgeCardGenerationStatus; // Add knowledge card generation status
  onHighlightEvent?: (event: HighlightEvent) => void;
  onClearHighlight?: () => void;
  onExecuteUntilStep?: (stepId: string) => void;
  onStepEdit?: (stepId: string, newContent: string) => void; // Callback for step edit
  onStepStatusChange?: (stepId: string, newStatus: StepStatus) => void; // Callback for status change
  onGenerateKnowledgeCardThemes?: (stepId: string, stepTitle: string, stepAbstract: string, learningGoal: string) => void; // Callback for generating knowledge card themes
  onDisableKnowledgeCard?: (stepId: string, cardId: string) => void; // Callback for disabling knowledge card
  onQuestionSubmit?: (stepId: string, selectedText: string, question: string) => void; // Callback for question submission
}

const Step: React.FC<StepProps> = ({
  title,
  content: description,
  knowledgeCards,
  isActive = false,
  defaultExpanded = false, // Changed to false for collapsed by default
  isHighlighted = false,
  stepId,
  stepStatus = "confirmed", // Default to confirmed for backward compatibility
  knowledgeCardGenerationStatus = "empty", // Default to empty for backward compatibility
  onHighlightEvent,
  onClearHighlight,
  onExecuteUntilStep,
  onStepEdit,
  onStepStatusChange,
  onGenerateKnowledgeCardThemes,
  onDisableKnowledgeCard,
  onQuestionSubmit,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [shouldKeepHighlighted, setShouldKeepHighlighted] = useState(false);
  const [showQuestionPopup, setShowQuestionPopup] = useState(false);
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
    
    // If step is being collapsed, clear all highlights and immediately stop flickering
    if (wasExpanded) {
      // Immediately stop any flickering animation
      setIsFlickering(false);
      setShouldKeepHighlighted(false); // Clear persistent highlight when collapsing
      // Clear all existing timeouts
      flickerTimeoutRef.current.forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
      flickerTimeoutRef.current = [];
      
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

    // Trigger knowledge card theme generation when expanding for the first time 
    // and knowledge card generation status is "empty"
    if (willBeExpanded && !wasExpanded && 
        knowledgeCardGenerationStatus === "empty" && 
        knowledgeCards.length === 0 &&
        stepId && onGenerateKnowledgeCardThemes) {
      // Use setTimeout to ensure UI update happens first
      setTimeout(() => {
        onGenerateKnowledgeCardThemes(stepId, title, description, ""); // learningGoal will be passed from parent
      }, 100);
    }
  };

  const handleExecuteUntilStep = () => {
    if (stepId && onExecuteUntilStep) {
      onExecuteUntilStep(stepId);
    }
  };

  const handleEditStep = () => {
    // Trigger edit mode by changing status to "editing"
    if (stepId && onStepStatusChange) {
      onStepStatusChange(stepId, "editing");
    }
  };

  const handleConfirmEdit = (newContent: string) => {
    if (stepId && onStepEdit) {
      onStepEdit(stepId, newContent);
    }
    // Change status back to "confirmed" after editing
    if (stepId && onStepStatusChange) {
      onStepStatusChange(stepId, "confirmed");
    }
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

  return (
    <StepContainer 
      isHovered={isHovered}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <StepTitleBar 
        title={title} 
        isActive={isActive} 
        isExpanded={isExpanded}
        isHighlighted={isHighlighted || shouldKeepHighlighted}
        isFlickering={isFlickering}
        onToggle={handleToggle}
        onExecuteUntilStep={handleExecuteUntilStep}
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
            onEdit={stepStatus === "confirmed" ? handleEditStep : undefined}
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
              .map((cardProps, index) => (
                <KnowledgeCard 
                  key={cardProps.cardId || `card-${index}`} 
                  {...cardProps} 
                  cardId={cardProps.cardId || `card-${index}`}
                  onHighlightEvent={onHighlightEvent}
                  onClearHighlight={onClearHighlight}
                  onDisable={onDisableKnowledgeCard}
                />
              ))}
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

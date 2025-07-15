import { HighlightEvent } from "core";
import React, { useEffect, useRef, useState } from 'react';
import styled from "styled-components";
import { vscBackground } from "../../../../components";
import KnowledgeCard, { KnowledgeCardProps } from '../KnowledgeCard/KnowledgeCard';
import StepDescription from './StepDescription';
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

interface StepProps {
  title: string;
  content: string;
  knowledgeCards: KnowledgeCardProps[];
  isActive?: boolean;
  defaultExpanded?: boolean;
  isHighlighted?: boolean;
  stepId?: string;
  onHighlightEvent?: (event: HighlightEvent) => void;
  onClearHighlight?: () => void;
  onExecuteUntilStep?: (stepId: string) => void;
  onWrenchStep?: (stepId: string) => void;
}

const Step: React.FC<StepProps> = ({
  title,
  content: description,
  knowledgeCards,
  isActive = false,
  defaultExpanded = false, // Changed to false for collapsed by default
  isHighlighted = false,
  stepId,
  onHighlightEvent,
  onClearHighlight,
  onExecuteUntilStep,
  onWrenchStep,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [shouldKeepHighlighted, setShouldKeepHighlighted] = useState(false);
  const flickerTimeoutRef = useRef<(NodeJS.Timeout | null)[]>([]);

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
  };

  const handleExecuteUntilStep = () => {
    if (stepId && onExecuteUntilStep) {
      onExecuteUntilStep(stepId);
    }
  };

  const handleWrenchStep = () => {
    if (stepId && onWrenchStep) {
      onWrenchStep(stepId);
    }
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
        onWrenchStep={handleWrenchStep}
      />
      <ContentArea isVisible={isExpanded}>
        <StepDescription 
          markdownContent={description} 
          isVisible={isExpanded}
        />
        {knowledgeCards.length > 0 && (
          <KnowledgeCardsContainer isHovered={isHovered}>
            {knowledgeCards.map((cardProps, index) => (
              <KnowledgeCard 
                key={index} 
                {...cardProps} 
                cardId={cardProps.cardId || `card-${index}`}
                onHighlightEvent={onHighlightEvent}
                onClearHighlight={onClearHighlight}
              />
            ))}
          </KnowledgeCardsContainer>
        )}
      </ContentArea>
    </StepContainer>
  );
};

export default Step;

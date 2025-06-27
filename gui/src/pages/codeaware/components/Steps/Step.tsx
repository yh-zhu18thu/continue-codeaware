import { HighlightEvent } from "core";
import React, { useEffect, useRef, useState } from 'react';
import styled from "styled-components";
import { vscBackground } from "../../../../components";
import KnowledgeCard, { KnowledgeCardProps } from '../KnowledgeCard/KnowledgeCard';
import StepDescription from './StepDescription';
import StepTitleBar from './StepTitleBar';

const StepContainer = styled.div<{ isHovered: boolean }>`
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: ${vscBackground};
  margin: 8px 0;
  transition: all 0.2s ease-in-out;
  transform: ${({ isHovered }) => isHovered ? 'scale(1.02)' : 'scale(1)'};
  box-shadow: ${({ isHovered }) => isHovered ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 2px 4px rgba(0, 0, 0, 0.1)'};
  border-radius: 4px;
`;

const ContentArea = styled.div<{ isVisible: boolean }>`
  padding: ${({ isVisible }) => isVisible ? '4px' : '0'};
  padding-top: 0;
  display: ${({ isVisible }) => isVisible ? 'block' : 'none'};
  transition: all 0.15s ease-in-out;
`;

const KnowledgeCardsContainer = styled.div<{ isHovered: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center; /* Center the knowledge cards horizontally */
  gap: 8px;
  margin-top: 8px;
  transition: all 0.2s ease-in-out;
  transform: ${({ isHovered }) => isHovered ? 'scale(1.01)' : 'scale(1)'};
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
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const flickerTimeoutRef = useRef<(NodeJS.Timeout | null)[]>([]);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle mouse enter/leave for hover effects and highlighting
  const handleMouseEnter = () => {
    setIsHovered(true);
    
    // Clear any existing exit timeout
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
    
    // Only start hover timer if step is expanded
    if (isExpanded && onHighlightEvent && stepId) {
      hoverTimeoutRef.current = setTimeout(() => {
        onHighlightEvent({
          sourceType: "step",
          identifier: stepId,
        });
      }, 3000); // 3 seconds
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    
    // Clear hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    // Start exit timer to clear highlights after 3 seconds
    if (onClearHighlight) {
      exitTimeoutRef.current = setTimeout(() => {
        onClearHighlight();
      }, 3000);
    }
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
      
      // Final timeout to turn off flickering and keep highlighted
      const finalTimeout = setTimeout(() => {
        setIsFlickering(false);
      }, 200 + (3 * 400));
      flickerTimeoutRef.current[timeoutIndex] = finalTimeout;
    } else {
      // Immediately turn off flickering when not highlighted
      setIsFlickering(false);
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
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

  const handleToggle = () => {
    const wasExpanded = isExpanded;
    const willBeExpanded = !isExpanded;
    setIsExpanded(willBeExpanded);
    
    // Clear all timeouts when toggling
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
    
    // If step is being collapsed, clear all highlights and immediately stop flickering
    if (wasExpanded) {
      // Immediately stop any flickering animation
      setIsFlickering(false);
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
        isHighlighted={isHighlighted}
        isFlickering={isFlickering}
        onToggle={handleToggle}
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

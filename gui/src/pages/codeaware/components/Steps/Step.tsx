import { HighlightEvent } from "core";
import React, { useEffect, useRef, useState } from 'react';
import styled from "styled-components";
import { vscBackground } from "../../../../components";
import KnowledgeCard, { KnowledgeCardProps } from '../KnowledgeCard/KnowledgeCard';
import StepDescription from './StepDescription';
import StepTitleBar from './StepTitleBar';

const StepContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: ${vscBackground};
  margin: 8px 0;
`;

const ContentArea = styled.div<{ isVisible: boolean }>`
  padding: ${({ isVisible }) => isVisible ? '4px' : '0'};
  padding-top: 0;
  display: ${({ isVisible }) => isVisible ? 'block' : 'none'};
  transition: all 0.15s ease-in-out;
`;

const KnowledgeCardsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center; /* Center the knowledge cards horizontally */
  gap: 8px;
  margin-top: 8px;
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
  defaultExpanded = true,
  isHighlighted = false,
  stepId,
  onHighlightEvent,
  onClearHighlight,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFlickering, setIsFlickering] = useState(false);
  const flickerTimeoutRef = useRef<(NodeJS.Timeout | null)[]>([]);

  // Handle flickering effect when isHighlighted becomes true
  useEffect(() => {
    console.log(`Step ${stepId}: isHighlighted changed to ${isHighlighted}`);
    
    // Clear any existing timeouts to prevent race conditions
    flickerTimeoutRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout);
    });
    flickerTimeoutRef.current = [];

    if (isHighlighted) {
      // Start with flickering state
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

  const handleToggle = () => {
    const wasExpanded = isExpanded;
    setIsExpanded(!isExpanded);
    
    // If step is being collapsed, clear all highlights
    if (wasExpanded && onClearHighlight) {
      onClearHighlight();
    }
    
    // Trigger highlight event when expanding/collapsing
    if (onHighlightEvent && stepId && isExpanded) {
      onHighlightEvent({
        sourceType: "step",
        identifier: stepId,
      });
    }
  };

  return (
    <StepContainer>
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
          <KnowledgeCardsContainer>
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

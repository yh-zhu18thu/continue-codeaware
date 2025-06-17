import { HighlightEvent } from "core";
import React, { useEffect, useState } from 'react';
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
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFlickering, setIsFlickering] = useState(false);

  // Handle flickering effect when isHighlighted becomes true
  useEffect(() => {
    if (isHighlighted) {
      setIsFlickering(true);
      // Create a flickering effect with multiple flashes
      const flickerSequence = async () => {
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          setIsFlickering(false);
          await new Promise(resolve => setTimeout(resolve, 200));
          setIsFlickering(true);
        }
        // Keep highlighted after flickering
        setIsFlickering(false);
      };
      flickerSequence();
    } else {
      setIsFlickering(false);
    }
  }, [isHighlighted]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
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
              />
            ))}
          </KnowledgeCardsContainer>
        )}
      </ContentArea>
    </StepContainer>
  );
};

export default Step;

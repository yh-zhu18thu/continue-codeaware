import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { HighlightEvent } from "core";
import React, { useEffect, useRef, useState } from 'react';
import styled from "styled-components";
import {
    defaultBorderRadius,
    lightGray,
    vscForeground,
    vscInputBackground
} from "../../../../components";
import KnowledgeCardContent from './KnowledgeCardContent';
import KnowledgeCardMCQ from './KnowledgeCardMCQ';
import KnowledgeCardSAQ from './KnowledgeCardSAQ';
import KnowledgeCardToolBar from './KnowledgeCardToolBar';

const KnowledgeCardContainer = styled.div<{ isHighlighted?: boolean; isFlickering?: boolean; isHovered?: boolean }>`
  width: 95%;
  display: flex;
  flex-direction: column;
  background-color: ${vscInputBackground};
  border-radius: ${defaultBorderRadius};
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  border: 1px solid ${({ isHighlighted, isFlickering }) => 
    isFlickering ? '#ff6b6b' : 
    isHighlighted ? '#4ade80' : 
    `${lightGray}44`};
  margin: 6px auto; /* Center the card horizontally */
  overflow: hidden;
  transition: all 0.2s ease-in-out;
  transform: ${({ isHovered }) => isHovered ? 'scale(1.03)' : 'scale(1)'};
  box-shadow: ${({ isHighlighted, isFlickering, isHovered }) => {
    if (isFlickering) return '0 0 12px rgba(255, 107, 107, 0.8), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    if (isHighlighted) return '0 0 8px rgba(74, 222, 128, 0.4), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    if (isHovered) return '0 8px 16px rgba(0, 0, 0, 0.2), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    return '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
  }};
`;

const ContentArea = styled.div<{ isVisible: boolean }>`
  padding: ${({ isVisible }) => isVisible ? '4px' : '0'};
  display: ${({ isVisible }) => isVisible ? 'block' : 'none'};
  transition: all 0.15s ease-in-out;
  width: 95%;
  flex-grow: 1;
  overflow-y: auto;
  color: ${vscForeground};
`;

const TestContainer = styled.div`
  position: relative;
  margin-top: 16px;
  min-height: 100px;
`;

const TestNavigationContainer = styled.div`
  position: absolute;
  bottom: 0px;
  left: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: ${vscInputBackground};
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
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  opacity: ${({ disabled }) => disabled ? 0.5 : 1};
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
  questionType: 'multipleChoice' | 'shortAnswer';
  // SAQ specific props
  saqQuestion?: string;
  saqAnswer?: string;
  // MCQ specific props  
  mcqQuestion?: string;
  mcqOptions?: string[];
  mcqCorrectAnswer?: string;
}

export interface KnowledgeCardProps {
  // Toolbar props
  title: string;
  onQuestionMarkClick?: () => void; // Renamed from onQuestionClick for clarity
  onChatClick?: () => void;
  onAddToCollectionClick?: () => void;

  // Content props
  markdownContent: string;

  // Multiple test items support
  testItems: TestItem[]; // Array of test items, ordered from newest to oldest

  // Callback functions for test interactions
  onSaqSubmit?: (testId: string, answer: string) => void;
  onMcqSubmit?: (testId: string, isCorrect: boolean, selectedOption: string) => void;

  // Toggle functionality props
  defaultTestMode?: boolean; 
  defaultExpanded?: boolean;

  // Highlight props
  isHighlighted?: boolean;
  cardId?: string;
  onHighlightEvent?: (event: HighlightEvent) => void;
  onClearHighlight?: () => void;
}

const KnowledgeCard: React.FC<KnowledgeCardProps> = ({
  title,
  markdownContent,
  onChatClick,
  onAddToCollectionClick,
  testItems = [],
  onMcqSubmit,
  onSaqSubmit,
  defaultTestMode = false,
  defaultExpanded = true,
  isHighlighted = false,
  cardId,
  onHighlightEvent,
  onClearHighlight,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isTestMode, setIsTestMode] = useState(defaultTestMode);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const flickerTimeoutRef = useRef<(NodeJS.Timeout | null)[]>([]);

  // Handle mouse enter/leave for hover effects
  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Handle flickering effect when isHighlighted becomes true
  useEffect(() => {
    console.log(`KnowledgeCard ${cardId}: isHighlighted changed to ${isHighlighted}`);
    
    // Clear any existing timeouts to prevent race conditions
    flickerTimeoutRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout);
    });
    flickerTimeoutRef.current = [];

    if (isHighlighted) {
      // Start flickering when highlighted, regardless of expanded state
      // The card should always flicker to indicate highlighting
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
  }, [isHighlighted, cardId]);

  const handleToggle = () => {
    const wasExpanded = isExpanded;
    setIsExpanded(!isExpanded);
    
    // If card is being collapsed, clear all highlights and immediately stop flickering
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
    
    // Trigger highlight event when expanding/collapsing
    if (onHighlightEvent && cardId) {
      onHighlightEvent({
        sourceType: "knowledgeCard",
        identifier: cardId,
      });
    }
  };

  const onQuestionMarkClick = () => {
    const wasInTestMode = isTestMode;
    setIsTestMode(!isTestMode);
    
    // If exiting test mode, clear all highlights
    if (wasInTestMode && onClearHighlight) {
      onClearHighlight();
    }
    
    //print all the test items in the console
    console.log('Test Items:', testItems);
  }

  const handlePreviousTest = () => {
    setCurrentTestIndex(Math.min(currentTestIndex + 1, testItems.length - 1));
  };

  const handleNextTest = () => {
    setCurrentTestIndex(Math.max(currentTestIndex - 1, 0));
  };

  const currentTest = testItems[currentTestIndex];

  return (
    <KnowledgeCardContainer 
      isHighlighted={isHighlighted} 
      isFlickering={isFlickering}
      isHovered={isHovered}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <KnowledgeCardToolBar
        title={title}
        isExpanded={isExpanded}
        onToggle={handleToggle}
        onQuestionClick={onQuestionMarkClick} // Pass to the actual prop name in KnowledgeCardToolBar
        onChatClick={onChatClick}
        onAddToCollectionClick={onAddToCollectionClick}
        isHighlighted={isHighlighted}
        isFlickering={isFlickering}
      />
      <ContentArea isVisible={isExpanded}>

        {!isTestMode && (
          <KnowledgeCardContent 
            markdownContent={markdownContent} 
            isHighlighted={isHighlighted}
            isFlickering={isFlickering && isExpanded}
          />
        )}
        
        {isTestMode && testItems.length > 0 && currentTest && (
          <TestContainer>
            {/* Test navigation controls */}
            {testItems.length > 1 && (
              <TestNavigationContainer>
                <TestNavigationButton 
                  onClick={handlePreviousTest} 
                  disabled={currentTestIndex >= testItems.length - 1}
                  title="更早的测试"
                >
                  <ChevronLeftIcon width={14} height={14} />
                </TestNavigationButton>
                <TestCounter>
                  {currentTestIndex + 1}/{testItems.length}
                </TestCounter>
                <TestNavigationButton 
                  onClick={handleNextTest} 
                  disabled={currentTestIndex <= 0}
                  title="更新的测试"
                >
                  <ChevronRightIcon width={14} height={14} />
                </TestNavigationButton>
              </TestNavigationContainer>
            )}

            {/* Render current test */}
            {currentTest.questionType === 'multipleChoice' && onMcqSubmit && 
             currentTest.mcqQuestion && currentTest.mcqOptions && currentTest.mcqCorrectAnswer && (
              <KnowledgeCardMCQ
                question={currentTest.mcqQuestion}
                options={currentTest.mcqOptions}
                correctAnswer={currentTest.mcqCorrectAnswer}
                onSubmit={(isCorrect, selectedOption) => onMcqSubmit(currentTest.id, isCorrect, selectedOption)}
              />
            )}

            {currentTest.questionType === 'shortAnswer' && onSaqSubmit && 
             currentTest.saqQuestion && (
              <KnowledgeCardSAQ
                question={currentTest.saqQuestion}
                onSubmitAnswer={(answer) => onSaqSubmit(currentTest.id, answer)}
              />
            )}
          </TestContainer>
        )}
      </ContentArea>
    </KnowledgeCardContainer>
  );
};

export default KnowledgeCard;

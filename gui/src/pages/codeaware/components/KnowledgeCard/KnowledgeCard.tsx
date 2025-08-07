import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { HighlightEvent } from "core";
import React, { useEffect, useRef, useState } from 'react';
import styled from "styled-components";
import {
    defaultBorderRadius,
    lightGray,
    vscForeground
} from "../../../../components";
import { useCodeAwareLogger } from '../../../../util/codeAwareWebViewLogger';
import KnowledgeCardContent from './KnowledgeCardContent';
import KnowledgeCardLoader from './KnowledgeCardLoader';
import KnowledgeCardMCQ from './KnowledgeCardMCQ';
import KnowledgeCardSAQ from './KnowledgeCardSAQ';
import KnowledgeCardToolBar from './KnowledgeCardToolBar';

const KnowledgeCardContainer = styled.div<{ isHighlighted?: boolean; isFlickering?: boolean; isHovered?: boolean }>`
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 防止内容撑开 */
  display: flex;
  flex-direction: column;
  background-color: #000000; /* 设置背景为黑色 */
  border-radius: ${defaultBorderRadius};
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  border: 1px solid ${({ isHighlighted, isFlickering }) => 
    isFlickering ? '#ff6b6b' : 
    isHighlighted ? '#4ade80' : 
    `${lightGray}44`};
  margin: 3px 0; /* Remove auto centering, keep vertical margin */
  overflow: hidden;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  box-sizing: border-box;
  box-shadow: ${({ isHighlighted, isFlickering, isHovered }) => {
    if (isFlickering) return '0 0 12px rgba(255, 107, 107, 0.8), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    if (isHighlighted) return '0 0 8px rgba(74, 222, 128, 0.4), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    if (isHovered) return '0 6px 12px rgba(0, 0, 0, 0.15), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    return '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
  }};
`;

const ContentArea = styled.div<{ isVisible: boolean }>`
  padding: ${({ isVisible }) => isVisible ? '2px' : '0'}; /* 减少内边距 */
  display: ${({ isVisible }) => isVisible ? 'block' : 'none'};
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

  // Multiple test items support
  testItems: TestItem[]; // Array of test items, ordered from newest to oldest

  // Callback functions for test interactions
  onSaqSubmit?: (testId: string, answer: string) => void;
  onMcqSubmit?: (testId: string, isCorrect: boolean, selectedOption: string) => void;

  // Toggle functionality props
  defaultTestMode?: boolean; 
  defaultExpanded?: boolean;
  shouldCollapse?: boolean; // External signal to collapse the card

  // Highlight props
  isHighlighted?: boolean;
  cardId?: string;
  onHighlightEvent?: (event: HighlightEvent) => void;
  onClearHighlight?: () => void;
  onExpansionChange?: (cardId: string, isExpanded: boolean) => void; // Callback for expansion state change

  // Lazy loading props
  stepId?: string;
  learningGoal?: string;
  codeContext?: string;
  onGenerateContent?: (stepId: string, cardId: string, theme: string, learningGoal: string, codeContext: string) => void;
  
  // Disable functionality
  disabled?: boolean;
  onDisable?: (stepId: string, cardId: string) => void;
}

const KnowledgeCard: React.FC<KnowledgeCardProps> = ({
  title,
  markdownContent = "", // 为markdownContent提供默认空字符串
  onChatClick,
  onAddToCollectionClick,
  testItems = [],
  onMcqSubmit,
  onSaqSubmit,
  defaultTestMode = false,
  defaultExpanded = true,
  shouldCollapse = false, // External collapse signal
  isHighlighted = false,
  cardId,
  onHighlightEvent,
  onClearHighlight,
  onExpansionChange,
  stepId,
  learningGoal = "",
  codeContext = "",
  onGenerateContent,
  disabled = false,
  onDisable,
}) => {
  const logger = useCodeAwareLogger();
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

  // Handle external collapse signal
  useEffect(() => {
    if (shouldCollapse && isExpanded) {
      setIsExpanded(false);
      
      // Clear local highlights when externally collapsed
      setIsFlickering(false);
      // Clear all existing timeouts
      flickerTimeoutRef.current.forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
      flickerTimeoutRef.current = [];
      
      // Note: We don't call onClearHighlight() here to avoid clearing 
      // highlights for other components
    }
  }, [shouldCollapse, isExpanded]);

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

  const handleToggle = async () => {
    const wasExpanded = isExpanded;
    
    await logger.addLogEntry("user_toggle_knowledge_card", {
      cardId: cardId || "unknown",
      stepId: stepId || "unknown", 
      wasExpanded,
      willExpand: !wasExpanded,
      timestamp: new Date().toISOString()
    });
    
    setIsExpanded(!isExpanded);
    
    // Notify parent component about expansion change
    if (onExpansionChange && cardId) {
      onExpansionChange(cardId, !wasExpanded);
    }
    
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
    
    // If card is being expanded and content is empty, trigger lazy loading
    if (!wasExpanded && !markdownContent && onGenerateContent && stepId && cardId) {
      console.log('Triggering lazy loading for knowledge card:', cardId);
      onGenerateContent(stepId, cardId, title, learningGoal, codeContext);
    }
    
    // Only trigger highlight event when expanding (not when collapsing)
    if (!wasExpanded && onHighlightEvent && cardId) {
      onHighlightEvent({
        sourceType: "knowledgeCard",
        identifier: cardId,
      });
    }
  };

  const onQuestionMarkClick = () => {
    // 如果没有测试项目，则不允许切换到测试模式
    if (testItems.length === 0) {
      console.log('No test items available for this knowledge card');
      return;
    }
    
    const wasInTestMode = isTestMode;
    setIsTestMode(!isTestMode);
    
    // If exiting test mode, clear all highlights
    if (wasInTestMode && onClearHighlight) {
      onClearHighlight();
    }
    
    //print all the test items in the console
    console.log('Test Items:', testItems);
  }

  const handlePreviousTest = async () => {
    const newIndex = Math.max(currentTestIndex - 1, 0);
    await logger.addLogEntry("user_navigate_to_previous_test", {
      cardId: cardId || "unknown",
      stepId: stepId || "unknown",
      currentTestIndex,
      newTestIndex: newIndex,
      timestamp: new Date().toISOString()
    });
    setCurrentTestIndex(newIndex);
  };

  const handleNextTest = async () => {
    const newIndex = Math.min(currentTestIndex + 1, testItems.length - 1);
    await logger.addLogEntry("user_navigate_to_next_test", {
      cardId: cardId || "unknown", 
      stepId: stepId || "unknown",
      currentTestIndex,
      newTestIndex: newIndex,
      timestamp: new Date().toISOString()
    });
    setCurrentTestIndex(newIndex);
  };

  const currentTest = testItems[currentTestIndex];

  // Handle disable card
  const handleDisableCard = async () => {
    await logger.addLogEntry("user_disable_knowledge_card", {
      cardId: cardId || "unknown",
      stepId: stepId || "unknown",
      timestamp: new Date().toISOString()
    });
    
    if (stepId && cardId && onDisable) {
      onDisable(stepId, cardId);
    }
  };

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
        onDisableClick={handleDisableCard} // Add disable functionality
        isQuestionDisabled={testItems.length === 0} // 没有测试项目时禁用问号按钮
        isHighlighted={isHighlighted}
        isFlickering={isFlickering}
      />
      <ContentArea isVisible={isExpanded}>

        {!isTestMode && markdownContent === "::LOADING::" && (
          <KnowledgeCardLoader text="正在生成知识卡片内容..." />
        )}

        {!isTestMode && markdownContent && markdownContent !== "::LOADING::" && !markdownContent.startsWith("加载失败:") && !markdownContent.startsWith("生成失败") && (
          <KnowledgeCardContent 
            markdownContent={markdownContent} 
            isHighlighted={isHighlighted}
            isFlickering={isFlickering && isExpanded}
          />
        )}

        {!isTestMode && markdownContent && (markdownContent.startsWith("加载失败:") || markdownContent.startsWith("生成失败")) && (
          <div style={{
            padding: '12px',
            color: '#ff6b6b',
            fontSize: '14px',
            textAlign: 'center',
            backgroundColor: '#ff6b6b11',
            borderRadius: '6px',
            margin: '8px',
            border: '1px solid #ff6b6b33'
          }}>
            <div style={{ marginBottom: '8px', fontWeight: '500' }}>
              {markdownContent}
            </div>
            <button
              style={{
                backgroundColor: '#4ade80',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
              onClick={() => {
                if (onGenerateContent && stepId && cardId) {
                  onGenerateContent(stepId, cardId, title, learningGoal, codeContext);
                }
              }}
            >
              重新生成
            </button>
          </div>
        )}

        {!isTestMode && !markdownContent && (
          <div style={{
            padding: '12px',
            color: '#888',
            fontSize: '14px',
            fontStyle: 'italic',
            textAlign: 'center'
          }}>
            此知识卡片暂无详细内容
          </div>
        )}
        
        {isTestMode && testItems.length > 0 && currentTest && (
          <TestContainer>
            {/* Test navigation controls */}
            {testItems.length > 1 && (
              <TestNavigationContainer>
                <TestNavigationButton 
                  onClick={handlePreviousTest} 
                  disabled={currentTestIndex <= 0} /* 修正：在第一题时禁用向前按钮 */
                  title="上一题"
                >
                  <ChevronLeftIcon width={14} height={14} />
                </TestNavigationButton>
                <TestCounter>
                  {currentTestIndex + 1}/{testItems.length}
                </TestCounter>
                <TestNavigationButton 
                  onClick={handleNextTest} 
                  disabled={currentTestIndex >= testItems.length - 1} /* 修正：在最后一题时禁用向后按钮 */
                  title="下一题"
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
                isLoading={currentTest.isLoading}
                result={currentTest.result}
              />
            )}
          </TestContainer>
        )}
      </ContentArea>
    </KnowledgeCardContainer>
  );
};

export default KnowledgeCard;

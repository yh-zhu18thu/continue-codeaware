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
  onGenerateTests?: (stepId: string, cardId: string, title: string, content: string, theme: string, learningGoal: string, codeContext: string) => void; // 新增：生成测试题的回调

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
  
  // Loading states
  isTestsLoading?: boolean; // 新增：测试题加载状态
}

const KnowledgeCard: React.FC<KnowledgeCardProps> = ({
  title,
  markdownContent = "", // 为markdownContent提供默认空字符串
  onChatClick,
  onAddToCollectionClick,
  testItems = [],
  onMcqSubmit,
  onSaqSubmit,
  onGenerateTests, // 新增：生成测试题的回调
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
  isTestsLoading = false, // 新增：测试题加载状态
}) => {
  const logger = useCodeAwareLogger();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isTestMode, setIsTestMode] = useState(defaultTestMode);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const flickerTimeoutRef = useRef<(NodeJS.Timeout | null)[]>([]);
  
  // 新增：保存每个测试题的用户输入状态（不持久存储，仅在内存中）
  const [testInputStates, setTestInputStates] = useState<{[testId: string]: {
    // SAQ 相关状态
    saqContent?: string;
    saqIsRetrying?: boolean;
    // MCQ 相关状态  
    mcqSelectedOption?: string;
    mcqSubmitted?: boolean;
  }}>({});

  // 新增：更新SAQ输入内容的函数
  const updateSaqContent = (testId: string, content: string) => {
    setTestInputStates(prev => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        saqContent: content
      }
    }));
  };

  // 新增：更新SAQ重试状态的函数
  const updateSaqRetryState = (testId: string, isRetrying: boolean) => {
    setTestInputStates(prev => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        saqIsRetrying: isRetrying
      }
    }));
  };

  // 新增：更新MCQ选择状态的函数
  const updateMcqSelection = (testId: string, selectedOption: string) => {
    setTestInputStates(prev => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        mcqSelectedOption: selectedOption
      }
    }));
  };

  // 新增：更新MCQ提交状态的函数
  const updateMcqSubmitState = (testId: string, submitted: boolean) => {
    setTestInputStates(prev => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        mcqSubmitted: submitted
      }
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
    
    setIsExpanded(!isExpanded);
    
    // Log knowledge card expansion/collapse events
    if (cardId) {
      if (!wasExpanded) {
        // Log knowledge card viewing start
        await logger.addLogEntry("user_view_and_highlight_knowledge_card", {
          cardTitle: title,
          cardContent: markdownContent ? (markdownContent.length > 200 ? markdownContent.substring(0, 200) + "..." : markdownContent) : "",
          testItemsCount: testItems.length,
          timestamp: new Date().toISOString()
        });
      } else {
        // Log knowledge card viewing end
        await logger.addLogEntry("user_finished_viewing_knowledge_card", {
          cardTitle: title,
          cardContent: markdownContent ? (markdownContent.length > 200 ? markdownContent.substring(0, 200) + "..." : markdownContent) : "",
          testItemsCount: testItems.length,
          timestamp: new Date().toISOString()
        });
      }
    }
    
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

  const onQuestionMarkClick = async () => {
    const wasInTestMode = isTestMode;
    
    // 如果当前不在测试模式，切换到测试模式
    if (!wasInTestMode) {
      // 如果没有测试项目，尝试生成测试题
      if (testItems.length === 0) {
        // 检查是否有知识卡片内容，如果有则生成测试题
        if (markdownContent && onGenerateTests && stepId && cardId) {
          console.log('Generating tests for knowledge card:', cardId);
          onGenerateTests(stepId, cardId, title, markdownContent, title, learningGoal, codeContext);
        } else {
          console.log('Cannot generate tests: missing content or callbacks');
          return;
        }
      }
      setIsTestMode(true);
      
      // Log user switching to test mode
      await logger.addLogEntry("user_switch_to_knowledge_card_test_mode", {
        cardTitle: title,
        cardContent: markdownContent ? (markdownContent.length > 200 ? markdownContent.substring(0, 200) + "..." : markdownContent) : "",
        testItemsCount: testItems.length,
        currentTestPreview: testItems.length > 0 ? {
          questionType: testItems[currentTestIndex]?.questionType,
          question: testItems[currentTestIndex]?.questionType === 'multipleChoice' 
            ? testItems[currentTestIndex]?.mcqQuestion 
            : testItems[currentTestIndex]?.saqQuestion
        } : null,
        timestamp: new Date().toISOString()
      });
    } else {
      // 如果当前在测试模式，切换回知识卡片模式
      setIsTestMode(false);
      
      // Log user switching to content mode
      await logger.addLogEntry("user_switch_to_knowledge_card_content_mode", {
        cardTitle: title,
        cardContent: markdownContent ? (markdownContent.length > 200 ? markdownContent.substring(0, 200) + "..." : markdownContent) : "",
        testItemsCount: testItems.length,
        lastViewedTestPreview: testItems.length > 0 ? {
          questionType: testItems[currentTestIndex]?.questionType,
          question: testItems[currentTestIndex]?.questionType === 'multipleChoice' 
            ? testItems[currentTestIndex]?.mcqQuestion 
            : testItems[currentTestIndex]?.saqQuestion
        } : null,
        timestamp: new Date().toISOString()
      });
      
      // If exiting test mode, clear all highlights
      if (onClearHighlight) {
        onClearHighlight();
      }
    }
    
    //print all the test items in the console
    console.log('Test Items:', testItems);
  }

  const handlePreviousTest = async () => {
    const newIndex = Math.max(currentTestIndex - 1, 0);
    if (newIndex !== currentTestIndex) {
      // Log test navigation
      await logger.addLogEntry("user_navigate_knowledge_card_test", {
        cardTitle: title,
        direction: "previous",
        fromTestIndex: currentTestIndex,
        toTestIndex: newIndex,
        fromTestPreview: testItems[currentTestIndex] ? {
          questionType: testItems[currentTestIndex].questionType,
          question: testItems[currentTestIndex].questionType === 'multipleChoice' 
            ? testItems[currentTestIndex].mcqQuestion 
            : testItems[currentTestIndex].saqQuestion
        } : null,
        toTestPreview: testItems[newIndex] ? {
          questionType: testItems[newIndex].questionType,
          question: testItems[newIndex].questionType === 'multipleChoice' 
            ? testItems[newIndex].mcqQuestion 
            : testItems[newIndex].saqQuestion
        } : null,
        timestamp: new Date().toISOString()
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
        fromTestPreview: testItems[currentTestIndex] ? {
          questionType: testItems[currentTestIndex].questionType,
          question: testItems[currentTestIndex].questionType === 'multipleChoice' 
            ? testItems[currentTestIndex].mcqQuestion 
            : testItems[currentTestIndex].saqQuestion
        } : null,
        toTestPreview: testItems[newIndex] ? {
          questionType: testItems[newIndex].questionType,
          question: testItems[newIndex].questionType === 'multipleChoice' 
            ? testItems[newIndex].mcqQuestion 
            : testItems[newIndex].saqQuestion
        } : null,
        timestamp: new Date().toISOString()
      });
      setCurrentTestIndex(newIndex);
    }
  };  const currentTest = testItems[currentTestIndex];

  // Check if user has answered any question correctly
  const hasCorrectAnswer = testItems.some(test => test.result?.isCorrect === true);

  // Handle disable card
  const handleDisableCard = async () => {
    await logger.addLogEntry("user_disable_knowledge_card", {
      cardTitle: title,
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
        isQuestionDisabled={!markdownContent || markdownContent === "::LOADING::" || markdownContent.startsWith("加载失败:") || markdownContent.startsWith("生成失败")} // 只有在有知识卡片内容时才能生成测试题
        isHighlighted={isHighlighted}
        isFlickering={isFlickering}
        isTestMode={isTestMode} // 传递测试模式状态
        hasCorrectAnswer={hasCorrectAnswer} // 传递正确答案状态
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
        
        {isTestMode && testItems.length === 0 && isTestsLoading && (
          <KnowledgeCardLoader text="正在生成测试题..." />
        )}

        {isTestMode && testItems.length === 0 && !isTestsLoading && (
          <div style={{
            padding: '12px',
            color: '#888',
            fontSize: '14px',
            fontStyle: 'italic',
            textAlign: 'center'
          }}>
            暂无测试题
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
                // 传递保存的状态
                initialSelectedOption={testInputStates[currentTest.id]?.mcqSelectedOption}
                initialSubmitted={testInputStates[currentTest.id]?.mcqSubmitted || false}
                // 传递状态更新回调
                onSelectionChange={(selectedOption) => updateMcqSelection(currentTest.id, selectedOption)}
                onSubmitStateChange={(submitted) => updateMcqSubmitState(currentTest.id, submitted)}
              />
            )}

            {currentTest.questionType === 'shortAnswer' && onSaqSubmit && 
             currentTest.saqQuestion && (
              <KnowledgeCardSAQ
                question={currentTest.saqQuestion}
                onSubmitAnswer={(answer) => onSaqSubmit(currentTest.id, answer)}
                isLoading={currentTest.isLoading}
                result={currentTest.result}
                // 传递保存的状态
                initialContent={testInputStates[currentTest.id]?.saqContent}
                initialIsRetrying={testInputStates[currentTest.id]?.saqIsRetrying || false}
                // 传递状态更新回调
                onContentChange={(content) => updateSaqContent(currentTest.id, content)}
                onRetryStateChange={(isRetrying) => updateSaqRetryState(currentTest.id, isRetrying)}
              />
            )}
          </TestContainer>
        )}
      </ContentArea>
    </KnowledgeCardContainer>
  );
};

export default KnowledgeCard;

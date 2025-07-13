import { HighlightEvent, KnowledgeCardItem, StepItem } from "core";
import { Key, useCallback, useContext, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscForeground
} from "../../components";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  clearAllHighlights,
  newCodeAwareSession, // Add this import
  resetIdeCommFlags,
  resetSessionExceptRequirement, // Add this import
  selectIsRequirementInEditMode, // Import submitRequirementContent
  selectIsStepsGenerated,
  setUserRequirementStatus,
  submitRequirementContent,
  updateHighlight
} from "../../redux/slices/codeAwareSlice";
import {
  generateKnowledgeCardDetail, generateStepsFromRequirement,
  paraphraseUserIntent
} from "../../redux/thunks/codeAwareGeneration";
import "./CodeAware.css";
import RequirementDisplay from "./components/Requirements/RequirementDisplay"; // Import RequirementDisplay
import RequirementEditor from "./components/Requirements/RequirementEditor"; // Import RequirementEditor
import Step from "./components/Steps/Step"; // Import Step

// 全局样式：
const CodeAwareDiv = styled.div`
  position: relative;
  background-color: transparent;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: hidden; /* 防止水平滚动 */

  & > * {
    position: relative;
    max-width: 100%;
    box-sizing: border-box;
  }

  .thread-message {
    margin: 0px 0px 0px 1px;
  }
  
  /* 确保所有 markdown 内容都不会溢出 */
  .wmde-markdown {
    max-width: 100% !important;
    overflow-x: hidden !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
  }
  
  .wmde-markdown pre {
    max-width: 100% !important;
    overflow-x: auto !important;
    white-space: pre-wrap !important;
    word-wrap: break-word !important;
  }
  
  .wmde-markdown code {
    max-width: 100% !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
  }
  
  /* 确保所有表格都能适应容器 */
  .wmde-markdown table {
    max-width: 100% !important;
    table-layout: fixed !important;
    width: 100% !important;
  }
  
  .wmde-markdown td,
  .wmde-markdown th {
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: ${defaultBorderRadius};
  z-index: 1000;
`;

const SpinnerIcon = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid ${lightGray};
  border-top: 2px solid ${vscForeground};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

export const CodeAware = () => {
  //import the idemessenger that will communicate between core, gui and IDE
  const ideMessenger = useContext(IdeMessengerContext);

  const dispatch = useAppDispatch();

  //CodeAware: 增加一个指令，使得可以发送当前所选择的知识卡片id
  //CATODO: 参照着codeContextProvider的实现，利用上getAllSnippets的获取最近代码的功能，然后再通过coreToWebview的路径发送更新过来。
  
  //从redux中获取项目需求相关的数据
  // 当前requirement部分应该使用
  const isEditMode = useAppSelector(selectIsRequirementInEditMode);
  const isStepsGenerated = useAppSelector(selectIsStepsGenerated); // Use the selector
  // 获取可能有的requirement内容
  const userRequirement = useAppSelector(
    (state) => state.codeAwareSession.userRequirement
  );
  const userRequirementStatus = useAppSelector(
    (state) => state.codeAwareSession.userRequirement?.requirementStatus
  );

  const steps = useAppSelector((state) => state.codeAwareSession.steps); // Get steps data


  // Add webview listener for new session event to initialize CodeAware session
  useWebviewListener(
    "newSession",
    async () => {
      dispatch(newCodeAwareSession());
    },
    [dispatch]
  );

  // Get IDE communication flags
  const shouldClearIdeHighlights = useAppSelector((state) => state.codeAwareSession.shouldClearIdeHighlights);
  const codeChunksToHighlightInIde = useAppSelector((state) => state.codeAwareSession.codeChunksToHighlightInIde);

  // Get all the mappings:
  const allMappings = useAppSelector(
    (state) => state.codeAwareSession.codeAwareMappings
  );

  // Check if we should show loading overlay
  const isGeneratingSteps = userRequirementStatus === "confirmed";

  // log all the data for debugging
  useEffect(() => {
    console.log("All mappings length: ", allMappings.length);
    console.log("All Mappings:", allMappings);
  }, [allMappings]);

  // 设置全局样式：
  const codeAwareDivRef = useRef<HTMLDivElement>(null);

  // CodeAware: 调试状态 - 跟踪最近的光标位置和选择信息
  const [debugInfo, setDebugInfo] = useState<{
    lastCursorPosition?: {
      filePath: string;
      lineNumber: number;
      startLine: number;
      endLine: number;
    };
    lastSelection?: {
      filePath: string;
      selectedLines: [number, number];
      selectedContent: string;
    };
    matchedCodeChunks: string[];
  }>({
    matchedCodeChunks: []
  });

  // 获取当前 CodeChunks 用于调试
  const codeChunks = useAppSelector((state) => state.codeAwareSession.codeChunks);

  const AIPolishUserRequirement = useCallback(
    (requirement: string) => { // Expect requirement from editor
      if (!userRequirement) {
        return;
      }
      dispatch(submitRequirementContent(requirement)); // Submit content first
      dispatch(setUserRequirementStatus("paraphrasing"));
      dispatch(
        paraphraseUserIntent({ programRequirement: { ...userRequirement, requirementDescription: requirement } })
      ).then(() => {
        console.log("Requirement submitted to AI");
      });
    },
    [dispatch, userRequirement]
  );

  const AIHandleRequirementConfirmation = useCallback(
    (requirement: string) => { // Expect requirement from editor
      if (!userRequirement) {
        return;
      }
      dispatch(submitRequirementContent(requirement)); // Submit content first
      // Reset session except requirement first to ensure clean state
      dispatch(resetSessionExceptRequirement());
      dispatch(setUserRequirementStatus("confirmed"));
      dispatch(generateStepsFromRequirement({ userRequirement: requirement }))
        .then(() => {
          console.log("Steps generated from requirement");
        });
    }
  , [dispatch, userRequirement]
  );

  const handleEditRequirement = useCallback(() => {
    dispatch(setUserRequirementStatus("editing"));
  }, [dispatch]);

  const handleRegenerateSteps = useCallback(() => {
    if (!userRequirement?.requirementDescription) {
      return;
    }
    // Reset session except requirement first
    dispatch(resetSessionExceptRequirement());
    // Set status to confirmed for regeneration
    dispatch(setUserRequirementStatus("confirmed"));
    dispatch(generateStepsFromRequirement({ userRequirement: userRequirement.requirementDescription }))
      .then(() => {
        dispatch(setUserRequirementStatus("finalized"));
      });
  }, [dispatch, userRequirement?.requirementDescription]);


  // CodeAware: 获取学习目标和代码上下文
  const learningGoal = useAppSelector((state) => state.codeAwareSession.learningGoal);

  // 处理生成知识卡片内容
  const handleGenerateKnowledgeCardContent = useCallback(
    (stepId: string, cardId: string, theme: string, learningGoal: string, codeContext: string) => {
      console.log("Generating knowledge card content for:", { stepId, cardId, theme });
      
      // 如果没有提供代码上下文，我们可以使用一个默认的上下文或者从当前的代码中获取
      let contextToUse = codeContext;
      if (!contextToUse) {
        // 可以从当前的 IDE 状态获取代码上下文
        contextToUse = "当前代码上下文暂时不可用，请基于知识卡片主题生成内容。";
      }

      dispatch(generateKnowledgeCardDetail({
        stepId,
        knowledgeCardId: cardId,
        knowledgeCardTheme: theme,
        learningGoal: learningGoal || "提升编程技能和理解相关概念",
        codeContext: contextToUse
      }));
    },
    [dispatch]
  );

  const handleHighlightEvent = useCallback((e: HighlightEvent) => {
    // Dispatch highlight event to trigger mapping-based highlighting
    if (!e.additionalInfo){
      // If no additional info, just update the highlight
      dispatch(updateHighlight({
        sourceType: e.sourceType,
        identifier: e.identifier,
      }));
    } else {
      // If additional info is provided, use it to update the highlight
      dispatch(updateHighlight({
        sourceType: e.sourceType,
        identifier: e.identifier,
        additionalInfo: e.additionalInfo,
      }));
    }
  }, [dispatch]);

  const removeHighlightEvent = useCallback(() => {
    // Dispatch action to clear all highlights
    dispatch(clearAllHighlights());
  }, [dispatch]);

  // Add keyboard event listener for Escape key to clear highlights
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        removeHighlightEvent();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [removeHighlightEvent]);

  // Handle IDE communication for highlights
  useEffect(() => {
    if (shouldClearIdeHighlights) {
      // Clear all highlights in IDE
      try {
        ideMessenger?.post("clearCodeHighlight", undefined);
      } catch (error) {
        console.error("Failed to clear highlights in IDE:", error);
      }
      // Reset the flag
      dispatch(resetIdeCommFlags());
    }
  }, [shouldClearIdeHighlights, ideMessenger, dispatch]);

  useEffect(() => {
    if (codeChunksToHighlightInIde.length > 0) {
      // Merge multiple code chunks into one for efficient highlighting
      if (codeChunksToHighlightInIde.length === 1) {
        // Single chunk, send as is
        try {
          ideMessenger?.post("highlightCodeChunk", codeChunksToHighlightInIde[0]);
        } catch (error) {
          console.error("Failed to highlight code in IDE:", error);
        }
      } else {
        // Multiple chunks, merge them
        const groupedByFile = codeChunksToHighlightInIde.reduce((acc, chunk) => {
          if (!acc[chunk.filePath]) {
            acc[chunk.filePath] = [];
          }
          acc[chunk.filePath].push(chunk);
          return acc;
        }, {} as Record<string, typeof codeChunksToHighlightInIde>);

        // Process each file separately
        Object.entries(groupedByFile).forEach(([filePath, chunks]) => {
          try {
            if (chunks.length === 1) {
              // Single chunk in this file
              ideMessenger?.post("highlightCodeChunk", chunks[0]);
            } else {
              // Multiple chunks in same file, merge them
              const sortedChunks = chunks.sort((a, b) => a.range[0] - b.range[0]);
              const minLine = Math.min(...sortedChunks.map(chunk => chunk.range[0]));
              const maxLine = Math.max(...sortedChunks.map(chunk => chunk.range[1]));
              
              // Merge content with line breaks between chunks
              const mergedContent = sortedChunks
                .map(chunk => chunk.content)
                .join('\n...\n'); // Add separator between chunks

              const mergedChunk = {
                id: `merged-${sortedChunks.map(c => c.id).join('-')}`,
                content: mergedContent,
                range: [minLine, maxLine] as [number, number],
                isHighlighted: true,
                filePath: filePath
              };

              ideMessenger?.post("highlightCodeChunk", mergedChunk);
            }
          } catch (error) {
            console.error("Failed to highlight code in IDE:", error);
          }
        });
      }
      
      // Reset the flag
      dispatch(resetIdeCommFlags());
    }
  }, [codeChunksToHighlightInIde, ideMessenger, dispatch]);


  return (
    <CodeAwareDiv
      ref={codeAwareDivRef}
      onClick={(e) => {
        // Check if the click is on the main container itself (not a child)
        if (e.target === e.currentTarget) {
          removeHighlightEvent();
        }
      }}
    >
      {/* Loading Overlay */}
      {isGeneratingSteps && (
        <LoadingOverlay>
          <SpinnerIcon />
        </LoadingOverlay>
      )}
      {/* CodeAware 调试面板 */}
      {/*
      <div style={{
        position: "fixed",
        top: "10px",
        right: "10px",
        background: "rgba(0, 0, 0, 0.8)",
        color: "white",
        padding: "10px",
        borderRadius: "5px",
        fontSize: "12px",
        maxWidth: "300px",
        zIndex: 1000,
        fontFamily: "monospace"
      }}>
        <div><strong>CodeAware 调试信息</strong></div>
        <div>CodeChunks 总数: {codeChunks.length}</div>
        <div>Mappings 总数: {allMappings.length}</div>
        <div>高亮的 CodeChunks: {codeChunksToHighlightInIde.length}</div>
        {debugInfo.lastCursorPosition && (
          <div>
            <div>最近光标位置:</div>
            <div>文件: {debugInfo.lastCursorPosition.filePath.split('/').pop()}</div>
            <div>行号: {debugInfo.lastCursorPosition.lineNumber}</div>
          </div>
        )}
        {debugInfo.lastSelection && (
          <div>
            <div>最近选择:</div>
            <div>行号: {debugInfo.lastSelection.selectedLines[0]}-{debugInfo.lastSelection.selectedLines[1]}</div>
          </div>
        )}
        <div>匹配的代码块: {debugInfo.matchedCodeChunks.join(', ')}</div>
      </div>
    */}

      {/*
        <Button
          className="top-2 right-2 z-10"
          onClick={() => {
            dispatch(newCodeAwareSession()); // Dispatch action to reset CodeAware session
          }}
        >
          New CodeAware Session
        </Button>*/}

      {/* Requirement Section */}
      
      {isEditMode ? (
        <RequirementEditor
          onConfirm={AIHandleRequirementConfirmation}
          onAIProcess={AIPolishUserRequirement}
        />
      ) : (
        <RequirementDisplay
          onEdit={handleEditRequirement}
          onRegenerate={handleRegenerateSteps}
          onChunkFocus={handleHighlightEvent} // Pass the highlight event handler
          onClearHighlight={removeHighlightEvent} // Pass the clear highlight function
        />
      )}

      {isStepsGenerated && (
        <div 
          className={`overflow-y-scroll pt-[8px] no-scrollbar ${steps.length > 0 ? "flex-1" : ""}`}
        >
          {steps.map((step: StepItem, index: Key | null | undefined) => (
            <Step
              key={step.id} // Use step.id for proper React tracking
              title={step.title}
              content={step.abstract}
              isHighlighted={step.isHighlighted}
              stepId={step.id}
              onHighlightEvent={handleHighlightEvent}
              onClearHighlight={removeHighlightEvent} // Pass the clear highlight function
              knowledgeCards={step.knowledgeCards.map((kc: KnowledgeCardItem, kcIndex: number) => {
                // 从 KnowledgeCardItem.tests 转换为 TestItem[]
                const testItems = kc.tests?.map(test => ({
                  id: test.id,
                  questionType: test.questionType,
                  // MCQ specific props
                  mcqQuestion: test.questionType === 'multipleChoice' && test.question.type === 'multipleChoice' 
                    ? test.question.stem : undefined,
                  mcqOptions: test.questionType === 'multipleChoice' && test.question.type === 'multipleChoice' 
                    ? test.question.options : undefined,
                  mcqCorrectAnswer: test.questionType === 'multipleChoice' && test.question.type === 'multipleChoice' 
                    ? test.question.standard_answer : undefined,
                  // SAQ specific props
                  saqQuestion: test.questionType === 'shortAnswer' && test.question.type === 'shortAnswer' 
                    ? test.question.stem : undefined,
                  saqAnswer: test.questionType === 'shortAnswer' && test.question.type === 'shortAnswer' 
                    ? test.question.standard_answer : undefined,
                })) || [];
                
                return {
                  title: kc.title,
                  markdownContent: kc.content || "", // 提供默认空字符串
                  testItems: testItems, // 传递所有测试项目
                  
                  // Highlight props
                  isHighlighted: kc.isHighlighted,
                  cardId: kc.id || `${step.id}-card-${kcIndex}`,
                  
                  // 事件处理函数
                  onMcqSubmit: (testId: string, isCorrect: boolean, selectedOption: string) => {
                    console.log(`MCQ Result for ${kc.title} (Test ${testId}): ${isCorrect ? 'Correct' : 'Incorrect'}, Selected: ${selectedOption}`);
                    // TODO: 实现 MCQ 提交逻辑，更新测试结果到 Redux store
                  },
                  
                  onSaqSubmit: (testId: string, answer: string) => {
                    console.log(`SAQ Answer for ${kc.title} (Test ${testId}): ${answer}`);
                    // TODO: 实现 SAQ 提交逻辑，更新测试结果到 Redux store
                  },
                  
                  // Toolbar event handlers
                  onChatClick: () => {
                    console.log(`Chat clicked for knowledge card: ${kc.title}`);
                    // TODO: 实现聊天功能，可能导航到聊天页面或打开聊天对话框
                  },
                  
                  onAddToCollectionClick: () => {
                    console.log(`Add to collection clicked for knowledge card: ${kc.title}`);
                    // TODO: 实现添加到收藏或重点标记功能
                  },
                  
                  // Default states - 只有title时默认折叠
                  defaultTestMode: false,
                  defaultExpanded: Boolean(kc.content), // 有内容时展开，只有title时折叠
                  
                  // Lazy loading props
                  stepId: step.id,
                  learningGoal: learningGoal,
                  codeContext: kc.codeContext || "",
                  onGenerateContent: handleGenerateKnowledgeCardContent,
                };
              })}
              // isActive can be determined by currentFocusedFlowId if needed
              // isActive={step.id === currentFocusedFlowId} 
            />
          ))}
        </div>
      )}

      {/* Loading Overlay */}
      {isGeneratingSteps && (
        <LoadingOverlay>
          <SpinnerIcon />
        </LoadingOverlay>
      )}
    </CodeAwareDiv>
  );
};
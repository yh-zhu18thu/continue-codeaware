// ...existing code...
import { HighlightEvent, KnowledgeCardItem, StepItem } from "core";
import { Key, useCallback, useContext, useEffect, useRef } from "react";
import styled from "styled-components";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  clearAllHighlights,
  resetIdeCommFlags,
  selectIsRequirementInEditMode, // Import submitRequirementContent
  selectIsStepsGenerated,
  setUserRequirementStatus,
  submitRequirementContent,
  updateHighlight
} from "../../redux/slices/codeAwareSlice";
import {
  generateStepsFromRequirement,
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

  & > * {
    position: relative;
  }

  .thread-message {
    margin: 0px 0px 0px 1px;
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

  // Get IDE communication flags
  const shouldClearIdeHighlights = useAppSelector((state) => state.codeAwareSession.shouldClearIdeHighlights);
  const codeChunksToHighlightInIde = useAppSelector((state) => state.codeAwareSession.codeChunksToHighlightInIde);

  // Get all the mappings:
  const allMappings = useAppSelector(
    (state) => state.codeAwareSession.codeAwareMappings
  );

  // log all the data for debugging
  useEffect(() => {
    console.log("All Mappings:", allMappings);
  }, [allMappings]);

  // 设置全局样式：
  const codeAwareDivRef = useRef<HTMLDivElement>(null);

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
        dispatch(setUserRequirementStatus("empty")); // Back to edit mode to show paraphrased content
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
      dispatch(setUserRequirementStatus("confirmed"));
      dispatch(generateStepsFromRequirement({ userRequirement: requirement }))
        .then(() => {
          dispatch(setUserRequirementStatus("finalized"));
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
    // CATODO: Consider if a different status is needed during regeneration
    dispatch(setUserRequirementStatus("confirmed")); // Or a new status like "regenerating"
    dispatch(generateStepsFromRequirement({ userRequirement: userRequirement.requirementDescription }))
      .then(() => {
        dispatch(setUserRequirementStatus("finalized"));
      });
  }, [dispatch, userRequirement?.requirementDescription]);


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
      // Highlight code chunks in IDE
      codeChunksToHighlightInIde.forEach(codeChunk => {
        try {
          ideMessenger?.post("highlightCodeChunk", codeChunk);
        } catch (error) {
          console.error("Failed to highlight code in IDE:", error);
        }
      });
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
        className={`overflow-y-scroll pt-[8px]" "no-scrollbar" ${steps.length > 0 ? "flex-1" : ""}`}
        >
          {steps.map((step: StepItem, index: Key | null | undefined) => (
            <Step
              key={index} // Consider using a unique ID from step data if available
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
                  markdownContent: kc.content,
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
                  
                  // Default states
                  defaultTestMode: false,
                  defaultExpanded: true,
                };
              })}
              // isActive can be determined by currentFocusedFlowId if needed
              // isActive={step.id === currentFocusedFlowId} 
            />
          ))}
        </div>
      )}
    </CodeAwareDiv>
  );
};
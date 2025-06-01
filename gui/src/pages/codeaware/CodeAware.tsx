// ...existing code...
import { useCallback, useContext } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectIsRequirementInEditMode, // Import submitRequirementContent
  selectIsStepsGenerated,
  setUserRequirementStatus,
  submitRequirementContent, // Import submitRequirementContent
} from "../../redux/slices/codeAwareSlice";
import {
  generateStepsFromRequirement,
  paraphraseUserIntent
} from "../../redux/thunks/codeAwareGeneration";
import "./CodeAware.css";
import RequirementDisplay from "./components/Requirements/RequirementDisplay"; // Import RequirementDisplay
import RequirementEditor from "./components/Requirements/RequirementEditor"; // Import RequirementEditor
import Step from "./components/Steps/Step"; // Import Step

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
  // 获取当前高亮的关键词
  const steps = useAppSelector((state) => state.codeAwareSession.steps); // Get steps data

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


  return (
    <div className="flex flex-col h-full bg-vscode-sideBar-background text-vscode-sideBar-foreground">
      {isEditMode ? (
        <RequirementEditor
          onConfirm={AIHandleRequirementConfirmation}
          onAIProcess={AIPolishUserRequirement}
        />
      ) : (
        <RequirementDisplay
          onEdit={handleEditRequirement}
          onRegenerate={handleRegenerateSteps}
        />
      )}

      {isStepsGenerated && (
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {steps.map((step, index) => (
            <Step
              key={index} // Consider using a unique ID from step data if available
              title={step.title}
              content={step.abstract}
              knowledgeCards={step.knowledgeCards.map(kc => ({
                title: kc.title,
                markdownContent: kc.content,
                // CATODO: Add other necessary props for KnowledgeCard if any, like id, type, etc.
              }))}
              // isActive can be determined by currentFocusedFlowId if needed
              // isActive={step.id === currentFocusedFlowId} 
            />
          ))}
        </div>
      )}
    </div>
  );
};
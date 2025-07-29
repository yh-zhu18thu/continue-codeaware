import { HighlightEvent, KnowledgeCardItem, StepItem, StepStatus } from "core";
import { Key, useCallback, useContext, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscForeground
} from "../../components";
import PageHeader from "../../components/PageHeader";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  clearAllHighlights,
  clearCodeEditModeSnapshot,
  newCodeAwareSession, // Add this import
  resetIdeCommFlags,
  resetSessionExceptRequirement, // Add this import
  saveCodeEditModeSnapshot,
  selectIsCodeEditModeEnabled, // Add this import for code edit mode
  selectIsRequirementInEditMode, // Import submitRequirementContent
  selectIsStepsGenerated,
  selectLearningGoal, // Add this import
  selectTask,
  setCodeEditMode, // Add this import for code edit mode action
  setKnowledgeCardDisabled, // Add this import for knowledge card disable
  setStepAbstract, // Add this import for step editing
  setStepStatus, // Add this import for step status change
  setUserRequirementStatus,
  submitRequirementContent,
  updateHighlight
} from "../../redux/slices/codeAwareSlice";
import {
  generateCodeFromSteps,
  generateKnowledgeCardDetail,
  generateKnowledgeCardThemes,
  generateKnowledgeCardThemesFromQuery,
  generateStepsFromRequirement,
  paraphraseUserIntent,
  processCodeChanges,
  rerunStep
} from "../../redux/thunks/codeAwareGeneration";
import "./CodeAware.css";
import CodeEditModeToggle from "./components/CodeEditModeToggle"; // Import the toggle component
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
  const isCodeEditModeEnabled = useAppSelector(selectIsCodeEditModeEnabled); // Get code edit mode state
  // 获取可能有的requirement内容
  const userRequirement = useAppSelector(
    (state) => state.codeAwareSession.userRequirement
  );
  const userRequirementStatus = useAppSelector(
    (state) => state.codeAwareSession.userRequirement?.requirementStatus
  );

  const steps = useAppSelector((state) => state.codeAwareSession.steps); // Get steps data

  // 监听steps变化，同步给IDE
  useEffect(() => {
    // 只有在有步骤的情况下才同步
    if (steps.length > 0) {
      const syncToIde = async () => {
        try {
          await ideMessenger?.request("syncCodeAwareSteps", {
            currentStep: "",
            nextStep: "",
            stepFinished: false
          });

          console.log("📡 [CodeAware] Successfully synced steps to IDE:", {
            stepsCount: steps.length
          });
        } catch (error) {
          console.warn("⚠️ [CodeAware] Failed to sync steps to IDE:", error);
        }
      };

      syncToIde();
    }
  }, [steps.length, ideMessenger]);

  // Sync code edit mode state to IDE
  useEffect(() => {
    const syncCodeEditModeToIde = async () => {
      try {
        await ideMessenger?.request("setCodeEditMode", {
          enabled: isCodeEditModeEnabled
        });

        console.log("📡 [CodeAware] Code edit mode synced to IDE:", {
          isCodeEditModeEnabled
        });
      } catch (error) {
        console.warn("⚠️ [CodeAware] Failed to sync code edit mode to IDE:", error);
      }
    };

    syncCodeEditModeToIde();
  }, [isCodeEditModeEnabled, ideMessenger]);

  // Handle local code edit mode changes (from toggle button)
  useEffect(() => {
    const handleLocalCodeEditModeChange = async () => {
      const previousMode = prevCodeEditModeRef.current;
      const currentMode = isCodeEditModeEnabled;
      
      // Update the ref to current state
      prevCodeEditModeRef.current = currentMode;
      
      // Only process if the mode actually changed
      if (previousMode === currentMode) {
        return;
      }
      
      if (currentMode && !previousMode) {
        // Entering code edit mode - save current code snapshot
        try {
          const currentFileResponse = await ideMessenger?.request("getCurrentFile", undefined);
          
          if (currentFileResponse && currentFileResponse.status === "success" && currentFileResponse.content) {
            const currentFile = currentFileResponse.content;
            
            dispatch(saveCodeEditModeSnapshot({
              filePath: currentFile.path,
              content: currentFile.contents || ""
            }));
            
            console.log("📸 [CodeAware] Code snapshot saved (local toggle):", {
              filePath: currentFile.path,
              contentLength: (currentFile.contents || "").length
            });
          } else {
            console.warn("⚠️ [CodeAware] Could not get current file for snapshot (local toggle)");
          }
        } catch (error) {
          console.error("❌ [CodeAware] Failed to save code snapshot (local toggle):", error);
        }
      } else if (!currentMode && previousMode) {
        // Exiting code edit mode - process code changes
        try {
          const currentFileResponse = await ideMessenger?.request("getCurrentFile", undefined);
          
          if (currentFileResponse && currentFileResponse.status === "success" && currentFileResponse.content) {
            const currentFile = currentFileResponse.content;
            
            console.log("🔄 [CodeAware] Processing code changes (local toggle)...");
            
            // Process code changes in the background
            await dispatch(processCodeChanges({
              currentFilePath: currentFile.path,
              currentContent: currentFile.contents || ""
            }));
            
            console.log("✅ [CodeAware] Code changes processed successfully (local toggle)");
          } else {
            console.warn("⚠️ [CodeAware] Could not get current file for change processing (local toggle)");
          }
          
          // Clear the snapshot after processing
          dispatch(clearCodeEditModeSnapshot());
          
        } catch (error) {
          console.error("❌ [CodeAware] Failed to process code changes (local toggle):", error);
          // Clear snapshot even if processing failed
          dispatch(clearCodeEditModeSnapshot());
        }
      }
    };

    handleLocalCodeEditModeChange();
  }, [isCodeEditModeEnabled, ideMessenger, dispatch]);

  // Add webview listener for new session event to initialize CodeAware session
  useWebviewListener(
    "newSession",
    async () => {
      dispatch(newCodeAwareSession());
    },
    [dispatch]
  );

  // Add webview listener for code edit mode changes from IDE
  useWebviewListener(
    "didChangeCodeEditMode",
    async (data: { enabled: boolean }) => {
      console.log("📡 [CodeAware] Received code edit mode change from IDE:", data);
      
      const currentCodeEditMode = isCodeEditModeEnabled;
      
      if (data.enabled && !currentCodeEditMode) {
        // Entering code edit mode - save current code snapshot
        try {
          const currentFileResponse = await ideMessenger?.request("getCurrentFile", undefined);
          
          if (currentFileResponse && currentFileResponse.status === "success" && currentFileResponse.content) {
            const currentFile = currentFileResponse.content;
            
            dispatch(saveCodeEditModeSnapshot({
              filePath: currentFile.path,
              content: currentFile.contents || ""
            }));
            
            console.log("📸 [CodeAware] Code snapshot saved:", {
              filePath: currentFile.path,
              contentLength: (currentFile.contents || "").length
            });
          } else {
            console.warn("⚠️ [CodeAware] Could not get current file for snapshot");
          }
        } catch (error) {
          console.error("❌ [CodeAware] Failed to save code snapshot:", error);
        }
      } else if (!data.enabled && currentCodeEditMode) {
        // Exiting code edit mode - process code changes
        try {
          const currentFileResponse = await ideMessenger?.request("getCurrentFile", undefined);
          
          if (currentFileResponse && currentFileResponse.status === "success" && currentFileResponse.content) {
            const currentFile = currentFileResponse.content;
            
            console.log("🔄 [CodeAware] Processing code changes...");
            
            // Process code changes in the background
            await dispatch(processCodeChanges({
              currentFilePath: currentFile.path,
              currentContent: currentFile.contents || ""
            }));
            
            console.log("✅ [CodeAware] Code changes processed successfully");
          } else {
            console.warn("⚠️ [CodeAware] Could not get current file for change processing");
          }
          
          // Clear the snapshot after processing
          dispatch(clearCodeEditModeSnapshot());
          
        } catch (error) {
          console.error("❌ [CodeAware] Failed to process code changes:", error);
          // Clear snapshot even if processing failed
          dispatch(clearCodeEditModeSnapshot());
        }
      }
      
      // Update the code edit mode state
      dispatch(setCodeEditMode(data.enabled));
    },
    [dispatch, ideMessenger, isCodeEditModeEnabled]
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
  
  // Check if any step is in generating state
  const hasGeneratingSteps = steps.some(step => step.stepStatus === "generating");

  // log all the data for debugging
  useEffect(() => {
    console.log("All mappings length: ", allMappings.length);
    console.log("All Mappings:", allMappings);
  }, [allMappings]);

  // 设置全局样式：
  const codeAwareDivRef = useRef<HTMLDivElement>(null);
  
  // Track previous code edit mode state for local toggles
  const prevCodeEditModeRef = useRef<boolean>(isCodeEditModeEnabled);

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
      // Disable in code edit mode
      if (isCodeEditModeEnabled) {
        console.warn("⚠️ AI requirement polishing is disabled in code edit mode");
        return;
      }
      
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
    [dispatch, userRequirement, isCodeEditModeEnabled]
  );

  const AIHandleRequirementConfirmation = useCallback(
    (requirement: string) => { // Expect requirement from editor
      // Disable in code edit mode
      if (isCodeEditModeEnabled) {
        console.warn("⚠️ Requirement confirmation is disabled in code edit mode");
        return;
      }
      
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
  , [dispatch, userRequirement, isCodeEditModeEnabled]
  );

  const handleEditRequirement = useCallback(() => {
    // Disable in code edit mode
    if (isCodeEditModeEnabled) {
      console.warn("⚠️ Requirement editing is disabled in code edit mode");
      return;
    }
    
    dispatch(setUserRequirementStatus("editing"));
  }, [dispatch, isCodeEditModeEnabled]);

  const handleRegenerateSteps = useCallback(() => {
    // Disable in code edit mode
    if (isCodeEditModeEnabled) {
      console.warn("⚠️ Step regeneration is disabled in code edit mode");
      return;
    }
    
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
  }, [dispatch, userRequirement?.requirementDescription, isCodeEditModeEnabled]);


  // CodeAware: 获取学习目标和代码上下文
  const learningGoal = useAppSelector(selectLearningGoal);
  const task = useAppSelector(selectTask);

  // 处理生成知识卡片内容
  const handleGenerateKnowledgeCardContent = useCallback(
    (stepId: string, cardId: string, theme: string, learningGoal: string, codeContext: string) => {
      console.log("Generating knowledge card content for:", { stepId, cardId, theme });
      
      // 如果没有提供代码上下文，从mapping中获取和cardId绑定的code chunk的内容
      let contextToUse = codeContext;
      if (!contextToUse) {
        // 从mapping中查找与cardId绑定的code chunk
        const cardMappings = allMappings.filter(mapping => mapping.knowledgeCardId === cardId);
        console.log(`Found ${cardMappings.length} mappings for card ${cardId}:`, cardMappings);
        
        if (cardMappings.length > 0) {
          // 获取所有相关的code chunk内容
          const codeChunkContents: string[] = [];
          
          cardMappings.forEach(mapping => {
            if (mapping.codeChunkId) {
              const codeChunk = codeChunks.find(chunk => chunk.id === mapping.codeChunkId);
              if (codeChunk && !codeChunk.disabled) {
                codeChunkContents.push(codeChunk.content);
              }
            }
          });
          
          // 合并所有相关的代码块内容作为上下文
          if (codeChunkContents.length > 0) {
            contextToUse = codeChunkContents.join('\n\n// --- Related Code Chunk ---\n\n');
            console.log(`Using code context from ${codeChunkContents.length} code chunks for card ${cardId}`);
          } else {
            console.warn(`No valid code chunks found for card ${cardId}, using empty context`);
            contextToUse = "";
          }
        } else {
          console.warn(`No mappings found for card ${cardId}, using empty context`);
          contextToUse = "";
        }
      }

      dispatch(generateKnowledgeCardDetail({
        stepId,
        knowledgeCardId: cardId,
        knowledgeCardTheme: theme,
        learningGoal: learningGoal || "提升编程技能和理解相关概念",
        codeContext: contextToUse
      }));
    },
    [dispatch, allMappings, codeChunks]
  );

  // 处理生成知识卡片主题列表
  const handleGenerateKnowledgeCardThemes = useCallback(
    (stepId: string, stepTitle: string, stepAbstract: string, learningGoalFromProps: string) => {
      // 使用 Redux state 中的学习目标，如果提供了参数则使用参数
      const learningGoalToUse = learningGoalFromProps || learningGoal || "提升编程技能和理解相关概念";
      
      console.log("Generating knowledge card themes for:", { stepId, stepTitle, stepAbstract, learningGoalToUse });
      
      dispatch(generateKnowledgeCardThemes({
        stepId,
        stepTitle,
        stepAbstract,
        learningGoal: learningGoalToUse
      }));
    },
    [dispatch, learningGoal]
  );

  // 处理禁用知识卡片
  const handleDisableKnowledgeCard = useCallback(
    (stepId: string, cardId: string) => {
      console.log("Disabling knowledge card:", { stepId, cardId });
      dispatch(setKnowledgeCardDisabled({ stepId, cardId, disabled: true }));
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

  // Add new functions for step operations
  const executeUntilStep = useCallback(async (stepId: string) => {
    // Disable in code edit mode
    if (isCodeEditModeEnabled) {
      console.warn("⚠️ Code execution is disabled in code edit mode");
      return;
    }
    
    console.log(`执行到步骤: ${stepId}`);
    
    try {
      // 1. 根据step_id获取截止到该步骤的所有未执行步骤信息
      const targetStepIndex = steps.findIndex(step => step.id === stepId);
      if (targetStepIndex === -1) {
        console.error(`Step with id ${stepId} not found`);
        return;
      }

      // 获取从开始到目标步骤的所有未执行步骤（stepStatus 不是 "generated"）
      const unexecutedSteps = steps.slice(0, targetStepIndex + 1).filter(step => 
        step.stepStatus !== "generated"
      );

      // 设置未执行步骤的状态为"generating"
      for (const step of unexecutedSteps) {
        dispatch(setStepStatus({ stepId: step.id, status: "generating" }));
      }

      // 提取步骤信息
      const stepsInfo = unexecutedSteps.map(step => ({
        id: step.id,
        title: step.title,
        abstract: step.abstract,
        knowledgeCards: step.knowledgeCards.map(card => ({
          id: card.id,
          title: card.title
        }))
      }));

      console.log("📋 未执行的步骤信息:", stepsInfo);

      // 2. 通过ideMessenger获取当前文件的所有代码
      const currentFileResponse = await ideMessenger?.request("getCurrentFile", undefined);
      
      // 检查响应是否成功并提取内容
      if (!currentFileResponse || currentFileResponse.status !== "success") {
        console.warn("⚠️ 无法获取当前文件信息");
        // 恢复步骤状态为"confirmed"
        for (const step of unexecutedSteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
        }
        return;
      }

      const currentFile = currentFileResponse.content;
      
      if (!currentFile) {
        console.warn("⚠️ 当前没有打开的文件");
        // 恢复步骤状态为"confirmed"
        for (const step of unexecutedSteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
        }
        return;
      }

      console.log("📁 当前文件信息:", {
        path: currentFile.path,
        isUntitled: currentFile.isUntitled,
        contentLength: currentFile.contents?.length || 0,
      });

      // 3. 调用新的代码生成thunk
      const orderedSteps = stepsInfo.map(step => ({
        id: step.id,
        title: step.title,
        abstract: step.abstract,
        knowledge_cards: step.knowledgeCards.map(kc => ({
          id: kc.id,
          title: kc.title
        }))
      }));

      console.log("🚀 开始生成代码...");
      const result = await dispatch(generateCodeFromSteps({
        existingCode: currentFile.contents || "",
        filepath: currentFile.path,
        orderedSteps: orderedSteps
      }));

      if (generateCodeFromSteps.fulfilled.match(result)) {
        console.log("✅ 代码生成完成!", result.payload);
        // 设置步骤状态为"generated"
        for (const step of unexecutedSteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
        }
        // TODO: 后续处理生成的代码，例如：
        // - 将生成的代码应用到IDE中
        // - 更新代码映射关系
      } else if (generateCodeFromSteps.rejected.match(result)) {
        console.error("❌ 代码生成失败:", result.error.message);
        // 恢复步骤状态为"confirmed"并显示错误提示
        for (const step of unexecutedSteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
        }
        // 显示错误提示
        ideMessenger?.post("showToast", ["error", "代码生成失败，请重试。"]);
      }

    } catch (error) {
      console.error("❌ 执行到步骤时发生错误:", error);
      // 恢复相关步骤状态为"confirmed"
      const targetStepIndex = steps.findIndex(step => step.id === stepId);
      if (targetStepIndex !== -1) {
        const unexecutedSteps = steps.slice(0, targetStepIndex + 1).filter(step => 
          step.stepStatus !== "generated"
        );
        for (const step of unexecutedSteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
        }
      }
      // 显示错误提示
      ideMessenger?.post("showToast", ["error", "代码生成过程中发生错误，请重试。"]);
    }
  }, [steps, ideMessenger, dispatch, isCodeEditModeEnabled]);

  // Handle rerun step when step is dirty
  const handleRerunStep = useCallback(async (stepId: string) => {
    // Disable in code edit mode
    if (isCodeEditModeEnabled) {
      console.warn("⚠️ Step rerun is disabled in code edit mode");
      return;
    }
    
    console.log(`重新运行步骤: ${stepId}`);
    
    try {
      // 找到对应的步骤
      const step = steps.find(s => s.id === stepId);
      if (!step) {
        console.error(`Step with id ${stepId} not found`);
        return;
      }

      // 只有在step_dirty状态下才允许重新运行
      if (step.stepStatus !== "step_dirty") {
        console.warn(`Step ${stepId} is not in step_dirty status, current status: ${step.stepStatus}`);
        return;
      }

      // 设置状态为generating
      dispatch(setStepStatus({ stepId, status: "generating" }));
      
      // 获取当前文件内容
      const currentFileResponse = await ideMessenger?.request("getCurrentFile", undefined);
      
      if (!currentFileResponse || currentFileResponse.status !== "success" || !currentFileResponse.content) {
        throw new Error("无法获取当前文件内容");
      }
      
      const currentFile = currentFileResponse.content;
      const filepath = currentFile.path;
      const existingCode = currentFile.contents;
      
      // 使用修改后的abstract作为新的步骤描述
      const changedStepAbstract = step.abstract;
      
      // 调用rerunStep thunk
      await dispatch(rerunStep({
        stepId,
        changedStepAbstract,
        existingCode,
        filepath
      })).unwrap();
      
      // 成功完成后设置状态为generated
      dispatch(setStepStatus({ stepId, status: "generated" }));
      
      console.log("✅ 步骤重新运行成功");
      ideMessenger?.post("showToast", ["info", "步骤重新运行成功！"]);
      
    } catch (error) {
      console.error("❌ 重新运行步骤时发生错误:", error);
      // 恢复状态
      dispatch(setStepStatus({ stepId, status: "step_dirty" }));
      ideMessenger?.post("showToast", ["error", "重新生成代码失败，请重试。"]);
    }
  }, [steps, dispatch, ideMessenger, isCodeEditModeEnabled]);

  const handleStepEdit = useCallback((stepId: string, newContent: string) => {
    // Disable in code edit mode
    if (isCodeEditModeEnabled) {
      console.warn("⚠️ Step editing is disabled in code edit mode");
      return;
    }
    
    // Update step abstract in Redux store
    dispatch(setStepAbstract({ stepId, abstract: newContent }));
  }, [dispatch, isCodeEditModeEnabled]);

  const handleStepStatusChange = useCallback((stepId: string, newStatus: StepStatus) => {
    // Update step status in Redux store
    dispatch(setStepStatus({ stepId, status: newStatus }));
  }, [dispatch]);

  const handleQuestionSubmit = useCallback((stepId: string, selectedText: string, question: string) => {
    console.log('处理步骤问题提交:', { stepId, selectedText, question });
    
    // 通过stepId查找对应的步骤信息
    const step = steps.find(s => s.id === stepId);
    if (!step) {
      console.error('未找到对应的步骤:', stepId);
      return;
    }

    // 获取现有的知识卡片主题（直接从step中获取）
    const existingThemes = step.knowledgeCards.map(kc => kc.title);

    // 获取学习目标和任务描述
    const taskDescription = task?.requirementDescription || '';

    // 调用新的 thunk 来生成知识卡片主题
    dispatch(generateKnowledgeCardThemesFromQuery({
      stepId,
      queryContext: {
        selectedCode: '', // 可以后续扩展从IDE获取选中的代码
        selectedText: selectedText || '',
        query: question
      },
      currentStep: {
        title: step.title,
        abstract: step.abstract
      },
      existingThemes,
      learningGoal: learningGoal || '',
      task: taskDescription
    }));

  }, [steps, learningGoal, task, dispatch]);

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
    console.log("Code chunks to highlight in IDE:", codeChunksToHighlightInIde);
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
                disabled: false,
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
      {/* CodeAware Header with Edit Mode Toggle */}
      <PageHeader
        title="CodeAware"
        rightContent={<CodeEditModeToggle />}
      />

      {/* Loading Overlay */}
      {(isGeneratingSteps || hasGeneratingSteps) && (
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
          disabled={isCodeEditModeEnabled} // Disable in code edit mode
        />
      ) : (
        <RequirementDisplay
          onEdit={handleEditRequirement}
          onRegenerate={handleRegenerateSteps}
          onChunkFocus={handleHighlightEvent} // Pass the highlight event handler
          onClearHighlight={removeHighlightEvent} // Pass the clear highlight function
          disabled={isCodeEditModeEnabled} // Disable in code edit mode
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
              stepStatus={step.stepStatus}
              knowledgeCardGenerationStatus={step.knowledgeCardGenerationStatus} // Pass knowledge card generation status
              onHighlightEvent={handleHighlightEvent}
              onClearHighlight={removeHighlightEvent} // Pass the clear highlight function
              onExecuteUntilStep={executeUntilStep} // Pass execute until step function
              onRerunStep={handleRerunStep} // Pass rerun step function
              onStepEdit={handleStepEdit} // Pass step edit function
              onStepStatusChange={handleStepStatusChange} // Pass step status change function
              onGenerateKnowledgeCardThemes={handleGenerateKnowledgeCardThemes} // Pass knowledge card themes generation function
              onDisableKnowledgeCard={handleDisableKnowledgeCard} // Pass knowledge card disable function
              onQuestionSubmit={handleQuestionSubmit} // Pass question submit function
              disabled={isCodeEditModeEnabled} // Disable in code edit mode
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
                  
                  // Disabled state
                  disabled: kc.disabled,
                  
                  // 事件处理函数
                  onMcqSubmit: (testId: string, isCorrect: boolean, selectedOption: string) => {
                    console.log(`MCQ Result for ${kc.title} (Test ${testId}): ${isCorrect ? 'Correct' : 'Incorrect'}, Selected: ${selectedOption}`);
                    // TODO: 实现 MCQ 提交逻辑，更新测试结果到 Redux store
                  },
                  
                  onSaqSubmit: (testId: string, answer: string) => {
                    console.log(`SAQ Answer for ${kc.title} (Test ${testId}): ${answer}`);
                    // TODO: 实现 SAQ 提交逻辑，更新测试结果到 Redux store
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
      {(isGeneratingSteps || hasGeneratingSteps) && (
        <LoadingOverlay>
          <SpinnerIcon />
        </LoadingOverlay>
      )}
    </CodeAwareDiv>
  );
};
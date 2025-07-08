import { createAsyncThunk } from "@reduxjs/toolkit";
import {
    CodeAwareMapping,
    CodeChunk,
    KnowledgeCardItem,
    ProgramRequirement,
    RequirementChunk,
    StepItem,
} from "core";
import {
    constructAnalyzeCompletionStepPrompt,
    constructGenerateKnowledgeCardDetailPrompt,
    constructGenerateStepsPrompt,
    constructParaphraseUserIntentPrompt
} from "core/llm/codeAwarePrompts";
import {
    createKnowledgeCard,
    selectCurrentStep,
    selectLearningGoal,
    selectNextStep,
    setCodeAwareTitle,
    setCurrentStepIndex,
    setGeneratedSteps,
    setKnowledgeCardError,
    setKnowledgeCardLoading,
    setLearningGoal,
    setPendingCompletion,
    setUserRequirementStatus,
    submitRequirementContent,
    updateCodeAwareMappings,
    updateHighlight,
    updateKnowledgeCardContent,
    updateRequirementChunks
} from "../slices/codeAwareSlice";
import { selectDefaultModel } from "../slices/configSlice";
import { ThunkApiType } from "../store";

//异步对用户需求和当前知识状态进行生成
export const paraphraseUserIntent = createAsyncThunk<
    void,
    {
        programRequirement: ProgramRequirement,
    },
    ThunkApiType
>(
    "codeAware/ParaphraseUserIntent", 
    async (
        { programRequirement}, 
        { dispatch, extra, getState })=> {
        try{
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }


            //send request
            const prompt = constructParaphraseUserIntentPrompt(programRequirement);

            console.log("paraphraseUserIntent called with programRequirement:", prompt);
            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions:{},
                title: defaultModel.title
            });

            if (result.status !== "success") {
                throw new Error("LLM request failed");
            }

            console.log("LLM response:", result.content);
            dispatch(submitRequirementContent(result.content));
            dispatch(setUserRequirementStatus("editing"));
        } catch(error) {
            console.error("Error during LLM request:", error);
            dispatch(setUserRequirementStatus("editing"));
            throw new Error("Failed to fetch LLM response");
            //CATODO: 这里应该有一个UI提示，告诉用户请求失败了
        }
    }
);

//在确认了requirement之后，llm来生成步骤list，需要将其parse成StepItem的列表
// 异步根据用户需求生成步骤
export const generateStepsFromRequirement = createAsyncThunk<
    void,
    {
        userRequirement: string; // 确认的用户需求文本
    },
    ThunkApiType
>(
    "codeAware/generateStepsFromRequirement",
    async (
        { userRequirement },
        { dispatch, extra, getState }
    ) => {
        try {
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            // call LLM to generate steps
            const prompt = constructGenerateStepsPrompt(userRequirement);

            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {}, // 根据需要配置
                title: defaultModel.title
            });

            // 提取信息，更新到Slice中
            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request to generate steps failed or returned empty content");
            }

            //要初始化设置的一些值，同时要更新的是userRequirement, 并且需要设置learning goal;
            let parsedSteps: StepItem[] = [];
            let requirementChunks: RequirementChunk[] = [];
            let initialMappings: CodeAwareMapping[] = [];
            let taskRequirements = "";
            let learningGoal = "";
            let title = "";
            
            // 解析 LLM 返回的 JSON 内容
            try {
                const jsonResponse = JSON.parse(result.content);
                console.log("LLM response JSON:", jsonResponse);
                title = jsonResponse.title || "";
                taskRequirements = jsonResponse.tasks || "";
                learningGoal = jsonResponse.learning_goal || "";
                const steps = jsonResponse.steps || [];
                for (const step of steps) {
                    const stepTitle = step.title || "";
                    const stepAbstract = step.abstract || "";
                    const tasksCorrespondingChunks = step.tasks_corresponding_chunks || [];
                    // 确保每个步骤都有标题和摘要
                    if (stepTitle && stepAbstract) {
                        parsedSteps.push({
                            id: "s-"+(parsedSteps.length+1), 
                            title: stepTitle,
                            abstract: stepAbstract,
                            knowledgeCards:[],
                            isHighlighted:false
                        });
                    } else {
                        console.warn("Step is missing title or abstract:", step);
                    }
                    for (const chunk of tasksCorrespondingChunks) {
                        requirementChunks.push({
                            id: "r-"+(requirementChunks.length+1),
                            content: chunk,
                            isHighlighted: false
                        });
                        initialMappings.push({
                            requirementChunkId: "r-"+(requirementChunks.length),
                            stepId: "s-"+(parsedSteps.length),
                            isHighlighted: false
                        });
                    }
                }
            } catch (error) {
                console.error("Error during LLM request for generating steps:", error);
                // 在抛出新错误之前，确保 error 是一个 Error 实例，以便保留原始堆栈跟踪
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to generate steps: ${errorMessage}`);
                // CATODO: UI提示，告知用户请求失败
            }
            console.log("userRequirement chunks:", requirementChunks);

            // 更新 Redux 状态
            dispatch(setCodeAwareTitle(title));
            dispatch(setLearningGoal(learningGoal));
            dispatch(setGeneratedSteps(parsedSteps));
            dispatch(updateRequirementChunks(requirementChunks));
            dispatch(updateCodeAwareMappings(initialMappings));
            dispatch(setUserRequirementStatus("finalized"));

            // CodeAware: 通过protocol同步requirement和步骤信息到IDE
            try {
                // 发送用户需求到IDE
                await extra.ideMessenger.request("syncCodeAwareRequirement", {
                    userRequirement: userRequirement
                });

                // 发送当前步骤和下一步骤信息到IDE
                const currentStep = ""; // 刚生成时还没有当前步骤
                const nextStep = parsedSteps.length > 0 ? parsedSteps[0].title : "";
                
                await extra.ideMessenger.request("syncCodeAwareSteps", {
                    currentStep: currentStep,
                    nextStep: nextStep
                });

                console.log("CodeAware: Successfully synced requirement and steps to IDE");
            } catch (error) {
                console.warn("CodeAware: Failed to sync context to IDE:", error);
                // 不影响主流程，只是记录警告
            }
        } catch (error) {
            console.error("Error during LLM request for generating steps:", error);
            dispatch(setUserRequirementStatus("editing"));
        }
    }  
);

//异步生成知识卡片具体内容
export const generateKnowledgeCardDetail = createAsyncThunk<
    void,
    {
        stepId: string;
        knowledgeCardId: string; 
        knowledgeCardTheme: string; // 知识卡片的主题
        learningGoal: string; // 学习目标
        codeContext: string; // 代码上下文
    },
    ThunkApiType
>(
    "codeAware/GenerateKnowledgeCardDetail", 
    async (
        { stepId, knowledgeCardId, knowledgeCardTheme, learningGoal, codeContext }, 
        { dispatch, extra, getState })=> {
        try{
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            // 设置加载状态
            dispatch(setKnowledgeCardLoading({ stepId, cardId: knowledgeCardId, isLoading: true }));

            // 构造提示词并发送请求
            const prompt = constructGenerateKnowledgeCardDetailPrompt(knowledgeCardTheme, learningGoal, codeContext);

            console.log("generateKnowledgeCardDetail called with:", {
                stepId,
                knowledgeCardId,
                knowledgeCardTheme,
                learningGoal,
                codeContext: codeContext.substring(0, 100) + "..." // 只打印前100个字符
            });

            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {},
                title: defaultModel.title
            });

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request failed or returned empty content");
            }

            console.log("LLM response for knowledge card:", result.content);

            // 解析 LLM 返回的 JSON 内容
            try {
                const jsonResponse = JSON.parse(result.content);
                const content = jsonResponse.content || "";
                const testsFromLLM = jsonResponse.tests || [];

                // 为tests添加ID，编号方式为知识卡片ID + "-t-" + 递增编号
                const tests = testsFromLLM.map((test: any, index: number) => ({
                    ...test,
                    id: `${knowledgeCardId}-t-${index + 1}`
                }));

                // 更新知识卡片内容
                dispatch(updateKnowledgeCardContent({
                    stepId,
                    cardId: knowledgeCardId,
                    content,
                    tests
                }));

                console.log("Knowledge card content updated successfully");
            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                dispatch(setKnowledgeCardError({
                    stepId,
                    cardId: knowledgeCardId,
                    error: "解析LLM响应失败"
                }));
            }
        } catch(error) {
            console.error("Error during knowledge card generation:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            dispatch(setKnowledgeCardError({
                stepId,
                cardId: knowledgeCardId,
                error: errorMessage
            }));
        }
    }
);

//异步分析代码补全并决定是否进入下一步骤
export const analyzeCompletionAndUpdateStep = createAsyncThunk<
    void,
    {
        prefixCode: string;
        completionText: string;
        range: [number, number];
        filePath: string;
    },
    ThunkApiType
>(
    "codeAware/analyzeCompletionAndUpdateStep",
    async (
        { prefixCode, completionText, range, filePath },
        { dispatch, extra, getState }
    ) => {
        console.log("🔄 [CodeAware Thunk] analyzeCompletionAndUpdateStep started:", {
            timestamp: new Date().toISOString(),
            prefixLength: prefixCode.length,
            completionLength: completionText.length,
            range,
            fileName: filePath.split('/').pop()
        });
        
        try {
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            const currentStep = selectCurrentStep(state);
            const nextStep = selectNextStep(state);
            const learningGoal = selectLearningGoal(state);

            console.log("📊 [CodeAware Thunk] Current state:", {
                hasDefaultModel: !!defaultModel,
                hasCurrentStep: !!currentStep,
                hasNextStep: !!nextStep,
                currentStepTitle: currentStep?.title,
                nextStepTitle: nextStep?.title,
                learningGoal: learningGoal.substring(0, 50) + (learningGoal.length > 50 ? "..." : "")
            });

            if (!defaultModel) {
                console.error("❌ [CodeAware Thunk] Default model not defined");
                throw new Error("Default model not defined");
            }

            // 如果没有当前步骤和下一步骤，直接返回
            if (!currentStep || !nextStep) {
                console.log("⚠️ [CodeAware Thunk] No current or next step available, skipping analysis");
                return;
            }

            // 构造并发送LLM请求
            const prompt = constructAnalyzeCompletionStepPrompt(
                prefixCode,
                completionText,
                currentStep.title,
                nextStep.title,
                learningGoal
            );

            console.log("analyzeCompletionAndUpdateStep called with prompt:", prompt);

            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {},
                title: defaultModel.title
            });

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request failed or returned empty content");
            }

            // 解析LLM响应
            try {
                const jsonResponse = JSON.parse(result.content);
                const toNextStep = jsonResponse.to_next_step || false;
                const knowledgeCardThemes = jsonResponse.knowledge_card_themes || [];

                console.log("LLM response for completion analysis:", {
                    toNextStep,
                    knowledgeCardThemes,
                    currentStep: currentStep.title,
                    nextStep: nextStep.title
                });

                // 创建临时代码块
                const tempCodeChunk: CodeChunk = {
                    id: `c-${state.codeAwareSession.codeChunks.length + 1}`,
                    content: completionText,
                    range: range,
                    isHighlighted: false,
                    filePath: filePath
                };

                // 创建临时知识卡片
                const tempKnowledgeCards: KnowledgeCardItem[] = [];
                const tempMappings: CodeAwareMapping[] = [];

                // 确定当前生效的步骤
                const effectiveStep = toNextStep ? nextStep : currentStep;

                for (let i = 0; i < knowledgeCardThemes.length; i++) {
                    const theme = knowledgeCardThemes[i];
                    const cardId = `${effectiveStep.id}-k-${effectiveStep.knowledgeCards.length + i + 1}`;

                    // 创建临时知识卡片
                    const tempCard: KnowledgeCardItem = {
                        id: cardId,
                        title: theme,
                        content: "",
                        tests: [],
                        isHighlighted: true // 临时状态时高亮显示
                    };
                    tempKnowledgeCards.push(tempCard);

                    // 创建临时mapping关系
                    // 需要找到相关的requirement chunk
                    const relatedRequirementChunks = state.codeAwareSession.codeAwareMappings
                        .filter((mapping: CodeAwareMapping) => mapping.stepId === effectiveStep.id)
                        .map((mapping: CodeAwareMapping) => mapping.requirementChunkId)
                        .filter((id: string | undefined) => id);

                    // 为每个相关的requirement chunk创建mapping
                    for (const reqChunkId of relatedRequirementChunks) {
                        tempMappings.push({
                            codeChunkId: tempCodeChunk.id,
                            requirementChunkId: reqChunkId,
                            stepId: effectiveStep.id,
                            knowledgeCardId: cardId,
                            isHighlighted: true // 临时状态时高亮显示
                        });
                    }

                    // 如果没有相关的requirement chunk，至少创建code-step-card的mapping
                    if (relatedRequirementChunks.length === 0) {
                        tempMappings.push({
                            codeChunkId: tempCodeChunk.id,
                            stepId: effectiveStep.id,
                            knowledgeCardId: cardId,
                            isHighlighted: true // 临时状态时高亮显示
                        });
                    }
                }

                // 设置待确认的补全信息
                dispatch(setPendingCompletion({
                    prefixCode,
                    completionText,
                    range,
                    filePath,
                    toNextStep,
                    originalStepIndex: state.codeAwareSession.currentStepIndex,
                    knowledgeCardThemes,
                    tempCodeChunk,
                    tempKnowledgeCards,
                    tempMappings
                }));

                // 如果需要进入下一步骤，更新步骤索引并高亮
                if (toNextStep) {
                    dispatch(setCurrentStepIndex(state.codeAwareSession.currentStepIndex + 1));
                    
                    // 高亮下一步骤
                    dispatch(updateHighlight({
                        sourceType: "step",
                        identifier: nextStep.id
                    }));
                } else {
                    // 高亮当前步骤
                    dispatch(updateHighlight({
                        sourceType: "step",
                        identifier: currentStep.id
                    }));
                }

                // 将临时知识卡片添加到对应步骤中用于显示
                for (const tempCard of tempKnowledgeCards) {
                    dispatch(createKnowledgeCard({
                        stepId: effectiveStep.id,
                        cardId: tempCard.id,
                        theme: tempCard.title
                    }));
                }

                console.log("CodeAware: Successfully analyzed completion and set pending state", {
                    toNextStep,
                    knowledgeCardThemes,
                    effectiveStep: effectiveStep.title
                });

            } catch (parseError) {
                console.error("Error parsing LLM response for completion analysis:", parseError);
            }

        } catch (error) {
            console.error("Error during completion analysis:", error);
        }
    }
);
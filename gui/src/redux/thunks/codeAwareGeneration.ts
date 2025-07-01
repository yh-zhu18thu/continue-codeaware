import { createAsyncThunk } from "@reduxjs/toolkit";
import {
    CodeAwareMapping,
    ProgramRequirement,
    RequirementChunk,
    StepItem,
} from "core";
import {
    constructGenerateStepsPrompt,
    constructParaphraseUserIntentPrompt
} from "core/llm/codeAwarePrompts";
import {
    setCodeAwareTitle,
    setGeneratedSteps,
    setLearningGoal,
    setUserRequirementStatus,
    submitRequirementContent,
    updateCodeAwareMappings,
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
            // 更新 Redux 状态
            dispatch(submitRequirementContent(userRequirement));
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
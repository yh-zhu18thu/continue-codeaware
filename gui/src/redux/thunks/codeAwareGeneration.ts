import { createAsyncThunk } from "@reduxjs/toolkit";
import {
    ProgramRequirement,
    StepItem
} from "core";
import {
    constructGenerateStepsPrompt,
    constructParaphraseUserIntentPrompt
} from "core/llm/codeAwarePrompts";
import {
    setGeneratedSteps,
    submitRequirementContent
} from "../slices/codeAwareSlice";
import { selectDefaultModel } from "../slices/configSlice";
import { ThunkApiType } from "../store";
import { getTestStepsData } from "./codeAwareTestData";

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
        } catch(error) {
            console.error("Error during LLM request:", error);
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

            // 1. 构建提示
            // 注意: 您需要在 'core/llm/codeAwarePrompts.ts' 中创建 constructGenerateStepsPrompt 函数
            const prompt = constructGenerateStepsPrompt(userRequirement);

            // 2. 发送请求到 LLM, TODO: 等到 接入prompt了再去测试
            /*
            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {}, // 根据需要配置
                title: defaultModel.title
            });*/
            
            // mockup a response for testing
            // ...existing code...
            const result = getTestStepsData();

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request to generate steps failed or returned empty content");
            }

            console.log("LLM response (generated steps JSON):", result.content);

            // 3. 解析 JSON 响应
            let parsedSteps: StepItem[];
            // 确保 LLM 返回的内容是有效的 JSON 格式
            try {
                const rawParsed = JSON.parse(result.content);
                if (Array.isArray(rawParsed) &&
                    rawParsed.every(item => 
                        item && typeof item === 'object' && 
                        'id' in item && 'title' in item && 'abstract' in item && 
                        'correspondingRequirementChunkIds' in item && 
                        'knowledgeCards' in item)) {
                    parsedSteps = rawParsed as StepItem[];
                } else {
                    throw new Error("Parsed steps are not in the expected format");
                }
            } catch (parseError) {
                console.error("Error parsing JSON steps from LLM:", parseError);
                throw new Error("Failed to parse steps from LLM response. Expected JSON format.");
            }
            // 4. 分发 action 以存储步骤
            dispatch(setGeneratedSteps(parsedSteps));
            //CATODO: 这里在有正式的prompts之前，先调用CodeAwareSlice中的设置highlights的函数手动设置


        } catch (error) {
            console.error("Error during LLM request for generating steps:", error);
            // 在抛出新错误之前，确保 error 是一个 Error 实例，以便保留原始堆栈跟踪
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate steps: ${errorMessage}`);
            // CATODO: UI提示，告知用户请求失败
        }
    }
);


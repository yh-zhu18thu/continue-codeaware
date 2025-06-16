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
            const result = {
                status: "success",
                content: JSON.stringify([
                    {
                        id: "s-1",
                        title: "数据加载",
                        abstract: "+ 读取原始数据文件。\n + 打印数据，查看数据结构。",
                        correspondingRequirementChunkIds: [],
                        knowledgeCards: [],
                        isHighlighted: false,
                    },
                    {
                        id: "s-2", 
                        title: "数据预处理",
                        abstract: "+ 读取原始数据文件。\n + 打印数据，查看数据结构。",
                        isHighlighted: false,
                        knowledgeCards: [],
                    },
                    {
                        id: "s-3",
                        title: "文本特征提取", 
                        abstract: "**理解为何需要把文本变成数值供机器理解** \n + 创建TF-IDF向量化转化器 \n  + 将所有邮件文本转化成向量 ",
                        isHighlighted: false,
                        knowledgeCards: [
                            {
                                id: "k-1",
                                title: "vectorizer批量处理数据的原理",
                                content: "### 批量扫描构建词汇表 \n Vectorizer会先遍历所有输入文本，统一统计出现的所有词汇，建立一个全局的词汇表（词典）。这样，不管输入多少条文本，词汇表是固定的，后续转换都基于这份词汇表统一进行。\n ### 统一转换规则 \n  所有文本都使用同一套规则（分词、去停用词、词形还原等），避免重复计算，提升效率。",
                                tests: [
                                    {
                                        id: "t-1",
                                        question: {
                                            type: "shortAnswer",
                                            stem: "为什么Vectorizer可以并行地将大量文本转化为向量？",
                                            standard_answer: "批量处理基于统一词汇表且利用稀疏矩阵实现高效存储。",
                                            answer: "",
                                            remarks: "",
                                            result: "unanswered"
                                        },
                                        questionType: "shortAnswer"
                                    },
                                    {
                                        id: "t-2",
                                        question: {
                                            type: "shortAnswer",
                                            stem: "Vectorizer如何处理新文本？",
                                            standard_answer: "新文本使用已有词汇表进行向量化，确保一致性。",
                                            answer: "",
                                            remarks: "",
                                            result: "unanswered"
                                        },
                                        questionType: "shortAnswer"
                                    }
                                ],
                            },
                            {
                                id: "k-2",
                                title: "性能评估指标",
                                content: "准确率、精确率、召回率和F1分数是常用的分类模型评估指标。",
                                tests: [],
                            }
                        ],

                    }
                ])
            };

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


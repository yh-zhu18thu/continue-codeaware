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
                        id: "step-1",
                        title: "数据预处理和特征提取",
                        abstract: "清理邮件文本数据，去除HTML标签和特殊字符，提取TF-IDF特征向量用于SVM模型训练",
                        correspondingRequirementChunkIds: [],
                        knowledgeCards: [
                            {
                                id: "kc-1",
                                title: "TF-IDF特征提取",
                                content: "TF-IDF是一种用于文本数据的特征提取方法，可以衡量词语的重要性。",
                                selfTests: [
                                    {
                                        id: "st-1",
                                        question: {
                                            type: "shortAnswer",
                                            stem: "什么是TF-IDF？",
                                            answer: "",
                                            result: "unanswered"
                                        },
                                        questionType: "shortAnswer"
                                    }
                                ],
                                codeMappings: []
                            }
                        ],
                        codeMappings: []
                    },
                    {
                        id: "step-2", 
                        title: "训练集准备和标签编码",
                        abstract: "将邮件数据集划分为训练集和测试集，对垃圾邮件和正常邮件进行标签编码",
                        correspondingRequirementChunkIds: [],
                        knowledgeCards: [
                            {
                                id: "kc-2",
                                title: "标签编码",
                                content: "标签编码是将分类标签转换为数值的过程，便于机器学习模型处理。",
                                selfTests: [
                                    {
                                        id: "st-2",
                                        question: {
                                            type: "shortAnswer",
                                            stem: "为什么需要标签编码？",
                                            answer: "",
                                            result: "unanswered"
                                        },
                                        questionType: "shortAnswer"
                                    }
                                ],
                                codeMappings: []
                            }
                        ],
                        codeMappings: []
                    },
                    {
                        id: "step-3",
                        title: "SVM模型训练和参数调优", 
                        abstract: "使用线性核函数训练SVM分类器，通过交叉验证调整C参数获得最佳性能",
                        correspondingRequirementChunkIds: [],
                        knowledgeCards: [
                            {
                                id: "kc-3",
                                title: "SVM参数调优",
                                content: "通过调整SVM的C参数，可以控制模型的复杂度和泛化能力。",
                                selfTests: [
                                    {
                                        id: "st-3",
                                        question: {
                                            type: "shortAnswer",
                                            stem: "如何通过交叉验证调整SVM的参数？",
                                            answer: "",
                                            result: "unanswered"
                                        },
                                        questionType: "shortAnswer"
                                    }
                                ],
                                codeMappings: []
                            }
                        ],
                        codeMappings: []
                    },
                    {
                        id: "step-4",
                        title: "模型评估和性能分析",
                        abstract: "在测试集上评估SVM模型的准确率、精确率、召回率和F1分数",
                        correspondingRequirementChunkIds: [],
                        knowledgeCards: [
                            {
                                id: "kc-4",
                                title: "性能评估指标",
                                content: "准确率、精确率、召回率和F1分数是常用的分类模型评估指标。",
                                selfTests: [
                                    {
                                        id: "st-4",
                                        question: {
                                            type: "shortAnswer",
                                            stem: "F1分数的计算公式是什么？",
                                            answer: "",
                                            result: "unanswered"
                                        },
                                        questionType: "shortAnswer"
                                    }
                                ],
                                codeMappings: []
                            }
                        ],
                        codeMappings: []
                    },
                    {
                        id: "step-5",
                        title: "部署和实时预测",
                        abstract: "将训练好的SVM模型封装为API接口，实现新邮件的实时垃圾邮件检测",
                        correspondingRequirementChunkIds: [],
                        knowledgeCards: [
                            {
                                id: "kc-5",
                                title: "模型部署",
                                content: "模型部署是将训练好的模型集成到生产环境中以提供服务的过程。",
                                selfTests: [
                                    {
                                        id: "st-5",
                                        question: {
                                            type: "shortAnswer",
                                            stem: "部署机器学习模型的主要步骤是什么？",
                                            answer: "",
                                            result: "unanswered"
                                        },
                                        questionType: "shortAnswer"
                                    }
                                ],
                                codeMappings: []
                            }
                        ],
                        codeMappings: []
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
                        'knowledgeCards' in item && 'codeMappings' in item)) {
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

        } catch (error) {
            console.error("Error during LLM request for generating steps:", error);
            // 在抛出新错误之前，确保 error 是一个 Error 实例，以便保留原始堆栈跟踪
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate steps: ${errorMessage}`);
            // CATODO: UI提示，告知用户请求失败
        }
    }
);


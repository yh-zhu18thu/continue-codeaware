import { createAsyncThunk } from "@reduxjs/toolkit";
import {
    CodeAwareMapping,
    CodeChunk,
    ProgramRequirement,
    RequirementChunk,
    StepItem
} from "core";
import {
    constructGenerateCodeFromStepsPrompt,
    constructGenerateKnowledgeCardDetailPrompt,
    constructGenerateKnowledgeCardThemesFromQueryPrompt,
    constructGenerateKnowledgeCardThemesPrompt,
    constructGenerateStepsPrompt,
    constructParaphraseUserIntentPrompt
} from "core/llm/codeAwarePrompts";
import {
    createCodeAwareMapping,
    createKnowledgeCard,
    setCodeAwareTitle,
    setGeneratedSteps,
    setKnowledgeCardError,
    setKnowledgeCardGenerationStatus,
    setKnowledgeCardLoading,
    setLearningGoal,
    setStepStatus,
    setUserRequirementStatus,
    submitRequirementContent,
    updateCodeAwareMappings,
    updateCodeChunks,
    updateKnowledgeCardContent,
    updateRequirementChunks
} from "../slices/codeAwareSlice";
import { selectDefaultModel } from "../slices/configSlice";
import { ThunkApiType } from "../store";

// 辅助函数：清理markdown格式的文本，去掉换行符等特殊字符
function cleanMarkdownText(text: string): string {
    return text
        .replace(/\n/g, ' ')           // 替换换行符为空格
        .replace(/\r/g, ' ')           // 替换回车符为空格
        .replace(/\t/g, ' ')           // 替换制表符为空格
        .replace(/\s+/g, ' ')          // 将多个连续空格替换为单个空格
        .replace(/\*\*(.*?)\*\*/g, '$1')  // 去掉粗体标记 **text**
        .replace(/\*(.*?)\*/g, '$1')      // 去掉斜体标记 *text*
        .replace(/`(.*?)`/g, '$1')        // 去掉行内代码标记 `code`
        .replace(/#{1,6}\s*/g, '')        // 去掉标题标记 # ## ### 等
        .replace(/>\s*/g, '')             // 去掉引用标记 >
        .replace(/[-*+]\s*/g, '')         // 去掉列表标记 - * +
        .replace(/\d+\.\s*/g, '')         // 去掉有序列表标记 1. 2. 等
        .trim();                          // 去掉首尾空白
}

// 辅助函数：计算代码块在完整代码中的行号范围
function calculateCodeChunkRange(fullCode: string, chunkCode: string): [number, number] {
    const fullCodeLines = fullCode.split('\n');
    const chunkLines = chunkCode.split('\n');
    
    // 如果代码块只有一行
    if (chunkLines.length === 1) {
        const chunkLine = chunkLines[0].trim();
        for (let i = 0; i < fullCodeLines.length; i++) {
            if (fullCodeLines[i].trim() === chunkLine) {
                return [i + 1, i + 1]; // 转换为1基索引
            }
        }
    }
    
    // 如果代码块有多行，尝试找到连续匹配的行
    const firstChunkLine = chunkLines[0].trim();
    const lastChunkLine = chunkLines[chunkLines.length - 1].trim();
    
    for (let i = 0; i <= fullCodeLines.length - chunkLines.length; i++) {
        if (fullCodeLines[i].trim() === firstChunkLine) {
            // 检查是否所有行都匹配
            let allMatch = true;
            for (let j = 0; j < chunkLines.length; j++) {
                if (fullCodeLines[i + j].trim() !== chunkLines[j].trim()) {
                    allMatch = false;
                    break;
                }
            }
            
            if (allMatch) {
                return [i + 1, i + chunkLines.length]; // 转换为1基索引
            }
        }
    }
    
    // 如果无法精确匹配，尝试部分匹配
    for (let i = 0; i < fullCodeLines.length; i++) {
        if (fullCodeLines[i].includes(firstChunkLine) || firstChunkLine.includes(fullCodeLines[i].trim())) {
            // 找到可能的开始位置，估算结束位置
            const estimatedEnd = Math.min(i + chunkLines.length, fullCodeLines.length);
            return [i + 1, estimatedEnd]; // 转换为1基索引
        }
    }
    
    // 如果都无法匹配，返回默认范围
    console.warn("无法为代码块计算精确的行号范围，使用默认范围");
    return [1, Math.min(chunkLines.length, fullCodeLines.length)];
}

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
                            isHighlighted:false,
                            stepStatus: "confirmed", // 默认状态为 confirmed
                            knowledgeCardGenerationStatus: "empty", // 初始状态为 empty
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
            dispatch(submitRequirementContent(userRequirement)); // 重新设置用户需求内容，因为newCodeAwareSession清空了状态
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
                const currentStep = parsedSteps.length > 0 ? 
                    `${parsedSteps[0].title}: ${cleanMarkdownText(parsedSteps[0].abstract)}` : ""; // 第一步作为当前步骤
                const nextStep = parsedSteps.length > 1 ? 
                    `${parsedSteps[1].title}: ${cleanMarkdownText(parsedSteps[1].abstract)}` : ""; // 第二步作为下一步骤
                
                await extra.ideMessenger.request("syncCodeAwareSteps", {
                    currentStep: currentStep,
                    nextStep: nextStep,
                    stepFinished: false // 刚生成时步骤还没有完成
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

// 异步生成知识卡片主题列表
export const generateKnowledgeCardThemes = createAsyncThunk<
    void,
    {
        stepId: string;
        stepTitle: string;
        stepAbstract: string;
        learningGoal: string;
    },
    ThunkApiType
>(
    "codeAware/generateKnowledgeCardThemes",
    async (
        { stepId, stepTitle, stepAbstract, learningGoal },
        { dispatch, extra, getState }
    ) => {
        try {
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            // 设置生成状态
            dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "generating" }));

            // 获取任务描述
            const taskDescription = state.codeAwareSession.userRequirement?.requirementDescription || "";

            // 构造提示词并发送请求
            const prompt = constructGenerateKnowledgeCardThemesPrompt(
                taskDescription,
                { title: stepTitle, abstract: stepAbstract },
                learningGoal
            );

            console.log("generateKnowledgeCardThemes called with:", {
                stepId,
                stepTitle,
                stepAbstract,
                learningGoal
            });

            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {},
                title: defaultModel.title
            });

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request failed or returned empty content");
            }

            console.log("LLM response for knowledge card themes:", result.content);

            // 解析 LLM 返回的 JSON 内容
            try {
                const themes = JSON.parse(result.content);
                
                if (Array.isArray(themes) && themes.length > 0) {
                    // 获取当前步骤相关的现有映射
                    const state = getState();
                    const existingMappings = state.codeAwareSession.codeAwareMappings.filter(
                        mapping => mapping.stepId === stepId
                    );
                    
                    // 为每个主题创建知识卡片
                    themes.forEach((theme: string, index: number) => {
                        const cardId = `${stepId}-kc-${index + 1}`;
                        
                        // 创建知识卡片
                        dispatch(createKnowledgeCard({
                            stepId,
                            cardId,
                            theme
                        }));

                        // 为每个现有映射创建包含新知识卡片的映射关系
                        if (existingMappings.length > 0) {
                            existingMappings.forEach(existingMapping => {
                                dispatch(createCodeAwareMapping({
                                    codeChunkId: existingMapping.codeChunkId,
                                    requirementChunkId: existingMapping.requirementChunkId,
                                    stepId,
                                    knowledgeCardId: cardId,
                                    isHighlighted: false
                                }));
                            });
                        } else {
                            // 如果没有现有映射，创建基础映射关系
                            dispatch(createCodeAwareMapping({
                                stepId,
                                knowledgeCardId: cardId,
                                isHighlighted: false
                            }));
                        }
                    });

                    // 设置生成完成状态
                    dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "checked" }));
                    
                    console.log(`Generated ${themes.length} knowledge card themes for step ${stepId}`);
                } else {
                    console.warn("No valid themes returned from LLM");
                    dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "checked" }));
                }
                
            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
                throw new Error("解析LLM响应失败");
            }

        } catch (error) {
            console.error("Error during knowledge card themes generation:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
            // 可以在这里添加错误提示给用户
        }
    }
);

// 异步根据用户问题生成相关的知识卡片主题
export const generateKnowledgeCardThemesFromQuery = createAsyncThunk<
    void,
    {
        stepId: string;
        queryContext: {
            selectedCode: string;
            selectedText: string;
            query: string;
        };
        currentStep: {
            title: string;
            abstract: string;
        };
        existingThemes: string[];
        learningGoal: string;
        task: string;
    },
    ThunkApiType
>(
    "codeAware/generateKnowledgeCardThemesFromQuery",
    async (
        { stepId, queryContext, currentStep, existingThemes, learningGoal, task },
        { dispatch, extra, getState }
    ) => {
        try {
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            // 设置生成状态
            dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "generating" }));

            // 构造提示词并发送请求
            const prompt = constructGenerateKnowledgeCardThemesFromQueryPrompt(
                queryContext,
                currentStep,
                existingThemes,
                learningGoal,
                task
            );

            console.log("generateKnowledgeCardThemesFromQuery called with:", {
                stepId,
                queryContext,
                currentStep,
                existingThemes,
                learningGoal,
                task
            });

            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {},
                title: defaultModel.title
            });

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request failed or returned empty content");
            }

            console.log("LLM response for knowledge card themes from query:", result.content);

            // 解析 LLM 返回的 JSON 内容
            try {
                const themes = JSON.parse(result.content);
                
                if (Array.isArray(themes) && themes.length > 0) {
                    // 获取当前步骤相关的现有映射
                    const currentState = getState();
                    const existingMappings = currentState.codeAwareSession.codeAwareMappings.filter(
                        mapping => mapping.stepId === stepId
                    );
                    
                    // 为每个新主题创建知识卡片
                    const stepIndex = state.codeAwareSession.steps.findIndex(step => step.id === stepId);
                    if (stepIndex !== -1) {
                        const existingCardCount = state.codeAwareSession.steps[stepIndex].knowledgeCards.length;
                        
                        themes.forEach((theme: string, index: number) => {
                            const cardId = `${stepId}-kc-${existingCardCount + index + 1}`;
                            
                            // 创建新的知识卡片
                            dispatch(createKnowledgeCard({
                                stepId,
                                cardId,
                                theme
                            }));
                            
                            // 为每个现有映射创建包含新知识卡片的映射关系
                            if (existingMappings.length > 0) {
                                existingMappings.forEach(existingMapping => {
                                    dispatch(createCodeAwareMapping({
                                        codeChunkId: existingMapping.codeChunkId,
                                        requirementChunkId: existingMapping.requirementChunkId,
                                        stepId,
                                        knowledgeCardId: cardId,
                                        isHighlighted: false
                                    }));
                                });
                            } else {
                                // 如果没有现有映射，创建基础映射关系
                                dispatch(createCodeAwareMapping({
                                    stepId,
                                    knowledgeCardId: cardId,
                                    isHighlighted: false
                                }));
                            }
                        });
                    }

                    // 设置生成完成状态
                    dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "checked" }));
                    
                    console.log(`Generated ${themes.length} knowledge card themes from query for step ${stepId}`);
                } else {
                    console.warn("No valid themes returned from LLM");
                    dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "checked" }));
                }
                
            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
                throw new Error("解析LLM响应失败");
            }

        } catch (error) {
            console.error("Error during knowledge card themes generation from query:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
            // 可以在这里添加错误提示给用户
        }
    }
);

// 异步根据现有代码和步骤生成新代码
export const generateCodeFromSteps = createAsyncThunk<
    {
        changedCode: string;
        newCodeChunks: Array<{
            code: string;
            corresponding_steps: string[];
            corresponding_knowledge_cards: string[];
        }>;
    },
    {
        existingCode: string;
        filepath: string;
        orderedSteps: Array<{
            id: string;
            title: string;
            abstract: string;
            knowledge_cards: Array<{
                id: string;
                title: string;
            }>;
        }>;
    },
    ThunkApiType
>(
    "codeAware/generateCodeFromSteps",
    async (
        { existingCode, filepath, orderedSteps },
        { dispatch, extra, getState }
    ) => {
        try {
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            console.log("generateCodeFromSteps called with:", {
                existingCodeLength: existingCode.length,
                filepath: filepath,
                stepsCount: orderedSteps.length,
                steps: orderedSteps.map(s => ({ id: s.id, title: s.title }))
            });

            // 构造提示词并发送请求
            const prompt = constructGenerateCodeFromStepsPrompt(existingCode, orderedSteps);

            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {},
                title: defaultModel.title
            });

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request failed or returned empty content");
            }

            console.log("LLM response for code generation:", result.content);

            // 解析 LLM 返回的 JSON 内容
            try {
                const jsonResponse = JSON.parse(result.content);
                const changedCode = jsonResponse.changed_code || "";
                const newCodeChunks = jsonResponse.new_code_chunks || [];

                console.log("✅ 代码生成成功:", {
                    changedCodeLength: changedCode.length,
                    newChunksCount: newCodeChunks.length,
                    chunks: newCodeChunks.map((chunk: any) => ({
                        codeLength: chunk.code?.length || 0,
                        correspondingSteps: chunk.corresponding_steps || [],
                        correspondingKnowledgeCards: chunk.corresponding_knowledge_cards || []
                    }))
                });

                // 打印生成的内容供调试
                console.log("📝 完整生成代码:");
                console.log(changedCode);
                
                console.log("🧩 新代码块详情:");
                newCodeChunks.forEach((chunk: any, index: number) => {
                    console.log(`--- 代码块 ${index + 1} ---`);
                    console.log("代码:", chunk.code);
                    console.log("对应步骤:", chunk.corresponding_steps);
                    console.log("对应知识卡片:", chunk.corresponding_knowledge_cards);
                });

                // 创建新的代码块和映射关系
                const createdCodeChunks: CodeChunk[] = [];
                const createdMappings: CodeAwareMapping[] = [];
                
                // 获取当前状态中的代码块数量，用于生成新的ID
                const currentState = getState();
                const existingCodeChunksCount = currentState.codeAwareSession.codeChunks.length;
                
                // 为每个新代码块创建 CodeChunk 对象
                newCodeChunks.forEach((chunk: any, index: number) => {
                    if (!chunk.code || chunk.code.trim() === '') {
                        console.warn(`代码块 ${index + 1} 为空，跳过创建`);
                        return;
                    }
                    
                    // 计算代码块的行号范围
                    const range = calculateCodeChunkRange(changedCode, chunk.code);
                    
                    // 创建新的 CodeChunk
                    const codeChunkId = `c-${existingCodeChunksCount + index + 1}`;
                    const newCodeChunk: CodeChunk = {
                        id: codeChunkId,
                        content: chunk.code.trim(),
                        range: range,
                        isHighlighted: false,
                        filePath: filepath // 使用传入的文件路径
                    };
                    
                    createdCodeChunks.push(newCodeChunk);
                    
                    console.log(`✅ 创建代码块 ${codeChunkId}:`, {
                        contentLength: newCodeChunk.content.length,
                        range: newCodeChunk.range
                    });
                    
                    // 获取现有的所有映射关系
                    const existingMappings = currentState.codeAwareSession.codeAwareMappings;
                    
                    // 优先处理知识卡片映射关系
                    if (chunk.corresponding_knowledge_cards && Array.isArray(chunk.corresponding_knowledge_cards)) {
                        chunk.corresponding_knowledge_cards.forEach((knowledgeCardId: string) => {
                            // 1. 首先查找包含该知识卡片ID的完整映射（包含step、requirement chunk、knowledge card id）
                            const existingKnowledgeCardMapping = existingMappings.find(mapping => 
                                mapping.knowledgeCardId === knowledgeCardId &&
                                mapping.stepId &&
                                mapping.requirementChunkId
                            );
                            
                            if (existingKnowledgeCardMapping) {
                                // 基于已有的完整映射创建新映射，添加code chunk id
                                const mapping: CodeAwareMapping = {
                                    codeChunkId: codeChunkId,
                                    stepId: existingKnowledgeCardMapping.stepId,
                                    requirementChunkId: existingKnowledgeCardMapping.requirementChunkId,
                                    knowledgeCardId: knowledgeCardId,
                                    isHighlighted: false
                                };
                                createdMappings.push(mapping);
                                
                                console.log(`🔗 基于已有知识卡片映射创建: ${codeChunkId} -> ${knowledgeCardId} (步骤: ${existingKnowledgeCardMapping.stepId}, 需求块: ${existingKnowledgeCardMapping.requirementChunkId})`);
                            } else {
                                // 2. 如果找不到知识卡片的完整映射，查找对应步骤的映射
                                let stepBasedMapping = null;
                                
                                // 从对应的步骤中查找
                                if (chunk.corresponding_steps && chunk.corresponding_steps.length > 0) {
                                    const correspondingStepId = chunk.corresponding_steps[0];
                                    stepBasedMapping = existingMappings.find(mapping => 
                                        mapping.stepId === correspondingStepId &&
                                        mapping.requirementChunkId // 确保有requirement chunk信息
                                    );
                                }
                                
                                if (stepBasedMapping) {
                                    // 基于步骤映射创建新映射，添加knowledge card id和code chunk id
                                    const mapping: CodeAwareMapping = {
                                        codeChunkId: codeChunkId,
                                        stepId: stepBasedMapping.stepId,
                                        requirementChunkId: stepBasedMapping.requirementChunkId,
                                        knowledgeCardId: knowledgeCardId,
                                        isHighlighted: false
                                    };
                                    createdMappings.push(mapping);
                                    
                                    console.log(`🔗 基于已有步骤映射创建: ${codeChunkId} -> ${knowledgeCardId} (步骤: ${stepBasedMapping.stepId}, 需求块: ${stepBasedMapping.requirementChunkId})`);
                                } else {
                                    // 3. 如果都找不到，创建最基本的映射
                                    const correspondingStepId = chunk.corresponding_steps?.[0] || null;
                                    const mapping: CodeAwareMapping = {
                                        codeChunkId: codeChunkId,
                                        stepId: correspondingStepId,
                                        knowledgeCardId: knowledgeCardId,
                                        isHighlighted: false
                                    };
                                    createdMappings.push(mapping);
                                    
                                    console.log(`🔗 创建基本知识卡片映射: ${codeChunkId} -> ${knowledgeCardId} (步骤: ${correspondingStepId})`);
                                }
                            }
                        });
                    }
                    
                    // 处理仅有步骤对应关系的情况（没有知识卡片对应关系）
                    if (chunk.corresponding_steps && Array.isArray(chunk.corresponding_steps)) {
                        chunk.corresponding_steps.forEach((stepId: string) => {
                            // 检查是否已经为这个步骤创建了知识卡片相关的映射
                            const alreadyHasKnowledgeCardMapping = createdMappings.some(mapping => 
                                mapping.codeChunkId === codeChunkId && 
                                mapping.stepId === stepId && 
                                mapping.knowledgeCardId
                            );
                            
                            // 只有当没有知识卡片映射时，才创建纯步骤映射
                            if (!alreadyHasKnowledgeCardMapping) {
                                // 查找该步骤的已有映射，优先使用包含requirement chunk的映射
                                const existingStepMapping = existingMappings.find(mapping => 
                                    mapping.stepId === stepId && mapping.requirementChunkId
                                );
                                
                                if (existingStepMapping) {
                                    // 基于已有步骤映射创建新映射
                                    const mapping: CodeAwareMapping = {
                                        codeChunkId: codeChunkId,
                                        stepId: stepId,
                                        requirementChunkId: existingStepMapping.requirementChunkId,
                                        isHighlighted: false
                                    };
                                    createdMappings.push(mapping);
                                    
                                    console.log(`🔗 基于已有步骤映射创建: ${codeChunkId} -> ${stepId} (需求块: ${existingStepMapping.requirementChunkId})`);
                                } else {
                                    // 创建基本的步骤映射
                                    const mapping: CodeAwareMapping = {
                                        codeChunkId: codeChunkId,
                                        stepId: stepId,
                                        isHighlighted: false
                                    };
                                    createdMappings.push(mapping);
                                    
                                    console.log(`🔗 创建基本步骤映射: ${codeChunkId} -> ${stepId}`);
                                }
                            }
                        });
                    }
                });
                
                // 批量更新 Redux 状态
                if (createdCodeChunks.length > 0) {
                    dispatch(updateCodeChunks(createdCodeChunks));
                    console.log(`📦 已添加 ${createdCodeChunks.length} 个新代码块到状态中`);
                }
                
                if (createdMappings.length > 0) {
                    dispatch(updateCodeAwareMappings(createdMappings));
                    console.log(`🔗 已添加 ${createdMappings.length} 个新映射关系到状态中`);
                }

                // 尝试将生成的代码应用到当前文件
                try {
                    console.log("🚀 开始将生成的代码应用到IDE文件...");
                    
                    // 获取当前文件信息
                    const currentFileResponse = await extra.ideMessenger.request("getCurrentFile", undefined);
                    
                    if (currentFileResponse && typeof currentFileResponse === 'object' && 'status' in currentFileResponse && 'content' in currentFileResponse) {
                        // 响应被包装在 status/content 结构中
                        if (currentFileResponse.status === "success" && currentFileResponse.content) {
                            const currentFile = currentFileResponse.content;
                            
                            // 使用新的协议方法应用diff到IDE
                            await extra.ideMessenger.request("applyDiffChanges", {
                                filepath: currentFile.path,
                                oldCode: existingCode,
                                newCode: changedCode
                            });
                            
                            console.log("✅ 代码已成功应用到IDE文件");
                            
                            // 标记所有相关步骤为已生成
                            orderedSteps.forEach(step => {
                                dispatch(setStepStatus({ stepId: step.id, status: 'generated' }));
                            });
                        } else {
                            console.warn("⚠️ getCurrentFile 响应状态不成功:", currentFileResponse.status);
                        }
                    } else {
                        console.warn("⚠️ 无法获取当前文件信息，跳过代码应用");
                    }
                } catch (applyError) {
                    console.error("❌ 应用代码到IDE失败:", applyError);
                    // 不抛出错误，因为Redux状态已经更新成功
                    // 用户仍然可以看到生成的代码和映射关系
                }

                return {
                    changedCode,
                    newCodeChunks
                };

            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                throw new Error("解析LLM代码生成响应失败");
            }

        } catch (error) {
            console.error("Error during code generation from steps:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`代码生成失败: ${errorMessage}`);
        }
    }
);
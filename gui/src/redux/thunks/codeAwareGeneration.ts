import { createAsyncThunk } from "@reduxjs/toolkit";
import {
    CodeAwareMapping,
    CodeChunk,
    HighLevelStepItem,
    ProgramRequirement,
    RequirementChunk,
    StepItem,
    StepToHighLevelMapping
} from "core";
import {
    constructEvaluateSaqAnswerPrompt,
    constructGenerateCodeFromStepsPrompt,
    constructGenerateKnowledgeCardDetailPrompt,
    constructGenerateKnowledgeCardThemesFromQueryPrompt,
    constructGenerateKnowledgeCardThemesPrompt,
    constructGenerateStepsPrompt,
    constructParaphraseUserIntentPrompt,
    constructProcessCodeChangesPrompt,
    constructRerunStepPrompt
} from "core/llm/codeAwarePrompts";
import {
    clearAllCodeAwareMappings,
    clearAllCodeChunks,
    createCodeAwareMapping,
    createKnowledgeCard,
    createOrGetCodeChunk,
    markStepsCodeDirty,
    removeCodeAwareMappings,
    resetKnowledgeCardContent,
    selectTestByTestId,
    setCodeAwareTitle,
    setCodeChunkDisabled,
    setGeneratedSteps,
    setHighLevelSteps,
    setKnowledgeCardError,
    setKnowledgeCardGenerationStatus,
    setKnowledgeCardLoading,
    setLearningGoal,
    setRequirementChunks,
    setSaqTestLoading,
    setStepAbstract,
    setStepStatus,
    setStepTitle,
    setStepToHighLevelMappings,
    setUserRequirementStatus,
    submitRequirementContent,
    updateCodeAwareMappings,
    updateCodeChunkPositions,
    updateCodeChunkRange,
    updateHighLevelStepCompletion,
    updateHighlight,
    updateKnowledgeCardContent,
    updateKnowledgeCardTitle,
    updateSaqTestResult
} from "../slices/codeAwareSlice";
import { selectDefaultModel } from "../slices/configSlice";
import { ThunkApiType } from "../store";

// 辅助函数：检查并更新高级步骤的完成状态
export const checkAndUpdateHighLevelStepCompletion = createAsyncThunk<
    void,
    void,
    ThunkApiType
>(
    "codeAware/checkAndUpdateHighLevelStepCompletion",
    async (_, { dispatch, getState }) => {
        const state = getState();
        const steps = state.codeAwareSession.steps;
        const stepToHighLevelMappings = state.codeAwareSession.stepToHighLevelMappings;
        const highLevelSteps = state.codeAwareSession.highLevelSteps;

        // 为每个高级步骤检查其对应的所有步骤是否都已生成
        highLevelSteps.forEach(highLevelStep => {
            const relatedSteps = stepToHighLevelMappings
                .filter(mapping => mapping.highLevelStepId === highLevelStep.id)
                .map(mapping => steps.find(step => step.id === mapping.stepId))
                .filter(step => step !== undefined);

            // 判断该高级步骤是否完成：所有相关步骤状态为 "generated"
            const isCompleted = relatedSteps.length > 0 && 
                relatedSteps.every(step => step!.stepStatus === "generated");

            // 如果完成状态发生变化，更新状态
            if (isCompleted !== highLevelStep.isCompleted) {
                dispatch(updateHighLevelStepCompletion({
                    highLevelStepId: highLevelStep.id,
                    isCompleted
                }));
            }
        });
    }
);

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
        const chunkLine = chunkLines[0];
        for (let i = 0; i < fullCodeLines.length; i++) {
            if (fullCodeLines[i] === chunkLine) {
                return [i + 1, i + 1]; // 转换为1基索引
            }
        }
        
        // 如果精确匹配失败，尝试去掉空白再匹配
        const chunkLineTrimmed = chunkLine.trim();
        for (let i = 0; i < fullCodeLines.length; i++) {
            if (fullCodeLines[i].trim() === chunkLineTrimmed) {
                return [i + 1, i + 1]; // 转换为1基索引
            }
        }
    }
    
    // 如果代码块有多行，尝试找到连续匹配的行
    for (let i = 0; i <= fullCodeLines.length - chunkLines.length; i++) {
        // 检查是否所有行都匹配（先尝试精确匹配，包括空行）
        let allMatch = true;
        for (let j = 0; j < chunkLines.length; j++) {
            if (fullCodeLines[i + j] !== chunkLines[j]) {
                allMatch = false;
                break;
            }
        }
        
        if (allMatch) {
            return [i + 1, i + chunkLines.length]; // 转换为1基索引
        }
        
        // 如果精确匹配失败，尝试去掉首尾空白后匹配（但保留空行结构）
        allMatch = true;
        for (let j = 0; j < chunkLines.length; j++) {
            const fullLine = fullCodeLines[i + j];
            const chunkLine = chunkLines[j];
            
            // 如果两者都是空行或都是空白行，认为匹配
            if ((fullLine.trim() === '' && chunkLine.trim() === '')) {
                continue;
            }
            
            // 对于非空行，比较去空白后的内容
            if (fullLine.trim() !== chunkLine.trim()) {
                allMatch = false;
                break;
            }
        }
        
        if (allMatch) {
            return [i + 1, i + chunkLines.length]; // 转换为1基索引
        }
    }
    
    // 如果无法精确匹配，尝试部分匹配
    const firstChunkLine = chunkLines[0].trim();
    const lastChunkLine = chunkLines[chunkLines.length - 1].trim();
    
    for (let i = 0; i < fullCodeLines.length; i++) {
        const fullLine = fullCodeLines[i].trim();
        if (fullLine === firstChunkLine && firstChunkLine !== '') {
            // 找到第一行匹配，尝试找到最后一行
            for (let j = i; j < fullCodeLines.length; j++) {
                if (fullCodeLines[j].trim() === lastChunkLine && lastChunkLine !== '') {
                    return [i + 1, j + 1]; // 转换为1基索引
                }
            }
            // 如果只找到第一行，估算结束位置
            const estimatedEnd = Math.min(i + chunkLines.length, fullCodeLines.length);
            return [i + 1, estimatedEnd]; // 转换为1基索引
        }
    }
    
    // 如果都无法匹配，返回默认范围
    console.warn("无法为代码块计算精确的行号范围，使用默认范围", {
        chunkLinesCount: chunkLines.length,
        fullCodeLinesCount: fullCodeLines.length,
        chunkPreview: chunkCode.substring(0, 100)
    });
    return [1, Math.min(chunkLines.length, fullCodeLines.length)];
}

// 辅助函数：获取步骤对应的最大代码块内容
export async function getStepCorrespondingCode(
    stepId: string, 
    mappings: any[], 
    codeChunks: any[], 
    ideMessenger: any
): Promise<string> {
    // 找到包含当前step_id的所有映射
    const stepMappings = mappings.filter(mapping => mapping.stepId === stepId);
    
    if (stepMappings.length === 0) {
        return "";
    }
    
    // 获取所有对应的代码块
    const correspondingCodeChunks = stepMappings
        .map(mapping => codeChunks.find(chunk => chunk.id === mapping.codeChunkId))
        .filter(chunk => chunk !== undefined);
    
    if (correspondingCodeChunks.length === 0) {
        return "";
    }
    
    // 找到范围最大的代码块（即范围覆盖最多行的代码块）
    const maxRangeChunk = correspondingCodeChunks.reduce((max, current) => {
        const maxRange = max.range[1] - max.range[0] + 1;
        const currentRange = current.range[1] - current.range[0] + 1;
        return currentRange > maxRange ? current : max;
    });
    
    // 尝试从当前IDE文件获取最新内容，以确保代码是最新的
    try {
        const currentFileResponse = await ideMessenger.request("getCurrentFile", undefined);
        
        if (currentFileResponse?.status === "success" && currentFileResponse.content) {
            const currentFile = currentFileResponse.content;
            
            // 如果文件路径匹配，从当前文件内容中提取对应行号的代码
            if (currentFile.path === maxRangeChunk.filePath && currentFile.contents) {
                const lines = currentFile.contents.split('\n');
                const startLine = Math.max(0, maxRangeChunk.range[0] - 1); // 转换为0基索引
                const endLine = Math.min(lines.length, maxRangeChunk.range[1]); // 确保不超出范围
                
                const currentCode = lines.slice(startLine, endLine).join('\n');
                console.log(`📖 从当前文件获取步骤 ${stepId} 对应的代码 (行${maxRangeChunk.range[0]}-${maxRangeChunk.range[1]}):`, 
                    currentCode.substring(0, 100) + (currentCode.length > 100 ? "..." : ""));
                
                return currentCode;
            }
        }
    } catch (error) {
        console.warn("⚠️ 无法从IDE获取当前文件内容，使用缓存的代码块内容:", error);
    }
    
    // 如果无法从IDE获取最新内容，返回缓存的代码块内容
    return maxRangeChunk.content;
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

            // call LLM to generate steps with retry mechanism
            const prompt = constructGenerateStepsPrompt(userRequirement);
            const maxRetries = 3;
            let lastError: Error | null = null;
            let result: any = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔄 Attempt ${attempt}/${maxRetries} to generate steps...`);
                    
                    result = await extra.ideMessenger.request("llm/complete", {
                        prompt: prompt,
                        completionOptions: {}, // 根据需要配置
                        title: defaultModel.title
                    });

                    if (result.status === "success" && result.content) {
                        console.log("✅ Steps generation successful on attempt", attempt);
                        break;
                    } else {
                        throw new Error(`LLM request failed: status=${result.status}, hasContent=${!!result.content}`);
                    }
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`⚠️ Steps generation attempt ${attempt}/${maxRetries} failed:`, lastError.message);
                    
                    if (attempt < maxRetries) {
                        // Wait before retry (exponential backoff)
                        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        console.log(`⏱️ Waiting ${waitTime}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }

            // 提取信息，更新到Slice中
            if (!result || result.status !== "success" || !result.content) {
                dispatch(setUserRequirementStatus("editing"));
                throw new Error(`LLM request to generate steps failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`);
            }

            //要初始化设置的一些值，同时要更新的是userRequirement, 并且需要设置learning goal;
            let parsedSteps: StepItem[] = [];
            let initialMappings: CodeAwareMapping[] = [];
            let requirementChunks: RequirementChunk[] = [];
            let highLevelStepItems: HighLevelStepItem[] = [];
            let stepToHighLevelMappings: StepToHighLevelMapping[] = [];
            let learningGoal = "";
            let title = "";
            let highLevelSteps: string[] = [];
            
            // 解析 LLM 返回的 JSON 内容
            try {
                const jsonResponse = JSON.parse(result.content);
                console.log("LLM response JSON:", jsonResponse);
                title = jsonResponse.title || "";
                learningGoal = jsonResponse.learning_goal || "";
                highLevelSteps = jsonResponse.high_level_steps || [];
                const steps = jsonResponse.steps || [];
                
                // 创建高级步骤项目
                highLevelSteps.forEach((highLevelStep, index) => {
                    const highLevelStepId = `hl-${index + 1}`;
                    highLevelStepItems.push({
                        id: highLevelStepId,
                        content: highLevelStep,
                        isHighlighted: false,
                        isCompleted: false // 初始状态为未完成
                    });
                    
                    // 同时创建 requirement chunks (用于 RequirementDisplay)
                    requirementChunks.push({
                        id: `r-${index + 1}`,
                        content: highLevelStep,
                        isHighlighted: false
                    });
                });
                
                for (const step of steps) {
                    const stepTitle = step.title || "";
                    const stepAbstract = step.abstract || "";
                    const taskCorrespondingHighLevelTask = step.task_corresponding_high_level_task || "";
                    
                    // 确保每个步骤都有标题和摘要
                    if (stepTitle && stepAbstract) {
                        const stepId = `s-${parsedSteps.length + 1}`;
                        parsedSteps.push({
                            id: stepId, 
                            title: stepTitle,
                            abstract: stepAbstract,
                            knowledgeCards:[],
                            isHighlighted:false,
                            stepStatus: "confirmed", // 默认状态为 confirmed
                            knowledgeCardGenerationStatus: "empty", // 初始状态为 empty
                        });
                        
                        // 为每个step的对应high-level task创建映射
                        if (taskCorrespondingHighLevelTask) {
                            // 找到对应的高级步骤
                            const correspondingIndex = highLevelSteps.findIndex(
                                highLevelStep => highLevelStep === taskCorrespondingHighLevelTask
                            );
                            
                            if (correspondingIndex !== -1) {
                                const highLevelStepId = `hl-${correspondingIndex + 1}`;
                                const requirementChunkId = `r-${correspondingIndex + 1}`;
                                
                                // 创建步骤到高级步骤的映射
                                stepToHighLevelMappings.push({
                                    stepId: stepId,
                                    highLevelStepId: highLevelStepId,
                                    highLevelStepIndex: correspondingIndex + 1 // 序号从1开始
                                });
                                
                                // 创建传统的 CodeAware 映射 (用于高亮功能)
                                initialMappings.push({
                                    requirementChunkId: requirementChunkId,
                                    stepId: stepId,
                                    isHighlighted: false
                                });
                            }
                        }
                    } else {
                        console.warn("Step is missing title or abstract:", step);
                    }
                }
                
            } catch (error) {
                console.error("Error during LLM request for generating steps:", error);
                // 在抛出新错误之前，确保 error 是一个 Error 实例，以便保留原始堆栈跟踪
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to generate steps: ${errorMessage}`);
                // CATODO: UI提示，告知用户请求失败
            }
            console.log("Generated high_level_steps array:", highLevelSteps);
            console.log("Generated requirement chunks:", requirementChunks);
            console.log("Generated step to high level mappings:", stepToHighLevelMappings);

            // 更新 Redux 状态
            dispatch(setCodeAwareTitle(title));
            dispatch(setLearningGoal(learningGoal));
            dispatch(setHighLevelSteps(highLevelStepItems));
            dispatch(setStepToHighLevelMappings(stepToHighLevelMappings));
            dispatch(setGeneratedSteps(parsedSteps));
            dispatch(setRequirementChunks(requirementChunks));
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
        
        const maxRetries = 3; // 最大重试次数
        let lastError: Error | null = null;
        
        try{
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            // 从state中获取任务描述信息
            const taskDescription = state.codeAwareSession.userRequirement?.requirementDescription || 
                                  "";

            // 设置加载状态
            dispatch(setKnowledgeCardLoading({ stepId, cardId: knowledgeCardId, isLoading: true }));

            // 构造提示词
            const prompt = constructGenerateKnowledgeCardDetailPrompt(
                knowledgeCardTheme, 
                learningGoal, 
                codeContext, 
                taskDescription
            );

            console.log("generateKnowledgeCardDetail called with:", {
                stepId,
                knowledgeCardId,
                knowledgeCardTheme,
                learningGoal,
                taskDescription,
                codeContext: codeContext.substring(0, 100) + "..." // 只打印前100个字符
            });

            // 重试机制
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔄 知识卡片生成尝试 ${attempt}/${maxRetries}`);
                    
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
                        
                        console.log("✅ 知识卡片生成成功");
                        return; // 成功，退出函数
                        
                    } catch (parseError) {
                        throw new Error(`解析LLM响应失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                    }
                    
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`⚠️ 知识卡片生成第 ${attempt} 次尝试失败:`, lastError.message);
                    
                    // 如果不是最后一次尝试，等待一段时间再重试
                    if (attempt < maxRetries) {
                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最大5秒
                        console.log(`⏱️ 等待 ${delay}ms 后重试...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
            
            // 如果所有重试都失败了，抛出最后一个错误
            throw lastError || new Error("知识卡片生成失败");
            
        } catch(error) {
            console.error("❌ 知识卡片生成最终失败:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // 多次失败后，将知识卡片重置到生成前状态
            console.log("🔄 重置知识卡片到生成前状态");
            dispatch(resetKnowledgeCardContent({
                stepId,
                cardId: knowledgeCardId
            }));
            
            // 显示错误信息的时间较短，然后恢复
            dispatch(setKnowledgeCardError({
                stepId,
                cardId: knowledgeCardId,
                error: `生成失败（已重试${maxRetries}次）: ${errorMessage}`
            }));
            
            // 2秒后清除错误状态，恢复到空内容状态，这样用户下次展开时可以重新生成
            setTimeout(() => {
                dispatch(resetKnowledgeCardContent({
                    stepId,
                    cardId: knowledgeCardId
                }));
            }, 2000);
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

            // 构造提示词
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

            // 重试机制
            const maxRetries = 3;
            let lastError: Error | null = null;
            let result: any = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔄 知识卡片主题生成尝试 ${attempt}/${maxRetries}`);
                    
                    result = await extra.ideMessenger.request("llm/complete", {
                        prompt: prompt,
                        completionOptions: {},
                        title: defaultModel.title
                    });

                    if (result.status !== "success" || !result.content) {
                        throw new Error("LLM request failed or returned empty content");
                    }

                    break; // 成功，跳出重试循环
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`⚠️ 知识卡片主题生成第 ${attempt} 次尝试失败:`, lastError.message);
                    
                    // 如果不是最后一次尝试，等待一段时间再重试
                    if (attempt < maxRetries) {
                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避
                        console.log(`⏱️ 等待 ${delay}ms 后重试...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            // 如果所有重试都失败，抛出错误
            if (!result || result.status !== "success" || !result.content) {
                throw lastError || new Error("知识卡片主题生成失败");
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
                    
                    console.log(`✅ 生成 ${themes.length} 个知识卡片主题，步骤: ${stepId}`);
                } else {
                    console.warn("No valid themes returned from LLM");
                    dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "checked" }));
                }
                
            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                // 解析失败后回到empty状态，这样用户下次展开时可以重新生成
                dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
                throw new Error("解析LLM响应失败");
            }

        } catch (error) {
            console.error("❌ 知识卡片主题生成最终失败:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            // 失败后回到empty状态，这样用户下次展开时可以重新生成
            dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
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

            // 获取当前步骤对应的代码块内容
            const currentCode = await getStepCorrespondingCode(
                stepId, 
                state.codeAwareSession.codeAwareMappings,
                state.codeAwareSession.codeChunks,
                extra.ideMessenger
            );

            // 构造提示词并发送请求
            const prompt = constructGenerateKnowledgeCardThemesFromQueryPrompt(
                queryContext,
                currentStep,
                currentCode,
                existingThemes,
                learningGoal,
                task
            );

            console.log("generateKnowledgeCardThemesFromQuery called with:", {
                stepId,
                queryContext,
                currentStep,
                currentCode: currentCode.substring(0, 100) + (currentCode.length > 100 ? "..." : ""), // 只记录前100个字符用于调试
                existingThemes,
                learningGoal,
                task
            });

            // 重试机制
            const maxRetries = 3;
            let lastError: Error | null = null;
            let result: any = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔄 基于查询的知识卡片主题生成尝试 ${attempt}/${maxRetries}`);
                    
                    result = await extra.ideMessenger.request("llm/complete", {
                        prompt: prompt,
                        completionOptions: {},
                        title: defaultModel.title
                    });

                    if (result.status !== "success" || !result.content) {
                        throw new Error("LLM request failed or returned empty content");
                    }

                    break; // 成功，跳出重试循环
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`⚠️ 基于查询的知识卡片主题生成第 ${attempt} 次尝试失败:`, lastError.message);
                    
                    // 如果不是最后一次尝试，等待一段时间再重试
                    if (attempt < maxRetries) {
                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避
                        console.log(`⏱️ 等待 ${delay}ms 后重试...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            // 如果所有重试都失败，抛出错误
            if (!result || result.status !== "success" || !result.content) {
                throw lastError || new Error("基于查询的知识卡片主题生成失败");
            }

            console.log("LLM response for knowledge card themes from query:", result.content);

            // 解析 LLM 返回的 JSON 内容
            try {
                const themeResponses = JSON.parse(result.content);
                
                if (Array.isArray(themeResponses) && themeResponses.length > 0) {
                    // 获取当前状态以确保实时性
                    const currentState = getState();
                    const existingMappings = currentState.codeAwareSession.codeAwareMappings.filter(
                        mapping => mapping.stepId === stepId
                    );
                    
                    // 为每个新主题创建知识卡片并处理代码对应关系
                    const stepIndex = currentState.codeAwareSession.steps.findIndex(step => step.id === stepId);
                    if (stepIndex !== -1) {
                        const existingCardCount = currentState.codeAwareSession.steps[stepIndex].knowledgeCards.length;
                        
                        for (let index = 0; index < themeResponses.length; index++) {
                            const themeResponse = themeResponses[index];
                            const theme = themeResponse.title || themeResponse.theme || themeResponse;
                            const correspondingCodeChunk = themeResponse.corresponding_code_chunk || "";
                            
                            const cardId = `${stepId}-kc-${existingCardCount + index + 1}`;
                            
                            // 创建新的知识卡片
                            dispatch(createKnowledgeCard({
                                stepId,
                                cardId,
                                theme
                            }));
                            
                            // 处理代码块对应关系
                            if (correspondingCodeChunk && correspondingCodeChunk.trim()) {
                                // 如果有对应的代码块，需要创建或获取代码块，并创建映射
                                
                                // 首先获取当前active文件的内容来推断行号
                                let codeChunkRange: [number, number] = [1, correspondingCodeChunk.split('\n').length];
                                let currentFilePath = "";
                                
                                try {
                                    const currentFileResponse = await extra.ideMessenger.request("getCurrentFile", undefined);
                                    
                                    if (currentFileResponse?.status === "success" && currentFileResponse.content) {
                                        const currentFile = currentFileResponse.content;
                                        currentFilePath = currentFile.path || "";
                                        
                                        // 使用当前文件内容来计算准确的行号范围
                                        if (currentFile.contents) {
                                            codeChunkRange = calculateCodeChunkRange(currentFile.contents, correspondingCodeChunk.trim());
                                            console.log(`📍 为代码块计算行号范围: ${codeChunkRange[0]}-${codeChunkRange[1]}`);
                                        }
                                    } else {
                                        console.warn("⚠️ 无法获取当前文件内容，使用默认行号范围");
                                    }
                                } catch (fileError) {
                                    console.warn("⚠️ 获取当前文件信息失败，使用默认行号范围:", fileError);
                                }
                                
                                // 尝试在现有代码块中找到匹配或重叠的代码块
                                const matchingChunk = currentState.codeAwareSession.codeChunks.find(chunk => 
                                    chunk.content.includes(correspondingCodeChunk.trim()) || 
                                    correspondingCodeChunk.trim().includes(chunk.content)
                                );
                                
                                if (matchingChunk) {
                                    // 如果找到了匹配的代码块，使用现有的映射或创建新的
                                    const existingMapping = existingMappings.find(mapping => 
                                        mapping.codeChunkId === matchingChunk.id
                                    );
                                    
                                    if (existingMapping) {
                                        // 基于现有映射创建新的映射
                                        dispatch(createCodeAwareMapping({
                                            codeChunkId: existingMapping.codeChunkId,
                                            requirementChunkId: existingMapping.requirementChunkId,
                                            stepId,
                                            knowledgeCardId: cardId,
                                            isHighlighted: false
                                        }));
                                    } else {
                                        // 创建基础映射
                                        dispatch(createCodeAwareMapping({
                                            codeChunkId: matchingChunk.id,
                                            stepId,
                                            knowledgeCardId: cardId,
                                            isHighlighted: false
                                        }));
                                    }
                                } else {
                                    // 如果没有找到匹配的代码块，创建新的代码块
                                    
                                    // 创建新代码块，使用准确计算的行号范围和文件路径
                                    dispatch(createOrGetCodeChunk({
                                        content: correspondingCodeChunk.trim(),
                                        range: codeChunkRange,
                                        filePath: currentFilePath
                                    }));
                                    
                                    // 获取新创建的代码块（通过内容和范围匹配）
                                    const updatedState = getState();
                                    const newCodeChunk = updatedState.codeAwareSession.codeChunks.find(chunk => 
                                        chunk.content === correspondingCodeChunk.trim() &&
                                        chunk.range[0] === codeChunkRange[0] &&
                                        chunk.range[1] === codeChunkRange[1]
                                    );
                                    
                                    if (newCodeChunk) {
                                        // 创建映射关系
                                        dispatch(createCodeAwareMapping({
                                            codeChunkId: newCodeChunk.id,
                                            stepId,
                                            knowledgeCardId: cardId,
                                            isHighlighted: false
                                        }));
                                        
                                        console.log(`✅ 为知识卡片 ${cardId} 创建了新代码块: ${newCodeChunk.id} (${codeChunkRange[0]}-${codeChunkRange[1]}行)`);
                                    }
                                }
                            } else {
                                // 如果没有对应的代码块，使用现有映射或创建基础映射
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
                                    // 创建基础映射关系
                                    dispatch(createCodeAwareMapping({
                                        stepId,
                                        knowledgeCardId: cardId,
                                        isHighlighted: false
                                    }));
                                }
                            }
                        }
                    }

                    // 设置生成完成状态
                    dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "checked" }));
                    
                    console.log(`✅ 基于查询生成 ${themeResponses.length} 个知识卡片主题，步骤: ${stepId}`);
                } else {
                    console.warn("No valid themes returned from LLM");
                    dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "checked" }));
                }
                
            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                // 解析失败后回到empty状态，这样用户可以重试
                dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
                throw new Error("解析LLM响应失败");
            }

        } catch (error) {
            console.error("❌ 基于查询的知识卡片主题生成最终失败:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            // 失败后回到empty状态，这样用户可以重试
            dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
        }
    }
);

// 异步根据现有代码和步骤生成新代码
export const generateCodeFromSteps = createAsyncThunk<
    {
        changedCode: string;
        stepsCorrespondingCode: Array<{
            id: string;
            code: string;
        }>;
        knowledgeCardsCorrespondingCode: Array<{
            id: string;
            code: string;
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
        previouslyGeneratedSteps?: Array<{
            id: string;
            title: string;
            knowledge_cards: Array<{
                id: string;
                title: string;
            }>;
            current_corresponding_code?: string;
        }>;
    },
    ThunkApiType
>(
    "codeAware/generateCodeFromSteps",
    async (
        { existingCode, filepath, orderedSteps, previouslyGeneratedSteps },
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
                previouslyGeneratedStepsCount: previouslyGeneratedSteps?.length || 0,
                steps: orderedSteps.map(s => ({ id: s.id, title: s.title, abstract: s.abstract })),
                previousSteps: previouslyGeneratedSteps?.map(s => ({ id: s.id, title: s.title })) || []
            });

            // 在生成新代码前，保存要求映射关系，然后清除所有代码块和代码相关的映射
            console.log("🗑️ 保存要求映射关系并清除现有的代码块和代码映射...");
            const currentState = getState();
            const requirementMappings = currentState.codeAwareSession.codeAwareMappings.filter(
                (mapping: any) => mapping.requirementChunkId && mapping.stepId && !mapping.codeChunkId && !mapping.knowledgeCardId
            );
            
            console.log("💾 保存的要求映射关系:", requirementMappings.length);
            
            dispatch(clearAllCodeChunks());
            dispatch(clearAllCodeAwareMappings());
            
            // 重新添加要求映射关系
            requirementMappings.forEach((mapping: any) => {
                dispatch(createCodeAwareMapping(mapping));
            });

            // 构造提示词并发送请求，带重试机制
            const prompt = constructGenerateCodeFromStepsPrompt(existingCode, orderedSteps, previouslyGeneratedSteps);
            
            // 调试：验证prompt中包含了所有步骤的abstract信息
            console.log("📝 构造的prompt中包含的步骤信息:");
            orderedSteps.forEach(step => {
                console.log(`- 步骤 ${step.id}: ${step.title}`);
                console.log(`  摘要: ${step.abstract}`);
            });
            
            const maxRetries = 3;
            let lastError: Error | null = null;
            let result: any = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔄 Attempt ${attempt}/${maxRetries} to generate code...`);
                    
                    result = await extra.ideMessenger.request("llm/complete", {
                        prompt: prompt,
                        completionOptions: {},
                        title: defaultModel.title
                    });

                    if (result.status === "success" && result.content) {
                        console.log("✅ Code generation successful on attempt", attempt);
                        break;
                    } else {
                        throw new Error(`LLM request failed: status=${result.status}, hasContent=${!!result.content}`);
                    }
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`⚠️ Code generation attempt ${attempt}/${maxRetries} failed:`, lastError.message);
                    
                    if (attempt < maxRetries) {
                        // Wait before retry (exponential backoff)
                        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        console.log(`⏱️ Waiting ${waitTime}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }

            if (!result || result.status !== "success" || !result.content) {
                // If code generation fails, restore step status for all ordered steps
                orderedSteps.forEach(step => {
                    dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
                });
                throw new Error(`LLM request failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`);
            }

            console.log("LLM response for code generation:", result.content);

            // 解析 LLM 返回的 JSON 内容
            try {
                const jsonResponse = JSON.parse(result.content);
                const changedCode = jsonResponse.changed_code || "";
                const stepsCorrespondingCode = jsonResponse.steps_corresponding_code || [];
                const knowledgeCardsCorrespondingCode = jsonResponse.knowledge_cards_corresponding_code || [];

                console.log("✅ 代码生成成功:", {
                    changedCodeLength: changedCode.length,
                    stepsCount: stepsCorrespondingCode.length,
                    knowledgeCardsCount: knowledgeCardsCorrespondingCode.length,
                    steps: stepsCorrespondingCode.map((step: any) => ({
                        id: step.id,
                        codeLength: step.code?.length || 0
                    })),
                    knowledgeCards: knowledgeCardsCorrespondingCode.map((card: any) => ({
                        id: card.id,
                        codeLength: card.code?.length || 0
                    }))
                });

                // 打印生成的内容供调试
                console.log("📝 完整生成代码:");
                console.log(changedCode);
                
                console.log("📋 步骤对应代码详情:");
                stepsCorrespondingCode.forEach((step: any, index: number) => {
                    console.log(`--- 步骤 ${step.id} ---`);
                    console.log("代码:", step.code);
                });

                console.log("🎯 知识卡片对应代码详情:");
                knowledgeCardsCorrespondingCode.forEach((card: any, index: number) => {
                    console.log(`--- 卡片 ${card.id} ---`);
                    console.log("代码:", card.code);
                });
                // 创建新的代码块和映射关系
                const createdCodeChunks: CodeChunk[] = [];
                const createdMappings: CodeAwareMapping[] = [];
                
                // 获取当前状态中的代码块数量，用于生成新的ID
                const currentState = getState();
                const existingCodeChunksCount = currentState.codeAwareSession.codeChunks.length;
                let codeChunkCounter = existingCodeChunksCount + 1;

                // 收集所有不同的代码片段，避免重复创建
                const uniqueCodeChunks = new Map<string, string>(); // content -> id mapping

                // 处理步骤对应的代码
                stepsCorrespondingCode.forEach((stepInfo: any) => {
                    if (stepInfo.code && stepInfo.code.trim()) {
                        const codeContent = stepInfo.code.trim();
                        if (!uniqueCodeChunks.has(codeContent)) {
                            uniqueCodeChunks.set(codeContent, `c-${codeChunkCounter++}`);
                        }
                    }
                });

                // 处理知识卡片对应的代码
                knowledgeCardsCorrespondingCode.forEach((cardInfo: any) => {
                    if (cardInfo.code && cardInfo.code.trim()) {
                        const codeContent = cardInfo.code.trim();
                        if (!uniqueCodeChunks.has(codeContent)) {
                            uniqueCodeChunks.set(codeContent, `c-${codeChunkCounter++}`);
                        }
                    }
                });

                // 创建所有唯一的代码块
                uniqueCodeChunks.forEach((codeChunkId, codeContent) => {
                    // 使用changedCode（完整生成的代码）来计算代码块的精确行号范围
                    const range = calculateCodeChunkRange(changedCode, codeContent);
                    
                    dispatch(createOrGetCodeChunk({
                        content: codeContent,
                        range: range,
                        filePath: filepath,
                        id: codeChunkId // 传递预生成的ID
                    }));

                    console.log(`✅ 创建代码块 ${codeChunkId}:`, {
                        contentLength: codeContent.length,
                        range: range,
                        filepath: filepath
                    });
                });

                // 更新状态后获取最新的要求映射关系，用于重建映射
                const updatedState = getState();
                const existingRequirementMappings = updatedState.codeAwareSession.codeAwareMappings.filter(
                    (mapping: any) => mapping.requirementChunkId && mapping.stepId && !mapping.codeChunkId
                );

                console.log("📋 找到的要求映射关系:", existingRequirementMappings.length);

                // 为所有步骤（新的和之前生成的）创建映射关系
                stepsCorrespondingCode.forEach((stepInfo: any) => {
                    if (stepInfo.code && stepInfo.code.trim()) {
                        const codeContent = stepInfo.code.trim();
                        const codeChunkId = uniqueCodeChunks.get(codeContent);
                        
                        if (codeChunkId) {
                            // 查找该步骤的要求映射关系
                            const existingStepMapping = existingRequirementMappings.find((mapping: any) => 
                                mapping.stepId === stepInfo.id
                            );
                            
                            let mapping: CodeAwareMapping;
                            if (existingStepMapping) {
                                // 基于已有要求映射创建完整映射
                                mapping = {
                                    codeChunkId: codeChunkId,
                                    stepId: stepInfo.id,
                                    requirementChunkId: existingStepMapping.requirementChunkId,
                                    isHighlighted: false
                                };
                            } else {
                                // 创建基本的步骤映射
                                mapping = {
                                    codeChunkId: codeChunkId,
                                    stepId: stepInfo.id,
                                    isHighlighted: false
                                };
                            }
                            
                            dispatch(createCodeAwareMapping(mapping));
                            console.log(`🔗 创建步骤映射: ${codeChunkId} -> ${stepInfo.id}${existingStepMapping ? ` (要求: ${existingStepMapping.requirementChunkId})` : ''}`);
                        }
                    }
                });

                // 为所有知识卡片（新的和之前生成的）创建映射关系
                knowledgeCardsCorrespondingCode.forEach((cardInfo: any) => {
                    if (cardInfo.code && cardInfo.code.trim()) {
                        const codeContent = cardInfo.code.trim();
                        const codeChunkId = uniqueCodeChunks.get(codeContent);
                        
                        if (codeChunkId) {
                            // 从卡片ID中提取步骤ID (假设格式为 s-x-kc-y)
                            const stepId = cardInfo.id.split('-kc-')[0];
                            
                            // 查找该步骤的要求映射关系
                            const existingStepMapping = existingRequirementMappings.find((mapping: any) => 
                                mapping.stepId === stepId
                            );
                            
                            let mapping: CodeAwareMapping;
                            if (existingStepMapping) {
                                // 基于已有要求映射创建完整映射，包含知识卡片信息
                                mapping = {
                                    codeChunkId: codeChunkId,
                                    stepId: stepId,
                                    requirementChunkId: existingStepMapping.requirementChunkId,
                                    knowledgeCardId: cardInfo.id,
                                    isHighlighted: false
                                };
                            } else {
                                // 创建基本的知识卡片映射
                                mapping = {
                                    codeChunkId: codeChunkId,
                                    stepId: stepId,
                                    knowledgeCardId: cardInfo.id,
                                    isHighlighted: false
                                };
                            }
                            
                            dispatch(createCodeAwareMapping(mapping));
                            console.log(`🎯 创建知识卡片映射: ${codeChunkId} -> ${cardInfo.id} (步骤: ${stepId})${existingStepMapping ? ` (要求: ${existingStepMapping.requirementChunkId})` : ''}`);
                        }
                    }
                });

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
                            console.log("所有步骤状态已更新为 'generated'");
                            
                            // 触发highlight事件，以steps为source高亮相关的代码变化
                            // 获取更新后的步骤信息 - 确保在所有mapping创建完成后再触发
                            const finalState = getState();
                            
                            // 调试：检查当前的映射关系
                            console.log("🔍 当前所有映射关系:", finalState.codeAwareSession.codeAwareMappings);
                            console.log("🔍 当前所有步骤:", finalState.codeAwareSession.steps.map(s => ({ 
                                id: s.id, 
                                title: s.title, 
                                isHighlighted: s.isHighlighted 
                            })));
                            
                            const stepHighlightEvents = orderedSteps.map(step => {
                                const fullStepInfo = finalState.codeAwareSession.steps.find(s => s.id === step.id);
                                return {
                                    sourceType: "step" as const,
                                    identifier: step.id,
                                    additionalInfo: fullStepInfo
                                };
                            });
                            
                            console.log("🎯 即将触发的highlight事件:", stepHighlightEvents);
                            dispatch(updateHighlight(stepHighlightEvents));
                            console.log(`✨ 触发了 ${stepHighlightEvents.length} 个步骤的highlight事件`);
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
                    stepsCorrespondingCode,
                    knowledgeCardsCorrespondingCode
                };

            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                // Restore step status for all ordered steps if parsing fails
                orderedSteps.forEach(step => {
                    dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
                });
                throw new Error("解析LLM代码生成响应失败");
            }

        } catch (error) {
            console.error("Error during code generation from steps:", error);
            
            // Restore step status for all ordered steps if any error occurs
            orderedSteps.forEach(step => {
                dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
            });
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`代码生成失败: ${errorMessage}`);
        }
    }
);

// 异步重新运行步骤 - 根据步骤抽象的变化更新代码和映射关系
export const rerunStep = createAsyncThunk<
    void,
    {
        stepId: string;
        changedStepAbstract: string;
        existingCode: string;
        filepath: string;
    },
    ThunkApiType
>(
    "codeAware/rerunStep",
    async (
        { stepId, changedStepAbstract, existingCode, filepath },
        { dispatch, extra, getState }
    ) => {
        try {
            const state = getState();
            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            // 从Redux状态中获取步骤信息
            const steps = state.codeAwareSession.steps;
            const targetStep = steps.find(step => step.id === stepId);
            if (!targetStep) {
                throw new Error(`Step with id ${stepId} not found`);
            }

            console.log("rerunStep called with:", {
                stepId,
                stepTitle: targetStep.title,
                previousAbstract: targetStep.abstract,
                changedAbstract: changedStepAbstract,
                knowledgeCardsCount: targetStep.knowledgeCards.length
            });

            // 构造提示词并发送请求
            const prompt = constructRerunStepPrompt(
                existingCode,
                {
                    id: targetStep.id,
                    title: targetStep.title,
                    abstract: targetStep.abstract,
                    knowledge_cards: targetStep.knowledgeCards.map(kc => ({
                        id: kc.id,
                        title: kc.title
                    }))
                },
                changedStepAbstract
            );

            const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {},
                title: defaultModel.title
            });

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request failed or returned empty content");
            }

            console.log("LLM response for rerun step:", result.content);

            // 解析 LLM 返回的 JSON 内容
            try {
                const jsonResponse = JSON.parse(result.content);
                const updatedCode = jsonResponse.updated_code || "";
                const stepUpdates = jsonResponse.step_updates || {};
                const knowledgeCardsUpdates = jsonResponse.knowledge_cards_updates || [];

                console.log("✅ 步骤重新运行成功:", {
                    updatedCodeLength: updatedCode.length,
                    stepId: stepUpdates.id,
                    stepTitle: stepUpdates.title,
                    knowledgeCardsCount: knowledgeCardsUpdates.length
                });

                // 1. 禁用与当前步骤相关的旧代码块
                const currentMappings = state.codeAwareSession.codeAwareMappings;
                const relatedMappings = currentMappings.filter(mapping => 
                    mapping.stepId === stepId || 
                    (mapping.knowledgeCardId && mapping.knowledgeCardId.startsWith(`${stepId}-kc-`))
                );

                // 禁用相关的代码块
                relatedMappings.forEach(mapping => {
                    if (mapping.codeChunkId) {
                        dispatch(setCodeChunkDisabled({ 
                            codeChunkId: mapping.codeChunkId, 
                            disabled: true 
                        }));
                    }
                });

                console.log(`🚫 禁用了 ${relatedMappings.length} 个相关代码块`);

                // 2. 删除相关的映射关系
                dispatch(removeCodeAwareMappings({ stepId: stepId }));
                console.log(`🗑️ 删除了步骤 ${stepId} 相关的所有映射关系`);

                // 3. 将更新的代码应用到编辑器
                try {
                    console.log("🚀 开始将更新的代码应用到IDE文件...");
                    
                    // 使用diff方式应用代码变更，更安全且支持undo
                    await extra.ideMessenger.request("applyDiffChanges", {
                        filepath: filepath,
                        oldCode: existingCode,
                        newCode: updatedCode
                    });
                    
                    console.log("✅ 代码已成功应用到IDE文件");
                } catch (applyError) {
                    console.error("❌ 应用代码到IDE失败:", applyError);
                }

                // 4. 更新其他未禁用代码块的行号范围
                console.log("🔄 开始更新其他未禁用代码块的行号范围...");
                
                // 获取所有未禁用的代码块
                const updatedState = getState();
                const enabledCodeChunks = updatedState.codeAwareSession.codeChunks.filter(chunk => !chunk.disabled);
                
                // 为每个未禁用的代码块重新计算范围
                enabledCodeChunks.forEach(chunk => {
                    try {
                        const newRange = calculateCodeChunkRange(updatedCode, chunk.content);
                        
                        // 如果范围有变化，更新代码块
                        if (newRange[0] !== chunk.range[0] || newRange[1] !== chunk.range[1]) {
                            dispatch(updateCodeChunkRange({
                                codeChunkId: chunk.id,
                                range: newRange
                            }));
                            
                            console.log(`📏 更新代码块 ${chunk.id} 的范围: [${chunk.range[0]}, ${chunk.range[1]}] -> [${newRange[0]}, ${newRange[1]}]`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ 无法为代码块 ${chunk.id} 计算新的范围:`, error);
                    }
                });
                
                console.log(`✅ 完成更新 ${enabledCodeChunks.length} 个未禁用代码块的范围`);

                // 5. 创建新的代码块和映射关系
                const currentState = getState();
                const existingCodeChunksCount = currentState.codeAwareSession.codeChunks.length;
                let codeChunkCounter = existingCodeChunksCount + 1;

                // 为步骤创建新的代码块和映射
                if (stepUpdates.corresponding_code && stepUpdates.corresponding_code.trim()) {
                    const stepCodeContent = stepUpdates.corresponding_code.trim();
                    const stepRange = calculateCodeChunkRange(updatedCode, stepCodeContent);
                    const stepCodeChunkId = `c-${codeChunkCounter++}`;
                    
                    dispatch(createOrGetCodeChunk({
                        content: stepCodeContent,
                        range: stepRange,
                        filePath: filepath,
                        id: stepCodeChunkId
                    }));

                    // 找到对应的需求块ID（从现有映射中查找）
                    const existingStepMapping = currentMappings.find(mapping => mapping.stepId === stepId && mapping.requirementChunkId);
                    const requirementChunkId = existingStepMapping?.requirementChunkId;

                    // 创建步骤映射
                    const stepMapping: CodeAwareMapping = {
                        codeChunkId: stepCodeChunkId,
                        stepId: stepId,
                        requirementChunkId: requirementChunkId,
                        isHighlighted: false
                    };
                    
                    dispatch(createCodeAwareMapping(stepMapping));
                    console.log(`🔗 创建新的步骤映射: ${stepCodeChunkId} -> ${stepId}`);
                }

                // 为知识卡片创建新的代码块和映射
                knowledgeCardsUpdates.forEach((cardUpdate: any) => {
                    if (cardUpdate.corresponding_code && cardUpdate.corresponding_code.trim()) {
                        const cardCodeContent = cardUpdate.corresponding_code.trim();
                        const cardRange = calculateCodeChunkRange(updatedCode, cardCodeContent);
                        const cardCodeChunkId = `c-${codeChunkCounter++}`;
                        
                        dispatch(createOrGetCodeChunk({
                            content: cardCodeContent,
                            range: cardRange,
                            filePath: filepath,
                            id: cardCodeChunkId
                        }));

                        // 找到对应的需求块ID
                        const existingCardMapping = currentMappings.find(mapping => mapping.knowledgeCardId === cardUpdate.id);
                        const requirementChunkId = existingCardMapping?.requirementChunkId;

                        // 创建知识卡片映射
                        const cardMapping: CodeAwareMapping = {
                            codeChunkId: cardCodeChunkId,
                            stepId: stepId,
                            knowledgeCardId: cardUpdate.id,
                            requirementChunkId: requirementChunkId,
                            isHighlighted: false
                        };
                        
                        dispatch(createCodeAwareMapping(cardMapping));
                        console.log(`🎯 创建新的知识卡片映射: ${cardCodeChunkId} -> ${cardUpdate.id}`);
                    }
                });

                // 6. 更新步骤标题（如果有变化）
                if (stepUpdates.title && stepUpdates.title !== targetStep.title) {
                    dispatch(setStepTitle({ stepId: stepId, title: stepUpdates.title }));
                    console.log(`📝 步骤标题已更新: "${targetStep.title}" -> "${stepUpdates.title}"`);
                }

                // 7. 更新步骤的抽象内容
                dispatch(setStepAbstract({ 
                    stepId: stepId, 
                    abstract: changedStepAbstract 
                }));
                console.log(`📄 步骤抽象已更新为: "${changedStepAbstract}"`);

                // 8. 处理需要更新的知识卡片
                knowledgeCardsUpdates.forEach((cardUpdate: any) => {
                    if (cardUpdate.needs_update) {
                        // 更新知识卡片标题并清空内容和测试（如果有变化）
                        const originalCard = targetStep.knowledgeCards.find(kc => kc.id === cardUpdate.id);
                        if (originalCard && cardUpdate.title && cardUpdate.title !== originalCard.title) {
                            // 使用新的action来更新标题并清空内容
                            dispatch(updateKnowledgeCardTitle({
                                stepId: stepId,
                                cardId: cardUpdate.id,
                                title: cardUpdate.title
                            }));
                            console.log(`🏷️ 更新知识卡片标题并清空内容: "${originalCard.title}" -> "${cardUpdate.title}"`);
                        } else if (originalCard) {
                            // 即使标题没有变化，如果需要更新，也要清空内容
                            dispatch(updateKnowledgeCardTitle({
                                stepId: stepId,
                                cardId: cardUpdate.id,
                                title: originalCard.title // 保持原标题
                            }));
                            console.log(`🔄 清空知识卡片 ${cardUpdate.id} 的内容和测试`);
                        }

                        // 设置知识卡片为需要重新生成内容状态
                        dispatch(setKnowledgeCardGenerationStatus({ 
                            stepId: stepId, 
                            status: "generating" 
                        }));
                        console.log(`🔄 知识卡片 ${cardUpdate.id} 标记为需要重新生成内容`);
                    }
                });

                console.log("✅ 步骤重新运行完成");
                
                // 触发highlight事件，以step为source高亮重新运行的步骤变化
                const latestState = getState();
                const rerunStepInfo = latestState.codeAwareSession.steps.find(s => s.id === stepId);
                if (rerunStepInfo) {
                    dispatch(updateHighlight({
                        sourceType: "step",
                        identifier: stepId,
                        additionalInfo: rerunStepInfo
                    }));
                    console.log(`✨ 触发了步骤 ${stepId} 的highlight事件`);
                }

            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                throw new Error("解析LLM响应失败");
            }

        } catch (error) {
            console.error("Error during step rerun:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`步骤重新运行失败: ${errorMessage}`);
        }
    }
);

// Process code changes when exiting code edit mode
export const processCodeChanges = createAsyncThunk<
    void,
    {
        currentFilePath: string;
        currentContent: string;
    },
    ThunkApiType
>(
    "codeAware/processCodeChanges",
    async ({ currentFilePath, currentContent }, { getState, dispatch }) => {
        try {
            const state = getState();
            const snapshot = state.codeAwareSession.codeEditModeSnapshot;
            
            if (!snapshot) {
                console.warn("No code snapshot found, cannot process changes");
                return;
            }

            // Check if we're working on the same file
            if (snapshot.filePath !== currentFilePath) {
                console.warn("File path changed, processing changes might not be accurate");
            }

            // Import diff library dynamically to avoid bundling issues
            const { diffLines } = await import('diff');
            
            // Calculate diff between snapshot and current content
            const changes = diffLines(snapshot.content, currentContent);
            
            console.log("📊 Code changes detected:", {
                totalChanges: changes.length,
                additions: changes.filter(c => c.added).length,
                deletions: changes.filter(c => c.removed).length
            });

            // Track real edits (including whitespace-only changes like adding/removing empty lines)
            const realEdits: Array<{
                type: 'added' | 'removed' | 'modified';
                lineStart: number;
                lineEnd: number;
                content: string;
            }> = [];

            let currentLine = 1;
            
            for (const change of changes) {
                if (!change.value) continue;
                
                const lines = change.value.split('\n');
                // Remove last empty line if it exists
                if (lines[lines.length - 1] === '') {
                    lines.pop();
                }
                
                if (change.added) {
                    // Include all additions, even if they're just whitespace/empty lines
                    realEdits.push({
                        type: 'added',
                        lineStart: currentLine,
                        lineEnd: currentLine + lines.length - 1,
                        content: change.value
                    });
                    currentLine += lines.length;
                } else if (change.removed) {
                    // Include all removals, even if they're just whitespace/empty lines
                    realEdits.push({
                        type: 'removed',
                        lineStart: currentLine,
                        lineEnd: currentLine + lines.length - 1,
                        content: change.value
                    });
                    // Don't increment currentLine for removed content
                } else {
                    // Unchanged content
                    currentLine += lines.length;
                }
            }

            console.log("🔍 All edits found:", realEdits);

            if (realEdits.length === 0) {
                console.log("✅ No code changes detected");
                return;
            }

            // Separate substantial edits (code changes) from formatting edits (whitespace only)
            const substantialEdits = realEdits.filter(edit => {
                const lines = edit.content.split('\n');
                return lines.some(line => line.trim() !== '');
            });

            const formattingOnlyEdits = realEdits.filter(edit => {
                const lines = edit.content.split('\n');
                return lines.every(line => line.trim() === '');
            });

            console.log("📊 Edit analysis:", {
                totalEdits: realEdits.length,
                substantialEdits: substantialEdits.length,
                formattingOnlyEdits: formattingOnlyEdits.length
            });

            // Log details of each edit for debugging
            realEdits.forEach((edit, index) => {
                console.log(`📝 Edit ${index + 1}: ${edit.type} at lines ${edit.lineStart}-${edit.lineEnd}`, {
                    content: edit.content.replace(/\n/g, '\\n'),
                    isSubstantial: substantialEdits.includes(edit),
                    isFormatting: formattingOnlyEdits.includes(edit)
                });
            });

            // Get current code chunks and steps
            const codeChunks = state.codeAwareSession.codeChunks;
            const steps = state.codeAwareSession.steps;
            const mappings = state.codeAwareSession.codeAwareMappings;

            // Find which code chunks are affected by real edits
            const affectedChunkIds = new Set<string>();
            const unaffectedChunks: Array<{
                chunkId: string;
                newRange: [number, number];
            }> = [];
            const subtlyAffectedChunks: Array<{
                chunkId: string;
                newRange: [number, number];
            }> = [];

            for (const chunk of codeChunks) {
                if (chunk.filePath !== currentFilePath) {
                    continue; // Skip chunks from other files
                }
                
                let isAffected = false;
                let lineOffset = 0;
                let hasSubtleChanges = false;
                
                console.log(`🔍 Analyzing chunk ${chunk.id} at range [${chunk.range[0]}, ${chunk.range[1]}]`);
                
                // Check if this chunk overlaps with any edit (including formatting)
                for (const edit of realEdits) {
                    const chunkStart = chunk.range[0];
                    const chunkEnd = chunk.range[1];
                    const editStart = edit.lineStart;
                    const editEnd = edit.lineEnd;
                    
                    // Check for overlap
                    if (chunkStart <= editEnd && chunkEnd >= editStart) {
                        console.log(`  📍 Chunk ${chunk.id} overlaps with ${edit.type} edit at lines ${editStart}-${editEnd}`);
                        
                        // Check if this is a substantial change that affects semantics
                        const isSubstantialChange = substantialEdits.some(substantialEdit => 
                            substantialEdit.lineStart === edit.lineStart && 
                            substantialEdit.lineEnd === edit.lineEnd
                        );
                        
                        if (isSubstantialChange) {
                            console.log(`  ⚡ Substantial change detected in chunk ${chunk.id}`);
                            isAffected = true;
                            affectedChunkIds.add(chunk.id);
                            break;
                        } else {
                            console.log(`  ✨ Subtle change detected in chunk ${chunk.id}`);
                            // This is just formatting/whitespace change within the chunk
                            hasSubtleChanges = true;
                        }
                    }
                    
                    // Calculate line offset for chunks that come after edits
                    if (editEnd < chunkStart) {
                        if (edit.type === 'added') {
                            lineOffset += (editEnd - editStart + 1);
                        } else if (edit.type === 'removed') {
                            lineOffset -= (editEnd - editStart + 1);
                        }
                    }
                }
                
                console.log(`  📊 Chunk ${chunk.id} analysis: isAffected=${isAffected}, hasSubtleChanges=${hasSubtleChanges}, lineOffset=${lineOffset}`);
                
                // Always try to recalculate range if there are any changes affecting this chunk
                // This includes: substantial changes, subtle changes, or position offset
                if (isAffected || hasSubtleChanges || lineOffset !== 0) {
                    try {
                        // Try to recalculate the range for this chunk's content in the new code
                        const newRange = calculateCodeChunkRange(currentContent, chunk.content);
                        
                        console.log(`  🔄 Recalculated range for chunk ${chunk.id}: [${chunk.range[0]}, ${chunk.range[1]}] -> [${newRange[0]}, ${newRange[1]}]`);
                        console.log(`  📝 Chunk content preview:`, chunk.content.substring(0, 100).replace(/\n/g, '\\n'));
                        
                        // If we can find the chunk content with a different range, update it
                        if (newRange[0] !== chunk.range[0] || newRange[1] !== chunk.range[1]) {
                            console.log(`📏 Detected range changes in chunk ${chunk.id}: [${chunk.range[0]}, ${chunk.range[1]}] -> [${newRange[0]}, ${newRange[1]}]`);
                            
                            // If this chunk was marked as affected (substantial changes), keep it there
                            if (!isAffected) {
                                // This is a subtle change or position change
                                subtlyAffectedChunks.push({
                                    chunkId: chunk.id,
                                    newRange: newRange
                                });
                                console.log(`  ✅ Added chunk ${chunk.id} to subtlyAffectedChunks`);
                            } else {
                                console.log(`  ⚡ Chunk ${chunk.id} has range changes but will be handled by LLM due to substantial changes`);
                            }
                        } else {
                            console.log(`  ❓ Chunk ${chunk.id} range unchanged despite detected changes - investigating...`);
                            
                            // Additional debugging: let's check what exactly changed
                            if (hasSubtleChanges) {
                                const overlappingEdits = realEdits.filter(edit => {
                                    const chunkStart = chunk.range[0];
                                    const chunkEnd = chunk.range[1];
                                    return chunkStart <= edit.lineEnd && chunkEnd >= edit.lineStart;
                                });
                                console.log(`  🔍 Overlapping edits for chunk ${chunk.id}:`, overlappingEdits.map(e => ({
                                    type: e.type,
                                    lines: `${e.lineStart}-${e.lineEnd}`,
                                    content: e.content.replace(/\n/g, '\\n')
                                })));
                            }
                            
                            if (!isAffected && lineOffset !== 0) {
                                // Range calculation didn't detect changes but we know there's an offset
                                // This handles edge cases where calculateCodeChunkRange doesn't detect the change
                                unaffectedChunks.push({
                                    chunkId: chunk.id,
                                    newRange: [
                                        chunk.range[0] + lineOffset,
                                        chunk.range[1] + lineOffset
                                    ]
                                });
                                console.log(`  📍 Added chunk ${chunk.id} to unaffectedChunks with offset (range calc failed to detect change)`);
                            }
                        }
                    } catch (rangeError) {
                        console.warn(`⚠️ Could not recalculate range for chunk ${chunk.id}:`, rangeError);
                        
                        if (!isAffected) {
                            // If we can't recalculate the range but we know there are changes, 
                            // treat as affected if there were substantial edits, otherwise use offset
                            if (hasSubtleChanges && substantialEdits.length > 0) {
                                isAffected = true;
                                affectedChunkIds.add(chunk.id);
                                console.log(`  ⚠️ Chunk ${chunk.id} moved to affectedChunkIds due to range calculation failure`);
                            } else if (lineOffset !== 0) {
                                // Fallback to simple offset calculation
                                unaffectedChunks.push({
                                    chunkId: chunk.id,
                                    newRange: [
                                        chunk.range[0] + lineOffset,
                                        chunk.range[1] + lineOffset
                                    ]
                                });
                                console.log(`  📍 Chunk ${chunk.id} added to unaffectedChunks with fallback offset`);
                            }
                        }
                    }
                }
            }

            console.log("📍 Code chunks analysis:", {
                affected: Array.from(affectedChunkIds),
                subtlyAffected: subtlyAffectedChunks.map(c => c.chunkId),
                unaffectedWithNewPositions: unaffectedChunks.map(c => c.chunkId)
            });

            // Find which steps have affected code chunks
            const affectedStepIds = new Set<string>();
            
            for (const mapping of mappings) {
                if (mapping.codeChunkId && affectedChunkIds.has(mapping.codeChunkId) && mapping.stepId) {
                    affectedStepIds.add(mapping.stepId);
                }
            }

            console.log("🎯 Steps affected by code changes:", Array.from(affectedStepIds));

            // Update Redux state
            if (affectedStepIds.size > 0) {
                dispatch(markStepsCodeDirty({
                    stepIds: Array.from(affectedStepIds)
                }));
                
                // Create a formatted diff string for LLM using only substantial edits
                const formattedDiff = substantialEdits.map(edit => {
                    const prefix = edit.type === 'added' ? '+' : edit.type === 'removed' ? '-' : ' ';
                    return `${prefix} ${edit.content.trim()}`;
                }).join('\n');
                
                // After marking steps as code_dirty, process the code updates
                console.log("🔄 Calling processCodeUpdates for dirty steps...");
                try {
                    await dispatch(processCodeUpdates({
                        currentFilePath,
                        previousContent: snapshot.content,
                        currentContent,
                        codeDiff: formattedDiff
                    })).unwrap();
                } catch (updateError) {
                    console.error("❌ Failed to process code updates:", updateError);
                    
                    // If processCodeUpdates fails, restore the affected steps to "generated" status
                    console.log("🔄 Restoring step status due to processCodeUpdates failure...");
                    for (const stepId of affectedStepIds) {
                        dispatch(setStepStatus({ stepId, status: "generated" }));
                    }
                    
                    // Re-throw the error so the UI can handle it
                    throw updateError;
                }
            } else if (substantialEdits.length > 0) {
                console.log("📝 Substantial code changes detected but no steps were affected");
            }
            
            // Update positions for unaffected chunks and subtly affected chunks
            if (unaffectedChunks.length > 0) {
                dispatch(updateCodeChunkPositions({
                    updates: unaffectedChunks
                }));
                console.log(`📏 Updated positions for ${unaffectedChunks.length} unaffected chunks`);
            }
            
            if (subtlyAffectedChunks.length > 0) {
                dispatch(updateCodeChunkPositions({
                    updates: subtlyAffectedChunks
                }));
                console.log(`🔧 Updated ranges for ${subtlyAffectedChunks.length} subtly affected chunks`);
            }

            console.log("✅ Code changes processed successfully:", {
                affectedSteps: affectedStepIds.size,
                repositionedChunks: unaffectedChunks.length,
                adjustedChunks: subtlyAffectedChunks.length,
                substantialEdits: substantialEdits.length,
                formattingEdits: formattingOnlyEdits.length
            });

        } catch (error) {
            console.error("❌ Error processing code changes:", error);
            throw new Error(`处理代码变化失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
);

// Process code updates when steps are marked as code_dirty
export const processCodeUpdates = createAsyncThunk<
    void,
    {
        currentFilePath: string;
        previousContent: string;
        currentContent: string;
        codeDiff: string;
    },
    ThunkApiType
>(
    "codeAware/processCodeUpdates",
    async ({ currentFilePath, previousContent, currentContent, codeDiff }, { getState, dispatch, extra }) => {
        try {
            const state = getState();
            const steps = state.codeAwareSession.steps;
            const mappings = state.codeAwareSession.codeAwareMappings;
            const codeChunks = state.codeAwareSession.codeChunks;
            
            // Find steps that are marked as code_dirty
            const codeDirtySteps = steps.filter(step => step.stepStatus === "code_dirty");
            
            if (codeDirtySteps.length === 0) {
                console.log("No code_dirty steps found, skipping update");
                return;
            }

            console.log("🔄 Processing code updates for dirty steps:", codeDirtySteps.map(s => s.id));

            // Disable code chunks and remove mappings for code_dirty steps
            for (const step of codeDirtySteps) {
                // Find all mappings related to this step (including knowledge cards)
                const relatedMappings = mappings.filter(mapping => 
                    mapping.stepId === step.id || 
                    (mapping.knowledgeCardId && mapping.knowledgeCardId.startsWith(`${step.id}-kc-`))
                );

                // Disable related code chunks
                relatedMappings.forEach(mapping => {
                    if (mapping.codeChunkId) {
                        dispatch(setCodeChunkDisabled({ 
                            codeChunkId: mapping.codeChunkId, 
                            disabled: true 
                        }));
                    }
                });

                // Remove mappings for this step
                dispatch(removeCodeAwareMappings({ stepId: step.id }));

                console.log(`🚫 Disabled ${relatedMappings.length} code chunks and removed mappings for step ${step.id}`);
            }

            // Prepare data for LLM call
            const relevantSteps = codeDirtySteps.map(step => ({
                id: step.id,
                title: step.title,
                abstract: step.abstract,
                knowledge_cards: step.knowledgeCards.map(kc => ({
                    id: kc.id,
                    title: kc.title
                }))
            }));

            const defaultModel = selectDefaultModel(state);
            if (!defaultModel) {
                throw new Error("Default model not defined");
            }

            // Call LLM to analyze code changes and update steps with retry mechanism
            const prompt = constructProcessCodeChangesPrompt(previousContent, currentContent, codeDiff, relevantSteps);
            const maxRetries = 3;
            let lastError: Error | null = null;
            let result: any = null;

            console.log("🤖 Calling LLM to process code changes...", prompt);
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔄 Attempt ${attempt}/${maxRetries} to call LLM...`);
                    
                    result = await extra.ideMessenger.request("llm/complete", {
                        prompt: prompt,
                        completionOptions: {},
                        title: defaultModel.title
                    });

                    if (result.status === "success" && result.content) {
                        console.log("✅ LLM request successful on attempt", attempt);
                        break;
                    } else {
                        throw new Error(`LLM request failed: status=${result.status}, hasContent=${!!result.content}`);
                    }
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed:`, lastError.message);
                    
                    if (attempt < maxRetries) {
                        // Wait before retry (exponential backoff)
                        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        console.log(`⏱️ Waiting ${waitTime}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }

            if (!result || result.status !== "success" || !result.content) {
                // If all retries failed, restore step status and throw error
                console.error("❌ All LLM retry attempts failed, restoring step status...");
                for (const step of codeDirtySteps) {
                    dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
                }
                throw new Error(`LLM request failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`);
            }

            console.log("LLM response for code update analysis:", result.content);

            // Parse LLM response with error handling
            try {
                const jsonResponse = JSON.parse(result.content);
                const updatedSteps = jsonResponse.updated_steps || [];
                const knowledgeCards = jsonResponse.knowledge_cards || [];

                console.log("✅ Code update analysis completed:", {
                    updatedStepsCount: updatedSteps.length,
                    knowledgeCardsCount: knowledgeCards.length,
                    stepsBroken: updatedSteps.filter((s: any) => s.code_broken).length
                });

                // Validate response structure
                if (!Array.isArray(updatedSteps) || !Array.isArray(knowledgeCards)) {
                    throw new Error("Invalid LLM response structure: expected arrays for updated_steps and knowledge_cards");
                }

                // Process updated steps
                let codeChunkCounter = state.codeAwareSession.codeChunks.length + 1;
                const newCodeChunks: CodeChunk[] = []; // 跟踪新创建的代码块

                for (const stepUpdate of updatedSteps) {
                    const stepId = stepUpdate.id;
                    
                    try {
                        // Check if step's code is broken
                        if (stepUpdate.code_broken) {
                            console.log(`� Step ${stepId} code is broken, marking as confirmed for regeneration`);
                            dispatch(setStepStatus({ stepId, status: "confirmed" }));
                            continue; // Skip further processing for this step as its code is broken
                        }

                        // Update step title and abstract if needed
                        if (stepUpdate.needs_update) {
                            if (stepUpdate.title) {
                                dispatch(setStepTitle({ stepId, title: stepUpdate.title }));
                            }
                            if (stepUpdate.abstract) {
                                dispatch(setStepAbstract({ stepId, abstract: stepUpdate.abstract }));
                            }
                            console.log(`📝 Updated step ${stepId}: title="${stepUpdate.title}", abstract updated`);
                        }

                        // Create new code chunk and mapping for the step
                        if (stepUpdate.corresponding_code && stepUpdate.corresponding_code.trim()) {
                            const stepCodeContent = stepUpdate.corresponding_code.trim();
                            const stepRange = calculateCodeChunkRange(currentContent, stepCodeContent);
                            const stepCodeChunkId = `c-${codeChunkCounter++}`;
                            
                            const newChunk: CodeChunk = {
                                id: stepCodeChunkId,
                                content: stepCodeContent,
                                range: stepRange,
                                filePath: currentFilePath,
                                disabled: false,
                                isHighlighted: false
                            };
                            
                            dispatch(createOrGetCodeChunk({
                                content: stepCodeContent,
                                range: stepRange,
                                filePath: currentFilePath,
                                id: stepCodeChunkId
                            }));
                            
                            // 添加到新代码块跟踪列表
                            newCodeChunks.push(newChunk);

                            // Find requirement chunk for mapping
                            const existingStepMapping = mappings.find(mapping => mapping.stepId === stepId && mapping.requirementChunkId);
                            const requirementChunkId = existingStepMapping?.requirementChunkId;

                            // Create step mapping
                            const stepMapping: CodeAwareMapping = {
                                codeChunkId: stepCodeChunkId,
                                stepId: stepId,
                                requirementChunkId: requirementChunkId,
                                isHighlighted: false
                            };
                            
                            dispatch(createCodeAwareMapping(stepMapping));
                            console.log(`🔗 Created new step mapping: ${stepCodeChunkId} -> ${stepId}`);
                        }

                        // Set step status to generated (only if code is not broken)
                        dispatch(setStepStatus({ stepId, status: "generated" }));
                    } catch (stepError) {
                        console.error(`❌ Error processing step ${stepId}:`, stepError);
                        // Set this step back to generated status if processing fails
                        dispatch(setStepStatus({ stepId, status: "generated" }));
                    }
                }

                // Process knowledge cards
                for (const cardUpdate of knowledgeCards) {
                    const cardId = cardUpdate.id;
                    const stepId = cardId.split('-kc-')[0]; // Extract step ID from card ID
                    
                    try {
                        if (cardUpdate.needs_update) {
                            // Update knowledge card title and clear content
                            if (cardUpdate.title) {
                                dispatch(updateKnowledgeCardTitle({
                                    stepId,
                                    cardId,
                                    title: cardUpdate.title
                                }));
                                console.log(`🏷️ Updated knowledge card title: ${cardId} -> "${cardUpdate.title}"`);
                            }

                            // Mark for content regeneration
                            dispatch(setKnowledgeCardGenerationStatus({ 
                                stepId, 
                                status: "generating" 
                            }));
                        }

                        // Create new code chunk and mapping for the knowledge card
                        if (cardUpdate.corresponding_code && cardUpdate.corresponding_code.trim()) {
                            const cardCodeContent = cardUpdate.corresponding_code.trim();
                            const cardRange = calculateCodeChunkRange(currentContent, cardCodeContent);
                            const cardCodeChunkId = `c-${codeChunkCounter++}`;
                            
                            const newKnowledgeCardChunk: CodeChunk = {
                                id: cardCodeChunkId,
                                content: cardCodeContent,
                                range: cardRange,
                                filePath: currentFilePath,
                                disabled: false,
                                isHighlighted: false
                            };
                            
                            dispatch(createOrGetCodeChunk({
                                content: cardCodeContent,
                                range: cardRange,
                                filePath: currentFilePath,
                                id: cardCodeChunkId
                            }));
                            
                            // 添加到新代码块跟踪列表
                            newCodeChunks.push(newKnowledgeCardChunk);

                            // Find requirement chunk for mapping
                            const existingCardMapping = mappings.find(mapping => mapping.knowledgeCardId === cardId);
                            const requirementChunkId = existingCardMapping?.requirementChunkId;

                            // Create knowledge card mapping
                            const cardMapping: CodeAwareMapping = {
                                codeChunkId: cardCodeChunkId,
                                stepId,
                                knowledgeCardId: cardId,
                                requirementChunkId: requirementChunkId,
                                isHighlighted: false
                            };
                            
                            dispatch(createCodeAwareMapping(cardMapping));
                            console.log(`🎯 Created new knowledge card mapping: ${cardCodeChunkId} -> ${cardId}`);
                        }
                    } catch (cardError) {
                        console.error(`❌ Error processing knowledge card ${cardId}:`, cardError);
                        // Continue processing other cards even if one fails
                    }
                }

                console.log("✅ Code updates processed successfully");
                
                // 触发highlight事件，以code为source高亮更新的代码部分
                // 收集所有新创建的代码块用于highlight
                const codeHighlightEvents = newCodeChunks.map(chunk => ({
                    sourceType: "code" as const,
                    identifier: chunk.id,
                    additionalInfo: chunk
                }));
                
                if (codeHighlightEvents.length > 0) {
                    dispatch(updateHighlight(codeHighlightEvents));
                    console.log(`✨ 触发了 ${codeHighlightEvents.length} 个代码块的highlight事件`);
                }

            } catch (parseError) {
                console.error("Error parsing LLM response:", parseError);
                
                // Restore step status for all code_dirty steps
                console.log("🔄 Restoring step status for failed code update...");
                for (const step of codeDirtySteps) {
                    dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
                }
                
                throw new Error("解析LLM代码更新响应失败");
            }

        } catch (error) {
            console.error("❌ Error processing code updates:", error);
            
            // Restore step status for all code_dirty steps if any error occurs
            console.log("🔄 Restoring step status for all code_dirty steps due to error...");
            const currentState = getState();
            const currentSteps = currentState.codeAwareSession.steps;
            const currentCodeDirtySteps = currentSteps.filter(step => step.stepStatus === "code_dirty");
            
            for (const step of currentCodeDirtySteps) {
                dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
            }
            
            throw new Error(`处理代码更新失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
);

// Process SAQ submission - evaluate user answer using LLM
export const processSaqSubmission = createAsyncThunk<
    void,
    {
        testId: string;
        userAnswer: string;
    },
    ThunkApiType
>(
    "codeAware/processSaqSubmission",
    async ({ testId, userAnswer }, { getState, dispatch, extra }) => {
        try {
            const state = getState();
            
            // Get test information using the selector
            const testInfo = selectTestByTestId(state, testId);
            if (!testInfo || !testInfo.test) {
                console.error("❌ [CodeAware] Test not found for testId:", testId);
                return;
            }

            const { stepId, knowledgeCardId, test } = testInfo;
            
            if (test.question_type !== "shortAnswer") {
                console.error("❌ [CodeAware] Test is not a short answer question:", testId);
                return;
            }

            // Set loading state
            dispatch(setSaqTestLoading({
                stepId,
                knowledgeCardId,
                testId,
                isLoading: true
            }));

            console.log("🔄 [CodeAware] Evaluating SAQ answer for test:", testId);

            // Create prompt for LLM evaluation
            const prompt = constructEvaluateSaqAnswerPrompt(
                test.stem,
                test.standard_answer,
                userAnswer
            );

            // Get LLM response
            const result = await extra.ideMessenger.request("llm/complete", {
                prompt,
                completionOptions: {},
                title: "SAQ Answer Evaluation"
            });

            if (result.status !== "success" || !result.content) {
                throw new Error("LLM request failed");
            }

            console.log("📝 [CodeAware] LLM evaluation response:", result.content);

            // Parse the response
            try {
                const evaluationResult = JSON.parse(result.content.trim()) as {
                    isCorrect: boolean;
                    remarks: string;
                };

                // Update the test result in Redux store
                dispatch(updateSaqTestResult({
                    stepId,
                    knowledgeCardId,
                    testId,
                    userAnswer,
                    isCorrect: evaluationResult.isCorrect,
                    remarks: evaluationResult.remarks
                }));

                console.log("✅ [CodeAware] SAQ evaluation completed:", {
                    testId,
                    isCorrect: evaluationResult.isCorrect,
                    remarks: evaluationResult.remarks
                });

            } catch (parseError) {
                console.error("❌ [CodeAware] Failed to parse LLM evaluation response:", parseError);
                
                // Fallback: just save the user answer without evaluation
                dispatch(updateSaqTestResult({
                    stepId,
                    knowledgeCardId,
                    testId,
                    userAnswer,
                    isCorrect: false,
                    remarks: "无法评估答案，请稍后重试。"
                }));
            }

            // Clear loading state
            dispatch(setSaqTestLoading({
                stepId,
                knowledgeCardId,
                testId,
                isLoading: false
            }));

        } catch (error) {
            console.error("❌ [CodeAware] processSaqSubmission failed:", error);
            
            // Clear loading state on error
            const state = getState();
            const testInfo = selectTestByTestId(state, testId);
            if (testInfo) {
                dispatch(setSaqTestLoading({
                    stepId: testInfo.stepId,
                    knowledgeCardId: testInfo.knowledgeCardId,
                    testId,
                    isLoading: false
                }));
            }
            
            throw error;
        }
    }
);
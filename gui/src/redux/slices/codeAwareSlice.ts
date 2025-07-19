//CATODO: 参考着sessionSlice中chatHistory的实现方式加入codeaware的所有数据结构，包括UserIntent,UserMastery,Flow,KnowledgeCard,Quizzes
import {
    createSelector,
    createSlice,
    PayloadAction
} from '@reduxjs/toolkit';
import {
    CodeAwareMapping,
    CodeChunk,
    CollaborationStatus,
    HighlightEvent,
    KnowledgeCardGenerationStatus,
    KnowledgeCardItem,
    ProgramRequirement,
    RequirementChunk,
    StepItem,
    StepStatus
} from 'core';
import { v4 as uuidv4 } from "uuid";

// Import RootState for proper typing
import type { RootState } from '../store';

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

type CodeAwareSessionState = {
    currentSessionId: string;
    title: string;
    workspaceDirectory: string;
    //用户需求，用于记载一系列的需求调整
    userRequirement: ProgramRequirement | null;
    //学习目标
    learningGoal: string;
    //当前的flow
    steps: StepItem[];
    //当前的代码块
    codeChunks: CodeChunk[];
    //存储所有的Mapping，用于查找和触发相关元素的高亮，各个元素的高亮写在元素之中
    codeAwareMappings: CodeAwareMapping[];
    // IDE communication flags
    shouldClearIdeHighlights: boolean;
    codeChunksToHighlightInIde: CodeChunk[];
}

const initialCodeAwareState: CodeAwareSessionState = {
    currentSessionId: uuidv4(),
    title: "New CodeAware Session",
    workspaceDirectory: "", //CATODO: see how to get current workspace name
    userRequirement: {
        requirementDescription: "",
        requirementStatus: "empty",
        highlightChunks: []
    },
    learningGoal: "",
    steps: [],
    codeChunks: [],
    codeAwareMappings: [],
    shouldClearIdeHighlights: false,
    codeChunksToHighlightInIde: [],
}

export const codeAwareSessionSlice = createSlice({
    name: "codeAwareSession",
    initialState:initialCodeAwareState,
    reducers:{
        //CATODO: 模仿Chat.tsx中对于onEnter的sendInput函数，以及如何把属性传递给子组件，并且意识到不需要记录当前的text，而是记editor state
        setUserRequirementStatus: (state, action: PayloadAction<CollaborationStatus>) => {
            if (state.userRequirement) {
                state.userRequirement.requirementStatus = action.payload;
            }
        },
        setLearningGoal: (state, action: PayloadAction<string>) => {
            state.learningGoal = action.payload;
        },
        submitRequirementContent: (state, action: PayloadAction<string>) => {
            if (state.userRequirement) {
                state.userRequirement.requirementDescription = action.payload;
                // Initialize highlightChunks if it doesn't exist
                if (!state.userRequirement.highlightChunks) {
                    state.userRequirement.highlightChunks = [];
                }
            }
        },
        setGeneratedSteps: (state, action: PayloadAction<StepItem[]>) => {
            state.steps = action.payload;
        },
        setStepAbstract: (state, action: PayloadAction<{ stepId: string; abstract: string }>) => {
            const { stepId, abstract } = action.payload;
            const stepIndex = state.steps.findIndex(step => step.id === stepId);
            if (stepIndex !== -1) {  
                state.steps[stepIndex].abstract = abstract;
            }
        },
        setStepStatus: (state, action: PayloadAction<{ stepId: string; status: StepStatus }>) => {
            const { stepId, status } = action.payload;
            const stepIndex = state.steps.findIndex(step => step.id === stepId);
            if (stepIndex !== -1) {
                state.steps[stepIndex].stepStatus = status;
            }
        },
        setStepGeneratedUntil: (state, action: PayloadAction<string>) => {
            const stepId = action.payload;
            const stepIndex = state.steps.findIndex(step => step.id === stepId);
            for (let i = 0; i < stepIndex+1; i++) {
                state.steps[i].stepStatus = "generated";
            }
        },
        setKnowledgeCardGenerationStatus: (state, action: PayloadAction<{ stepId: string; status: KnowledgeCardGenerationStatus }>) => {
            const { stepId, status } = action.payload;
            const stepIndex = state.steps.findIndex(step => step.id === stepId);
            if (stepIndex !== -1) {
                state.steps[stepIndex].knowledgeCardGenerationStatus = status;
            }
        },
        updateRequirementHighlightChunks: (state, action: PayloadAction<RequirementChunk[]>) => {
            if (state.userRequirement) {
                // Initialize highlightChunks if it doesn't exist
                if (!state.userRequirement.highlightChunks) {
                    state.userRequirement.highlightChunks = [];
                }
                state.userRequirement.highlightChunks = action.payload;
            }
        },
        toggleRequirementChunkHighlight: (state, action: PayloadAction<string>) => {
            if (state.userRequirement?.highlightChunks) {
                // Initialize highlightChunks if it doesn't exist
                if (!state.userRequirement.highlightChunks) {
                    state.userRequirement.highlightChunks = [];
                }
                const chunk = state.userRequirement.highlightChunks.find(c => c.id === action.payload);
                if (chunk) {
                    chunk.isHighlighted = !chunk.isHighlighted;
                }
            }
        },
        newCodeAwareSession: (state) => {
            // Clear all highlights first
            codeAwareSessionSlice.caseReducers.clearAllHighlights(state);
            
            // Reset the state for a new CodeAware session
            state.currentSessionId = uuidv4();
            state.title = "New CodeAware Session";
            state.workspaceDirectory = ""; // Reset workspace directory
            state.userRequirement = {
                requirementDescription: "",
                requirementStatus: "empty",
                highlightChunks: []
            };
            state.learningGoal = "";
            state.steps = [];
            state.codeAwareMappings = [];
            state.codeChunks = [];
            state.shouldClearIdeHighlights = false;
            state.codeChunksToHighlightInIde = [];
        },
        clearAllHighlights: (state) => {
            // Reset highlight status for all mappings
            state.codeAwareMappings.forEach(mapping => {
                mapping.isHighlighted = false;
            });
            // Reset highlight status for all code chunks
            state.codeChunks.forEach(chunk => {
                chunk.isHighlighted = false;
            });
            // Reset highlight status for all requirement chunks
            if (state.userRequirement?.highlightChunks) {
                state.userRequirement.highlightChunks.forEach(chunk => {
                    chunk.isHighlighted = false;
                });
            }
            // Reset highlight status for all steps
            state.steps = state.steps.map(step => {
                return {
                    ...step,
                    isHighlighted: false,
                    knowledgeCards: step.knowledgeCards.map(card => ({
                        ...card,
                        isHighlighted: false
                    }))
                };
            });
            
            // Set flag to clear IDE highlights
            state.shouldClearIdeHighlights = true;
            state.codeChunksToHighlightInIde = [];
        },
        updateHighlight: (state, action: PayloadAction<HighlightEvent>) => {
            const { sourceType, identifier, additionalInfo } = action.payload;

            // Find all mappings that match the highlight event
            let matchedMappings: CodeAwareMapping[] = [];
            
            // First, try to match by identifier - collect all matching mappings
            for (const mapping of state.codeAwareMappings) {
                let isMatch = false;
                
                switch (sourceType) {
                    case "code":
                        isMatch = mapping.codeChunkId === identifier;
                        break;
                    case "requirement":
                        isMatch = mapping.requirementChunkId === identifier;
                        break;
                    case "step":
                        isMatch = mapping.stepId === identifier;
                        break;
                    case "knowledgeCard":
                        isMatch = mapping.knowledgeCardId === identifier;
                        break;
                }
                
                if (isMatch) {
                    matchedMappings.push(mapping);
                }
            }
            
            // If no match found by identifier and sourceType is "code", try meta search using additionalInfo
            if (matchedMappings.length === 0 && sourceType === "code" && additionalInfo) {
                const codeInfo = additionalInfo as CodeChunk;
                
                // Search through code chunks to find a match by line range and content
                for (const codeChunk of state.codeChunks) {
                    // Check if line ranges overlap or match
                    const rangesOverlap = (
                        codeInfo.range[0] <= codeChunk.range[1] &&
                        codeInfo.range[1] >= codeChunk.range[0]
                    );
                    
                    // Check if content matches (partial match allowed)
                    const contentMatches = codeChunk.content.includes(codeInfo.content) || 
                                         codeInfo.content.includes(codeChunk.content);
                    
                    if (rangesOverlap && contentMatches) {
                        // Find all mappings for this code chunk
                        const foundMappings = state.codeAwareMappings.filter(mapping => 
                            mapping.codeChunkId === codeChunk.id
                        );
                        matchedMappings.push(...foundMappings);
                    }
                }
            }
            
            // If mappings are found, update highlight status of all elements within them
            if (matchedMappings.length > 0) {
                // Clear all existing highlights using the dedicated reducer
                codeAwareSessionSlice.caseReducers.clearAllHighlights(state);

                // Collect unique IDs from all matched mappings to avoid duplicate highlighting
                const codeChunkIds = new Set<string>();
                const requirementChunkIds = new Set<string>();
                const stepIds = new Set<string>();
                const knowledgeCardIds = new Set<string>();

                matchedMappings.forEach(mapping => {
                    if (mapping.codeChunkId) codeChunkIds.add(mapping.codeChunkId);
                    if (mapping.requirementChunkId) requirementChunkIds.add(mapping.requirementChunkId);
                    if (mapping.stepId) stepIds.add(mapping.stepId);
                    if (mapping.knowledgeCardId) knowledgeCardIds.add(mapping.knowledgeCardId);
                });

                // Collect code chunks to highlight in IDE
                const codeChunksForIde: CodeChunk[] = [];

                // Update code chunk highlights
                codeChunkIds.forEach(codeChunkId => {
                    const codeChunk = state.codeChunks.find(chunk => chunk.id === codeChunkId);
                    if (codeChunk) {
                        codeChunk.isHighlighted = true;
                        codeChunksForIde.push(codeChunk);
                    }
                });

                // Set code chunks to highlight in IDE
                state.codeChunksToHighlightInIde = codeChunksForIde;
                state.shouldClearIdeHighlights = false;
                
                // Update requirement chunk highlights
                if (state.userRequirement?.highlightChunks) {
                    requirementChunkIds.forEach(requirementChunkId => {
                        const reqChunk = state.userRequirement?.highlightChunks?.find(
                            chunk => chunk.id === requirementChunkId
                        );
                        if (reqChunk) {
                            reqChunk.isHighlighted = true;
                        }
                    });
                }
                
                // Update step highlights
                stepIds.forEach(stepId => {
                    const stepIndex = state.steps.findIndex(step => step.id === stepId);
                    if (stepIndex !== -1) {
                        // Create a new step object to ensure React detects the change
                        state.steps[stepIndex] = {
                            ...state.steps[stepIndex],
                            isHighlighted: true
                        };
                    }
                });

                // Update knowledge card highlights (only for code and knowledgeCard sources)
                if (sourceType === "code" || sourceType === "knowledgeCard") {
                    knowledgeCardIds.forEach(knowledgeCardId => {
                        for (const step of state.steps) {
                            const knowledgeCard = step.knowledgeCards.find(
                                card => card.id === knowledgeCardId
                            );
                            if (knowledgeCard) {
                                knowledgeCard.isHighlighted = true;
                                break; // Found the knowledge card, no need to continue searching
                            }
                        }
                    });
                }

                // Update all matched mappings' highlight status
                matchedMappings.forEach(mapping => {
                    mapping.isHighlighted = true;
                });
            }
        },
        updateRequirementChunks: (state, action: PayloadAction<RequirementChunk[]>) => {
            if (state.userRequirement) { 
                // Initialize highlightChunks if it doesn't exist
                if (!state.userRequirement.highlightChunks) {
                    state.userRequirement.highlightChunks = [];
                }
                state.userRequirement.highlightChunks.push(...action.payload);
            }
        },
        updateCodeChunks: (state, action: PayloadAction<CodeChunk[]>) => {
            state.codeChunks.push(...action.payload);
        },
        updateCodeAwareMappings: (state, action: PayloadAction<CodeAwareMapping[]>) => {
            // 使用 Set 来高效检查重复的 mapping
            const existingMappingsSet = new Set(
                state.codeAwareMappings.map(mapping => 
                    `${mapping.codeChunkId || ''}-${mapping.requirementChunkId || ''}-${mapping.stepId || ''}-${mapping.knowledgeCardId || ''}`
                )
            );
            
            // 过滤出不重复的 mapping
            const newMappings = action.payload.filter(newMapping => {
                const mappingKey = `${newMapping.codeChunkId || ''}-${newMapping.requirementChunkId || ''}-${newMapping.stepId || ''}-${newMapping.knowledgeCardId || ''}`;
                return !existingMappingsSet.has(mappingKey);
            });
            
            state.codeAwareMappings.push(...newMappings);
        },
        setCodeAwareTitle: (state, action: PayloadAction<string>) => {
            state.title = action.payload;
        },
        resetIdeCommFlags: (state) => {
            state.shouldClearIdeHighlights = false;
            state.codeChunksToHighlightInIde = [];
        },
        // 设置知识卡片加载状态
        setKnowledgeCardLoading: (state, action: PayloadAction<{stepId: string, cardId: string, isLoading: boolean}>) => {
            const { stepId, cardId, isLoading } = action.payload;
            const step = state.steps.find(s => s.id === stepId);
            if (step) {
                const card = step.knowledgeCards.find(c => c.id === cardId);
                if (card) {
                    // 我们用一个特殊的标记来表示加载状态
                    if (isLoading) {
                        card.content = "::LOADING::";
                    }
                }
            }
        },
        // 更新知识卡片内容和测试题目
        updateKnowledgeCardContent: (state, action: PayloadAction<{
            stepId: string, 
            cardId: string, 
            content: string, 
            tests?: Array<{
                question_type: "shortAnswer" | "multipleChoice",
                question: {
                    stem: string,
                    standard_answer: string,
                    options?: string[]
                }
            }>
        }>) => {
            const { stepId, cardId, content, tests } = action.payload;
            const step = state.steps.find(s => s.id === stepId);
            if (step) {
                const card = step.knowledgeCards.find(c => c.id === cardId);
                if (card) {
                    card.content = content;
                    
                    // 更新测试题目
                    if (tests && tests.length > 0) {
                        card.tests = tests.map((test, index) => {
                            if (test.question_type === "shortAnswer") {
                                return {
                                    id: `${cardId}-test-${index}`,
                                    questionType: "shortAnswer" as const,
                                    question: {
                                        type: "shortAnswer" as const,
                                        stem: test.question.stem,
                                        standard_answer: test.question.standard_answer,
                                        answer: "",
                                        result: "unanswered" as const
                                    }
                                };
                            } else {
                                return {
                                    id: `${cardId}-test-${index}`,
                                    questionType: "multipleChoice" as const,
                                    question: {
                                        type: "multipleChoice" as const,
                                        stem: test.question.stem,
                                        standard_answer: test.question.standard_answer,
                                        options: test.question.options || [],
                                        answer: "",
                                        answerIndex: -1,
                                        result: "unanswered" as const
                                    }
                                };
                            }
                        });
                    }
                }
            }
        },
        // 设置知识卡片内容加载失败
        setKnowledgeCardError: (state, action: PayloadAction<{stepId: string, cardId: string, error: string}>) => {
            const { stepId, cardId, error } = action.payload;
            const step = state.steps.find(s => s.id === stepId);
            if (step) {
                const card = step.knowledgeCards.find(c => c.id === cardId);
                if (card) {
                    card.content = `加载失败: ${error}`;
                }
            }
        },
        // 设置知识卡片的禁用状态
        setKnowledgeCardDisabled: (state, action: PayloadAction<{stepId: string, cardId: string, disabled: boolean}>) => {
            const { stepId, cardId, disabled } = action.payload;
            const step = state.steps.find(s => s.id === stepId);
            if (step) {
                const card = step.knowledgeCards.find(c => c.id === cardId);
                if (card) {
                    card.disabled = disabled;
                }
            }
        },
        // 添加新的代码块（从autocomplete生成）
        addCodeChunkFromCompletion: (state, action: PayloadAction<{
            prefixCode: string;
            completionText: string;
            range: [number, number];
            filePath: string;
        }>) => {
            const { completionText, range, filePath } = action.payload;
            const newCodeChunk: CodeChunk = {
                id: `c-${state.codeChunks.length + 1}`,
                content: completionText,
                range: range,
                isHighlighted: false,
                filePath: filePath
            };
            state.codeChunks.push(newCodeChunk);
        },
        // 创建新的知识卡片（不包含content和tests）
        createKnowledgeCard: (state, action: PayloadAction<{
            stepId: string;
            cardId: string;
            theme: string;
        }>) => {
            const { stepId, cardId, theme } = action.payload;
            const step = state.steps.find(s => s.id === stepId);
            if (step) {
                const newCard: KnowledgeCardItem = {
                    id: cardId,
                    title: theme,
                    content: "",
                    tests: [],
                    isHighlighted: false,
                    disabled: false
                };
                step.knowledgeCards.push(newCard);
            }
        },
        // 创建新的mapping
        createCodeAwareMapping: (state, action: PayloadAction<CodeAwareMapping>) => {
            state.codeAwareMappings.push(action.payload);
        },
        resetSessionExceptRequirement: (state) => {
            // Clear all highlights first
            codeAwareSessionSlice.caseReducers.clearAllHighlights(state);
            // Reset everything except userRequirement and currentSessionId
            state.steps = [];
            state.codeChunks = [];
            state.codeAwareMappings = [];
            state.shouldClearIdeHighlights = false;
            state.codeChunksToHighlightInIde = [];
            
            // Keep userRequirement but ensure highlightChunks is initialized
            if (state.userRequirement && !state.userRequirement.highlightChunks) {
                state.userRequirement.highlightChunks = [];
            }
        }
    },
    selectors:{
        //CATODO: write all the selectors to fetch the data
        selectCodeChunks: (state: CodeAwareSessionState) => {
            return state.codeChunks;
        },
        selectCodeAwareSessionState: (state: CodeAwareSessionState) => {
            return state;
        },
        selectIsRequirementInEditMode: (state: CodeAwareSessionState) => {
            // Requirement is in edit mode if it is either being edited or is empty
            if (!state.userRequirement) {
                return false; // If userRequirement is null, not in edit mode
            }
            return state.userRequirement.requirementStatus === "editing" || state.userRequirement.requirementStatus === "empty" || state.userRequirement.requirementStatus === "paraphrasing";
        },
        selectIsStepsGenerated: (state: CodeAwareSessionState) => {
            return state.userRequirement?.requirementStatus === "finalized" && state.steps.length > 0;
        },
        selectCurrentStep: (state: CodeAwareSessionState) => {
            // 根据step中的状态获取下一个待生成的步骤
            const currentStepIndex = state.steps.findIndex(step => step.stepStatus === "editing" || step.stepStatus === "confirmed");
            if (currentStepIndex !== -1) {
                return state.steps[currentStepIndex];
            }
            return null; // 如果没有找到当前步骤，则返回null
        },
        selectCanExecuteUntilStep: (state: CodeAwareSessionState, stepId: string) => {
            //如果截止到为stepId为止的步骤都已经generated或者confirmed，则可以执行
            const stepIndex = state.steps.findIndex(step => step.id === stepId);
            if (stepIndex === -1) {
                return false; // 如果没有找到该步骤，则不能执行
            }
            // 检查所有之前的步骤是否都已经生成或确认
            for (let i = 0; i <= stepIndex; i++) {
                if (state.steps[i].stepStatus !== "generated" && state.steps[i].stepStatus !== "confirmed") {
                    return false; // 只要有一个步骤没有生成或确认，就不能执行
                }
            }
            return true; // 所有之前的步骤都已经生成或确认，可以执行
        },
        selectLearningGoal: (state: CodeAwareSessionState) => {
            return state.learningGoal;
        },
        selectTask: (state: CodeAwareSessionState) => {
            // 返回session的任务信息
            return state.userRequirement;
        }
    }
});

// Create memoized selectors outside of the slice to prevent re-renders
export const selectRequirementHighlightChunks = createSelector(
    (state: RootState) => state.codeAwareSession.userRequirement?.highlightChunks,
    (highlightChunks): RequirementChunk[] => highlightChunks || []
);

export const selectRequirementText = createSelector(
    (state: RootState) => state.codeAwareSession.userRequirement?.requirementDescription,
    (requirementDescription): string => requirementDescription || ""
);

export const {
    setUserRequirementStatus,
    submitRequirementContent,
    setGeneratedSteps,
    updateRequirementHighlightChunks,
    toggleRequirementChunkHighlight,
    newCodeAwareSession,
    resetSessionExceptRequirement,
    clearAllHighlights,
    updateHighlight,
    updateRequirementChunks,
    updateCodeChunks,
    updateCodeAwareMappings,
    setCodeAwareTitle,
    setLearningGoal,
    resetIdeCommFlags,
    setKnowledgeCardLoading,
    updateKnowledgeCardContent,
    setKnowledgeCardError,
    setKnowledgeCardDisabled,
    addCodeChunkFromCompletion,
    createKnowledgeCard,
    createCodeAwareMapping,
    setStepStatus,
    setStepGeneratedUntil,
    setKnowledgeCardGenerationStatus,
    setStepAbstract
} = codeAwareSessionSlice.actions

export const {
    selectCodeChunks,
    selectCodeAwareSessionState,
    selectIsRequirementInEditMode,
    selectIsStepsGenerated,
    selectCurrentStep,
    selectLearningGoal,
    selectTask,
    selectCanExecuteUntilStep,
    selectGenerationContextUntilStep,
    selectStepKnowledgeCardThemes
} = codeAwareSessionSlice.selectors

export default codeAwareSessionSlice.reducer;



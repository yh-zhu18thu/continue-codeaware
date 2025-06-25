//CATODO: 参考着sessionSlice中chatHistory的实现方式加入codeaware的所有数据结构，包括UserIntent,UserMastery,Flow,KnowledgeCard,Quizzes
import {
    createSlice,
    PayloadAction
} from '@reduxjs/toolkit';
import {
    CodeAwareMapping,
    CodeAwareMetadata,
    CodeChunk,
    CollaborationStatus,
    HighlightEvent,
    ProgramRequirement,
    RequirementChunk,
    StepItem
} from 'core';
import { v4 as uuidv4 } from "uuid";

type CodeAwareSessionState = {
    currentSessionId: string;
    allSessionMetaData: CodeAwareMetadata[];
    title: string;
    workspaceDirectory: string;
    //用户需求与当前水平
    userRequirement: ProgramRequirement | null;
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
    allSessionMetaData: [],
    title: "New CodeAware Session",
    workspaceDirectory: "", //CATODO: see how to get current workspace name
    userRequirement: {
        requirementDescription: "",
        requirementStatus: "empty",
        highlightChunks: []
    },
    steps: [],
    codeChunks: [],
    codeAwareMappings: [],
    shouldClearIdeHighlights: false,
    codeChunksToHighlightInIde: []
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
        submitRequirementContent: (state, action: PayloadAction<string>) => {
            if (state.userRequirement) {
                state.userRequirement.requirementDescription = action.payload;
            }
        },
        setGeneratedSteps: (state, action: PayloadAction<StepItem[]>) => {
            state.steps = action.payload;
        },
        updateRequirementHighlightChunks: (state, action: PayloadAction<RequirementChunk[]>) => {
            if (state.userRequirement) {
                state.userRequirement.highlightChunks = action.payload;
            }
        },
        toggleRequirementChunkHighlight: (state, action: PayloadAction<string>) => {
            if (state.userRequirement?.highlightChunks) {
                const chunk = state.userRequirement.highlightChunks.find(c => c.id === action.payload);
                if (chunk) {
                    chunk.isHighlighted = !chunk.isHighlighted;
                }
            }
        },
        newCodeAwareSession: (state) => {
            // Reset the state for a new CodeAware session
            state.currentSessionId = uuidv4();
            state.allSessionMetaData = [];
            state.title = "New CodeAware Session";
            state.workspaceDirectory = ""; // Reset workspace directory
            state.userRequirement = {
                requirementDescription: "",
                requirementStatus: "empty"
            };
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
            state.steps.forEach(step => {
                step.isHighlighted = false;
                // Reset highlight status for all knowledge cards in the step
                step.knowledgeCards.forEach(card => {
                    card.isHighlighted = false;
                });
            });
            
            // Set flag to clear IDE highlights
            state.shouldClearIdeHighlights = true;
            state.codeChunksToHighlightInIde = [];
        },
        updateHighlight: (state, action: PayloadAction<HighlightEvent>) => {
            const { sourceType, identifier, additionalInfo } = action.payload;

            console.log("Updating highlight for:", sourceType, identifier, additionalInfo);
            
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
                        codeInfo.lineRange[0] <= codeChunk.lineRange[1] &&
                        codeInfo.lineRange[1] >= codeChunk.lineRange[0]
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

            console.log("current mappings");
            for (const mapping of state.codeAwareMappings) {
                console.log("mappings: ",mapping.codeChunkId, mapping.requirementChunkId, mapping.stepId, mapping.knowledgeCardId);
            }
            
            // If mappings are found, update highlight status of all elements within them
            if (matchedMappings.length > 0) {
                console.log("Matched mappings found:", matchedMappings.length);

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
                    const step = state.steps.find(step => step.id === stepId);
                    if (step) {
                        step.isHighlighted = true;
                    }
                });

                // Update knowledge card highlights
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

                console.log("Highlight updated for", matchedMappings.length, "mappings");
                // Update all matched mappings' highlight status
                matchedMappings.forEach(mapping => {
                    mapping.isHighlighted = true;
                });
            }
        },
        updateRequirementChunks: (state, action: PayloadAction<RequirementChunk[]>) => {
            if (state.userRequirement) {
                state.userRequirement.highlightChunks = action.payload;
            }
            console.log("RequirementChunks updated:", state.userRequirement?.highlightChunks);
        },
        updateCodeChunks: (state, action: PayloadAction<CodeChunk[]>) => {
            state.codeChunks = action.payload;
            console.log("CodeChunks updated:", state.codeChunks);
        },
        updateCodeAwareMappings: (state, action: PayloadAction<CodeAwareMapping[]>) => {
            state.codeAwareMappings = action.payload;
            console.log("CodeAwareMappings updated:", state.codeAwareMappings);
        },
        resetIdeCommFlags: (state) => {
            state.shouldClearIdeHighlights = false;
            state.codeChunksToHighlightInIde = [];
        }
    },
    selectors:{
        //CATODO: write all the selectors to fetch the data
        selectIsRequirementInEditMode: (state: CodeAwareSessionState) => {
            // Requirement is in edit mode if it is either being edited or is empty
            if (!state.userRequirement) {
                return false; // If userRequirement is null, not in edit mode
            }
            return state.userRequirement.requirementStatus === "editing" || state.userRequirement.requirementStatus === "empty" || state.userRequirement.requirementStatus === "paraphrasing";
        },
        selectIsStepsGenerated: (state: CodeAwareSessionState) => {
            return state.userRequirement?.requirementStatus === "finalized" && state.steps.length > 0;
        }
    }
});

export const {
    setUserRequirementStatus,
    submitRequirementContent,
    setGeneratedSteps,
    updateRequirementHighlightChunks,
    toggleRequirementChunkHighlight,
    newCodeAwareSession,
    clearAllHighlights,
    updateHighlight,
    updateRequirementChunks,
    updateCodeChunks,
    updateCodeAwareMappings,
    resetIdeCommFlags
} = codeAwareSessionSlice.actions

export const {
    selectIsRequirementInEditMode,
    selectIsStepsGenerated
} = codeAwareSessionSlice.selectors

export default codeAwareSessionSlice.reducer;

 

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
    codeMappings: CodeAwareMapping[];
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
    codeMappings: []
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
            state.codeMappings = [];
            state.codeChunks = [];

        },
        updateHighlight: (state, action: PayloadAction<HighlightEvent>) => {
            const { sourceType, identifier, additionalInfo } = action.payload;
            
            // Find the mapping that matches the highlight event
            let matchedMapping: CodeAwareMapping | null = null;
            
            // First, try to match by identifier
            for (const mapping of state.codeMappings) {
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
                    matchedMapping = mapping;
                    break;
                }
            }
            
            // If no match found by identifier and sourceType is "code", try meta search using additionalInfo
            if (!matchedMapping && sourceType === "code" && additionalInfo) {
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
                        // Find the mapping for this code chunk
                        const foundMapping = state.codeMappings.find(mapping => 
                            mapping.codeChunkId === codeChunk.id
                        );
                        if (foundMapping) {
                            matchedMapping = foundMapping;
                            break;
                        }
                    }
                }
            }
            
            // If a mapping is found, update highlight status of all elements within it
            if (matchedMapping) {
                // Update code chunk highlight
                const codeChunk = state.codeChunks.find(chunk => chunk.id === matchedMapping.codeChunkId);
                if (codeChunk) {
                    codeChunk.isHighlighted = true;
                    // TODO: Need to communicate code element highlighting to IDE/editor
                }
                
                // Update requirement chunk highlight
                if (state.userRequirement?.highlightChunks) {
                    const reqChunk = state.userRequirement.highlightChunks.find(
                        chunk => chunk.id === matchedMapping.requirementChunkId
                    );
                    if (reqChunk) {
                        reqChunk.isHighlighted = true;
                    }
                }
                
                // Update step highlight
                const step = state.steps.find(step => step.id === matchedMapping.stepId);
                if (step) {
                    step.isHighlighted = true;
                    
                    // Update knowledge card highlight if it exists
                    if (matchedMapping.knowledgeCardId) {
                        const knowledgeCard = step.knowledgeCards.find(
                            card => card.id === matchedMapping.knowledgeCardId
                        );
                        if (knowledgeCard) {
                            knowledgeCard.isHighlighted = true;
                        }
                    }
                }
                
                // Update the mapping's highlight status
                matchedMapping.isHighlighted = true;
            }
        }
    },
    selectors:{
        //CATODO: write all the selectors to fetch the data
        selectIsRequirementInEditMode: (state: CodeAwareSessionState) => {
            // Requirement is in edit mode if it is either being edited or is empty
            if (!state.userRequirement) {
                return false; // If userRequirement is null, not in edit mode
            }
            return state.userRequirement.requirementStatus === "editing" || state.userRequirement.requirementStatus === "empty";
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
    newCodeAwareSession,
    updateHighlight
} = codeAwareSessionSlice.actions

export const {
    selectIsRequirementInEditMode,
    selectIsStepsGenerated
} = codeAwareSessionSlice.selectors

export default codeAwareSessionSlice.reducer;

 

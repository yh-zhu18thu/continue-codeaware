//CATODO: 参考着sessionSlice中chatHistory的实现方式加入codeaware的所有数据结构，包括UserIntent,UserMastery,Flow,KnowledgeCard,Quizzes
import {
    createSlice,
    PayloadAction
} from '@reduxjs/toolkit';
import {
    CodeAwareMetadata,
    CollaborationStatus,
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
    currentHighlightKeywords: string[]; //当前需要高亮的requirement关键词，通过当前currentFocusedFlowId查询userRequirement得到
    //当前的flow
    steps: StepItem[];
    currentFocusedFlowId: string | null;
    //当前的知识卡片
    currentFocusedKnowledgeCardId: string | null;
}

const initialCodeAwareState: CodeAwareSessionState = {
    currentSessionId: uuidv4(),
    allSessionMetaData: [],
    title: "New CodeAware Session",
    workspaceDirectory: "", //CATODO: see how to get current workspace name
    userRequirement: {
        requirementDescription: "",
        requirementStatus: "empty"
    },
    currentHighlightKeywords: [],
    steps: [],
    currentFocusedFlowId: null,
    currentFocusedKnowledgeCardId: null,
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
            state.currentHighlightKeywords = [];
            state.steps = [];
            state.currentFocusedFlowId = null;
            state.currentFocusedKnowledgeCardId = null;
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
    newCodeAwareSession
} = codeAwareSessionSlice.actions

export const {
    selectIsRequirementInEditMode,
    selectIsStepsGenerated
} = codeAwareSessionSlice.selectors

export default codeAwareSessionSlice.reducer;

 

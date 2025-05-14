//CATODO: 参考着sessionSlice中chatHistory的实现方式加入codeaware的所有数据结构，包括UserIntent,UserMastery,Flow,KnowledgeCard,Quizzes
import {
    createSlice,
    PayloadAction
} from '@reduxjs/toolkit';
import {
    CodeAwareMetadata,
    CollaborationStatus,
    FlowItem,
    KnowledgeCardItem,
    ProgramRequirement,
    SelfTestItem,
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
    flow: FlowItem[];
    currentFocusedFlowId: string | null;
    //当前的知识卡片
    knowledgeCards: KnowledgeCardItem[];
    currentFocusedKnowledgeCardId: string | null;
    //当前的自测题目
    selfTestItems: SelfTestItem[];
}

const initialCodeAwareState: CodeAwareSessionState = {
    currentSessionId: uuidv4(),
    allSessionMetaData: [],
    title: "New CodeAware Session",
    workspaceDirectory: "", //CATODO: see how to get current workspace name
    userRequirement: {
        requirementDescription: "",
        requirementStatus: "resting"
    },
    currentHighlightKeywords: [],
    flow: [],
    currentFocusedFlowId: null,
    knowledgeCards: [],
    currentFocusedKnowledgeCardId: null,
    selfTestItems: []
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
        setUserRequirementContent: (state, action: PayloadAction<string>) => {
            if (state.userRequirement) {
                state.userRequirement.requirementDescription = action.payload;
            }
        }
    },
    selectors:{
        //CATODO: write all the selectors to fetch the data
    }
});

export const {
    setUserRequirementStatus,
    setUserRequirementContent
} = codeAwareSessionSlice.actions

export const {

} = codeAwareSessionSlice.selectors

export default codeAwareSessionSlice.reducer;

 

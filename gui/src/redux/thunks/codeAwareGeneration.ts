import { createAsyncThunk } from "@reduxjs/toolkit";
import {
    ProgramRequirement
} from "core";
import { constructParaphraseUserIntentPrompt } from "core/llm/codeAwarePrompts";
import { setUserRequirementContent } from "../slices/codeAwareSlice";
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
            dispatch(setUserRequirementContent(result.content));
        
        } catch(error) {
            console.error("Error during LLM request:", error);
        throw new Error("Failed to fetch LLM response");
        //CATODO: 这里应该有一个UI提示，告诉用户请求失败了
        }


        // CATODO: 使用LLM返回的结果解析并构建更新知识卡片列表（参考Chat中的history，使用redux的套路来维护，用useAppSelector来绑定数据）
    }
);



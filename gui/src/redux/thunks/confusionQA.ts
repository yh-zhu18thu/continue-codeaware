import { createAsyncThunk } from "@reduxjs/toolkit";
import { constructGlobalQAResponsePrompt } from "../../../../core/llm/codeAwarePrompts";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import { ThunkApiType } from "../store";

/**
 * Generic confusion Q&A response thunk.
 * Used by all levels (knowledge card, step, global overlay) to get an AI response.
 * Unlike `respondToGlobalQA`, this does NOT modify globalQASession in Redux—
 * the ConfusionPanel component manages its own message state internally.
 */
export const respondToConfusionQA = createAsyncThunk<
  { response: string },
  {
    question: string;
    context: {
      level: "knowledge-card" | "step" | "global";
      stepId?: string;
      cardId?: string;
      /** Current content of the knowledge card (for KC-level) */
      currentContent?: string;
      /** Conversation history so far */
      conversationHistory: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
      learningGoal: string;
      taskDescription: string;
      currentCode?: string;
    };
  },
  ThunkApiType
>(
  "codeAware/respondToConfusionQA",
  async ({ question, context }, { getState, extra }) => {
    const state = getState();
    const defaultModel =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);
    if (!defaultModel) {
      throw new Error("没有可用的默认模型");
    }

    const steps = state.codeAwareSession.steps;

    // Build conversation history including the current question
    const fullHistory = [
      ...context.conversationHistory,
      { role: "user" as const, content: question },
    ];

    // Add contextual prefix for KC-level to guide the LLM
    if (context.level === "knowledge-card" && context.currentContent) {
      const contextMsg = `[Context: The user is asking about knowledge card content. Current card content:\n${context.currentContent.substring(0, 500)}${context.currentContent.length > 500 ? "..." : ""}]`;
      // Prepend system context as first message if not already present
      if (
        fullHistory.length <= 2 &&
        !fullHistory[0]?.content?.startsWith("[Context:")
      ) {
        fullHistory.unshift({
          role: "user" as const,
          content: contextMsg,
        });
      }
    }

    const allStepsInfo = steps.map((step) => ({
      id: step.id,
      title: step.title,
      abstract: step.abstract,
    }));

    const prompt = constructGlobalQAResponsePrompt(
      fullHistory,
      allStepsInfo,
      context.currentCode || "",
      context.taskDescription,
      context.learningGoal,
    );

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await extra.ideMessenger.request("llm/complete", {
          prompt,
          completionOptions: {},
          title: defaultModel.title,
        });

        if (
          result.status !== "success" ||
          !result.content ||
          !result.content.trim()
        ) {
          throw new Error("LLM 返回了空响应或失败状态");
        }

        const parsed = JSON.parse(result.content);
        const response =
          typeof parsed.response === "string"
            ? parsed.response
            : String(parsed.response || "");

        if (!response.trim()) {
          throw new Error("LLM 返回了空的 response 字段");
        }

        return { response };
      } catch (attemptError) {
        lastError =
          attemptError instanceof Error
            ? attemptError
            : new Error(String(attemptError));
        console.warn(
          `[CA:ConfusionQA] Response attempt ${attempt} failed:`,
          lastError.message,
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error("困惑问答回复生成失败");
  },
);

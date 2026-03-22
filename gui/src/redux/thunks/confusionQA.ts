import { createAsyncThunk } from "@reduxjs/toolkit";
import { ChatMessage } from "core";
import { renderChatMessage } from "core/util/messageContent";
import { constructConfusionQASystemPrompt } from "../../../../core/llm/codeAwarePrompts";
import { buildCodeAwareCognitiveEdges } from "../../utils/codeAwareRelationGraph";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import { ThunkApiType } from "../store";
import { buildMasteredRelatedContext } from "./masteryNodeUtils";

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

    const allStepsInfo = steps.map((step) => ({
      id: step.id,
      title: step.title,
      abstract: step.abstract,
    }));

    // Build mastered-related context for KC and step levels
    let masteredRelatedContext = "";
    if (
      context.level === "knowledge-card" &&
      context.stepId &&
      context.cardId
    ) {
      const step = steps.find((s) => s.id === context.stepId);
      const card = step?.knowledgeCards.find((k) => k.id === context.cardId);
      masteredRelatedContext = buildMasteredRelatedContext({
        linkedMasteryNodes: card?.linkedMasteryNodes,
        linkedKnowledgeNodeIds: card?.linkedKnowledgeNodeIds,
        edges: buildCodeAwareCognitiveEdges(state.codeAwareSession),
        nodeMasteryScores: state.codeAwareSession.nodeMasteryScores,
        knowledgePoints: state.codeAwareSession.knowledgePoints,
        codeChunks: state.codeAwareSession.codeChunks,
        steps: state.codeAwareSession.steps,
      });
    } else if (context.level === "step" && context.stepId) {
      // For step-level, use the step itself as center node
      masteredRelatedContext = buildMasteredRelatedContext({
        linkedMasteryNodes: [{ nodeId: context.stepId, nodeType: "step" }],
        edges: buildCodeAwareCognitiveEdges(state.codeAwareSession),
        nodeMasteryScores: state.codeAwareSession.nodeMasteryScores,
        knowledgePoints: state.codeAwareSession.knowledgePoints,
        codeChunks: state.codeAwareSession.codeChunks,
        steps: state.codeAwareSession.steps,
      });
    }
    // Global level: no mastered context

    // Build focus context for level-specific prompting
    let focusContext:
      | {
          level: "knowledge-card" | "step" | "global";
          cardTitle?: string;
          cardContent?: string;
          stepTitle?: string;
          stepAbstract?: string;
        }
      | undefined;

    if (
      context.level === "knowledge-card" &&
      context.stepId &&
      context.cardId
    ) {
      const step = steps.find((s) => s.id === context.stepId);
      const card = step?.knowledgeCards.find((k) => k.id === context.cardId);
      focusContext = {
        level: "knowledge-card",
        cardTitle: card?.title || "",
        cardContent: context.currentContent || card?.content || "",
        stepTitle: step?.title,
        stepAbstract: step?.abstract,
      };
    } else if (context.level === "step" && context.stepId) {
      const step = steps.find((s) => s.id === context.stepId);
      focusContext = {
        level: "step",
        stepTitle: step?.title || "",
        stepAbstract: step?.abstract || "",
      };
    }

    // Build system prompt (no conversation history — that goes into messages array)
    const systemPrompt = constructConfusionQASystemPrompt(
      allStepsInfo,
      context.currentCode || "",
      context.taskDescription,
      context.learningGoal,
      masteredRelatedContext || undefined,
      undefined,
      focusContext,
    );

    // Build multi-turn ChatMessage array: system + history + current question
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...context.conversationHistory.map(
        (msg) =>
          ({
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content,
          }) as ChatMessage,
      ),
      { role: "user", content: question },
    ];

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use multi-turn conversation API instead of single-prompt completion
        const abortController = new AbortController();
        const gen = extra.ideMessenger.llmStreamChat(
          {
            messages: chatMessages,
            completionOptions: {},
            title: defaultModel.title,
          },
          abortController.signal,
        );

        let accumulatedContent = "";
        let next = await gen.next();
        while (!next.done) {
          for (const msg of next.value) {
            accumulatedContent += renderChatMessage(msg);
          }
          next = await gen.next();
        }

        if (!accumulatedContent.trim()) {
          throw new Error("LLM 返回了空响应");
        }

        const parsed = JSON.parse(accumulatedContent);
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

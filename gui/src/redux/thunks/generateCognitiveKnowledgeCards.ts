import { createAsyncThunk } from "@reduxjs/toolkit";
import { planKnowledgeCards } from "../cognitive/cardPlanner";
import { IntentResolution } from "../cognitive/types";
import {
  createKnowledgeCard,
  setKnowledgeCardGenerationStatus,
} from "../slices/codeAwareSlice";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import { ThunkApiType } from "../store";

interface GeneratedCardPayload {
  title: string;
  question: string;
  linkedKnowledgeNodeIds: string[];
  assumedMasteredNodeIds?: string[];
}

function sanitizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function sanitizeNodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function abbreviateTitle(value: string | undefined): string {
  const text = (value || "").trim();
  if (!text) {
    return "N/A";
  }
  if (text.length <= 36) {
    return text;
  }
  return `${text.slice(0, 33)}...`;
}

function buildIntentFallback(stepId: string): IntentResolution {
  return {
    targetStepId: stepId,
    intentTypes: ["task-decomposition"],
    preferredInitialView: "read",
    reason: "phase_d_fallback",
  };
}

function buildGenerationPrompt(args: {
  taskDescription: string;
  learningGoal: string;
  stepTitle: string;
  stepAbstract: string;
  intent: IntentResolution;
  plans: Array<{
    linkedKnowledgeNodeIds: string[];
    assumedMasteredNodeIds: string[];
    intentTypes: IntentResolution["intentTypes"];
    knowledgeContext: string[];
  }>;
}): string {
  return [
    "You are generating cognition-aware learning cards for code understanding.",
    "Return strict JSON only: an array of objects with fields:",
    '[{"title": string, "question": string, "linkedKnowledgeNodeIds": string[], "assumedMasteredNodeIds": string[]}]',
    "Do not include markdown or additional keys.",
    "",
    `Task: ${args.taskDescription || "N/A"}`,
    `Learning goal: ${args.learningGoal || "N/A"}`,
    `Target step title: ${args.stepTitle}`,
    `Target step abstract: ${args.stepAbstract}`,
    `Intent types: ${args.intent.intentTypes.join(", ")}`,
    `Preferred initial view: ${args.intent.preferredInitialView}`,
    "",
    "Card plans to fulfill (one card per plan item):",
    JSON.stringify(args.plans, null, 2),
    "",
    "Rules:",
    "1. Each card title should be concise and non-duplicated.",
    "2. Each question should test understanding of the planned knowledge nodes.",
    "3. Keep linkedKnowledgeNodeIds aligned with the plan and avoid introducing unknown node IDs.",
    "4. assumedMasteredNodeIds can be empty when uncertain.",
  ].join("\n");
}

export const generateCognitiveKnowledgeCards = createAsyncThunk<
  { createdCount: number; plannedCount: number },
  {
    stepId: string;
    stepTitle: string;
    stepAbstract: string;
    learningGoal: string;
    maxCards: number;
    taskDescription?: string;
    existingThemes?: string[];
    intentOverride?: IntentResolution;
  },
  ThunkApiType
>(
  "codeAware/generateCognitiveKnowledgeCards",
  async (
    {
      stepId,
      stepTitle,
      stepAbstract,
      learningGoal,
      maxCards,
      taskDescription,
      existingThemes,
      intentOverride,
    },
    { dispatch, getState, extra },
  ) => {
    dispatch(
      setKnowledgeCardGenerationStatus({ stepId, status: "generating" }),
    );

    try {
      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      const intent =
        intentOverride ||
        (() => {
          const summary =
            state.codeAwareSession.cognitiveTrace.latestIntentByStep[stepId];
          if (!summary) {
            return buildIntentFallback(stepId);
          }
          return {
            targetStepId: stepId,
            intentTypes: summary.intentTypes,
            preferredInitialView: summary.preferredInitialView,
            reason: summary.reason,
          } as IntentResolution;
        })();

      const masteryMap = state.codeAwareSession.nodeMasteryScores.reduce(
        (acc, item) => {
          if (item.nodeType === "knowledge-point") {
            acc[item.nodeId] = item.score;
          }
          return acc;
        },
        {} as Record<string, number>,
      );

      const existingLinkedNodeIds = state.codeAwareSession.steps
        .find((step) => step.id === stepId)
        ?.knowledgeCards.flatMap((card) => card.linkedKnowledgeNodeIds ?? []);

      const plans = planKnowledgeCards({
        targetStepId: stepId,
        intent,
        masteryMap,
        knowledgeGraph: {
          knowledgePoints: state.codeAwareSession.knowledgePoints,
          knowledgeToStep: state.codeAwareSession.knowledgeToStepRelations,
          knowledgeRelations: state.codeAwareSession.knowledgeRelations,
        },
        maxCards,
        previouslyLinkedKnowledgeNodeIds: existingLinkedNodeIds,
      });

      const nodeDebugByPlan = plans.map((plan, index) => ({
        index,
        linkedNodes: plan.linkedKnowledgeNodeIds.map((nodeId) => ({
          nodeId,
          nodeTitleShort: abbreviateTitle(
            state.codeAwareSession.knowledgePoints.find((p) => p.id === nodeId)
              ?.title,
          ),
          mastery: Number((masteryMap[nodeId] ?? 0.5).toFixed(3)),
        })),
        assumedMasteredNodeIds: plan.assumedMasteredNodeIds,
        intentTypes: plan.intentTypes,
      }));

      console.info("[CodeAware][PhaseG][CardPlanner]", {
        tag: "CA_PHASE_G_CARD_PLAN",
        stepId,
        stepTitle,
        intentTypes: intent.intentTypes,
        preferredInitialView: intent.preferredInitialView,
        maxCards,
        plannedCards: plans.length,
        nodeDebugByPlan,
      });

      if (plans.length === 0) {
        dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "ready" }));
        return { createdCount: 0, plannedCount: 0 };
      }

      const knowledgeById = new Map(
        state.codeAwareSession.knowledgePoints.map((item) => [item.id, item]),
      );

      const planWithContext = plans.map((plan) => ({
        ...plan,
        knowledgeContext: plan.linkedKnowledgeNodeIds.map((id) => {
          const point = knowledgeById.get(id);
          return point
            ? `${point.id}: ${point.title} | ${point.content}`
            : `${id}: N/A`;
        }),
      }));

      const prompt = buildGenerationPrompt({
        taskDescription:
          taskDescription ||
          state.codeAwareSession.userRequirement?.requirementDescription ||
          "",
        learningGoal,
        stepTitle,
        stepAbstract,
        intent,
        plans: planWithContext,
      });

      const result = await extra.ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {},
        title: defaultModel.title,
      });

      if (result.status !== "success" || !result.content) {
        throw new Error("LLM request failed or returned empty content");
      }

      let generatedCards: GeneratedCardPayload[] = [];
      try {
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) {
          generatedCards = parsed.map((item, index) => {
            const fallbackPlan = plans[Math.min(index, plans.length - 1)];
            const fallbackTitle =
              fallbackPlan.linkedKnowledgeNodeIds
                .map((id) => knowledgeById.get(id)?.title || id)
                .join(" + ") || `Knowledge Card ${index + 1}`;

            return {
              title: sanitizeText(item?.title, fallbackTitle),
              question: sanitizeText(
                item?.question,
                `How does ${fallbackTitle} help this step?`,
              ),
              linkedKnowledgeNodeIds:
                sanitizeNodeIds(item?.linkedKnowledgeNodeIds).length > 0
                  ? sanitizeNodeIds(item?.linkedKnowledgeNodeIds)
                  : fallbackPlan.linkedKnowledgeNodeIds,
              assumedMasteredNodeIds:
                sanitizeNodeIds(item?.assumedMasteredNodeIds).length > 0
                  ? sanitizeNodeIds(item?.assumedMasteredNodeIds)
                  : fallbackPlan.assumedMasteredNodeIds,
            };
          });
        }
      } catch (error) {
        console.warn(
          "[CognitiveCards] parse failed, fallback to planner output",
          error,
        );
      }

      if (generatedCards.length === 0) {
        generatedCards = plans.map((plan, index) => {
          const titles = plan.linkedKnowledgeNodeIds
            .map((id) => knowledgeById.get(id)?.title || id)
            .slice(0, 2)
            .join(" + ");
          const title = titles || `Knowledge Card ${index + 1}`;

          return {
            title,
            question: `How does ${title} support ${stepTitle}?`,
            linkedKnowledgeNodeIds: plan.linkedKnowledgeNodeIds,
            assumedMasteredNodeIds: plan.assumedMasteredNodeIds,
          };
        });
      }

      const targetStep = state.codeAwareSession.steps.find(
        (step) => step.id === stepId,
      );
      const existingTitleSet = new Set([
        ...(existingThemes ?? []),
        ...(targetStep?.knowledgeCards.map((card) => card.title) ?? []),
      ]);

      let nextCardIndex = targetStep?.knowledgeCards.length ?? 0;
      let createdCount = 0;

      for (const generated of generatedCards) {
        if (existingTitleSet.has(generated.title)) {
          continue;
        }

        nextCardIndex += 1;
        const cardId = `${stepId}-kc-${nextCardIndex}`;
        dispatch(
          createKnowledgeCard({
            stepId,
            cardId,
            theme: generated.title,
            question: generated.question,
            viewMode: intent.preferredInitialView,
            linkedKnowledgeNodeIds: generated.linkedKnowledgeNodeIds,
            assumedMasteredNodeIds: generated.assumedMasteredNodeIds,
          }),
        );

        existingTitleSet.add(generated.title);
        createdCount += 1;
      }

      const createdCards = getState()
        .codeAwareSession.steps.find((step) => step.id === stepId)
        ?.knowledgeCards.slice(-(createdCount || 0))
        .map((card) => ({
          cardId: card.id,
          title: card.title,
          viewMode: card.viewMode,
          linkedNodes: (card.linkedKnowledgeNodeIds || []).map((nodeId) => ({
            nodeId,
            nodeTitleShort: abbreviateTitle(knowledgeById.get(nodeId)?.title),
            mastery: Number((masteryMap[nodeId] ?? 0.5).toFixed(3)),
          })),
        }));

      console.info("[CodeAware][PhaseG][CardGeneration]", {
        tag: "CA_PHASE_G_CARD_CREATED",
        stepId,
        createdCount,
        plannedCount: plans.length,
        intentTypes: intent.intentTypes,
        preferredInitialView: intent.preferredInitialView,
        createdCards,
      });

      dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "ready" }));

      return {
        createdCount,
        plannedCount: plans.length,
      };
    } catch (error) {
      dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
      throw error;
    }
  },
);

import { createAsyncThunk } from "@reduxjs/toolkit";
import { MasteryNodeRef } from "core";
import { planKnowledgeCards } from "../cognitive/cardPlanner";
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
  linkedMasteryNodes?: MasteryNodeRef[];
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

function sanitizeMasteryNodeRefs(value: unknown): MasteryNodeRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is { nodeId?: string; nodeType?: string } =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      nodeId: typeof item.nodeId === "string" ? item.nodeId.trim() : "",
      nodeType: item.nodeType as MasteryNodeRef["nodeType"],
    }))
    .filter(
      (item) =>
        Boolean(item.nodeId) &&
        ["step", "code-chunk", "background-knowledge", "situation"].includes(
          item.nodeType,
        ),
    );
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

function buildGenerationPrompt(args: {
  taskDescription: string;
  learningGoal: string;
  stepTitle: string;
  stepAbstract: string;
  plans: Array<{
    topCandidate: MasteryNodeRef;
    linkedMasteryNodes: MasteryNodeRef[];
    linkedKnowledgeNodeIds: string[];
    assumedMasteredNodeIds: string[];
    primaryUnmasteredNodeId?: string;
    nodeFocusPath: string[];
    knowledgeContext: string[];
    masteryContext: string[];
  }>;
}): string {
  return [
    "You are generating learning cards for code understanding.",
    "Return strict JSON only: an array of objects with fields:",
    '[{"title": string, "question": string, "linkedMasteryNodes": [{"nodeId": string, "nodeType": string}], "linkedKnowledgeNodeIds": string[], "assumedMasteredNodeIds": string[]}]',
    "Do not include markdown or additional keys.",
    "",
    `Task: ${args.taskDescription || "N/A"}`,
    `Learning goal: ${args.learningGoal || "N/A"}`,
    `Target step title: ${args.stepTitle}`,
    `Target step abstract: ${args.stepAbstract}`,
    "",
    "Card plans to fulfill (one card per plan item):",
    JSON.stringify(args.plans, null, 2),
    "",
    "Rules:",
    "1. Each card title should be concise and non-duplicated.",
    "2. Each card should focus on exactly one likely-unmastered core point (the topCandidate mastery node).",
    "3. Keep linkedMasteryNodes and linkedKnowledgeNodeIds aligned with the plan and avoid introducing unknown node IDs.",
    "4. assumedMasteredNodeIds can include multiple nodes and can be empty when uncertain.",
    "5. Question wording should clearly connect to the knowledge point's role in this step.",
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
    source?: "prerequisite" | "confusion" | "question";
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
      source = "prerequisite",
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

      const existingLinkedNodeKeys = state.codeAwareSession.steps
        .find((step) => step.id === stepId)
        ?.knowledgeCards.flatMap((card) => [
          ...(card.linkedMasteryNodes ?? []).map(
            (node) => `${node.nodeType}:${node.nodeId}`,
          ),
          ...(card.linkedKnowledgeNodeIds ?? []).map(
            (nodeId) => `background-knowledge:${nodeId}`,
          ),
        ]);

      const plans = planKnowledgeCards({
        targetStepId: stepId,
        masteryScores: state.codeAwareSession.nodeMasteryScores,
        knowledgeGraph: {
          knowledgePoints: state.codeAwareSession.knowledgePoints,
          knowledgeToStep: state.codeAwareSession.knowledgeToStepRelations,
          knowledgeToCodeChunk:
            state.codeAwareSession.knowledgeToCodeChunkRelations,
          codeAwareMappings: state.codeAwareSession.codeAwareMappings,
          knowledgeRelations: state.codeAwareSession.knowledgeRelations,
          codeChunks: state.codeAwareSession.codeChunks,
        },
        maxCards,
        previouslyLinkedNodeKeys: existingLinkedNodeKeys,
      });

      const masteryScoreMap = state.codeAwareSession.nodeMasteryScores.reduce(
        (acc, item) => {
          acc[`${item.nodeType}:${item.nodeId}`] = item.score;
          return acc;
        },
        {} as Record<string, number>,
      );

      const stepById = new Map(
        state.codeAwareSession.steps.map((item) => [item.id, item]),
      );
      const chunkById = new Map(
        state.codeAwareSession.codeChunks.map((item) => [item.id, item]),
      );

      const formatMasteryNodeTitle = (node: MasteryNodeRef): string => {
        if (node.nodeType === "background-knowledge") {
          return (
            state.codeAwareSession.knowledgePoints.find(
              (point) => point.id === node.nodeId,
            )?.title || node.nodeId
          );
        }

        if (node.nodeType === "step") {
          return stepById.get(node.nodeId)?.title || node.nodeId;
        }

        if (node.nodeType === "code-chunk") {
          const chunk = chunkById.get(node.nodeId);
          if (!chunk) {
            return node.nodeId;
          }
          return `${chunk.filePath}:${chunk.range[0]}-${chunk.range[1]}`;
        }

        if (node.nodeType === "situation") {
          return node.nodeId;
        }

        return node.nodeId;
      };

      const nodeDebugByPlan = plans.map((plan, index) => ({
        index,
        topCandidate: plan.topCandidate,
        linkedMasteryNodes: plan.linkedMasteryNodes.map((node) => ({
          ...node,
          nodeTitleShort: abbreviateTitle(formatMasteryNodeTitle(node)),
          mastery: Number(
            (masteryScoreMap[`${node.nodeType}:${node.nodeId}`] ?? 0.5).toFixed(
              3,
            ),
          ),
        })),
        linkedNodes: plan.linkedKnowledgeNodeIds.map((nodeId) => ({
          nodeId,
          nodeTitleShort: abbreviateTitle(
            state.codeAwareSession.knowledgePoints.find((p) => p.id === nodeId)
              ?.title,
          ),
          mastery: Number(
            (masteryScoreMap[`background-knowledge:${nodeId}`] ?? 0.5).toFixed(
              3,
            ),
          ),
        })),
        assumedMasteredNodeIds: plan.assumedMasteredNodeIds,
      }));

      console.info("[CA:Knowledge][CardPlanner]", {
        stepId,
        stepTitle,
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
        masteryContext: plan.linkedMasteryNodes.map((node) => {
          const title = formatMasteryNodeTitle(node);
          return `${node.nodeType}:${node.nodeId} | ${title}`;
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
              linkedMasteryNodes:
                sanitizeMasteryNodeRefs(item?.linkedMasteryNodes).length > 0
                  ? sanitizeMasteryNodeRefs(item?.linkedMasteryNodes)
                  : fallbackPlan.linkedMasteryNodes,
              assumedMasteredNodeIds:
                sanitizeNodeIds(item?.assumedMasteredNodeIds).length > 0
                  ? sanitizeNodeIds(item?.assumedMasteredNodeIds)
                  : fallbackPlan.assumedMasteredNodeIds,
            };
          });
        }
      } catch (error) {
        console.warn(
          "[CA:Knowledge] [CognitiveCards] parse failed, fallback to planner output",
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
            linkedMasteryNodes: plan.linkedMasteryNodes,
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
            viewMode: "read",
            linkedKnowledgeNodeIds: generated.linkedKnowledgeNodeIds,
            linkedMasteryNodes: generated.linkedMasteryNodes,
            assumedMasteredNodeIds: generated.assumedMasteredNodeIds,
            source,
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
            mastery: Number(
              (
                masteryScoreMap[`background-knowledge:${nodeId}`] ?? 0.5
              ).toFixed(3),
            ),
          })),
          linkedMasteryNodes: card.linkedMasteryNodes,
        }));

      console.info("[CA:Knowledge][CardGeneration]", {
        stepId,
        createdCount,
        plannedCount: plans.length,
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

import {
  KnowledgePoint,
  KnowledgeRelation,
  KnowledgeToStepRelation,
} from "core";
import { IntentResolution } from "./types";

export interface CardPlanItem {
  linkedKnowledgeNodeIds: string[];
  assumedMasteredNodeIds: string[];
  intentTypes: IntentResolution["intentTypes"];
}

interface CandidateNode {
  nodeId: string;
  baseIntentRelevance: number;
  mastery: number;
  novelty: number;
  priority: number;
  covers: Set<IntentResolution["intentTypes"][number]>;
}

const WEIGHTS = {
  intent: 0.45,
  gap: 0.4,
  novelty: 0.15,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildMasteryMap(raw: Record<string, number>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [id, score] of Object.entries(raw)) {
    map[id] = clamp(Number.isFinite(score) ? score : 0.5, 0, 1);
  }
  return map;
}

function deriveDirectKnowledgeIds(args: {
  targetStepId: string;
  knowledgeToStep: KnowledgeToStepRelation[];
  knowledgePoints: KnowledgePoint[];
}): Set<string> {
  const direct = new Set<string>();

  for (const rel of args.knowledgeToStep) {
    if (rel.stepId === args.targetStepId) {
      direct.add(rel.knowledgeId);
    }
  }

  if (direct.size === 0) {
    for (const point of args.knowledgePoints) {
      if (point.relatedStepIds.includes(args.targetStepId)) {
        direct.add(point.id);
      }
    }
  }

  return direct;
}

function expandOneHopKnowledgeIds(
  directIds: Set<string>,
  relations: KnowledgeRelation[],
): Set<string> {
  const expanded = new Set<string>(directIds);

  for (const rel of relations) {
    if (directIds.has(rel.fromKnowledgeId)) {
      expanded.add(rel.toKnowledgeId);
    }
    if (directIds.has(rel.toKnowledgeId)) {
      expanded.add(rel.fromKnowledgeId);
    }
  }

  return expanded;
}

function inferCoverageByIntent(args: {
  intent: IntentResolution;
  isDirect: boolean;
  hasPrerequisiteEdge: boolean;
}): Set<IntentResolution["intentTypes"][number]> {
  const covers = new Set<IntentResolution["intentTypes"][number]>();

  for (const intentType of args.intent.intentTypes) {
    if (args.isDirect) {
      covers.add(intentType);
      continue;
    }

    if (
      intentType === "prerequisite" ||
      intentType === "code-understanding" ||
      intentType === "function-mapping"
    ) {
      covers.add(intentType);
    }
  }

  if (
    args.hasPrerequisiteEdge &&
    args.intent.intentTypes.includes("prerequisite")
  ) {
    covers.add("prerequisite");
  }

  if (covers.size === 0 && args.intent.intentTypes.length > 0) {
    covers.add(args.intent.intentTypes[0]);
  }

  return covers;
}

function buildCandidates(args: {
  intent: IntentResolution;
  targetStepId: string;
  masteryMap: Record<string, number>;
  knowledgePoints: KnowledgePoint[];
  knowledgeToStep: KnowledgeToStepRelation[];
  knowledgeRelations: KnowledgeRelation[];
  previouslyLinkedKnowledgeNodeIds?: string[];
}): CandidateNode[] {
  const masteryMap = buildMasteryMap(args.masteryMap);
  const previouslyLinked = new Set(args.previouslyLinkedKnowledgeNodeIds ?? []);
  const knowledgeById = new Map(args.knowledgePoints.map((k) => [k.id, k]));

  const directIds = deriveDirectKnowledgeIds({
    targetStepId: args.targetStepId,
    knowledgeToStep: args.knowledgeToStep,
    knowledgePoints: args.knowledgePoints,
  });
  const expandedIds = expandOneHopKnowledgeIds(
    directIds,
    args.knowledgeRelations,
  );

  const candidates: CandidateNode[] = [];
  for (const nodeId of expandedIds) {
    if (!knowledgeById.has(nodeId)) {
      continue;
    }

    const isDirect = directIds.has(nodeId);
    const mastery = masteryMap[nodeId] ?? 0.5;
    const novelty = previouslyLinked.has(nodeId) ? 0.15 : 1;

    const hasPrerequisiteEdge = args.knowledgeRelations.some(
      (rel) =>
        rel.relationType === "prerequisite" &&
        (rel.fromKnowledgeId === nodeId || rel.toKnowledgeId === nodeId),
    );

    let intentRelevance = isDirect ? 1 : 0.6;
    if (
      hasPrerequisiteEdge &&
      args.intent.intentTypes.includes("prerequisite")
    ) {
      intentRelevance += 0.15;
    }
    intentRelevance = clamp(intentRelevance, 0, 1);

    const gap = 1 - mastery;
    const priority =
      WEIGHTS.intent * intentRelevance +
      WEIGHTS.gap * gap +
      WEIGHTS.novelty * novelty;

    candidates.push({
      nodeId,
      baseIntentRelevance: intentRelevance,
      mastery,
      novelty,
      priority,
      covers: inferCoverageByIntent({
        intent: args.intent,
        isDirect,
        hasPrerequisiteEdge,
      }),
    });
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}

function buildSupportNodes(args: {
  primaryNodeId: string;
  allCandidates: CandidateNode[];
  maxSupportCount: number;
}): string[] {
  const support = args.allCandidates
    .filter((candidate) => candidate.nodeId !== args.primaryNodeId)
    .sort((a, b) => {
      if (a.mastery !== b.mastery) {
        return a.mastery - b.mastery;
      }
      return b.priority - a.priority;
    })
    .slice(0, args.maxSupportCount)
    .map((candidate) => candidate.nodeId);

  return support;
}

export function planKnowledgeCards(args: {
  targetStepId: string;
  intent: IntentResolution;
  masteryMap: Record<string, number>;
  knowledgeGraph: {
    knowledgePoints: KnowledgePoint[];
    knowledgeToStep: KnowledgeToStepRelation[];
    knowledgeRelations: KnowledgeRelation[];
  };
  maxCards: number;
  previouslyLinkedKnowledgeNodeIds?: string[];
}): CardPlanItem[] {
  const abbreviate = (value?: string): string => {
    if (!value) {
      return "N/A";
    }
    const trimmed = value.trim();
    if (trimmed.length <= 32) {
      return trimmed;
    }
    return `${trimmed.slice(0, 29)}...`;
  };

  const knowledgeById = new Map(
    args.knowledgeGraph.knowledgePoints.map((item) => [item.id, item]),
  );

  const candidates = buildCandidates({
    intent: args.intent,
    targetStepId: args.targetStepId,
    masteryMap: args.masteryMap,
    knowledgePoints: args.knowledgeGraph.knowledgePoints,
    knowledgeToStep: args.knowledgeGraph.knowledgeToStep,
    knowledgeRelations: args.knowledgeGraph.knowledgeRelations,
    previouslyLinkedKnowledgeNodeIds: args.previouslyLinkedKnowledgeNodeIds,
  });

  if (candidates.length === 0) {
    return [];
  }

  const unresolvedIntents = new Set(args.intent.intentTypes);
  const maxCards = Math.max(1, Math.min(3, args.maxCards));
  const selected: CandidateNode[] = [];

  const remaining = [...candidates];
  while (remaining.length > 0 && selected.length < maxCards) {
    remaining.sort((a, b) => {
      const aNewCoverage = [...a.covers].filter((intent) =>
        unresolvedIntents.has(intent),
      ).length;
      const bNewCoverage = [...b.covers].filter((intent) =>
        unresolvedIntents.has(intent),
      ).length;
      if (aNewCoverage !== bNewCoverage) {
        return bNewCoverage - aNewCoverage;
      }
      return b.priority - a.priority;
    });

    const next = remaining.shift();
    if (!next) {
      break;
    }

    selected.push(next);
    for (const covered of next.covers) {
      unresolvedIntents.delete(covered);
    }

    if (unresolvedIntents.size === 0) {
      break;
    }
  }

  if (selected.length === 0) {
    selected.push(candidates[0]);
  }

  const plans = selected.map((candidate) => {
    const supportNodes = buildSupportNodes({
      primaryNodeId: candidate.nodeId,
      allCandidates: candidates,
      maxSupportCount: 1,
    });
    const linkedKnowledgeNodeIds = [candidate.nodeId, ...supportNodes];

    const assumedMasteredNodeIds = linkedKnowledgeNodeIds.filter((nodeId) => {
      const mastery = args.masteryMap[nodeId] ?? 0.5;
      return mastery >= 0.75;
    });

    return {
      linkedKnowledgeNodeIds,
      assumedMasteredNodeIds,
      intentTypes: [...candidate.covers],
    };
  });

  console.info("[CodeAware][PhaseG][PlannerSelection]", {
    tag: "CA_PHASE_G_PLANNER_SELECTION",
    targetStepId: args.targetStepId,
    intentTypes: args.intent.intentTypes,
    preferredInitialView: args.intent.preferredInitialView,
    maxCards,
    candidateCount: candidates.length,
    topCandidates: candidates.slice(0, 6).map((candidate) => ({
      nodeId: candidate.nodeId,
      nodeTitleShort: abbreviate(knowledgeById.get(candidate.nodeId)?.title),
      priority: Number(candidate.priority.toFixed(3)),
      mastery: Number(candidate.mastery.toFixed(3)),
      covers: [...candidate.covers],
    })),
    selectedPlans: plans.map((plan, index) => ({
      index,
      linkedNodes: plan.linkedKnowledgeNodeIds.map((nodeId) => ({
        nodeId,
        nodeTitleShort: abbreviate(knowledgeById.get(nodeId)?.title),
        mastery: Number((args.masteryMap[nodeId] ?? 0.5).toFixed(3)),
      })),
      assumedMasteredNodeIds: plan.assumedMasteredNodeIds,
      intentTypes: plan.intentTypes,
    })),
  });

  return plans;
}

import {
  CodeAwareMapping,
  KnowledgePoint,
  KnowledgeRelation,
  KnowledgeToCodeChunkRelation,
  KnowledgeToStepRelation,
} from "core";
import { IntentResolution } from "./types";

export interface CardPlanItem {
  linkedKnowledgeNodeIds: string[];
  assumedMasteredNodeIds: string[];
  intentTypes: IntentResolution["intentTypes"];
  primaryUnmasteredNodeId?: string;
  nodeFocusPath: string[];
}

interface CandidateNode {
  nodeId: string;
  source: string;
  mastery: number;
  priority: number;
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

function deriveStepKnowledgeIds(args: {
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

function deriveStepChunkIds(args: {
  targetStepId: string;
  codeAwareMappings: CodeAwareMapping[];
}): Set<string> {
  return new Set(
    args.codeAwareMappings
      .filter(
        (mapping) =>
          mapping.semanticElementType === "step" &&
          mapping.semanticElementId === args.targetStepId,
      )
      .map((mapping) => mapping.codeChunkId),
  );
}

function deriveCodeKnowledgeIds(args: {
  chunkIds: Set<string>;
  knowledgeToCodeChunk: KnowledgeToCodeChunkRelation[];
}): Set<string> {
  const ids = new Set<string>();
  args.knowledgeToCodeChunk.forEach((relation) => {
    if (args.chunkIds.has(relation.codeChunkId)) {
      ids.add(relation.knowledgeId);
    }
  });
  return ids;
}

function isPrerequisiteKnowledge(
  nodeId: string,
  relations: KnowledgeRelation[],
): boolean {
  return relations.some(
    (rel) =>
      rel.relationType === "prerequisite" &&
      (rel.fromKnowledgeId === nodeId || rel.toKnowledgeId === nodeId),
  );
}

function getFocusPaths(reason: string): string[] {
  switch (reason) {
    case "step_direct_expand":
    case "step_revisit":
      return [
        "step_prerequisite_knowledge",
        "framework_role_in_decomposition",
        "step_situation_to_code",
      ];
    case "highlevel_step_association_navigation":
      return [
        "framework_role_in_decomposition",
        "step_background_knowledge",
        "step_intent_to_code_mapping",
      ];
    case "step_to_code_navigation":
    case "highlevel_to_step_to_code_navigation":
      return [
        "step_situation_to_code",
        "code_prerequisite_knowledge",
        "code_syntax_knowledge",
      ];
    case "code_to_step_navigation":
      return [
        "code_situation_to_step",
        "code_syntax_knowledge",
        "code_prerequisite_knowledge",
      ];
    default:
      return [
        "step_background_knowledge",
        "step_prerequisite_knowledge",
        "step_situation_to_code",
      ];
  }
}

function scoreCandidate(args: {
  nodeId: string;
  source: string;
  intentBoost: number;
  masteryMap: Record<string, number>;
  previouslyLinked: Set<string>;
}): CandidateNode {
  const mastery = args.masteryMap[args.nodeId] ?? 0.5;
  const novelty = args.previouslyLinked.has(args.nodeId) ? 0.2 : 1;
  const gap = 1 - mastery;

  return {
    nodeId: args.nodeId,
    source: args.source,
    mastery,
    priority:
      WEIGHTS.intent * clamp(args.intentBoost, 0, 1) +
      WEIGHTS.gap * gap +
      WEIGHTS.novelty * novelty,
  };
}

function buildCandidates(args: {
  intent: IntentResolution;
  targetStepId: string;
  masteryMap: Record<string, number>;
  knowledgePoints: KnowledgePoint[];
  knowledgeToStep: KnowledgeToStepRelation[];
  knowledgeToCodeChunk: KnowledgeToCodeChunkRelation[];
  codeAwareMappings: CodeAwareMapping[];
  knowledgeRelations: KnowledgeRelation[];
  previouslyLinkedKnowledgeNodeIds?: string[];
}): CandidateNode[] {
  const masteryMap = buildMasteryMap(args.masteryMap);
  const previouslyLinked = new Set(args.previouslyLinkedKnowledgeNodeIds ?? []);
  const knowledgeById = new Map(args.knowledgePoints.map((k) => [k.id, k]));

  const stepKnowledgeIds = deriveStepKnowledgeIds({
    targetStepId: args.targetStepId,
    knowledgeToStep: args.knowledgeToStep,
    knowledgePoints: args.knowledgePoints,
  });
  const stepChunkIds = deriveStepChunkIds({
    targetStepId: args.targetStepId,
    codeAwareMappings: args.codeAwareMappings,
  });
  const codeKnowledgeIds = deriveCodeKnowledgeIds({
    chunkIds: stepChunkIds,
    knowledgeToCodeChunk: args.knowledgeToCodeChunk,
  });

  const expandedStepKnowledgeIds = expandOneHopKnowledgeIds(
    stepKnowledgeIds,
    args.knowledgeRelations,
  );
  const expandedCodeKnowledgeIds = expandOneHopKnowledgeIds(
    codeKnowledgeIds,
    args.knowledgeRelations,
  );

  const focusBuckets = getFocusPaths(args.intent.reason);
  const candidates: CandidateNode[] = [];

  const pushCandidate = (
    nodeId: string,
    source: string,
    intentBoost: number,
  ) => {
    if (!knowledgeById.has(nodeId)) {
      return;
    }
    candidates.push(
      scoreCandidate({
        nodeId,
        source,
        intentBoost,
        masteryMap,
        previouslyLinked,
      }),
    );
  };

  focusBuckets.forEach((focus, bucketIndex) => {
    const baseBoost = clamp(1 - bucketIndex * 0.18, 0.45, 1);

    if (focus === "step_prerequisite_knowledge") {
      expandedStepKnowledgeIds.forEach((nodeId) => {
        if (isPrerequisiteKnowledge(nodeId, args.knowledgeRelations)) {
          pushCandidate(nodeId, focus, baseBoost);
        }
      });
      return;
    }

    if (focus === "framework_role_in_decomposition") {
      expandedStepKnowledgeIds.forEach((nodeId) => {
        const point = knowledgeById.get(nodeId);
        if (point?.category === "framework" || point?.category === "concept") {
          pushCandidate(nodeId, focus, baseBoost);
        }
      });
      return;
    }

    if (focus === "step_background_knowledge") {
      expandedStepKnowledgeIds.forEach((nodeId) => {
        pushCandidate(nodeId, focus, baseBoost);
      });
      return;
    }

    if (
      focus === "step_situation_to_code" ||
      focus === "step_intent_to_code_mapping" ||
      focus === "code_situation_to_step"
    ) {
      expandedCodeKnowledgeIds.forEach((nodeId) => {
        pushCandidate(nodeId, focus, baseBoost);
      });
      return;
    }

    if (focus === "code_prerequisite_knowledge") {
      expandedCodeKnowledgeIds.forEach((nodeId) => {
        if (isPrerequisiteKnowledge(nodeId, args.knowledgeRelations)) {
          pushCandidate(nodeId, focus, baseBoost);
        }
      });
      return;
    }

    if (focus === "code_syntax_knowledge") {
      expandedCodeKnowledgeIds.forEach((nodeId) => {
        const point = knowledgeById.get(nodeId);
        if (point?.category === "syntax") {
          pushCandidate(nodeId, focus, baseBoost);
        }
      });
    }
  });

  const byNode = new Map<string, CandidateNode>();
  candidates.forEach((candidate) => {
    const existing = byNode.get(candidate.nodeId);
    if (!existing || candidate.priority > existing.priority) {
      byNode.set(candidate.nodeId, candidate);
    }
  });

  return Array.from(byNode.values()).sort((a, b) => b.priority - a.priority);
}

export function planKnowledgeCards(args: {
  targetStepId: string;
  intent: IntentResolution;
  masteryMap: Record<string, number>;
  knowledgeGraph: {
    knowledgePoints: KnowledgePoint[];
    knowledgeToStep: KnowledgeToStepRelation[];
    knowledgeToCodeChunk: KnowledgeToCodeChunkRelation[];
    codeAwareMappings: CodeAwareMapping[];
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
    knowledgeToCodeChunk: args.knowledgeGraph.knowledgeToCodeChunk,
    codeAwareMappings: args.knowledgeGraph.codeAwareMappings,
    knowledgeRelations: args.knowledgeGraph.knowledgeRelations,
    previouslyLinkedKnowledgeNodeIds: args.previouslyLinkedKnowledgeNodeIds,
  });

  if (candidates.length === 0) {
    return [];
  }

  const maxCards = Math.max(1, Math.min(3, args.maxCards));
  const selected = candidates.slice(0, maxCards);
  const assumedMasteredPool = candidates
    .filter((candidate) => candidate.mastery >= 0.75)
    .map((candidate) => candidate.nodeId);

  const plans = selected.map((candidate) => {
    const primaryUnmasteredNodeId =
      candidate.mastery < 0.75 ? candidate.nodeId : undefined;

    return {
      linkedKnowledgeNodeIds: [candidate.nodeId],
      assumedMasteredNodeIds: assumedMasteredPool.filter(
        (nodeId) => nodeId !== candidate.nodeId,
      ),
      intentTypes: args.intent.intentTypes,
      primaryUnmasteredNodeId,
      nodeFocusPath: [candidate.source],
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
      source: candidate.source,
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
      primaryUnmasteredNodeId: plan.primaryUnmasteredNodeId,
      nodeFocusPath: plan.nodeFocusPath,
    })),
  });

  return plans;
}

import {
  CodeAwareMapping,
  CodeChunk,
  KnowledgePoint,
  KnowledgeRelation,
  KnowledgeToCodeChunkRelation,
  KnowledgeToStepRelation,
  MasteryNodeRef,
  NodeMasteryScore,
} from "core";
import {
  computeSituationGroups,
  toSituationNodeId,
} from "../../utils/situationGrouping";

export interface CardPlanItem {
  topCandidate: MasteryNodeRef;
  linkedMasteryNodes: MasteryNodeRef[];
  linkedKnowledgeNodeIds: string[];
  assumedMasteredNodeIds: string[];
  primaryUnmasteredNodeId?: string;
  nodeFocusPath: string[];
}

interface CandidateNode {
  nodeRef: MasteryNodeRef;
  source: string;
  mastery: number;
  priority: number;
  linkedBackgroundKnowledgeIds: string[];
}

const WEIGHTS = {
  intent: 0.45,
  gap: 0.4,
  novelty: 0.15,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNodeKey(nodeRef: MasteryNodeRef): string {
  return `${nodeRef.nodeType}:${nodeRef.nodeId}`;
}

function buildMasteryMap(scores: NodeMasteryScore[]): Record<string, number> {
  const map: Record<string, number> = {};
  scores.forEach((item) => {
    map[`${item.nodeType}:${item.nodeId}`] = clamp(item.score ?? 0.5, 0, 1);
  });
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

function pickTopBackgroundKnowledge(args: {
  candidates: Set<string>;
  masteryMap: Record<string, number>;
  maxCount: number;
}): string[] {
  return [...args.candidates]
    .sort((a, b) => {
      const scoreA = args.masteryMap[`background-knowledge:${a}`] ?? 0.5;
      const scoreB = args.masteryMap[`background-knowledge:${b}`] ?? 0.5;
      return scoreA - scoreB;
    })
    .slice(0, args.maxCount);
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
      return [
        "framework_role_in_decomposition",
        "step_background_knowledge",
        "step_situation_to_code",
      ];
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
  nodeRef: MasteryNodeRef;
  source: string;
  intentBoost: number;
  masteryMap: Record<string, number>;
  previouslyLinkedNodeKeys: Set<string>;
  linkedBackgroundKnowledgeIds: string[];
}): CandidateNode {
  const nodeKey = toNodeKey(args.nodeRef);
  const mastery = args.masteryMap[nodeKey] ?? 0.5;
  const novelty = args.previouslyLinkedNodeKeys.has(nodeKey) ? 0.2 : 1;
  const gap = 1 - mastery;

  return {
    nodeRef: args.nodeRef,
    source: args.source,
    mastery,
    priority:
      WEIGHTS.intent * clamp(args.intentBoost, 0, 1) +
      WEIGHTS.gap * gap +
      WEIGHTS.novelty * novelty,
    linkedBackgroundKnowledgeIds: args.linkedBackgroundKnowledgeIds,
  };
}

function buildCandidates(args: {
  targetStepId: string;
  masteryScores: NodeMasteryScore[];
  knowledgePoints: KnowledgePoint[];
  knowledgeToStep: KnowledgeToStepRelation[];
  knowledgeToCodeChunk: KnowledgeToCodeChunkRelation[];
  codeAwareMappings: CodeAwareMapping[];
  knowledgeRelations: KnowledgeRelation[];
  previouslyLinkedNodeKeys?: string[];
  codeChunks: CodeChunk[];
}): CandidateNode[] {
  const masteryMap = buildMasteryMap(args.masteryScores);
  const previouslyLinkedNodeKeys = new Set(args.previouslyLinkedNodeKeys ?? []);
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

  // Use default focus path: background knowledge + prerequisite + situation
  const focusBuckets = [
    "step_background_knowledge",
    "step_prerequisite_knowledge",
    "step_situation_to_code",
  ];
  const candidates: CandidateNode[] = [];
  const defaultBackgroundIds = pickTopBackgroundKnowledge({
    candidates: new Set([
      ...expandedStepKnowledgeIds,
      ...expandedCodeKnowledgeIds,
    ]),
    masteryMap,
    maxCount: 2,
  });

  const pushCandidate = (
    nodeRef: MasteryNodeRef,
    source: string,
    intentBoost: number,
    linkedBackgroundKnowledgeIds: string[] = defaultBackgroundIds,
  ) => {
    if (
      nodeRef.nodeType === "background-knowledge" &&
      !knowledgeById.has(nodeRef.nodeId)
    ) {
      return;
    }

    candidates.push(
      scoreCandidate({
        nodeRef,
        source,
        intentBoost,
        masteryMap,
        previouslyLinkedNodeKeys,
        linkedBackgroundKnowledgeIds,
      }),
    );
  };

  focusBuckets.forEach((focus, bucketIndex) => {
    const baseBoost = clamp(1 - bucketIndex * 0.18, 0.45, 1);

    if (focus === "step_prerequisite_knowledge") {
      expandedStepKnowledgeIds.forEach((nodeId) => {
        if (isPrerequisiteKnowledge(nodeId, args.knowledgeRelations)) {
          pushCandidate(
            { nodeId, nodeType: "background-knowledge" },
            focus,
            baseBoost,
            [nodeId],
          );
        }
      });
      return;
    }

    if (focus === "framework_role_in_decomposition") {
      const frameworkBackgroundIds = [...expandedStepKnowledgeIds]
        .filter((nodeId) => {
          const point = knowledgeById.get(nodeId);
          return (
            point?.category === "framework" || point?.category === "concept"
          );
        })
        .slice(0, 2);

      pushCandidate(
        { nodeId: args.targetStepId, nodeType: "step" },
        focus,
        clamp(baseBoost + 0.2, 0, 1),
        frameworkBackgroundIds.length > 0
          ? frameworkBackgroundIds
          : defaultBackgroundIds,
      );
      return;
    }

    if (focus === "step_background_knowledge") {
      expandedStepKnowledgeIds.forEach((nodeId) => {
        pushCandidate(
          { nodeId, nodeType: "background-knowledge" },
          focus,
          baseBoost,
          [nodeId],
        );
      });
      return;
    }

    if (
      focus === "step_situation_to_code" ||
      focus === "step_intent_to_code_mapping" ||
      focus === "code_situation_to_step"
    ) {
      const groups = computeSituationGroups(
        args.codeAwareMappings,
        args.codeChunks,
      );
      const situationNodeIds = groups
        .filter((g) => g.stepIds.includes(args.targetStepId))
        .map((g) => toSituationNodeId(args.targetStepId, g.groupId));

      situationNodeIds.forEach((situationNodeId) => {
        pushCandidate(
          { nodeId: situationNodeId, nodeType: "situation" },
          focus,
          clamp(baseBoost + 0.1, 0, 1),
          pickTopBackgroundKnowledge({
            candidates: expandedCodeKnowledgeIds,
            masteryMap,
            maxCount: 2,
          }),
        );
      });

      [...stepChunkIds].forEach((chunkId) => {
        pushCandidate(
          { nodeId: chunkId, nodeType: "code-chunk" },
          focus,
          baseBoost,
          pickTopBackgroundKnowledge({
            candidates: expandedCodeKnowledgeIds,
            masteryMap,
            maxCount: 2,
          }),
        );
      });

      expandedCodeKnowledgeIds.forEach((nodeId) => {
        pushCandidate(
          { nodeId, nodeType: "background-knowledge" },
          focus,
          clamp(baseBoost - 0.08, 0, 1),
          [nodeId],
        );
      });
      return;
    }

    if (focus === "code_prerequisite_knowledge") {
      expandedCodeKnowledgeIds.forEach((nodeId) => {
        if (isPrerequisiteKnowledge(nodeId, args.knowledgeRelations)) {
          pushCandidate(
            { nodeId, nodeType: "background-knowledge" },
            focus,
            baseBoost,
            [nodeId],
          );
        }
      });
      return;
    }

    if (focus === "code_syntax_knowledge") {
      expandedCodeKnowledgeIds.forEach((nodeId) => {
        const point = knowledgeById.get(nodeId);
        if (point?.category === "syntax") {
          pushCandidate(
            { nodeId, nodeType: "background-knowledge" },
            focus,
            baseBoost,
            [nodeId],
          );
        }
      });
    }
  });

  const byNode = new Map<string, CandidateNode>();
  candidates.forEach((candidate) => {
    const key = toNodeKey(candidate.nodeRef);
    const existing = byNode.get(key);
    if (!existing || candidate.priority > existing.priority) {
      byNode.set(key, candidate);
    }
  });

  return Array.from(byNode.values()).sort((a, b) => b.priority - a.priority);
}

export function planKnowledgeCards(args: {
  targetStepId: string;
  masteryScores: NodeMasteryScore[];
  knowledgeGraph: {
    knowledgePoints: KnowledgePoint[];
    knowledgeToStep: KnowledgeToStepRelation[];
    knowledgeToCodeChunk: KnowledgeToCodeChunkRelation[];
    codeAwareMappings: CodeAwareMapping[];
    knowledgeRelations: KnowledgeRelation[];
    codeChunks: CodeChunk[];
  };
  maxCards: number;
  previouslyLinkedNodeKeys?: string[];
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
    targetStepId: args.targetStepId,
    masteryScores: args.masteryScores,
    knowledgePoints: args.knowledgeGraph.knowledgePoints,
    knowledgeToStep: args.knowledgeGraph.knowledgeToStep,
    knowledgeToCodeChunk: args.knowledgeGraph.knowledgeToCodeChunk,
    codeAwareMappings: args.knowledgeGraph.codeAwareMappings,
    knowledgeRelations: args.knowledgeGraph.knowledgeRelations,
    previouslyLinkedNodeKeys: args.previouslyLinkedNodeKeys,
    codeChunks: args.knowledgeGraph.codeChunks,
  });

  if (candidates.length === 0) {
    return [];
  }

  const maxCards = Math.max(1, Math.min(2, args.maxCards));
  const selected = candidates.slice(0, maxCards);
  const assumedMasteredPool = candidates
    .filter((candidate) => candidate.mastery >= 0.75)
    .flatMap((candidate) => candidate.linkedBackgroundKnowledgeIds);

  const plans = selected.map((candidate) => {
    const primaryUnmasteredNodeId =
      candidate.mastery < 0.75 ? candidate.nodeRef.nodeId : undefined;
    const linkedKnowledgeNodeIds =
      candidate.nodeRef.nodeType === "background-knowledge"
        ? Array.from(
            new Set([
              candidate.nodeRef.nodeId,
              ...candidate.linkedBackgroundKnowledgeIds,
            ]),
          )
        : Array.from(new Set(candidate.linkedBackgroundKnowledgeIds));

    return {
      topCandidate: candidate.nodeRef,
      linkedMasteryNodes: [candidate.nodeRef],
      linkedKnowledgeNodeIds,
      assumedMasteredNodeIds: assumedMasteredPool.filter(
        (nodeId) => nodeId !== primaryUnmasteredNodeId,
      ),
      primaryUnmasteredNodeId,
      nodeFocusPath: [candidate.source],
    };
  });

  console.info("[CA:Knowledge][PlannerSelection]", {
    targetStepId: args.targetStepId,
    maxCards,
    candidateCount: candidates.length,
    topCandidates: candidates.slice(0, 6).map((candidate) => ({
      nodeId: candidate.nodeRef.nodeId,
      nodeType: candidate.nodeRef.nodeType,
      nodeTitleShort: abbreviate(
        knowledgeById.get(candidate.nodeRef.nodeId)?.title ||
          candidate.nodeRef.nodeId,
      ),
      priority: Number(candidate.priority.toFixed(3)),
      mastery: Number(candidate.mastery.toFixed(3)),
      source: candidate.source,
    })),
    selectedPlans: plans.map((plan, index) => ({
      index,
      topCandidate: plan.topCandidate,
      linkedNodes: plan.linkedKnowledgeNodeIds.map((nodeId) => ({
        nodeId,
        nodeTitleShort: abbreviate(knowledgeById.get(nodeId)?.title),
        mastery: Number(
          (
            buildMasteryMap(args.masteryScores)[
              `background-knowledge:${nodeId}`
            ] ?? 0.5
          ).toFixed(3),
        ),
      })),
      linkedMasteryNodes: plan.linkedMasteryNodes,
      assumedMasteredNodeIds: plan.assumedMasteredNodeIds,
      primaryUnmasteredNodeId: plan.primaryUnmasteredNodeId,
      nodeFocusPath: plan.nodeFocusPath,
    })),
  });

  return plans;
}

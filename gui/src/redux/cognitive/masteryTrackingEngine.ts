import type {
  CodeAwareCognitiveEdge,
  MasteryNodeRef,
  NodeMasteryScore,
} from "core";

const EVIDENCE_VALUES = {
  feedback_understood: 0.8,
  feedback_uncertain: 0.25,
  read_major_interaction: 0.45,
  self_test_major_interaction: 0.55,
  answer_mode_correct: 0.85,
  answer_mode_wrong: 0.2,
} as const;

const DEFAULT_ALPHA = 0.35;
const DEFAULT_BETA = 0.25;

type ScoreKey = string;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toScoreKey(
  nodeId: string,
  nodeType: NodeMasteryScore["nodeType"],
): ScoreKey {
  return `${nodeType}::${nodeId}`;
}

function buildScoreMap(
  scores: NodeMasteryScore[],
): Map<ScoreKey, NodeMasteryScore> {
  const map = new Map<ScoreKey, NodeMasteryScore>();
  scores.forEach((item) => {
    map.set(toScoreKey(item.nodeId, item.nodeType), item);
  });
  return map;
}

export type KnowledgeCardInteraction =
  | { type: "feedback"; value: "understood" | "uncertain" }
  | { type: "view-major"; value: "read" | "self-test" }
  | { type: "answer"; correctness: number };

interface DirectUpdateResult {
  scoreMap: Map<ScoreKey, NodeMasteryScore>;
  directUpdatedKeys: Set<ScoreKey>;
  directUpdatedNodes: NodeMasteryScore[];
  directLogs: Array<{
    nodeId: string;
    nodeType: NodeMasteryScore["nodeType"];
    before: number;
    after: number;
    evidence: number;
  }>;
}

interface PropagationCandidate {
  key: ScoreKey;
  nodeId: string;
  nodeType: NodeMasteryScore["nodeType"];
  sourceNodeId: string;
  sourceNodeType: NodeMasteryScore["nodeType"];
  candidateScore: number;
  propagatedScore: number;
  edgeId: string;
}

export interface MasteryTrackingDebugInfo {
  directLogs: DirectUpdateResult["directLogs"];
  propagationLogs: Array<{
    nodeId: string;
    nodeType: NodeMasteryScore["nodeType"];
    before: number;
    after: number;
    sourceNodeId: string;
    sourceNodeType: NodeMasteryScore["nodeType"];
    edgeId: string;
  }>;
}

export function deriveEvidenceFromInteraction(
  interaction: KnowledgeCardInteraction,
): number | undefined {
  if (interaction.type === "feedback") {
    return interaction.value === "understood"
      ? EVIDENCE_VALUES.feedback_understood
      : EVIDENCE_VALUES.feedback_uncertain;
  }

  if (interaction.type === "view-major") {
    return interaction.value === "self-test"
      ? EVIDENCE_VALUES.self_test_major_interaction
      : EVIDENCE_VALUES.read_major_interaction;
  }

  if (interaction.type === "answer") {
    return interaction.correctness >= 0.5
      ? EVIDENCE_VALUES.answer_mode_correct
      : EVIDENCE_VALUES.answer_mode_wrong;
  }

  return undefined;
}

export function updateDirectNodeMastery(args: {
  linkedKnowledgeNodeIds?: string[];
  linkedMasteryNodes?: MasteryNodeRef[];
  evidence: number;
  nodeMasteryScores: NodeMasteryScore[];
  now?: number;
  alpha?: number;
}): DirectUpdateResult {
  const now = args.now ?? Date.now();
  const alpha = args.alpha ?? DEFAULT_ALPHA;
  const scoreMap = buildScoreMap(args.nodeMasteryScores);
  const directUpdatedKeys = new Set<ScoreKey>();
  const directUpdatedNodes: NodeMasteryScore[] = [];
  const directLogs: DirectUpdateResult["directLogs"] = [];

  const normalizedRefs: MasteryNodeRef[] = [
    ...(args.linkedMasteryNodes ?? []),
    ...(args.linkedKnowledgeNodeIds ?? []).map((nodeId) => ({
      nodeId,
      nodeType: "background-knowledge" as const,
    })),
  ];

  const seen = new Set<string>();

  normalizedRefs.forEach(({ nodeId, nodeType }) => {
    if (!nodeId) {
      return;
    }

    const dedupKey = `${nodeType}:${nodeId}`;
    if (seen.has(dedupKey)) {
      return;
    }
    seen.add(dedupKey);

    const key = toScoreKey(nodeId, nodeType);
    const existing = scoreMap.get(key);
    const before = existing?.score ?? 0.5;
    const after = clamp01((1 - alpha) * before + alpha * args.evidence);

    const updated: NodeMasteryScore = {
      nodeId,
      nodeType,
      score: after,
      updatedAt: now,
    };

    scoreMap.set(key, updated);
    directUpdatedKeys.add(key);
    directUpdatedNodes.push(updated);
    directLogs.push({
      nodeId,
      nodeType,
      before,
      after,
      evidence: args.evidence,
    });
  });

  return {
    scoreMap,
    directUpdatedKeys,
    directUpdatedNodes,
    directLogs,
  };
}

export function propagateOneHop(args: {
  directUpdatedNodes: NodeMasteryScore[];
  directUpdatedKeys: Set<ScoreKey>;
  scoreMap: Map<ScoreKey, NodeMasteryScore>;
  cognitiveEdges: CodeAwareCognitiveEdge[];
  now?: number;
  beta?: number;
}): {
  mergedCandidates: Map<ScoreKey, PropagationCandidate>;
} {
  const beta = args.beta ?? DEFAULT_BETA;
  const candidateMap = new Map<ScoreKey, PropagationCandidate>();

  args.directUpdatedNodes.forEach((updatedNode) => {
    const outgoing = args.cognitiveEdges.filter(
      (edge) =>
        edge.fromNodeId === updatedNode.nodeId &&
        edge.fromNodeType === updatedNode.nodeType,
    );

    outgoing.forEach((edge) => {
      const targetNodeType = edge.toNodeType as NodeMasteryScore["nodeType"];
      const targetKey = toScoreKey(edge.toNodeId, targetNodeType);

      if (args.directUpdatedKeys.has(targetKey)) {
        return;
      }

      const targetBefore = args.scoreMap.get(targetKey)?.score ?? 0.5;
      const propagatedScore =
        updatedNode.score * edge.conditionalMasteryProbability +
        (1 - updatedNode.score) * (1 - edge.conditionalMasteryProbability);
      const candidateScore =
        (1 - beta) * targetBefore + beta * clamp01(propagatedScore);

      const existing = candidateMap.get(targetKey);
      if (!existing || candidateScore > existing.candidateScore) {
        candidateMap.set(targetKey, {
          key: targetKey,
          nodeId: edge.toNodeId,
          nodeType: targetNodeType,
          sourceNodeId: updatedNode.nodeId,
          sourceNodeType: updatedNode.nodeType,
          candidateScore: clamp01(candidateScore),
          propagatedScore: clamp01(propagatedScore),
          edgeId: edge.id,
        });
      }
    });
  });

  return { mergedCandidates: candidateMap };
}

export function mergePropagationCandidates(args: {
  scoreMap: Map<ScoreKey, NodeMasteryScore>;
  mergedCandidates: Map<ScoreKey, PropagationCandidate>;
  now?: number;
}): {
  scoreMap: Map<ScoreKey, NodeMasteryScore>;
  propagationLogs: MasteryTrackingDebugInfo["propagationLogs"];
} {
  const now = args.now ?? Date.now();
  const propagationLogs: MasteryTrackingDebugInfo["propagationLogs"] = [];

  args.mergedCandidates.forEach((candidate, key) => {
    const current = args.scoreMap.get(key);
    const before = current?.score ?? 0.5;
    const after = candidate.candidateScore;

    args.scoreMap.set(key, {
      nodeId: candidate.nodeId,
      nodeType: candidate.nodeType,
      score: after,
      updatedAt: now,
    });

    propagationLogs.push({
      nodeId: candidate.nodeId,
      nodeType: candidate.nodeType,
      before,
      after,
      sourceNodeId: candidate.sourceNodeId,
      sourceNodeType: candidate.sourceNodeType,
      edgeId: candidate.edgeId,
    });
  });

  return {
    scoreMap: args.scoreMap,
    propagationLogs,
  };
}

export function applyKnowledgeCardInteraction(args: {
  linkedKnowledgeNodeIds?: string[];
  linkedMasteryNodes?: MasteryNodeRef[];
  interaction: KnowledgeCardInteraction;
  nodeMasteryScores: NodeMasteryScore[];
  cognitiveEdges: CodeAwareCognitiveEdge[];
  alpha?: number;
  beta?: number;
}): {
  updatedScores: NodeMasteryScore[];
  changedNodeIds: string[];
  debug: MasteryTrackingDebugInfo;
} {
  const evidence = deriveEvidenceFromInteraction(args.interaction);
  const linkedMasteryCount = args.linkedMasteryNodes?.length ?? 0;
  const linkedKnowledgeCount = args.linkedKnowledgeNodeIds?.length ?? 0;
  if (!evidence || linkedMasteryCount + linkedKnowledgeCount === 0) {
    return {
      updatedScores: args.nodeMasteryScores,
      changedNodeIds: [],
      debug: {
        directLogs: [],
        propagationLogs: [],
      },
    };
  }

  const directResult = updateDirectNodeMastery({
    linkedKnowledgeNodeIds: args.linkedKnowledgeNodeIds,
    linkedMasteryNodes: args.linkedMasteryNodes,
    evidence,
    nodeMasteryScores: args.nodeMasteryScores,
    alpha: args.alpha,
  });

  const propagationResult = propagateOneHop({
    directUpdatedNodes: directResult.directUpdatedNodes,
    directUpdatedKeys: directResult.directUpdatedKeys,
    scoreMap: directResult.scoreMap,
    cognitiveEdges: args.cognitiveEdges,
    beta: args.beta,
  });

  const mergedResult = mergePropagationCandidates({
    scoreMap: directResult.scoreMap,
    mergedCandidates: propagationResult.mergedCandidates,
  });

  const changedNodeIdSet = new Set<string>();
  directResult.directLogs.forEach((item) => changedNodeIdSet.add(item.nodeId));
  mergedResult.propagationLogs.forEach((item) =>
    changedNodeIdSet.add(item.nodeId),
  );

  return {
    updatedScores: Array.from(mergedResult.scoreMap.values()),
    changedNodeIds: Array.from(changedNodeIdSet),
    debug: {
      directLogs: directResult.directLogs,
      propagationLogs: mergedResult.propagationLogs,
    },
  };
}

export function emitMasteryUpdateLogs(args: {
  interaction: KnowledgeCardInteraction;
  linkedKnowledgeNodeIds?: string[];
  linkedMasteryNodes?: MasteryNodeRef[];
  changedNodeIds: string[];
  debug: MasteryTrackingDebugInfo;
  knowledgeNodeTitleById?: Record<string, string>;
}): void {
  if (args.changedNodeIds.length === 0) {
    return;
  }

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

  const linkedNodeDebug = (args.linkedKnowledgeNodeIds ?? []).map((nodeId) => ({
    nodeId,
    nodeTitleShort: abbreviate(args.knowledgeNodeTitleById?.[nodeId]),
  }));

  const changedNodeDebug = args.changedNodeIds.map((nodeId) => ({
    nodeId,
    nodeTitleShort: abbreviate(args.knowledgeNodeTitleById?.[nodeId]),
  }));

  console.info("[CA:Mastery:PhaseG][MasteryUpdate]", {
    tag: "CA_PHASE_G_MASTERY",
    interaction: args.interaction,
    linkedKnowledgeNodeIds: args.linkedKnowledgeNodeIds ?? [],
    linkedMasteryNodes: args.linkedMasteryNodes ?? [],
    linkedNodeDebug,
    changedNodeIds: args.changedNodeIds,
    changedNodeDebug,
    directUpdates: args.debug.directLogs,
    propagationUpdates: args.debug.propagationLogs,
    propagationTargets: args.debug.propagationLogs.map((item) => item.nodeId),
  });
}

import type { CodeAwareCognitiveEdge } from "core";
import type { CodeAwareSessionState } from "../redux/slices/codeAwareSlice";
import { computeSituationGroups, toSituationNodeId } from "./situationGrouping";

const COGNITIVE_EDGE_PRIORS: Record<string, number> = {
  "inference-forward": 0.86,
  "inference-reverse": 0.72,
  "dependency-forward": 0.9,
  "dependency-reverse": 0.6,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toAssociationProbability(similarity?: number): number {
  const normalized = clamp01(
    typeof similarity === "number" && Number.isFinite(similarity)
      ? similarity
      : 0.7,
  );
  // Keep a minimum floor to avoid overly weak links from noisy embeddings.
  return clamp01(0.55 + normalized * 0.4);
}

export function buildCodeAwareCognitiveEdges(
  state: CodeAwareSessionState,
): CodeAwareCognitiveEdge[] {
  const now = Date.now();
  const edges: CodeAwareCognitiveEdge[] = [];

  // --- Step ↔ HighLevelStep edges ---

  state.stepToHighLevelMappings.forEach((m) => {
    edges.push({
      id: `infer-fwd-step-hls-${m.stepId}-${m.highLevelStepId}`,
      type: "inference-forward",
      fromNodeId: m.stepId,
      fromNodeType: "step",
      toNodeId: m.highLevelStepId,
      toNodeType: "step",
      conditionalMasteryProbability: COGNITIVE_EDGE_PRIORS["inference-forward"],
      createdAt: now,
      metadata: { source: "step-to-highlevel", relationClass: "inference" },
    });

    edges.push({
      id: `infer-rev-hls-step-${m.highLevelStepId}-${m.stepId}`,
      type: "inference-reverse",
      fromNodeId: m.highLevelStepId,
      fromNodeType: "step",
      toNodeId: m.stepId,
      toNodeType: "step",
      conditionalMasteryProbability: COGNITIVE_EDGE_PRIORS["inference-reverse"],
      createdAt: now,
      metadata: { source: "highlevel-to-step", relationClass: "inference" },
    });
  });

  // --- Step ↔ Situation ↔ CodeChunk edges (from situation groups) ---

  const groups = computeSituationGroups(
    state.codeAwareMappings,
    state.codeChunks,
  );

  // Pre-compute: stepId → total lines across all groups for proportional weights
  const stepTotalLines = new Map<string, number>();
  groups.forEach((g) => {
    g.stepIds.forEach((stepId) => {
      stepTotalLines.set(
        stepId,
        (stepTotalLines.get(stepId) ?? 0) + g.lineCount,
      );
    });
  });

  // Track situation nodes per group for shared-group association edges
  const groupToSitIds = new Map<string, string[]>();

  groups.forEach((group) => {
    const stepsForGroup = group.stepIds.length;
    const sitIds: string[] = [];

    group.stepIds.forEach((stepId) => {
      const sitNodeId = toSituationNodeId(stepId, group.groupId);
      sitIds.push(sitNodeId);

      const totalLines = stepTotalLines.get(stepId) ?? 1;
      const stepProportion = clamp01(group.lineCount / totalLines);
      const groupProportion = clamp01(1 / stepsForGroup);

      // step → situation
      edges.push({
        id: `infer-fwd-step-sit-${stepId}-${group.groupId}`,
        type: "inference-forward",
        fromNodeId: stepId,
        fromNodeType: "step",
        toNodeId: sitNodeId,
        toNodeType: "situation",
        conditionalMasteryProbability: clamp01(
          COGNITIVE_EDGE_PRIORS["inference-forward"] * stepProportion,
        ),
        createdAt: now,
        metadata: {
          source: "step-to-situation",
          relationClass: "inference",
          stepProportion,
        },
      });

      // situation → step
      edges.push({
        id: `infer-rev-sit-step-${group.groupId}-${stepId}`,
        type: "inference-reverse",
        fromNodeId: sitNodeId,
        fromNodeType: "situation",
        toNodeId: stepId,
        toNodeType: "step",
        conditionalMasteryProbability: clamp01(
          COGNITIVE_EDGE_PRIORS["inference-reverse"] * stepProportion,
        ),
        createdAt: now,
        metadata: {
          source: "situation-to-step",
          relationClass: "inference",
          stepProportion,
        },
      });

      // situation ↔ each code chunk in the group
      group.codeChunkIds.forEach((chunkId) => {
        edges.push({
          id: `infer-fwd-sit-code-${sitNodeId}-${chunkId}`,
          type: "inference-forward",
          fromNodeId: sitNodeId,
          fromNodeType: "situation",
          toNodeId: chunkId,
          toNodeType: "code-chunk",
          conditionalMasteryProbability:
            COGNITIVE_EDGE_PRIORS["inference-forward"],
          createdAt: now,
          metadata: {
            source: "situation-to-code",
            relationClass: "inference",
          },
        });

        edges.push({
          id: `infer-rev-code-sit-${chunkId}-${sitNodeId}`,
          type: "inference-reverse",
          fromNodeId: chunkId,
          fromNodeType: "code-chunk",
          toNodeId: sitNodeId,
          toNodeType: "situation",
          conditionalMasteryProbability: clamp01(
            COGNITIVE_EDGE_PRIORS["inference-reverse"] * groupProportion,
          ),
          createdAt: now,
          metadata: {
            source: "code-to-situation",
            relationClass: "inference",
            groupProportion,
          },
        });
      });
    });

    groupToSitIds.set(group.groupId, sitIds);
  });

  // --- Shared-group situation association edges ---
  const SHARED_GROUP_ASSOCIATION_PROB = 0.75;
  groupToSitIds.forEach((sitIds, groupId) => {
    if (sitIds.length < 2) {
      return;
    }
    for (let i = 0; i < sitIds.length; i++) {
      for (let j = i + 1; j < sitIds.length; j++) {
        edges.push({
          id: `assoc-fwd-sit-shared-${sitIds[i]}-${sitIds[j]}`,
          type: "association-forward",
          fromNodeId: sitIds[i],
          fromNodeType: "situation",
          toNodeId: sitIds[j],
          toNodeType: "situation",
          conditionalMasteryProbability: SHARED_GROUP_ASSOCIATION_PROB,
          createdAt: now,
          metadata: {
            source: "shared-situation-group",
            groupId,
            relationClass: "association",
          },
        });
        edges.push({
          id: `assoc-rev-sit-shared-${sitIds[j]}-${sitIds[i]}`,
          type: "association-reverse",
          fromNodeId: sitIds[j],
          fromNodeType: "situation",
          toNodeId: sitIds[i],
          toNodeType: "situation",
          conditionalMasteryProbability: SHARED_GROUP_ASSOCIATION_PROB,
          createdAt: now,
          metadata: {
            source: "shared-situation-group",
            groupId,
            relationClass: "association",
          },
        });
      }
    }
  });

  // --- CodeChunk ↔ CodeChunk associations ---

  state.codeChunkRelations.forEach((r) => {
    const association = toAssociationProbability(r.similarity);
    edges.push({
      id: `assoc-fwd-code-${r.fromChunkId}-${r.toChunkId}`,
      type: "association-forward",
      fromNodeId: r.fromChunkId,
      fromNodeType: "code-chunk",
      toNodeId: r.toChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability: association,
      createdAt: r.createdAt,
      metadata: { relationClass: "association", similarity: r.similarity },
    });

    edges.push({
      id: `assoc-rev-code-${r.toChunkId}-${r.fromChunkId}`,
      type: "association-reverse",
      fromNodeId: r.toChunkId,
      fromNodeType: "code-chunk",
      toNodeId: r.fromChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability: association,
      createdAt: r.createdAt,
      metadata: { relationClass: "association", similarity: r.similarity },
    });
  });

  state.knowledgeRelations.forEach((r) => {
    const isDependency = r.relationType === "prerequisite";
    const forwardType = isDependency
      ? "dependency-forward"
      : "association-forward";
    const reverseType = isDependency
      ? "dependency-reverse"
      : "association-reverse";
    const probability = isDependency
      ? COGNITIVE_EDGE_PRIORS["dependency-forward"]
      : toAssociationProbability(r.similarity);

    edges.push({
      id: `k-fwd-${r.fromKnowledgeId}-${r.toKnowledgeId}`,
      type: forwardType,
      fromNodeId: r.fromKnowledgeId,
      fromNodeType: "background-knowledge",
      toNodeId: r.toKnowledgeId,
      toNodeType: "background-knowledge",
      conditionalMasteryProbability: probability,
      createdAt: r.createdAt,
      metadata: {
        relationType: r.relationType,
        relationClass: isDependency ? "dependency" : "association",
        similarity: r.similarity,
      },
    });

    edges.push({
      id: `k-rev-${r.toKnowledgeId}-${r.fromKnowledgeId}`,
      type: reverseType,
      fromNodeId: r.toKnowledgeId,
      fromNodeType: "background-knowledge",
      toNodeId: r.fromKnowledgeId,
      toNodeType: "background-knowledge",
      conditionalMasteryProbability: isDependency
        ? COGNITIVE_EDGE_PRIORS["dependency-reverse"]
        : probability,
      createdAt: r.createdAt,
      metadata: {
        relationType: r.relationType,
        relationClass: isDependency ? "dependency" : "association",
        similarity: r.similarity,
      },
    });
  });

  state.knowledgeToStepRelations.forEach((r) => {
    edges.push({
      id: `dep-fwd-ks-${r.knowledgeId}-${r.stepId}`,
      type: "dependency-forward",
      fromNodeId: r.knowledgeId,
      fromNodeType: "background-knowledge",
      toNodeId: r.stepId,
      toNodeType: "step",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["dependency-forward"],
      createdAt: r.createdAt,
      metadata: { relationClass: "dependency", source: "knowledge-to-step" },
    });

    edges.push({
      id: `dep-rev-sk-${r.stepId}-${r.knowledgeId}`,
      type: "dependency-reverse",
      fromNodeId: r.stepId,
      fromNodeType: "step",
      toNodeId: r.knowledgeId,
      toNodeType: "background-knowledge",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["dependency-reverse"],
      createdAt: r.createdAt,
      metadata: { relationClass: "dependency", source: "step-to-knowledge" },
    });
  });

  state.knowledgeToCodeChunkRelations.forEach((r) => {
    edges.push({
      id: `dep-fwd-kc-${r.knowledgeId}-${r.codeChunkId}`,
      type: "dependency-forward",
      fromNodeId: r.knowledgeId,
      fromNodeType: "background-knowledge",
      toNodeId: r.codeChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["dependency-forward"],
      createdAt: r.createdAt,
      metadata: {
        viaStepId: r.viaStepId,
        relationClass: "dependency",
        source: "knowledge-to-code",
      },
    });

    edges.push({
      id: `dep-rev-ck-${r.codeChunkId}-${r.knowledgeId}`,
      type: "dependency-reverse",
      fromNodeId: r.codeChunkId,
      fromNodeType: "code-chunk",
      toNodeId: r.knowledgeId,
      toNodeType: "background-knowledge",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["dependency-reverse"],
      createdAt: r.createdAt,
      metadata: {
        viaStepId: r.viaStepId,
        relationClass: "dependency",
        source: "code-to-knowledge",
      },
    });
  });

  return edges;
}

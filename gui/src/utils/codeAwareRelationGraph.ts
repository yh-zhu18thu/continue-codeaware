import type { CodeAwareCognitiveEdge } from "core";
import type { CodeAwareSessionState } from "../redux/slices/codeAwareSlice";

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

function toSituationNodeId(stepId: string, codeChunkId: string): string {
  return `sit-${stepId}-${codeChunkId}`;
}

export function buildCodeAwareCognitiveEdges(
  state: CodeAwareSessionState,
): CodeAwareCognitiveEdge[] {
  const now = Date.now();
  const edges: CodeAwareCognitiveEdge[] = [];

  // --- Pre-compute lookup tables for proportional weights ---

  // chunkId → line count
  const chunkLineCount = new Map<string, number>();
  state.codeChunks.forEach((chunk) => {
    const [start, end] = chunk.range;
    chunkLineCount.set(chunk.id, end - start + 1);
  });

  // stepId → total lines across all its situation chunks
  const stepTotalLines = new Map<string, number>();
  // chunkId → number of distinct steps mapping to this chunk
  const chunkStepCount = new Map<string, number>();
  // chunkId → Set<situationNodeId> (for shared-chunk association edges)
  const chunkToSituationIds = new Map<string, Set<string>>();

  // Deduplicate mappings: one situation per (stepId, chunkId) pair
  const situationPairs = new Set<string>();
  state.codeAwareMappings
    .filter((m) => m.semanticElementType === "step")
    .forEach((m) => {
      const pairKey = `${m.semanticElementId}::${m.codeChunkId}`;
      if (situationPairs.has(pairKey)) {
        return;
      }
      situationPairs.add(pairKey);

      const lines = chunkLineCount.get(m.codeChunkId) ?? 1;

      // Accumulate per-step total lines
      stepTotalLines.set(
        m.semanticElementId,
        (stepTotalLines.get(m.semanticElementId) ?? 0) + lines,
      );

      // Count steps per chunk
      chunkStepCount.set(
        m.codeChunkId,
        (chunkStepCount.get(m.codeChunkId) ?? 0) + 1,
      );

      // Track situation nodes per chunk
      const sitId = toSituationNodeId(m.semanticElementId, m.codeChunkId);
      let sitSet = chunkToSituationIds.get(m.codeChunkId);
      if (!sitSet) {
        sitSet = new Set();
        chunkToSituationIds.set(m.codeChunkId, sitSet);
      }
      sitSet.add(sitId);
    });

  // --- Step ↔ HighLevelStep edges (unchanged) ---

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

  // --- Step ↔ Situation ↔ CodeChunk edges (proportional weights) ---

  const emittedSituations = new Set<string>();
  state.codeAwareMappings.forEach((m, idx) => {
    if (m.semanticElementType !== "step") {
      return;
    }

    const situationNodeId = toSituationNodeId(
      m.semanticElementId,
      m.codeChunkId,
    );

    // Deduplicate: only emit edges once per situation node
    if (emittedSituations.has(situationNodeId)) {
      return;
    }
    emittedSituations.add(situationNodeId);

    const chunkLines = chunkLineCount.get(m.codeChunkId) ?? 1;
    const totalStepLines = stepTotalLines.get(m.semanticElementId) ?? 1;
    const stepsForChunk = chunkStepCount.get(m.codeChunkId) ?? 1;

    // Proportion of this situation within its step (by line count)
    const stepProportion = clamp01(chunkLines / totalStepLines);
    // Proportion of this situation within its chunk (by step count)
    const chunkProportion = clamp01(1 / stepsForChunk);

    // step → situation: scaled by proportion within step
    edges.push({
      id: `infer-fwd-step-sit-${m.semanticElementId}-${m.codeChunkId}-${idx}`,
      type: "inference-forward",
      fromNodeId: m.semanticElementId,
      fromNodeType: "step",
      toNodeId: situationNodeId,
      toNodeType: "situation",
      conditionalMasteryProbability: clamp01(
        COGNITIVE_EDGE_PRIORS["inference-forward"] * stepProportion,
      ),
      createdAt: m.createdAt,
      metadata: {
        source: "step-to-situation",
        relationClass: "inference",
        stepProportion,
      },
    });

    // situation → step: scaled by proportion within step
    edges.push({
      id: `infer-rev-sit-step-${m.codeChunkId}-${m.semanticElementId}-${idx}`,
      type: "inference-reverse",
      fromNodeId: situationNodeId,
      fromNodeType: "situation",
      toNodeId: m.semanticElementId,
      toNodeType: "step",
      conditionalMasteryProbability: clamp01(
        COGNITIVE_EDGE_PRIORS["inference-reverse"] * stepProportion,
      ),
      createdAt: m.createdAt,
      metadata: {
        source: "situation-to-step",
        relationClass: "inference",
        stepProportion,
      },
    });

    // situation → code-chunk: full probability (chunk entirely belongs to situation)
    edges.push({
      id: `infer-fwd-sit-code-${m.semanticElementId}-${m.codeChunkId}-${idx}`,
      type: "inference-forward",
      fromNodeId: situationNodeId,
      fromNodeType: "situation",
      toNodeId: m.codeChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability: COGNITIVE_EDGE_PRIORS["inference-forward"],
      createdAt: m.createdAt,
      metadata: { source: "situation-to-code", relationClass: "inference" },
    });

    // code-chunk → situation: scaled by 1/stepsForChunk
    edges.push({
      id: `infer-rev-code-sit-${m.codeChunkId}-${m.semanticElementId}-${idx}`,
      type: "inference-reverse",
      fromNodeId: m.codeChunkId,
      fromNodeType: "code-chunk",
      toNodeId: situationNodeId,
      toNodeType: "situation",
      conditionalMasteryProbability: clamp01(
        COGNITIVE_EDGE_PRIORS["inference-reverse"] * chunkProportion,
      ),
      createdAt: m.createdAt,
      metadata: {
        source: "code-to-situation",
        relationClass: "inference",
        chunkProportion,
      },
    });
  });

  // --- Shared-chunk situation association edges ---
  // When ≥2 situation nodes share the same code chunk, connect them

  const SHARED_CHUNK_ASSOCIATION_PROB = 0.75;
  chunkToSituationIds.forEach((sitIds, chunkId) => {
    if (sitIds.size < 2) {
      return;
    }
    const sitArray = Array.from(sitIds);
    for (let i = 0; i < sitArray.length; i++) {
      for (let j = i + 1; j < sitArray.length; j++) {
        edges.push({
          id: `assoc-fwd-sit-shared-${sitArray[i]}-${sitArray[j]}`,
          type: "association-forward",
          fromNodeId: sitArray[i],
          fromNodeType: "situation",
          toNodeId: sitArray[j],
          toNodeType: "situation",
          conditionalMasteryProbability: SHARED_CHUNK_ASSOCIATION_PROB,
          createdAt: now,
          metadata: {
            source: "shared-code-chunk",
            chunkId,
            relationClass: "association",
          },
        });
        edges.push({
          id: `assoc-rev-sit-shared-${sitArray[j]}-${sitArray[i]}`,
          type: "association-reverse",
          fromNodeId: sitArray[j],
          fromNodeType: "situation",
          toNodeId: sitArray[i],
          toNodeType: "situation",
          conditionalMasteryProbability: SHARED_CHUNK_ASSOCIATION_PROB,
          createdAt: now,
          metadata: {
            source: "shared-code-chunk",
            chunkId,
            relationClass: "association",
          },
        });
      }
    }
  });

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

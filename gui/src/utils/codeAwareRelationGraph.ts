import type { CodeAwareCognitiveEdge } from "core";
import type { CodeAwareSessionState } from "../redux/slices/codeAwareSlice";

const COGNITIVE_EDGE_PRIORS: Record<string, number> = {
  "hierarchical-forward": 0.86,
  "hierarchical-reverse": 0.7,
  "semantic-forward": 0.88,
  "semantic-reverse": 0.74,
  "code-similarity-forward": 0.68,
  "code-similarity-reverse": 0.66,
  "knowledge-similarity-forward": 0.72,
  "knowledge-similarity-reverse": 0.7,
  "knowledge-to-step-forward": 0.9,
  "knowledge-to-step-reverse": 0.6,
  "knowledge-to-code-chunk-forward": 0.84,
  "knowledge-to-code-chunk-reverse": 0.58,
};

export function buildCodeAwareCognitiveEdges(
  state: CodeAwareSessionState,
): CodeAwareCognitiveEdge[] {
  const now = Date.now();
  const edges: CodeAwareCognitiveEdge[] = [];

  state.stepToHighLevelMappings.forEach((m) => {
    edges.push({
      id: `hier-fwd-${m.stepId}-${m.highLevelStepId}`,
      type: "hierarchical-forward",
      fromNodeId: m.stepId,
      fromNodeType: "step",
      toNodeId: m.highLevelStepId,
      toNodeType: "high-level-step",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["hierarchical-forward"],
      createdAt: now,
    });

    edges.push({
      id: `hier-rev-${m.highLevelStepId}-${m.stepId}`,
      type: "hierarchical-reverse",
      fromNodeId: m.highLevelStepId,
      fromNodeType: "high-level-step",
      toNodeId: m.stepId,
      toNodeType: "step",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["hierarchical-reverse"],
      createdAt: now,
    });
  });

  state.codeAwareMappings.forEach((m, idx) => {
    edges.push({
      id: `sem-fwd-${m.codeChunkId}-${m.semanticElementId}-${idx}`,
      type: "semantic-forward",
      fromNodeId: m.codeChunkId,
      fromNodeType: "code-chunk",
      toNodeId: m.semanticElementId,
      toNodeType:
        m.semanticElementType === "highLevelStep" ? "high-level-step" : "step",
      conditionalMasteryProbability: COGNITIVE_EDGE_PRIORS["semantic-forward"],
      createdAt: m.createdAt,
    });

    edges.push({
      id: `sem-rev-${m.semanticElementId}-${m.codeChunkId}-${idx}`,
      type: "semantic-reverse",
      fromNodeId: m.semanticElementId,
      fromNodeType:
        m.semanticElementType === "highLevelStep" ? "high-level-step" : "step",
      toNodeId: m.codeChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability: COGNITIVE_EDGE_PRIORS["semantic-reverse"],
      createdAt: m.createdAt,
    });
  });

  state.codeChunkRelations.forEach((r) => {
    edges.push({
      id: `cc-fwd-${r.fromChunkId}-${r.toChunkId}`,
      type: "code-similarity-forward",
      fromNodeId: r.fromChunkId,
      fromNodeType: "code-chunk",
      toNodeId: r.toChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["code-similarity-forward"],
      createdAt: r.createdAt,
    });

    edges.push({
      id: `cc-rev-${r.toChunkId}-${r.fromChunkId}`,
      type: "code-similarity-reverse",
      fromNodeId: r.toChunkId,
      fromNodeType: "code-chunk",
      toNodeId: r.fromChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["code-similarity-reverse"],
      createdAt: r.createdAt,
    });
  });

  state.knowledgeRelations.forEach((r) => {
    edges.push({
      id: `kk-fwd-${r.fromKnowledgeId}-${r.toKnowledgeId}`,
      type: "knowledge-similarity-forward",
      fromNodeId: r.fromKnowledgeId,
      fromNodeType: "knowledge-point",
      toNodeId: r.toKnowledgeId,
      toNodeType: "knowledge-point",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["knowledge-similarity-forward"],
      createdAt: r.createdAt,
      metadata: { relationType: r.relationType },
    });

    edges.push({
      id: `kk-rev-${r.toKnowledgeId}-${r.fromKnowledgeId}`,
      type: "knowledge-similarity-reverse",
      fromNodeId: r.toKnowledgeId,
      fromNodeType: "knowledge-point",
      toNodeId: r.fromKnowledgeId,
      toNodeType: "knowledge-point",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["knowledge-similarity-reverse"],
      createdAt: r.createdAt,
      metadata: { relationType: r.relationType },
    });
  });

  state.knowledgeToStepRelations.forEach((r) => {
    edges.push({
      id: `ks-fwd-${r.knowledgeId}-${r.stepId}`,
      type: "knowledge-to-step-forward",
      fromNodeId: r.knowledgeId,
      fromNodeType: "knowledge-point",
      toNodeId: r.stepId,
      toNodeType: "step",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["knowledge-to-step-forward"],
      createdAt: r.createdAt,
    });

    edges.push({
      id: `ks-rev-${r.stepId}-${r.knowledgeId}`,
      type: "knowledge-to-step-reverse",
      fromNodeId: r.stepId,
      fromNodeType: "step",
      toNodeId: r.knowledgeId,
      toNodeType: "knowledge-point",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["knowledge-to-step-reverse"],
      createdAt: r.createdAt,
    });
  });

  state.knowledgeToCodeChunkRelations.forEach((r) => {
    edges.push({
      id: `kc-fwd-${r.knowledgeId}-${r.codeChunkId}`,
      type: "knowledge-to-code-chunk-forward",
      fromNodeId: r.knowledgeId,
      fromNodeType: "knowledge-point",
      toNodeId: r.codeChunkId,
      toNodeType: "code-chunk",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["knowledge-to-code-chunk-forward"],
      createdAt: r.createdAt,
      metadata: { viaStepId: r.viaStepId },
    });

    edges.push({
      id: `kc-rev-${r.codeChunkId}-${r.knowledgeId}`,
      type: "knowledge-to-code-chunk-reverse",
      fromNodeId: r.codeChunkId,
      fromNodeType: "code-chunk",
      toNodeId: r.knowledgeId,
      toNodeType: "knowledge-point",
      conditionalMasteryProbability:
        COGNITIVE_EDGE_PRIORS["knowledge-to-code-chunk-reverse"],
      createdAt: r.createdAt,
      metadata: { viaStepId: r.viaStepId },
    });
  });

  return edges;
}

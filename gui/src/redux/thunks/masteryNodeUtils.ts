/**
 * Shared mastery-node utilities for confusion-candidate generation.
 */
import type {
  CodeAwareCognitiveEdge,
  CodeChunk,
  KnowledgePoint,
  MasteryNodeRef,
  NodeMasteryScore,
  StepItem,
} from "core";

/* ─── score lookup ─── */
export function buildScoreLookup(
  scores: NodeMasteryScore[],
): Map<string, number> {
  const map = new Map<string, number>();
  scores.forEach((s) => map.set(`${s.nodeType}::${s.nodeId}`, s.score));
  return map;
}

export function getScore(
  lookup: Map<string, number>,
  nodeId: string,
  nodeType: string,
): number {
  return lookup.get(`${nodeType}::${nodeId}`) ?? 0.5;
}

/* ─── 1-hop BFS neighbor scoring ─── */
export interface ScoredNeighbor {
  nodeId: string;
  nodeType: string;
  relevance: number; // higher = more relevant & less mastered
  edgeProb: number;
  mastery: number;
  contextTitle: string;
}

export function findTopNeighbors(
  centerNodeId: string,
  centerNodeType: string,
  edges: CodeAwareCognitiveEdge[],
  scoreLookup: Map<string, number>,
  stepTitleById: Map<string, string>,
  k: number,
): ScoredNeighbor[] {
  const neighbors: ScoredNeighbor[] = [];
  const seen = new Set<string>();

  edges.forEach((edge) => {
    if (
      edge.fromNodeId !== centerNodeId ||
      edge.fromNodeType !== centerNodeType
    ) {
      return;
    }
    const key = `${edge.toNodeType}::${edge.toNodeId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const mastery = getScore(scoreLookup, edge.toNodeId, edge.toNodeType);
    const relevance = edge.conditionalMasteryProbability * (1 - mastery);

    let contextTitle = edge.toNodeId;
    if (edge.toNodeType === "step") {
      contextTitle = stepTitleById.get(edge.toNodeId) || edge.toNodeId;
    } else if (edge.toNodeType === "situation") {
      const match = edge.toNodeId.match(/^sit-(.+)-grp-L\d+$/);
      if (match) {
        contextTitle = stepTitleById.get(match[1]) || edge.toNodeId;
      }
    }

    neighbors.push({
      nodeId: edge.toNodeId,
      nodeType: edge.toNodeType,
      relevance,
      edgeProb: edge.conditionalMasteryProbability,
      mastery,
      contextTitle,
    });
  });

  neighbors.sort((a, b) => b.relevance - a.relevance);
  return neighbors.slice(0, k);
}

/* ─── build mastered-related context for prompts ─── */

/**
 * Given a set of center node IDs (from a knowledge card's linked nodes),
 * find all 1-hop neighbors via cognitiveEdges that the user has already
 * mastered (score > 0.5), and return a formatted text summary of their content.
 */
export function buildMasteredRelatedContext({
  linkedMasteryNodes,
  linkedKnowledgeNodeIds,
  edges,
  nodeMasteryScores,
  knowledgePoints,
  codeChunks,
  steps,
}: {
  linkedMasteryNodes?: MasteryNodeRef[];
  linkedKnowledgeNodeIds?: string[];
  edges: CodeAwareCognitiveEdge[];
  nodeMasteryScores: NodeMasteryScore[];
  knowledgePoints: KnowledgePoint[];
  codeChunks: CodeChunk[];
  steps: StepItem[];
}): string {
  const scoreLookup = buildScoreLookup(nodeMasteryScores);

  // Collect all center nodes from linked mastery nodes + knowledge node IDs
  const centerNodes: Array<{ nodeId: string; nodeType: string }> = [];
  if (linkedMasteryNodes) {
    linkedMasteryNodes.forEach((n) =>
      centerNodes.push({ nodeId: n.nodeId, nodeType: n.nodeType }),
    );
  }
  if (linkedKnowledgeNodeIds) {
    linkedKnowledgeNodeIds.forEach((id) =>
      centerNodes.push({ nodeId: id, nodeType: "background-knowledge" }),
    );
  }

  if (centerNodes.length === 0) return "";

  // Find all 1-hop neighbors from all center nodes
  const seen = new Set<string>();
  const masteredItems: Array<{
    nodeId: string;
    nodeType: string;
    mastery: number;
    content: string;
  }> = [];

  // Also include center nodes themselves if mastered
  for (const center of centerNodes) {
    const key = `${center.nodeType}::${center.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const mastery = getScore(scoreLookup, center.nodeId, center.nodeType);
    if (mastery > 0.5) {
      const content = resolveNodeContent(
        center.nodeId,
        center.nodeType,
        knowledgePoints,
        codeChunks,
        steps,
      );
      if (content) {
        masteredItems.push({
          nodeId: center.nodeId,
          nodeType: center.nodeType,
          mastery,
          content,
        });
      }
    }
  }

  // Find 1-hop neighbors of all center nodes
  for (const center of centerNodes) {
    for (const edge of edges) {
      if (
        edge.fromNodeId !== center.nodeId ||
        edge.fromNodeType !== center.nodeType
      ) {
        continue;
      }

      const key = `${edge.toNodeType}::${edge.toNodeId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Skip situation nodes — not directly useful as content
      if (edge.toNodeType === "situation") continue;

      const mastery = getScore(scoreLookup, edge.toNodeId, edge.toNodeType);
      if (mastery <= 0.5) continue;

      const content = resolveNodeContent(
        edge.toNodeId,
        edge.toNodeType,
        knowledgePoints,
        codeChunks,
        steps,
      );
      if (content) {
        masteredItems.push({
          nodeId: edge.toNodeId,
          nodeType: edge.toNodeType,
          mastery,
          content,
        });
      }
    }
  }

  if (masteredItems.length === 0) return "";

  // Format into a readable summary
  const lines = masteredItems.map((item) => {
    const typeLabel =
      item.nodeType === "background-knowledge"
        ? "概念"
        : item.nodeType === "step"
          ? "步骤"
          : item.nodeType === "code-chunk"
            ? "代码"
            : item.nodeType;
    return `[${typeLabel}] ${item.content}`;
  });

  return lines.join("\n");
}

/** Resolve a node's human-readable content by type. */
function resolveNodeContent(
  nodeId: string,
  nodeType: string,
  knowledgePoints: KnowledgePoint[],
  codeChunks: CodeChunk[],
  steps: StepItem[],
): string {
  if (nodeType === "background-knowledge") {
    const kp = knowledgePoints.find((k) => k.id === nodeId);
    return kp ? `${kp.title}: ${kp.content}` : "";
  }
  if (nodeType === "code-chunk") {
    const chunk = codeChunks.find((c) => c.id === nodeId);
    return chunk ? chunk.content : "";
  }
  if (nodeType === "step") {
    const step = steps.find((s) => s.id === nodeId);
    return step ? `${step.title}: ${step.abstract}` : "";
  }
  return "";
}

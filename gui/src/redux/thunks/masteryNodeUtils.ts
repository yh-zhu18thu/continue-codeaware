/**
 * Shared mastery-node utilities for confusion-candidate generation.
 */
import type { CodeAwareCognitiveEdge, NodeMasteryScore } from "core";

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

/**
 * Shared mastery-node utilities for confusion-candidate generation.
 */
import type {
  CodeAwareCognitiveEdge,
  CodeAwareMapping,
  CodeChunk,
  KnowledgePoint,
  KnowledgeToStepRelation,
  MasteryNodeRef,
  NodeMasteryScore,
  StepItem,
} from "core";
import {
  computeSituationGroups,
  toSituationNodeId,
} from "../../utils/situationGrouping";

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

/* ─── situation-based mastery context for global QA ─── */

interface SituationMasteryEntry {
  situationNodeId: string;
  stepId: string;
  groupId: string;
  mastery: number;
  masteryLabel: string;
  stepTitle: string;
  stepAbstract: string;
  prerequisiteKnowledge: string[];
  codeSnippet: string;
}

const CODE_SNIPPET_MAX_CHARS = 2000;

function masteryLabel(score: number): string {
  if (score > 0.5) return "了解";
  if (score < 0.3) return "还不知道";
  return "初步接触";
}

/**
 * Build a situation-based mastery profile for global QA prompts.
 *
 * Collects the top-K highest-mastery and top-K lowest-mastery situation nodes,
 * with their related step, prerequisite knowledge, and code context.
 * Falls back to step-level mastery when no situation nodes exist.
 */
export function buildSituationMasteryContext({
  nodeMasteryScores,
  codeAwareMappings,
  codeChunks,
  steps,
  knowledgePoints,
  knowledgeToStepRelations,
  topK = 3,
}: {
  nodeMasteryScores: NodeMasteryScore[];
  codeAwareMappings: CodeAwareMapping[];
  codeChunks: CodeChunk[];
  steps: StepItem[];
  knowledgePoints: KnowledgePoint[];
  knowledgeToStepRelations: KnowledgeToStepRelation[];
  topK?: number;
}): string {
  const scoreLookup = buildScoreLookup(nodeMasteryScores);

  // Build step lookup maps
  const stepById = new Map<string, StepItem>();
  steps.forEach((s) => stepById.set(s.id, s));

  // Build knowledge relations lookup: stepId → KnowledgePoint[]
  const knowledgeByStepId = new Map<string, KnowledgePoint[]>();
  knowledgeToStepRelations.forEach((rel) => {
    const kp = knowledgePoints.find((k) => k.id === rel.knowledgeId);
    if (!kp) return;
    const existing = knowledgeByStepId.get(rel.stepId) || [];
    existing.push(kp);
    knowledgeByStepId.set(rel.stepId, existing);
  });

  // Build code chunk lookup
  const chunkById = new Map<string, CodeChunk>();
  codeChunks.forEach((c) => chunkById.set(c.id, c));

  // Try situation-based approach first
  const groups = computeSituationGroups(codeAwareMappings, codeChunks);

  let entries: SituationMasteryEntry[] = [];

  if (groups.length > 0) {
    // Collect all situation nodes with scores
    const situationScores: Array<{
      sitNodeId: string;
      stepId: string;
      groupId: string;
      score: number;
      codeChunkIds: string[];
    }> = [];

    const seenSitNodes = new Set<string>();

    groups.forEach((group) => {
      group.stepIds.forEach((stepId) => {
        const sitNodeId = toSituationNodeId(stepId, group.groupId);
        if (seenSitNodes.has(sitNodeId)) return;
        seenSitNodes.add(sitNodeId);

        const score = getScore(scoreLookup, sitNodeId, "situation");
        situationScores.push({
          sitNodeId,
          stepId,
          groupId: group.groupId,
          score,
          codeChunkIds: group.codeChunkIds,
        });
      });
    });

    // Sort by score descending, take top-K highest and top-K lowest
    situationScores.sort((a, b) => b.score - a.score);

    const topHigh = situationScores
      .filter((s) => s.score >= 0.5)
      .slice(0, topK);
    const topLow = situationScores
      .filter((s) => s.score < 0.3)
      .slice(-topK)
      .reverse(); // lowest scores from the end

    // Re-sort topLow to get actual lowest first
    topLow.sort((a, b) => a.score - b.score);

    const selected = [...topHigh, ...topLow];
    // Deduplicate by sitNodeId
    const selectedSet = new Set<string>();

    for (const sit of selected) {
      if (selectedSet.has(sit.sitNodeId)) continue;
      selectedSet.add(sit.sitNodeId);

      const step = stepById.get(sit.stepId);
      if (!step) continue;

      // Collect prerequisite knowledge for this step
      const relatedKPs = knowledgeByStepId.get(sit.stepId) || [];
      const prereqTitles = relatedKPs.slice(0, 3).map((kp) => kp.title);

      // Collect and merge code content
      let codeContent = "";
      for (const chunkId of sit.codeChunkIds) {
        const chunk = chunkById.get(chunkId);
        if (!chunk) continue;
        if (
          codeContent.length + chunk.content.length + 1 >
          CODE_SNIPPET_MAX_CHARS
        ) {
          codeContent += "\n...";
          break;
        }
        codeContent += (codeContent ? "\n" : "") + chunk.content;
      }

      entries.push({
        situationNodeId: sit.sitNodeId,
        stepId: sit.stepId,
        groupId: sit.groupId,
        mastery: sit.score,
        masteryLabel: masteryLabel(sit.score),
        stepTitle: step.title,
        stepAbstract: step.abstract,
        prerequisiteKnowledge: prereqTitles,
        codeSnippet: codeContent,
      });
    }
  }

  // Fallback: if no situation nodes, use step-level mastery
  if (entries.length === 0 && steps.length > 0) {
    const stepScores = steps.map((step) => ({
      stepId: step.id,
      score: getScore(scoreLookup, step.id, "step"),
    }));

    stepScores.sort((a, b) => b.score - a.score);

    const topHighSteps = stepScores
      .filter((s) => s.score >= 0.5)
      .slice(0, topK);
    const topLowSteps = stepScores
      .filter((s) => s.score < 0.3)
      .sort((a, b) => a.score - b.score)
      .slice(0, topK);

    const selectedSteps = [...topHighSteps, ...topLowSteps];
    const selectedStepIds = new Set<string>();

    for (const ss of selectedSteps) {
      if (selectedStepIds.has(ss.stepId)) continue;
      selectedStepIds.add(ss.stepId);

      const step = stepById.get(ss.stepId);
      if (!step) continue;

      const relatedKPs = knowledgeByStepId.get(ss.stepId) || [];
      const prereqTitles = relatedKPs.slice(0, 3).map((kp) => kp.title);

      entries.push({
        situationNodeId: ss.stepId, // use stepId as fallback identifier
        stepId: ss.stepId,
        groupId: "",
        mastery: ss.score,
        masteryLabel: masteryLabel(ss.score),
        stepTitle: step.title,
        stepAbstract: step.abstract,
        prerequisiteKnowledge: prereqTitles,
        codeSnippet: "",
      });
    }
  }

  if (entries.length === 0) return "";

  // Format into two sections
  const mastered = entries.filter((e) => e.mastery >= 0.5);
  const unmastered = entries.filter((e) => e.mastery < 0.3);
  const partial = entries.filter((e) => e.mastery >= 0.3 && e.mastery < 0.5);

  const formatEntry = (e: SituationMasteryEntry): string => {
    const lines: string[] = [];
    lines.push(`- 步骤「${e.stepTitle}」(掌握度: ${e.masteryLabel})`);
    lines.push(`  描述: ${e.stepAbstract}`);
    if (e.prerequisiteKnowledge.length > 0) {
      lines.push(`  前置知识: ${e.prerequisiteKnowledge.join("、")}`);
    }
    if (e.codeSnippet) {
      const preview =
        e.codeSnippet.length > 200
          ? e.codeSnippet.substring(0, 200) + "..."
          : e.codeSnippet;
      lines.push(`  相关代码: ${preview}`);
    }
    return lines.join("\n");
  };

  const sections: string[] = [];

  if (mastered.length > 0) {
    sections.push("【已掌握的知识】\n" + mastered.map(formatEntry).join("\n"));
  }
  if (partial.length > 0) {
    sections.push("【初步接触的知识】\n" + partial.map(formatEntry).join("\n"));
  }
  if (unmastered.length > 0) {
    sections.push(
      "【尚未掌握的知识】\n" + unmastered.map(formatEntry).join("\n"),
    );
  }

  return sections.join("\n\n");
}

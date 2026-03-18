import { createAsyncThunk } from "@reduxjs/toolkit";
import type { CodeAwareCognitiveEdge, NodeMasteryScore } from "core";
import type { ConfusionCandidate } from "../../pages/codeaware/components/shared/ConfusionPanel";
import { buildCodeAwareCognitiveEdges } from "../../utils/codeAwareRelationGraph";
import {
  computeSituationGroups,
  toSituationNodeId,
} from "../../utils/situationGrouping";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import { ThunkApiType } from "../store";

/* ─── helper: build score lookup ─── */
function buildScoreLookup(scores: NodeMasteryScore[]): Map<string, number> {
  const map = new Map<string, number>();
  scores.forEach((s) => map.set(`${s.nodeType}::${s.nodeId}`, s.score));
  return map;
}

function getScore(
  lookup: Map<string, number>,
  nodeId: string,
  nodeType: string,
): number {
  return lookup.get(`${nodeType}::${nodeId}`) ?? 0.5;
}

/* ─── helper: 1-hop BFS neighbor scoring ─── */
interface ScoredNeighbor {
  nodeId: string;
  nodeType: string;
  relevance: number; // higher = more relevant & less mastered
  edgeProb: number;
  mastery: number;
  contextTitle: string;
}

function findTopNeighbors(
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
      // Extract step id from situation node id: sit-{stepId}-grp-L{line}
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

  // Sort by relevance descending, take top-k
  neighbors.sort((a, b) => b.relevance - a.relevance);
  return neighbors.slice(0, k);
}

/* ─── prompt for generating confusion candidate questions ─── */
function constructConfusionCandidatesPrompt(
  topics: Array<{
    title: string;
    mastery: number;
    nodeType: string;
    codeSnippet?: string;
  }>,
  stepTitle: string | null,
  learningGoal: string,
  taskDescription: string,
): string {
  const topicsJson = topics
    .map(
      (t) =>
        `{"title": ${JSON.stringify(t.title)}, "mastery": ${t.mastery.toFixed(2)}, "type": "${t.nodeType}"${t.codeSnippet ? `, "code_snippet": ${JSON.stringify(t.codeSnippet)}` : ""}}`,
    )
    .join(",\n    ");

  return `{
    "task": "Generate short, thought-provoking candidate questions for a non-programmer user who is learning about a coding project. The question direction MUST depend on the topic type. Questions should be in the same language as the project context (Chinese if context is Chinese).",
    "topics": [${topicsJson}],
    "current_step": ${JSON.stringify(stepTitle || "全局概览")},
    "learning_goal": ${JSON.stringify(learningGoal)},
    "project_context": ${JSON.stringify(taskDescription)},
    "requirements": [
      "Generate exactly one short question per topic (1 sentence, max 20 Chinese characters or 15 English words).",
      "CRITICAL — the question direction depends on the topic 'type' field:",
      "  - type='step': ask about the PURPOSE or MEANING of this step — e.g. '为什么需要这一步？' or '这一步的目标是什么？'",
      "  - type='situation': ask about HOW the code IMPLEMENTS this — e.g. '代码是如何实现…的？' or '这段代码为什么要这样写？'. When code_snippet is provided, reference the concrete code.",
      "  - type='code-chunk': ask about WHAT a specific piece of code DOES — e.g. '这行代码的作用是什么？' or '为什么用这种方式来处理…？'. Always reference the code_snippet.",
      "  - type='background-knowledge': ask about a foundational CONCEPT — e.g. '…是什么意思？' or '为什么…在这里很重要？'",
      "Focus on topics with lower mastery scores — these are areas the user struggles with.",
      "Use simple language suitable for non-programmers. Avoid jargon.",
      "Return a JSON array of objects: [{\\"id\\": \\"topic-0\\", \\"label\\": \\"<question>\\"}]",
      "Do NOT wrap in code blocks. Return raw JSON only."
    ]
  }`;
}

/* ─── Step-level confusion candidates ─── */
export const generateStepConfusionCandidates = createAsyncThunk<
  ConfusionCandidate[],
  { stepId: string },
  ThunkApiType
>(
  "codeAware/generateStepConfusionCandidates",
  async ({ stepId }, { getState, extra }) => {
    const state = getState();
    const session = state.codeAwareSession;

    const edges = buildCodeAwareCognitiveEdges(session);
    const scoreLookup = buildScoreLookup(session.nodeMasteryScores);

    const stepTitleById = new Map<string, string>();
    session.steps.forEach((s) => stepTitleById.set(s.id, s.title));

    // Build code chunk lookup for enriching context
    const codeChunkById = new Map<string, string>();
    session.codeChunks.forEach((c) => {
      codeChunkById.set(c.id, c.content.substring(0, 120));
    });

    // Find top-k low-mastery neighbors from the step
    const neighbors = findTopNeighbors(
      stepId,
      "step",
      edges,
      scoreLookup,
      stepTitleById,
      3,
    );

    // Also search from situation nodes connected to this step
    const groups = computeSituationGroups(
      session.codeAwareMappings,
      session.codeChunks,
    );
    // Build situation → code snippet mapping
    const sitCodeSnippets = new Map<string, string>();
    groups.forEach((g) => {
      const snippets = g.codeChunkIds
        .map((id) => codeChunkById.get(id))
        .filter(Boolean)
        .slice(0, 2);
      if (snippets.length > 0) {
        g.stepIds.forEach((sid) => {
          const sitId = toSituationNodeId(sid, g.groupId);
          sitCodeSnippets.set(sitId, snippets.join("\n"));
        });
      }
    });

    groups.forEach((g) => {
      if (g.stepIds.includes(stepId)) {
        const sitNodeId = toSituationNodeId(stepId, g.groupId);
        const sitNeighbors = findTopNeighbors(
          sitNodeId,
          "situation",
          edges,
          scoreLookup,
          stepTitleById,
          2,
        );
        // Attach code snippet context to situation neighbors
        sitNeighbors.forEach((n) => {
          if (n.nodeType === "code-chunk") {
            n.contextTitle = codeChunkById.get(n.nodeId) || n.contextTitle;
          }
        });
        neighbors.push(...sitNeighbors);
      }
    });

    // De-duplicate and re-sort
    const uniqueMap = new Map<string, ScoredNeighbor>();
    neighbors.forEach((n) => {
      const key = `${n.nodeType}::${n.nodeId}`;
      const existing = uniqueMap.get(key);
      if (!existing || n.relevance > existing.relevance) {
        uniqueMap.set(key, n);
      }
    });
    const topNeighbors = Array.from(uniqueMap.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3);

    if (topNeighbors.length === 0) {
      return [];
    }

    // Call LLM to generate questions
    const defaultModel =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);
    if (!defaultModel) {
      // Fallback: use topic titles as candidates
      return topNeighbors.map((n, i) => ({
        id: `step-cand-${i}`,
        label: n.contextTitle,
      }));
    }

    const stepTitle = stepTitleById.get(stepId) || null;
    const taskDescription =
      session.userRequirement?.requirementDescription || "";
    const learningGoal = session.learningGoal || "";

    const prompt = constructConfusionCandidatesPrompt(
      topNeighbors.map((n) => ({
        title: n.contextTitle,
        mastery: n.mastery,
        nodeType: n.nodeType,
        codeSnippet:
          n.nodeType === "situation"
            ? sitCodeSnippets.get(n.nodeId)
            : n.nodeType === "code-chunk"
              ? codeChunkById.get(n.nodeId)
              : undefined,
      })),
      stepTitle,
      learningGoal,
      taskDescription,
    );

    try {
      const result = await extra.ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {},
        title: defaultModel.title,
      });

      if (result.status === "success" && result.content) {
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (item: any) =>
                typeof item?.label === "string" && item.label.trim(),
            )
            .map((item: any, i: number) => ({
              id: item.id || `step-cand-${i}`,
              label: item.label.trim(),
              description: topNeighbors[i]?.contextTitle,
            }));
        }
      }
    } catch (error) {
      console.warn(
        "[CA:ConfusionCandidates] LLM generation failed, using fallback:",
        error,
      );
    }

    // Fallback: use topic titles
    return topNeighbors.map((n, i) => ({
      id: `step-cand-${i}`,
      label: n.contextTitle,
    }));
  },
);

/* ─── Global-level confusion candidates ─── */
export const generateGlobalConfusionCandidates = createAsyncThunk<
  ConfusionCandidate[],
  void,
  ThunkApiType
>(
  "codeAware/generateGlobalConfusionCandidates",
  async (_, { getState, extra }) => {
    const state = getState();
    const session = state.codeAwareSession;

    const scoreLookup = buildScoreLookup(session.nodeMasteryScores);

    const stepTitleById = new Map<string, string>();
    session.steps.forEach((s) => stepTitleById.set(s.id, s.title));

    // Collect all situation nodes with their mastery scores
    const groups = computeSituationGroups(
      session.codeAwareMappings,
      session.codeChunks,
    );

    interface SituationEntry {
      nodeId: string;
      stepId: string;
      score: number;
      stepTitle: string;
      groupId: string;
    }

    const situationEntries: SituationEntry[] = [];

    groups.forEach((g) => {
      g.stepIds.forEach((stepId) => {
        const sitNodeId = toSituationNodeId(stepId, g.groupId);
        const score = getScore(scoreLookup, sitNodeId, "situation");
        situationEntries.push({
          nodeId: sitNodeId,
          stepId,
          score,
          stepTitle: stepTitleById.get(stepId) || stepId,
          groupId: g.groupId,
        });
      });
    });

    // Sort by mastery ascending (lowest mastery first)
    situationEntries.sort((a, b) => a.score - b.score);

    // De-duplicate by step (keep the lowest-mastery situation per step)
    const seenSteps = new Set<string>();
    const topEntries: SituationEntry[] = [];
    for (const entry of situationEntries) {
      if (seenSteps.has(entry.stepId)) continue;
      seenSteps.add(entry.stepId);
      topEntries.push(entry);
      if (topEntries.length >= 3) break;
    }

    if (topEntries.length === 0) {
      return [];
    }

    // Call LLM to generate questions
    const defaultModel =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);
    if (!defaultModel) {
      return topEntries.map((e, i) => ({
        id: `global-cand-${i}`,
        label: e.stepTitle,
      }));
    }

    const taskDescription =
      session.userRequirement?.requirementDescription || "";
    const learningGoal = session.learningGoal || "";

    // Build code snippets for global entries
    const globalCodeChunkById = new Map<string, string>();
    session.codeChunks.forEach((c) => {
      globalCodeChunkById.set(c.id, c.content.substring(0, 120));
    });
    const globalSitCodeSnippets = new Map<string, string>();
    groups.forEach((g) => {
      const snippets = g.codeChunkIds
        .map((id) => globalCodeChunkById.get(id))
        .filter(Boolean)
        .slice(0, 2);
      if (snippets.length > 0) {
        g.stepIds.forEach((sid) => {
          const sitId = toSituationNodeId(sid, g.groupId);
          globalSitCodeSnippets.set(sitId, snippets.join("\n"));
        });
      }
    });

    const prompt = constructConfusionCandidatesPrompt(
      topEntries.map((e) => ({
        title: e.stepTitle,
        mastery: e.score,
        nodeType: "situation",
        codeSnippet: globalSitCodeSnippets.get(e.nodeId),
      })),
      null,
      learningGoal,
      taskDescription,
    );

    try {
      const result = await extra.ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {},
        title: defaultModel.title,
      });

      if (result.status === "success" && result.content) {
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (item: any) =>
                typeof item?.label === "string" && item.label.trim(),
            )
            .map((item: any, i: number) => ({
              id: item.id || `global-cand-${i}`,
              label: item.label.trim(),
              description: topEntries[i]?.stepTitle,
            }));
        }
      }
    } catch (error) {
      console.warn(
        "[CA:ConfusionCandidates] Global LLM generation failed, using fallback:",
        error,
      );
    }

    // Fallback
    return topEntries.map((e, i) => ({
      id: `global-cand-${i}`,
      label: e.stepTitle,
    }));
  },
);

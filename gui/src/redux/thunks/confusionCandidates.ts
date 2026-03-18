import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ConfusionCandidate } from "../../pages/codeaware/components/shared/ConfusionPanel";
import {
  computeSituationGroups,
  toSituationNodeId,
} from "../../utils/situationGrouping";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import { ThunkApiType } from "../store";
import { buildScoreLookup, getScore } from "./masteryNodeUtils";

/* ─── Single-node prompt: generate multiple questions from one situation node ─── */
function constructStepConfusionPrompt(
  topic: {
    title: string;
    mastery: number;
    codeSnippet?: string;
  },
  stepTitle: string,
  stepAbstract: string,
  learningGoal: string,
  taskDescription: string,
  masteredTopics: string[],
  questionCount: number,
): string {
  const masteredJson =
    masteredTopics.length > 0
      ? `,\n    "already_mastered_topics": ${JSON.stringify(masteredTopics)}`
      : "";

  return `{
    "task": "Generate ${questionCount} short, thought-provoking candidate questions for a non-programmer user. The questions MUST be specifically about the current step and its code — NOT about the overall project. Questions should be in the same language as the project context (Chinese if context is Chinese).",
    "situation": {"title": ${JSON.stringify(topic.title)}, "mastery": ${topic.mastery.toFixed(2)}${topic.codeSnippet ? `, "code_snippet": ${JSON.stringify(topic.codeSnippet)}` : ""}},
    "current_step": ${JSON.stringify(stepTitle)},
    "step_description": ${JSON.stringify(stepAbstract)},
    "learning_goal": ${JSON.stringify(learningGoal)},
    "project_context": ${JSON.stringify(taskDescription)}${masteredJson},
    "requirements": [
      "Generate exactly ${questionCount} short questions (each 1 sentence, max 20 Chinese characters or 15 English words).",
      "CRITICAL: Every question MUST be about THIS SPECIFIC STEP ('${stepTitle}') and its code (code_snippet). Do NOT ask questions about the overall project or other steps.",
      "Each question must focus on a DIFFERENT aspect of this step's code — e.g. one about why this step works this way, one about a specific mechanism in the code, one about a key concept used here.",
      "Read through the code_snippet, understand what it does in the context of step_description, then identify the KEY challenges and concepts, and ask about HOW or WHY they work.",
      "Do NOT ask about a single line of code; focus on the overall logic of this step, the hardest parts, or the underlying concepts.",
      ${masteredTopics.length > 0 ? '"IMPORTANT: The user has already mastered the topics listed in already_mastered_topics. Do NOT ask questions about those topics. Focus on what the user has NOT yet understood.",' : ""}
      "Use simple language suitable for non-programmers. Avoid jargon.",
      "Return a JSON array of objects: [{\\"id\\": \\"q-0\\", \\"label\\": \\"<question>\\"}]",
      "Do NOT wrap in code blocks. Return raw JSON only."
    ]
  }`;
}

/* ─── Single-node prompt for global: generate 1 question from one situation node ─── */
function constructSingleGlobalConfusionPrompt(
  topic: {
    title: string;
    mastery: number;
    codeSnippet?: string;
  },
  learningGoal: string,
  taskDescription: string,
): string {
  return `{
    "task": "Generate exactly 1 short, thought-provoking question for a non-programmer user. The question should be about the provided code situation. Questions should be in the same language as the project context (Chinese if context is Chinese).",
    "situation": {"title": ${JSON.stringify(topic.title)}, "mastery": ${topic.mastery.toFixed(2)}${topic.codeSnippet ? `, "code_snippet": ${JSON.stringify(topic.codeSnippet)}` : ""}},
    "current_step": "全局概览",
    "learning_goal": ${JSON.stringify(learningGoal)},
    "project_context": ${JSON.stringify(taskDescription)},
    "requirements": [
      "Generate exactly 1 short question (1 sentence, max 20 Chinese characters or 15 English words).",
      "Read through the entire code block, identify the KEY challenge or the most important concept, and ask about HOW or WHY it works that way.",
      "Do NOT ask about a single line of code; focus on the overall logic or the hardest part.",
      "Use simple language suitable for non-programmers. Avoid jargon.",
      "Return a JSON array with exactly one object: [{\\"id\\": \\"q-0\\", \\"label\\": \\"<question>\\"}]",
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

    const scoreLookup = buildScoreLookup(session.nodeMasteryScores);

    const stepTitleById = new Map<string, string>();
    session.steps.forEach((s) => stepTitleById.set(s.id, s.title));

    // Build full code chunk lookup
    const codeChunkById = new Map<string, string>();
    session.codeChunks.forEach((c) => {
      codeChunkById.set(c.id, c.content);
    });

    // Compute situation groups and build full code context mapping
    const groups = computeSituationGroups(
      session.codeAwareMappings,
      session.codeChunks,
    );
    const sitCodeSnippets = new Map<string, string>();
    groups.forEach((g) => {
      const fullSnippets = g.codeChunkIds
        .map((id) => codeChunkById.get(id))
        .filter(Boolean) as string[];
      if (fullSnippets.length > 0) {
        let combined = fullSnippets.join("\n");
        if (combined.length > 2000) {
          combined = combined.substring(0, 2000) + "\n// ...";
        }
        g.stepIds.forEach((sid) => {
          const sitId = toSituationNodeId(sid, g.groupId);
          sitCodeSnippets.set(sitId, combined);
        });
      }
    });

    // Find the single lowest-mastery situation node for this step
    const stepSituationNodes: Array<{
      nodeId: string;
      score: number;
      codeSnippet?: string;
    }> = [];
    groups.forEach((g) => {
      if (g.stepIds.includes(stepId)) {
        const sitNodeId = toSituationNodeId(stepId, g.groupId);
        const score = getScore(scoreLookup, sitNodeId, "situation");
        stepSituationNodes.push({
          nodeId: sitNodeId,
          score,
          codeSnippet: sitCodeSnippets.get(sitNodeId),
        });
      }
    });

    // Sort ascending by mastery, pick the lowest one
    stepSituationNodes.sort((a, b) => a.score - b.score);
    const targetNode = stepSituationNodes[0];

    if (!targetNode) {
      return [];
    }

    const defaultModel =
      selectJsonGenerationModel(state) || selectSelectedChatModel(state);
    if (!defaultModel) {
      return [
        { id: "step-cand-0", label: stepTitleById.get(stepId) || stepId },
      ];
    }

    const stepTitle = stepTitleById.get(stepId) || stepId;
    const currentStep = session.steps.find((s) => s.id === stepId);
    const stepAbstract = currentStep?.abstract || "";
    const taskDescription =
      session.userRequirement?.requirementDescription || "";
    const learningGoal = session.learningGoal || "";

    // Collect already-mastered knowledge point titles to avoid repetition
    const masteredTopics: string[] = [];
    session.nodeMasteryScores.forEach((s) => {
      if (s.score >= 0.7) {
        if (s.nodeType === "background-knowledge") {
          const kp = session.knowledgePoints.find((p) => p.id === s.nodeId);
          if (kp) masteredTopics.push(kp.title);
        } else if (s.nodeType === "step") {
          const step = session.steps.find((st) => st.id === s.nodeId);
          if (step) masteredTopics.push(step.title);
        }
      }
    });

    const prompt = constructStepConfusionPrompt(
      {
        title: stepTitle,
        mastery: targetNode.score,
        codeSnippet: targetNode.codeSnippet,
      },
      stepTitle,
      stepAbstract,
      learningGoal,
      taskDescription,
      masteredTopics,
      3,
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
              description: stepTitle,
            }));
        }
      }
    } catch (error) {
      console.warn(
        "[CA:ConfusionCandidates] Step LLM generation failed, using fallback:",
        error,
      );
    }

    return [{ id: "step-cand-0", label: stepTitle }];
  },
);

/* ─── Global-level confusion candidates (parallel: 1 LLM call per node) ─── */
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

    // Pick top-3 lowest-mastery situation nodes (de-duplicate by nodeId)
    const seenNodeIds = new Set<string>();
    const topEntries: SituationEntry[] = [];
    for (const entry of situationEntries) {
      if (seenNodeIds.has(entry.nodeId)) continue;
      seenNodeIds.add(entry.nodeId);
      topEntries.push(entry);
      if (topEntries.length >= 3) break;
    }

    if (topEntries.length === 0) {
      return [];
    }

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

    // Build full code context for global entries
    const globalCodeChunkById = new Map<string, string>();
    session.codeChunks.forEach((c) => {
      globalCodeChunkById.set(c.id, c.content);
    });
    const globalSitCodeSnippets = new Map<string, string>();
    groups.forEach((g) => {
      const fullSnippets = g.codeChunkIds
        .map((id) => globalCodeChunkById.get(id))
        .filter(Boolean) as string[];
      if (fullSnippets.length > 0) {
        let combined = fullSnippets.join("\n");
        if (combined.length > 2000) {
          combined = combined.substring(0, 2000) + "\n// ...";
        }
        g.stepIds.forEach((sid) => {
          const sitId = toSituationNodeId(sid, g.groupId);
          globalSitCodeSnippets.set(sitId, combined);
        });
      }
    });

    // Fire parallel LLM calls — one per situation node
    const parallelPromises = topEntries.map(async (entry, i) => {
      const prompt = constructSingleGlobalConfusionPrompt(
        {
          title: entry.stepTitle,
          mastery: entry.score,
          codeSnippet: globalSitCodeSnippets.get(entry.nodeId),
        },
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
          if (Array.isArray(parsed) && parsed.length > 0) {
            const item = parsed[0];
            if (typeof item?.label === "string" && item.label.trim()) {
              return {
                id: item.id || `global-cand-${i}`,
                label: item.label.trim(),
                description: entry.stepTitle,
              } as ConfusionCandidate;
            }
          }
        }
      } catch (error) {
        console.warn(
          `[CA:ConfusionCandidates] Global LLM call ${i} failed:`,
          error,
        );
      }

      // Fallback for this node
      return {
        id: `global-cand-${i}`,
        label: entry.stepTitle,
        description: entry.stepTitle,
      } as ConfusionCandidate;
    });

    const results = await Promise.all(parallelPromises);
    return results;
  },
);

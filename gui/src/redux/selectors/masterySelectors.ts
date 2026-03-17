import { createSelector } from "@reduxjs/toolkit";
import type { MasteryNodeRef, NodeMasteryScore } from "core";
import {
  computeSituationGroups,
  toSituationNodeId,
} from "../../utils/situationGrouping";
import { masteryScoreToColor } from "../../utils/masteryColor";
import { RootState } from "../store";

/**
 * 根据 stepId 计算其关联 situation 节点掌握度的加权平均。
 *
 * situation nodeId 格式: `sit-{stepId}-grp-L{startLine}`
 * 权重来自每个 situation group 的行数。
 */
export const selectStepMastery = createSelector(
  [
    (state: RootState) => state.codeAwareSession.nodeMasteryScores,
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (state: RootState) => state.codeAwareSession.codeChunks,
    (_: RootState, stepId: string) => stepId,
  ],
  (
    scores: NodeMasteryScore[],
    mappings,
    codeChunks,
    stepId,
  ): { score: number; situationCount: number } | null => {
    const groups = computeSituationGroups(mappings, codeChunks);
    const relevantGroups = groups.filter((g) => g.stepIds.includes(stepId));

    if (relevantGroups.length === 0) {
      return null;
    }

    const scoreMap = new Map<string, number>();
    for (const s of scores) {
      if (s.nodeType === "situation") {
        scoreMap.set(s.nodeId, s.score);
      }
    }

    let totalWeight = 0;
    let weightedSum = 0;

    for (const group of relevantGroups) {
      const sitId = toSituationNodeId(stepId, group.groupId);
      const sitScore = scoreMap.get(sitId);
      if (sitScore === undefined) {
        continue;
      }
      const weight = group.lineCount;
      weightedSum += sitScore * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return null;
    }

    return {
      score: weightedSum / totalWeight,
      situationCount: relevantGroups.length,
    };
  },
);

/**
 * 根据 knowledge card 关联的 mastery node refs 计算掌握度。
 * 从 nodeMasteryScores 中查找所有匹配节点，取简单平均。
 */
export const selectKnowledgeCardMastery = createSelector(
  [
    (state: RootState) => state.codeAwareSession.nodeMasteryScores,
    (_: RootState, linkedNodes: MasteryNodeRef[] | undefined) => linkedNodes,
  ],
  (
    scores: NodeMasteryScore[],
    linkedNodes: MasteryNodeRef[] | undefined,
  ): { score: number } | null => {
    if (!linkedNodes || linkedNodes.length === 0) {
      return null;
    }

    const scoreMap = new Map<string, number>();
    for (const s of scores) {
      scoreMap.set(`${s.nodeType}:${s.nodeId}`, s.score);
    }

    let totalScore = 0;
    let count = 0;
    for (const ref of linkedNodes) {
      const key = `${ref.nodeType}:${ref.nodeId}`;
      const s = scoreMap.get(key);
      if (s !== undefined) {
        totalScore += s;
        count++;
      }
    }

    if (count === 0) {
      return null;
    }

    return { score: totalScore / count };
  },
);

export interface CodeMasteryGroupResult {
  groupId: string;
  lineRange: [number, number];
  filePath: string;
  score: number;
  color: string;
}

/**
 * 按 situation group 粒度计算代码掌握度。
 * 每个 group 取其关联的所有 situation 节点中最高的 mastery score。
 * 返回 { groupId, lineRange, filePath, score, color }[]
 */
export const selectCodeMasteryBySituationGroups = createSelector(
  [
    (state: RootState) => state.codeAwareSession.nodeMasteryScores,
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (state: RootState) => state.codeAwareSession.codeChunks,
  ],
  (scores, mappings, codeChunks): CodeMasteryGroupResult[] => {
    const groups = computeSituationGroups(mappings, codeChunks);
    if (groups.length === 0) {
      return [];
    }

    const scoreMap = new Map<string, number>();
    for (const s of scores) {
      if (s.nodeType === "situation") {
        scoreMap.set(s.nodeId, s.score);
      }
    }

    const results: CodeMasteryGroupResult[] = [];

    for (const group of groups) {
      // Find the highest mastery score among all steps' situation nodes in this group
      let maxScore = -1;
      for (const stepId of group.stepIds) {
        const sitId = toSituationNodeId(stepId, group.groupId);
        const sitScore = scoreMap.get(sitId);
        if (sitScore !== undefined && sitScore > maxScore) {
          maxScore = sitScore;
        }
      }

      if (maxScore < 0) {
        continue; // No scores for this group
      }

      // Get filePath from the first code chunk in the group
      const firstChunk = codeChunks.find((c) =>
        group.codeChunkIds.includes(c.id),
      );
      if (!firstChunk) {
        continue;
      }

      results.push({
        groupId: group.groupId,
        lineRange: group.lineRange,
        filePath: firstChunk.filePath,
        score: maxScore,
        color: masteryScoreToColor(maxScore),
      });
    }

    return results;
  },
);

import { createSelector } from "@reduxjs/toolkit";
import type { MasteryNodeRef, NodeMasteryScore } from "core";
import {
  computeSituationGroups,
  toSituationNodeId,
} from "../../utils/situationGrouping";
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

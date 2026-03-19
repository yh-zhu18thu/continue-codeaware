import { createSelector } from "@reduxjs/toolkit";
import type { MasteryNodeRef, NodeMasteryScore } from "core";
import {
  computeSituationGroups,
  type SituationGroup,
  toSituationNodeId,
} from "../../utils/situationGrouping";
import { RootState } from "../store";

/**
 * Memoized base selector: 从 mappings + codeChunks 计算 situation groups。
 * 供 selectStepMastery / selectAllHighLevelStepMasteries 共享，避免重复计算。
 */
export const selectSituationGroups = createSelector(
  [
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (state: RootState) => state.codeAwareSession.codeChunks,
  ],
  (mappings, codeChunks): SituationGroup[] =>
    computeSituationGroups(mappings, codeChunks),
);

/**
 * 根据 stepId 计算其关联 situation 节点掌握度的加权平均。
 *
 * situation nodeId 格式: `sit-{stepId}-grp-L{startLine}`
 * 权重来自每个 situation group 的行数。
 */
export const selectStepMastery = createSelector(
  [
    (state: RootState) => state.codeAwareSession.nodeMasteryScores,
    selectSituationGroups,
    (_: RootState, stepId: string) => stepId,
  ],
  (
    scores: NodeMasteryScore[],
    groups: SituationGroup[],
    stepId,
  ): { score: number; situationCount: number } | null => {
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

/**
 * 批量计算所有 high-level step 的掌握度。
 * 对每个 highLevelStepId，取其下所有子 step 的 situation mastery 简单均值。
 * 仅计入有 mastery 数据的子 step；全部无数据时不放入结果 Map。
 */
export const selectAllHighLevelStepMasteries = createSelector(
  [
    (state: RootState) => state.codeAwareSession.nodeMasteryScores,
    (state: RootState) => state.codeAwareSession.stepToHighLevelMappings,
    selectSituationGroups,
  ],
  (
    scores: NodeMasteryScore[],
    mappings,
    groups,
  ): Map<string, { score: number; stepCount: number }> => {
    const result = new Map<string, { score: number; stepCount: number }>();

    if (mappings.length === 0 || groups.length === 0) {
      return result;
    }

    // 构建 situation score 查找表（一次）
    const sitScoreMap = new Map<string, number>();
    for (const s of scores) {
      if (s.nodeType === "situation") {
        sitScoreMap.set(s.nodeId, s.score);
      }
    }

    // 按 highLevelStepId 分组
    const hlToStepIds = new Map<string, string[]>();
    for (const m of mappings) {
      let arr = hlToStepIds.get(m.highLevelStepId);
      if (!arr) {
        arr = [];
        hlToStepIds.set(m.highLevelStepId, arr);
      }
      arr.push(m.stepId);
    }

    // 对每个 highLevelStep 计算其子 step mastery 均值
    for (const [hlId, stepIds] of hlToStepIds) {
      let totalStepScore = 0;
      let stepWithDataCount = 0;

      for (const stepId of stepIds) {
        const relevantGroups = groups.filter((g) => g.stepIds.includes(stepId));
        if (relevantGroups.length === 0) {
          continue;
        }

        let totalWeight = 0;
        let weightedSum = 0;
        for (const group of relevantGroups) {
          const sitId = toSituationNodeId(stepId, group.groupId);
          const sitScore = sitScoreMap.get(sitId);
          if (sitScore === undefined) {
            continue;
          }
          const weight = group.lineCount;
          weightedSum += sitScore * weight;
          totalWeight += weight;
        }

        if (totalWeight > 0) {
          totalStepScore += weightedSum / totalWeight;
          stepWithDataCount++;
        }
      }

      if (stepWithDataCount > 0) {
        result.set(hlId, {
          score: totalStepScore / stepWithDataCount,
          stepCount: stepWithDataCount,
        });
      }
    }

    return result;
  },
);

/**
 * 单个 high-level step 的掌握度便捷 selector。
 * 内部依赖 selectAllHighLevelStepMasteries（已 memoize），不会重复计算。
 */
export const selectHighLevelStepMastery = createSelector(
  [
    selectAllHighLevelStepMasteries,
    (_: RootState, highLevelStepId: string) => highLevelStepId,
  ],
  (
    all: Map<string, { score: number; stepCount: number }>,
    highLevelStepId,
  ): { score: number; stepCount: number } | null => {
    return all.get(highLevelStepId) ?? null;
  },
);

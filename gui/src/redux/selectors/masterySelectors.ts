import { createSelector } from "@reduxjs/toolkit";
import type { NodeMasteryScore } from "core";
import { RootState } from "../store";

/**
 * 根据 stepId 计算其关联 situation 节点掌握度的加权平均。
 *
 * situation nodeId 格式: `sit-{stepId}-{codeChunkId}`
 * 权重来自每个 mapping 的 confidence（默认 1）。
 */
export const selectStepMastery = createSelector(
  [
    (state: RootState) => state.codeAwareSession.nodeMasteryScores,
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (_: RootState, stepId: string) => stepId,
  ],
  (
    scores: NodeMasteryScore[],
    mappings,
    stepId,
  ): { score: number; situationCount: number } | null => {
    // 找到该 step 的所有 step-mapping（step -> codeChunk）
    const stepMappings = mappings.filter(
      (m) => m.semanticElementType === "step" && m.semanticElementId === stepId,
    );

    if (stepMappings.length === 0) {
      return null;
    }

    // 构造 situation nodeId 集合
    const situationIds = stepMappings.map(
      (m) => `sit-${stepId}-${m.codeChunkId}`,
    );

    // 构建 score 查找表（仅 situation 类型）
    const scoreMap = new Map<string, number>();
    for (const s of scores) {
      if (s.nodeType === "situation") {
        scoreMap.set(s.nodeId, s.score);
      }
    }

    // 加权平均：weight = mapping.confidence ?? 1
    let totalWeight = 0;
    let weightedSum = 0;

    for (let i = 0; i < situationIds.length; i++) {
      const sitId = situationIds[i];
      const sitScore = scoreMap.get(sitId);
      if (sitScore === undefined) {
        continue;
      }
      const weight = stepMappings[i].confidence ?? 1;
      weightedSum += sitScore * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return null;
    }

    return {
      score: weightedSum / totalWeight,
      situationCount: situationIds.length,
    };
  },
);

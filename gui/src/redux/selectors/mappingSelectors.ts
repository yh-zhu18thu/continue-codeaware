import { createSelector } from "@reduxjs/toolkit";
import { CodeAwareMapping } from "core";
import { RootState } from "../store";

/**
 * 根据代码块 ID 查找所有关联的语义元素映射
 * @param state Redux state
 * @param codeChunkId 代码块 ID
 * @returns 包含该代码块的所有映射
 */
export const selectSemanticElementsByCodeChunkId = createSelector(
  [
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (_: RootState, codeChunkId: string) => codeChunkId,
  ],
  (mappings, codeChunkId): CodeAwareMapping[] => {
    return mappings.filter((m) => m.codeChunkId === codeChunkId);
  },
);

/**
 * 根据语义元素 ID 查找所有关联的代码块映射
 * @param state Redux state
 * @param semanticElementId 语义元素 ID
 * @returns 包含该语义元素的所有映射
 */
export const selectCodeChunksBySemanticElementId = createSelector(
  [
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (_: RootState, semanticElementId: string) => semanticElementId,
  ],
  (mappings, semanticElementId): CodeAwareMapping[] => {
    return mappings.filter((m) => m.semanticElementId === semanticElementId);
  },
);

/**
 * 检查缓存中是否存在指定的映射
 * @param state Redux state
 * @param params 查询参数，可以是代码块 ID 或语义元素 ID
 * @returns 是否存在缓存
 */
export const hasCachedMapping = createSelector(
  [
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (
      _: RootState,
      params: { codeChunkId?: string; semanticElementId?: string },
    ) => params,
  ],
  (mappings, params): boolean => {
    if (params.codeChunkId) {
      return mappings.some((m) => m.codeChunkId === params.codeChunkId);
    }
    if (params.semanticElementId) {
      return mappings.some(
        (m) => m.semanticElementId === params.semanticElementId,
      );
    }
    return false;
  },
);

/**
 * 获取所有映射的数量
 */
export const selectMappingCount = createSelector(
  [(state: RootState) => state.codeAwareSession.codeAwareMappings],
  (mappings): number => mappings.length,
);

/**
 * 获取映射查找状态
 */
export const selectMappingLookupState = createSelector(
  [(state: RootState) => state.codeAwareSession.mappingLookup],
  (lookupState) => lookupState,
);

/**
 * 获取缓存命中率统计（用于性能监控）
 */
export const selectMappingsBySource = createSelector(
  [(state: RootState) => state.codeAwareSession.codeAwareMappings],
  (mappings) => {
    const stats = {
      total: mappings.length,
      llm: 0,
      manual: 0,
      initial: 0,
    };

    mappings.forEach((m) => {
      if (m.source === "llm") stats.llm++;
      else if (m.source === "manual") stats.manual++;
      else if (m.source === "initial") stats.initial++;
    });

    return stats;
  },
);

/**
 * 根据 knowledge card ID 查找其父 step 的代码映射
 * 因为 mapping 只保存到 step 级别，knowledge card 需要通过其父 step 间接映射
 *
 * @param state Redux state
 * @param knowledgeCardId knowledge card ID
 * @returns 父 step 的代码映射
 */
export const selectCodeChunksByKnowledgeCardId = createSelector(
  [
    (state: RootState) => state.codeAwareSession.steps,
    (state: RootState) => state.codeAwareSession.codeAwareMappings,
    (_: RootState, knowledgeCardId: string) => knowledgeCardId,
  ],
  (steps, mappings, knowledgeCardId): CodeAwareMapping[] => {
    // 1. 找到 knowledge card 所属的 step
    let parentStepId: string | null = null;
    for (const step of steps) {
      const card = step.knowledgeCards?.find((c) => c.id === knowledgeCardId);
      if (card) {
        parentStepId = step.id;
        break;
      }
    }

    if (!parentStepId) {
      console.warn(`⚠️ Knowledge card ${knowledgeCardId} 不属于任何 step`);
      return [];
    }

    // 2. 返回父 step 的代码映射
    const parentMappings = mappings.filter(
      (m) => m.semanticElementId === parentStepId,
    );

    console.log(
      `📋 Knowledge card ${knowledgeCardId} 通过父 step ${parentStepId} 找到 ${parentMappings.length} 个代码映射`,
    );

    return parentMappings;
  },
);

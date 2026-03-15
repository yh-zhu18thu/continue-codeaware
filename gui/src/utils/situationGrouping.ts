/**
 * Situation grouping: 将行级 code-chunk→step 映射按"连续行 + 相同 step 集合"
 * 分组为 situation groups。每个 group 产生 N 个 situation node（每个 step 一个），
 * 每个 situation node 直接连接该 group 中的所有 code chunks。
 *
 * 不存储在 state 中，需要时从 mappings + codeChunks 实时计算。
 */

import type { CodeAwareMapping, CodeChunk } from "core";

export interface SituationGroup {
  /** 稳定 ID，格式: `grp-L{startLine}` */
  groupId: string;
  /** 该 group 关联的所有 step ID */
  stepIds: string[];
  /** 该 group 包含的 code chunk IDs */
  codeChunkIds: string[];
  /** 行号范围 [startLine, endLine] */
  lineRange: [number, number];
  /** 行数 */
  lineCount: number;
}

/**
 * 为一个 situation group 中的某个 step 生成 situation node ID。
 * 格式: `sit-{stepId}-grp-L{startLine}`
 */
export function toSituationNodeId(stepId: string, groupId: string): string {
  return `sit-${stepId}-${groupId}`;
}

/**
 * 从 mappings 和 code chunks 计算 situation groups。
 *
 * 合并规则：
 * 1. 同一 step 集合的连续行合并（允许最多 2 行空行/未映射行间隔）
 * 2. 不同 step 集合 → 不同 group
 */
export function computeSituationGroups(
  mappings: CodeAwareMapping[],
  codeChunks: CodeChunk[],
): SituationGroup[] {
  const chunkById = new Map<string, CodeChunk>();
  const chunkIdByLine = new Map<number, string>();
  codeChunks.forEach((chunk) => {
    chunkById.set(chunk.id, chunk);
    const [start, end] = chunk.range;
    for (let line = start; line <= end; line++) {
      chunkIdByLine.set(line, chunk.id);
    }
  });

  // Build lineNumber → Set<stepId>
  const lineToStepIds = new Map<number, Set<string>>();
  mappings.forEach((m) => {
    if (m.semanticElementType !== "step") {
      return;
    }
    const chunk = chunkById.get(m.codeChunkId);
    if (!chunk) {
      return;
    }
    const [start, end] = chunk.range;
    for (let line = start; line <= end; line++) {
      let stepSet = lineToStepIds.get(line);
      if (!stepSet) {
        stepSet = new Set();
        lineToStepIds.set(line, stepSet);
      }
      stepSet.add(m.semanticElementId);
    }
  });

  const mappedLines = Array.from(lineToStepIds.keys()).sort((a, b) => a - b);
  if (mappedLines.length === 0) {
    return [];
  }

  const stepSetKey = (s: Set<string>) => Array.from(s).sort().join(",");

  interface Segment {
    startLine: number;
    endLine: number;
    stepIds: Set<string>;
    mappedLines: number[];
  }

  const segments: Segment[] = [];
  let cur: Segment | null = null;

  for (const line of mappedLines) {
    const stepIds = lineToStepIds.get(line)!;
    const key = stepSetKey(stepIds);

    if (cur) {
      const gap = line - cur.endLine;
      if (stepSetKey(cur.stepIds) === key && gap <= 3) {
        cur.endLine = line;
        cur.mappedLines.push(line);
        continue;
      }
    }

    if (cur) {
      segments.push(cur);
    }
    cur = {
      startLine: line,
      endLine: line,
      stepIds: new Set(stepIds),
      mappedLines: [line],
    };
  }
  if (cur) {
    segments.push(cur);
  }

  return segments.map((seg) => {
    const chunkIds = new Set<string>();
    seg.mappedLines.forEach((line) => {
      const chunkId = chunkIdByLine.get(line);
      if (chunkId) {
        chunkIds.add(chunkId);
      }
    });

    return {
      groupId: `grp-L${seg.startLine}`,
      stepIds: Array.from(seg.stepIds),
      codeChunkIds: Array.from(chunkIds),
      lineRange: [seg.startLine, seg.endLine] as [number, number],
      lineCount: seg.endLine - seg.startLine + 1,
    };
  });
}

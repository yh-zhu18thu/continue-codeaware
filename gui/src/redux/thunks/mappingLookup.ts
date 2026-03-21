/**
 * 新版 Mapping 查找系统 (V2)
 *
 * 核心改进：
 * 1. 实时从 IDE 读取代码，不依赖 Redux state 中的 codeChunks
 * 2. 使用 codeChunkUtils 动态分割代码
 * 3. 验证缓存中的 mapping 是否仍然有效
 * 4. 实现智能缓存策略（利用层级关系）
 * 5. 提供通用接口供多个场景复用
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { CodeAwareMapping, CodeChunk } from "core";
import {
  findSimilarChunk,
  generateCodeChunks,
  isChunkStillValid,
} from "../../utils/codeChunkUtils";
import {
  selectCodeChunksBySemanticElementId,
  selectSemanticElementsByCodeChunkId,
} from "../selectors/mappingSelectors";
import {
  addMappingsToBatch,
  setMappingLookupError,
  setMappingLookupLoading,
} from "../slices/codeAwareSlice";
import type { RootState, ThunkApiType } from "../store";

/**
 * ===============================
 * 辅助函数：从 IDE 实时读取和分割代码
 * ===============================
 */

/**
 * 标准化文件路径，确保路径格式一致
 * - 将 file:// URI 转换为普通路径
 * - 统一路径分隔符
 * @param path 文件路径或 URI
 * @returns 标准化后的路径
 */
function normalizeFilePath(path: string): string {
  let normalized = path;

  // 如果是 file:// URI，转换为普通路径
  if (normalized.startsWith("file://")) {
    // 移除 file:// 前缀
    normalized = normalized.replace(/^file:\/\//, "");
  }

  // 先解码 URI 编码的字符（%3A → : 等），再做 Windows 路径判断
  try {
    normalized = decodeURIComponent(normalized);
  } catch (e) {
    // 如果解码失败，保持原样
  }

  // 在 Windows 上，处理类似 /C:/... 的情况（去掉前导斜杠）
  // 在 Unix 上，/path 保持不变
  if (/^\/[a-zA-Z]:/.test(normalized)) {
    normalized = normalized.slice(1);
  }

  // 统一路径分隔符为正斜杠
  normalized = normalized.replace(/\\/g, "/");

  return normalized;
}

/**
 * 从 IDE 读取当前文件并分割为 code chunks
 * @returns { filePath, chunks }
 */
async function fetchAndSplitCurrentFile(ideMessenger: any): Promise<{
  filePath: string;
  fileContent: string;
  chunks: CodeChunk[];
} | null> {
  try {
    // 使用正确的方式获取当前文件（与 CodeAware.tsx 中的实现一致）
    const currentFileResponse = await ideMessenger.request(
      "getCurrentFile",
      undefined,
    );

    if (
      !currentFileResponse ||
      currentFileResponse.status !== "success" ||
      !currentFileResponse.content
    ) {
      console.warn("[CA:Mapping] 无法获取当前文件");
      throw new Error("无法读取当前文件");
    }

    const currentFile = currentFileResponse.content;

    if (!currentFile.path || !currentFile.contents) {
      console.warn("[CA:Mapping] 当前文件缺少路径或内容");
      throw new Error("无法读取当前文件");
    }

    const chunks = generateCodeChunks(
      currentFile.contents,
      currentFile.path,
      "atomic-line",
    );

    console.log(
      `[CA:Mapping]  读取文件 ${currentFile.path}，分割为 ${chunks.length} 个 chunks`,
    );

    return {
      filePath: currentFile.path,
      fileContent: currentFile.contents,
      chunks,
    };
  } catch (error) {
    console.error("[CA:Mapping] 读取文件失败:", error);
    throw error;
  }
}

function sanitizeJsonText(content: string): string {
  let text = content.trim();

  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}") + 1;
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    text = text.slice(jsonStart, jsonEnd);
  }

  return text;
}

function buildNumberedCode(code: string): string {
  return code
    .split("\n")
    .map((line, idx) => `${idx + 1}: ${line}`)
    .join("\n");
}

function constructStepToCodeLinesPrompt(
  step: {
    id: string;
    title: string;
    abstract: string;
  },
  numberedCode: string,
): string {
  return `你是代码映射助手。请针对“步骤”在完整代码中圈出直接实现该步骤的代码行。\n\n步骤信息：\n- ID: ${step.id}\n- 标题: ${step.title}\n- 描述: ${step.abstract}\n\n完整代码（已带行号）：\n${numberedCode}\n\n要求：\n1. 仅选择“直接实现该步骤”的代码，不要选择仅依赖、上下文、框架样板代码。\n2. 允许返回多个连续区间和零星单行。\n3. 行号必须来自上面的代码行号。\n4. 若该步骤暂无直接实现，返回空集合。\n\n返回严格 JSON：\n{\n "line_ranges": [{ "start_line": 1, "end_line": 3 }],\n "single_lines": [8, 12],\n "confidence": 0.0,\n "reason": "简短说明"\n}`;
}

function buildLineToChunkMap(chunks: CodeChunk[]): Map<number, string> {
  const lineToChunk = new Map<number, string>();
  chunks.forEach((chunk) => {
    const [start, end] = chunk.range;
    for (let line = start; line <= end; line++) {
      lineToChunk.set(line, chunk.id);
    }
  });
  return lineToChunk;
}

async function generateStepLineMappings(params: {
  stepIds: string[];
  state: RootState;
  fileContent: string;
  chunks: CodeChunk[];
  ideMessenger: any;
  source: "llm" | "initial";
}): Promise<CodeAwareMapping[]> {
  const { stepIds, state, fileContent, chunks, ideMessenger, source } = params;
  const numberedCode = buildNumberedCode(fileContent);
  const lineToChunk = buildLineToChunkMap(chunks);

  const mappings: CodeAwareMapping[] = [];

  for (const stepId of stepIds) {
    const step = state.codeAwareSession.steps.find(
      (item) => item.id === stepId,
    );
    if (!step) {
      continue;
    }

    const prompt = constructStepToCodeLinesPrompt(
      { id: step.id, title: step.title, abstract: step.abstract },
      numberedCode,
    );

    try {
      const response = await ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {
          temperature: 0.1,
          maxTokens: 1500,
        },
        title: "Step → Code Line Mapping",
      });

      if (response.status !== "success" || !response.content) {
        continue;
      }

      const parsed = JSON.parse(sanitizeJsonText(response.content)) as {
        line_ranges?: Array<{ start_line?: number; end_line?: number }>;
        single_lines?: number[];
        confidence?: number;
      };

      const lineSet = new Set<number>();

      (parsed.line_ranges || []).forEach((range) => {
        const startLine = Number(range.start_line);
        const endLine = Number(range.end_line);
        if (
          Number.isInteger(startLine) &&
          Number.isInteger(endLine) &&
          startLine > 0 &&
          endLine >= startLine
        ) {
          for (let line = startLine; line <= endLine; line++) {
            lineSet.add(line);
          }
        }
      });

      (parsed.single_lines || []).forEach((line) => {
        if (Number.isInteger(line) && line > 0) {
          lineSet.add(line);
        }
      });

      Array.from(lineSet)
        .sort((a, b) => a - b)
        .forEach((line) => {
          const chunkId = lineToChunk.get(line);
          if (!chunkId) {
            return;
          }

          mappings.push({
            codeChunkId: chunkId,
            semanticElementId: step.id,
            semanticElementType: "step",
            createdAt: Date.now(),
            source,
            confidence: parsed.confidence ?? 0.8,
          });
        });
    } catch (error) {
      console.warn(`[CA:Mapping] 步骤行映射失败: ${step.id}`, error);
    }
  }

  return mappings;
}

/**
 * ===============================
 * 缓存验证逻辑
 * ===============================
 */

/**
 * 验证缓存的 mappings 是否仍然有效
 *
 * 检查方式：
 * 1. 通过 chunk ID 检查是否仍然存在
 * 2. 可选：通过内容相似度检查（容忍小修改）
 *
 * @param cachedMappings 缓存的 mappings
 * @param currentChunks 当前代码分割出的 chunks
 * @returns 仍然有效的 mappings
 */
function validateCachedMappings(
  cachedMappings: CodeAwareMapping[],
  currentChunks: CodeChunk[],
  previousChunks: CodeChunk[] = [],
): { valid: CodeAwareMapping[]; invalid: CodeAwareMapping[] } {
  const valid: CodeAwareMapping[] = [];
  const invalid: CodeAwareMapping[] = [];

  const previousChunkMap = new Map(
    previousChunks.map((chunk) => [chunk.id, chunk]),
  );

  for (const mapping of cachedMappings) {
    // 检查 chunk 是否仍然存在
    const isValid = isChunkStillValid(mapping.codeChunkId, currentChunks);

    if (isValid) {
      valid.push(mapping);
    } else {
      const previousChunk = previousChunkMap.get(mapping.codeChunkId);
      if (!previousChunk) {
        invalid.push(mapping);
        continue;
      }

      const exactMatch = currentChunks.find(
        (chunk) =>
          chunk.filePath === previousChunk.filePath &&
          chunk.content.trim() === previousChunk.content.trim(),
      );

      const similarMatch =
        exactMatch || findSimilarChunk(previousChunk, currentChunks, 0.95);

      if (similarMatch) {
        valid.push({
          ...mapping,
          codeChunkId: similarMatch.id,
          createdAt: Date.now(),
        });
      } else {
        invalid.push(mapping);
      }
    }
  }

  if (invalid.length > 0) {
    console.warn(
      `[CA:Mapping]  发现 ${invalid.length} 个失效的 mappings，需要重新查找`,
      invalid,
    );
  } else if (valid.length > 0) {
    console.log(`[CA:Mapping] 缓存有效，命中 ${valid.length} 个 mappings`);
  }

  return { valid, invalid };
}

/**
 * ===============================
 * 行级映射主流程
 * ===============================
 */

/**
 * ===============================
 * 通用接口：Semantic → Code
 * ===============================
 */

export interface EstablishSemanticToCodeMappingParams {
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";
  forceRefresh?: boolean; // 是否强制刷新缓存
  strategy?: "smart" | "full"; // 兼容字段（当前流程未区分策略）
}

/**
 * 通用接口：建立 Semantic Element 到 Code 的映射
 *
 * 用途：
 * 1. 用户点击跳转按钮时查找代码
 * 2. 生成知识卡片时查找相关代码
 * 3. 其他需要 semantic → code 映射的场景
 *
 * 流程：
 * 1. 从 IDE 实时读取代码并分割
 * 2. 检查缓存并验证有效性
 * 3. 如果缓存失效或 forceRefresh，调用 LLM 查找
 * 4. 使用智能策略优化查找范围（可选）
 * 5. 将结果存入缓存
 */
export const establishSemanticToCodeMapping = createAsyncThunk<
  { mappings: CodeAwareMapping[]; chunks: CodeChunk[] },
  EstablishSemanticToCodeMappingParams,
  ThunkApiType
>(
  "codeAware/establishSemanticToCodeMapping",
  async (params, { getState, dispatch, extra }) => {
    const { ideMessenger } = extra;
    const state = getState();
    const { semanticElementId, semanticElementType, forceRefresh } = params;

    dispatch(setMappingLookupLoading(true));

    try {
      // 处理 knowledgeCard：转换为父 step
      let actualElementId = semanticElementId;
      let actualElementType: "highLevelStep" | "step" =
        semanticElementType as any;

      if (semanticElementType === "knowledgeCard") {
        // 查找 knowledge card 的父 step
        const steps = state.codeAwareSession.steps;
        let parentStepId: string | null = null;

        for (const step of steps) {
          const card = step.knowledgeCards?.find(
            (c) => c.id === semanticElementId,
          );
          if (card) {
            parentStepId = step.id;
            break;
          }
        }

        if (!parentStepId) {
          throw new Error(
            `Knowledge card ${semanticElementId} 不属于任何 step`,
          );
        }

        console.log(
          `[CA:Mapping]  Knowledge card ${semanticElementId} → 使用父 step ${parentStepId}`,
        );
        actualElementId = parentStepId;
        actualElementType = "step";
      }

      // 1. 从 IDE 实时读取代码并分割
      const fileData = await fetchAndSplitCurrentFile(ideMessenger);
      if (!fileData) {
        throw new Error("无法读取当前文件");
      }

      const { chunks, fileContent } = fileData;
      const previousChunks = state.codeAwareSession.codeChunks || [];

      const getValidStepMappings = (stepId: string): CodeAwareMapping[] => {
        const cached = selectCodeChunksBySemanticElementId(
          state,
          stepId,
        ).filter((mapping) => mapping.semanticElementType === "step");
        return validateCachedMappings(cached, chunks, previousChunks).valid;
      };

      let mappings: CodeAwareMapping[] = [];

      if (actualElementType === "highLevelStep") {
        const childStepIds = Array.from(
          new Set(
            state.codeAwareSession.stepToHighLevelMappings
              .filter((mapping) => mapping.highLevelStepId === actualElementId)
              .map((mapping) => mapping.stepId),
          ),
        );

        if (childStepIds.length === 0) {
          throw new Error(`HighLevelStep ${actualElementId} 没有关联步骤`);
        }

        const cachedMappings = forceRefresh
          ? []
          : childStepIds.flatMap((stepId) => getValidStepMappings(stepId));

        const coveredStepIds = new Set(
          cachedMappings.map((mapping) => mapping.semanticElementId),
        );
        const missingStepIds = forceRefresh
          ? childStepIds
          : childStepIds.filter((stepId) => !coveredStepIds.has(stepId));

        const generatedMappings =
          missingStepIds.length > 0
            ? await generateStepLineMappings({
                stepIds: missingStepIds,
                state,
                fileContent,
                chunks,
                ideMessenger,
                source: "llm",
              })
            : [];

        mappings = [...cachedMappings, ...generatedMappings];
      } else {
        const cachedMappings = forceRefresh
          ? []
          : getValidStepMappings(actualElementId);

        if (cachedMappings.length > 0) {
          mappings = cachedMappings;
        } else {
          mappings = await generateStepLineMappings({
            stepIds: [actualElementId],
            state,
            fileContent,
            chunks,
            ideMessenger,
            source: "llm",
          });
        }
      }

      // 5. 将结果存入缓存
      if (mappings.length > 0) {
        dispatch(addMappingsToBatch(mappings));
      }

      dispatch(setMappingLookupLoading(false));
      return { mappings, chunks };
    } catch (error: any) {
      dispatch(setMappingLookupError(error.message || "查找失败"));
      dispatch(setMappingLookupLoading(false));
      throw error;
    }
  },
);

/**
 * ===============================
 * 通用接口：Code → Semantic
 * ===============================
 */

export interface EstablishCodeToSemanticMappingParams {
  codeSelection: {
    filePath: string;
    startLine: number;
    endLine: number;
  };
  forceRefresh?: boolean;
  strategy?: "smart" | "full"; // 兼容字段（当前流程未区分策略）
}

/**
 * 通用接口：建立 Code 到 Semantic Element 的映射
 *
 * 用途：
 * 1. 用户在编辑器中选中代码，查找对应的步骤
 * 2. 其他需要 code → semantic 映射的场景
 *
 * 流程：
 * 1. 从 IDE 实时读取代码并分割
 * 2. 根据行号范围找到对应的 code chunk
 * 3. 检查缓存并验证有效性
 * 4. 如果缓存失效或 forceRefresh，调用 LLM 查找
 * 5. 将结果存入缓存
 */
export const establishCodeToSemanticMapping = createAsyncThunk<
  { mappings: CodeAwareMapping[]; chunk: CodeChunk },
  EstablishCodeToSemanticMappingParams,
  ThunkApiType
>(
  "codeAware/establishCodeToSemanticMapping",
  async (params, { getState, dispatch, extra }) => {
    const { ideMessenger } = extra;
    const state = getState();
    const { codeSelection, forceRefresh } = params;

    dispatch(setMappingLookupLoading(true));

    try {
      // 1. 从 IDE 实时读取代码并分割
      const fileData = await fetchAndSplitCurrentFile(ideMessenger);
      if (!fileData) {
        throw new Error("无法读取当前文件");
      }

      const { filePath, chunks, fileContent } = fileData;

      // 验证文件路径是否匹配（标准化路径格式）
      const normalizedCurrentPath = normalizeFilePath(filePath);
      const normalizedSelectionPath = normalizeFilePath(codeSelection.filePath);

      console.log("[CA:Mapping] 路径对比:", {
        currentFile: normalizedCurrentPath,
        selectionFile: normalizedSelectionPath,
      });

      if (normalizedCurrentPath !== normalizedSelectionPath) {
        throw new Error(
          `当前文件与选中的代码文件不匹配\n当前文件: ${normalizedCurrentPath}\n选中文件: ${normalizedSelectionPath}`,
        );
      }

      // 2. 根据行号范围找到对应的 code chunks
      const targetChunks = chunks.filter((chunk) => {
        const [chunkStart, chunkEnd] = chunk.range;
        const { startLine, endLine } = codeSelection;

        // 检查是否重叠
        return startLine <= chunkEnd && endLine >= chunkStart;
      });

      if (targetChunks.length === 0) {
        throw new Error(
          `找不到对应的代码块 (行 ${codeSelection.startLine}-${codeSelection.endLine})`,
        );
      }

      const collectMappingsFromChunks = (currentState: RootState) => {
        const stepMappings = targetChunks.flatMap((chunk) =>
          selectSemanticElementsByCodeChunkId(currentState, chunk.id).filter(
            (mapping) => mapping.semanticElementType === "step",
          ),
        );

        const dedupStepMappings = Array.from(
          new Map(
            stepMappings.map((mapping) => [
              `${mapping.codeChunkId}-${mapping.semanticElementId}`,
              mapping,
            ]),
          ).values(),
        );

        const stepToHighLevel = new Map(
          currentState.codeAwareSession.stepToHighLevelMappings.map(
            (mapping) => [mapping.stepId, mapping.highLevelStepId],
          ),
        );

        const highLevelMap = new Map<string, CodeAwareMapping>();
        dedupStepMappings.forEach((mapping) => {
          const highLevelStepId = stepToHighLevel.get(
            mapping.semanticElementId,
          );
          if (!highLevelStepId) {
            return;
          }

          const key = `${mapping.codeChunkId}-${highLevelStepId}-highLevelStep`;
          if (!highLevelMap.has(key)) {
            highLevelMap.set(key, {
              ...mapping,
              semanticElementId: highLevelStepId,
              semanticElementType: "highLevelStep",
            });
          }
        });
        const derivedHighLevelMappings = Array.from(highLevelMap.values());

        return [...dedupStepMappings, ...derivedHighLevelMappings];
      };

      // 3. 检查缓存
      let cachedMappings = collectMappingsFromChunks(state);

      if (!forceRefresh && cachedMappings.length > 0) {
        console.log(
          `[CA:Mapping]  缓存命中 - 代码区间 ${targetChunks.length} 个行块`,
          cachedMappings,
        );
        dispatch(setMappingLookupLoading(false));
        return { mappings: cachedMappings, chunk: targetChunks[0] };
      }

      // 4. 缓存不足时，按“步骤 -> 代码行”补齐映射后再反查
      const allStepIds = state.codeAwareSession.steps.map((step) => step.id);
      const generatedMappings = await generateStepLineMappings({
        stepIds: allStepIds,
        state,
        fileContent,
        chunks,
        ideMessenger,
        source: "llm",
      });

      if (generatedMappings.length > 0) {
        dispatch(addMappingsToBatch(generatedMappings));
      }

      const refreshedState = getState();
      cachedMappings = collectMappingsFromChunks(refreshedState);

      dispatch(setMappingLookupLoading(false));
      return { mappings: cachedMappings, chunk: targetChunks[0] };
    } catch (error: any) {
      dispatch(setMappingLookupError(error.message || "查找失败"));
      dispatch(setMappingLookupLoading(false));
      throw error;
    }
  },
);

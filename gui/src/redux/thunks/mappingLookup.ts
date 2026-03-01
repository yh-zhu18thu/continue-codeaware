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
  generateCodeChunks,
  isChunkStillValid,
} from "../../utils/codeChunkUtils";
import { selectCodeChunksBySemanticElementId } from "../selectors/mappingSelectors";
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
 * 从 IDE 读取当前文件并分割为 code chunks
 * @returns { filePath, chunks }
 */
async function fetchAndSplitCurrentFile(
  ideMessenger: any,
): Promise<{ filePath: string; chunks: CodeChunk[] } | null> {
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
      console.warn("⚠️ 无法获取当前文件");
      throw new Error("无法读取当前文件");
    }

    const currentFile = currentFileResponse.content;

    if (!currentFile.path || !currentFile.contents) {
      console.warn("⚠️ 当前文件缺少路径或内容");
      throw new Error("无法读取当前文件");
    }

    const chunks = generateCodeChunks(currentFile.contents, currentFile.path);

    console.log(
      `📁 读取文件 ${currentFile.path}，分割为 ${chunks.length} 个 chunks`,
    );

    return {
      filePath: currentFile.path,
      chunks,
    };
  } catch (error) {
    console.error("❌ 读取文件失败:", error);
    throw error;
  }
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
): { valid: CodeAwareMapping[]; invalid: CodeAwareMapping[] } {
  const valid: CodeAwareMapping[] = [];
  const invalid: CodeAwareMapping[] = [];

  for (const mapping of cachedMappings) {
    // 检查 chunk 是否仍然存在
    const isValid = isChunkStillValid(mapping.codeChunkId, currentChunks);

    if (isValid) {
      valid.push(mapping);
    } else {
      invalid.push(mapping);
    }
  }

  if (invalid.length > 0) {
    console.warn(
      `⚠️ 发现 ${invalid.length} 个失效的 mappings，需要重新查找`,
      invalid,
    );
  } else if (valid.length > 0) {
    console.log(`✅ 缓存有效，命中 ${valid.length} 个 mappings`);
  }

  return { valid, invalid };
}

/**
 * ===============================
 * LLM 查找逻辑
 * ===============================
 */

/**
 * 构造 Semantic → Code 的 LLM prompt
 */
function constructSemanticToCodePrompt(
  semanticElement: {
    id: string;
    type: "highLevelStep" | "step";
    content: string;
  },
  codeChunks: Array<{ id: string; content: string }>,
): string {
  const elementType =
    semanticElement.type === "highLevelStep" ? "高级步骤" : "步骤";

  return `你是一个代码分析助手。请帮我找出以下${elementType}对应的代码块。

${elementType}内容：
${semanticElement.content}

可选的代码块（每个块之间用 --- 分隔）：
${codeChunks
  .map(
    (chunk, idx) => `
代码块 ${idx + 1} (ID: ${chunk.id}):
\`\`\`
${chunk.content}
\`\`\`
---`,
  )
  .join("\n")}

请分析${elementType}与每个代码块的关联程度，返回最相关的代码块ID列表和置信度。

返回格式（JSON）：
{
  "matches": [
    {
      "chunkId": "代码块ID",
      "confidence": 0.9,
      "reason": "匹配原因"
    }
  ]
}

注意：
1. 只返回高度相关的代码块（confidence >= 0.7）
2. 可以返回多个代码块
3. 如果没有相关的代码块，返回空数组`;
}

/**
 * 构造 Code → Semantic 的 LLM prompt
 */
function constructCodeToSemanticPrompt(
  codeChunk: CodeChunk,
  semanticElements: Array<{
    id: string;
    type: "highLevelStep" | "step";
    content: string;
  }>,
): string {
  return `你是一个代码分析助手。请帮我找出以下代码块对应的步骤。

代码块内容：
\`\`\`
${codeChunk.content}
\`\`\`

可选的步骤：
${semanticElements
  .map(
    (elem, idx) => `
步骤 ${idx + 1} (ID: ${elem.id}, 类型: ${elem.type}):
${elem.content}
---`,
  )
  .join("\n")}

请分析代码块与每个步骤的关联程度，返回最相关的步骤ID列表和置信度。

返回格式（JSON）：
{
  "matches": [
    {
      "elementId": "步骤ID",
      "elementType": "highLevelStep 或 step",
      "confidence": 0.9,
      "reason": "匹配原因"
    }
  ]
}

注意：
1. 只返回高度相关的步骤（confidence >= 0.7）
2. 可以返回多个步骤
3. 如果没有相关的步骤，返回空数组`;
}

/**
 * 调用 LLM 进行 Semantic → Code 查找
 */
async function performLLMSemanticToCode(
  semanticElement: {
    id: string;
    type: "highLevelStep" | "step";
    content: string;
  },
  codeChunks: CodeChunk[],
  ideMessenger: any,
): Promise<CodeAwareMapping[]> {
  const prompt = constructSemanticToCodePrompt(
    semanticElement,
    codeChunks.map((c) => ({ id: c.id, content: c.content })),
  );

  try {
    const response = await ideMessenger.request("llm/complete", {
      prompt,
      completionOptions: {
        temperature: 0.1,
        maxTokens: 1000,
      },
      title: "Semantic → Code Mapping",
    });

    if (response.status !== "success" || !response.content) {
      throw new Error("LLM 请求失败");
    }

    // 解析 LLM 响应
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("LLM 响应格式错误");
    }

    const result = JSON.parse(jsonMatch[0]);
    const mappings: CodeAwareMapping[] = [];

    for (const match of result.matches || []) {
      if (match.confidence >= 0.7) {
        mappings.push({
          codeChunkId: match.chunkId,
          semanticElementId: semanticElement.id,
          semanticElementType: semanticElement.type,
          createdAt: Date.now(),
          source: "llm",
          confidence: match.confidence,
        });
      }
    }

    console.log(`🤖 LLM 查找完成，找到 ${mappings.length} 个匹配`, mappings);

    return mappings;
  } catch (error) {
    console.error("❌ LLM 查找失败:", error);
    return [];
  }
}

/**
 * 调用 LLM 进行 Code → Semantic 查找
 */
async function performLLMCodeToSemantic(
  codeChunk: CodeChunk,
  semanticElements: Array<{
    id: string;
    type: "highLevelStep" | "step";
    content: string;
  }>,
  ideMessenger: any,
): Promise<CodeAwareMapping[]> {
  const prompt = constructCodeToSemanticPrompt(codeChunk, semanticElements);

  try {
    const response = await ideMessenger.request("llm/complete", {
      prompt,
      completionOptions: {
        temperature: 0.1,
        maxTokens: 1000,
      },
      title: "Code → Semantic Mapping",
    });

    if (response.status !== "success" || !response.content) {
      throw new Error("LLM 请求失败");
    }

    // 解析 LLM 响应
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("LLM 响应格式错误");
    }

    const result = JSON.parse(jsonMatch[0]);
    const mappings: CodeAwareMapping[] = [];

    for (const match of result.matches || []) {
      if (match.confidence >= 0.7) {
        mappings.push({
          codeChunkId: codeChunk.id,
          semanticElementId: match.elementId,
          semanticElementType: match.elementType,
          createdAt: Date.now(),
          source: "llm",
          confidence: match.confidence,
        });
      }
    }

    console.log(`🤖 LLM 查找完成，找到 ${mappings.length} 个匹配`, mappings);

    return mappings;
  } catch (error) {
    console.error("❌ LLM 查找失败:", error);
    return [];
  }
}

/**
 * ===============================
 * 智能缓存策略
 * ===============================
 */

/**
 * 查找父 HighLevel Step ID（通过 stepToHighLevelMappings）
 */
function findParentHighLevelStepId(
  state: RootState,
  stepId: string,
): string | null {
  const mapping = state.codeAwareSession.stepToHighLevelMappings.find(
    (m) => m.stepId === stepId,
  );
  return mapping ? mapping.highLevelStepId : null;
}

/**
 * 在指定范围内进行 LLM 查找（智能优化）
 *
 * 当查找 step 时，如果其父 highlevel step 有 mapping，
 * 则只在父 highlevel step 对应的代码块范围内查找
 */
async function performSmartLLMSemanticToCode(
  semanticElement: {
    id: string;
    type: "highLevelStep" | "step";
    content: string;
  },
  allChunks: CodeChunk[],
  parentChunkIds: string[] | null,
  ideMessenger: any,
): Promise<CodeAwareMapping[]> {
  let targetChunks = allChunks;

  // 如果有父级 chunk 限制，缩小查找范围
  if (parentChunkIds && parentChunkIds.length > 0) {
    targetChunks = allChunks.filter((chunk) =>
      parentChunkIds.includes(chunk.id),
    );

    console.log(
      `🎯 智能优化：查找范围缩小到 ${targetChunks.length}/${allChunks.length} 个 chunks`,
    );
  }

  return await performLLMSemanticToCode(
    semanticElement,
    targetChunks,
    ideMessenger,
  );
}

/**
 * ===============================
 * 通用接口：Semantic → Code
 * ===============================
 */

export interface EstablishSemanticToCodeMappingParams {
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";
  forceRefresh?: boolean; // 是否强制刷新缓存
  strategy?: "smart" | "full"; // 使用智能策略还是全范围查找
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
    const { semanticElementId, semanticElementType, forceRefresh, strategy } =
      params;

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
          `📋 Knowledge card ${semanticElementId} → 使用父 step ${parentStepId}`,
        );
        actualElementId = parentStepId;
        actualElementType = "step";
      }

      // 1. 从 IDE 实时读取代码并分割
      const fileData = await fetchAndSplitCurrentFile(ideMessenger);
      if (!fileData) {
        throw new Error("无法读取当前文件");
      }

      const { filePath, chunks } = fileData;

      // 2. 检查缓存
      const cachedMappings = selectCodeChunksBySemanticElementId(
        state,
        actualElementId,
      );

      if (!forceRefresh && cachedMappings.length > 0) {
        // 验证缓存
        const { valid, invalid } = validateCachedMappings(
          cachedMappings,
          chunks,
        );

        if (valid.length > 0) {
          // 缓存有效，直接返回
          dispatch(setMappingLookupLoading(false));
          return { mappings: valid, chunks };
        } else {
          // 缓存失效，清理
          console.log(`🗑️ 清理 ${invalid.length} 个失效的 mappings`);
          // TODO: 添加 removeInvalidMappings action
        }
      }

      // 3. 获取语义元素内容
      let semanticContent = "";
      if (actualElementType === "highLevelStep") {
        const hls = state.codeAwareSession.highLevelSteps.find(
          (h) => h.id === actualElementId,
        );
        semanticContent = hls?.content || "";
      } else {
        const step = state.codeAwareSession.steps.find(
          (s) => s.id === actualElementId,
        );
        semanticContent = step?.title || "";
      }

      if (!semanticContent) {
        throw new Error(`找不到语义元素 ${actualElementId}`);
      }

      // 4. 决定查找策略
      let mappings: CodeAwareMapping[] = [];

      if (strategy === "smart" && actualElementType === "step") {
        // 智能策略：利用父 highlevel step 的 mapping 缩小范围
        const parentHLSId = findParentHighLevelStepId(state, actualElementId);

        if (parentHLSId) {
          const parentMappings = selectCodeChunksBySemanticElementId(
            state,
            parentHLSId,
          );

          if (parentMappings.length > 0) {
            // 验证父级 mappings 仍然有效
            const { valid: validParentMappings } = validateCachedMappings(
              parentMappings,
              chunks,
            );

            if (validParentMappings.length > 0) {
              console.log(
                `🎯 使用智能策略：在父 highlevel step ${parentHLSId} 的范围内查找`,
              );

              mappings = await performSmartLLMSemanticToCode(
                {
                  id: actualElementId,
                  type: actualElementType,
                  content: semanticContent,
                },
                chunks,
                validParentMappings.map((m) => m.codeChunkId),
                ideMessenger,
              );
            }
          }
        }
      }

      // 降级：全范围查找
      if (mappings.length === 0) {
        console.log(`🔍 使用全范围查找策略`);
        mappings = await performLLMSemanticToCode(
          {
            id: actualElementId,
            type: actualElementType,
            content: semanticContent,
          },
          chunks,
          ideMessenger,
        );
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
  strategy?: "smart" | "full";
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

      const { filePath, chunks } = fileData;

      // 验证文件路径是否匹配
      if (filePath !== codeSelection.filePath) {
        throw new Error("当前文件与选中的代码文件不匹配");
      }

      // 2. 根据行号范围找到对应的 code chunk
      const targetChunk = chunks.find((chunk) => {
        const [chunkStart, chunkEnd] = chunk.range;
        const { startLine, endLine } = codeSelection;

        // 检查是否重叠
        return startLine <= chunkEnd && endLine >= chunkStart;
      });

      if (!targetChunk) {
        throw new Error(
          `找不到对应的代码块 (行 ${codeSelection.startLine}-${codeSelection.endLine})`,
        );
      }

      // 3. 检查缓存
      const cachedMappings = selectSemanticElementsByCodeChunkId(
        state,
        targetChunk.id,
      );

      if (!forceRefresh && cachedMappings.length > 0) {
        // 缓存命中
        console.log(`✅ 缓存命中 - 代码块 ${targetChunk.id}:`, cachedMappings);
        dispatch(setMappingLookupLoading(false));
        return { mappings: cachedMappings, chunk: targetChunk };
      }

      // 4. 收集候选语义元素
      const candidates: Array<{
        id: string;
        type: "highLevelStep" | "step";
        content: string;
      }> = [];

      // 添加高级步骤
      state.codeAwareSession.highLevelSteps.forEach((hls) => {
        candidates.push({
          id: hls.id,
          type: "highLevelStep",
          content: hls.content || "",
        });
      });

      // 添加步骤
      state.codeAwareSession.steps.forEach((step) => {
        candidates.push({
          id: step.id,
          type: "step",
          content: step.title || "",
        });
      });

      // 5. 调用 LLM 查找
      const mappings = await performLLMCodeToSemantic(
        targetChunk,
        candidates,
        ideMessenger,
      );

      // 6. 将结果存入缓存
      if (mappings.length > 0) {
        dispatch(addMappingsToBatch(mappings));
      }

      dispatch(setMappingLookupLoading(false));
      return { mappings, chunk: targetChunk };
    } catch (error: any) {
      dispatch(setMappingLookupError(error.message || "查找失败"));
      dispatch(setMappingLookupLoading(false));
      throw error;
    }
  },
);

/**
 * 导出辅助 selector（用于外部调用）
 */
function selectSemanticElementsByCodeChunkId(
  state: RootState,
  codeChunkId: string,
): CodeAwareMapping[] {
  return state.codeAwareSession.codeAwareMappings.filter(
    (m) => m.codeChunkId === codeChunkId,
  );
}

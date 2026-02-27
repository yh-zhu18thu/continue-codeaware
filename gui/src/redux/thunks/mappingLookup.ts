import { createAsyncThunk } from "@reduxjs/toolkit";
import { CodeAwareMapping } from "core";
import {
  selectCodeChunksBySemanticElementId,
  selectSemanticElementsByCodeChunkId,
} from "../selectors/mappingSelectors";
import {
  addMappingsToBatch,
  setMappingLookupError,
  setMappingLookupLoading,
} from "../slices/codeAwareSlice";
import { ThunkApiType } from "../store";

interface LookupCodeToSemanticParams {
  codeChunkId: string;
  useCache?: boolean;
}

interface LookupSemanticToCodeParams {
  semanticElementId: string;
  semanticElementType: "highLevelStep" | "step" | "knowledgeCard";
  useCache?: boolean;
}

// 代码 → 语义查找
export const lookupCodeToSemantic = createAsyncThunk<
  CodeAwareMapping[],
  LookupCodeToSemanticParams,
  ThunkApiType
>(
  "codeAware/lookupCodeToSemantic",
  async ({ codeChunkId, useCache = true }, { getState, dispatch, extra }) => {
    const state = getState();
    const { ideMessenger } = extra;

    // 1. 检查缓存
    if (useCache) {
      const cached = selectSemanticElementsByCodeChunkId(state, codeChunkId);
      if (cached.length > 0) {
        console.log(`✅ 缓存命中 - 代码块 ${codeChunkId}:`, cached);
        return cached;
      }
    }

    // 2. 从 state 获取代码块数据
    const codeChunk = state.codeAwareSession.codeChunks.find(
      (chunk) => chunk.id === codeChunkId,
    );
    if (!codeChunk) {
      throw new Error(`代码块 ${codeChunkId} 不存在`);
    }

    // 3. 收集候选语义元素
    const candidates: Array<{
      id: string;
      type: "highLevelStep" | "step" | "knowledgeCard";
      title: string;
    }> = [];

    // 添加高级步骤
    state.codeAwareSession.highLevelSteps.forEach((hls) => {
      candidates.push({
        id: hls.id,
        type: "highLevelStep",
        title: hls.content || "",
      });
    });

    // 添加步骤和知识卡片
    state.codeAwareSession.steps.forEach((step) => {
      candidates.push({
        id: step.id,
        type: "step",
        title: step.title || "",
      });

      step.knowledgeCards?.forEach((card) => {
        candidates.push({
          id: card.id,
          type: "knowledgeCard",
          title: card.title || "",
        });
      });
    });

    // 4. 构造 prompt
    const prompt = constructCodeToSemanticPrompt(codeChunk.content, candidates);

    // 5. 调用 LLM
    dispatch(setMappingLookupLoading(true));
    try {
      const response = await ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {
          temperature: 0.1,
          maxTokens: 500,
        },
        title: "映射查找",
      });

      if (response.status !== "success") {
        throw new Error("LLM 调用失败");
      }

      // 6. 解析结果
      const result = parseLLMResponse(response.content);

      // 7. 创建映射对象
      const mappings: CodeAwareMapping[] = result.matches.map((match: any) => ({
        codeChunkId,
        semanticElementId: match.id,
        semanticElementType: match.type,
        createdAt: Date.now(),
        source: "llm" as const,
        confidence: match.confidence,
      }));

      // 8. 添加到缓存
      dispatch(addMappingsToBatch(mappings));

      console.log(`✅ LLM 查找成功 - 代码块 ${codeChunkId}:`, mappings);
      return mappings;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      dispatch(setMappingLookupError(errorMessage));
      console.error("LLM 查找失败:", errorMessage);
      throw error;
    } finally {
      dispatch(setMappingLookupLoading(false));
    }
  },
);

// 语义 → 代码查找
export const lookupSemanticToCode = createAsyncThunk<
  CodeAwareMapping[],
  LookupSemanticToCodeParams,
  ThunkApiType
>(
  "codeAware/lookupSemanticToCode",
  async (
    { semanticElementId, semanticElementType, useCache = true },
    { getState, dispatch, extra },
  ) => {
    const state = getState();
    const { ideMessenger } = extra;

    // 1. 检查缓存
    if (useCache) {
      const cached = selectCodeChunksBySemanticElementId(
        state,
        semanticElementId,
      );
      if (cached.length > 0) {
        console.log(`✅ 缓存命中 - 语义元素 ${semanticElementId}:`, cached);
        return cached;
      }
    }

    // 2. 获取语义元素内容
    let semanticTitle = "";
    let semanticContent = "";

    if (semanticElementType === "highLevelStep") {
      const hls = state.codeAwareSession.highLevelSteps.find(
        (h) => h.id === semanticElementId,
      );
      if (!hls) throw new Error(`高级步骤 ${semanticElementId} 不存在`);
      semanticTitle = hls.content || "";
      semanticContent = hls.content || "";
    } else if (semanticElementType === "step") {
      const step = state.codeAwareSession.steps.find(
        (s) => s.id === semanticElementId,
      );
      if (!step) throw new Error(`步骤 ${semanticElementId} 不存在`);
      semanticTitle = step.title || "";
      semanticContent = step.abstract || "";
    } else {
      // knowledgeCard
      let found = false;
      for (const step of state.codeAwareSession.steps) {
        const card = step.knowledgeCards?.find(
          (c) => c.id === semanticElementId,
        );
        if (card) {
          semanticTitle = card.title || "";
          semanticContent = card.content || "";
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`知识卡片 ${semanticElementId} 不存在`);
    }

    // 3. 获取候选代码块
    const codeChunks = state.codeAwareSession.codeChunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
    }));

    // 4. 构造 prompt
    const prompt = constructSemanticToCodePrompt(
      semanticElementType,
      semanticTitle,
      semanticContent,
      codeChunks,
    );

    // 5. 调用 LLM
    dispatch(setMappingLookupLoading(true));
    try {
      const response = await ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {
          temperature: 0.1,
          maxTokens: 500,
        },
        title: "映射查找",
      });

      if (response.status !== "success") {
        throw new Error("LLM 调用失败");
      }

      // 6. 解析结果
      const result = parseLLMResponse(response.content);

      // 7. 创建映射对象
      const mappings: CodeAwareMapping[] = result.matches.map((match: any) => ({
        codeChunkId: match.id,
        semanticElementId,
        semanticElementType,
        createdAt: Date.now(),
        source: "llm" as const,
        confidence: match.confidence,
      }));

      // 8. 添加到缓存
      dispatch(addMappingsToBatch(mappings));

      console.log(`✅ LLM 查找成功 - 语义元素 ${semanticElementId}:`, mappings);
      return mappings;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      dispatch(setMappingLookupError(errorMessage));
      console.error("LLM 查找失败:", errorMessage);
      throw error;
    } finally {
      dispatch(setMappingLookupLoading(false));
    }
  },
);

// 辅助函数：构造代码到语义的 prompt
function constructCodeToSemanticPrompt(
  codeContent: string,
  candidates: Array<{ id: string; type: string; title: string }>,
): string {
  const candidatesList = candidates
    .map((c, i) => `${i + 1}. [${c.type}] ${c.id}: ${c.title}`)
    .join("\n");

  return `你是代码语义匹配助手。快速识别代码对应的学习步骤。

代码片段（${codeContent.length} 字符）:
\`\`\`
${codeContent.substring(0, 500)}
\`\`\`

候选元素（最多选3个）:
${candidatesList}

要求：
1. 返回最相关的1-3个元素
2. 按相关性排序
3. 置信度：0-1（1最相关）

JSON格式（必须）:
{"matches":[{"id":"step-1","type":"step","confidence":0.9}]}`;
}

// 辅助函数：构造语义到代码的 prompt
function constructSemanticToCodePrompt(
  semanticType: string,
  semanticTitle: string,
  semanticContent: string,
  codeChunks: Array<{ id: string; content: string }>,
): string {
  const chunksList = codeChunks
    .map(
      (chunk, i) =>
        `${i + 1}. ${chunk.id}:\n${chunk.content.substring(0, 200)}`,
    )
    .join("\n\n");

  return `你是代码语义匹配助手。找到与学习步骤相关的代码。

语义元素:
类型: ${semanticType}
标题: ${semanticTitle}
内容: ${semanticContent.substring(0, 300)}

候选代码块:
${chunksList}

要求：
1. 返回最相关的1-3个代码块
2. 按相关性排序
3. 置信度：0-1

JSON格式（必须）:
{"matches":[{"id":"c-1","confidence":0.85}]}`;
}

// 辅助函数：解析 LLM 响应
function parseLLMResponse(content: string): {
  matches: Array<{ id: string; type?: string; confidence: number }>;
} {
  try {
    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("无法从响应中提取 JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.matches || !Array.isArray(parsed.matches)) {
      throw new Error("响应格式错误：缺少 matches 数组");
    }

    return parsed;
  } catch (error) {
    console.error("解析 LLM 响应失败:", error, "原始内容:", content);
    throw new Error("解析 LLM 响应失败");
  }
}

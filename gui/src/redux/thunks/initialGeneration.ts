import { createAsyncThunk } from "@reduxjs/toolkit";
import type {
  CodeAwareMapping,
  CodeChunk,
  CodeChunkRelation,
  HighLevelStepItem,
  KnowledgePoint,
  KnowledgeRelation,
  KnowledgeToCodeChunkRelation,
  KnowledgeToStepRelation,
  StepItem,
  StepToHighLevelMapping,
} from "core";
import {
  constructExtractKnowledgePointsPrompt,
  constructGenerateStepsPrompt,
  constructMapCodeChunksToStepsPrompt,
  constructSplitCodeIntoChunksPrompt,
} from "core/llm/codeAwarePrompts";
import { buildCodeAwareCognitiveEdges } from "../../utils/codeAwareRelationGraph";
import {
  addInitialGenerationError,
  resetInitialGenerationStatus,
  setCodeAwareTitle,
  setCodeChunkRelations,
  setCodeChunks,
  setGeneratedSteps,
  setHighLevelSteps,
  setKnowledgePoints,
  setKnowledgeRelations,
  setKnowledgeToCodeChunkRelations,
  setKnowledgeToStepRelations,
  setLearningGoal,
  setStepToHighLevelMappings,
  setUserRequirementStatus,
  updateCodeAwareMappings,
  updateInitialGenerationStatus,
} from "../slices/codeAwareSlice";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import type { RootState, ThunkApiType } from "../store";
import { generateCodeFromSteps } from "./codeAwareGeneration";

type LlmCompleteResult = {
  status: "success" | "error";
  content?: string;
  error?: string;
};

type EmbeddingResult = {
  status: "success" | "error";
  content?: {
    embeddings?: number[][];
    embeddingId?: string;
  };
  error?: string;
};

function getPreferredModelTitle(state: RootState): string {
  const selectedModel =
    selectJsonGenerationModel(state) || selectSelectedChatModel(state);

  if (!selectedModel) {
    throw new Error("未找到可用模型，请先配置 Chat/JSON 模型");
  }

  return selectedModel.title;
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

function parseJsonFromLlm<T>(content: string): T {
  return JSON.parse(sanitizeJsonText(content)) as T;
}

async function completeJson(
  prompt: string,
  modelTitle: string,
  extra: ThunkApiType["extra"],
  maxRetries = 3,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = (await extra.ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {},
        title: modelTitle,
      })) as LlmCompleteResult;

      if (result.status === "success" && result.content) {
        return result.content;
      }

      throw new Error(result.error || "LLM 返回空内容");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(`LLM 调用失败: ${lastError?.message || "未知错误"}`);
}

async function embedTexts(
  texts: string[],
  extra: ThunkApiType["extra"],
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const response = (await extra.ideMessenger.request("llm/embed", {
    texts,
  })) as EmbeddingResult;

  if (response.status !== "success") {
    throw new Error(response.error || "Embedding 生成失败");
  }

  return response.content?.embeddings || [];
}

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length || vec1.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denom === 0) {
    return 0;
  }

  return dotProduct / denom;
}

function inferRelationType(
  kp1: KnowledgePoint,
  kp2: KnowledgePoint,
  similarity: number,
): "prerequisite" | "related" {
  if (kp1.difficulty !== kp2.difficulty && similarity > 0.85) {
    return "prerequisite";
  }
  return "related";
}

function deduplicateKnowledgePoints(
  points: KnowledgePoint[],
): KnowledgePoint[] {
  const uniqueMap = new Map<string, KnowledgePoint>();

  points.forEach((point) => {
    const key = point.title.toLowerCase().trim();
    const existing = uniqueMap.get(key);

    if (!existing) {
      uniqueMap.set(key, point);
      return;
    }

    existing.relatedStepIds = Array.from(
      new Set([...existing.relatedStepIds, ...point.relatedStepIds]),
    );
  });

  return Array.from(uniqueMap.values());
}

async function splitCodeIntoSemanticChunks(
  code: string,
  steps: StepItem[],
  modelTitle: string,
  extra: ThunkApiType["extra"],
): Promise<
  Array<{
    id: string;
    content: string;
    range: [number, number];
    semanticDescription: string;
  }>
> {
  const codeLines = code.split("\n");
  const totalLines = codeLines.length;
  const CHUNK_SIZE = 500;

  const allCodeChunks: Array<{
    start_line: number;
    end_line: number;
    semantic_description?: string;
  }> = [];

  for (let start = 0; start < totalLines; start += CHUNK_SIZE) {
    const batchLines = codeLines.slice(
      start,
      Math.min(start + CHUNK_SIZE, totalLines),
    );
    const batchCode = batchLines.join("\n");
    const startLine = start + 1;

    const prompt = constructSplitCodeIntoChunksPrompt(
      batchCode,
      startLine,
      steps.map((s) => ({ id: s.id, title: s.title, abstract: s.abstract })),
    );

    try {
      const llmContent = await completeJson(prompt, modelTitle, extra);
      const parsed = parseJsonFromLlm<{
        code_chunks?: Array<{
          start_line: number;
          end_line: number;
          semantic_description?: string;
        }>;
      }>(llmContent);

      (parsed.code_chunks || []).forEach((chunk) => {
        if (
          Number.isInteger(chunk.start_line) &&
          Number.isInteger(chunk.end_line) &&
          chunk.start_line >= startLine &&
          chunk.end_line >= chunk.start_line
        ) {
          allCodeChunks.push(chunk);
        }
      });
    } catch (error) {
      console.warn("⚠️ 代码块分割失败，使用降级策略", error);
    }
  }

  const sorted = allCodeChunks
    .sort((a, b) => a.start_line - b.start_line)
    .filter((chunk) => chunk.start_line <= totalLines)
    .map((chunk) => ({
      ...chunk,
      end_line: Math.min(chunk.end_line, totalLines),
    }));

  if (sorted.length === 0) {
    return [
      {
        id: "c-1",
        content: code,
        range: [1, totalLines],
        semanticDescription: "完整代码实现",
      },
    ];
  }

  return sorted.map((chunk, index) => {
    const content = codeLines
      .slice(chunk.start_line - 1, chunk.end_line)
      .join("\n");

    return {
      id: `c-${index + 1}`,
      content,
      range: [chunk.start_line, chunk.end_line] as [number, number],
      semanticDescription: chunk.semantic_description || "代码逻辑片段",
    };
  });
}

async function mapCodeChunksToSteps(
  codeChunks: Array<{
    id: string;
    content: string;
    semanticDescription: string;
  }>,
  steps: StepItem[],
  modelTitle: string,
  extra: ThunkApiType["extra"],
): Promise<CodeAwareMapping[]> {
  const BATCH_SIZE = 20;
  const mappings: CodeAwareMapping[] = [];

  for (let i = 0; i < codeChunks.length; i += BATCH_SIZE) {
    const batch = codeChunks.slice(i, i + BATCH_SIZE);
    const prompt = constructMapCodeChunksToStepsPrompt(
      batch.map((chunk) => ({
        id: chunk.id,
        description: chunk.semanticDescription,
        codePreview: chunk.content.slice(0, 220),
      })),
      steps.map((step) => ({
        id: step.id,
        title: step.title,
        abstract: step.abstract,
      })),
    );

    try {
      const llmContent = await completeJson(prompt, modelTitle, extra);
      const parsed = parseJsonFromLlm<{
        mappings?: Array<{
          code_chunk_id: string;
          step_id: string;
          confidence?: number;
        }>;
      }>(llmContent);

      (parsed.mappings || []).forEach((mapping) => {
        const hasChunk = batch.some(
          (chunk) => chunk.id === mapping.code_chunk_id,
        );
        const hasStep = steps.some((step) => step.id === mapping.step_id);
        if (!hasChunk || !hasStep) {
          return;
        }

        mappings.push({
          codeChunkId: mapping.code_chunk_id,
          semanticElementId: mapping.step_id,
          semanticElementType: "step",
          createdAt: Date.now(),
          source: "initial",
          confidence: mapping.confidence ?? 0.7,
        });
      });
    } catch (error) {
      console.warn("⚠️ 代码块映射失败，使用降级映射", error);

      batch.forEach((chunk, idx) => {
        const fallbackStep = steps[(i + idx) % steps.length];
        mappings.push({
          codeChunkId: chunk.id,
          semanticElementId: fallbackStep.id,
          semanticElementType: "step",
          createdAt: Date.now(),
          source: "initial",
          confidence: 0.45,
        });
      });
    }
  }

  if (mappings.length === 0) {
    codeChunks.forEach((chunk, idx) => {
      const step = steps[idx % steps.length];
      mappings.push({
        codeChunkId: chunk.id,
        semanticElementId: step.id,
        semanticElementType: "step",
        createdAt: Date.now(),
        source: "initial",
        confidence: 0.4,
      });
    });
  }

  return mappings;
}

export const generateTaskDecomposition = createAsyncThunk<
  void,
  { userRequirement: string },
  ThunkApiType
>(
  "codeAware/generateTaskDecomposition",
  async ({ userRequirement }, { dispatch, extra, getState }) => {
    const modelTitle = getPreferredModelTitle(getState());
    const prompt = constructGenerateStepsPrompt(userRequirement);
    const content = await completeJson(prompt, modelTitle, extra);

    const parsed = parseJsonFromLlm<{
      title?: string;
      learning_goal?: string;
      high_level_steps?: string[];
      steps?: Array<{
        title?: string;
        abstract?: string;
        task_corresponding_high_level_task?: number | string;
      }>;
    }>(content);

    const highLevelStepsArray = parsed.high_level_steps || [];
    const stepsArray = parsed.steps || [];

    const highLevelSteps: HighLevelStepItem[] = highLevelStepsArray.map(
      (item, index) => ({
        id: `r-${index + 1}`,
        content: item,
        isHighlighted: false,
        isCompleted: false,
      }),
    );

    const generatedSteps: StepItem[] = [];
    const mappings: StepToHighLevelMapping[] = [];

    stepsArray.forEach((step, index) => {
      const stepId = `s-${index + 1}`;

      generatedSteps.push({
        id: stepId,
        title: step.title || `步骤 ${index + 1}`,
        abstract: step.abstract || "",
        knowledgeCards: [],
        isHighlighted: false,
        stepStatus: "confirmed",
        knowledgeCardGenerationStatus: "empty",
      });

      const reference = step.task_corresponding_high_level_task;
      if (!reference) {
        return;
      }

      let highLevelIndex: number | null = null;
      const parsedIndex = parseInt(String(reference), 10);
      if (
        !isNaN(parsedIndex) &&
        parsedIndex >= 1 &&
        parsedIndex <= highLevelStepsArray.length
      ) {
        highLevelIndex = parsedIndex;
      } else {
        const matchedIndex = highLevelStepsArray.findIndex(
          (item) => item.trim() === String(reference).trim(),
        );
        if (matchedIndex !== -1) {
          highLevelIndex = matchedIndex + 1;
        }
      }

      if (highLevelIndex !== null) {
        mappings.push({
          stepId,
          highLevelStepId: `r-${highLevelIndex}`,
          highLevelStepIndex: highLevelIndex,
        });
      }
    });

    dispatch(setCodeAwareTitle(parsed.title || "未命名项目"));
    dispatch(setLearningGoal(parsed.learning_goal || ""));
    dispatch(setHighLevelSteps(highLevelSteps));
    dispatch(setGeneratedSteps(generatedSteps));
    dispatch(setStepToHighLevelMappings(mappings));
    dispatch(setUserRequirementStatus("finalized"));

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase1_completed",
      payload: {
        title: parsed.title || "",
        highLevelStepsCount: highLevelSteps.length,
        stepsCount: generatedSteps.length,
        timestamp: new Date().toISOString(),
      },
    });
  },
);

export const generateCompleteCode = createAsyncThunk<
  string,
  { targetFilePath?: string },
  ThunkApiType
>(
  "codeAware/generateCompleteCode",
  async ({ targetFilePath }, { dispatch, getState, extra }) => {
    const state = getState();
    const steps = state.codeAwareSession.steps;

    if (steps.length === 0) {
      throw new Error("没有可用步骤，无法生成代码");
    }

    let filepath = targetFilePath;
    if (!filepath) {
      const currentFile = await extra.ideMessenger.request(
        "getCurrentFile",
        undefined,
      );
      if (
        currentFile.status === "success" &&
        currentFile.content?.path &&
        currentFile.content?.path !== ""
      ) {
        filepath = currentFile.content.path;
      } else {
        filepath = "generated_code.py";
      }
    }

    await dispatch(
      generateCodeFromSteps({
        existingCode: "",
        filepath,
        orderedSteps: steps.map((step) => ({
          id: step.id,
          title: step.title,
          abstract: step.abstract,
        })),
        previouslyGeneratedSteps: [],
      }),
    ).unwrap();

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase2_completed",
      payload: {
        filepath,
        stepsCount: steps.length,
        timestamp: new Date().toISOString(),
      },
    });

    return filepath;
  },
);

export const createCodeToStepMappings = createAsyncThunk<
  void,
  { filePath: string },
  ThunkApiType
>(
  "codeAware/createCodeToStepMappings",
  async ({ filePath }, { dispatch, getState, extra }) => {
    const state = getState();
    const steps = state.codeAwareSession.steps;

    if (steps.length === 0) {
      return;
    }

    const modelTitle = getPreferredModelTitle(state);
    const fileResponse = await extra.ideMessenger.request("readFile", {
      filepath: filePath,
    });

    if (fileResponse.status !== "success") {
      throw new Error(`读取文件失败: ${filePath}`);
    }

    const generatedCode = fileResponse.content || "";
    if (!generatedCode.trim()) {
      dispatch(setCodeChunks([]));
      dispatch(updateCodeAwareMappings([]));
      return;
    }

    const chunks = await splitCodeIntoSemanticChunks(
      generatedCode,
      steps,
      modelTitle,
      extra,
    );

    const codeChunks: CodeChunk[] = chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      range: chunk.range,
      isHighlighted: false,
      disabled: false,
      filePath,
    }));

    dispatch(setCodeChunks(codeChunks));

    const mappings = await mapCodeChunksToSteps(
      chunks,
      steps,
      modelTitle,
      extra,
    );
    dispatch(updateCodeAwareMappings(mappings));

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase3_completed",
      payload: {
        codeChunksCount: codeChunks.length,
        mappingsCount: mappings.length,
        timestamp: new Date().toISOString(),
      },
    });
  },
);

export const analyzeCodeChunkRelations = createAsyncThunk<
  void,
  void,
  ThunkApiType
>(
  "codeAware/analyzeCodeChunkRelations",
  async (_, { dispatch, getState, extra }) => {
    const state = getState();
    const codeChunks = state.codeAwareSession.codeChunks;

    if (codeChunks.length < 2) {
      dispatch(setCodeChunkRelations([]));
      return;
    }

    const vectors = await embedTexts(
      codeChunks.map((chunk) => chunk.content),
      extra,
    );

    const validEmbeddings = vectors
      .map((embedding, index) => ({
        chunkId: codeChunks[index]?.id,
        embedding,
      }))
      .filter(
        (item): item is { chunkId: string; embedding: number[] } =>
          !!item.chunkId && Array.isArray(item.embedding),
      );

    const relations: CodeChunkRelation[] = [];
    const threshold = 0.6;

    for (let i = 0; i < validEmbeddings.length; i++) {
      for (let j = i + 1; j < validEmbeddings.length; j++) {
        const similarity = cosineSimilarity(
          validEmbeddings[i].embedding,
          validEmbeddings[j].embedding,
        );

        if (similarity >= threshold) {
          relations.push({
            fromChunkId: validEmbeddings[i].chunkId,
            toChunkId: validEmbeddings[j].chunkId,
            similarity,
            createdAt: Date.now(),
          });
          relations.push({
            fromChunkId: validEmbeddings[j].chunkId,
            toChunkId: validEmbeddings[i].chunkId,
            similarity,
            createdAt: Date.now(),
          });
        }
      }
    }

    dispatch(setCodeChunkRelations(relations));

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase4_completed",
      payload: {
        codeChunksCount: codeChunks.length,
        relationsCount: relations.length,
        timestamp: new Date().toISOString(),
      },
    });
  },
);

export const extractAndLinkKnowledge = createAsyncThunk<
  void,
  void,
  ThunkApiType
>(
  "codeAware/extractAndLinkKnowledge",
  async (_, { dispatch, getState, extra }) => {
    const state = getState();
    const steps = state.codeAwareSession.steps;
    const mappings = state.codeAwareSession.codeAwareMappings;
    const codeChunks = state.codeAwareSession.codeChunks;

    const modelTitle = getPreferredModelTitle(state);

    const allKnowledgePoints: KnowledgePoint[] = [];

    for (const step of steps) {
      const relatedChunkIds = mappings
        .filter(
          (mapping) =>
            mapping.semanticElementType === "step" &&
            mapping.semanticElementId === step.id,
        )
        .map((mapping) => mapping.codeChunkId);

      const codeContext = codeChunks
        .filter((chunk) => relatedChunkIds.includes(chunk.id))
        .map((chunk) => chunk.content)
        .join("\n\n");

      const prompt = constructExtractKnowledgePointsPrompt(
        { id: step.id, title: step.title, abstract: step.abstract },
        codeContext,
      );

      try {
        const content = await completeJson(prompt, modelTitle, extra);
        const parsed = parseJsonFromLlm<{
          knowledge_points?: Array<{
            title?: string;
            description?: string;
            category?: "syntax" | "algorithm" | "framework" | "concept";
            difficulty?: "easy" | "medium" | "hard";
          }>;
        }>(content);

        (parsed.knowledge_points || []).forEach((point, index) => {
          if (!point.title || !point.description) {
            return;
          }

          allKnowledgePoints.push({
            id: `k-${step.id}-${index + 1}`,
            title: point.title,
            content: point.description,
            relatedStepIds: [step.id],
            category: point.category,
            difficulty: point.difficulty || "medium",
          });
        });
      } catch (error) {
        console.warn(`⚠️ 提取知识点失败: ${step.id}`, error);
      }
    }

    const uniqueKnowledgePoints =
      deduplicateKnowledgePoints(allKnowledgePoints);
    dispatch(setKnowledgePoints(uniqueKnowledgePoints));

    const knowledgeToStepRelations: KnowledgeToStepRelation[] = [];
    const knowledgeToCodeChunkRelations: KnowledgeToCodeChunkRelation[] = [];

    const stepToChunkIds = new Map<string, string[]>();
    mappings
      .filter((mapping) => mapping.semanticElementType === "step")
      .forEach((mapping) => {
        const existing = stepToChunkIds.get(mapping.semanticElementId) || [];
        existing.push(mapping.codeChunkId);
        stepToChunkIds.set(
          mapping.semanticElementId,
          Array.from(new Set(existing)),
        );
      });

    uniqueKnowledgePoints.forEach((point) => {
      point.relatedStepIds.forEach((stepId) => {
        knowledgeToStepRelations.push({
          knowledgeId: point.id,
          stepId,
          createdAt: Date.now(),
        });

        const chunkIds = stepToChunkIds.get(stepId) || [];
        chunkIds.forEach((chunkId) => {
          knowledgeToCodeChunkRelations.push({
            knowledgeId: point.id,
            codeChunkId: chunkId,
            viaStepId: stepId,
            createdAt: Date.now(),
          });
        });
      });
    });

    const dedupKnowledgeToStep = Array.from(
      new Map(
        knowledgeToStepRelations.map((relation) => [
          `${relation.knowledgeId}-${relation.stepId}`,
          relation,
        ]),
      ).values(),
    );

    const dedupKnowledgeToCodeChunk = Array.from(
      new Map(
        knowledgeToCodeChunkRelations.map((relation) => [
          `${relation.knowledgeId}-${relation.codeChunkId}`,
          relation,
        ]),
      ).values(),
    );

    dispatch(setKnowledgeToStepRelations(dedupKnowledgeToStep));
    dispatch(setKnowledgeToCodeChunkRelations(dedupKnowledgeToCodeChunk));

    if (uniqueKnowledgePoints.length < 2) {
      dispatch(setKnowledgeRelations([]));
      return;
    }

    const vectors = await embedTexts(
      uniqueKnowledgePoints.map((point) => `${point.title}\n${point.content}`),
      extra,
    );

    const validEmbeddings = vectors
      .map((embedding, index) => ({
        knowledgeId: uniqueKnowledgePoints[index]?.id,
        embedding,
      }))
      .filter(
        (item): item is { knowledgeId: string; embedding: number[] } =>
          !!item.knowledgeId && Array.isArray(item.embedding),
      );

    const knowledgeById = new Map(
      uniqueKnowledgePoints.map((point) => [point.id, point]),
    );
    const relations: KnowledgeRelation[] = [];
    const threshold = 0.65;

    for (let i = 0; i < validEmbeddings.length; i++) {
      for (let j = i + 1; j < validEmbeddings.length; j++) {
        const similarity = cosineSimilarity(
          validEmbeddings[i].embedding,
          validEmbeddings[j].embedding,
        );

        if (similarity < threshold) {
          continue;
        }

        const kp1 = knowledgeById.get(validEmbeddings[i].knowledgeId);
        const kp2 = knowledgeById.get(validEmbeddings[j].knowledgeId);
        if (!kp1 || !kp2) {
          continue;
        }

        const relationType = inferRelationType(kp1, kp2, similarity);

        relations.push({
          fromKnowledgeId: kp1.id,
          toKnowledgeId: kp2.id,
          similarity,
          relationType,
          createdAt: Date.now(),
        });
        relations.push({
          fromKnowledgeId: kp2.id,
          toKnowledgeId: kp1.id,
          similarity,
          relationType,
          createdAt: Date.now(),
        });
      }
    }

    dispatch(setKnowledgeRelations(relations));

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase5_completed",
      payload: {
        knowledgePointsCount: uniqueKnowledgePoints.length,
        relationsCount: relations.length,
        knowledgeToStepCount: dedupKnowledgeToStep.length,
        knowledgeToCodeChunkCount: dedupKnowledgeToCodeChunk.length,
        timestamp: new Date().toISOString(),
      },
    });
  },
);

export const executeInitialGeneration = createAsyncThunk<
  void,
  { userRequirement: string; targetFilePath?: string },
  ThunkApiType
>(
  "codeAware/executeInitialGeneration",
  async (
    { userRequirement, targetFilePath },
    { dispatch, getState, extra },
  ) => {
    try {
      dispatch(resetInitialGenerationStatus());

      dispatch(
        updateInitialGenerationStatus({
          status: "generating-structure",
          currentPhase: "正在分析需求并生成任务分解结构...",
          progress: 10,
        }),
      );
      await dispatch(generateTaskDecomposition({ userRequirement })).unwrap();

      dispatch(
        updateInitialGenerationStatus({
          status: "generating-code",
          currentPhase: "正在生成完整代码实现...",
          progress: 30,
        }),
      );
      const filePath = await dispatch(
        generateCompleteCode({ targetFilePath }),
      ).unwrap();

      dispatch(
        updateInitialGenerationStatus({
          status: "mapping-code",
          currentPhase: "正在建立代码与步骤的对应关系...",
          progress: 60,
        }),
      );
      await dispatch(createCodeToStepMappings({ filePath })).unwrap();

      dispatch(
        updateInitialGenerationStatus({
          status: "analyzing-chunks",
          currentPhase: "正在分析代码块之间的语义关联...",
          progress: 75,
        }),
      );
      await dispatch(analyzeCodeChunkRelations()).unwrap();

      dispatch(
        updateInitialGenerationStatus({
          status: "extracting-knowledge",
          currentPhase: "正在提取背景知识点...",
          progress: 90,
        }),
      );
      await dispatch(extractAndLinkKnowledge()).unwrap();

      const finalState = getState().codeAwareSession;
      const unifiedEdges = buildCodeAwareCognitiveEdges(finalState);
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "initial_generation_unified_graph_built",
        payload: {
          edgesCount: unifiedEdges.length,
          timestamp: new Date().toISOString(),
        },
      });

      dispatch(
        updateInitialGenerationStatus({
          status: "completed",
          currentPhase: "初始化完成！",
          progress: 100,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch(addInitialGenerationError(message));
      dispatch(
        updateInitialGenerationStatus({
          status: "error",
          currentPhase: "生成过程出错",
          progress: 0,
        }),
      );
      throw error;
    }
  },
);

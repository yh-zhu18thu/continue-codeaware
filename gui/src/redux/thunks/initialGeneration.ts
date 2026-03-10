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
} from "core/llm/codeAwarePrompts";
import { buildCodeAwareCognitiveEdges } from "../../utils/codeAwareRelationGraph";
import { generateCodeChunks } from "../../utils/codeChunkUtils";
import {
  addInitialGenerationError,
  clearAllCodeAwareMappings,
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
  setNodeMasteryScores,
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

type CurrentFileResult = {
  status: "success" | "error";
  content?: {
    path?: string;
    contents?: string;
  };
  error?: string;
};

type ReadFileResult = {
  status: "success" | "error";
  content?: string;
  error?: string;
};

function getDirectoryPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) {
    return "";
  }
  return normalized.slice(0, idx);
}

function joinPath(baseDir: string, filename: string): string {
  if (!baseDir) {
    return filename;
  }
  const normalizedBase = baseDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${normalizedBase}/${filename}`;
}

async function persistCognitiveTrackingArtifacts(
  args: {
    sessionId: string;
    workspaceDirectory?: string;
    fallbackFilePath?: string;
    nodeMasteryScores: RootState["codeAwareSession"]["nodeMasteryScores"];
    cognitiveEdges: ReturnType<typeof buildCodeAwareCognitiveEdges>;
    nodeIndex: {
      schemaVersion: number;
      sessionId: string;
      generatedAt: string;
      nodeCount: number;
      nodes: Array<{
        id: string;
        nodeType: "high-level-step" | "step" | "code-chunk" | "knowledge-point";
        title: string;
        abstract: string;
      }>;
    };
  },
  extra: ThunkApiType["extra"],
): Promise<{
  edgesPath: string;
  nodeMasteryPath: string;
  nodeIndexPath: string;
}> {
  const baseDir =
    (args.workspaceDirectory || "").trim() ||
    (args.fallbackFilePath ? getDirectoryPath(args.fallbackFilePath) : "");
  const knowledgeStateDir = joinPath(baseDir, ".knowledge_state");

  const edgesPayload = {
    schemaVersion: 1,
    sessionId: args.sessionId,
    generatedAt: new Date().toISOString(),
    edgeCount: args.cognitiveEdges.length,
    edges: args.cognitiveEdges,
  };

  const nodeMasteryPayload = {
    schemaVersion: 1,
    sessionId: args.sessionId,
    generatedAt: new Date().toISOString(),
    scoreCount: args.nodeMasteryScores.length,
    nodeMasteryScores: args.nodeMasteryScores,
  };

  const latestEdgesFilename = "codeaware-cognitive-edges.latest.json";
  const latestNodeMasteryFilename = "codeaware-node-mastery.latest.json";
  const latestNodeIndexFilename = "codeaware-node-index.latest.json";

  const edgesPath = joinPath(knowledgeStateDir, latestEdgesFilename);
  const nodeMasteryPath = joinPath(
    knowledgeStateDir,
    latestNodeMasteryFilename,
  );
  const nodeIndexPath = joinPath(knowledgeStateDir, latestNodeIndexFilename);

  await extra.ideMessenger.request("writeFile", {
    path: edgesPath,
    contents: JSON.stringify(edgesPayload, null, 2),
  });

  await extra.ideMessenger.request("writeFile", {
    path: nodeMasteryPath,
    contents: JSON.stringify(nodeMasteryPayload, null, 2),
  });

  await extra.ideMessenger.request("writeFile", {
    path: nodeIndexPath,
    contents: JSON.stringify(args.nodeIndex, null, 2),
  });

  return { edgesPath, nodeMasteryPath, nodeIndexPath };
}

function buildNodeIndexPayload(state: RootState["codeAwareSession"]): {
  schemaVersion: number;
  sessionId: string;
  generatedAt: string;
  nodeCount: number;
  nodes: Array<{
    id: string;
    nodeType: "high-level-step" | "step" | "code-chunk" | "knowledge-point";
    title: string;
    abstract: string;
  }>;
} {
  const nodes: Array<{
    id: string;
    nodeType: "high-level-step" | "step" | "code-chunk" | "knowledge-point";
    title: string;
    abstract: string;
  }> = [];

  state.highLevelSteps.forEach((item) => {
    nodes.push({
      id: item.id,
      nodeType: "high-level-step",
      title: item.content || "",
      abstract: "",
    });
  });

  state.steps.forEach((item) => {
    nodes.push({
      id: item.id,
      nodeType: "step",
      title: item.title || "",
      abstract: item.abstract || "",
    });
  });

  state.codeChunks.forEach((item) => {
    const [startLine, endLine] = item.range;
    const title = `${item.filePath}:${startLine}-${endLine}`;
    const abstract = item.content.trim().slice(0, 240);

    nodes.push({
      id: item.id,
      nodeType: "code-chunk",
      title,
      abstract,
    });
  });

  state.knowledgePoints.forEach((item) => {
    nodes.push({
      id: item.id,
      nodeType: "knowledge-point",
      title: item.title || "",
      abstract: item.content || "",
    });
  });

  const deduped = new Map<string, (typeof nodes)[number]>();
  nodes.forEach((node) => {
    const key = `${node.nodeType}:${node.id}`;
    deduped.set(key, node);
  });

  const dedupedNodes = Array.from(deduped.values());

  return {
    schemaVersion: 1,
    sessionId: state.currentSessionId,
    generatedAt: new Date().toISOString(),
    nodeCount: dedupedNodes.length,
    nodes: dedupedNodes,
  };
}

async function getCurrentFileSnapshot(
  extra: ThunkApiType["extra"],
): Promise<{ path: string; contents: string } | null> {
  try {
    const currentFileResponse = (await extra.ideMessenger.request(
      "getCurrentFile",
      undefined,
    )) as CurrentFileResult;

    if (
      currentFileResponse.status === "success" &&
      currentFileResponse.content?.path
    ) {
      return {
        path: currentFileResponse.content.path,
        contents: currentFileResponse.content.contents || "",
      };
    }
  } catch (error) {
    console.warn("⚠️ 读取当前文件快照失败", error);
  }

  return null;
}

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

function buildInitialNodeMasteryScores(
  state: RootState["codeAwareSession"],
): RootState["codeAwareSession"]["nodeMasteryScores"] {
  const now = Date.now();
  const scores: RootState["codeAwareSession"]["nodeMasteryScores"] = [];

  state.highLevelSteps.forEach((item) => {
    scores.push({
      nodeId: item.id,
      nodeType: "high-level-step",
      score: 0,
      updatedAt: now,
    });
  });

  state.steps.forEach((item) => {
    scores.push({
      nodeId: item.id,
      nodeType: "step",
      score: 0,
      updatedAt: now,
    });
  });

  state.codeChunks.forEach((item) => {
    scores.push({
      nodeId: item.id,
      nodeType: "code-chunk",
      score: 0,
      updatedAt: now,
    });
  });

  state.knowledgePoints.forEach((item) => {
    scores.push({
      nodeId: item.id,
      nodeType: "knowledge-point",
      score: 0,
      updatedAt: now,
    });
  });

  const deduped = new Map<string, (typeof scores)[number]>();
  scores.forEach((item) => {
    const key = `${item.nodeType}:${item.nodeId}`;
    deduped.set(key, item);
  });

  return Array.from(deduped.values());
}

export const exportKnowledgeStateArtifacts = createAsyncThunk<
  { edgesPath: string; nodeMasteryPath: string; nodeIndexPath: string },
  void,
  ThunkApiType
>(
  "codeAware/exportKnowledgeStateArtifacts",
  async (_, { dispatch, getState, extra }) => {
    const currentState = getState().codeAwareSession;

    let nodeMasteryScores = currentState.nodeMasteryScores;
    if (nodeMasteryScores.length === 0) {
      nodeMasteryScores = buildInitialNodeMasteryScores(currentState);
      dispatch(setNodeMasteryScores(nodeMasteryScores));
    }

    const refreshedState: RootState["codeAwareSession"] = {
      ...currentState,
      nodeMasteryScores,
    };

    const unifiedEdges = buildCodeAwareCognitiveEdges(refreshedState);
    const nodeIndex = buildNodeIndexPayload(refreshedState);

    const currentFile = await getCurrentFileSnapshot(extra);
    const persistedFiles = await persistCognitiveTrackingArtifacts(
      {
        sessionId: refreshedState.currentSessionId,
        workspaceDirectory: refreshedState.workspaceDirectory,
        fallbackFilePath:
          refreshedState.codeChunks[0]?.filePath || currentFile?.path,
        nodeMasteryScores,
        cognitiveEdges: unifiedEdges,
        nodeIndex,
      },
      extra,
    );

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "knowledge_state_exported",
      payload: {
        edgesCount: unifiedEdges.length,
        nodeMasteryCount: nodeMasteryScores.length,
        edgesPath: persistedFiles.edgesPath,
        nodeMasteryPath: persistedFiles.nodeMasteryPath,
        nodeIndexPath: persistedFiles.nodeIndexPath,
        timestamp: new Date().toISOString(),
      },
    });

    return persistedFiles;
  },
);

async function getLatestFileContent(
  filePath: string,
  extra: ThunkApiType["extra"],
): Promise<string> {
  try {
    const currentFileResponse = (await extra.ideMessenger.request(
      "getCurrentFile",
      undefined,
    )) as CurrentFileResult;

    if (
      currentFileResponse.status === "success" &&
      currentFileResponse.content?.path === filePath &&
      typeof currentFileResponse.content.contents === "string"
    ) {
      console.log(
        `📖 [Phase 3] 使用编辑器缓冲区内容 (${currentFileResponse.content.contents.length} chars)`,
      );
      return currentFileResponse.content.contents;
    }
  } catch (error) {
    console.warn("⚠️ [Phase 3] 读取当前编辑器内容失败，回退到 readFile", error);
  }

  const fileResponse = (await extra.ideMessenger.request("readFile", {
    filepath: filePath,
  })) as ReadFileResult;

  if (fileResponse.status !== "success") {
    throw new Error(fileResponse.error || `读取文件失败: ${filePath}`);
  }

  return fileResponse.content || "";
}

async function splitCodeIntoSemanticChunks(
  code: string,
  filePath: string,
  steps: StepItem[],
): Promise<
  Array<{
    id: string;
    content: string;
    range: [number, number];
    semanticDescription: string;
  }>
> {
  const atomicChunks = generateCodeChunks(code, filePath, "atomic-line");

  if (atomicChunks.length === 0) {
    return [];
  }

  return atomicChunks.map((chunk) => {
    const semanticDescription =
      chunk.content.trim().slice(0, 50) ||
      `步骤相关代码 (${steps.length} steps)`;

    return {
      id: chunk.id,
      content: chunk.content,
      range: chunk.range,
      semanticDescription,
    };
  });
}

async function mapCodeChunksToSteps(
  fullCode: string,
  codeChunks: Array<{
    id: string;
    content: string;
    range: [number, number];
    semanticDescription: string;
  }>,
  steps: StepItem[],
  modelTitle: string,
  extra: ThunkApiType["extra"],
): Promise<CodeAwareMapping[]> {
  const numberedCode = fullCode
    .split("\n")
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");

  const lineToChunkId = new Map<number, string>();
  codeChunks.forEach((chunk) => {
    const [start, end] = chunk.range;
    for (let line = start; line <= end; line++) {
      lineToChunkId.set(line, chunk.id);
    }
  });

  const mappings: CodeAwareMapping[] = [];

  for (const step of steps) {
    const prompt = `你是代码映射助手。请针对“步骤”在完整代码中圈出直接实现该步骤的代码行。\n\n步骤信息：\n- ID: ${step.id}\n- 标题: ${step.title}\n- 描述: ${step.abstract}\n\n完整代码（含行号）：\n${numberedCode}\n\n要求：\n1. 只选择直接实现该步骤的代码，不要包含仅依赖/上下文/样板代码。\n2. 可返回连续区间 + 零星单行。\n3. 若步骤尚未实现，返回空集合。\n\n返回严格 JSON：\n{\n  "line_ranges": [{ "start_line": 1, "end_line": 3 }],\n  "single_lines": [8, 12],\n  "confidence": 0.0\n}`;

    try {
      const llmContent = await completeJson(prompt, modelTitle, extra);
      const parsed = parseJsonFromLlm<{
        line_ranges?: Array<{ start_line?: number; end_line?: number }>;
        single_lines?: number[];
        confidence?: number;
      }>(llmContent);

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
          const chunkId = lineToChunkId.get(line);
          if (!chunkId) {
            return;
          }

          mappings.push({
            codeChunkId: chunkId,
            semanticElementId: step.id,
            semanticElementType: "step",
            createdAt: Date.now(),
            source: "initial",
            confidence: parsed.confidence ?? 0.8,
          });
        });
    } catch (error) {
      console.warn("⚠️ 步骤到代码行映射失败", { stepId: step.id, error });
    }
  }

  if (mappings.length === 0 && codeChunks.length > 0 && steps.length > 0) {
    steps.forEach((step, idx) => {
      const chunk =
        codeChunks[Math.floor((idx * codeChunks.length) / steps.length)];
      if (!chunk) {
        return;
      }

      mappings.push({
        codeChunkId: chunk.id,
        semanticElementId: step.id,
        semanticElementType: "step",
        createdAt: Date.now(),
        source: "initial",
        confidence: 0.35,
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
    const beforeApplyStateCount =
      state.session.codeBlockApplyStates.states.length;

    if (!filepath) {
      const currentFile = await getCurrentFileSnapshot(extra);
      if (currentFile?.path) {
        filepath = currentFile.path;
      } else {
        filepath = "main.py";
      }
    }

    console.log(`📁 [Phase 2] 请求生成目标文件: ${filepath}`);

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

    const postState = getState();
    const newApplyStates = postState.session.codeBlockApplyStates.states.slice(
      beforeApplyStateCount,
    );

    const appliedFilePath = [...newApplyStates]
      .reverse()
      .find((state) => state.status === "done" && !!state.filepath)?.filepath;

    if (appliedFilePath) {
      filepath = appliedFilePath;
      console.log(`✅ [Phase 2] 检测到实际写入文件: ${filepath}`);
    } else {
      const latestCurrentFile = await getCurrentFileSnapshot(extra);
      if (latestCurrentFile?.path) {
        filepath = latestCurrentFile.path;
        console.log(`ℹ️ [Phase 2] 回退使用当前活动文件: ${filepath}`);
      } else {
        console.warn(`⚠️ [Phase 2] 未检测到真实写入文件，沿用: ${filepath}`);
      }
    }

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
    let effectiveFilePath = filePath;
    console.log(`🗺️ [Phase 3] 开始建立映射，目标文件: ${effectiveFilePath}`);

    const state = getState();
    const steps = state.codeAwareSession.steps;

    if (steps.length === 0) {
      console.warn("⚠️ [Phase 3] 没有步骤，跳过映射");
      return;
    }

    const modelTitle = getPreferredModelTitle(state);
    dispatch(
      updateInitialGenerationStatus({
        currentPhase: "正在读取生成代码并分割语义块...",
        progress: 63,
      }),
    );

    let generatedCode = await getLatestFileContent(effectiveFilePath, extra);
    console.log(`📄 [Phase 3] 读取代码长度: ${generatedCode.length} chars`);

    if (!generatedCode.trim()) {
      const currentFile = await getCurrentFileSnapshot(extra);
      if (currentFile?.contents?.trim()) {
        effectiveFilePath = currentFile.path;
        generatedCode = currentFile.contents;
        console.warn(
          `⚠️ [Phase 3] 原目标文件为空，回退使用当前文件: ${effectiveFilePath}`,
        );
      }
    }

    if (!generatedCode.trim()) {
      console.warn("⚠️ [Phase 3] 代码为空，无法建立映射");
      dispatch(setCodeChunks([]));
      dispatch(clearAllCodeAwareMappings());
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "initial_generation_phase3_skipped_empty_code",
        payload: {
          filePath: effectiveFilePath,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const chunks = await splitCodeIntoSemanticChunks(
      generatedCode,
      effectiveFilePath,
      steps,
    );

    const codeChunks: CodeChunk[] = chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      range: chunk.range,
      isHighlighted: false,
      disabled: false,
      filePath: effectiveFilePath,
    }));

    dispatch(setCodeChunks(codeChunks));
    console.log(`📦 [Phase 3] 代码块数量: ${codeChunks.length}`);

    dispatch(
      updateInitialGenerationStatus({
        currentPhase: "正在将代码块映射到步骤...",
        progress: 70,
      }),
    );

    const mappings = await mapCodeChunksToSteps(
      generatedCode,
      chunks,
      steps,
      modelTitle,
      extra,
    );
    dispatch(clearAllCodeAwareMappings());
    dispatch(updateCodeAwareMappings(mappings));
    console.log(`🔗 [Phase 3] 映射数量: ${mappings.length}`);

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase3_completed",
      payload: {
        filePath: effectiveFilePath,
        codeChunksCount: codeChunks.length,
        mappingsCount: mappings.length,
        timestamp: new Date().toISOString(),
      },
    });

    console.log("✅ [Phase 3] 映射建立完成");
  },
);

export const analyzeCodeChunkRelations = createAsyncThunk<
  void,
  void,
  ThunkApiType
>(
  "codeAware/analyzeCodeChunkRelations",
  async (_, { dispatch, getState, extra }) => {
    console.log("🔍 [Phase 4] 开始分析代码块关系");

    const state = getState();
    const codeChunks = state.codeAwareSession.codeChunks;

    if (codeChunks.length < 2) {
      console.log(
        `ℹ️ [Phase 4] 代码块数量不足 (${codeChunks.length})，跳过关系分析`,
      );
      dispatch(setCodeChunkRelations([]));
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "initial_generation_phase4_skipped",
        payload: {
          reason: "insufficient_code_chunks",
          codeChunksCount: codeChunks.length,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    dispatch(
      updateInitialGenerationStatus({
        currentPhase: "正在计算代码块向量与相似度...",
        progress: 80,
      }),
    );

    const vectors = await embedTexts(
      codeChunks.map((chunk) => chunk.content),
      extra,
    );
    console.log(`🧠 [Phase 4] 获取 embeddings: ${vectors.length}`);

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
    console.log(`🔗 [Phase 4] 关系数量: ${relations.length}`);

    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "initial_generation_phase4_completed",
      payload: {
        codeChunksCount: codeChunks.length,
        relationsCount: relations.length,
        timestamp: new Date().toISOString(),
      },
    });

    console.log("✅ [Phase 4] 关系分析完成");
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

    const knowledgeExamples = uniqueKnowledgePoints
      .slice(0, 3)
      .map((point) => ({
        id: point.id,
        title: point.title,
        contentExample:
          point.content.length > 180
            ? `${point.content.slice(0, 180)}...`
            : point.content,
        category: point.category,
        difficulty: point.difficulty,
        relatedStepIds: point.relatedStepIds,
      }));

    console.log("📚 [Phase 5] Knowledge points extracted", {
      count: uniqueKnowledgePoints.length,
      examples: knowledgeExamples,
    });

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
      console.log("🚀 [Initial Generation] 启动完整初始化流程");

      dispatch(resetInitialGenerationStatus());

      dispatch(
        updateInitialGenerationStatus({
          status: "generating-structure",
          currentPhase: "正在分析需求并生成任务分解结构...",
          progress: 10,
        }),
      );
      console.log("🧩 [Initial Generation] Phase 1: 任务分解");
      await dispatch(generateTaskDecomposition({ userRequirement })).unwrap();
      console.log("✅ [Initial Generation] Phase 1 完成");

      dispatch(
        updateInitialGenerationStatus({
          status: "generating-code",
          currentPhase: "正在生成完整代码实现...",
          progress: 30,
        }),
      );
      console.log("💻 [Initial Generation] Phase 2: 代码生成");
      const filePath = await dispatch(
        generateCompleteCode({ targetFilePath }),
      ).unwrap();
      console.log("✅ [Initial Generation] Phase 2 完成");

      dispatch(
        updateInitialGenerationStatus({
          status: "mapping-code",
          currentPhase: "正在建立代码与步骤的对应关系...",
          progress: 60,
        }),
      );
      console.log("🗺️ [Initial Generation] Phase 3: 代码-步骤映射");
      await dispatch(createCodeToStepMappings({ filePath })).unwrap();
      console.log("✅ [Initial Generation] Phase 3 完成");

      dispatch(
        updateInitialGenerationStatus({
          status: "analyzing-chunks",
          currentPhase: "正在分析代码块之间的语义关联...",
          progress: 75,
        }),
      );
      console.log("🔍 [Initial Generation] Phase 4: 代码块关系分析");
      await dispatch(analyzeCodeChunkRelations()).unwrap();
      console.log("✅ [Initial Generation] Phase 4 完成");

      dispatch(
        updateInitialGenerationStatus({
          status: "extracting-knowledge",
          currentPhase: "正在提取背景知识点...",
          progress: 90,
        }),
      );
      console.log("📚 [Initial Generation] Phase 5: 知识提取与关联");
      await dispatch(extractAndLinkKnowledge()).unwrap();
      console.log("✅ [Initial Generation] Phase 5 完成");

      const masteryBaseline = buildInitialNodeMasteryScores(
        getState().codeAwareSession,
      );
      dispatch(setNodeMasteryScores(masteryBaseline));
      console.log(
        `🧠 [Initial Generation] 初始化 node mastery scores: ${masteryBaseline.length} 个节点置为 0`,
      );

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

      console.log("🎉 [Initial Generation] 全部阶段完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("❌ [Initial Generation] 流程失败:", message);
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

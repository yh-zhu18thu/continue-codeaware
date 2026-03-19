import { createAsyncThunk } from "@reduxjs/toolkit";
import type { CodeAwarePresetSnapshot } from "core";
import { buildCodeAwareCognitiveEdges } from "../../utils/codeAwareRelationGraph";
import {
  restoreFromSnapshot,
  setCognitiveEdges,
  updateInitialGenerationStatus,
} from "../slices/codeAwareSlice";
import type { RootState, ThunkApiType } from "../store";

const PRESET_SCHEMA_VERSION = 1;
const PRESET_DIR_NAME = ".codeaware-presets";

type ReadFileResult = {
  status: "success" | "error";
  content?: string;
  error?: string;
};

function joinPath(baseDir: string, ...segments: string[]): string {
  const parts = [baseDir.replace(/\\/g, "/").replace(/\/+$/, "")];
  for (const seg of segments) {
    parts.push(seg.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""));
  }
  return parts.join("/");
}

/**
 * 多级回退获取工作区目录：
 * 1. Redux state.workspaceDirectory
 * 2. window.workspacePaths[0]
 * 3. ideMessenger.request("getWorkspaceDirs")
 */
async function resolveWorkspaceDir(
  session: RootState["codeAwareSession"],
  extra: ThunkApiType["extra"],
): Promise<string> {
  // 1. Redux state
  if (session.workspaceDirectory) {
    return session.workspaceDirectory;
  }

  // 2. window.workspacePaths
  const windowPaths = (window as any).workspacePaths as string[] | undefined;
  if (windowPaths && windowPaths.length > 0 && windowPaths[0]) {
    return windowPaths[0];
  }

  // 3. IDE messenger
  try {
    const dirs = (await extra.ideMessenger.request(
      "getWorkspaceDirs",
      undefined,
    )) as string[] | { status: string; content?: string[] };
    const dirList = Array.isArray(dirs)
      ? dirs
      : Array.isArray((dirs as any)?.content)
        ? (dirs as any).content
        : [];
    if (dirList.length > 0 && dirList[0]) {
      return dirList[0];
    }
  } catch (err) {
    console.warn("[CA:Preset] getWorkspaceDirs 失败", err);
  }

  throw new Error("无法确定工作区目录，请确保已打开工作区文件夹");
}

/**
 * 将绝对路径转为相对于 workspaceDirectory 的路径。
 * 如果无法转换，则返回文件名部分。
 */
function toRelativePath(
  absolutePath: string,
  workspaceDirectory: string,
): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  const normalizedWs = workspaceDirectory
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (normalizedWs && normalized.startsWith(normalizedWs + "/")) {
    return normalized.slice(normalizedWs.length + 1);
  }
  // fallback: 返回文件名
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/**
 * 导出预设快照 — 将当前 CodeAware 完整状态序列化为 JSON 并保存到 .codeaware-presets/ 目录。
 * 研究者在导出时通过 window.prompt 输入预设名称。
 */
export const exportPresetSnapshot = createAsyncThunk<
  { snapshotPath: string; presetName: string },
  void,
  ThunkApiType
>(
  "codeAware/exportPresetSnapshot",
  async (_, { getState, dispatch, extra }) => {
    const state = getState();
    const session = state.codeAwareSession;

    // 校验：必须已完成初始生成
    if (session.initialGeneration.status !== "completed") {
      throw new Error("请先完成初始生成流程后再导出预设");
    }

    // 通过 VS Code InputBox 让研究者输入预设名称
    const inputResult = (await extra.ideMessenger.request("showInputBox", {
      prompt: "请输入预设名称（英文/数字/短横线，例如 raytracer）",
      placeholder: "raytracer",
    })) as { status: string; content?: string } | string | undefined;

    // 兼容不同返回格式
    const presetName =
      typeof inputResult === "string"
        ? inputResult
        : typeof inputResult === "object" && inputResult !== null
          ? ((inputResult as any).content ?? (inputResult as any).result)
          : undefined;

    if (!presetName || !String(presetName).trim()) {
      throw new Error("导出取消：未输入预设名称");
    }

    const sanitizedName = String(presetName)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!sanitizedName) {
      throw new Error("导出取消：预设名称无效");
    }

    // 获取代码文件内容
    const codeFilePath = session.codeChunks[0]?.filePath;
    if (!codeFilePath) {
      throw new Error("没有代码文件可导出");
    }

    const fileResponse = (await extra.ideMessenger.request("readFile", {
      filepath: codeFilePath,
    })) as ReadFileResult;

    if (fileResponse.status !== "success" || !fileResponse.content) {
      throw new Error(
        `读取代码文件失败: ${fileResponse.error || codeFilePath}`,
      );
    }

    // 计算认知图并存入 Redux
    const cognitiveEdges = buildCodeAwareCognitiveEdges(session);
    dispatch(setCognitiveEdges(cognitiveEdges));

    // 构造快照
    const relativePath = toRelativePath(
      codeFilePath,
      session.workspaceDirectory,
    );

    const snapshot: CodeAwarePresetSnapshot = {
      schemaVersion: PRESET_SCHEMA_VERSION,
      presetName: sanitizedName,
      createdAt: new Date().toISOString(),
      originalRequirement:
        session.userRequirement?.requirementDescription || "",
      codeFile: {
        relativePath,
        content: fileResponse.content,
      },
      title: session.title,
      learningGoal: session.learningGoal,
      highLevelSteps: session.highLevelSteps,
      highLevelStepNarrative: session.highLevelStepNarrative,
      stepToHighLevelMappings: session.stepToHighLevelMappings,
      steps: session.steps,
      codeChunks: session.codeChunks,
      codeChunkRelations: session.codeChunkRelations,
      codeAwareMappings: session.codeAwareMappings,
      knowledgePoints: session.knowledgePoints,
      knowledgeRelations: session.knowledgeRelations,
      knowledgeToStepRelations: session.knowledgeToStepRelations,
      knowledgeToCodeChunkRelations: session.knowledgeToCodeChunkRelations,
      nodeMasteryScores: session.nodeMasteryScores,
      cognitiveEdges,
    };

    // 写入文件
    const wsDir = await resolveWorkspaceDir(session, extra);

    const snapshotPath = joinPath(
      wsDir,
      PRESET_DIR_NAME,
      sanitizedName,
      "snapshot.json",
    );

    await extra.ideMessenger.request("writeFile", {
      path: snapshotPath,
      contents: JSON.stringify(snapshot, null, 2),
    });

    // 记录日志
    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "preset_exported",
      payload: {
        presetName: sanitizedName,
        snapshotPath,
        stepsCount: snapshot.steps.length,
        codeChunksCount: snapshot.codeChunks.length,
        knowledgePointsCount: snapshot.knowledgePoints.length,
        cognitiveEdgesCount: cognitiveEdges.length,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[CA:Preset] 预设 "${sanitizedName}" 已导出到 ${snapshotPath}`);

    return { snapshotPath, presetName: sanitizedName };
  },
);

/**
 * 检测需求文本是否为预设密语。
 * 匹配 `@preset:name` 格式，返回预设名称或 null。
 */
export function detectPresetTrigger(requirement: string): string | null {
  const match = requirement.trim().match(/^@preset:(.+)$/i);
  if (match) {
    return match[1]
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
  return null;
}

/**
 * 加载预设快照 — 从 .codeaware-presets/ 读取快照并还原完整 CodeAware 状态。
 * 同时将预设代码写入工作区文件并在编辑器中打开。
 */
export const loadPresetSnapshot = createAsyncThunk<
  void,
  { presetName: string },
  ThunkApiType
>(
  "codeAware/loadPresetSnapshot",
  async ({ presetName }, { dispatch, getState, extra }) => {
    console.log(`[CA:Preset] 开始加载预设: ${presetName}`);

    dispatch(
      updateInitialGenerationStatus({
        status: "generating-structure",
        currentPhase: "正在加载预设...",
        progress: 10,
      }),
    );

    // 获取 workspace 目录
    const state = getState();
    const wsDir = await resolveWorkspaceDir(state.codeAwareSession, extra);

    // 读取快照文件
    const snapshotPath = joinPath(
      wsDir,
      PRESET_DIR_NAME,
      presetName,
      "snapshot.json",
    );

    dispatch(
      updateInitialGenerationStatus({
        currentPhase: "正在读取预设文件...",
        progress: 20,
      }),
    );

    const fileResponse = (await extra.ideMessenger.request("readFile", {
      filepath: snapshotPath,
    })) as ReadFileResult;

    if (fileResponse.status !== "success" || !fileResponse.content) {
      throw new Error(
        `预设 "${presetName}" 不存在或读取失败: ${fileResponse.error || snapshotPath}`,
      );
    }

    let snapshot: CodeAwarePresetSnapshot;
    try {
      snapshot = JSON.parse(fileResponse.content) as CodeAwarePresetSnapshot;
    } catch (e) {
      throw new Error(
        `预设文件解析失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 校验版本
    if (
      snapshot.schemaVersion > PRESET_SCHEMA_VERSION ||
      !snapshot.codeFile?.content
    ) {
      throw new Error(
        `预设版本不兼容 (schema ${snapshot.schemaVersion}) 或代码文件缺失`,
      );
    }

    // 写入代码文件
    dispatch(
      updateInitialGenerationStatus({
        currentPhase: "正在写入代码文件...",
        progress: 40,
      }),
    );

    const codeFilePath = joinPath(wsDir, snapshot.codeFile.relativePath);

    await extra.ideMessenger.request("writeFile", {
      path: codeFilePath,
      contents: snapshot.codeFile.content,
    });

    // 在编辑器中打开代码文件
    dispatch(
      updateInitialGenerationStatus({
        currentPhase: "正在打开代码文件...",
        progress: 50,
      }),
    );

    await extra.ideMessenger.request("openFile", {
      path: codeFilePath,
    });

    // 恢复 Redux 状态
    dispatch(
      updateInitialGenerationStatus({
        currentPhase: "正在恢复知识框架...",
        progress: 70,
      }),
    );

    dispatch(
      restoreFromSnapshot({
        snapshot,
        resolvedCodeFilePath: codeFilePath,
      }),
    );

    // 记录日志
    await extra.ideMessenger.request("addCodeAwareLogEntry", {
      eventType: "preset_loaded",
      payload: {
        presetName,
        snapshotPath,
        stepsCount: snapshot.steps.length,
        codeChunksCount: snapshot.codeChunks.length,
        knowledgePointsCount: snapshot.knowledgePoints.length,
        cognitiveEdgesCount: snapshot.cognitiveEdges.length,
        codeFilePath,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(
      `[CA:Preset] 预设 "${presetName}" 加载完成 — ${snapshot.steps.length} 步骤, ${snapshot.codeChunks.length} 代码块, ${snapshot.knowledgePoints.length} 知识点`,
    );
  },
);

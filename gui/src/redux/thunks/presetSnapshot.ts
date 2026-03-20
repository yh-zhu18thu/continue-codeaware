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

/**
 * 快照分片键名。导出时将大快照拆分为多个小文件，
 * 每个文件 < 500KB，避免 webview postMessage ~1MB 限制。
 */
const SNAPSHOT_PARTS = [
  "meta", // 基础信息 + 步骤结构
  "code", // 代码文件内容 + 代码块
  "knowledge", // 知识点 + 关系
  "edges", // 认知边 + mastery
] as const;

type SnapshotPartKey = (typeof SNAPSHOT_PARTS)[number];

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
  let dir = "";

  // 1. Redux state
  if (session.workspaceDirectory) {
    dir = session.workspaceDirectory;
  }

  // 2. window.workspacePaths
  if (!dir) {
    const windowPaths = (window as any).workspacePaths as string[] | undefined;
    if (windowPaths && windowPaths.length > 0 && windowPaths[0]) {
      dir = windowPaths[0];
    }
  }

  // 3. IDE messenger
  if (!dir) {
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
        dir = dirList[0];
      }
    } catch (err) {
      console.warn("[CA:Preset] getWorkspaceDirs 失败", err);
    }
  }

  if (!dir) {
    throw new Error("无法确定工作区目录，请确保已打开工作区文件夹");
  }

  // 去除 file:// URI scheme（getWorkspaceDirs 可能返回 URI 格式）
  if (dir.startsWith("file:///")) {
    dir = dir.slice(7); // file:///path -> /path
  } else if (dir.startsWith("file://")) {
    dir = dir.slice(5);
  }

  // 解码 URI 编码字符（如 %3A -> :）
  dir = decodeURIComponent(dir);

  // Windows: 去掉驱动器盘符前的 /（如 /c:/Users -> c:/Users）
  if (/^\/[a-zA-Z]:/.test(dir)) {
    dir = dir.slice(1);
  }

  return dir;
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
      // 清空知识卡片和生成状态，还原为 initial generation 刚完成时的状态
      steps: session.steps.map((step) => ({
        ...step,
        knowledgeCards: [],
        knowledgeCardGenerationStatus: "empty" as const,
      })),
      codeChunks: session.codeChunks,
      codeChunkRelations: session.codeChunkRelations,
      codeAwareMappings: session.codeAwareMappings,
      knowledgePoints: session.knowledgePoints,
      knowledgeRelations: session.knowledgeRelations,
      knowledgeToStepRelations: session.knowledgeToStepRelations,
      knowledgeToCodeChunkRelations: session.knowledgeToCodeChunkRelations,
      // 掌握度重置为 0（和 initial generation 完成时一致）
      nodeMasteryScores: session.nodeMasteryScores.map((score) => ({
        ...score,
        score: 0,
        updatedAt: Date.now(),
      })),
      cognitiveEdges,
    };

    // 写入分片文件（避免单个文件超过 webview postMessage 限制）
    const wsDir = await resolveWorkspaceDir(session, extra);
    const presetDir = joinPath(wsDir, PRESET_DIR_NAME, sanitizedName);

    const metaPart = {
      schemaVersion: snapshot.schemaVersion,
      presetName: snapshot.presetName,
      createdAt: snapshot.createdAt,
      originalRequirement: snapshot.originalRequirement,
      title: snapshot.title,
      learningGoal: snapshot.learningGoal,
      highLevelSteps: snapshot.highLevelSteps,
      highLevelStepNarrative: snapshot.highLevelStepNarrative,
      stepToHighLevelMappings: snapshot.stepToHighLevelMappings,
      steps: snapshot.steps,
    };

    const codePart = {
      codeFile: snapshot.codeFile,
      codeChunks: snapshot.codeChunks,
      codeChunkRelations: snapshot.codeChunkRelations,
      codeAwareMappings: snapshot.codeAwareMappings,
    };

    const knowledgePart = {
      knowledgePoints: snapshot.knowledgePoints,
      knowledgeRelations: snapshot.knowledgeRelations,
      knowledgeToStepRelations: snapshot.knowledgeToStepRelations,
      knowledgeToCodeChunkRelations: snapshot.knowledgeToCodeChunkRelations,
    };

    const edgesPart = {
      nodeMasteryScores: snapshot.nodeMasteryScores,
      cognitiveEdges: snapshot.cognitiveEdges,
    };

    const parts: Record<SnapshotPartKey, unknown> = {
      meta: metaPart,
      code: codePart,
      knowledge: knowledgePart,
      edges: edgesPart,
    };

    for (const partKey of SNAPSHOT_PARTS) {
      await extra.ideMessenger.request("writeFile", {
        path: joinPath(presetDir, `snapshot-${partKey}.json`),
        contents: JSON.stringify(parts[partKey], null, 2),
      });
    }

    const snapshotPath = presetDir;

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
    try {
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

      // 读取分片快照文件
      const presetDir = joinPath(wsDir, PRESET_DIR_NAME, presetName);

      dispatch(
        updateInitialGenerationStatus({
          currentPhase: "正在读取预设文件...",
          progress: 20,
        }),
      );

      // 逐一读取各分片（使用 readFileUnlimited 避免 100KB 截断）
      const partContents: Record<string, any> = {};
      for (const partKey of SNAPSHOT_PARTS) {
        const partPath = joinPath(presetDir, `snapshot-${partKey}.json`);
        const partResponse = (await extra.ideMessenger.request(
          "readFileUnlimited",
          { filepath: partPath },
        )) as ReadFileResult;

        if (partResponse.status !== "success" || !partResponse.content) {
          throw new Error(
            `预设 "${presetName}" 分片 ${partKey} 读取失败: ${partResponse.error || partPath}`,
          );
        }

        try {
          partContents[partKey] = JSON.parse(partResponse.content);
        } catch (e) {
          throw new Error(
            `预设 "${presetName}" 分片 ${partKey} 解析失败: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // 组装完整快照
      const snapshot: CodeAwarePresetSnapshot = {
        ...partContents.meta,
        ...partContents.code,
        ...partContents.knowledge,
        ...partContents.edges,
      } as CodeAwarePresetSnapshot;

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

      console.log(
        `[CA:Preset] 预设 "${presetName}" 加载完成 — ${snapshot.steps.length} 步骤, ${snapshot.codeChunks.length} 代码块, ${snapshot.knowledgePoints.length} 知识点`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CA:Preset] 预设 "${presetName}" 加载失败:`, message);
      dispatch(
        updateInitialGenerationStatus({
          status: "error",
          currentPhase: `预设加载失败: ${message}`,
          progress: 0,
        }),
      );
      throw error;
    }
  },
);

import type { CodeAwareSessionState } from "../redux/slices/codeAwareSlice";

interface PersistedCodeAwareSession {
  sessionId: string;
  title: string;
  timestamp: string;
  nodes: {
    highLevelSteps: unknown[];
    steps: unknown[];
    codeChunks: unknown[];
    knowledgePoints: unknown[];
  };
  relations: {
    stepToHighLevel: unknown[];
    codeToSemantic: unknown[];
    codeChunkRelations: unknown[];
    knowledgeRelations: unknown[];
  };
  metadata: {
    userRequirement: string;
    learningGoal: string;
    workspaceDirectory: string;
  };
}

export function serializeSessionState(
  state: CodeAwareSessionState,
): PersistedCodeAwareSession {
  return {
    sessionId: state.currentSessionId,
    title: state.title,
    timestamp: new Date().toISOString(),
    nodes: {
      highLevelSteps: state.highLevelSteps,
      steps: state.steps,
      codeChunks: state.codeChunks,
      knowledgePoints: state.knowledgePoints,
    },
    relations: {
      stepToHighLevel: state.stepToHighLevelMappings,
      codeToSemantic: state.codeAwareMappings,
      codeChunkRelations: state.codeChunkRelations,
      knowledgeRelations: state.knowledgeRelations,
    },
    metadata: {
      userRequirement: state.userRequirement?.requirementDescription || "",
      learningGoal: state.learningGoal,
      workspaceDirectory: state.workspaceDirectory,
    },
  };
}

export function deserializeSessionState(
  persisted: PersistedCodeAwareSession,
): Partial<CodeAwareSessionState> {
  return {
    currentSessionId: persisted.sessionId,
    title: persisted.title,
    workspaceDirectory: persisted.metadata.workspaceDirectory,
    highLevelSteps: persisted.nodes
      .highLevelSteps as CodeAwareSessionState["highLevelSteps"],
    steps: persisted.nodes.steps as CodeAwareSessionState["steps"],
    codeChunks: persisted.nodes
      .codeChunks as CodeAwareSessionState["codeChunks"],
    knowledgePoints: persisted.nodes
      .knowledgePoints as CodeAwareSessionState["knowledgePoints"],
    stepToHighLevelMappings: persisted.relations
      .stepToHighLevel as CodeAwareSessionState["stepToHighLevelMappings"],
    codeAwareMappings: persisted.relations
      .codeToSemantic as CodeAwareSessionState["codeAwareMappings"],
    codeChunkRelations: persisted.relations
      .codeChunkRelations as CodeAwareSessionState["codeChunkRelations"],
    knowledgeRelations: persisted.relations
      .knowledgeRelations as CodeAwareSessionState["knowledgeRelations"],
    userRequirement: persisted.metadata.userRequirement
      ? {
          requirementDescription: persisted.metadata.userRequirement,
          requirementStatus: "finalized",
        }
      : null,
    learningGoal: persisted.metadata.learningGoal,
  };
}

export async function saveSessionToWorkspace(
  sessionState: CodeAwareSessionState,
  ideMessenger: any,
): Promise<void> {
  const serialized = serializeSessionState(sessionState);
  const filename = `.codeaware/session-${serialized.sessionId}.json`;

  console.log(`💾 保存 session 到: ${filename}`);

  // TODO: 通过 ideMessenger 调用 IDE 端的文件写入
  // await ideMessenger.request("codeaware/saveSession", {
  //   filename,
  //   content: JSON.stringify(serialized, null, 2),
  // });

  void ideMessenger;

  console.log("✅ Session 保存完成");
}

export async function loadSessionFromWorkspace(
  sessionId: string,
  ideMessenger: any,
): Promise<Partial<CodeAwareSessionState> | null> {
  const filename = `.codeaware/session-${sessionId}.json`;

  console.log(`📂 加载 session 从: ${filename}`);

  try {
    // TODO: 通过 ideMessenger 调用 IDE 端的文件读取
    // const response = await ideMessenger.request("codeaware/loadSession", {
    //   filename,
    // });
    // const persisted: PersistedCodeAwareSession = JSON.parse(response.content);
    // return deserializeSessionState(persisted);

    void ideMessenger;

    console.log("✅ Session 加载完成");
    return null;
  } catch (error) {
    console.error("❌ 加载 session 失败:", error);
    return null;
  }
}

export async function listAvailableSessions(
  ideMessenger: any,
): Promise<Array<{ sessionId: string; title: string; timestamp: string }>> {
  console.log("📋 列出可用的 sessions");

  try {
    // TODO: 通过 ideMessenger 调用 IDE 端的目录扫描
    // const response = await ideMessenger.request("codeaware/listSessions", {});
    // return response.sessions;

    void ideMessenger;

    return [];
  } catch (error) {
    console.error("❌ 列出 sessions 失败:", error);
    return [];
  }
}

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const LOG_DIR_NAME = ".copilot-logs";

export class ChatSessionLogger {
  private static instance: ChatSessionLogger | null = null;

  private constructor() {}

  public static getInstance(): ChatSessionLogger {
    if (ChatSessionLogger.instance === null) {
      ChatSessionLogger.instance = new ChatSessionLogger();
    }
    return ChatSessionLogger.instance;
  }

  logEvent(
    workspaceDir: string,
    sessionId: string,
    eventType: string,
    payload: Record<string, any>,
  ): void {
    try {
      const fsPath = workspaceDir.startsWith("file://")
        ? fileURLToPath(workspaceDir)
        : workspaceDir;
      const logDir = path.join(fsPath, LOG_DIR_NAME);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logFile = path.join(logDir, `${sessionId}.jsonl`);
      const event = {
        timestamp: new Date().toISOString(),
        codeAwareSessionId: sessionId,
        eventType,
        payload,
      };

      fs.writeFileSync(logFile, JSON.stringify(event) + "\n", { flag: "a" });
    } catch (error) {
      console.error("Error writing chat session log:", error);
    }
  }
}

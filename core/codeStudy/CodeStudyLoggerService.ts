import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CodeStudyLogEntry, CodeStudyLoggerConfig } from "./types";

/**
 * CodeStudy Logger Service
 * Manages logging of user operations in JSONL format
 * Each CodeStudy session gets its own log file
 */
export class CodeStudyLoggerService {
  private static instance: CodeStudyLoggerService | null = null;
  private logDirectory: string;
  private currentSession: CodeStudyLoggerConfig | null = null;
  private currentLogFilePath: string | null = null;
  private workspaceRootPath: string | null = null;

  private constructor() {
    // Initialize log directory path - use a safer approach to determine the directory
    const workspaceDir = this.getWorkspaceDirectory();
    this.logDirectory = path.join(workspaceDir, ".codestudy-logs");
    this.ensureLogDirectoryExists();
  }

  /**
   * Set workspace root path from VS Code extension context
   * This should be called early in the extension activation
   */
  public setWorkspaceRoot(workspaceRoot: string | null): void {
    this.workspaceRootPath = workspaceRoot;
    if (workspaceRoot) {
      this.logDirectory = path.join(workspaceRoot, ".codestudy-logs");
      this.ensureLogDirectoryExists();
      console.log("[CodeStudyLogger] Workspace root set to:", workspaceRoot);
      console.log("[CodeStudyLogger] Log directory:", this.logDirectory);
    }
  }

  /**
   * Get workspace directory with fallback strategies
   */
  private getWorkspaceDirectory(): string {
    // First priority: use explicitly set workspace root
    if (this.workspaceRootPath && fs.existsSync(this.workspaceRootPath)) {
      return this.workspaceRootPath;
    }

    // Second try: use process.cwd() but validate it's not root
    try {
      const cwd = process.cwd();
      if (cwd !== "/" && cwd !== "C:\\" && cwd.length > 1) {
        // Additional check: make sure it's not a system directory
        if (!cwd.startsWith("/System") && !cwd.startsWith("/usr") && !cwd.startsWith("/var")) {
          return cwd;
        }
      }
    } catch (error) {
      console.warn("[CodeStudyLogger] Failed to get current working directory:", error);
    }

    // Fallback 1: Try to find a reasonable project directory
    const possibleProjectDirs = [
      path.join(os.homedir(), "Documents"),
      path.join(os.homedir(), "Projects"),
      path.join(os.homedir(), "workspace"),
      os.homedir()
    ];

    for (const dir of possibleProjectDirs) {
      if (fs.existsSync(dir)) {
        console.warn("[CodeStudyLogger] Using fallback directory:", dir);
        return dir;
      }
    }

    // Final fallback: use user's home directory
    const homeDir = os.homedir();
    console.warn("[CodeStudyLogger] Using home directory as final fallback:", homeDir);
    return homeDir;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): CodeStudyLoggerService {
    if (!CodeStudyLoggerService.instance) {
      CodeStudyLoggerService.instance = new CodeStudyLoggerService();
    }
    return CodeStudyLoggerService.instance;
  }

  /**
   * Set custom workspace directory for logging
   * Should be called before starting any log sessions
   */
  public setWorkspaceDirectory(workspaceDir: string): void {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      this.logDirectory = path.join(workspaceDir, ".codestudy-logs");
      this.ensureLogDirectoryExists();
    } else {
      console.warn("[CodeStudyLogger] Invalid workspace directory:", workspaceDir);
    }
  }

  /**
   * Start a new logging session
   */
  public startLogSession(config: CodeStudyLoggerConfig): void {
    this.currentSession = config;
    
    // Create filename: username_sessionName_sessionId.jsonl
    const filename = `${config.username}_${config.sessionName}_${config.codeStudySessionId}.jsonl`;
    // Sanitize filename to remove illegal characters
    const sanitizedFilename = filename.replace(/[<>:"/\\|?*]/g, "_");
    
    this.currentLogFilePath = path.join(this.logDirectory, sanitizedFilename);
    
    // Create the log file if it doesn't exist
    if (!fs.existsSync(this.currentLogFilePath)) {
      fs.writeFileSync(this.currentLogFilePath, "", "utf8");
    }

    // Log session start event
    this.addLogEntry("session_start", {
      username: config.username,
      sessionName: config.sessionName,
      codeStudySessionId: config.codeStudySessionId
    });
  }

  /**
   * Add a new log entry
   */
  public addLogEntry(eventType: string, payload: any): void {
    if (!this.currentSession || !this.currentLogFilePath) {
      console.warn("[CodeStudyLogger] No active session. Cannot log event:", eventType);
      return;
    }

    const logEntry: CodeStudyLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.currentSession.codeStudySessionId,
      eventType,
      payload
    };

    try {
      // Append the log entry as a new line in JSONL format
      const logLine = JSON.stringify(logEntry) + "\n";
      fs.appendFileSync(this.currentLogFilePath, logLine, "utf8");
    } catch (error) {
      console.error("[CodeStudyLogger] Failed to write log entry:", error);
    }
  }

  /**
   * End the current logging session
   */
  public endLogSession(): void {
    if (this.currentSession) {
      this.addLogEntry("session_end", {
        sessionDuration: Date.now() - new Date(this.currentSession.codeStudySessionId).getTime()
      });
    }
    
    this.currentSession = null;
    this.currentLogFilePath = null;
  }

  /**
   * Get current session info
   */
  public getCurrentSession(): CodeStudyLoggerConfig | null {
    return this.currentSession;
  }

  /**
   * Get log file path for current session
   */
  public getCurrentLogFilePath(): string | null {
    return this.currentLogFilePath;
  }

  /**
   * Get the current log directory path
   */
  public getLogDirectory(): string {
    return this.logDirectory;
  }

  /**
   * Ensure the log directory exists
   */
  private ensureLogDirectoryExists(): void {
    if (!fs.existsSync(this.logDirectory)) {
      try {
        fs.mkdirSync(this.logDirectory, { recursive: true });
      } catch (error) {
        console.error("[CodeStudyLogger] Failed to create log directory:", error);
      }
    }
  }

  /**
   * Read log entries from a specific session
   */
  public readLogEntries(sessionId: string): CodeStudyLogEntry[] {
    try {
      const files = fs.readdirSync(this.logDirectory);
      const sessionFile = files.find(file => file.includes(sessionId));
      
      if (!sessionFile) {
        return [];
      }

      const filePath = path.join(this.logDirectory, sessionFile);
      const content = fs.readFileSync(filePath, "utf8");
      
      return content
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      console.error("[CodeStudyLogger] Failed to read log entries:", error);
      return [];
    }
  }

  /**
   * List all log files
   */
  public listLogFiles(): string[] {
    try {
      return fs.readdirSync(this.logDirectory)
        .filter(file => file.endsWith(".jsonl"));
    } catch (error) {
      console.error("[CodeStudyLogger] Failed to list log files:", error);
      return [];
    }
  }
}

// Export singleton instance
export const codeStudyLogger = CodeStudyLoggerService.getInstance();

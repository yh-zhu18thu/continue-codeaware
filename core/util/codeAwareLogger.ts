import * as fs from "fs";
import * as path from "path";

import { CodeAwareLogEntry, CodeAwareLoggerConfig } from "../index";

/**
 * CodeAware Logger Service
 * Manages logging of user operations in JSONL format
 * Each CodeAware session gets its own log file
 */
export class CodeAwareLoggerService {
  private static instance: CodeAwareLoggerService | null = null;
  private logDirectory: string;
  private currentSession: CodeAwareLoggerConfig | null = null;
  private currentLogFilePath: string | null = null;

  private constructor() {
    // Initialize log directory path
    this.logDirectory = path.join(process.cwd(), ".codeaware-logs");
    this.ensureLogDirectoryExists();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): CodeAwareLoggerService {
    if (!CodeAwareLoggerService.instance) {
      CodeAwareLoggerService.instance = new CodeAwareLoggerService();
    }
    return CodeAwareLoggerService.instance;
  }

  /**
   * Start a new logging session
   */
  public startLogSession(config: CodeAwareLoggerConfig): void {
    this.currentSession = config;
    
    // Create filename: username_sessionName_sessionId.jsonl
    const filename = `${config.username}_${config.sessionName}_${config.codeAwareSessionId}.jsonl`;
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
      codeAwareSessionId: config.codeAwareSessionId
    });
  }

  /**
   * Add a new log entry
   */
  public addLogEntry(eventType: string, payload: any): void {
    if (!this.currentSession || !this.currentLogFilePath) {
      console.warn("[CodeAwareLogger] No active session. Cannot log event:", eventType);
      return;
    }

    const logEntry: CodeAwareLogEntry = {
      timestamp: new Date().toISOString(),
      codeAwareSessionId: this.currentSession.codeAwareSessionId,
      eventType,
      payload
    };

    try {
      // Append the log entry as a new line in JSONL format
      const logLine = JSON.stringify(logEntry) + "\n";
      fs.appendFileSync(this.currentLogFilePath, logLine, "utf8");
    } catch (error) {
      console.error("[CodeAwareLogger] Failed to write log entry:", error);
    }
  }

  /**
   * End the current logging session
   */
  public endLogSession(): void {
    if (this.currentSession) {
      this.addLogEntry("session_end", {
        sessionDuration: Date.now() - new Date(this.currentSession.codeAwareSessionId).getTime()
      });
    }
    
    this.currentSession = null;
    this.currentLogFilePath = null;
  }

  /**
   * Get current session info
   */
  public getCurrentSession(): CodeAwareLoggerConfig | null {
    return this.currentSession;
  }

  /**
   * Get log file path for current session
   */
  public getCurrentLogFilePath(): string | null {
    return this.currentLogFilePath;
  }

  /**
   * Ensure the log directory exists
   */
  private ensureLogDirectoryExists(): void {
    if (!fs.existsSync(this.logDirectory)) {
      try {
        fs.mkdirSync(this.logDirectory, { recursive: true });
      } catch (error) {
        console.error("[CodeAwareLogger] Failed to create log directory:", error);
      }
    }
  }

  /**
   * Read log entries from a specific session
   */
  public readLogEntries(sessionId: string): CodeAwareLogEntry[] {
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
      console.error("[CodeAwareLogger] Failed to read log entries:", error);
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
      console.error("[CodeAwareLogger] Failed to list log files:", error);
      return [];
    }
  }
}

// Export singleton instance
export const codeAwareLogger = CodeAwareLoggerService.getInstance();

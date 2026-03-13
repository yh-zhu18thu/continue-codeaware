import { useContext, useMemo } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";

/**
 * CodeAware Logger utility class for WebView
 * Provides logging functionality that communicates with the IDE logging service
 */
export class CodeAwareWebViewLogger {
  private static instance: CodeAwareWebViewLogger | null = null;
  private ideMessenger: any;
  private isSessionActive: boolean = false;

  constructor(ideMessenger: any) {
    this.ideMessenger = ideMessenger;
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(ideMessenger: any): CodeAwareWebViewLogger {
    if (!CodeAwareWebViewLogger.instance) {
      CodeAwareWebViewLogger.instance = new CodeAwareWebViewLogger(
        ideMessenger,
      );
    }
    // Update the ideMessenger in case it changed
    CodeAwareWebViewLogger.instance.ideMessenger = ideMessenger;
    return CodeAwareWebViewLogger.instance;
  }

  /**
   * Start a new logging session
   */
  async startLogSession(
    username: string,
    sessionName: string,
    codeAwareSessionId: string,
  ): Promise<void> {
    try {
      await this.ideMessenger.request("startCodeAwareLogSession", {
        username,
        sessionName,
        codeAwareSessionId,
      });
      this.isSessionActive = true;
      console.log("[CA:Logger] Log session started:", {
        username,
        sessionName,
        codeAwareSessionId,
      });
    } catch (error) {
      this.isSessionActive = false;
      console.error("[CA:Logger] Failed to start log session:", error);
      throw error; // 重新抛出错误，让调用者知道启动失败
    }
  }

  /**
   * Add a log entry
   */
  async addLogEntry(eventType: string, payload: any): Promise<void> {
    if (!this.isSessionActive) {
      console.warn(
        "[CA:Logger] No active log session. Cannot log event:",
        eventType,
      );
      return;
    }

    try {
      await this.ideMessenger.request("addCodeAwareLogEntry", {
        eventType,
        payload,
      });
      console.log("[CA:Logger] Log entry added:", eventType);
    } catch (error) {
      console.error("[CA:Logger] Failed to add log entry:", error);
    }
  }

  /**
   * End the current logging session
   */
  async endLogSession(): Promise<void> {
    if (!this.isSessionActive) {
      return;
    }

    try {
      await this.ideMessenger.request("endCodeAwareLogSession", undefined);
      this.isSessionActive = false;
      console.log("[CA:Logger] Log session ended");
    } catch (error) {
      console.error("[CA:Logger] Failed to end log session:", error);
    }
  }

  /**
   * Check if a logging session is active
   */
  isActive(): boolean {
    return this.isSessionActive;
  }
}

/**
 * React hook to use CodeAware logger
 */
export function useCodeAwareLogger(): CodeAwareWebViewLogger {
  const ideMessenger = useContext(IdeMessengerContext);

  // Use useMemo to ensure we get the same instance across re-renders
  return useMemo(() => {
    return CodeAwareWebViewLogger.getInstance(ideMessenger);
  }, [ideMessenger]);
}

import { useContext } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";

/**
 * CodeAware Logger utility class for WebView
 * Provides logging functionality that communicates with the IDE logging service
 */
export class CodeAwareWebViewLogger {
  private ideMessenger: any;
  private isSessionActive: boolean = false;

  constructor(ideMessenger: any) {
    this.ideMessenger = ideMessenger;
  }

  /**
   * Start a new logging session
   */
  async startLogSession(username: string, sessionName: string, codeAwareSessionId: string): Promise<void> {
    try {
      await this.ideMessenger.request("startCodeAwareLogSession", {
        username,
        sessionName,
        codeAwareSessionId
      });
      this.isSessionActive = true;
      console.log("📊 [CodeAware] Log session started:", { username, sessionName, codeAwareSessionId });
    } catch (error) {
      console.error("❌ [CodeAware] Failed to start log session:", error);
    }
  }

  /**
   * Add a log entry
   */
  async addLogEntry(eventType: string, payload: any): Promise<void> {
    if (!this.isSessionActive) {
      console.warn("⚠️ [CodeAware] No active log session. Cannot log event:", eventType);
      return;
    }

    try {
      await this.ideMessenger.request("addCodeAwareLogEntry", {
        eventType,
        payload
      });
      console.log("📝 [CodeAware] Log entry added:", eventType);
    } catch (error) {
      console.error("❌ [CodeAware] Failed to add log entry:", error);
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
      console.log("📊 [CodeAware] Log session ended");
    } catch (error) {
      console.error("❌ [CodeAware] Failed to end log session:", error);
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
  return new CodeAwareWebViewLogger(ideMessenger);
}

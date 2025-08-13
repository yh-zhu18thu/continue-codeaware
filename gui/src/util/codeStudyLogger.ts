import React, { useContext } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";

export interface CodeStudyLogEntry {
  timestamp: string;
  sessionId: string;
  eventType: string;
  payload: any;
}

export interface CodeStudyLoggerConfig {
  username: string;
  sessionName: string;
  codeStudySessionId: string;
}

/**
 * CodeStudy Logger utility for webview
 * Provides methods to start log sessions and add log entries
 */
export class CodeStudyWebviewLogger {
  private ideMessenger: any;
  private currentSession: CodeStudyLoggerConfig | null = null;

  constructor(ideMessenger: any) {
    this.ideMessenger = ideMessenger;
  }

  /**
   * Start a new CodeStudy log session
   */
  async startLogSession(
    username: string,
    sessionName: string,
    sessionId: string,
  ): Promise<void> {
    console.log("[CodeStudyWebviewLogger] startLogSession called", {
      username,
      sessionName,
      sessionId,
    });

    this.currentSession = {
      username,
      sessionName,
      codeStudySessionId: sessionId,
    };

    try {
      const result = await this.ideMessenger.post("codeStudy/startLogSession", {
        username,
        sessionName,
        sessionId,
      });
      console.log("[CodeStudyWebviewLogger] startLogSession finished", result);
    } catch (error) {
      console.error("[CodeStudyWebviewLogger] startLogSession failed", error);
      throw error;
    }
  }

  /**
   * Add a log entry for the current session
   */
  async addLogEntry(eventType: string, payload: any): Promise<void> {
    if (!this.currentSession) {
      console.warn(
        "[CodeStudyWebviewLogger] No active session. Cannot log event:",
        eventType,
      );
      return;
    }

    console.log("[CodeStudyWebviewLogger] addLogEntry called", {
      eventType,
      payload,
    });

    try {
      const result = await this.ideMessenger.post("codeStudy/addLogEntry", {
        eventType,
        payload,
      });
      console.log("[CodeStudyWebviewLogger] addLogEntry finished", result);
    } catch (error) {
      console.error("[CodeStudyWebviewLogger] addLogEntry failed", error);
    }
  }

  /**
   * End the current log session
   */
  async endLogSession(): Promise<void> {
    if (this.currentSession) {
      await this.ideMessenger.post("codeStudy/endLogSession", {});
    }
    this.currentSession = null;
  }

  /**
   * Get current session info
   */
  getCurrentSession(): CodeStudyLoggerConfig | null {
    return this.currentSession;
  }

  /**
   * Log user starting to type in chat input
   */
  async logUserStartTyping(content: string): Promise<void> {
    await this.addLogEntry("user_start_typing", {
      content,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log user sending a message
   */
  async logUserSendMessage(message: string): Promise<void> {
    console.log("[CodeStudyWebviewLogger] logUserSendMessage called with message length:", message.length);
    console.log("[CodeStudyWebviewLogger] Message preview:", message.substring(0, 100) + (message.length > 100 ? "..." : ""));
    
    await this.addLogEntry("user_send_message", {
      message,
      messageLength: message.length,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log AI completing a response
   */
  async logAICompleteResponse(response: string): Promise<void> {
    console.log("[CodeStudyWebviewLogger] logAICompleteResponse called with response length:", response.length);
    console.log("[CodeStudyWebviewLogger] Response preview:", response.substring(0, 100) + (response.length > 100 ? "..." : ""));
    
    await this.addLogEntry("ai_complete_response", {
      response,
      responseLength: response.length,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Hook to use CodeStudy logger in React components
 * Uses useMemo to ensure the same instance is returned for the same ideMessenger
 */
export function useCodeStudyLogger(): CodeStudyWebviewLogger {
  const ideMessenger = useContext(IdeMessengerContext);
  
  // Use useMemo to maintain the same instance across re-renders
  const logger = React.useMemo(() => {
    console.log("[useCodeStudyLogger] Creating new CodeStudyWebviewLogger instance");
    return new CodeStudyWebviewLogger(ideMessenger);
  }, [ideMessenger]);
  
  return logger;
}

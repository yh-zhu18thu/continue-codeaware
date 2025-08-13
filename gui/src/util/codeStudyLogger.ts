import { useContext } from "react";
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
    this.currentSession = {
      username,
      sessionName,
      codeStudySessionId: sessionId,
    };

    await this.ideMessenger.post("codeStudy/startLogSession", {
      username,
      sessionName,
      sessionId,
    });
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

    await this.ideMessenger.post("codeStudy/addLogEntry", {
      eventType,
      payload,
    });
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
    await this.addLogEntry("user_send_message", {
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log AI completing a response
   */
  async logAICompleteResponse(response: string): Promise<void> {
    await this.addLogEntry("ai_complete_response", {
      response,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Hook to use CodeStudy logger in React components
 */
export function useCodeStudyLogger(): CodeStudyWebviewLogger {
  const ideMessenger = useContext(IdeMessengerContext);
  return new CodeStudyWebviewLogger(ideMessenger);
}

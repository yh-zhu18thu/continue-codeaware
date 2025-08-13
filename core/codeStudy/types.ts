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

export interface StartLogSessionPayload {
  username: string;
  sessionName: string;
  sessionId: string;
}

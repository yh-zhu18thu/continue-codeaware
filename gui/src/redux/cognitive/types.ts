export type CognitiveInteractionEventType =
  | "step_expand"
  | "step_collapse"
  | "step_to_code"
  | "code_to_step"
  | "code_explanation"
  | "question_submit_step"
  | "question_submit_global"
  | "knowledge_card_open"
  | "knowledge_card_view_mode_change"
  | "knowledge_card_feedback"
  | "knowledge_card_answer_result";

export type KnowledgeCardViewMode = "read" | "self-test" | "answer";

export interface CognitiveInteractionEvent {
  id: string;
  type: CognitiveInteractionEventType;
  timestamp: number;
  stepId?: string;
  knowledgeCardId?: string;
  payload?: Record<string, unknown>;
}

export interface StepVisitStat {
  viewCount: number;
  lastVisitedAt: number;
  firstVisitedOrder: number;
}

export type IntentType =
  | "task-decomposition"
  | "prerequisite"
  | "code-understanding"
  | "function-mapping";

export interface IntentResolution {
  targetStepId: string;
  intentTypes: IntentType[];
  preferredInitialView: KnowledgeCardViewMode;
  reason: string;
}

export interface IntentSummary {
  intentTypes: IntentType[];
  preferredInitialView: KnowledgeCardViewMode;
  reason: string;
  updatedAt: number;
}

export interface CognitiveTraceState {
  events: CognitiveInteractionEvent[];
  stepVisitStats: Record<string, StepVisitStat>;
  latestIntentByStep: Record<string, IntentSummary>;
}

import { inferIntentFromEvents } from "./intentInference";
import {
  CognitiveInteractionEvent,
  IntentResolution,
  StepVisitStat,
} from "./types";

export interface TriggerRouteDecision {
  shouldGenerateCards: boolean;
  maxCards: number;
  intent: IntentResolution;
}

export function routeCognitiveTrigger(args: {
  currentEvent: CognitiveInteractionEvent;
  recentEvents: CognitiveInteractionEvent[];
  stepVisitStats: Record<string, StepVisitStat>;
}): TriggerRouteDecision {
  const { currentEvent, recentEvents, stepVisitStats } = args;
  const intent = inferIntentFromEvents({
    currentEvent,
    recentEvents,
    stepVisitStats,
  });

  switch (currentEvent.type) {
    case "step_expand":
      return {
        shouldGenerateCards: true,
        maxCards: 2,
        intent,
      };

    case "step_to_code":
    case "code_to_step":
      return {
        shouldGenerateCards: true,
        maxCards: 1,
        intent,
      };

    case "question_submit_step":
    case "question_submit_global":
      return {
        shouldGenerateCards: true,
        maxCards: 3,
        intent,
      };

    default:
      return {
        shouldGenerateCards: false,
        maxCards: 0,
        intent,
      };
  }
}

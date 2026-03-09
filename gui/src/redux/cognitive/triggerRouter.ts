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

  let decision: TriggerRouteDecision;

  switch (currentEvent.type) {
    case "step_expand":
      decision = {
        shouldGenerateCards: true,
        maxCards: 2,
        intent,
      };
      break;

    case "step_to_code":
    case "code_to_step":
      decision = {
        shouldGenerateCards: true,
        maxCards: 1,
        intent,
      };
      break;

    case "question_submit_step":
    case "question_submit_global":
      decision = {
        shouldGenerateCards: true,
        maxCards: 3,
        intent,
      };
      break;

    default:
      decision = {
        shouldGenerateCards: false,
        maxCards: 0,
        intent,
      };
      break;
  }

  console.info("[CognitiveTrace][TriggerRouter]", {
    eventType: currentEvent.type,
    eventIsoTime: new Date(currentEvent.timestamp).toISOString(),
    targetStepId: intent.targetStepId,
    intentReason: intent.reason,
    shouldGenerateCards: decision.shouldGenerateCards,
    maxCards: decision.maxCards,
  });

  return decision;
}

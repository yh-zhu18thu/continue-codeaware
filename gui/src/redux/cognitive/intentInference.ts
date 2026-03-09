import {
  CognitiveInteractionEvent,
  IntentResolution,
  IntentType,
  StepVisitStat,
} from "./types";

function resolveTargetStepId(
  currentEvent: CognitiveInteractionEvent,
  recentEvents: CognitiveInteractionEvent[],
): string {
  if (currentEvent.stepId) {
    return currentEvent.stepId;
  }

  const payloadStepId = currentEvent.payload?.targetStepId;
  if (typeof payloadStepId === "string" && payloadStepId.trim()) {
    return payloadStepId;
  }

  const recentWithStep = [...recentEvents]
    .reverse()
    .find((event) => Boolean(event.stepId));
  if (recentWithStep?.stepId) {
    return recentWithStep.stepId;
  }

  return "s-1";
}

function uniqIntentTypes(intentTypes: IntentType[]): IntentType[] {
  return Array.from(new Set(intentTypes));
}

export function inferIntentFromEvents(args: {
  currentEvent: CognitiveInteractionEvent;
  recentEvents: CognitiveInteractionEvent[];
  stepVisitStats: Record<string, StepVisitStat>;
}): IntentResolution {
  const { currentEvent, recentEvents, stepVisitStats } = args;
  const targetStepId = resolveTargetStepId(currentEvent, recentEvents);

  const stepStat = stepVisitStats[targetStepId];
  const isReviewScene = Boolean(stepStat && stepStat.viewCount >= 2);

  let intentTypes: IntentType[] = ["task-decomposition"];
  let preferredInitialView: IntentResolution["preferredInitialView"] = "read";
  let reason = "fallback_intent";

  switch (currentEvent.type) {
    case "step_expand":
      intentTypes = isReviewScene
        ? ["task-decomposition", "prerequisite"]
        : ["task-decomposition"];
      preferredInitialView = isReviewScene ? "self-test" : "read";
      reason = isReviewScene ? "step_revisit" : "step_direct_expand";
      break;

    case "step_to_code":
      intentTypes = ["code-understanding"];
      preferredInitialView = "read";
      reason = "step_to_code_navigation";
      break;

    case "code_to_step":
      intentTypes = ["function-mapping", "code-understanding"];
      preferredInitialView = "read";
      reason = "code_to_step_navigation";
      break;

    case "question_submit_step":
      intentTypes = ["code-understanding", "prerequisite"];
      preferredInitialView = "self-test";
      reason = "step_question_submission";
      break;

    case "question_submit_global":
      intentTypes = ["function-mapping", "code-understanding", "prerequisite"];
      preferredInitialView = "self-test";
      reason = "global_question_submission";
      break;

    case "knowledge_card_view_mode_change": {
      const viewMode = currentEvent.payload?.viewMode;
      if (viewMode === "answer") {
        intentTypes = ["code-understanding"];
        preferredInitialView = "answer";
        reason = "switch_to_answer_view";
      } else if (viewMode === "self-test") {
        intentTypes = ["prerequisite", "code-understanding"];
        preferredInitialView = "self-test";
        reason = "switch_to_self_test_view";
      } else {
        intentTypes = ["task-decomposition"];
        preferredInitialView = "read";
        reason = "switch_to_read_view";
      }
      break;
    }

    default:
      break;
  }

  console.info("[CognitiveTrace][IntentInference]", {
    eventType: currentEvent.type,
    eventStepId: currentEvent.stepId,
    targetStepId,
    eventIsoTime: new Date(currentEvent.timestamp).toISOString(),
    recentEventCount: recentEvents.length,
    stepViewCount: stepStat?.viewCount ?? 0,
    isReviewScene,
    matchedRule: reason,
    intentTypes,
    preferredInitialView,
  });

  return {
    targetStepId,
    intentTypes: uniqIntentTypes(intentTypes),
    preferredInitialView,
    reason,
  };
}

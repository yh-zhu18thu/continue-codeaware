import {
  CognitiveInteractionEvent,
  CognitiveTraceState,
  StepVisitStat,
} from "./types";

export const DEFAULT_EVENT_BUFFER_SIZE = 200;

export function appendEventWithLimit(
  events: CognitiveInteractionEvent[],
  event: CognitiveInteractionEvent,
  maxSize: number = DEFAULT_EVENT_BUFFER_SIZE,
): CognitiveInteractionEvent[] {
  if (events.some((existing) => existing.id === event.id)) {
    return events;
  }

  const nextEvents = [...events, event];
  if (nextEvents.length <= maxSize) {
    return nextEvents;
  }

  return nextEvents.slice(nextEvents.length - maxSize);
}

export function updateStepVisitStats(
  stepVisitStats: Record<string, StepVisitStat>,
  event: CognitiveInteractionEvent,
): Record<string, StepVisitStat> {
  if (!event.stepId) {
    return stepVisitStats;
  }

  if (event.type !== "step_expand") {
    return stepVisitStats;
  }

  const existing = stepVisitStats[event.stepId];
  if (existing) {
    return {
      ...stepVisitStats,
      [event.stepId]: {
        ...existing,
        viewCount: existing.viewCount + 1,
        lastVisitedAt: event.timestamp,
      },
    };
  }

  const firstVisitedOrder = Object.keys(stepVisitStats).length + 1;
  return {
    ...stepVisitStats,
    [event.stepId]: {
      viewCount: 1,
      lastVisitedAt: event.timestamp,
      firstVisitedOrder,
    },
  };
}

export function createEmptyCognitiveTrace(): CognitiveTraceState {
  return {
    events: [],
    stepVisitStats: {},
    latestIntentByStep: {},
  };
}

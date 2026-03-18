import type { MasteryNodeRef } from "core";
import { useCallback, useEffect, useRef } from "react";
import type { TimedViewTarget } from "../redux/cognitive/masteryTrackingEngine";

export interface PendingTimedView {
  type: TimedViewTarget;
  masteryNodeRefs: MasteryNodeRef[];
  startTime: number;
  minReadingTimeMs: number;
  metadata?: Record<string, unknown>;
}

export interface TimedViewResult {
  type: TimedViewTarget;
  masteryNodeRefs: MasteryNodeRef[];
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Two-slot timed mastery tracker.
 *
 * - **step slot**: tracks the currently expanded step. Persists across
 *   knowledge-card interactions within the same step.
 * - **detail slot**: tracks knowledge-card / code-explanation / situation views.
 *   Replaced independently of the step slot.
 */
export function useTimedMasteryTracker() {
  const stepRef = useRef<PendingTimedView | null>(null);
  const detailRef = useRef<PendingTimedView | null>(null);

  const flushRef = useCallback(
    (
      ref: React.MutableRefObject<PendingTimedView | null>,
    ): TimedViewResult | null => {
      const pending = ref.current;
      if (!pending) {
        return null;
      }

      const duration = Date.now() - pending.startTime;

      if (duration < pending.minReadingTimeMs) {
        return null;
      }

      ref.current = null;

      if (pending.masteryNodeRefs.length === 0) {
        return null;
      }

      return {
        type: pending.type,
        masteryNodeRefs: pending.masteryNodeRefs,
        durationMs: duration,
        metadata: pending.metadata,
      };
    },
    [],
  );

  /** Flush only the step-level pending view. */
  const flushStepView = useCallback(
    (): TimedViewResult | null => flushRef(stepRef),
    [flushRef],
  );

  /** Flush only the detail-level pending view. */
  const flushDetailView = useCallback(
    (): TimedViewResult | null => flushRef(detailRef),
    [flushRef],
  );

  /** Flush both slots. Returns 0–2 results. */
  const flushAllViews = useCallback((): TimedViewResult[] => {
    const results: TimedViewResult[] = [];
    const s = flushStepView();
    if (s) results.push(s);
    const d = flushDetailView();
    if (d) results.push(d);
    return results;
  }, [flushStepView, flushDetailView]);

  /** Start tracking a step view. Only replaces the step slot. */
  const startStepTracking = useCallback(
    (config: PendingTimedView): TimedViewResult | null => {
      const flushed = flushStepView();
      stepRef.current = config;
      return flushed;
    },
    [flushStepView],
  );

  /** Start tracking a detail view (knowledge-card, code, situation).
   *  Only replaces the detail slot — step tracking is unaffected. */
  const startDetailTracking = useCallback(
    (config: PendingTimedView): TimedViewResult | null => {
      const flushed = flushDetailView();
      detailRef.current = config;
      return flushed;
    },
    [flushDetailView],
  );

  /** Non-destructive peek: flush only slots whose reading time is met.
   *  Called by the periodic timer — does NOT clear slots that are still pending. */
  const peekAndFlushIfReady = useCallback((): TimedViewResult[] => {
    const results: TimedViewResult[] = [];
    const s = flushRef(stepRef);
    if (s) results.push(s);
    const d = flushRef(detailRef);
    if (d) results.push(d);
    return results;
  }, [flushRef]);

  const clearAll = useCallback(() => {
    stepRef.current = null;
    detailRef.current = null;
  }, []);

  /** Expose raw refs for debug-level logging in periodic checks. */
  const getTrackingStatus = useCallback(() => {
    const now = Date.now();
    const step = stepRef.current;
    const detail = detailRef.current;
    return {
      step: step
        ? {
            type: step.type,
            elapsed: now - step.startTime,
            threshold: step.minReadingTimeMs,
            ready: now - step.startTime >= step.minReadingTimeMs,
          }
        : null,
      detail: detail
        ? {
            type: detail.type,
            elapsed: now - detail.startTime,
            threshold: detail.minReadingTimeMs,
            ready: now - detail.startTime >= detail.minReadingTimeMs,
          }
        : null,
    };
  }, []);

  useEffect(() => {
    return () => {
      stepRef.current = null;
      detailRef.current = null;
    };
  }, []);

  return {
    startStepTracking,
    startDetailTracking,
    flushStepView,
    flushDetailView,
    flushAllViews,
    peekAndFlushIfReady,
    getTrackingStatus,
    clearAll,
  };
}

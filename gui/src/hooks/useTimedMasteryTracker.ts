import type { MasteryNodeRef } from "core";
import { useCallback, useEffect, useRef } from "react";
import type { TimedViewTarget } from "../redux/cognitive/masteryTrackingEngine";

export interface PendingTimedView {
  type: TimedViewTarget;
  masteryNodeRefs: MasteryNodeRef[];
  startTime: number;
  minReadingTimeMs: number;
  maxReadingTimeMs: number;
  metadata?: Record<string, unknown>;
  /** Whether the normal (min-threshold) signal has been emitted. */
  firstThresholdEmitted: boolean;
  /** Whether the overtime (max-threshold) signal has been emitted. */
  secondThresholdEmitted: boolean;
}

export type TimedViewSignal = "normal" | "overtime";

export interface TimedViewResult {
  type: TimedViewTarget;
  masteryNodeRefs: MasteryNodeRef[];
  durationMs: number;
  signal: TimedViewSignal;
  metadata?: Record<string, unknown>;
}

/**
 * Two-slot timed mastery tracker with dual thresholds.
 *
 * - **step slot**: tracks the currently expanded step. Persists across
 *   knowledge-card interactions within the same step.
 * - **detail slot**: tracks knowledge-card / code-explanation / situation views.
 *   Replaced independently of the step slot.
 *
 * Each slot has two thresholds:
 * 1. `minReadingTimeMs` — emits a "normal" signal (weak positive mastery)
 * 2. `maxReadingTimeMs` — emits an "overtime" signal (moderate negative mastery)
 */
export function useTimedMasteryTracker() {
  const stepRef = useRef<PendingTimedView | null>(null);
  const detailRef = useRef<PendingTimedView | null>(null);

  /**
   * Check a single slot and emit any pending signals that have reached their threshold.
   * Returns 0-2 results. Does NOT clear the slot unless both thresholds are done.
   */
  const checkRef = useCallback(
    (
      ref: React.MutableRefObject<PendingTimedView | null>,
    ): TimedViewResult[] => {
      const pending = ref.current;
      if (!pending || pending.masteryNodeRefs.length === 0) {
        return [];
      }

      const duration = Date.now() - pending.startTime;
      const results: TimedViewResult[] = [];

      // Check first threshold (normal reading time met)
      if (
        duration >= pending.minReadingTimeMs &&
        !pending.firstThresholdEmitted
      ) {
        pending.firstThresholdEmitted = true;
        results.push({
          type: pending.type,
          masteryNodeRefs: pending.masteryNodeRefs,
          durationMs: duration,
          signal: "normal",
          metadata: pending.metadata,
        });
      }

      // Check second threshold (overtime — user may be struggling)
      if (
        duration >= pending.maxReadingTimeMs &&
        !pending.secondThresholdEmitted
      ) {
        pending.secondThresholdEmitted = true;
        results.push({
          type: pending.type,
          masteryNodeRefs: pending.masteryNodeRefs,
          durationMs: duration,
          signal: "overtime",
          metadata: pending.metadata,
        });
      }

      // Clear slot once both thresholds are emitted
      if (pending.firstThresholdEmitted && pending.secondThresholdEmitted) {
        ref.current = null;
      }

      return results;
    },
    [],
  );

  /**
   * Force-flush a slot: emit any signals for thresholds that have been reached
   * but not yet emitted, then clear the slot.
   */
  const forceFlushRef = useCallback(
    (
      ref: React.MutableRefObject<PendingTimedView | null>,
    ): TimedViewResult[] => {
      const pending = ref.current;
      if (!pending || pending.masteryNodeRefs.length === 0) {
        ref.current = null;
        return [];
      }

      const duration = Date.now() - pending.startTime;
      const results: TimedViewResult[] = [];

      if (
        duration >= pending.minReadingTimeMs &&
        !pending.firstThresholdEmitted
      ) {
        results.push({
          type: pending.type,
          masteryNodeRefs: pending.masteryNodeRefs,
          durationMs: duration,
          signal: "normal",
          metadata: pending.metadata,
        });
      }

      if (
        duration >= pending.maxReadingTimeMs &&
        !pending.secondThresholdEmitted
      ) {
        results.push({
          type: pending.type,
          masteryNodeRefs: pending.masteryNodeRefs,
          durationMs: duration,
          signal: "overtime",
          metadata: pending.metadata,
        });
      }

      ref.current = null;
      return results;
    },
    [],
  );

  /** Force-flush only the step-level pending view. */
  const flushStepView = useCallback(
    (): TimedViewResult[] => forceFlushRef(stepRef),
    [forceFlushRef],
  );

  /** Force-flush only the detail-level pending view. */
  const flushDetailView = useCallback(
    (): TimedViewResult[] => forceFlushRef(detailRef),
    [forceFlushRef],
  );

  /** Force-flush both slots. Returns 0–4 results. */
  const flushAllViews = useCallback((): TimedViewResult[] => {
    return [...flushStepView(), ...flushDetailView()];
  }, [flushStepView, flushDetailView]);

  /** Start tracking a step view. Force-flushes existing step slot. */
  const startStepTracking = useCallback(
    (config: PendingTimedView): TimedViewResult[] => {
      const flushed = flushStepView();
      stepRef.current = config;
      return flushed;
    },
    [flushStepView],
  );

  /** Start tracking a detail view (knowledge-card, code, situation).
   *  Only replaces the detail slot — step tracking is unaffected. */
  const startDetailTracking = useCallback(
    (config: PendingTimedView): TimedViewResult[] => {
      const flushed = flushDetailView();
      detailRef.current = config;
      return flushed;
    },
    [flushDetailView],
  );

  /** Non-destructive peek: emit signals for slots whose thresholds are met.
   *  Called by the periodic timer. Slots stay alive until both thresholds fire. */
  const peekAndFlushIfReady = useCallback((): TimedViewResult[] => {
    return [...checkRef(stepRef), ...checkRef(detailRef)];
  }, [checkRef]);

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
            maxThreshold: step.maxReadingTimeMs,
            ready: now - step.startTime >= step.minReadingTimeMs,
            overtime: now - step.startTime >= step.maxReadingTimeMs,
            firstEmitted: step.firstThresholdEmitted,
            secondEmitted: step.secondThresholdEmitted,
          }
        : null,
      detail: detail
        ? {
            type: detail.type,
            elapsed: now - detail.startTime,
            threshold: detail.minReadingTimeMs,
            maxThreshold: detail.maxReadingTimeMs,
            ready: now - detail.startTime >= detail.minReadingTimeMs,
            overtime: now - detail.startTime >= detail.maxReadingTimeMs,
            firstEmitted: detail.firstThresholdEmitted,
            secondEmitted: detail.secondThresholdEmitted,
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

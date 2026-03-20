/**
 * Reading time utilities for estimating minimum reading time
 * based on text content length and a configurable WPM threshold.
 */

const CJK_RANGE =
  /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\uf900-\ufaff\u{2f800}-\u{2fa1f}\u3000-\u303f\u3040-\u309f\u30a0-\u30ff]/gu;

const DEFAULT_WPM = 350;

/**
 * Count "words" in a mixed text (English, CJK, code).
 * - English/code tokens: split by whitespace
 * - CJK characters: each character counts as one word
 */
export function countWords(text: string): number {
  if (!text) {
    return 0;
  }

  // Count CJK characters (each = 1 word)
  const cjkMatches = text.match(CJK_RANGE);
  const cjkCount = cjkMatches?.length ?? 0;

  // Remove CJK characters and count remaining whitespace-delimited tokens
  const withoutCjk = text.replace(CJK_RANGE, " ");
  const tokens = withoutCjk.split(/\s+/).filter((t) => t.length > 0);

  return tokens.length + cjkCount;
}

/**
 * Calculate the minimum reading time in milliseconds for the given text,
 * assuming a reading speed of `wpm` words per minute (default 350).
 *
 * Returns at least 1000ms to avoid trivially short thresholds.
 */
export function calculateMinReadingTimeMs(
  text: string,
  wpm: number = DEFAULT_WPM,
): number {
  const words = countWords(text);
  const minutes = words / Math.max(wpm, 1);
  const ms = minutes * 60 * 1000;
  return Math.max(ms, 1000);
}

/**
 * Calculate the maximum reading time in milliseconds (2× the minimum).
 * Exceeding this threshold indicates the user may be struggling.
 */
export function calculateMaxReadingTimeMs(
  text: string,
  wpm: number = DEFAULT_WPM,
): number {
  return 2 * calculateMinReadingTimeMs(text, wpm);
}

/**
 * Estimate word count from code lines (for cases where only line count is known).
 * Assumes ~10 words per code line on average.
 */
export function estimateCodeWordCount(lineCount: number): number {
  return lineCount * 10;
}

/**
 * 将掌握度分数 (0-1) 映射为渐进颜色（色盲友好）。
 *
 * 色阶（蓝→青→黄→橙，避免红绿对比）：
 *   0.0        → #6366F1 (靛蓝 - 未掌握)
 *   0.25       → #3B82F6 (蓝色)
 *   0.5        → #06B6D4 (青色 - 中等)
 *   0.75       → #F59E0B (琥珀色)
 *   1.0        → #F97316 (橙色 - 完全掌握)
 */

interface ColorStop {
  t: number;
  r: number;
  g: number;
  b: number;
}

const COLOR_STOPS: ColorStop[] = [
  { t: 0.0, r: 99, g: 102, b: 241 }, // indigo-500
  { t: 0.25, r: 59, g: 130, b: 246 }, // blue-500
  { t: 0.5, r: 6, g: 182, b: 212 }, // cyan-500
  { t: 0.75, r: 245, g: 158, b: 11 }, // amber-500
  { t: 1.0, r: 249, g: 115, b: 22 }, // orange-500
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function masteryScoreToColor(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));

  // 找到相邻两个色阶断点
  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (clamped >= COLOR_STOPS[i].t && clamped <= COLOR_STOPS[i + 1].t) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i + 1];
      break;
    }
  }

  const segT =
    upper.t === lower.t ? 0 : (clamped - lower.t) / (upper.t - lower.t);

  const r = Math.round(lerp(lower.r, upper.r, segT));
  const g = Math.round(lerp(lower.g, upper.g, segT));
  const b = Math.round(lerp(lower.b, upper.b, segT));

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 返回带透明度的颜色，用于背景或渐变效果。
 */
export function masteryScoreToColorWithAlpha(
  score: number,
  alpha: number,
): string {
  const clamped = Math.max(0, Math.min(1, score));

  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (clamped >= COLOR_STOPS[i].t && clamped <= COLOR_STOPS[i + 1].t) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i + 1];
      break;
    }
  }

  const segT =
    upper.t === lower.t ? 0 : (clamped - lower.t) / (upper.t - lower.t);

  const r = Math.round(lerp(lower.r, upper.r, segT));
  const g = Math.round(lerp(lower.g, upper.g, segT));
  const b = Math.round(lerp(lower.b, upper.b, segT));

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

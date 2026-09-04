/* ------------------------------------------------------------------
 * 庆祝时刻：canvas-confetti 的品牌化封装
 * 触发点刻意克制：AI 建议被接受 / 首份简历创建 / JD 匹配高分。
 * PDF 导出不撒花 —— window.print() 无法感知用户是否真的保存成功。
 * ------------------------------------------------------------------ */
import confetti from "canvas-confetti";

/** 品牌色系：墨绿深浅 + seal 橙 + 暖纸白 */
const PALETTE = ["#4F46E5", "#38BDF8", "#C084FC", "#D97706", "#C3C8FB"];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 单发：从中偏右喷出，短促收场 */
export function celebrate() {
  if (reducedMotion()) return;
  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 38,
    ticks: 160,
    origin: { x: 0.62, y: 0.32 },
    colors: PALETTE,
    disableForReducedMotion: true,
    zIndex: 200,
  });
}

/** 双发：左右连喷，用于更隆重的时刻（首份简历） */
export function celebrateBig() {
  if (reducedMotion()) return;
  const opts = { colors: PALETTE, disableForReducedMotion: true, zIndex: 200, ticks: 190 };
  confetti({ ...opts, particleCount: 70, spread: 60, origin: { x: 0.3, y: 0.35 } });
  setTimeout(() => confetti({ ...opts, particleCount: 70, spread: 60, origin: { x: 0.75, y: 0.3 } }), 140);
}

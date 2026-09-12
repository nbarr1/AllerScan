/**
 * Applies the user's reaction-sensitivity setting to a personal risk score.
 *
 * `sensitivityFactor` runs 1 (less reactive than typical) to 3 (more reactive). 2 is neutral and
 * leaves the score untouched, so existing profiles — which all default to 2 — see no change.
 *
 * Shared by the server route and the offline estimate so both produce the same number. Kept in a
 * dependency-free module because server.ts imports it too.
 */
export function applySensitivity(score: number, sensitivityFactor = 2): number {
  const factor = Number.isFinite(sensitivityFactor)
    ? Math.min(3, Math.max(1, sensitivityFactor))
    : 2;
  const multiplier = 1 + (factor - 2) * 0.15; // 0.85 / 1.0 / 1.15
  return Math.round(Math.min(100, Math.max(0, score * multiplier)));
}

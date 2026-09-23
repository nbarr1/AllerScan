/**
 * A coordinate as the app sends it to the server: two decimal places, roughly 1 km.
 *
 * Pollen and weather grids are far coarser than that, and the server already rounds to the same
 * precision for its cache, so nothing is lost — and a user's exact position doesn't end up in
 * request logs. The map itself still uses the precise position; it never leaves the browser.
 */
export function coarseCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

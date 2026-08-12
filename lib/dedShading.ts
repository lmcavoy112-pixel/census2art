// Shared between IrelandArtworkMap and CountyArtworkMap: ranks a set of DED
// person_counts into quartiles and scales a base opacity by rank, so denser
// areas read as visually heavier regardless of which fill style is active.

export const QUARTILE_SCALE = [0.15, 0.38, 0.65, 1.0] as const;

export function quartileOpacity(count: number, sortedCounts: number[], base: number): number {
  const n = sortedCounts.length;
  if (n <= 1) return base;
  let rank = 0;
  for (const c of sortedCounts) { if (c <= count) rank++; }
  const pct = rank / n;
  const q = pct > 0.75 ? 3 : pct > 0.50 ? 2 : pct > 0.25 ? 1 : 0;
  return base * QUARTILE_SCALE[q];
}

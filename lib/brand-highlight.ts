export const DEFAULT_BRAND_HIGHLIGHT_INTENSITY = 100;
export const MIN_BRAND_HIGHLIGHT_INTENSITY = 0;
export const MAX_BRAND_HIGHLIGHT_INTENSITY = 160;

export function normaliseBrandHighlightIntensity(value: unknown) {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numberValue)) return DEFAULT_BRAND_HIGHLIGHT_INTENSITY;

  return Math.min(
    MAX_BRAND_HIGHLIGHT_INTENSITY,
    Math.max(MIN_BRAND_HIGHLIGHT_INTENSITY, Math.round(numberValue))
  );
}

export function brandHighlightOpacity(baseOpacity: number, intensity: unknown) {
  const scale = normaliseBrandHighlightIntensity(intensity) / DEFAULT_BRAND_HIGHLIGHT_INTENSITY;
  return Math.min(1, Math.max(0, baseOpacity * scale));
}

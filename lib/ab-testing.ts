export type LeadMagnetAbResult = {
  variantId: string;
  visits: number;
  conversions: number;
};

/**
 * Compare exact conversion ratios rather than rounded percentages. Control
 * wins a perfect tie, so the live page is only rewritten by evidence of an
 * improvement.
 */
export function selectLeadMagnetAbWinner(
  results: LeadMagnetAbResult[],
  minimumVisitsPerVersion: number
) {
  if (
    results.length < 2
    || results.some((result) => result.visits < minimumVisitsPerVersion)
  ) {
    return null;
  }

  return [...results].sort((left, right) => {
    const rateDifference = (right.conversions * left.visits)
      - (left.conversions * right.visits);
    if (rateDifference !== 0) return rateDifference;
    if (right.conversions !== left.conversions) {
      return right.conversions - left.conversions;
    }
    if (right.visits !== left.visits) return right.visits - left.visits;
    if (left.variantId === 'control') return -1;
    if (right.variantId === 'control') return 1;
    return left.variantId.localeCompare(right.variantId);
  })[0];
}

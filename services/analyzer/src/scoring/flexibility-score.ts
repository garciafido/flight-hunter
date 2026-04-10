import { getAirlineRating } from '@flight-hunter/shared';

/**
 * Compute flexibility score based on airline change policy.
 * 'free' → 100, 'paid' → 50, 'no-changes' → 10, unknown → 50
 */
export function computeFlexibilityScore(outboundAirline: string, inboundAirline?: string): number {
  const outRating = getAirlineRating(outboundAirline);
  const inRating = inboundAirline ? getAirlineRating(inboundAirline) : undefined;

  const outScore = policyScore(outRating?.changePolicy);
  const inScore = policyScore(inRating?.changePolicy);

  if (inboundAirline === undefined || inboundAirline === outboundAirline) {
    return outScore;
  }

  // Average both legs
  return Math.round((outScore + inScore) / 2);
}

function policyScore(policy: 'free' | 'paid' | 'no-changes' | undefined): number {
  switch (policy) {
    case 'free': return 100;
    case 'paid': return 50;
    case 'no-changes': return 10;
    default: return 50; // unknown airline
  }
}

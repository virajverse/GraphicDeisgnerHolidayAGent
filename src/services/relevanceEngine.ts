import { EventRecord, UserRecord, ClientRecord } from '../types/database.js';

export interface ScoreEvaluation {
  score: number;
  threshold: number;
  shouldAlert: boolean;
  factors: {
    baseImportance: number;
    industryFit: number;
    platformFit: number;
    toneFit: number;
  };
}

/**
 * Event Relevance Scoring Engine (TypeScript)
 */
export function calculateEventScore(
  event: EventRecord,
  userProfile?: UserRecord | null,
  clientProfile?: ClientRecord | null
): ScoreEvaluation {
  const baseImportance = event.importance || 80;
  let industryMultiplier = 1.0;
  let platformMultiplier = 1.0;
  let toneMultiplier = 1.0;

  if (clientProfile) {
    const clientInd = (clientProfile.industry || '').toLowerCase();
    const eventCat = (event.category || '').toLowerCase();

    if (
      (clientInd.includes('ngo') && (eventCat.includes('social') || eventCat.includes('national'))) ||
      (clientInd.includes('tech') && (eventCat.includes('tech') || eventCat.includes('business'))) ||
      (clientInd.includes('business') && eventCat.includes('business'))
    ) {
      industryMultiplier = 1.25;
    }
  }

  const rawScore = baseImportance * industryMultiplier * platformMultiplier * toneMultiplier;
  const finalScore = Math.min(Math.round(rawScore), 100);
  const threshold = userProfile?.importance_threshold || 40;

  return {
    score: finalScore,
    threshold,
    shouldAlert: finalScore >= threshold,
    factors: {
      baseImportance,
      industryFit: Math.round(industryMultiplier * 100),
      platformFit: Math.round(platformMultiplier * 100),
      toneFit: Math.round(toneMultiplier * 100)
    }
  };
}

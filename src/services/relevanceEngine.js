/**
 * Relevance & Scoring Engine for Taliyo Creative Intelligence
 * Decides whether an upcoming event warrants an alert for a specific user and client set.
 */

export function calculateEventScore(event, userProfile, clientProfile = null) {
  let score = event.importance || 50;

  // 1. Category Matching with User & Client Preferred Industries
  const userIndustries = JSON.parse(userProfile.industries || '[]');
  const categoryMap = {
    'NATIONAL': ['Business', 'Education', 'NGO', 'Technology'],
    'ENVIRONMENT': ['NGO', 'SaaS', 'Business', 'Education'],
    'AWARENESS': ['NGO', 'Education', 'Health'],
    'FESTIVAL': ['Business', 'Restaurant', 'E-commerce', 'NGO'],
    'TECHNOLOGY': ['Technology', 'SaaS', 'Business'],
    'HEALTH': ['Health', 'NGO', 'Education'],
    'EDUCATION': ['Education', 'NGO', 'SaaS'],
    'BUSINESS': ['Business', 'SaaS', 'Technology']
  };

  const relevantIndustries = categoryMap[event.category] || ['Business'];
  const userCategoryMatch = relevantIndustries.some(ind => userIndustries.includes(ind));
  
  if (userCategoryMatch) {
    score += 15;
  }

  // 2. Client Specific Relevance boost
  if (clientProfile) {
    const clientIndustryMatch = relevantIndustries.includes(clientProfile.industry);
    if (clientIndustryMatch) {
      score += 15;
    }
  }

  // 3. Creative Potential Assessment
  // High visual events (Festivals, Environment, Design, Women's Day) get creative potential boosts
  const highVisualCategories = ['FESTIVAL', 'ENVIRONMENT', 'CULTURAL', 'NATIONAL'];
  if (highVisualCategories.includes(event.category)) {
    score += 10;
  }

  // Cap score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, Math.round(score)));
  const threshold = userProfile.importance_threshold || 40;
  const shouldAlert = finalScore >= threshold;

  return {
    score: finalScore,
    threshold,
    shouldAlert,
    action: shouldAlert ? '🔴 Alert' : '⚪ Ignore',
    reasoning: `Base importance: ${event.importance}, Category match: ${userCategoryMatch ? 'Yes (+15)' : 'No'}, Final score: ${finalScore}`
  };
}

export function filterUpcomingEvents(events, userProfile, clientProfiles = []) {
  return events.map(evt => {
    let clientScores = [];
    if (clientProfiles.length > 0) {
      clientScores = clientProfiles.map(client => ({
        clientId: client.id,
        clientName: client.name,
        eval: calculateEventScore(evt, userProfile, client)
      }));
    }

    const baseEval = calculateEventScore(evt, userProfile);
    
    return {
      event: evt,
      evaluation: baseEval,
      clientEvaluations: clientScores
    };
  }).filter(item => item.evaluation.shouldAlert);
}

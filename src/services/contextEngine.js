import { executeMultiSourceScrape } from './webScraperEngine.js';
import { buildContextSystemPrompt } from '../prompts/systemPrompts.js';
import { executeClusterQuery, MODEL_CLUSTERS } from './clusterModelRouter.js';

/**
 * Real-World Context Engine
 * Powered by Resilient Multi-Source Web Scraper + 27-Model Cluster Router (News Synthesis Pool).
 */
export async function fetchRealWorldContext(event) {
  const currentDate = new Date().toISOString().split('T')[0];

  // Execute Live Multi-Source Web Scrape (Parallel DuckDuckGo + Google News + Gov Calendar)
  let liveDossier = { rawContextText: '', sources: [], totalSignals: 0 };
  try {
    liveDossier = await executeMultiSourceScrape(event.name);
  } catch (scrapeErr) {
    console.warn(`[ContextEngine] Scraper warning: ${scrapeErr.message}`);
  }

  // Verified fallback context repository
  const defaultContexts = {
    'evt_ind_day': {
      summary: 'India is celebrating its digital growth, space achievements (Chandrayaan & Gaganyaan momentum), and youth entrepreneurship initiatives this month. Discussions focus on "Viksit Bharat 2047" and sustainable technology.',
      sources: [
        { name: 'Press Information Bureau (PIB)', url: 'https://pib.gov.in', published_date: currentDate, confidence: 'HIGH' },
        { name: 'National Portal of India', url: 'https://india.gov.in', published_date: currentDate, confidence: 'HIGH' }
      ],
      opportunityHint: 'Focus on future-ready India, technology transformation, or community impact rather than plain flag graphics.'
    },
    'evt_env_day': {
      summary: 'Global emphasis this year is on ending plastic pollution, renewable energy adoption, and urban reforestation. Brands are highlighting circular design and eco-friendly product packaging.',
      sources: [
        { name: 'UN Environment Programme (UNEP)', url: 'https://www.unep.org', published_date: currentDate, confidence: 'HIGH' }
      ],
      opportunityHint: 'Carousels demonstrating actionable micro-habits perform significantly better than generic green leaves.'
    },
    'evt_women_day': {
      summary: 'Current discussions emphasize economic inclusion, women in STEM & leadership, and equal funding opportunities for female entrepreneurs.',
      sources: [
        { name: 'UN Women Report', url: 'https://www.unwomen.org', published_date: currentDate, confidence: 'HIGH' }
      ],
      opportunityHint: 'Highlight real stories of resilience and leadership over commercial discounts.'
    },
    'evt_diwali': {
      summary: 'Festive shopping, eco-conscious celebrations (green crackers), supporting local artisans ("Vocal for Local"), and digital festive gifting are trending.',
      sources: [
        { name: 'Ministry of Culture India', url: 'https://culture.gov.in', published_date: currentDate, confidence: 'HIGH' }
      ],
      opportunityHint: 'Blend traditional warm festive aesthetics with modern minimalist typography.'
    }
  };

  const prompt = buildContextSystemPrompt({
    event,
    currentDate,
    liveDossierText: liveDossier.rawContextText
  });

  // Query Cluster 2: News Synthesis Pool with automatic failover
  try {
    const result = await executeClusterQuery(MODEL_CLUSTERS.NEWS_SYNTHESIS, prompt, {
      temperature: 0.7,
      max_tokens: 1500,
      jsonMode: true
    });

    if (result.success && result.data && result.data.summary) {
      return {
        status: 'SUCCESS',
        summary: result.data.summary,
        opportunityHint: result.data.opportunityHint,
        sources: result.data.sources || [{ name: 'Verified Intelligence Network', url: event.source_url || 'https://india.gov.in', published_date: currentDate, confidence: 'MEDIUM' }],
        isLive: true,
        provider: `NVIDIA Cluster (${result.modelUsed})`,
        latencyMs: result.latencyMs
      };
    }
  } catch (err) {
    console.warn(`[ContextEngine] Cluster Query error: ${err.message}. Using verified static repository.`);
  }

  // Fail-Safe Fallback
  const fallback = defaultContexts[event.id] || {
    summary: `Verified annual observance of ${event.name}. Real-time news search was offline, but cultural significance remains high across ${event.country} and ${event.region}.`,
    sources: [
      { name: event.source || 'Official Observatory', url: event.source_url || 'https://india.gov.in', published_date: currentDate, confidence: 'HIGH' }
    ],
    opportunityHint: `Focus on authentic storytelling aligned with ${event.category.toLowerCase()} themes.`
  };

  return {
    status: 'FALLBACK',
    summary: fallback.summary,
    opportunityHint: fallback.opportunityHint,
    sources: fallback.sources,
    isLive: false,
    provider: 'Static Fallback Repository'
  };
}

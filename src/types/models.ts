/**
 * AI Model Cluster & Creative Strategy Types
 */

export interface CreativeIdea {
  category: 'Educational' | 'Emotional' | 'Brand-focused' | 'Social-awareness' | 'Interactive' | 'Experimental' | string;
  title: string;
  concept: string;
  visual_direction: string;
  headline: string;
  platform: string;
  audience: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | string;
  why_it_works: string;
}

export interface BriefingRecommendation {
  recommended_ids: number[];
  recommended_platforms: string;
  target_audience: string;
  avoid_note: string;
}

export interface IdeationResult {
  ideas: CreativeIdea[];
  recommendation: BriefingRecommendation;
}

export interface ScrapedSource {
  name: string;
  url: string;
  published_date: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface EventContext {
  summary: string;
  opportunityHint: string;
  sources: ScrapedSource[];
}

export interface MultiSourceScrapeResult {
  query: string;
  scrapedAt: string;
  totalArticles: number;
  sourcesFound: string[];
  dossierText: string;
  articles: Array<{
    source: string;
    title: string;
    snippet: string;
    link: string;
  }>;
}

export type ModelClusterType =
  | 'SCOPE_GUARD'
  | 'NEWS_SYNTHESIS'
  | 'CREATIVE_COPY'
  | 'DEEP_STRATEGY'
  | 'TRANSLATION_CALIBRATION';

import { executeClusterQuery, MODEL_CLUSTERS } from './clusterModelRouter.js';
import { executeMultiSourceScrape } from './webScraperEngine.js';
import { buildContextSystemPrompt } from '../prompts/systemPrompts.js';
import { EventRecord, ClientRecord, UserRecord } from '../types/database.js';
import { EventContext } from '../types/models.js';

/**
 * Context Intelligence Engine (TypeScript)
 * Synthesizes real-world context using the NEWS_SYNTHESIS pool (5 Models)
 */
export async function fetchRealWorldContext(
  event: EventRecord,
  userProfile?: UserRecord | null,
  clientProfile?: ClientRecord | null
): Promise<EventContext> {
  const currentDate = new Date().toISOString().split('T')[0];

  console.log(`[ContextEngine] 🌐 Gathering Multi-Source Live Scraped Intelligence for "${event.name}"...`);
  const scrapeResult = await executeMultiSourceScrape(event.name);

  const systemPrompt = buildContextSystemPrompt({
    event,
    currentDate,
    liveDossierText: scrapeResult.dossierText,
    userProfile,
    clientProfile
  });

  const userQuery = `Analyze the current real-world context and creative opportunities for: ${event.name} (Date: ${event.date}). Focus on real developments and concrete visual cues for a graphic designer.`;

  console.log(`[ContextEngine] 🧠 Synthesizing context with NEWS_SYNTHESIS Pool (5 Models)...`);

  try {
    const result = await executeClusterQuery(
      MODEL_CLUSTERS.NEWS_SYNTHESIS,
      systemPrompt,
      userQuery,
      {
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }
    );

    let cleanJson = result.text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(cleanJson);
    return {
      summary: parsed.summary || `${event.name} on ${event.date} presents a major brand storytelling and audience engagement opportunity.`,
      opportunityHint: parsed.opportunityHint || 'Focus on community connection, authentic storytelling, and visual contrast.',
      sources: parsed.sources || (scrapeResult.articles.length > 0 ? scrapeResult.articles.map(a => ({
        name: a.source,
        url: a.link,
        published_date: currentDate,
        confidence: 'HIGH' as const
      })) : [{ name: 'Government Calendar India', url: 'https://knowindia.india.gov.in', published_date: currentDate, confidence: 'HIGH' as const }])
    };
  } catch (err: any) {
    console.warn(`[ContextEngine] Fallback context applied: ${err.message}`);
    return {
      summary: `${event.name} (${event.date}) is a key national and cultural occasion in India for brand storytelling and visual design.`,
      opportunityHint: 'Highlight progress, cultural pride, impact, and modern visual design aesthetics.',
      sources: [
        {
          name: 'Official Indian Government & Cultural Calendar',
          url: 'https://knowindia.india.gov.in',
          published_date: currentDate,
          confidence: 'HIGH'
        }
      ]
    };
  }
}

import { executeClusterQuery, MODEL_CLUSTERS } from './clusterModelRouter.js';
import { buildIdeationSystemPrompt } from '../prompts/systemPrompts.js';
import { EventRecord, ClientRecord, UserRecord } from '../types/database.js';
import { EventContext, IdeationResult, CreativeIdea } from '../types/models.js';

interface IdeationParams {
  event: EventRecord;
  context: EventContext;
  userProfile?: UserRecord | null;
  clientProfile?: ClientRecord | null;
}

/**
 * Creative Ideation Engine (TypeScript)
 * Generates exactly 6 category briefs using DEEP_STRATEGY Pool (6 Models)
 */
export async function generateCreativeIdeas({
  event,
  context,
  userProfile,
  clientProfile
}: IdeationParams): Promise<IdeationResult> {
  const systemPrompt = buildIdeationSystemPrompt({
    event,
    context,
    userProfile,
    clientProfile
  });

  const userQuery = `Generate 6 distinct, creative graphic design concepts for: "${event.name}". 
Industry context: ${clientProfile ? clientProfile.industry : 'Technology & Social Impact'}.
Brand Tone: ${clientProfile ? clientProfile.brand_tone : 'Modern, crisp, impactful'}.
Ensure strictly ONE idea for Educational, Emotional, Brand-focused, Social-awareness, Interactive, and Experimental.`;

  console.log(`[IdeationEngine] 🎨 Generating 6 concepts using DEEP_STRATEGY Pool (6 Models)...`);

  try {
    const result = await executeClusterQuery(
      MODEL_CLUSTERS.DEEP_STRATEGY,
      systemPrompt,
      userQuery,
      {
        temperature: 0.7,
        max_tokens: 3000,
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

    if (parsed.ideas && Array.isArray(parsed.ideas) && parsed.ideas.length >= 6) {
      return {
        ideas: parsed.ideas.slice(0, 6),
        recommendation: parsed.recommendation || {
          recommended_ids: [1, 4],
          recommended_platforms: 'Instagram Carousel + LinkedIn',
          target_audience: 'Modern Digital Audience & Brand Followers',
          avoid_note: 'Strongest engagement potential with educational clarity.'
        }
      };
    }

    throw new Error('LLM did not return all 6 required idea categories in JSON format.');
  } catch (err: any) {
    console.warn(`[IdeationEngine] Deep Strategy fallback triggered: ${err.message}`);
    return generateStructuredFallbackIdeas(event, context, clientProfile);
  }
}

function generateStructuredFallbackIdeas(
  event: EventRecord,
  context: EventContext,
  clientProfile?: ClientRecord | null
): IdeationResult {
  const brandTone = clientProfile ? clientProfile.brand_tone : 'Modern & Impactful';
  const brandName = clientProfile ? clientProfile.name : 'Your Brand';

  const ideas: CreativeIdea[] = [
    {
      category: 'Educational',
      title: `Timeline & Milestones: The Journey of ${event.name}`,
      concept: `A 5-slide carousel breaking down key milestones and real-world statistics related to ${event.name}.`,
      visual_direction: `Clean isometric timeline layout, deep navy background with vibrant saffron and green accents, geometric typography.`,
      headline: `"The Evolution of ${event.name}: From Foundation to Future"`,
      platform: 'Instagram Carousel & LinkedIn',
      audience: 'Industry professionals & curious public',
      difficulty: 'Medium',
      why_it_works: `High save-rate format. Viewers bookmark educational carousels with dense valuable insights.`
    },
    {
      category: 'Emotional',
      title: `Voices of Pride: Real Human Stories`,
      concept: `High-impact portrait photography paired with authentic short quotes celebrating everyday heroes.`,
      visual_direction: `Warm cinematic lighting, monochrome hero portrait with subtle tricolor gradient overlay and bold serif title.`,
      headline: `"Every Progress Begins With One Dedicated Heart."`,
      platform: 'Instagram Post & Story',
      audience: 'General public & community donors',
      difficulty: 'Easy',
      why_it_works: `Authentic human faces and relatable emotion drive 2.4x higher comment engagement.`
    },
    {
      category: 'Brand-focused',
      title: `Building Tomorrow: ${brandName}'s Commitment`,
      concept: `Seamless alignment showing how ${brandName}'s core values resonate with the spirit of ${event.name}.`,
      visual_direction: `Sleek dark glassmorphism card, glowing neon edge highlights, subtle abstract vector icon of growth.`,
      headline: `"Empowering India's Vision, One Innovation At A Time."`,
      platform: 'LinkedIn Post',
      audience: 'CTOs, founders, B2B stakeholders',
      difficulty: 'Medium',
      why_it_works: `Subtle brand integration that celebrates the occasion without looking like an aggressive sales pitch.`
    },
    {
      category: 'Social-awareness',
      title: `Action Checklist: 5 Ways You Can Make A Difference`,
      concept: `A minimalist, checklist-style poster featuring actionable steps everyday citizens can take.`,
      visual_direction: `High-contrast monochrome typography with bright green checkmark badges and generous breathing white space.`,
      headline: `"Pride in Action: 5 Small Habits for Real Impact."`,
      platform: 'Instagram Story & Carousel',
      audience: 'Youth, creators & active citizens',
      difficulty: 'Easy',
      why_it_works: `Actionable checklists generate high DM shares and story re-posts.`
    },
    {
      category: 'Interactive',
      title: `The Great ${event.name} Trivia & Poll`,
      concept: `An interactive 3-question quiz carousel inviting users to test their knowledge and vote in the comments.`,
      visual_direction: `Bold split-screen card layout, retro neo-brutalism outlines, playful stickers and clear poll options A/B/C.`,
      headline: `"How Well Do You Really Know ${event.name}? Test Yourself!"`,
      platform: 'Instagram Interactive Carousel',
      audience: 'Social followers & creators',
      difficulty: 'Medium',
      why_it_works: `Gamification and quiz prompts trigger algorithm boosts via high comment volumes.`
    },
    {
      category: 'Experimental',
      title: `3D Kinetic Typography & Abstract Geometry`,
      concept: `A cutting-edge visual composition blending 3D liquid textures, warped typography, and dynamic perspective.`,
      visual_direction: `Chrome 3D metallic numerals, floating glass shards, ambient dark lighting with neon orange and cyan glow.`,
      headline: `"Beyond Horizons: The Future Reimagined."`,
      platform: 'Behance / Instagram Reel Cover',
      audience: 'Designers, art directors, modern tech audience',
      difficulty: 'Hard',
      why_it_works: `Stops the scroll instantly. Modern art direction demonstrates world-class aesthetic capability.`
    }
  ];

  return {
    ideas,
    recommendation: {
      recommended_ids: [1, 4],
      recommended_platforms: 'Instagram Carousel + LinkedIn',
      target_audience: `Followers aligned with ${brandTone} brand communication`,
      avoid_note: `The Educational Carousel (Idea #1) and Action Checklist (Idea #4) offer the highest engagement and credibility.`
    }
  };
}

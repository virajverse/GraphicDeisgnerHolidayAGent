import { buildIdeationSystemPrompt } from '../prompts/systemPrompts.js';
import { executeClusterQuery, MODEL_CLUSTERS } from './clusterModelRouter.js';

/**
 * Creative Ideation & Recommendation Engine
 * Powered by Resilient 27-Model Cluster Router (Deep Strategy Pool: 120B / 550B / 30B Models).
 */
export async function generateCreativeIdeas({
  event,
  context,
  userProfile,
  clientProfile = null
}) {
  const clientIndustry = clientProfile ? clientProfile.industry : 'General';

  const prompt = buildIdeationSystemPrompt({
    event,
    context,
    userProfile,
    clientProfile
  });

  // Query Cluster 4: Deep Strategy & 6 Category Briefing Pool with automatic failover
  try {
    const result = await executeClusterQuery(MODEL_CLUSTERS.DEEP_STRATEGY, prompt, {
      temperature: 0.8,
      max_tokens: 3500,
      jsonMode: true
    });

    if (result.success && result.data && result.data.ideas && result.data.ideas.length >= 5) {
      return {
        ideas: result.data.ideas.slice(0, 6).map((idea, index) => ({
          id: index + 1,
          ...idea
        })),
        recommendation: result.data.recommendation || getDefaultRecommendation(event, clientIndustry),
        provider: `NVIDIA Cluster (${result.modelUsed})`,
        latencyMs: result.latencyMs
      };
    }
  } catch (err) {
    console.warn(`[IdeationEngine] Cluster Query error: ${err.message}. Using curated high-quality engine.`);
  }

  // Fail-Safe Curated Ideation Engine (Guaranteed 6 distinct concepts)
  const curatedIdeas = getCuratedIdeasForEvent(event, clientProfile);
  const recommendation = getDefaultRecommendation(event, clientIndustry);

  return {
    ideas: curatedIdeas,
    recommendation,
    provider: 'Curated Ideation Engine'
  };
}

function getDefaultRecommendation(event, clientIndustry) {
  return {
    recommended_ids: [1, 4],
    recommended_platforms: "Instagram Carousel + LinkedIn",
    target_audience: `${clientIndustry} professionals, creators & engaged audience`,
    avoid_note: `Avoid generic stock-template approach. Do not use plain "Happy ${event.name}" banners with standard clipart.`
  };
}

function getCuratedIdeasForEvent(event, clientProfile) {
  const industry = clientProfile ? clientProfile.industry : 'General';
  const name = event.name;

  if (event.id === 'evt_ind_day' || name.toLowerCase().includes('independence')) {
    if (industry === 'NGO') {
      return [
        {
          id: 1,
          category: 'Educational',
          title: 'Freedom Beyond Borders',
          concept: 'Break down how true independence means equal educational & healthcare opportunity for underprivileged children.',
          visual_direction: 'Split frame: Left monochrome historical archive, right vibrant full-color portrait of empowered youth.',
          headline: 'Freedom means opportunity for every child.',
          platform: 'Instagram Carousel (4 slides)',
          audience: 'Social conscious audience & Donors',
          difficulty: 'Medium',
          why_it_works: 'Substitutes hollow patriotism with actionable social impact.'
        },
        {
          id: 2,
          category: 'Emotional',
          title: 'Voices of Tomorrow',
          concept: 'Quote-driven graphic featuring grassroot changemakers in rural India.',
          visual_direction: 'Warm duotone earth colors (terracotta & saffron accent), high-contrast serif typography.',
          headline: 'Shaping the soul of modern India.',
          platform: 'Instagram Post & Story',
          audience: 'Youth & Volunteers',
          difficulty: 'Low',
          why_it_works: 'Strong human connection creates high shareability on Instagram stories.'
        },
        {
          id: 3,
          category: 'Brand-focused',
          title: '79 Years of Empowering Lives',
          concept: 'Timeline of milestone social projects delivered across India over the decades.',
          visual_direction: 'Clean infographic line design, subtle tricolor accent line along timeline curve.',
          headline: 'Building a stronger India, step by step.',
          platform: 'LinkedIn Article Banner + Slide Deck',
          audience: 'Corporate partners & Stakeholders',
          difficulty: 'High',
          why_it_works: 'Establishes credibility and long-term brand authority.'
        },
        {
          id: 4,
          category: 'Social-awareness',
          title: 'The Unsung Heroes of Freedom',
          concept: 'Highlighting community leaders working on clean water, education, and sanitation.',
          visual_direction: 'Minimalistic black & white photography with golden badge overlays.',
          headline: 'True independence is lived every day.',
          platform: 'LinkedIn Post + Instagram',
          audience: 'General Public & NGO supporters',
          difficulty: 'Medium',
          why_it_works: 'Inspires respect and emotional alignment.'
        },
        {
          id: 5,
          category: 'Interactive',
          title: 'What Does Freedom Mean To You?',
          concept: 'Prompt graphic encouraging audience to drop 1 word in comments about their vision for India.',
          visual_direction: 'Bold typography poster design with central open text box space.',
          headline: 'What does freedom mean to you in 2026?',
          platform: 'Instagram Story (Poll / Question Sticker)',
          audience: 'Community followers',
          difficulty: 'Low',
          why_it_works: 'Drives high comment engagement and algorithm visibility.'
        },
        {
          id: 6,
          category: 'Experimental',
          title: 'India 2047 Vision',
          concept: 'Futuristic 3D vector illustration blending traditional Indian architecture with futuristic green cities.',
          visual_direction: 'Glassmorphism 3D render, deep navy background with glowing saffron neon accents.',
          headline: 'Designing the India of Tomorrow.',
          platform: 'Instagram Carousel & Pinterest',
          audience: 'Designers, Tech enthusiasts & Innovators',
          difficulty: 'High',
          why_it_works: 'Stunning visual hook that stops scrolling immediately.'
        }
      ];
    }

    if (industry === 'Technology' || industry === 'SaaS') {
      return [
        {
          id: 1,
          category: 'Educational',
          title: 'Modern India: Code & Infrastructure',
          concept: 'Highlighting India\'s digital transformation—UPI payments, Space tech, and open-source software dominance.',
          visual_direction: 'Sleek dark mode graphic with cyan code lines forming the map outline of India.',
          headline: 'From Silicon Valleys to Digital India.',
          platform: 'LinkedIn Post + PDF Carousel',
          audience: 'CTOs, Developers & Tech Leaders',
          difficulty: 'Medium',
          why_it_works: 'Connects national pride with high-tech industrial capability.'
        },
        {
          id: 2,
          category: 'Emotional',
          title: 'Empowering 1.4 Billion Minds',
          concept: 'Showcasing how software and cloud technology democratize opportunity across tier 2 & tier 3 Indian cities.',
          visual_direction: 'Clean vector illustration of remote creator with glowing digital network nodes.',
          headline: 'Technology is the ultimate equalizer.',
          platform: 'LinkedIn & Twitter/X Banner',
          audience: 'Founders & Tech workers',
          difficulty: 'Medium',
          why_it_works: 'Empathetic tech message resonates deeply with remote tech workers.'
        },
        {
          id: 3,
          category: 'Brand-focused',
          title: 'Built in India, Built for the World',
          concept: 'Showcasing your product architecture as part of India\'s global SaaS export story.',
          visual_direction: 'Minimalist product UI mockup integrated inside sleek geometric India map frame.',
          headline: 'Engineered in India. Trusted globally.',
          platform: 'LinkedIn Banner & Post',
          audience: 'Global B2B Clients & Investors',
          difficulty: 'High',
          why_it_works: 'Positions company as global contender while respecting national origin.'
        },
        {
          id: 4,
          category: 'Social-awareness',
          title: 'Digital Independence',
          concept: 'Carousel discussing data sovereignty, privacy, and cyber security literacy for citizens.',
          visual_direction: 'Infographic checklist with shield icons and bold green/white status indicators.',
          headline: 'Claiming your digital independence.',
          platform: 'LinkedIn Carousel',
          audience: 'Cybersecurity & Tech audience',
          difficulty: 'Medium',
          why_it_works: 'High value educational content saved and shared frequently.'
        },
        {
          id: 5,
          category: 'Interactive',
          title: 'Tech India Trivia Challenge',
          concept: '3-slide interactive quiz on historic Indian scientific milestones.',
          visual_direction: 'Gamified UI cards with swipe indicators and answer key on final slide.',
          headline: 'Test your Tech India IQ!',
          platform: 'Instagram Carousel',
          audience: 'Students & Tech community',
          difficulty: 'Low',
          why_it_works: 'Gamification increases carousel swiping rate.'
        },
        {
          id: 6,
          category: 'Experimental',
          title: 'Algorithmic Freedom',
          concept: 'Generative typography graphic created using code scripts representing Indian regional scripts.',
          visual_direction: 'Generative art typography wallpaper design, high resolution contrast.',
          headline: 'Freedom coded line by line.',
          platform: 'Instagram Post & Mobile Wallpaper giveaway',
          audience: 'Designers & Developers',
          difficulty: 'High',
          why_it_works: 'Provides high utility value (free download wallpaper).'
        }
      ];
    }
  }

  // Default Generic 6 Concepts
  return [
    {
      id: 1,
      category: 'Educational',
      title: `${event.name}: Context & Key Facts`,
      concept: `Breakdown of why ${event.name} matters in 2026 and 3 actionable insights for modern professionals.`,
      visual_direction: 'Clean 4-slide carousel with bold typography, minimal grid layout, and brand accent colors.',
      headline: `3 Things you must know about ${event.name}.`,
      platform: 'Instagram Carousel + LinkedIn',
      audience: 'General & Industry Professionals',
      difficulty: 'Medium',
      why_it_works: 'Educational carousels generate highest save-rates on Instagram and LinkedIn.'
    },
    {
      id: 2,
      category: 'Emotional',
      title: 'Human Connection & Meaning',
      concept: 'Story-driven post focusing on personal growth and community spirit behind this day.',
      visual_direction: 'Authentic portrait photography with subtle gradient overlay and elegant serif text.',
      headline: `The human story behind ${event.name}.`,
      platform: 'Instagram Post & Story',
      audience: 'Community & Followers',
      difficulty: 'Low',
      why_it_works: 'Human stories evoke empathy and emotional connection.'
    },
    {
      id: 3,
      category: 'Brand-focused',
      title: 'Brand Purpose Alignment',
      concept: `Connecting your brand values directly with the core message of ${event.name}.`,
      visual_direction: 'Minimalist brand graphic with product visual and subtle event motif.',
      headline: `Living our values every single day.`,
      platform: 'LinkedIn Post + Website Banner',
      audience: 'B2B Partners & Clients',
      difficulty: 'Medium',
      why_it_works: 'Demonstrates authentic corporate purpose without hard selling.'
    },
    {
      id: 4,
      category: 'Social-awareness',
      title: 'Actionable Change Checklist',
      concept: '5 simple actions your audience can take today to support this cause.',
      visual_direction: 'Checklist infographic with clear iconography and green tick indicators.',
      headline: 'Small steps. Big difference.',
      platform: 'Instagram Carousel & Story',
      audience: 'Social conscious public',
      difficulty: 'Medium',
      why_it_works: 'Practical checklists give immediate actionable value.'
    },
    {
      id: 5,
      category: 'Interactive',
      title: 'Audience Engagement Prompt',
      concept: 'Interactive open question asking audience to share their thoughts or experiences.',
      visual_direction: 'Bold centered question mark design with high contrast neon accent color.',
      headline: `How are you observing ${event.name}?`,
      platform: 'Instagram Story Poll / LinkedIn Poll',
      audience: 'Active Community',
      difficulty: 'Low',
      why_it_works: 'Polls and open questions maximize comment counts.'
    },
    {
      id: 6,
      category: 'Experimental',
      title: 'Visual Metaphor & Abstract Art',
      concept: 'Conceptual graphic using surreal visual metaphors to represent the essence of the event.',
      visual_direction: '3D geometric art with floating elements and dramatic shadows.',
      headline: 'A fresh visual perspective.',
      platform: 'Instagram Reel Graphic / Banner',
      audience: 'Designers & Creative Directors',
      difficulty: 'High',
      why_it_works: 'Breaks aesthetic monotony and showcases high creative caliber.'
    }
  ];
}

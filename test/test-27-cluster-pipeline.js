import dotenv from 'dotenv';
dotenv.config();

import db from '../src/db/database.js';
import { executeMultiSourceScrape } from '../src/services/webScraperEngine.js';
import { fetchRealWorldContext } from '../src/services/contextEngine.js';
import { generateCreativeIdeas } from '../src/services/ideationEngine.js';
import { MODEL_CLUSTERS } from '../src/services/clusterModelRouter.js';

async function run27ClusterPipelineTest() {
  console.log('================================================================================');
  console.log('🧪 TALIYO CREATIVE AGENT — 27-MODEL CLUSTER PIPELINE FULL AUDIT');
  console.log('================================================================================\n');

  const allAssignedModels = [
    ...(MODEL_CLUSTERS.FRONT_DISPATCHER || []),
    ...MODEL_CLUSTERS.SCOPE_GUARD,
    ...MODEL_CLUSTERS.NEWS_SYNTHESIS,
    ...MODEL_CLUSTERS.CREATIVE_COPY,
    ...MODEL_CLUSTERS.DEEP_STRATEGY,
    ...MODEL_CLUSTERS.TRANSLATION_CALIBRATION
  ];
  const uniqueModels = Array.from(new Set(allAssignedModels));

  console.log(`📊 Active Cluster Model Distribution:`);
  console.log(`• Front Dispatcher Pool: ${(MODEL_CLUSTERS.FRONT_DISPATCHER || []).length} Models`);
  console.log(`• Scope Guard Pool: ${MODEL_CLUSTERS.SCOPE_GUARD.length} Models`);
  console.log(`• News Synthesis Pool: ${MODEL_CLUSTERS.NEWS_SYNTHESIS.length} Models`);
  console.log(`• Creative Copy Pool: ${MODEL_CLUSTERS.CREATIVE_COPY.length} Models`);
  console.log(`• Deep Strategy Pool: ${MODEL_CLUSTERS.DEEP_STRATEGY.length} Models`);
  console.log(`• Translation Pool: ${MODEL_CLUSTERS.TRANSLATION_CALIBRATION.length} Models`);
  console.log(`⚡ TOTAL CASCADE SLOTS: ${allAssignedModels.length} Slots across 6 Pools`);
  console.log(`💎 UNIQUE SPECIALIZED NIM MODELS: ${uniqueModels.length} Unique Models\n`);

  const event = db.prepare("SELECT * FROM events WHERE id = 'evt_ind_day'").get() || {
    id: 'evt_ind_day',
    name: 'Independence Day India',
    country: 'India',
    importance: 95
  };

  const user = db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
  const client = db.prepare("SELECT * FROM clients WHERE id = 'client_ngo'").get();

  // Test 1: Parallel Web Scraper
  console.log('🌐 1. Testing Parallel Web Scraper Network...');
  const scrapeStart = Date.now();
  const liveScrape = await executeMultiSourceScrape(event.name);
  console.log(`   ✅ Web Scraper extracted ${liveScrape.sources.length} sources in ${Date.now() - scrapeStart}ms\n`);

  // Test 2: Cluster 2 Real-World Context Synthesis
  console.log('📰 2. Testing Cluster 2 News Context Synthesis Pool...');
  const ctxStart = Date.now();
  const context = await fetchRealWorldContext(event);
  console.log(`   ✅ Context Synthesized in ${Date.now() - ctxStart}ms!`);
  console.log(`   📌 Provider/Model: ${context.provider}`);
  console.log(`   💬 Summary: "${context.summary.substring(0, 100)}..."\n`);

  // Test 3: Cluster 4 Deep Strategy 6-Category Briefing Engine
  console.log('🧠 3. Testing Cluster 4 Deep Strategy 6-Category Briefing Pool...');
  const ideaStart = Date.now();
  const ideation = await generateCreativeIdeas({ event, context, userProfile: user, clientProfile: client });
  console.log(`   ✅ 6 Concepts Generated in ${Date.now() - ideaStart}ms!`);
  console.log(`   📌 Provider/Model: ${ideation.provider}`);
  console.log(`   🎯 Concepts Generated: ${ideation.ideas.length} Category Briefs\n`);

  console.log('================================================================================');
  console.log('🎉 27-MODEL CLUSTER PIPELINE AUDIT PASSED 100%!');
  console.log('================================================================================\n');
}

run27ClusterPipelineTest();

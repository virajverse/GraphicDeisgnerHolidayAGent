import dotenv from 'dotenv';
dotenv.config();

import db, { initDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seedEvents.js';
import { calculateEventScore } from '../src/services/relevanceEngine.js';
import { fetchRealWorldContext } from '../src/services/contextEngine.js';
import { generateCreativeIdeas } from '../src/services/ideationEngine.js';
import { formatTelegramAlertMessage, handleOnDemandIdeas } from '../src/services/telegramBot.js';
import { runEventCheckAndAlert } from '../src/services/scheduler.js';
import { executeMultiSourceScrape } from '../src/services/webScraperEngine.js';

async function runEndToEndVerification() {
  console.log('=======================================================');
  console.log('🧪 Taliyo Creative Intelligence AI Agent — Test Suite');
  console.log('=======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // Test 1: Database & Seeding Check
    initDatabase();
    seedDatabase();
    const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
    assert(eventCount >= 20, `Database contains ${eventCount} pre-seeded events (Expected >= 20)`);

    // Test 2: Relevance Engine Scoring
    const indEvent = db.prepare("SELECT * FROM events WHERE id = 'evt_ind_day'").get();
    const user = db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
    const client = db.prepare("SELECT * FROM clients WHERE id = 'client_ngo'").get();

    const scoreEval = calculateEventScore(indEvent, user, client);
    assert(scoreEval.shouldAlert === true, `Relevance Engine correctly flagged Independence Day for ALERT`);

    // Test 2.5: World-Class Multi-Source Real-Time Web Scraper Engine
    const liveScrape = await executeMultiSourceScrape('Independence Day India');
    assert(liveScrape.sources.length >= 1, `Multi-Source Scraper extracted ${liveScrape.sources.length} live source citations in ${liveScrape.elapsedMs}ms`);

    // Test 3: Real-World Context Engine (Multi-Source Scraper + NVIDIA Cloud openai/gpt-oss-120b)
    const context = await fetchRealWorldContext(indEvent);
    assert(context.summary && context.summary.length > 20, `Real-World Context Engine generated summary`);
    assert(context.sources && context.sources.length > 0, `Context Engine included source references (${context.sources[0].name})`);
    assert(context.provider !== undefined, `Context Engine reported active AI Provider: ${context.provider}`);

    // Test 4: 6 Creative Concepts Generation (NVIDIA Cloud openai/gpt-oss-120b)
    const ideation = await generateCreativeIdeas({ event: indEvent, context, userProfile: user, clientProfile: client });
    assert(ideation.ideas.length === 6, `Ideation Engine generated EXACTLY 6 distinct creative concepts (${ideation.provider})`);

    const categories = ideation.ideas.map(i => i.category.toLowerCase());
    const requiredCategories = ['educational', 'emotional', 'brand-focused', 'social-awareness', 'interactive', 'experimental'];
    const hasAllCategories = requiredCategories.every(cat => categories.some(c => c.includes(cat) || cat.includes(c)));
    assert(hasAllCategories, `Ideation Engine generated concepts across all 6 required categories (${ideation.ideas.map(i => i.category).join(', ')})`);

    // Test 5: Telegram Alert Payload Formatting
    const alertData = { eventId: indEvent.id, relevanceScore: scoreEval.score };
    const formattedMsg = formatTelegramAlertMessage(indEvent, alertData, context, ideation);
    assert(formattedMsg.includes('TALIYO CREATIVE AGENT'), `Telegram Message contains required Agent Header`);
    assert(formattedMsg.includes('Tailored Graphic Concepts'), `Telegram Message contains 6 Graphic Concepts section`);
    assert(formattedMsg.includes('RECOMMENDATION'), `Telegram Message contains Recommendation section`);

    // Test 6: Scheduler & Database Briefing Pipeline
    const schedResult = await runEventCheckAndAlert(null, 'evt_ind_day');
    assert(schedResult.alertsGenerated >= 1, `Scheduler generated and logged ${schedResult.alertsGenerated} alert briefings`);

    const dbAlert = db.prepare("SELECT * FROM alerts WHERE event_id = 'evt_ind_day' ORDER BY generated_at DESC LIMIT 1").get();
    assert(dbAlert !== undefined, `Alert persisted to SQLite 'alerts' table`);

    const dbIdeasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas WHERE alert_id = ?').get(dbAlert.id).count;
    assert(dbIdeasCount === 6, `SQLite 'creative_ideas' table contains 6 linked records for alert ${dbAlert.id}`);

    // Test 7: On-Demand Telegram Bot Intelligence
    const botOnDemand = await handleOnDemandIdeas('World Environment Day');
    assert(botOnDemand.ideation.ideas.length === 6, `On-demand Telegram command generated 6 ideas for custom event`);

  } catch (err) {
    console.error('❌ Test Suite Error:', err.message);
    failed++;
  }

  console.log('\n=======================================================');
  console.log(`📊 Test Execution Summary: ${passed} Passed, ${failed} Failed`);
  console.log('=======================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEndToEndVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

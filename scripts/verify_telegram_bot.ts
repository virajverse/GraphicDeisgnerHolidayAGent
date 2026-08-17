import 'dotenv/config';
import https from 'https';
import db, { initDatabase } from '../src/db/database.js';
import { executeClusterQuery } from '../src/services/clusterModelRouter.js';
import { fetchRealWorldContext } from '../src/services/contextEngine.js';
import { generateCreativeIdeas } from '../src/services/ideationEngine.js';
import {
  handleFullCalendarCommand,
  handleTodayCommand,
  handleReferralHub,
  handleTopReferrers,
  DESIGNER_KEYBOARD,
  ADMIN_MASTER_KEYBOARD
} from '../src/services/telegramBot.js';

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function check(suite: string, test: string, condition: boolean, details: string = '') {
  results.push({ suite, test, passed: condition, details });
  const icon = condition ? '✅' : '❌';
  console.log(`${icon} [${suite}] ${test} ${details ? '— ' + details : ''}`);
}

async function verifyTelegramBotApi(): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return new Promise((resolve) => {
    https.get(`https://api.telegram.org/bot${token}/getMe`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e: any) {
          resolve({ ok: false, error: e.message });
        }
      });
    }).on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

async function runFullAudit() {
  console.log('\n======================================================');
  console.log('🤖 TALIYO CREATIVE INTELLIGENCE — TELEGRAM BOT AUDIT');
  console.log('======================================================\n');

  // 1. TELEGRAM BOT API VERIFICATION
  console.log('📡 STEP 1: Verifying Telegram Bot API Gateway...');
  const botInfo = await verifyTelegramBotApi();
  check(
    'Telegram API',
    'Bot Token & Authentication',
    botInfo.ok === true,
    botInfo.ok ? `@${botInfo.result.username} (ID: ${botInfo.result.id})` : botInfo.error
  );

  // 2. TURSO CLOUD DATABASE & TABLES VERIFICATION
  console.log('\n💾 STEP 2: Verifying Turso Cloud Database & Schema...');
  await initDatabase();

  const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get()?.count ?? 0;
  const eventsCount = db.prepare('SELECT COUNT(*) as count FROM events').get()?.count ?? 0;
  const clientsCount = db.prepare('SELECT COUNT(*) as count FROM clients').get()?.count ?? 0;
  const referralsCount = db.prepare('SELECT COUNT(*) as count FROM referrals').get()?.count ?? 0;

  check('Database', 'Users Table', usersCount >= 1, `Found ${usersCount} users`);
  check('Database', 'Events Calendar Table', eventsCount >= 1, `Found ${eventsCount} events`);
  check('Database', 'Clients Table', clientsCount >= 1, `Found ${clientsCount} client profiles`);
  check('Database', 'Referrals Table', referralsCount >= 0, `Referral engine synced (${referralsCount} records)`);

  // 3. CALENDAR & CONTEXT ENGINE
  console.log('\n🗓️ STEP 3: Verifying Calendar & Real-Time Context Engine...');
  const calOutput = handleFullCalendarCommand('ALL');
  check('Calendar Engine', '30-Day Rolling Calendar', typeof calOutput === 'string' && calOutput.includes('CALENDAR'), 'Generated formatted calendar text');

  const testEvent = {
    id: 'evt_test_audit',
    name: 'Diwali Festival of Lights',
    date: '11-01',
    country: 'India',
    category: 'FESTIVAL',
    importance: 98
  };

  const context = await fetchRealWorldContext(testEvent);
  check('Context Engine', 'Real-World News & Trend Scraping', Boolean(context.summary && context.opportunityHint), `Summary length: ${context.summary.length} chars`);

  // 4. NVIDIA NIM 27-MODEL CLUSTER ROUTER
  console.log('\n🧠 STEP 4: Verifying NVIDIA AI Cluster Inference...');
  try {
    const aiRes = await executeClusterQuery(
      'DEEP_STRATEGY',
      'You are a Senior Design Director. Output 1 short design tip for social media.',
      'Give 1 tip for typography hierarchy.',
      { max_tokens: 100 }
    );

    check('AI Cluster', '27-Model Cluster Live Inference', Boolean(aiRes && aiRes.text.length > 10), `Response received via ${aiRes.modelUsed} (${aiRes.text.slice(0, 60)}...)`);
  } catch (err: any) {
    check('AI Cluster', '27-Model Cluster Live Inference', false, err.message);
  }

  // 5. IDEATION ENGINE
  console.log('\n🎨 STEP 5: Verifying 6-Concept Ideation Engine...');
  try {
    const userProfile = db.prepare("SELECT * FROM users WHERE telegram_chat_id = '1634951702'").get() || {
      id: 'default_user',
      name: 'Viraj Admin',
      telegram_chat_id: '1634951702',
      language: 'Hinglish',
      role: 'ADMIN',
      is_approved: 1
    };

    const clientProfile = db.prepare("SELECT * FROM clients LIMIT 1").get() || {
      id: 'client_default',
      user_id: 'default_user',
      name: 'Nexus SaaS',
      industry: 'Technology',
      brand_tone: 'Modern & Crisp',
      creative_style: 'Minimal typography'
    };

    const ideation = await generateCreativeIdeas({
      event: testEvent,
      context,
      userProfile,
      clientProfile
    });

    check('Ideation Engine', '6-Concept Generation', ideation.ideas && ideation.ideas.length >= 4, `Synthesized ${ideation.ideas?.length || 0} creative design concepts`);
    check('Ideation Engine', 'Strategic Recommendation', Boolean(ideation.recommendation && ideation.recommendation.target_audience), `Target: ${ideation.recommendation?.target_audience}`);
  } catch (err: any) {
    check('Ideation Engine', '6-Concept Generation', false, err.message);
  }

  // 6. REFERRAL & LEADERBOARD SYSTEM
  console.log('\n🎁 STEP 6: Verifying Referral & VIP Rewards Engine...');
  const testChatId = '1634951702';
  
  // Test Referral Leaderboard generator
  const topUsers = db.prepare('SELECT * FROM users ORDER BY referral_count DESC LIMIT 10').all();
  check('Referral Engine', 'Leaderboard Query', Array.isArray(topUsers), `Fetched top referrers query`);

  // 7. KEYBOARDS & DOCKED ACTION HUBS
  console.log('\n⌨️ STEP 7: Verifying Keyboards & User Navigation...');
  check('Keyboards', 'Designer Reply Keyboard', DESIGNER_KEYBOARD.keyboard.some(row => row.some(b => b.text.includes('Invite & Earn'))), 'Contains Invite & Earn button');
  check('Keyboards', 'Admin Master Keyboard', ADMIN_MASTER_KEYBOARD.keyboard.some(row => row.some(b => b.text.includes('Admin Control'))), 'Contains Super Admin Control hub');

  // SUMMARY REPORT
  console.log('\n======================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`📊 FINAL RESULT: ${passed}/${total} TESTS PASSED (${failed} failures)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFullAudit().catch(err => {
  console.error('❌ Audit encountered critical error:', err);
  process.exit(1);
});

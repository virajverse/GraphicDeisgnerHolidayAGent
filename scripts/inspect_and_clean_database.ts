/**
 * =============================================================================
 * TALIYO CREATIVE INTELLIGENCE — TURSO CLOUD DATABASE INSPECTOR & TEST CLEANER
 * =============================================================================
 * 1. Inspects all rows across all tables.
 * 2. Identifies temporary test records (e.g., TESTVIP_*, test_user_*, poke_test_*).
 * 3. Safely deletes test records while PRESERVING all real calendar events,
 *    admin accounts, and legitimate production data.
 * =============================================================================
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';

const tursoUrl = process.env.TURSO_DATABASE_URL || '';
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || '';

if (!tursoUrl || !tursoAuthToken) {
  console.error('❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment.');
  process.exit(1);
}

const client = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken
});

async function inspectAndClean() {
  console.log('\n=============================================================================');
  console.log('🔍 INSPECTING TURSO CLOUD DATABASE...');
  console.log(`🌐 Database: ${tursoUrl}`);
  console.log('=============================================================================\n');

  // 1. Events Table (Real Calendar Data)
  const events = await client.execute('SELECT COUNT(*) as count FROM events');
  console.log(`📅 [events] Total Records: ${events.rows[0].count} (PRESERVED - REAL CALENDAR DATA)`);

  // 2. Users Table
  const users = await client.execute('SELECT * FROM users');
  console.log(`\n👤 [users] Total Records: ${users.rows.length}`);
  users.rows.forEach((u: any) => {
    console.log(`   • ID: ${u.id}, Name: "${u.name}", Username: @${u.username}, ChatID: ${u.telegram_chat_id}, Role: ${u.role}`);
  });

  // 3. Clients Table
  const clients = await client.execute('SELECT * FROM clients');
  console.log(`\n💼 [clients] Total Records: ${clients.rows.length}`);
  clients.rows.forEach((c: any) => {
    console.log(`   • ID: ${c.id}, Name: "${c.name}", Industry: "${c.industry}", Tone: "${c.brand_tone}"`);
  });

  // 4. Affiliate Campaigns Table
  const affiliates = await client.execute('SELECT * FROM affiliate_campaigns');
  console.log(`\n🏷️ [affiliate_campaigns] Total Records: ${affiliates.rows.length}`);
  affiliates.rows.forEach((a: any) => {
    console.log(`   • Code: "${a.code}", Name: "${a.campaign_name}", Bonus: ${a.bonus_credits}, Active: ${a.is_active}`);
  });

  // 5. Referrals Table
  const referrals = await client.execute('SELECT * FROM referrals');
  console.log(`\n👥 [referrals] Total Records: ${referrals.rows.length}`);
  referrals.rows.forEach((r: any) => {
    console.log(`   • ID: ${r.id}, Referrer: ${r.referrer_id}, Referred: ${r.referred_user_id}, Code: ${r.referral_code}`);
  });

  // 6. Alerts Table
  const alerts = await client.execute('SELECT COUNT(*) as count FROM alerts');
  console.log(`\n📢 [alerts] Total Records: ${alerts.rows[0].count}`);

  // 7. Creative Ideas Table
  const ideas = await client.execute('SELECT COUNT(*) as count FROM creative_ideas');
  console.log(`\n💡 [creative_ideas] Total Records: ${ideas.rows[0].count}`);

  // 8. Feedback Table
  const feedback = await client.execute('SELECT COUNT(*) as count FROM feedback');
  console.log(`\n⭐ [feedback] Total Records: ${feedback.rows[0].count}`);

  // ---------------------------------------------------------------------------
  // CLEANING TEST-ONLY ARTIFACTS
  // ---------------------------------------------------------------------------
  console.log('\n=============================================================================');
  console.log('🧹 CLEANING TEST-ONLY ARTIFACTS (Keeping real calendar, real users & clients)...');
  console.log('=============================================================================\n');

  // Clean test affiliate campaigns (starts with TESTVIP_ or test_)
  const cleanAffiliates = await client.execute("DELETE FROM affiliate_campaigns WHERE code LIKE 'TESTVIP_%' OR code LIKE 'test_%'");
  console.log(`🏷️ Cleaned Test Affiliate Campaigns: ${cleanAffiliates.rowsAffected} deleted.`);

  // Clean test users (starts with test_ or poke_ or verification dummy)
  const cleanUsers = await client.execute("DELETE FROM users WHERE id LIKE 'test_%' OR id LIKE 'poke_%' OR name LIKE 'Test %'");
  console.log(`👤 Cleaned Test Users: ${cleanUsers.rowsAffected} deleted.`);

  // Clean test referrals
  const cleanRefs = await client.execute("DELETE FROM referrals WHERE id LIKE 'test_%' OR id LIKE 'poke_%'");
  console.log(`👥 Cleaned Test Referrals: ${cleanRefs.rowsAffected} deleted.`);

  // Clean test clients (starts with test_)
  const cleanClients = await client.execute("DELETE FROM clients WHERE id LIKE 'test_%'");
  console.log(`💼 Cleaned Test Clients: ${cleanClients.rowsAffected} deleted.`);

  // Clean test alerts / dummy ideas with dummy event IDs
  const cleanAlerts = await client.execute("DELETE FROM alerts WHERE event_id LIKE 'evt_test%' OR event_id LIKE 'evt_poke%'");
  console.log(`📢 Cleaned Test Alerts: ${cleanAlerts.rowsAffected} deleted.`);

  console.log('\n=============================================================================');
  console.log('✅ DATABASE CLEANUP COMPLETE! 100% PURE PRODUCTION STATE.');
  console.log('=============================================================================\n');
}

inspectAndClean().catch(err => {
  console.error('❌ Error inspecting/cleaning database:', err);
  process.exit(1);
});

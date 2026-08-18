/**
 * =============================================================================
 * TALIYO CREATIVE INTELLIGENCE — ENSURE 1 SUPER ADMIN & 0 DESIGNERS
 * =============================================================================
 * Persists the 1 Master Admin account in Turso Cloud Database,
 * while leaving designer accounts at 0 (clean production launch state).
 * =============================================================================
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';

const tursoUrl = process.env.TURSO_DATABASE_URL || '';
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || '';

if (!tursoUrl || !tursoAuthToken) {
  console.error('❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken
});

async function ensureAdminAndCleanDesigners() {
  console.log('\n=============================================================================');
  console.log('👑 CONFIGURING PRODUCTION USER BASE: 1 SUPER ADMIN, 0 DESIGNERS');
  console.log('=============================================================================\n');

  const adminChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID || '1634951702';
  const adminHandle = (process.env.ADMIN_TELEGRAM_HANDLE || '@virajverse').replace('@', '');

  // 1. Delete all existing users first to ensure pure clean state
  await client.execute('DELETE FROM users');

  // 2. Insert exactly 1 Super Admin into Turso Cloud
  await client.execute({
    sql: `INSERT INTO users (
            id, name, username, profession, location, telegram_chat_id,
            is_approved, role, verification_status, language, referral_credits
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'user_admin_master',
      'Viraj (Master Admin)',
      adminHandle,
      'Lead Creative Director & Admin',
      'India',
      adminChatId,
      1,
      'ADMIN',
      'APPROVED',
      'HINGLISH',
      99999
    ]
  });

  // 3. Inspect final state from Turso Cloud
  const allUsers = await client.execute('SELECT * FROM users');
  const admins = allUsers.rows.filter((u: any) => u.role === 'ADMIN');
  const designers = allUsers.rows.filter((u: any) => u.role !== 'ADMIN');

  console.log(`👑 Super Admins Count: ${admins.length}`);
  admins.forEach((a: any) => {
    console.log(`   • ${a.name} (@${a.username}) | Telegram ID: ${a.telegram_chat_id} | Role: ${a.role} | Status: ${a.verification_status}`);
  });

  console.log(`\n🎨 Regular Designers Count: ${designers.length}`);
  console.log('\n=============================================================================');
  console.log(`✅ VERIFIED: EXACTLY ${admins.length} SUPER ADMIN AND ${designers.length} DESIGNERS!`);
  console.log('=============================================================================\n');
}

ensureAdminAndCleanDesigners().catch(err => {
  console.error('❌ Error setting up admin user:', err);
  process.exit(1);
});

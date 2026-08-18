import 'dotenv/config';
import { createClient } from '@libsql/client';

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoAuthToken) {
  console.error('❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env');
  process.exit(1);
}

const client = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken,
});

async function migrateConfigsToDatabase() {
  console.log('=' .repeat(80));
  console.log('🚀 MIGRATING DYNAMIC BUSINESS CONFIGS INTO TURSO CLOUD DATABASE');
  console.log('=' .repeat(80));

  // 1. Ensure system_settings table exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Ensure invite_codes table exists for dynamic invite passcodes
  await client.execute(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_by TEXT DEFAULT 'SUPER_ADMIN',
      max_uses INTEGER DEFAULT 999,
      uses_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('✅ Tables system_settings and invite_codes verified on Turso Cloud.');

  // 3. Seed Production Business Configurations
  const defaultSettings = [
    { key: 'ADMIN_INVITE_CODE', value: 'TALIYO2026', is_enabled: 1 },
    { key: 'ADMIN_TELEGRAM_HANDLE', value: '@virajverse', is_enabled: 1 },
    { key: 'TELEGRAM_DEFAULT_CHAT_ID', value: '1634951702', is_enabled: 1 },
    { key: 'DEFAULT_LEAD_DAYS', value: '2', is_enabled: 1 },
    { key: 'MIN_RELEVANCE_SCORE', value: '40', is_enabled: 1 },
    { key: 'TELEGRAM_WEBHOOK_SECRET', value: 'taliyo_secret_webhook_2026_auth', is_enabled: 1 }
  ];

  for (const s of defaultSettings) {
    await client.execute({
      sql: `
        INSERT INTO system_settings (key, value, is_enabled, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_enabled = excluded.is_enabled, updated_at = CURRENT_TIMESTAMP
      `,
      args: [s.key, s.value, s.is_enabled]
    });
    console.log(`📌 Config Saved: ${s.key} = "${s.value}"`);
  }

  // 4. Seed primary invite code
  await client.execute({
    sql: `
      INSERT INTO invite_codes (code, created_by, max_uses, uses_count, is_active)
      VALUES ('TALIYO2026', 'Viraj (@virajverse)', 9999, 0, 1)
      ON CONFLICT(code) DO UPDATE SET is_active = 1
    `,
    args: []
  });
  console.log('📌 Invite Code Seeded: "TALIYO2026" (Active in Turso DB)');

  // 5. Verify data from Turso Cloud
  const allSettings = await client.execute('SELECT * FROM system_settings');
  console.log(`\n🎉 Verified ${allSettings.rows.length} System Settings Stored Securely in Turso Cloud:`);
  allSettings.rows.forEach(r => {
    console.log(`  • ${r.key}: ${r.value} (enabled: ${r.is_enabled})`);
  });

  const allCodes = await client.execute('SELECT * FROM invite_codes');
  console.log(`\n🎉 Verified ${allCodes.rows.length} Invite Codes in Turso Cloud:`);
  allCodes.rows.forEach(c => {
    console.log(`  • Passcode: ${c.code} (Active: ${c.is_active}, Max: ${c.max_uses})`);
  });

  console.log('=' .repeat(80));
}

migrateConfigsToDatabase().catch(err => {
  console.error('❌ Migration Failed:', err);
  process.exit(1);
});

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

async function testTursoConnection() {
  console.log('===================================================');
  console.log('🔍 Testing Turso Cloud SQLite Connection...');
  console.log('===================================================\n');

  if (!url || !authToken) {
    console.error('❌ Turso credentials missing in .env!');
    process.exit(1);
  }

  try {
    const client = createClient({ url, authToken });
    console.log(`✅ Connected to Turso DB: ${url}`);

    // Create test table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS turso_test (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.execute({
      sql: `INSERT INTO turso_test (id) VALUES (?) ON CONFLICT DO NOTHING;`,
      args: [`test_${Date.now()}`]
    });

    const res = await client.execute('SELECT COUNT(*) as count FROM turso_test;');
    console.log(`✅ Turso Database Query Success! Test records count: ${res.rows[0].count}`);

  } catch (err) {
    console.error(`❌ Turso Connection Error: ${err.message}`);
  }

  console.log('\n===================================================');
}

testTursoConnection();

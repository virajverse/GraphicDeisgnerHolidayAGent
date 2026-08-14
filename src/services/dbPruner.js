import db from '../db/database.js';

/**
 * Turso / SQLite Automatic Database Cache & Log Pruner
 * Cleans logs & temporary web search cache older than 30 days to keep Turso DB running ultra-fast.
 */
export function pruneDatabaseCache(retentionDays = 30) {
  try {
    const pruneStmt = db.prepare(`
      DELETE FROM agent_logs 
      WHERE run_time < datetime('now', '-' || ? || ' days')
    `);
    const result = pruneStmt.run(retentionDays);
    console.log(`[DBPruner] 🧹 Pruned ${result.changes || 0} old log entries older than ${retentionDays} days.`);
    return result.changes || 0;
  } catch (err) {
    console.warn(`[DBPruner] Prune warning: ${err.message}`);
    return 0;
  }
}

import db from '../db/database.js';

/**
 * Turso Cloud / SQLite Database Cache Pruning Engine (TypeScript)
 * Purges execution logs older than retentionDays
 */
export function pruneDatabaseCache(retentionDays = 30): { pruned: boolean; retentionDays: number } {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    db.prepare('DELETE FROM agent_logs WHERE run_time < ?').run(cutoffISO);
    console.log(`[DBPruner] 🧹 Purged agent_logs older than ${retentionDays} days (before ${cutoffISO}).`);
    return { pruned: true, retentionDays };
  } catch (err: any) {
    console.warn(`[DBPruner] ⚠️ Database prune warning: ${err.message}`);
    return { pruned: false, retentionDays };
  }
}

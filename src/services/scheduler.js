import cron from 'node-cron';
import db from '../db/database.js';
import { calculateEventScore } from './relevanceEngine.js';
import { fetchRealWorldContext } from './contextEngine.js';
import { generateCreativeIdeas } from './ideationEngine.js';
import { formatTelegramAlertMessage } from './telegramBot.js';

/**
 * Scheduler & Orchestrator Engine
 * Periodically checks for upcoming events, scores relevance, synthesizes context,
 * generates 5-6 creative ideas, and issues Telegram alerts.
 */

export function initScheduler(telegramBot = null) {
  console.log('[Scheduler] Initializing T-2 Daily Event Scheduler...');

  // Daily cron job running at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Running daily scheduled event scan at 08:00 AM...');
    await runEventCheckAndAlert(telegramBot);
  });
}

export async function runEventCheckAndAlert(telegramBot = null, forcedEventId = null) {
  const startTime = Date.now();
  console.log('[Scheduler] Executing event scan & briefing engine...');

  const user = db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
  const clients = db.prepare("SELECT * FROM clients WHERE user_id = 'default_user'").all();

  // Determine current date and T-2 target date string (MM-DD)
  const today = new Date();
  const leadDays = user ? user.notification_lead_days : 2;

  // Calculate target date (Today + leadDays)
  const targetDateObj = new Date(today);
  targetDateObj.setDate(today.getDate() + leadDays);
  const monthStr = String(targetDateObj.getMonth() + 1).padStart(2, '0');
  const dayStr = String(targetDateObj.getDate()).padStart(2, '0');
  const targetDateMMDD = `${monthStr}-${dayStr}`;

  console.log(`[Scheduler] Scanning events matching date: ${targetDateMMDD} (T-${leadDays} days)...`);

  let targetEvents = [];
  if (forcedEventId) {
    targetEvents = db.prepare('SELECT * FROM events WHERE id = ?').all(forcedEventId);
  } else {
    // Search events matching target date OR high importance events if forced test
    targetEvents = db.prepare('SELECT * FROM events WHERE date = ? AND is_active = 1').all(targetDateMMDD);

    // If no exact T-2 match found for today in demo environment, fallback to next immediate high importance event
    if (targetEvents.length === 0) {
      console.log('[Scheduler] No exact date match for today. Picking top upcoming event for briefing demo.');
      targetEvents = db.prepare('SELECT * FROM events WHERE is_active = 1 ORDER BY importance DESC LIMIT 1').all();
    }
  }

  let alertsSentCount = 0;
  const processedAlerts = [];

  for (const event of targetEvents) {
    // 1. Calculate relevance score
    const client = clients.length > 0 ? clients[0] : null;
    const scoreEval = calculateEventScore(event, user, client);

    if (!scoreEval.shouldAlert) {
      console.log(`[Scheduler] Skipping event "${event.name}" (Score: ${scoreEval.score} < Threshold: ${scoreEval.threshold})`);
      continue;
    }

    // 2. Anti-spam check: check if alert already generated today for this event
    const todayISO = new Date().toISOString().split('T')[0];
    const existingAlert = db.prepare('SELECT id FROM alerts WHERE event_id = ? AND trigger_date = ?').get(event.id, todayISO);

    if (existingAlert && !forcedEventId) {
      console.log(`[Scheduler] Anti-spam trigger: Alert for "${event.name}" already generated today. Skipping duplicate.`);
      continue;
    }

    // 3. Synthesize Real-World Context
    const context = await fetchRealWorldContext(event);

    // 4. Generate 5-6 Creative Ideas & Recommendations
    const ideation = await generateCreativeIdeas({
      event,
      context,
      userProfile: user,
      clientProfile: client
    });

    // 5. Store Alert in SQLite Database
    const alertId = `alt_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    db.prepare(`
      INSERT INTO alerts (id, user_id, event_id, client_id, trigger_date, relevance_score, real_world_context, sources_json, recommended_ideas, status, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      alertId,
      user.id,
      event.id,
      client ? client.id : null,
      todayISO,
      scoreEval.score,
      context.summary,
      JSON.stringify(context.sources || []),
      JSON.stringify(ideation.recommendation),
      'GENERATED'
    );

    // 6. Insert Ideas into Database
    const insertIdeaStmt = db.prepare(`
      INSERT INTO creative_ideas (id, alert_id, event_id, user_id, client_id, category, title, concept, visual_direction, headline, platform, audience, difficulty, priority, reasoning)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    ideation.ideas.forEach((idea, idx) => {
      const ideaId = `idea_${alertId}_${idx + 1}`;
      insertIdeaStmt.run(
        ideaId,
        alertId,
        event.id,
        user.id,
        client ? client.id : null,
        idea.category,
        idea.title,
        idea.concept,
        idea.visual_direction,
        idea.headline,
        idea.platform,
        idea.audience || 'General',
        idea.difficulty || 'Medium',
        idx + 1,
        idea.why_it_works || ''
      );
    });

    // 7. Format Telegram Message
    const formattedMsg = formatTelegramAlertMessage(event, { eventId: event.id, relevanceScore: scoreEval.score }, context, ideation);

    // 8. Deliver via Telegram Bot if available & user has chat ID
    if (telegramBot && user.telegram_chat_id && user.telegram_chat_id !== 'demo_chat_123') {
      try {
        await telegramBot.sendMessage(user.telegram_chat_id, formattedMsg, { parse_mode: 'Markdown' });
        db.prepare("UPDATE alerts SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(alertId);
        alertsSentCount++;
      } catch (err) {
        console.error(`[Scheduler] Telegram dispatch error: ${err.message}`);
        db.prepare("UPDATE alerts SET status = 'FAILED' WHERE id = ?").run(alertId);
      }
    } else {
      // Mark as SENT in web sandbox mode
      db.prepare("UPDATE alerts SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(alertId);
      alertsSentCount++;
    }

    processedAlerts.push({
      alertId,
      event,
      scoreEval,
      context,
      ideation,
      formattedMessage: formattedMsg
    });
  }

  const durationMs = Date.now() - startTime;

  // Log Execution metrics into agent_logs table
  db.prepare(`
    INSERT INTO agent_logs (events_checked, events_found, alerts_sent, duration_ms, status, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    targetEvents.length,
    processedAlerts.length,
    alertsSentCount,
    durationMs,
    'SUCCESS',
    `Checked ${targetEvents.length} events, generated ${processedAlerts.length} briefs in ${durationMs}ms.`
  );

  console.log(`[Scheduler] Scan complete in ${durationMs}ms. ${alertsSentCount} alerts generated.`);
  return {
    eventsChecked: targetEvents.length,
    alertsGenerated: processedAlerts.length,
    durationMs,
    processedAlerts
  };
}

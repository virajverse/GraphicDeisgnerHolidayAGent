import cron from 'node-cron';
import db from '../db/database.js';
import { calculateEventScore } from './relevanceEngine.js';
import { fetchRealWorldContext } from './contextEngine.js';
import { generateCreativeIdeas } from './ideationEngine.js';
import { formatTelegramAlertMessage } from './telegramBot.js';
import { EventRecord, UserRecord, ClientRecord } from '../types/database.js';

/**
 * Ahead-of-Time Strategic Scheduler Engine (TypeScript)
 * Periodically checks for upcoming festivals/events (T-2 to T-3 Days in advance),
 * synthesizes real-world context, generates 6 creative concepts, and dispatches
 * automated morning briefings to all active designers at 8:00 AM IST.
 */

export function initScheduler(telegramBot: any = null) {
  console.log('[Scheduler] Initializing T-2 Daily Event Scheduler (Timezone: Asia/Kolkata)...');

  // Daily cron job running at 08:00 AM IST (Indian Standard Time)
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] ⏰ Running daily scheduled morning radar scan at 08:00 AM IST...');
    await runEventCheckAndAlert(telegramBot);
  }, {
    timezone: 'Asia/Kolkata'
  });
}

export async function runEventCheckAndAlert(telegramBot: any = null, forcedEventId: string | null = null) {
  const startTime = Date.now();
  console.log('[Scheduler] 🚀 Executing ahead-of-time event scan & briefing engine...');

  const activeUsers: UserRecord[] = db.prepare("SELECT * FROM users WHERE is_approved = 1").all();
  if (activeUsers.length === 0) {
    activeUsers.push(db.prepare("SELECT * FROM users WHERE id = 'default_user'").get() || {
      id: 'default_user',
      name: 'Designer',
      telegram_chat_id: '1634951702',
      is_approved: 1,
      role: 'ADMIN'
    });
  }

  const today = new Date();
  const leadDays = 2; // T-2 Days ahead of time standard

  const targetDateObj = new Date(today);
  targetDateObj.setDate(today.getDate() + leadDays);
  const monthStr = String(targetDateObj.getMonth() + 1).padStart(2, '0');
  const dayStr = String(targetDateObj.getDate()).padStart(2, '0');
  const targetDateMMDD = `${monthStr}-${dayStr}`;

  console.log(`[Scheduler] 📅 Scanning opportunities matching date: ${targetDateMMDD} (T-${leadDays} days lead time)...`);

  let targetEvents: EventRecord[] = [];
  if (forcedEventId) {
    targetEvents = db.prepare('SELECT * FROM events WHERE id = ?').all(forcedEventId);
  } else {
    targetEvents = db.prepare('SELECT * FROM events WHERE date = ? AND is_active = 1').all(targetDateMMDD);
    if (targetEvents.length === 0) {
      console.log('[Scheduler] No exact date match for today. Picking top upcoming high-priority event.');
      targetEvents = db.prepare('SELECT * FROM events WHERE is_active = 1 ORDER BY importance DESC LIMIT 1').all();
    }
  }

  let alertsSentCount = 0;
  const processedAlerts: any[] = [];

  for (const event of targetEvents) {
    const clients: ClientRecord[] = db.prepare("SELECT * FROM clients").all();
    const client = clients.length > 0 ? clients[0] : null;

    const todayISO = new Date().toISOString().split('T')[0];
    const existingAlert = db.prepare('SELECT id FROM alerts WHERE event_id = ? AND trigger_date = ?').get(event.id, todayISO);

    if (existingAlert && !forcedEventId) {
      console.log(`[Scheduler] Anti-spam trigger: Briefing for "${event.name}" already generated today. Skipping duplicate.`);
      continue;
    }

    const context = await fetchRealWorldContext(event);
    const ideation = await generateCreativeIdeas({
      event,
      context,
      userProfile: activeUsers[0],
      clientProfile: client
    });

    const alertId = `alt_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    db.prepare(`
      INSERT INTO alerts (id, user_id, event_id, client_id, trigger_date, relevance_score, real_world_context, sources_json, recommended_ideas, status, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      alertId,
      activeUsers[0].id,
      event.id,
      client ? client.id : null,
      todayISO,
      event.importance || 85,
      context.summary,
      JSON.stringify(context.sources || []),
      JSON.stringify(ideation.recommendation),
      'GENERATED'
    );

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
        activeUsers[0].id,
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

    const formattedMsg = formatTelegramAlertMessage(event, { eventId: event.id, relevanceScore: event.importance || 85 }, context, ideation);

    // Multi-User Dispatch to All Approved Designers
    for (const u of activeUsers) {
      if (telegramBot && u.telegram_chat_id && u.telegram_chat_id !== 'demo_chat_123') {
        try {
          await telegramBot.sendMessage(u.telegram_chat_id, `🌅 *[MORNING RADAR BRIEF]*\n\n${formattedMsg}`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🎨 Visual Specs (Colors & Fonts)', callback_data: `specs_${event.id}` },
                  { text: '⭐ Save Briefing', callback_data: `fb_save_${event.id}` }
                ],
                [
                  { text: '🔄 New Ideas', callback_data: `gen_evt_${event.name}` },
                  { text: '👍 Useful', callback_data: `fb_like_${event.id}` },
                  { text: '👎 Dislike', callback_data: `fb_dislike_${event.id}` }
                ]
              ]
            }
          });
          alertsSentCount++;
        } catch (err: any) {
          console.warn(`[Scheduler] Dispatch error for user ${u.telegram_chat_id}: ${err.message}`);
        }
      }
    }

    db.prepare("UPDATE alerts SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(alertId);

    processedAlerts.push({
      alertId,
      event,
      context,
      ideation,
      formattedMessage: formattedMsg
    });
  }

  const durationMs = Date.now() - startTime;

  db.prepare(`
    INSERT INTO agent_logs (events_checked, events_found, alerts_sent, duration_ms, status, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    targetEvents.length,
    processedAlerts.length,
    alertsSentCount,
    durationMs,
    'SUCCESS',
    `Checked ${targetEvents.length} events, dispatched to ${activeUsers.length} active designers in ${durationMs}ms.`
  );

  console.log(`[Scheduler] Scan complete in ${durationMs}ms. ${alertsSentCount} briefings delivered.`);
  return {
    eventsChecked: targetEvents.length,
    alertsGenerated: processedAlerts.length,
    durationMs,
    processedAlerts
  };
}

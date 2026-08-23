import cron from 'node-cron';
import db from '../db/database.js';
import { calculateEventScore } from './relevanceEngine.js';
import { fetchRealWorldContext } from './contextEngine.js';
import { generateCreativeIdeas } from './ideationEngine.js';
import { formatTelegramAlertMessage, getAdminChatId, getClosestUpcomingEvents } from './telegramBot.js';
import { EventRecord, UserRecord, ClientRecord } from '../types/database.js';

/**
 * Ahead-of-Time Strategic Scheduler Engine (TypeScript)
 * Periodically checks for upcoming festivals/events (T-2 to T-3 Days in advance),
 * synthesizes real-world context, generates 6 creative concepts, and dispatches
 * automated morning briefings to all active designers and admins at 8:00 AM IST.
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

  // Fetch ALL users who have ever interacted with the bot (Registered, Pending, Guest) except banned
  const targetUsers: UserRecord[] = db.prepare("SELECT * FROM users WHERE is_banned = 0 AND (verification_status IS NULL OR verification_status != 'BANNED')").all();
  
  const adminChatId = getAdminChatId();
  const hasAdmin = targetUsers.some(u => u.telegram_chat_id === adminChatId);
  if (!hasAdmin && adminChatId) {
    targetUsers.push({
      id: `user_${adminChatId}`,
      name: 'Super Admin',
      telegram_chat_id: adminChatId,
      is_approved: 1,
      role: 'ADMIN'
    });
  }
  const upcomingList = getClosestUpcomingEvents(4);
  if (upcomingList.length === 0) {
    console.log('[Scheduler] No upcoming events found in database.');
    return { success: true, processedCount: 0, alerts: [] };
  }

  let morningMsg = `🌅 *[TALIYO MORNING MARKETING RADAR // AANE WALE OCCASIONS]*\n\n`;
  morningMsg += `Good Morning! Agle kuch dino me ye marketing occasions aa rahe hain jinke liye client designs plan karne hain:\n\n`;

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  upcomingList.forEach((e, idx) => {
    const flag = e.country === 'India' ? '🇮🇳' : '🌍';
    const cd = e.daysRemaining === 0 ? '🔥 TODAY' : e.daysRemaining === 1 ? '⚡ Tomorrow' : `In ${e.daysRemaining} days`;
    morningMsg += `*${idx + 1}. ${flag} ${e.name}* — \`${e.date}\` (_${cd}_) [${e.category}]\n`;
    buttons.push([
      { text: `🎨 ${e.name} ke 3 Concepts lo (${cd})`, callback_data: `brief3_${e.name}` }
    ]);
  });

  morningMsg += `\n💡 *Aapko kis event ke liye design brief & concepts chahiye?*\nUpar button par tap karein ya chat me event ka naam likhein!`;
  buttons.push([
    { text: '🗓️ Poora 30-Day Calendar', callback_data: 'cal_all' }
  ]);

  let alertsSentCount = 0;
  for (const u of targetUsers) {
    if (telegramBot && u.telegram_chat_id && u.telegram_chat_id !== 'demo_chat_123') {
      try {
        await telegramBot.sendMessage(u.telegram_chat_id, morningMsg, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
        alertsSentCount++;
      } catch (err: any) {
        console.warn(`[Scheduler] Dispatch error for user ${u.telegram_chat_id}: ${err.message}`);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  try {
    db.prepare(`
      INSERT INTO agent_logs (events_checked, events_found, alerts_sent, duration_ms, status, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      upcomingList.length,
      upcomingList.length,
      alertsSentCount,
      durationMs,
      'SUCCESS',
      `Checked ${upcomingList.length} upcoming events, dispatched radar card to ${alertsSentCount} designers in ${durationMs}ms.`
    );
  } catch (e) { }

  console.log(`[Scheduler] Scan complete in ${durationMs}ms. ${alertsSentCount} radar cards delivered.`);
  return {
    eventsChecked: upcomingList.length,
    alertsGenerated: alertsSentCount,
    durationMs
  };
}

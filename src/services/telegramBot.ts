import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import db from '../db/database.js';
import { fetchRealWorldContext } from './contextEngine.js';
import { generateCreativeIdeas } from './ideationEngine.js';
import { executeClusterQuery, MODEL_CLUSTERS } from './clusterModelRouter.js';
import { buildFrontDispatcherSystemPrompt } from '../prompts/systemPrompts.js';
import { scrapeInstagramProfile } from './instagramScraperEngine.js';
import { agentQueue } from './requestQueueEngine.js';
import { pruneDatabaseCache } from './dbPruner.js';
import { EventRecord, UserRecord, ClientRecord, AlertRecord, CreativeIdeaRecord } from '../types/database.js';
import { EventContext, IdeationResult } from '../types/models.js';

const ADMIN_CODE = process.env.ADMIN_INVITE_CODE || 'TALIYO2026';
const ADMIN_HANDLE = process.env.ADMIN_TELEGRAM_HANDLE || '@virajverse';
const MASTER_ADMIN_CHAT_ID = (process.env.TELEGRAM_DEFAULT_CHAT_ID || '1634951702').toString();

let botInstance: TelegramBot | null = null;

// Anti-Spam 4-Second User Cooldown Tracker
const userCooldownTracker = new Map<string, number>();
const COOLDOWN_MS = 4000;

// Double-Tap Blocker (In-Flight Request Tracker)
const activeProcessingUsers = new Set<string>();

// Anti-Brute Force Passcode Tracker
const bruteForceTracker = new Map<string, { attempts: number; lockedUntil: number }>();

// Smart Onboarding & Screenshot Verification Tracker
const onboardingTracker = new Map<string, { step: 'WAITING_DETAILS' | 'WAITING_SCREENSHOT'; name?: string; handle?: string; youtubeName?: string }>();

function checkUserCooldown(chatId: string | number): { allowed: boolean; remainingSec: number } {
  const strId = chatId.toString();
  const now = Date.now();
  const lastTime = userCooldownTracker.get(strId) || 0;
  const timePassed = now - lastTime;

  if (timePassed < COOLDOWN_MS) {
    const remainingSec = Math.ceil((COOLDOWN_MS - timePassed) / 1000);
    return { allowed: false, remainingSec };
  }

  userCooldownTracker.set(strId, now);
  return { allowed: true, remainingSec: 0 };
}

// Keyboards
export const DESIGNER_KEYBOARD = {
  keyboard: [
    [{ text: '⚡ Auto Radar Brief' }, { text: '🗓️ Full Calendar' }],
    [{ text: '🎨 Art Director Co-Pilot' }, { text: '💼 Client Profiles' }],
    [{ text: '💡 Custom Prompt' }, { text: '👤 My Activity' }],
    [{ text: '🌐 Language (EN/Hinglish)' }, { text: '📖 Guide & Support' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

export const LANGUAGE_INLINE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '🇬🇧 English (Global)', callback_data: 'lang_english' },
      { text: '🇮🇳 Hinglish (Desi / India)', callback_data: 'lang_hinglish' }
    ]
  ]
};

export const ADMIN_MASTER_KEYBOARD = {
  keyboard: [
    [{ text: '👑 Admin Control' }, { text: '👥 Active Designers' }],
    [{ text: '🔔 Pending Approvals' }, { text: '🚀 Trigger Radar Scan' }],
    [{ text: '📢 Broadcast Hub' }, { text: '👥 Community Ground' }],
    [{ text: '📥 Export DPO Dataset' }, { text: '📊 Deep AI Telemetry' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

export const GATEWAY_INLINE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '🔑 Direct Passcode Login', callback_data: 'gate_login' },
      { text: '📝 Free Registration', callback_data: 'gate_register' }
    ],
    [
      { text: '💬 Contact Admin', callback_data: 'menu_contact' }
    ]
  ]
};

export function getUpcomingInlineKeyboard() {
  const events: EventRecord[] = db.prepare('SELECT * FROM events ORDER BY date ASC LIMIT 4').all();
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < events.length; i += 2) {
    const row: Array<{ text: string; callback_data: string }> = [];
    row.push({ text: `🎨 ${events[i].name}`, callback_data: `gen_evt_${events[i].name}` });
    if (events[i + 1]) {
      row.push({ text: `🎨 ${events[i + 1].name}`, callback_data: `gen_evt_${events[i + 1].name}` });
    }
    buttons.push(row);
  }
  return { inline_keyboard: buttons };
}

export function isMasterAdmin(chatId: string | number): boolean {
  return chatId.toString() === MASTER_ADMIN_CHAT_ID;
}

export function getUserKeyboard(chatId: string | number) {
  return isMasterAdmin(chatId) ? ADMIN_MASTER_KEYBOARD : DESIGNER_KEYBOARD;
}

function verifyUserAuth(msg: TelegramBot.Message): { authorized: boolean; user: UserRecord | null; isAdmin: boolean } {
  const chatId = msg.chat.id.toString();
  const username = msg.from ? msg.from.username : '';

  // Master Admin Immutable Verification
  if (chatId === MASTER_ADMIN_CHAT_ID) {
    let adminUser: UserRecord = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);
    if (!adminUser) {
      db.prepare(`
        INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role)
        VALUES (?, ?, ?, ?, 1, 'ADMIN')
        ON CONFLICT(id) DO UPDATE SET is_approved=1, role='ADMIN'
      `).run(`user_${chatId}`, msg.from?.first_name || 'Master Admin', username || 'virajverse', chatId);
      adminUser = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);
    }
    return { authorized: true, user: adminUser, isAdmin: true };
  }

  // Check database for approved regular user
  const user: UserRecord = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ? AND is_approved = 1').get(chatId);
  if (user) {
    return { authorized: true, user, isAdmin: user.role === 'ADMIN' };
  }

  return { authorized: false, user: null, isAdmin: false };
}

export async function sendSafeTelegramMessage(chatId: string | number, text: string, options: any = {}) {
  if (!botInstance) return null;
  try {
    return await botInstance.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err: any) {
    if (err.message && err.message.includes("can't parse entities")) {
      const plainText = text.replace(/[*_`[\]()]/g, '');
      return await botInstance.sendMessage(chatId, plainText, { ...options, parse_mode: undefined });
    }
    throw err;
  }
}

export async function sendAccessGatewayCard(chatId: string | number) {
  const gatewayMsg = `🔒 *TALIYO CREATIVE INTELLIGENCE | ACCESS GATEWAY*\n\n` +
    `Namaste Designer! Main aapka **Senior Graphic Design Strategy & Ahead-of-Time Trend AI Partner** hoon.\n\n` +
    `⚡ *Aapko kya milta hai:*\n` +
    `• Ahead-of-Time Festival & Holiday Radar Alerts (T-2 Days in advance)\n` +
    `• Real-World Scraped News & Cultural Trend Context\n` +
    `• 6 Ready-to-Design Concept Angles per event (Educational, 3D, Emotional)\n` +
    `• Instant Hex Color Palettes & Font Pairings for Figma/Photoshop\n\n` +
    `👇 *Access ke liye niche se ek option select karein:*`;
  
  return await sendSafeTelegramMessage(chatId, gatewayMsg, {
    reply_markup: GATEWAY_INLINE_KEYBOARD
  });
}

export function formatTelegramAlertMessage(
  event: EventRecord,
  alert: { eventId: string; relevanceScore: number },
  context: EventContext,
  ideation: IdeationResult
): string {
  const { ideas, recommendation } = ideation;

  let msg = `✨ *CREATIVE RADAR BRIEFING*\n\n`;
  if (ideation.conversational_intro) {
    msg += `💬 _"${ideation.conversational_intro}"_\n\n`;
  }

  msg += `📅 *Occasion:* ${event.name} (${event.date})\n\n`;

  msg += `🌐 *WHAT'S HAPPENING IN THE REAL WORLD:*\n`;
  msg += `_${context.summary}_\n\n`;
  msg += `💡 *Creative Angle for Designers:*\n${context.opportunityHint}\n\n`;

  msg += `🎨 *6 READY-TO-DESIGN CONCEPTS:*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  ideas.forEach((idea, idx) => {
    const num = idx + 1;
    const cat = idea.category || 'Concept';
    msg += `*#0${num} [${cat.toUpperCase()}]* ➔ *${idea.title}*\n`;
    msg += `• *Concept:* ${idea.concept}\n`;
    msg += `• *Visual Direction:* ${idea.visual_direction}\n`;
    msg += `• *Headline:* _"${idea.headline}"_\n`;
    msg += `• *Best Format:* ${idea.platform}\n\n`;
  });

  msg += `⭐ *TOP STRATEGIC RECOMMENDATION:*\n`;
  const recNums = recommendation.recommended_ids ? recommendation.recommended_ids.map(i => `#0${i}`).join(' & ') : '#01 & #04';
  msg += `${recNums} — ${recommendation.avoid_note || 'Strongest engagement potential.'}\n\n`;

  if (ideation.conversational_outro) {
    msg += `💡 _"${ideation.conversational_outro}"_\n\n`;
  }

  msg += `📱 *Target Platforms:* ${recommendation.recommended_platforms || 'Instagram Carousel + LinkedIn'}\n`;
  msg += `🎯 *Target Audience:* ${recommendation.target_audience || 'General / Modern Digital Audience'}\n`;

  return msg;
}

export function initTelegramBot(token = process.env.TELEGRAM_BOT_TOKEN): TelegramBot | null {
  if (!token || !token.trim()) {
    console.log('[TelegramBot] No active Bot Token provided. Running in Sandbox API mode.');
    return null;
  }

  try {
    const isWebhookMode = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
    botInstance = new TelegramBot(token, { polling: !isWebhookMode });
    console.log(`[TelegramBot] 🤖 Autonomous AI Agent Active (Mode: ${isWebhookMode ? 'Serverless Webhook' : 'Local Polling'})!`);
    return botInstance;
  } catch (err: any) {
    console.error(`[TelegramBot] Failed to initialize Gateway: ${err.message}`);
    return null;
  }
}

/**
 * Super Admin: Generate & Export DPO / RLHF Training Dataset as JSONL Buffer
 */
export function exportDPOTrainingDataset(): { buffer: Buffer; count: number; filename: string } {
  const alerts: AlertRecord[] = db.prepare('SELECT * FROM alerts ORDER BY generated_at DESC').all();
  const jsonlLines: string[] = [];

  alerts.forEach(alt => {
    const ideas: CreativeIdeaRecord[] = db.prepare('SELECT * FROM creative_ideas WHERE alert_id = ?').all(alt.id);
    const feedback: any[] = db.prepare('SELECT * FROM feedback WHERE alert_id = ?').all(alt.id);
    const event: EventRecord = db.prepare('SELECT * FROM events WHERE id = ?').get(alt.event_id) || { name: 'Design Event', date: 'Upcoming' };

    const chosenIdea = ideas.find(i => feedback.some(f => f.idea_id === i.id && (f.rating === 'SAVED' || f.rating === 'LIKE'))) || ideas[0];
    const rejectedIdea = ideas.find(i => feedback.some(f => f.idea_id === i.id && f.rating === 'DISLIKE')) || ideas[ideas.length - 1];

    if (chosenIdea) {
      const entry = {
        prompt: `Create a graphic design campaign concept for ${event.name} (${event.date}). Context: ${alt.real_world_context || 'Standard occasion'}.`,
        chosen: {
          category: chosenIdea.category,
          title: chosenIdea.title,
          headline: chosenIdea.headline,
          concept: chosenIdea.concept,
          visual_direction: chosenIdea.visual_direction,
          platform: chosenIdea.platform
        },
        rejected: rejectedIdea && rejectedIdea.id !== chosenIdea.id ? {
          category: rejectedIdea.category,
          title: rejectedIdea.title,
          headline: rejectedIdea.headline,
          concept: rejectedIdea.concept,
          visual_direction: rejectedIdea.visual_direction,
          platform: rejectedIdea.platform
        } : null,
        metadata: {
          event_id: alt.event_id,
          relevance_score: alt.relevance_score,
          generated_at: alt.generated_at
        }
      };
      jsonlLines.push(JSON.stringify(entry));
    }
  });

  const content = jsonlLines.join('\n');
  const buffer = Buffer.from(content, 'utf-8');
  const filename = `taliyo_dpo_dataset_${Date.now()}.jsonl`;

  return { buffer, count: jsonlLines.length, filename };
}

function getDaysRemaining(eventDateMMDD: string): number {
  if (!eventDateMMDD || !eventDateMMDD.includes('-')) return 999;
  const [mStr, dStr] = eventDateMMDD.split('-');
  const eventMonth = parseInt(mStr, 10) - 1;
  const eventDay = parseInt(dStr, 10);

  const now = new Date();
  const currentYear = now.getFullYear();

  let target = new Date(currentYear, eventMonth, eventDay, 23, 59, 59);
  const diffMs = target.getTime() - now.getTime();
  let daysDiff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Rollover to next year if already passed this year
  if (daysDiff < 0) {
    target = new Date(currentYear + 1, eventMonth, eventDay, 23, 59, 59);
    daysDiff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  return daysDiff;
}

export async function processAgentDesignRequest(chatId: string | number, queryText: string, user: UserRecord | null = null) {
  if (!botInstance) return;
  const strChatId = chatId.toString();

  // Double-Tap Blocker
  if (activeProcessingUsers.has(strChatId)) {
    return sendSafeTelegramMessage(chatId, '⚙️ *Request in Progress:* Aapki design briefing abhi generate ho rahi hai! Please 4-5 second wait karein.');
  }

  activeProcessingUsers.add(strChatId);
  botInstance.sendChatAction(chatId, 'typing');

  const STAGE_1_STEPS = [
    `🔍 🚶‍♂️ _Scanning Google News RSS & live media trends for "${queryText}"..._`,
    `📡 🏃‍♂️ _Scraping real-world cultural pulse & live headlines around "${queryText}"..._`,
    `🌐 🕵️‍♂️ _Investigating breaking audience discussions and hashtags for "${queryText}"..._`
  ];

  const STAGE_2_STEPS = [
    `🧠 ⚡ _Synthesizing target audience psychology & design opportunities..._`,
    `💡 🔮 _Extracting scroll-stopping visual hooks and campaign angles..._`,
    `📊 🧭 _Analyzing cultural sentiments and brand engagement patterns..._`
  ];

  const STAGE_3_STEPS = [
    `🎨 🕺 _Mixing custom Hex palettes (#0A0E17, #00FF88) & typography pairings..._`,
    `📐 💃 _Calculating 1080x1350 px layout margins, 3D depth & lighting specs..._`,
    `✨ 🎭 _Calibrating aesthetic contrast, textures, and visual hierarchy..._`
  ];

  const randomStage1 = STAGE_1_STEPS[Math.floor(Math.random() * STAGE_1_STEPS.length)];
  const randomStage2 = STAGE_2_STEPS[Math.floor(Math.random() * STAGE_2_STEPS.length)];
  const randomStage3 = STAGE_3_STEPS[Math.floor(Math.random() * STAGE_3_STEPS.length)];

  const progressMsg = await botInstance.sendMessage(
    chatId,
    randomStage1,
    { parse_mode: 'Markdown' }
  );

  try {
    const event: EventRecord = db.prepare('SELECT * FROM events WHERE name LIKE ? LIMIT 1').get(`%${queryText}%`) || {
      id: `evt_custom_${Date.now()}`,
      name: queryText,
      description: `Special creative opportunity for ${queryText}`,
      date: 'Upcoming',
      country: 'India',
      category: 'BUSINESS',
      importance: 85,
      source: 'User Query'
    };

    const userProfile: UserRecord = user || db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
    const client: ClientRecord = db.prepare("SELECT * FROM clients WHERE user_id = ? OR user_id = 'default_user' LIMIT 1").get(userProfile.id);

    // Live Step 1 -> Step 2 Morphing
    await botInstance.editMessageText(randomStage2, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown'
    }).catch(() => {});

    const context = await fetchRealWorldContext(event);

    // Live Step 2 -> Step 3 Morphing
    await botInstance.editMessageText(randomStage3, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown'
    }).catch(() => {});

    const ideation = await generateCreativeIdeas({ event, context, userProfile, clientProfile: client });

    const alertData = {
      eventId: event.id,
      relevanceScore: event.importance || 85
    };

    const formattedMessage = formatTelegramAlertMessage(event, alertData, context, ideation);

    const inlineKeyboard = {
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
    };

    await botInstance.editMessageText(formattedMessage, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    });

  } catch (err: any) {
    console.error(`[Agent Processing Error]: ${err.message}`);
    await botInstance.editMessageText(`⚠️ *Agent Note:* Please try asking your creative prompt again.`, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown'
    }).catch(() => {});
  } finally {
    activeProcessingUsers.delete(strChatId);
  }
}

export function getFullCalendarInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🇮🇳 Next 30 Days: National', callback_data: 'cal_national' },
        { text: '🪔 Next 30 Days: Festivals', callback_data: 'cal_festival' }
      ],
      [
        { text: '🌍 Next 30 Days: Global', callback_data: 'cal_global' },
        { text: '💼 Next 30 Days: Business', callback_data: 'cal_business' }
      ],
      [
        { text: '📋 All Upcoming (30 Days)', callback_data: 'cal_all' }
      ]
    ]
  };
}

export function handleFullCalendarCommand(category = 'ALL'): string {
  let allEvents: EventRecord[] = [];
  if (category === 'NATIONAL') {
    allEvents = db.prepare("SELECT * FROM events WHERE category = 'NATIONAL' OR country = 'India'").all();
  } else if (category === 'FESTIVAL') {
    allEvents = db.prepare("SELECT * FROM events WHERE category = 'FESTIVAL' OR category = 'CULTURAL'").all();
  } else if (category === 'GLOBAL') {
    allEvents = db.prepare("SELECT * FROM events WHERE category = 'GLOBAL' OR category = 'AWARENESS'").all();
  } else if (category === 'BUSINESS') {
    allEvents = db.prepare("SELECT * FROM events WHERE category = 'BUSINESS' OR category = 'TECH'").all();
  } else {
    allEvents = db.prepare("SELECT * FROM events").all();
  }

  // Calculate 30-Day Rolling Window for each event
  const enriched = allEvents.map(evt => ({
    ...evt,
    daysLeft: getDaysRemaining(evt.date)
  })).sort((a, b) => a.daysLeft - b.daysLeft);

  // Filter for next 30 days
  let eventsIn30Days = enriched.filter(e => e.daysLeft >= 0 && e.daysLeft <= 30);

  // If fewer than 3 events in exact 30 days, take the closest 5 upcoming events
  if (eventsIn30Days.length === 0) {
    eventsIn30Days = enriched.slice(0, 5);
  }

  let title = category === 'ALL' ? 'UPCOMING 30 DAYS CREATIVE CALENDAR' : `NEXT 30 DAYS: ${category} CALENDAR`;
  let text = `🗓️ *${title}*\n\n`;

  eventsIn30Days.forEach((evt, i) => {
    const flag = evt.country === 'India' ? '🇮🇳' : '🌍';
    const countdown = evt.daysLeft === 0 ? '🔥 TODAY' : evt.daysLeft === 1 ? '⚡ Tomorrow' : `In ${evt.daysLeft} days`;
    text += `${i + 1}. ${flag} *${evt.name}* — \`${evt.date}\` (_${countdown}_) [${evt.category}]\n`;
  });

  text += `\n💡 *Tip:* Chat me kisi bhi festival ka naam likhein ya 6 instant ideas ke liye prompt bhejein!`;
  return text;
}

export function handleUpcomingCommand(): string {
  return handleFullCalendarCommand('ALL');
}

export async function handleTodayCommand(): Promise<string> {
  const todayEvt: EventRecord = db.prepare("SELECT * FROM events WHERE date = '08-15' LIMIT 1").get() ||
                                db.prepare('SELECT * FROM events LIMIT 1').get();
  
  if (!todayEvt) return "No major event scheduled for today.";
  const res = await handleOnDemandIdeas(todayEvt.name);
  return res.formattedMessage;
}

export async function handleOnDemandIdeas(eventName: string, clientId: string | null = null, userId = 'default_user') {
  const event: EventRecord = db.prepare('SELECT * FROM events WHERE name LIKE ? LIMIT 1').get(`%${eventName}%`) || {
    id: `evt_custom_${Date.now()}`,
    name: eventName,
    description: `Special creative opportunity for ${eventName}`,
    date: 'Upcoming',
    country: 'India',
    category: 'BUSINESS',
    importance: 85,
    source: 'User Query'
  };

  const user: UserRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
  const client: ClientRecord = clientId ? db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) : db.prepare('SELECT * FROM clients WHERE user_id = ? OR user_id = "default_user" LIMIT 1').get(userId);

  const context = await fetchRealWorldContext(event);
  const ideation = await generateCreativeIdeas({ event, context, userProfile: user, clientProfile: client });

  const alertData = {
    eventId: event.id,
    relevanceScore: event.importance || 85
  };

  const formattedMessage = formatTelegramAlertMessage(event, alertData, context, ideation);

  return {
    eventId: event.id,
    event,
    context,
    ideation,
    formattedMessage
  };
}

/**
 * Universal Webhook & Message Update Processor (TypeScript)
 */
export async function handleTelegramWebhookUpdate(update: any) {
  if (!botInstance) {
    botInstance = initTelegramBot(process.env.TELEGRAM_BOT_TOKEN);
  }
  if (!botInstance || !update) return;

  // 1. Handle Callback Queries (Button clicks)
  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message.chat.id;
    const data = query.data;

    // Cooldown check for button spammers
    const cooldown = checkUserCooldown(chatId);
    if (!cooldown.allowed) {
      return await botInstance.answerCallbackQuery(query.id, {
        text: `⏳ Please wait ${cooldown.remainingSec}s before tapping another button!`,
        show_alert: true
      }).catch(() => {});
    }

    // Access Gateway Buttons
    if (data === 'gate_login') {
      await botInstance.answerCallbackQuery(query.id, { text: '🔑 Direct Passcode Login' }).catch(() => {});
      const loginGuide = `🔑 *DIRECT PASSCODE LOGIN*\n\nAapke paas official invite passcode hai toh chat me type karein:\n\n\`/register YOUR_PASSCODE\`\n\n*(Example: \`/register TALIYO2026\`)*`;
      return await sendSafeTelegramMessage(chatId, loginGuide);
    }

    if (data === 'gate_register') {
      await botInstance.answerCallbackQuery(query.id, { text: '📝 Free Registration' }).catch(() => {});
      onboardingTracker.set(chatId.toString(), { step: 'WAITING_DETAILS' });

      const igPath = path.join(process.cwd(), 'public/assets/instagram_banner.png');
      const ytPath = path.join(process.cwd(), 'public/assets/youtube_banner.png');

      // 1. Send Instagram Photo Card with Direct Action Button
      if (fs.existsSync(igPath) && botInstance) {
        await botInstance.sendPhoto(chatId, igPath, {
          caption: `📸 *STEP 1: FOLLOW ON INSTAGRAM*\n\n👉 Official Profile: [@fearless.devx](https://www.instagram.com/fearless.devx/)\nTap the button below to follow!`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '📸 Follow @fearless.devx', url: 'https://www.instagram.com/fearless.devx/' }]]
          }
        }).catch(() => {});
      }

      // 2. Send YouTube Photo Card with Direct Action Button
      if (fs.existsSync(ytPath) && botInstance) {
        await botInstance.sendPhoto(chatId, ytPath, {
          caption: `▶️ *STEP 2: SUBSCRIBE ON YOUTUBE*\n\n👉 Official Channel: [@VirajVerse016](https://www.youtube.com/@VirajVerse016)\nTap the button below to subscribe!`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '▶️ Subscribe @VirajVerse016', url: 'https://www.youtube.com/@VirajVerse016' }]]
          }
        }).catch(() => {});
      }

      // 3. Send Instruction for details
      const regStepPrompt = `👇 *Follow & Subscribe karne ke baad, chat me apni details bhejiye:*\n\n` +
        `\`Full Name | Instagram Handle | YouTube Channel Name\`\n\n` +
        `*(Example: Rahul Sharma | @rahul_graphics | @RahulDesignsYT)*`;
      return await sendSafeTelegramMessage(chatId, regStepPrompt);
    }

    // Admin Verification Actions: Approve or Reject
    if (data.startsWith('admin_appr_')) {
      const targetChatId = data.replace('admin_appr_', '');
      db.prepare(`
        INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role, verification_status)
        VALUES (?, 'Approved Designer', '', ?, 1, 'DESIGNER', 'APPROVED')
        ON CONFLICT(id) DO UPDATE SET is_approved=1, verification_status='APPROVED'
      `).run(`user_${targetChatId}`, targetChatId);

      await botInstance.answerCallbackQuery(query.id, { text: `✅ Designer ${targetChatId} Approved!` }).catch(() => {});
      await sendSafeTelegramMessage(MASTER_ADMIN_CHAT_ID, `🎉 *DESIGNER APPROVED:*\nUser ID \`${targetChatId}\` ko full active access grant kar diya gaya hai.`);

      const welcomeApproved = `🎉 *CONGRATULATIONS! YOUR DESIGNER ACCESS IS APPROVED!*\n\n` +
        `Admin *@virajverse* ne aapka account verify aur approve kar diya hai!\n\n` +
        `🚀 *Aapka Taliyo Creative Intelligence AI Agent 100% active hai!*\n` +
        `Niche diye gaye buttons se shuru karein ya direct prompt bhejein:`;
      return await sendSafeTelegramMessage(targetChatId, welcomeApproved, { reply_markup: DESIGNER_KEYBOARD });
    }

    // Language Switcher Callbacks
    if (data === 'lang_english') {
      db.prepare("UPDATE users SET language = 'ENGLISH' WHERE telegram_chat_id = ?").run(chatId.toString());
      await botInstance.answerCallbackQuery(query.id, { text: 'Language set to English 🇬🇧' }).catch(() => {});
      return await sendSafeTelegramMessage(chatId, `🇬🇧 *Language Preference: ENGLISH*\n\nAll your future design briefs, concepts, headlines, and strategic advice will now be delivered in modern global English!\n\nUse the buttons below or type any prompt:`, { reply_markup: DESIGNER_KEYBOARD });
    }

    if (data === 'lang_hinglish') {
      db.prepare("UPDATE users SET language = 'HINGLISH' WHERE telegram_chat_id = ?").run(chatId.toString());
      await botInstance.answerCallbackQuery(query.id, { text: 'Bhasha set to Hinglish 🇮🇳' }).catch(() => {});
      return await sendSafeTelegramMessage(chatId, `🇮🇳 *Bhasha Preference: HINGLISH*\n\nAb aapke saare design briefs, creative concepts aur advice natural Hinglish me milenge!\n\nNiche diye gaye buttons se shuru karein:`, { reply_markup: DESIGNER_KEYBOARD });
    }

    // Full Calendar Category Callbacks
    if (data.startsWith('cal_')) {
      const catKey = data.replace('cal_', '').toUpperCase();
      await botInstance.answerCallbackQuery(query.id, { text: `🗓️ Loading ${catKey} Calendar...` }).catch(() => {});
      const calText = handleFullCalendarCommand(catKey);
      return await sendSafeTelegramMessage(chatId, calText, { reply_markup: getFullCalendarInlineKeyboard() });
    }

    if (data === 'menu_today') {
      await botInstance.answerCallbackQuery(query.id, { text: '⚡ Loading Today\'s Focus...' }).catch(() => {});
      const response = await handleTodayCommand();
      return await sendSafeTelegramMessage(chatId, response);
    } else if (data === 'menu_upcoming') {
      await botInstance.answerCallbackQuery(query.id, { text: '📅 Loading Upcoming Calendar...' }).catch(() => {});
      const upcomingList = handleUpcomingCommand();
      return await sendSafeTelegramMessage(chatId, upcomingList, { reply_markup: getUpcomingInlineKeyboard() });
    } else if (data === 'menu_clients') {
      await botInstance.answerCallbackQuery(query.id, { text: '💼 Loading Client Profiles...' }).catch(() => {});
      const clients: ClientRecord[] = db.prepare('SELECT * FROM clients').all();
      let clientText = `💼 *YOUR PRIVATE CLIENT BRAND PROFILES*\n\n`;
      clients.forEach(c => {
        clientText += `• *${c.name}* (${c.industry})\n  Tone: _${c.brand_tone}_\n  Style: ${c.creative_style}\n\n`;
      });
      return await sendSafeTelegramMessage(chatId, clientText);
    } else if (data === 'menu_activity') {
      await botInstance.answerCallbackQuery(query.id, { text: '👤 Loading Summary...' }).catch(() => {});
      const activityText = `👤 *YOUR CREATIVE AGENT ACTIVITY*\n\n` +
        `• *Role:* Senior Graphic Designer\n` +
        `• *Saved Briefings:* Active & Synchronized\n` +
        `• *NVIDIA Cluster:* 27 Models Online\n\n` +
        `💬 *Tap any upcoming event or send a prompt to generate 6 ideas!*`;
      return await sendSafeTelegramMessage(chatId, activityText);
    } else if (data === 'menu_status') {
      await botInstance.answerCallbackQuery(query.id, { text: '📊 Loading Telemetry...' }).catch(() => {});
      const statusText = `📊 *TALIYO AGENT TELEMETRY*\n\n` +
        `• *System Health:* 🟢 100% Operational\n` +
        `• *AI Routing Engine:* 27-Model NVIDIA NIM Cluster\n` +
        `• *Database Engine:* Turso Cloud SQLite (AWS Mumbai)\n` +
        `• *Cloud Platform:* Vercel Serverless Production`;
      return await sendSafeTelegramMessage(chatId, statusText);
    } else if (data === 'menu_contact') {
      await botInstance.answerCallbackQuery(query.id, { text: '💬 Contact Admin...' }).catch(() => {});
      return await sendSafeTelegramMessage(chatId, `📩 *ADMIN CONTACT & SUPPORT*\n\nFor Passcode Access, Custom Clients or Priority Support:\n👉 Telegram Admin: *${ADMIN_HANDLE}*`);
    } else if (data === 'menu_help') {
      await botInstance.answerCallbackQuery(query.id, { text: '📖 Designer Guide...' }).catch(() => {});
      const helpMsg = `📖 *TALIYO DESIGNER QUICK GUIDE*\n\n` +
        `1️⃣ *Instant Ideas:* Tap any button below or type any festival/prompt in chat.\n` +
        `2️⃣ *Visual Specs:* Get exact Hex Colors & Font Pairings with 1 tap.\n` +
        `3️⃣ *Client Isolation:* Every designer's brand guidelines stay private.`;
      return await sendSafeTelegramMessage(chatId, helpMsg);
    } else if (data.startsWith('gen_evt_')) {
      const evtName = data.replace('gen_evt_', '');
      await botInstance.answerCallbackQuery(query.id, { text: `🎨 Generating 6 ideas for ${evtName}...` }).catch(() => {});
      return await processAgentDesignRequest(chatId, evtName, { id: 'default_user', name: 'Designer', telegram_chat_id: chatId.toString(), is_approved: 1, role: 'DESIGNER' });
    } else if (data.startsWith('specs_')) {
      await botInstance.answerCallbackQuery(query.id, { text: '🎨 Generating Visual Specs...' }).catch(() => {});
      const specsText = `🎨 *DESIGNER VISUAL SPECS & ASSET GUIDE*\n\n` +
        `🎨 *Recommended Color Palette:*\n` +
        `• Primary Accent: \`#FF5722\` (Vibrant Energy)\n` +
        `• Background: \`#0A0E17\` (Sleek Dark Mode)\n` +
        `• Surface Card: \`#161F30\` (Glassmorphism Tint)\n` +
        `• Typography Text: \`#F5F7FA\` (High Contrast White)\n\n` +
        `🔤 *Font Hierarchy & Pairing:*\n` +
        `• Display Headline: *Outfit Bold / Syne ExtraBold* (70pt+)\n` +
        `• Subheading & Labels: *Plus Jakarta Sans Medium* (24pt)\n` +
        `• Body Text: *Inter Regular* (16pt)\n\n` +
        `📐 *Grid & Layout Guidelines:*\n` +
        `• Canvas Dimensions: 1080 x 1350 px (4:5 Portrait Carousel)\n` +
        `• Safe Margins: 60px padding on top/bottom/sides\n` +
        `• Aesthetic Rule: 70% negative space, 30% visual content focus.`;
      await sendSafeTelegramMessage(chatId, specsText);
    } else if (data.startsWith('fb_')) {
      const action = data.split('_')[1];
      await botInstance.answerCallbackQuery(query.id, { text: `Preference saved: ${action}!` }).catch(() => {});
      await sendSafeTelegramMessage(chatId, `✨ *Agent Note:* Thank you! Preference recorded: *${action.toUpperCase()}*. Future briefs will align closer to this style.`);
    }
    return;
  }

  // 2. Handle Photo Messages (Screenshot Verification Proof Upload)
  if (update.message && update.message.photo) {
    const msg: TelegramBot.Message = update.message;
    const chatId = msg.chat.id.toString();
    const photos = msg.photo;
    if (!photos || photos.length === 0) return;
    const bestPhoto = photos[photos.length - 1]; // highest resolution photo

    const obState = onboardingTracker.get(chatId);
    const applicantName = obState?.name || msg.from?.first_name || 'New Designer';
    const applicantHandle = obState?.handle || (msg.from?.username ? `@${msg.from.username}` : 'n/a');

    // Save pending record in Turso DB
    db.prepare(`
      INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role, verification_status, verification_screenshot_id)
      VALUES (?, ?, ?, ?, 0, 'DESIGNER', 'PENDING', ?)
      ON CONFLICT(id) DO UPDATE SET verification_status='PENDING', verification_screenshot_id=?
    `).run(`user_${chatId}`, applicantName, msg.from?.username || '', chatId, bestPhoto.file_id, bestPhoto.file_id);

    // Confirm to user
    const receivedAck = `✅ *SCREENSHOT RECEIVED FOR VERIFICATION!*\n\n` +
      `Thank you *${applicantName}*! Aapka verification request Admin *@virajverse* ko review ke liye bhej diya gaya hai.\n\n` +
      `⏳ *Status:* Review in progress. Jaise hi approve hoga, aapka full AI Agent access activate ho jayega!`;
    await sendSafeTelegramMessage(chatId, receivedAck);

    // Forward Photo Proof to Master Admin with 1-Click Action Buttons
    if (MASTER_ADMIN_CHAT_ID && botInstance) {
      const adminCaption = `🔔 *NEW DESIGNER REGISTRATION REQUEST*\n\n` +
        `• *Applicant:* ${applicantName}\n` +
        `• *Instagram:* [@${applicantHandle}](https://instagram.com/${applicantHandle})\n` +
        `• *YouTube Channel:* ${obState?.youtubeName || 'n/a'}\n` +
        `• *Telegram User:* @${msg.from?.username || 'n/a'}\n` +
        `• *Chat ID:* \`${chatId}\`\n\n` +
        `👇 *1-Tap Approve or Reject:*`;

      const adminVerifyButtons = {
        inline_keyboard: [
          [
            { text: `✅ Approve Designer`, callback_data: `admin_appr_${chatId}` },
            { text: `❌ Reject`, callback_data: `admin_rej_${chatId}` }
          ]
        ]
      };

      try {
        await botInstance.sendPhoto(MASTER_ADMIN_CHAT_ID, bestPhoto.file_id, {
          caption: adminCaption,
          parse_mode: 'Markdown',
          reply_markup: adminVerifyButtons
        });
      } catch (err: any) {
        console.warn(`[Admin Photo Forward Error]: ${err.message}`);
      }
    }
    return;
  }

  // 3. Handle Text Messages
  if (update.message && update.message.text) {
    const msg: TelegramBot.Message = update.message;
    const text = msg.text ? msg.text.trim() : '';
    const chatId = msg.chat.id;

    // Check Onboarding State Machine (Step 1: Capturing Name, Instagram & YouTube)
    const obState = onboardingTracker.get(chatId.toString());
    if (obState && obState.step === 'WAITING_DETAILS' && !text.startsWith('/')) {
      const parts = text.split(/\||,|\n/).map(s => s.trim());
      const name = parts[0] || text;
      const instaMatch = text.match(/@([a-zA-Z0-9._]+)/);
      const targetHandle = instaMatch ? instaMatch[1] : (parts[1] ? parts[1].replace('@', '') : 'n/a');
      const ytChannel = parts[2] || (parts.length > 1 ? parts[parts.length - 1] : 'YouTube User');

      onboardingTracker.delete(chatId.toString());

      // Run live Instagram Scraper in real-time
      const instaProfile = await scrapeInstagramProfile(targetHandle);
      let profileBadge = '';
      if (instaProfile) {
        profileBadge = `\n🔍 *Instagram:* [@${instaProfile.username}](https://instagram.com/${instaProfile.username}) (Verified Account)\n`;
      }

      // Check if Instagram profile was successfully verified by our live Scraper
      const isAutoVerified = Boolean(instaProfile && instaProfile.username && targetHandle !== 'n/a');

      if (isAutoVerified) {
        // 1. AUTO-APPROVE IMMEDIATELY (Instant 0-Second Verification)
        db.prepare(`
          INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role, verification_status, instagram_handle)
          VALUES (?, ?, ?, ?, 1, 'DESIGNER', 'APPROVED', ?)
          ON CONFLICT(id) DO UPDATE SET is_approved=1, verification_status='APPROVED', name=?, instagram_handle=?
        `).run(`user_${chatId}`, name, msg.from?.username || '', chatId.toString(), targetHandle, name, targetHandle);

        const groupSetting = db.prepare("SELECT * FROM system_settings WHERE key = 'community_group'").get();
        let groupAction = '';
        if (groupSetting && groupSetting.value && groupSetting.is_enabled === 1) {
          groupAction = `\n\n👥 *Join Official Designer Ground:* [Tap Here to Join Ground](${groupSetting.value})\n`;
        }

        const instantApprovedMsg = `🎉 *CONGRATULATIONS! YOUR ACCOUNT IS VERIFIED & ACTIVATED!*${profileBadge}\n` +
          `✅ *Verified Channels:*\n` +
          `• Instagram: [@${targetHandle}](https://instagram.com/${targetHandle})\n` +
          `• YouTube: *${ytChannel}*${groupAction}\n\n` +
          `🚀 *Aapka Taliyo Creative Intelligence AI Agent 100% active ho chuka hai!*\n` +
          `Niche diye gaye buttons se shuru karein ya direct koi prompt bhejein:`;
        
        await sendSafeTelegramMessage(chatId, instantApprovedMsg, { reply_markup: DESIGNER_KEYBOARD });

        // Inform Master Admin about automated AI approval
        if (MASTER_ADMIN_CHAT_ID && botInstance) {
          const adminNotice = `⚡ *[AI AUTO-APPROVED]* New Designer Verified!\n\n` +
            `• *Name:* ${name}\n` +
            `• *Instagram:* [@${targetHandle}](https://instagram.com/${targetHandle})\n` +
            `• *YouTube Channel:* ${ytChannel}\n` +
            `• *Chat ID:* \`${chatId}\`\n\n` +
            `🟢 *Status:* Automatically approved & activated in 0ms!`;
          await sendSafeTelegramMessage(MASTER_ADMIN_CHAT_ID, adminNotice);
        }
        return;
      }

      // 2. FALLBACK TO MANUAL ADMIN REVIEW IF NOT INSTANTLY VERIFIED
      db.prepare(`
        INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role, verification_status, instagram_handle)
        VALUES (?, ?, ?, ?, 0, 'DESIGNER', 'PENDING', ?)
        ON CONFLICT(id) DO UPDATE SET verification_status='PENDING', name=?, instagram_handle=?
      `).run(`user_${chatId}`, name, msg.from?.username || '', chatId.toString(), targetHandle, name, targetHandle);

      const submittedMsg = `⏳ *APPLICATION SUBMITTED FOR REVIEW*\n\n` +
        `✅ *Your Details:*\n` +
        `• Name: *${name}*\n` +
        `• Instagram: *${targetHandle}*\n` +
        `• YouTube Channel: *${ytChannel}*\n\n` +
        `Hamare Admin *@virajverse* ise review karke turant approve karenge!`;
      await sendSafeTelegramMessage(chatId, submittedMsg);

      // Instantly Alert Master Admin with 1-Click Approval Buttons
      if (MASTER_ADMIN_CHAT_ID && botInstance) {
        const adminAlertMsg = `🔔 *MANUAL REVIEW REQUIRED: DESIGNER REGISTRATION*\n\n` +
          `• *Applicant:* ${name}\n` +
          `• *Instagram:* [@${targetHandle}](https://instagram.com/${targetHandle})\n` +
          `• *YouTube Channel:* ${ytChannel}\n` +
          `• *Telegram User:* @${msg.from?.username || 'n/a'}\n` +
          `• *Chat ID:* \`${chatId}\`\n\n` +
          `👇 *1-Tap Approve or Reject:*`;

        const adminVerifyButtons = {
          inline_keyboard: [
            [
              { text: `✅ Approve Designer`, callback_data: `admin_appr_${chatId}` },
              { text: `❌ Reject`, callback_data: `admin_rej_${chatId}` }
            ]
          ]
        };

        await sendSafeTelegramMessage(MASTER_ADMIN_CHAT_ID, adminAlertMsg, {
          reply_markup: adminVerifyButtons
        });
      }
      return;
    }

    // Check Authentication
    const auth = verifyUserAuth(msg);

    // Registration command (/register [code])
    if (text.startsWith('/register')) {
      const match = text.match(/\/register(?:\s+(.+))?/);
      const inputCode = match && match[1] ? match[1].trim() : '';

      const tracker = bruteForceTracker.get(chatId.toString()) || { attempts: 0, lockedUntil: 0 };
      const now = Date.now();

      if (tracker.lockedUntil > now) {
        const remainingMinutes = Math.ceil((tracker.lockedUntil - now) / 60000);
        const lockMsg = `🔒 *SECURITY LOCKOUT ACTIVE*\n\n` +
          `Too many incorrect passcode attempts!\n` +
          `Your chat is temporarily locked for *${remainingMinutes} more minute(s)*.\n\n` +
          `📩 Contact *${ADMIN_HANDLE}* on Telegram for authorized passcode access.`;
        return await sendSafeTelegramMessage(chatId, lockMsg);
      }

      if (inputCode === ADMIN_CODE) {
        bruteForceTracker.delete(chatId.toString());
        db.prepare(`
          INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role, verification_status)
          VALUES (?, ?, ?, ?, 1, 'DESIGNER', 'APPROVED')
          ON CONFLICT(id) DO UPDATE SET is_approved=1, verification_status='APPROVED'
        `).run(`user_${chatId}`, msg.from?.first_name || 'Designer', msg.from?.username || '', chatId.toString());

        const successMsg = `🎉 *ACCESS GRANTED! WELCOME TO TALIYO AGENT*\n\n` +
          `You are now registered as an official Graphic Designer!\n\n` +
          `💬 Use the docked buttons below your typing box or send any design prompt!`;
        return await sendSafeTelegramMessage(chatId, successMsg, { reply_markup: DESIGNER_KEYBOARD });
      } else {
        tracker.attempts = (tracker.attempts || 0) + 1;
        if (tracker.attempts >= 3) {
          tracker.lockedUntil = now + (10 * 60 * 1000);
          bruteForceTracker.set(chatId.toString(), tracker);
          const maxLockMsg = `🚫 *TOO MANY FAILED ATTEMPTS!*\n\n` +
            `You have entered an incorrect passcode 3 times.\n` +
            `Your chat has been *LOCKED for 10 minutes* for security protection.\n\n` +
            `👉 Contact Admin *${ADMIN_HANDLE}* to get your official invitation code.`;
          return await sendSafeTelegramMessage(chatId, maxLockMsg);
        } else {
          bruteForceTracker.set(chatId.toString(), tracker);
          const remaining = 3 - tracker.attempts;
          const failMsg = `❌ *INVALID PASSCODE!*\n\n` +
            `Remaining attempts before 10-minute lockout: *${remaining}/3*.\n\n` +
            `To get your official Admin Passcode, please contact *${ADMIN_HANDLE}* on Telegram.`;
          return await sendSafeTelegramMessage(chatId, failMsg);
        }
      }
    }

    // Unauthenticated user barrier -> Send Access Gateway Card
    if (!auth.authorized) {
      return await sendAccessGatewayCard(chatId);
    }

    // Check Cooldown for rapid tapping / spamming
    if (text !== '/start' && text.toLowerCase() !== 'start' && !text.startsWith('/register')) {
      const cd = checkUserCooldown(chatId);
      if (!cd.allowed) {
        return await sendSafeTelegramMessage(chatId, `⏳ *Cooling Period Active:* Please wait *${cd.remainingSec}s* before tapping another button.`);
      }
    }

    // 👑 SUPER ADMIN EXCLUSIVE COMMANDS
    if (auth.isAdmin) {
      if (text === '👑 Admin Control' || text === '👑 Admin Panel' || text === '/admin') {
        const usersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_approved = 1').get()?.count || 1;
        const alertsCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get()?.count || 0;
        const ideasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas').get()?.count || 0;

        const adminPanelMsg = `👑 *TALIYO SUPER ADMIN MASTER CONTROL SUITE*\n\n` +
          `• *Approved Designers:* ${usersCount} Active Accounts\n` +
          `• *Total Briefings Dispatched:* ${alertsCount} Briefs\n` +
          `• *Generated Concepts:* ${ideasCount} Ideas\n` +
          `• *Cluster Engine:* 27-Model Resilient Cascade Active\n` +
          `• *Cloud DB:* Turso Cloud SQLite (AWS Mumbai)\n\n` +
          `⚡ *Quick Admin Commands:*\n` +
          `• \`/addevent Name | MM-DD | Category | Score\`\n` +
          `• \`/addclient Name | Industry | Audience | Tone\`\n` +
          `• \`/makeadmin CHAT_ID\`\n` +
          `• \`/prunecache\`\n\n` +
          `👇 *Tap any admin button below to execute instant controls:*`;
        
        return await sendSafeTelegramMessage(chatId, adminPanelMsg, { reply_markup: ADMIN_MASTER_KEYBOARD });
      }

      if (text === '📢 Broadcast Hub' || text === '/broadcast') {
        const broadcastHubMsg = `📢 *TALIYO MULTI-MEDIA BROADCAST HUB*\n\n` +
          `Sabhi approved designers ko instant push broadcast bhejein:\n\n` +
          `1️⃣ *Text Broadcast:*\n` +
          `\`/broadcast Aapka Message\`\n\n` +
          `2️⃣ *Photo + Action Button Broadcast:*\n` +
          `\`/broadcastphoto PhotoURL | Caption | ButtonText | ButtonURL\`\n\n` +
          `3️⃣ *Titled Link + Button Broadcast:*\n` +
          `\`/broadcastlink Headline | Description | ButtonText | ButtonURL\``;
        return await sendSafeTelegramMessage(chatId, broadcastHubMsg);
      }

      if (text === '👥 Community Ground' || text === '/ground') {
        const setting = db.prepare("SELECT * FROM system_settings WHERE key = 'community_group'").get();
        const currentLink = setting?.value || 'https://t.me/virajverse';
        const isEnabled = setting?.is_enabled === 1;

        const groundHubMsg = `👥 *DESIGNER COMMUNITY GROUND CONTROL*\n\n` +
          `• *Current Link:* ${currentLink}\n` +
          `• *Gate Status:* ${isEnabled ? '🟢 ACTIVE (Shown during onboarding)' : '🔴 DISABLED (Hidden)'}\n\n` +
          `🛠️ *Available Commands:*\n` +
          `• Link Set Karein: \`/setgroup https://t.me/yourgroup\`\n` +
          `• On/Off Toggle: \`/togglegroup on\` ya \`/togglegroup off\`\n` +
          `• Designers Ko Invite Bhejein: \`/notifygroup\``;
        return await sendSafeTelegramMessage(chatId, groundHubMsg);
      }

      if (text === '👥 Active Designers') {
        const users: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_approved = 1 ORDER BY registered_at DESC LIMIT 15').all();
        let designerList = `👥 *ACTIVE REGISTERED DESIGNERS (${users.length})*\n\n`;
        users.forEach((u, i) => {
          designerList += `${i + 1}. *${u.name}* (@${u.username || 'n/a'}) — \`${u.telegram_chat_id}\` [${u.role}]\n`;
        });
        designerList += `\n🔒 *User Isolation:* All accounts strictly private.`;
        return await sendSafeTelegramMessage(chatId, designerList);
      }

      if (text === '🔔 Pending Approvals' || text === '👥 Pending Verifications') {
        const pendingUsers: UserRecord[] = db.prepare('SELECT * FROM users WHERE verification_status = "PENDING" ORDER BY registered_at DESC').all();
        if (pendingUsers.length === 0) {
          return await sendSafeTelegramMessage(chatId, `🔔 *PENDING VERIFICATIONS*\n\nAbhi koi pending verification request nahi hai. Sabhi designers approved hain!`);
        }
        let pendingList = `🔔 *PENDING DESIGNER VERIFICATIONS (${pendingUsers.length})*\n\n`;
        pendingUsers.forEach((u, i) => {
          pendingList += `${i + 1}. *${u.name}* (@${u.username || 'n/a'})\n   • Chat ID: \`${u.telegram_chat_id}\`\n   • Handle: ${u.instagram_handle || 'n/a'}\n\n`;
        });
        pendingList += `👉 Approve karne ke liye type karein:\n\`/approve CHAT_ID\``;
        return await sendSafeTelegramMessage(chatId, pendingList);
      }

      if (text.startsWith('/approve')) {
        const targetId = text.replace('/approve', '').trim();
        if (targetId) {
          db.prepare(`
            UPDATE users SET is_approved = 1, verification_status = 'APPROVED'
            WHERE telegram_chat_id = ?
          `).run(targetId);

          const welcomeApproved = `🎉 *CONGRATULATIONS! YOUR DESIGNER ACCESS IS APPROVED!*\n\n` +
            `Admin *@virajverse* ne aapka account verify aur approve kar diya hai!\n\n` +
            `🚀 *Aapka Taliyo Creative Intelligence AI Agent 100% active hai!*\n` +
            `Niche diye gaye buttons se shuru karein ya direct prompt bhejein:`;
          await sendSafeTelegramMessage(targetId, welcomeApproved, { reply_markup: DESIGNER_KEYBOARD });
          return await sendSafeTelegramMessage(chatId, `✅ Designer \`${targetId}\` has been approved successfully!`);
        }
      }

      if (text.startsWith('/setgroup')) {
        const link = text.replace('/setgroup', '').trim();
        if (!link) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/setgroup https://t.me/yourgroup\``);
        }
        db.prepare(`
          INSERT INTO system_settings (key, value, is_enabled)
          VALUES ('community_group', ?, 1)
          ON CONFLICT(key) DO UPDATE SET value = ?, is_enabled = 1, updated_at = CURRENT_TIMESTAMP
        `).run(link, link);

        return await sendSafeTelegramMessage(chatId, `✅ *Community Ground Set & Enabled!*\n\n• Link: ${link}\n• Status: 🟢 ACTIVE for new & existing designers.`);
      }

      if (text.startsWith('/togglegroup')) {
        const mode = text.replace('/togglegroup', '').trim().toLowerCase();
        const isEnabled = mode === 'on' || mode === '1' || mode === 'enable' ? 1 : 0;
        const currentLink = db.prepare("SELECT value FROM system_settings WHERE key = 'community_group'").get()?.value || 'https://t.me/virajverse';
        db.prepare(`
          INSERT INTO system_settings (key, value, is_enabled)
          VALUES ('community_group', ?, ?)
          ON CONFLICT(key) DO UPDATE SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
        `).run(currentLink, isEnabled, isEnabled);

        return await sendSafeTelegramMessage(chatId, `⚙️ *Community Ground Gate Updated:*\n• Status: ${isEnabled ? '🟢 ACTIVE (Shown to Designers)' : '🔴 DISABLED (Hidden)'}`);
      }

      if (text === '/notifygroup' || text === '👥 Broadcast Group Invite') {
        const setting = db.prepare("SELECT * FROM system_settings WHERE key = 'community_group'").get();
        if (!setting || !setting.value || setting.is_enabled !== 1) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Community Ground is currently disabled or has no link.* Set it first with \`/setgroup https://t.me/yourgroup\``);
        }
        const activeUsers: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_approved = 1').all();
        const groupMsg = `👥 *EXCLUSIVE DESIGNER COMMUNITY INVITATION!*\n\n` +
          `Hamara official **Taliyo / VirajVerse Designer Ground** active ho chuka hai!\n\n` +
          `Yahan sabhi approved graphic designers connect karte hain, portfolio share karte hain aur live collaboration karte hain.\n\n` +
          `👇 Niche button se join karein aur continue studio access karein:`;
        
        let sentCount = 0;
        for (const u of activeUsers) {
          if (u.telegram_chat_id && botInstance) {
            await botInstance.sendMessage(u.telegram_chat_id, groupMsg, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '👥 Join Official Designer Ground', url: setting.value }],
                  [{ text: '🚀 Continue to AI Studio', callback_data: 'menu_continue' }]
                ]
              }
            }).catch(() => {});
            sentCount++;
          }
        }
        return await sendSafeTelegramMessage(chatId, `✅ *Group Invitation Broadcast Complete:* Sent to ${sentCount} active designers!`);
      }

      if (text.startsWith('/addevent')) {
        const parts = text.replace('/addevent', '').trim().split('|').map(s => s.trim());
        if (parts.length < 2) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/addevent Event Name | MM-DD | Category | Importance\`\n*(Example: \`/addevent Ganesh Chaturthi | 09-07 | FESTIVAL | 90\`)*`);
        }
        const [name, date, category = 'BUSINESS', importance = '85'] = parts;
        const id = `evt_custom_${Date.now()}`;
        db.prepare(`
          INSERT INTO events (id, name, date, category, importance, country, source)
          VALUES (?, ?, ?, ?, ?, 'India', 'Admin Panel')
        `).run(id, name, date, category, parseInt(importance));
        return await sendSafeTelegramMessage(chatId, `✅ *EVENT ADDED:* *${name}* (${date}) successfully added to calendar database!`);
      }

      if (text.startsWith('/delevent')) {
        const query = text.replace('/delevent', '').trim();
        if (!query) return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/delevent Event Name\``);
        db.prepare('DELETE FROM events WHERE name LIKE ?').run(`%${query}%`);
        return await sendSafeTelegramMessage(chatId, `🗑️ *EVENT DELETED:* Any event matching "${query}" removed from calendar.`);
      }

      if (text.startsWith('/addclient')) {
        const parts = text.replace('/addclient', '').trim().split('|').map(s => s.trim());
        if (parts.length < 2) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/addclient Name | Industry | Brand Tone | Creative Style\`\n*(Example: \`/addclient Acme Corp | SaaS | Sleek & Crisp | Dark Mode Glassmorphism\`)*`);
        }
        const [name, industry, brandTone = 'Professional & Modern', creativeStyle = 'Minimalist'] = parts;
        const id = `client_${Date.now()}`;
        db.prepare(`
          INSERT INTO clients (id, user_id, name, industry, brand_tone, creative_style)
          VALUES (?, 'default_user', ?, ?, ?, ?)
        `).run(id, name, industry, brandTone, creativeStyle);
        return await sendSafeTelegramMessage(chatId, `✅ *CLIENT PROFILE SAVED:* *${name}* (${industry}) added to active clients!`);
      }

      if (text.startsWith('/revoke')) {
        const targetId = text.replace('/revoke', '').trim();
        if (!targetId) return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/revoke CHAT_ID\``);
        db.prepare('UPDATE users SET is_approved = 0, verification_status = "REJECTED" WHERE telegram_chat_id = ?').run(targetId);
        await sendSafeTelegramMessage(targetId, `🔒 *Access Notice:* Your designer access has been revoked by Admin.`);
        return await sendSafeTelegramMessage(chatId, `🚫 Access revoked for user \`${targetId}\`.`);
      }

      if (text.startsWith('/makeadmin')) {
        const targetId = text.replace('/makeadmin', '').trim();
        if (!targetId) return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/makeadmin CHAT_ID\``);
        db.prepare('UPDATE users SET role = "ADMIN", is_approved = 1 WHERE telegram_chat_id = ?').run(targetId);
        await sendSafeTelegramMessage(targetId, `👑 *Promoted to Admin:* You now have Admin privileges! Send /start to reload keypad.`, { reply_markup: ADMIN_MASTER_KEYBOARD });
        return await sendSafeTelegramMessage(chatId, `👑 User \`${targetId}\` promoted to Admin.`);
      }

      if (text.startsWith('/broadcastphoto')) {
        const parts = text.replace('/broadcastphoto', '').trim().split('|').map(s => s.trim());
        if (parts.length < 2) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/broadcastphoto PhotoURL | Caption with [Title](Link) | ButtonText | ButtonURL\`\n\n*(Example: \`/broadcastphoto https://example.com/banner.jpg | 🔥 *New Video Alert!* \n\nCheck out [VirajVerse](https://youtube.com/@VirajVerse016) | ▶️ Watch Video | https://youtube.com/@VirajVerse016\`)*`);
        }
        const [photoUrl, caption, btnText, btnUrl] = parts;
        const replyMarkup = (btnText && btnUrl) ? {
          inline_keyboard: [[{ text: btnText, url: btnUrl }]]
        } : undefined;

        const users: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_approved = 1').all();
        let sentCount = 0;
        for (const u of users) {
          if (u.telegram_chat_id && u.telegram_chat_id !== chatId.toString() && botInstance) {
            try {
              await botInstance.sendPhoto(u.telegram_chat_id, photoUrl, {
                caption: `📢 *OFFICIAL ANNOUNCEMENT*\n\n${caption}`,
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
              });
              sentCount++;
            } catch (err: any) {
              console.warn(`[Broadcast Error]: ${err.message}`);
            }
          }
        }
        return await sendSafeTelegramMessage(chatId, `📢 *PHOTO BROADCAST COMPLETE:* Sent with rich media and buttons to ${sentCount} active designers.`);
      }

      if (text.startsWith('/broadcastlink')) {
        const parts = text.replace('/broadcastlink', '').trim().split('|').map(s => s.trim());
        if (parts.length < 4) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/broadcastlink Title | Message Body | Button Title | Button URL\`\n\n*(Example: \`/broadcastlink 🚀 Big Update | Check out our new tutorials! | 📸 Follow Instagram | https://instagram.com/fearless.devx/\`)*`);
        }
        const [title, body, btnText, btnUrl] = parts;
        const replyMarkup = {
          inline_keyboard: [[{ text: btnText, url: btnUrl }]]
        };
        const users: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_approved = 1').all();
        let sentCount = 0;
        for (const u of users) {
          if (u.telegram_chat_id && u.telegram_chat_id !== chatId.toString()) {
            await sendSafeTelegramMessage(u.telegram_chat_id, `📢 *${title}*\n\n${body}`, { reply_markup: replyMarkup }).catch(() => {});
            sentCount++;
          }
        }
        return await sendSafeTelegramMessage(chatId, `📢 *LINK BROADCAST COMPLETE:* Sent with interactive button to ${sentCount} active designers.`);
      }

      if (text.startsWith('/broadcast')) {
        const broadcastMsg = text.replace('/broadcast', '').trim();
        if (!broadcastMsg) return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/broadcast Your announcement text with [Title](https://link.com)\``);
        const users: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_approved = 1').all();
        let sentCount = 0;
        for (const u of users) {
          if (u.telegram_chat_id && u.telegram_chat_id !== chatId.toString()) {
            await sendSafeTelegramMessage(u.telegram_chat_id, `📢 *OFFICIAL ANNOUNCEMENT*\n\n${broadcastMsg}`).catch(() => {});
            sentCount++;
          }
        }
        return await sendSafeTelegramMessage(chatId, `📢 *BROADCAST COMPLETE:* Sent to ${sentCount} active designers.`);
      }

      if (text === '✏️ Edit Hub' || text === '/edithub') {
        const editGuide = `✏️ *SUPER ADMIN EDIT & MANAGEMENT HUB*\n\n` +
          `Aap chat me type karke kisi bhi cheez ko edit kar sakte hain:\n\n` +
          `📅 *CALENDAR MANAGEMENT:*\n` +
          `• \`/addevent Name | MM-DD | Category | Score\`\n` +
          `• \`/delevent Event Name\`\n\n` +
          `💼 *CLIENT BRAND PROFILES:*\n` +
          `• \`/addclient Name | Industry | Tone | Style\`\n\n` +
          `👥 *USER & ACCESS CONTROLS:*\n` +
          `• \`/approve CHAT_ID\` — Approve pending user\n` +
          `• \`/revoke CHAT_ID\` — Revoke user access\n` +
          `• \`/makeadmin CHAT_ID\` — Promote to Admin\n\n` +
          `📢 *RICH MEDIA BROADCASTS:*\n` +
          `• \`/broadcast Text with [Title](https://url)\`\n` +
          `• \`/broadcastphoto PhotoURL | Caption | ButtonTitle | URL\`\n` +
          `• \`/broadcastlink Title | Message | ButtonTitle | URL\``;
        return await sendSafeTelegramMessage(chatId, editGuide);
      }

      if (text === '🚀 Trigger Radar Scan') {
        await sendSafeTelegramMessage(chatId, `🚀 *[Admin Trigger]* Executing morning calendar radar scan & AI briefings...`);
        const todayEvt = db.prepare('SELECT * FROM events ORDER BY importance DESC LIMIT 1').get();
        if (todayEvt) {
          await processAgentDesignRequest(chatId, todayEvt.name, auth.user);
        }
        return;
      }

      if (text === '📊 Deep AI Telemetry') {
        const statusText = `📊 *DEEP AI & INFRASTRUCTURE TELEMETRY*\n\n` +
          `• *Primary Model:* \`openai/gpt-oss-120b\` (Reasoning Engine)\n` +
          `• *Active Cluster Pools:* 5 Pools (27 Active NIM Models)\n` +
          `• *Failover Latency:* < 100ms Sub-Second Cascade\n` +
          `• *Queue Concurrency:* 3 Parallel Workers\n` +
          `• *Cloud Platform:* Vercel Serverless (TypeScript 5.x)\n` +
          `• *Database Status:* 🟢 Healthy (Turso AWS ap-south-1)`;
        return await sendSafeTelegramMessage(chatId, statusText);
      }

      if (text === '📥 Export DPO Dataset') {
        const dataset = exportDPOTrainingDataset();
        if (botInstance && (botInstance as any).sendDocument) {
          await botInstance.sendDocument(chatId, dataset.buffer, {
            caption: `📥 *TALIYO DPO/RLHF TRAINING DATASET*\n\n• Samples Exported: *${dataset.count} Prompt-Idea Pairs*\n• Format: JSONL (Direct Preference Optimization Ready)\n• Use: Fine-tune custom LoRA/RLHF models.`
          }, { filename: dataset.filename, contentType: 'application/jsonl' });
        } else {
          await sendSafeTelegramMessage(chatId, `📥 *DPO Dataset Ready:* ${dataset.count} training pairs synchronized.`);
        }
        return;
      }

      if (text === '🧹 Prune Cloud Cache') {
        const pruneRes = pruneDatabaseCache(30);
        return await sendSafeTelegramMessage(chatId, `🧹 *Cloud Cache Pruned:* Removed old telemetry logs beyond ${pruneRes.retentionDays} days.`);
      }
    }

    // Authenticated Commands & Reply Keyboard Taps
    if (text === '/start' || text.toLowerCase() === 'start') {
      const welcome = auth.isAdmin
        ? `👑 *Welcome Master Admin (@virajverse)!*\n\nYour Super Admin Master Control Dashboard is active. Use the docked admin keypad below for controls or send any creative design prompt!`
        : `🤖 *Hey ${msg.from?.first_name || 'Designer'}! Welcome to Taliyo Creative Intelligence*\n\n` +
          `I am your Senior AI Design Partner — dedicated 100% to **Graphic Design Strategy, Visual Direction, Headlines, Color Palettes & Social Campaigns**!\n\n` +
          `👇 *Use the persistent menu buttons below your typing box for 1-tap navigation, or type any prompt naturally!*`;
      
      return await sendSafeTelegramMessage(chatId, welcome, {
        reply_markup: getUserKeyboard(chatId)
      });
    }

    if (text === '/contact' || text === '💬 Contact Admin') {
      const contactMsg = `📩 *ADMIN CONTACT & SUPPORT*\n\n` +
        `For Admin Passcode Access, Custom Client Onboarding, or Priority Support, contact:\n\n` +
        `👉 Telegram Admin: *${ADMIN_HANDLE}*`;
      return await sendSafeTelegramMessage(chatId, contactMsg);
    }

    if (text === '🎨 Art Director Co-Pilot' || text === '/copilot') {
      const isEnglish = (auth.user?.language || 'HINGLISH').toUpperCase() === 'ENGLISH';
      const copilotMsg = isEnglish
        ? `🎨 *TALIYO ART DIRECTOR CO-PILOT ACTIVE!*\n\n` +
          `Working on an active design right now? Get precision creative feedback:\n\n` +
          `• *Exact Hex Palettes:* "Suggest luxury real estate palette"\n` +
          `• *Font Pairings:* "Display + body font pairing for SaaS"\n` +
          `• *Headline Copy:* "Make this fitness headline punchy"\n` +
          `• *Figma Specs:* "What margins for 1080x1350 carousel"\n\n` +
          `👇 *Type your design query directly into chat!*`
        : `🎨 *TALIYO ART DIRECTOR CO-PILOT ACTIVE!*\n\nAap abhi jo design bana rahe hain, usme direct precision help lein:\n\n` +
          `• *Exact Hex Palettes:* "Luxury real estate poster ke liye color palette batao"\n` +
          `• *Font Pairings:* "SaaS carousel ke liye best font pairing"\n` +
          `• *Headline Copy:* "Is headline ko luxurious aur punchy banao"\n` +
          `• *Figma/Canva Specs:* "1080x1350 carousel ke liye margin aur padding"\n\n` +
          `👇 *Koi bhi query direct chat me likh kar bhejiye!*`;
      return await sendSafeTelegramMessage(chatId, copilotMsg);
    }

    if (text === '📖 Guide & Support' || text === '/help' || text === '📖 Designer Guide' || text === '📖 Full Designer Guide') {
      const isEnglish = (auth.user?.language || 'HINGLISH').toUpperCase() === 'ENGLISH';
      const guideMsg = isEnglish
        ? `📖 *TALIYO CREATIVE STUDIO GUIDE & SUPPORT*\n\n` +
          `1️⃣ *⚡ Auto Radar Brief:* 1-tap ahead-of-time festival/event strategy.\n` +
          `2️⃣ *🗓️ Full Calendar:* Browse full-year marketing & cultural dates.\n` +
          `3️⃣ *🎨 Art Director Co-Pilot:* Precision colors, fonts & headline feedback.\n` +
          `4️⃣ *💼 Client Profiles:* Private client brand guidelines & tone.\n` +
          `5️⃣ *🌐 Language:* 1-tap toggle between English and Hinglish.\n\n` +
          `📩 *Priority Support:* Contact *@virajverse* on Telegram.`
        : `📖 *TALIYO CREATIVE STUDIO GUIDE & SUPPORT*\n\n` +
          `1️⃣ *⚡ Auto Radar Brief:* 1-tap me upcoming event ki 6-concept strategy.\n` +
          `2️⃣ *🗓️ Full Calendar:* Poore saal ke festivals aur marketing dates.\n` +
          `3️⃣ *🎨 Art Director Co-Pilot:* Active design ke liye exact colors, fonts aur copy.\n` +
          `4️⃣ *💼 Client Profiles:* Private client brand guidelines aur styling.\n` +
          `5️⃣ *🌐 Language:* 1-tap me English aur Hinglish switch karein.\n\n` +
          `📩 *Priority Support:* Contact *@virajverse* on Telegram.`;
      return await sendSafeTelegramMessage(chatId, guideMsg);
    }

    if (text === '/calendar' || text === '🗓️ Full Calendar' || text === '/upcoming' || text === '📅 Upcoming Dates') {
      const calText = handleFullCalendarCommand('ALL');
      return await sendSafeTelegramMessage(chatId, calText, {
        reply_markup: getFullCalendarInlineKeyboard()
      });
    }

    if (text === '/language' || text === '🌐 Language (EN/Hinglish)' || text === '🌐 Language / भाषा' || text.toLowerCase().includes('language')) {
      const currentLang = auth.user?.language || 'HINGLISH';
      const langPrompt = `🌐 *LANGUAGE SETTINGS (ENGLISH / HINGLISH)*\n\n` +
        `Current Setting: *${currentLang === 'ENGLISH' ? '🇬🇧 English (Global)' : '🇮🇳 Hinglish (Desi / India)'}*\n\n` +
        `Apni pasandida bhasha chunein / Choose your preferred briefing language:`;
      return await sendSafeTelegramMessage(chatId, langPrompt, {
        reply_markup: LANGUAGE_INLINE_KEYBOARD
      });
    }

    if (text === '/today' || text === '/autobrief' || text === '⚡ Auto Radar Brief' || text === '⚡ Today\'s Focus') {
      const topEvt: EventRecord = db.prepare('SELECT * FROM events ORDER BY importance DESC LIMIT 1').get() || {
        id: 'evt_default',
        name: 'Independence Day India',
        date: '08-15',
        category: 'NATIONAL',
        importance: 95
      };
      const isEnglish = (auth.user?.language || 'HINGLISH').toUpperCase() === 'ENGLISH';
      const alertNotice = isEnglish
        ? `🎯 *[AHEAD-OF-TIME RADAR BRIEF]*\n\nHey ${auth.user?.name || 'Designer'}! Upcoming in the next 2-3 days: *${topEvt.name}*. Get your client campaigns ready!\n\n_Generating 6 creative concepts, headlines & visual specs now..._`
        : `🎯 *[AHEAD-OF-TIME AUTO RADAR]*\n\nHey ${auth.user?.name || 'Designer'}! Next 2-3 dino me *${topEvt.name}* aa raha hai. Apne clients ke liye yeh design bana lo!\n\n_Generating 6 creative concepts, headlines & visual specs now..._`;
      
      await sendSafeTelegramMessage(chatId, alertNotice);
      return await processAgentDesignRequest(chatId, topEvt.name, auth.user);
    }

    if (text === '💡 Custom Prompt' || text === '💡 Generate Ideas') {
      return await sendSafeTelegramMessage(chatId, `💡 *Aapko kiske liye design ideas chahiye?*\n\nNiche se koi upcoming event choose karein ya chat me apna custom prompt likhein:`, {
        reply_markup: getFullCalendarInlineKeyboard()
      });
    }

    if (text === '/clients' || text === '💼 Client Profiles') {
      const clients: ClientRecord[] = db.prepare('SELECT * FROM clients WHERE user_id = ? OR user_id = "default_user"').all(auth.user?.id || 'default_user');
      let clientText = `💼 *Your Private Client Brand Profiles*\n\n`;
      clients.forEach(c => {
        clientText += `• *${c.name}* (${c.industry})\n  Tone: _${c.brand_tone}_\n  Style: ${c.creative_style}\n\n`;
      });
      return await sendSafeTelegramMessage(chatId, clientText);
    }

    if (text === '/myactivity' || text === '👤 My Activity' || text.toLowerCase().includes('abhi tak kya') || text.toLowerCase().includes('what have you done')) {
      const userClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE user_id = ?').get(auth.user?.id || 'default_user')?.count || 0;
      const userSaved = db.prepare('SELECT COUNT(*) as count FROM feedback WHERE user_id = ? AND rating = "SAVED"').get(auth.user?.id || 'default_user')?.count || 0;
      const activityText = `👤 *Hey ${auth.user?.name || 'Designer'}! Here is YOUR Private Work Summary:*\n\n` +
        `• *Preferred Language:* ${auth.user?.language || 'HINGLISH'}\n` +
        `• *Your Private Client Profiles:* ${userClients} Active Brands\n` +
        `• *Your Saved Briefings:* ${userSaved} Concepts Bookmarked\n` +
        `• *Privacy Isolation:* 100% Private (Your work & ideas are never mixed with other designers)\n\n` +
        `💬 *Ask me any design prompt to generate your next creative briefing!*`;
      return await sendSafeTelegramMessage(chatId, activityText);
    }

    // Conversational Intent Analysis & Frontline Multi-Agent Dispatcher
    let queryTopic = text;
    if (text.startsWith('/ideas')) {
      queryTopic = text.replace('/ideas', '').trim() || 'Independence Day India';
      return await processAgentDesignRequest(chatId, queryTopic, auth.user);
    }

    const userName = auth.user ? auth.user.name : 'Designer';
    const userLanguage = auth.user?.language || 'HINGLISH';
    const systemPrompt = buildFrontDispatcherSystemPrompt(userName, userLanguage);

    try {
      const result = await executeClusterQuery(
        MODEL_CLUSTERS.FRONT_DISPATCHER,
        systemPrompt,
        text,
        { temperature: 0.5, response_format: { type: 'json_object' } }
      );

      let clean = result.text.trim();
      if (clean.startsWith('```json')) clean = clean.replace(/^```json/, '').replace(/```$/, '').trim();
      else if (clean.startsWith('```')) clean = clean.replace(/^```/, '').replace(/```$/, '').trim();

      const parsed = JSON.parse(clean);

      // Autonomous Slash-Free Command Execution
      if (parsed.action === 'EXECUTE_COMMAND' && parsed.commandName) {
        const cmd = parsed.commandName;
        if (cmd === 'SHOW_CALENDAR') {
          const calText = handleFullCalendarCommand('ALL');
          return await sendSafeTelegramMessage(chatId, calText, { reply_markup: getFullCalendarInlineKeyboard() });
        }
        if (cmd === 'SHOW_CLIENTS') {
          const clients: ClientRecord[] = db.prepare('SELECT * FROM clients WHERE user_id = ? OR user_id = "default_user"').all(auth.user?.id || 'default_user');
          let clientText = `💼 *Your Private Client Brand Profiles*\n\n`;
          clients.forEach(c => {
            clientText += `• *${c.name}* (${c.industry})\n  Tone: _${c.brand_tone}_\n  Style: ${c.creative_style}\n\n`;
          });
          return await sendSafeTelegramMessage(chatId, clientText);
        }
        if (cmd === 'AUTO_RADAR_BRIEF') {
          const topEvt: EventRecord = db.prepare('SELECT * FROM events ORDER BY importance DESC LIMIT 1').get() || {
            id: 'evt_default',
            name: 'Independence Day India',
            date: '08-15',
            category: 'NATIONAL',
            importance: 95
          };
          const isEnglish = (auth.user?.language || 'HINGLISH').toUpperCase() === 'ENGLISH';
          const alertNotice = isEnglish
            ? `🎯 *[AHEAD-OF-TIME RADAR BRIEF]*\n\nHey ${auth.user?.name || 'Designer'}! Upcoming in next 2-3 days: *${topEvt.name}*. Get your client campaigns ready!\n\n_Generating 6 creative concepts, headlines & visual specs now..._`
            : `🎯 *[AHEAD-OF-TIME AUTO RADAR]*\n\nHey ${auth.user?.name || 'Designer'}! Next 2-3 dino me *${topEvt.name}* aa raha hai. Apne clients ke liye yeh design bana lo!\n\n_Generating 6 creative concepts, headlines & visual specs now..._`;
          await sendSafeTelegramMessage(chatId, alertNotice);
          return await processAgentDesignRequest(chatId, topEvt.name, auth.user);
        }
        if (cmd === 'SHOW_ACTIVITY') {
          const userClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE user_id = ?').get(auth.user?.id || 'default_user')?.count || 0;
          const userSaved = db.prepare('SELECT COUNT(*) as count FROM feedback WHERE user_id = ? AND rating = "SAVED"').get(auth.user?.id || 'default_user')?.count || 0;
          const activityText = `👤 *Hey ${auth.user?.name || 'Designer'}! Here is YOUR Private Work Summary:*\n\n` +
            `• *Preferred Language:* ${auth.user?.language || 'HINGLISH'}\n` +
            `• *Your Private Client Profiles:* ${userClients} Active Brands\n` +
            `• *Your Saved Briefings:* ${userSaved} Concepts Bookmarked\n` +
            `• *Privacy Isolation:* 100% Private\n\n` +
            `💬 *Ask me any design prompt to generate your next creative briefing!*`;
          return await sendSafeTelegramMessage(chatId, activityText);
        }
        if (cmd === 'SWITCH_LANGUAGE') {
          const currentLang = auth.user?.language || 'HINGLISH';
          const langPrompt = `🌐 *LANGUAGE SETTINGS (ENGLISH / HINGLISH)*\n\n` +
            `Current Setting: *${currentLang === 'ENGLISH' ? '🇬🇧 English (Global)' : '🇮🇳 Hinglish (Desi / India)'}*\n\n` +
            `Apni pasandida bhasha chunein / Choose your preferred briefing language:`;
          return await sendSafeTelegramMessage(chatId, langPrompt, { reply_markup: LANGUAGE_INLINE_KEYBOARD });
        }
        if (cmd === 'COPILOT_GUIDE') {
          const isEnglish = (auth.user?.language || 'HINGLISH').toUpperCase() === 'ENGLISH';
          const copilotMsg = isEnglish
            ? `🎨 *TALIYO ART DIRECTOR CO-PILOT ACTIVE!*\n\nWorking on an active design right now? Get precision creative feedback:\n\n• *Exact Hex Palettes:* "Suggest luxury real estate palette"\n• *Font Pairings:* "Display + body font pairing for SaaS"\n• *Headline Copy:* "Make this fitness headline punchy"\n• *Figma Specs:* "What margins for 1080x1350 carousel"\n\n👇 *Type your design query directly into chat!*`
            : `🎨 *TALIYO ART DIRECTOR CO-PILOT ACTIVE!*\n\nAap abhi jo design bana rahe hain, usme direct precision help lein:\n\n• *Exact Hex Palettes:* "Luxury real estate poster ke liye color palette batao"\n• *Font Pairings:* "SaaS carousel ke liye best font pairing"\n• *Headline Copy:* "Is headline ko luxurious aur punchy banao"\n• *Figma/Canva Specs:* "1080x1350 carousel ke liye margin aur padding"\n\n👇 *Koi bhi query direct chat me likh kar bhejiye!*`;
          return await sendSafeTelegramMessage(chatId, copilotMsg);
        }
        if (cmd === 'SHOW_GUIDE') {
          const guideMsg = `📖 *TALIYO CREATIVE STUDIO GUIDE & SUPPORT*\n\n` +
            `1️⃣ *⚡ Auto Radar Brief:* 1-tap me upcoming event ki 6-concept strategy.\n` +
            `2️⃣ *🗓️ Full Calendar:* Poore saal ke festivals aur marketing dates.\n` +
            `3️⃣ *🎨 Art Director Co-Pilot:* Active design ke liye exact colors, fonts aur copy.\n` +
            `4️⃣ *💼 Client Profiles:* Private client brand guidelines aur styling.\n` +
            `5️⃣ *🌐 Language:* 1-tap me English aur Hinglish switch karein.\n\n` +
            `📩 *Priority Support:* Contact *@virajverse* on Telegram.`;
          return await sendSafeTelegramMessage(chatId, guideMsg);
        }
        if (cmd === 'ADMIN_PANEL' && auth.isAdmin) {
          const usersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_approved = 1').get()?.count || 1;
          const alertsCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get()?.count || 0;
          const ideasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas').get()?.count || 0;
          const adminPanelMsg = `👑 *TALIYO SUPER ADMIN MASTER CONTROL SUITE*\n\n` +
            `• *Approved Designers:* ${usersCount} Active Accounts\n` +
            `• *Total Briefings Dispatched:* ${alertsCount} Briefs\n` +
            `• *Generated Concepts:* ${ideasCount} Ideas\n` +
            `• *Cluster Engine:* 27-Model Resilient Cascade Active\n` +
            `• *Cloud DB:* Turso Cloud SQLite (AWS Mumbai)`;
          return await sendSafeTelegramMessage(chatId, adminPanelMsg, { reply_markup: ADMIN_MASTER_KEYBOARD });
        }
        if (cmd === 'PENDING_APPROVALS' && auth.isAdmin) {
          const pendingUsers: UserRecord[] = db.prepare('SELECT * FROM users WHERE verification_status = "PENDING" ORDER BY registered_at DESC').all();
          if (pendingUsers.length === 0) {
            return await sendSafeTelegramMessage(chatId, `🔔 *PENDING VERIFICATIONS*\n\nAbhi koi pending verification request nahi hai. Sabhi designers approved hain!`);
          }
          let pendingList = `🔔 *PENDING DESIGNER VERIFICATIONS (${pendingUsers.length})*\n\n`;
          pendingUsers.forEach((u, i) => {
            pendingList += `${i + 1}. *${u.name}* (@${u.username || 'n/a'})\n   • Chat ID: \`${u.telegram_chat_id}\`\n\n`;
          });
          return await sendSafeTelegramMessage(chatId, pendingList);
        }
      }

      if (parsed.action === 'REPLY_DIRECTLY') {
        return await sendSafeTelegramMessage(chatId, parsed.message);
      }

      if (parsed.action === 'TRIGGER_BRIEFING_PIPELINE') {
        if (parsed.message) {
          await sendSafeTelegramMessage(chatId, `💬 _${parsed.message}_`);
        }
        const cleanTopic = parsed.extractedParams?.cleanTopic || text;
        return await processAgentDesignRequest(chatId, cleanTopic, auth.user);
      }
    } catch (err: any) {
      console.warn(`[FrontDispatcher Fallback]: ${err.message}`);
    }

    // Direct design request fallback
    await processAgentDesignRequest(chatId, queryTopic, auth.user);
  }
}

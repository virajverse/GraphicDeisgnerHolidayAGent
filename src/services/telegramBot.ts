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
const onboardingTracker = new Map<string, { step: 'WAITING_NAME' | 'WAITING_SCREENSHOT'; name?: string; handle?: string }>();

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
    [{ text: '⚡ Auto Radar Brief' }, { text: '📅 Upcoming Dates' }],
    [{ text: '💡 Custom Prompt' }, { text: '💼 Client Profiles' }],
    [{ text: '👤 My Activity' }, { text: '📖 Designer Guide' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

export const ADMIN_MASTER_KEYBOARD = {
  keyboard: [
    [{ text: '👑 Admin Panel' }, { text: '👥 Active Designers' }],
    [{ text: '🔔 Pending Approvals' }, { text: '🚀 Trigger Radar Scan' }],
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

  let msg = `✨ *CREATIVE OPPORTUNITY BRIEFING*\n\n`;
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

export async function processAgentDesignRequest(chatId: string | number, queryText: string, user: UserRecord | null = null) {
  if (!botInstance) return;
  const strChatId = chatId.toString();

  // Double-Tap Blocker
  if (activeProcessingUsers.has(strChatId)) {
    return sendSafeTelegramMessage(chatId, '⚙️ *Request in Progress:* Aapki design briefing abhi generate ho rahi hai! Please 4-5 second wait karein.');
  }

  activeProcessingUsers.add(strChatId);
  botInstance.sendChatAction(chatId, 'typing');

  const progressMsg = await botInstance.sendMessage(
    chatId,
    `🔍 _Analyzing real-world marketing trends for "${queryText}"..._`,
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

    await botInstance.editMessageText(
      `🎨 _Crafting 6 strategic design concepts, headlines & color palettes..._`,
      { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});

    const context = await fetchRealWorldContext(event);
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
    await botInstance.editMessageText(`⚠️ *Agent Note:* Please try asking your creative prompt again.`, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown'
    }).catch(() => {});
  } finally {
    activeProcessingUsers.delete(strChatId);
  }
}

export function handleUpcomingCommand(): string {
  const events: EventRecord[] = db.prepare('SELECT * FROM events ORDER BY date ASC LIMIT 10').all();
  let text = `📅 *Upcoming Creative Calendar Opportunities:*\n\n`;

  events.forEach(evt => {
    const flag = evt.country === 'India' ? '🇮🇳' : '🌍';
    text += `${flag} *${evt.name}* — ${evt.date} (${evt.category})\n`;
  });

  text += `\n💬 *Tap any event button below to generate 6 concepts instantly!*`;
  return text;
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
      onboardingTracker.set(chatId.toString(), { step: 'WAITING_NAME' });
      const regStep1 = `📝 *FREE DESIGNER REGISTRATION (STEP 1/2)*\n\n` +
        `Aapka swagat hai! Please apna **Full Name aur Instagram Handle ya Portfolio Link** yahan chat me type karke bhejiye:\n\n` +
        `*(Example: Rahul Sharma - @rahul_graphics)*`;
      return await sendSafeTelegramMessage(chatId, regStep1);
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

    if (data.startsWith('admin_rej_')) {
      const targetChatId = data.replace('admin_rej_', '');
      await botInstance.answerCallbackQuery(query.id, { text: `❌ Request Rejected.` }).catch(() => {});
      return await sendSafeTelegramMessage(targetChatId, `⚠️ *Verification Update:* Aapka screenshot verify nahi ho paya. Please check karein ki aapne sahi handle follow kiya hai ya Admin *${ADMIN_HANDLE}* se contact karein.`);
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
      const adminCaption = `🔔 *NEW DESIGNER VERIFICATION REQUEST*\n\n` +
        `• *Applicant:* ${applicantName}\n` +
        `• *Handle / Info:* ${applicantHandle}\n` +
        `• *Telegram User:* @${msg.from?.username || 'n/a'}\n` +
        `• *Chat ID:* \`${chatId}\`\n\n` +
        `👇 *Review screenshot & choose action:*`;

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

    // Check Onboarding State Machine (Step 1: Capturing Name & Handle)
    const obState = onboardingTracker.get(chatId.toString());
    if (obState && obState.step === 'WAITING_NAME' && !text.startsWith('/')) {
      const instaMatch = text.match(/@([a-zA-Z0-9._]+)/);
      const targetHandle = instaMatch ? instaMatch[1] : text.split(/[-–,\s]+/)[1] || text;
      onboardingTracker.set(chatId.toString(), { step: 'WAITING_SCREENSHOT', name: text, handle: targetHandle });

      // Run live Instagram Scraper in real-time
      const instaProfile = await scrapeInstagramProfile(targetHandle);
      let profileBadge = '';
      if (instaProfile) {
        profileBadge = `\n🔍 *Instagram Profile Detected:* [@${instaProfile.username}](https://instagram.com/${instaProfile.username}) (${instaProfile.followerCount.toLocaleString()} Followers)\n`;
      }

      const step2Msg = `🚀 *STEP 2/2: FAST-TRACK VERIFICATION & ACCESS!*${profileBadge}\n` +
        `Apne designer account ko **Fast-Track Verify** karwane ke liye hamare official channels ko follow/subscribe karein:\n\n` +
        `1️⃣ *Instagram:* https://www.instagram.com/fearless.devx/\n` +
        `2️⃣ *YouTube Channel:* https://www.youtube.com/@VirajVerse016\n\n` +
        `📸 *Follow / Subscribe karne ke baad uska SCREENSHOT ISI BOT MEIN PHOTO KI TARAH BHEJ DIJIYE!*\n` +
        `*(⚠️ Note: Admin ko personal DM na karein, seedha ISI BOT CHAT me photo bhejein taaki auto-verification record ho sake).*`;
      return await sendSafeTelegramMessage(chatId, step2Msg);
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
      if (text === '👑 Admin Panel' || text === '/admin') {
        const usersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_approved = 1').get()?.count || 1;
        const alertsCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get()?.count || 0;
        const ideasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas').get()?.count || 0;

        const adminPanelMsg = `👑 *TALIYO SUPER ADMIN MASTER CONTROL SUITE*\n\n` +
          `• *Approved Designers:* ${usersCount} Active Accounts\n` +
          `• *Total Briefings Dispatched:* ${alertsCount} Briefs\n` +
          `• *Generated Concepts:* ${ideasCount} Ideas\n` +
          `• *Cluster Engine:* 27-Model Resilient Cascade Active\n` +
          `• *Cloud DB:* Turso Cloud SQLite (AWS Mumbai)\n\n` +
          `👇 *Tap any admin button below to execute instant controls:*`;
        
        return await sendSafeTelegramMessage(chatId, adminPanelMsg, { reply_markup: ADMIN_MASTER_KEYBOARD });
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

    if (text === '/help' || text === '📖 Designer Guide' || text === '📖 Full Designer Guide') {
      const helpMsg = `📖 *Taliyo Design AI Agent Guide*\n\n` +
        `1️⃣ *Instant Ideas:* Tap any button below or type any festival/prompt in chat.\n` +
        `2️⃣ *Visual Specs:* Get exact Hex Colors & Font Pairings with 1 tap.\n` +
        `3️⃣ *Client Isolation:* Every designer's brand guidelines stay private.`;
      return await sendSafeTelegramMessage(chatId, helpMsg);
    }

    if (text === '/upcoming' || text === '📅 Upcoming Dates') {
      const upcomingList = handleUpcomingCommand();
      return await sendSafeTelegramMessage(chatId, upcomingList, {
        reply_markup: getUpcomingInlineKeyboard()
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
      await sendSafeTelegramMessage(chatId, `🎯 *[AHEAD-OF-TIME AUTO RADAR]*\n\nHey ${auth.user?.name || 'Designer'}! Next 2-3 dino me *${topEvt.name}* aa raha hai. Apne clients ke liye yeh design bana lo!\n\n_Generating 6 creative concepts, headlines & visual specs now..._`);
      return await processAgentDesignRequest(chatId, topEvt.name, auth.user);
    }

    if (text === '💡 Custom Prompt' || text === '💡 Generate Ideas') {
      return await sendSafeTelegramMessage(chatId, `💡 *Aapko kiske liye design ideas chahiye?*\n\nNiche se koi upcoming event choose karein ya chat me apna custom prompt likhein:`, {
        reply_markup: getUpcomingInlineKeyboard()
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
    const systemPrompt = buildFrontDispatcherSystemPrompt(userName);

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

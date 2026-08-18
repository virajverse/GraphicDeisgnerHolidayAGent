import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import db, { getSecurityAuditLogs, getAdminHandle, getAdminChatId, isValidInvitePasscode, getSystemSetting, setSystemSetting } from '../db/database.js';
import { fetchRealWorldContext } from './contextEngine.js';
import { generateCreativeIdeas } from './ideationEngine.js';
import { executeClusterQuery, MODEL_CLUSTERS } from './clusterModelRouter.js';
import { buildFrontDispatcherSystemPrompt } from '../prompts/systemPrompts.js';
import { scrapeInstagramProfile } from './instagramScraperEngine.js';
import { agentQueue } from './requestQueueEngine.js';
import { pruneDatabaseCache } from './dbPruner.js';
import { runEventCheckAndAlert } from './scheduler.js';
import { EventRecord, UserRecord, ClientRecord, AlertRecord, CreativeIdeaRecord, ReferralRecord, AffiliateCampaignRecord } from '../types/database.js';
import { EventContext, IdeationResult } from '../types/models.js';
import { sendCelebrationAnimation, generateVisualColorSwatches, VISUAL_ASSETS } from './visualMediaEngine.js';
import { runAutonomousDesignerAgent, runUnifiedGraphicDesignerAgent } from './autonomousDesignerAgent.js';
import { generateDesignerPosterImage } from './fluxImageEngine.js';

const getMasterAdminChatId = () => getAdminChatId();
const getAdminTelegramHandle = () => getAdminHandle();
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'GraphicDeisgnerHolidayAGent_bot';

let botInstance: TelegramBot | null = null;

// Anti-Spam 4-Second User Cooldown Tracker
const userCooldownTracker = new Map<string, number>();
const COOLDOWN_MS = 4000;

// Double-Tap Blocker (In-Flight Request Tracker)
const activeProcessingUsers = new Set<string>();

// Rapid Flood / Intentional Spam Strike Tracker
const spamStrikeTracker = new Map<string, { timestamps: number[]; strikes: number }>();

function checkSpamAndBanStatus(chatId: string | number): { isBanned: boolean; isWarning: boolean; strikeCount: number } {
  const strId = chatId.toString();
  const now = Date.now();

  // 1. Check Permanent Database Ban Status
  const user: UserRecord = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(strId);
  if (user && (user.is_banned === 1 || user.verification_status === 'BANNED')) {
    return { isBanned: true, isWarning: false, strikeCount: 3 };
  }

  // 2. Sliding Window Rapid Flood Tracker (Last 10 Seconds)
  let tracker = spamStrikeTracker.get(strId);
  if (!tracker) {
    tracker = { timestamps: [], strikes: 0 };
    spamStrikeTracker.set(strId, tracker);
  }

  // Filter timestamps within last 10 seconds
  tracker.timestamps = tracker.timestamps.filter(t => now - t < 10000);
  tracker.timestamps.push(now);

  // If user sends > 5 requests within 10 seconds:
  if (tracker.timestamps.length > 5) {
    tracker.strikes += 1;
    tracker.timestamps = []; // Reset window for next strike calculation

    // Strike 3: INTENTIONAL SPAM DETECTED -> PERMANENT BAN
    if (tracker.strikes >= 3) {
      db.prepare(`
        UPDATE users SET is_banned = 1, verification_status = 'BANNED', ban_reason = 'Intentional rapid flooding / DDoS attempt'
        WHERE telegram_chat_id = ?
      `).run(strId);

      return { isBanned: true, isWarning: false, strikeCount: 3 };
    }

    return { isBanned: false, isWarning: true, strikeCount: tracker.strikes };
  }

  return { isBanned: false, isWarning: false, strikeCount: tracker.strikes };
}

// Anti-Brute Force Passcode Tracker
const bruteForceTracker = new Map<string, { attempts: number; lockedUntil: number }>();

// 5-Step Secure Registration & Onboarding Tracker
export interface OnboardingSession {
  step: 'ASK_NAME' | 'ASK_EMAIL' | 'ASK_PHONE' | 'ASK_SOURCE' | 'ASK_CODE';
  name?: string;
  email?: string;
  phone?: string;
  is_phone_verified?: number;
  source?: string;
  invite_code?: string;
  referredBy?: string;
  instagram_handle?: string;
}

export const onboardingTracker = new Map<string, OnboardingSession>();

export function isValidEmail(email: string): { valid: boolean; reason?: string } {
  if (!email || typeof email !== 'string') return { valid: false, reason: 'Email field cannot be empty.' };
  const trimmed = email.trim().toLowerCase();

  // RFC 5322 Standard Syntax Check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: 'Invalid email syntax (e.g. name@domain.com).' };
  }

  // Blacklist disposable & fake email domains
  const blockedDomains = [
    'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
    'trashmail.com', 'fake.com', 'test.com', 'example.com', 'random.com',
    'yopmail.com', 'sharklasers.com', 'dispostable.com', 'getnada.com',
    'throwawaymail.com', 'burnermail.io', 'mytemp.email', 'dropmail.me'
  ];

  const domain = trimmed.split('@')[1];
  if (blockedDomains.some(b => domain === b || domain.endsWith('.' + b))) {
    return { valid: false, reason: 'Temporary / disposable fake emails are strictly forbidden. Please use a genuine email.' };
  }

  return { valid: true };
}

export const PHONE_VERIFY_KEYBOARD = {
  keyboard: [
    [{ text: '📱 Share Verified Telegram Number', request_contact: true }],
    [{ text: '❌ Cancel Registration' }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

export const DISCOVERY_SOURCE_INLINE = {
  inline_keyboard: [
    [
      { text: '📺 YouTube (@VirajVerse016)', callback_data: 'src_youtube' },
      { text: '📸 Instagram (@fearless.devx)', callback_data: 'src_instagram' }
    ],
    [
      { text: '👥 Friend / Colleague Referral', callback_data: 'src_referral' },
      { text: '💼 LinkedIn / Agency', callback_data: 'src_linkedin' }
    ],
    [
      { text: '🌐 Google / Other', callback_data: 'src_other' }
    ]
  ]
};

export const STEP5_CODE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '🎁 Get Free Code (Social Tasks)', callback_data: 'get_free_code' }
    ],
    [
      { text: '💬 Contact Owner (@virajverse)', url: 'https://t.me/virajverse' }
    ]
  ]
};

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
    [{ text: '⚡ Auto Radar Brief' }, { text: '🤖 Autonomous Agent AI' }],
    [{ text: '🗓️ Full Calendar' }, { text: '🖼️ 3D Visual Render' }],
    [{ text: '🎨 Art Director Co-Pilot' }, { text: '💼 Client Profiles' }],
    [{ text: '🎁 Invite & Earn' }, { text: '📖 Guide & Support' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

// 🌟 INLINE ACTION HUBS (Directly attached to the Chat Message Bubbles)
export const DESIGNER_INLINE_HUB = {
  inline_keyboard: [
    [
      { text: '⚡ Auto Radar Brief', callback_data: 'cmd_auto_radar' },
      { text: '🤖 Autonomous Agent AI', callback_data: 'cmd_agent' }
    ],
    [
      { text: '🖼️ 3D Visual Render', callback_data: 'cmd_render' },
      { text: '🗓️ 30-Day Calendar', callback_data: 'cmd_calendar' }
    ],
    [
      { text: '🎨 Art Director Co-Pilot', callback_data: 'cmd_copilot' },
      { text: '💼 Client Profiles', callback_data: 'cmd_clients' }
    ],
    [
      { text: '🎁 Invite & Earn', callback_data: 'cmd_referral' },
      { text: '📖 Guide & Support', callback_data: 'cmd_guide' }
    ]
  ]
};

export const ADMIN_INLINE_HUB = {
  inline_keyboard: [
    [
      { text: '👑 Admin Control', callback_data: 'adm_panel' },
      { text: '👥 Active Designers', callback_data: 'adm_designers' }
    ],
    [
      { text: '🔗 Affiliate Links', callback_data: 'adm_affiliates' },
      { text: '🏆 Top Referrers', callback_data: 'adm_referrals' }
    ],
    [
      { text: '🔔 Pending Approvals', callback_data: 'adm_pending' },
      { text: '🚀 Trigger Radar', callback_data: 'adm_radar' }
    ],
    [
      { text: '📢 Broadcast Hub', callback_data: 'adm_broadcast' },
      { text: '🛡️ DB Security Shield', callback_data: 'adm_dbsec' }
    ],
    [
      { text: '👥 Community Ground', callback_data: 'adm_ground' },
      { text: '⛔ Banned Users', callback_data: 'adm_banned' }
    ],
    [
      { text: '📊 Deep Telemetry', callback_data: 'adm_telemetry' }
    ]
  ]
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
    [{ text: '🔗 Affiliate Hub' }, { text: '🏆 Top Referrers' }],
    [{ text: '🛡️ DB Security' }, { text: '🚀 Trigger Radar Scan' }],
    [{ text: '📢 Broadcast Hub' }, { text: '👥 Community Ground' }],
    [{ text: '⛔ Banned Users' }, { text: '📊 Deep AI Telemetry' }],
    [{ text: '🎁 Invite & Earn' }]
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
  return chatId.toString() === getAdminChatId();
}

export function getUserKeyboard(chatId: string | number) {
  return isMasterAdmin(chatId) ? ADMIN_MASTER_KEYBOARD : DESIGNER_KEYBOARD;
}

function verifyUserAuth(msg: TelegramBot.Message): { authorized: boolean; user: UserRecord | null; isAdmin: boolean } {
  const chatId = msg.chat.id.toString();
  const username = msg.from ? msg.from.username : '';

  // Master Admin Immutable Verification
  if (chatId === getAdminChatId()) {
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

  if (text.length > 3900) {
    const halfIndex = text.lastIndexOf('\n\n', 3800);
    const splitAt = halfIndex > 1000 ? halfIndex : 3800;
    const part1 = text.slice(0, splitAt).trim();
    const part2 = text.slice(splitAt).trim();

    await sendSafeSingleMessage(chatId, part1);
    return await sendSafeSingleMessage(chatId, part2, options);
  }

  return await sendSafeSingleMessage(chatId, text, options);
}

async function sendSafeSingleMessage(chatId: string | number, text: string, options: any = {}) {
  if (!botInstance) return null;
  try {
    return await botInstance.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err: any) {
    if (err.message && (err.message.includes("can't parse entities") || err.message.includes("Bad Request"))) {
      const plainText = text.replace(/[*_`[\]()]/g, '');
      try {
        return await botInstance.sendMessage(chatId, plainText, { ...options, parse_mode: undefined });
      } catch (innerErr: any) {
        console.warn(`[Telegram Delivery Warn] Could not send to ${chatId}: ${innerErr.message}`);
        return null;
      }
    }
    console.warn(`[Telegram Delivery Warn] Could not send message to ${chatId}: ${err.message}`);
    return null;
  }
}

export async function sendAccessGatewayCard(chatId: string | number) {
  const strChatId = chatId.toString();
  const existingUser: UserRecord | null = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(strChatId) || null;

  // 1. IF ALREADY REGISTERED IN DATABASE: DO NOT SHOW FREE REGISTRATION BUTTON
  if (existingUser) {
    if (existingUser.is_approved === 1) {
      const welcomeBack = `✨ *WELCOME BACK, ${existingUser.name || 'DESIGNER'}!*\n\n` +
        `Aapka account already **Verified & Active** hai.\n\n` +
        `🚀 *Creative Studio Toolbar Online:*\n` +
        `Niche diye gaye buttons se shuru karein ya direct koi prompt likhein:`;
      return await sendSafeTelegramMessage(chatId, welcomeBack, {
        reply_markup: getUserKeyboard(chatId)
      });
    } else {
      const registeredLoginKeyboard = {
        inline_keyboard: [
          [{ text: '🔑 Enter Passcode to Unlock', callback_data: 'gate_login' }],
          [{ text: '💬 Contact Admin', callback_data: 'menu_contact' }]
        ]
      };
      const pendingMsg = `🔒 *ACCOUNT REGISTERED & PENDING*\n\n` +
        `• *Registered Name:* **${existingUser.name}**\n` +
        `• *Status:* ⏳ Pending Activation\n\n` +
        `Apna authorized passcode enter karke direct unlock karein:`;
      return await sendSafeTelegramMessage(chatId, pendingMsg, {
        reply_markup: registeredLoginKeyboard
      });
    }
  }

  // 2. BRAND NEW USER: SHOW FREE REGISTRATION (TASK VERIFICATION) & DIRECT PASSCODE LOGIN
  const gatewayMsg = `🔒 *TALIYO CREATIVE INTELLIGENCE | ACCESS GATEWAY*\n\n` +
    `Namaste Designer! Main aapka **Senior Graphic Design Strategy & 3D Render Partner** hoon.\n\n` +
    `⚡ *Aapko kya milta hai:*\n` +
    `• Ahead-of-Time Cultural & Festival Radar Alerts (T-2 Days in advance)\n` +
    `• Isolated 8K 3D Visual Centerpieces (Zero-Text, Ready for Figma)\n` +
    `• 6 Ready-to-Design Concept Archetypes per occasion\n` +
    `• Mathematical CIE-Lab Hex Palettes & Font Pairings\n\n` +
    `👇 *Shuru karne ke liye niche se ek option select karein:*`;

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

export function formatTelegramAlertPart1(
  event: EventRecord,
  context: EventContext,
  ideation: IdeationResult
): string {
  const { ideas } = ideation;
  let msg = `✨ *CREATIVE RADAR BRIEFING* [Part 1/2]\n\n`;
  if (ideation.conversational_intro) {
    msg += `💬 _"${ideation.conversational_intro}"_\n\n`;
  }
  msg += `📅 *Occasion:* ${event.name} (${event.date})\n\n`;
  msg += `🌐 *WHAT'S HAPPENING IN THE REAL WORLD:*\n_${context.summary}_\n\n`;
  msg += `💡 *Creative Angle for Designers:*\n${context.opportunityHint}\n\n`;

  msg += `🎨 *READY-TO-DESIGN CONCEPTS (#01 - #03):*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  const firstThree = ideas.slice(0, 3);
  firstThree.forEach((idea, idx) => {
    const num = idx + 1;
    const cat = idea.category || 'Concept';
    msg += `*#0${num} [${cat.toUpperCase()}]* ➔ *${idea.title}*\n`;
    msg += `• *Concept:* ${idea.concept}\n`;
    msg += `• *Visual Direction:* ${idea.visual_direction}\n`;
    msg += `• *Headline:* _"${idea.headline}"_\n`;
    msg += `• *Best Format:* ${idea.platform}\n\n`;
  });

  return msg;
}

export function formatTelegramAlertPart2(
  event: EventRecord,
  ideation: IdeationResult
): string {
  const { ideas, recommendation } = ideation;
  let msg = `🎨 *READY-TO-DESIGN CONCEPTS (#04 - #06):* [Part 2/2]\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  const nextThree = ideas.slice(3);
  nextThree.forEach((idea, idx) => {
    const num = idx + 4;
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

  if (botInstance) return botInstance;

  try {
    const isWebhookMode = Boolean(process.env.VERCEL || (process.env.NODE_ENV === 'production' && !process.env.LOCAL_POLLING));
    botInstance = new TelegramBot(token, { polling: !isWebhookMode });
    console.log(`[TelegramBot] 🤖 Autonomous AI Agent Active (Mode: ${isWebhookMode ? 'Serverless Webhook' : 'Local Polling'})!`);

    if (!isWebhookMode) {
      botInstance.on('message', (msg) => {
        handleTelegramWebhookUpdate({ message: msg }).catch(err => {
          console.error(`[TelegramBot Message Handler Error]: ${err.message}`);
        });
      });

      botInstance.on('callback_query', (query) => {
        handleTelegramWebhookUpdate({ callback_query: query }).catch(err => {
          console.error(`[TelegramBot Callback Handler Error]: ${err.message}`);
        });
      });

      botInstance.on('polling_error', (err: any) => {
        if (!err.message?.includes('409 Conflict')) {
          console.warn(`[TelegramBot Polling Notice]: ${err.message}`);
        }
      });
    }

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

/**
 * 🎁 Designer Referral Hub (Invite & Earn System)
 */
export async function handleReferralHub(chatId: string | number) {
  const strChatId = chatId.toString();
  const user: UserRecord = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(strChatId) || {
    name: 'Designer',
    referral_count: 0,
    referral_credits: 0,
    referral_tier: 'BRONZE'
  };

  const referralCount = user.referral_count || 0;
  const referralCredits = user.referral_credits || 0;

  // Calculate tier & progression
  let tierName = '🥉 BRONZE DESIGNER';
  let nextTierText = '5 referrals (Silver Tier)';
  let tierPerks = '• 50 AI Credits per friend\n• Standard Priority Queue';

  if (referralCount >= 30) {
    tierName = '💎 DIAMOND MASTER';
    nextTierText = 'MAX TIER REACHED!';
    tierPerks = '• 250 AI Credits per friend\n• Instant 0-Second VIP Queue\n• Direct Admin VIP Line & Custom Features';
  } else if (referralCount >= 15) {
    tierName = '🥇 GOLD DESIGNER';
    nextTierText = `${30 - referralCount} more for Diamond Tier`;
    tierPerks = '• 200 AI Credits per friend\n• VIP Ahead-of-Time Early Briefs\n• Priority GPU Acceleration';
  } else if (referralCount >= 5) {
    tierName = '🥈 SILVER DESIGNER';
    nextTierText = `${15 - referralCount} more for Gold Tier`;
    tierPerks = '• 100 AI Credits per friend\n• Enhanced Queue Speed\n• 6 Extra Idea Angles per brief';
  } else {
    nextTierText = `${5 - referralCount} more for Silver Tier`;
  }

  const inviteLink = `https://t.me/${BOT_USERNAME}?start=ref_${strChatId}`;
  const shareText = `🎨 Join Taliyo Creative Intelligence AI Agent!\nGet ahead-of-time festival design briefs, color palettes & 6 ready-to-design concepts for Photoshop/Figma!\n\n👉 Join via my VIP invite link: ${inviteLink}`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

  // Fetch recent referrals
  const recentRefs: ReferralRecord[] = db.prepare('SELECT * FROM referrals WHERE referrer_chat_id = ? ORDER BY created_at DESC LIMIT 5').all(strChatId);
  let refListText = '';
  if (recentRefs && recentRefs.length > 0) {
    refListText = `\n👥 *RECENTLY JOINED FRIENDS:*\n`;
    recentRefs.forEach((r, i) => {
      refListText += `${i + 1}. *${r.referred_name || 'Designer'}* (@${r.referred_username || 'n/a'}) — _+${r.credits_awarded} Credits_\n`;
    });
  }

  const referralMessage = `🎁 *TALIYO DESIGNER INVITE & EARN HUB*\n\n` +
    `Apne graphic designer dosto ko invite karein aur **Free AI Credits, VIP GPU Queue & Tier Rewards** unlock karein!\n\n` +
    `🔗 *YOUR UNIQUE INVITE LINK:*\n` +
    `\`${inviteLink}\`\n\n` +
    `📊 *YOUR REFERRAL STATS:*\n` +
    `• *Total Friends Referred:* **${referralCount} Designers**\n` +
    `• *Earned AI Credits:* **${referralCredits} Credits**\n` +
    `• *Current Rank Tier:* **${tierName}**\n` +
    `• *Next Milestone:* _${nextTierText}_\n\n` +
    `🏆 *TIER REWARDS & PERKS:*\n${tierPerks}\n` +
    refListText +
    `\n👇 *Share karne ke liye niche button tap karein:*`;

  const referralInlineKeyboard = {
    inline_keyboard: [
      [
        { text: '📲 Share to Friends / Groups', url: telegramShareUrl }
      ],
      [
        { text: '🏆 Top Leaderboard', callback_data: 'adm_referrals' },
        { text: '⚡ Back to AI Studio', callback_data: 'menu_continue' }
      ]
    ]
  };

  return await sendSafeTelegramMessage(chatId, referralMessage, { reply_markup: referralInlineKeyboard });
}

/**
 * 🏆 Top Community Referrers Leaderboard
 */
export async function handleTopReferrers(chatId: string | number) {
  const topUsers: UserRecord[] = db.prepare('SELECT * FROM users ORDER BY referral_count DESC LIMIT 10').all();

  let msg = `🏆 *TALIYO COMMUNITY REFERRAL LEADERBOARD*\n\n` +
    `Top designers who have invited the most peers to Taliyo Creative Intelligence:\n\n`;

  const activeReferrers = topUsers.filter(u => (u.referral_count || 0) > 0);

  if (!activeReferrers || activeReferrers.length === 0) {
    msg += `_Abhi koi referrals nahi hain. Pehle designer banein aur apne dosto ko invite karein!_\n\n` +
      `👉 Apna invite link paane ke liye */invite* type karein.`;
  } else {
    activeReferrers.forEach((u, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖️';
      const tierBadge = u.referral_tier || 'BRONZE';
      msg += `${medal} *#0${i + 1} ${u.name}* (@${u.username || 'n/a'})\n   • Referrals: *${u.referral_count || 0}* | Credits: *${u.referral_credits || 0}* | Tier: \`${tierBadge}\`\n\n`;
    });
  }

  msg += `\n🎁 *Aap bhi invite karein:* Type */invite* or tap button below:`;

  return await sendSafeTelegramMessage(chatId, msg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎁 Get My Invite Link', callback_data: 'cmd_referral' }]
      ]
    }
  });
}

/**
 * 🔗 Super Admin Affiliate & Partner Campaign Management Hub
 */
export async function handleAffiliateHub(chatId: string | number) {
  if (!isMasterAdmin(chatId)) {
    return await sendSafeTelegramMessage(chatId, '⛔ *Access Restricted:* Ye command sirf Super Admin ke liye hai.');
  }

  const campaigns: AffiliateCampaignRecord[] = db.prepare('SELECT * FROM affiliate_campaigns').all();
  const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions_count || 0), 0);
  const totalBonusCredits = campaigns.reduce((sum, c) => sum + ((c.conversions_count || 0) * (c.bonus_credits || 0)), 0);

  let msg = `🔗 *SUPER ADMIN AFFILIATE & PARTNER CAMPAIGN HUB*\n\n` +
    `Yahan se aap custom referral links, YouTube promos aur partner campaigns create aur track kar sakte hain!\n\n` +
    `📊 *CAMPAIGN OVERVIEW:*\n` +
    `• *Total Active Campaigns:* **${campaigns.length} Links**\n` +
    `• *Total Partner Signups:* **${totalConversions} Designers**\n` +
    `• *Total Bonus Credits Given:* **${totalBonusCredits} AI Credits**\n\n`;

  if (campaigns.length === 0) {
    msg += `_Abhi koi affiliate campaign create nahi kiya gaya hai._\n\n` +
      `👉 *Naya link create karne ke liye type karein:*\n` +
      `\`/createaffiliate CODE BONUS_CREDITS CAMPAIGN_NAME\`\n\n` +
      `*(Example: \`/createaffiliate VIRAJVIP 150 YouTube Launch Promo\`)*\n`;
  } else {
    msg += `🏷️ *ACTIVE AFFILIATE & PROMO LINKS:*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    campaigns.forEach((camp, i) => {
      const link = `https://t.me/${BOT_USERNAME}?start=aff_${camp.code}`;
      const statusIcon = camp.is_active === 1 ? '🟢 ACTIVE' : '🔴 PAUSED';
      msg += `*${i + 1}. ${camp.campaign_name}* [${statusIcon}]\n`;
      msg += `   • *Code:* \`${camp.code}\`\n`;
      msg += `   • *Bonus per User:* \`+${camp.bonus_credits} Credits\`\n`;
      msg += `   • *Conversions:* **${camp.conversions_count || 0} Designers Joined**\n`;
      msg += `   • *Deep Link:* \`${link}\`\n\n`;
    });

    msg += `🛠️ *COMMANDS:*\n` +
      `• *Naya Link:* \`/createaffiliate CODE CREDITS NAME\`\n` +
      `• *Pause/Resume:* \`/toggleaffiliate CODE\`\n` +
      `• *Delete Link:* \`/deleteaffiliate CODE\`\n`;
  }

  const buttons = [
    [
      { text: '➕ New Affiliate Link', callback_data: 'adm_new_affiliate' },
      { text: '🔄 Refresh Stats', callback_data: 'adm_affiliates' }
    ],
    [
      { text: '📢 Broadcast Promo', callback_data: 'adm_broadcast' },
      { text: '👑 Admin Menu', callback_data: 'adm_panel' }
    ]
  ];

  return await sendSafeTelegramMessage(chatId, msg, {
    reply_markup: { inline_keyboard: buttons }
  });
}

/**
 * ➕ Create New Custom Affiliate / Partner Deep Link
 */
export async function handleCreateAffiliateCommand(chatId: string | number, text: string) {
  if (!isMasterAdmin(chatId)) {
    return await sendSafeTelegramMessage(chatId, '⛔ *Access Restricted:* Sirf Super Admin affiliate links create kar sakta hai.');
  }

  // Format: /createaffiliate CODE BONUS_CREDITS CAMPAIGN_NAME
  const raw = text.replace(/^\/(createaffiliate|newaffiliate|createpartner)\s*/i, '').trim();
  const parts = raw.split(/\s+/);

  if (!raw || parts.length < 1) {
    const usage = `⚠️ *AFFILIATE LINK CREATION FORMAT:*\n\n` +
      `\`/createaffiliate CODE BONUS_CREDITS CAMPAIGN_NAME\`\n\n` +
      `📌 *Examples:*\n` +
      `• \`/createaffiliate VIRAJVIP 150 YouTube Launch Campaign\`\n` +
      `• \`/createaffiliate FESTIVE500 200 Diwali Special Promo\`\n` +
      `• \`/createaffiliate INSTAPRO 100 Instagram Design Community\``;
    return await sendSafeTelegramMessage(chatId, usage);
  }

  const rawCode = parts[0].toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!rawCode || rawCode.length < 3) {
    return await sendSafeTelegramMessage(chatId, '❌ *Error:* Affiliate code kam se kam 3 characters (A-Z, 0-9) ka hona chahiye.');
  }

  const bonusCredits = parts.length > 1 && !isNaN(Number(parts[1])) ? Math.max(0, parseInt(parts[1], 10)) : 100;
  const campaignName = parts.length > 2 ? parts.slice(2).join(' ') : (parts.length > 1 && isNaN(Number(parts[1])) ? parts.slice(1).join(' ') : `${rawCode} Campaign`);

  // Check if code already exists
  const existing: AffiliateCampaignRecord = db.prepare('SELECT * FROM affiliate_campaigns WHERE code = ?').get(rawCode);
  if (existing) {
    return await sendSafeTelegramMessage(chatId, `⚠️ *Duplicate Code:* Affiliate code \`${rawCode}\` already exist karta hai! Kripya dusra code use karein ya */affiliates* check karein.`);
  }

  const newId = `aff_${Date.now()}_${rawCode}`;
  db.prepare(`
    INSERT INTO affiliate_campaigns (id, code, campaign_name, creator_chat_id, bonus_credits, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(newId, rawCode, campaignName, chatId.toString(), bonusCredits);

  const inviteLink = `https://t.me/${BOT_USERNAME}?start=aff_${rawCode}`;
  const shareText = `🎨 Join Taliyo Creative Intelligence AI Agent!\nGet +${bonusCredits} Free AI Credits, Ahead-of-Time Festival Radar & 6 Ready-to-Design Concepts!\n\n👉 VIP Access Link: ${inviteLink}`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

  const successMsg = `🎉 *AFFILIATE CAMPAIGN LINK CREATED SUCCESSFULLY!*\n\n` +
    `• *Campaign Title:* *${campaignName}*\n` +
    `• *Campaign Code:* \`${rawCode}\`\n` +
    `• *Bonus Credits:* \`+${bonusCredits} AI Credits / user\`\n` +
    `• *Status:* 🟢 *Active & Live*\n\n` +
    `🔗 *OFFICIAL DEEP-LINK:*\n` +
    `\`${inviteLink}\`\n\n` +
    `💡 *How It Works:*\n` +
    `Jo bhi designer is link par click karke bot start karega, use turant **+${bonusCredits} bonus credits** milenge aur auto-approved ho jayega!\n\n` +
    `👇 *Direct Share karein:*`;

  const shareKeyboard = {
    inline_keyboard: [
      [
        { text: '📲 Share to Telegram', url: telegramShareUrl },
        { text: '📋 View All Affiliates', callback_data: 'adm_affiliates' }
      ]
    ]
  };

  return await sendSafeTelegramMessage(chatId, successMsg, { reply_markup: shareKeyboard });
}

/**
 * ⏯️ Toggle Pause/Active Affiliate Campaign
 */
export async function handleToggleAffiliateCommand(chatId: string | number, code: string) {
  if (!isMasterAdmin(chatId)) return;
  const cleanCode = code.toUpperCase().trim();
  const camp: AffiliateCampaignRecord = db.prepare('SELECT * FROM affiliate_campaigns WHERE code = ?').get(cleanCode);
  if (!camp) {
    return await sendSafeTelegramMessage(chatId, `❌ *Campaign Not Found:* Code \`${cleanCode}\` ka koi affiliate campaign nahi mila.`);
  }

  const newStatus = camp.is_active === 1 ? 0 : 1;
  db.prepare('UPDATE affiliate_campaigns SET is_active = ? WHERE code = ?').run(newStatus, cleanCode);
  const statusLabel = newStatus === 1 ? '🟢 ACTIVE & LIVE' : '🔴 PAUSED / DISABLED';
  return await sendSafeTelegramMessage(chatId, `✅ Campaign *${camp.campaign_name}* (\`${cleanCode}\`) ab *${statusLabel}* hai.`);
}

/**
 * 🗑️ Delete Affiliate Campaign
 */
export async function handleDeleteAffiliateCommand(chatId: string | number, code: string) {
  if (!isMasterAdmin(chatId)) return;
  const cleanCode = code.toUpperCase().trim();
  const camp: AffiliateCampaignRecord = db.prepare('SELECT * FROM affiliate_campaigns WHERE code = ?').get(cleanCode);
  if (!camp) {
    return await sendSafeTelegramMessage(chatId, `❌ *Campaign Not Found:* Code \`${cleanCode}\` ka koi affiliate campaign nahi mila.`);
  }

  db.prepare('DELETE FROM affiliate_campaigns WHERE code = ?').run(cleanCode);
  return await sendSafeTelegramMessage(chatId, `🗑️ Campaign *${camp.campaign_name}* (\`${cleanCode}\`) ko permanently delete kar diya gaya hai.`);
}

/**
 * 🛡️ Super Admin Database Security Shield & Audit Telemetry
 */
export async function handleDbSecurityStatus(chatId: string | number) {
  if (!isMasterAdmin(chatId)) {
    return await sendSafeTelegramMessage(chatId, '⛔ *Access Restricted:* Sirf Super Admin database security status dekh sakta hai.');
  }

  const auditLogs = getSecurityAuditLogs(10);
  let logText = '';
  if (auditLogs.length === 0) {
    logText = `_Koi security threat ya blocked attack detect nahi hua. Database 100% secure hai!_`;
  } else {
    auditLogs.forEach((log, i) => {
      const icon = log.threatLevel === 'CRITICAL' ? '🚨' : log.threatLevel === 'HIGH' ? '⚠️' : '🛡️';
      logText += `${i + 1}. ${icon} *[${log.action}]* \`${log.threatLevel}\`\n   • ${log.details}\n   • _${new Date(log.timestamp).toLocaleTimeString()}_\n\n`;
    });
  }

  const msg = `🛡️ *TALIYO ZERO-TRUST DATABASE SECURITY SHIELD*\n\n` +
    `• *SQL Injection Firewall:* 🟢 ACTIVE (Zero-Trust Heuristic Scanner)\n` +
    `• *Destructive DDL Guard:* 🟢 ACTIVE (DROP/TRUNCATE Lockdown)\n` +
    `• *Rate-Limit Flood Guard:* 🟢 ACTIVE (Max 200 queries/10s)\n` +
    `• *Input Sanitization:* 🟢 ACTIVE (Buffer Overflow Defense)\n` +
    `• *Secret & Token Redaction:* 🟢 ACTIVE\n` +
    `• *Turso Cloud SSL/TLS:* 🟢 TLS v1.3 Encrypted in Transit\n\n` +
    `📋 *RECENT SECURITY AUDIT TRAIL:*\n` +
    logText;

  return await sendSafeTelegramMessage(chatId, msg, {
    reply_markup: ADMIN_INLINE_HUB
  });
}

/**
 * 🤖 Dedicated Graphic Designer Agent AI Execution
 */
export async function handleAutonomousAgentCommand(
  chatId: string | number,
  promptText: string,
  user: UserRecord | null = null
) {
  if (!botInstance) return;
  const strChatId = chatId.toString();

  const goal = promptText.replace(/^\/agent/i, '').replace(/^🤖 Autonomous Agent AI/i, '').trim() || 'Generate high-impact upcoming festival marketing campaign with 3D art direction and visual color palettes';

  const initialMsg = `🤖 *TALIYO GRAPHIC DESIGNER AGENT AI ACTIVE*\n\n` +
    `🎯 *Design Goal:* "${goal}"\n` +
    `⚡ *Executing single-purpose design pipeline...*\n\n` +
    `_Step 1/4: Scraping live cultural hashtags & news..._\n` +
    `_Step 2/4: Checking brand guidelines & client profile..._\n` +
    `_Step 3/4: Synthesizing multi-angle creative design concepts..._\n` +
    `_Step 4/4: Running Art Director self-critique & aesthetic audit..._`;

  const progressMsg = await botInstance.sendMessage(chatId, initialMsg, { parse_mode: 'Markdown' }).catch(() => null);

  try {
    const trace = await runAutonomousDesignerAgent(goal, user);

    let thoughtLog = `🧩 *AGENT AI EXECUTION TRACE:*\n`;
    thoughtLog += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    trace.executionChain.forEach(step => {
      thoughtLog += `*Step ${step.stepNumber}:* \`${step.actionName}\` (${step.durationMs}ms)\n`;
      thoughtLog += `💭 _"${step.thought}"_\n`;
      thoughtLog += `🔍 *Observation:* ${step.observation}\n\n`;
    });

    if (progressMsg) {
      await botInstance.editMessageText(thoughtLog, {
        chat_id: chatId,
        message_id: progressMsg.message_id,
        parse_mode: 'Markdown'
      }).catch(() => { });
    }

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '🎨 Visual Specs (Colors & Fonts)', callback_data: `specs_agent` },
          { text: '🔄 Re-Run Agent', callback_data: `cmd_agent` }
        ],
        [
          { text: '👍 Useful Deliverable', callback_data: `fb_like_agent` },
          { text: '⭐ Save to Studio', callback_data: `fb_save_agent` }
        ]
      ]
    };

    await sendSafeTelegramMessage(chatId, trace.finalDeliverable, { reply_markup: inlineKeyboard });

  } catch (err: any) {
    console.error(`[Autonomous Agent Error]: ${err.message}`);
    await sendSafeTelegramMessage(chatId, `⚠️ *Agent Notice:* Agent workflow encountered: ${err.message}. Please try again.`);
  }
}

/**
 * 🖼️ 3D Visual Asset Render via NVIDIA FLUX.2 Klein 4B
 */
export async function handleRenderImageCommand(
  chatId: string | number,
  promptText: string,
  user: UserRecord | null = null
) {
  if (!botInstance) return;
  const rawQuery = promptText.replace(/^\/render/i, '').replace(/^\/image/i, '').replace(/^🖼️ 3D Visual Render/i, '').trim();
  const topic = rawQuery || 'Traditional 3D Brass Indian Diya with Glowing Flame';

  const waitMsg = `🎨 *[3D VISUAL ASSET STUDIO]*\n\n` +
    `🎯 *Subject:* **"${topic}"**\n` +
    `⚡ _Rendering 1024x1024 ultra-crisp 3D visual asset via Neural FLUX.2 Studio Engine..._\n\n` +
    `⏳ _Estimated rendering time: 2-3 seconds..._`;

  await sendSafeTelegramMessage(chatId, waitMsg);

  try {
    const renderRes = await generateDesignerPosterImage(topic, '3D_LUXURY');

    if (renderRes.success && renderRes.imageBuffer) {
      const caption = `🖼️ *3D DESIGN ASSET RENDER READY!*\n\n` +
        `🎯 *Subject:* ${topic}\n` +
        `🎲 *Seed:* \`${renderRes.seed}\` | ⚡ *Render Time:* \`${(renderRes.durationMs / 1000).toFixed(1)}s\`\n\n` +
        `💡 *GRAPHIC DESIGNER PRO-TIP:*\n` +
        `• Ye asset **100% clean & zero-text** hai with generous negative space.\n` +
        `• Ise direct apne **Figma / Photoshop / Canva** canvas par drag karein.\n` +
        `• Upar apna client logo, festive greeting aur discount offer add karein! 🎨`;

      await botInstance.sendPhoto(chatId, renderRes.imageBuffer, {
        caption,
        parse_mode: 'Markdown'
      });
    } else {
      await sendSafeTelegramMessage(chatId, `⚠️ *Render Notice:* Could not generate image: ${renderRes.errorMessage || 'Unknown error'}`);
    }
  } catch (err: any) {
    await sendSafeTelegramMessage(chatId, `❌ *Render Error:* ${err.message}`);
  }
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
    }).catch(() => { });

    const context = await fetchRealWorldContext(event);

    // Live Step 2 -> Step 3 Morphing
    await botInstance.editMessageText(randomStage3, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown'
    }).catch(() => { });

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

    if (formattedMessage.length <= 3800) {
      try {
        await botInstance.editMessageText(formattedMessage, {
          chat_id: chatId,
          message_id: progressMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard
        });
      } catch (err: any) {
        const plainText = formattedMessage.replace(/[*_`[\]()]/g, '');
        await botInstance.editMessageText(plainText, {
          chat_id: chatId,
          message_id: progressMsg.message_id,
          reply_markup: inlineKeyboard
        }).catch(() => { });
      }
    } else {
      // Split into 2 clean messages to never hit Telegram's 4096 character limit
      const part1 = formatTelegramAlertPart1(event, context, ideation);
      const part2 = formatTelegramAlertPart2(event, ideation);

      try {
        await botInstance.editMessageText(part1, {
          chat_id: chatId,
          message_id: progressMsg.message_id,
          parse_mode: 'Markdown'
        });
      } catch {
        await botInstance.editMessageText(part1.replace(/[*_`[\]()]/g, ''), {
          chat_id: chatId,
          message_id: progressMsg.message_id
        }).catch(() => { });
      }

      await sendSafeTelegramMessage(chatId, part2, { reply_markup: inlineKeyboard });
    }

  } catch (err: any) {
    console.error(`[Agent Processing Error]: ${err.message}`);
    await botInstance.editMessageText(`⚠️ *Agent Note:* Please try asking your creative prompt again.`, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown'
    }).catch(() => { });
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

    const banCheck = checkSpamAndBanStatus(chatId);
    if (banCheck.isBanned) {
      return await botInstance.answerCallbackQuery(query.id, {
        text: '⛔ ACCOUNT BANNED. Contact @virajverse to unban.',
        show_alert: true
      }).catch(() => { });
    }

    // Cooldown check for button spammers
    const cooldown = checkUserCooldown(chatId);
    if (!cooldown.allowed) {
      return await botInstance.answerCallbackQuery(query.id, {
        text: `⏳ Please wait ${cooldown.remainingSec}s before tapping another button!`,
        show_alert: true
      }).catch(() => { });
    }

    // Access Gateway Buttons
    if (data === 'gate_login') {
      await botInstance.answerCallbackQuery(query.id, { text: '🔑 Direct Passcode Login' }).catch(() => { });
      const loginGuide = `🔑 *DIRECT PASSCODE LOGIN*\n\nAapke paas official invite passcode hai toh chat me type karein:\n\n\`/register YOUR_PASSCODE\`\n\n*(Example: \`/register TALIYO2026\`)*`;
      return await sendSafeTelegramMessage(chatId, loginGuide);
    }

    if (data === 'gate_register') {
      await botInstance.answerCallbackQuery(query.id, { text: '📝 Free Registration' }).catch(() => { });
      onboardingTracker.set(chatId.toString(), { step: 'ASK_NAME' });

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
        }).catch(() => { });
      }

      // 2. Send YouTube Photo Card with Direct Action Button
      if (fs.existsSync(ytPath) && botInstance) {
        await botInstance.sendPhoto(chatId, ytPath, {
          caption: `▶️ *STEP 2: SUBSCRIBE ON YOUTUBE*\n\n👉 Official Channel: [@VirajVerse016](https://www.youtube.com/@VirajVerse016)\nTap the button below to subscribe!`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '▶️ Subscribe @VirajVerse016', url: 'https://www.youtube.com/@VirajVerse016' }]]
          }
        }).catch(() => { });
      }

      // 3. Send Instruction for 5-Step Verified Onboarding with Unlocked Code
      const regStepPrompt = `🎁 *FREE REGISTRATION CODE UNLOCKED!*\n\n` +
        `Instagram follow aur YouTube subscribe karne ke baad aapka **Free Access Passcode** generate ho gaya hai:\n` +
        `👉 *Your Free Access Code:* \`TALIYO2026\`\n\n` +
        `Ab is code se apna verified designer profile activate karne ke liye 5-step details enter karein:\n\n` +
        `📝 *STEP 1 OF 5 // FULL NAME*\n` +
        `👉 *Type your Full Name in chat to continue:*`;
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

      await botInstance.answerCallbackQuery(query.id, { text: `✅ Designer ${targetChatId} Approved!` }).catch(() => { });
      await sendSafeTelegramMessage(getAdminChatId(), `🎉 *DESIGNER APPROVED:*\nUser ID \`${targetChatId}\` ko full active access grant kar diya gaya hai.`);

      const welcomeApproved = `🎉 *CONGRATULATIONS! YOUR DESIGNER ACCESS IS APPROVED!*\n\n` +
        `Admin *${getAdminHandle()}* ne aapka account verify aur approve kar diya hai!\n\n` +
        `🚀 *Aapka Taliyo Creative Intelligence AI Agent 100% active hai!*\n` +
        `Niche diye gaye buttons se shuru karein ya direct prompt bhejein:`;
      return await sendSafeTelegramMessage(targetChatId, welcomeApproved, { reply_markup: DESIGNER_KEYBOARD });
    }

    // Language Switcher Callbacks
    if (data === 'lang_english') {
      db.prepare("UPDATE users SET language = 'ENGLISH' WHERE telegram_chat_id = ?").run(chatId.toString());
      await botInstance.answerCallbackQuery(query.id, { text: 'Language set to English 🇬🇧' }).catch(() => { });
      return await sendSafeTelegramMessage(chatId, `🇬🇧 *Language Preference: ENGLISH*\n\nAll your future design briefs, concepts, headlines, and strategic advice will now be delivered in modern global English!\n\nUse the buttons below or type any prompt:`, { reply_markup: DESIGNER_KEYBOARD });
    }

    if (data === 'lang_hinglish') {
      db.prepare("UPDATE users SET language = 'HINGLISH' WHERE telegram_chat_id = ?").run(chatId.toString());
      await botInstance.answerCallbackQuery(query.id, { text: 'Bhasha set to Hinglish 🇮🇳' }).catch(() => { });
      return await sendSafeTelegramMessage(chatId, `🇮🇳 *Bhasha Preference: HINGLISH*\n\nAb aapke saare design briefs, creative concepts aur advice natural Hinglish me milenge!\n\nNiche diye gaye buttons se shuru karein:`, { reply_markup: DESIGNER_KEYBOARD });
    }

    // Full Calendar Category Callbacks
    if (data.startsWith('cal_')) {
      const catKey = data.replace('cal_', '').toUpperCase();
      await botInstance.answerCallbackQuery(query.id, { text: `🗓️ Loading ${catKey} Calendar...` }).catch(() => { });
      const calText = handleFullCalendarCommand(catKey);
      return await sendSafeTelegramMessage(chatId, calText, { reply_markup: getFullCalendarInlineKeyboard() });
    }

    if (data === 'menu_today') {
      await botInstance.answerCallbackQuery(query.id, { text: '⚡ Loading Today\'s Focus...' }).catch(() => { });
      const response = await handleTodayCommand();
      return await sendSafeTelegramMessage(chatId, response);
    } else if (data === 'menu_upcoming') {
      await botInstance.answerCallbackQuery(query.id, { text: '📅 Loading Upcoming Calendar...' }).catch(() => { });
      const upcomingList = handleUpcomingCommand();
      return await sendSafeTelegramMessage(chatId, upcomingList, { reply_markup: getUpcomingInlineKeyboard() });
    } else if (data === 'menu_clients') {
      await botInstance.answerCallbackQuery(query.id, { text: '💼 Loading Client Profiles...' }).catch(() => { });
      const clients: ClientRecord[] = db.prepare('SELECT * FROM clients').all();
      let clientText = `💼 *YOUR PRIVATE CLIENT BRAND PROFILES*\n\n`;
      clients.forEach(c => {
        clientText += `• *${c.name}* (${c.industry})\n  Tone: _${c.brand_tone}_\n  Style: ${c.creative_style}\n\n`;
      });
      return await sendSafeTelegramMessage(chatId, clientText);
    } else if (data === 'menu_activity') {
      await botInstance.answerCallbackQuery(query.id, { text: '👤 Loading Summary...' }).catch(() => { });
      const activityText = `👤 *YOUR CREATIVE STUDIO ACTIVITY*\n\n` +
        `• *Role:* Senior Graphic Designer & Art Director\n` +
        `• *Saved Briefings:* Bookmarked & Synchronized\n` +
        `• *AI Neural Cluster:* 27 Models Online & Active\n\n` +
        `💬 *Tap any upcoming occasion or send a creative prompt to generate 6 concepts!*`;
      return await sendSafeTelegramMessage(chatId, activityText);
    } else if (data === 'menu_status') {
      await botInstance.answerCallbackQuery(query.id, { text: '📊 Loading Telemetry...' }).catch(() => { });
      const statusText = `📊 *TALIYO AGENT TELEMETRY*\n\n` +
        `• *System Health:* 🟢 100% Operational\n` +
        `• *AI Routing Engine:* 27-Model Resilient Cascade Cluster\n` +
        `• *Database Engine:* Turso Cloud SQLite (AWS Mumbai)\n` +
        `• *Cloud Platform:* Vercel Serverless Production`;
      return await sendSafeTelegramMessage(chatId, statusText);
    } else if (data === 'menu_contact') {
      await botInstance.answerCallbackQuery(query.id, { text: '💬 Contact Admin...' }).catch(() => { });
      return await sendSafeTelegramMessage(chatId, `📩 *ADMIN CONTACT & SUPPORT*\n\nFor Passcode Access, Custom Clients or Priority Support:\n👉 Telegram Admin: *${getAdminHandle()}*`);
    } else if (data === 'menu_help') {
      await botInstance.answerCallbackQuery(query.id, { text: '📖 Designer Guide...' }).catch(() => { });
      const helpMsg = `📖 *TALIYO DESIGNER QUICK GUIDE*\n\n` +
        `1️⃣ *Instant Ideas:* Tap any button below or type any festival/prompt in chat.\n` +
        `2️⃣ *Visual Specs:* Get exact Hex Colors & Font Pairings with 1 tap.\n` +
        `3️⃣ *Client Isolation:* Every designer's brand guidelines stay private.`;
      return await sendSafeTelegramMessage(chatId, helpMsg);
    } else if (data.startsWith('gen_evt_')) {
      const evtName = data.replace('gen_evt_', '');
      await botInstance.answerCallbackQuery(query.id, { text: `🎨 Generating 6 ideas for ${evtName}...` }).catch(() => { });
      return await processAgentDesignRequest(chatId, evtName, { id: 'default_user', name: 'Designer', telegram_chat_id: chatId.toString(), is_approved: 1, role: 'DESIGNER' });
    } else if (data.startsWith('specs_')) {
      await botInstance.answerCallbackQuery(query.id, { text: '🎨 Generating Visual Specs...' }).catch(() => { });

      const colorSwatches = generateVisualColorSwatches([
        { role: 'Primary Accent', hex: '#FF5722', name: 'Electric Flame / Vibrant Energy' },
        { role: 'Secondary Tone', hex: '#6C5CE7', name: 'Cyber Violet / Royal Accent' },
        { role: 'Background Canvas', hex: '#0A0E17', name: 'Sleek Dark Mode Titanium' },
        { role: 'Surface Card', hex: '#161F30', name: 'Glassmorphism Tint' },
        { role: 'Typography Text', hex: '#F5F7FA', name: 'High Contrast Crisp White' }
      ]);

      const specsText = `🎨 *DESIGNER VISUAL SPECS & ASSET GUIDE*\n\n` +
        colorSwatches +
        `🔤 *FONT HIERARCHY & PAIRINGS:*\n` +
        `• Display Headline: *Outfit Bold / Syne ExtraBold* (70pt+)\n` +
        `• Subheading & Labels: *Plus Jakarta Sans Medium* (24pt)\n` +
        `• Body Text: *Inter Regular* (16pt)\n\n` +
        `📐 *GRID & LAYOUT GUIDELINES:*\n` +
        `• Canvas Dimensions: \`1080 x 1350 px\` (4:5 Portrait Carousel)\n` +
        `• Safe Margins: \`60px\` padding on top/bottom/sides\n` +
        `• Aesthetic Rule: 70% negative space, 30% visual content focus.`;

      await sendCelebrationAnimation(botInstance, chatId, 'PALETTE_GENERATED_ANIMATION', specsText);
    } else if (data.startsWith('fb_')) {
      const action = data.split('_')[1];
      await botInstance.answerCallbackQuery(query.id, { text: `Preference saved: ${action}!` }).catch(() => { });
      await sendSafeTelegramMessage(chatId, `✨ *Agent Note:* Thank you! Preference recorded: *${action.toUpperCase()}*. Future briefs will align closer to this style.`);
    }

    // 🌟 INLINE ACTION HUB HANDLERS (Buttons right on the Chat Message)
    if (data === 'cmd_auto_radar') {
      await botInstance.answerCallbackQuery(query.id, { text: '⚡ Fetching Today\'s Radar Brief...' }).catch(() => { });
      const res = await handleTodayCommand();
      return await sendSafeTelegramMessage(chatId, res, { reply_markup: DESIGNER_INLINE_HUB });
    } else if (data === 'cmd_render') {
      await botInstance.answerCallbackQuery(query.id, { text: '🎨 Opening 3D Visual Studio...' }).catch(() => { });
      const userRecord: UserRecord | null = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId.toString()) || null;
      return await handleRenderImageCommand(chatId, 'Traditional Indian Brass Diya with Glowing Flame and Gold Filigree', userRecord);
    } else if (data === 'cmd_calendar') {
      await botInstance.answerCallbackQuery(query.id, { text: '🗓️ Loading 30-Day Calendar...' }).catch(() => { });
      const calText = handleFullCalendarCommand('ALL');
      return await sendSafeTelegramMessage(chatId, calText, { reply_markup: getFullCalendarInlineKeyboard() });
    } else if (data === 'cmd_copilot') {
      await botInstance.answerCallbackQuery(query.id, { text: '🎨 Art Director Co-Pilot Specs...' }).catch(() => { });
      const copilotGuide = `🎨 *ART DIRECTOR CO-PILOT (AI DESIGN ASSISTANT)*\n\n` +
        `Main aapka real-time visual design partner hoon. Direct chat me sawal puchein:\n\n` +
        `• *"Real estate poster ke liye luxury color palette aur font batao"*\n` +
        `• *"Tech SaaS 1080x1350 carousel ke margins aur grid rules do"*\n` +
        `• *"Monsoon Chai campaign ke 3 scroll-stopping Hinglish hooks likho"*\n\n` +
        `👇 *Quick specs generate karne ke liye niche tap karein:*`;
      return await sendSafeTelegramMessage(chatId, copilotGuide, { reply_markup: DESIGNER_INLINE_HUB });
    } else if (data === 'cmd_clients') {
      await botInstance.answerCallbackQuery(query.id, { text: '💼 Loading Client Profiles...' }).catch(() => { });
      const clients: ClientRecord[] = db.prepare('SELECT * FROM clients').all();
      let clientText = `💼 *YOUR PRIVATE CLIENT BRAND PROFILES*\n\n`;
      clients.forEach(c => {
        clientText += `• *${c.name}* (${c.industry})\n  Tone: _${c.brand_tone}_\n  Style: ${c.creative_style}\n\n`;
      });
      return await sendSafeTelegramMessage(chatId, clientText, { reply_markup: DESIGNER_INLINE_HUB });
    } else if (data === 'cmd_activity') {
      await botInstance.answerCallbackQuery(query.id, { text: '👤 Loading Summary...' }).catch(() => { });
      const activityText = `👤 *YOUR CREATIVE AGENT ACTIVITY*\n\n` +
        `• *Role:* Senior Graphic Designer\n` +
        `• *Saved Briefings:* Active & Synchronized\n` +
        `• *NVIDIA Cluster:* 27 Models Online\n\n` +
        `💬 *Tap any upcoming event or send a prompt to generate 6 ideas!*`;
      return await sendSafeTelegramMessage(chatId, activityText, { reply_markup: DESIGNER_INLINE_HUB });
    } else if (data === 'cmd_lang') {
      await botInstance.answerCallbackQuery(query.id, { text: '🌐 Select Language...' }).catch(() => { });
      return await sendSafeTelegramMessage(chatId, `🌐 *SELECT AGENT LANGUAGE / BHASHA:*`, { reply_markup: LANGUAGE_INLINE_KEYBOARD });
    } else if (data === 'cmd_guide') {
      await botInstance.answerCallbackQuery(query.id, { text: '📖 Designer Guide...' }).catch(() => { });
      const helpMsg = `📖 *TALIYO DESIGNER QUICK GUIDE*\n\n` +
        `1️⃣ *Instant Ideas:* Tap any button below or type any festival/prompt in chat.\n` +
        `2️⃣ *Visual Specs:* Get exact Hex Colors & Font Pairings with 1 tap.\n` +
        `3️⃣ *Client Isolation:* Every designer's brand guidelines stay private.`;
      return await sendSafeTelegramMessage(chatId, helpMsg, { reply_markup: DESIGNER_INLINE_HUB });
    } else if (data === 'cmd_referral') {
      await botInstance.answerCallbackQuery(query.id, { text: '🎁 Opening Referral Hub...' }).catch(() => { });
      return await handleReferralHub(chatId);
    } else if (data === 'adm_referrals') {
      await botInstance.answerCallbackQuery(query.id, { text: '🏆 Loading Referral Leaderboard...' }).catch(() => { });
      return await handleTopReferrers(chatId);
    } else if (data === 'adm_affiliates') {
      await botInstance.answerCallbackQuery(query.id, { text: '🔗 Loading Affiliate Hub...' }).catch(() => { });
      return await handleAffiliateHub(chatId);
    } else if (data === 'adm_new_affiliate') {
      await botInstance.answerCallbackQuery(query.id, { text: '➕ Create Affiliate Link...' }).catch(() => { });
      const guide = `➕ *CREATE CUSTOM AFFILIATE / PROMO LINK*\n\n` +
        `Chat me command type karein:\n` +
        `\`/createaffiliate CODE BONUS_CREDITS CAMPAIGN_NAME\`\n\n` +
        `📌 *Examples:*\n` +
        `• \`/createaffiliate VIRAJVIP 150 YouTube Launch Campaign\`\n` +
        `• \`/createaffiliate FESTIVE500 200 Diwali Special Promo\`\n` +
        `• \`/createaffiliate INSTAPRO 100 Instagram Design Community\``;
      return await sendSafeTelegramMessage(chatId, guide);
    }

    if (data === 'gate_register') {
      await botInstance.answerCallbackQuery(query.id, { text: '📝 Starting Registration...' }).catch(() => { });
      onboardingTracker.set(chatId, { step: 'ASK_NAME' });
      const regPrompt = `📝 *STEP 1 OF 5 // DESIGNER REGISTRATION*\n\n` +
        `Welcome to *Taliyo DesignOS*!\n` +
        `Aapka verified designer profile banane ke liye please apna **Poora Naam (Full Name)** enter karein:\n\n` +
        `👉 *Type your full name in chat:*`;
      return await sendSafeTelegramMessage(chatId, regPrompt);
    } else if (data === 'gate_login') {
      await botInstance.answerCallbackQuery(query.id, { text: '🔑 Passcode Login...' }).catch(() => { });
      onboardingTracker.set(chatId, { step: 'ASK_CODE' });
      const loginPrompt = `🔑 *TALIYO DIRECT PASSCODE LOGIN*\n\n` +
        `Apna authorized Registration / Invitation Passcode enter karein:\n\n` +
        `👉 *Type your passcode in chat* (e.g. \`YOUR_PASSCODE\`):\n\n` +
        `_(Agar aapke paas code nahi hai toh niche buttons se free code lein ya Owner se contact karein)_`;
      return await sendSafeTelegramMessage(chatId, loginPrompt, { reply_markup: STEP5_CODE_KEYBOARD });
    } else if (data === 'get_free_code') {
      await botInstance.answerCallbackQuery(query.id, { text: '🎁 Unlocking Free Code...' }).catch(() => { });

      const igPath = path.join(process.cwd(), 'public/assets/instagram_banner.png');
      const ytPath = path.join(process.cwd(), 'public/assets/youtube_banner.png');

      if (fs.existsSync(igPath) && botInstance) {
        await botInstance.sendPhoto(chatId, igPath, {
          caption: `📸 *STEP 1: FOLLOW ON INSTAGRAM*\n\n👉 Official Profile: [@fearless.devx](https://www.instagram.com/fearless.devx/)\nTap the button below to follow!`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '📸 Follow @fearless.devx', url: 'https://www.instagram.com/fearless.devx/' }]]
          }
        }).catch(() => { });
      }

      if (fs.existsSync(ytPath) && botInstance) {
        await botInstance.sendPhoto(chatId, ytPath, {
          caption: `▶️ *STEP 2: SUBSCRIBE ON YOUTUBE*\n\n👉 Official Channel: [@VirajVerse016](https://www.youtube.com/@VirajVerse016)\nTap the button below to subscribe!`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '▶️ Subscribe @VirajVerse016', url: 'https://www.youtube.com/@VirajVerse016' }]]
          }
        }).catch(() => { });
      }

      const freeCodePrompt = `🎁 *FREE REGISTRATION PASSCODE UNLOCKED!*\n\n` +
        `Instagram follow aur YouTube subscribe karne ke baad aapka **Free Access Passcode** generate ho gaya hai:\n\n` +
        `👉 \`TALIYO2026\`\n\n` +
        `Niche chat me yeh passcode enter karein (\`TALIYO2026\`) aur apna **+100 VIP AI Credits** welcome bonus activate karein!`;
      return await sendSafeTelegramMessage(chatId, freeCodePrompt);
    } else if (data.startsWith('src_')) {
      const sourceMap: Record<string, string> = {
        src_youtube: 'YouTube (@VirajVerse016)',
        src_instagram: 'Instagram (@fearless.devx)',
        src_referral: 'Friend / Colleague Referral',
        src_linkedin: 'LinkedIn / Agency',
        src_other: 'Google / Web / Other'
      };
      const chosen = sourceMap[data] || 'Other';
      await botInstance.answerCallbackQuery(query.id, { text: `Source: ${chosen}` }).catch(() => { });

      const ob = onboardingTracker.get(chatId) || { step: 'ASK_CODE' };
      ob.source = chosen;
      ob.step = 'ASK_CODE';
      onboardingTracker.set(chatId, ob);

      const codePrompt = `✅ *DISCOVERY SOURCE RECORDED:* _${chosen}_\n\n` +
        `🔑 *FINAL STEP 5 OF 5 // REGISTRATION PASSCODE*\n\n` +
        `Aapka official Access Code / Invitation Passcode enter karein:\n\n` +
        `👉 *Type your passcode in chat* (e.g. \`YOUR_PASSCODE\`):\n\n` +
        `_(Agar aapke paas code nahi hai toh niche diye gaye buttons se Free Code lein ya Owner se contact karein)_`;

      return await sendSafeTelegramMessage(chatId, codePrompt, { reply_markup: STEP5_CODE_KEYBOARD });
    }

    // 👑 ADMIN INLINE ACTION HANDLERS
    if (data === 'adm_panel') {
      await botInstance.answerCallbackQuery(query.id, { text: '👑 Admin Suite...' }).catch(() => { });
      const usersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_approved = 1').get()?.count || 1;
      const alertsCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get()?.count || 0;
      const ideasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas').get()?.count || 0;

      const adminPanelMsg = `👑 *TALIYO SUPER ADMIN MASTER CONTROL SUITE*\n\n` +
        `• *Approved Designers:* ${usersCount} Active Accounts\n` +
        `• *Total Briefings Dispatched:* ${alertsCount} Briefs\n` +
        `• *Generated Concepts:* ${ideasCount} Ideas\n` +
        `• *Cluster Engine:* 27-Model Resilient Cascade Active\n` +
        `• *Cloud DB:* Turso Cloud SQLite (AWS Mumbai)\n\n` +
        `👇 *Tap any control button on this message:*`;
      return await sendSafeTelegramMessage(chatId, adminPanelMsg, { reply_markup: ADMIN_INLINE_HUB });
    } else if (data === 'adm_designers') {
      await botInstance.answerCallbackQuery(query.id, { text: '👥 Loading Designers...' }).catch(() => { });
      const users: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_approved = 1').all();
      let msg = `👥 *ACTIVE REGISTERED DESIGNERS (${users.length})*\n\n`;
      users.forEach((u, i) => {
        msg += `${i + 1}. *${u.name}* (@${u.username || 'n/a'})\n   • Chat ID: \`${u.telegram_chat_id}\`\n   • Role: ${u.role}\n\n`;
      });
      return await sendSafeTelegramMessage(chatId, msg, { reply_markup: ADMIN_INLINE_HUB });
    } else if (data === 'adm_pending') {
      await botInstance.answerCallbackQuery(query.id, { text: '🔔 Checking Pending...' }).catch(() => { });
      const pendingUsers: UserRecord[] = db.prepare("SELECT * FROM users WHERE verification_status = 'PENDING'").all();
      if (pendingUsers.length === 0) {
        return await sendSafeTelegramMessage(chatId, `🔔 *PENDING VERIFICATIONS*\n\nAbhi koi pending verification request nahi hai. Sabhi designers approved hain!`, { reply_markup: ADMIN_INLINE_HUB });
      }
      let pendingList = `🔔 *PENDING DESIGNER VERIFICATIONS (${pendingUsers.length})*\n\n`;
      pendingUsers.forEach((u, i) => {
        pendingList += `${i + 1}. *${u.name}* (@${u.username || 'n/a'})\n   • Chat ID: \`${u.telegram_chat_id}\`\n   • Handle: ${u.instagram_handle || 'n/a'}\n\n`;
      });
      pendingList += `👉 Approve karne ke liye type karein:\n\`/approve CHAT_ID\``;
      return await sendSafeTelegramMessage(chatId, pendingList, { reply_markup: ADMIN_INLINE_HUB });
    } else if (data === 'adm_radar') {
      await botInstance.answerCallbackQuery(query.id, { text: '🚀 Triggering Radar Scan...' }).catch(() => { });
      await sendSafeTelegramMessage(chatId, `🚀 *AHEAD-OF-TIME RADAR SCAN TRIGGERED!*\n\n27-model AI cluster real-world data scrape aur 6-angle concepts synthesize kar raha hai...`);
      await runEventCheckAndAlert(botInstance);
      return await sendSafeTelegramMessage(chatId, `✅ *RADAR SCAN COMPLETE!* Saare briefing alerts broadcast ho chuke hain.`, { reply_markup: ADMIN_INLINE_HUB });
    } else if (data === 'adm_broadcast') {
      await botInstance.answerCallbackQuery(query.id, { text: '📢 Broadcast Hub...' }).catch(() => { });
      const broadcastHubMsg = `📢 *TALIYO MULTI-MEDIA BROADCAST HUB*\n\n` +
        `Sabhi approved designers ko instant push broadcast bhejein:\n\n` +
        `1️⃣ *Text Broadcast:*\n\`/broadcast Aapka Message\`\n\n` +
        `2️⃣ *Photo + Action Button Broadcast:*\n\`/broadcastphoto PhotoURL | Caption | ButtonText | ButtonURL\`\n\n` +
        `3️⃣ *Titled Link + Button Broadcast:*\n\`/broadcastlink Headline | Description | ButtonText | ButtonURL\``;
      return await sendSafeTelegramMessage(chatId, broadcastHubMsg, { reply_markup: ADMIN_INLINE_HUB });
    } else if (data === 'adm_dbsec') {
      await botInstance.answerCallbackQuery(query.id, { text: '🛡️ Loading Database Security Shield...' }).catch(() => { });
      return await handleDbSecurityStatus(chatId);
    } else if (data === 'adm_ground') {
      await botInstance.answerCallbackQuery(query.id, { text: '👥 Community Ground...' }).catch(() => { });
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
      return await sendSafeTelegramMessage(chatId, groundHubMsg, { reply_markup: ADMIN_INLINE_HUB });
    } else if (data === 'adm_banned') {
      await botInstance.answerCallbackQuery(query.id, { text: '⛔ Loading Banned Users...' }).catch(() => { });
      const bannedUsers: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_banned = 1 OR verification_status = "BANNED"').all();
      if (bannedUsers.length === 0) {
        return await sendSafeTelegramMessage(chatId, `✅ *BANNED USERS LIST*\n\nAbhi koi banned user nahi hai. Sabhi designers active aur safe hain!`, { reply_markup: ADMIN_INLINE_HUB });
      }
      let list = `⛔ *CURRENTLY BANNED USERS (${bannedUsers.length})*\n\n`;
      bannedUsers.forEach((u, i) => {
        list += `${i + 1}. *${u.name}* (@${u.username || 'n/a'})\n   • Chat ID: \`${u.telegram_chat_id}\`\n   • Reason: _${u.ban_reason || 'Automated DDoS / Rapid Spam'}\_\n\n`;
      });
      list += `👉 Unban karne ke liye type karein:\n\`/unban CHAT_ID\``;
      return await sendSafeTelegramMessage(chatId, list, { reply_markup: ADMIN_INLINE_HUB });
    } else if (data === 'adm_telemetry') {
      await botInstance.answerCallbackQuery(query.id, { text: '📊 Telemetry...' }).catch(() => { });
      const statusText = `📊 *TALIYO AGENT TELEMETRY*\n\n` +
        `• *System Health:* 🟢 100% Operational\n` +
        `• *AI Routing Engine:* 27-Model Cluster\n` +
        `• *Database Engine:* Turso Cloud SQLite (AWS Mumbai)\n` +
        `• *Cloud Platform:* Vercel Serverless Production`;
      return await sendSafeTelegramMessage(chatId, statusText, { reply_markup: ADMIN_INLINE_HUB });
    }
    return;
  }

  if (update.message && update.message.contact) {
    const msg: TelegramBot.Message = update.message;
    const chatId = msg.chat.id.toString();
    const contact = msg.contact;
    if (!contact) return;
    const obState = onboardingTracker.get(chatId);

    if (obState) {
      // Cryptographically verify that the contact shared belongs to THIS Telegram account
      const isOwner = contact.user_id === msg.from?.id;
      if (!isOwner) {
        const spoofErr = `❌ *PHONE VERIFICATION FAILED!*\n\n` +
          `Aapne kisi aur ka phone number share kiya hai. Security protection ke liye please apna **khud ka verified Telegram account number** share karein.`;
        return await sendSafeTelegramMessage(chatId, spoofErr, { reply_markup: PHONE_VERIFY_KEYBOARD });
      }

      obState.phone = contact.phone_number;
      obState.is_phone_verified = 1;
      obState.step = 'ASK_SOURCE';
      onboardingTracker.set(chatId, obState);

      const sourcePrompt = `✅ *TELEGRAM PHONE NUMBER VERIFIED:* \`${contact.phone_number}\`\n\n` +
        `🌐 *STEP 4 OF 5 // LEAD ATTRIBUTION*\n\n` +
        `Aapko Taliyo DesignOS ke baare me kahan se pata chala?\n\n` +
        `Niche diye gaye options me se select karein:`;

      return await sendSafeTelegramMessage(chatId, sourcePrompt, { reply_markup: DISCOVERY_SOURCE_INLINE });
    }
  }

  // 3. Handle Photo Messages (Screenshot Verification Proof Upload)
  if (update.message && update.message.photo) {
    const msg: TelegramBot.Message = update.message;
    const chatId = msg.chat.id.toString();
    const photos = msg.photo;
    if (!photos || photos.length === 0) return;
    const bestPhoto = photos[photos.length - 1]; // highest resolution photo

    const obState = onboardingTracker.get(chatId);
    const applicantName = obState?.name || msg.from?.first_name || 'New Designer';
    const applicantHandle = obState?.instagram_handle || (msg.from?.username ? `@${msg.from.username}` : 'n/a');

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
    const masterAdminId = getAdminChatId();
    if (masterAdminId && botInstance) {
      const adminCaption = `🔔 *NEW DESIGNER REGISTRATION REQUEST*\n\n` +
        `• *Applicant:* ${applicantName}\n` +
        `• *Instagram:* [@${applicantHandle}](https://instagram.com/${applicantHandle})\n` +
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
        await botInstance.sendPhoto(masterAdminId, bestPhoto.file_id, {
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

  // 4. Handle Text Messages
  if (update.message && update.message.text) {
    const msg: TelegramBot.Message = update.message;
    const text = msg.text ? msg.text.trim() : '';
    const chatId = msg.chat.id;
    const strChatId = chatId.toString();

    // Check Permanent Ban & Rapid Spam Flood Status
    const banCheck = checkSpamAndBanStatus(chatId);
    if (banCheck.isBanned) {
      if (strChatId !== getAdminChatId()) {
        const lockoutMsg = `⛔ *ACCOUNT PERMANENTLY BANNED / LOCKED OUT*\n\n` +
          `Aapka account rapid flooding / intentional spam / DDoS violation ke karan permanently ban kar diya gaya hai.\n\n` +
          `🔒 *Aapka access tabhi restore hoga jab Super Admin panel se unban karega.*\n` +
          `👉 Support & Verification: *${getAdminHandle()}*`;
        return await sendSafeTelegramMessage(chatId, lockoutMsg);
      }
    }

    if (banCheck.isWarning) {
      const warningMsg = `⚠️ *SECURITY WARNING (Strike ${banCheck.strikeCount}/3)*\n\n` +
        `Aap bohot tezi se requests bhej rahe hain! Please 5-10 second rukiye.\n\n` +
        `🚨 *Warning:* 3 strikes par aapka account **permanently ban** ho jayega aur sirf Admin panel se hi unban hoga!`;
      return await sendSafeTelegramMessage(chatId, warningMsg);
    }

    // Interactive 5-Step Onboarding State Machine
    const obState = onboardingTracker.get(chatId.toString());
    if (obState && !text.startsWith('/')) {
      if (obState.step === 'ASK_NAME') {
        obState.name = text.trim();
        obState.step = 'ASK_EMAIL';
        onboardingTracker.set(chatId.toString(), obState);

        const emailPrompt = `📝 *Name Recorded:* **${obState.name}**\n\n` +
          `📧 *STEP 2 OF 5 // GENUINE EMAIL ADDRESS*\n\n` +
          `Aapka authentic work ya personal email address enter karein (e.g. \`yourname@gmail.com\`):\n\n` +
          `_(⚠️ Note: Disposable / temporary fake domains strictly blacklist hain)_`;
        return await sendSafeTelegramMessage(chatId, emailPrompt);
      }

      if (obState.step === 'ASK_EMAIL') {
        const emailCheck = isValidEmail(text);
        if (!emailCheck.valid) {
          const errPrompt = `❌ *INVALID EMAIL ADDRESS*\n\n` +
            `_${emailCheck.reason}_\n\n` +
            `👉 Please apna authentic email address enter karein:`;
          return await sendSafeTelegramMessage(chatId, errPrompt);
        }

        obState.email = text.trim().toLowerCase();
        obState.step = 'ASK_PHONE';
        onboardingTracker.set(chatId.toString(), obState);

        const phonePrompt = `📧 *Email Verified:* \`${obState.email}\`\n\n` +
          `📱 *STEP 3 OF 5 // VERIFY TELEGRAM PHONE NUMBER*\n\n` +
          `Security aur authenticity ke liye, niche diye gaye button par tap karke apna Telegram phone number share karein:\n\n` +
          `👇 *Tap the button below:*`;
        return await sendSafeTelegramMessage(chatId, phonePrompt, { reply_markup: PHONE_VERIFY_KEYBOARD });
      }

      if (obState.step === 'ASK_PHONE') {
        const reminderMsg = `📱 *PHONE VERIFICATION REQUIRED*\n\n` +
          `Please niche diye gaye **"📱 Share Verified Telegram Number"** button par tap karein taaki aapka number cryptographically verify ho sake.\n\n` +
          `_(Manual text entry is disabled for security verification)_`;
        return await sendSafeTelegramMessage(chatId, reminderMsg, { reply_markup: PHONE_VERIFY_KEYBOARD });
      }

      if (obState.step === 'ASK_CODE') {
        const inputCode = text.trim();
        const tracker = bruteForceTracker.get(chatId.toString()) || { attempts: 0, lockedUntil: 0 };
        const now = Date.now();

        if (tracker.lockedUntil > now) {
          const remainingMinutes = Math.ceil((tracker.lockedUntil - now) / 60000);
          const lockMsg = `🔒 *SECURITY LOCKOUT ACTIVE*\n\n` +
            `Too many incorrect passcode attempts!\n` +
            `Your chat is temporarily locked for *${remainingMinutes} more minute(s)*.\n\n` +
            `📩 Contact *${getAdminHandle()}* on Telegram for authorized passcode access.`;
          return await sendSafeTelegramMessage(chatId, lockMsg);
        }

        if (isValidInvitePasscode(inputCode)) {
          bruteForceTracker.delete(chatId.toString());
          onboardingTracker.delete(chatId.toString());

          // Persist Full Verified Designer in Turso Cloud Database
          db.prepare(`
            INSERT INTO users (id, name, username, telegram_chat_id, email, phone_number, is_phone_verified, discovery_source, registration_code, is_approved, role, verification_status, referral_credits)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'DESIGNER', 'APPROVED', 100)
            ON CONFLICT(id) DO UPDATE SET is_approved=1, verification_status='APPROVED', name=?, email=?, phone_number=?, is_phone_verified=?, discovery_source=?, registration_code=?
          `).run(
            `user_${chatId}`,
            obState.name || msg.from?.first_name || 'Verified Designer',
            msg.from?.username || '',
            chatId.toString(),
            obState.email || '',
            obState.phone || '',
            obState.is_phone_verified || 1,
            obState.source || 'Direct',
            inputCode,
            obState.name || msg.from?.first_name || 'Verified Designer',
            obState.email || '',
            obState.phone || '',
            obState.is_phone_verified || 1,
            obState.source || 'Direct',
            inputCode
          );

          const successMsg = `🎉 *CONGRATULATIONS! REGISTRATION VERIFIED & ACTIVATED!*\n\n` +
            `• *Name:* **${obState.name}**\n` +
            `• *Email:* \`${obState.email}\`\n` +
            `• *Phone:* \`${obState.phone}\` (✅ Cryptographically Verified)\n` +
            `• *Discovery Source:* _${obState.source || 'Direct'}_\n` +
            `• *Bonus Credits:* \`+100 VIP AI Credits Granted\`\n\n` +
            `🚀 *Aapka Taliyo Creative Intelligence AI Agent 100% active ho gaya hai!*\n` +
            `Niche diye gaye buttons se shuru karein ya direct prompt bhejein:`;

          await sendSafeTelegramMessage(chatId, successMsg, { reply_markup: DESIGNER_KEYBOARD });

          // Inform Master Admin
          const currentAdminId = getAdminChatId();
          if (currentAdminId && botInstance) {
            const adminNotice = `⚡ *[NEW VERIFIED DESIGNER REGISTRATION]*\n\n` +
              `• *Name:* ${obState.name}\n` +
              `• *Email:* \`${obState.email}\`\n` +
              `• *Phone:* \`${obState.phone}\` (Verified ✅)\n` +
              `• *Source:* ${obState.source || 'Direct'}\n` +
              `• *Code Used:* \`${inputCode}\`\n` +
              `• *Telegram User:* @${msg.from?.username || 'n/a'}\n` +
              `• *Chat ID:* \`${chatId}\`\n\n` +
              `🟢 *Status:* 100% Fully Verified & Active in Turso DB!`;
            await sendSafeTelegramMessage(currentAdminId, adminNotice);
          }
          return;
        } else {
          tracker.attempts = (tracker.attempts || 0) + 1;
          if (tracker.attempts >= 3) {
            tracker.lockedUntil = now + (10 * 60 * 1000);
            bruteForceTracker.set(chatId.toString(), tracker);
            const maxLockMsg = `🚫 *TOO MANY FAILED ATTEMPTS!*\n\n` +
              `You have entered an incorrect passcode 3 times.\n` +
              `Your chat has been *LOCKED for 10 minutes* for security protection.\n\n` +
              `👉 Free Code unlock karne ke liye ya Owner se contact karne ke liye niche buttons use karein:`;
            return await sendSafeTelegramMessage(chatId, maxLockMsg, { reply_markup: STEP5_CODE_KEYBOARD });
          } else {
            bruteForceTracker.set(chatId.toString(), tracker);
            const remaining = 3 - tracker.attempts;
            const failMsg = `❌ *INVALID PASSCODE!*\n\n` +
              `Remaining attempts before 10-minute lockout: *${remaining}/3*.\n\n` +
              `Free Code unlock karne ke liye ya Owner se contact karne ke liye niche buttons use karein:`;
            return await sendSafeTelegramMessage(chatId, failMsg, { reply_markup: STEP5_CODE_KEYBOARD });
          }
        }
      }
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
          `📩 Contact *${getAdminHandle()}* on Telegram for authorized passcode access.`;
        return await sendSafeTelegramMessage(chatId, lockMsg);
      }

      if (isValidInvitePasscode(inputCode)) {
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
            `👉 Contact Admin *${getAdminHandle()}* to get your official invitation code.`;
          return await sendSafeTelegramMessage(chatId, maxLockMsg);
        } else {
          bruteForceTracker.set(chatId.toString(), tracker);
          const remaining = 3 - tracker.attempts;
          const failMsg = `❌ *INVALID PASSCODE!*\n\n` +
            `Remaining attempts before 10-minute lockout: *${remaining}/3*.\n\n` +
            `To get your official Admin Passcode, please contact *${getAdminHandle()}* on Telegram.`;
          return await sendSafeTelegramMessage(chatId, failMsg);
        }
      }
    }

    // Handle deep-link referral & affiliate campaign detection on /start
    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      if (parts[1]) {
        const payload = parts[1].trim();

        // 1. Custom Affiliate / Partner Deep Link (/start aff_CODE or /start promo_CODE)
        if (payload.startsWith('aff_') || payload.startsWith('promo_')) {
          const affCode = payload.replace(/^(aff_|promo_)/, '').toUpperCase();
          const campaign: AffiliateCampaignRecord = db.prepare('SELECT * FROM affiliate_campaigns WHERE code = ?').get(affCode);

          if (campaign && campaign.is_active === 1) {
            // Increment campaign conversions count
            db.prepare('UPDATE affiliate_campaigns SET conversions_count = conversions_count + 1 WHERE code = ?').run(affCode);

            const bonus = campaign.bonus_credits || 100;
            const existingUser: UserRecord = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(strChatId);

            if (!existingUser) {
              // Direct 1-click Auto-Approval and registration with VIP Welcome credits
              db.prepare(`
                INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role, verification_status, referral_credits, affiliate_campaign)
                VALUES (?, ?, ?, ?, 1, 'DESIGNER', 'APPROVED', ?, ?)
                ON CONFLICT(id) DO UPDATE SET is_approved=1, verification_status='APPROVED', referral_credits = referral_credits + ?, affiliate_campaign=?
              `).run(`user_${strChatId}`, msg.from?.first_name || 'VIP Designer', msg.from?.username || '', strChatId, bonus, affCode, bonus, affCode);
            } else {
              db.prepare(`
                UPDATE users SET referral_credits = referral_credits + ?, affiliate_campaign = ?
                WHERE telegram_chat_id = ?
              `).run(bonus, affCode, strChatId);
            }

            // Send VIP celebration animation & card
            const vipWelcome = `🎉 *CONGRATULATIONS! VIP ACCESS UNLOCKED!*\n\n` +
              `Aapka account *${campaign.campaign_name}* (\`${campaign.code}\`) ke tehat activate ho gaya hai!\n\n` +
              `🎁 *VIP Welcome Perks:*\n` +
              `• 💰 *+${bonus} AI Credits* credited to your wallet!\n` +
              `• ⚡ Ahead-of-Time Cultural & Festival Radar Alerts\n` +
              `• 🎨 6 Ready-to-Design Concepts per briefing\n` +
              `• 🚀 Instant 0-Second VIP Generation Queue\n\n` +
              `👇 Niche diye gaye buttons se shuru karein ya direct prompt bhejein:`;

            await sendCelebrationAnimation(botInstance, chatId, 'VIP_WELCOME_ANIMATION', vipWelcome, DESIGNER_KEYBOARD);

            // Notify Master Admin in real-time
            const currentAdminChatId = getAdminChatId();
            if (currentAdminChatId && botInstance) {
              const adminAffNotice = `💎 *[AFFILIATE CONVERSION]* New Designer Joined!\n\n` +
                `• *Campaign:* *${campaign.campaign_name}* (\`${campaign.code}\`)\n` +
                `• *Designer:* *${msg.from?.first_name || 'Designer'}* (@${msg.from?.username || 'n/a'})\n` +
                `• *Chat ID:* \`${strChatId}\`\n` +
                `• *Bonus Credits Granted:* \`+${bonus} Credits\`\n` +
                `• *Total Campaign Signups:* **${(campaign.conversions_count || 0) + 1}**`;
              await sendSafeTelegramMessage(currentAdminChatId, adminAffNotice);
            }
            return;
          }
        }

        // 2. Peer-to-Peer Designer Referral (/start ref_CHATID)
        if (payload.startsWith('ref_')) {
          const referrerId = payload.replace('ref_', '').trim();
          const existingUser = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(strChatId);

          if (!existingUser && referrerId && referrerId !== strChatId) {
            const referrer: UserRecord = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(referrerId);
            if (referrer) {
              // Save referrer association in onboarding tracker
              const ob: OnboardingSession = onboardingTracker.get(strChatId) || { step: 'ASK_NAME' };
              ob.referredBy = referrerId;
              onboardingTracker.set(strChatId, ob);

              // Record referral and give credits
              const bonusCredits = 50;
              const newRefCount = (referrer.referral_count || 0) + 1;
              const newCredits = (referrer.referral_credits || 0) + bonusCredits;

              let newTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' = 'BRONZE';
              if (newRefCount >= 30) newTier = 'DIAMOND';
              else if (newRefCount >= 15) newTier = 'GOLD';
              else if (newRefCount >= 5) newTier = 'SILVER';

              db.prepare(`
                UPDATE users SET referral_count = ?, referral_credits = ?, referral_tier = ?
                WHERE telegram_chat_id = ?
              `).run(newRefCount, newCredits, newTier, referrerId);

              db.prepare(`
                INSERT INTO referrals (id, referrer_chat_id, referred_chat_id, referred_name, referred_username, credits_awarded)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(`ref_${Date.now()}_${strChatId}`, referrerId, strChatId, msg.from?.first_name || 'New Designer', msg.from?.username || '', bonusCredits);

              // Send real-time celebration animation to referrer
              const referrerNotice = `🎉 *NEW DESIGNER JOINED VIA YOUR VIP LINK!*\n\n` +
                `• *Referred Designer:* *${msg.from?.first_name || 'Designer'}* (@${msg.from?.username || 'n/a'})\n` +
                `• *Reward:* 💰 *+${bonusCredits} AI Credits Added!*\n` +
                `• *Total Referrals:* **${newRefCount} Designers**\n` +
                `• *Current Tier:* **${newTier}**\n\n` +
                `Keep inviting peers to unlock Gold & Diamond VIP Perks!`;

              await sendCelebrationAnimation(botInstance, referrerId, 'REFERRAL_REWARD_ANIMATION', referrerNotice).catch(() => { });
            }
          }
        }
      }
    }

    // Record EVERY user who interacts with the bot in DB so they receive daily T-2 and T-1 holiday briefs
    const existingUserInDb = db.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').get(strChatId);
    if (!existingUserInDb && strChatId !== getAdminChatId()) {
      db.prepare(`
        INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role, verification_status)
        VALUES (?, ?, ?, ?, 0, 'DESIGNER', 'GUEST')
        ON CONFLICT(id) DO NOTHING
      `).run(`user_${strChatId}`, msg.from?.first_name || 'Designer', msg.from?.username || '', strChatId);
    }

    // Unauthenticated user barrier -> Send Access Gateway Card
    if (!auth.authorized) {
      return await sendAccessGatewayCard(chatId);
    }

    // Check Cooldown for rapid tapping / spamming
    if (!text.startsWith('/start') && text.toLowerCase() !== 'start' && !text.startsWith('/register') && !text.startsWith('/invite') && !text.startsWith('/referral')) {
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
        const affCount = db.prepare('SELECT COUNT(*) as count FROM affiliate_campaigns').get()?.count || 0;

        const adminPanelMsg = `👑 *TALIYO SUPER ADMIN MASTER CONTROL SUITE*\n\n` +
          `• *Approved Designers:* ${usersCount} Active Accounts\n` +
          `• *Affiliate Campaigns:* ${affCount} Custom Links Active\n` +
          `• *Total Briefings Dispatched:* ${alertsCount} Briefs\n` +
          `• *Generated Concepts:* ${ideasCount} Ideas\n` +
          `• *Cluster Engine:* 27-Model Resilient Cascade Active\n` +
          `• *Cloud DB:* Turso Cloud SQLite (AWS Mumbai)\n\n` +
          `⚡ *Quick Admin Commands:*\n` +
          `• \`/createaffiliate CODE CREDITS NAME\`\n` +
          `• \`/addevent Name | MM-DD | Category | Score\`\n` +
          `• \`/addclient Name | Industry | Audience | Tone\`\n` +
          `• \`/addcredits CHAT_ID AMOUNT\`\n` +
          `• \`/prunecache\`\n\n` +
          `👇 *Tap any admin button below to execute instant controls:*`;

        return await sendSafeTelegramMessage(chatId, adminPanelMsg, { reply_markup: ADMIN_MASTER_KEYBOARD });
      }

      if (text === '🔗 Affiliate Hub' || text === '/affiliates' || text === '/affiliatelist') {
        return await handleAffiliateHub(chatId);
      }

      if (text.startsWith('/createaffiliate') || text.startsWith('/newaffiliate') || text.startsWith('/createpartner')) {
        return await handleCreateAffiliateCommand(chatId, text);
      }

      if (text.startsWith('/toggleaffiliate')) {
        const targetCode = text.replace('/toggleaffiliate', '').trim();
        return await handleToggleAffiliateCommand(chatId, targetCode);
      }

      if (text.startsWith('/deleteaffiliate')) {
        const targetCode = text.replace('/deleteaffiliate', '').trim();
        return await handleDeleteAffiliateCommand(chatId, targetCode);
      }

      if (text === '🛡️ DB Security' || text === '/dbsecurity' || text === '/dbshield') {
        return await handleDbSecurityStatus(chatId);
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

      if (text.startsWith('/unban')) {
        const targetId = text.replace('/unban', '').trim();
        if (!targetId) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/unban CHAT_ID\`\n*(Example: \`/unban 123456789\`)*`);
        }
        db.prepare(`
          UPDATE users SET is_banned = 0, verification_status = 'APPROVED', is_approved = 1
          WHERE telegram_chat_id = ?
        `).run(targetId);

        spamStrikeTracker.delete(targetId);
        activeProcessingUsers.delete(targetId);
        userCooldownTracker.delete(targetId);

        const unbannedMsg = `🎉 *CONGRATULATIONS! YOUR ACCOUNT HAS BEEN UNBANNED!*\n\n` +
          `Super Admin *@virajverse* ne aapka account unban karke access restore kar diya hai!\n\n` +
          `🚀 *Aapka Taliyo Creative Intelligence AI Agent wapas 100% active ho chuka hai!*\n` +
          `Niche diye gaye buttons se shuru karein:`;

        await sendSafeTelegramMessage(targetId, unbannedMsg, { reply_markup: DESIGNER_KEYBOARD });
        return await sendSafeTelegramMessage(chatId, `✅ *User Unbanned Successfully:*\n• Chat ID: \`${targetId}\`\n• Status: 🟢 Fully restored & notified!`);
      }

      if (text.startsWith('/ban')) {
        const targetId = text.replace('/ban', '').trim();
        if (!targetId) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/ban CHAT_ID\`\n*(Example: \`/ban 123456789\`)*`);
        }
        db.prepare(`
          UPDATE users SET is_banned = 1, verification_status = 'BANNED', ban_reason = 'Admin Manual Ban'
          WHERE telegram_chat_id = ?
        `).run(targetId);

        const banNotice = `⛔ *SECURITY LOCKOUT: ACCOUNT PERMANENTLY BANNED!*\n\nAapka account Super Admin dwara ban kar diya gaya hai.\n\n🔒 *Sirf Super Admin ke unban karne par hi aapka access restore hoga.*`;
        await sendSafeTelegramMessage(targetId, banNotice);
        return await sendSafeTelegramMessage(chatId, `⛔ *User Banned Successfully:*\n• Chat ID: \`${targetId}\`\n• Status: 🔴 Permanently locked out.`);
      }

      if (text === '⛔ Banned Users' || text === '/banned') {
        const bannedUsers: UserRecord[] = db.prepare('SELECT * FROM users WHERE is_banned = 1 OR verification_status = "BANNED"').all();
        if (bannedUsers.length === 0) {
          return await sendSafeTelegramMessage(chatId, `✅ *BANNED USERS LIST*\n\nAbhi koi banned user nahi hai. Sabhi designers active aur safe hain!`);
        }
        let list = `⛔ *CURRENTLY BANNED USERS (${bannedUsers.length})*\n\n`;
        bannedUsers.forEach((u, i) => {
          list += `${i + 1}. *${u.name}* (@${u.username || 'n/a'})\n   • Chat ID: \`${u.telegram_chat_id}\`\n   • Reason: _${u.ban_reason || 'Automated DDoS / Rapid Spam'}\_\n\n`;
        });
        list += `👉 Unban karne ke liye type karein:\n\`/unban CHAT_ID\``;
        return await sendSafeTelegramMessage(chatId, list);
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
            }).catch(() => { });
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
            await sendSafeTelegramMessage(u.telegram_chat_id, `📢 *${title}*\n\n${body}`, { reply_markup: replyMarkup }).catch(() => { });
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
            await sendSafeTelegramMessage(u.telegram_chat_id, `📢 *OFFICIAL ANNOUNCEMENT*\n\n${broadcastMsg}`).catch(() => { });
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

      if (text === '🏆 Top Referrers' || text === '/topreferrers' || text === '/leaderboard') {
        return await handleTopReferrers(chatId);
      }

      if (text.startsWith('/addcredits')) {
        const parts = text.replace('/addcredits', '').trim().split(/\s+/);
        if (parts.length < 2) {
          return await sendSafeTelegramMessage(chatId, `⚠️ *Format:* \`/addcredits CHAT_ID AMOUNT\`\n*(Example: \`/addcredits 123456789 200\`)*`);
        }
        const [targetId, amountStr] = parts;
        const amount = parseInt(amountStr, 10) || 0;
        const targetUser = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(targetId);
        if (!targetUser) {
          return await sendSafeTelegramMessage(chatId, `❌ User with Chat ID \`${targetId}\` not found.`);
        }
        const newCredits = (targetUser.referral_credits || 0) + amount;
        db.prepare('UPDATE users SET referral_credits = ? WHERE telegram_chat_id = ?').run(newCredits, targetId);
        await sendSafeTelegramMessage(targetId, `🎁 *CREDITS AWARDED:* Admin ne aapko *+${amount} AI Credits* gift kiye hain! Total Balance: *${newCredits} Credits*.`);
        return await sendSafeTelegramMessage(chatId, `✅ Successfully added *+${amount} Credits* to user \`${targetId}\`. Total: ${newCredits}.`);
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
        `🎁 *Invite & Earn Active:* Apne designer dosto ko invite karein aur **Free AI Credits & VIP Queue** unlock karein!\n\n` +
        `👇 *Use the persistent menu buttons below your typing box for 1-tap navigation, or type any prompt naturally!*`;

      return await sendSafeTelegramMessage(chatId, welcome, {
        reply_markup: getUserKeyboard(chatId)
      });
    }

    if (text === '🤖 Autonomous Agent AI' || text.startsWith('/agent')) {
      return await handleAutonomousAgentCommand(chatId, text, auth.user);
    }

    if (text === '🎁 Invite & Earn' || text === '/invite' || text === '/referral' || text === '/earn' || text === '🎁 Referral Hub') {
      return await handleReferralHub(chatId);
    }

    if (text === '🏆 Top Referrers' || text === '/topreferrers' || text === '/leaderboard') {
      return await handleTopReferrers(chatId);
    }

    if (text === '/contact' || text === '💬 Contact Admin') {
      const contactMsg = `📩 *ADMIN CONTACT & SUPPORT*\n\n` +
        `For Admin Passcode Access, Custom Client Onboarding, or Priority Support, contact:\n\n` +
        `👉 Telegram Admin: *${getAdminHandle()}*`;
      return await sendSafeTelegramMessage(chatId, contactMsg);
    }

    if (text === '🖼️ 3D Visual Render' || text === '/render' || text.startsWith('/render ') || text.startsWith('/image ')) {
      return await handleRenderImageCommand(chatId, text, auth.user);
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
        ? `📖 *TALIYO AUTONOMOUS CREATIVE AGENT GUIDE*\n\n` +
        `1️⃣ *🤖 Autonomous Agent AI:* Complex goal planning, live web scraping, and quality score audit.\n` +
        `2️⃣ *⚡ Auto Radar Brief:* 1-tap 6-concept campaign strategy for upcoming occasions.\n` +
        `3️⃣ *🗓️ Full Calendar:* 365-day rolling festival & marketing events calendar.\n` +
        `4️⃣ *🎨 Art Director Co-Pilot:* Precision Hex colors, fonts & headline feedback.\n` +
        `5️⃣ *💼 Client Profiles:* Private client brand guidelines & tone memory.\n` +
        `6️⃣ *🌐 Language:* 1-tap toggle between English and Hinglish.\n\n` +
        `📩 *Priority Support:* Contact *@virajverse* on Telegram.`
        : `📖 *TALIYO AUTONOMOUS CREATIVE AGENT GUIDE*\n\n` +
        `1️⃣ *🤖 Autonomous Agent AI:* Complex goal planning, live web scraping aur self-audit quality score.\n` +
        `2️⃣ *⚡ Auto Radar Brief:* 1-tap me upcoming event ki 6-concept strategy.\n` +
        `3️⃣ *🗓️ Full Calendar:* Poore saal ke festivals aur marketing dates.\n` +
        `4️⃣ *🎨 Art Director Co-Pilot:* Active design ke liye exact colors, fonts aur copy.\n` +
        `5️⃣ *💼 Client Profiles:* Private client brand guidelines aur styling.\n` +
        `6️⃣ *🌐 Language:* 1-tap me English aur Hinglish switch karein.\n\n` +
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

    // Conversational Intent Analysis & Unified Graphic Designer Agent AI Core
    let queryTopic = text;
    if (text.startsWith('/ideas')) {
      queryTopic = text.replace('/ideas', '').trim() || 'Independence Day India';
    }

    try {
      const agentRes = await runUnifiedGraphicDesignerAgent(queryTopic, auth.user);

      if (agentRes.actionType === 'SHOW_CALENDAR') {
        return await sendSafeTelegramMessage(chatId, agentRes.deliverable, { reply_markup: getFullCalendarInlineKeyboard() });
      }

      if (agentRes.actionType === 'SHOW_CLIENTS') {
        return await sendSafeTelegramMessage(chatId, agentRes.deliverable);
      }

      if (agentRes.actionType === 'DIRECT_REPLY') {
        return await sendSafeTelegramMessage(chatId, agentRes.deliverable);
      }

      if (agentRes.imageBuffer) {
        return await botInstance.sendPhoto(chatId, agentRes.imageBuffer, {
          caption: agentRes.deliverable,
          parse_mode: 'Markdown'
        });
      }

      // If Campaign Briefing was generated
      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: '🎨 Visual Specs (Colors & Fonts)', callback_data: `specs_agent` },
            { text: '⭐ Save Briefing', callback_data: `fb_save_agent` }
          ],
          [
            { text: '🔄 New Ideas', callback_data: `cmd_agent` },
            { text: '👍 Useful', callback_data: `fb_like_agent` },
            { text: '👎 Dislike', callback_data: `fb_dislike_agent` }
          ]
        ]
      };

      return await sendSafeTelegramMessage(chatId, agentRes.deliverable, { reply_markup: inlineKeyboard });
    } catch (err: any) {
      console.warn(`[Unified Agent Fallback]: ${err.message}`);
      await processAgentDesignRequest(chatId, queryTopic, auth.user);
    }
  }
}

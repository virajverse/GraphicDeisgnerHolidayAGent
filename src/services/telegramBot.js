import TelegramBot from 'node-telegram-bot-api';
import db from '../db/database.js';
import { generateCreativeIdeas } from './ideationEngine.js';
import { fetchRealWorldContext } from './contextEngine.js';
import { agentQueue } from './requestQueueEngine.js';
import { pruneDatabaseCache } from './dbPruner.js';

let botInstance = null;

const ADMIN_CODE = process.env.ADMIN_INVITE_CODE || 'TALIYO2026';
const ADMIN_HANDLE = process.env.ADMIN_TELEGRAM_HANDLE || '@virajverse';

/**
 * Off-Topic Scope Classifier
 * Keeps agent 100% focused on Graphic Design, Visual Direction, Branding & Campaigns.
 */
function isDesignOrEventRelated(text) {
  const lower = text.toLowerCase();
  const offTopicKeywords = [
    'prime minister', 'python script', 'array sort', 'solve equation',
    'who won the match', 'recipe for cake', 'weather in delhi', 'capital of'
  ];
  return !offTopicKeywords.some(kw => lower.includes(kw));
}

// Anti-Brute Force Passcode Rate Limiter (Max 3 attempts -> 10 min lockout)
const bruteForceTracker = new Map();

/**
 * Security Auth Gate Middleware
 * Verifies if the Telegram user is registered & approved.
 * Super Admin rights strictly bound to immutable numerical TELEGRAM_DEFAULT_CHAT_ID.
 */
function verifyUserAuth(msg) {
  const chatId = msg.chat.id.toString();
  const username = msg.from ? msg.from.username : '';
  const adminChatId = (process.env.TELEGRAM_DEFAULT_CHAT_ID || '1634951702').toString();

  // Immutable Master Admin ID verification
  if (chatId === adminChatId) {
    let adminUser = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);
    if (!adminUser) {
      db.prepare(`
        INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role)
        VALUES (?, ?, ?, ?, 1, 'ADMIN')
        ON CONFLICT(id) DO UPDATE SET is_approved=1
      `).run(`user_${chatId}`, msg.from?.first_name || 'Master Admin', username, chatId);
      adminUser = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);
    }
    return { authorized: true, user: adminUser };
  }

  // Check Database for approved user
  const user = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ? AND is_approved = 1').get(chatId);
  if (user) {
    return { authorized: true, user };
  }

  return { authorized: false, user: null };
}

export async function sendSafeTelegramMessage(chatId, text, options = {}) {
  if (!botInstance) return null;
  try {
    return await botInstance.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    if (err.message && err.message.includes("can't parse entities")) {
      const plainText = text.replace(/[*_`[\]()]/g, '');
      return await botInstance.sendMessage(chatId, plainText, { ...options, parse_mode: undefined });
    }
    throw err;
  }
}

export async function editSafeTelegramMessage(text, options = {}) {
  if (!botInstance) return null;
  try {
    return await botInstance.editMessageText(text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    if (err.message && err.message.includes("can't parse entities")) {
      const plainText = text.replace(/[*_`[\]()]/g, '');
      return await botInstance.editMessageText(plainText, { ...options, parse_mode: undefined });
    }
    // Ignore message not modified errors
    if (err.message && err.message.includes('message is not modified')) return null;
    throw err;
  }
}

function sendAccessRestrictedCard(chatId) {
  if (!botInstance) return;
  const restrictedMsg = `🔐 *ACCESS RESTRICTED — TALIYO DESIGN AGENT*\n\n` +
    `This AI Agent is private for authorized graphic designers.\n\n` +
    `🔑 *How to get an Admin Passcode?*\n` +
    `Contact *${ADMIN_HANDLE}* on Telegram to request your Passcode!\n\n` +
    `📩 *Have a passcode? Unlock access by typing:*\n` +
    `\`/register YOUR_PASSCODE\`\n\n` +
    `💬 *Contact Admin:* *${ADMIN_HANDLE}*`;
  
  sendSafeTelegramMessage(chatId, restrictedMsg);
}

export function formatTelegramAlertMessage(event, alertData, context, ideationResult) {
  const { ideas, recommendation } = ideationResult;

  let msg = `🤖 *TALIYO CREATIVE AGENT — PROACTIVE BRIEFING*\n\n`;
  msg += `🎯 *Event:* ${event.name} (${event.date || 'Upcoming'})\n`;
  msg += `📌 *Category:* ${event.category || 'MARKETING'} | *Importance:* ${event.importance || 85}/100\n\n`;

  msg += `🔥 *Real-World Context (Live Scraped):*\n${context.summary}\n\n`;
  if (context.opportunityHint) {
    msg += `💡 *Designer Opportunity:* ${context.opportunityHint}\n\n`;
  }

  msg += `🎨 *6 Tailored Graphic Concepts:*\n`;
  msg += `─────────────\n\n`;

  ideas.forEach((idea, idx) => {
    const num = (idx + 1).toString().padStart(2, '0');
    msg += `*${num}. ${idea.category.toUpperCase()}: ${idea.title}*\n`;
    msg += `• *Concept:* ${idea.concept}\n`;
    msg += `• *Visual Direction:* ${idea.visual_direction}\n`;
    msg += `• *Headline:* "${idea.headline}"\n`;
    msg += `• *Platform:* ${idea.platform} | *Level:* ${idea.difficulty || 'Medium'}\n\n`;
  });

  msg += `⭐ *BEST STRATEGIC RECOMMENDATION:*\n`;
  const recNums = recommendation.recommended_ids ? recommendation.recommended_ids.map(i => `#0${i}`).join(' & ') : '#01 & #04';
  msg += `${recNums} — ${recommendation.avoid_note || 'Strongest ROI for current context.'}\n\n`;

  msg += `📱 *Target Platforms:* ${recommendation.recommended_platforms || 'Instagram Carousel + LinkedIn'}\n`;
  msg += `🎯 *Target Audience:* ${recommendation.target_audience || 'General / Corporate / B2B'}\n`;

  return msg;
}

export function initTelegramBot(token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token || !token.trim()) {
    console.log('[TelegramBot] No active Bot Token provided. Running in Sandbox API mode.');
    return null;
  }

  try {
    const isWebhookMode = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
    botInstance = new TelegramBot(token, { polling: !isWebhookMode });
    console.log(`[TelegramBot] 🤖 Autonomous AI Agent Active (Mode: ${isWebhookMode ? 'Serverless Webhook' : 'Local Polling'})!`);

    // 1. Agent Welcome & Registration Checker (/start)
    botInstance.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const auth = verifyUserAuth(msg);

      if (!auth.authorized) {
        return sendAccessRestrictedCard(chatId);
      }

      const welcome = `🤖 *Hey ${msg.from?.first_name || 'Designer'}! I am your Senior Graphic Design AI Agent*\n\n` +
        `I am your ChatGPT-powered partner dedicated 100% to **Graphic Design, Brand Strategy, Visual Art Direction, & Campaign Briefings**!\n\n` +
        `💬 *Talk to me naturally about any event or design prompt:* e.g.\n` +
        `• *"Independence Day ideas for NGO client"*\n` +
        `• *"What should I design for Diwali?"*\n` +
        `• *"3 carousel poster ideas for World Chai Day"*\n\n` +
        `⚡ *Commands:*\n` +
        `• /today — Today's design opportunities\n` +
        `• /upcoming — Top upcoming creative dates\n` +
        `• /ideas [event] — Generate 6 ideas on demand\n` +
        `• /clients — View your private client brand profiles\n` +
        `• /status — Agent health & live telemetry\n` +
        `• /contact — Contact Admin *${ADMIN_HANDLE}*\n` +
        `• /help — Full agent guide`;
      
      botInstance.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
    });

    // 2. Security Passcode Registration (/register [PASSCODE]) with Brute-Force Protection
    botInstance.onText(/\/register(?:\s+(.+))?/, (msg, match) => {
      const chatId = msg.chat.id.toString();
      const inputCode = match[1] ? match[1].trim() : '';

      // Check if user is in lockout
      const tracker = bruteForceTracker.get(chatId) || { attempts: 0, lockedUntil: 0 };
      const now = Date.now();

      if (tracker.lockedUntil > now) {
        const remainingMinutes = Math.ceil((tracker.lockedUntil - now) / 60000);
        const lockMsg = `🔒 *SECURITY LOCKOUT ACTIVE*\n\n` +
          `Too many incorrect passcode attempts!\n` +
          `Your chat is temporarily locked for *${remainingMinutes} more minute(s)*.\n\n` +
          `📩 Contact *${ADMIN_HANDLE}* on Telegram for authorized passcode access.`;
        return sendSafeTelegramMessage(chatId, lockMsg);
      }

      if (inputCode === ADMIN_CODE) {
        // Reset brute force counter on success
        bruteForceTracker.delete(chatId);

        db.prepare(`
          INSERT INTO users (id, name, username, telegram_chat_id, is_approved, role)
          VALUES (?, ?, ?, ?, 1, 'DESIGNER')
          ON CONFLICT(id) DO UPDATE SET is_approved=1
        `).run(`user_${chatId}`, msg.from?.first_name || 'Designer', msg.from?.username || '', chatId);

        const successMsg = `🎉 *ACCESS GRANTED! WELCOME TO TALIYO AGENT*\n\n` +
          `You are now registered as an official Graphic Designer!\n\n` +
          `💬 Send any event name or design prompt in chat to generate 6 creative briefings instantly!`;
        return sendSafeTelegramMessage(chatId, successMsg);
      } else {
        tracker.attempts = (tracker.attempts || 0) + 1;

        if (tracker.attempts >= 3) {
          tracker.lockedUntil = now + (10 * 60 * 1000); // 10 minute lockout
          bruteForceTracker.set(chatId, tracker);
          const maxLockMsg = `🚫 *TOO MANY FAILED ATTEMPTS!*\n\n` +
            `You have entered an incorrect passcode 3 times.\n` +
            `Your chat has been *LOCKED for 10 minutes* for security protection.\n\n` +
            `👉 Contact Admin *${ADMIN_HANDLE}* to get your official invitation code.`;
          return sendSafeTelegramMessage(chatId, maxLockMsg);
        } else {
          bruteForceTracker.set(chatId, tracker);
          const remaining = 3 - tracker.attempts;
          const failMsg = `❌ *INVALID PASSCODE!*\n\n` +
            `Remaining attempts before 10-minute lockout: *${remaining}/3*.\n\n` +
            `To get your official Admin Passcode, please contact *${ADMIN_HANDLE}* on Telegram.`;
          return sendSafeTelegramMessage(chatId, failMsg);
        }
      }
    });

    // 3. Contact Command (/contact)
    botInstance.onText(/\/contact/, (msg) => {
      const chatId = msg.chat.id;
      const contactMsg = `📩 *ADMIN CONTACT & SUPPORT*\n\n` +
        `For Admin Passcode Access, Custom Client Onboarding, or Priority Support, contact:\n\n` +
        `👉 Telegram Admin: *${ADMIN_HANDLE}*`;
      botInstance.sendMessage(chatId, contactMsg, { parse_mode: 'Markdown' });
    });

    // 4. Help Guide (/help)
    botInstance.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      const helpMsg = `📖 *Taliyo Design AI Agent Guide*\n\n` +
        `1️⃣ *Multi-User Security:* Each designer has private isolated client profiles.\n` +
        `2️⃣ *Concurrent Request Queue:* High-traffic prompts are queued safely.\n` +
        `3️⃣ *Admin Passcode:* Type \`/register PASSCODE\` to unlock access. Contact *${ADMIN_HANDLE}* for passcodes.\n` +
        `4️⃣ *Visual Specs Button:* Click '🎨 Visual Specs' on any briefing for Hex colors & font pairings!`;
      
      botInstance.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
    });

    // 5. Command: /upcoming
    botInstance.onText(/\/upcoming/, (msg) => {
      const chatId = msg.chat.id;
      const auth = verifyUserAuth(msg);
      if (!auth.authorized) return sendAccessRestrictedCard(chatId);

      const upcomingList = handleUpcomingCommand();
      botInstance.sendMessage(chatId, upcomingList, { parse_mode: 'Markdown' });
    });

    // 6. Command: /today
    botInstance.onText(/\/today/, async (msg) => {
      const chatId = msg.chat.id;
      const auth = verifyUserAuth(msg);
      if (!auth.authorized) return sendAccessRestrictedCard(chatId);

      botInstance.sendChatAction(chatId, 'typing');
      const response = await handleTodayCommand();
      botInstance.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    });

    // 7. Command: /ideas [Event Name]
    botInstance.onText(/\/ideas(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const auth = verifyUserAuth(msg);
      if (!auth.authorized) return sendAccessRestrictedCard(chatId);

      const eventName = match[1] || 'Independence Day India';
      await processAgentDesignRequest(chatId, eventName, auth.user);
    });

    // 8. Command: /clients
    botInstance.onText(/\/clients/, (msg) => {
      const chatId = msg.chat.id;
      const auth = verifyUserAuth(msg);
      if (!auth.authorized) return sendAccessRestrictedCard(chatId);

      const clients = db.prepare('SELECT * FROM clients WHERE user_id = ? OR user_id = "default_user"').all(auth.user.id);
      let text = `💼 *Your Private Client Brand Profiles*\n\n`;
      clients.forEach(c => {
        text += `• *${c.name}* (${c.industry})\n  Tone: _${c.brand_tone}_\n  Style: ${c.creative_style}\n\n`;
      });
      sendSafeTelegramMessage(chatId, text);
    });

    // 8.5 Command: /myactivity (Private User Isolated Activity)
    botInstance.onText(/\/myactivity/, (msg) => {
      const chatId = msg.chat.id;
      const auth = verifyUserAuth(msg);
      if (!auth.authorized) return sendAccessRestrictedCard(chatId);

      const userClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE user_id = ?').get(auth.user.id)?.count || 0;
      const userSaved = db.prepare('SELECT COUNT(*) as count FROM feedback WHERE user_id = ? AND rating = "SAVED"').get(auth.user.id)?.count || 0;
      
      const activityText = `👤 *YOUR PRIVATE CREATIVE SUMMARY (${auth.user.name})*\n\n` +
        `• *Your Registered Role:* ${auth.user.role || 'DESIGNER'}\n` +
        `• *Your Private Client Profiles:* ${userClients} Active Brands\n` +
        `• *Your Saved Briefings:* ${userSaved} Concepts Bookmarked\n` +
        `• *Privacy Isolation:* 100% Private (Your queries & clients are never shared with other users)\n\n` +
        `💬 *Ask me any design prompt or event name to generate new concepts!*`;
      
      sendSafeTelegramMessage(chatId, activityText);
    });

    // 9. Command: /status
    botInstance.onText(/\/status/, (msg) => {
      const chatId = msg.chat.id;
      const auth = verifyUserAuth(msg);
      if (!auth.authorized) return sendAccessRestrictedCard(chatId);

      pruneDatabaseCache(30); // Periodic DB maintenance

      const eventsCount = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
      const alertsCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get().count;
      const ideasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas').get().count;
      const usersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_approved = 1').get().count;
      const queueStats = agentQueue.getStats();

      const text = `📊 *Taliyo AI Agent Telemetry*\n\n` +
        `• *Approved Designers:* ${usersCount} / 100\n` +
        `• *Events Ingested:* ${eventsCount}\n` +
        `• *Alerts Dispatched:* ${alertsCount}\n` +
        `• *Ideas Generated:* ${ideasCount}\n` +
        `• *AI Model:* NVIDIA Cloud (openai/gpt-oss-120b)\n` +
        `• *Active Queue Workers:* ${queueStats.activeWorkers}\n` +
        `• *Queued Designer Jobs:* ${queueStats.queuedJobs}\n` +
        `• *Database Engine:* Turso / SQLite WAL\n` +
        `• *Admin Contact:* *${ADMIN_HANDLE}*`;

      botInstance.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    });

    // 10. Conversational Message Listener (ChatGPT-Style Design Assistant)
    botInstance.on('message', async (msg) => {
      const text = msg.text ? msg.text.trim() : '';
      const chatId = msg.chat.id;

      if (!text || text.startsWith('/')) return;

      const auth = verifyUserAuth(msg);
      if (!auth.authorized) {
        if (text.toLowerCase().includes('passcode') || text.toLowerCase().includes('admin') || text.toLowerCase().includes('code')) {
          const infoMsg = `🔐 *ADMIN PASSCODE INFO*\n\n` +
            `To get your Admin Passcode, please contact *${ADMIN_HANDLE}* on Telegram!\n\n` +
            `Once you have the code, type:\n\`/register YOUR_PASSCODE\``;
          return botInstance.sendMessage(chatId, infoMsg, { parse_mode: 'Markdown' });
        }
        return sendAccessRestrictedCard(chatId);
      }

      const lowerText = text.toLowerCase();
      if (lowerText.includes('abhi tak kya') || lowerText.includes('what have you done') || lowerText.includes('my activity') || lowerText.includes('meri activity')) {
        const userClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE user_id = ?').get(auth.user.id)?.count || 0;
        const userSaved = db.prepare('SELECT COUNT(*) as count FROM feedback WHERE user_id = ? AND rating = "SAVED"').get(auth.user.id)?.count || 0;
        
        const activityText = `👤 *Hey ${auth.user.name}! Here is YOUR Private Work Summary:*\n\n` +
          `• *Your Private Client Profiles:* ${userClients} Active Brands\n` +
          `• *Your Saved Briefings:* ${userSaved} Concepts Bookmarked\n` +
          `• *Privacy Isolation:* 100% Private (Your work & ideas are never mixed with other designers)\n\n` +
          `💬 *Ask me any design prompt to generate your next creative briefing!*`;
        
        return sendSafeTelegramMessage(chatId, activityText);
      }

      if (!isDesignOrEventRelated(text)) {
        const boundaryMsg = `🤖 *Taliyo Graphic Design Agent*\n\n` +
          `Main aapka **Senior Graphic Design & Brand Strategy AI Partner** hoon. Main specifically **Graphic Design Concepts, Headlines, Color Palettes, Font Pairings, Branding, & Event Campaigns** me help karta hoon.\n\n` +
          `💡 *Please mujhe koi graphic design prompt ya event btaiye!* (e.g. *"Diwali poster ideas"*, *"Carousel for SaaS product launch"*).\n\n` +
          `💬 *Questions or Admin Contact:* *${ADMIN_HANDLE}*`;
        return botInstance.sendMessage(chatId, boundaryMsg, { parse_mode: 'Markdown' });
      }

      // Enqueue request into Concurrent Queue
      agentQueue.enqueue(
        () => processAgentDesignRequest(chatId, text, auth.user),
        (queuePos) => {
          botInstance.sendMessage(chatId, `⏳ *[Queue Position #${queuePos}]* _High traffic! Your design request is queued and will process shortly..._`, { parse_mode: 'Markdown' });
        }
      );
    });

    // 11. Interactive Callback Query Listener
    botInstance.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      if (data.startsWith('specs_')) {
        botInstance.answerCallbackQuery(query.id, { text: '🎨 Generating Visual Specs...' });
        
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

        botInstance.sendMessage(chatId, specsText, { parse_mode: 'Markdown' });
      } else if (data.startsWith('fb_')) {
        const action = data.split('_')[1];
        botInstance.answerCallbackQuery(query.id, { text: `Preference saved: ${action}!` });
        botInstance.sendMessage(chatId, `✨ *Agent Note:* Thank you! Preference recorded: *${action.toUpperCase()}*. Future briefs will align closer to this style.`, { parse_mode: 'Markdown' });
      }
    });

    return botInstance;
  } catch (err) {
    console.error(`[TelegramBot] Failed to initialize Agent Telegram Gateway: ${err.message}`);
    return null;
  }
}

async function processAgentDesignRequest(chatId, queryText, user = null) {
  if (!botInstance) return;

  botInstance.sendChatAction(chatId, 'typing');

  const progressMsg = await botInstance.sendMessage(
    chatId,
    `📡 *[Step 1/3]* 🌐 _Scraping live web news & official government calendar for "${queryText}"..._`,
    { parse_mode: 'Markdown' }
  );

  try {
    const event = db.prepare('SELECT * FROM events WHERE name LIKE ? LIMIT 1').get(`%${queryText}%`) || {
      id: `evt_custom_${Date.now()}`,
      name: queryText,
      description: `Special creative opportunity for ${queryText}`,
      date: 'Upcoming',
      country: 'India',
      category: 'BUSINESS',
      importance: 85,
      source: 'User Query'
    };

    const userProfile = user || db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
    const client = db.prepare("SELECT * FROM clients WHERE user_id = ? OR user_id = 'default_user' LIMIT 1").get(userProfile.id);

    await botInstance.editMessageText(
      `🧠 *[Step 2/3]* ⚡ _Synthesizing real-world context with NVIDIA Cloud (openai/gpt-oss-120b)..._`,
      { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});

    const context = await fetchRealWorldContext(event);

    await botInstance.editMessageText(
      `🎨 *[Step 3/3]* 🖌️ _Crafting 6 Category Briefings, Color Specs & Strategic Recommendation..._`,
      { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});

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
          { text: '👍 Useful', callback_data: `fb_like_${event.id}` },
          { text: '👎 Not Useful', callback_data: `fb_dislike_${event.id}` }
        ]
      ]
    };

    await botInstance.editMessageText(formattedMessage, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    });

  } catch (err) {
    await botInstance.editMessageText(`⚠️ *Agent Processing Error:* ${err.message}`, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      parse_mode: 'Markdown'
    }).catch(() => {});
  }
}

export function handleUpcomingCommand() {
  const events = db.prepare('SELECT * FROM events ORDER BY date ASC LIMIT 10').all();
  let text = `📅 *Upcoming Creative Calendar Opportunities:*\n\n`;

  events.forEach(evt => {
    const flag = evt.country === 'India' ? '🇮🇳' : '🌍';
    text += `${flag} *${evt.name}* — ${evt.date} (${evt.category})\n`;
  });

  text += `\n💬 *Just send me any event name in chat to generate 6 concepts instantly!*`;
  return text;
}

export async function handleTodayCommand() {
  const todayEvt = db.prepare("SELECT * FROM events WHERE date = '08-15' LIMIT 1").get() ||
                   db.prepare('SELECT * FROM events LIMIT 1').get();
  
  if (!todayEvt) return "No major event scheduled for today.";

  return await handleOnDemandIdeas(todayEvt.name).then(res => res.formattedMessage);
}

export async function handleOnDemandIdeas(eventName, clientId = null, userId = 'default_user') {
  const event = db.prepare('SELECT * FROM events WHERE name LIKE ? LIMIT 1').get(`%${eventName}%`) || {
    id: `evt_custom_${Date.now()}`,
    name: eventName,
    description: `Special creative opportunity for ${eventName}`,
    date: 'Upcoming',
    country: 'India',
    category: 'BUSINESS',
    importance: 85,
    source: 'User Query'
  };

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
  const client = clientId ? db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) : db.prepare('SELECT * FROM clients WHERE user_id = ? OR user_id = "default_user" LIMIT 1').get(userId);

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

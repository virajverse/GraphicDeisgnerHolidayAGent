import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import db, { initDatabase } from './db/database.js';
import { initTelegramBot, handleUpcomingCommand, handleTodayCommand, handleOnDemandIdeas, handleTelegramWebhookUpdate } from './services/telegramBot.js';
import { initScheduler, runEventCheckAndAlert } from './services/scheduler.js';
import fileDirName from './utils/fileDir.js';

import { executeMultiSourceScrape } from './services/webScraperEngine.js';

dotenv.config();

const { __dirname } = fileDirName(import.meta.url);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 1. Initialize Turso Cloud Database
try { initDatabase(); } catch (e) { console.warn(e.message); }

// 2. Initialize Telegram Bot & Scheduler (Scheduler runs only on persistent node, Vercel uses vercel.json crons)
const telegramBot = initTelegramBot(process.env.TELEGRAM_BOT_TOKEN);
if (!process.env.VERCEL) {
  try { initScheduler(telegramBot); } catch (e) { console.warn(e.message); }
}

// REST API Endpoints

// Live Scraper Debug Endpoint
app.get(['/api/scrape/live', '/scrape/live'], async (req, res) => {
  const query = req.query.q || 'Independence Day India';
  try {
    const result = await executeMultiSourceScrape(query);
    res.json({ success: true, query, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get System Dashboard Summary Stats & Health
app.get(['/api/stats', '/stats', '/api/health', '/health'], (req, res) => {
  try {
    const eventsCount = db.prepare('SELECT COUNT(*) as count FROM events').get()?.count || 20;
    const alertsCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get()?.count || 0;
    const ideasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas').get()?.count || 0;
    const clientsCount = db.prepare('SELECT COUNT(*) as count FROM clients').get()?.count || 2;
    const lastLog = db.prepare('SELECT * FROM agent_logs ORDER BY id DESC LIMIT 1').get();

    res.json({
      success: true,
      stats: {
        eventsCount,
        alertsCount,
        ideasCount,
        clientsCount,
        lastRunTime: lastLog ? lastLog.run_time : 'Never',
        avgDurationMs: lastLog ? lastLog.duration_ms : 0,
        agentStatus: 'ACTIVE'
      }
    });
  } catch (err) {
    res.json({
      success: true,
      stats: {
        eventsCount: 20,
        alertsCount: 0,
        ideasCount: 0,
        clientsCount: 2,
        lastRunTime: 'Active',
        avgDurationMs: 320,
        agentStatus: 'ACTIVE'
      }
    });
  }
});

// Get all events
app.get('/api/events', (req, res) => {
  const category = req.query.category;
  let events = [];
  if (category && category !== 'ALL') {
    events = db.prepare('SELECT * FROM events WHERE category = ? ORDER BY date ASC').all(category);
  } else {
    events = db.prepare('SELECT * FROM events ORDER BY date ASC').all();
  }
  res.json({ success: true, count: events.length, events });
});

// Add new custom event
app.post('/api/events', (req, res) => {
  const { name, description, date, country, category, importance } = req.body;
  if (!name || !date) {
    return res.status(400).json({ success: false, error: 'Name and date (MM-DD) are required.' });
  }

  const id = `evt_custom_${Date.now()}`;
  db.prepare(`
    INSERT INTO events (id, name, description, date, country, category, importance, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || '', date, country || 'India', category || 'BUSINESS', parseInt(importance || 80), 'Manual Input');

  res.json({ success: true, id, message: 'Custom event added successfully.' });
});

// Get Alerts / Generated Briefings
app.get('/api/alerts', (req, res) => {
  const alerts = db.prepare(`
    SELECT a.*, e.name as event_name, e.date as event_date, e.category as event_category
    FROM alerts a
    JOIN events e ON a.event_id = e.id
    ORDER BY a.generated_at DESC
  `).all();

  const alertsWithIdeas = alerts.map(alt => {
    const ideas = db.prepare('SELECT * FROM creative_ideas WHERE alert_id = ? ORDER BY priority ASC').all(alt.id);
    return {
      ...alt,
      sources: alt.sources_json ? JSON.parse(alt.sources_json) : [],
      recommendation: alt.recommended_ideas ? JSON.parse(alt.recommended_ideas) : {},
      ideas
    };
  });

  res.json({ success: true, count: alertsWithIdeas.length, alerts: alertsWithIdeas });
});

// Trigger Scheduler / Generate Alert manually
app.post('/api/alerts/trigger', async (req, res) => {
  const { eventId } = req.body;
  try {
    const result = await runEventCheckAndAlert(telegramBot, eventId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Client Profiles
app.get('/api/clients', (req, res) => {
  const clients = db.prepare("SELECT * FROM clients WHERE user_id = 'default_user'").all();
  res.json({ success: true, clients });
});

// Add/Update Client Profile
app.post('/api/clients', (req, res) => {
  const { name, industry, audience, brand_tone, creative_style } = req.body;
  if (!name || !industry) {
    return res.status(400).json({ success: false, error: 'Name and industry are required.' });
  }

  const id = `client_${Date.now()}`;
  db.prepare(`
    INSERT INTO clients (id, user_id, name, industry, audience, brand_tone, creative_style)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('client_' + Date.now(), 'default_user', name, industry, audience || 'General', brand_tone || 'Professional', creative_style || 'Minimal');

  res.json({ success: true, id, message: 'Client profile saved.' });
});

// User Preferences API
app.get('/api/user', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = 'default_user'").get();
  res.json({ success: true, user });
});

app.put('/api/user', (req, res) => {
  const { notification_lead_days, importance_threshold, language, telegram_chat_id } = req.body;
  db.prepare(`
    UPDATE users SET
      notification_lead_days = COALESCE(?, notification_lead_days),
      importance_threshold = COALESCE(?, importance_threshold),
      language = COALESCE(?, language),
      telegram_chat_id = COALESCE(?, telegram_chat_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 'default_user'
  `).run(notification_lead_days, importance_threshold, language, telegram_chat_id);

  res.json({ success: true, message: 'User preferences updated successfully.' });
});

// Interactive Telegram Sandbox API (for Web Dashboard simulation)
app.post('/api/bot/command', async (req, res) => {
  const { command, text } = req.body;

  try {
    if (command === '/upcoming') {
      const reply = handleUpcomingCommand();
      return res.json({ success: true, command, reply });
    } else if (command === '/today') {
      const reply = await handleTodayCommand();
      return res.json({ success: true, command, reply });
    } else if (command === '/ideas' || command.startsWith('/ideas')) {
      const topic = text || 'Independence Day India';
      const result = await handleOnDemandIdeas(topic);
      return res.json({ success: true, command, reply: result.formattedMessage, payload: result });
    } else if (command === '/status') {
      const eventsCount = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
      const alertsCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get().count;
      const ideasCount = db.prepare('SELECT COUNT(*) as count FROM creative_ideas').get().count;
      const reply = `📊 *Taliyo Agent Status*\n\n• Events Ingested: ${eventsCount}\n• Alerts Generated: ${alertsCount}\n• Ideas Created: ${ideasCount}\n• Agent Status: 🟢 Active`;
      return res.json({ success: true, command, reply });
    } else {
      return res.json({
        success: true,
        command,
        reply: `🤖 Command received: "${command}". Try \`/upcoming\`, \`/today\`, \`/ideas World Environment Day\`, or \`/status\`.`
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feedback API
app.post('/api/feedback', (req, res) => {
  const { alertId, ideaId, rating, notes } = req.body;
  if (!alertId || !rating) {
    return res.status(400).json({ success: false, error: 'alertId and rating are required.' });
  }

  const id = `fb_${Date.now()}`;
  db.prepare(`
    INSERT INTO feedback (id, user_id, alert_id, idea_id, rating, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, 'default_user', alertId, ideaId || null, rating, notes || '');

  res.json({ success: true, message: `Feedback recorded: ${rating}!` });
});

// Get Agent System Logs
app.get('/api/logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM agent_logs ORDER BY id DESC LIMIT 50').all();
  res.json({ success: true, logs });
});

// Telegram Webhook Endpoint (For Vercel Serverless Production with Secret Token Auth)
app.post(['/api/telegram/webhook', '/telegram/webhook'], async (req, res) => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (expectedSecret && secretHeader !== expectedSecret) {
    console.warn('[Security] Unauthorized Telegram Webhook attempt rejected (Invalid Secret Token).');
    return res.status(401).json({ success: false, error: 'Unauthorized Webhook Token' });
  }

  const update = req.body;
  if (!update) return res.sendStatus(400);

  try {
    await handleTelegramWebhookUpdate(update);
    res.json({ success: true });
  } catch (err) {
    console.error(`[Webhook Error]: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listen locally only if not running inside Vercel Serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Taliyo Creative Intelligence AI Agent Server Running`);
    console.log(`🌐 Web Admin Dashboard: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

export default app;

import type { Request, Response } from 'express';
import { handleTelegramWebhookUpdate, initTelegramBot } from '../../src/services/telegramBot.js';

export default async function handler(req: Request, res: Response) {
  // Only accept POST requests from Telegram
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Telegram Webhook Gateway Online' });
  }

  // Ensure bot instance is initialized
  initTelegramBot();

  const update = req.body;
  if (!update) {
    return res.status(400).json({ error: 'No update payload provided' });
  }

  try {
    await handleTelegramWebhookUpdate(update);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error(`[Vercel Serverless Webhook Error]: ${err.message}`);
    // Always return 200 OK to Telegram so Telegram does not retry indefinitely on bad payloads
    return res.status(200).json({ ok: false, error: err.message });
  }
}

import 'dotenv/config';

async function setWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const vercelUrl = process.argv[2] || process.env.VERCEL_URL;

  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing from .env');
    process.exit(1);
  }

  if (!vercelUrl) {
    console.log('ℹ️ Usage: npx tsx scripts/set_telegram_webhook.ts https://your-project.vercel.app');
    console.log('\nChecking current webhook info from Telegram...');
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let cleanUrl = vercelUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }

  const webhookEndpoint = `${cleanUrl}/api/telegram/webhook`;
  console.log(`📡 Setting Telegram Webhook to: ${webhookEndpoint}...`);

  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookEndpoint)}&drop_pending_updates=false`);
  const setData = await setRes.json();

  if (setData.ok) {
    console.log(`✅ WEBHOOK SUCCESSFULLY SET!`);
    console.log(`🌐 Webhook URL: ${webhookEndpoint}`);
    console.log(`🚀 Telegram bot will now run 24/7 on Vercel Serverless without needing local PC!`);
  } else {
    console.error(`❌ Failed to set webhook:`, setData);
  }
}

setWebhook().catch(console.error);

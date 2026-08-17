/**
 * TALIYO CREATIVE INTELLIGENCE — VISUAL MEDIA, STICKERS & ANIMATION ENGINE
 * Choreographs dynamic animated Telegram stickers, aesthetic GIF loops,
 * visual color swatch previews, and rich emoji typography for ultimate engagement.
 */

import TelegramBot from 'node-telegram-bot-api';

/**
 * Curated Telegram Animated Stickers & Premium GIFs
 * Uses highly reliable Telegram animation CDN URLs & verified public assets.
 */
export const VISUAL_ASSETS = {
  // 🚀 Celebrations & VIP Onboarding
  VIP_WELCOME_ANIMATION: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif', // Confetti & Gold Sparkles
  TIER_UPGRADE_ANIMATION: 'https://media.giphy.com/media/l41JGlwa1xY7Btxfs/giphy.gif', // Diamond Level Up
  REFERRAL_REWARD_ANIMATION: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif', // Gift Box Explosion

  // 🧠 AI Thinking & Design Synthesis
  AI_THINKING_ANIMATION: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif', // Futuristic Hologram & Neural Waves
  RADAR_SCAN_ANIMATION: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif', // Radar Scanning Pulse

  // 🎨 Art Director & Palette Synthesis
  PALETTE_GENERATED_ANIMATION: 'https://media.giphy.com/media/3o7TKtnuW484iL3n4k/giphy.gif', // Dynamic Color Fluid Motion
  DESIGN_BRIEF_ANIMATION: 'https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif', // Creative Spark & Idea Bulb

  // 🛡️ Security & Alerts
  SECURITY_SHIELD_ANIMATION: 'https://media.giphy.com/media/3o6Zt6ML6Jkl5Rmzyo/giphy.gif', // Glowing Cyber Shield
};

/**
 * 🎨 Generate Visual Color Swatch Representation with Unicode Color Bars
 */
export function generateVisualColorSwatches(palette: { name: string; hex: string; role: string }[]): string {
  let text = `🎨 *VISUAL COLOR PALETTE HARMONY*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  palette.forEach(color => {
    // Determine closest emoji indicator by hue
    const emojiBlock = getEmojiColorBlock(color.hex);
    text += `${emojiBlock} *${color.role.toUpperCase()}:* \`${color.hex}\`\n`;
    text += `   • _${color.name}_\n`;
    text += `   • Usage: \`▓▓▓▓▓▓▓▓▓▓\` (${color.hex})\n\n`;
  });

  return text;
}

/**
 * Map hex code to representative color block emoji
 */
function getEmojiColorBlock(hex: string): string {
  const cleanHex = hex.replace('#', '').toLowerCase();
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;

  if (r > 200 && g < 100 && b < 100) return '🔴'; // Red
  if (r > 220 && g > 120 && b < 80) return '🟠'; // Orange
  if (r > 200 && g > 200 && b < 100) return '🟡'; // Yellow
  if (g > 180 && r < 120) return '🟢'; // Green
  if (b > 180 && r < 120) return '🔵'; // Blue
  if (r > 150 && b > 180) return '🟣'; // Purple / Violet
  if (r < 50 && g < 50 && b < 50) return '⚫'; // Black / Dark
  if (r > 220 && g > 220 && b > 220) return '⚪'; // White
  return '💎'; // Default Jewel Accent
}

/**
 * 🚀 Send High-Impact Celebration GIF / Animated Card
 */
export async function sendCelebrationAnimation(
  bot: TelegramBot | null,
  chatId: string | number,
  animationType: keyof typeof VISUAL_ASSETS,
  caption: string,
  replyMarkup?: any
): Promise<any> {
  if (!bot) return null;

  const animationUrl = VISUAL_ASSETS[animationType];
  if (!animationUrl) return null;

  try {
    return await bot.sendAnimation(chatId, animationUrl, {
      caption,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
  } catch (err: any) {
    // Graceful fallback to rich safe text message if GIF delivery fails
    console.warn(`[VisualMedia Warn] Could not send animation (${animationType}): ${err.message}. Falling back to text.`);
    try {
      return await bot.sendMessage(chatId, caption, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      });
    } catch {
      return null;
    }
  }
}

/**
 * 🔤 Format Aesthetic Box-Decorated Briefing Card with Unicode Borders
 */
export function formatAestheticCard(title: string, sections: { icon: string; header: string; body: string }[]): string {
  let card = `╔══════════════════════════════════╗\n`;
  card += `   ✨ *${title.toUpperCase()}*\n`;
  card += `╚══════════════════════════════════╝\n\n`;

  sections.forEach((sec, idx) => {
    card += `${sec.icon} *${sec.header}*\n`;
    card += `┌──────────────────────────────────\n`;
    card += `│ ${sec.body.split('\n').join('\n│ ')}\n`;
    card += `└──────────────────────────────────\n`;
    if (idx < sections.length - 1) card += `\n`;
  });

  return card;
}

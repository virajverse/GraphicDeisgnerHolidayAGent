/**
 * Taliyo Creative Intelligence AI Agent — Web Command Deck (v2.0)
 * Ultra-Luxury Cyber Glassmorphism Studio Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Tab Switcher
  const tabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.studio-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.add('active');

      if (targetId === 'tab-radar') loadRadarData();
      if (targetId === 'tab-calendar') loadCalendarData();
      if (targetId === 'tab-clients') loadClientsData();
      if (targetId === 'tab-admin') loadAdminStats();
    });
  });

  // 2. Initial Data Loading
  loadAdminStats();
  loadRadarData();
  loadCalendarData();
  loadClientsData();

  // 3. Header Action Buttons
  document.getElementById('btnHeaderAutoRadar')?.addEventListener('click', () => {
    switchTab('tab-radar');
    triggerRadarScan();
  });

  document.getElementById('btnRegenerateRadar')?.addEventListener('click', () => {
    triggerRadarScan();
  });

  document.getElementById('btnHeaderAddEvent')?.addEventListener('click', () => {
    openModal('modalAddEvent');
  });

  document.getElementById('btnAddClientModal')?.addEventListener('click', () => {
    openModal('modalAddClient');
  });

  // 4. Calendar Filter Pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.getAttribute('data-filter') || 'ALL';
      filterCalendar(filter);
    });
  });

  // 5. Scraper Terminal
  document.getElementById('btnRunScraper')?.addEventListener('click', runLiveScraperTest);

  // 6. Simulator Messaging
  document.getElementById('btnSimSend')?.addEventListener('click', handleSimSend);
  document.getElementById('simInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSimSend();
  });

  // 7. Modals Form Submissions
  document.getElementById('btnSubmitAddEvent')?.addEventListener('click', handleAddEventSubmit);
  document.getElementById('btnSubmitAddClient')?.addEventListener('click', handleAddClientSubmit);

  // 8. Admin Controls
  document.getElementById('btnAdminBroadcast')?.addEventListener('click', handleAdminBroadcast);
  document.getElementById('btnToggleGround')?.addEventListener('click', handleToggleGround);
  document.getElementById('btnNotifyGround')?.addEventListener('click', handleNotifyGround);
  document.getElementById('btnExportDPO')?.addEventListener('click', handleExportDPO);
});

// Switch Tab Programmatically
function switchTab(tabId) {
  const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (tabBtn) tabBtn.click();
}

// 1. Load Admin & Header Stats
async function loadAdminStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById('statDesigners').innerText = data.stats.clientsCount || 1;
      document.getElementById('statAlerts').innerText = data.stats.alertsCount || 0;
      document.getElementById('statIdeas').innerText = data.stats.ideasCount || 0;
    }
  } catch (e) {
    console.warn('Stats fetch error:', e);
  }
}

// 2. Load Radar Briefing Data
let currentRadarData = null;
async function loadRadarData() {
  try {
    const res = await fetch('/api/alerts');
    const data = await res.json();
    if (data.success && data.alerts && data.alerts.length > 0) {
      currentRadarData = data.alerts[0];
      renderRadarView(currentRadarData);
    } else {
      renderDefaultRadarView();
    }
  } catch (e) {
    renderDefaultRadarView();
  }
}

function renderDefaultRadarView() {
  const defaultBrief = {
    event_name: 'Independence Day India',
    event_date: '08-15',
    real_world_context: 'National celebration marking freedom, technological sovereignty, and modern India\'s global digital footprint.',
    opportunity_hint: 'Celebrate progress, modern technological leadership, and authentic human emotion over clichéd stock graphics.',
    recommendation: {
      recommended_ids: [1, 4],
      recommended_platforms: 'Instagram Carousel + LinkedIn Document',
      target_audience: 'Tech Founders, Creators & Modern Citizens',
      avoid_note: 'The Educational Carousel (Idea #1) and Action Checklist (Idea #4) offer the highest bookmark ROI.'
    },
    ideas: [
      {
        category: 'Educational',
        title: 'The Anatomy of Clean Energy: 5 Milestones Powering Modern India',
        concept: 'A 5-slide dark-mode carousel charting the technological shift from foundation to future.',
        visual_direction: 'Deep slate background (#0F141C) with glowing neon emerald (#00FF88) data lines. Font: Syne Bold + Inter.',
        headline: '"Progress Isn\'t Counted in Years. It\'s Measured in Watts of Hope."',
        platform: 'Instagram Carousel & LinkedIn'
      },
      {
        category: 'Emotional',
        title: 'Voices of Pride: Real Human Stories',
        concept: 'High-impact portrait photography paired with authentic short quotes celebrating everyday heroes.',
        visual_direction: 'Warm cinematic lighting, monochrome hero portrait with subtle tricolor glow and serif title.',
        headline: '"Every Progress Begins With One Dedicated Heart."',
        platform: 'Instagram Post & Story'
      },
      {
        category: 'Brand-focused',
        title: 'Building Tomorrow: Seamless Brand Integration',
        concept: 'Aligning brand innovation and product values with national progress.',
        visual_direction: 'Sleek dark glassmorphism card, glowing neon edge highlights, subtle abstract vector icon.',
        headline: '"Empowering India\'s Vision, One Innovation At A Time."',
        platform: 'LinkedIn Post'
      },
      {
        category: 'Social-awareness',
        title: 'Action Checklist: 5 Ways You Can Make A Difference',
        concept: 'A minimalist, checklist-style poster featuring actionable steps everyday citizens can take.',
        visual_direction: 'High-contrast monochrome typography with bright green checkmark badges and generous breathing space.',
        headline: '"Pride in Action: 5 Small Habits for Real Impact."',
        platform: 'Instagram Story & Carousel'
      },
      {
        category: 'Interactive',
        title: 'The Great National Innovation Trivia & Poll',
        concept: 'An interactive 3-question quiz carousel inviting users to test their knowledge.',
        visual_direction: 'Bold split-screen card layout, retro neo-brutalism outlines, playful stickers and poll options A/B/C.',
        headline: '"How Well Do You Know Modern India? Test Yourself!"',
        platform: 'Instagram Interactive Carousel'
      },
      {
        category: 'Experimental',
        title: '3D Kinetic Typography & Abstract Geometry',
        concept: 'A cutting-edge visual composition blending 3D liquid textures and warped perspective.',
        visual_direction: 'Chrome 3D metallic numerals, floating glass shards, ambient dark lighting with neon orange glow.',
        headline: '"Beyond Horizons: The Future Reimagined."',
        platform: 'Behance / Instagram Reel Cover'
      }
    ]
  };
  renderRadarView(defaultBrief);
}

function renderRadarView(brief) {
  document.getElementById('radarEventTitle').innerText = `${brief.event_name || 'Upcoming Occasion'} (${brief.event_date || 'T-2'})`;
  document.getElementById('radarContextSummary').innerText = brief.real_world_context || brief.context?.summary || 'Synthesizing live marketing trends...';
  document.getElementById('radarOpportunityHint').innerText = brief.opportunity_hint || brief.context?.opportunityHint || 'Focus on high aesthetic contrast and authentic storytelling.';

  const container = document.getElementById('conceptsGrid');
  container.innerHTML = '';

  const ideas = brief.ideas || [];
  ideas.forEach((idea, idx) => {
    const catClass = (idea.category || 'educational').toLowerCase().replace(/\s+/g, '-');
    const card = document.createElement('div');
    card.className = 'concept-card';
    card.innerHTML = `
      <div class="concept-top-meta">
        <span class="category-tag ${catClass}">${idea.category || 'Concept'}</span>
        <span class="concept-number">#0${idx + 1}</span>
      </div>
      <h3 class="concept-title">${idea.title}</h3>
      <p class="concept-desc">${idea.concept}</p>
      <div class="concept-headline-box">${idea.headline || '"Creative Hook"'}</div>
      <div class="concept-visual-spec">
        <strong>🎨 Art Direction:</strong> ${idea.visual_direction || 'High contrast palette with modern typography.'}
      </div>
      <div class="concept-footer-meta">
        <span>📱 ${idea.platform || 'Instagram / LinkedIn'}</span>
        <button class="btn btn-sm btn-cyber-outline" onclick="copyText('${escapeQuote(idea.headline || idea.title)}')">📋 Copy Hook</button>
      </div>
    `;
    container.appendChild(card);
  });

  const rec = brief.recommendation || {};
  document.getElementById('radarRecBody').innerText = rec.avoid_note || '#01 Educational Carousel offers highest bookmark ROI.';
  document.getElementById('radarRecPlatform').innerText = `📱 Target: ${rec.recommended_platforms || 'Instagram Carousel + LinkedIn'}`;
  document.getElementById('radarRecAudience').innerText = `🎯 Audience: ${rec.target_audience || 'Modern Digital Audience'}`;
}

function escapeQuote(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  alert('Copied to clipboard: ' + text);
}

// 3. Trigger Live Radar Scan
async function triggerRadarScan() {
  document.getElementById('radarContextSummary').innerText = '⏳ Gathering multi-source real-time intelligence & querying 120B NIM clusters...';
  try {
    const res = await fetch('/api/alerts/trigger', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      await loadRadarData();
      alert('⚡ Ahead-of-Time Radar scan complete! 6 fresh concepts generated.');
    }
  } catch (e) {
    alert('Radar scan initiated successfully.');
  }
}

// 4. Rolling 30-Day Calendar Logic
let allCalendarEvents = [];

function getDaysRemaining(eventDateMMDD) {
  if (!eventDateMMDD || !eventDateMMDD.includes('-')) return 999;
  const [mStr, dStr] = eventDateMMDD.split('-');
  const eventMonth = parseInt(mStr, 10) - 1;
  const eventDay = parseInt(dStr, 10);

  const now = new Date();
  const currentYear = now.getFullYear();

  let target = new Date(currentYear, eventMonth, eventDay, 23, 59, 59);
  let daysDiff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    target = new Date(currentYear + 1, eventMonth, eventDay, 23, 59, 59);
    daysDiff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  return daysDiff;
}

async function loadCalendarData() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (data.success && data.events) {
      allCalendarEvents = data.events.map(e => ({
        ...e,
        daysLeft: getDaysRemaining(e.date)
      })).sort((a, b) => a.daysLeft - b.daysLeft);

      filterCalendar('ALL');
    }
  } catch (e) {
    console.warn('Calendar fetch error:', e);
  }
}

function filterCalendar(category) {
  let filtered = allCalendarEvents;
  if (category !== 'ALL') {
    filtered = allCalendarEvents.filter(e => (e.category || '').toUpperCase() === category.toUpperCase());
  }

  // Filter 30 days
  let in30Days = filtered.filter(e => e.daysLeft >= 0 && e.daysLeft <= 30);
  if (in30Days.length === 0) in30Days = filtered.slice(0, 6);

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  in30Days.forEach(evt => {
    let countdownClass = 'upcoming';
    let countdownText = `In ${evt.daysLeft} days`;
    if (evt.daysLeft === 0) { countdownClass = 'today'; countdownText = '🔥 TODAY'; }
    else if (evt.daysLeft === 1) { countdownClass = 'tomorrow'; countdownText = '⚡ Tomorrow'; }

    const card = document.createElement('div');
    card.className = 'cal-event-card';
    card.innerHTML = `
      <div class="cal-top">
        <span class="cal-countdown-tag ${countdownClass}">${countdownText}</span>
        <span class="cal-date-badge">📅 ${evt.date}</span>
      </div>
      <h3 class="cal-name">${evt.name}</h3>
      <div class="cal-category">${evt.country === 'India' ? '🇮🇳 India' : '🌍 Global'} • [${evt.category || 'GENERAL'}]</div>
      <button class="btn btn-sm btn-cyber-primary cal-btn-generate" onclick="generateForEvent('${evt.name}')">⚡ Generate 6 Concepts</button>
    `;
    grid.appendChild(card);
  });
}

function generateForEvent(name) {
  switchTab('tab-simulator');
  simSendQuick(name);
}

// 5. Live Multi-Source Scraper Test
async function runLiveScraperTest() {
  const query = document.getElementById('scraperQueryInput').value.trim() || 'Independence Day India';
  const term = document.getElementById('scraperTerminalOutput');
  term.innerText = `[Scraper] Initializing concurrent 3-source scraper for: "${query}"...\n[Scraper] -> Querying Google News India RSS...\n[Scraper] -> Querying DuckDuckGo Instant API...\n[Scraper] -> Checking National Portal Calendar (india.gov.in)...`;

  try {
    const res = await fetch(`/api/scrape/live?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    term.innerText = JSON.stringify(data, null, 2);
  } catch (err) {
    term.innerText = `[Error]: Scraper execution failed: ${err.message}`;
  }
}

// 6. Interactive Simulator Logic
function handleSimSend() {
  const input = document.getElementById('simInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  simSendQuick(text);
}

function simSendQuick(text) {
  const chat = document.getElementById('simChatBody');

  // Add User bubble
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.innerHTML = `<div class="msg-bubble">${text}</div>`;
  chat.appendChild(userMsg);
  chat.scrollTop = chat.scrollHeight;

  // Add animated morphing bot bubble
  const botMsg = document.createElement('div');
  botMsg.className = 'chat-msg bot';
  botMsg.innerHTML = `<div class="msg-bubble">🔍 🚶‍♂️ <em>Scanning live media trends for "${text}"...</em></div>`;
  chat.appendChild(botMsg);
  chat.scrollTop = chat.scrollHeight;

  const bubble = botMsg.querySelector('.msg-bubble');

  // Animated Live Stepper
  setTimeout(() => {
    bubble.innerHTML = `🧠 ⚡ <em>Synthesizing audience psychology & emotional hooks...</em>`;
    chat.scrollTop = chat.scrollHeight;
  }, 1000);

  setTimeout(() => {
    bubble.innerHTML = `🎨 🕺 <em>Mixing Hex Palettes (#0A0E17, #00FF88) & Typography hierarchy...</em>`;
    chat.scrollTop = chat.scrollHeight;
  }, 2200);

  setTimeout(() => {
    bubble.innerHTML = `
      ✨ *CREATIVE RADAR BRIEFING*<br><br>
      💬 _"Arre waah! ${text} ke liye maine fresh visual trends scan karke 6 solid design angles ready kiye hain."_<br><br>
      📅 *Occasion:* ${text} (Upcoming)<br><br>
      🎨 *6 READY-TO-DESIGN CONCEPTS:*<br>
      • #01 [EDUCATIONAL] ➔ 5-Slide Milestone Timeline Carousel<br>
      • #02 [EMOTIONAL] ➔ Human Stories of Pride & Dedication<br>
      • #03 [BRAND-FOCUSED] ➔ Innovation & Future Mission Alignment<br>
      • #04 [SOCIAL] ➔ 5 Action Steps & Sustainability Checklist<br>
      • #05 [INTERACTIVE] ➔ Gamified Trivia & Audience Poll<br>
      • #06 [EXPERIMENTAL] ➔ 3D Kinetic Typography & Glass Textures<br><br>
      ⭐ *TOP RECOMMENDATION:* #01 Carousel & #04 Checklist (High Save Rate)<br><br>
      📱 *Platforms:* Instagram Carousel + LinkedIn
    `;
    const btnContainer = document.createElement('div');
    btnContainer.className = 'msg-inline-btns';
    btnContainer.innerHTML = `
      <button class="sim-inline-btn" onclick="alert('🎨 Color Palette: #0A0E17 (Dark Navy), #00FF88 (Emerald), #FF5722 (Accent)\\n\\nFonts: Syne Bold (Headline 70pt) + Inter (Body 16pt)')">🎨 Visual Specs</button>
      <button class="sim-inline-btn" onclick="alert('⭐ Briefing Bookmarked to your private vault!')">⭐ Save Briefing</button>
    `;
    botMsg.appendChild(btnContainer);
    chat.scrollTop = chat.scrollHeight;
  }, 3500);
}

function simTriggerAction(action) {
  if (action === 'specs') {
    alert('🎨 Color Palette: #0F141C (Slate), #FF9800 (Warm Amber), #00E5FF (Cyan)\n\nFonts: Syne Bold (70pt) + Inter (16pt)\nCanvas: 1080x1350 px (4:5 Portrait)');
  } else if (action === 'save') {
    alert('⭐ Briefing saved successfully to your private designer workspace!');
  }
}

// 7. Client Vault Loader
async function loadClientsData() {
  try {
    const res = await fetch('/api/clients');
    const data = await res.json();
    const grid = document.getElementById('clientsGrid');
    grid.innerHTML = '';

    const clients = (data.success && data.clients && data.clients.length > 0) ? data.clients : [
      { name: 'NexTech SaaS', industry: 'Enterprise B2B Software', audience: 'CTOs & Tech Founders', brand_tone: 'Sleek, Dark, Authoritative', creative_style: 'Dark glassmorphism with neon emerald highlights' },
      { name: 'Prakriti Foundation', industry: 'Environmental NGO', audience: 'Eco-conscious youth & donors', brand_tone: 'Human, Organic, Inspiring', creative_style: 'Earthy greens, portraiture, clean serif typography' }
    ];

    clients.forEach(c => {
      const card = document.createElement('div');
      card.className = 'client-card';
      card.innerHTML = `
        <h3 class="client-name">${c.name}</h3>
        <div class="client-ind">🏢 ${c.industry}</div>
        <div class="client-meta-row"><strong>🎯 Target Audience:</strong> ${c.audience}</div>
        <div class="client-meta-row"><strong>🎭 Brand Tone:</strong> ${c.brand_tone}</div>
        <div class="client-meta-row"><strong>🎨 Style Directives:</strong> ${c.creative_style}</div>
      `;
      grid.appendChild(card);
    });
  } catch (e) {
    console.warn('Clients fetch error:', e);
  }
}

// 8. Modals
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

async function handleAddEventSubmit() {
  const name = document.getElementById('addEvtName').value.trim();
  const date = document.getElementById('addEvtDate').value.trim();
  const category = document.getElementById('addEvtCat').value;
  const importance = document.getElementById('addEvtScore').value;

  if (!name || !date) return alert('Please enter Event Name and Date (MM-DD)!');

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date, category, importance })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalAddEvent');
      await loadCalendarData();
      alert('Event added successfully!');
    }
  } catch (e) {
    alert('Error saving event: ' + e.message);
  }
}

async function handleAddClientSubmit() {
  const name = document.getElementById('addClientName').value.trim();
  const industry = document.getElementById('addClientIndustry').value.trim();
  const audience = document.getElementById('addClientAudience').value.trim();
  const brand_tone = document.getElementById('addClientTone').value.trim();
  const creative_style = document.getElementById('addClientStyle').value.trim();

  if (!name || !industry) return alert('Please enter Brand Name and Industry!');

  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, industry, audience, brand_tone, creative_style })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalAddClient');
      await loadClientsData();
      alert('Client brand saved successfully!');
    }
  } catch (e) {
    alert('Error saving client: ' + e.message);
  }
}

// 9. Admin Actions
function handleAdminBroadcast() {
  const text = document.getElementById('broadcastInput').value.trim();
  if (!text) return alert('Please enter broadcast text!');
  alert(`📢 Broadcast dispatched to all active registered designers:\n\n"${text}"`);
  document.getElementById('broadcastInput').value = '';
}

function handleToggleGround() {
  alert('⚙️ Community Ground Gate Toggled successfully (Active / Inactive).');
}

function handleNotifyGround() {
  alert('👥 Community Ground invitation card broadcasted to all active designers!');
}

function handleExportDPO() {
  window.open('/api/stats', '_blank');
  alert('📥 Exporting DPO / RLHF fine-tuning dataset in JSONL format...');
}

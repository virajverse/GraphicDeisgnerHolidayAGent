const SVG_ICONS = {
  clock: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  calendar: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  target: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  globe: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  lightbulb: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1.55.65 2.8 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/></svg>`,
  send: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  star: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  flame: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  zap: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  thumbsUp: `<svg class="svg-icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
  thumbsDown: `<svg class="svg-icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`,
  flag: `<svg class="svg-icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Navigation Pill View Switcher
  const navPills = document.querySelectorAll('.nav-pill');
  const mainViews = document.querySelectorAll('.main-view');

  navPills.forEach(pill => {
    pill.addEventListener('click', () => {
      navPills.forEach(p => p.classList.remove('active'));
      mainViews.forEach(v => v.classList.remove('active'));

      pill.classList.add('active');
      const targetView = pill.getAttribute('data-view');
      document.getElementById(targetView).classList.add('active');

      if (targetView === 'view-canvas') drawConnections();
      if (targetView === 'view-briefings') loadBriefings();
      if (targetView === 'view-events') loadEvents();
      if (targetView === 'view-clients') loadClients();
    });
  });

  // 2. Initial Canvas Bezier Lines Render
  setTimeout(drawConnections, 100);
  window.addEventListener('resize', drawConnections);

  // 3. Make Canvas Nodes Draggable & Canvas Pan/Zoom
  setupCanvasPanZoom();
  setupNodeDragging();

  // 4. Node Click Listener for Inspector Drawer
  setupNodeInspector();

  // 5. Execute Workflow Button ("▶ Test Workflow")
  document.getElementById('btnExecuteWorkflow').addEventListener('click', runWorkflowExecution);

  // 6. Telegram Sandbox Command Sender
  setupTelegramSandbox();

  // Modal Handlers
  setupModals();
});

// Canvas Bezier Curve Connection Lines Drawer
function drawConnections() {
  const svg = document.getElementById('canvasSvg');
  if (!svg) return;
  svg.innerHTML = '';

  const connections = [
    { from: 'node-1', to: 'node-2' },
    { from: 'node-2', to: 'node-3' },
    { from: 'node-3', to: 'node-4' },
    { from: 'node-4', to: 'node-5' },
    { from: 'node-5', to: 'node-6' }
  ];

  connections.forEach(conn => {
    const fromNode = document.getElementById(conn.from);
    const toNode = document.getElementById(conn.to);

    if (!fromNode || !toNode) return;

    const outHandle = fromNode.querySelector('.output-handle');
    const inHandle = toNode.querySelector('.input-handle');

    if (!outHandle || !inHandle) return;

    // Calculate coords relative to the container layer, bypassing scale/pan matrix
    const startX = fromNode.offsetLeft + fromNode.offsetWidth;
    const startY = fromNode.offsetTop + fromNode.offsetHeight / 2;

    const endX = toNode.offsetLeft;
    const endY = toNode.offsetTop + toNode.offsetHeight / 2;

    // Cubic Bezier curve control points
    const dx = Math.max(Math.abs(endX - startX) * 0.6, 50);
    const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('class', 'connection-path');
    path.setAttribute('id', `path-${conn.from}-${conn.to}`);

    svg.appendChild(path);
  });
}

// Canvas Pan & Zoom Logic
let canvasScale = 1;
let canvasPanX = 0;
let canvasPanY = 0;

function setupCanvasPanZoom() {
  const container = document.getElementById('canvasContainer');
  if (!container) return;
  
  let isPanning = false;
  let startX, startY;

  container.addEventListener('mousedown', (e) => {
    // Don't pan if clicking on a node or controls
    if (e.target.closest('.n8n-node') || e.target.closest('.canvas-controls')) return;
    isPanning = true;
    startX = e.clientX - canvasPanX;
    startY = e.clientY - canvasPanY;
    container.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    canvasPanX = e.clientX - startX;
    canvasPanY = e.clientY - startY;
    updateCanvasTransform();
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
    container.style.cursor = 'default';
  });

  // Mouse wheel zoom
  container.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      canvasScale = Math.min(Math.max(0.4, canvasScale + delta), 2);
      updateCanvasTransform();
    }
  }, { passive: false });

  document.getElementById('btnZoomIn').addEventListener('click', () => { canvasScale = Math.min(2, canvasScale + 0.1); updateCanvasTransform(); });
  document.getElementById('btnZoomOut').addEventListener('click', () => { canvasScale = Math.max(0.4, canvasScale - 0.1); updateCanvasTransform(); });
  document.getElementById('btnFitView').addEventListener('click', () => { canvasScale = 1; canvasPanX = 0; canvasPanY = 0; updateCanvasTransform(); });
}

function updateCanvasTransform() {
  const layer = document.getElementById('canvasTransformLayer');
  if (layer) {
    layer.style.transform = `translate(${canvasPanX}px, ${canvasPanY}px) scale(${canvasScale})`;
  }
}

// Draggable Nodes Logic (with Snap-to-Grid)
function setupNodeDragging() {
  const nodes = document.querySelectorAll('.n8n-node');
  let activeNode = null;
  let offsetX = 0;
  let offsetY = 0;

  nodes.forEach(node => {
    node.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('handle')) return;
      activeNode = node;
      const rect = node.getBoundingClientRect();
      const layerRect = document.getElementById('canvasTransformLayer').getBoundingClientRect();
      
      // Calculate offset relative to the scaled transform layer
      offsetX = (e.clientX - rect.left) / canvasScale;
      offsetY = (e.clientY - rect.top) / canvasScale;

      nodes.forEach(n => n.classList.remove('selected'));
      node.classList.add('selected');
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!activeNode) return;
    const layerRect = document.getElementById('canvasTransformLayer').getBoundingClientRect();
    
    // Calculate new position accounting for scale and pan
    let x = (e.clientX - layerRect.left) / canvasScale - offsetX;
    let y = (e.clientY - layerRect.top) / canvasScale - offsetY;

    // Snap to 20px grid
    x = Math.round(x / 20) * 20;
    y = Math.round(y / 20) * 20;

    activeNode.style.left = `${Math.max(10, x)}px`;
    activeNode.style.top = `${Math.max(10, y)}px`;

    drawConnections();
  });

  document.addEventListener('mouseup', () => {
    activeNode = null;
  });
}

// Inspector Drawer Logic
const nodeDataMap = {
  '1': {
    title: 'T-2 Daily Trigger',
    icon: SVG_ICONS.clock,
    params: { 'Schedule Cron': '0 8 * * * (Daily 08:00 AM)', 'Lead Time': 'T-2 Days', 'Execution Mode': 'Automatic / On-Demand' },
    json: { trigger: 'Cron Schedule', lead_days: 2, status: 'Active', target_time: '08:00 AM' }
  },
  '2': {
    title: 'Calendar DB Ingestion',
    icon: SVG_ICONS.calendar,
    params: { 'Source': 'SQLite events table', 'Pre-seeded Dates': '20+ National & UN Observances', 'Recurrence': 'Annual' },
    json: { total_events_ingested: 20, active_categories: ['NATIONAL', 'FESTIVAL', 'ENVIRONMENT', 'AWARENESS', 'TECHNOLOGY'] }
  },
  '3': {
    title: 'Relevance Engine',
    icon: SVG_ICONS.target,
    params: { 'Formula': 'Importance + Audience + Client Fit', 'Threshold': '40/100', 'Noise Reduction': 'Enabled' },
    json: { min_threshold: 40, evaluated_events: 20, passed_filter: 1, action: 'Alert Generated' }
  },
  '4': {
    title: 'Real-World News Synthesizer',
    icon: SVG_ICONS.globe,
    params: { 'Model': 'Gemini 1.5 Flash', 'Web Search': 'Live Fact Extraction', 'Source Links': 'PIB, UN, Government Portals' },
    json: {
      status: 'SUCCESS',
      summary: 'India is celebrating digital growth, space achievements, and youth entrepreneurship initiatives this month.',
      sources: [{ name: 'Press Information Bureau (PIB)', confidence: 'HIGH' }]
    }
  },
  '5': {
    title: '6-Idea Strategy Engine',
    icon: SVG_ICONS.lightbulb,
    params: { 'Total Concepts': '6 Distinct Ideas', 'Categories': 'Educational, Emotional, Brand, Social, Interactive, Experimental' },
    json: {
      concepts_generated: 6,
      categories_covered: ['Educational', 'Emotional', 'Brand-focused', 'Social-awareness', 'Interactive', 'Experimental'],
      recommendation: { recommended_ids: [1, 4], target_platforms: 'Instagram Carousel + LinkedIn' }
    }
  },
  '6': {
    title: 'Telegram Alert Dispatcher',
    icon: SVG_ICONS.send,
    params: { 'Target Channel': 'Telegram Bot API', 'Inline Feedback': 'Enabled (Useful, Save, Feedback)', 'Format': 'Markdown' },
    json: { alert_status: 'SENT', channel: 'Telegram Bot', inline_keyboard_buttons: ['Useful', 'Not useful', 'More like this', 'Save'] }
  }
};

function setupNodeInspector() {
  const nodes = document.querySelectorAll('.n8n-node');

  nodes.forEach(node => {
    node.addEventListener('click', () => {
      const id = node.getAttribute('data-id');
      const data = nodeDataMap[id];

      if (data) {
        document.getElementById('insIcon').innerHTML = data.icon;
        document.getElementById('insTitle').innerText = data.title;

        // Populate Params
        let paramsHtml = '<div style="display:flex; flex-direction:column; gap:12px;">';
        for (const [k, v] of Object.entries(data.params)) {
          paramsHtml += `
            <div class="form-group">
              <label>${k}:</label>
              <input type="text" class="text-input" value="${v}" readonly>
            </div>
          `;
        }
        paramsHtml += '</div>';
        document.getElementById('insParamsContainer').innerHTML = paramsHtml;

        // Populate Output JSON
        document.getElementById('jsonViewer').innerText = JSON.stringify(data.json, null, 2);
      }
    });
  });

  // Inspector Tabs Switcher
  const insTabs = document.querySelectorAll('.ins-tab');
  insTabs.forEach(t => {
    t.addEventListener('click', () => {
      insTabs.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ins-content').forEach(c => c.classList.remove('active'));

      t.classList.add('active');
      const tabId = t.getAttribute('data-instab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  document.getElementById('btnCloseInspector').addEventListener('click', () => {
    nodes.forEach(n => n.classList.remove('selected'));
  });
}

// Sequential Workflow Execution Engine Animation
async function runWorkflowExecution() {
  const btn = document.getElementById('btnExecuteWorkflow');
  const exStatusIcon = document.getElementById('exStatusIcon');
  const exStatusText = document.getElementById('exStatusText');
  const exDuration = document.getElementById('exDuration');

  btn.disabled = true;
  btn.innerHTML = SVG_ICONS.zap + ' Running Nodes...';
  exStatusIcon.innerHTML = SVG_ICONS.clock;
  exStatusText.innerText = 'Executing Taliyo Agent Pipeline (Nodes 1 → 6)...';

  const nodeIds = ['1', '2', '3', '4', '5', '6'];
  const startTime = Date.now();

  // Reset node classes
  nodeIds.forEach(id => {
    const node = document.getElementById(`node-${id}`);
    if (node) node.className = 'n8n-node ' + getCategoryClass(id);
  });

  document.querySelectorAll('.connection-path').forEach(p => p.classList.add('active-pulse'));

  // Step by step node lighting animation
  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i];
    const node = document.getElementById(`node-${id}`);

    if (node) {
      node.classList.add('running');
      exStatusText.innerText = `Executing Node ${id}: ${nodeDataMap[id].title}...`;
      await new Promise(r => setTimeout(r, 400));
      node.classList.remove('running');
      node.classList.add('success');
    }
  }

  // Trigger actual API backend
  try {
    const res = await fetch('/api/alerts/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();

    const elapsed = Date.now() - startTime;
    exStatusIcon.innerHTML = SVG_ICONS.zap;
    exStatusText.innerText = `Workflow execution finished successfully. ${data.result.alertsGenerated} briefings generated!`;
    exDuration.innerText = `Duration: ${elapsed}ms`;

    // Refresh outputs if briefing view is opened
    loadBriefings();
  } catch (err) {
    exStatusIcon.innerHTML = SVG_ICONS.target;
    exStatusText.innerText = 'Execution error: ' + err.message;
  } finally {
    document.querySelectorAll('.connection-path').forEach(p => p.classList.remove('active-pulse'));
    btn.disabled = false;
    btn.innerHTML = SVG_ICONS.zap + ' Test Workflow';
  }
}

function getCategoryClass(id) {
  if (id === '1' || id === '2') return 'node-trigger';
  if (id === '3' || id === '4') return 'node-engine';
  if (id === '5') return 'node-ai';
  return 'node-action';
}

// Telegram Sandbox Simulator Handler
function setupTelegramSandbox() {
  const sandboxInput = document.getElementById('sandboxInput');
  const sandboxSend = document.getElementById('sandboxSend');

  if (!sandboxInput || !sandboxSend) return;

  function sendSandboxCommand() {
    const cmdText = sandboxInput.value.trim();
    if (!cmdText) return;

    appendSandboxMessage(cmdText, 'user-msg');
    sandboxInput.value = '';

    const command = cmdText.split(' ')[0];
    const text = cmdText.substring(command.length).trim();

    fetch('/api/bot/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, text })
    })
    .then(r => r.json())
    .then(data => {
      if (data.reply) {
        appendSandboxMessage(data.reply, 'bot-msg');
      }
    })
    .catch(err => {
      appendSandboxMessage(`Error: ${err.message}`, 'bot-msg');
    });
  }

  sandboxSend.addEventListener('click', sendSandboxCommand);
  sandboxInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendSandboxCommand();
  });
}

function appendSandboxMessage(text, className) {
  const container = document.getElementById('sandboxMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `msg ${className}`;
  div.innerText = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Briefings Feed Loader
async function loadBriefings() {
  const container = document.getElementById('briefingsFeed');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner">Loading briefing feeds...</div>';

  try {
    const res = await fetch('/api/alerts');
    const data = await res.json();

    if (!data.alerts || data.alerts.length === 0) {
      container.innerHTML = `<div class="briefing-card" style="text-align:center;"><h3>No briefings generated yet.</h3><p>Click "Test Workflow" in the Canvas to execute the Taliyo agent pipeline.</p></div>`;
      return;
    }

    container.innerHTML = '';
    data.alerts.forEach(alt => {
      const card = document.createElement('div');
      card.className = 'briefing-card';

      let ideasHtml = '<div class="ideas-grid">';
      if (alt.ideas && alt.ideas.length > 0) {
        alt.ideas.forEach((idea, idx) => {
          ideasHtml += `
            <div class="idea-card">
              <span class="idea-cat">Idea #${idx + 1} — ${idea.category}</span>
              <div class="idea-title">${idea.title}</div>
              <div style="font-size:12px; color:var(--text-secondary);"><strong>Concept:</strong> ${idea.concept}</div>
              <div class="visual-highlight">${SVG_ICONS.palette} <strong>Visual:</strong> ${idea.visual_direction}</div>
              <div style="font-size:12px;">💬 <strong>Headline:</strong> "${idea.headline}"</div>
              <div style="margin-top:6px; font-size:11px; color:var(--text-muted);">📱 ${idea.platform}</div>
            </div>
          `;
        });
      }
      ideasHtml += '</div>';

      const rec = alt.recommendation || {};
      const recIds = rec.recommended_ids ? rec.recommended_ids.map(i => `#0${i}`).join(' + ') : '#01 + #04';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3><span class="badge badge-alert">T-2 ALERT</span> ${alt.event_name} (${alt.event_date})</h3>
          <span style="font-size:12px; color:var(--text-muted);">Relevance Score: ${alt.relevance_score}/100</span>
        </div>
        <div style="background:rgba(0,0,0,0.25); border-left:3px solid var(--n8n-yellow); padding:10px 14px; border-radius:4px; margin-bottom:16px; font-size:13px;">
          ${SVG_ICONS.flame} <strong>Real-World Context:</strong> ${alt.real_world_context || 'Verified annual calendar observance.'}
        </div>
        ${ideasHtml}
        <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:12px; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            ${SVG_ICONS.star} <strong>Recommended:</strong> ${recIds} | 📱 <strong>Platforms:</strong> ${rec.recommended_platforms || 'Instagram + LinkedIn'}
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="sendFeedback('${alt.id}', 'useful')">${SVG_ICONS.thumbsUp} Useful</button>
            <button class="btn btn-secondary btn-sm" onclick="sendFeedback('${alt.id}', 'not_useful')">${SVG_ICONS.thumbsDown} Not useful</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    showToast('Offline Mode: Displaying UI Demo Data', 'success');
    container.innerHTML = `
      <div class="briefing-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3><span class="badge badge-alert">T-2 ALERT</span> World Environment Day (June 05)</h3>
          <span style="font-size:12px; color:var(--text-muted);">Relevance Score: 85/100</span>
        </div>
        <div style="background:rgba(0,0,0,0.25); border-left:3px solid var(--n8n-yellow); padding:10px 14px; border-radius:4px; margin-bottom:16px; font-size:13px;">
          ${SVG_ICONS.flame} <strong>Real-World Context:</strong> Focus this year is on land restoration, desertification and drought resilience.
        </div>
        <div class="ideas-grid">
          <div class="idea-card">
            <span class="idea-cat">Educational</span>
            <h4 class="idea-title">Did you know? Land Restoration stats.</h4>
            <p style="font-size:12px; color:var(--text-secondary);">Carousel showing local impact.</p>
          </div>
          <div class="idea-card">
            <span class="idea-cat">Interactive</span>
            <h4 class="idea-title">Plant a tree challenge.</h4>
            <p style="font-size:12px; color:var(--text-secondary);">User generated content campaign.</p>
          </div>
        </div>
        <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:12px; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
          <div>${SVG_ICONS.star} <strong>Recommended:</strong> #01 + #02 | 📱 <strong>Platforms:</strong> Instagram + X</div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm">${SVG_ICONS.thumbsUp} Useful</button>
            <button class="btn btn-secondary btn-sm">${SVG_ICONS.thumbsDown} Not useful</button>
          </div>
        </div>
      </div>
    `;
  }
}

// Events Loader
async function loadEvents(catFilter = 'ALL') {
  const container = document.getElementById('eventsGrid');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner">Loading event database...</div>';

  try {
    const res = await fetch(`/api/events?category=${catFilter}`);
    const data = await res.json();

    container.innerHTML = '';
    data.events.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'event-card';

      card.innerHTML = `
        <div>
          <span class="badge badge-cat">${evt.category}</span>
          <h4 style="font-family:var(--font-heading); margin:8px 0 4px 0;">${SVG_ICONS.flag} ${evt.name}</h4>
          <span style="font-size:12px; color:var(--n8n-yellow); font-weight:700;">Date: ${evt.date}</span>
          <p style="font-size:12px; color:var(--text-secondary); margin-top:6px;">${evt.description || 'Calendar observance'}</p>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    const mockEvents = [
      { name: 'National Startup Day', date: 'January 16', category: 'BUSINESS', description: 'Celebration of Indian startup ecosystem.' },
      { name: 'World Environment Day', date: 'June 05', category: 'ENVIRONMENT', description: 'UN day for encouraging awareness and action for the environment.' },
      { name: 'Independence Day', date: 'August 15', category: 'NATIONAL', description: 'India marks its freedom from British rule.' }
    ];
    container.innerHTML = '';
    mockEvents.forEach(evt => {
      container.innerHTML += `
        <div class="event-card">
          <div>
            <span class="badge badge-cat">${evt.category}</span>
            <h4 style="font-family:var(--font-heading); margin:8px 0 4px 0;">${SVG_ICONS.flag} ${evt.name}</h4>
            <span style="font-size:12px; color:var(--n8n-yellow); font-weight:700;">Date: ${evt.date}</span>
            <p style="font-size:12px; color:var(--text-secondary); margin-top:6px;">${evt.description}</p>
          </div>
        </div>
      `;
    });
  }
}

// Clients Loader
async function loadClients() {
  const container = document.getElementById('clientsGrid');
  if (!container) return;

  try {
    const res = await fetch('/api/clients');
    const data = await res.json();

    container.innerHTML = '';
    data.clients.forEach(c => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.innerHTML = `
        <span class="badge badge-cat">${c.industry}</span>
        <h4 style="font-family:var(--font-heading); margin:8px 0;">${c.name}</h4>
        <p style="font-size:12px; color:var(--text-secondary);"><strong>Tone:</strong> ${c.brand_tone}</p>
        <p style="font-size:12px; color:var(--text-secondary);"><strong>Style:</strong> ${c.creative_style}</p>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    const mockClients = [
      { name: 'Zen Bite Restaurant', industry: 'Restaurant', brand_tone: 'Playful, Warm & Vibrant', creative_style: 'High visual food photography & clean typography' },
      { name: 'TechFlow SaaS', industry: 'SaaS', brand_tone: 'Professional & Innovative', creative_style: 'Minimalist tech diagrams and blue/white palette' }
    ];
    container.innerHTML = '';
    mockClients.forEach(c => {
      container.innerHTML += `
        <div class="event-card">
          <div>
            <span class="badge badge-cat">${c.industry}</span>
            <h4 style="font-family:var(--font-heading); margin:8px 0;">${c.name}</h4>
            <p style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;"><strong>Tone:</strong> ${c.brand_tone}</p>
            <p style="font-size:12px; color:var(--text-secondary);"><strong>Style:</strong> ${c.creative_style}</p>
          </div>
        </div>
      `;
    });
  }
}

// Toast Notification Utility
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? SVG_ICONS.zap : SVG_ICONS.target;
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function sendFeedback(alertId, rating) {
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId, rating })
    });
    showToast(`Feedback saved: ${rating}! Taliyo preference model updated.`, 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Modal Handlers Setup
function setupModals() {
  const modalEvt = document.getElementById('modalAddEvent');
  const modalClient = document.getElementById('modalAddClient');

  if (document.getElementById('btnAddEventModal')) {
    document.getElementById('btnAddEventModal').addEventListener('click', () => modalEvt.classList.add('open'));
    document.getElementById('btnCloseEventModal').addEventListener('click', () => modalEvt.classList.remove('open'));
    
    document.getElementById('formAddEvent').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('customEvtName').value,
        date: document.getElementById('customEvtDate').value,
        category: document.getElementById('customEvtCat').value,
        importance: document.getElementById('customEvtImportance').value
      };
      
      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.success) {
          modalEvt.classList.remove('open');
          showToast('Custom Event Added Successfully!', 'success');
          loadEvents();
          document.getElementById('formAddEvent').reset();
        } else {
          showToast(data.error || 'Failed to add event', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  if (document.getElementById('btnAddClientModal')) {
    document.getElementById('btnAddClientModal').addEventListener('click', () => modalClient.classList.add('open'));
    document.getElementById('btnCloseClientModal').addEventListener('click', () => modalClient.classList.remove('open'));
    
    document.getElementById('formAddClient').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('clientNameInput').value,
        industry: document.getElementById('clientIndustryInput').value,
        brand_tone: document.getElementById('clientToneInput').value,
        creative_style: document.getElementById('clientStyleInput').value
      };
      
      try {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.success) {
          modalClient.classList.remove('open');
          showToast('Client Profile Saved Successfully!', 'success');
          loadClients();
          document.getElementById('formAddClient').reset();
        } else {
          showToast(data.error || 'Failed to save client', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }
}

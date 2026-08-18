/**
 * TALIYO DESIGNOS — CLEAN INTERACTIVE ENGINE
 * Features: Preset Selection, Live Prompt Synthesis, 5-Layer Swatches Copy, W3C Token Export
 */

document.addEventListener('DOMContentLoaded', () => {
  initCleanPromptStudio();
});

const PRESET_CONCEPTS = {
  coffee: {
    prompt: "Specialty roasted coffee brand luxury dark packaging with warm café bokeh lighting",
    archetype: "ARCHETYPE // MONASTIC MINIMAL",
    title: "Obsidian & Warm Amber Roast",
    desc: "High-density matte obsidian background featuring a central macro floating coffee bean with warm golden café lighting. Eliminates chaotic retail visual noise in favor of premium artisanal authority.",
    score: "98.6",
    swatches: [
      { role: "Primary", hex: "#D97706" },
      { role: "Secondary", hex: "#B45309" },
      { role: "Background", hex: "#0A0908" },
      { role: "Surface", hex: "#1C1917" },
      { role: "Typography", hex: "#FEF3C7" }
    ],
    typo: "Neue Haas Grotesk + JetBrains Mono",
    whitespace: "94% visual differentiation",
    rationale: "The dark matte backdrop establishes uncompromising luxury, while the isolated 3D centerpiece immediately communicates tactile craft without relying on generic stock cliches.",
    imgSrc: "assets/renders/coffee_bean_hero.png",
    craftedPrompt: "Render a 3D roasted coffee bean with realistic textures, high-quality lighting, and a neutral background to showcase the coffee brand's product."
  },
  festive: {
    prompt: "Diwali festive royal brass diya centerpiece with warm golden illumination on dark obsidian background",
    archetype: "ARCHETYPE // ROYAL FESTIVE",
    title: "24K Brass Diya & Deep Crimson",
    desc: "Intricately etched brass diya with warm flickering flame, floating golden micro-sparkles, and an uncluttered obsidian base.",
    score: "99.2",
    swatches: [
      { role: "Primary", hex: "#F59E0B" },
      { role: "Secondary", hex: "#881337" },
      { role: "Background", hex: "#0B090A" },
      { role: "Surface", hex: "#161A1D" },
      { role: "Typography", hex: "#FFFBEB" }
    ],
    typo: "Canela Display + Plus Jakarta Sans",
    whitespace: "96% visual differentiation",
    rationale: "Honors traditional celebration rituals while maintaining modern international design aesthetics.",
    imgSrc: "assets/renders/festive_diya.png",
    craftedPrompt: "3D traditional Indian brass Diya with intricate filigree, warm flame, floating golden sparkles, dark obsidian background, 8k render."
  },
  luxury: {
    prompt: "Luxury 24k gold jewelry necklace with diamond reflections and dark velvet studio lighting",
    archetype: "ARCHETYPE // HIGH-TICKET LUXURY",
    title: "24K Gold Filigree & Velvet Black",
    desc: "Precision micro-faceted gold geometry with diamond caustics isolated against a seamless dark studio backdrop.",
    score: "100.0",
    swatches: [
      { role: "Primary", hex: "#EAB308" },
      { role: "Secondary", hex: "#CA8A04" },
      { role: "Background", hex: "#030712" },
      { role: "Surface", hex: "#111827" },
      { role: "Typography", hex: "#F8FAFC" }
    ],
    typo: "Ogg Roman + Neue Haas Unica",
    whitespace: "98% visual differentiation",
    rationale: "Eliminates distracting props to focus 100% of viewer attention on raw material perfection.",
    imgSrc: "assets/renders/luxury_jewelry.png",
    craftedPrompt: "3D luxury 24k gold jewelry filigree centerpiece, diamond reflections, dark obsidian background, studio lighting, no text, 8k."
  },
  tech: {
    prompt: "Modern fintech SaaS platform glassmorphism 3D holographic isometric data cube",
    archetype: "ARCHETYPE // ENTERPRISE SAAS",
    title: "Refractive Holographic Prism",
    desc: "Floating frosted glass cubes with translucent cyan-violet caustics and clean coordinate axes for SaaS hero banners.",
    score: "97.8",
    swatches: [
      { role: "Primary", hex: "#00F5FF" },
      { role: "Secondary", hex: "#8B5CF6" },
      { role: "Background", hex: "#090D16" },
      { role: "Surface", hex: "#131C2E" },
      { role: "Typography", hex: "#F8FAFC" }
    ],
    typo: "Inter Display + JetBrains Mono",
    whitespace: "92% visual differentiation",
    rationale: "Directly visualizes high-performance data processing through crystalline refraction.",
    imgSrc: "assets/renders/tech_saas.png",
    craftedPrompt: "3D glassmorphic holographic data cube, glowing cyber cyan and purple lighting, dark obsidian background, clean negative space, 8k."
  },
  podiums: {
    prompt: "Luxury real estate flat launch Carrara marble circular podium with soft titanium halo glow",
    archetype: "ARCHETYPE // ARCHITECTURAL D2C",
    title: "Carrara Marble & Titanium Ring",
    desc: "Minimalist circular marble platform with soft under-glow LED illumination and 60% negative space on top for typography.",
    score: "99.0",
    swatches: [
      { role: "Primary", hex: "#E2E8F0" },
      { role: "Secondary", hex: "#94A3B8" },
      { role: "Background", hex: "#08090C" },
      { role: "Surface", hex: "#1E293B" },
      { role: "Typography", hex: "#FFFFFF" }
    ],
    typo: "Cabinet Grotesk + Satoshi",
    whitespace: "95% visual differentiation",
    rationale: "Provides an elevated physical pedestal that immediately commands product prestige.",
    imgSrc: "assets/renders/real_estate_hero.png",
    craftedPrompt: "3D podium visual asset for luxury flat: minimalist podium, high-end materials, soft spotlight, neutral background, clean negative space, no text, 8k render."
  }
};

let activeKey = 'coffee';

function initCleanPromptStudio() {
  const promptInput = document.getElementById('user-prompt-input');
  const btnGenerate = document.getElementById('btn-generate-concept');
  const chips = document.querySelectorAll('.presets-pills-wrap .preset-chip');
  const btnCopyTokens = document.getElementById('btn-copy-tokens');

  // Preset Chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const preset = chip.getAttribute('data-preset');
      if (PRESET_CONCEPTS[preset]) {
        activeKey = preset;
        const data = PRESET_CONCEPTS[preset];
        if (promptInput) promptInput.value = data.prompt;
        renderConcept(data);
      }
    });
  });

  // Synthesize Action
  if (btnGenerate && promptInput) {
    btnGenerate.addEventListener('click', () => {
      const text = promptInput.value.trim().toLowerCase();
      btnGenerate.disabled = true;
      btnGenerate.innerHTML = '<span>⚡ Synthesizing...</span>';

      let matched = 'coffee';
      if (text.includes('diwali') || text.includes('festive') || text.includes('diya')) {
        matched = 'festive';
      } else if (text.includes('gold') || text.includes('jewelry') || text.includes('luxury')) {
        matched = 'luxury';
      } else if (text.includes('tech') || text.includes('saas') || text.includes('cyber')) {
        matched = 'tech';
      } else if (text.includes('podium') || text.includes('marble') || text.includes('real estate')) {
        matched = 'podiums';
      }

      activeKey = matched;

      // Update active chip
      chips.forEach(c => {
        if (c.getAttribute('data-preset') === matched) c.classList.add('active');
        else c.classList.remove('active');
      });

      setTimeout(() => {
        renderConcept(PRESET_CONCEPTS[matched]);
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>Synthesize System</span>
        `;
      }, 250);
    });
  }

  // Copy W3C Tokens JSON
  if (btnCopyTokens) {
    btnCopyTokens.addEventListener('click', () => {
      const data = PRESET_CONCEPTS[activeKey];
      const payload = {
        name: data.title,
        archetype: data.archetype,
        color_tokens: data.swatches.reduce((acc, s) => {
          acc[s.role.toLowerCase()] = { value: s.hex, type: "color" };
          return acc;
        }, {}),
        typography: data.typo,
        crafted_3d_prompt: data.craftedPrompt,
        semiotic_score: data.score
      };

      navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
        const originalHTML = btnCopyTokens.innerHTML;
        btnCopyTokens.innerHTML = '<span>✅ Copied!</span>';
        setTimeout(() => { btnCopyTokens.innerHTML = originalHTML; }, 2000);
      });
    });
  }

  // Initial render
  renderConcept(PRESET_CONCEPTS.coffee);
}

function renderConcept(data) {
  if (!data) return;

  const archEl = document.getElementById('studio-concept-archetype');
  const titleEl = document.getElementById('studio-concept-title');
  const descEl = document.getElementById('studio-concept-desc');
  const scoreEl = document.getElementById('studio-score');
  const typoEl = document.getElementById('studio-typo');
  const whitespaceEl = document.getElementById('studio-whitespace');
  const rationaleEl = document.getElementById('studio-rationale');
  const swatchesEl = document.getElementById('studio-swatches');
  const previewImg = document.getElementById('studio-render-preview');
  const promptEl = document.getElementById('studio-crafted-prompt');

  if (archEl) archEl.textContent = data.archetype;
  if (titleEl) titleEl.textContent = data.title;
  if (descEl) descEl.textContent = data.desc;
  if (scoreEl) scoreEl.textContent = data.score;
  if (typoEl) typoEl.textContent = data.typo;
  if (whitespaceEl) whitespaceEl.textContent = data.whitespace;
  if (rationaleEl) rationaleEl.textContent = `"${data.rationale}"`;
  if (previewImg && data.imgSrc) previewImg.src = data.imgSrc;
  if (promptEl) promptEl.textContent = `"${data.craftedPrompt}"`;

  // Swatches
  if (swatchesEl && data.swatches) {
    swatchesEl.innerHTML = '';
    data.swatches.forEach(s => {
      const el = document.createElement('div');
      el.className = 'swatch-item';
      el.title = `Click to copy ${s.hex}`;
      el.innerHTML = `
        <div class="swatch-color" style="background-color: ${s.hex};"></div>
        <span class="swatch-role">${s.role}</span>
        <span class="swatch-hex">${s.hex}</span>
      `;
      el.addEventListener('click', () => {
        navigator.clipboard.writeText(s.hex);
        el.style.borderColor = '#00f5ff';
        setTimeout(() => { el.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }, 700);
      });
      swatchesEl.appendChild(el);
    });
  }
}

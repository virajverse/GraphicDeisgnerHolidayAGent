/**
 * DesignOS — Flagship Interactive Architecture Controller
 * 4 Bespoke Spatial Stages:
 * 1. Hero Spatial Anatomy with Hairline Vector Callouts
 * 2. Silicon Cockpit Split Layout with Live Diagnostics
 * 3. Blueprint Drafting Lab with Horizontal Axial Subsystem Tracking
 * 4. Unified Metamorphosis Studio (Executive Pro Console)
 */

(function () {
  'use strict';

  const BG_COLOR = '#0a0a0a';
  const TOTAL_FRAMES = 240;

  // Generic Reusable Sequencer Class with Smart Adaptive Frame Preloader & Fallback
  class PinnedStoryEngine {
    constructor(config) {
      this.section = document.getElementById(config.sectionId);
      this.canvas = document.getElementById(config.canvasId);
      if (!this.section || !this.canvas) return;

      this.ctx = this.canvas.getContext('2d');
      this.framesDir = config.framesDir;
      this.filePattern = config.filePattern;
      this.counter = document.getElementById(config.counterId);
      this.scrollCue = document.getElementById(config.scrollCueId);
      this.onProgress = config.onProgress || null;
      this.totalFrames = config.totalFrames || TOTAL_FRAMES;
      this.lerpSpeed = config.lerpSpeed || 0.16;

      this.images = new Array(this.totalFrames);
      this.loadedStatus = new Array(this.totalFrames).fill(false);
      this.lastLoadedImg = null;
      this.currentFrame = 0;
      this.targetFrame = 0;
      this.isManual = false;

      // Priority Preload initial batch
      this.preloadInitial();
      this.resize();
    }

    getFrameUrl(frameNum) {
      return `${this.framesDir}/${this.filePattern(frameNum)}`;
    }

    requestFrame(index) {
      if (index < 0 || index >= this.totalFrames) return null;
      if (this.images[index]) return this.images[index];

      const img = new Image();
      img.src = this.getFrameUrl(index + 1);
      img.onload = () => {
        this.loadedStatus[index] = true;
        if (!this.lastLoadedImg) {
          this.lastLoadedImg = img;
        }
        if (Math.abs(Math.round(this.currentFrame) - index) < 3) {
          this.render(Math.round(this.currentFrame));
        }
      };
      this.images[index] = img;
      return img;
    }

    preloadInitial() {
      // Preload first 25 frames immediately for instant rendering
      for (let i = 0; i < Math.min(25, this.totalFrames); i++) {
        this.requestFrame(i);
      }
      // Preload the rest asynchronously in chunks
      setTimeout(() => {
        for (let i = 25; i < this.totalFrames; i++) {
          this.requestFrame(i);
        }
      }, 200);
    }

    preloadWindow(centerIdx) {
      const start = Math.max(0, centerIdx - 35);
      const end = Math.min(this.totalFrames - 1, centerIdx + 50);
      for (let i = start; i <= end; i++) {
        this.requestFrame(i);
      }
    }

    resize() {
      if (!this.canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width || window.innerWidth;
      const h = rect.height || window.innerHeight;

      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;

      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      this.render(Math.round(this.currentFrame));
    }

    render(frameIdx) {
      if (!this.canvas || !this.ctx) return;
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width || window.innerWidth;
      const h = rect.height || window.innerHeight;

      const safeIdx = Math.max(0, Math.min(this.totalFrames - 1, frameIdx));
      let img = this.images[safeIdx];

      // If requested image is not loaded yet, find nearest loaded image or use last loaded
      if (!img || !this.loadedStatus[safeIdx] || !img.complete || img.naturalWidth === 0) {
        // Request it right away
        this.requestFrame(safeIdx);

        // Search nearest loaded frame
        let fallback = null;
        for (let offset = 1; offset < 20; offset++) {
          const prev = safeIdx - offset;
          if (prev >= 0 && this.loadedStatus[prev] && this.images[prev]?.complete) {
            fallback = this.images[prev];
            break;
          }
          const next = safeIdx + offset;
          if (next < this.totalFrames && this.loadedStatus[next] && this.images[next]?.complete) {
            fallback = this.images[next];
            break;
          }
        }

        img = fallback || this.lastLoadedImg;
        if (!img || !img.complete || img.naturalWidth === 0) {
          this.ctx.fillStyle = BG_COLOR;
          this.ctx.fillRect(0, 0, w, h);
          return;
        }
      } else {
        this.lastLoadedImg = img;
      }

      this.ctx.fillStyle = BG_COLOR;
      this.ctx.fillRect(0, 0, w, h);

      const imgRatio = img.naturalWidth / img.naturalHeight || (16 / 9);
      const screenRatio = w / h;
      let drawW, drawH, offsetX, offsetY;

      if (screenRatio > imgRatio) {
        drawH = h;
        drawW = h * imgRatio;
        offsetX = (w - drawW) / 2;
        offsetY = 0;
      } else {
        drawW = w;
        drawH = w / imgRatio;
        offsetX = 0;
        offsetY = (h - drawH) / 2;
      }

      this.ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    }

    updateScroll() {
      if (!this.section || this.isManual) return;
      const rect = this.section.getBoundingClientRect();
      const sectionH = this.section.offsetHeight;
      const windowH = window.innerHeight;
      const scrollableDistance = sectionH - windowH;

      if (scrollableDistance <= 0) return;

      const rawProgress = -rect.top / scrollableDistance;
      const progress = Math.max(0, Math.min(1, rawProgress));

      this.targetFrame = progress * (this.totalFrames - 1);
      this.preloadWindow(Math.round(this.targetFrame));

      if (this.counter) {
        const currentInt = Math.min(this.totalFrames, Math.max(1, Math.round(this.targetFrame) + 1));
        this.counter.textContent = `FRAME ${String(currentInt).padStart(3, '0')}/${this.totalFrames}`;
      }

      if (this.scrollCue) {
        this.scrollCue.style.opacity = progress > 0.04 ? '0' : '0.8';
      }

      if (this.onProgress) {
        this.onProgress(progress, this.targetFrame);
      }
    }

    setTargetFrame(frame) {
      this.targetFrame = Math.max(0, Math.min(this.totalFrames - 1, frame));
      this.preloadWindow(Math.round(this.targetFrame));
      if (this.counter) {
        const currentInt = Math.min(this.totalFrames, Math.max(1, Math.round(this.targetFrame) + 1));
        this.counter.textContent = `FRAME ${String(currentInt).padStart(3, '0')}/${this.totalFrames}`;
      }
    }

    tick() {
      const diff = this.targetFrame - this.currentFrame;
      if (Math.abs(diff) > 0.001) {
        this.currentFrame += diff * this.lerpSpeed;
        this.render(Math.round(this.currentFrame));
      }
    }
  }

  // ==========================================================================
  // SECTION 01: HERO SPATIAL HARDWARE ANATOMY
  // ==========================================================================
  const heroIntro = document.getElementById('hero-intro');
  const calloutGlass = document.getElementById('callout-glass');
  const calloutDigitizer = document.getElementById('callout-digitizer');
  const calloutSilicon = document.getElementById('callout-silicon');
  const calloutChassis = document.getElementById('callout-chassis');

  const heroStory = new PinnedStoryEngine({
    sectionId: 'hero-spatial',
    canvasId: 'hero-canvas',
    framesDir: 'frames',
    filePattern: (i) => `ezgif-frame-${String(i).padStart(3, '0')}.jpg`,
    counterId: 'hero-frame-counter',
    scrollCueId: 'hero-scroll-cue',
    onProgress: (progress) => {
      if (heroIntro) {
        heroIntro.style.opacity = progress > 0.15 ? '0' : '1';
        heroIntro.style.pointerEvents = progress > 0.15 ? 'none' : 'auto';
      }

      if (calloutGlass) calloutGlass.classList.toggle('active', progress >= 0.20 && progress <= 0.45);
      if (calloutDigitizer) calloutDigitizer.classList.toggle('active', progress >= 0.40 && progress <= 0.65);
      if (calloutSilicon) calloutSilicon.classList.toggle('active', progress >= 0.60 && progress <= 0.85);
      if (calloutChassis) calloutChassis.classList.toggle('active', progress >= 0.75 && progress <= 1.00);
    }
  });

  // ==========================================================================
  // SECTION 02: NEURAL SILICON COCKPIT
  // ==========================================================================
  const chipDieTemp = document.getElementById('chip-die-temp');
  const chipStageLabel = document.getElementById('chip-stage-label');

  const chipStory = new PinnedStoryEngine({
    sectionId: 'silicon-cockpit',
    canvasId: 'chip-canvas',
    framesDir: 'frames_chip',
    filePattern: (i) => `frame_${String(i).padStart(3, '0')}.jpg`,
    counterId: 'chip-frame-counter',
    onProgress: (progress) => {
      if (chipDieTemp) {
        const temp = (32.0 + progress * 14.5).toFixed(1);
        chipDieTemp.textContent = `TEMP: ${temp}°C`;
      }
      if (chipStageLabel) {
        if (progress < 0.2) chipStageLabel.textContent = 'PACKAGE CLOSED // CERAMIC SPREADER';
        else if (progress < 0.7) chipStageLabel.textContent = 'DIE LEVITATING // 3NM SUBSTRATE EXPOSED';
        else chipStageLabel.textContent = 'NEURAL CORES ILLUMINATED // INFERENCE STREAMING';
      }
    }
  });

  // ==========================================================================
  // SECTION 03: BLUEPRINT DRAFTING LAB (HORIZONTAL STYLUS)
  // ==========================================================================
  const stylusPartsStrip = document.getElementById('stylus-parts-strip');

  const stylusStory = new PinnedStoryEngine({
    sectionId: 'drafting-lab',
    canvasId: 'stylus-canvas',
    framesDir: 'frames_stylus',
    filePattern: (i) => `frame_${String(i).padStart(3, '0')}.jpg`,
    counterId: 'stylus-frame-counter',
    onProgress: (progress) => {
      if (stylusPartsStrip) {
        stylusPartsStrip.classList.toggle('active', progress > 0.15);
      }
    }
  });

  // ==========================================================================
  // SECTION 04: UNIFIED METAMORPHOSIS STUDIO (CAN + BRIEF ENGINE)
  // ==========================================================================
  const canSlider = document.getElementById('can-slider');
  const canScrubVal = document.getElementById('can-scrub-val');
  const canCanvas = document.getElementById('can-canvas');
  const tick0 = document.getElementById('tick-0');
  const tick1 = document.getElementById('tick-1');
  const tick2 = document.getElementById('tick-2');

  const canStory = new PinnedStoryEngine({
    sectionId: 'metamorphosis-studio',
    canvasId: 'can-canvas',
    framesDir: 'frames_can',
    filePattern: (i) => `frame_${String(i).padStart(3, '0')}.jpg`,
    counterId: 'can-frame-counter',
    onProgress: (progress, frame) => {
      if (canSlider && !canStory.isManual) {
        canSlider.value = Math.round(frame);
      }
      updateScrubberUI(progress);
    }
  });

  function updateScrubberUI(ratio) {
    const percent = Math.round(ratio * 100);
    let label = 'RAW SUBSTRATE';
    if (percent >= 80) label = 'IDENTITY ASSEMBLED';
    else if (percent >= 30) label = 'TYPOGRAPHIC ETCHING';

    if (canScrubVal) {
      canScrubVal.textContent = `${label} [${percent}%]`;
    }

    if (tick0 && tick1 && tick2) {
      tick0.classList.toggle('active', percent < 30);
      tick1.classList.toggle('active', percent >= 30 && percent < 80);
      tick2.classList.toggle('active', percent >= 80);
    }
  }

  // Slider interaction
  if (canSlider) {
    canSlider.addEventListener('input', (e) => {
      canStory.isManual = true;
      const frame = parseFloat(e.target.value);
      canStory.setTargetFrame(frame);
      updateScrubberUI(frame / 239);
    });
    canSlider.addEventListener('change', () => {
      canStory.isManual = false;
    });
  }

  // Pointer Scrubbing on Studio Canvas
  if (canCanvas) {
    let isDown = false;
    canCanvas.addEventListener('pointerdown', (e) => {
      isDown = true;
      canStory.isManual = true;
      handleCanScrub(e);
    });
    window.addEventListener('pointermove', (e) => {
      if (isDown) handleCanScrub(e);
    });
    window.addEventListener('pointerup', () => {
      isDown = false;
      canStory.isManual = false;
    });
  }

  function handleCanScrub(e) {
    const rect = canCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = x / rect.width;
    const frame = ratio * (TOTAL_FRAMES - 1);
    canStory.setTargetFrame(frame);
    if (canSlider) canSlider.value = Math.round(frame);
    updateScrubberUI(ratio);
  }

  // Auto Play Button logic
  const btnAutoSynth = document.getElementById('btn-auto-synth');
  let autoPlayInterval = null;
  let autoFrame = 0;
  let autoForward = true;

  if (btnAutoSynth) {
    btnAutoSynth.addEventListener('click', () => {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
        btnAutoSynth.classList.remove('active');
        btnAutoSynth.textContent = 'AUTO PLAY';
        canStory.isManual = false;
      } else {
        canStory.isManual = true;
        btnAutoSynth.classList.add('active');
        btnAutoSynth.textContent = 'PAUSE LOOP';
        autoPlayInterval = setInterval(() => {
          if (autoForward) {
            autoFrame += 2;
            if (autoFrame >= 239) {
              autoFrame = 239;
              autoForward = false;
            }
          } else {
            autoFrame -= 2;
            if (autoFrame <= 0) {
              autoFrame = 0;
              autoForward = true;
            }
          }
          canStory.setTargetFrame(autoFrame);
          if (canSlider) canSlider.value = autoFrame;
          updateScrubberUI(autoFrame / 239);
        }, 30);
      }
    });
  }

  // ==========================================================================
  // UNIFIED BRIEF ENGINE DATA & STATE
  // ==========================================================================
  const STUDIO_PRESETS = {
    bev: {
      brief: 'Formulate packaging identity for a high-caffeine sparkling nootropic beverage targeted at software architects and precision creatives. Brand must communicate discipline, cognitive clarity, and zero synthetic excess.',
      targetFrame: 239,
      speed: '0.24s',
      concepts: [
        {
          tab: '01 // Monastic Precision',
          archetype: 'ARCHETYPE // MINIMALIST DISCIPLINE',
          title: 'Monastic Precision — Void & Optical White',
          score: '98.4',
          desc: 'High-density matte obsidian chassis with micro-laser engraved geometric typography and a singular 0.5pt phosphor cyan alignment index. Eliminates all chaotic energy tropes in favor of calculated surgical focus.',
          swatches: ['#07080A', '#00F5FF', '#1B1E2B', '#F0F2F8'],
          typo: 'Neue Haas Grotesk Display (75 Bold) + JetBrains Mono',
          whitespace: 'Monochromatic discipline creates 4.8x higher visual differentiation vs saturated retail cans.',
          rationale: '"The container does not beg for retail shelf attention; it commands authority through absolute acoustic silence."'
        },
        {
          tab: '02 // Industrial Telemetry',
          archetype: 'ARCHETYPE // TECHNICAL BRUTALISM',
          title: 'Industrial Telemetry — Brushed Anodized Grid',
          score: '96.2',
          desc: 'Exposed raw brushed metal finish with direct silk-screened batch formulation coordinates, chemical assay indices, and barcode layout grids.',
          swatches: ['#D1D5DB', '#111827', '#F59E0B', '#374151'],
          typo: 'Suisse Int\'l Mono + DIN 1451 Pro Mittelschrift',
          whitespace: 'Translates laboratory authenticity into consumer ritual for engineering demographics.',
          rationale: '"Authenticity through unadorned technical disclosure. The customer trusts the chemistry, not the marketing."'
        },
        {
          tab: '03 // Bioluminescent Spectral',
          archetype: 'ARCHETYPE // FUTURE ORGANIC',
          title: 'Bioluminescent Spectral — Deep Trench Synapse',
          score: '94.8',
          desc: 'Ultra-deep indigo base with reactive holographic chromatic foil accents that shift color temp based on viewing incident angle.',
          swatches: ['#0A092D', '#7928CA', '#00DFD8', '#FFFFFF'],
          typo: 'PP Editorial New Ultralight + Monument Extended',
          whitespace: 'Captures the intersection of synthetic biology and high aesthetic design.',
          rationale: '"Connects organic neuro-enhancement with cutting-edge optical physics."'
        },
        {
          tab: '04 // Raw Constructivism',
          archetype: 'ARCHETYPE // ARCHITECTURAL CONSTRUCTIVISM',
          title: 'Raw Constructivism — Monolithic Black & Signal Ochre',
          score: '95.1',
          desc: 'Heavy structural diagonal grids, stark block hierarchy, and uncompromising visual weight inspired by mid-century Swiss modernism.',
          swatches: ['#121212', '#FACC15', '#262626', '#FAFAFA'],
          typo: 'Founders Grotesk Condensed + Favorit Mono',
          whitespace: 'Complete rejection of playful cartoonish mascots prevalent in esports hydration lines.',
          rationale: '"Engineered as a physical monument to sustained intellectual labor."'
        },
        {
          tab: '05 // Mathematical Monolith',
          archetype: 'ARCHETYPE // REDUCTIVE RATIONALISM',
          title: 'Mathematical Monolith — Zero-Ink Debossed Matte',
          score: '97.6',
          desc: 'Blind debossed structural embossing on soft-touch tactile paper sleeves with serial authentication chip.',
          swatches: ['#1A1A1A', '#2E2E2E', '#6B7280', '#E5E7EB'],
          typo: 'GT America Expanded Light + Söhne Mono',
          whitespace: 'Ultra-luxury positioning that elevates energy drinks to the echelon of bespoke horology packaging.',
          rationale: '"Luxury in the modern era is the absolute absence of noise."'
        }
      ]
    },

    fintech: {
      brief: 'Design system for an autonomous institutional treasury and crypto-liquidity settlement platform. Target audience: tier-1 venture partners, quant funds, and sovereign reserve managers.',
      targetFrame: 180,
      speed: '0.28s',
      concepts: [
        {
          tab: '01 // Sovereign Kinetic',
          archetype: 'ARCHETYPE // INSTITUTIONAL GRAVITAS',
          title: 'Sovereign Kinetic — Deep Cobalt & Platinum Hairline',
          score: '99.1',
          desc: 'High-order geometric grid architecture featuring micro-thin platinum vectors, deep ocean midnight fields, and live cryptographic state telemetry.',
          swatches: ['#030712', '#3B82F6', '#1E293B', '#F8FAFC'],
          typo: 'Söhne Breit + Commit Mono',
          whitespace: 'Platinum hairline precision establishes immediate sovereign-level credibility vs meme neon fintech.',
          rationale: '"Built to look like central bank infrastructure operated by 22nd-century automated systems."'
        },
        {
          tab: '02 // Cryptographic Rigor',
          archetype: 'ARCHETYPE // PROTOCOL NATIVE',
          title: 'Cryptographic Rigor — Carbon Obsidian & Emerald Key',
          score: '97.4',
          desc: 'Dark mode native interface displaying hash proofs, latency curves, and zero-knowledge verification badges.',
          swatches: ['#0B0F17', '#10B981', '#1F2937', '#E2E8F0'],
          typo: 'Geist Mono + ABC Monument Grotesk',
          whitespace: 'Direct appeal to algorithmic traders who evaluate platforms based on execution transparency.',
          rationale: '"Trust is not granted via marketing promises; it is verified through computational proof."'
        },
        {
          tab: '03 // Architectural Vault',
          archetype: 'ARCHETYPE // MONOLITHIC SECURITY',
          title: 'Architectural Vault — Basalt Stone & Warm Nickel',
          score: '95.8',
          desc: 'Warm textured dark stone backgrounds with laser-etched metallic typography and high-density financial tables.',
          swatches: ['#141416', '#A1A1AA', '#27272A', '#FAFAFA'],
          typo: 'Roobert Semibold + Berkeley Mono',
          whitespace: 'Bridges traditional Swiss private banking heritage with automated on-chain clearing.',
          rationale: '"The permanence of 300-year private banking, delivered with sub-millisecond execution."'
        },
        {
          tab: '04 // Vector Matrix',
          archetype: 'ARCHETYPE // HIGH-FREQUENCY SYSTEM',
          title: 'Vector Matrix — Terminal Dark & Solar Gold',
          score: '96.5',
          desc: 'Ultra-dense data layout inspired by Bloomberg terminals, reimagined with modern CSS depth.',
          swatches: ['#09090B', '#EAB308', '#27272A', '#FFFFFF'],
          typo: 'PP Right Grotesk + Fira Code Retina',
          whitespace: 'Zero whitespace waste; every square pixel delivers actionable financial intelligence.',
          rationale: '"Maximum informational bandwidth for decisions that involve tens of millions per tick."'
        },
        {
          tab: '05 // Pure Ledger',
          archetype: 'ARCHETYPE // RADICAL TRANSPARENCY',
          title: 'Pure Ledger — High-Key Silver & Obsidian Core',
          score: '98.0',
          desc: 'A rare high-contrast silver aesthetic that delivers editorial magazine-like clarity to complex balance sheets.',
          swatches: ['#E5E7EB', '#111827', '#9CA3AF', '#000000'],
          typo: 'Inter Display Variable + JetBrains Mono',
          whitespace: 'Radical optical clarity makes complex treasury liabilities immediately comprehensible.',
          rationale: '"Radical optical clarity makes complex treasury liabilities immediately comprehensible."'
        }
      ]
    },

    skincare: {
      brief: 'Identity and packaging system for an ultra-clinical Scandinavian bio-fermentation skincare brand. Formulated with genomic peptide synthesis. Must look scientifically rigorous, not organic/boho.',
      targetFrame: 210,
      speed: '0.21s',
      concepts: [
        {
          tab: '01 // Clinical Isolate',
          archetype: 'ARCHETYPE // SCIENTIFIC PURITY',
          title: 'Clinical Isolate — Sterile White & Amber Spectrometry',
          score: '98.9',
          desc: 'Pharma-grade borosilicate glass bottles with exact peptide sequence notation debossed into custom molded pulp secondary cartons.',
          swatches: ['#F9FAFB', '#D97706', '#1F2937', '#E5E7EB'],
          typo: 'Univers Pro 55 + Victor Mono Light',
          whitespace: 'Replaces vague "clean beauty" tropes with uncompromising molecular biology precision.',
          rationale: '"Beauty backed by verifiable clinical genomics rather than emotional storytelling."'
        },
        {
          tab: '02 // Cryo Preservation',
          archetype: 'ARCHETYPE // CELLULAR COLD-CHAIN',
          title: 'Cryo Preservation — Frosted Glass & Ice Glaze',
          score: '96.3',
          desc: 'Heavyweight matte-frosted containers that mimic sub-zero laboratory storage vials.',
          swatches: ['#F0FDF4', '#0284C7', '#0F172A', '#FFFFFF'],
          typo: 'Aktiv Grotesk + Fragment Mono',
          whitespace: 'Communicates live peptide bio-activity and cold-temperature stabilization.',
          rationale: '"Visualizes the potency of bio-active molecules kept in peak cellular suspension."'
        },
        {
          tab: '03 // Nordic Genome',
          archetype: 'ARCHETYPE // BIOMETRIC SYSTEM',
          title: 'Nordic Genome — Basalt Slate & Botanical Infrared',
          score: '95.7',
          desc: 'Deep Nordic slate-grey vessels with crisp white silk-screened molecular formulas.',
          swatches: ['#18181B', '#EC4899', '#3F3F46', '#F4F4F5'],
          typo: 'NB International Pro + GT America Mono',
          whitespace: 'Distinguishes the brand from ubiquitous influencer pastel cosmetics.',
          rationale: '"Positioned as medical dermatology equipment rather than casual consumer makeup."'
        },
        {
          tab: '04 // Pure Peptide',
          archetype: 'ARCHETYPE // PHARMACEUTICAL LUXURY',
          title: 'Pure Peptide — Ultra-Matte Titanium & Cobalt Index',
          score: '97.2',
          desc: 'Machined recyclable aluminum pumps with optical measurement gradients calibrated to 0.1ml dosage.',
          swatches: ['#27272A', '#2563EB', '#71717A', '#FFFFFF'],
          typo: 'Styrene A + Supply Mono',
          whitespace: 'Draws on surgical instrument ergonomics for tactile luxury.',
          rationale: '"Aesthetic pleasure derived from mechanical calibration and exact scientific dose delivery."'
        },
        {
          tab: '05 // Bio-Synthesis',
          archetype: 'ARCHETYPE // CELLULAR FERMENTATION',
          title: 'Bio-Synthesis — Alabaster Ceramic & Sage Micro-Grid',
          score: '96.8',
          desc: 'Refillable matte ceramic cylinders with laser-etched harvest dates and micro-grid technical typography.',
          swatches: ['#F4F4F5', '#059669', '#27272A', '#D4D4D8'],
          typo: 'Everett + Space Mono',
          whitespace: 'Balances raw Nordic geological materials with molecular synthesis verification.',
          rationale: '"Where natural geological silence meets state-of-the-art cellular biotechnology."'
        }
      ]
    }
  };

  let activePresetKey = 'bev';
  let activeConceptIndex = 0;

  function renderStudio() {
    const currentPreset = STUDIO_PRESETS[activePresetKey];
    if (!currentPreset) return;

    // Brief text & Speed
    const briefTextEl = document.getElementById('studio-brief-text');
    if (briefTextEl) briefTextEl.textContent = currentPreset.brief;

    const speedEl = document.getElementById('st-inference-speed');
    if (speedEl) speedEl.textContent = currentPreset.speed;

    // Direction tabs
    const tabsContainer = document.getElementById('studio-direction-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
      currentPreset.concepts.forEach((concept, idx) => {
        const btn = document.createElement('button');
        btn.className = `s-tab ${idx === activeConceptIndex ? 'active' : ''}`;
        btn.textContent = concept.tab;
        btn.addEventListener('click', () => {
          activeConceptIndex = idx;
          canStory.setTargetFrame(80 + idx * 38);
          renderStudio();
        });
        tabsContainer.appendChild(btn);
      });
    }

    // Concept details
    const c = currentPreset.concepts[activeConceptIndex] || currentPreset.concepts[0];
    const archEl = document.getElementById('studio-concept-archetype');
    const titleEl = document.getElementById('studio-concept-title');
    const descEl = document.getElementById('studio-concept-desc');
    const typoEl = document.getElementById('studio-typo');
    const whiteEl = document.getElementById('studio-whitespace');
    const ratEl = document.getElementById('studio-rationale');
    const swatchesEl = document.getElementById('studio-swatches');
    const scoreEl = document.getElementById('studio-score');

    if (archEl) archEl.textContent = c.archetype;
    if (titleEl) titleEl.textContent = c.title;
    if (descEl) descEl.textContent = c.desc;
    if (typoEl) typoEl.textContent = c.typo;
    if (whiteEl) whiteEl.textContent = c.whitespace;
    if (ratEl) ratEl.textContent = c.rationale;
    if (scoreEl) scoreEl.textContent = c.score || '98.4';

    if (swatchesEl) {
      swatchesEl.innerHTML = '';
      c.swatches.forEach((hex) => {
        const card = document.createElement('div');
        card.className = 'swatch-card';
        card.style.setProperty('--swatch-bg', hex);
        card.innerHTML = `<span class="swatch-code">${hex}</span>`;
        swatchesEl.appendChild(card);
      });
    }
  }

  // Preset pill handlers
  const studioPresetButtons = document.querySelectorAll('#studio-brief-pills .st-pill');
  studioPresetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      studioPresetButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activePresetKey = btn.getAttribute('data-preset');
      activeConceptIndex = 0;
      canStory.setTargetFrame(STUDIO_PRESETS[activePresetKey].targetFrame);
      renderStudio();
    });
  });

  // 1-Click Copy Token Handlers
  const btnCopyTokens = document.getElementById('btn-copy-tokens');
  const btnCopyFigma = document.getElementById('btn-copy-figma');

  if (btnCopyTokens) {
    btnCopyTokens.addEventListener('click', () => {
      const c = STUDIO_PRESETS[activePresetKey].concepts[activeConceptIndex];
      const jsonStr = JSON.stringify({
        designOS: {
          concept: c.title,
          archetype: c.archetype,
          semioticScore: c.score,
          colors: c.swatches,
          typography: c.typo,
          rationale: c.rationale
        }
      }, null, 2);

      navigator.clipboard.writeText(jsonStr).then(() => {
        const originalText = btnCopyTokens.innerHTML;
        btnCopyTokens.innerHTML = '<span>COPIED W3C JSON TO CLIPBOARD!</span>';
        btnCopyTokens.style.borderColor = '#10b981';
        setTimeout(() => {
          btnCopyTokens.innerHTML = originalText;
          btnCopyTokens.style.borderColor = '';
        }, 2500);
      });
    });
  }

  if (btnCopyFigma) {
    btnCopyFigma.addEventListener('click', () => {
      const originalText = btnCopyFigma.innerHTML;
      btnCopyFigma.innerHTML = '<span>EXPORTED TO FIGMA VARIABLES!</span>';
      btnCopyFigma.style.borderColor = '#10b981';
      setTimeout(() => {
        btnCopyFigma.innerHTML = originalText;
        btnCopyFigma.style.borderColor = '';
      }, 2500);
    });
  }

  // ==========================================================================
  // ACCESS WAITLIST FORM
  // ==========================================================================
  const waitlistForm = document.getElementById('waitlist-form');
  const emailInput = document.getElementById('email-input');
  const waitlistBtn = document.getElementById('waitlist-btn');

  if (waitlistForm && emailInput && waitlistBtn) {
    waitlistForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = emailInput.value.trim();
      if (!val || !val.includes('@')) {
        emailInput.style.borderColor = '#ef4444';
        emailInput.focus();
        setTimeout(() => { emailInput.style.borderColor = ''; }, 2000);
        return;
      }

      waitlistBtn.disabled = true;
      waitlistBtn.textContent = 'INVITATION LOGGED // PRIORITY QUEUE';
      waitlistBtn.style.background = '#10b981';
      waitlistBtn.style.color = '#ffffff';
      emailInput.value = '';
    });
  }

  // ==========================================================================
  // GLOBAL SCROLL & TICK LOOPS
  // ==========================================================================
  const stories = [heroStory, chipStory, stylusStory, canStory];
  const navbar = document.getElementById('navbar');

  function handleScroll() {
    if (navbar) {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
    }
    stories.forEach((s) => s.updateScroll());
  }

  function handleResize() {
    stories.forEach((s) => s.resize());
  }

  function globalTick() {
    stories.forEach((s) => s.tick());
    requestAnimationFrame(globalTick);
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Init
  handleScroll();
  renderStudio();
  globalTick();

})();

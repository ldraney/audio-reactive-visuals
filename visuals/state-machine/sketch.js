/**
 * State Machine Visualization
 *
 * Discrete visual modes with transitions based on audio energy and structure.
 * Each state has distinct visual characteristics that blend during transitions.
 *
 * STATES:
 * - AMBIENT:   Minimal, slow, sparse, monochrome blues
 * - BUILDING:  Rising density, warming colors, increasing speed
 * - INTENSE:   Maximum everything, bright, fast, chaotic
 * - BREAKDOWN: Sudden drop, single focused element, breathing
 *
 * TRANSITIONS:
 * - Energy accumulator tracks rising/falling trends
 * - Onset density influences state changes
 * - Sudden energy drops trigger BREAKDOWN
 * - Gradual builds move AMBIENT -> BUILDING -> INTENSE
 */

import {
  lerp,
  map,
  clamp,
  power,
  getFrameAtTime,
  getDominantPitch,
  hslToRgb,
  createSmoother,
} from "../../mappings/utils.js";

// Canvas setup
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const audio = document.getElementById("audio");
const playPauseBtn = document.getElementById("playPause");
const timeDisplay = document.getElementById("time");
const loadingEl = document.getElementById("loading");
const stateIndicator = document.getElementById("stateIndicator");

// State
let analysisData = null;
let isPlaying = false;

// === STATE MACHINE ===
const STATES = {
  AMBIENT: 0,
  BUILDING: 1,
  INTENSE: 2,
  BREAKDOWN: 3,
};

const STATE_NAMES = ["AMBIENT", "BUILDING", "INTENSE", "BREAKDOWN"];

const STATE_COLORS = {
  [STATES.AMBIENT]: { bg: "#0a0a12", indicator: "rgba(100, 120, 180, 0.6)" },
  [STATES.BUILDING]: { bg: "#0c0a10", indicator: "rgba(180, 140, 100, 0.7)" },
  [STATES.INTENSE]: { bg: "#100808", indicator: "rgba(255, 100, 80, 0.9)" },
  [STATES.BREAKDOWN]: { bg: "#080a0c", indicator: "rgba(80, 200, 180, 0.7)" },
};

let currentState = STATES.AMBIENT;
let stateBlend = 0; // 0-1 blend to next state
let targetState = STATES.AMBIENT;

// Energy tracking for state transitions
let energyAccumulator = 0;
let energyHistory = [];
const ENERGY_HISTORY_SIZE = 60; // ~1 second of history
let onsetHistory = [];
const ONSET_HISTORY_SIZE = 30;
let lastEnergy = 0;

// Smoothers
const smoothers = {
  rms: createSmoother(0.15),
  bass: createSmoother(0.2),
  mids: createSmoother(0.15),
  highs: createSmoother(0.25),
  onset: createSmoother(0.4),
  centroid: createSmoother(0.1),
};

// === PARTICLES ===
const particles = [];
const MAX_PARTICLES = 300;

class Particle {
  constructor(width, height, state) {
    this.reset(width, height, state);
  }

  reset(width, height, state) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.size = this.getSizeForState(state);
    this.speed = this.getSpeedForState(state);
    this.angle = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.02;
    this.alpha = 0.3 + Math.random() * 0.5;
    this.hue = 0;
    this.life = 1;
    this.maxLife = 3 + Math.random() * 5;
  }

  getSizeForState(state) {
    switch (state) {
      case STATES.AMBIENT: return 1 + Math.random() * 2;
      case STATES.BUILDING: return 2 + Math.random() * 4;
      case STATES.INTENSE: return 3 + Math.random() * 6;
      case STATES.BREAKDOWN: return 4 + Math.random() * 8;
      default: return 2;
    }
  }

  getSpeedForState(state) {
    switch (state) {
      case STATES.AMBIENT: return 0.2 + Math.random() * 0.3;
      case STATES.BUILDING: return 0.5 + Math.random() * 1;
      case STATES.INTENSE: return 1.5 + Math.random() * 2.5;
      case STATES.BREAKDOWN: return 0.1 + Math.random() * 0.2;
      default: return 0.5;
    }
  }

  update(width, height, state, energy) {
    const speedMult = state === STATES.INTENSE ? (1 + energy * 2) : 1;

    this.angle += this.rotSpeed;
    this.x += Math.cos(this.angle) * this.speed * speedMult;
    this.y += Math.sin(this.angle) * this.speed * speedMult;

    // Wrap
    if (this.x < -50) this.x = width + 50;
    if (this.x > width + 50) this.x = -50;
    if (this.y < -50) this.y = height + 50;
    if (this.y > height + 50) this.y = -50;

    this.life -= 1 / 60 / this.maxLife;
  }

  draw(ctx, hue, stateBlendValue) {
    const alpha = this.alpha * Math.min(this.life * 2, 1);
    const { r, g, b } = hslToRgb(hue, 50, 50);

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fill();
  }

  isAlive() {
    return this.life > 0;
  }
}

// === CENTRAL ELEMENT (for BREAKDOWN state) ===
let centralPulse = 0;
let centralSize = 100;

// Initialize particles
function initParticles(count, state) {
  particles.length = 0;
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(canvas.width, canvas.height, state));
  }
}

// Get target particle count for state
function getParticleCountForState(state) {
  switch (state) {
    case STATES.AMBIENT: return 30;
    case STATES.BUILDING: return 80;
    case STATES.INTENSE: return 200;
    case STATES.BREAKDOWN: return 10;
    default: return 50;
  }
}

// Get hue range for state
function getHueForState(state, centroid) {
  switch (state) {
    case STATES.AMBIENT: return 220 + centroid * 20; // Blues
    case STATES.BUILDING: return 180 + centroid * 60; // Cyan to yellow
    case STATES.INTENSE: return 0 + centroid * 40; // Reds/oranges
    case STATES.BREAKDOWN: return 160 + centroid * 40; // Teals
    default: return 200;
  }
}

// Resize handler
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// Initialize
initParticles(getParticleCountForState(STATES.AMBIENT), STATES.AMBIENT);

// Load analysis data
async function loadAnalysis() {
  try {
    const response = await fetch("../../data/neon-noir.json");
    analysisData = await response.json();
    loadingEl.style.display = "none";
    console.log(
      `Loaded ${analysisData.frames.length} frames, ${analysisData.duration}s duration`
    );
  } catch (err) {
    loadingEl.textContent = "Error loading analysis data";
    console.error(err);
  }
}

// Format time as M:SS
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// Update time display
function updateTimeDisplay() {
  const current = audio.currentTime;
  const duration = audio.duration || 0;
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

// Play/pause controls
playPauseBtn.addEventListener("click", () => {
  if (isPlaying) {
    audio.pause();
    playPauseBtn.textContent = "Play";
  } else {
    audio.play();
    playPauseBtn.textContent = "Pause";
  }
  isPlaying = !isPlaying;
});

audio.addEventListener("ended", () => {
  isPlaying = false;
  playPauseBtn.textContent = "Play";
});

// Update state indicator UI
function updateStateIndicator(state) {
  stateIndicator.textContent = STATE_NAMES[state];
  stateIndicator.style.background = STATE_COLORS[state].indicator;
  stateIndicator.style.color = state === STATES.INTENSE ? "#fff" : "#ddd";
}

// Analyze energy trends and determine state transitions
function analyzeAndTransition(rms, onset, bass) {
  // Track energy history
  energyHistory.push(rms);
  if (energyHistory.length > ENERGY_HISTORY_SIZE) {
    energyHistory.shift();
  }

  // Track onset history
  onsetHistory.push(onset > 0.5 ? 1 : 0);
  if (onsetHistory.length > ONSET_HISTORY_SIZE) {
    onsetHistory.shift();
  }

  // Calculate metrics
  const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
  const recentEnergy = energyHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const energyTrend = recentEnergy - avgEnergy;
  const onsetDensity = onsetHistory.reduce((a, b) => a + b, 0) / onsetHistory.length;

  // Sudden drop detection
  const suddenDrop = lastEnergy > 0.5 && rms < 0.15;
  lastEnergy = rms;

  // Energy accumulator (momentum)
  energyAccumulator = lerp(energyAccumulator, rms + onsetDensity * 0.5, 0.05);

  // State transition logic
  let newState = currentState;

  if (suddenDrop && currentState === STATES.INTENSE) {
    // Sudden energy drop after intense = breakdown
    newState = STATES.BREAKDOWN;
  } else if (currentState === STATES.BREAKDOWN && energyAccumulator > 0.4) {
    // Coming out of breakdown
    newState = STATES.BUILDING;
  } else if (energyAccumulator < 0.2 && onsetDensity < 0.2) {
    // Low energy, few onsets = ambient
    newState = STATES.AMBIENT;
  } else if (energyAccumulator > 0.6 && onsetDensity > 0.4) {
    // High energy, lots of onsets = intense
    newState = STATES.INTENSE;
  } else if (energyAccumulator > 0.3 || energyTrend > 0.05) {
    // Rising energy = building
    if (currentState === STATES.AMBIENT) {
      newState = STATES.BUILDING;
    } else if (currentState === STATES.BUILDING && energyAccumulator > 0.5) {
      newState = STATES.INTENSE;
    }
  } else if (energyTrend < -0.05 && currentState === STATES.INTENSE) {
    // Falling from intense
    newState = STATES.BUILDING;
  }

  // Apply state change
  if (newState !== currentState) {
    targetState = newState;
    currentState = newState;
    updateStateIndicator(newState);

    // Adjust particle count
    const targetCount = getParticleCountForState(newState);
    while (particles.length < targetCount) {
      particles.push(new Particle(canvas.width, canvas.height, newState));
    }
  }
}

// Draw background for current state
function drawBackground(state, blend, rms) {
  const color = STATE_COLORS[state].bg;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add subtle gradient based on state
  if (state === STATES.INTENSE) {
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.height
    );
    gradient.addColorStop(0, `rgba(60, 20, 20, ${rms * 0.3})`);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state === STATES.BREAKDOWN) {
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.5
    );
    gradient.addColorStop(0, `rgba(20, 60, 60, ${0.2 + rms * 0.2})`);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// Draw central element for BREAKDOWN state
function drawCentralElement(rms, bass, hue) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Pulse with bass
  centralPulse = lerp(centralPulse, bass, 0.1);
  centralSize = lerp(centralSize, 80 + rms * 120, 0.05);

  const size = centralSize * (1 + centralPulse * 0.3);
  const { r, g, b } = hslToRgb(hue, 60, 50);

  // Outer glow
  const glowGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 3);
  glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
  glowGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.1)`);
  glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.beginPath();
  ctx.arc(cx, cy, size * 3, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.fill();

  // Core
  const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
  coreGradient.addColorStop(0, `rgba(${r + 50}, ${g + 50}, ${b + 50}, 0.9)`);
  coreGradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.7)`);
  coreGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.3)`);

  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.fillStyle = coreGradient;
  ctx.fill();

  // Ring
  ctx.beginPath();
  ctx.arc(cx, cy, size * 1.2, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + rms * 0.4})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Draw connecting lines for INTENSE state
function drawIntenseLines(particles, hue, rms) {
  const { r, g, b } = hslToRgb(hue, 70, 60);
  const maxDist = 100 + rms * 50;

  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.1)`;
  ctx.lineWidth = 1;

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < Math.min(i + 10, particles.length); j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < maxDist) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }
}

// Main render loop
function render() {
  const { width, height } = canvas;

  // Get current frame data
  if (!analysisData) {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    requestAnimationFrame(render);
    return;
  }

  const currentTime = audio.currentTime;
  const frame = getFrameAtTime(analysisData.frames, currentTime);

  if (!frame) {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    requestAnimationFrame(render);
    return;
  }

  // Extract and smooth features
  const rms = smoothers.rms(frame.rms);
  const bass = smoothers.bass(frame.bands[1]);
  const mids = smoothers.mids(frame.bands[3]);
  const highs = smoothers.highs(frame.bands[5]);
  const onset = smoothers.onset(frame.onset);
  const centroid = smoothers.centroid(frame.centroid);

  // Analyze and potentially transition states
  analyzeAndTransition(rms, onset, bass);

  // Get visuals for current state
  const hue = getHueForState(currentState, centroid);
  const targetParticleCount = getParticleCountForState(currentState);

  // === DRAW ===

  // Background
  drawBackground(currentState, stateBlend, rms);

  // Update and draw particles
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update(width, height, currentState, rms);
    particles[i].draw(ctx, hue, stateBlend);

    if (!particles[i].isAlive()) {
      if (particles.length > targetParticleCount) {
        particles.splice(i, 1);
      } else {
        particles[i].reset(width, height, currentState);
      }
    }
  }

  // State-specific effects
  if (currentState === STATES.INTENSE) {
    drawIntenseLines(particles, hue, rms);
  }

  if (currentState === STATES.BREAKDOWN) {
    drawCentralElement(rms, bass, hue);
  }

  // Energy meter (subtle)
  const meterWidth = 100;
  const meterHeight = 4;
  const meterX = 20;
  const meterY = height - 60;

  ctx.fillStyle = "rgba(50, 50, 60, 0.5)";
  ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

  ctx.fillStyle = `rgba(${currentState === STATES.INTENSE ? 255 : 150}, ${currentState === STATES.BUILDING ? 200 : 150}, ${currentState === STATES.AMBIENT ? 200 : 150}, 0.7)`;
  ctx.fillRect(meterX, meterY, meterWidth * energyAccumulator, meterHeight);

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
updateStateIndicator(STATES.AMBIENT);
render();

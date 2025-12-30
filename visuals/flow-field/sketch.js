/**
 * Flow Field Visualization
 *
 * Perlin noise flow field with audio-driven parameters.
 * Particles follow vector fields shaped by noise; audio modulates the field.
 *
 * Mappings:
 * - Bass         -> noise scale (larger = slower, smoother curves)
 * - Mids         -> particle speed multiplier
 * - Highs        -> z-offset animation speed (turbulence/evolution)
 * - RMS          -> particle spawn density & opacity
 * - Centroid     -> color temperature (cool blue to warm orange)
 * - Onset        -> field rotation pulse (twist the field)
 * - Harmonic     -> trail length (longer on sustained tones)
 * - Percussive   -> particle jitter/scatter
 * - Contrast     -> color saturation
 */

import {
  lerp,
  map,
  clamp,
  power,
  getFrameAtTime,
  hslToRgb,
  createSmoother,
} from "../../mappings/utils.js";

// ============================================================================
// PERLIN NOISE IMPLEMENTATION
// Classic Perlin noise for smooth, natural flow fields
// ============================================================================

const permutation = [];
const p = new Array(512);

function initNoise() {
  // Initialize permutation array
  for (let i = 0; i < 256; i++) {
    permutation[i] = i;
  }
  // Shuffle
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  // Duplicate for overflow
  for (let i = 0; i < 512; i++) {
    p[i] = permutation[i % 256];
  }
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise3D(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);

  const u = fade(x);
  const v = fade(y);
  const w = fade(z);

  const A = p[X] + Y;
  const AA = p[A] + Z;
  const AB = p[A + 1] + Z;
  const B = p[X + 1] + Y;
  const BA = p[B] + Z;
  const BB = p[B + 1] + Z;

  return lerp(
    lerp(
      lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
      lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u),
      v
    ),
    lerp(
      lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u),
      v
    ),
    w
  );
}

// Octave noise for more detail
function octaveNoise(x, y, z, octaves, persistence) {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

// Initialize noise
initNoise();

// ============================================================================
// CANVAS & AUDIO SETUP
// ============================================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const audio = document.getElementById("audio");
const playPauseBtn = document.getElementById("playPause");
const timeDisplay = document.getElementById("time");
const loadingEl = document.getElementById("loading");

// State
let analysisData = null;
let isPlaying = false;

// ============================================================================
// CONFIGURATION
// ============================================================================

const PARTICLE_COUNT = 2000;
const FLOW_SCALE_BASE = 0.003; // Base noise scale
const FLOW_SPEED_BASE = 2; // Base particle speed

// ============================================================================
// SMOOTHERS
// ============================================================================

const smoothers = {
  bass: createSmoother(0.15),
  mids: createSmoother(0.2),
  highs: createSmoother(0.2),
  onset: createSmoother(0.5),
  rms: createSmoother(0.15),
  centroid: createSmoother(0.08),
  harmonic: createSmoother(0.1),
  percussive: createSmoother(0.35),
  contrast: createSmoother(0.1),
};

// Audio-driven parameters (smoothed further)
let noiseScale = FLOW_SCALE_BASE;
let flowSpeed = FLOW_SPEED_BASE;
let zOffset = 0;
let zSpeed = 0.001;
let fieldRotation = 0;
let trailAlpha = 0.03;
let hue = 200;
let saturation = 60;
let octaves = 2;

// ============================================================================
// PARTICLE CLASS
// ============================================================================

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.prevX = this.x;
    this.prevY = this.y;
    this.speed = 0.5 + Math.random() * 0.5;
    this.life = Math.random();
  }

  update(flowAngle, speedMult, jitter) {
    this.prevX = this.x;
    this.prevY = this.y;

    // Follow flow field
    const vx = Math.cos(flowAngle) * this.speed * speedMult;
    const vy = Math.sin(flowAngle) * this.speed * speedMult;

    // Add jitter on percussive hits
    const jitterX = (Math.random() - 0.5) * jitter;
    const jitterY = (Math.random() - 0.5) * jitter;

    this.x += vx + jitterX;
    this.y += vy + jitterY;

    // Wrap around edges
    if (this.x < 0) {
      this.x = canvas.width;
      this.prevX = this.x;
    }
    if (this.x > canvas.width) {
      this.x = 0;
      this.prevX = this.x;
    }
    if (this.y < 0) {
      this.y = canvas.height;
      this.prevY = this.y;
    }
    if (this.y > canvas.height) {
      this.y = 0;
      this.prevY = this.y;
    }

    // Age and potentially reset
    this.life -= 0.003;
    if (this.life <= 0) {
      this.reset();
    }
  }

  draw(ctx, r, g, b, alpha) {
    // Draw line from previous to current position
    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * this.life})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ============================================================================
// PARTICLE POOL
// ============================================================================

let particles = [];

function initParticles() {
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }
}

// ============================================================================
// FLOW FIELD
// ============================================================================

function getFlowAngle(x, y, z, scale, rotation, octaveCount) {
  // Sample noise at this position
  const noiseVal = octaveNoise(x * scale, y * scale, z, octaveCount, 0.5);

  // Convert noise (-1 to 1) to angle (0 to 2*PI)
  let angle = noiseVal * Math.PI * 2;

  // Apply field rotation (from onset pulses)
  angle += rotation;

  return angle;
}

// ============================================================================
// CANVAS RESIZE
// ============================================================================

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Reinitialize particles on resize
  initParticles();
}

window.addEventListener("resize", resize);
resize();

// ============================================================================
// LOAD ANALYSIS DATA
// ============================================================================

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

// ============================================================================
// TIME DISPLAY
// ============================================================================

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function updateTimeDisplay() {
  const current = audio.currentTime;
  const duration = audio.duration || 0;
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

// ============================================================================
// CONTROLS
// ============================================================================

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

// ============================================================================
// RENDER LOOP
// ============================================================================

let lastTime = performance.now();
let lastOnset = 0;

function render() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const { width, height } = canvas;

  // Trail effect: semi-transparent overlay
  ctx.fillStyle = `rgba(10, 10, 15, ${trailAlpha})`;
  ctx.fillRect(0, 0, width, height);

  // Get current frame data
  if (!analysisData) {
    requestAnimationFrame(render);
    return;
  }

  const currentTime = audio.currentTime;
  const frame = getFrameAtTime(analysisData.frames, currentTime);

  if (!frame) {
    // Still animate even without audio data
    zOffset += zSpeed;
    for (const particle of particles) {
      const angle = getFlowAngle(particle.x, particle.y, zOffset, noiseScale, fieldRotation, octaves);
      particle.update(angle, flowSpeed, 0);
      const { r, g, b } = hslToRgb(hue, saturation, 55);
      particle.draw(ctx, r, g, b, 0.5);
    }
    requestAnimationFrame(render);
    return;
  }

  // Extract and smooth features
  const bass = smoothers.bass(frame.bands[1]);
  const mids = smoothers.mids(frame.bands[3]);
  const highs = smoothers.highs(frame.bands[5]);
  const onset = smoothers.onset(frame.onset);
  const rms = smoothers.rms(frame.rms);
  const centroid = smoothers.centroid(frame.centroid);
  const harmonic = smoothers.harmonic(frame.harmonic);
  const percussive = smoothers.percussive(frame.percussive);
  const contrast = smoothers.contrast(frame.contrast);

  // ========================================================================
  // AUDIO MAPPINGS
  // ========================================================================

  // Bass -> noise scale (higher bass = larger scale = smoother, flowing curves)
  const targetScale = FLOW_SCALE_BASE * (0.5 + bass * 2.0);
  noiseScale = lerp(noiseScale, targetScale, 0.05);

  // Mids -> flow speed (higher mids = faster particles)
  const targetSpeed = FLOW_SPEED_BASE * (0.5 + mids * 3.0);
  flowSpeed = lerp(flowSpeed, targetSpeed, 0.1);

  // Highs -> z-offset speed (turbulence/evolution rate)
  zSpeed = 0.0005 + highs * 0.003;
  zOffset += zSpeed;

  // Highs -> octave count (more complexity on bright)
  const targetOctaves = 1 + Math.floor(highs * 3);
  octaves = Math.round(lerp(octaves, targetOctaves, 0.1));
  octaves = clamp(octaves, 1, 4);

  // Onset -> field rotation pulse
  if (onset > 0.5 && onset > lastOnset + 0.1) {
    fieldRotation += (Math.random() - 0.5) * onset * 0.5;
  }
  // Decay rotation back to 0
  fieldRotation = lerp(fieldRotation, 0, 0.02);
  lastOnset = onset;

  // Harmonic -> trail length (longer trails on sustained tones)
  const targetTrailAlpha = map(harmonic, 0, 1, 0.08, 0.02);
  trailAlpha = lerp(trailAlpha, targetTrailAlpha, 0.05);

  // Centroid -> hue (cool blue 220 to warm orange 30)
  const targetHue = map(centroid, 0, 1, 220, 30);
  hue = lerp(hue, targetHue, 0.03);

  // Contrast -> saturation
  const targetSat = map(contrast, 0, 1, 40, 85);
  saturation = lerp(saturation, targetSat, 0.1);

  // RMS -> particle opacity
  const particleAlpha = map(rms, 0, 1, 0.3, 0.9);

  // Lightness based on energy
  const lightness = map(rms, 0, 1, 45, 65);

  // Percussive -> jitter
  const jitter = percussive * 8;

  // ========================================================================
  // UPDATE & DRAW PARTICLES
  // ========================================================================

  const { r, g, b } = hslToRgb(hue, saturation, lightness);

  for (const particle of particles) {
    const angle = getFlowAngle(
      particle.x,
      particle.y,
      zOffset,
      noiseScale,
      fieldRotation,
      octaves
    );
    particle.update(angle, flowSpeed, jitter);
    particle.draw(ctx, r, g, b, particleAlpha);
  }

  // ========================================================================
  // SUBTLE FIELD VISUALIZATION (optional debug/aesthetic)
  // ========================================================================

  // Draw flow vectors at low opacity when onset is high
  if (onset > 0.4) {
    const gridSize = 60;
    const vectorLen = 15;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${onset * 0.15})`;
    ctx.lineWidth = 1;

    for (let x = gridSize / 2; x < width; x += gridSize) {
      for (let y = gridSize / 2; y < height; y += gridSize) {
        const angle = getFlowAngle(x, y, zOffset, noiseScale, fieldRotation, octaves);
        const endX = x + Math.cos(angle) * vectorLen;
        const endY = y + Math.sin(angle) * vectorLen;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    }
  }

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// ============================================================================
// START
// ============================================================================

loadAnalysis();
render();

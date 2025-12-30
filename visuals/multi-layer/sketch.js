/**
 * Multi-Layer Composition
 *
 * Three distinct visual layers creating depth and complexity.
 * Each layer responds to different audio features at different speeds.
 *
 * BACKGROUND (slow, atmospheric):
 * - Chromagram -> gradient color palette
 * - Harmonic   -> blur/softness
 * - Centroid   -> color temperature
 *
 * MIDGROUND (medium, floating):
 * - Bass       -> orb size
 * - Mids       -> movement speed
 * - RMS        -> orb count/opacity
 *
 * FOREGROUND (fast, reactive):
 * - Onset      -> spark spawns
 * - Highs      -> line intensity
 * - Percussive -> jitter/chaos
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

// State
let analysisData = null;
let isPlaying = false;

// Smoothers - different speeds for different layers
const smoothers = {
  // Background (very slow)
  chromaHue: createSmoother(0.02),
  harmonic: createSmoother(0.05),
  centroid: createSmoother(0.03),

  // Midground (medium)
  bass: createSmoother(0.12),
  mids: createSmoother(0.1),
  rms: createSmoother(0.1),

  // Foreground (fast)
  onset: createSmoother(0.5),
  highs: createSmoother(0.25),
  percussive: createSmoother(0.35),
};

// === BACKGROUND STATE ===
const nebulae = [];
const NUM_NEBULAE = 5;

class Nebula {
  constructor(width, height) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.baseRadius = 150 + Math.random() * 200;
    this.radius = this.baseRadius;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.hue = Math.random() * 360;
    this.phase = Math.random() * Math.PI * 2;
  }

  update(width, height, harmonic) {
    this.phase += 0.005;
    this.x += this.vx + Math.sin(this.phase) * 0.2;
    this.y += this.vy + Math.cos(this.phase * 0.7) * 0.2;

    // Wrap around edges
    if (this.x < -this.radius) this.x = width + this.radius;
    if (this.x > width + this.radius) this.x = -this.radius;
    if (this.y < -this.radius) this.y = height + this.radius;
    if (this.y > height + this.radius) this.y = -this.radius;

    // Radius breathes with harmonic content
    this.radius = this.baseRadius * (0.8 + harmonic * 0.5);
  }

  draw(ctx, baseHue, alpha) {
    const hue = (baseHue + this.hue * 0.3) % 360;
    const { r, g, b } = hslToRgb(hue, 40, 30);

    const gradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, this.radius
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.15})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}

// === MIDGROUND STATE ===
const orbs = [];
const MAX_ORBS = 30;

class Orb {
  constructor(width, height) {
    this.reset(width, height);
  }

  reset(width, height) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.baseSize = 8 + Math.random() * 25;
    this.size = this.baseSize;
    this.speed = 0.3 + Math.random() * 0.5;
    this.angle = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.02;
    this.hueOffset = Math.random() * 60 - 30;
    this.alpha = 0.3 + Math.random() * 0.4;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(width, height, bass, mids) {
    this.pulsePhase += 0.03;

    // Size pulses with bass
    this.size = this.baseSize * (0.7 + bass * 0.8 + Math.sin(this.pulsePhase) * 0.1);

    // Movement speed from mids
    const moveSpeed = this.speed * (0.5 + mids * 2);
    this.angle += this.rotSpeed;

    this.x += Math.cos(this.angle) * moveSpeed;
    this.y += Math.sin(this.angle) * moveSpeed;

    // Bounce off edges softly
    if (this.x < this.size || this.x > width - this.size) {
      this.angle = Math.PI - this.angle;
      this.x = clamp(this.x, this.size, width - this.size);
    }
    if (this.y < this.size || this.y > height - this.size) {
      this.angle = -this.angle;
      this.y = clamp(this.y, this.size, height - this.size);
    }
  }

  draw(ctx, baseHue, rms) {
    const hue = (baseHue + this.hueOffset + 180) % 360; // Complementary-ish
    const { r, g, b } = hslToRgb(hue, 60, 50);

    const alpha = this.alpha * (0.5 + rms * 0.5);

    // Outer glow
    const glowGradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, this.size * 2
    );
    glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`);
    glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Core
    const coreGradient = ctx.createRadialGradient(
      this.x - this.size * 0.2, this.y - this.size * 0.2, 0,
      this.x, this.y, this.size
    );
    coreGradient.addColorStop(0, `rgba(${Math.min(r + 60, 255)}, ${Math.min(g + 60, 255)}, ${Math.min(b + 60, 255)}, ${alpha})`);
    coreGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha * 0.7})`);

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = coreGradient;
    ctx.fill();
  }
}

// === FOREGROUND STATE ===
const sparks = [];
const MAX_SPARKS = 100;

class Spark {
  constructor(x, y, angle, speed, hue) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1;
    this.decay = 0.02 + Math.random() * 0.03;
    this.size = 2 + Math.random() * 3;
    this.hue = hue;
    this.trail = [];
    this.maxTrail = 8;
  }

  update(percussive) {
    // Store trail
    if (this.trail.length >= this.maxTrail) this.trail.shift();
    this.trail.push({ x: this.x, y: this.y });

    // Add jitter from percussive
    const jitter = percussive * 3;
    this.x += this.vx + (Math.random() - 0.5) * jitter;
    this.y += this.vy + (Math.random() - 0.5) * jitter;

    // Gravity
    this.vy += 0.15;

    // Friction
    this.vx *= 0.98;
    this.vy *= 0.98;

    this.life -= this.decay;
  }

  draw(ctx) {
    if (this.life <= 0) return;

    const alpha = this.life;
    const { r, g, b } = hslToRgb(this.hue, 80, 60);

    // Trail
    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.lineTo(this.x, this.y);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`;
      ctx.lineWidth = this.size * 0.5;
      ctx.stroke();
    }

    // Core
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fill();
  }

  isAlive() {
    return this.life > 0;
  }
}

// Lines for foreground
const lines = [];
const MAX_LINES = 20;

class Line {
  constructor(width, height, hue) {
    this.reset(width, height, hue);
  }

  reset(width, height, hue) {
    // Random position on edge
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: this.x = Math.random() * width; this.y = 0; break;
      case 1: this.x = width; this.y = Math.random() * height; break;
      case 2: this.x = Math.random() * width; this.y = height; break;
      case 3: this.x = 0; this.y = Math.random() * height; break;
    }
    this.targetX = width / 2 + (Math.random() - 0.5) * width * 0.5;
    this.targetY = height / 2 + (Math.random() - 0.5) * height * 0.5;
    this.progress = 0;
    this.speed = 0.02 + Math.random() * 0.03;
    this.hue = hue + (Math.random() - 0.5) * 40;
    this.alpha = 0.3 + Math.random() * 0.4;
    this.width = 1 + Math.random() * 2;
  }

  update() {
    this.progress += this.speed;
  }

  draw(ctx, intensity) {
    if (this.progress >= 1) return;

    const currentX = lerp(this.x, this.targetX, this.progress);
    const currentY = lerp(this.y, this.targetY, this.progress);

    const { r, g, b } = hslToRgb(this.hue, 70, 55);
    const alpha = this.alpha * (1 - this.progress) * intensity;

    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(currentX, currentY);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = this.width;
    ctx.stroke();

    // Bright tip
    ctx.beginPath();
    ctx.arc(currentX, currentY, this.width * 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.fill();
  }

  isDone() {
    return this.progress >= 1;
  }
}

// Initialize
function init() {
  nebulae.length = 0;
  for (let i = 0; i < NUM_NEBULAE; i++) {
    nebulae.push(new Nebula(canvas.width, canvas.height));
  }

  orbs.length = 0;
  for (let i = 0; i < MAX_ORBS; i++) {
    orbs.push(new Orb(canvas.width, canvas.height));
  }
}

// Resize handler
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  init();
}
window.addEventListener("resize", resize);
resize();

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

// Track onset for spawning
let lastOnset = 0;

// Main render loop
function render() {
  const { width, height } = canvas;

  // Clear completely (layers will build up)
  ctx.fillStyle = "#08080c";
  ctx.fillRect(0, 0, width, height);

  // Get current frame data
  if (!analysisData) {
    requestAnimationFrame(render);
    return;
  }

  const currentTime = audio.currentTime;
  const frame = getFrameAtTime(analysisData.frames, currentTime);

  if (!frame) {
    requestAnimationFrame(render);
    return;
  }

  // Extract features with layer-appropriate smoothing
  const dominantPitch = getDominantPitch(frame.chroma);
  const chromaHue = smoothers.chromaHue(dominantPitch * 30);
  const harmonic = smoothers.harmonic(frame.harmonic);
  const centroid = smoothers.centroid(frame.centroid);

  const bass = smoothers.bass(frame.bands[1]);
  const mids = smoothers.mids(frame.bands[3]);
  const rms = smoothers.rms(frame.rms);

  const onset = smoothers.onset(frame.onset);
  const highs = smoothers.highs(frame.bands[5]);
  const percussive = smoothers.percussive(frame.percussive);

  // Base hue from centroid (temperature)
  const baseHue = map(centroid, 0, 1, 240, 40);

  // === BACKGROUND LAYER ===
  ctx.globalAlpha = 0.6 + harmonic * 0.4;
  for (const nebula of nebulae) {
    nebula.update(width, height, harmonic);
    nebula.draw(ctx, baseHue, 0.5 + harmonic * 0.5);
  }
  ctx.globalAlpha = 1;

  // === MIDGROUND LAYER ===
  for (const orb of orbs) {
    orb.update(width, height, bass, mids);
    orb.draw(ctx, baseHue, rms);
  }

  // === FOREGROUND LAYER ===

  // Spawn sparks on onset
  if (onset > 0.5 && onset > lastOnset + 0.1) {
    const numSparks = Math.floor(5 + onset * 15);
    const spawnX = width / 2 + (Math.random() - 0.5) * width * 0.6;
    const spawnY = height / 2 + (Math.random() - 0.5) * height * 0.4;

    for (let i = 0; i < numSparks; i++) {
      if (sparks.length < MAX_SPARKS) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 8 * onset;
        const hue = (baseHue + 60 + Math.random() * 60) % 360; // Warmer sparks
        sparks.push(new Spark(spawnX, spawnY, angle, speed, hue));
      }
    }
  }
  lastOnset = onset;

  // Spawn lines based on highs
  if (highs > 0.3 && Math.random() < highs * 0.3) {
    if (lines.length < MAX_LINES) {
      lines.push(new Line(width, height, baseHue));
    }
  }

  // Update and draw sparks
  for (let i = sparks.length - 1; i >= 0; i--) {
    sparks[i].update(percussive);
    sparks[i].draw(ctx);
    if (!sparks[i].isAlive()) {
      sparks.splice(i, 1);
    }
  }

  // Update and draw lines
  for (let i = lines.length - 1; i >= 0; i--) {
    lines[i].update();
    lines[i].draw(ctx, highs);
    if (lines[i].isDone()) {
      lines.splice(i, 1);
    }
  }

  // === VIGNETTE ===
  const vignetteGradient = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.3,
    width / 2, height / 2, height * 0.8
  );
  vignetteGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignetteGradient.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignetteGradient;
  ctx.fillRect(0, 0, width, height);

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

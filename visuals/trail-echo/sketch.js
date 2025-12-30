/**
 * Trail Echo Visualization
 *
 * Visuals with temporal memory - responding to history, not just current frame.
 * Creates visual "phrasing" that matches musical phrasing.
 *
 * TEMPORAL FEATURES:
 * - Long trails that persist and fade
 * - Echo/ghosts spawned at onset moments
 * - Phrase-level intensity building (4/8 bar accumulation)
 * - Beat anticipation (glow before beats)
 * - Decay curves with different rates
 *
 * MAPPINGS:
 * - RMS history      -> trail length/opacity
 * - Onset            -> spawn echo ghosts
 * - Beat proximity   -> anticipation glow
 * - Phrase energy    -> overall intensity
 * - Centroid         -> color
 * - Harmonic         -> trail smoothness
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

// Smoothers
const smoothers = {
  rms: createSmoother(0.15),
  onset: createSmoother(0.5),
  centroid: createSmoother(0.08),
  harmonic: createSmoother(0.05),
  bass: createSmoother(0.15),
};

// === TEMPORAL MEMORY ===
const HISTORY_SIZE = 120; // ~2 seconds at 60fps
const energyHistory = [];
const onsetHistory = [];

// Phrase-level accumulator (builds over multiple bars)
let phraseIntensity = 0;
const PHRASE_DECAY = 0.995; // Slow decay
const PHRASE_BUILD = 0.02;  // How fast it builds

// === ORBITERS (main visual elements) ===
const orbiters = [];
const NUM_ORBITERS = 5;

class Orbiter {
  constructor(index, total) {
    this.index = index;
    this.angle = (index / total) * Math.PI * 2;
    this.baseRadius = 0.25 + (index / total) * 0.15;
    this.radius = this.baseRadius;
    this.speed = 0.3 + index * 0.15;
    this.size = 8 + index * 4;
    this.trail = [];
    this.maxTrail = 80 + index * 20;
    this.hueOffset = index * 30;
  }

  update(width, height, rms, bass, phraseInt) {
    const cx = width / 2;
    const cy = height / 2;

    // Radius pulses with bass and phrase intensity
    this.radius = this.baseRadius * (1 + bass * 0.2 + phraseInt * 0.1);

    // Speed increases with energy
    const speedMult = 1 + rms * 0.5 + phraseInt * 0.3;
    this.angle += this.speed * 0.02 * speedMult;

    // Calculate position
    const orbitRadius = Math.min(width, height) * this.radius;
    this.x = cx + Math.cos(this.angle) * orbitRadius;
    this.y = cy + Math.sin(this.angle) * orbitRadius;

    // Store in trail
    this.trail.push({
      x: this.x,
      y: this.y,
      size: this.size * (1 + rms * 0.5),
      time: Date.now(),
    });

    // Limit trail length (dynamic based on phrase intensity)
    const maxLen = Math.floor(this.maxTrail * (0.5 + phraseInt * 0.5 + rms * 0.3));
    while (this.trail.length > maxLen) {
      this.trail.shift();
    }
  }

  draw(ctx, hue, harmonic, phraseInt) {
    if (this.trail.length < 2) return;

    const finalHue = (hue + this.hueOffset) % 360;
    const { r, g, b } = hslToRgb(finalHue, 60, 50);

    // Draw trail
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < this.trail.length; i++) {
      const t = i / this.trail.length;
      const prev = this.trail[i - 1];
      const curr = this.trail[i];

      // Trail fades and thins toward the tail
      const alpha = power(t, 0.7) * (0.4 + phraseInt * 0.4);
      const width = curr.size * t * (0.3 + harmonic * 0.4);

      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    // Draw head with glow
    const head = this.trail[this.trail.length - 1];
    const headSize = head.size * (1 + phraseInt * 0.3);

    // Glow
    const glowGradient = ctx.createRadialGradient(
      head.x, head.y, 0,
      head.x, head.y, headSize * 3
    );
    glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.6)`);
    glowGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.2)`);
    glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.beginPath();
    ctx.arc(head.x, head.y, headSize * 3, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(head.x, head.y, headSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r + 50}, ${g + 50}, ${b + 50}, 0.9)`;
    ctx.fill();
  }
}

// === ECHO GHOSTS (spawned on onsets) ===
const echoes = [];
const MAX_ECHOES = 30;

class Echo {
  constructor(x, y, size, hue) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.maxSize = size * 4;
    this.hue = hue;
    this.life = 1;
    this.decay = 0.015 + Math.random() * 0.01;
  }

  update() {
    this.life -= this.decay;
    this.size = lerp(this.size, this.maxSize, 0.05);
  }

  draw(ctx) {
    if (this.life <= 0) return;

    const alpha = this.life * 0.5;
    const { r, g, b } = hslToRgb(this.hue, 50, 55);

    // Ring that expands
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = 2 * this.life;
    ctx.stroke();

    // Inner glow
    const gradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, this.size * 0.5
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  isAlive() {
    return this.life > 0;
  }
}

// === BEAT ANTICIPATION ===
let anticipationGlow = 0;
let lastBeatIndex = -1;

function getNextBeat(currentTime, beats) {
  if (!beats || beats.length === 0) return null;

  for (let i = 0; i < beats.length; i++) {
    if (beats[i] > currentTime) {
      return { time: beats[i], index: i };
    }
  }
  return null;
}

// Initialize orbiters
function initOrbiters() {
  orbiters.length = 0;
  for (let i = 0; i < NUM_ORBITERS; i++) {
    orbiters.push(new Orbiter(i, NUM_ORBITERS));
  }
}

// Resize handler
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();
initOrbiters();

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

// Track onsets for echo spawning
let lastOnset = 0;

// Main render loop
function render() {
  const { width, height } = canvas;

  // Fade background (creates natural trail decay)
  ctx.fillStyle = "rgba(10, 10, 15, 0.08)";
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

  // Extract and smooth features
  const rms = smoothers.rms(frame.rms);
  const onset = smoothers.onset(frame.onset);
  const centroid = smoothers.centroid(frame.centroid);
  const harmonic = smoothers.harmonic(frame.harmonic);
  const bass = smoothers.bass(frame.bands[1]);

  // === TEMPORAL MEMORY ===

  // Update history
  energyHistory.push(rms);
  if (energyHistory.length > HISTORY_SIZE) energyHistory.shift();

  onsetHistory.push(onset > 0.5 ? 1 : 0);
  if (onsetHistory.length > HISTORY_SIZE) onsetHistory.shift();

  // Calculate phrase intensity (builds over time with energy)
  if (rms > 0.3) {
    phraseIntensity = Math.min(1, phraseIntensity + PHRASE_BUILD * rms);
  }
  phraseIntensity *= PHRASE_DECAY;

  // Average recent energy for trail behavior
  const recentEnergy = energyHistory.slice(-30).reduce((a, b) => a + b, 0) / 30;

  // === BEAT ANTICIPATION ===
  const nextBeat = getNextBeat(currentTime, analysisData.beats);
  if (nextBeat) {
    const timeUntilBeat = nextBeat.time - currentTime;

    // Glow builds as beat approaches (within 0.3 seconds)
    if (timeUntilBeat < 0.3 && timeUntilBeat > 0) {
      anticipationGlow = map(timeUntilBeat, 0.3, 0, 0, 1);
    } else if (timeUntilBeat <= 0 && nextBeat.index !== lastBeatIndex) {
      // Beat just hit - flash
      anticipationGlow = 1;
      lastBeatIndex = nextBeat.index;
    }
  }
  anticipationGlow *= 0.92; // Decay

  // === SPAWN ECHOES ON ONSETS ===
  if (onset > 0.6 && onset > lastOnset + 0.2) {
    // Spawn echo at random orbiter position
    const orbiter = orbiters[Math.floor(Math.random() * orbiters.length)];
    if (orbiter.trail.length > 0 && echoes.length < MAX_ECHOES) {
      const pos = orbiter.trail[orbiter.trail.length - 1];
      const hue = map(centroid, 0, 1, 200, 40);
      echoes.push(new Echo(pos.x, pos.y, orbiter.size, hue));
    }
  }
  lastOnset = onset;

  // === COLOR ===
  const baseHue = map(centroid, 0, 1, 220, 40);

  // === DRAW BEAT ANTICIPATION ===
  if (anticipationGlow > 0.1) {
    const cx = width / 2;
    const cy = height / 2;
    const glowRadius = Math.min(width, height) * 0.4;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    const { r, g, b } = hslToRgb(baseHue, 40, 50);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${anticipationGlow * 0.2})`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${anticipationGlow * 0.1})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // === UPDATE AND DRAW ECHOES ===
  for (let i = echoes.length - 1; i >= 0; i--) {
    echoes[i].update();
    echoes[i].draw(ctx);
    if (!echoes[i].isAlive()) {
      echoes.splice(i, 1);
    }
  }

  // === UPDATE AND DRAW ORBITERS ===
  for (const orbiter of orbiters) {
    orbiter.update(width, height, rms, bass, phraseIntensity);
    orbiter.draw(ctx, baseHue, harmonic, phraseIntensity);
  }

  // === CENTER ELEMENT ===
  // Pulses with phrase intensity
  const centerSize = 20 + phraseIntensity * 30 + anticipationGlow * 20;
  const { r, g, b } = hslToRgb(baseHue, 50, 50);

  const centerGradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, centerSize * 2
  );
  centerGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.4 + phraseIntensity * 0.4})`);
  centerGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.1)`);
  centerGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.beginPath();
  ctx.arc(width / 2, height / 2, centerSize * 2, 0, Math.PI * 2);
  ctx.fillStyle = centerGradient;
  ctx.fill();

  // Center ring
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, centerSize, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + phraseIntensity * 0.5})`;
  ctx.lineWidth = 1 + phraseIntensity * 2;
  ctx.stroke();

  // === INFO ===
  ctx.fillStyle = "rgba(150, 150, 170, 0.5)";
  ctx.font = "11px system-ui";
  ctx.fillText(`Phrase: ${(phraseIntensity * 100).toFixed(0)}%`, 20, 30);

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

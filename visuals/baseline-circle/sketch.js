/**
 * Baseline Circle Visualization
 *
 * A single circle with all audio features mapped to different visual properties.
 * This is the foundation for understanding how each feature "feels" visually.
 *
 * Mappings:
 * - RMS energy     -> radius (size)
 * - Centroid       -> hue (cool blue to warm orange)
 * - Bass band      -> opacity/glow
 * - Onset strength -> scale spike (quick pop)
 * - Chromagram     -> secondary hue shift
 * - Harmonic       -> smoothness (blur)
 * - Percussive     -> jitter/shake
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

// Smoothers with different response speeds
const smoothers = {
  rms: createSmoother(0.15),
  centroid: createSmoother(0.1),
  bass: createSmoother(0.2),
  onset: createSmoother(0.4), // Fast for transients
  harmonic: createSmoother(0.08),
  percussive: createSmoother(0.3),
  dominantPitch: createSmoother(0.05), // Slow for color stability
};

// Visual state
let displayRadius = 100;
let jitterX = 0;
let jitterY = 0;
let onsetSpike = 0;

// Resize canvas to fill window
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
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

// Main render loop
function render() {
  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.15;

  // Clear with slight fade for trail effect
  ctx.fillStyle = "rgba(10, 10, 15, 0.3)";
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
  const centroid = smoothers.centroid(frame.centroid);
  const bass = smoothers.bass(frame.bands[1]); // Bass band (60-250Hz)
  const onset = smoothers.onset(frame.onset);
  const harmonic = smoothers.harmonic(frame.harmonic);
  const percussive = smoothers.percussive(frame.percussive);
  const dominantPitch = smoothers.dominantPitch(getDominantPitch(frame.chroma));

  // === MAPPINGS ===

  // Radius: RMS energy -> size
  // Apply power curve to make quiet parts smaller relative to loud parts
  const radiusFactor = power(rms, 0.7);
  const targetRadius = baseRadius * (0.5 + radiusFactor * 1.5);
  displayRadius = lerp(displayRadius, targetRadius, 0.2);

  // Onset spike: quick scale pop on transients
  if (onset > 0.6) {
    onsetSpike = Math.max(onsetSpike, onset * 0.3);
  }
  onsetSpike *= 0.85; // Decay
  const spikedRadius = displayRadius * (1 + onsetSpike);

  // Jitter: percussive energy -> shake
  const jitterAmount = percussive * 8;
  jitterX = (Math.random() - 0.5) * jitterAmount;
  jitterY = (Math.random() - 0.5) * jitterAmount;

  // Color: centroid -> hue (blue 220 to orange 30)
  // Low centroid = cool/dark, high centroid = warm/bright
  const baseHue = map(centroid, 0, 1, 220, 30);

  // Chromagram influence: shift hue by dominant pitch
  const pitchHueShift = (dominantPitch / 12) * 60 - 30; // +/- 30 degrees
  const hue = (baseHue + pitchHueShift + 360) % 360;

  // Saturation: higher with energy
  const saturation = map(rms, 0, 1, 40, 85);

  // Lightness: bass adds depth
  const lightness = map(bass, 0, 1, 35, 55);

  const { r, g, b } = hslToRgb(hue, saturation, lightness);

  // Opacity: bass adds presence
  const alpha = map(bass, 0, 1, 0.7, 1.0);

  // === DRAWING ===

  const drawX = centerX + jitterX;
  const drawY = centerY + jitterY;

  // Outer glow (harmonic energy = smoother/larger glow)
  const glowSize = spikedRadius * (1 + harmonic * 0.5);
  const gradient = ctx.createRadialGradient(
    drawX,
    drawY,
    spikedRadius * 0.5,
    drawX,
    drawY,
    glowSize
  );
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`);
  gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.beginPath();
  ctx.arc(drawX, drawY, glowSize, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Main circle
  ctx.beginPath();
  ctx.arc(drawX, drawY, spikedRadius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.fill();

  // Inner highlight (brighter core based on energy)
  const highlightRadius = spikedRadius * 0.4;
  const highlightGradient = ctx.createRadialGradient(
    drawX - spikedRadius * 0.1,
    drawY - spikedRadius * 0.1,
    0,
    drawX,
    drawY,
    highlightRadius
  );
  const highlightL = Math.min(lightness + 30, 90);
  const { r: hr, g: hg, b: hb } = hslToRgb(hue, saturation * 0.5, highlightL);
  highlightGradient.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${rms * 0.6})`);
  highlightGradient.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);

  ctx.beginPath();
  ctx.arc(drawX, drawY, highlightRadius, 0, Math.PI * 2);
  ctx.fillStyle = highlightGradient;
  ctx.fill();

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

/**
 * Frequency Bars Visualization
 *
 * Classic frequency band visualization with enhanced mappings.
 * 7 bars representing the frequency spectrum from sub-bass to brilliance.
 *
 * Mappings:
 * - Band energy     -> bar height
 * - Frequency range -> bar color (warm low to cool high)
 * - Onset strength  -> brightness pulse
 * - RMS energy      -> overall glow intensity
 * - Centroid        -> highlight color temperature
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

// Band configuration
const BAND_NAMES = ["Sub", "Bass", "Low Mid", "Mid", "High Mid", "High", "Air"];
const BAND_COLORS = [
  { h: 0, s: 75, l: 50 },     // Sub-bass: Red
  { h: 25, s: 85, l: 55 },    // Bass: Orange
  { h: 45, s: 90, l: 55 },    // Low-mids: Yellow
  { h: 120, s: 70, l: 45 },   // Mids: Green
  { h: 180, s: 75, l: 50 },   // High-mids: Cyan
  { h: 220, s: 80, l: 55 },   // Highs: Blue
  { h: 280, s: 70, l: 60 },   // Brilliance: Purple
];

// Create smoothers for each band
const bandSmoothers = BAND_COLORS.map(() => createSmoother(0.2));
const rmsSmoother = createSmoother(0.15);
const onsetSmoother = createSmoother(0.4);
const centroidSmoother = createSmoother(0.1);

// Visual state
let onsetPulse = 0;

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

// Draw a single bar with glow effect
function drawBar(x, y, width, height, color, glowIntensity, pulseAmount) {
  const { h, s, l } = color;

  // Boost lightness on pulse
  const boostedL = Math.min(l + pulseAmount * 30, 85);
  const { r, g, b } = hslToRgb(h, s, boostedL);

  // Glow effect
  if (glowIntensity > 0.1) {
    const glowRadius = width * 0.8 * glowIntensity;
    const gradient = ctx.createRadialGradient(
      x + width / 2, y - height / 2,
      0,
      x + width / 2, y - height / 2,
      glowRadius + height / 2
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.4 * glowIntensity})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(
      x - glowRadius,
      y - height - glowRadius,
      width + glowRadius * 2,
      height + glowRadius * 2
    );
  }

  // Main bar with rounded top
  const cornerRadius = Math.min(width / 4, 8);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - height + cornerRadius);
  ctx.quadraticCurveTo(x, y - height, x + cornerRadius, y - height);
  ctx.lineTo(x + width - cornerRadius, y - height);
  ctx.quadraticCurveTo(x + width, y - height, x + width, y - height + cornerRadius);
  ctx.lineTo(x + width, y);
  ctx.closePath();

  // Gradient fill for bar
  const barGradient = ctx.createLinearGradient(x, y, x, y - height);
  barGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
  barGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 1)`);
  barGradient.addColorStop(1, `rgba(${Math.min(r + 50, 255)}, ${Math.min(g + 50, 255)}, ${Math.min(b + 50, 255)}, 1)`);

  ctx.fillStyle = barGradient;
  ctx.fill();

  // Highlight edge
  ctx.beginPath();
  ctx.moveTo(x + 2, y);
  ctx.lineTo(x + 2, y - height + cornerRadius);
  ctx.quadraticCurveTo(x + 2, y - height + 2, x + cornerRadius, y - height + 2);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + pulseAmount * 0.3})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Reflection (mirror below)
  const reflectionGradient = ctx.createLinearGradient(x, y, x, y + height * 0.4);
  reflectionGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
  reflectionGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = reflectionGradient;
  ctx.fillRect(x, y + 2, width, height * 0.4);
}

// Main render loop
function render() {
  const { width, height } = canvas;

  // Clear with fade for subtle trails
  ctx.fillStyle = "rgba(10, 10, 15, 0.4)";
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
  const bands = frame.bands.map((b, i) => bandSmoothers[i](b));
  const rms = rmsSmoother(frame.rms);
  const onset = onsetSmoother(frame.onset);
  const centroid = centroidSmoother(frame.centroid);

  // Onset pulse effect
  if (onset > 0.5) {
    onsetPulse = Math.max(onsetPulse, onset);
  }
  onsetPulse *= 0.9; // Decay

  // === BAR LAYOUT ===
  const numBars = bands.length;
  const totalWidth = Math.min(width * 0.8, 800);
  const barGap = totalWidth * 0.03;
  const barWidth = (totalWidth - barGap * (numBars - 1)) / numBars;
  const startX = (width - totalWidth) / 2;
  const baseY = height * 0.75;
  const maxBarHeight = height * 0.5;

  // === DRAW BARS ===
  for (let i = 0; i < numBars; i++) {
    const x = startX + i * (barWidth + barGap);

    // Apply power curve for more dramatic response
    const bandValue = power(bands[i], 0.7);
    const barHeight = Math.max(bandValue * maxBarHeight, 4);

    // Color with centroid influence on saturation
    const color = { ...BAND_COLORS[i] };
    color.s = map(centroid, 0, 1, color.s - 15, color.s + 10);

    // Glow based on RMS and individual band energy
    const glowIntensity = rms * 0.5 + bandValue * 0.5;

    drawBar(x, baseY, barWidth, barHeight, color, glowIntensity, onsetPulse);

    // Band label
    ctx.fillStyle = `rgba(150, 150, 170, ${0.4 + bandValue * 0.4})`;
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(BAND_NAMES[i], x + barWidth / 2, baseY + 24);
  }

  // === FREQUENCY INDICATOR LINE ===
  // Draw a line showing where the spectral centroid sits
  const centroidX = startX + centroid * totalWidth;
  ctx.beginPath();
  ctx.moveTo(centroidX, baseY - maxBarHeight - 20);
  ctx.lineTo(centroidX, baseY + 10);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + rms * 0.2})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Small indicator at top
  ctx.beginPath();
  ctx.arc(centroidX, baseY - maxBarHeight - 28, 4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + rms * 0.5})`;
  ctx.fill();

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

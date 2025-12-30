/**
 * Chromagram Wheel Visualization
 *
 * A harmonic color wheel showing the 12 pitch classes.
 * Each pitch class maps to a hue, with energy controlling petal size and glow.
 *
 * Mappings:
 * - Chroma values     -> petal radius and brightness
 * - Pitch class       -> hue (C=0°, C#=30°, D=60°, ...)
 * - Dominant pitch    -> center color
 * - RMS energy        -> overall scale pulse
 * - Onset             -> rotation impulse
 * - Harmonic content  -> connection lines between pitches
 * - Spectral centroid -> ring glow color temperature
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

// Pitch class names
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Create smoothers for each pitch class
const chromaSmoothers = PITCH_NAMES.map(() => createSmoother(0.15));
const rmsSmoother = createSmoother(0.15);
const onsetSmoother = createSmoother(0.4);
const centroidSmoother = createSmoother(0.1);
const harmonicSmoother = createSmoother(0.08);

// Visual state
let wheelRotation = 0;
let rotationVelocity = 0;
let pulseScale = 1;

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

// Draw a single petal/wedge
function drawPetal(ctx, cx, cy, angle, innerRadius, outerRadius, hue, energy, glowAmount) {
  const wedgeAngle = Math.PI / 7; // Slightly less than 30° for gaps
  const startAngle = angle - wedgeAngle / 2;
  const endAngle = angle + wedgeAngle / 2;

  const { r, g, b } = hslToRgb(hue, 70 + energy * 20, 40 + energy * 25);

  // Glow effect
  if (glowAmount > 0.1 && energy > 0.2) {
    const glowRadius = outerRadius * 1.3;
    const gradient = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, glowRadius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${energy * glowAmount * 0.3})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, glowRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Main petal
  ctx.beginPath();
  ctx.moveTo(
    cx + Math.cos(startAngle) * innerRadius,
    cy + Math.sin(startAngle) * innerRadius
  );
  ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
  ctx.lineTo(
    cx + Math.cos(endAngle) * innerRadius,
    cy + Math.sin(endAngle) * innerRadius
  );
  ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
  ctx.closePath();

  // Gradient fill
  const petalGradient = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
  petalGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.6)`);
  petalGradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${0.7 + energy * 0.3})`);
  petalGradient.addColorStop(1, `rgba(${Math.min(r + 40, 255)}, ${Math.min(g + 40, 255)}, ${Math.min(b + 40, 255)}, ${0.8 + energy * 0.2})`);

  ctx.fillStyle = petalGradient;
  ctx.fill();

  // Edge highlight
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + energy * 0.2})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Draw connection line between two pitches
function drawConnection(ctx, cx, cy, angle1, angle2, radius, alpha) {
  const x1 = cx + Math.cos(angle1) * radius;
  const y1 = cy + Math.sin(angle1) * radius;
  const x2 = cx + Math.cos(angle2) * radius;
  const y2 = cy + Math.sin(angle2) * radius;

  // Curved connection through center-ish
  const midRadius = radius * 0.3;
  const midAngle = (angle1 + angle2) / 2;
  const mx = cx + Math.cos(midAngle) * midRadius;
  const my = cy + Math.sin(midAngle) * midRadius;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Find the top N active pitches
function getTopPitches(chroma, n) {
  const indexed = chroma.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => b.val - a.val);
  return indexed.slice(0, n);
}

// Main render loop
function render() {
  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) * 0.35;

  // Clear with fade
  ctx.fillStyle = "rgba(10, 10, 15, 0.2)";
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
  const chroma = frame.chroma.map((c, i) => chromaSmoothers[i](c));
  const rms = rmsSmoother(frame.rms);
  const onset = onsetSmoother(frame.onset);
  const centroid = centroidSmoother(frame.centroid);
  const harmonic = harmonicSmoother(frame.harmonic);

  const dominantPitch = getDominantPitch(chroma);

  // === ROTATION ===
  // Onset adds rotation impulse
  if (onset > 0.5) {
    rotationVelocity += onset * 0.02;
  }
  rotationVelocity *= 0.98; // Friction
  wheelRotation += rotationVelocity;

  // === PULSE ===
  // RMS adds subtle pulse
  const targetPulse = 1 + rms * 0.15;
  pulseScale = lerp(pulseScale, targetPulse, 0.1);

  // === DRAW OUTER RING GLOW ===
  const ringGlowHue = map(centroid, 0, 1, 240, 30);
  const { r: rr, g: rg, b: rb } = hslToRgb(ringGlowHue, 50, 50);
  const ringGradient = ctx.createRadialGradient(
    centerX, centerY, maxRadius * 0.9 * pulseScale,
    centerX, centerY, maxRadius * 1.4 * pulseScale
  );
  ringGradient.addColorStop(0, `rgba(${rr}, ${rg}, ${rb}, 0)`);
  ringGradient.addColorStop(0.5, `rgba(${rr}, ${rg}, ${rb}, ${rms * 0.15})`);
  ringGradient.addColorStop(1, `rgba(${rr}, ${rg}, ${rb}, 0)`);

  ctx.beginPath();
  ctx.arc(centerX, centerY, maxRadius * 1.4 * pulseScale, 0, Math.PI * 2);
  ctx.fillStyle = ringGradient;
  ctx.fill();

  // === DRAW CONNECTIONS ===
  // Connect strong pitches with lines
  if (harmonic > 0.1) {
    const topPitches = getTopPitches(chroma, 4);
    const connectionRadius = maxRadius * 0.5 * pulseScale;

    for (let i = 0; i < topPitches.length; i++) {
      for (let j = i + 1; j < topPitches.length; j++) {
        const p1 = topPitches[i];
        const p2 = topPitches[j];
        const combinedEnergy = (p1.val + p2.val) / 2;

        if (combinedEnergy > 0.3) {
          const angle1 = wheelRotation + (p1.idx / 12) * Math.PI * 2 - Math.PI / 2;
          const angle2 = wheelRotation + (p2.idx / 12) * Math.PI * 2 - Math.PI / 2;
          drawConnection(
            ctx, centerX, centerY,
            angle1, angle2,
            connectionRadius,
            combinedEnergy * harmonic * 0.4
          );
        }
      }
    }
  }

  // === DRAW PETALS ===
  const innerRadius = maxRadius * 0.25 * pulseScale;

  for (let i = 0; i < 12; i++) {
    const angle = wheelRotation + (i / 12) * Math.PI * 2 - Math.PI / 2; // Start at top
    const energy = chroma[i];

    // Petal extends based on energy
    const petalLength = maxRadius * (0.4 + energy * 0.5) * pulseScale;
    const outerRadius = innerRadius + petalLength;

    // Hue: 12 pitches around the color wheel
    // Start C at red (0°), going around
    const hue = (i * 30) % 360;

    drawPetal(ctx, centerX, centerY, angle, innerRadius, outerRadius, hue, energy, harmonic);
  }

  // === DRAW PITCH LABELS ===
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < 12; i++) {
    const angle = wheelRotation + (i / 12) * Math.PI * 2 - Math.PI / 2;
    const labelRadius = innerRadius * 0.65 * pulseScale;
    const x = centerX + Math.cos(angle) * labelRadius;
    const y = centerY + Math.sin(angle) * labelRadius;

    const energy = chroma[i];
    const isDominant = i === dominantPitch;

    ctx.fillStyle = isDominant
      ? `rgba(255, 255, 255, ${0.8 + energy * 0.2})`
      : `rgba(180, 180, 200, ${0.3 + energy * 0.5})`;

    if (isDominant) {
      ctx.font = "bold 14px system-ui";
    } else {
      ctx.font = "12px system-ui";
    }

    ctx.fillText(PITCH_NAMES[i], x, y);
  }

  // === DRAW CENTER ===
  // Center circle shows dominant pitch color
  const dominantHue = (dominantPitch * 30) % 360;
  const { r: dr, g: dg, b: db } = hslToRgb(dominantHue, 60, 45);

  const centerRadius = innerRadius * 0.4 * pulseScale;
  const centerGradient = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, centerRadius
  );
  centerGradient.addColorStop(0, `rgba(${dr + 40}, ${dg + 40}, ${db + 40}, 0.9)`);
  centerGradient.addColorStop(0.7, `rgba(${dr}, ${dg}, ${db}, 0.8)`);
  centerGradient.addColorStop(1, `rgba(${dr}, ${dg}, ${db}, 0.4)`);

  ctx.beginPath();
  ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
  ctx.fillStyle = centerGradient;
  ctx.fill();

  // Center ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + rms * 0.3})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // === HARMONIC COMPLEXITY INDICATOR ===
  // Show how many pitches are active
  const activePitches = chroma.filter(c => c > 0.4).length;
  ctx.fillStyle = `rgba(150, 150, 170, 0.5)`;
  ctx.font = "11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`Harmonic density: ${activePitches}/12`, 20, 30);

  // Dominant pitch name
  ctx.fillText(`Root: ${PITCH_NAMES[dominantPitch]}`, 20, 48);

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

/**
 * Geometric Mandala Visualization
 *
 * Layered sacred geometry with beat-synced rotation and audio-driven symmetry.
 * Multiple concentric rings of polygons, each responding to different features.
 *
 * Mappings:
 * - Beat phase      -> rotation sync (snaps to beat grid)
 * - RMS energy      -> overall scale pulse
 * - Bass            -> inner ring expansion
 * - Mids            -> middle ring complexity
 * - Highs           -> outer ring detail/shimmer
 * - Onset           -> flash/bloom effect
 * - Centroid        -> color temperature
 * - Dominant pitch  -> symmetry count (3-12 fold)
 * - Harmonic        -> line weight and glow
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
  bass: createSmoother(0.2),
  mids: createSmoother(0.15),
  highs: createSmoother(0.25),
  onset: createSmoother(0.5),
  centroid: createSmoother(0.1),
  harmonic: createSmoother(0.08),
  dominantPitch: createSmoother(0.03), // Very slow for stability
};

// Visual state
let beatPhase = 0;
let lastBeatTime = 0;
let beatInterval = 0.5; // Will be calculated from tempo
let onsetFlash = 0;
let layers = [];

// Layer configuration
const NUM_LAYERS = 6;

// Initialize layers
function initLayers() {
  layers = [];
  for (let i = 0; i < NUM_LAYERS; i++) {
    layers.push({
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (i % 2 === 0 ? 1 : -1) * (0.1 + i * 0.05), // Alternate directions
      radiusFactor: 0.15 + i * 0.13, // Concentric sizing
      sides: 6, // Will be modulated
      lineWidth: 1.5,
      hue: 0,
    });
  }
}
initLayers();

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

    // Calculate beat interval from tempo
    if (analysisData.tempo) {
      beatInterval = 60 / analysisData.tempo;
    }

    console.log(
      `Loaded ${analysisData.frames.length} frames, tempo: ${analysisData.tempo} BPM`
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

// Draw a regular polygon
function drawPolygon(cx, cy, radius, sides, rotation, close = true) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (close) ctx.closePath();
}

// Draw a star polygon (skip vertices)
function drawStar(cx, cy, outerRadius, innerRadius, points, rotation) {
  ctx.beginPath();
  for (let i = 0; i <= points * 2; i++) {
    const angle = rotation + (i / (points * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

// Draw radial lines from center
function drawRadialLines(cx, cy, innerRadius, outerRadius, count, rotation) {
  for (let i = 0; i < count; i++) {
    const angle = rotation + (i / count) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * innerRadius;
    const y1 = cy + Math.sin(angle) * innerRadius;
    const x2 = cx + Math.cos(angle) * outerRadius;
    const y2 = cy + Math.sin(angle) * outerRadius;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// Draw dots at polygon vertices
function drawDots(cx, cy, radius, count, rotation, dotRadius) {
  for (let i = 0; i < count; i++) {
    const angle = rotation + (i / count) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Draw a layer of the mandala
function drawLayer(cx, cy, layer, index, maxRadius, features) {
  const {
    rms, bass, mids, highs, onset, centroid, harmonic, symmetry
  } = features;

  const baseRadius = maxRadius * layer.radiusFactor;

  // Modulate radius by frequency band
  let radiusMod = 1;
  if (index < 2) {
    radiusMod = 1 + bass * 0.3; // Inner layers respond to bass
  } else if (index < 4) {
    radiusMod = 1 + mids * 0.2; // Middle layers respond to mids
  } else {
    radiusMod = 1 + highs * 0.15; // Outer layers respond to highs
  }

  const radius = baseRadius * radiusMod * (1 + onsetFlash * 0.1);

  // Determine sides based on layer and symmetry
  const baseSides = Math.max(3, Math.min(12, symmetry + Math.floor(index / 2)));
  layer.sides = baseSides;

  // Color: layer index shifts hue, centroid affects temperature
  const baseHue = map(centroid, 0, 1, 220, 40); // Blue to orange
  layer.hue = (baseHue + index * 25) % 360;

  const { r, g, b } = hslToRgb(layer.hue, 60 + rms * 30, 45 + rms * 20);

  // Line weight based on harmonic content and layer
  const baseLineWidth = 1 + (NUM_LAYERS - index) * 0.3;
  layer.lineWidth = baseLineWidth * (0.8 + harmonic * 0.5);

  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.6 + rms * 0.3})`;
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.1 + onset * 0.2})`;
  ctx.lineWidth = layer.lineWidth;

  // Update rotation - beat synced
  const rotationMult = 1 + rms * 0.5;
  layer.rotation += layer.rotationSpeed * 0.02 * rotationMult;

  // Draw based on layer type
  switch (index % 4) {
    case 0:
      // Regular polygon with fill
      drawPolygon(cx, cy, radius, layer.sides, layer.rotation);
      ctx.stroke();
      if (rms > 0.3) {
        ctx.globalAlpha = 0.1 + onset * 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      break;

    case 1:
      // Star shape
      drawStar(cx, cy, radius, radius * 0.5, layer.sides, layer.rotation);
      ctx.stroke();
      break;

    case 2:
      // Double polygon (rotated)
      drawPolygon(cx, cy, radius, layer.sides, layer.rotation);
      ctx.stroke();
      drawPolygon(cx, cy, radius * 0.85, layer.sides, layer.rotation + Math.PI / layer.sides);
      ctx.stroke();
      break;

    case 3:
      // Radial lines with dots
      drawRadialLines(cx, cy, radius * 0.3, radius, layer.sides * 2, layer.rotation);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + rms * 0.5})`;
      drawDots(cx, cy, radius, layer.sides * 2, layer.rotation, 2 + rms * 3);
      break;
  }

  // Glow effect on outer layers
  if (index >= NUM_LAYERS - 2 && harmonic > 0.2) {
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
    ctx.shadowBlur = 10 + harmonic * 20;
    drawPolygon(cx, cy, radius * 1.02, layer.sides, layer.rotation);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// Find nearest beat
function getNearestBeat(time, beats) {
  if (!beats || beats.length === 0) return 0;

  let nearest = beats[0];
  let minDist = Math.abs(time - beats[0]);

  for (const beat of beats) {
    const dist = Math.abs(time - beat);
    if (dist < minDist) {
      minDist = dist;
      nearest = beat;
    }
    if (beat > time) break;
  }

  return nearest;
}

// Main render loop
function render() {
  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) * 0.42;

  // Clear with fade for trails
  ctx.fillStyle = "rgba(10, 10, 15, 0.15)";
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
  const bass = smoothers.bass(frame.bands[1]);
  const mids = smoothers.mids(frame.bands[3]);
  const highs = smoothers.highs(frame.bands[5]);
  const onset = smoothers.onset(frame.onset);
  const centroid = smoothers.centroid(frame.centroid);
  const harmonic = smoothers.harmonic(frame.harmonic);
  const dominantPitch = smoothers.dominantPitch(getDominantPitch(frame.chroma));

  // Calculate symmetry from dominant pitch (3-12 fold)
  const symmetry = 3 + Math.round(dominantPitch * 9 / 11);

  // Beat phase calculation
  if (analysisData.beats && analysisData.beats.length > 0) {
    const nearestBeat = getNearestBeat(currentTime, analysisData.beats);
    const timeSinceBeat = currentTime - nearestBeat;
    beatPhase = (timeSinceBeat / beatInterval) % 1;
  }

  // Onset flash
  if (onset > 0.6) {
    onsetFlash = Math.max(onsetFlash, onset);
  }
  onsetFlash *= 0.9;

  // Pulse scale based on beat phase and RMS
  const beatPulse = Math.sin(beatPhase * Math.PI * 2) * 0.03;
  const pulseScale = 1 + beatPulse + rms * 0.1;

  // Package features for layers
  const features = {
    rms, bass, mids, highs, onset, centroid, harmonic, symmetry
  };

  // === DRAW CENTER GLOW ===
  const centerHue = map(centroid, 0, 1, 220, 40);
  const { r: cr, g: cg, b: cb } = hslToRgb(centerHue, 50, 50);

  const centerGlow = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, maxRadius * 0.3 * pulseScale
  );
  centerGlow.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.3 + rms * 0.4})`);
  centerGlow.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${0.1 + rms * 0.1})`);
  centerGlow.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

  ctx.beginPath();
  ctx.arc(centerX, centerY, maxRadius * 0.3 * pulseScale, 0, Math.PI * 2);
  ctx.fillStyle = centerGlow;
  ctx.fill();

  // === DRAW LAYERS (inside out) ===
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(pulseScale, pulseScale);
  ctx.translate(-centerX, -centerY);

  for (let i = 0; i < layers.length; i++) {
    drawLayer(centerX, centerY, layers[i], i, maxRadius, features);
  }

  ctx.restore();

  // === OUTER RING ===
  const outerRingRadius = maxRadius * 1.05 * pulseScale;
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerRingRadius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(150, 150, 180, ${0.1 + rms * 0.2})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // === BEAT INDICATOR ===
  const indicatorAngle = -Math.PI / 2 + beatPhase * Math.PI * 2;
  const indicatorRadius = outerRingRadius + 10;
  const ix = centerX + Math.cos(indicatorAngle) * indicatorRadius;
  const iy = centerY + Math.sin(indicatorAngle) * indicatorRadius;

  ctx.beginPath();
  ctx.arc(ix, iy, 3 + onset * 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + onset * 0.7})`;
  ctx.fill();

  // === INFO ===
  ctx.fillStyle = "rgba(150, 150, 170, 0.5)";
  ctx.font = "11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`Symmetry: ${symmetry}-fold`, 20, 30);
  ctx.fillText(`BPM: ${Math.round(analysisData.tempo || 0)}`, 20, 48);

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

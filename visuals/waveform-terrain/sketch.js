/**
 * Waveform Terrain Visualization
 *
 * Classic demo-scene scrolling terrain mesh with 2.5D perspective projection.
 * Terrain scrolls toward viewer with height driven by frequency bands.
 *
 * Mappings:
 * - Frequency bands -> terrain height at X positions
 * - RMS energy      -> overall terrain amplitude multiplier
 * - Spectral centroid -> color temperature (cool blue to warm orange)
 * - Onset           -> brightness flash, grid visibility pulse
 * - Harmonic        -> terrain smoothness (interpolation strength)
 * - Percussive      -> terrain jitter/noise
 * - Bass            -> fog density / depth fade
 * - Contrast        -> color saturation
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

const ROWS = 45;              // Depth slices (Z direction)
const COLS = 60;              // Points per row (X direction)
const FOCAL_LENGTH = 450;     // Perspective strength
const MAX_DEPTH = 900;        // How far back terrain extends
const HEIGHT_SCALE = 180;     // Max terrain height
const SCROLL_SPEED = 120;     // Pixels per second
const TERRAIN_WIDTH = 1.4;    // Width multiplier relative to screen

// ============================================================================
// SMOOTHERS
// ============================================================================

const smoothers = {
  rms: createSmoother(0.15),
  centroid: createSmoother(0.08),
  onset: createSmoother(0.5),
  harmonic: createSmoother(0.1),
  percussive: createSmoother(0.35),
  bass: createSmoother(0.15),
  contrast: createSmoother(0.1),
  bands: Array.from({ length: 7 }, () => createSmoother(0.2)),
};

// Visual state
let hue = 200;
let saturation = 60;
let onsetFlash = 0;

// ============================================================================
// TERRAIN DATA STRUCTURE
// ============================================================================

// 2D array: terrain[row][col] = height value
let terrain = [];
let scrollOffset = 0;
let rowSpacing = MAX_DEPTH / ROWS;

function initTerrain() {
  terrain = [];
  for (let row = 0; row < ROWS; row++) {
    const rowData = new Array(COLS).fill(0);
    terrain.push(rowData);
  }
}

// Generate a new front row from audio data
function generateRowFromAudio(frame, smoothedBands, jitter) {
  const row = new Array(COLS);

  for (let col = 0; col < COLS; col++) {
    // Map column position to frequency bands (7 bands spread across columns)
    const normalizedX = col / (COLS - 1);
    const bandPosition = normalizedX * 6; // 0 to 6
    const bandIndex = Math.floor(bandPosition);
    const nextBandIndex = Math.min(bandIndex + 1, 6);
    const t = bandPosition - bandIndex;

    // Interpolate between adjacent bands for smooth terrain
    const bandValue = lerp(
      smoothedBands[bandIndex],
      smoothedBands[nextBandIndex],
      t
    );

    // Apply power curve for more dramatic peaks
    const heightValue = power(bandValue, 0.7);

    // Add jitter from percussive energy
    const jitterAmount = (Math.random() - 0.5) * jitter * 20;

    row[col] = heightValue * HEIGHT_SCALE + jitterAmount;
  }

  return row;
}

// ============================================================================
// PERSPECTIVE PROJECTION
// ============================================================================

function project(x, y, z, centerX, centerY) {
  // Simple perspective projection
  // Camera is at (0, cameraY, -focalLength)
  const scale = FOCAL_LENGTH / (FOCAL_LENGTH + z);

  return {
    screenX: centerX + x * scale,
    screenY: centerY - y * scale + z * 0.15, // Slight downward tilt
    scale: scale,
  };
}

// ============================================================================
// CANVAS RESIZE
// ============================================================================

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initTerrain();
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
// DRAWING FUNCTIONS
// ============================================================================

function drawBackground(width, height, horizonY, hue, rms) {
  // Gradient from dark bottom to slightly lighter horizon
  const gradient = ctx.createLinearGradient(0, height, 0, 0);

  // Base colors influenced by audio
  const bottomL = 5;
  const horizonL = 15 + rms * 10;

  gradient.addColorStop(0, `hsl(${hue}, 30%, ${bottomL}%)`);
  gradient.addColorStop(0.5, `hsl(${hue}, 25%, ${horizonL}%)`);
  gradient.addColorStop(1, `hsl(${hue + 20}, 20%, ${horizonL + 5}%)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Horizon glow
  const glowGradient = ctx.createRadialGradient(
    width / 2, horizonY, 0,
    width / 2, horizonY, width * 0.6
  );
  glowGradient.addColorStop(0, `hsla(${hue + 30}, 50%, 40%, ${0.15 + rms * 0.1})`);
  glowGradient.addColorStop(1, "transparent");

  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, width, height);
}

function drawTerrain(width, height, smoothedValues) {
  const {
    rms,
    centroid,
    onset,
    bass,
    contrast,
  } = smoothedValues;

  const centerX = width / 2;
  const centerY = height * 0.65; // Horizon position
  const terrainHalfWidth = (width * TERRAIN_WIDTH) / 2;

  // Calculate fog intensity from bass
  const fogDensity = 0.3 + bass * 0.4;

  // Get colors
  const { r, g, b } = hslToRgb(hue, saturation, 55 + rms * 15);

  // Draw terrain back to front
  for (let row = ROWS - 1; row >= 0; row--) {
    // Calculate Z position with scroll offset
    const z = row * rowSpacing + scrollOffset;
    const nextZ = (row + 1) * rowSpacing + scrollOffset;

    // Depth factor for fog (0 at front, 1 at back)
    const depthFactor = z / MAX_DEPTH;
    const fogAlpha = Math.pow(1 - depthFactor, fogDensity * 2);

    // Line width decreases with depth
    const lineWidth = lerp(2.5, 0.5, depthFactor);

    // Base opacity with onset flash boost
    const baseOpacity = fogAlpha * (0.6 + onsetFlash * 0.4);

    ctx.lineWidth = lineWidth;

    // Draw horizontal lines (connecting points in this row)
    ctx.beginPath();
    for (let col = 0; col < COLS; col++) {
      // X position spread across terrain width
      const x = map(col, 0, COLS - 1, -terrainHalfWidth, terrainHalfWidth);
      const y = terrain[row][col] * (0.5 + rms * 0.8);

      const projected = project(x, y, z, centerX, centerY);

      if (col === 0) {
        ctx.moveTo(projected.screenX, projected.screenY);
      } else {
        ctx.lineTo(projected.screenX, projected.screenY);
      }
    }
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${baseOpacity})`;
    ctx.stroke();

    // Draw vertical lines (connecting this row to next row)
    if (row < ROWS - 1) {
      const verticalOpacity = baseOpacity * 0.6; // Verticals slightly dimmer
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${verticalOpacity})`;

      for (let col = 0; col < COLS; col += 2) { // Every other column for performance
        const x = map(col, 0, COLS - 1, -terrainHalfWidth, terrainHalfWidth);
        const y1 = terrain[row][col] * (0.5 + rms * 0.8);
        const y2 = terrain[row + 1][col] * (0.5 + rms * 0.8);

        const p1 = project(x, y1, z, centerX, centerY);
        const p2 = project(x, y2, nextZ, centerX, centerY);

        ctx.beginPath();
        ctx.moveTo(p1.screenX, p1.screenY);
        ctx.lineTo(p2.screenX, p2.screenY);
        ctx.stroke();
      }
    }
  }

  // Draw peak glow effects on front rows
  if (rms > 0.3) {
    const frontRows = 5;
    for (let row = 0; row < frontRows; row++) {
      const z = row * rowSpacing + scrollOffset;

      for (let col = 1; col < COLS - 1; col++) {
        const height = terrain[row][col];

        // Detect local peaks
        if (height > terrain[row][col - 1] && height > terrain[row][col + 1] && height > HEIGHT_SCALE * 0.5) {
          const x = map(col, 0, COLS - 1, -terrainHalfWidth, terrainHalfWidth);
          const y = height * (0.5 + rms * 0.8);
          const projected = project(x, y, z, centerX, centerY);

          // Draw glow at peak
          const glowSize = 15 + height / HEIGHT_SCALE * 20;
          const glowGradient = ctx.createRadialGradient(
            projected.screenX, projected.screenY, 0,
            projected.screenX, projected.screenY, glowSize * projected.scale
          );
          glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.5 * (1 - row / frontRows)})`);
          glowGradient.addColorStop(1, "transparent");

          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(projected.screenX, projected.screenY, glowSize * projected.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawReflection(width, height, smoothedValues) {
  const { rms } = smoothedValues;
  const centerX = width / 2;
  const centerY = height * 0.65;
  const terrainHalfWidth = (width * TERRAIN_WIDTH) / 2;

  const { r, g, b } = hslToRgb(hue, saturation * 0.5, 30);

  // Draw faint reflection (flipped terrain)
  ctx.globalAlpha = 0.15 + rms * 0.1;

  for (let row = 0; row < Math.min(ROWS, 15); row++) {
    const z = row * rowSpacing + scrollOffset;
    const depthFactor = z / MAX_DEPTH;
    const alpha = (1 - depthFactor) * 0.3;

    ctx.beginPath();
    for (let col = 0; col < COLS; col++) {
      const x = map(col, 0, COLS - 1, -terrainHalfWidth, terrainHalfWidth);
      const y = -terrain[row][col] * 0.3 * (0.5 + rms * 0.5); // Negative Y = below horizon

      const projected = project(x, y, z, centerX, centerY);

      if (col === 0) {
        ctx.moveTo(projected.screenX, projected.screenY);
      } else {
        ctx.lineTo(projected.screenX, projected.screenY);
      }
    }
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

// ============================================================================
// RENDER LOOP
// ============================================================================

let lastTime = performance.now();
let needsNewRow = false;

function render() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const { width, height } = canvas;

  // Get current frame data
  if (!analysisData) {
    // Draw placeholder while loading
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    requestAnimationFrame(render);
    return;
  }

  const currentTime = audio.currentTime;
  const frame = getFrameAtTime(analysisData.frames, currentTime);

  // Default values when no frame
  let smoothedValues = {
    rms: 0.1,
    centroid: 0.5,
    onset: 0,
    harmonic: 0.2,
    percussive: 0,
    bass: 0.2,
    contrast: 0.5,
    bands: [0, 0, 0, 0, 0, 0, 0],
  };

  if (frame) {
    // Smooth all audio features
    const bands = frame.bands.map((b, i) => smoothers.bands[i](b));

    smoothedValues = {
      rms: smoothers.rms(frame.rms),
      centroid: smoothers.centroid(frame.centroid),
      onset: smoothers.onset(frame.onset),
      harmonic: smoothers.harmonic(frame.harmonic),
      percussive: smoothers.percussive(frame.percussive),
      bass: smoothers.bass(frame.bands[1]),
      contrast: smoothers.contrast(frame.contrast),
      bands: bands,
    };

    // Update visual parameters from audio
    // Centroid -> hue (cool blue 220 to warm orange 30)
    const targetHue = map(smoothedValues.centroid, 0, 1, 220, 30);
    hue = lerp(hue, targetHue, 0.03);

    // Contrast -> saturation
    const targetSat = map(smoothedValues.contrast, 0, 1, 40, 80);
    saturation = lerp(saturation, targetSat, 0.1);

    // Onset flash
    if (smoothedValues.onset > 0.4) {
      onsetFlash = Math.max(onsetFlash, smoothedValues.onset);
    }
    onsetFlash *= 0.92; // Decay
  }

  // ========================================================================
  // TERRAIN SCROLLING
  // ========================================================================

  scrollOffset += SCROLL_SPEED * dt;

  // When we've scrolled a full row, shift terrain and add new row
  while (scrollOffset >= rowSpacing) {
    scrollOffset -= rowSpacing;

    // Remove the back row
    terrain.pop();

    // Generate and add new front row from audio
    const newRow = generateRowFromAudio(
      frame,
      smoothedValues.bands,
      smoothedValues.percussive
    );
    terrain.unshift(newRow);
  }

  // ========================================================================
  // DRAWING
  // ========================================================================

  const horizonY = height * 0.35;

  // Background with gradient
  drawBackground(width, height, horizonY, hue, smoothedValues.rms);

  // Reflection (below horizon)
  drawReflection(width, height, smoothedValues);

  // Main terrain
  drawTerrain(width, height, smoothedValues);

  // Onset flash overlay
  if (onsetFlash > 0.1) {
    ctx.fillStyle = `rgba(255, 255, 255, ${onsetFlash * 0.08})`;
    ctx.fillRect(0, 0, width, height);
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

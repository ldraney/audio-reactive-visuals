/**
 * Reaction-Diffusion Visualization
 *
 * Gray-Scott model simulation with audio-modulated parameters.
 * Two virtual chemicals interact to create organic, evolving patterns.
 *
 * Mappings:
 * - Bass           -> feed rate (more bass = more growth)
 * - Mids           -> kill rate (pattern complexity)
 * - Highs          -> diffusion rate B (pattern sharpness)
 * - Onset          -> seed new patterns at random locations
 * - RMS energy     -> simulation speed
 * - Centroid       -> color temperature
 * - Harmonic       -> color saturation
 */

import {
  lerp,
  map,
  clamp,
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

// Simulation parameters
const SCALE = 4; // Each cell is 4x4 pixels
let gridWidth, gridHeight;
let gridA, gridB, nextA, nextB;

// Diffusion rates
const dA = 1.0;
let dB = 0.5;

// Feed and kill rates (will be modulated by audio)
let feed = 0.055;
let kill = 0.062;

// Smoothers
const smoothers = {
  bass: createSmoother(0.15),
  mids: createSmoother(0.12),
  highs: createSmoother(0.2),
  onset: createSmoother(0.5),
  rms: createSmoother(0.15),
  centroid: createSmoother(0.1),
  harmonic: createSmoother(0.08),
};

// Tracked onset for seeding
let lastOnset = 0;

// Initialize grids
function initGrids() {
  gridWidth = Math.floor(canvas.width / SCALE);
  gridHeight = Math.floor(canvas.height / SCALE);

  const size = gridWidth * gridHeight;

  gridA = new Float32Array(size);
  gridB = new Float32Array(size);
  nextA = new Float32Array(size);
  nextB = new Float32Array(size);

  // Fill with chemical A
  gridA.fill(1);
  gridB.fill(0);

  // Seed initial pattern in center
  seedPattern(gridWidth / 2, gridHeight / 2, 20);
}

// Seed a circular pattern of chemical B
function seedPattern(cx, cy, radius) {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) {
        const gx = Math.floor(cx + x);
        const gy = Math.floor(cy + y);
        if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
          const idx = gy * gridWidth + gx;
          gridB[idx] = 1;
        }
      }
    }
  }
}

// Seed a small spot
function seedSpot(cx, cy) {
  const radius = 3 + Math.random() * 5;
  seedPattern(cx, cy, radius);
}

// Get grid index with wrapping
function idx(x, y) {
  x = (x + gridWidth) % gridWidth;
  y = (y + gridHeight) % gridHeight;
  return y * gridWidth + x;
}

// Laplacian operator (for diffusion)
function laplacian(grid, x, y) {
  // Using a 3x3 convolution kernel
  // Center: -1, Adjacent: 0.2, Diagonal: 0.05
  const center = grid[idx(x, y)];
  return (
    grid[idx(x - 1, y)] * 0.2 +
    grid[idx(x + 1, y)] * 0.2 +
    grid[idx(x, y - 1)] * 0.2 +
    grid[idx(x, y + 1)] * 0.2 +
    grid[idx(x - 1, y - 1)] * 0.05 +
    grid[idx(x + 1, y - 1)] * 0.05 +
    grid[idx(x - 1, y + 1)] * 0.05 +
    grid[idx(x + 1, y + 1)] * 0.05 -
    center
  );
}

// Run one simulation step
function simulate() {
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = idx(x, y);
      const a = gridA[i];
      const b = gridB[i];

      // Reaction-diffusion equations
      const reaction = a * b * b;

      nextA[i] = a + (dA * laplacian(gridA, x, y) - reaction + feed * (1 - a));
      nextB[i] = b + (dB * laplacian(gridB, x, y) + reaction - (kill + feed) * b);

      // Clamp values
      nextA[i] = clamp(nextA[i], 0, 1);
      nextB[i] = clamp(nextB[i], 0, 1);
    }
  }

  // Swap buffers
  [gridA, nextA] = [nextA, gridA];
  [gridB, nextB] = [nextB, gridB];
}

// Resize handler
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initGrids();
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

// Render the grid to canvas
function renderGrid(hue, saturation) {
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const data = imageData.data;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = idx(x, y);
      const b = gridB[i];
      const a = gridA[i];

      // Color based on chemical B concentration
      // More B = more visible pattern
      const intensity = clamp(b * 2, 0, 1);

      // Vary lightness and saturation based on concentration
      const l = map(intensity, 0, 1, 10, 65);
      const s = saturation * (0.5 + intensity * 0.5);

      // Slight hue shift based on local gradient
      const localHue = (hue + intensity * 30) % 360;

      const { r, g, b: blue } = hslToRgb(localHue, s, l);

      // Fill the scaled pixel area
      for (let py = 0; py < SCALE; py++) {
        for (let px = 0; px < SCALE; px++) {
          const canvasX = x * SCALE + px;
          const canvasY = y * SCALE + py;
          const pixelIdx = (canvasY * canvas.width + canvasX) * 4;

          data[pixelIdx] = r;
          data[pixelIdx + 1] = g;
          data[pixelIdx + 2] = blue;
          data[pixelIdx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// Main render loop
function render() {
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
  const bass = smoothers.bass(frame.bands[1]);
  const mids = smoothers.mids(frame.bands[3]);
  const highs = smoothers.highs(frame.bands[5]);
  const onset = smoothers.onset(frame.onset);
  const rms = smoothers.rms(frame.rms);
  const centroid = smoothers.centroid(frame.centroid);
  const harmonic = smoothers.harmonic(frame.harmonic);

  // === MODULATE PARAMETERS ===

  // Feed rate: bass adds growth (creates more pattern)
  // Base feed around 0.055, range roughly 0.03-0.08
  feed = 0.04 + bass * 0.04;

  // Kill rate: mids control pattern complexity
  // Lower kill = more coral-like, higher = more spots
  // Base kill around 0.062, range roughly 0.05-0.07
  kill = 0.055 + mids * 0.02;

  // Diffusion rate B: highs affect sharpness
  // Higher dB = smoother, blurrier patterns
  dB = 0.4 + highs * 0.3;

  // Simulation speed based on RMS
  const steps = Math.floor(2 + rms * 8);

  // === SEED ON ONSETS ===
  if (onset > 0.6 && onset > lastOnset + 0.2) {
    // Seed new patterns at random locations
    const numSeeds = Math.floor(1 + onset * 3);
    for (let i = 0; i < numSeeds; i++) {
      const sx = Math.random() * gridWidth;
      const sy = Math.random() * gridHeight;
      seedSpot(sx, sy);
    }
  }
  lastOnset = onset;

  // === RUN SIMULATION ===
  for (let i = 0; i < steps; i++) {
    simulate();
  }

  // === RENDER ===
  // Color: centroid controls hue temperature
  const hue = map(centroid, 0, 1, 240, 30); // Blue to orange

  // Saturation from harmonic content
  const saturation = 40 + harmonic * 50;

  renderGrid(hue, saturation);

  // === INFO OVERLAY ===
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(10, 10, 140, 70);

  ctx.fillStyle = "rgba(200, 200, 220, 0.8)";
  ctx.font = "11px system-ui";
  ctx.fillText(`Feed: ${feed.toFixed(4)}`, 20, 28);
  ctx.fillText(`Kill: ${kill.toFixed(4)}`, 20, 44);
  ctx.fillText(`Steps/frame: ${steps}`, 20, 60);

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

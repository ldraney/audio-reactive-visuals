/**
 * Flocking Visualization
 *
 * Classic boids algorithm with audio-modulated behaviors.
 * Simple rules + audio perturbation = emergent, musical movement.
 *
 * Mappings:
 * - Separation weight   <- percussive energy (scatter on hits)
 * - Alignment weight    <- harmonic energy (unify on sustained tones)
 * - Cohesion weight     <- bass energy (group on low end)
 * - Max speed           <- RMS energy (faster when loud)
 * - Perception radius   <- highs/brilliance (wider awareness on bright)
 * - Hue                 <- spectral centroid (cool to warm)
 * - Trail opacity       <- contrast (more trails on textured sound)
 * - Onset               <- impulse burst (explosive scatter)
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

// Config
const BOID_COUNT = 150;
const BASE_MAX_SPEED = 3;
const BASE_MAX_FORCE = 0.05;
const BASE_PERCEPTION = 50;

// State
let analysisData = null;
let isPlaying = false;
let boids = [];

// Smoothers
const smoothers = {
  rms: createSmoother(0.15),
  centroid: createSmoother(0.1),
  bass: createSmoother(0.2),
  mids: createSmoother(0.15),
  highs: createSmoother(0.2),
  onset: createSmoother(0.5),
  harmonic: createSmoother(0.1),
  percussive: createSmoother(0.4),
  contrast: createSmoother(0.1),
};

// Audio-driven parameters (smoothed further for stability)
let separation = 1.5;
let alignment = 1.0;
let cohesion = 1.0;
let maxSpeed = BASE_MAX_SPEED;
let perception = BASE_PERCEPTION;
let trailAlpha = 0.1;
let hue = 200;

/**
 * Boid class - autonomous agent with flocking behaviors
 */
class Boid {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2 + 1;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.ax = 0;
    this.ay = 0;
  }

  // Apply a force
  applyForce(fx, fy) {
    this.ax += fx;
    this.ay += fy;
  }

  // Get neighbors within perception radius
  getNeighbors(boids, radius) {
    const neighbors = [];
    for (const other of boids) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        neighbors.push({ boid: other, dist, dx, dy });
      }
    }
    return neighbors;
  }

  // Separation: steer away from nearby boids
  separate(neighbors) {
    if (neighbors.length === 0) return { x: 0, y: 0 };

    let steerX = 0;
    let steerY = 0;

    for (const { boid, dist, dx, dy } of neighbors) {
      if (dist < perception * 0.5) {
        // Weight by inverse distance (closer = stronger repulsion)
        const weight = 1 / Math.max(dist, 1);
        steerX -= dx * weight;
        steerY -= dy * weight;
      }
    }

    return this.limit(steerX, steerY, BASE_MAX_FORCE);
  }

  // Alignment: steer toward average heading of neighbors
  align(neighbors) {
    if (neighbors.length === 0) return { x: 0, y: 0 };

    let avgVx = 0;
    let avgVy = 0;

    for (const { boid } of neighbors) {
      avgVx += boid.vx;
      avgVy += boid.vy;
    }

    avgVx /= neighbors.length;
    avgVy /= neighbors.length;

    // Steer toward average velocity
    let steerX = avgVx - this.vx;
    let steerY = avgVy - this.vy;

    return this.limit(steerX, steerY, BASE_MAX_FORCE);
  }

  // Cohesion: steer toward center of neighbors
  cohere(neighbors) {
    if (neighbors.length === 0) return { x: 0, y: 0 };

    let centerX = 0;
    let centerY = 0;

    for (const { boid } of neighbors) {
      centerX += boid.x;
      centerY += boid.y;
    }

    centerX /= neighbors.length;
    centerY /= neighbors.length;

    // Steer toward center
    let steerX = centerX - this.x;
    let steerY = centerY - this.y;

    return this.limit(steerX, steerY, BASE_MAX_FORCE);
  }

  // Limit vector magnitude
  limit(x, y, max) {
    const mag = Math.sqrt(x * x + y * y);
    if (mag > max && mag > 0) {
      x = (x / mag) * max;
      y = (y / mag) * max;
    }
    return { x, y };
  }

  // Apply flocking behaviors
  flock(boids) {
    const neighbors = this.getNeighbors(boids, perception);

    const sep = this.separate(neighbors);
    const ali = this.align(neighbors);
    const coh = this.cohere(neighbors);

    // Apply weights (audio-modulated)
    this.applyForce(sep.x * separation, sep.y * separation);
    this.applyForce(ali.x * alignment, ali.y * alignment);
    this.applyForce(coh.x * cohesion, coh.y * cohesion);
  }

  // Apply impulse (for onset bursts)
  impulse(strength) {
    const angle = Math.random() * Math.PI * 2;
    this.vx += Math.cos(angle) * strength;
    this.vy += Math.sin(angle) * strength;
  }

  update() {
    // Apply acceleration to velocity
    this.vx += this.ax;
    this.vy += this.ay;

    // Limit speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    // Apply velocity to position
    this.x += this.vx;
    this.y += this.vy;

    // Reset acceleration
    this.ax = 0;
    this.ay = 0;

    // Wrap edges
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;
  }

  draw(ctx, hue, saturation, lightness, alpha) {
    const { r, g, b } = hslToRgb(hue, saturation, lightness);

    // Draw as triangle pointing in velocity direction
    const angle = Math.atan2(this.vy, this.vx);
    const size = 6 + (Math.sqrt(this.vx * this.vx + this.vy * this.vy) / maxSpeed) * 4;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, size * 0.4);
    ctx.lineTo(-size * 0.6, -size * 0.4);
    ctx.closePath();

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fill();

    ctx.restore();
  }
}

// Initialize boids
function initBoids() {
  boids = [];
  for (let i = 0; i < BOID_COUNT; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    boids.push(new Boid(x, y));
  }
}

// Resize canvas
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (boids.length === 0) {
    initBoids();
  }
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
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
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

// Track onset for impulse trigger
let lastOnset = 0;

// Main render loop
function render() {
  const { width, height } = canvas;

  // Trail effect: fade previous frame
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
    // Still draw boids even without audio data
    for (const boid of boids) {
      boid.flock(boids);
      boid.update();
      boid.draw(ctx, hue, 60, 50, 0.8);
    }
    requestAnimationFrame(render);
    return;
  }

  // Extract and smooth features
  const rms = smoothers.rms(frame.rms);
  const centroid = smoothers.centroid(frame.centroid);
  const bass = smoothers.bass(frame.bands[1]);
  const mids = smoothers.mids(frame.bands[3]);
  const highs = smoothers.highs(frame.bands[5]);
  const onset = smoothers.onset(frame.onset);
  const harmonic = smoothers.harmonic(frame.harmonic);
  const percussive = smoothers.percussive(frame.percussive);
  const contrast = smoothers.contrast(frame.contrast);

  // === AUDIO MAPPINGS ===

  // Separation: percussive energy makes boids scatter
  // Higher percussive = more separation (avoid each other more)
  separation = lerp(separation, 1.0 + percussive * 3.0, 0.1);

  // Alignment: harmonic energy unifies movement
  // Higher harmonic = more alignment (move together)
  alignment = lerp(alignment, 0.5 + harmonic * 2.0, 0.1);

  // Cohesion: bass brings them together
  // Higher bass = more cohesion (cluster)
  cohesion = lerp(cohesion, 0.5 + bass * 2.5, 0.1);

  // Max speed: RMS energy
  maxSpeed = lerp(maxSpeed, BASE_MAX_SPEED * (0.5 + rms * 2.0), 0.1);

  // Perception radius: highs expand awareness
  perception = lerp(perception, BASE_PERCEPTION * (0.8 + highs * 1.5), 0.1);

  // Trail opacity: contrast = more texture = longer trails
  trailAlpha = lerp(trailAlpha, map(contrast, 0, 1, 0.15, 0.05), 0.1);

  // Hue: centroid (cool blue 220 to warm orange 30)
  hue = lerp(hue, map(centroid, 0, 1, 220, 30), 0.05);

  // Saturation: energy
  const saturation = map(rms, 0, 1, 50, 85);

  // Lightness: mids
  const lightness = map(mids, 0, 1, 40, 60);

  // Alpha: bass adds presence
  const alpha = map(bass, 0, 1, 0.6, 0.95);

  // === ONSET IMPULSE ===
  // When onset spikes, apply random impulse to all boids
  if (onset > 0.5 && onset > lastOnset + 0.1) {
    const impulseStrength = onset * 4;
    for (const boid of boids) {
      boid.impulse(impulseStrength);
    }
  }
  lastOnset = onset;

  // === UPDATE & DRAW ===
  for (const boid of boids) {
    boid.flock(boids);
    boid.update();
    boid.draw(ctx, hue, saturation, lightness, alpha);
  }

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

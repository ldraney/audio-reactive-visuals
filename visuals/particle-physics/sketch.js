/**
 * Particle Physics Visualization
 *
 * Audio becomes forces acting on autonomous particles.
 * The particles follow physics rules; music shapes their world.
 *
 * Mappings:
 * - Bass          -> gravity strength (pull down)
 * - Mids          -> wind force (horizontal push)
 * - Highs         -> turbulence (random noise)
 * - Onsets        -> particle burst spawn + impulse
 * - RMS energy    -> damping (less friction when loud)
 * - Centroid      -> particle color temperature
 * - Harmonic      -> particle glow/softness
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

// Particle configuration
const MAX_PARTICLES = 1500;
const PARTICLE_LIFETIME = 12; // seconds
const BASE_SPAWN_RATE = 1; // particles per frame when quiet

// Smoothers
const smoothers = {
  bass: createSmoother(0.2),
  mids: createSmoother(0.15),
  highs: createSmoother(0.25),
  onset: createSmoother(0.5),
  rms: createSmoother(0.15),
  centroid: createSmoother(0.1),
  harmonic: createSmoother(0.08),
};

// Particle class
class Particle {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.ax = 0;
    this.ay = 0;
    this.life = 1.0;
    this.maxLife = PARTICLE_LIFETIME;
    this.size = 2 + Math.random() * 3;
    this.hue = 0;
    this.trail = [];
    this.trailLength = 8;
  }

  applyForce(fx, fy) {
    this.ax += fx;
    this.ay += fy;
  }

  update(dt, damping) {
    // Store trail position
    if (this.trail.length >= this.trailLength) {
      this.trail.shift();
    }
    this.trail.push({ x: this.x, y: this.y });

    // Apply acceleration to velocity
    this.vx += this.ax * dt;
    this.vy += this.ay * dt;

    // Apply damping
    this.vx *= damping;
    this.vy *= damping;

    // Clamp velocity
    const maxSpeed = 500;
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    // Apply velocity to position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Reset acceleration
    this.ax = 0;
    this.ay = 0;

    // Age particle
    this.life -= dt / this.maxLife;
  }

  isAlive() {
    return this.life > 0;
  }

  draw(ctx, glowAmount) {
    const alpha = Math.pow(this.life, 0.5); // Fade out
    const { r, g, b } = hslToRgb(this.hue, 70, 55);

    // Draw trail
    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.lineTo(this.x, this.y);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
      ctx.lineWidth = this.size * 0.5;
      ctx.stroke();
    }

    // Glow effect
    if (glowAmount > 0.2) {
      const glowSize = this.size * (2 + glowAmount * 3);
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, glowSize
      );
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Main particle
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fill();
  }
}

// Particle pool
let particles = [];

function spawnParticle(x, y, vx, vy, hue) {
  if (particles.length >= MAX_PARTICLES) {
    // Recycle oldest particle
    const oldest = particles.shift();
    oldest.x = x;
    oldest.y = y;
    oldest.vx = vx;
    oldest.vy = vy;
    oldest.ax = 0;
    oldest.ay = 0;
    oldest.life = 1.0;
    oldest.hue = hue;
    oldest.trail = [];
    particles.push(oldest);
  } else {
    const p = new Particle(x, y, vx, vy);
    p.hue = hue;
    particles.push(p);
  }
}

function spawnBurst(x, y, count, hue, intensity) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 150 * intensity;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    spawnParticle(x, y, vx, vy, hue);
  }
}

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

// Noise function for turbulence
let noiseTime = 0;
function noise2D(x, y, t) {
  // Simple pseudo-noise using sin
  return Math.sin(x * 0.01 + t) * Math.cos(y * 0.01 + t * 0.7) +
         Math.sin(x * 0.02 - t * 1.3) * Math.cos(y * 0.015 + t * 0.5);
}

// Track last onset for burst spawning
let lastOnset = 0;

// Timing
let lastTime = performance.now();

// Main render loop
function render() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05); // Cap delta time
  lastTime = now;

  const { width, height } = canvas;

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
  const bass = smoothers.bass(frame.bands[1]); // Bass band
  const mids = smoothers.mids(frame.bands[3]); // Mids band
  const highs = smoothers.highs(frame.bands[5]); // Highs band
  const onset = smoothers.onset(frame.onset);
  const rms = smoothers.rms(frame.rms);
  const centroid = smoothers.centroid(frame.centroid);
  const harmonic = smoothers.harmonic(frame.harmonic);

  // === FORCE CALCULATIONS ===

  // Gravity: bass pulls down
  const gravityStrength = 300 + bass * 600;

  // Wind: mids push horizontally (oscillates with time)
  const windAngle = Math.sin(currentTime * 0.5) * Math.PI * 0.3;
  const windStrength = mids * 200;
  const windX = Math.cos(windAngle) * windStrength;
  const windY = Math.sin(windAngle) * windStrength * 0.3;

  // Turbulence: highs add noise
  const turbulenceStrength = highs * 150;

  // Damping: less friction when loud
  const damping = map(rms, 0, 1, 0.985, 0.998);

  // Color: centroid controls temperature
  const baseHue = map(centroid, 0, 1, 240, 30); // Blue to orange

  // === PARTICLE SPAWNING ===

  // Continuous spawn from edges
  const spawnRate = BASE_SPAWN_RATE + rms * 3;
  for (let i = 0; i < spawnRate; i++) {
    // Spawn from top or sides
    const side = Math.random();
    let x, y, vx, vy;

    if (side < 0.5) {
      // Top
      x = Math.random() * width;
      y = -10;
      vx = (Math.random() - 0.5) * 50;
      vy = 20 + Math.random() * 30;
    } else if (side < 0.75) {
      // Left
      x = -10;
      y = Math.random() * height * 0.5;
      vx = 30 + Math.random() * 50;
      vy = (Math.random() - 0.5) * 30;
    } else {
      // Right
      x = width + 10;
      y = Math.random() * height * 0.5;
      vx = -(30 + Math.random() * 50);
      vy = (Math.random() - 0.5) * 30;
    }

    const hue = baseHue + (Math.random() - 0.5) * 40;
    spawnParticle(x, y, vx, vy, hue);
  }

  // Burst spawn on onsets
  if (onset > 0.6 && onset > lastOnset + 0.1) {
    const burstCount = Math.floor(10 + onset * 20);
    const burstX = width * 0.3 + Math.random() * width * 0.4;
    const burstY = height * 0.3 + Math.random() * height * 0.3;
    spawnBurst(burstX, burstY, burstCount, baseHue, onset);
  }
  lastOnset = onset;

  // === UPDATE PARTICLES ===

  noiseTime += dt;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    // Apply gravity
    p.applyForce(0, gravityStrength);

    // Apply wind
    p.applyForce(windX, windY);

    // Apply turbulence
    const noiseVal = noise2D(p.x, p.y, noiseTime);
    const turbX = Math.cos(noiseVal * Math.PI * 2) * turbulenceStrength;
    const turbY = Math.sin(noiseVal * Math.PI * 2) * turbulenceStrength;
    p.applyForce(turbX, turbY);

    // Update physics
    p.update(dt, damping);

    // Remove dead or off-screen particles
    if (!p.isAlive() || p.y > height + 50 || p.x < -50 || p.x > width + 50) {
      particles.splice(i, 1);
    }
  }

  // === DRAW PARTICLES ===

  for (const p of particles) {
    p.draw(ctx, harmonic);
  }

  // === FORCE VISUALIZATION (subtle) ===

  // Show gravity direction
  const gravIndicatorY = height - 60;
  const gravIndicatorSize = 20 + bass * 30;
  ctx.beginPath();
  ctx.moveTo(width / 2, gravIndicatorY);
  ctx.lineTo(width / 2, gravIndicatorY + gravIndicatorSize);
  ctx.lineTo(width / 2 - 6, gravIndicatorY + gravIndicatorSize - 10);
  ctx.moveTo(width / 2, gravIndicatorY + gravIndicatorSize);
  ctx.lineTo(width / 2 + 6, gravIndicatorY + gravIndicatorSize - 10);
  ctx.strokeStyle = `rgba(100, 100, 120, ${0.2 + bass * 0.3})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Show wind direction
  const windIndicatorX = 60;
  const windIndicatorY = height / 2;
  const windLen = 20 + mids * 40;
  ctx.beginPath();
  ctx.moveTo(windIndicatorX, windIndicatorY);
  ctx.lineTo(
    windIndicatorX + Math.cos(windAngle) * windLen,
    windIndicatorY + Math.sin(windAngle) * windLen
  );
  ctx.strokeStyle = `rgba(100, 120, 100, ${0.2 + mids * 0.3})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Particle count (debug)
  ctx.fillStyle = "rgba(100, 100, 120, 0.4)";
  ctx.font = "11px system-ui";
  ctx.fillText(`${particles.length} particles`, 20, 30);

  // Update time display
  updateTimeDisplay();

  requestAnimationFrame(render);
}

// Start
loadAnalysis();
render();

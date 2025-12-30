/**
 * Mapping utilities for audio-reactive visuals.
 */

/**
 * Linear interpolation between two values.
 * @param {number} current - Current value
 * @param {number} target - Target value
 * @param {number} factor - Interpolation factor (0-1, higher = faster)
 * @returns {number}
 */
export function lerp(current, target, factor) {
  return current + (target - current) * factor;
}

/**
 * Map a value from one range to another.
 * @param {number} value - Input value
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number}
 */
export function map(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

/**
 * Clamp a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Apply power curve to a value (0-1 range).
 * Values > 1 compress low end, < 1 compress high end.
 * @param {number} value - Input (0-1)
 * @param {number} power - Power exponent
 * @returns {number}
 */
export function power(value, power) {
  return Math.pow(clamp(value, 0, 1), power);
}

/**
 * Ease in-out curve (smooth S-curve).
 * @param {number} t - Input (0-1)
 * @returns {number}
 */
export function easeInOut(t) {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Get the index of the frame at a given time.
 * @param {Array} frames - Array of frame objects with time property
 * @param {number} time - Current time in seconds
 * @returns {number} Frame index
 */
export function getFrameIndex(frames, time) {
  if (!frames || frames.length === 0) return 0;

  // Binary search for efficiency with large frame arrays
  let low = 0;
  let high = frames.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (frames[mid].time <= time) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

/**
 * Get interpolated frame data at a given time.
 * Linearly interpolates between two frames for smoother values.
 * @param {Array} frames - Array of frame objects
 * @param {number} time - Current time in seconds
 * @returns {Object} Interpolated frame data
 */
export function getFrameAtTime(frames, time) {
  if (!frames || frames.length === 0) return null;

  const idx = getFrameIndex(frames, time);
  const frame = frames[idx];

  // If at the last frame or exact match, return as-is
  if (idx >= frames.length - 1 || frame.time === time) {
    return { ...frame };
  }

  // Interpolate between this frame and the next
  const nextFrame = frames[idx + 1];
  const t = (time - frame.time) / (nextFrame.time - frame.time);

  return {
    time: time,
    rms: lerp(frame.rms, nextFrame.rms, t),
    centroid: lerp(frame.centroid, nextFrame.centroid, t),
    centroid_hz: lerp(frame.centroid_hz, nextFrame.centroid_hz, t),
    contrast: lerp(frame.contrast, nextFrame.contrast, t),
    onset: lerp(frame.onset, nextFrame.onset, t),
    harmonic: lerp(frame.harmonic, nextFrame.harmonic, t),
    percussive: lerp(frame.percussive, nextFrame.percussive, t),
    bands: frame.bands.map((v, i) => lerp(v, nextFrame.bands[i], t)),
    chroma: frame.chroma.map((v, i) => lerp(v, nextFrame.chroma[i], t)),
  };
}

/**
 * Find the dominant pitch class from chroma array.
 * @param {Array} chroma - 12-element chroma array
 * @returns {number} Index of dominant pitch (0-11)
 */
export function getDominantPitch(chroma) {
  let maxIdx = 0;
  let maxVal = chroma[0];
  for (let i = 1; i < chroma.length; i++) {
    if (chroma[i] > maxVal) {
      maxVal = chroma[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

/**
 * Convert HSL to RGB.
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {Object} {r, g, b} values (0-255)
 */
export function hslToRgb(h, s, l) {
  h = h % 360;
  s = s / 100;
  l = l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Create a smoother that maintains state for temporal smoothing.
 * @param {number} factor - Smoothing factor (0-1, lower = smoother)
 * @returns {Function} Smoother function
 */
export function createSmoother(factor = 0.1) {
  let value = null;

  return function smooth(target) {
    if (value === null) {
      value = target;
    } else {
      value = lerp(value, target, factor);
    }
    return value;
  };
}

/**
 * Create an object smoother for smoothing multiple properties at once.
 * @param {Object} factors - Object mapping property names to smoothing factors
 * @returns {Function} Smoother function that takes an object
 */
export function createObjectSmoother(factors = {}) {
  const smoothers = {};
  const defaultFactor = 0.15;

  return function smooth(obj) {
    const result = {};
    for (const key in obj) {
      const factor = factors[key] || defaultFactor;
      if (!smoothers[key]) {
        smoothers[key] = createSmoother(factor);
      }
      result[key] = smoothers[key](obj[key]);
    }
    return result;
  };
}

# Audio-Reactive Visuals

This repository explores the relationship between audio analysis and visual expression. The core premise: **visuals are only as compelling as the mappings that drive them**. A sophisticated particle system with naive bass→size mapping will feel generic. A simple circle with thoughtful multi-dimensional mapping can feel alive.

## Philosophy

Music visualization is not about making things move when sounds happen. It's about finding the hidden structure in audio and giving it visual form. Lo-fi and downtempo music is particularly interesting here—it rewards subtlety, has clear rhythmic structure, and often features evolving textural layers that benefit from nuanced analysis.

The goal of this repo is to build a library of visual experiments, each exploring different mapping strategies and visual approaches. Every experiment should teach us something about the relationship between audio features and visual perception.

## Repository Structure

```
/analysis          # Python scripts for librosa analysis
/visuals           # HTML/JS/Canvas visual experiments
/mappings          # Reusable mapping strategies and utilities
/audio             # Source audio files (lo-fi, downtempo)
/data              # Pre-computed analysis JSON files
```

## Audio Analysis (librosa)

All analysis happens offline. We pre-compute features and export JSON that the visuals consume. This allows heavier analysis than real-time FFT, deterministic playback, and the ability to hand-tune or augment the data.

### Core Features

**Frequency Bands** — STFT split into ranges:
- Sub-bass: 20-60Hz (the rumble, kick drum body)
- Bass: 60-250Hz (kick punch, bass notes)
- Low-mids: 250-500Hz (warmth, body)
- Mids: 500-2kHz (vocals, melody, presence)
- High-mids: 2-4kHz (clarity, edge)
- Highs: 4-8kHz (air, shimmer, hi-hats)
- Brilliance: 8kHz+ (sparkle)

More bands = more control, but diminishing returns. 4-6 bands is usually sufficient.

**RMS Energy** — Overall loudness per frame. Useful for global intensity.

**Spectral Centroid** — The "center of mass" of the spectrum. Low = dark/warm, high = bright/sharp. Excellent for controlling color temperature or visual "mood."

**Spectral Contrast** — Difference between peaks and valleys in each frequency band. Captures texture—smooth pads vs. gritty beats.

**Onset Strength** — Transient detection. Spikes on attacks (drum hits, note starts). Essential for triggering events.

**Beat Tracking** — Estimated tempo and beat positions. Note: librosa sometimes double-times or half-times. Verify against the actual groove.

### Advanced Features

**Chromagram** — 12 values representing energy in each pitch class (C, C#, D, ...). Captures harmonic content independent of octave. Powerful for:
- Color mapping (pitch → hue)
- Detecting chord changes
- Harmonic tension/resolution

**Harmonic/Percussive Separation** — Splits audio into two components:
- Harmonic: sustained tones, melody, chords
- Percussive: transients, drums, attacks

This lets you drive different visual layers with different audio streams. Drums control particles while harmony controls background gradient.

**Tempogram** — Rhythmic patterns over time. Reveals the "groove structure" beyond just beat positions.

**Spectral Bandwidth** — How spread out the frequencies are. Narrow = pure tones, wide = noise/texture.

**Spectral Rolloff** — Frequency below which X% of energy exists. Another brightness/darkness measure.

**MFCCs** — Mel-frequency cepstral coefficients. Timbral fingerprint. Useful for detecting when the "sound" changes even if energy doesn't.

**Segment Boundaries** — Structural analysis to detect verse/chorus/bridge transitions. Can trigger major visual mode shifts.

### Analysis Script Pattern

```python
import librosa
import numpy as np
import json

def analyze(filepath, sr=22050, hop_length=512):
    y, sr = librosa.load(filepath, sr=sr)
    
    # Separate harmonic and percussive
    y_harm, y_perc = librosa.effects.hpss(y)
    
    # Core features
    stft = np.abs(librosa.stft(y, hop_length=hop_length))
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    
    # Rhythmic features
    onset_env = librosa.onset.onset_strength(y=y_perc, sr=sr, hop_length=hop_length)
    tempo, beats = librosa.beat.beat_track(y=y_perc, sr=sr, hop_length=hop_length)
    
    # Harmonic features
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length)
    
    # Build frame array with all features...
    # Export to JSON...
```

Always normalize features to 0-1 range for consistent mapping.

## Visual Approaches

### 1. Direct Mapping (Baseline)
Audio feature → visual property. Simple but educational.
- bass → size
- energy → opacity
- centroid → hue
- onset → trigger

Use this to understand individual features before combining them.

### 2. Layered Systems
Multiple independent visual layers, each driven by different features:
- Background gradient: chromagram → color palette
- Particle field: percussive energy → spawn rate, harmonic energy → movement
- Foreground shapes: onsets → spawn, centroid → size

The layers create depth and complexity without any single mapping being complex.

### 3. Physics Simulation
Audio becomes forces acting on autonomous agents:
- Bass: gravity strength
- Mids: wind/flow field direction
- Highs: turbulence/noise
- Onsets: impulse forces
- Energy: friction/damping

Particles or agents follow physics rules; audio just perturbs the environment. Creates organic, emergent movement.

### 4. State Machines
Discrete visual modes with transitions:
- Intro → sparse, slow, monochrome
- Verse → medium density, cool colors
- Chorus → explosive, warm, high particle count
- Breakdown → minimal, focused

Use segment detection or manual markers to trigger transitions. Within each state, continuous features still modulate details.

### 5. Temporal Memory
Visuals respond to history, not just current frame:
- Trails/echo of past positions
- Building intensity over 4/8/16 bar phrases
- Anticipation before detected beats
- Decay curves after onsets

This creates visual "phrasing" that matches musical phrasing.

### 6. Emergent Systems
Simple rules + audio perturbation:
- **Flocking**: boids with audio-modulated separation/alignment/cohesion weights
- **Reaction-diffusion**: feed/kill rates modulated by frequency bands
- **Cellular automata**: rule parameters or birth/death thresholds driven by audio
- **Flow fields**: Perlin noise with audio-driven scale, speed, octaves

The visual complexity emerges from the system; audio just tweaks parameters.

### 7. Geometric/Sacred
Mathematical forms responding to harmony:
- Chromagram → polygon rotation, symmetry count
- Frequency ratios → geometric proportions
- Beat phase → radial pulse
- Spectral contrast → line weight variation

Works especially well with lo-fi's often minimal, repetitive harmonic structure.

## Mapping Strategies

### Smoothing
Raw audio data is jittery. Always smooth:
```javascript
smoothed = lerp(smoothed, target, factor);  // 0.1-0.3 typical
```

Different smooth factors for different purposes:
- Fast (0.3-0.5): rhythmic elements, beat response
- Medium (0.1-0.2): color, size, general movement
- Slow (0.02-0.05): mood shifts, background changes

### Nonlinear Mapping
Linear mapping often feels wrong. Consider:
- **Power curves**: `Math.pow(value, 2)` for more dramatic high-end
- **Ease functions**: easeInOut for smoother transitions
- **Thresholds**: ignore values below X, snap above Y
- **S-curves**: compress extremes, expand middle range

### Range Mapping
```javascript
function map(value, inMin, inMax, outMin, outMax) {
  return (value - inMin) / (inMax - inMin) * (outMax - outMin) + outMin;
}
```

Know your feature ranges. Centroid might span 500-5000Hz but most action is 1000-3000Hz. Map the useful range, not the theoretical range.

### Combining Features
Single features rarely capture what you want. Combine:
- `intensity = energy * 0.5 + bass * 0.3 + onset * 0.2`
- `brightness = centroid * (1 - bass)` — bright only when not bassy
- `chaos = highs * onset` — chaotic only on bright transients

### Feature Derivatives
Rate of change often matters more than absolute value:
```javascript
const delta = currentValue - previousValue;
const isRising = delta > threshold;
```

Use for:
- Detecting builds (energy rising over N frames)
- Anticipation (onset strength rising → something's coming)
- Release detection (rapid decrease after peak)

## Canvas Techniques

### requestAnimationFrame Loop
```javascript
let lastTime = 0;
function render(timestamp) {
  const delta = timestamp - lastTime;
  lastTime = timestamp;
  
  const audioTime = audio.currentTime;
  const frame = getFrameAtTime(audioTime);
  
  update(frame, delta);
  draw();
  
  requestAnimationFrame(render);
}
```

### Particle Systems
```javascript
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.life = 1;
  }
  
  update(forces, dt) {
    this.vx += forces.x * dt;
    this.vy += forces.y * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= 0.01;
  }
}
```

### Offscreen Buffers
For trails, feedback effects:
```javascript
const buffer = document.createElement('canvas');
const bufferCtx = buffer.getContext('2d');

// Each frame:
bufferCtx.globalAlpha = 0.95;  // fade factor
bufferCtx.drawImage(mainCanvas, 0, 0);
// draw new content to buffer
mainCtx.drawImage(buffer, 0, 0);
```

### Color from Audio
```javascript
// Centroid to hue (warm ↔ cool)
const hue = map(centroid, 1000, 4000, 240, 30);  // blue to orange

// Chromagram to hue (pitch class)
const dominantPitch = chroma.indexOf(Math.max(...chroma));
const hue = dominantPitch * 30;  // 12 pitches × 30° = 360°

// Energy to saturation
const sat = map(energy, 0, 1, 30, 100);
```

## Development Workflow

1. **Analyze first**: Run the audio through analysis, inspect the JSON, understand what features are active and when
2. **Sketch the mapping**: Before coding visuals, write down what features will drive what properties
3. **Build incrementally**: Start with one feature → one property, verify it feels right, then add layers
4. **A/B test mappings**: Same visual, different mappings. Which feels more musical?
5. **Record and review**: Screen record playback, watch without audio, then with. Does the visual stand alone? Does it enhance the music?

## Lo-Fi Considerations

Lo-fi music has specific characteristics that inform analysis and mapping:

- **Vinyl crackle/noise**: Shows up in highs, might want to filter or use percussive separation
- **Tape wobble**: Subtle pitch/time variations, won't dramatically affect analysis
- **Laid-back beats**: Often slightly behind the grid, beat tracking may need manual verification
- **Limited dynamic range**: Compression means less extreme energy swings, may need to expand mapped ranges
- **Repetitive structure**: Long loops, subtle variation—visuals should find interest in small changes
- **Warmth**: Typically mid-heavy, less high frequency content—centroid will trend lower

## Experiments to Build

- [x] Baseline: single circle, all features mapped to different properties
- [x] Frequency band bars (classic, but as a reference)
- [x] Particle field with physics forces from audio
- [x] Chromagram color wheel / harmonic visualization
- [ ] Flocking system with audio-modulated behaviors
- [ ] Flow field (Perlin) with audio-driven parameters
- [ ] Geometric/mandala with beat-synced rotation
- [ ] Reaction-diffusion with frequency band modulation
- [ ] Multi-layer composition (background + midground + foreground)
- [ ] State machine with section-based mode switching
- [ ] Trail/echo system with temporal memory
- [ ] Waveform terrain (3D or 2.5D)

## Resources

- [librosa documentation](https://librosa.org/doc/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) (for real-time comparison/hybrid approaches)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [The Nature of Code](https://natureofcode.com/) — physics, particles, emergence
- [Book of Shaders](https://thebookofshaders.com/) — for WebGL approaches later

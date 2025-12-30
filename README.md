# Audio Reactive Visuals

**[View Live](https://ldraney.github.io/audio-reactive-visuals/)**

A collection of experiments exploring the relationship between audio analysis and visual expression. The core premise: **visuals are only as compelling as the mappings that drive them**.

## Experiments

| Name | Description | Status |
|------|-------------|--------|
| [Baseline Circle](https://ldraney.github.io/audio-reactive-visuals/visuals/baseline-circle/) | Single circle with 7 audio features mapped to visual properties | Live |
| Frequency Bars | Classic frequency band visualization | Planned |
| Particle Physics | Audio as forces acting on autonomous particles | Planned |
| Flow Field | Perlin noise with audio-driven parameters | Planned |

## How It Works

1. **Offline Analysis** — Python/librosa extracts features: frequency bands, spectral centroid, onset strength, chromagram, harmonic/percussive separation
2. **JSON Export** — Analysis results saved as frame-by-frame data
3. **Browser Sync** — Canvas visualization syncs to audio playback, reading pre-computed features

This approach allows heavier analysis than real-time FFT and deterministic, tunable results.

## Local Development

```bash
# Clone
git clone https://github.com/ldraney/audio-reactive-visuals.git
cd audio-reactive-visuals

# Set up Python environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Mac/Linux
pip install librosa numpy

# Analyze your own audio
python analysis/analyze.py path/to/your-track.mp3

# Serve locally
python -m http.server 8000
# Open http://localhost:8000
```

## Project Structure

```
├── analysis/          # Python analysis scripts
├── visuals/           # HTML/Canvas experiments
├── mappings/          # Shared JS utilities
├── audio/             # Source audio (not committed)
├── data/              # Analysis JSON (not committed)
└── CLAUDE.md          # Technical documentation & roadmap
```

## Philosophy

Music visualization is not about making things move when sounds happen. It's about finding the hidden structure in audio and giving it visual form.

See [CLAUDE.md](CLAUDE.md) for detailed technical documentation on audio features, mapping strategies, and planned experiments.

## License

MIT

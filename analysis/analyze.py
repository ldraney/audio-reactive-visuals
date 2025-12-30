#!/usr/bin/env python3
"""
Audio analysis script for audio-reactive visuals.
Extracts features using librosa and exports to JSON.
"""

import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np


# Frequency band definitions (Hz)
BANDS = [
    ("sub_bass", 20, 60),
    ("bass", 60, 250),
    ("low_mids", 250, 500),
    ("mids", 500, 2000),
    ("high_mids", 2000, 4000),
    ("highs", 4000, 8000),
    ("brilliance", 8000, 20000),
]


def normalize(arr: np.ndarray) -> np.ndarray:
    """Normalize array to 0-1 range."""
    min_val = arr.min()
    max_val = arr.max()
    if max_val - min_val < 1e-10:
        return np.zeros_like(arr)
    return (arr - min_val) / (max_val - min_val)


def get_band_energy(stft: np.ndarray, sr: int, freqs: np.ndarray, low: float, high: float) -> np.ndarray:
    """Extract energy for a frequency band from STFT."""
    mask = (freqs >= low) & (freqs < high)
    if not np.any(mask):
        return np.zeros(stft.shape[1])
    return np.mean(stft[mask, :], axis=0)


def analyze(filepath: str, sr: int = 22050, hop_length: int = 512) -> dict:
    """
    Analyze audio file and extract features.

    Returns a dict with metadata and per-frame features.
    """
    print(f"Loading {filepath}...")
    y, sr = librosa.load(filepath, sr=sr)
    duration = librosa.get_duration(y=y, sr=sr)
    print(f"Duration: {duration:.2f}s, Sample rate: {sr}Hz")

    # Harmonic/percussive separation
    print("Separating harmonic and percussive components...")
    y_harm, y_perc = librosa.effects.hpss(y)

    # STFT
    print("Computing STFT...")
    stft = np.abs(librosa.stft(y, hop_length=hop_length))
    freqs = librosa.fft_frequencies(sr=sr)
    n_frames = stft.shape[1]

    # RMS energy
    print("Computing RMS energy...")
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms = normalize(rms)

    # Spectral centroid
    print("Computing spectral centroid...")
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    centroid_norm = normalize(centroid)

    # Spectral contrast
    print("Computing spectral contrast...")
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop_length)
    contrast_mean = normalize(np.mean(contrast, axis=0))

    # Onset strength
    print("Computing onset strength...")
    onset_env = librosa.onset.onset_strength(y=y_perc, sr=sr, hop_length=hop_length)
    onset_norm = normalize(onset_env)

    # Beat tracking
    print("Tracking beats...")
    tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr, hop_length=hop_length)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length).tolist()
    # Handle tempo being array or scalar
    tempo_val = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)

    # Chromagram
    print("Computing chromagram...")
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length)
    # Normalize each frame's chroma
    chroma_norm = np.zeros_like(chroma)
    for i in range(chroma.shape[1]):
        frame = chroma[:, i]
        max_val = frame.max()
        if max_val > 0:
            chroma_norm[:, i] = frame / max_val

    # Frequency bands
    print("Computing frequency band energies...")
    bands_data = {}
    for name, low, high in BANDS:
        band_energy = get_band_energy(stft, sr, freqs, low, high)
        bands_data[name] = normalize(band_energy)

    # Harmonic/percussive RMS
    print("Computing harmonic/percussive energy...")
    harm_rms = librosa.feature.rms(y=y_harm, hop_length=hop_length)[0]
    perc_rms = librosa.feature.rms(y=y_perc, hop_length=hop_length)[0]
    harm_norm = normalize(harm_rms)
    perc_norm = normalize(perc_rms)

    # Build frames array
    print("Building output...")
    frames = []
    times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=hop_length)

    for i in range(n_frames):
        frame = {
            "time": round(float(times[i]), 4),
            "rms": round(float(rms[i]), 4),
            "centroid": round(float(centroid_norm[i]), 4),
            "centroid_hz": round(float(centroid[i]), 1),
            "contrast": round(float(contrast_mean[i]), 4),
            "onset": round(float(onset_norm[i]), 4),
            "harmonic": round(float(harm_norm[i]), 4),
            "percussive": round(float(perc_norm[i]), 4),
            "bands": [round(float(bands_data[name][i]), 4) for name, _, _ in BANDS],
            "chroma": [round(float(chroma_norm[j, i]), 4) for j in range(12)],
        }
        frames.append(frame)

    result = {
        "sampleRate": sr,
        "hopLength": hop_length,
        "duration": round(duration, 4),
        "tempo": round(tempo_val, 2),
        "beats": [round(b, 4) for b in beat_times],
        "bandNames": [name for name, _, _ in BANDS],
        "chromaNames": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
        "frames": frames,
    }

    return result


def main():
    parser = argparse.ArgumentParser(description="Analyze audio for visualization")
    parser.add_argument("input", help="Path to audio file")
    parser.add_argument("-o", "--output", help="Output JSON path (default: data/<name>.json)")
    parser.add_argument("--sr", type=int, default=22050, help="Sample rate (default: 22050)")
    parser.add_argument("--hop", type=int, default=512, help="Hop length (default: 512)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # Default output path
    if args.output:
        output_path = Path(args.output)
    else:
        script_dir = Path(__file__).parent.parent
        output_path = script_dir / "data" / f"{input_path.stem}.json"

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Analyze
    result = analyze(str(input_path), sr=args.sr, hop_length=args.hop)

    # Write JSON
    print(f"Writing {output_path}...")
    with open(output_path, "w") as f:
        json.dump(result, f)

    print(f"Done! {len(result['frames'])} frames extracted.")
    print(f"Tempo: {result['tempo']} BPM")
    print(f"Beats: {len(result['beats'])}")


if __name__ == "__main__":
    main()

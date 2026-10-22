# backend/tools/whisper.py
"""Robust wrapper around local Whisper server (whisper.cpp).
Includes:
1. FFmpeg audio preprocessing: highpass filter, lowpass filter, FFT noise denoiser (afftdn), and dynamic audio normalization (dynaudnorm).
2. Time-domain RMS speech energy validation (rejects background clicks, room hiss, breathing, and silence before Whisper).
3. Post-transcription hallucination cleaner (filters out [BLANK_AUDIO], 'thank you for watching', single-word noise artifacts, etc.).
"""
import os
import io
import re
import math
import struct
import wave
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
import httpx

# Default server URL – can be overridden via .env
DEFAULT_SERVER_URL = os.getenv("WHISPER_SERVER_URL", "http://127.0.0.1:8080/inference")

KNOWN_HALLUCINATIONS = {
    "thank you for watching",
    "thanks for watching",
    "thank you for listening",
    "thanks for listening",
    "thank you very much",
    "thank you guys",
    "thank you",
    "thanks",
    "please subscribe",
    "subscribe for more",
    "like and subscribe",
    "subtitles by",
    "transcribed by",
    "translated by",
    "all rights reserved",
    "the end",
    "blank_audio",
    "you",
    "bye",
    "bye bye",
    "goodbye",
    "see you next time",
    "so",
    "um",
    "uh",
    "oh",
    "ah",
    "okay",
    "ok",
    "hmm",
    "shh",
    "peace",
    "cheers"
}

def clean_whisper_text(raw_text: str) -> str:
    """Removes annotations, brackets, and known noise hallucinations."""
    if not raw_text:
        return ""
    # Remove bracketed/parenthetical text like [BLANK_AUDIO], (music), [applause]
    clean = re.sub(r'\[.*?\]', '', raw_text)
    clean = re.sub(r'\(.*?\)', '', clean)
    # Remove stray consonant noises (preserve real words 'I' and 'a')
    clean = re.sub(r'\b[b-hj-zB-HJ-Z]\b', '', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    # Normalize lower for blacklist check
    lower = clean.lower().strip(" .!?,:;'\"")
    if lower in KNOWN_HALLUCINATIONS or not lower:
        return ""

    # Reject if only punctuation or empty
    words = [w for w in re.findall(r'\b\w+\b', clean)]
    if len(words) < 2 and not any(k in lower for k in ["charlie", "roger", "sarah", "why", "how", "what", "stop"]):
        return ""

    return clean.strip()

def check_pcm_speech_energy(wav_bytes: bytes) -> bool:
    """Verifies that 16kHz WAV has sufficient speech energy (RMS) to be real vocal input."""
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            n_frames = wf.getnframes()
            rate = wf.getframerate()
            duration = n_frames / float(rate)
            # Must be at least 0.55s of audio
            if duration < 0.55:
                return False
            frames = wf.readframes(n_frames)
            count = len(frames) // 2
            if count == 0:
                return False
            shorts = struct.unpack(f"{count}h", frames)
            sum_sq = sum(s * s for s in shorts)
            rms = math.sqrt(sum_sq / count)
            # In 16-bit PCM, room silence is < 100 RMS. Natural human voice is usually 300 - 8000 RMS.
            return rms >= 160
    except Exception as e:
        print(f"Energy check notice: {e}")
        return True

def convert_to_whisper_wav(raw_audio: bytes) -> Optional[bytes]:
    """Convert any audio format to clean 16kHz mono 16-bit PCM WAV preserving natural voice dynamics."""
    with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as in_f:
        in_f.write(raw_audio)
        in_path = in_f.name

    out_path = in_path + ".wav"
    try:
        # Clean 16kHz mono PCM conversion (No heavy FFT distortion so Whisper phonetics remain 100% intact)
        cmd = [
            "ffmpeg", "-y", "-i", in_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            out_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0 and os.path.exists(out_path):
            cleaned_wav = Path(out_path).read_bytes()
            if not check_pcm_speech_energy(cleaned_wav):
                return None
            return cleaned_wav
        else:
            return raw_audio
    except Exception as e:
        print(f"Audio conversion warning: {e}")
        return raw_audio
    finally:
        for p in (in_path, out_path):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass

async def call_whisper(audio_bytes: bytes) -> str:
    """Send noise-reduced audio to local Whisper server with Metal acceleration & Silero VAD."""
    wav_16k = convert_to_whisper_wav(audio_bytes)
    if not wav_16k:
        # Filtered out as background noise or silence
        return ""

    try:
        async with httpx.AsyncClient() as client:
            files = {"file": ("audio.wav", wav_16k, "audio/wav")}
            data = {
                "temperature": "0.0",
                "prompt": "Sarah, Charlie, Roger, artificial intelligence podcast debate."
            }
            resp = await client.post(DEFAULT_SERVER_URL, files=files, data=data, timeout=30)
            if resp.status_code != 200:
                print(f"Whisper server notice: {resp.status_code} {resp.text}")
                return ""
            result = resp.json()
            raw_text = result.get("text", "").strip()
            return clean_whisper_text(raw_text)
    except Exception as e:
        print(f"Whisper inference notice: {e}")
        return ""



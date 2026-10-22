"""ElevenLabs Audio Isolation Tool.
Removes ambient room noise, fan hiss, and background acoustic clutter from caller voice recordings.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
import httpx
from typing import Optional

env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")

async def isolate_voice(audio_bytes: bytes) -> bytes:
    """Uses ElevenLabs Audio Isolation API to strip background noise and return clean vocal audio."""
    api_key = os.getenv("ELEVENLABS_API_KEY", ELEVENLABS_API_KEY)
    if not api_key or not audio_bytes or len(audio_bytes) < 500:
        return audio_bytes

    url = "https://api.elevenlabs.io/v1/audio-isolation"
    headers = {"xi-api-key": api_key}
    files = {"audio": ("input.wav", audio_bytes, "audio/wav")}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, files=files)
            if resp.status_code == 200 and len(resp.content) > 100:
                return resp.content
            else:
                print(f"ElevenLabs Audio Isolation notice ({resp.status_code}): {resp.text[:80]}")
    except Exception as e:
        print(f"ElevenLabs Audio Isolation notice: {e}")

    return audio_bytes

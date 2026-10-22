"""Thin wrapper around ElevenLabs TTS API."""
import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

# Load .env file
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
# Default voice: "Rachel" (21m00Tcm4TlvDq8ikWAM) or "Adam" (pNInz6obpgDQGcFmaJgB)
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

async def synthesize(text: str, voice_id: str = DEFAULT_VOICE_ID) -> bytes:
    """Synthesize speech using ElevenLabs API and return audio/mpeg bytes."""
    api_key = os.getenv("ELEVENLABS_API_KEY", ELEVENLABS_API_KEY)
    if not api_key:
        raise ValueError("ELEVENLABS_API_KEY is not set in environment or .env file")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?optimize_streaming_latency=4&output_format=mp3_22050_32"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    payload = {
        "text": text,
        "model_id": "eleven_flash_v2_5",
        "voice_settings": {
            "stability": 0.38,
            "similarity_boost": 0.80,
            "style": 0.30,
            "use_speaker_boost": True
        }
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            raise RuntimeError(f"ElevenLabs API Error ({response.status_code}): {response.text}")
        return response.content


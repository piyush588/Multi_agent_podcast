"""Thin wrapper around ElevenLabs TTS API."""
import os
import hashlib
from pathlib import Path
from dotenv import load_dotenv
import httpx
from typing import Optional

# Load .env file
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

# Local persistent disk cache for audio clips (0ms latency & saves API quota)
AUDIO_CACHE_DIR = Path(__file__).resolve().parent.parent / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Persistent HTTP/2 connection pool to eliminate repeat TLS handshakes on slow connections
_client: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            http2=False,
            timeout=httpx.Timeout(25.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=60.0)
        )
    return _client

async def synthesize(text: str, voice_id: str = DEFAULT_VOICE_ID) -> bytes:
    """Synthesize speech using ElevenLabs API with persistent pooling and disk caching."""
    clean_text = text.strip()
    if not clean_text:
        return b""

    # 1. Check local disk cache (instant 0ms response)
    cache_key = hashlib.sha256(f"{voice_id}_{clean_text}_eleven_flash_v2_5".encode("utf-8")).hexdigest()
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.mp3"
    if cache_path.exists():
        try:
            return cache_path.read_bytes()
        except Exception:
            pass

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
        "text": clean_text,
        "model_id": "eleven_flash_v2_5",
        "voice_settings": {
            "stability": 0.38,
            "similarity_boost": 0.80,
            "style": 0.30,
            "use_speaker_boost": True
        }
    }

    client = get_http_client()
    try:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            raise RuntimeError(f"ElevenLabs API Error ({response.status_code}): {response.text}")
        audio_bytes = response.content

        # Save to disk cache for future instant playback
        if audio_bytes and len(audio_bytes) > 100:
            try:
                cache_path.write_bytes(audio_bytes)
            except Exception as ce:
                print(f"Audio cache write warning: {ce}")

        return audio_bytes
    except Exception as e:
        print(f"ElevenLabs synthesis error: {e}")
        raise e


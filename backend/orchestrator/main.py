import os
import sys
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional

# Ensure backend root is on sys.path for local module imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from persona_store.models import PERSONAS, get_persona, Persona
from tools.whisper import call_whisper
from tools.elevenlabs_tts import synthesize
from llm_worker.agent import generate_agent_response
from orchestrator.a2a_protocol import A2AMessage, A2AIntent, A2ARoundtableCoordinator
from orchestrator.topic_engine import TopicEngine, DEFAULT_TOPIC

app = FastAPI(title="AI Roundtable - Real-Time Multi-Agent Podcast")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

@app.get("/", response_class=FileResponse)
async def serve_index():
    return FileResponse(frontend_dir / "index.html")

# Global Roundtable State
ROUNDTABLE_LOCK = asyncio.Lock()
coordinator = A2ARoundtableCoordinator()
topic_engine = TopicEngine(DEFAULT_TOPIC)

PODCAST_STATE = {
    "topic": DEFAULT_TOPIC,
    "is_running": False,
    "active_speaker": None,
    "history": [],
    "a2a_traces": [],
    "audio_queue": []
}

active_connections: List[WebSocket] = []

async def broadcast_event(event_type: str, data: Any):
    payload = {"type": event_type, "data": data}
    for conn in list(active_connections):
        try:
            await conn.send_json(payload)
        except Exception:
            if conn in active_connections:
                active_connections.remove(conn)

def get_last_speaker_id() -> Optional[str]:
    """Finds the last valid panelist who spoke from active state or history."""
    agent_cycle = ["host", "technologist", "ethicist"]
    current = PODCAST_STATE.get("active_speaker")
    if current in agent_cycle:
        return current
    for item in reversed(PODCAST_STATE.get("history", [])):
        aid = item.get("agent_id")
        if aid in agent_cycle:
            return aid
    return None

@app.get("/api/state")
async def get_state():
    return PODCAST_STATE

@app.get("/api/personas")
async def get_personas():
    return {k: v.dict() for k, v in PERSONAS.items()}

@app.get("/api/a2a/traces")
async def get_a2a_traces():
    return coordinator.get_recent_traces(30)

@app.get("/api/topics")
async def get_curated_topics():
    from orchestrator.topic_engine import THEMATIC_BLUEPRINTS
    topics = []
    for key, data in THEMATIC_BLUEPRINTS.items():
        topics.append({
            "key": key,
            "title": data["title"],
            "category": data.get("category", "Debate"),
            "battlegrounds_count": len(data.get("battlegrounds", []))
        })
    return {"topics": topics, "current": PODCAST_STATE["topic"]}

@app.post("/api/topic")
async def set_topic(topic: str = Form(...), clear_history: bool = Form(False)):
    global topic_engine
    clean_topic = topic.strip()
    PODCAST_STATE["topic"] = clean_topic
    topic_engine = TopicEngine(clean_topic)

    if clear_history:
        PODCAST_STATE["history"] = []
        PODCAST_STATE["a2a_traces"] = []
        PODCAST_STATE["active_speaker"] = None
        PODCAST_STATE["audio_queue"] = []
        coordinator.clear()
        await broadcast_event("history_cleared", {"topic": clean_topic})
    else:
        PODCAST_STATE["history"].append({
            "sender": "System",
            "role": "Topic Change",
            "content": f"The podcast topic was updated to: '{clean_topic}'"
        })
    await broadcast_event("topic_updated", {"topic": clean_topic, "cleared": clear_history})
    return {"status": "ok", "topic": clean_topic}

@app.post("/api/history/clear")
async def clear_history():
    PODCAST_STATE["history"] = []
    PODCAST_STATE["a2a_traces"] = []
    PODCAST_STATE["active_speaker"] = None
    PODCAST_STATE["audio_queue"] = []
    coordinator.clear()
    await broadcast_event("history_cleared", {"status": "cleared"})
    return {"status": "cleared", "history": []}

@app.post("/api/podcast/start")
async def start_podcast():
    PODCAST_STATE["is_running"] = True
    await broadcast_event("podcast_status", {"is_running": True})
    return {"status": "started"}

@app.post("/api/podcast/stop")
async def stop_podcast():
    PODCAST_STATE["is_running"] = False
    PODCAST_STATE["active_speaker"] = None
    await broadcast_event("podcast_status", {"is_running": False})
    return {"status": "stopped"}

@app.post("/api/turn/trigger")
async def trigger_turn(target_agent: Optional[str] = None):
    """Executes a round-table turn using A2A negotiation, LLM reasoning, and ElevenLabs voice synthesis."""
    async with ROUNDTABLE_LOCK:
        agent_cycle = ["host", "technologist", "ethicist"]
        last_agent = get_last_speaker_id()

        # A2A Turn Deliberation
        if not target_agent or target_agent not in PERSONAS:
            if not PODCAST_STATE["history"]:
                target_agent = "host"
                a2a_intent = A2AIntent.OPEN_ROUNDTABLE
                dimension = "Show Introduction"
                claim = f"Opening roundtable on: {PODCAST_STATE['topic']}"
            elif last_agent == "host":
                target_agent = "technologist"
                a2a_intent = A2AIntent.PROPOSAL
                battleground = topic_engine.get_current_battleground()
                dimension = battleground.get("dimension", "Innovation Angle")
                claim = "Charlie proposing practical engineering arguments."
            elif last_agent == "technologist":
                target_agent = "ethicist"
                a2a_intent = A2AIntent.CHALLENGE
                battleground = topic_engine.get_current_battleground()
                dimension = battleground.get("dimension", "Safety & Risk")
                claim = "Roger challenging Charlie on systemic accountability."
            else: # last_agent == "ethicist"
                target_agent = "host"
                a2a_intent = A2AIntent.SYNTHESIZE
                battleground = topic_engine.get_current_battleground()
                dimension = battleground.get("dimension", "Moderation")
                claim = "Sarah synthesizing debate tension and pushing next question."
        else:
            a2a_intent = A2AIntent.YIELD_FLOOR
            battleground = topic_engine.get_current_battleground()
            dimension = battleground.get("dimension", "Directed Turn")
            claim = f"Floor yielded explicitly to {target_agent}"

        persona = PERSONAS[target_agent]
        PODCAST_STATE["active_speaker"] = persona.agent_id

        # 1. Log and Broadcast A2A Message Trace
        battleground = topic_engine.get_current_battleground()
        a2a_msg = A2AMessage(
            sender_id=last_agent or "moderator",
            receiver_id=persona.agent_id,
            intent=a2a_intent,
            dimension=dimension,
            claim_summary=claim,
            priority=0.85
        )
        coordinator.record_message(a2a_msg)
        PODCAST_STATE["a2a_traces"].append(a2a_msg.to_dict())
        await broadcast_event("a2a_trace", a2a_msg.to_dict())

        # 2. Generate Agent Response with Topic Novelty Directives
        novelty_rules = topic_engine.get_novelty_directives()
        text_response = await generate_agent_response(
            persona=persona,
            history=PODCAST_STATE["history"],
            topic=PODCAST_STATE["topic"],
            battleground=battleground,
            novelty_directives=novelty_rules
        )

        # Record claim in topic engine to prevent future phrase repetitions
        topic_engine.record_claim(text_response[:80])

        turn_data = {
            "agent_id": persona.agent_id,
            "sender": persona.name,
            "role": persona.role,
            "content": text_response
        }
        PODCAST_STATE["history"].append(turn_data)
        await broadcast_event("turn_started", turn_data)

        # 3. ElevenLabs High-Fidelity Voice Synthesis
        audio_bytes = b""
        audio_base64 = ""
        try:
            audio_bytes = await synthesize(text=text_response, voice_id=persona.voice_id)
            if audio_bytes:
                import base64
                audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
        except Exception as e:
            print(f"ElevenLabs synthesis warning: {e}")

        payload = {
            **turn_data,
            "has_audio": len(audio_bytes) > 0,
            "audio_base64": audio_base64
        }
        await broadcast_event("turn_completed", payload)

        return {
            "turn": turn_data,
            "audio_base64": audio_base64,
            "audio_length": len(audio_bytes)
        }

@app.post("/api/interrupt")
async def handle_human_interruption(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    target_agent: Optional[str] = Form(None)
):
    async with ROUNDTABLE_LOCK:
        interruption_text = (text or "").strip()
        if not interruption_text and file:
            audio_bytes = await file.read()
            interruption_text = await call_whisper(audio_bytes)

        interruption_text = interruption_text.strip()
        words = interruption_text.split()
        lower_text = interruption_text.lower()
        if not interruption_text or len(interruption_text) < 4 or (len(words) < 2 and not any(k in lower_text for k in ["charlie", "roger", "sarah", "why", "how", "what", "stop", "wait"])):
            return {
                "status": "silence",
                "interruption": interruption_text,
                "message": "No clear speech detected or ambient noise filtered",
                "response": None
            }

        # Check for rapid duplicate interruption within last 2 turns
        for recent in reversed(PODCAST_STATE.get("history", [])[-2:]):
            if recent.get("sender") == "Audience (Human)":
                if recent.get("content", "").strip().lower() == interruption_text.lower():
                    return {
                        "status": "duplicate",
                        "interruption": interruption_text,
                        "response": None
                    }

        # Smart Intent & Name Detection from Spoken Utterance
        lower_text = interruption_text.lower()
        detected_agent = None
        if "charlie" in lower_text or "technologist" in lower_text:
            detected_agent = "technologist"
        elif "roger" in lower_text or "ethic" in lower_text or "safety scholar" in lower_text or "policy" in lower_text:
            detected_agent = "ethicist"
        elif "sarah" in lower_text or "host" in lower_text or "moderator" in lower_text:
            detected_agent = "host"

        agent_cycle = ["host", "technologist", "ethicist"]
        if detected_agent:
            routed_agent_id = detected_agent
        elif target_agent and target_agent in PERSONAS and target_agent != "all":
            routed_agent_id = target_agent
        else:
            # Cycle to the other panelist so debate continues seamlessly
            last_agent = get_last_speaker_id()
            if last_agent == "technologist":
                routed_agent_id = "ethicist"
            elif last_agent == "ethicist":
                routed_agent_id = "technologist"
            else:
                routed_agent_id = "technologist"

        persona = PERSONAS[routed_agent_id]
        PODCAST_STATE["active_speaker"] = persona.agent_id

        # 1. Log Audience Interruption to History & A2A Coordinator
        user_turn = {
            "sender": "Audience (Human)",
            "role": f"Live Question for {persona.name}",
            "content": interruption_text,
            "isInterruption": True
        }
        PODCAST_STATE["history"].append(user_turn)

        a2a_interrupt_msg = A2AMessage(
            sender_id="audience",
            receiver_id=persona.agent_id,
            intent=A2AIntent.AUDIENCE_CHALLENGE,
            dimension="Audience Q&A",
            claim_summary=f"Listener asked: '{interruption_text[:60]}'",
            priority=1.0
        )
        coordinator.record_message(a2a_interrupt_msg)
        PODCAST_STATE["a2a_traces"].append(a2a_interrupt_msg.to_dict())

        # 2. Broadcast Interruption Event (< 20ms cutoff for active audio)
        await broadcast_event("human_interruption", {
            "text": interruption_text,
            "routed_to": persona.name,
            "agent_id": persona.agent_id
        })
        await broadcast_event("a2a_trace", a2a_interrupt_msg.to_dict())

        # 3. Generate Agent Answer Directly Grounded in the Listener's Question
        battleground = topic_engine.get_current_battleground()
        response_text = await generate_agent_response(
            persona=persona,
            history=PODCAST_STATE["history"],
            topic=PODCAST_STATE["topic"],
            battleground=battleground,
            user_interruption=interruption_text
        )

        turn_data = {
            "agent_id": persona.agent_id,
            "sender": persona.name,
            "role": persona.role,
            "content": response_text
        }
        PODCAST_STATE["history"].append(turn_data)
        await broadcast_event("turn_started", turn_data)

        # 4. Synthesize Spoken Answer
        audio_base64 = ""
        try:
            audio_bytes = await synthesize(text=response_text, voice_id=persona.voice_id)
            if audio_bytes:
                import base64
                audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
        except Exception as e:
            print(f"ElevenLabs interruption synthesis error: {e}")

        turn_data["audio_base64"] = audio_base64
        payload = {
            **turn_data,
            "is_interruption_response": True
        }
        await broadcast_event("turn_completed", payload)

        return {
            "interruption": interruption_text,
            "response": turn_data,
            "audio_base64": audio_base64
        }

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_connections.append(ws)
    await ws.send_json({"type": "connected", "state": PODCAST_STATE})
    try:
        while True:
            msg = await ws.receive_text()
            await ws.send_text(f"ACK: {msg}")
    except WebSocketDisconnect:
        if ws in active_connections:
            active_connections.remove(ws)

import re
from typing import List, Dict, Any, Optional
import httpx
from persona_store.models import Persona, get_persona
from orchestrator.a2a_protocol import A2AMessage, A2AIntent

def ensure_complete_sentences(text: str) -> str:
    """Ensures text ends on a complete sentence (., ?, !) and doesn't get cut off mid-thought."""
    text = text.strip()
    if not text:
        return text
    if text[-1] in '.!?':
        return text
    matches = list(re.finditer(r'[\.\?\!](?:\s|$)', text))
    if matches:
        last_match = matches[-1]
        trimmed = text[:last_match.end()].strip()
        if len(trimmed) > 20:
            return trimmed
    return text + "."

def clean_speech_text(text: str, persona_name: str) -> str:
    """Cleans text so ElevenLabs speaks authentic human audio without stage tags or artifacts."""
    text = text.strip(' \t\n\r"\'')
    # 1. Strip chat template tokens like 'assistant', 'user', 'system'
    text = re.sub(r'^(?:assistant|user|system)\s*[:\-]?\s*', '', text, flags=re.IGNORECASE)
    # 2. Strip persona names and known role prefixes
    known_tags = r'^(?:sarah|charlie|roger|host|moderator|technologist|ethicist|panelist|speaker)\s*[:\-]?\s*'
    text = re.sub(known_tags, '', text, flags=re.IGNORECASE)
    # 3. Strip bracketed speaker tags e.g. [Sarah]: or [Charlie] -
    text = re.sub(r'^\[[A-Za-z\s]+\]\s*[:\-]?\s*', '', text)
    # 4. Strip parenthetical stage directions like (laugh), (chuckles), (pauses), [sighs]
    text = re.sub(r'[\(\[][a-zA-Z\s]+[\)\]]', '', text)
    # 5. Strip asterisks like *laughs*, *smiles*
    text = re.sub(r'\*[^*]+\*', '', text)
    # 6. Normalize whitespace and enclosing quotes
    text = re.sub(r'\s+', ' ', text).strip(' \t\n\r"\'')
    # 7. Ensure no mid-sentence truncation
    text = ensure_complete_sentences(text)
    return text

async def generate_agent_response(
    persona: Persona,
    history: List[Dict[str, str]],
    topic: str = "",
    battleground: Optional[Dict[str, str]] = None,
    novelty_directives: str = "",
    user_interruption: Optional[str] = None
) -> str:
    """Generates broadcast-grade podcast dialogue with genuine conversational conviction."""
    last_turn = history[-1] if history else {}
    last_speaker = last_turn.get("sender", "")
    last_argument = last_turn.get("content", "")

    bg = battleground or {}
    dimension = bg.get("dimension", "Core Debate")
    charlie_target = bg.get("charlie_angle", "Push the frontier of innovation.")
    roger_target = bg.get("roger_angle", "Ensure accountability and safety.")
    sarah_target = bg.get("sarah_hook", "Where do we find the balance?")

    # Dynamic role-specific instruction:
    if user_interruption:
        role_instruction = (
            f"DEBATE TOPIC: '{topic}'. DIMENSION: '{dimension}'.\n"
            f"A listener just interrupted the live debate with this comment/question: \"{user_interruption}\".\n"
            f"You are {persona.name}.\n"
            "STRICT RULES:\n"
            "- ZERO GREETINGS: Do NOT say 'Welcome', 'Hey friend', 'Thanks for the question', 'Let us dive into', or 'We are down to discuss'.\n"
            f"- Jump STRAIGHT into your direct answer regarding '{topic}'. State your thesis immediately.\n"
            "- NO BOOKISH BUZZWORDS: Do NOT talk about GitHub or code repos unless the question specifically asked about software repositories.\n"
            "- Speak in 2 to 3 sharp, opinionated conversational sentences that end with a period."
        )
    elif persona.agent_id == "host":
        if last_speaker and last_argument:
            role_instruction = (
                f"DEBATE TOPIC: '{topic}'. DIMENSION: '{dimension}'.\n"
                f"{last_speaker} just argued: \"{last_argument}\".\n"
                f"You are Sarah (Host). Push back on {last_speaker}'s premise in 1 incisive sentence, then confront the panel with: \"{sarah_target}\".\n"
                "DO NOT praise the speaker. Cut straight to the conflict in 2 punchy spoken sentences."
            )
        else:
            role_instruction = (
                f"You are Sarah, opening the debate on: '{topic}'.\n"
                f"State the central dilemma in 2 sharp, captivating spoken sentences and challenge Charlie to answer: \"{sarah_target}\"."
            )
    elif persona.agent_id == "technologist":
        role_instruction = (
            f"DEBATE TOPIC: '{topic}'. DIMENSION: '{dimension}'.\n"
            f"Your stance: \"{charlie_target}\".\n"
            f"{last_speaker} argued: \"{last_argument}\".\n"
            f"You are Charlie. Disagree directly with {last_speaker}. Give a concrete real-world mechanism that proves your point.\n"
            f"Stay strictly on the subject of '{topic}'. DO NOT wander into generic coding or GitHub. Jump straight into your argument in 2 to 3 punchy spoken sentences."
        )
    else:  # ethicist
        role_instruction = (
            f"DEBATE TOPIC: '{topic}'. DIMENSION: '{dimension}'.\n"
            f"Your stance: \"{roger_target}\".\n"
            f"{last_speaker} argued: \"{last_argument}\".\n"
            f"You are Roger. Directly dismantle {last_speaker}'s premise. Highlight the societal damage, real-world victim, or dangerous failure mode.\n"
            f"Stay strictly on '{topic}'. No academic jargon or buzzwords. Jump straight into your argument in 2 to 3 grounded spoken sentences."
        )

    # Master Podcast System Prompt
    system_prompt = (
        f"{persona.system_prompt}\n\n"
        "STRICT BROADCAST DIALOGUE RULES (VIOLATING THESE BREAKS THE SHOW):\n"
        "1. NO GREETINGS OR ACKNOWLEDGMENTS: Never say 'Welcome', 'Hey friend', 'I agree', 'Thanks for having me', 'That is a great question', or 'Let us dive into'. State your point immediately.\n"
        "2. NO AI BUZZWORDS OR ESSAY CLICHÉS: Never use 'digital landscape', 'tapestry', 'multifaceted', 'pivotal', 'delve', 'catalyst', 'holistic', or 'for real'. Speak like an authentic human with conviction.\n"
        "3. STAY STRICTLY ON TOPIC: Anchor your response to the debate topic without drifting into generic software tropes.\n"
        "4. Speak in 2 to 3 punchy, complete sentences ending with a period or question mark.\n"
        "5. Output ONLY spoken words. Never output speaker prefixes (e.g. 'Sarah:'), asterisks (*laughs*), or stage directions."
        f"{novelty_directives}"
    )

    messages = [
        {"role": "system", "content": system_prompt}
    ]

    # Provide concise, high-signal recent history (up to 4 substantive turns)
    substantive_history = [
        h for h in history[-4:]
        if h.get("sender") not in ["System"] and h.get("content")
    ]
    for h in substantive_history:
        s = h.get("sender", "")
        c = h.get("content", "")
        messages.append({"role": "user", "content": f"{s}: {c}"})

    messages.append({"role": "user", "content": role_instruction})

    # Execute with llama3.2:3b via local Ollama
    for model_name in ["llama3.2:3b", "llama3.2:1b"]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=1.2)) as client:
                resp = await client.post(
                    "http://127.0.0.1:11434/api/chat",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": 0.76,
                            "top_p": 0.9,
                            "repeat_penalty": 1.25,
                            "presence_penalty": 0.5,
                            "frequency_penalty": 0.3,
                            "num_predict": 160
                        }
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw_content = data.get("message", {}).get("content", "").strip()
                    cleaned = clean_speech_text(raw_content, persona.name)
                    if cleaned and len(cleaned) > 15:
                        return cleaned
        except Exception as e:
            print(f"Ollama error on {model_name}: {repr(e)}")
            continue

    # Fallback if Ollama timeout
    if user_interruption:
        return f"That question cuts right to the heart of this debate. We cannot evaluate this technology in an ivory tower without looking at how everyday developers and users are actually impacted."
    return f"Look at what {last_speaker or 'everyone'} is pointing out here. There is a fundamental trade-off between technological speed and human accountability that we have to resolve."

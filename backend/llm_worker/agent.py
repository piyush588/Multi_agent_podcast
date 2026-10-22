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

    # 1. Repeatedly strip dangling trailing prepositions, conjunctions, or broken clauses
    dangling_pattern = r'[\s,-]+(?:favor of|because of|in order to|as well as|such as|instead of|due to|of|to|in|for|with|and|or|that|as|at|the|a|an|by|from|about|into|through|during|before|after|above|below|is|are|was|were|be|been|being)\s*[\.\?\!]*$'
    for _ in range(4):
        stripped = re.sub(dangling_pattern, '', text, flags=re.IGNORECASE).strip()
        if stripped == text or not stripped:
            break
        text = stripped

    # 2. Look for sentence-ending punctuation (. ? !)
    matches = list(re.finditer(r'[\.\?\!](?:\s|$)', text))
    if matches:
        last_match = matches[-1]
        remainder = text[last_match.end():].strip()
        # If there's an incomplete dangling fragment after the last punctuated sentence, trim it off
        if remainder:
            trimmed = text[:last_match.end()].strip()
            if len(trimmed) > 25:
                return trimmed
        elif text[-1] in '.!?':
            return text

    return text.rstrip(',- ') + "."

def clean_speech_text(text: str, persona_name: str) -> str:
    """Cleans text so ElevenLabs speaks authentic human audio without stage tags or artifacts."""
    text = text.strip(' \t\n\r"\'')
    # 1. Strip chat template tokens like 'assistant', 'user', 'system'
    text = re.sub(r'^(?:assistant|user|system)\s*[:\-]?\s*', '', text, flags=re.IGNORECASE)
    # 2. Strip persona names and known role prefixes at start
    known_tags = r'^(?:sarah|charlie|roger|host|moderator|technologist|ethicist|panelist|speaker)\s*[:\-]?\s*'
    text = re.sub(known_tags, '', text, flags=re.IGNORECASE)
    # 3. Strip bracketed speaker tags at start e.g. [Sarah]: or [Charlie] -
    text = re.sub(r'^\[[A-Za-z\s]+\]\s*[:\-]?\s*', '', text)
    # 4. Truncate if the model starts roleplaying or scripting subsequent speakers in the same turn
    # e.g., "Roger: ...", "\nCharlie:", "Sarah:", 'Now Charlie: ...'
    subsequent_speaker = re.search(r'(?:[\.\?\!\"]\s+|\n+)(?:Now\s+|Over to\s+)?(?:Roger|Charlie|Sarah|Host|Moderator|Technologist|Ethicist|Caller|Audience)\s*[:\-]', text, flags=re.IGNORECASE)
    if subsequent_speaker:
        text = text[:subsequent_speaker.start() + (1 if text[subsequent_speaker.start()] in '.!?' else 0)].strip()
    # 5. Strip robotic assistant filler phrases
    text = re.sub(r'\b(?:let me|allow me to)\s+(?:address|answer|tackle|respond to|take)\s+(?:this\s+for\s+you|that\s+for\s+you|this|that|your question|your point)[\s,.:;]*(?:caller|friend|listener|audience member)?[\s,.:;]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:to address (?:your|this)|regarding your)\s+(?:point|question|inquiry)[\s,.:;]*', '', text, flags=re.IGNORECASE)
    # 6. Strip parenthetical stage directions like (laugh), (chuckles), (pauses), [sighs]
    text = re.sub(r'[\(\[][a-zA-Z\s]+[\)\]]', '', text)
    # 7. Strip asterisks like *laughs*, *smiles*
    text = re.sub(r'\*[^*]+\*', '', text)
    # 8. Normalize whitespace and enclosing quotes
    text = re.sub(r'\s+', ' ', text).strip(' \t\n\r"\'')
    # 9. Ensure no mid-sentence truncation
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
            f"A live audience listener just interrupted the roundtable to speak directly to you ({persona.name}): \"{user_interruption}\".\n"
            f"You are {persona.name}.\n"
            "INSTRUCTIONS:\n"
            "- START WITH A NATURAL HUMAN REACTION: Begin with an authentic chuckle or spoken acknowledgment (e.g., 'Haha, wow, good challenge!', 'Heh, fair point from the audience.', 'Hmm, I hear you, but look at what actually happens.').\n"
            "- NEVER sound like an AI assistant. NEVER say 'let me address this', 'allow me to answer', or 'as an AI'.\n"
            f"- ANSWER WITH VISCERAL REAL-WORLD CONVICTION: Jump straight into your punchy, conversational answer on '{topic}'.\n"
            "- Speak in 2 to 3 lively spoken sentences as if chatting with a caller on a live podcast."
        )
    elif persona.agent_id == "host":
        if last_speaker and last_argument:
            role_instruction = (
                f"DEBATE TOPIC: '{topic}'. DIMENSION: '{dimension}'.\n"
                f"{last_speaker} just argued: \"{last_argument}\".\n"
                f"You are Sarah (Host). React with authentic podcast energy (e.g. 'Haha, shots fired!', 'Hold on a second, Charlie.', 'Heh, that sounds great, but let's get real.').\n"
                f"Confront the panel with the hard dilemma: \"{sarah_target}\".\n"
                "Speak in 2 punchy, spoken sentences ending with a sharp question."
            )
        else:
            role_instruction = (
                f"You are Sarah, opening the debate on: '{topic}'.\n"
                f"Set up the fiery controversy in 2 punchy spoken sentences and toss the first hard question to Charlie: \"{sarah_target}\"."
            )
    elif persona.agent_id == "technologist":
        role_instruction = (
            f"DEBATE TOPIC: '{topic}'. DIMENSION: '{dimension}'.\n"
            f"Your stance: \"{charlie_target}\".\n"
            f"{last_speaker} argued: \"{last_argument}\".\n"
            f"You are Charlie (AI Hacker). React spontaneously with authentic conviction (e.g. 'Haha, come on, Roger!', 'Heh, you're kidding, right?', 'Look, let's talk about the actual reality.').\n"
            f"Dismantle {last_speaker}'s argument with a concrete, real-world example on '{topic}'.\n"
            "Keep it 2 to 3 fiery, conversational sentences. Use everyday spoken English, not academic prose."
        )
    else:  # ethicist
        role_instruction = (
            f"DEBATE TOPIC: '{topic}'. DIMENSION: '{dimension}'.\n"
            f"Your stance: \"{roger_target}\".\n"
            f"{last_speaker} argued: \"{last_argument}\".\n"
            f"You are Roger (Ethicist). Push back hard against {last_speaker}'s Silicon Valley optimism (e.g. 'Hmm, that's easy to say from an air-conditioned office, Charlie.', 'Haha, sure, until someone gets hurt.', 'Look at who actually pays the price here.').\n"
            f"Highlight the real-world human victim or danger on '{topic}'.\n"
            "Keep it 2 to 3 grounded, passionate spoken sentences."
        )

    # Master Broadcast Rules
    system_prompt = (
        f"{persona.system_prompt}\n\n"
        "STRICT PODCAST BROADCAST RULES:\n"
        "1. SPEAK LIKE REAL HUMANS ON A LIVE SHOW: Talk like hosts on Joe Rogan or the All-In Podcast. Use contractions (it's, that's, we've, don't), visceral spoken reactions ('Haha, look...', 'Heh, come on...', 'Hmm...'), and natural rhythm.\n"
        "2. BANNED ACADEMIC JARGON: NEVER use 'conflate', 'inherent', 'secrecy-laden', 'untestable paradox', 'systemic accountability', 'monopolistic structures', 'mitigate', 'digital landscape', 'delve', 'tapestry', 'dichotomy', 'multifaceted', 'paradigm', 'nuanced'. Speak plain, powerful English!\n"
        "3. STAY SHARP AND OPINIONATED: Anchor directly to the debate topic without drifting into generic software coding tropes.\n"
        "4. Keep your answer to 2 to 3 punchy, complete spoken sentences ending with a period or question mark.\n"
        "5. Output ONLY spoken words. Never output speaker prefixes (e.g. 'Sarah:'), stage directions in brackets, or asterisks (*laughs*). Use written words like 'Haha,' or 'Heh,' so ElevenLabs laughs naturally."
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
                            "temperature": 0.72 if user_interruption else 0.76,
                            "top_p": 0.9,
                            "repeat_penalty": 1.25,
                            "presence_penalty": 0.5,
                            "frequency_penalty": 0.3,
                            "num_predict": 180,
                            "stop": [
                                "\nSarah:", "\nCharlie:", "\nRoger:",
                                "\nSarah -", "\nCharlie -", "\nRoger -",
                                "\nHost:", "\nTechnologist:", "\nEthicist:",
                                "\nSarah (", "\nCharlie (", "\nRoger (",
                                "\n[Sarah", "\n[Charlie", "\n[Roger",
                                "\nAudience:", "\nCaller:", "\nUser:"
                            ]
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

// ElevenLabs AI Roundtable Studio — Frontend Logic
const API_BASE = window.location.origin;
const WS_URL = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/ws";

let socket = null;
let isRunning = false;
let isProcessingTurn = false;

// Audio & Player Elements
const audioPlayer = document.getElementById("audio-player");
const startBtn = document.getElementById("start-btn");
const startBtnText = document.getElementById("start-btn-text");
const startBtnIcon = document.getElementById("start-btn-icon");
const nextTurnBtn = document.getElementById("next-turn-btn");
const currentTopicEl = document.getElementById("current-topic");
const changeTopicBtn = document.getElementById("change-topic-btn");
const topicPresetsList = document.getElementById("topic-presets-list");

// Orb & Visualizer Elements
const mainOrb = document.getElementById("main-orb");
const orbSpeakerName = document.getElementById("orb-speaker-name");
const orbSpeakerRole = document.getElementById("orb-speaker-role");
const orbSpeakerBadge = document.getElementById("orb-speaker-badge");
const currentActiveTag = document.getElementById("current-active-tag");
const pillIdle = document.getElementById("pill-idle");
const pillListening = document.getElementById("pill-listening");
const pillTalking = document.getElementById("pill-talking");
const waveformBars = document.getElementById("waveform-bars");
const telemetryBox = document.getElementById("telemetry-box");
const playbackProgress = document.getElementById("playback-progress");
const currentTimeEl = document.getElementById("current-time");
const speakerStatusCaption = document.getElementById("speaker-status-caption");
const themeBtn = document.getElementById("theme-btn");

// Instantiate ElevenLabs Interactive Particle Voice Sphere
let particleSphere = null;
if (window.ElevenLabsParticleSphere) {
  particleSphere = new window.ElevenLabsParticleSphere("particle-orb-canvas");
  window.particleSphere = particleSphere;
}

// Telemetry Canvas Spectrum Visualizer
const telemetryCanvas = document.getElementById("telemetry-canvas");
const telemetryCtx = telemetryCanvas ? telemetryCanvas.getContext("2d") : null;

function renderTelemetryWave() {
  if (!telemetryCtx || !telemetryCanvas) return;
  const w = telemetryCanvas.width;
  const h = telemetryCanvas.height;
  telemetryCtx.clearRect(0, 0, w, h);

  const numBars = 32;
  const barWidth = (w / numBars) - 2;
  const isSpeaking = (particleSphere && (particleSphere.state === "talking" || particleSphere.state === "listening"));
  const energy = particleSphere ? particleSphere.energy : 0.05;
  const now = Date.now() * 0.005;

  for (let i = 0; i < numBars; i++) {
    const x = i * (barWidth + 2);
    let barHeight = 4;
    if (isSpeaking) {
      const wave = Math.sin(now * 2 + i * 0.35) * 0.5 + 0.5;
      const freq = Math.sin(now * 3.8 + i * 0.7) * 0.3 + 0.7;
      barHeight = Math.max(4, Math.min(h - 4, (wave * freq * energy * 1.8) * (h - 8)));
    } else {
      barHeight = 4 + Math.sin(now + i * 0.25) * 2;
    }

    const y = h - barHeight;
    const isDark = document.body.getAttribute("data-theme") === "dark";
    const grad = telemetryCtx.createLinearGradient(0, y, 0, h);
    if (isSpeaking) {
      grad.addColorStop(0, "#FF6B4A");
      grad.addColorStop(1, "#F59E0B");
    } else {
      grad.addColorStop(0, isDark ? "#353B4E" : "#D0C6B5");
      grad.addColorStop(1, isDark ? "#1D212B" : "#E4DDD1");
    }

    telemetryCtx.fillStyle = grad;
    telemetryCtx.beginPath();
    telemetryCtx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
    telemetryCtx.fill();
  }

  requestAnimationFrame(renderTelemetryWave);
}
renderTelemetryWave();

// Theme Switcher (Signature Whitish Skin-Tone Default | Obsidian Option)
function initTheme() {
  const savedTheme = localStorage.getItem("elevenlabs_roundtable_theme") || "light";
  applyTheme(savedTheme);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.body.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("elevenlabs_roundtable_theme", next);
    });
  }
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
    if (themeBtn) {
      themeBtn.title = "Switch to Alabaster Light Theme";
      themeBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      `;
    }
  } else {
    document.body.removeAttribute("data-theme");
    if (themeBtn) {
      themeBtn.title = "Switch to Obsidian Dark Theme";
      themeBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      `;
    }
  }
}
initTheme();

// Panelist Roster Elements
const panelistHost = document.getElementById("panelist-host");
const panelistTech = document.getElementById("panelist-technologist");
const panelistEthic = document.getElementById("panelist-ethicist");

// Chat & Interruption Elements
const transcriptFeed = document.getElementById("transcript-feed");
const turnCountEl = document.getElementById("turn-count");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const sessionStatusEl = document.getElementById("session-status");
const interruptText = document.getElementById("interruption-text");
const interruptTarget = document.getElementById("interrupt-target");
const sendInterruptBtn = document.getElementById("send-interrupt-btn");
const micBtn = document.getElementById("mic-btn");
const micStatusContainer = document.getElementById("mic-status-container");
const micStatusText = document.getElementById("mic-status-text");
const micLiveDot = document.getElementById("mic-live-dot");
const micEnergyText = document.getElementById("mic-energy-text");
const micMeterFill = document.getElementById("mic-meter-fill");
const micModeToggle = document.getElementById("mic-mode-toggle");
const gateSliderWrap = document.getElementById("gate-slider-wrap");
const gateSlider = document.getElementById("gate-slider");
const gateVal = document.getElementById("gate-val");
const micGateMarker = document.getElementById("mic-gate-marker");
const scrollBottomBtn = document.getElementById("scroll-bottom-btn");
const a2aStream = document.getElementById("a2a-stream");

// Persona Profiles
const AGENTS = {
  host: { name: "Sarah", role: "Host & Moderator", voice: "Rachel" },
  technologist: { name: "Charlie", role: "AI Accelerationist Hacker", voice: "Charlie" },
  ethicist: { name: "Roger", role: "AI Safety & Governance Scholar", voice: "Roger" }
};

// ============================================================================
// 1. WEBSOCKET REAL-TIME SYNC
// ============================================================================
function connectWebSocket() {
  try {
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      if (sessionStatusEl) sessionStatusEl.textContent = "128 kbps • Live Studio";
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleServerEvent(payload);
      } catch (e) {
        console.log("WS message error:", e);
      }
    };

    socket.onclose = () => {
      if (sessionStatusEl) sessionStatusEl.textContent = "Reconnecting...";
      setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
      console.warn("WebSocket status note:", err);
    };
  } catch (err) {
    console.warn("WS init error:", err);
  }
}

// Handle Server Events
// Audio & State Flags
let isAudioPlaying = false;
let nextTurnTimer = null;
let lastProcessedTurnContent = "";

function handleServerEvent(event) {
  const { type, data } = event;

  if (type === "connected") {
    syncState(data.state);
  } else if (type === "turn_started") {
    setOrbState("thinking", data.agent_id);
    appendTranscript(data);
  } else if (type === "turn_completed") {
    handleTurnPayload(data);
  } else if (type === "a2a_trace") {
    appendA2ATrace(data);
  } else if (type === "history_cleared") {
    clearChatUI();
    if (data && data.topic && currentTopicEl) {
      currentTopicEl.textContent = data.topic;
    }
  } else if (type === "human_interruption") {
    // Cut off current playing audio immediately (< 30ms)
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
    isAudioPlaying = false;
    isProcessingTurn = true; // Lock turn execution while interruption processes
    if (nextTurnTimer) {
      clearTimeout(nextTurnTimer);
      nextTurnTimer = null;
    }
    setOrbState("listening", null);

    // Keep dropdown on "all" so debate auto-rotation continues naturally!
    if (interruptTarget) {
      interruptTarget.value = "all";
    }

    appendTranscript({
      sender: "Audience (Human Interruption)",
      role: `Directing to ${data.routed_to || "Roundtable"}`,
      content: data.text,
      isInterruption: true
    });
  } else if (type === "topic_updated") {
    if (currentTopicEl) currentTopicEl.textContent = data.topic;
    updateActiveTopicPill(data.topic);
    if (data.cleared) {
      clearChatUI();
    }
  }
}

function clearChatUI() {
  if (transcriptFeed) {
    transcriptFeed.innerHTML = `
      <div class="chat-empty-state" id="chat-empty-state">
        <div class="empty-glyph">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
        </div>
        <h4>Studio Standby — 3 AI Personas Ready</h4>
        <p>Click <strong>Start Autonomous Roundtable</strong> to begin the debate, or speak aloud anytime to interrupt Sarah, Charlie, or Roger.</p>
      </div>
    `;
  }
  if (a2aStream) a2aStream.innerHTML = '<div class="a2a-empty">A2A message frames will appear here during active dialogue.</div>';
  if (turnCountEl) turnCountEl.textContent = "0 Turns";
  lastProcessedTurnContent = "";
  isAudioPlaying = false;
  isProcessingTurn = false;
  if (nextTurnTimer) {
    clearTimeout(nextTurnTimer);
    nextTurnTimer = null;
  }
  setOrbState("idle", null);
  if (micStatusText) micStatusText.textContent = "🎙️ History cleared. Ready for fresh debate!";
}

// Unified Turn Handler
function handleTurnPayload(payload) {
  if (!payload || !payload.content) return;
  const turnKey = payload.content.trim();
  if (lastProcessedTurnContent === turnKey) return; // Prevent double trigger
  lastProcessedTurnContent = turnKey;

  // Guarantee transcript bubble is rendered in chat!
  appendTranscript(payload);

  // Clear any existing turn timer
  if (nextTurnTimer) {
    clearTimeout(nextTurnTimer);
    nextTurnTimer = null;
  }

  if (payload.audio_base64) {
    setOrbState("talking", payload.agent_id);
    playAudioBase64(payload.audio_base64, () => {
      setOrbState("idle", null);
      isProcessingTurn = false;
      isAudioPlaying = false;
      isInterruptionInFlight = false;
      if (isRunning) {
        // Natural 1.4s conversational pause before next panelist speaks
        nextTurnTimer = setTimeout(triggerNextTurn, 1400);
      }
    });
  } else {
    // If no audio (or fallback), hold speaking state for 2.5s then continue
    setOrbState("talking", payload.agent_id);
    setTimeout(() => {
      setOrbState("idle", null);
      isProcessingTurn = false;
      isAudioPlaying = false;
      isInterruptionInFlight = false;
      if (isRunning) {
        nextTurnTimer = setTimeout(triggerNextTurn, 1400);
      }
    }, 2500);
  }
}

// Play Audio with Full State Tracking
function playAudioBase64(base64Data, onEndCallback) {
  try {
    const audioSrc = "data:audio/mpeg;base64," + base64Data;
    audioPlayer.src = audioSrc;

    let endedCalled = false;
    const callEndOnce = () => {
      if (!endedCalled) {
        endedCalled = true;
        isAudioPlaying = false;
        if (onEndCallback) onEndCallback();
      }
    };

    audioPlayer.onended = callEndOnce;
    audioPlayer.onpause = () => {
      if (audioPlayer.currentTime === 0 || audioPlayer.ended) {
        isAudioPlaying = false;
      }
    };
    audioPlayer.onerror = (e) => {
      console.warn("Audio element error:", e);
      callEndOnce();
    };

    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          isAudioPlaying = true;
        })
        .catch(e => {
          console.warn("Audio play gesture note:", e);
          isAudioPlaying = false;
          setTimeout(callEndOnce, 2500);
        });
    }
  } catch (err) {
    console.error("Audio error:", err);
    isAudioPlaying = false;
    if (onEndCallback) onEndCallback();
  }
}

// Audio Scrubber Tracking
audioPlayer.addEventListener("timeupdate", () => {
  if (audioPlayer.duration && !isNaN(audioPlayer.duration)) {
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    if (playbackProgress) playbackProgress.style.width = `${progress}%`;
    if (currentTimeEl) {
      const mins = Math.floor(audioPlayer.currentTime / 60);
      const secs = Math.floor(audioPlayer.currentTime % 60);
      currentTimeEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  }
});

// ============================================================================
// 2. ORB & PANELIST STATE MACHINE
// ============================================================================
function setOrbState(state, agentId) {
  [pillIdle, pillListening, pillTalking].forEach(p => p && p.classList.remove("active"));
  [panelistHost, panelistTech, panelistEthic].forEach(el => el && el.classList.remove("active-speaking"));

  if (window.particleSphere) {
    window.particleSphere.setState(state, agentId);
  }

  if (state === "talking") {
    if (pillTalking) pillTalking.classList.add("active");
    if (currentActiveTag) {
      currentActiveTag.textContent = "TALKING";
      currentActiveTag.style.color = "#FF6B4A";
    }
    if (mainOrb) mainOrb.classList.add("talking");
    if (waveformBars) waveformBars.classList.add("active");
    if (telemetryBox) telemetryBox.classList.add("active");

    const agent = AGENTS[agentId] || { name: "Sarah", role: "Host & Moderator", voice: "Rachel" };
    if (orbSpeakerName) orbSpeakerName.textContent = agent.name;
    if (orbSpeakerRole) orbSpeakerRole.textContent = agent.role;
    if (orbSpeakerBadge) orbSpeakerBadge.textContent = `${agent.name} (Active Speaker)`;
    if (speakerStatusCaption) speakerStatusCaption.textContent = `${agent.name} Speaking`;

    if (agentId === "host" && panelistHost) panelistHost.classList.add("active-speaking");
    else if (agentId === "technologist" && panelistTech) panelistTech.classList.add("active-speaking");
    else if (agentId === "ethicist" && panelistEthic) panelistEthic.classList.add("active-speaking");

  } else if (state === "thinking") {
    if (pillListening) pillListening.classList.add("active");
    if (currentActiveTag) {
      currentActiveTag.textContent = "THINKING";
      currentActiveTag.style.color = "#F59E0B";
    }
    if (mainOrb) mainOrb.classList.remove("talking");
    if (waveformBars) waveformBars.classList.remove("active");
    if (telemetryBox) telemetryBox.classList.remove("active");

    const agent = AGENTS[agentId] || { name: "Agent", role: "Synthesizing" };
    if (orbSpeakerName) orbSpeakerName.textContent = agent.name;
    if (orbSpeakerRole) orbSpeakerRole.textContent = "Formulating response...";
    if (orbSpeakerBadge) orbSpeakerBadge.textContent = `${agent.name} Reasoning...`;
    if (speakerStatusCaption) speakerStatusCaption.textContent = `${agent.name} Reasoning...`;

  } else if (state === "listening") {
    if (pillListening) pillListening.classList.add("active");
    if (currentActiveTag) {
      currentActiveTag.textContent = "LISTENING";
      currentActiveTag.style.color = "#10B981";
    }
    if (mainOrb) mainOrb.classList.remove("talking");
    if (waveformBars) waveformBars.classList.remove("active");
    if (telemetryBox) telemetryBox.classList.add("active");
    if (orbSpeakerName) orbSpeakerName.textContent = "Audience";
    if (orbSpeakerRole) orbSpeakerRole.textContent = "Listening to your voice...";
    if (orbSpeakerBadge) orbSpeakerBadge.textContent = "Human Barge-In Active";
    if (speakerStatusCaption) speakerStatusCaption.textContent = "User Speaking";

  } else {
    // Idle
    if (pillIdle) pillIdle.classList.add("active");
    if (currentActiveTag) {
      currentActiveTag.textContent = "IDLE";
      currentActiveTag.style.color = "#968F85";
    }
    if (mainOrb) mainOrb.classList.remove("talking");
    if (waveformBars) waveformBars.classList.remove("active");
    if (telemetryBox) telemetryBox.classList.remove("active");
    if (orbSpeakerBadge) orbSpeakerBadge.textContent = "Studio Ready";
    if (speakerStatusCaption) {
      speakerStatusCaption.textContent = isRunning ? "Waiting for turn" : "Studio Ready";
    }
  }
}

// ============================================================================
// 3. TRANSCRIPT & MESSAGE BUBBLES
// ============================================================================
function appendTranscript(turn) {
  if (!transcriptFeed || !turn || !turn.content) return;

  const emptyState = transcriptFeed.querySelector("#chat-empty-state");
  if (emptyState) emptyState.remove();

  // Prevent duplicate rendering of identical text
  const cleanContent = turn.content.trim();
  const existingBubbles = transcriptFeed.querySelectorAll(".msg-bubble");
  for (let i = 0; i < existingBubbles.length; i++) {
    const textEl = existingBubbles[i].querySelector(".agent-text") || existingBubbles[i];
    if (textEl && textEl.textContent.trim() === cleanContent) {
      return; // Already rendered!
    }
  }

  const bubble = document.createElement("div");

  if (turn.isInterruption || turn.sender?.includes("Audience")) {
    bubble.className = "msg-bubble user-msg";
    bubble.innerHTML = `
      <div style="font-size: 10.5px; opacity: 0.8; margin-bottom: 2px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Audience Interruption</div>
      <div>${turn.content}</div>
    `;
  } else {
    const agentKey = (turn.agent_id || "").toLowerCase();
    let borderColor = "#FF8A65";
    let avatarGradient = "linear-gradient(135deg, #FF8A65, #FF5A36)";
    if (agentKey.includes("tech") || turn.sender?.includes("Charlie")) {
      borderColor = "#F59E0B";
      avatarGradient = "linear-gradient(135deg, #FBBF24, #F59E0B)";
    } else if (agentKey.includes("ethic") || turn.sender?.includes("Roger")) {
      borderColor = "#3B82F6";
      avatarGradient = "linear-gradient(135deg, #60A5FA, #2563EB)";
    }

    bubble.className = "msg-bubble agent-msg";
    bubble.style.borderLeftColor = borderColor;
    bubble.innerHTML = `
      <div class="agent-avatar" style="background: ${avatarGradient};">
        <span style="color: #FFF; font-size: 11px; font-weight: 700;">${(turn.sender || "A")[0]}</span>
      </div>
      <div class="agent-content-box">
        <div class="agent-meta-header">
          <span class="agent-speaker-name">${turn.sender}</span>
          <span class="agent-speaker-role">${turn.role || ""}</span>
          ${turn.audio_base64 ? `<button class="audio-replay-btn" title="Replay voice audio" style="margin-left: auto; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 9999px; padding: 2.5px 8px; font-size: 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--text-secondary);"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Replay</button>` : ''}
        </div>
        <div class="agent-text">${turn.content}</div>
      </div>
    `;

    const replayBtn = bubble.querySelector(".audio-replay-btn");
    if (replayBtn && turn.audio_base64) {
      replayBtn.addEventListener("click", () => {
        setOrbState("talking", turn.agent_id || "host");
        playAudioBase64(turn.audio_base64, () => {
          setOrbState("idle", null);
        });
      });
    }
  }

  transcriptFeed.appendChild(bubble);
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;

  const count = transcriptFeed.querySelectorAll(".msg-bubble").length;
  if (turnCountEl) turnCountEl.textContent = `${count} Turns`;
}

// Append A2A Protocol Trace
function appendA2ATrace(trace) {
  if (!a2aStream) return;
  const empty = a2aStream.querySelector(".a2a-empty");
  if (empty) empty.remove();

  const intent = trace.intent || trace.message_type || "A2A";
  const intentColors = {
    CHALLENGE: "#EF4444",
    PROPOSAL: "#3B82F6",
    SYNTHESIZE: "#A855F7",
    AUDIENCE_CHALLENGE: "#10B981",
    OPEN_ROUNDTABLE: "#F59E0B",
    YIELD_FLOOR: "#6B7280"
  };
  const color = intentColors[intent] || "#60A5FA";

  const entry = document.createElement("div");
  entry.className = "a2a-entry";
  entry.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
      <span class="a2a-badge" style="border-color: ${color}; color: ${color}; font-weight: 600;">[${intent}]</span>
      <span style="font-size: 11px; color: #8E95A2; font-family: monospace;">${trace.sender_id} ➔ ${trace.receiver_id}</span>
    </div>
    ${trace.dimension ? `<div style="font-size: 12px; color: #F3F4F6; font-weight: 600; margin-bottom: 2px;">${trace.dimension}</div>` : ""}
    <div style="font-size: 11px; color: #9CA3AF; line-height: 1.4;">${trace.claim_summary || trace.content || ""}</div>
  `;

  a2aStream.appendChild(entry);
  a2aStream.scrollTop = a2aStream.scrollHeight;
}

// Sync Initial State
async function syncState(state) {
  if (!state) return;
  if (state.topic) {
    if (currentTopicEl) currentTopicEl.textContent = state.topic;
    updateActiveTopicPill(state.topic);
  }
  if (state.history && state.history.length > 0) {
    transcriptFeed.innerHTML = "";
    state.history.forEach(appendTranscript);
    if (turnCountEl) turnCountEl.textContent = `${state.history.length} Turns`;
  }
  if (state.a2a_traces && state.a2a_traces.length > 0) {
    a2aStream.innerHTML = "";
    state.a2a_traces.forEach(appendA2ATrace);
  }
}

// ============================================================================
// 4. MASTER CONTROLS & AUTONOMOUS ROUNDTABLE
// ============================================================================
async function triggerNextTurn() {
  if (isProcessingTurn) return;
  isProcessingTurn = true;
  if (nextTurnTimer) {
    clearTimeout(nextTurnTimer);
    nextTurnTimer = null;
  }

  try {
    if (nextTurnBtn) nextTurnBtn.disabled = true;
    setOrbState("thinking", "host");

    const res = await fetch(`${API_BASE}/api/turn/trigger`, { method: "POST" });
    const data = await res.json();
    if (data && data.turn) {
      handleTurnPayload({
        ...data.turn,
        audio_base64: data.audio_base64
      });
    }
  } catch (err) {
    console.error("Turn trigger error:", err);
    isProcessingTurn = false;
    setOrbState("idle", null);
    if (isRunning) nextTurnTimer = setTimeout(triggerNextTurn, 2500);
  } finally {
    if (nextTurnBtn) nextTurnBtn.disabled = false;
  }
}

async function toggleAutonomousDebate() {
  isRunning = !isRunning;
  if (isRunning) {
    if (startBtn) startBtn.classList.add("running");
    if (startBtnText) startBtnText.textContent = "Pause Autonomous Roundtable";
    if (startBtnIcon) {
      startBtnIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      `;
    }
    await startLiveHandsFreeListening();
    triggerNextTurn();
  } else {
    if (startBtn) startBtn.classList.remove("running");
    if (startBtnText) startBtnText.textContent = "Start Autonomous Roundtable";
    if (startBtnIcon) {
      startBtnIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 4 18 12 6 20 6 4"/>
        </svg>
      `;
    }
    isProcessingTurn = false;
    setOrbState("idle", null);
  }
}

// Send Text Interruption
async function sendInterruption() {
  const text = interruptText.value.trim();
  if (!text) return;
  const target = interruptTarget.value;
  const formData = new FormData();
  formData.append("text", text);
  if (target !== "all") formData.append("target_agent", target);
  // Auto-reset dropdown to "all" immediately so subsequent debate auto-rotates
  if (interruptTarget) interruptTarget.value = "all";

  interruptText.value = "";
  if (sendInterruptBtn) sendInterruptBtn.disabled = true;

  // Immediately stop AI speaker on interruption
  if (audioPlayer && !audioPlayer.paused) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }
  isAudioPlaying = false;
  isProcessingTurn = true;
  if (nextTurnTimer) {
    clearTimeout(nextTurnTimer);
    nextTurnTimer = null;
  }
  setOrbState("thinking", target !== "all" ? target : "host");

  try {
    const res = await fetch(`${API_BASE}/api/interrupt`, {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (data && data.response) {
      const turnPayload = {
        ...data.response,
        audio_base64: data.audio_base64 || data.response?.audio_base64
      };
      handleTurnPayload(turnPayload);
    }
  } catch (err) {
    console.error("Interruption error:", err);
    isProcessingTurn = false;
  } finally {
    if (sendInterruptBtn) sendInterruptBtn.disabled = false;
  }
}

// Clear History Action
async function handleClearHistory() {
  const confirmed = confirm("Are you sure you want to clear the entire chat history for a new debate?");
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE}/api/history/clear`, { method: "POST" });
    if (res.ok) {
      clearChatUI();
    }
  } catch (err) {
    console.error("Clear history error:", err);
  }
}

// ============================================================================
// 5. STUDIO VOICE ENGINE (HANDS-FREE AUTO-DETECT VAD & DUAL-ENGINE STT)
// ============================================================================
let micInputMode = "auto-vad"; // "auto-vad" (default hands-free) or "push-to-talk"
let vadGateThresholdPercent = 8;
let vadThreshold = 0.08;

let liveAudioContext = null;
let liveAnalyser = null;
let liveMicrophone = null;
let isSpeakingDetected = false;
let speechSilenceTimer = null;
let maxSpeechTimer = null;
let liveMediaRecorder = null;
let liveAudioChunks = [];
let isLiveMicActive = false;
let isManualRecording = false;
let isInterruptionInFlight = false;
let recordingStartTime = 0;

async function startLiveHandsFreeListening() {
  micInputMode = "auto-vad";
  if (micModeToggle) {
    micModeToggle.textContent = "Mode: Auto-Detect (Hands-Free)";
    micModeToggle.classList.add("vad-active");
  }
  if (gateSliderWrap) gateSliderWrap.style.display = "flex";
  if (micStatusText) micStatusText.textContent = "🎙️ Auto-Detect Active — Just speak aloud anytime to interrupt";
  await ensureMicStreamInitialized();
}

// Dual-Engine Browser Speech Recognition (Instant, Zero-Lag, Real-Time Preview)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let browserRecognizer = null;
let liveRecognizedText = "";

if (SpeechRecognition) {
  try {
    browserRecognizer = new SpeechRecognition();
    browserRecognizer.continuous = true;
    browserRecognizer.interimResults = true;
    browserRecognizer.lang = "en-US";

    browserRecognizer.onresult = (event) => {
      let finalStr = "";
      let interimStr = "";
      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalStr += " " + event.results[i][0].transcript;
        } else {
          interimStr += event.results[i][0].transcript;
        }
      }
      const combined = (finalStr + " " + interimStr).trim();
      if (combined) {
        liveRecognizedText = combined;
        // Real-time live visual speech preview in input & status bar!
        if (interruptText) interruptText.value = combined;
        if (micStatusText) micStatusText.textContent = `🎙️ Heard: "${combined}"`;
      }
    };

    browserRecognizer.onerror = (e) => {
      console.warn("Browser SpeechRecognition notice:", e.error);
    };
  } catch (err) {
    console.warn("SpeechRecognition init:", err);
  }
}

// Setup Noise Gate Marker position
if (micGateMarker) {
  micGateMarker.style.left = Math.min(95, Math.max(5, vadGateThresholdPercent * 4)) + "%";
}

// Mode Toggle Button Handler
if (micModeToggle) {
  micModeToggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (micInputMode === "push-to-talk") {
      micInputMode = "auto-vad";
      micModeToggle.textContent = "Mode: Auto-Detect (Hands-Free)";
      micModeToggle.classList.add("vad-active");
      if (gateSliderWrap) gateSliderWrap.style.display = "flex";
      if (micStatusText) micStatusText.textContent = "🎙️ Auto-Detect Active — Just speak aloud anytime to interrupt";
      await ensureMicStreamInitialized();
    } else {
      micInputMode = "push-to-talk";
      micModeToggle.textContent = "Mode: Push-To-Talk";
      micModeToggle.classList.remove("vad-active");
      if (gateSliderWrap) gateSliderWrap.style.display = "none";
      if (micStatusText) micStatusText.textContent = "🎙️ Push-to-Talk: Click Mic or hold Spacebar to speak";
    }
  });
}

// Noise Gate Sensitivity Slider Handler
if (gateSlider) {
  gateSlider.addEventListener("input", (e) => {
    vadGateThresholdPercent = parseInt(e.target.value, 10);
    vadThreshold = vadGateThresholdPercent / 100;
    if (gateVal) gateVal.textContent = vadGateThresholdPercent + "%";
    if (micGateMarker) {
      micGateMarker.style.left = Math.min(95, Math.max(5, vadGateThresholdPercent * 4)) + "%";
    }
  });
}

function startRecordingSession(isManual = false) {
  if (isInterruptionInFlight) return;
  recordingStartTime = Date.now();
  isSpeakingDetected = true;
  isManualRecording = isManual;
  liveRecognizedText = "";

  // Immediately mute/stop any actively speaking agent (< 20ms barge-in)
  if (audioPlayer && !audioPlayer.paused) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }
  isAudioPlaying = false;
  isProcessingTurn = true;
  if (nextTurnTimer) {
    clearTimeout(nextTurnTimer);
    nextTurnTimer = null;
  }
  setOrbState("listening", null);

  if (micLiveDot) {
    micLiveDot.classList.remove("active");
    micLiveDot.classList.add("recording");
  }
  if (micMeterFill) micMeterFill.classList.add("talking");
  if (micBtn) micBtn.classList.add("recording");
  if (micStatusText) {
    micStatusText.textContent = isManual 
      ? "🎙️ LISTENING... (Release Spacebar or click Mic when done)"
      : "🎙️ Listening to you... (speak naturally)";
  }

  // Start real-time browser speech recognizer
  if (browserRecognizer) {
    try {
      browserRecognizer.start();
    } catch (e) {}
  }

  liveAudioChunks = [];
  if (liveMediaRecorder && liveMediaRecorder.state === "inactive") {
    try {
      liveMediaRecorder.start(100);
    } catch (e) {
      console.warn("MediaRecorder start note:", e);
    }
  }

  // Safety hard-stop at 10 seconds
  if (maxSpeechTimer) clearTimeout(maxSpeechTimer);
  maxSpeechTimer = setTimeout(() => {
    stopAndSendRecording();
  }, 10000);
}

function stopAndSendRecording() {
  if (speechSilenceTimer) {
    clearTimeout(speechSilenceTimer);
    speechSilenceTimer = null;
  }
  if (maxSpeechTimer) {
    clearTimeout(maxSpeechTimer);
    maxSpeechTimer = null;
  }
  if (!isSpeakingDetected && !isManualRecording) return;
  isSpeakingDetected = false;
  isManualRecording = false;

  // Stop browser speech recognizer
  if (browserRecognizer) {
    try {
      browserRecognizer.stop();
    } catch (e) {}
  }

  if (micLiveDot) {
    micLiveDot.classList.remove("recording");
    micLiveDot.classList.add(isLiveMicActive ? "active" : "");
  }
  if (micMeterFill) micMeterFill.classList.remove("talking");
  if (micBtn) micBtn.classList.remove("recording");

  if (liveMediaRecorder && liveMediaRecorder.state === "recording") {
    try {
      liveMediaRecorder.stop();
    } catch (e) {
      console.warn("Recorder stop note:", e);
    }
  }
}

async function ensureMicStreamInitialized() {
  if (isLiveMicActive) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    isLiveMicActive = true;
    if (micLiveDot) micLiveDot.classList.add("active");
    if (micBtn) micBtn.classList.add("active-mic");

    liveAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (liveAudioContext.state === "suspended") {
      await liveAudioContext.resume();
    }

    liveAnalyser = liveAudioContext.createAnalyser();
    liveAnalyser.fftSize = 512;
    liveAnalyser.smoothingTimeConstant = 0.25;
    liveMicrophone = liveAudioContext.createMediaStreamSource(stream);
    liveMicrophone.connect(liveAnalyser);

    const timeData = new Float32Array(liveAnalyser.fftSize);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
      ? "audio/webm;codecs=opus" 
      : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/wav");

    function setupRecorder() {
      liveMediaRecorder = new MediaRecorder(stream, { mimeType });
      liveAudioChunks = [];

      liveMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          liveAudioChunks.push(e.data);
        }
      };

      liveMediaRecorder.onstop = async () => {
        const duration = Date.now() - recordingStartTime;
        const spokenCandidate = liveRecognizedText.trim();

        // Discard short audio (< 650ms) unless text was clearly recognized
        if (!spokenCandidate && (liveAudioChunks.length === 0 || (duration < 650 && !isManualRecording))) {
          if (micStatusText) {
            micStatusText.textContent = micInputMode === "auto-vad" 
              ? "🎙️ Ambient noise filtered" 
              : "🎙️ Hold Spacebar or click mic to speak (Push-To-Talk)";
          }
          liveAudioChunks = [];
          isProcessingTurn = false;
          setOrbState("idle", null);
          return;
        }

        const audioBlob = new Blob(liveAudioChunks, { type: mimeType });
        liveAudioChunks = [];

        if ((spokenCandidate || audioBlob.size > 400) && !isInterruptionInFlight) {
          isInterruptionInFlight = true;
          if (micStatusText) micStatusText.textContent = "⚡ Routing question to panelist...";
          const formData = new FormData();
          if (spokenCandidate) {
            formData.append("text", spokenCandidate);
          }
          if (audioBlob.size > 100) {
            formData.append("file", audioBlob, "interruption.webm");
          }
          const target = interruptTarget ? interruptTarget.value : "all";
          if (target !== "all") formData.append("target_agent", target);
          if (interruptTarget) interruptTarget.value = "all";

          try {
            const res = await fetch(`${API_BASE}/api/interrupt`, {
              method: "POST",
              body: formData
            });
            const data = await res.json();
            if (data.status === "silence" || !data.response || !data.response.content) {
              if (micStatusText) micStatusText.textContent = "🎙️ Filtered: No speech detected.";
              isInterruptionInFlight = false;
              isProcessingTurn = false;
              setOrbState("idle", null);
              setTimeout(() => {
                if (micStatusText) {
                  micStatusText.textContent = micInputMode === "auto-vad"
                    ? "🎙️ Hands-Free VAD Active — Speak clearly above noise gate!"
                    : "🎙️ Hold Spacebar or click mic to speak (Push-To-Talk)";
                }
              }, 2000);
              return;
            }

            if (micStatusText) {
              micStatusText.textContent = `🎙️ Heard: "${data.interruption}" ➔ ${data.response?.sender || 'Agent'} answering aloud`;
            }
            if (interruptText) interruptText.value = "";
            const turnPayload = {
              ...data.response,
              audio_base64: data.audio_base64 || data.response?.audio_base64
            };
            handleTurnPayload(turnPayload);
          } catch (err) {
            console.error("Live interruption error:", err);
            if (micStatusText) micStatusText.textContent = "Interruption error occurred.";
            isProcessingTurn = false;
            setOrbState("idle", null);
          } finally {
            setTimeout(() => { isInterruptionInFlight = false; }, 2000);
          }
        } else {
          isProcessingTurn = false;
          setOrbState("idle", null);
        }
      };
    }

    setupRecorder();

    // High-Accuracy Time-Domain RMS Energy Loop
    function checkVoiceEnergy() {
      if (!isLiveMicActive) return;
      liveAnalyser.getFloatTimeDomainData(timeData);

      let sumSquares = 0;
      for (let i = 0; i < timeData.length; i++) {
        sumSquares += timeData[i] * timeData[i];
      }
      const rms = Math.sqrt(sumSquares / timeData.length);

      // Visual VU Meter Display (0% to 100%)
      const displayPercent = Math.min(100, Math.max(0, Math.round(rms * 400)));
      if (micMeterFill) micMeterFill.style.width = `${displayPercent}%`;
      if (micEnergyText) micEnergyText.textContent = `${displayPercent}%`;
      if (window.particleSphere) window.particleSphere.setAudioEnergy(rms);

      // Hands-Free Auto-VAD Voice Triggering
      if (micInputMode === "auto-vad" && !isManualRecording && !isInterruptionInFlight) {
        // When AI speaker audio is playing, require slight headroom to filter speaker echo
        const effectiveThreshold = isAudioPlaying ? Math.max(0.12, vadThreshold * 1.5) : vadThreshold;

        if (rms > effectiveThreshold) {
          if (!isSpeakingDetected) {
            setupRecorder();
            startRecordingSession(false);
          }
          if (speechSilenceTimer) {
            clearTimeout(speechSilenceTimer);
            speechSilenceTimer = null;
          }
        } else if (isSpeakingDetected && rms < (vadThreshold * 0.70)) {
          if (!speechSilenceTimer) {
            speechSilenceTimer = setTimeout(() => {
              stopAndSendRecording();
            }, 850);
          }
        }
      }

      requestAnimationFrame(checkVoiceEnergy);
    }

    checkVoiceEnergy();
    return true;
  } catch (err) {
    console.warn("Microphone access error:", err);
    if (micStatusText) micStatusText.textContent = "⚠️ Please click 'Allow' on the microphone prompt.";
    return false;
  }
}

// PUSH-TO-TALK SPACEBAR SHORTCUT (Default & 100% Noise-Immune)
window.addEventListener("keydown", async (e) => {
  if (e.code === "Space" && e.target !== interruptText && !isManualRecording) {
    e.preventDefault();
    await ensureMicStreamInitialized();
    startRecordingSession(true);
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && isManualRecording) {
    e.preventDefault();
    stopAndSendRecording();
  }
});

// Mic Button: Supports both Click to Toggle and Hold to Talk!
let micBtnHoldTimer = null;
if (micBtn) {
  micBtn.addEventListener("mousedown", async (e) => {
    e.stopPropagation();
    await ensureMicStreamInitialized();
    micBtnHoldTimer = setTimeout(() => {
      // User is holding down the button
      if (!isManualRecording) {
        startRecordingSession(true);
      }
    }, 200);
  });

  micBtn.addEventListener("mouseup", (e) => {
    e.stopPropagation();
    if (micBtnHoldTimer) {
      clearTimeout(micBtnHoldTimer);
      micBtnHoldTimer = null;
    }
    if (isManualRecording) {
      stopAndSendRecording();
    }
  });

  micBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await ensureMicStreamInitialized();
    if (isSpeakingDetected || isManualRecording) {
      stopAndSendRecording();
    } else {
      startRecordingSession(true);
    }
  });
}

// Master Controls
if (startBtn) startBtn.addEventListener("click", toggleAutonomousDebate);
if (nextTurnBtn) nextTurnBtn.addEventListener("click", triggerNextTurn);
if (sendInterruptBtn) sendInterruptBtn.addEventListener("click", sendInterruption);
if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", handleClearHistory);

if (interruptText) {
  interruptText.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendInterruption();
  });
}

// Scroll to bottom button
if (scrollBottomBtn) {
  scrollBottomBtn.addEventListener("click", () => {
    transcriptFeed.scrollTo({ top: transcriptFeed.scrollHeight, behavior: "smooth" });
  });
}

// ============================================================================
// 6. CURATED TOPIC PRESETS & QUICK SWITCHER
// ============================================================================
const TOPIC_ICONS = {
  "open-source ai": "⚡",
  "public transit": "🚆",
  "universal basic income": "💰",
  "brain-computer interfaces": "🧠",
  "nuclear fusion": "⚛️",
  "synthetic media": "🎭"
};

function updateActiveTopicPill(activeTitle) {
  if (!topicPresetsList) return;
  const pills = topicPresetsList.querySelectorAll(".topic-preset-pill");
  pills.forEach(pill => {
    const pillTopic = pill.getAttribute("data-topic");
    if (pillTopic && activeTitle && (activeTitle.includes(pillTopic) || pillTopic.includes(activeTitle))) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
  });
}

async function loadTopicPresets() {
  if (!topicPresetsList) return;
  try {
    const res = await fetch(`${API_BASE}/api/topics`);
    if (!res.ok) return;
    const data = await res.json();
    const topics = data.topics || [];
    topicPresetsList.innerHTML = "";

    const currentTitle = currentTopicEl ? currentTopicEl.textContent.trim() : "";

    topics.forEach(t => {
      const btn = document.createElement("button");
      btn.className = "topic-preset-pill";
      btn.setAttribute("data-topic", t.title);
      btn.title = `${t.title} (${t.battlegrounds_count} debate dimensions)`;

      const icon = TOPIC_ICONS[t.key] || "💡";
      // Extract short punchy title before the colon
      const shortTitle = t.title.split(":")[0];

      if (currentTitle && (currentTitle.includes(t.title) || t.title.includes(currentTitle))) {
        btn.classList.add("active");
      }

      btn.innerHTML = `
        <span class="preset-icon">${icon}</span>
        <span>${shortTitle}</span>
      `;

      btn.addEventListener("click", async () => {
        if (currentTopicEl && currentTopicEl.textContent.trim() === t.title.trim()) {
          return;
        }

        const shouldClear = confirm(`Switch debate topic to:\n"${t.title}"\n\nStart fresh roundtable debate for this topic?`);
        if (!shouldClear) return;

        const fd = new FormData();
        fd.append("topic", t.title);
        fd.append("clear_history", "true");

        try {
          const resp = await fetch(`${API_BASE}/api/topic`, { method: "POST", body: fd });
          if (resp.ok) {
            if (currentTopicEl) currentTopicEl.textContent = t.title;
            clearChatUI();
            updateActiveTopicPill(t.title);
          }
        } catch (e) {
          console.error("Topic switch error:", e);
        }
      });

      topicPresetsList.appendChild(btn);
    });
  } catch (err) {
    console.warn("Failed to load topic presets:", err);
  }
}

// Custom Topic Prompt with Clear Option
if (changeTopicBtn) {
  changeTopicBtn.addEventListener("click", async () => {
    const current = currentTopicEl ? currentTopicEl.textContent : "";
    const newTopic = prompt("Enter new custom debate topic brief:", current);
    if (newTopic && newTopic.trim()) {
      const shouldClear = confirm("Do you want to clear chat history for this new debate topic?");
      const fd = new FormData();
      fd.append("topic", newTopic.trim());
      fd.append("clear_history", shouldClear ? "true" : "false");
      await fetch(`${API_BASE}/api/topic`, { method: "POST", body: fd });
      if (shouldClear) {
        clearChatUI();
      }
    }
  });
}

// State preview pills
if (pillIdle) pillIdle.addEventListener("click", () => setOrbState("idle", null));
if (pillListening) pillListening.addEventListener("click", () => setOrbState("thinking", "host"));
if (pillTalking) pillTalking.addEventListener("click", () => setOrbState("talking", "host"));

// Clicking a panelist card targets them for questions
if (panelistHost) panelistHost.addEventListener("click", () => { if (interruptTarget) interruptTarget.value = "host"; });
if (panelistTech) panelistTech.addEventListener("click", () => { if (interruptTarget) interruptTarget.value = "technologist"; });
if (panelistEthic) panelistEthic.addEventListener("click", () => { if (interruptTarget) interruptTarget.value = "ethicist"; });

// Initialize Studio
connectWebSocket();
loadTopicPresets();
fetch(`${API_BASE}/api/state`).then(r => r.json()).then(syncState);

// Auto-activate hands-free listening on first user interaction anywhere in studio
document.addEventListener("click", () => {
  if (!isLiveMicActive && micInputMode === "auto-vad") {
    ensureMicStreamInitialized();
  }
}, { once: true });

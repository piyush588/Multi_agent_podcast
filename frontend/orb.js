/**
 * ElevenLabs Interactive Voice Particle Sphere Visualizer
 * High-performance HTML5 Canvas audio-reactive particle sphere with
 * organic fluid membrane, harmonic waveform deformation, and dynamic
 * voice particle bursts inspired by ElevenLabs Conversational AI.
 */

class ElevenLabsParticleSphere {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    this.state = "idle"; // "idle" | "thinking" | "talking" | "listening"
    this.activeAgent = "host"; // "host" | "technologist" | "ethicist" | "audience"
    
    // Core dimensions
    this.width = 220;
    this.height = 220;
    this.dpr = window.devicePixelRatio || 1;
    this.setupCanvas();

    // Harmonic membrane parameters
    this.baseRadius = 46;
    this.currentRadius = 46;
    this.targetRadius = 46;
    this.energy = 0;
    this.targetEnergy = 0;
    this.time = 0;

    // Particle Swarm
    this.particleCount = 120;
    this.particles = [];
    this.shockwaves = [];
    this.initParticles();

    // Mouse Interaction
    this.mouse = { x: this.width / 2, y: this.height / 2, active: false };
    this.setupMouseEvents();

    // Color Palettes (Whitish Skin / Warm Champagne & Voice Character Themes)
    this.palettes = {
      idle: {
        coreInner: "rgba(255, 248, 242, 0.98)",
        coreMid: "rgba(250, 226, 210, 0.85)",
        coreOuter: "rgba(235, 198, 175, 0.45)",
        glow: "rgba(240, 205, 185, 0.35)",
        particleA: "#FAD8C0",
        particleB: "#E8B896",
        particleC: "#D29875",
        accent: "#C68765"
      },
      host: { // Sarah (Warm Champagne Rose & Peach)
        coreInner: "rgba(255, 246, 240, 0.98)",
        coreMid: "rgba(255, 214, 195, 0.92)",
        coreOuter: "rgba(255, 138, 101, 0.75)",
        glow: "rgba(255, 107, 74, 0.45)",
        particleA: "#FFD4C2",
        particleB: "#FF8A65",
        particleC: "#FF5722",
        accent: "#FF6B4A"
      },
      technologist: { // Charlie (Electric Golden Amber & Warm Apricot)
        coreInner: "rgba(255, 250, 238, 0.98)",
        coreMid: "rgba(254, 225, 170, 0.92)",
        coreOuter: "rgba(245, 158, 11, 0.75)",
        glow: "rgba(245, 158, 11, 0.45)",
        particleA: "#FED7AA",
        particleB: "#FBBF24",
        particleC: "#F59E0B",
        accent: "#D97706"
      },
      ethicist: { // Roger (Refined Slate Champagne & Glacier Azure)
        coreInner: "rgba(248, 250, 255, 0.98)",
        coreMid: "rgba(215, 232, 255, 0.92)",
        coreOuter: "rgba(96, 165, 250, 0.75)",
        glow: "rgba(59, 130, 246, 0.40)",
        particleA: "#BFDBFE",
        particleB: "#60A5FA",
        particleC: "#3B82F6",
        accent: "#2563EB"
      },
      audience: { // Listener Interruption (Vibrant Warm Rose & Coral)
        coreInner: "rgba(255, 242, 246, 0.98)",
        coreMid: "rgba(254, 205, 220, 0.92)",
        coreOuter: "rgba(244, 63, 94, 0.75)",
        glow: "rgba(244, 63, 94, 0.45)",
        particleA: "#FECDD3",
        particleB: "#FB7185",
        particleC: "#F43F5E",
        accent: "#E11D48"
      }
    };

    // Procedural voice cadence generator for ultra-natural speech animation
    this.voiceSyllableTimer = 0;
    this.voiceSyllableDuration = 220;
    this.voiceTargetSyllable = 0;

    // Animation Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupCanvas() {
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  initParticles() {
    this.particles = [];
    const cx = this.width / 2;
    const cy = this.height / 2;

    for (let i = 0; i < this.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = this.baseRadius + 8 + Math.random() * 55;
      const speed = (0.004 + Math.random() * 0.009) * (Math.random() > 0.5 ? 1 : -1);
      const size = 1.2 + Math.random() * 2.4;
      const alpha = 0.25 + Math.random() * 0.65;

      this.particles.push({
        x: cx + Math.cos(angle) * distance,
        y: cy + Math.sin(angle) * distance,
        originDist: distance,
        angle: angle,
        orbitSpeed: speed,
        size: size,
        alpha: alpha,
        baseAlpha: alpha,
        pulseSpeed: 0.02 + Math.random() * 0.04,
        pulseOffset: Math.random() * Math.PI * 2,
        isBurst: false,
        vx: 0,
        vy: 0,
        drag: 0.92,
        life: 1,
        colorType: i % 3 === 0 ? "A" : (i % 3 === 1 ? "B" : "C")
      });
    }
  }

  setupMouseEvents() {
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.active = true;
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.mouse.active = false;
      this.mouse.x = this.width / 2;
      this.mouse.y = this.height / 2;
    });

    this.canvas.addEventListener("click", () => {
      this.triggerShockwave(0.9);
      this.triggerBurst(28);
    });
  }

  triggerShockwave(strength = 1) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    this.shockwaves.push({
      x: cx,
      y: cy,
      r: this.currentRadius * 0.85,
      maxR: this.width * 0.56,
      alpha: 0.8 * strength,
      speed: 2.2 + strength * 2.0
    });
  }

  triggerBurst(count = 20) {
    const cx = this.width / 2;
    const cy = this.height / 2;

    for (let i = 0; i < count; i++) {
      const p = this.particles[Math.floor(Math.random() * this.particles.length)];
      if (!p) continue;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.4 + Math.random() * 4.5;
      p.isBurst = true;
      p.x = cx + Math.cos(angle) * this.currentRadius;
      p.y = cy + Math.sin(angle) * this.currentRadius;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 1.0;
      p.alpha = 0.95;
    }
  }

  setState(state, agentId = null) {
    this.state = state;
    if (agentId) {
      if (agentId.includes("host") || agentId === "sarah") this.activeAgent = "host";
      else if (agentId.includes("tech") || agentId === "charlie") this.activeAgent = "technologist";
      else if (agentId.includes("ethic") || agentId === "roger") this.activeAgent = "ethicist";
      else if (agentId.includes("audience") || agentId === "user") this.activeAgent = "audience";
      else this.activeAgent = "host";
    }

    if (state === "talking") {
      this.targetRadius = 55;
      this.triggerShockwave(0.8);
      this.triggerBurst(30);
    } else if (state === "thinking") {
      this.targetRadius = 42;
    } else if (state === "listening") {
      this.activeAgent = "audience";
      this.targetRadius = 50;
    } else {
      // Idle
      this.targetRadius = 46;
      this.targetEnergy = 0.05;
    }
  }

  setAudioEnergy(rms) {
    // Direct audio hook (RMS energy 0.0 - 1.0)
    if (this.state === "talking" || this.state === "listening") {
      this.targetEnergy = Math.min(1.0, Math.max(0.08, rms * 2.5));
    }
  }

  getPalette() {
    if (this.state === "idle") return this.palettes.idle;
    if (this.state === "listening") return this.palettes.audience;
    return this.palettes[this.activeAgent] || this.palettes.host;
  }

  update(dt) {
    this.time += dt;

    // Natural speech cadence simulation if in talking state
    if (this.state === "talking") {
      this.voiceSyllableTimer += dt * 1000;
      if (this.voiceSyllableTimer > this.voiceSyllableDuration) {
        this.voiceSyllableTimer = 0;
        this.voiceSyllableDuration = 140 + Math.random() * 260; // 140ms - 400ms phonemes
        // Alternating strong and light syllables
        this.voiceTargetSyllable = Math.random() > 0.15 
          ? 0.45 + Math.random() * 0.55 
          : 0.12 + Math.random() * 0.15; // micro-pause
        
        if (this.voiceTargetSyllable > 0.72) {
          this.triggerBurst(6);
          if (Math.random() > 0.4) this.triggerShockwave(0.65);
        }
      }
      this.targetEnergy = this.voiceTargetSyllable;
    } else if (this.state === "thinking") {
      this.targetEnergy = 0.28 + Math.sin(this.time * 6) * 0.15;
    } else if (this.state === "listening") {
      this.targetEnergy = Math.max(this.targetEnergy, 0.35 + Math.sin(this.time * 4) * 0.18);
    } else {
      this.targetEnergy = 0.06 + Math.sin(this.time * 1.5) * 0.04;
    }

    // Smooth lerp radius & energy
    this.energy += (this.targetEnergy - this.energy) * 0.18;
    this.currentRadius += (this.targetRadius - this.currentRadius) * 0.12;

    const cx = this.width / 2;
    const cy = this.height / 2;

    // Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r += sw.speed;
      sw.alpha -= 0.024;
      if (sw.alpha <= 0 || sw.r >= sw.maxR) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Update Particles
    const palette = this.getPalette();
    const speedMultiplier = this.state === "thinking" ? 2.4 : (this.state === "talking" ? 1.6 : 1.0);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      if (p.isBurst) {
        // Burst physics
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.life -= 0.022;
        p.alpha = Math.max(0, p.life * 0.9);

        // When burst fades out, smoothly return to orbit
        if (p.life <= 0) {
          p.isBurst = false;
          p.angle = Math.random() * Math.PI * 2;
          p.originDist = this.currentRadius + 12 + Math.random() * 45;
          p.alpha = p.baseAlpha;
        }
      } else {
        // Orbit physics
        p.angle += p.orbitSpeed * speedMultiplier;

        // Radial oscillation
        const radialWave = Math.sin(this.time * 2 + p.pulseOffset) * (6 + this.energy * 22);
        const targetDist = this.currentRadius + p.originDist * 0.65 + radialWave;

        // Attract towards mouse if hovering nearby
        let targetX = cx + Math.cos(p.angle) * targetDist;
        let targetY = cy + Math.sin(p.angle) * targetDist;

        if (this.mouse.active) {
          const dx = this.mouse.x - targetX;
          const dy = this.mouse.y - targetY;
          const distMouse = Math.sqrt(dx * dx + dy * dy);
          if (distMouse < 90) {
            const pull = (1 - distMouse / 90) * 16;
            targetX += (dx / distMouse) * pull;
            targetY += (dy / distMouse) * pull;
          }
        }

        p.x += (targetX - p.x) * 0.12;
        p.y += (targetY - p.y) * 0.12;
        p.alpha = p.baseAlpha * (0.6 + Math.sin(this.time * 3 + p.pulseOffset) * 0.4) + this.energy * 0.35;
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const palette = this.getPalette();

    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Ambient Background Skin Glow (Atmospheric light aura)
    const glowRadius = this.currentRadius * (1.7 + this.energy * 0.6);
    const ambientGlow = ctx.createRadialGradient(cx, cy, this.currentRadius * 0.3, cx, cy, glowRadius);
    ambientGlow.addColorStop(0, palette.glow);
    ambientGlow.addColorStop(0.6, "rgba(255, 235, 222, 0.12)");
    ambientGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = ambientGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Expanding Acoustic Shockwave Rings
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = sw.alpha * 0.65;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Fluid Harmonic Membrane (Organic Voice Sphere)
    const segments = 64;
    const effectiveRadius = this.currentRadius + this.energy * 14;

    ctx.save();
    ctx.beginPath();

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;

      // Harmonic sine ripples based on voice energy
      const rippleA = Math.sin(theta * 3 + this.time * 3.2) * (2.8 + this.energy * 9.5);
      const rippleB = Math.cos(theta * 5 - this.time * 4.1) * (1.8 + this.energy * 6.2);
      const rippleC = Math.sin(theta * 8 + this.time * 2.0) * (0.8 + this.energy * 3.5);
      const r = effectiveRadius + rippleA + rippleB + rippleC;

      const px = cx + Math.cos(theta) * r;
      const py = cy + Math.sin(theta) * r;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // Core gradient fill: Skin tone warmth to vibrant voice rim
    const coreGrad = ctx.createRadialGradient(
      cx - effectiveRadius * 0.22,
      cy - effectiveRadius * 0.22,
      effectiveRadius * 0.1,
      cx,
      cy,
      effectiveRadius * 1.15
    );
    coreGrad.addColorStop(0, palette.coreInner);
    coreGrad.addColorStop(0.45, palette.coreMid);
    coreGrad.addColorStop(0.85, palette.coreOuter);
    coreGrad.addColorStop(1, palette.accent);

    ctx.fillStyle = coreGrad;
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 18 + this.energy * 24;
    ctx.fill();

    // Subtle glassy specular highlight reflection on top of sphere
    const highlightGrad = ctx.createLinearGradient(
      cx,
      cy - effectiveRadius,
      cx,
      cy + effectiveRadius * 0.3
    );
    highlightGrad.addColorStop(0, "rgba(255, 255, 255, 0.7)");
    highlightGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.12)");
    highlightGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = highlightGrad;
    ctx.fill();
    ctx.restore();

    // 4. Voice Particles (Swarm & Bursts)
    for (const p of this.particles) {
      ctx.save();
      let pColor = palette.particleB;
      if (p.colorType === "A") pColor = palette.particleA;
      else if (p.colorType === "C") pColor = palette.particleC;

      ctx.fillStyle = pColor;
      ctx.globalAlpha = Math.min(1.0, Math.max(0.08, p.alpha));

      ctx.beginPath();
      const currentSize = p.size * (1 + this.energy * 0.5);
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fill();

      // Soft glow for larger particles
      if (currentSize > 2.2) {
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  animate(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this.animate);
  }
}

// Global initialization
window.ElevenLabsParticleSphere = ElevenLabsParticleSphere;

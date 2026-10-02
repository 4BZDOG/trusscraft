/**
 * TRUSSCRAFT — PROCEDURAL AUDIO
 * Every sound is synthesised with the Web Audio API; nothing is loaded from the network.
 */

// ============================================================
//  PROCEDURAL AUDIO ENGINE (Web Audio API)
// ============================================================
class SoundSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.creakCooldown = 0;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get out() { return this.master || (this.ctx && this.ctx.destination); }

  tone(freq, dur, type = 'sine', vol = 0.1, slideTo = null, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.015, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.out);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise(dur, filterType, freq, vol, delay = 0, q = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3));
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.out);
    src.start(t);
  }

  playClick()  { this.tone(520, 0.05, 'square', 0.05, 120); }
  playPlace()  { this.tone(340, 0.07, 'triangle', 0.09, 620); }
  playErase()  { this.tone(300, 0.08, 'sawtooth', 0.05, 90); }
  playUI()     { this.tone(700, 0.04, 'sine', 0.05, 900); }
  playError()  { this.tone(180, 0.12, 'square', 0.07, 110); this.tone(120, 0.16, 'square', 0.05, 80, 0.05); }
  playThud()   { this.tone(70, 0.14, 'sine', 0.12, 42); this.noise(0.07, 'lowpass', 300, 0.12); }
  playSplash() { this.noise(0.45, 'lowpass', 900, 0.3); this.tone(340, 0.3, 'sine', 0.05, 90); }

  playSnap() {
    this.noise(0.18, 'bandpass', 1400, 0.42, 0, 1.4);
    this.tone(220, 0.22, 'sawtooth', 0.1, 55);
  }

  playCreak() {
    if (!this.ctx || Date.now() - this.creakCooldown < 320) return;
    this.creakCooldown = Date.now();
    this.tone(78 + Math.random() * 30, 0.22, 'sawtooth', 0.055, 170);
  }

  startEngine() {
    if (!this.ctx || this.engineOsc || !this.enabled) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    this.engineOsc.type = 'triangle';
    this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);
    this.engineGain.gain.setValueAtTime(0.045, this.ctx.currentTime);
    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(this.out);
    this.engineOsc.start();
  }

  updateEngine(speedRatio) {
    if (this.engineOsc && this.ctx) {
      const f = 45 + Math.min(60, speedRatio * 35);
      this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
    }
  }

  stopEngine() {
    if (this.engineOsc) {
      try {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        this.engineOsc.stop(this.ctx.currentTime + 0.3);
      } catch (e) { /* already stopped */ }
      this.engineOsc = null;
    }
  }

  /** Low-end body blow for a structural failure. */
  playRumble(power = 1) {
    if (!this.ctx || !this.enabled) return;
    this.noise(0.9, 'lowpass', 110 + 60 * power, 0.26 * power);
    this.tone(58, 0.85, 'sine', 0.15 * power, 26);
    this.tone(41, 1.1, 'triangle', 0.10 * power, 22, 0.05);
  }

  /** Rising metallic shriek as a big collapse starts. */
  playGroan() {
    if (!this.ctx || !this.enabled) return;
    this.tone(150, 0.55, 'sawtooth', 0.07, 420);
    this.noise(0.5, 'bandpass', 2200, 0.1, 0.05, 6);
  }

  playVictory() {
    const notes = [261.6, 329.6, 392.0, 523.3, 659.3];
    notes.forEach((f, i) => this.tone(f, 0.4, 'sine', 0.13, null, i * 0.1));
  }

  playFailure() {
    const notes = [392.0, 329.6, 261.6, 196.0];
    notes.forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.11, null, i * 0.14));
  }
}
const audio = new SoundSystem();

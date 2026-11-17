// WebAudio synth for SOLANO HEAT: no audio files, every sound is built
// from oscillators and filtered noise. The context is created on the first
// user gesture (the Start button), so autoplay rules never bite. Mute
// toggles the master gain; the engine and siren loops track game state.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  // Call from a user gesture. Safe to call twice.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);

    // Engine: a sawtooth through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // Siren: a square wave that alternates two tones on the game clock.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  // speed 0..1 (fraction of top speed), onFoot silences the engine.
  setEngine(speed, onFoot) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = onFoot ? 0 : 0.02 + speed * 0.075;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed * 165, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speed * 900, t, 0.1);
  }

  // Two-tone wail, stepped from the game clock so it stays deterministic.
  setSiren(on, clockT) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.028 : 0, t, 0.1);
    if (on) {
      const hi = Math.floor(clockT * 1.6) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 780 : 580, t, 0.05);
    }
  }

  // A short filtered-noise burst with a decaying envelope.
  _noiseBurst(duration, filterFreq, peak) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // A short tone with a pitch slide, for blips and jingles.
  _tone(freq, dur, type, peak, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  crash() {
    this._noiseBurst(0.28, 900, 0.5);
    this._tone(70, 0.22, 'sine', 0.4, 38);
  }

  gunshot() {
    this._noiseBurst(0.12, 2600, 0.42);
    this._tone(190, 0.08, 'square', 0.16, 70);
  }

  pickup() {
    this._tone(880, 0.09, 'sine', 0.22);
    setTimeout(() => this._tone(1318, 0.12, 'sine', 0.22), 80);
  }

  cash() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'triangle', 0.24), i * 90));
  }

  missionComplete() {
    [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.28, 'triangle', 0.26), i * 110));
  }

  busted() {
    [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this._tone(f, 0.32, 'sawtooth', 0.16), i * 150));
  }

  doorSlam() {
    this._noiseBurst(0.09, 500, 0.3);
    this._tone(120, 0.07, 'sine', 0.25, 60);
  }

  // A lazy sunset groove: a bass line and a soft pad, one step per call.
  // main.js calls musicStep() on a fixed beat from the game clock.
  musicStep(step) {
    if (!this.ctx) return;
    const bass = [55, 0, 65.41, 0, 49, 0, 58.27, 0, 55, 0, 65.41, 0, 82.41, 73.42, 65.41, 0];
    const note = bass[step % 16];
    if (note) this._tone(note, 0.42, 'triangle', 0.16);
    if (step % 4 === 0) this._tone(220 + (step % 8) * 11, 0.9, 'sine', 0.045);
  }

  stopMusic() {
    // Music is step-driven and stateless; nothing to stop.
  }
}

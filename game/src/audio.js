// Sound, all synthesized with WebAudio — no audio files, no network. Engine hum, sirens,
// gunshots, pickups and a small procedural bass loop. The context only starts after a user
// gesture (a key or a click), so the screenshot scenes stay silent and deterministic.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 750;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      lfo.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const BASS = [55, 0, 55, 65.4, 55, 0, 82.4, 73.4];
  function musicTick() {
    if (!ctx || muted) return;
    const freq = BASS[musicStep % BASS.length];
    musicStep += 1;
    if (freq > 0) blip(freq, 0.22, 'triangle', 0.16);
    if (musicStep % 2 === 0) noise(0.03, 0.05, 6000);
  }

  return {
    /** Call from any user gesture; starts the context and the music loop. */
    unlock() {
      if (ensure() && !musicTimer) {
        musicTimer = window.setInterval(musicTick, 240);
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() { return muted; },
    /** 0..1 speed of the player's car; 0 silences the engine. */
    engine(amount, inCar) {
      if (!ctx) return;
      const target = inCar ? 0.05 + amount * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + amount * 140, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    shot() { if (ensure()) noise(0.12, 0.5, 2800); },
    punch() { if (ensure()) blip(130, 0.12, 'sine', 0.5, 55); },
    pickup() { if (ensure()) { blip(660, 0.1, 'sine', 0.3); window.setTimeout(() => blip(990, 0.14, 'sine', 0.3), 90); } },
    crash() { if (ensure()) noise(0.25, 0.5, 500); },
    steal() { if (ensure()) blip(220, 0.15, 'square', 0.2, 440); },
    mission() {
      if (!ensure()) return;
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.18, 'triangle', 0.3), i * 110));
    },
    busted() { if (ensure()) { blip(440, 0.4, 'sawtooth', 0.25, 110); } },
  };
}

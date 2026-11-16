// Audio: everything synthesized with WebAudio, no asset files. Gunshots, hits, reloads,
// the spike's beeps, its burst, footsteps at close range, UI clicks. Created lazily after a
// user gesture; every call is safe before then.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext ?? window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function noiseBurst(duration, gain, filterFreq, type = 'lowpass') {
    if (!ensure()) return;
    const n = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter).connect(g).connect(master);
    src.start();
  }

  function tone(freq, duration, gain, type = 'square', slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    resume() { ensure(); ctx?.resume?.(); },
    shot(kind, near) {
      const v = near ? 0.5 : 0.16;
      if (kind === 'marksman') { noiseBurst(0.32, v * 1.4, 2600); tone(150, 0.2, v * 0.5, 'sawtooth', 60); }
      else if (kind === 'rifle') { noiseBurst(0.18, v, 3400); tone(190, 0.1, v * 0.4, 'sawtooth', 90); }
      else if (kind === 'smg') { noiseBurst(0.09, v * 0.8, 4200); tone(240, 0.05, v * 0.3, 'square', 140); }
      else { noiseBurst(0.1, v * 0.8, 3800); tone(210, 0.07, v * 0.3, 'square', 120); }
    },
    hit(head) { tone(head ? 1400 : 900, 0.06, 0.25, 'triangle', head ? 1800 : 700); },
    hurt() { noiseBurst(0.14, 0.3, 900); },
    reload() { tone(500, 0.08, 0.15, 'square'); setTimeout(() => tone(700, 0.08, 0.15, 'square'), 180); },
    empty() { tone(1200, 0.05, 0.12, 'square'); },
    beep(high) { tone(high ? 2100 : 1700, 0.07, 0.2, 'sine'); },
    planted() { tone(600, 0.5, 0.25, 'sawtooth', 200); },
    defuseTick() { tone(800, 0.05, 0.12, 'sine'); },
    burst() { noiseBurst(0.7, 0.9, 1400); tone(70, 0.6, 0.6, 'sawtooth', 30); },
    explosionFar() { noiseBurst(0.5, 0.3, 700); },
    buy() { tone(900, 0.07, 0.15, 'sine', 1200); },
    roundStart() { tone(440, 0.15, 0.2, 'triangle'); setTimeout(() => tone(660, 0.2, 0.2, 'triangle'), 180); },
    win() { tone(523, 0.18, 0.22, 'triangle'); setTimeout(() => tone(784, 0.3, 0.22, 'triangle'), 200); },
    lose() { tone(392, 0.18, 0.22, 'triangle'); setTimeout(() => tone(262, 0.34, 0.22, 'triangle'), 200); },
    step(near) { noiseBurst(0.05, near ? 0.1 : 0.04, 500, 'bandpass'); },
  };
}

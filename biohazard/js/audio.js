'use strict';
// All sounds are synthesised with WebAudio (no audio files).
const Sfx = (() => {
  let ctx = null, master, noiseBuf, ambBus;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ambient();
  }

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }

  function noise({ dur = 0.3, type = 'lowpass', f = 1000, f2 = 0, q = 1, vol = 0.5, a = 0.004, when = 0 } = {}) {
    if (!ctx || vol <= 0.001) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  }

  function tone({ type = 'sine', f = 440, f2 = 0, dur = 0.2, vol = 0.3, a = 0.004, when = 0, filter = 0, q = 1 } = {}) {
    if (!ctx || vol <= 0.001) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    let node = o;
    if (filter) { const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = filter; fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(g); g.connect(master);
    o.start(t); o.stop(t + a + dur + 0.05);
  }

  function ambient() {
    ambBus = ctx.createGain(); ambBus.gain.value = 0.9; ambBus.connect(master);
    // Low detuned drone.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const dg = ctx.createGain(); dg.gain.value = 0.035;
    for (const f of [41.2, 43.6, 61.7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    lp.connect(dg); dg.connect(ambBus);
    // Wind: band-passed noise with a slowly wandering centre.
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 3;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    s.connect(bp); bp.connect(wg); wg.connect(ambBus); s.start();
  }

  const S = {
    init,
    get ready() { return !!ctx; },
    gun() { noise({ dur: 0.22, f: 4000, f2: 300, vol: 0.9 }); tone({ type: 'triangle', f: 160, f2: 40, dur: 0.18, vol: 0.9 }); noise({ dur: 0.6, f: 600, f2: 100, vol: 0.12, when: 0.05 }); },
    shotgun() { noise({ dur: 0.45, f: 2500, f2: 120, vol: 1.0 }); tone({ f: 90, f2: 28, dur: 0.35, vol: 1.0 }); noise({ dur: 1.0, f: 500, f2: 80, vol: 0.2, when: 0.08 }); S.pump(0.45); },
    pump(w = 0) { noise({ dur: 0.05, type: 'bandpass', f: 1500, q: 3, vol: 0.3, when: w }); noise({ dur: 0.06, type: 'bandpass', f: 1100, q: 3, vol: 0.35, when: w + 0.18 }); },
    click() { tone({ type: 'square', f: 1800, dur: 0.02, vol: 0.12 }); },
    reload(sg) {
      if (sg) { for (let i = 0; i < 3; i++) noise({ dur: 0.04, type: 'bandpass', f: 1300, q: 4, vol: 0.3, when: 0.3 + i * 0.45 }); S.pump(1.8); return; }
      noise({ dur: 0.04, type: 'bandpass', f: 1600, q: 4, vol: 0.3, when: 0.1 });
      noise({ dur: 0.05, type: 'bandpass', f: 900, q: 4, vol: 0.35, when: 0.7 });
      noise({ dur: 0.04, type: 'bandpass', f: 2200, q: 4, vol: 0.3, when: 1.05 });
    },
    step(v = 1, hard = true) { noise({ dur: 0.07, type: 'bandpass', f: hard ? rand(500, 800) : rand(250, 400), q: 1.2, vol: 0.13 * v }); },
    groan(v = 1, pitch = 1) {
      if (!ctx || v < 0.02) return;
      const t = ctx.currentTime, dur = rand(0.9, 1.6);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = 75 * pitch * rand(0.85, 1.15);
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * rand(0.7, 0.9), t + dur);
      const vib = ctx.createOscillator(); vib.frequency.value = rand(5, 9);
      const vg = ctx.createGain(); vg.gain.value = 6; vib.connect(vg); vg.connect(o.frequency);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = rand(450, 650); f1.Q.value = 4;
      const g = ctx.createGain(); env(g, t, 0.25, 0.5 * v, dur);
      o.connect(f1); f1.connect(g); g.connect(master);
      o.start(t); vib.start(t); o.stop(t + dur + 0.4); vib.stop(t + dur + 0.4);
    },
    bark(v = 1) { tone({ type: 'sawtooth', f: 520, f2: 220, dur: 0.12, vol: 0.4 * v, filter: 900, q: 2 }); noise({ dur: 0.1, type: 'bandpass', f: 1200, vol: 0.2 * v }); tone({ type: 'sawtooth', f: 480, f2: 200, dur: 0.1, vol: 0.35 * v, filter: 900, q: 2, when: 0.18 }); },
    roar() { tone({ type: 'sawtooth', f: 62, f2: 34, dur: 1.6, vol: 0.8, a: 0.15, filter: 300, q: 1 }); tone({ type: 'sawtooth', f: 93, f2: 50, dur: 1.4, vol: 0.4, a: 0.2, filter: 600, q: 2 }); noise({ dur: 1.5, f: 700, f2: 150, vol: 0.4, a: 0.2 }); },
    door() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(170, t + 0.2); o.frequency.linearRampToValueAtTime(260, t + 0.8); o.frequency.linearRampToValueAtTime(140, t + 1.6);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 9;
      const trem = ctx.createOscillator(); trem.frequency.value = 23;
      const tg = ctx.createGain(); tg.gain.value = 0.5; trem.connect(tg);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.4); g.gain.linearRampToValueAtTime(0.25, t + 1.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.7);
      tg.connect(g.gain);
      o.connect(bp); bp.connect(g); g.connect(master);
      o.start(t); trem.start(t); o.stop(t + 1.8); trem.stop(t + 1.8);
      noise({ dur: 0.08, type: 'bandpass', f: 2000, q: 3, vol: 0.25, when: 0.1 });
      noise({ dur: 0.4, f: 220, f2: 60, vol: 0.9, when: 2.05 });
      tone({ f: 70, f2: 40, dur: 0.3, vol: 0.7, when: 2.05 });
    },
    pickup() { tone({ f: 880, dur: 0.08, vol: 0.2 }); tone({ f: 1320, dur: 0.2, vol: 0.2, when: 0.08 }); },
    locked() { noise({ dur: 0.05, type: 'bandpass', f: 1400, q: 5, vol: 0.4 }); noise({ dur: 0.05, type: 'bandpass', f: 1200, q: 5, vol: 0.4, when: 0.12 }); },
    unlock() { noise({ dur: 0.05, type: 'bandpass', f: 1800, q: 5, vol: 0.4 }); tone({ type: 'square', f: 600, dur: 0.05, vol: 0.1, when: 0.15 }); noise({ dur: 0.08, type: 'bandpass', f: 900, q: 5, vol: 0.5, when: 0.25 }); },
    hurt() { noise({ dur: 0.25, type: 'bandpass', f: 800, q: 2, vol: 0.6 }); tone({ type: 'sawtooth', f: 240, f2: 120, dur: 0.25, vol: 0.35, filter: 700, q: 2 }); },
    bite() { noise({ dur: 0.15, f: 900, vol: 0.7 }); tone({ f: 110, f2: 50, dur: 0.15, vol: 0.6 }); },
    splat() { noise({ dur: 0.1, type: 'bandpass', f: 500, q: 1.5, vol: 0.5 }); },
    ricochet() { tone({ f: 2600, f2: 1300, dur: 0.12, vol: 0.08 }); noise({ dur: 0.04, type: 'highpass', f: 3000, vol: 0.2 }); },
    thud() { noise({ dur: 0.3, f: 300, f2: 80, vol: 0.6 }); },
    heartbeat(v = 1) { tone({ f: 58, dur: 0.1, vol: 0.5 * v }); tone({ f: 52, dur: 0.12, vol: 0.35 * v, when: 0.2 }); },
    thunder(v = 1, delay = 0) { noise({ dur: 0.15, type: 'highpass', f: 1500, vol: 0.2 * v, when: delay }); noise({ dur: 3.5, f: 400, f2: 60, vol: 0.9 * v, a: 0.05, when: delay }); },
    scream() { tone({ type: 'sawtooth', f: 320, f2: 140, dur: 1.2, vol: 0.5, a: 0.03, filter: 1100, q: 2 }); },
    herb() { noise({ dur: 0.3, type: 'bandpass', f: 3000, q: 2, vol: 0.15 }); tone({ f: 660, dur: 0.3, vol: 0.15, when: 0.2 }); tone({ f: 990, dur: 0.4, vol: 0.12, when: 0.35 }); },
    ui() { tone({ type: 'square', f: 1200, dur: 0.03, vol: 0.06 }); },
    stinger() { tone({ type: 'sawtooth', f: 110, dur: 1.2, vol: 0.25, filter: 400 }); tone({ type: 'sawtooth', f: 116.5, dur: 1.2, vol: 0.25, filter: 400 }); noise({ dur: 0.8, type: 'highpass', f: 4000, vol: 0.15 }); },
  };
  return S;
})();

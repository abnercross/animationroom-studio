// Animation Room: score and SFX synthesis from a resolved storyboard.
// Pure JavaScript (no Python), 48 kHz mono float buffers.

export const SR = 48000;

// ---------- small DSP kit ----------
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function biquad(type, f, q = 0.707) {
  const w = (2 * Math.PI * f) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = a; b1 = 0; b2 = -a; } // bandpass
  a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function reverb(buf, seconds = 3, mix = 0.32) {
  // Schroeder style: parallel combs into series allpasses.
  const fb = Math.pow(0.001, 0.035 / seconds);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({b: new Float32Array(Math.round(n * SR / 44100)), i: 0}));
  const aps = [556, 441, 341].map((n) => ({b: new Float32Array(Math.round(n * SR / 44100)), i: 0}));
  const out = new Float32Array(buf.length);
  let lp = 0;
  for (let n = 0; n < buf.length; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.b[c.i];
      lp = y * 0.6 + lp * 0.4;
      c.b[c.i] = buf[n] * 0.2 + lp * fb;
      c.i = (c.i + 1) % c.b.length;
      s += y;
    }
    for (const a of aps) {
      const y = a.b[a.i];
      const v = s + y * 0.5;
      a.b[a.i] = v;
      a.i = (a.i + 1) % a.b.length;
      s = y - v * 0.5;
    }
    out[n] = buf[n] * (1 - mix) + s * mix * 0.5;
  }
  return out;
}

const add = (dst, src, at, gain = 1) => {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length; i++) if (o + i >= 0 && o + i < dst.length) dst[o + i] += src[i] * gain;
};

// ---------- SFX voices ----------
const sfx = {
  rise(d = 1.1) {
    const n = Math.round(d * SR), out = new Float32Array(n), bp = biquad('bp', 800, 0.8);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const f = biquad; void f;
      out[i] = bp(rnd()) * Math.sin(Math.PI * p) ** 2 * 0.5 * (0.4 + p);
    }
    return out;
  },
  pencil(d) {
    const n = Math.round(d * SR), out = new Float32Array(n), hp = biquad('hp', 2500), bp = biquad('bp', 4200, 1.2);
    let strokePhase = 0, rate = 7;
    for (let i = 0; i < n; i++) {
      strokePhase += rate / SR;
      if (strokePhase > 1) { strokePhase -= 1; rate = 5 + Math.random() * 5; }
      const amp = Math.max(0, Math.sin(Math.PI * strokePhase)) ** 1.5;
      const env = Math.min(1, i / (0.05 * SR), (n - i) / (0.1 * SR));
      out[i] = (hp(rnd()) * 0.5 + bp(rnd()) * 0.7) * amp * env * 0.09;
    }
    return out;
  },
  // Chalk on slate: brighter and drier than pencil, in short pressed strokes.
  chalk(d) {
    const n = Math.round(d * SR), out = new Float32Array(n), hp = biquad('hp', 1800), lp = biquad('lp', 7000), bp = biquad('bp', 3400, 0.9);
    let strokePhase = 0, rate = 8;
    for (let i = 0; i < n; i++) {
      strokePhase += rate / SR;
      if (strokePhase > 1) { strokePhase -= 1; rate = 6 + Math.random() * 4; }
      const amp = Math.max(0, Math.sin(Math.PI * strokePhase)) ** 0.8;
      const env = Math.min(1, i / (0.03 * SR), (n - i) / (0.06 * SR));
      out[i] = (lp(hp(rnd())) * 0.6 + bp(rnd()) * 0.5) * amp * env * 0.1;
    }
    return out;
  },
  roomTone(d) {
    const n = Math.round(d * SR), out = new Float32Array(n), hp = biquad('hp', 80), lp = biquad('lp', 600);
    for (let i = 0; i < n; i++) out[i] = lp(hp(rnd())) * 0.05;
    return out;
  },
  // ---- paper foley ----
  pop(f = 520) {
    const n = Math.round(0.14 * SR), out = new Float32Array(n), hp = biquad('hp', 2500);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      ph += (2 * Math.PI * f * (1 + 0.9 * Math.exp(-i / (0.012 * SR)))) / SR;
      out[i] = Math.sin(ph) * Math.exp(-i / (0.03 * SR)) * 0.5 + hp(rnd()) * Math.exp(-i / (0.004 * SR)) * 0.25;
    }
    return out;
  },
  shuffle(d = 0.45) {
    const n = Math.round(d * SR), out = new Float32Array(n), bp = biquad('bp', 2600, 0.7), hp = biquad('hp', 900);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const flutter = 0.6 + 0.4 * Math.sin(p * Math.PI * 9 + Math.sin(p * 31));
      out[i] = (bp(rnd()) * 0.8 + hp(rnd()) * 0.15) * Math.sin(Math.PI * p) ** 1.5 * flutter * 0.28;
    }
    return out;
  },
  flip() {
    const n = Math.round(0.5 * SR), out = new Float32Array(n);
    let low = 0, band = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const f = 2 * Math.sin((Math.PI * (500 + 3800 * p * p)) / SR);
      low += f * band;
      const high = rnd() - low - 0.7 * band;
      band += f * high;
      out[i] = band * Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2 * 0.42 + (p > 0.82 && p < 0.86 ? rnd() * 0.25 : 0);
    }
    return out;
  },
  tape() {
    const n = Math.round(0.16 * SR), out = new Float32Array(n), hp = biquad('hp', 3500);
    for (let i = 0; i < n; i++) out[i] = hp(rnd()) * (Math.random() < 0.035 ? 1 : 0.08) * (1 - i / n) * 0.5;
    return out;
  },
  slap() {
    const n = Math.round(0.22 * SR), out = new Float32Array(n), lp = biquad('lp', 1800), hp = biquad('hp', 150);
    for (let i = 0; i < n; i++) out[i] = hp(lp(rnd())) * Math.exp(-i / (0.022 * SR)) * 0.9 + Math.sin((2 * Math.PI * 110 * i) / SR) * Math.exp(-i / (0.03 * SR)) * 0.4;
    return out;
  },
  chime() {
    const n = Math.round(1.4 * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      out[i] = (Math.sin(2 * Math.PI * 1568 * tt) + 0.5 * Math.sin(2 * Math.PI * 2349 * tt) + 0.25 * Math.sin(2 * Math.PI * 3136 * tt)) * Math.exp(-tt / 0.35) * 0.12 * Math.min(1, i / 40);
    }
    return out;
  },
  boing() {
    const n = Math.round(0.35 * SR), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      ph += (2 * Math.PI * (180 + 420 * p + 30 * Math.sin(p * 40))) / SR;
      out[i] = Math.sin(ph) * Math.sin(Math.PI * p) ** 0.7 * 0.3;
    }
    return out;
  },
  click(f = 2200, g = 0.35) {
    const n = Math.round(0.04 * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (Math.sin((2 * Math.PI * f * i) / SR) + rnd() * 0.3 * (i < 100)) * Math.exp(-i / (0.006 * SR)) * g;
    return out;
  },
  tick() {
    const n = Math.round(0.012 * SR), out = new Float32Array(n), hp = biquad('hp', 3000);
    for (let i = 0; i < n; i++) out[i] = hp(rnd()) * Math.exp(-i / (0.0015 * SR)) * 0.25;
    return out;
  },
  whoosh(d = 0.55) {
    const n = Math.round(d * SR), out = new Float32Array(n);
    // state variable bandpass with a swept centre frequency
    let low = 0, band = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const f = 2 * Math.sin((Math.PI * (300 + 2600 * Math.sin(Math.PI * p * 0.9))) / SR);
      low += f * band;
      const high = rnd() - low - 0.9 * band;
      band += f * high;
      out[i] = band * Math.sin(Math.PI * p) ** 3 * 0.5;
    }
    return out;
  },
  thump() {
    const n = Math.round(0.6 * SR), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const f = 48 + 60 * Math.exp(-i / (0.04 * SR));
      ph += (2 * Math.PI * f) / SR;
      out[i] = Math.sin(ph) * Math.exp(-i / (0.16 * SR)) * 0.8;
    }
    return out;
  },
  // ---- ink and glass (engine 1.5) ----
  // A blot of ink landing on paper: a soft wet plop with a little splash after it.
  plop() {
    const n = Math.round(0.3 * SR), out = new Float32Array(n), bp = biquad('bp', 1800, 1.1);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      ph += (2 * Math.PI * (90 + 190 * Math.exp(-i / (0.025 * SR)))) / SR;
      const splash = i > 0.03 * SR ? bp(rnd()) * Math.exp(-(i - 0.03 * SR) / (0.05 * SR)) * 0.22 : 0;
      out[i] = Math.sin(ph) * Math.exp(-i / (0.045 * SR)) * 0.6 + splash;
    }
    return out;
  },
  // A rubber stamp pressed down: a dull thud and the slap of paper.
  stampHit() {
    const n = Math.round(0.35 * SR), out = new Float32Array(n), lp = biquad('lp', 2200), hp = biquad('hp', 120);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      ph += (2 * Math.PI * (70 + 60 * Math.exp(-i / (0.02 * SR)))) / SR;
      out[i] = Math.sin(ph) * Math.exp(-i / (0.07 * SR)) * 0.8 + hp(lp(rnd())) * Math.exp(-i / (0.018 * SR)) * 0.55;
    }
    return out;
  },
  // A dry brush dragged across the page: filtered noise with bristle streaks.
  swipe(d = 0.62) {
    const n = Math.round(d * SR), out = new Float32Array(n);
    let low = 0, band = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const f = 2 * Math.sin((Math.PI * (700 + 1700 * p)) / SR);
      low += f * band;
      const high = rnd() - low - 0.6 * band;
      band += f * high;
      const bristle = 0.55 + 0.45 * Math.sin(i / SR * 190 + Math.sin(i / SR * 37) * 4);
      out[i] = band * Math.sin(Math.PI * Math.pow(p, 0.8)) ** 1.5 * bristle * 0.5;
    }
    return out;
  },
  // Shards of glass: a handful of bright, quick ticks.
  glass() {
    const n = Math.round(0.7 * SR), out = new Float32Array(n);
    for (let h = 0; h < 11; h++) {
      const at = Math.round((h * 0.011 + Math.random() * 0.012) * SR), f = 3200 + Math.random() * 3800, g = 0.16 * (1 - h / 15);
      for (let i = 0; i < 0.22 * SR && at + i < n; i++) out[at + i] += Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / ((0.012 + Math.random() * 0.01) * SR)) * g;
    }
    return out;
  },
  // ---- printed poster voices (engine 1.6) ----
  blip(f = 520, g = 0.5) {
    const n = Math.round(0.14 * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = g * Math.exp(-t * 30) * Math.sin(2 * Math.PI * (f + (f * 0.9 * t) / 0.14) * t); }
    return out;
  },
  stamp() {
    const n = Math.round(0.35 * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = 0.9 * Math.exp(-t * 13) * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 28)) * t) + 0.22 * rnd() * Math.exp(-t * 80); }
    return out;
  },
  ding(m = 88, g = 0.35) {
    const n = Math.round(1.2 * SR), out = new Float32Array(n);
    [0, 12, 19].forEach((o, k) => { const f = mtof(m + o); for (let i = 0; i < n; i++) { const t = i / SR; out[i] += (g / (k + 1)) * Math.exp(-t * 4.5) * Math.sin(2 * Math.PI * f * t); } });
    return out;
  },
  tickf(f = 1800, g = 0.3) {
    const n = Math.round(0.03 * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = g * Math.exp(-t * 160) * Math.sin(2 * Math.PI * f * t); }
    return out;
  },
  fall() {
    const n = Math.round(0.75 * SR), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (1400 - 1100 * (t / 0.75) ** 2)) / SR; out[i] = 0.16 * Math.sin((Math.PI * t) / 0.75) * Math.sin(ph); }
    return out;
  },
  land() {
    const n = Math.round(0.6 * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = 1.3 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * (42 + 70 * Math.exp(-t * 20)) * t) + 0.4 * rnd() * Math.exp(-t * 40); }
    return out;
  },
  push() {
    const n = Math.round(0.12 * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = 0.6 * Math.exp(-t * 45) * Math.sin(2 * Math.PI * 180 * t); }
    return out;
  },
  bell(f = 880, d = 2.4, g = 0.22) {
    const n = Math.round(d * SR), out = new Float32Array(n);
    const parts = [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.25, 0.35], [8.93, 0.12, 0.2]];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const [r, a, dec] of parts) s += Math.sin((2 * Math.PI * f * r * i) / SR) * a * Math.exp(-i / (dec * d * 0.35 * SR));
      out[i] = s * g * Math.min(1, i / 60);
    }
    return out;
  },
};

// ---------- raw Vox voices (engine 1.8): paper, marker, pen, stamp and the forge ----------
const vbuf = (d) => new Float32Array(Math.round(d * SR));
const voxSfx = {
  // a short pop as something appears; the pitch varies so repeats do not sound the same
  pop(f = 520) {
    const o = vbuf(0.14), hp = biquad('hp', 2500);
    let ph = 0;
    for (let i = 0; i < o.length; i++) { ph += (2 * Math.PI * f * (1 + 0.9 * Math.exp(-i / (0.012 * SR)))) / SR; o[i] = Math.sin(ph) * Math.exp(-i / (0.03 * SR)) * 0.45 + hp(rnd()) * Math.exp(-i / (0.004 * SR)) * 0.2; }
    return o;
  },
  // a sheet of paper sliding across the desk
  slide(d = 0.5) {
    const o = vbuf(d), bp = biquad('bp', 2200, 0.6), lp = biquad('lp', 5000);
    for (let i = 0; i < o.length; i++) { const p = i / o.length; o[i] = lp(bp(rnd())) * Math.sin(Math.PI * p) ** 1.4 * (0.7 + 0.3 * Math.sin(p * 40)) * 0.55; }
    return o;
  },
  whoosh(d = 0.55, g = 0.5) {
    const o = vbuf(d);
    let low = 0, band = 0;
    for (let i = 0; i < o.length; i++) {
      const p = i / o.length, f = 2 * Math.sin((Math.PI * (300 + 2600 * Math.sin(Math.PI * p * 0.9))) / SR);
      low += f * band; const high = rnd() - low - 0.9 * band; band += f * high;
      o[i] = band * Math.sin(Math.PI * p) ** 3 * g;
    }
    return o;
  },
  // felt tip marker: a squeaky stroke
  marker(d = 0.3) {
    const o = vbuf(d), bp = biquad('bp', 3000, 2.5), hp = biquad('hp', 1500);
    let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const p = i / o.length, env = Math.sin(Math.PI * p) ** 0.6;
      ph += (2 * Math.PI * (1700 + 500 * Math.sin(p * 9) + 300 * p)) / SR;
      o[i] = (bp(rnd()) * 0.6 + hp(rnd()) * 0.15 + Math.sin(ph) * 0.05) * env * 0.4;
    }
    return o;
  },
  // pen on paper while a line draws or words are written by hand
  pen(d = 0.8) {
    const o = vbuf(d), hp = biquad('hp', 2500), bp = biquad('bp', 4200, 1.2);
    let sp = 0, rate = 7;
    for (let i = 0; i < o.length; i++) {
      sp += rate / SR; if (sp > 1) { sp -= 1; rate = 5 + Math.abs(rnd()) * 5; }
      const amp = Math.max(0, Math.sin(Math.PI * sp)) ** 1.5, env = Math.min(1, i / (0.05 * SR), (o.length - i) / (0.1 * SR));
      o[i] = (hp(rnd()) * 0.5 + bp(rnd()) * 0.7) * amp * env * 0.16;
    }
    return o;
  },
  stamp() {
    const o = vbuf(0.35), lp = biquad('lp', 2200), hp = biquad('hp', 120);
    let ph = 0;
    for (let i = 0; i < o.length; i++) { ph += (2 * Math.PI * (70 + 60 * Math.exp(-i / (0.02 * SR)))) / SR; o[i] = Math.sin(ph) * Math.exp(-i / (0.07 * SR)) * 0.85 + hp(lp(rnd())) * Math.exp(-i / (0.018 * SR)) * 0.6; }
    return o;
  },
  thump(g = 0.8) {
    const o = vbuf(0.6);
    let ph = 0;
    for (let i = 0; i < o.length; i++) { ph += (2 * Math.PI * (48 + 60 * Math.exp(-i / (0.04 * SR)))) / SR; o[i] = Math.sin(ph) * Math.exp(-i / (0.16 * SR)) * g; }
    return o;
  },
  // a dart hitting the board
  thunk() {
    const o = vbuf(0.25), bp = biquad('bp', 900, 1.5);
    let ph = 0;
    for (let i = 0; i < o.length; i++) { ph += (2 * Math.PI * (220 + 300 * Math.exp(-i / (0.006 * SR)))) / SR; o[i] = Math.sin(ph) * Math.exp(-i / (0.035 * SR)) * 0.6 + bp(rnd()) * Math.exp(-i / (0.01 * SR)) * 0.5; }
    return o;
  },
  click(f = 2200, g = 0.35) {
    const o = vbuf(0.04);
    for (let i = 0; i < o.length; i++) o[i] = (Math.sin((2 * Math.PI * f * i) / SR) + rnd() * 0.3 * (i < 100)) * Math.exp(-i / (0.006 * SR)) * g;
    return o;
  },
  // a key on a keyboard, for typed words
  key() {
    const o = vbuf(0.05), bp = biquad('bp', 2800 + rnd() * 600, 1.2);
    for (let i = 0; i < o.length; i++) o[i] = bp(rnd()) * Math.exp(-i / (0.008 * SR)) * 0.5 + Math.sin((2 * Math.PI * 180 * i) / SR) * Math.exp(-i / (0.01 * SR)) * 0.15;
    return o;
  },
  blip(f = 660, g = 0.3) {
    const o = vbuf(0.16);
    for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = g * Math.exp(-t * 28) * Math.sin(2 * Math.PI * f * t) * Math.min(1, i / 30); }
    return o;
  },
  chime(f = 1568, g = 0.12) {
    const o = vbuf(1.4);
    for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t)) * Math.exp(-t / 0.35) * g * Math.min(1, i / 40); }
    return o;
  },
  bell(f = 1320, d = 1.6, g = 0.16) {
    const o = vbuf(d), parts = [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.25, 0.35], [8.93, 0.12, 0.2]];
    for (let i = 0; i < o.length; i++) { let s = 0; for (const [r, a, dec] of parts) s += Math.sin((2 * Math.PI * f * r * i) / SR) * a * Math.exp(-i / (dec * d * 0.35 * SR)); o[i] = s * g * Math.min(1, i / 60); }
    return o;
  },
  // a hammer on an anvil: a ringing metal hit with a bright crack on top
  clang(f = 820, g = 0.55) {
    const o = vbuf(1.6), hp = biquad('hp', 2000);
    const parts = [[1, 1, 0.5], [2.41, 0.6, 0.35], [3.93, 0.45, 0.25], [5.67, 0.3, 0.16], [7.1, 0.2, 0.1]];
    for (let i = 0; i < o.length; i++) {
      const t = i / SR;
      let s = 0; for (const [r, a, dec] of parts) s += Math.sin(2 * Math.PI * f * r * t) * a * Math.exp(-t / dec);
      o[i] = (s * 0.5 + hp(rnd()) * Math.exp(-t / 0.012) * 0.9 + Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t / 0.05) * 0.6) * g;
    }
    return o;
  },
  // fire roaring up, with crackles
  sizzle(d = 1.6, g = 0.4) {
    const o = vbuf(d), lp = biquad('lp', 900), hp = biquad('hp', 3000);
    for (let i = 0; i < o.length; i++) {
      const p = i / o.length, env = Math.min(1, p * 3) * Math.min(1, (1 - p) * 2.5);
      o[i] = (lp(rnd()) * 0.9 + hp(rnd()) * (Math.abs(rnd()) > 0.995 ? 3 : 0.12)) * env * g;
    }
    return o;
  },
  // a crowd appearing: soft footstep patter
  patter(d = 1.4) {
    const o = vbuf(d), lp = biquad('lp', 1200);
    for (let k = 0; k < 40; k++) {
      const at = Math.round(Math.abs(rnd()) * (d - 0.1) * SR);
      for (let i = 0; i < 0.05 * SR && at + i < o.length; i++) o[at + i] += lp(rnd()) * Math.exp(-i / (0.01 * SR)) * 0.35;
    }
    return o;
  },
  flip() {
    const o = vbuf(0.5);
    let low = 0, band = 0;
    for (let i = 0; i < o.length; i++) {
      const p = i / o.length, f = 2 * Math.sin((Math.PI * (500 + 3800 * p * p)) / SR);
      low += f * band; const high = rnd() - low - 0.7 * band; band += f * high;
      o[i] = band * Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2 * 0.4;
    }
    return o;
  },
};


// ---------- events from the storyboard ----------
// `map` is the style's sound.sfx recipe. Anything it leaves out sounds the way engine 1.0 did.
export function collectEvents(sb, map = {}) {
  const ev = [];
  const draw = (which) => (map[which] === 'chalk' ? 'chalk' : 'pencil');

  // Printed poster blocks (engine 1.6): a small sound for each thing that appears, in the poster's own voices.
  let pb = 0;
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const P = (kind, at, extra = {}) => { if (num(at)) ev.push({kind, at, ...extra}); };
  const blip = (at, g = 1) => P('blip', at, {f: 440 + (pb++ % 4) * 70, g});
  const tickRun = (at, count, step, f0 = 1400, df = 60) => { for (let i = 0; i < count; i++) P('tickf', at + i * step, {f: f0 + i * df, g: 0.3}); };
  const posterEvents = (b) => {
    switch (b.type) {
      case 'posterWord':
        if (b.mode === 'stamp') { P('stamp', b.at, {g: 1}); P('ding', b.at + 0.05, {m: 84, g: 0.3}); }
        else if (b.mode === 'pill' || b.mode === 'kicker') blip(b.at);
        else if ((b.size ?? 330) >= 200) P('stamp', b.at, {g: b.mode === 'register' ? 0.6 : 0.85});
        else blip(b.at);
        break;
      case 'posterHero':
        P('pop', b.at, {n: 2, soft: true});
        if (num(b.fillAt)) tickRun(b.fillAt + 0.4, 26, 0.045, 1500, 0);
        break;
      case 'posterRing': { const d = b.dur ?? 1.1; tickRun(b.at, 14, d / 14.5); P('stamp', b.at + d, {g: 1}); P('ding', b.at + d, {m: 91, g: 0.35}); break; }
      case 'posterCards': case 'posterSteps': (b.items || []).forEach((it, i) => P('blip', it.at, {f: 520 + i * 90, g: 0.9})); break;
      case 'posterBanner': (b.texts || []).forEach((x) => P('stamp', x.at, {g: 0.6})); break;
      case 'posterTile': blip(b.at); break;
      case 'posterSlots': for (let i = 0; i < (b.n ?? 4); i++) P('blip', b.at + i * 0.16, {f: 700 + i * 90, g: 0.6}); break;
      case 'posterSplit':
        for (const side of ['top', 'bottom']) { blip(b[side]?.labelAt); P('stamp', b[side]?.wordAt, {g: 0.6}); }
        P('ding', b.badgeAt, {m: 88, g: 0.35});
        break;
      case 'posterGauge': {
        const lean = b.leanAt ?? b.at + 0.9, push = b.pushAt ?? b.at + 3.5;
        blip(lean - 0.4); P('whoosh', lean, {soft: true}); P('push', push); P('whoosh', push - 0.15, {soft: true}); P('whoosh', (b.pullAt ?? push + 0.65) - 0.1, {soft: true});
        break;
      }
      case 'posterJourney': {
        const f = b.fallAt ?? b.at + 9, land = f + 0.75;
        blip(b.pillAt); blip(b.readouts?.[0]?.at); blip(b.readouts?.[1]?.at);
        P('ding', b.readouts?.[0]?.tickAt, {m: 88, g: 0.35});
        P('fall', f); P('land', land); P('whoosh', f - 0.1, {soft: true});
        const r1 = b.readouts?.[1];
        if (r1?.countTo !== undefined) { const c = r1.countAt ?? land + 2.1; tickRun(c, 12, 0.058); P('ding', r1.doneAt ?? c + 0.7, {m: 91, g: 0.35}); }
        break;
      }
      case 'posterRecap':
        (b.cards || []).forEach((c) => { blip(c.cardAt); P('stamp', c.wordAt, {g: 0.9}); });
        P('ding', (b.cards?.[1]?.wordAt ?? NaN) + 0.05, {m: 96, g: 0.35});
        break;
      case 'posterButton': P('stamp', b.at, {g: 1}); P('ding', b.at, {m: 91, g: 0.35}); break;
      case 'posterBar': P('whoosh', b.at, {soft: true}); break;
    }
  };
  const writeSecs = (s) => Math.max(0.25, String(s).length * 0.045);
  // raw Vox blocks (engine 1.8): a paper or marker sound for everything that lands on the page
  let vp = 0;
  const V = (v, at, g = 1, ...args) => { if (num(at)) ev.push({kind: 'vox', v, at, g, args}); };
  const vpop = (at, g = 0.8) => V('pop', at, g, 560 + ((vp++ * 97) % 360));
  const voxEvents = (b) => {
    const at = b.at;
    switch (b.type) {
      case 'voxCard':
        V('slide', at, 0.8);
        (b.flips || []).forEach((f) => V('flip', f - 0.15, 0.7));
        if (num(b.out)) V('slide', b.out, 0.7);
        (b.blocks || []).forEach((c) => walk({...c, at: c.at ?? at}));
        break;
      case 'voxGroup':
        if (b.enter && b.enter !== 'none') vpop(at);
        (b.blocks || []).forEach((c) => walk({...c, at: c.at ?? at}));
        break;
      case 'voxTag': case 'voxChip': vpop(at); break;
      case 'voxText': {
        const len = String(b.text || '').length;
        if (b.typed) { const until = num(b.until) ? b.until : at + len * 0.05; String(b.text).split('').forEach((ch, i) => { if (ch !== ' ') V('key', at + (i / len) * (until - at), 0.6); }); }
        else if (b.font === 'hand') V('pen', at, 0.5, Math.min(1.2, 0.3 + len * 0.025));
        else vpop(at);
        if (b.mark) V('marker', b.mark.at ?? at, 0.8, 0.35);
        if (b.underline) V('marker', b.underline.at ?? at + 0.3, 0.7, 0.35);
        if (b.strike) V('marker', b.strike.at ?? at, 0.9, 0.3);
        if (b.circle) V('marker', b.circle.at ?? at, 1, 0.45);
        break;
      }
      case 'voxHighlight': V('marker', at, 0.8, 0.35); break;
      case 'voxLine': if (b.marker) V('marker', at, 0.8, Math.min(0.5, b.dur ?? 0.8)); else V('pen', at, 0.6, b.dur ?? 0.8); break;
      case 'voxStamp': V('stamp', at, 1); break;
      case 'voxMark':
        if (b.kind === 'cross') { V('marker', at, 0.9, 0.22); V('marker', at + 0.18, 0.9, 0.22); }
        else if (b.kind === 'box') V('pen', at, 0.6, 0.5);
        else V('marker', at, 0.8, b.kind === 'circle' ? 0.45 : b.kind === 'underline' ? 0.35 : 0.25);
        break;
      case 'voxNumbers': for (let i = 0; i < (b.n ?? 5); i++) V('blip', at + i * (b.step ?? 0.1), 1, 523 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16][i % 8] / 12)); break;
      case 'voxList':
        (b.items || []).forEach((it, i, all) => {
          vpop(it.at);
          if (b.style === 'checks') V('marker', it.at + 0.35, 0.8, 0.25);
          else { V('marker', it.at + 0.4, 0.7, 0.35); if (all[i + 1]) V('marker', all[i + 1].at - 0.3, 0.7, 0.25); }
        });
        break;
      case 'voxNetwork': (b.nodes || []).forEach((_, i) => V('blip', at + i * (b.step ?? 0.15) * 0.8, 0.8, 660 + i * 90)); break;
      case 'voxSubscribe': { vpop(at); const c = b.clickAt ?? at + 1; V('whoosh', c - 0.4, 0.25, 0.35); V('click', c, 1, 2400, 0.5); V('bell', c + 0.3, 1, 1320, 1.6, 0.16); break; }
      case 'voxDraw': if (b.enter === 'draw') V('pen', at, 0.6, b.dur ?? 0.9); else if (b.enter !== 'none') vpop(at); break;
      case 'voxArt': {
        const e = b.enter ?? 'pop';
        if (e === 'rise' || e === 'drop') V('thump', at + 0.3, 0.9, 0.7);
        else if (e === 'left' || e === 'right') V('whoosh', at, 0.6, 0.9);
        else if (e !== 'none' && e !== 'fade') vpop(at);
        if (b.kind === 'hammer') (b.hits || []).forEach((h, i) => V('clang', h, 0.6, 820 - i * 60));
        if (b.kind === 'iron' && num(b.heatAt)) V('sizzle', b.heatAt, 0.55, 2.4, 0.45);
        if (b.kind === 'target' && num(b.hitAt)) { V('whoosh', b.hitAt - 0.3, 0.5, 0.3, 0.4); V('thunk', b.hitAt, 1); }
        if (b.kind === 'crowd') V('patter', at, 0.9, 1.3);
        if (b.kind === 'pin') { V('click', at, 1, 1400, 0.5); V('thump', at + 0.1, 0.4, 0.5); }
        if (b.kind === 'chart') { (b.values || [0, 0, 0, 0]).forEach((_, i) => V('blip', at + 0.1 + i * 0.12, 1, 523 * Math.pow(2, (i * 4) / 12))); if (b.arrow !== false) V('pen', at + 0.6, 0.8, 0.5); }
        if (b.kind === 'calendar') { for (let i = 0; i < (b.days ?? 7); i++) { V('click', at + i * 0.04, 1, 1800 + i * 80, 0.18); if (num(b.crossAt)) V('marker', b.crossAt + i * 0.16, 0.55, 0.12); } }
        if (b.kind === 'daynight') { V('pen', at, 0.6, 0.8); V('chime', at + 0.5, 0.8, 1568); V('bell', at + 0.8, 0.8, 990, 1.6, 0.12); }
        if (b.kind === 'tally') for (let i = 0; i < (b.count ?? 7); i++) V('pen', at + i * (b.step ?? 0.16), 0.6, 0.12);
        if (b.kind === 'bell' && num(b.ringAt)) V('bell', b.ringAt, 1, 1320, 1.6, 0.16);
        if (b.kind === 'bulb' && num(b.litAt)) V('chime', b.litAt, 0.8, 1568);
        if (b.kind === 'speaker') [0, 1, 2].forEach((i) => V('click', at + 0.2 + i * 0.12, 1, 1600, 0.25));
        if (b.kind === 'cycle') V('pen', at, 0.6, 0.6);
        if (b.kind === 'magnifier' && num(b.sweepAt)) V('whoosh', b.sweepAt, 0.3, 0.8);
        if (b.kind === 'fire') V('sizzle', at, 0.5, 1.6, 0.35);
        if (b.kind === 'thermometer' && num(b.riseAt)) V('whoosh', b.riseAt, 0.3, 0.8);
        break;
      }
    }
    if (b.shake) V('thump', at, 0.8);
  };
  const walk = (b) => {
    if (b.sfx === false) return;
    if (b.type && b.type.startsWith('vox')) return voxEvents(b);
    if (b.type && b.type.startsWith('poster')) return posterEvents(b);
    // Happy Bean (engine 1.7): a soft pop for each thing that appears, a boing when a bean lands or hops
    if (b.type === 'bean') {
      if ((b.enter ?? 'pop') !== 'none') ev.push({kind: b.enter === 'drop' ? 'boing' : 'pop', at: b.enter === 'drop' ? b.at + 0.45 : b.at, n: 2});
      (b.keys || []).forEach((kf, i) => {
        if (kf.hop) ev.push({kind: 'boing', at: kf.t, soft: true});
        else if (kf.mood && ['surprised', 'shocked', 'joy', 'laugh', 'love'].includes(kf.mood)) ev.push({kind: 'pop', at: kf.t, n: i + 3, soft: true});
        else if (kf.pose && ['cheer', 'jump', 'highfive'].includes(kf.pose)) ev.push({kind: 'chime', at: kf.t});
      });
      (b.spots || []).forEach((sp) => ev.push({kind: 'pop', at: sp.at, n: 6, soft: true}));
      (b.pains || []).forEach((pn) => ev.push({kind: 'whoosh', at: pn.at, soft: true}));
      return;
    }
    if (b.type === 'beanTitle') { const len = (b.lines || [b.text]).join(' ').split(' ').length; for (let i = 0; i < len; i++) ev.push({kind: 'pop', at: b.at + i * 0.07, n: i, soft: true}); return; }
    if (b.type === 'beanDraw') { ev.push(b.enter === 'draw' ? {kind: 'pencil', at: b.at, dur: b.dur ?? 0.9} : {kind: 'pop', at: b.at, n: 4}); return; }
    if (b.type === 'beanInfo') {
      const list = b.items || b.points || b.parts;
      if (list) list.forEach((it, i) => ev.push({kind: 'pop', at: typeof it.at === 'number' ? it.at : b.at + i * 0.5, n: i}));
      else if (b.kind === 'counter') for (let i = 0; i < 14; i++) ev.push({kind: 'tick', at: b.at + (b.dur ?? 1.4) * (1 - Math.pow(1 - i / 14, 1 / 3)) * 0.95});
      else if (b.kind === 'myth' || b.kind === 'compare') { ev.push({kind: 'pop', at: (b.left?.at ?? b.mythAt ?? b.at), n: 1}); ev.push({kind: 'chime', at: (b.right?.at ?? b.factAt ?? b.at + 1)}); }
      else ev.push({kind: 'pop', at: b.at, n: 2});
      return;
    }
    if (b.type === 'beanBadge') { ev.push({kind: b.kind === 'pill' ? 'chime' : 'pop', at: b.at, n: 5}); return; }
    if (b.type === 'beanProp') {
      if (b.kind === 'ground') return;
      if (b.kind === 'stairs') { for (let i = 0; i < (b.steps ?? 5); i++) ev.push({kind: 'pop', at: b.at + i * 0.15, n: i}); return; }
      if (b.kind === 'arrow') { ev.push({kind: 'whoosh', at: b.at, soft: true}); return; }
      ev.push({kind: 'pop', at: b.at, n: 1, soft: b.kind === 'disc'});
      for (const f of ['litAt', 'openAt', 'snapAt', 'launchAt', 'hitAt', 'breakAt', 'joinAt']) if (typeof b[f] === 'number') ev.push({kind: f === 'litAt' ? 'chime' : 'whoosh', at: b[f], soft: f !== 'litAt'});
      return;
    }
    if (b.type === 'group') return (b.blocks || []).forEach((c) => walk({...c, at: c.at ?? b.at}));
    if (b.type === 'cutout') {
      (b.blocks || []).forEach((c) => walk({...c, at: c.at ?? b.at}));
      ev.push({kind: b.enter === 'slap' ? 'slap' : b.enter && b.enter !== 'pop' ? 'shuffle' : 'pop', at: b.at, n: ev.length});
      if (b.tape) ev.push({kind: 'tape', at: b.at + 0.55});
      if (b.out !== undefined) ev.push({kind: b.exit === 'peel' ? 'tape' : 'pop', at: b.out, n: ev.length, soft: true});
    }
    if (b.type === 'ransom') {
      const len = (b.lines || [b.text]).join('').length;
      for (let i = 0; i < len; i++) ev.push({kind: 'pop', at: b.at + i * (b.stagger ?? 0.06) + 0.3, n: i, soft: true});
      if (b.out !== undefined) ev.push({kind: 'shuffle', at: b.out});
    }
    if (b.type === 'shape' || b.type === 'prop' || b.type === 'badge') {
      if (b.enter !== 'none') ev.push({kind: b.enter === 'fall' ? 'slap' : 'pop', at: b.at, n: ev.length});
      if (b.litAt !== undefined) ev.push({kind: 'chime', at: b.litAt});
      if (b.type === 'badge') ev.push({kind: 'whoosh', at: b.at + (b.hold ?? 0.9), soft: true});
    }
    if (b.type === 'person') {
      if (b.enter !== 'none') ev.push({kind: 'pop', at: b.at, n: 2});
      let lift = 0;
      for (const kf of b.keys || []) {
        if (kf.lift !== undefined) { ev.push(kf.lift > lift ? {kind: 'boing', at: kf.t} : {kind: 'slap', at: kf.t + (kf.dur ?? 0.4) * 0.36, soft: true}); lift = kf.lift; }
        if (kf.squash) ev.push({kind: 'slap', at: kf.t, soft: true});
      }
    }
    if (b.shake) ev.push({kind: 'slap', at: b.at});
    if (b.type === 'face') (b.moods || []).forEach((m) => ev.push({kind: m.mood === 'relief' || m.mood === 'grin' ? 'chime' : 'pop', at: m.t, n: 3}));
    if (b.accent) ev.push({kind: 'accent', at: b.at});
    if (b.type === 'path') {
      const d = b.dur ?? 1.2;
      if (d >= 0.4) ev.push({kind: draw('path'), at: b.at, dur: d});
      if (b.arrow && map.arrow === 'whoosh') ev.push({kind: 'whoosh', at: b.at + d * 0.4, soft: true});
    }
    if (b.type === 'morph') b.keys.forEach((k, i) => ev.push(i ? {kind: 'whoosh', at: k.t - 0.05, soft: true} : {kind: draw('path'), at: k.t, dur: 1.0}));
    if (b.type === 'label') {
      if (map.label === 'chalk') ev.push({kind: 'chalk', at: b.at + 0.4, dur: writeSecs(b.text)});
      else {
        ev.push({kind: 'click', at: b.at});
        const len = String(b.text).length;
        for (let i = 0; i < len; i += 2) ev.push({kind: 'tick', at: b.at + 0.5 + i * 0.035});
      }
    }
    if (b.type === 'dot') ev.push({kind: 'click', at: b.at, soft: true});
    if (b.type === 'splat') ev.push({kind: 'plop', at: b.at});
    if (b.type === 'stamp') ev.push({kind: 'stampHit', at: b.at});
    if (b.type === 'frame') ev.push({kind: draw('path'), at: b.at, dur: b.dur ?? 0.9});
    if (b.type === 'hero') {
      if (b.enter !== 'none') ev.push({kind: 'pop', at: b.at, n: 2});
      let shape = b.shape ?? 'circle', shat = 0;
      for (const kf of b.keys || []) {
        if (kf.shat !== undefined && kf.shat > 0.5 && shat <= 0.5) ev.push({kind: 'glass', at: kf.t});
        if (kf.shat !== undefined) shat = kf.shat;
        if (kf.shape === 'gem' && shape !== 'gem') { ev.push({kind: 'rise', at: kf.t - 0.5, soft: true}); ev.push({kind: 'chime', at: kf.t + (kf.dur ?? 0.5) * 0.8}); }
        else if (kf.shape && kf.shape !== shape) ev.push({kind: 'whoosh', at: kf.t, soft: true});
        if (kf.shape) shape = kf.shape;
        if (kf.core > 0.5) ev.push({kind: 'chime', at: kf.t + 0.1});
        if (kf.squash !== undefined || (kf.sx !== undefined && Math.abs(kf.sx - 1) > 0.3)) ev.push({kind: 'slap', at: kf.t, soft: true});
      }
    }
    if (b.type === 'text') {
      if (map.text === 'chalk') ev.push({kind: 'chalk', at: b.at, dur: (b.lines || []).reduce((n, l) => n + writeSecs(l) * 0.6 + 0.05, 0.4)});
      else if (map.text === 'pops') { const len = (b.lines || [b.text]).join('').length; for (let i = 0; i < len; i += 3) ev.push({kind: 'pop', at: b.at + i * 0.035, n: i, soft: true}); }
      else ev.push({kind: 'whoosh', at: b.at - 0.12});
    }
    if (b.type === 'note' && map.note === 'chalk') ev.push({kind: 'chalk', at: b.at, dur: writeSecs(b.text)});
    if (b.type === 'mark') ev.push({kind: draw('mark'), at: b.at, dur: b.dur ?? 0.5});
    if (b.type === 'travel') ev.push({kind: 'whoosh', at: b.at, soft: true});
    if (b.type === 'counter') for (let i = 0; i < 14; i++) ev.push({kind: 'tick', at: b.at + (b.dur ?? 1.4) * (1 - Math.pow(1 - i / 14, 1 / 5)) * 0.9});
  };
  if (map.gridIntro === 'flip') ev.push({kind: 'flip', at: 0});
  else if (map.gridIntro !== 'none') ev.push({kind: 'rise', at: 0});
  sb.scenes.forEach((s, i) => {
    s.blocks.forEach(walk);
    const next = sb.scenes[i + 1];
    // raw Vox scene changes: paper slides, the camera whooshes, a cut lands with a thump
    if (map.vox && next) { const tr = next.transition ?? 'cut'; if (tr === 'slide') V('slide', next.start - 0.05, 0.9, 0.6); else if (tr === 'pan' || tr === 'zoom') V('whoosh', next.start - 0.05, 0.9, 0.6); else V('thump', next.start, 1, 1); }
    if (next && next.transition === 'swipe') ev.push({kind: 'swipe', at: next.start - 0.32});
    else if (i < sb.scenes.length - 1 && map.sceneChange !== 'none') ev.push({kind: 'whoosh', at: s.end - 0.3, soft: map.sceneChange === 'whoosh' && sb.scenes[i + 1].transition !== 'iris' && !!map.text});
  });
  (sb.overlay || []).forEach(walk);
  if (map.end === 'flip') ev.push({kind: 'flip', at: Math.max(0, sb.duration - 0.7)});
  else if (map.end === 'chime') ev.push({kind: 'chime', at: Math.max(0, sb.duration - 1.2)});
  else if (map.end !== 'none') ev.push({kind: 'bell', at: Math.max(0, sb.duration - 2.0), end: true});
  if (map.vox && map.end === 'none') V('chime', Math.max(0, sb.duration - 1.5), 0.7, 1760);
  return ev;
}

export function renderSfx(sb, map = {}) {
  const out = new Float32Array(Math.ceil((sb.duration + 2.5) * SR));
  for (const e of collectEvents(sb, map)) {
    if (e.kind === 'vox') { add(out, voxSfx[e.v](...(e.args || [])), e.at, e.g ?? 1); continue; }
    if (e.kind === 'rise') add(out, sfx.rise(), 0, 0.6);
    if (e.kind === 'pencil') add(out, sfx.pencil(e.dur), e.at, 1);
    if (e.kind === 'chalk') add(out, sfx.chalk(e.dur), e.at, 1);
    if (e.kind === 'click') add(out, sfx.click(e.soft ? 1700 : 2300, e.soft ? 0.2 : 0.3), e.at);
    if (e.kind === 'tick') add(out, sfx.tick(), e.at, 0.7);
    if (e.kind === 'whoosh') add(out, sfx.whoosh(e.soft ? 0.7 : 0.55), e.at, e.soft ? 0.5 : 0.8);
    if (e.kind === 'accent') { add(out, sfx.thump(), e.at); add(out, map.accent === 'thump+chime' ? sfx.chime() : sfx.bell(1046.5, 2.6, 0.16), e.at + 0.02); }
    if (e.kind === 'pop') add(out, sfx.pop(420 + ((e.n ?? 0) % 7) * 70), e.at, e.soft ? 0.45 : 0.9);
    if (e.kind === 'shuffle') add(out, sfx.shuffle(), e.at, 0.9);
    if (e.kind === 'flip') add(out, sfx.flip(), e.at, 1);
    if (e.kind === 'plop') add(out, sfx.plop(), e.at, 0.9);
    if (e.kind === 'stampHit') add(out, sfx.stampHit(), e.at, 1);
    if (e.kind === 'swipe') add(out, sfx.swipe(), e.at, 0.9);
    if (e.kind === 'glass') add(out, sfx.glass(), e.at, 0.9);
    if (e.kind === 'tape') add(out, sfx.tape(), e.at, 0.8);
    if (e.kind === 'slap') add(out, sfx.slap(), e.at, e.soft ? 0.5 : 1);
    if (e.kind === 'boing') add(out, sfx.boing(), e.at, 0.8);
    if (e.kind === 'chime') add(out, sfx.chime(), e.at, 1);
    if (e.kind === 'bell') add(out, sfx.bell(659.25, 3, 0.2), e.at);
    if (e.kind === 'blip') add(out, sfx.blip(e.f, 0.5), e.at, e.g ?? 1);
    if (e.kind === 'stamp') add(out, sfx.stamp(), e.at, e.g ?? 1);
    if (e.kind === 'ding') add(out, sfx.ding(e.m, e.g), e.at);
    if (e.kind === 'tickf') add(out, sfx.tickf(e.f, e.g), e.at);
    if (e.kind === 'fall') add(out, sfx.fall(), e.at);
    if (e.kind === 'land') add(out, sfx.land(), e.at);
    if (e.kind === 'push') add(out, sfx.push(), e.at);
  }
  if (map.roomTone) add(out, sfx.roomTone(sb.duration), 0, 1);
  return reverb(out, 1.4, 0.18).subarray(0, Math.ceil(sb.duration * SR));
}

// ---------- score ----------
// Karplus Strong pluck: a burst of noise ringing in a short tuned delay, like a pizzicato string.
function pluck(midi, dur = 0.9, damp = 0.5, gain = 1) {
  const f = mtof(midi), N = Math.max(2, Math.round(SR / f)), n = Math.round(dur * SR), out = new Float32Array(n), line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = rnd();
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const j = i % N;
    const y = line[j];
    line[j] = (y * (1 - damp) + prev * damp) * 0.996;
    prev = y;
    out[i] = y * gain * Math.min(1, (n - i) / (0.05 * SR));
  }
  return out;
}

// Whimsical pizzicato band: bass on 1 and 3, offbeat chord plucks, a simple tune after two bars, shaker, woodblock, soft kick.
function renderPizzicato(sb, recipe) {
  const bpm = recipe.bpm ?? 112, beat = 60 / bpm, bar = beat * 4;
  const chords = recipe.chords ?? [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
  const D = sb.duration, n = Math.ceil(D * SR), out = new Float32Array(n);
  const bars = Math.ceil(D / bar);
  const tune = [4, 2, 0, 2, 4, 4, 2, -1, 0, 2, 4, 2, 0, -1, 2, -1]; // scale steps over each chord root, -1 rests
  const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14];
  const shakerHp = biquad('hp', 5000), shakerLp = biquad('lp', 12000);
  const endAt = D - 1.6;
  for (let b = 0; b < bars; b++) {
    const ch = chords[b % chords.length], t0 = b * bar;
    for (let q = 0; q < 4; q++) {
      const tb = t0 + q * beat;
      if (tb > endAt) break;
      if (q % 2 === 0) add(out, pluck(ch[0] - 12, 0.9, 0.55, 0.5), tb);
      if (q === 0) { // soft kick
        const k = new Float32Array(Math.round(0.2 * SR));
        let ph = 0;
        for (let i = 0; i < k.length; i++) { ph += (2 * Math.PI * (50 + 70 * Math.exp(-i / (0.02 * SR)))) / SR; k[i] = Math.sin(ph) * Math.exp(-i / (0.06 * SR)) * 0.35; }
        add(out, k, tb);
      }
      if (q % 2 === 1) { // woodblock on 2 and 4
        const w = new Float32Array(Math.round(0.06 * SR));
        for (let i = 0; i < w.length; i++) w[i] = Math.sin((2 * Math.PI * 1200 * i) / SR) * Math.exp(-i / (0.008 * SR)) * 0.12;
        add(out, w, tb);
      }
      // offbeat chord plucks
      ch.forEach((m, i) => add(out, pluck(m + 12, 0.5, 0.4, 0.2), tb + beat / 2 + i * 0.008));
      // shaker eighths
      for (let e = 0; e < 2; e++) {
        const s = new Float32Array(Math.round(0.05 * SR));
        for (let i = 0; i < s.length; i++) s[i] = shakerLp(shakerHp(rnd())) * Math.exp(-i / (0.012 * SR)) * (e ? 0.05 : 0.035);
        add(out, s, tb + (e * beat) / 2);
      }
      // tune, from the third bar
      if (b >= 2) {
        const step = tune[(b * 4 + q) % tune.length];
        if (step >= 0) add(out, pluck(ch[0] + 24 + scale[step], 0.7, 0.3, 0.3), tb);
      }
    }
  }
  // rising four note flourish and a high bell to finish
  [0, 4, 7, 12].forEach((s, i) => add(out, pluck(chords[0][0] + 24 + s, 0.8, 0.3, 0.4), endAt + i * (beat / 2)));
  add(out, sfx.bell(mtof(chords[0][0] + 48), 1.6, 0.1), Math.min(D - 0.8, endAt + 2 * beat));
  const wet = reverb(out, 1.2, 0.2);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    wet[i] *= Math.min(1, tt / 0.4) * Math.min(1, (D - tt) / 0.5);
  }
  return wet;
}

// Soft electric piano band: Rhodes chords, warm bass, light kick, snap and shaker, a few plucked notes on top.
function renderRhodes(sb, recipe) {
  const bpm = recipe.bpm ?? 92, beat = 60 / bpm, bar = beat * 4;
  const chords = recipe.chords ?? [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 57]];
  const D = sb.duration, n = Math.ceil(D * SR), out = new Float32Array(n);
  const bars = Math.ceil(D / bar);
  const rhodes = (midi, dur, g) => {
    const f = mtof(midi), L = Math.round(dur * SR), o = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      const tt = i / SR;
      const bellAmt = 1.6 * Math.exp(-tt / 0.18); // the tine: bright at the hit, mellow after
      const trem = 1 + 0.08 * Math.sin(2 * Math.PI * 4.6 * tt);
      o[i] = Math.sin(2 * Math.PI * f * tt + bellAmt * Math.sin(2 * Math.PI * f * 14 * tt) * 0.12 + 0.5 * Math.sin(2 * Math.PI * f * tt)) * Math.exp(-tt / (dur * 0.45)) * Math.min(1, i / 120) * Math.min(1, (L - i) / (0.05 * SR)) * trem * g;
    }
    return o;
  };
  const snapHp = biquad('hp', 1800), shHp = biquad('hp', 6000);
  const endAt = D - 2.2;
  for (let b = 0; b < bars; b++) {
    const ch = chords[b % chords.length], t0 = b * bar;
    if (t0 > endAt) break;
    // chord on 1, a softer push on the and of 2
    ch.forEach((m, i) => { add(out, rhodes(m + 12, bar * 0.9, 0.075), t0 + i * 0.012); add(out, rhodes(m + 12, bar * 0.4, 0.045), t0 + beat * 2.5 + i * 0.01); });
    // bass
    [0, 2.5].forEach((q) => {
      const f = mtof(ch[0] - 12), L = Math.round(beat * 1.6 * SR), o = new Float32Array(L);
      for (let i = 0; i < L; i++) { const tt = i / SR; o[i] = (Math.sin(2 * Math.PI * f * tt) + 0.25 * Math.sin(4 * Math.PI * f * tt)) * Math.exp(-tt / 0.5) * Math.min(1, i / 200) * 0.16; }
      add(out, o, t0 + q * beat);
    });
    for (let q = 0; q < 4; q++) {
      const tb = t0 + q * beat;
      if (b >= 1 && q % 2 === 0) { // light kick
        const kk = new Float32Array(Math.round(0.18 * SR));
        let ph = 0;
        for (let i = 0; i < kk.length; i++) { ph += (2 * Math.PI * (48 + 80 * Math.exp(-i / (0.018 * SR)))) / SR; kk[i] = Math.sin(ph) * Math.exp(-i / (0.055 * SR)) * 0.3; }
        add(out, kk, tb);
      }
      if (b >= 1 && q % 2 === 1) { // snap
        const sn = new Float32Array(Math.round(0.07 * SR));
        for (let i = 0; i < sn.length; i++) sn[i] = snapHp(rnd()) * Math.exp(-i / (0.009 * SR)) * 0.13;
        add(out, sn, tb);
      }
      if (b >= 2) for (let e = 0; e < 2; e++) { // shaker
        const sh = new Float32Array(Math.round(0.04 * SR));
        for (let i = 0; i < sh.length; i++) sh[i] = shHp(rnd()) * Math.exp(-i / (0.01 * SR)) * (e ? 0.04 : 0.025);
        add(out, sh, tb + (e * beat) / 2);
      }
      // plucked notes answering the chord, from the third bar
      if (b >= 2 && (q === 1 || q === 3)) add(out, pluck(ch[(b + q) % ch.length] + 24, 0.6, 0.35, 0.14), tb + beat / 2);
    }
  }
  // ringing last chord
  chords[0].forEach((m, i) => add(out, rhodes(m + 12, 2.6, 0.08), Math.max(0, endAt + 0.2) + i * 0.03));
  const wet = reverb(out, 1.8, 0.24);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    wet[i] *= Math.min(1, tt / 0.4) * Math.min(1, (D - tt) / 0.5);
  }
  return wet;
}

// Quirky minimalist band for hand drawn pages: a walking plucked bass, brushed snare, rim clicks, a toy piano
// that plays a few notes and rests, a kazoo like glide now and then, swung eighths. It goes quiet when the scene changes.
function renderQuirky(sb, recipe) {
  const bpm = recipe.bpm ?? 104, beat = 60 / bpm, bar = beat * 4, swing = beat * 0.18;
  const chords = recipe.chords ?? [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]];
  const D = sb.duration, n = Math.ceil(D * SR), out = new Float32Array(n);
  const bars = Math.ceil(D / bar);
  const changes = sb.scenes.slice(1).map((s) => s.start);
  const resting = (t) => changes.some((c) => t > c - 0.4 && t < c + 0.25);
  const endAt = D - 1.1;
  const brushHp = biquad('hp', 2200), brushLp = biquad('lp', 9000), shHp = biquad('hp', 6500);
  const toy = (midi, dur, g) => { // toy piano: a short bright bell with an out of tune overtone
    const f = mtof(midi), L = Math.round(dur * SR), o = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      const tt = i / SR;
      o[i] = (Math.sin(2 * Math.PI * f * tt) + 0.5 * Math.sin(2 * Math.PI * f * 4.07 * tt) * Math.exp(-tt / 0.05) + 0.25 * Math.sin(2 * Math.PI * f * 2.01 * tt)) * Math.exp(-tt / (dur * 0.3)) * Math.min(1, i / 60) * g;
    }
    return o;
  };
  const motif = [7, -1, 4, 5, -1, 2, 0, -1, 4, -1, 7, 9, -1, 5, 4, -1]; // semitones over the chord root, -1 rests
  for (let b = 0; b < bars; b++) {
    const ch = chords[b % chords.length], t0 = b * bar;
    if (t0 > endAt) break;
    const walk = [ch[0], ch[2], ch[1], ch[2] + (b % 2 ? -1 : 2)]; // root, fifth, third, a passing note
    for (let q = 0; q < 4; q++) {
      const tb = t0 + q * beat;
      if (tb > endAt) break;
      if (!resting(tb)) {
        add(out, pluck(walk[q] - 12, 0.5, 0.62, 0.5), tb);
        if (q === 0 && b >= 1) { // soft kick
          const kk = new Float32Array(Math.round(0.16 * SR));
          let ph = 0;
          for (let i = 0; i < kk.length; i++) { ph += (2 * Math.PI * (52 + 70 * Math.exp(-i / (0.02 * SR)))) / SR; kk[i] = Math.sin(ph) * Math.exp(-i / (0.05 * SR)) * 0.26; }
          add(out, kk, tb);
        }
        if (b >= 1 && q % 2 === 1) { // brushed snare on 2 and 4
          const sn = new Float32Array(Math.round(0.14 * SR));
          for (let i = 0; i < sn.length; i++) sn[i] = brushLp(brushHp(rnd())) * Math.sin(Math.PI * Math.min(1, i / (0.09 * SR))) * Math.exp(-i / (0.05 * SR)) * 0.14;
          add(out, sn, tb);
        }
        if (b >= 2 && q === 2) { // rim click
          const rc = new Float32Array(Math.round(0.03 * SR));
          for (let i = 0; i < rc.length; i++) rc[i] = Math.sin((2 * Math.PI * 1850 * i) / SR) * Math.exp(-i / (0.004 * SR)) * 0.1;
          add(out, rc, tb + beat * 0.75 + swing);
        }
        if (b >= 2) for (let e = 0; e < 2; e++) { // shaker, offbeats swung late
          const sh = new Float32Array(Math.round(0.04 * SR));
          for (let i = 0; i < sh.length; i++) sh[i] = shHp(rnd()) * Math.exp(-i / (0.01 * SR)) * (e ? 0.03 : 0.018);
          add(out, sh, tb + (e ? beat / 2 + swing : 0));
        }
      }
      // toy piano, from the second bar, a note or two per beat at most
      if (b >= 1 && !resting(tb)) {
        const step = motif[(b * 4 + q) % motif.length];
        if (step >= 0) add(out, toy(ch[0] + 24 + step, 0.5, 0.075), tb + swing * (q % 2));
      }
    }
    if (b % 4 === 3 && b >= 3 && t0 + bar < endAt && !resting(t0 + bar - 0.5)) { // kazoo like glide into the next phrase
      const L = Math.round(0.3 * SR), g = new Float32Array(L), f0 = mtof(ch[0] + 24);
      let ph = 0;
      for (let i = 0; i < L; i++) { const p = i / L; ph += (2 * Math.PI * f0 * (1 + 0.5 * p * p)) / SR; g[i] = (Math.sin(ph) + 0.4 * Math.sin(ph * 2)) * Math.sin(Math.PI * p) * 0.035; }
      add(out, g, t0 + bar - 0.35);
    }
  }
  // button ending: two plucks and a bell
  [0, 7].forEach((st, i) => add(out, pluck(chords[0][0] + 12 + st, 0.8, 0.35, 0.4), endAt + i * (beat / 2)));
  add(out, toy(chords[0][0] + 36, 1.1, 0.08), endAt + beat);
  const wet = reverb(out, 1.0, 0.16);
  for (let i = 0; i < n; i++) { const tt = i / SR; wet[i] *= Math.min(1, tt / 0.3) * Math.min(1, (D - tt) / 0.4); }
  return wet;
}

// Printed poster score: a vibraphone lounge loop (bass, shaker, a gentle answer line); over any journey scene the
// loop thins to slow arpeggios and a lone theremin line floats above them. Two echo taps give it space.
function renderVibes(sb, recipe) {
  const D = sb.duration, n = Math.ceil(D * SR), out = new Float32Array(n);
  const bpm = recipe.bpm ?? 96, beat = 60 / bpm, bar = beat * 4;
  const chords = recipe.chords ?? [[48, [64, 67, 71, 74]], [45, [64, 67, 72, 76]], [50, [65, 69, 72, 76]], [43, [65, 69, 71, 74]]];
  const put = (at, len, fn) => { const s0 = Math.floor(at * SR); for (let i = 0; i < len * SR && s0 + i < n; i++) if (s0 + i >= 0) out[s0 + i] += fn(i / SR, i); };
  const vibe = (at, m, g = 1, dur = 2.6) => { const f = mtof(m); put(at, dur, (t) => g * Math.min(1, t * 400) * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6) + 0.28 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 6)) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 5.2 * t))); };
  const bass = (at, m, g = 1) => { const f = mtof(m); put(at, 0.7, (t) => g * Math.min(1, t * 200) * Math.exp(-t * 4.5) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t))); };
  const shaker = (at, g) => { let lp = 0; put(at, 0.06, (t) => { const r = rnd(); lp += 0.35 * (r - lp); return g * (r - lp) * Math.exp(-t * 70); }); };
  const space = [];
  for (const sc of sb.scenes) for (const b of sc.blocks) if (b.type === 'posterJourney') space.push({start: b.at, fall: b.fallAt ?? b.at + 9});
  const inSpace = (t) => space.some((j) => t > j.start + 0.5 && t < j.fall - 0.4);
  for (let b = 0; b * bar < D - 0.5; b++) {
    const t0 = b * bar, sp = inSpace(t0), [root, notes] = chords[b % chords.length], last = t0 + bar > D - 1.4;
    notes.forEach((m, i) => vibe(t0 + i * (sp ? 0.31 : 0.06), m, sp ? 0.2 : 0.17, sp ? 3.2 : 2.6));
    if (last) { [60, 64, 67, 71, 74, 79].forEach((m, i) => vibe(D - 1.1 + i * 0.07, m, 0.2, 1.4)); bass(D - 1.1, 36, 0.5); break; }
    if (!sp) {
      [0, 1.5, 2, 3].forEach((q, i) => bass(t0 + q * beat, root + [0, 0, 7, 12][i] - 12, 0.42));
      for (let e = 0; e < 8; e++) shaker(t0 + (e * beat) / 2 + (e % 2 ? 0.03 : 0), e % 2 ? 0.22 : 0.12);
      vibe(t0 + 2.5 * beat, notes[3] + (b % 2 ? 2 : -2), 0.11, 1.2);
    }
  }
  for (const j of space) {
    const a = j.start + 0.3, z = j.fall - 0.2, len = Math.max(1, z - a), line = [76, 79, 77, 74, 72].map((m, i, arr) => [a + (i * len) / arr.length, m]);
    let ph = 0;
    put(a, len, (t) => {
      const T = t + a; let q = 0;
      while (q < line.length - 1 && line[q + 1][0] <= T) q++;
      const nx = line[Math.min(q + 1, line.length - 1)], gl = Math.min(1, Math.max(0, (T - (nx[0] - 0.35)) / 0.35));
      const m = line[q][1] + (nx[1] - line[q][1]) * (q < line.length - 1 ? gl : 0);
      ph += (2 * Math.PI * mtof(m + 0.25 * Math.sin(2 * Math.PI * 5.5 * t))) / SR;
      return 0.07 * Math.min(1, t * 2) * Math.min(1, (len - t) * 1.5) * Math.sin(ph);
    });
  }
  for (const [d, g] of [[0.19, 0.22], [0.31, 0.16], [0.47, 0.1]]) { const o = Math.floor(d * SR); for (let i = n - 1; i >= o; i--) out[i] += out[i - o] * g; }
  return out;
}

export function renderScore(sb, recipe = {}) {
  if (recipe.kind === 'vibes') return renderVibes(sb, recipe);
  if (recipe.kind === 'quirky') return renderQuirky(sb, recipe);
  if (recipe.kind === 'pizzicato') return renderPizzicato(sb, recipe);
  if (recipe.kind === 'rhodes') return renderRhodes(sb, recipe);
  const bpm = recipe.bpm ?? 75, beat = 60 / bpm, bar = beat * 4;
  const chords = recipe.chords ?? [[45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64]];
  const D = sb.duration, n = Math.ceil(D * SR), out = new Float32Array(n);
  const scenes = sb.scenes;
  const ctaStart = scenes[scenes.length - 1].start;
  const changes = scenes.slice(0, -1).map((s) => s.end);
  const bars = Math.ceil(D / bar) + 1;
  const lift = recipe.ctaLift ?? 12;

  // pad
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const isEnd = t0 + bar >= D - 0.01;
    const ch = isEnd ? chords[0] : chords[b % chords.length];
    const inCta = t0 + bar * 0.5 >= ctaStart;
    const notes = inCta ? [...ch, ch[ch.length - 2] + lift] : ch;
    const len = bar + 1.6;
    const s0 = Math.round(t0 * SR), L = Math.round(len * SR);
    notes.forEach((m, vi) => {
      [-4, 0, 4].forEach((cents) => {
        const f = mtof(m + cents / 100);
        const g = (m < 50 ? 0.05 : 0.035) / (1 + vi * 0.15);
        for (let i = 0; i < L && s0 + i < n; i++) {
          const tt = i / SR;
          const env = Math.min(1, tt / 1.2) * Math.min(1, (len - tt) / 1.6);
          out[s0 + i] += Math.sin(2 * Math.PI * f * tt + vi) * env * g;
        }
      });
    });
    // sub
    const fs = mtof(ch[0] - 12);
    for (let i = 0; i < L && s0 + i < n; i++) {
      const tt = i / SR;
      out[s0 + i] += Math.sin(2 * Math.PI * fs * tt) * Math.min(1, tt / 1.5) * Math.min(1, (len - tt) / 1.6) * 0.05;
    }
  }
  // plucked eighth note arpeggio from bar 2, resting near scene changes
  const lp = biquad('lp', recipe.lowpass ?? 1600);
  const arp = new Float32Array(n);
  const start = ((recipe.arpFromBar ?? 2) - 1) * bar;
  for (let t = start, k = 0; t < D - 1.5; t += beat / 2, k++) {
    if (changes.some((c) => t > c - 0.45 && t < c + 0.35)) continue;
    const b = Math.floor(t / bar);
    const ch = chords[b % chords.length];
    const pat = [2, 3, 4, 3, 1, 3, 4, 2];
    let m = ch[pat[k % 8]] + 12;
    if (t >= ctaStart) m += 12 * (k % 4 === 3 ? 1 : 0);
    const f = mtof(m), L = Math.round(0.9 * SR), s0 = Math.round(t * SR);
    for (let i = 0; i < L && s0 + i < n; i++) {
      const tt = i / SR;
      arp[s0 + i] += (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt)) * Math.exp(-tt / 0.22) * Math.min(1, i / 40) * 0.05;
    }
  }
  // optional echo taps on the plucks, a dotted eighth apart
  if (recipe.echo) {
    const dl = Math.round(beat * 0.75 * SR);
    for (let i = dl; i < n; i++) arp[i] += arp[i - dl] * recipe.echo;
  }
  for (let i = 0; i < n; i++) out[i] += lp(arp[i]);
  const wet = reverb(out, recipe.reverb ?? 3, 0.38);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    wet[i] *= Math.min(1, tt / 0.6) * Math.min(1, (D - tt) / 1.2);
  }
  return wet;
}

// ---------- mix helpers ----------
export function envelope(vo, attack = 0.03, release = 0.35) {
  const a = Math.exp(-1 / (attack * SR)), r = Math.exp(-1 / (release * SR));
  const env = new Float32Array(vo.length);
  let e = 0;
  for (let i = 0; i < vo.length; i++) {
    const x = Math.abs(vo[i]);
    e = x > e ? a * e + (1 - a) * x : r * e + (1 - r) * x;
    env[i] = e;
  }
  let mx = 0;
  for (const v of env) mx = Math.max(mx, v);
  for (let i = 0; i < env.length; i++) env[i] = Math.min(1, env[i] / (mx * 0.5 || 1));
  return env;
}

export const rms = (b) => {
  let s = 0, c = 0;
  for (const v of b) if (Math.abs(v) > 1e-4) { s += v * v; c++; }
  return Math.sqrt(s / (c || 1));
};

export function wav(buf) {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

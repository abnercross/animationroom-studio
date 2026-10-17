import React from 'react';
import {Block} from './blocks';
import {StyleTokens, clamp, gray, outFade, progress} from './lib';

// Engine 1.6 (Space Age Poster): flat printed shapes, stipple shading, a sunburst ground, words laid down
// in two inks slightly out of register, and one hero object that carries the film.
// Everything is opt in: it only draws for blocks named poster*, and the ground only for background.type "poster".
// Colours come from the style's palette (cream, paper, navy, deep, orange, rust, peach, mustard, teal, tealD ...).

const W = 1080;
const H = 1920;

const pc = (k: StyleTokens, name: string | undefined, fallback = 'cream') => gray((k.palette && name && k.palette[name]) ?? (k.palette && k.palette[fallback]) ?? '#000');
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const ease = (t: number, at: number, d: number) => outCubic(progress(t, at, d));
const pop = (t: number, at: number, d = 0.42) => {
  if (t < at) return 0;
  const p = progress(t, at, d) - 1;
  return 1 + 2.70158 * p * p * p + 1.70158 * p * p;
};
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const display = (k: StyleTokens) => `"${k.fonts.headline}", "Arial Narrow", sans-serif`;
const round = (k: StyleTokens) => `"${k.fonts.ui}", "Futura", sans-serif`;
// Display font is condensed: about 0.47 em per character. Poppins is wide: about 0.66.
const fitD = (text: string, w: number, max: number) => Math.min(max, w / (Math.max(1, text.length) * 0.47));
const fitR = (text: string, w: number, max: number) => Math.min(max, w / (Math.max(1, text.length) * 0.66));

type P = {b: Block; t: number; k: StyleTokens};

// ---------- shared definitions: stipple filters and shading gradients ----------
export const PosterDefs: React.FC<{k: StyleTokens}> = ({k}) => (
  <>
    {([['pstStipDeep', 'deep'], ['pstStipRust', 'rust'], ['pstStipTealD', 'tealD']] as const).map(([id, col]) => (
      <filter key={id} id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={4} result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.3" result="na" />
        <feComposite in="SourceGraphic" in2="na" operator="arithmetic" k1={0} k2={1} k3={1} k4={-1} result="c" />
        <feComponentTransfer in="c" result="th">
          <feFuncA type="linear" slope={30} intercept={0} />
        </feComponentTransfer>
        <feFlood floodColor={pc(k, col, 'navy')} result="f" />
        <feComposite in="f" in2="th" operator="in" />
      </filter>
    ))}
    <linearGradient id="pstDown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.1" stopColor="#000" stopOpacity={0} />
      <stop offset="1" stopColor="#000" stopOpacity={0.8} />
    </linearGradient>
    <linearGradient id="pstUp" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0.2" stopColor="#000" stopOpacity={0} />
      <stop offset="1" stopColor="#000" stopOpacity={0.7} />
    </linearGradient>
    <linearGradient id="pstDiag" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.25" stopColor="#000" stopOpacity={0} />
      <stop offset="1" stopColor="#000" stopOpacity={0.85} />
    </linearGradient>
    <radialGradient id="pstEdge" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0.45" stopColor="#000" stopOpacity={0} />
      <stop offset="1" stopColor="#000" stopOpacity={0.9} />
    </radialGradient>
  </>
);

const Burst: React.FC<{cx: number; cy: number; r: number; n: number; color: string; rot: number}> = ({cx, cy, r, n, color, rot}) => (
  <g transform={`rotate(${rot} ${cx} ${cy})`}>
    {Array.from({length: n}).map((_, i) => {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI / n) * 0.9;
      return <path key={i} d={`M${cx} ${cy} L${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r} L${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r}Z`} fill={color} />;
    })}
  </g>
);

// Twinkling stars and sparkles, placed by a fixed hash so a scene always looks the same.
const Spark: React.FC<{x: number; y: number; s: number; color: string; rot?: number}> = ({x, y, s, color, rot = 0}) => (
  <path transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} d="M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10Z" fill={color} />
);
const Stars: React.FC<{t: number; k: StyleTokens; n?: number; seed?: number; yMax?: number}> = ({t, k, n = 46, seed = 0, yMax = H}) => (
  <g>
    {Array.from({length: n}).map((_, i) => {
      const q = i + seed * 100;
      const x = rand(q) * W;
      const y = rand(q + 0.5) * yMax;
      const big = rand(q + 0.9) > 0.72;
      const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + rand(q + 0.3) * 2) + q);
      const col = pc(k, rand(q + 0.7) > 0.75 ? 'mustard' : 'cream');
      return big ? <Spark key={i} x={x} y={y} s={(1.2 + rand(q + 0.2) * 1.6) * tw} color={col} /> : <circle key={i} cx={x} cy={y} r={2 + rand(q + 0.1) * 3} fill={col} opacity={0.5 + 0.5 * tw} />;
    })}
  </g>
);

// ---------- the ground: one chapter colour with a slowly turning sunburst and a stippled falloff ----------
export const PosterBg: React.FC<{t: number; k: StyleTokens; kind?: string; seed?: number}> = ({t, k, kind, seed = 1}) => {
  const grounds = k.poster?.grounds ?? {};
  const g = grounds[kind ?? ''] ?? grounds[Object.keys(grounds)[0]] ?? {base: 'navy', ray: 'navy'};
  const spin = g.spin ?? 3;
  return (
    <g>
      <rect width={W} height={H} fill={pc(k, g.base, 'navy')} />
      <g opacity={g.rayOpacity ?? 1}>
        <Burst cx={540} cy={1000} r={1500} n={16} color={pc(k, g.ray, g.base)} rot={(g.base === 'navy' ? -1 : 1) * t * spin} />
      </g>
      {g.stip && (
        <g filter={`url(#pstStip${g.stip})`}>
          <rect width={W} height={H} fill="url(#pstDown)" />
        </g>
      )}
      {g.stars && <Stars t={t} k={k} n={34} seed={seed} yMax={H * 0.8} />}
    </g>
  );
};

// ---------- text ----------
const Txt: React.FC<{x: number; y: number; size: number; fill: string; font: string; weight: number; anchor?: 'start' | 'middle' | 'end'; ls?: number; opacity?: number; len?: number; children: React.ReactNode}> = ({x, y, size, fill, font, weight, anchor = 'middle', ls = 0, opacity = 1, len, children}) => (
  <text x={x} y={y} fontSize={size} fill={fill} fontFamily={font} fontWeight={weight} textAnchor={anchor} letterSpacing={ls} opacity={opacity} textLength={len} lengthAdjust={len ? 'spacingAndGlyphs' : undefined}>
    {children}
  </text>
);

// posterWord: one piece of text laid down the poster way.
//   mode ink      wiped on at a slant, second ink sliding into register
//   mode register main ink appears, second ink drifts in
//   mode stamp    pops in oversized and settles (len stretches it to a fixed width)
//   mode kicker   small spaced capitals
//   mode pill     capitals in a rounded label
export const PosterWord: React.FC<P> = ({b, t, k}) => {
  const text: string = b.text ?? '';
  const mode: string = b.mode ?? 'ink';
  const x = b.x ?? 540;
  const y = b.y ?? 640;
  const w = b.w ?? 900;
  const fill = pc(k, b.color, 'cream');
  const shadow = pc(k, b.shadow, 'orange');
  const o = outFade(t, b.out);
  const id = `pstink-${Math.round(b.at * 1000)}-${Math.round(y)}`;
  if (mode === 'kicker') {
    const p = ease(t, b.at, 0.4);
    return <Txt x={x} y={y + (1 - p) * 30} size={fitR(text, 960, b.size ?? 46)} fill={fill} font={round(k)} weight={700} ls={8} opacity={p * o}>{text}</Txt>;
  }
  if (mode === 'pill') {
    const s = ease(t, b.at, 0.4);
    if (s <= 0) return null;
    const pw = b.pw ?? Math.max(420, text.length * 34 + 90);
    const h = b.h ?? 96;
    const size = b.size ?? h * 0.62;
    return (
      <g opacity={o} transform={`translate(${x} ${y}) scale(${s} 1)`}>
        <rect x={-pw / 2 + 8} y={-h / 2 + 8} width={pw} height={h} rx={h / 2} fill={pc(k, 'deep', 'navy')} opacity={0.35} />
        <rect x={-pw / 2} y={-h / 2} width={pw} height={h} rx={h / 2} fill={pc(k, b.fill ?? 'mustard', 'mustard')} />
        <Txt x={0} y={size * 0.36} size={fitD(text, pw - 60, size)} fill={fill} font={display(k)} weight={900}>{text}</Txt>
      </g>
    );
  }
  const size = fitD(text, w, b.size ?? 330);
  if (mode === 'stamp') {
    const s = pop(t, b.at);
    if (s <= 0) return null;
    return (
      <g opacity={o} transform={`translate(${x} ${y - size * 0.35}) scale(${s}) translate(${-x} ${-(y - size * 0.35)})`}>
        <Txt x={x + size * 0.022} y={y + size * 0.022} size={size} fill={shadow} font={display(k)} weight={900} len={b.len}>{text}</Txt>
        <Txt x={x} y={y} size={size} fill={fill} font={display(k)} weight={900} len={b.len}>{text}</Txt>
      </g>
    );
  }
  if (mode === 'register') {
    const p = ease(t, b.at, 0.22);
    if (p <= 0) return null;
    const r = ease(t, b.at + 0.05, 0.65);
    const off = size * 0.022;
    return (
      <g opacity={p * o}>
        <Txt x={x + off + (1 - r) * 110} y={y + off - (1 - r) * 70} size={size} fill={shadow} font={display(k)} weight={900}>{text}</Txt>
        <Txt x={x} y={y + (1 - p) * 24} size={size} fill={fill} font={display(k)} weight={900}>{text}</Txt>
      </g>
    );
  }
  // ink
  const dur = b.dur ?? 0.5;
  const p = inOut(progress(t, b.at, dur));
  if (p <= 0) return null;
  const r = ease(t, b.at + dur * 0.5, 0.45);
  const off = size * 0.022;
  const tw = Math.min(w, text.length * size * 0.5);
  const l = x - tw / 2 - 40;
  const span = (tw + 160) * p;
  return (
    <g opacity={o}>
      <clipPath id={id}>
        <polygon points={`${l},${y - size} ${l + span},${y - size} ${l + span - 80},${y + size * 0.3} ${l},${y + size * 0.3}`} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <Txt x={x + off + (1 - r) * 46} y={y + off - (1 - r) * 30} size={size} fill={shadow} font={display(k)} weight={900} opacity={r}>{text}</Txt>
        <Txt x={x} y={y} size={size} fill={fill} font={display(k)} weight={900}>{text}</Txt>
      </g>
    </g>
  );
};

// ---------- the hero object ----------
const rtones: Record<string, [string, string, string]> = {
  orange: ['peach', 'orange', 'rust'],
  teal: ['tealL', 'teal', 'tealD'],
  mustard: ['mustardL', 'mustard', 'mustardD'],
  navy: ['navyLL', 'navy', 'deep'],
};

// HeroArt: the drawing itself. (x, y) is the centre, s the half height; sx, sy squash it; dots (0..1) fills a cube with matter.
export const HeroArt: React.FC<{k: StyleTokens; kind?: string; tone?: string; s: number; x: number; y: number; rot?: number; sx?: number; sy?: number; dots?: number; opacity?: number; shadow?: boolean}> = ({k, kind = 'cube', tone = 'orange', s, x, y, rot = 0, sx = 1, sy = 1, dots = 0, opacity = 1, shadow = true}) => {
  const [lt, md, dk] = (rtones[tone] ?? rtones.orange).map((n) => pc(k, n, 'orange'));
  const a = 0.866 * s;
  const h = 0.5 * s;
  const spots: [number, number][] = [];
  if (kind === 'cube') {
    for (let i = 0; i < 21; i++) {
      const u = 0.12 + rand(i + 3) * 0.76;
      const v = 0.12 + rand(i + 40) * 0.76;
      const f = i % 3;
      if (f === 0) spots.push([(u - v) * a, -s + (u + v) * h]);
      else if (f === 1) spots.push([-a + u * a, -h + u * h + v * s]);
      else spots.push([u * a, v * s - u * h]);
    }
  }
  const sh = pc(k, 'deep', 'navy');
  return (
    <g opacity={opacity} transform={`translate(${x} ${y + s}) rotate(${rot} 0 ${-s}) scale(${sx} ${sy}) translate(0 ${-s})`}>
      {kind === 'cube' && (
        <g>
          {shadow && <polygon points={`6,${-s + 8} ${a + 6},${-h + 8} ${a + 6},${h + 8} 6,${s + 8} ${-a + 6},${h + 8} ${-a + 6},${-h + 8}`} fill={sh} opacity={0.28} />}
          <polygon points={`0,${-s} ${a},${-h} 0,0 ${-a},${-h}`} fill={lt} />
          <polygon points={`${-a},${-h} 0,0 0,${s} ${-a},${h}`} fill={md} />
          <polygon points={`${a},${-h} 0,0 0,${s} ${a},${h}`} fill={dk} />
          <g filter="url(#pstStipRust)"><polygon points={`${-a},${-h} 0,0 0,${s} ${-a},${h}`} fill="url(#pstDown)" /></g>
          <g filter="url(#pstStipDeep)"><polygon points={`${a},${-h} 0,0 0,${s} ${a},${h}`} fill="url(#pstDown)" /></g>
          {spots.map(([px, py], i) => {
            const kk = clamp(dots * 21 - i);
            return kk > 0 ? <circle key={i} cx={px} cy={py} r={s * 0.07 * kk} fill={i % 3 === 0 ? pc(k, 'cream') : pc(k, 'mustard')} /> : null;
          })}
        </g>
      )}
      {kind === 'orb' && (
        <g>
          {shadow && <circle cx={8} cy={10} r={s * 0.98} fill={sh} opacity={0.28} />}
          <circle r={s * 0.98} fill={md} />
          <circle cx={-s * 0.22} cy={-s * 0.24} r={s * 0.55} fill={lt} opacity={0.85} />
          <g filter="url(#pstStipDeep)"><circle r={s * 0.98} fill="url(#pstEdge)" /></g>
        </g>
      )}
      {kind === 'pyramid' && (
        <g>
          {shadow && <polygon points={`6,${-s + 8} ${a + 6},${h + 8} 6,${s * 0.95 + 8} ${-a + 6},${h + 8}`} fill={sh} opacity={0.28} />}
          <polygon points={`0,${-s} ${-a},${h} 0,${s * 0.95}`} fill={md} />
          <polygon points={`0,${-s} ${a},${h} 0,${s * 0.95}`} fill={dk} />
          <polygon points={`0,${-s} ${-a},${h} 0,${h * 0.1}`} fill={lt} opacity={0.6} />
          <g filter="url(#pstStipRust)"><polygon points={`0,${-s} ${-a},${h} 0,${s * 0.95}`} fill="url(#pstDown)" /></g>
          <g filter="url(#pstStipDeep)"><polygon points={`0,${-s} ${a},${h} 0,${s * 0.95}`} fill="url(#pstDown)" /></g>
        </g>
      )}
    </g>
  );
};

// posterHero: the one object that travels through the film. kind cube | orb | pyramid, tone orange | teal | mustard | navy.
// x, y is the centre, s the half height. dots (0..1) fills a cube with matter, or fillAt does it over 1.3 s with matter flying in.
// bob makes it hover, pulse breathes, scale pops it in and sizes it.
export const PosterHero: React.FC<P> = ({b, t, k}) => {
  const enter = pop(t, b.at, 0.5) * (b.scale ?? 1);
  if (enter <= 0) return null;
  const bob = Math.sin(t * 1.4) * 9 * (b.bob ?? 0);
  const rot = (b.rot ?? 0) + Math.sin(t * 0.7) * 6 * (b.bob ?? 0);
  const x = b.x ?? 540;
  const y = b.y ?? 960;
  const s: number = b.s ?? 190;
  const pulse = 1 + (b.pulse ?? 0) * Math.sin(t * 3);
  const fill = b.fillAt !== undefined ? progress(t, b.fillAt, 1.3) : (b.dots ?? 0);
  return (
    <g opacity={outFade(t, b.out)}>
      {b.fillAt !== undefined && (b.kind ?? 'cube') === 'cube' &&
        Array.from({length: 26}).map((_, i) => {
          const p = inOut(progress(t, b.fillAt - 0.1 + i * 0.045, 0.55));
          if (p <= 0 || p >= 1) return null;
          const a = rand(i + 9) * Math.PI * 2;
          const r0 = 560 + rand(i) * 200;
          return <circle key={i} cx={lerp(x + Math.cos(a) * r0, x + (rand(i + 2) - 0.5) * 200, p)} cy={lerp(y + Math.sin(a) * r0, y + (rand(i + 5) - 0.5) * 200, p)} r={15} fill={pc(k, i % 3 ? 'mustard' : 'cream')} />;
        })}
      <HeroArt k={k} kind={b.kind} tone={b.tone} s={s} x={x} y={y + bob} rot={rot} sx={enter * pulse} sy={enter * pulse} dots={fill} />
    </g>
  );
};

// ---------- posterRing: a number counts up inside a ring ----------
const fmt = (n: number, dec = 0) => n.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec});
export const PosterRing: React.FC<P> = ({b, t, k}) => {
  const dur = b.dur ?? 1.1;
  const p = ease(t, b.at, dur);
  const R = b.r ?? 340;
  const circ = 2 * Math.PI * R;
  const done = b.at + dur;
  const thump = t >= done ? 1 + 0.07 * Math.exp(-(t - done) * 6) : 1;
  const text = `${b.prefix ?? ''}${fmt((b.value ?? 0) * p, b.decimals ?? 0)}${b.suffix ?? ''}`;
  const sz = fitD(text, R * 1.65, 300);
  const enter = pop(t, b.at - 0.6 < 0 ? 0 : b.at - 0.6, 0.5);
  return (
    <g opacity={outFade(t, b.out)} transform={`translate(${b.x ?? 540} ${b.y ?? 880}) scale(${enter * thump})`}>
      <circle r={R + 20} fill={pc(k, 'deep', 'navy')} opacity={0.3} transform="translate(10 12)" />
      <circle r={R} fill={pc(k, 'deep', 'navy')} opacity={0.55} />
      <circle r={R} fill="none" stroke={pc(k, 'cream')} strokeOpacity={0.18} strokeWidth={26} />
      <circle r={R} fill="none" stroke={pc(k, b.color ?? 'mustard', 'mustard')} strokeWidth={26} strokeLinecap="round" strokeDasharray={`${circ * p} ${circ}`} transform="rotate(-90)" />
      <Txt x={0} y={sz * 0.34} size={sz} fill={pc(k, 'cream')} font={display(k)} weight={900}>{text}</Txt>
    </g>
  );
};

// ---------- posterCards: two to four items, each a card that slides in on its own spoken word ----------
export const PosterCards: React.FC<P> = ({b, t, k}) => {
  const items: {text: string; at: number}[] = b.items ?? [];
  const CW = b.width ?? 900;
  const y0 = b.y ?? 540;
  const dy = b.dy ?? (items.length > 3 ? 255 : 290);
  return (
    <g opacity={outFade(t, b.out)}>
      {items.map((it, i) => {
        const p = ease(t, it.at, 0.45);
        if (p <= 0) return null;
        const y = y0 + i * dy;
        const dir = i % 2 ? 1 : -1;
        const accent = pc(k, i % 2 ? 'teal' : 'orange');
        return (
          <g key={i} transform={`translate(${(1 - p) * dir * 1100} 0)`}>
            <rect x={98} y={y - 90} width={CW} height={210} rx={34} fill={pc(k, 'deep', 'navy')} opacity={0.4} />
            <rect x={80} y={y - 108} width={CW} height={210} rx={34} fill={pc(k, 'cream')} />
            <rect x={80} y={y - 108} width={190} height={210} rx={34} fill={accent} />
            <rect x={200} y={y - 108} width={70} height={210} fill={accent} />
            <Txt x={175} y={y + 34} size={130} fill={pc(k, 'cream')} font={display(k)} weight={900}>{String(i + 1)}</Txt>
            <Txt x={305} y={y + 38} size={fitD(it.text, CW - 260, 118)} fill={pc(k, 'navy')} font={display(k)} weight={900} anchor="start">{it.text}</Txt>
            {t > it.at + 0.3 && (
              <g transform={`translate(${CW + 40} ${y - 70}) rotate(${t * 40}) scale(${2.2 * pop(t, it.at + 0.3)})`}>
                <path d="M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10Z" fill={pc(k, 'mustard')} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

// ---------- posterBanner: a band across the frame whose verdict changes ----------
// texts: [{text, at, fill, color}] shown one after another, each with its own colours.
export const PosterBanner: React.FC<P> = ({b, t, k}) => {
  const texts: {text: string; at: number; fill?: string; color?: string}[] = b.texts ?? [];
  let cur = -1;
  texts.forEach((x, i) => {
    if (t >= x.at) cur = i;
  });
  if (cur < 0) return null;
  const x = texts[cur];
  const s = pop(t, x.at, 0.3);
  return (
    <g opacity={outFade(t, b.out)} transform={`translate(540 ${b.y ?? 960})`}>
      <rect x={-560} y={-84} width={1120} height={168} fill={pc(k, x.fill ?? (cur ? 'orange' : 'mustard'))} />
      <rect x={-560} y={-98} width={1120} height={8} fill={pc(k, 'cream')} />
      <rect x={-560} y={90} width={1120} height={8} fill={pc(k, 'cream')} />
      <g transform={`scale(${s})`}>
        <Txt x={0} y={46} size={fitD(x.text, 1040, 132)} fill={pc(k, x.color ?? (cur ? 'cream' : 'navy'))} font={display(k)} weight={900} ls={4}>{x.text}</Txt>
      </g>
    </g>
  );
};


// ---------- shared small pieces ----------
const Arrow: React.FC<{x: number; y: number; len: number; w: number; dir: number; color: string; shadow?: string}> = ({x, y, len, w, dir, color, shadow}) => {
  const d = `M0 0 L${-w * 1.1} ${-w} L${-w * 1.1} ${-w * 0.42} L${-len} ${-w * 0.42} L${-len} ${w * 0.42} L${-w * 1.1} ${w * 0.42} L${-w * 1.1} ${w}Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${dir})`}>
      {shadow && <path d={d} fill={shadow} transform="translate(10 10)" />}
      <path d={d} fill={color} />
    </g>
  );
};

// posterArrow: a flat arrow. dir in degrees (0 points right, 90 down, 180 left). The tip is at x, y.
export const PosterArrow: React.FC<P> = ({b, t, k}) => {
  const p = ease(t, b.at, 0.4);
  if (p <= 0) return null;
  const move = b.bounce ? Math.sin(t * 6) * (b.bounce as number) : 0;
  const vertical = Math.abs(((b.dir ?? 0) % 180) - 90) < 1;
  return (
    <g opacity={outFade(t, b.out)}>
      <Arrow x={(b.x ?? 540) + (vertical ? 0 : move)} y={(b.y ?? 960) + (vertical ? move : 0)} len={(b.len ?? 150) * p} w={(b.w ?? 52) * Math.min(1, p * 2)} dir={b.dir ?? 0} color={pc(k, b.color ?? 'mustard', 'mustard')} shadow={b.shadow ? pc(k, b.shadow) : undefined} />
    </g>
  );
};

// posterSparks: sparkles that pop in one after another. points: [[x, y, size]]. colors alternate.
export const PosterSparks: React.FC<P> = ({b, t, k}) => {
  const pts: number[][] = b.points ?? [];
  const cols: string[] = b.colors ?? ['teal', 'orange'];
  if (t < b.at) return null;
  return (
    <g opacity={outFade(t, b.out)}>
      {pts.map(([x, y, sz], i) => (
        <Spark key={i} x={x} y={y} s={sz * pop(t, b.at + 0.1 + i * (b.step ?? 0.07))} color={pc(k, cols[i % cols.length])} rot={t * 30} />
      ))}
    </g>
  );
};

// posterStars: the starfield on its own, for panels that sit over a plain colour
export const PosterStars: React.FC<P> = ({b, t, k}) => <Stars t={t} k={k} n={b.n ?? 26} seed={b.seed ?? 8} yMax={b.yMax ?? 880} />;

// posterPanel: a band of colour across the frame. fill, y, h; stars adds a starfield; ground adds a planet horizon with stipple.
export const PosterPanel: React.FC<P> = ({b, t, k}) => {
  const y = b.y ?? 0;
  const h = b.h ?? H;
  const e = b.at !== undefined && b.at > 0 ? ease(t, b.at, 0.4) : 1;
  return (
    <g opacity={e * outFade(t, b.out)}>
      <rect y={y} width={W} height={h} fill={pc(k, b.fill ?? 'navy', 'navy')} />
      {b.stars && <Stars t={t} k={k} n={b.stars} seed={b.seed ?? 8} yMax={y + h - 80} />}
      {b.ground && (
        <>
          <circle cx={540} cy={3050} r={1500} fill={pc(k, 'teal')} />
          <g filter="url(#pstStipDeep)"><rect y={1540} width={W} height={380} fill="url(#pstDown)" /></g>
        </>
      )}
    </g>
  );
};

// posterBar: a band that wipes across. Use it behind a word as a highlight, or over one as a strike through.
export const PosterBar: React.FC<P> = ({b, t, k}) => {
  const w = (b.w ?? 960) * ease(t, b.at, b.dur ?? 0.45);
  if (w <= 0) return null;
  return <rect opacity={(b.opacity ?? 1) * outFade(t, b.out)} x={b.x ?? 60} y={b.y ?? 900} width={w} height={b.h ?? 100} rx={b.rx ?? (b.h ?? 100) / 2} fill={pc(k, b.color ?? 'mustard', 'mustard')} />;
};

// posterButton: the closing ask, stamped last. Rounded button with an arrow.
export const PosterButton: React.FC<P> = ({b, t, k}) => {
  const s = pop(t, b.at);
  if (s <= 0) return null;
  const text: string = b.text ?? '';
  const size = fitR(text, 440, 62);
  return (
    <g opacity={outFade(t, b.out)} transform={`translate(${b.x ?? 540} ${b.y ?? 1380}) scale(${s})`}>
      <rect x={-330} y={-73} width={680} height={170} rx={85} fill={pc(k, 'deep', 'navy')} opacity={0.4} />
      <rect x={-340} y={-85} width={680} height={170} rx={85} fill={pc(k, b.fill ?? 'mustard', 'mustard')} />
      <Txt x={-40} y={size * 0.36} size={size} fill={pc(k, 'navy')} font={round(k)} weight={700} ls={4}>{text}</Txt>
      <Arrow x={290} y={0} len={70} w={34} dir={0} color={pc(k, 'navy')} />
    </g>
  );
};

// ---------- hook pieces ----------
// posterTile: a mystery card holding the hero object and a question mark. tone teal | orange is the card colour.
export const PosterTile: React.FC<P> = ({b, t, k}) => {
  const s = pop(t, b.at);
  if (s <= 0) return null;
  const teal = (b.tone ?? 'teal') === 'teal';
  const ph = b.phase ?? 0;
  return (
    <g opacity={outFade(t, b.out)} transform={`translate(${b.x ?? 300} ${b.y ?? 640}) scale(${s})`}>
      <rect x={-152} y={-168} width={320} height={380} rx={40} fill={pc(k, 'deep', 'navy')} opacity={0.28} />
      <rect x={-160} y={-178} width={320} height={380} rx={40} fill={pc(k, teal ? 'teal' : 'orange')} />
      <g filter={teal ? 'url(#pstStipDeep)' : 'url(#pstStipRust)'}><rect x={-160} y={-178} width={320} height={380} rx={40} fill="url(#pstDown)" /></g>
      <rect x={-104} y={-134} width={208} height={208} rx={34} fill={pc(k, 'cream')} />
      <HeroArt k={k} kind={b.kind} tone={b.heroTone ?? (teal ? 'orange' : 'navy')} x={0} y={-30 + Math.sin(t * 2 + ph) * 8} s={62} rot={Math.sin(t * 1.5 + ph) * 8} shadow={false} />
      <Txt x={0} y={170} size={92} fill={pc(k, 'cream')} font={round(k)} weight={700}>?</Txt>
    </g>
  );
};

// posterSlots: empty dashed letter slots that fill the row one by one, then vanish when the word lands (until).
export const PosterSlots: React.FC<P> = ({b, t, k}) => {
  const n = Math.max(2, Math.min(8, b.n ?? 4));
  const gap = 24;
  const sw = (900 - (n - 1) * gap) / n;
  const y = b.y ?? 1272;
  if (b.until !== undefined && t > b.until + 0.1) return null;
  return (
    <g opacity={outFade(t, b.out)}>
      {Array.from({length: n}).map((_, i) => {
        const a = pop(t, b.at + i * 0.16, 0.35);
        return a > 0 ? (
          <g key={i} transform={`translate(${90 + sw / 2 + i * (sw + gap)} ${y}) scale(${a}) rotate(${Math.sin(t * 5 + i) * 1.5})`}>
            <rect x={-sw / 2} y={-170} width={sw} height={340} rx={22} fill="none" stroke={pc(k, 'navy')} strokeWidth={6} strokeDasharray="18 16" opacity={0.4} />
            <Txt x={0} y={46} size={130} fill={pc(k, 'navy')} font={display(k)} weight={900} opacity={0.22 + 0.12 * Math.sin(t * 6 - i)}>?</Txt>
          </g>
        ) : null;
      })}
    </g>
  );
};

// ---------- posterSplit: the frame cuts in two, each half owns one term, a badge says how they relate ----------
// top and bottom: {label, labelAt, word, wordAt}. badge neq | vs | plus | arrow, badgeAt.
export const PosterSplit: React.FC<P> = ({b, t, k}) => {
  const s0 = b.at;
  const inP = ease(t, s0, 0.45);
  const bAt = b.badgeAt ?? s0 + 3;
  const gap = ease(t, bAt, 0.4) * 46;
  const badge = pop(t, bAt);
  const top = b.top ?? {};
  const bot = b.bottom ?? {};
  const kind = b.badge ?? 'neq';
  const navy = pc(k, 'navy');
  const word = (w: any, y: number, fill: string, shadow: string, at0: number) => {
    const txt: string = w.word ?? '';
    const at = w.wordAt ?? at0;
    const p = ease(t, at, 0.22);
    if (p <= 0) return null;
    const r = ease(t, at + 0.05, 0.65);
    const size = fitD(txt, 840, 470);
    const off = size * 0.022;
    return (
      <g opacity={p}>
        <Txt x={540 + off + (1 - r) * 110} y={y + off - (1 - r) * 70} size={size} fill={shadow} font={display(k)} weight={900}>{txt}</Txt>
        <Txt x={540} y={y + (1 - p) * 24} size={size} fill={fill} font={display(k)} weight={900}>{txt}</Txt>
      </g>
    );
  };
  const label = (w: any, y: number, fill: string, at0: number) => {
    if (!w.label) return null;
    const p = ease(t, w.labelAt ?? at0, 0.4);
    return <Txt x={540} y={y + (1 - p) * 30} size={fitR(w.label, 960, 56)} fill={fill} font={round(k)} weight={700} ls={8} opacity={p}>{w.label}</Txt>;
  };
  return (
    <g opacity={outFade(t, b.out)}>
      <rect width={W} height={H} fill={pc(k, 'cream')} opacity={t > bAt - 0.1 ? 1 : 0} />
      <g transform={`translate(0 ${-(1 - inP) * 960 - gap})`}>
        <rect width={W} height={960} fill={navy} />
        <g filter="url(#pstStipDeep)"><rect width={W} height={960} fill="url(#pstUp)" /></g>
        <Stars t={t} k={k} n={14} seed={3} yMax={300} />
        {label(top, 280, pc(k, 'mustard'), s0 + 0.3)}
        {word(top, 680, pc(k, 'cream'), pc(k, 'orange'), s0 + 0.35)}
      </g>
      <g transform={`translate(0 ${960 + (1 - inP) * 960 + gap})`}>
        <rect width={W} height={960} fill={pc(k, 'orange')} />
        <g filter="url(#pstStipRust)"><rect width={W} height={960} fill="url(#pstDown)" /></g>
        {label(bot, 290, pc(k, 'cream'), s0 + 1.2)}
        {word(bot, 700, navy, pc(k, 'mustard'), s0 + 1.3)}
      </g>
      {badge > 0 && (
        <g transform={`translate(540 960) scale(${badge}) rotate(${-8 + Math.sin(t * 3) * 4})`}>
          <Burst cx={0} cy={0} r={165} n={14} color={navy} rot={t * 20} />
          <circle r={130} fill={pc(k, 'mustard')} />
          {kind === 'neq' && (
            <>
              <rect x={-62} y={-34} width={124} height={22} rx={6} fill={navy} />
              <rect x={-62} y={12} width={124} height={22} rx={6} fill={navy} />
              <rect x={-11} y={-78} width={22} height={156} rx={6} fill={navy} transform="rotate(28)" />
            </>
          )}
          {kind === 'plus' && (
            <>
              <rect x={-62} y={-11} width={124} height={22} rx={6} fill={navy} />
              <rect x={-11} y={-62} width={22} height={124} rx={6} fill={navy} />
            </>
          )}
          {kind === 'arrow' && <Arrow x={70} y={0} len={130} w={50} dir={0} color={navy} />}
          {kind === 'vs' && <Txt x={0} y={36} size={110} fill={navy} font={display(k)} weight={900}>VS</Txt>}
        </g>
      )}
    </g>
  );
};

// ---------- posterGauge: an arrow leans on the hero, pushes it, then pulls it back while a gauge measures it ----------
// leanAt, pushAt, pullAt, gaugeAt. kind and tone pick the hero.
export const PosterGauge: React.FC<P> = ({b, t, k}) => {
  const leanAt = b.leanAt ?? b.at + 0.9;
  const pushAt = b.pushAt ?? b.at + 3.5;
  const pullAt = b.pullAt ?? pushAt + 0.65;
  const lean = ease(t, leanAt, 2.4);
  const push = ease(t, pushAt, 0.35);
  const pull = ease(t, pullAt, 0.4);
  const bx = 540 + push * 190 - pull * 190;
  const squash = 1 - 0.05 * lean * (1 - push) - 0.12 * Math.sin(progress(t, pushAt, 0.35) * Math.PI) - 0.12 * Math.sin(progress(t, pullAt, 0.4) * Math.PI);
  const pushIn = ease(t, leanAt - 0.4, 0.5);
  const strain = Math.sin(t * 22) * 3 * lean * (1 - push);
  const kick = (at: number) => (t >= at ? Math.exp(-(t - at) * 7) * Math.sin((t - at) * 30) * 10 : 0);
  const needle = 26 * lean + strain * 0.8 + push * 44 - pull * 132 + kick(pushAt) + kick(pullAt);
  const g = pop(t, b.gaugeAt ?? leanAt - 0.4);
  const navy = pc(k, 'navy');
  const enter = pop(t, b.at, 0.5);
  return (
    <g opacity={outFade(t, b.out)}>
      {g > 0 && (
        <g transform={`translate(540 878) scale(${g})`}>
          <path d="M-150 14 A150 150 0 0 1 150 14Z" fill={navy} />
          <path d="M-128 0 A128 128 0 0 1 128 0Z" fill={pc(k, 'cream')} />
          <path d="M-128 0 A128 128 0 0 1 -90.5 -90.5 L-64 -64 A90 90 0 0 0 -90 0Z" fill={pc(k, 'mustard')} />
          <path d="M128 0 A128 128 0 0 0 90.5 -90.5 L64 -64 A90 90 0 0 1 90 0Z" fill={pc(k, 'orange')} />
          {Array.from({length: 9}).map((_, i) => {
            const a = ((-180 + i * 22.5) * Math.PI) / 180;
            return <line key={i} x1={Math.cos(a) * 98} y1={Math.sin(a) * 98} x2={Math.cos(a) * 120} y2={Math.sin(a) * 120} stroke={navy} strokeWidth={i % 2 ? 4 : 8} strokeLinecap="round" />;
          })}
          <g transform={`rotate(${needle})`}><path d="M-9 0 L0 -112 L9 0Z" fill={navy} /></g>
          <circle r={18} fill={navy} />
          <rect x={-150} y={8} width={300} height={16} rx={8} fill={navy} />
        </g>
      )}
      <rect x={60} y={1348} width={960} height={14} rx={7} fill={navy} />
      {Array.from({length: 12}).map((_, i) => <path key={i} d={`M${96 + i * 82} 1362 l-18 34 h10 l18 -34Z`} fill={navy} />)}
      {enter > 0 && <HeroArt k={k} kind={b.kind} tone={b.tone} s={205} x={bx} y={1140} sx={squash * enter} sy={(2 - squash) * enter} />}
      {t < pullAt - 0.05 && pushIn > 0 && <Arrow x={lerp(40, 356, pushIn) + strain + push * 190} y={1140} len={300} w={95} dir={0} color={pc(k, 'mustard')} shadow={pc(k, 'tealD')} />}
      {t >= pullAt - 0.05 && <Arrow x={bx - 470 - (1 - pull) * 40} y={1140} len={300} w={95} dir={180} color={pc(k, 'cream')} shadow={pc(k, 'tealD')} />}
      {[0, 1, 2].map((i) => {
        const p = progress(t, pushAt + i * 0.04, 0.4);
        return p > 0 && p < 1 ? <rect key={i} x={bx - 330 - i * 30} y={1040 + i * 90} width={90} height={12} rx={6} fill={pc(k, 'cream')} opacity={1 - p} /> : null;
      })}
    </g>
  );
};

// ---------- posterSteps: a dashed path draws itself station by station, a bright dot travels it ----------
export const PosterSteps: React.FC<P> = ({b, t, k}) => {
  const items: {text: string; at: number}[] = b.items ?? [];
  const n = items.length;
  const y0 = b.y ?? 620;
  const dy = Math.min(310, 1000 / Math.max(1, n - 1));
  const X = b.x ?? 200;
  const yAt = (i: number) => y0 + i * dy;
  let dotY = yAt(0);
  let cur = -1;
  items.forEach((it, i) => {
    if (t >= it.at) cur = i;
  });
  if (cur >= 0) {
    const nx = Math.min(n - 1, cur + 1);
    dotY = lerp(yAt(cur), yAt(nx), cur < n - 1 ? inOut(progress(t, items[nx].at - 0.45, 0.45)) : 0);
  }
  const textCol = pc(k, b.color ?? 'cream');
  return (
    <g opacity={outFade(t, b.out)}>
      {items.slice(1).map((it, i) => {
        const p = ease(t, it.at - 0.45, 0.45);
        return <line key={i} x1={X} y1={yAt(i)} x2={X} y2={lerp(yAt(i), yAt(i + 1), p)} stroke={pc(k, 'mustard')} strokeWidth={14} strokeLinecap="round" strokeDasharray="2 26" />;
      })}
      {items.map((it, i) => {
        const s = pop(t, it.at, 0.4);
        const on = t >= it.at;
        return s > 0 ? (
          <g key={i}>
            <g transform={`translate(${X} ${yAt(i)}) scale(${s})`}>
              <circle r={66} fill={pc(k, 'deep', 'navy')} opacity={0.35} transform="translate(8 9)" />
              <circle r={64} fill={pc(k, i % 2 ? 'teal' : 'orange')} />
              <Txt x={0} y={34} size={96} fill={pc(k, 'cream')} font={display(k)} weight={900}>{String(i + 1)}</Txt>
            </g>
            <Txt x={330 + (1 - ease(t, it.at, 0.4)) * 80} y={yAt(i) + 38} size={fitD(it.text, 640, 118)} fill={textCol} font={display(k)} weight={900} anchor="start" opacity={ease(t, it.at, 0.35)}>{it.text}</Txt>
            {on && <circle cx={X} cy={yAt(i)} r={90 * (1 - progress(t, it.at, 0.5))} fill="none" stroke={pc(k, 'mustard')} strokeWidth={8} opacity={1 - progress(t, it.at, 0.5)} />}
          </g>
        ) : null;
      })}
      {cur >= 0 && <circle cx={X} cy={dotY} r={26} fill={pc(k, 'mustard')} stroke={pc(k, 'cream')} strokeWidth={6} />}
    </g>
  );
};

// ---------- posterRecap: two cards sweep in from opposite sides and stamp one word each ----------
// cards: [{label, big, word, wordAt, cardAt}]. kind and tone pick the hero shown on the first card.
export const PosterRecap: React.FC<P> = ({b, t, k}) => {
  const s0 = b.at;
  const cards: any[] = b.cards ?? [];
  const navy = pc(k, 'navy');
  const card = (c: any, i: number) => {
    if (!c) return null;
    const p = ease(t, c.cardAt ?? s0 + (i ? 1.7 : 0.1), 0.5);
    const first = i === 0;
    const y = first ? 312 : 972;
    const x = first ? 84 : 96;
    const wAt = c.wordAt ?? s0 + 1 + i * 1.8;
    const sw = pop(t, wAt);
    const size = fitD(c.word || '', 400, 190);
    const wordFill = pc(k, first ? 'mustard' : 'cream');
    return (
      <g key={i} transform={`translate(${(1 - p) * (first ? -1100 : 1100)} 0) rotate(${first ? -2 : 2} 540 ${first ? 600 : 1250})`}>
        <rect x={x + 18} y={y + 20} width={900} height={540} rx={36} fill={first ? pc(k, 'mustard') : navy} />
        <rect x={x} y={y} width={900} height={540} rx={36} fill={first ? navy : pc(k, 'orange')} />
        <g filter={first ? 'url(#pstStipDeep)' : 'url(#pstStipRust)'}><rect x={x} y={y} width={900} height={540} rx={36} fill="url(#pstDown)" /></g>
        <Txt x={x + 56} y={y + 158} size={fitR(c.label || '', 560, 46)} fill={first ? pc(k, 'mustard') : pc(k, 'cream')} font={round(k)} weight={700} ls={8} anchor="start">{c.label}</Txt>
        <Txt x={x + 56} y={y + 458} size={fitD(c.big || '', 420, 330)} fill={first ? pc(k, 'cream') : navy} font={display(k)} weight={900} anchor="start">{c.big}</Txt>
        {sw > 0 && (
          <g transform={`translate(${x + 616} ${y + 428 - size * 0.35}) scale(${sw}) translate(${-(x + 616)} ${-(y + 428 - size * 0.35)})`}>
            <Txt x={x + 616} y={y + 428} size={size} fill={wordFill} font={display(k)} weight={900} len={Math.min(400, (c.word || '').length * 70)}>{c.word}</Txt>
          </g>
        )}
        {first ? (
          <g transform={`translate(${x + 796} ${y + 88}) scale(${pop(t, s0 + 0.6)})`}>
            <HeroArt k={k} kind={b.kind} tone={b.tone} x={0} y={0} s={62} dots={1} />
          </g>
        ) : (
          <g transform={`translate(${x + 844} ${y + 98}) scale(${pop(t, s0 + 2.1)})`}>
            <Arrow x={0} y={0} len={150} w={48} dir={0} color={pc(k, 'cream')} />
          </g>
        )}
      </g>
    );
  };
  const last = cards[1]?.wordAt ?? s0 + 3.6;
  return (
    <g opacity={outFade(t, b.out)}>
      {card(cards[0], 0)}
      {card(cards[1], 1)}
      {t > last + 0.05 && (
        <PosterSparks b={{type: 'posterSparks', at: last, points: [[110, 250, 4], [980, 930, 5], [90, 1620, 4.5], [960, 1640, 3]]}} t={t} k={k} />
      )}
    </g>
  );
};

// ---------- posterJourney: the hero floats in space, the camera tilts, the hero falls onto solid ground ----------
// Two readout cards stay on screen: the first holds steady, the second counts to a new value.
// at (scene start), fallAt, tiltAt, farAt, gravityAt, kicker + kickerAt, pill + pillAt, gravityLabel, lowerLabel + lowerLabelAt,
// readouts: [{label, value, at, tickAt}, {label, value, at, countTo, unit, decimals, countAt, doneAt}].
const Planet: React.FC<{k: StyleTokens; x: number; y: number; r: number; t: number}> = ({k, x, y, r, t}) => (
  <g transform={`translate(${x} ${y}) rotate(-18)`}>
    <ellipse rx={r * 1.75} ry={r * 0.42} fill="none" stroke={pc(k, 'cream')} strokeWidth={r * 0.1} opacity={0.9} />
    <circle r={r} fill={pc(k, 'mustard')} />
    <path d={`M${-r} ${-r * 0.2} Q0 ${-r * 0.5} ${r} ${-r * 0.2} L${r} ${r * 0.05} Q0 ${-r * 0.25} ${-r} ${r * 0.05}Z`} fill={pc(k, 'orange')} opacity={0.75} />
    <g filter="url(#pstStipDeep)"><circle r={r} fill="url(#pstEdge)" /></g>
    <path d={`M${-r * 1.75} 0 A${r * 1.75} ${r * 0.42} 0 0 0 ${r * 1.75} 0`} fill="none" stroke={pc(k, 'cream')} strokeWidth={r * 0.1} />
    <circle cx={Math.cos(t * 0.8) * r * 1.75} cy={Math.sin(t * 0.8) * r * 0.42} r={r * 0.09} fill={pc(k, 'orange')} />
  </g>
);
const Readout: React.FC<{k: StyleTokens; y: number; label: string; value: string; show: number; dx?: number; s?: number; accent: string; valueColor?: string; tick?: number}> = ({k, y, label, value, show, dx = 0, s = 1, accent, valueColor, tick = 0}) =>
  show <= 0 ? null : (
    <g transform={`translate(${540 + dx} ${y}) scale(${s})`} opacity={Math.min(1, show * 2)}>
      <rect x={-422} y={-68} width={860} height={150} rx={26} fill={pc(k, 'deep', 'navy')} opacity={0.5} />
      <rect x={-430} y={-78} width={860} height={150} rx={26} fill={pc(k, 'cream')} />
      <rect x={-430} y={-78} width={290} height={150} rx={26} fill={accent} />
      <rect x={-180} y={-78} width={40} height={150} fill={accent} />
      <Txt x={-285} y={20} size={fitR(label, 250, 58)} fill={pc(k, 'cream')} font={round(k)} weight={700} ls={3}>{label}</Txt>
      <Txt x={-100} y={34} size={fitD(value, 470, 104)} fill={valueColor ?? pc(k, 'navy')} font={display(k)} weight={900} anchor="start">{value}</Txt>
      {tick > 0 && (
        <g transform={`translate(350 -4) scale(${tick})`}>
          <circle r={48} fill={pc(k, 'teal')} />
          <path d="M-22 2 L-6 18 L24 -16" fill="none" stroke={pc(k, 'cream')} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );

export const PosterJourney: React.FC<P> = ({b, t, k}) => {
  const s0 = b.at;
  const fallAt = b.fallAt ?? s0 + 9;
  const tiltAt = b.tiltAt ?? fallAt - 0.15;
  const landAt = fallAt + 0.75;
  const tilt = inOut(progress(t, tiltAt, 1.0));
  const far = ease(t, b.farAt ?? fallAt - 1.5, 1.2);
  const bob = Math.sin(t * 1.3) * 18;
  const rot = Math.sin(t * 0.7) * 9;
  const fall = progress(t, fallAt, 0.75);
  const fallE = fall * fall;
  const by = t < fallAt ? 900 + bob : lerp(900 + bob * (1 - fall), 1048, fallE);
  const brot = t < fallAt ? rot : rot * (1 - fall);
  const sq = t >= landAt ? 1 + 0.22 * Math.exp(-(t - landAt) * 9) * Math.cos((t - landAt) * 26) : 1;
  const enter = pop(t, s0 + 0.25, 0.6);
  const [r0, r1] = (b.readouts ?? [{}, {}]) as any[];
  const gAt = b.gravityAt ?? landAt + 0.4;
  const arrowIn = ease(t, gAt, 0.4);
  const arrowPulse = Math.sin(t * 6) * 12;
  const cAt = r1?.countAt ?? landAt + 2.1;
  const done = r1?.doneAt ?? cAt + 0.7;
  const counting = r1?.countTo !== undefined && t >= cAt;
  const count = (r1?.countTo ?? 0) * ease(t, cAt, 0.7);
  const earthY = lerp(2700, 0, tilt);
  const drift = Math.sin(t * 0.5) * 22;
  const wScale = 1 + 0.1 * ease(t, cAt, 0.3) + (t >= done ? 0.08 * Math.exp(-(t - done) * 6) : 0);
  const m1 = ease(t, r0?.at ?? s0 + 4, 0.5);
  const m2 = ease(t, r1?.at ?? s0 + 6, 0.5);
  const cid = `pstgnd-${Math.round(s0 * 1000)}`;
  const cream = pc(k, 'cream');
  const mustard = pc(k, 'mustard');
  const orange = pc(k, 'orange');
  const teal = pc(k, 'teal');
  return (
    <g opacity={outFade(t, b.out)}>
      <rect width={W} height={H} fill={pc(k, 'deep', 'navy')} />
      <g filter="url(#pstStipTealD)" opacity={0.6}><rect width={W} height={H} fill="url(#pstDiag)" /></g>
      <g transform={`translate(0 ${-tilt * 260})`}>
        <Stars t={t} k={k} n={60} seed={1} />
        <g opacity={1 - tilt}>
          <path d="M-100 520 Q540 260 1180 620" fill="none" stroke={cream} strokeWidth={5} strokeDasharray="4 26" strokeLinecap="round" opacity={0.5} />
          <path d="M-100 1320 Q500 1120 1180 1260" fill="none" stroke={cream} strokeWidth={5} strokeDasharray="4 26" strokeLinecap="round" opacity={0.35} />
          <g transform={`translate(${far * 90} ${-far * 80}) translate(850 380) scale(${1 - far * 0.35}) translate(-850 -380)`}>
            <Planet k={k} x={850} y={380} r={120} t={t} />
          </g>
          <g transform={`translate(${-far * 80} ${far * 60})`}>
            <circle cx={150} cy={1190} r={62 * (1 - far * 0.4)} fill={teal} />
            <g filter="url(#pstStipDeep)"><circle cx={150} cy={1190} r={62 * (1 - far * 0.4)} fill="url(#pstEdge)" /></g>
          </g>
        </g>
      </g>
      <g transform={`translate(0 ${earthY})`}>
        <circle cx={540} cy={2700} r={1500} fill="#5FB3B0" opacity={0.25} />
        <circle cx={540} cy={2700} r={1452} fill={teal} />
        <clipPath id={cid}><circle cx={540} cy={2700} r={1452} /></clipPath>
        <g clipPath={`url(#${cid})`}>
          <path d="M-40 1380 Q90 1320 230 1345 Q330 1362 350 1430 Q300 1470 330 1530 Q345 1590 300 1650 Q230 1705 150 1662 Q90 1722 -40 1700Z" fill={mustard} />
          <path d="M1120 1370 Q960 1315 840 1350 Q770 1380 800 1450 Q860 1490 820 1560 Q780 1640 880 1690 Q1000 1730 1120 1680Z" fill={mustard} />
          <ellipse cx={705} cy={1462} rx={38} ry={20} fill={mustard} />
          <path d="M-40 1790 Q300 1740 540 1770 Q800 1800 1120 1760 L1120 1940 L-40 1940Z" fill={pc(k, 'tealD')} opacity={0.6} />
          <g filter="url(#pstStipDeep)"><rect x={0} y={1240} width={W} height={700} fill="url(#pstDown)" /></g>
          {[[70, 1392, 200], [130, 1430, 120], [840, 1386, 180], [900, 1424, 110]].map(([x, y, w], i) => (
            <rect key={i} x={x + drift * (i % 2 ? 1 : -1)} y={y} width={w} height={24} rx={12} fill={cream} opacity={0.92} />
          ))}
        </g>
      </g>
      {t >= landAt && t < landAt + 0.7 &&
        [-1, 1].map((d) =>
          [0, 1, 2].map((i) => {
            const p = progress(t, landAt, 0.5 + i * 0.08);
            return <circle key={`${d}${i}`} cx={540 + d * (170 + p * (90 + i * 50))} cy={1255 - p * (20 + i * 26)} r={(26 - i * 6) * (1 - p)} fill={cream} />;
          }),
        )}
      {enter > 0 && <HeroArt k={k} kind={b.kind} tone={b.tone} x={540} y={by} s={190} rot={brot} sx={enter * (2 - sq)} sy={enter * sq} />}
      {t < fallAt + 0.4 && (
        <g opacity={1 - progress(t, fallAt - 0.2, 0.4)}>
          {b.kicker && <Txt x={540} y={330 + (1 - ease(t, b.kickerAt ?? s0 + 0.3, 0.4)) * 30} size={fitR(b.kicker, 960, 56)} fill={mustard} font={round(k)} weight={700} ls={8} opacity={ease(t, b.kickerAt ?? s0 + 0.3, 0.4)}>{b.kicker}</Txt>}
          {b.pill && (() => {
            const sc = ease(t, b.pillAt ?? s0 + 1, 0.4);
            const pw = Math.max(400, b.pill.length * 34 + 90);
            return sc > 0 ? (
              <g transform={`translate(540 ${1215 + bob * 0.4}) scale(${sc} 1)`}>
                <rect x={-pw / 2 + 8} y={-52 + 8} width={pw} height={104} rx={52} fill={pc(k, 'deep', 'navy')} opacity={0.35} />
                <rect x={-pw / 2} y={-52} width={pw} height={104} rx={52} fill={cream} />
                <Txt x={0} y={104 * 0.62 * 0.36} size={fitD(b.pill, pw - 60, 104 * 0.62)} fill={pc(k, 'navy')} font={display(k)} weight={900}>{b.pill}</Txt>
              </g>
            ) : null;
          })()}
        </g>
      )}
      {arrowIn > 0 && (
        <g>
          <Arrow x={540} y={800 + arrowPulse} len={195 * arrowIn + 25} w={100 * Math.min(1, arrowIn * 2)} dir={90} color={mustard} shadow={pc(k, 'deep', 'navy')} />
          {b.gravityLabel && <Txt x={680} y={700} size={50} fill={cream} font={round(k)} weight={700} ls={8} anchor="start" opacity={arrowIn}>{b.gravityLabel}</Txt>}
        </g>
      )}
      {t >= fallAt && b.lowerLabel && (
        <Txt x={540} y={1610 + (1 - ease(t, b.lowerLabelAt ?? fallAt, 0.4)) * 30} size={fitR(b.lowerLabel, 960, 50)} fill={cream} font={round(k)} weight={700} ls={8} opacity={ease(t, b.lowerLabelAt ?? fallAt, 0.4)}>{b.lowerLabel}</Txt>
      )}
      {r0 && <Readout k={k} y={lerp(1420, 285, tilt)} label={r0.label || ''} value={r0.value || ''} show={m1} dx={(1 - m1) * -900} accent={pc(k, 'navy')} tick={r0.tickAt !== undefined ? pop(t, r0.tickAt) : 0} />}
      {r1 && <Readout k={k} y={lerp(1600, 462, tilt)} label={r1.label || ''} value={counting ? `${fmt(count, r1.decimals ?? 1)} ${r1.unit || ''}` : r1.value || ''} show={m2} dx={(1 - m2) * 900} s={wScale} accent={counting ? orange : teal} valueColor={counting ? orange : pc(k, 'navy')} />}
      {t >= done && r1?.countTo !== undefined &&
        [[965, 380, 4], [90, 545, 3.2], [985, 560, 2.6]].map(([x, y, sz], i) => <Spark key={i} x={x} y={y} s={sz * pop(t, done + i * 0.06)} color={i % 2 ? cream : mustard} rot={t * 40} />)}
    </g>
  );
};

export const POSTER_BLOCKS = [
  'posterWord', 'posterHero', 'posterRing', 'posterCards', 'posterBanner',
  'posterArrow', 'posterSparks', 'posterStars', 'posterPanel', 'posterBar', 'posterButton',
  'posterTile', 'posterSlots', 'posterSplit', 'posterGauge', 'posterSteps', 'posterRecap', 'posterJourney',
];

// Engine 1.8: the raw Vox look. Paper cards on flat grounds, halftone cut outs with a white edge and a soft shadow,
// marker lines, highlighter swipes, rubber stamps, sticky chips and handwritten notes, a camera that travels a board
// bigger than the frame, and scene changes that slide, pan or zoom. A style turns all of this on with the token "vox";
// every other style keeps the engine's own path (Animate.tsx) untouched.
import React from 'react';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {getBoundingBox, getPointAtLength, getTangentAtLength, getLength} from '@remotion/paths';
import type {Block} from './blocks';
import type {AnimateProps, Scene} from './Animate';
import {StyleTokens, gray, mergeTokens} from './lib';
import {HAND, HEBREW, PRINT, SERIF, fontsReady} from './fonts';

const GRAIN = 'tex/vox-grain.png';

// ---------- timing ----------
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const prog = (t: number, at: number, d = 0.5) => (d <= 0 ? (t >= at ? 1 : 0) : clamp((t - at) / d));
const eo = (x: number) => 1 - Math.pow(1 - x, 3);
const ei = (x: number) => x * x * x;
const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x: number) => {
  if (x <= 0) return 0;
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const fadeOut = (t: number, out?: number, d = 0.3) => (out === undefined ? 1 : 1 - prog(t, out, d));
const mixHex = (a: string, b: string, k: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(lerp(v, pb[i], k)).toString(16).padStart(2, '0')).join('');
};

// ---------- colours: palette names from the style, with the look's own defaults ----------
const DEFAULTS: Record<string, string> = {
  ink: '#141414', cream: '#ECE5D6', paper: '#F7F3EA', parchment: '#E9DEC3', ivory: '#F8F2E2', navy: '#2a3442', yellow: '#FFD43B', red: '#D2312A',
  mute: '#4a4436', forge: '#2b2420', tan: '#B9A27A', stone: '#CFC6B4', brown: '#5b4a3a', wood: '#8a5a2b', steel: '#3b3d42', silver: '#cfd3da',
  sky: '#9DB7C2', river: '#6E93A3', skin: '#D8B48A', pink: '#F0B9AE', line: '#c9bfa8', white: '#ffffff', grey: '#9aa3ad', orange: '#ff8a2a',
  amber: '#ffb347', sepia: '#7a6a4c', storm: '#4b4d55', gold: '#c9a24a', clay: '#b5653a', green: '#7d9a5a',
};
type K = StyleTokens;
const col = (k: K, c: unknown, fb = 'ink'): string => {
  const name = c === undefined || c === null ? fb : String(c);
  const p = k.palette?.[name];
  if (p !== undefined) return gray(p);
  if (DEFAULTS[name]) return DEFAULTS[name];
  if (['ink', 'mid', 'soft', 'fill', 'dark', 'bg'].includes(name)) return gray((k as any)[name]);
  return /^#/.test(name) ? name : DEFAULTS[fb] ?? '#141414';
};

// ---------- type ----------
type FontName = 'print' | 'serif' | 'italic' | 'hand' | 'hebrew';
const FONTS: Record<FontName, {family: string; weight: number; style: 'normal' | 'italic'; ls: number}> = {
  print: {family: PRINT, weight: 400, style: 'normal', ls: 2},
  serif: {family: SERIF, weight: 700, style: 'normal', ls: 1},
  italic: {family: SERIF, weight: 400, style: 'italic', ls: 0},
  hand: {family: HAND, weight: 500, style: 'normal', ls: 0},
  hebrew: {family: HEBREW, weight: 700, style: 'normal', ls: 0},
};
const fontOf = (f?: string) => FONTS[(f as FontName) in FONTS ? (f as FontName) : 'print'];
let measureCtx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
// Width of a line of text in px, measured with the bundled fonts (they are loaded before the first frame is drawn).
export const textWidth = (text: string, font: string | undefined, size: number, ls?: number) => {
  const f = fontOf(font);
  const spacing = ls ?? f.ls;
  const key = `${f.family}|${f.weight}|${f.style}|${size}|${spacing}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  let w = text.length * size * 0.5;
  try {
    measureCtx = measureCtx ?? document.createElement('canvas').getContext('2d');
    if (measureCtx) {
      measureCtx.font = `${f.style} ${f.weight} ${size}px "${f.family}"`;
      w = measureCtx.measureText(text).width;
    }
  } catch {
    // keep the estimate
  }
  w += spacing * text.length;
  widths.set(key, w);
  return w;
};

// ---------- shared drawing kit ----------
const Defs: React.FC<{k: K}> = ({k}) => {
  const shadow = k.vox?.shadow ?? '#3a2a10';
  return (
    <defs>
      <pattern id="vxHt" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4.5" cy="4.5" r="2.6" fill="#1d1d1d" /></pattern>
      <pattern id="vxHtS" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4.5" cy="4.5" r="1.4" fill="#1d1d1d" /></pattern>
      <pattern id="vxHtR" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="5" cy="5" r="2.2" fill={col(k, 'red')} /></pattern>
      <pattern id="vxHtW" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4.5" cy="4.5" r="1.6" fill="#fff" /></pattern>
      <pattern id="vxLines" width="1" height="34" patternUnits="userSpaceOnUse"><rect width="4000" height="1.5" y="33" fill="#9fb3c8" opacity=".5" /></pattern>
      <filter id="vxRough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="3" /><feDisplacementMap in="SourceGraphic" scale="9" /></filter>
      <filter id="vxShadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="6" dy="10" stdDeviation="9" floodColor={shadow} floodOpacity=".35" /></filter>
      <filter id="vxMarker"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter>
      <filter id="vxGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <radialGradient id="vxHeat"><stop offset="0" stopColor="#ffb347" stopOpacity=".75" /><stop offset="1" stopColor="#ff6a00" stopOpacity="0" /></radialGradient>
    </defs>
  );
};
const TONES: Record<string, [string, number]> = {dark: ['url(#vxHt)', 0.5], light: ['url(#vxHtS)', 0.25], red: ['url(#vxHtR)', 0.7], white: ['url(#vxHtW)', 0.2]};

// A cut out shape: white paper edge, flat colour, halftone dots on top.
const Cut: React.FC<{d: string; fill: string; tone?: string; edge?: number; stroke?: string; sw?: number}> = ({d, fill, tone, edge = 20, stroke, sw = 5}) => {
  const tn = tone ? TONES[tone] : undefined;
  return (
    <g>
      {edge > 0 && <path d={d} fill="#fff" stroke="#fff" strokeWidth={edge} strokeLinejoin="round" />}
      <path d={d} fill={fill} stroke={stroke} strokeWidth={stroke ? sw : undefined} strokeLinejoin="round" />
      {tn && <path d={d} fill={tn[0]} opacity={tn[1]} />}
    </g>
  );
};

// A line that draws itself (pathLength trick), or a dashed line revealed by a mask.
const Stroke: React.FC<{t: number; at: number; dur?: number; d: string; stroke: string; w?: number; dash?: string; marker?: boolean; out?: number; opacity?: number; fill?: string}> = ({t, at, dur = 0.8, d, stroke, w = 8, dash, marker, out, opacity = 1, fill = 'none'}) => {
  if (t < at) return null;
  const o = fadeOut(t, out) * opacity;
  if (o <= 0) return null;
  const k = eio(prog(t, at, dur));
  if (dash) {
    const id = `vxm${Math.round(at * 1000)}_${d.length}_${Math.round(w)}_${Math.round(d.charCodeAt(1) || 0)}`;
    return (
      <g opacity={o}>
        <mask id={id} maskUnits="userSpaceOnUse" x={-20000} y={-20000} width={40000} height={40000}>
          <path d={d} pathLength={1} stroke="#fff" strokeWidth={w + 30} fill="none" strokeDasharray="1 1" strokeDashoffset={1 - k} />
        </mask>
        <path d={d} stroke={stroke} strokeWidth={w} fill="none" strokeDasharray={dash} strokeLinecap="round" mask={`url(#${id})`} />
      </g>
    );
  }
  const line = <path d={d} pathLength={1} opacity={o} stroke={stroke} strokeWidth={w} fill={fill} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - k} />;
  if (!marker) return line;
  // The rough marker edge is a filter, and a filter only paints inside its shape's box. A flat line has no height,
  // so an empty frame around it gives the filter room for the whole stroke.
  let room: React.ReactNode = null;
  try {
    const bb = getBoundingBox(d), m = w + 12;
    room = <rect x={bb.x1 - m} y={bb.y1 - m} width={bb.x2 - bb.x1 + m * 2} height={bb.y2 - bb.y1 + m * 2} fill="none" />;
  } catch {
    room = null;
  }
  return (
    <g filter="url(#vxMarker)">
      {room}
      {line}
    </g>
  );
};

// Scales a group in with an overshoot around (ox, oy).
const Pop: React.FC<{t: number; at: number; ox: number; oy: number; d?: number; out?: number; children: React.ReactNode}> = ({t, at, ox, oy, d = 0.45, out, children}) => {
  if (t < at) return null;
  const o = fadeOut(t, out);
  if (o <= 0) return null;
  const s = back(prog(t, at, d));
  return <g opacity={o} transform={`translate(${ox},${oy}) scale(${s}) translate(${-ox},${-oy})`}>{children}</g>;
};

const Sparks: React.FC<{t: number; at: number; x: number; y: number; n?: number; r?: number; color: string; seed?: number}> = ({t, at, x, y, n = 12, r = 150, color, seed = 1}) => {
  const k = prog(t, at, 0.45);
  if (t < at || k >= 1) return null;
  return (
    <g opacity={1 - k}>
      {Array.from({length: n}).map((_, i) => {
        const a = -Math.PI * (0.05 + 0.9 * ((i * 0.618 + seed * 0.37) % 1));
        const d0 = r * eo(k) * (0.5 + ((i * 7 + seed) % 5) / 8), d1 = d0 + 26;
        return <line key={i} x1={x + Math.cos(a) * d0} y1={y + Math.sin(a) * d0} x2={x + Math.cos(a) * d1} y2={y + Math.sin(a) * d1} stroke={i % 3 ? color : '#fff'} strokeWidth={6} strokeLinecap="round" />;
      })}
    </g>
  );
};

// Position of a moving piece: starts at (x, y); each key eases to its own x and y.
const moved = (b: Block, t: number) => {
  let x = b.x ?? 0, y = b.y ?? 0;
  for (const kf of (b.keys ?? []) as {t: number; x?: number; y?: number; dur?: number}[]) {
    const p = eio(prog(t, kf.t, kf.dur ?? 1));
    x = lerp(x, kf.x ?? x, p);
    y = lerp(y, kf.y ?? y, p);
  }
  return [x, y] as const;
};

// How a piece arrives: pop (default), rise, drop, left, right, fade, none. Returns a transform and an opacity.
const entrance = (enter: string | undefined, t: number, at: number, W: number) => {
  const e = enter ?? 'pop';
  if (e === 'none') return {tr: '', op: 1, s: 1};
  if (e === 'fade') return {tr: '', op: prog(t, at, 0.4), s: 1};
  if (e === 'rise') return {tr: `translate(0,${(1 - back(prog(t, at, 0.5))) * 260})`, op: 1, s: 1};
  if (e === 'drop') return {tr: `translate(0,${-(1 - back(prog(t, at, 0.5))) * 300})`, op: 1, s: 1};
  if (e === 'left' || e === 'right') return {tr: `translate(${(e === 'left' ? -1 : 1) * (1 - eo(prog(t, at, 0.7))) * W * 0.47},0)`, op: 1, s: 1};
  return {tr: '', op: 1, s: back(prog(t, at, 0.45))};
};

type Ctx = {W: number; H: number; render: (b: Block) => React.ReactNode};
type P = {b: Block; t: number; k: K; x: Ctx};

// ---------- blocks ----------

// A paper card that slides into place with a small turn, carries its own blocks and can leave again.
// flips: times when it turns over; child blocks with "face" 0, 1, 2 show on that side only.
const VoxCard: React.FC<P> = ({b, t, k, x}) => {
  const {at, x: cx0, y: cy0, w, h, rot = 0, out} = b;
  const from = b.from ?? 'below', outTo = b.outTo ?? 'left';
  if (t < at) return null;
  if (out !== undefined && t > out + 0.7) return null;
  const kin = from === 'none' || from === 'pop' ? 1 : eo(prog(t, at, 0.6));
  const ko = out === undefined ? 0 : eio(prog(t, out, 0.6));
  const dx = x.W * 0.84, dy = x.H * 1.02;
  const off = (dir: string, a: number) => (dir === 'left' ? [-a * dx, 0] : dir === 'right' ? [a * dx, 0] : dir === 'above' || dir === 'up' ? [0, -a * dy] : [0, a * dy]);
  const [ix, iy] = off(from, 1 - kin);
  const [ox, oy] = off(outTo === 'down' ? 'below' : outTo, ko);
  const ccx = cx0 + w / 2, ccy = cy0 + h / 2;
  const ps = from === 'pop' ? back(prog(t, at, 0.45)) : 1;
  const flips: number[] = b.flips ?? [];
  const face = flips.filter((f) => t >= f).length;
  let sx = 1;
  for (const f of flips) {
    const q = prog(t, f - 0.15, 0.3);
    if (q > 0 && q < 1) sx = Math.abs(Math.cos(q * Math.PI));
  }
  const kids = (b.blocks ?? []) as Block[];
  return (
    <g transform={`translate(${ix + ox},${iy + oy}) rotate(${rot + (1 - kin) * 7 - ko * 6} ${ccx} ${ccy}) translate(${ccx},${ccy}) scale(${ps}) translate(${-ccx},${-ccy})`}>
      <g filter="url(#vxShadow)"><rect x={cx0} y={cy0} width={w} height={h} fill={col(k, b.fill, 'paper')} filter="url(#vxRough)" /></g>
      {b.lined && <rect x={cx0} y={cy0} width={w} height={h} fill="url(#vxLines)" />}
      {flips.length > 0 && <g transform={`translate(${ccx},${ccy}) scale(${sx},1) translate(${-ccx},${-ccy})`}>{kids.filter((c) => c.face === face).map((c, i) => <g key={`f${i}`}>{x.render(c)}</g>)}</g>}
      {kids.filter((c) => c.face === undefined).map((c, i) => <g key={i}>{x.render(c)}</g>)}
    </g>
  );
};

// A black label with a yellow title and an optional second line.
const VoxTag: React.FC<P> = ({b, t, k}) => {
  const {at, x, y, rot = -2, out} = b;
  if (t < at) return null;
  const size = b.size ?? (b.sub ? 62 : 54), subSize = Math.round(size * 0.65);
  const kk = eo(prog(t, at, 0.35));
  const h = b.sub ? size * 2.42 : size * 1.6;
  const w = b.w ?? Math.max(textWidth(String(b.text), 'print', size, 4), b.sub ? textWidth(String(b.sub), 'print', subSize, 4) : 0) + 56;
  return (
    <g transform={`translate(${x},${y}) rotate(${rot})`} opacity={fadeOut(t, out)}>
      <rect width={w * kk} height={h} fill={col(k, b.fill, 'ink')} />
      <g opacity={prog(t, at + 0.15, 0.2)}>
        <text x={28} y={b.sub ? size * 1.16 : size * 1.18} fontSize={size} fill={col(k, b.color, 'yellow')} fontFamily={PRINT} letterSpacing={4}>{b.text}</text>
        {b.sub && <text x={28} y={size * 2} fontSize={subSize} fill={col(k, b.subColor, 'cream')} fontFamily={PRINT} letterSpacing={4}>{b.sub}</text>}
      </g>
    </g>
  );
};

// Words on the page. print (condensed capitals), serif, italic, hand (handwriting, red by default), hebrew.
// mark: a highlighter swipe behind the words. underline, strike, circle: marker strokes on them. typed: letters appear one by one until "until".
const VoxText: React.FC<P> = ({b, t, k}) => {
  const {at, x, y, out} = b;
  if (t < at) return null;
  const o = fadeOut(t, out, 0.25);
  if (o <= 0) return null;
  const font = (b.font ?? 'print') as FontName;
  const f = fontOf(font);
  const size = b.size ?? (font === 'hand' ? 58 : font === 'print' ? 72 : 60);
  const ls = b.ls ?? f.ls;
  const anchor = b.anchor ?? 'start';
  const rot = b.rot ?? (font === 'hand' ? -4 : 0);
  const text = String(b.text ?? '');
  const w = textWidth(text, font, size, ls);
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const enter = b.enter ?? (b.typed ? 'none' : 'rise');
  const kk = enter === 'rise' ? eo(prog(t, at, 0.35)) : enter === 'fade' ? prog(t, at, 0.4) : 1;
  const lift = enter === 'rise' ? (1 - kk) * 28 : 0;
  const ps = enter === 'pop' ? back(prog(t, at, 0.45)) : 1;
  const pcx = x0 + w / 2, pcy = y - size * 0.35;
  const color = col(k, b.color, font === 'hand' ? 'red' : 'ink');
  const shown = b.typed ? text.slice(0, Math.round(text.length * clamp((t - at) / Math.max(0.1, (b.until ?? at + text.length * 0.05) - at)))) : text;
  const pad = size * 0.12;
  const mk = b.mark as {at?: number; color?: string; w?: number; h?: number; out?: number} | undefined;
  const ul = b.underline as {at?: number; color?: string; dur?: number} | undefined;
  const st = b.strike as {at?: number; color?: string} | undefined;
  const ci = b.circle as {at?: number; color?: string} | undefined;
  const mh = mk?.h ?? size * 0.86;
  return (
    <g opacity={o} transform={`${rot ? `rotate(${rot} ${x} ${y})` : ''}${ps !== 1 ? ` translate(${pcx},${pcy}) scale(${ps}) translate(${-pcx},${-pcy})` : ''}` || undefined}>
      {mk && t >= (mk.at ?? at) && (
        <rect x={x0 - pad} y={y - size * 0.74} width={(mk.w ?? w + pad * 2) * eo(prog(t, mk.at ?? at, 0.35))} height={mh} fill={col(k, mk.color, 'yellow')} opacity={0.9 * fadeOut(t, mk.out, 0.25)} transform={`rotate(-1.2 ${x0} ${y - size * 0.3})`} filter="url(#vxMarker)" />
      )}
      <text x={x} y={y + lift} fontSize={size} fill={color} fontFamily={`"${f.family}"`} fontWeight={f.weight} fontStyle={f.style} textAnchor={anchor} letterSpacing={ls} opacity={kk}>
        {shown}
        {b.typed && <tspan fill={col(k, 'red')}>{t < (b.until ?? 0) + 1.5 && Math.floor(t * 2.2) % 2 === 0 ? '|' : ' '}</tspan>}
      </text>
      {ul && <Stroke t={t} at={ul.at ?? at + 0.3} dur={ul.dur ?? 0.35} d={`M${x0 - 4},${y + size * 0.16} C${x0 + w * 0.3},${y + size * 0.1} ${x0 + w * 0.7},${y + size * 0.14} ${x0 + w + 6},${y + size * 0.2}`} stroke={col(k, ul.color, 'red')} w={Math.max(5, size * 0.09)} marker />}
      {st && <Stroke t={t} at={st.at ?? at} dur={0.3} d={`M${x0 - 6},${y - size * 0.3} L${x0 + w + 6},${y - size * 0.28}`} stroke={col(k, st.color, 'red')} w={Math.max(6, size * 0.11)} marker />}
      {ci && (
        <Stroke t={t} at={ci.at ?? at} dur={0.45} marker stroke={col(k, ci.color, 'red')} w={Math.max(6, size * 0.08)}
          d={`M${x0 + w * 0.55},${y - size * 1.0} C${x0 + w * 1.1},${y - size * 1.05} ${x0 + w * 1.12},${y + size * 0.45} ${x0 + w * 0.5},${y + size * 0.42} C${x0 - w * 0.12},${y + size * 0.4} ${x0 - w * 0.1},${y - size * 1.0} ${x0 + w * 0.6},${y - size * 0.92}`} />
      )}
    </g>
  );
};

// A free highlighter swipe (prefer "mark" on a text block, which always sits behind its words).
const VoxHighlight: React.FC<P> = ({b, t, k}) => {
  if (t < b.at) return null;
  const kk = eo(prog(t, b.at, 0.35));
  return <rect x={b.x} y={b.y} width={b.w * kk} height={b.h} fill={col(k, b.color, 'yellow')} opacity={0.9 * fadeOut(t, b.out, 0.25)} transform={`rotate(${b.rot ?? -1.2} ${b.x} ${b.y + b.h / 2})`} filter="url(#vxMarker)" />;
};

// A line that draws itself: marker (rough edge), pen (clean), dashed route; arrow puts a head on the end.
const VoxLine: React.FC<P> = ({b, t, k}) => {
  if (t < b.at) return null;
  const dur = b.dur ?? 0.8;
  const stroke = col(k, b.color, 'red');
  const w = b.width ?? 8;
  let head: React.ReactNode = null;
  if (b.arrow && t >= b.at + dur * 0.92) {
    try {
      const L = getLength(b.d);
      const p = getPointAtLength(b.d, L);
      const tg = getTangentAtLength(b.d, L);
      const a = Math.atan2(tg.y, tg.x), s = 18 + w * 2;
      const pt = (da: number) => `${p.x + Math.cos(a + da) * s},${p.y + Math.sin(a + da) * s}`;
      head = <path d={`M${pt(2.6)} L${p.x},${p.y} L${pt(-2.6)}`} stroke={stroke} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={fadeOut(t, b.out) * prog(t, b.at + dur * 0.92, 0.08)} filter={b.marker ? 'url(#vxMarker)' : undefined} />;
    } catch {
      head = null;
    }
  }
  return (
    <g>
      <Stroke t={t} at={b.at} dur={dur} d={b.d} stroke={stroke} w={w} dash={b.dash} marker={b.marker} out={b.out} opacity={b.opacity ?? 1} />
      {head}
    </g>
  );
};

// A rubber stamp that slams down: a box and words in ink.
const VoxStamp: React.FC<P> = ({b, t, k}) => {
  if (t < b.at) return null;
  const o = fadeOut(t, b.out);
  if (o <= 0) return null;
  const size = b.size ?? 100;
  const kk = prog(t, b.at, 0.16);
  const s = lerp(1.9, 1, ei(kk));
  const color = col(k, b.color, 'red');
  const w = textWidth(String(b.text), 'print', size, size * 0.08) + size * 0.8, h = size * 1.45;
  return (
    <g opacity={o * Math.min(1, kk * 3)} transform={`translate(${b.x},${b.y}) rotate(${b.rot ?? -12}) scale(${s})`} filter="url(#vxMarker)">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke={color} strokeWidth={size * 0.09} />
      <text x={0} y={size * 0.36} fontSize={size} fill={color} fontFamily={PRINT} textAnchor="middle" letterSpacing={size * 0.08}>{b.text}</text>
    </g>
  );
};

// A sticky paper chip with one line of text; x is its left edge, y the middle of the words.
const VoxChip: React.FC<P> = ({b, t, k}) => {
  const size = b.size ?? 56;
  const w = b.w ?? textWidth(String(b.text), 'print', size, 3) + size * 1.1;
  const rot = b.rot ?? -2;
  return (
    <Pop t={t} at={b.at} ox={b.x + w / 2} oy={b.y} d={0.4} out={b.out}>
      <g transform={`rotate(${rot} ${b.x + w / 2} ${b.y})`} filter="url(#vxShadow)">
        <rect x={b.x} y={b.y - size} width={w} height={size * 1.9} fill={col(k, b.fill, 'yellow')} />
        <text x={b.pad !== undefined ? b.x + b.pad : b.x + w / 2} y={b.y + size * 0.3} fontSize={size} fill={col(k, b.color, 'ink')} fontFamily={PRINT} textAnchor={b.pad !== undefined ? 'start' : 'middle'} letterSpacing={3}>{b.text}</text>
      </g>
    </Pop>
  );
};

// Marker marks around a point: tick, cross, circle, underline, box.
const VoxMark: React.FC<P> = ({b, t, k}) => {
  const {at, x, y} = b;
  if (t < at) return null;
  const s = b.s ?? 1, w = b.w ?? 100, h = b.h ?? 80;
  const color = col(k, b.color, 'red');
  const width = b.width ?? 9 * s;
  const kind = b.kind ?? 'tick';
  if (kind === 'tick') return <Stroke t={t} at={at} dur={0.3} d={`M${x - 22 * s},${y} L${x - 6 * s},${y + 18 * s} L${x + 26 * s},${y - 24 * s}`} w={width} stroke={color} marker out={b.out} />;
  if (kind === 'cross')
    return (
      <g>
        <Stroke t={t} at={at} dur={0.22} d={`M${x - w / 2},${y - h / 2} L${x + w / 2},${y + h / 2}`} w={b.width ?? 12} stroke={color} marker out={b.out} />
        <Stroke t={t} at={at + 0.18} dur={0.22} d={`M${x + w / 2},${y - h / 2} L${x - w / 2},${y + h / 2}`} w={b.width ?? 12} stroke={color} marker out={b.out} />
      </g>
    );
  if (kind === 'circle')
    return <Stroke t={t} at={at} dur={0.45} marker stroke={color} w={b.width ?? 10} out={b.out} d={`M${x + w * 0.05},${y - h * 0.55} C${x + w * 0.62},${y - h * 0.62} ${x + w * 0.66},${y + h * 0.5} ${x},${y + h * 0.52} C${x - w * 0.62},${y + h * 0.5} ${x - w * 0.6},${y - h * 0.56} ${x + w * 0.12},${y - h * 0.46}`} />;
  if (kind === 'underline') return <Stroke t={t} at={at} dur={0.35} marker stroke={color} w={b.width ?? 8} out={b.out} d={`M${x - w / 2},${y} C${x - w / 6},${y - 6} ${x + w / 6},${y - 2} ${x + w / 2},${y + 4}`} />;
  return <Stroke t={t} at={at} dur={0.5} stroke={color} w={b.width ?? 6} out={b.out} d={`M${x - w / 2},${y - h / 2} L${x + w / 2},${y - h / 2} L${x + w / 2},${y + h / 2} L${x - w / 2},${y + h / 2} Z`} />;
};

// A row (or column) of numbered circles popping in one after another.
const VoxNumbers: React.FC<P> = ({b, t, k}) => {
  const n = b.n ?? 5, gap = b.gap ?? 80, r = b.r ?? 30, step = b.step ?? 0.1, start = b.from ?? 1;
  const down = b.dir === 'column';
  return (
    <g opacity={fadeOut(t, b.out)}>
      {Array.from({length: n}, (_, i) => {
        const cx = b.x + (down ? 0 : i * gap), cy = b.y + (down ? i * gap : 0);
        return (
          <Pop key={i} t={t} at={b.at + i * step} ox={cx} oy={cy} d={0.3}>
            <circle cx={cx} cy={cy} r={r} fill={col(k, b.color, 'red')} stroke={b.ring ? '#fff' : undefined} strokeWidth={b.ring ? r * 0.12 : undefined} />
            <text x={cx} y={cy + r * 0.46} fontSize={r * 1.33} fill={col(k, b.textColor, 'white')} fontFamily={PRINT} textAnchor="middle">{start + i}</text>
          </Pop>
        );
      })}
    </g>
  );
};

// A numbered list where the item being spoken is lit and the ones before it are ticked (style "numbers"),
// or a hand written checklist with boxes that get ticked (style "checks").
const VoxList: React.FC<P> = ({b, t, k}) => {
  const items = (b.items ?? []) as {at: number; text: string}[];
  const gap = b.gap ?? (b.style === 'checks' ? 56 : 130);
  if (b.style === 'checks') {
    const size = b.size ?? 46;
    return (
      <g opacity={fadeOut(t, b.out)}>
        {items.map((it, i) => {
          const y = b.y + i * gap;
          return (
            <g key={i}>
              <Pop t={t} at={it.at} ox={b.x + 20} oy={y - 10}><rect x={b.x} y={y - size * 0.76} width={size * 0.87} height={size * 0.87} fill="#fff" stroke={col(k, 'ink')} strokeWidth={4} /></Pop>
              <VoxText b={{type: 'voxText', at: it.at, x: b.x + size * 1.3, y, text: it.text, font: b.font ?? 'hand', size, color: b.color ?? 'ink', rot: 0}} t={t} k={k} x={null as unknown as Ctx} />
              <Stroke t={t} at={it.at + 0.35} dur={0.3} d={`M${b.x + size * 0.44 - 20},${y - 18} L${b.x + size * 0.44 - 5},${y} L${b.x + size * 0.44 + 23},${y - 40}`} w={8} stroke={col(k, 'red')} marker />
            </g>
          );
        })}
      </g>
    );
  }
  const size = b.size ?? 64;
  let active = -1;
  items.forEach((it, i) => {
    if (t >= it.at) active = i;
  });
  return (
    <g opacity={fadeOut(t, b.out)}>
      {items.map((it, i) => {
        if (t < it.at) return null;
        const on = i === active, kk = eo(prog(t, it.at, 0.35));
        const y = b.y + i * gap;
        const w = textWidth(it.text, 'print', size, 1);
        return (
          <g key={i}>
            <g transform={`translate(${b.x + (1 - kk) * 60},${y})`} opacity={(on ? 1 : 0.38) * kk}>
              <circle cx={size * 0.6} cy={-size * 0.34} r={size * 0.62} fill={on ? col(k, b.color, 'red') : col(k, 'ink')} />
              <text x={size * 0.6} y={size * 0.03} fontSize={size} fill="#fff" fontFamily={PRINT} textAnchor="middle">{i + 1}</text>
              <text x={size * 1.56} y={0} fontSize={size} fill={col(k, 'ink')} fontFamily={PRINT} letterSpacing={1}>{it.text}</text>
            </g>
            {on && <Stroke t={t} at={it.at + 0.4} dur={0.4} d={`M${b.x + size * 1.56},${y + 25} C${b.x + size * 1.56 + w * 0.3},${y + 18} ${b.x + size * 1.56 + w * 0.7},${y + 22} ${b.x + size * 1.56 + w},${y + 30}`} w={7} stroke={col(k, b.color, 'red')} marker />}
            {i < active && <Stroke t={t} at={items[i + 1].at - 0.3} dur={0.3} d={`M${b.x + size * 1.56 + w + 28},${y - 20} L${b.x + size * 1.56 + w + 44},${y - 2} L${b.x + size * 1.56 + w + 76},${y - 44}`} w={9} stroke={col(k, b.color, 'red')} marker />}
          </g>
        );
      })}
    </g>
  );
};

// Nodes that pop in and links that light up one at a time.
const VoxNetwork: React.FC<P> = ({b, t, k}) => {
  const nodes = (b.nodes ?? []) as number[][], links = (b.links ?? []) as number[][];
  const step = b.step ?? 0.15, color = col(k, b.color, 'yellow');
  return (
    <g opacity={fadeOut(t, b.out)}>
      {links.map(([a, c], i) => (nodes[a] && nodes[c] ? <Stroke key={i} t={t} at={b.at + i * step} dur={0.35} d={`M${nodes[a][0]},${nodes[a][1]} L${nodes[c][0]},${nodes[c][1]}`} stroke={color} w={7} /> : null))}
      {nodes.map(([nx, ny], i) => (
        <Pop key={i} t={t} at={b.at + i * step * 0.8} ox={nx} oy={ny} d={0.3}>
          <circle cx={nx} cy={ny} r={b.r ?? 15} fill={color} stroke="#1d1d1d" strokeWidth={4} />
        </Pop>
      ))}
    </g>
  );
};

const VoxSparks: React.FC<P> = ({b, t, k}) => <Sparks t={t} at={b.at} x={b.x} y={b.y} n={b.n} r={b.r} color={col(k, b.color, 'yellow')} seed={b.seed} />;

// The subscribe button: it pops in, the pointer arrives and clicks, the words change and the bell rings.
const VoxSubscribe: React.FC<P> = ({b, t, k}) => {
  const {at, x, y} = b;
  if (t < at) return null;
  const click = b.clickAt ?? at + 1;
  const sub = t >= click;
  const bell = t >= click + 0.3 ? Math.sin((t - click - 0.3) * 30) * 18 * (1 - prog(t, click + 0.3, 0.8)) : 0;
  const press = t > click - 0.05 && t < click + 0.15 ? 0.93 : 1;
  const size = b.size ?? 58;
  const w = b.w ?? Math.max(textWidth(String(b.text), 'print', size, 5), textWidth(String(b.done ?? b.text), 'print', size, 5)) + size * 1.4;
  const h = size * 1.55;
  const ca = prog(t, click - 0.4, 0.35);
  return (
    <g transform={`translate(${x},${y}) scale(${press})`} opacity={fadeOut(t, b.out)}>
      <Pop t={t} at={at} ox={w / 2} oy={h / 2}>
        <rect width={w} height={h} fill={sub ? '#6b7280' : col(k, b.color, 'red')} />
        <text x={w / 2} y={h / 2 + size * 0.36} fontSize={size} fill="#fff" fontFamily={PRINT} textAnchor="middle" letterSpacing={5}>{sub ? b.done ?? b.text : b.text}</text>
        {b.bell !== false && (
          <g transform={`translate(${w + 60},${h / 2}) rotate(${bell})`}>
            <path d="M-26,18 C-26,-10 -22,-30 0,-32 C22,-30 26,-10 26,18 L34,26 L-34,26 Z" fill={col(k, 'yellow')} stroke={col(k, 'ink')} strokeWidth={4} />
            <circle cy={34} r={8} fill={col(k, 'ink')} />
          </g>
        )}
      </Pop>
      {b.pointer !== false && t >= click - 0.4 && t < click + 1.1 && (
        <g transform={`translate(${w * 0.5 + (1 - eo(ca)) * 300},${h * 0.66 + (1 - eo(ca)) * 200})`} opacity={1 - prog(t, click + 0.7, 0.3)}>
          <path d="M0,0 L0,64 L16,50 L28,76 L40,70 L28,46 L48,44 Z" fill="#fff" stroke={col(k, 'ink')} strokeWidth={4} strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
};

// A group of blocks that enters and moves together (keys move it, like a walk across the board).
const VoxGroup: React.FC<P> = ({b, t, k, x}) => {
  if (t < b.at) return null;
  const o = fadeOut(t, b.out);
  if (o <= 0) return null;
  const [gx, gy] = moved({...b, x: b.x ?? 0, y: b.y ?? 0}, t);
  const en = entrance(b.enter ?? 'none', t, b.at, x.W);
  const ox = b.ox ?? 0, oy = b.oy ?? 0;
  const dim = b.dimAt !== undefined ? lerp(1, b.dim ?? 0.25, prog(t, b.dimAt, 0.5)) : 1;
  return (
    <g opacity={o * en.op * dim} transform={`translate(${gx},${gy}) ${en.tr} translate(${ox},${oy}) scale(${en.s * (b.scale ?? 1)}) rotate(${b.rot ?? 0}) translate(${-ox},${-oy})`}>
      {((b.blocks ?? []) as Block[]).map((c, i) => <g key={i}>{x.render(c)}</g>)}
    </g>
  );
};

// ---------- the picture library: halftone cut outs, each drawn around its own middle (0, 0) ----------
const HEAD = 'M300,820 C300,700 260,640 250,560 C230,420 300,260 470,230 C620,205 740,290 760,420 C770,470 765,500 790,540 C805,565 800,580 780,585 C785,610 775,625 770,640 C780,655 775,670 760,675 C765,720 740,745 690,740 C660,738 640,750 640,790 L640,820 Z';
const BRAIN = 'M330,450 C300,380 360,320 420,330 C440,280 530,270 560,310 C610,280 690,320 680,380 C720,410 700,480 650,480 C640,520 570,530 540,500 C500,530 420,525 410,490 C360,500 320,480 330,450 Z';
const BRAIN_FOLDS = 'M380,420 C420,390 470,430 500,400 M450,350 C480,380 540,360 560,390 M560,450 C590,420 630,440 650,410';
const ROBE = 'M70,0 C100,0 118,22 116,52 C140,62 150,90 148,118 C175,150 190,230 196,330 L214,470 L-40,470 L-14,330 C-8,240 4,170 26,128 C20,100 28,70 40,56 C36,24 46,0 70,0 Z';
const GIANT = 'M0,-300 C30,-300 42,-272 38,-248 C34,-228 22,-220 14,-216 L64,-196 C86,-186 94,-130 92,-60 L84,0 L-84,0 L-92,-60 C-94,-130 -86,-186 -64,-196 L-14,-216 C-22,-220 -34,-228 -38,-248 C-42,-272 -30,-300 0,-300 Z';
const ANVIL = 'M760,600 L1360,600 C1360,640 1330,660 1280,670 L1200,690 L1180,780 L1260,800 L1260,880 L860,880 L860,800 L940,780 L920,690 L840,670 C800,660 760,640 760,600 Z';
const PERSON = 'M0,-258 C24,-258 42,-240 42,-216 C42,-192 24,-174 0,-174 C-24,-174 -42,-192 -42,-216 C-42,-240 -24,-258 0,-258 Z M-62,-160 C-90,-155 -98,-120 -96,-80 L-88,50 L-60,50 L-50,170 L-6,170 L0,60 L6,170 L50,170 L60,50 L88,50 L96,-80 C98,-120 90,-155 62,-160 C30,-168 -30,-168 -62,-160 Z';

type ArtFn = (b: Block, t: number, k: K) => React.ReactNode;
const heatOf = (b: Block, t: number) => {
  let h = b.heat ?? 0;
  if (b.heatAt !== undefined) h = Math.max(h, eio(prog(t, b.heatAt, 1)));
  if (b.pulse) h = Math.max(h, 0.6 * (0.5 + 0.5 * Math.sin(t * 2.5)) * fadeOut(t, b.pulseOut, 1));
  return h;
};
const brainArt = (b: Block, t: number, k: K, heat: number) => (
  <g>
    {heat > 0 && <ellipse cx={510} cy={410} rx={260} ry={190} fill="url(#vxHeat)" opacity={heat} />}
    <path d={BRAIN} fill="#fff" stroke="#fff" strokeWidth={22} />
    <path d={BRAIN} fill={mixHex(col(k, 'pink'), '#FFB37A', heat)} />
    <path d={BRAIN} fill="url(#vxHtR)" opacity={0.7} />
    <path d={BRAIN_FOLDS} stroke="#7a2a24" strokeWidth={5} fill="none" strokeLinecap="round" />
  </g>
);
const beat = (b: Block, t: number) => (b.beatAt !== undefined ? 1 + 0.05 * Math.sin(Math.PI * prog(t, b.beatAt, 0.5)) : 1);

const ART: Record<string, ArtFn> = {
  head: (b, t, k) => (
    <g transform="translate(-527,-512)">
      <Cut d={HEAD} fill={col(k, b.fill, 'stone')} tone="dark" edge={26} />
    </g>
  ),
  brain: (b, t, k) => <g transform={`scale(${beat(b, t)}) translate(-510,-410)`}>{brainArt(b, t, k, heatOf(b, t))}</g>,
  mind: (b, t, k) => (
    <g transform="translate(-527,-512)">
      <Cut d={HEAD} fill={col(k, b.fill, 'stone')} tone="dark" edge={26} />
      {(b.brainAt === undefined || t >= b.brainAt) && (
        <g transform={`translate(510,410) scale(${beat(b, t) * (b.brainAt !== undefined ? back(prog(t, b.brainAt, 0.45)) : 1)}) translate(-510,-410)`}>
          {heatOf(b, t) > 0 && <ellipse cx={510} cy={410} rx={260} ry={190} fill="url(#vxHeat)" opacity={heatOf(b, t)} />}
          <path d={BRAIN} fill={mixHex(col(k, 'pink'), '#FFB37A', heatOf(b, t))} />
          <path d={BRAIN} fill="url(#vxHtR)" opacity={0.7} />
          <path d={BRAIN_FOLDS} stroke="#7a2a24" strokeWidth={6} fill="none" />
        </g>
      )}
    </g>
  ),
  person: (b, t, k) => <Cut d={PERSON} fill={col(k, b.fill, 'grey')} tone="dark" edge={22} />,
  leader: (b, t, k) => (
    <g transform="translate(-62,-204)">
      <path d={ROBE} fill="#fff" stroke="#fff" strokeWidth={24} strokeLinejoin="round" />
      <line x1={-50} y1={-40} x2={-30} y2={470} stroke="#fff" strokeWidth={34} strokeLinecap="round" />
      <path d={ROBE} fill={col(k, b.fill, 'tan')} />
      <path d={ROBE} fill="url(#vxHt)" opacity={0.45} />
      <path d="M40,56 C60,40 100,42 116,52 C110,30 95,8 70,6 C48,8 38,30 40,56 Z" fill="#7c5a33" />
      <path d="M30,140 C70,200 90,300 80,470" stroke="#6d5a3a" strokeWidth={5} fill="none" opacity={0.6} />
      <line x1={-50} y1={-40} x2={-30} y2={470} stroke="#5a3d1e" strokeWidth={16} strokeLinecap="round" />
      <path d="M-50,-40 C-80,-60 -90,-20 -62,-12" stroke="#5a3d1e" strokeWidth={14} fill="none" strokeLinecap="round" />
      <ellipse cx={-38} cy={150} rx={22} ry={18} fill={col(k, 'skin')} />
    </g>
  ),
  giant: (b, t, k) => (
    <g transform="translate(0,150)">
      <Cut d={GIANT} fill={col(k, b.fill, 'brown')} tone="dark" edge={16} />
    </g>
  ),
  crowd: (b, t, k) => {
    const n = b.count ?? 46, cols = b.cols ?? 8, sp = b.gap ?? 30;
    const rows = Math.ceil(n / cols);
    return (
      <g>
        {Array.from({length: n}, (_, i) => {
          const cx = (i % cols) * sp + ((i * 37) % 17) - 8 + (Math.floor(i / cols) % 2) * 14 - (cols * sp) / 2;
          const cy = Math.floor(i / cols) * sp + ((i * 53) % 15) - 7 - (rows * sp) / 2;
          return (
            <Pop key={i} t={t} at={b.at + i * (b.step ?? 0.025)} ox={cx} oy={cy} d={0.25}>
              <circle cx={cx} cy={cy} r={b.r ?? 10} fill={col(k, b.fill, 'ink')} opacity={0.8} />
            </Pop>
          );
        })}
      </g>
    );
  },
  anvil: (b, t, k) => (
    <g transform="translate(-1060,-740)">
      <path d={ANVIL} fill="#fff" stroke="#fff" strokeWidth={20} strokeLinejoin="round" />
      <path d={ANVIL} fill={col(k, b.fill, 'steel')} />
      <path d={ANVIL} fill="url(#vxHtW)" opacity={0.18} />
    </g>
  ),
  // pivot at the end of the handle; it swings down onto each time in "hits" and throws sparks there
  hammer: (b, t, k) => {
    const hits: number[] = b.hits ?? [];
    let a = 40;
    for (const h of hits) {
      if (t >= h - 0.42 && t < h) a = Math.min(a, 40 * (1 - ei(prog(t, h - 0.42, 0.42))));
      if (t >= h && t < h + 0.5) a = Math.min(a, 40 * eo(prog(t, h + 0.05, 0.45)));
    }
    return (
      <g>
        <g transform={`rotate(${a})`}>
          <rect x={-360} y={-12} width={360} height={26} rx={10} fill="#fff" stroke="#fff" strokeWidth={14} />
          <rect x={-360} y={-12} width={360} height={26} rx={10} fill={col(k, 'wood')} />
          <rect x={-420} y={-75} width={120} height={170} rx={8} fill="#fff" stroke="#fff" strokeWidth={14} />
          <rect x={-420} y={-75} width={120} height={170} rx={8} fill={col(k, b.fill, 'steel')} />
          <rect x={-420} y={-75} width={120} height={170} rx={8} fill="url(#vxHtW)" opacity={0.2} />
        </g>
        {b.sparks !== false && hits.map((h, i) => <Sparks key={h} t={t} at={h} x={-360} y={95} n={i ? 16 : 8} r={i ? 220 : 120} color={i ? col(k, 'amber') : col(k, 'silver')} seed={i + 1} />)}
      </g>
    );
  },
  // an iron bar that glows from heatAt and bends a little on each of "bends" [{at, by}]
  iron: (b, t, k) => {
    const heat = b.heatAt !== undefined ? eio(prog(t, b.heatAt, 1)) : b.heat ?? 0;
    const bend = ((b.bends ?? []) as {at: number; by: number}[]).reduce((s, x) => s + x.by * eo(prog(t, x.at, 0.2)), 0);
    const L = (b.length ?? 480) / 2;
    const c = mixHex(col(k, b.fill, 'grey') === '#9aa3ad' ? '#8d8f93' : col(k, b.fill, 'grey'), col(k, 'orange'), heat);
    const d = `M${-L},0 Q0,${bend * 2} ${L},0`;
    return (
      <g>
        {heat > 0 && <ellipse cx={0} cy={-8} rx={L + 90} ry={110} fill="url(#vxHeat)" opacity={heat} />}
        <path d={d} stroke="#fff" strokeWidth={56} fill="none" strokeLinecap="round" />
        <path d={d} stroke={c} strokeWidth={42} fill="none" strokeLinecap="round" filter={heat > 0.3 ? 'url(#vxGlow)' : undefined} />
        <path d={`M${-L + 20},-6 Q0,${bend * 2 - 6} ${L - 20},-6`} stroke="#fff" strokeWidth={6} fill="none" opacity={0.35 + heat * 0.4} strokeLinecap="round" />
        {heat > 0.2 &&
          [0, 1, 2].map((i) => {
            const ph = t * 3 + i * 2;
            return <path key={i} d={`M${-100 + i * 90},${-78 - (ph % 2) * 30} c 12,-20 -12,-40 0,-60 c 12,-20 -12,-40 0,-60`} stroke={col(k, 'amber')} strokeWidth={5} fill="none" opacity={heat * 0.6 * (1 - (ph % 2) / 2)} strokeLinecap="round" />;
          })}
      </g>
    );
  },
  fire: (b, t, k) => {
    const f = (i: number) => 1 + 0.08 * Math.sin(t * 11 + i * 2.1) + 0.05 * Math.sin(t * 17 + i);
    const tongue = (s: number, c: string, i: number) => (
      <path key={i} transform={`scale(${s * (2 - f(i)) * 0.98},${s * f(i)})`} d="M0,0 C-70,-10 -80,-80 -40,-140 C-30,-100 -10,-100 -10,-130 C-10,-170 20,-200 30,-230 C40,-170 90,-140 80,-70 C76,-30 50,0 0,0 Z" fill={c} />
    );
    return (
      <g transform="translate(0,110)">
        <path d="M0,0 C-70,-10 -80,-80 -40,-140 C-30,-100 -10,-100 -10,-130 C-10,-170 20,-200 30,-230 C40,-170 90,-140 80,-70 C76,-30 50,0 0,0 Z" fill="#fff" stroke="#fff" strokeWidth={18} transform={`scale(${2 - f(0)},${f(0)})`} />
        {tongue(1, col(k, 'red'), 0)}
        {tongue(0.72, col(k, 'orange'), 1)}
        {tongue(0.42, col(k, 'yellow'), 2)}
      </g>
    );
  },
  thermometer: (b, t, k) => {
    const lo = b.level ?? 0.25, hi = b.to ?? 0.95;
    const lvl = b.riseAt !== undefined ? lerp(lo, hi, eio(prog(t, b.riseAt, 1))) : lo * eo(prog(t, b.at + 0.2, 0.6));
    const labels: string[] = b.labels ?? [];
    const label = labels.length ? (b.riseAt !== undefined && t >= b.riseAt ? labels[1] ?? labels[0] : labels[0]) : '';
    return (
      <g transform="translate(-265,-600)">
        <rect x={245} y={400} width={40} height={380} rx={20} fill="#fff" stroke={col(k, 'ink')} strokeWidth={5} />
        <rect x={253} y={400 + 372 * (1 - lvl)} width={24} height={372 * lvl} rx={12} fill={col(k, b.fill, 'red')} />
        <circle cx={265} cy={800} r={40} fill={col(k, b.fill, 'red')} stroke={col(k, 'ink')} strokeWidth={5} />
        {label && <text x={265} y={870} fontSize={34} fill={col(k, 'ink')} fontFamily={PRINT} textAnchor="middle" letterSpacing={2}>{label}</text>}
      </g>
    );
  },
  book: (b, t, k) => (
    <g transform="translate(-1400,-375)">
      <path d="M1400,300 C1320,270 1220,270 1170,290 L1170,470 C1220,450 1320,450 1400,480 Z M1400,300 C1480,270 1580,270 1630,290 L1630,470 C1580,450 1480,450 1400,480 Z" fill="#fff" stroke={col(k, 'ink')} strokeWidth={5} strokeLinejoin="round" />
      {b.lines !== false && <path d="M1210,340 C1270,325 1340,325 1385,340 M1210,380 C1270,365 1340,365 1385,380 M1415,340 C1475,325 1545,325 1600,340 M1415,380 C1475,365 1545,365 1600,380" stroke={col(k, 'line')} strokeWidth={6} fill="none" />}
    </g>
  ),
  bible: (b, t, k) => (
    <g transform="translate(-960,-520)">
      <path d="M960,250 C820,200 560,200 380,250 L380,790 C560,740 820,740 960,790 Z" fill={col(k, 'ivory')} stroke="#fff" strokeWidth={14} />
      <path d="M960,250 C1100,200 1360,200 1540,250 L1540,790 C1360,740 1100,740 960,790 Z" fill={col(k, 'ivory')} stroke="#fff" strokeWidth={14} />
      <path d="M960,250 L960,790" stroke={col(k, 'line')} strokeWidth={4} />
      {b.ribbon !== false && <path d="M1380,230 L1380,870 L1405,840 L1430,870 L1430,230 Z" fill={col(k, b.fill, 'red')} />}
      {b.lines !== false && [330, 380, 430, 480, 530, 580, 630, 680].map((y, i) => <rect key={y} x={440} y={y} width={[440, 420, 450, 380, 440, 400, 430, 300][i]} height={14} fill={col(k, 'line')} />)}
      {b.lines !== false && b.rightLines !== false && [330, 380, 430, 480].map((y, i) => <rect key={y} x={1040} y={y} width={[400, 420, 380, 300][i]} height={14} fill={col(k, 'line')} />)}
    </g>
  ),
  scroll: (b, t, k) => (
    <g>
      <Cut d="M-170,-110 C-60,-122 60,-98 170,-110 L170,110 C60,98 -60,122 -170,110 Z" fill={col(k, b.fill, 'parchment')} edge={18} />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={-125} y={-72 + i * 34} width={[240, 200, 250, 180, 120][i]} height={10} fill={col(k, 'line')} />)}
      {[-1, 1].map((s) => (
        <g key={s}>
          <rect x={s * 180 - 22} y={-132} width={44} height={264} rx={22} fill="#fff" stroke="#fff" strokeWidth={14} />
          <rect x={s * 180 - 22} y={-132} width={44} height={264} rx={22} fill={col(k, 'tan')} />
          <rect x={s * 180 - 22} y={-132} width={44} height={264} rx={22} fill="url(#vxHt)" opacity={0.35} />
        </g>
      ))}
    </g>
  ),
  tablets: (b, t, k) => (
    <g>
      {[-84, 84].map((x0) => {
        const d = `M${x0 - 76},140 L${x0 - 76},-50 A76,76 0 0 1 ${x0 + 76},-50 L${x0 + 76},140 Z`;
        return (
          <g key={x0}>
            <Cut d={d} fill={col(k, b.fill, 'stone')} tone="light" edge={18} />
            {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={x0 - 46} y={-40 + i * 34} width={[92, 70, 86, 60, 80][i]} height={9} fill={col(k, 'mute')} opacity={0.55} />)}
          </g>
        );
      })}
    </g>
  ),
  // a land seen from above on parchment: sea on the left, a river, a lake and small hills
  map: (b, t, k) => {
    const w = b.w ?? 1600, h = b.h ?? 920;
    return (
      <g transform={`translate(${-w / 2},${-h / 2})`}>
        {b.paper !== false && <g filter="url(#vxShadow)"><rect width={w} height={h} fill={col(k, b.fill, 'parchment')} filter="url(#vxRough)" /></g>}
        {b.sea !== false && <path d={`M0,0 L${w * 0.19},0 C${w * 0.17},${h * 0.2} ${w * 0.19},${h * 0.37} ${w * 0.15},${h * 0.52} C${w * 0.12},${h * 0.65} ${w * 0.14},${h * 0.85} ${w * 0.11},${h} L0,${h} Z`} fill={col(k, 'sky')} />}
        {b.river !== false && <path d={`M${w * 0.575},0 C${w * 0.56},${h * 0.11} ${w * 0.59},${h * 0.2} ${w * 0.575},${h * 0.3} C${w * 0.555},${h * 0.39} ${w * 0.585},${h * 0.48} ${w * 0.57},${h * 0.59} C${w * 0.555},${h * 0.68} ${w * 0.58},${h * 0.76} ${w * 0.57},${h * 0.85} L${w * 0.563},${h}`} stroke={col(k, 'river')} strokeWidth={16} fill="none" />}
        {b.lake !== false && <ellipse cx={w * 0.58} cy={h * 0.89} rx={70} ry={80} fill={col(k, 'sky')} />}
        <path d={`M${w * 0.27},${h * 0.24} q30,-40 60,0 M${w * 0.29},${h * 0.27} q30,-40 60,0 M${w * 0.37},${h * 0.67} q30,-40 60,0 M${w * 0.4},${h * 0.7} q30,-40 60,0 M${w * 0.71},${h * 0.35} q30,-40 60,0 M${w * 0.74},${h * 0.38} q30,-40 60,0`} stroke="#8c7a55" strokeWidth={3} fill="none" opacity={0.7} />
      </g>
    );
  },
  pin: (b, t, k) => (
    <g transform="translate(0,55)">
      <path d="M0,0 C-40,-50 -40,-100 0,-110 C40,-100 40,-50 0,0 Z" fill={col(k, b.fill, 'red')} stroke="#7a1b16" strokeWidth={4} />
      <circle cy={-72} r={14} fill="#fff" />
    </g>
  ),
  target: (b, t, k) => {
    const dart = b.hitAt !== undefined ? eo(prog(t, b.hitAt - 0.3, 0.3)) : 0;
    return (
      <g>
        {[260, 200, 140, 80].map((r, i) => <circle key={r} cx={0} cy={0} r={r} fill={i % 2 ? col(k, 'paper') : '#d8cdb8'} stroke={col(k, 'ink')} strokeWidth={5} />)}
        <circle r={260} fill="url(#vxHtS)" opacity={0.25} />
        <circle r={30} fill={col(k, b.fill, 'red')} />
        {b.hitAt !== undefined && t >= b.hitAt - 0.3 && (
          <g transform={`translate(${(1 - dart) * 600},${-(1 - dart) * 420})`}>
            <line x1={10} y1={-10} x2={210} y2={-150} stroke={col(k, 'ink')} strokeWidth={10} strokeLinecap="round" />
            <path d="M210,-150 l40,-50 l10,30 l30,10 z" fill={col(k, 'red')} stroke={col(k, 'ink')} strokeWidth={4} />
          </g>
        )}
      </g>
    );
  },
  chart: (b, t, k) => {
    const hs: number[] = b.values ?? [0.35, 0.55, 0.8, 1];
    const bw = 80, gap = 115, x0 = -((hs.length - 1) * gap) / 2 - bw / 2;
    return (
      <g>
        <line x1={x0 - 30} y1={210} x2={-x0 + 30} y2={210} stroke={col(k, 'ink')} strokeWidth={6} />
        {hs.map((v, i) => {
          const hh = v * 420 * eo(prog(t, b.at + 0.1 + i * 0.12, 0.45));
          return <rect key={i} x={x0 + i * gap} y={210 - hh} width={bw} height={hh} fill={i === hs.length - 1 ? col(k, 'red') : col(k, 'tan')} stroke={col(k, 'ink')} strokeWidth={4} />;
        })}
        {b.arrow !== false && (
          <g>
            <Stroke t={t} at={b.at + 0.6} dur={0.5} d="M-220,130 C-110,70 10,-50 210,-240" stroke={col(k, 'ink')} w={8} />
            <Stroke t={t} at={b.at + 1.05} dur={0.2} d="M170,-240 L212,-242 L208,-198" stroke={col(k, 'ink')} w={8} />
          </g>
        )}
      </g>
    );
  },
  magnifier: (b, t, k) => {
    const sw = b.sweepAt !== undefined ? prog(t, b.sweepAt, b.sweepDur ?? 2.2) * (b.sweep ?? 420) : 0;
    return (
      <g transform={`translate(${sw},0)`}>
        <circle r={70} fill="#fff" fillOpacity={0.35} stroke={col(k, 'ink')} strokeWidth={10} />
        <line x1={50} y1={50} x2={110} y2={110} stroke={col(k, 'ink')} strokeWidth={18} strokeLinecap="round" />
      </g>
    );
  },
  // a week of day cards; from crossAt they are crossed out one by one
  calendar: (b, t, k) => {
    const n = b.days ?? 7, x0 = -((n - 1) * 140) / 2;
    return (
      <g>
        {Array.from({length: n}, (_, i) => (
          <Pop key={i} t={t} at={b.at + i * 0.04} ox={x0 + i * 140} oy={0} d={0.25}>
            <rect x={x0 + i * 140 - 55} y={-65} width={110} height={120} fill={col(k, 'paper')} stroke={col(k, 'ink')} strokeWidth={4} />
            <rect x={x0 + i * 140 - 55} y={-65} width={110} height={26} fill={col(k, 'ink')} />
            <text x={x0 + i * 140} y={35} fontSize={52} fill={col(k, 'ink')} fontFamily={PRINT} textAnchor="middle">{i + 1}</text>
          </Pop>
        ))}
        {b.crossAt !== undefined &&
          Array.from({length: n}, (_, i) => (
            <g key={`x${i}`}>
              <Stroke t={t} at={b.crossAt + i * 0.16} dur={0.12} d={`M${x0 + i * 140 - 40},${-30} L${x0 + i * 140 + 40},${40}`} stroke={col(k, 'red')} w={8} marker />
              <Stroke t={t} at={b.crossAt + i * 0.16 + 0.08} dur={0.12} d={`M${x0 + i * 140 + 40},${-30} L${x0 + i * 140 - 40},${40}`} stroke={col(k, 'red')} w={8} marker />
            </g>
          ))}
      </g>
    );
  },
  // sun and moon on a dashed orbit; from turnAt they go round
  daynight: (b, t, k) => {
    const R = 120;
    const turn = b.turnAt !== undefined ? prog(t, b.turnAt, b.turnDur ?? 7.5) * Math.PI * 1.5 : 0;
    const sx = R * Math.cos(Math.PI + turn), sy = R * Math.sin(Math.PI + turn), mx = R * Math.cos(turn), my = R * Math.sin(turn);
    return (
      <g>
        <Stroke t={t} at={b.at} dur={0.8} d={`M${-R},0 A${R},${R} 0 1 1 ${R},0 A${R},${R} 0 1 1 ${-R},0`} stroke={col(k, 'ink')} w={5} dash="10 10" />
        <Pop t={t} at={b.at + 0.5} ox={sx} oy={sy}>
          <g transform={`translate(${sx},${sy})`}>
            {[...Array(8)].map((_, i) => <line key={i} x1={Math.cos(i * 0.785) * 52} y1={Math.sin(i * 0.785) * 52} x2={Math.cos(i * 0.785) * 72} y2={Math.sin(i * 0.785) * 72} stroke={col(k, 'ink')} strokeWidth={6} strokeLinecap="round" />)}
            <circle r={42} fill={col(k, 'yellow')} stroke={col(k, 'ink')} strokeWidth={5} />
          </g>
        </Pop>
        <Pop t={t} at={b.at + 0.8} ox={mx} oy={my}>
          <path transform={`translate(${mx},${my})`} d="M10,-43 A44,44 0 1 0 10,43 A50,50 0 0 1 10,-43 Z" fill={col(k, 'sky')} stroke={col(k, 'ink')} strokeWidth={5} />
        </Pop>
      </g>
    );
  },
  // tally marks drawn one by one, every fifth across the four before it
  tally: (b, t, k) => {
    const n = b.count ?? 7, step = b.step ?? 0.16;
    const groups = Math.ceil(n / 5), span = groups * 190 - 50;
    return (
      <g transform={`translate(${-span / 2},0)`}>
        {Array.from({length: n}, (_, i) => {
          const g = Math.floor(i / 5), j = i % 5, gx = g * 190;
          const d = j === 4 ? `M${gx - 20},45 L${gx + 3 * 34 + 20},-45` : `M${gx + j * 34},-50 L${gx + j * 34},50`;
          return <Stroke key={i} t={t} at={b.at + i * step} dur={0.12} d={d} stroke={col(k, b.color, 'ink')} w={8} />;
        })}
      </g>
    );
  },
  road: (b, t, k) => (
    <g>
      <path d="M-120,190 L-40,-140 L40,-140 L120,190 Z" fill={col(k, b.fill, 'line')} />
      <path d="M0,170 L0,-120" stroke="#fff" strokeWidth={8} strokeDasharray="30 22" />
    </g>
  ),
  bubble: (b, t, k) => (
    <g transform="translate(-270,-170)">
      <path d="M40,20 L500,20 Q540,20 540,60 L540,210 Q540,250 500,250 L180,250 L100,320 L120,250 L40,250 Q0,250 0,210 L0,60 Q0,20 40,20 Z" fill="#fff" stroke={col(k, 'ink')} strokeWidth={6} />
      {b.lines !== false && [0, 1, 2].map((r) => <rect key={r} x={60} y={70 + r * 50} width={[400, 360, 300][r]} height={16} fill={col(k, 'line')} />)}
    </g>
  ),
  thought: (b, t, k) => (
    <g transform="translate(-1255,-520)">
      <path d="M1180,540 C1150,500 1200,460 1240,480 C1260,450 1320,455 1325,490 C1360,495 1365,545 1330,555 C1320,585 1260,585 1245,565 C1215,580 1180,570 1180,540 Z" fill="#fff" stroke={col(k, 'ink')} strokeWidth={5} />
      <circle cx={1170} cy={590} r={10} fill="#fff" stroke={col(k, 'ink')} strokeWidth={4} />
      <circle cx={1150} cy={615} r={6} fill="#fff" stroke={col(k, 'ink')} strokeWidth={4} />
    </g>
  ),
  // a dark storm cloud, with an optional word written on it in white
  cloud: (b, t, k) => (
    <g transform="translate(-165,-150)">
      <Cut d="M40,190 C10,130 80,80 140,110 C170,60 260,70 270,130 C320,140 320,210 270,220 L60,220 Z" fill={col(k, b.fill, 'storm')} tone="white" edge={0} />
      {b.text && <text x={165} y={185} fontSize={b.size ?? 50} fill="#fff" fontFamily={HAND} fontWeight={500} textAnchor="middle">{b.text}</text>}
    </g>
  ),
  mountain: (b, t, k) => (
    <g transform="translate(-390,-610)">
      <path d="M200,700 L320,560 L370,610 L440,520 L580,700 Z" fill={col(k, b.fill, 'tan')} stroke={col(k, 'ink')} strokeWidth={5} strokeLinejoin="round" />
      <path d="M200,700 L320,560 L370,610 L440,520 L580,700 Z" fill="url(#vxHtS)" opacity={0.3} />
      {b.flag !== false && <path d="M440,520 L440,450 L490,470 L440,490" fill={col(k, 'red')} stroke={col(k, 'ink')} strokeWidth={4} />}
    </g>
  ),
  speaker: (b, t, k) => (
    <g transform="translate(-1220,-800)">
      <path d="M1170,770 L1200,770 L1240,740 L1240,860 L1200,830 L1170,830 Z" fill={col(k, 'ink')} />
      {[0, 1, 2].map((i) => <Stroke key={i} t={t} at={b.at + 0.2 + i * 0.12} dur={0.25} d={`M${1265 + i * 24},${770 - i * 10} C${1285 + i * 26},790 ${1285 + i * 26},810 ${1265 + i * 24},${830 + i * 10}`} stroke={col(k, b.color, 'red')} w={6} />)}
    </g>
  ),
  cycle: (b, t, k) => (
    <g transform="translate(-1240,-660)">
      <Stroke t={t} at={b.at} dur={0.6} d="M1290,660 A50,50 0 1 1 1240,610" stroke={col(k, b.color, 'ink')} w={7} />
      <Stroke t={t} at={b.at + 0.5} dur={0.2} d="M1225,592 L1243,612 L1222,628" stroke={col(k, b.color, 'ink')} w={7} />
    </g>
  ),
  sun: (b, t, k) => (
    <g transform={`rotate(${b.spin ? t * 12 : 0})`}>
      {[...Array(8)].map((_, i) => <line key={i} x1={Math.cos(i * 0.785) * 52} y1={Math.sin(i * 0.785) * 52} x2={Math.cos(i * 0.785) * 72} y2={Math.sin(i * 0.785) * 72} stroke={col(k, 'ink')} strokeWidth={6} strokeLinecap="round" />)}
      <circle r={42} fill={col(k, b.fill, 'yellow')} stroke={col(k, 'ink')} strokeWidth={5} />
    </g>
  ),
  moon: (b, t, k) => <path d="M10,-43 A44,44 0 1 0 10,43 A50,50 0 0 1 10,-43 Z" fill={col(k, b.fill, 'sky')} stroke={col(k, 'ink')} strokeWidth={5} />,
  star: (b, t, k) => {
    const pts = Array.from({length: 10}, (_, i) => {
      const r = i % 2 ? 30 : 70, a = -Math.PI / 2 + (i * Math.PI) / 5;
      return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
    }).join(' L');
    return <Cut d={`M${pts} Z`} fill={col(k, b.fill, 'yellow')} stroke={col(k, 'ink')} edge={14} sw={4} />;
  },
  heart: (b, t, k) => <Cut d="M0,60 C-20,40 -90,0 -90,-40 C-90,-80 -40,-90 0,-50 C40,-90 90,-80 90,-40 C90,0 20,40 0,60 Z" fill={col(k, b.fill, 'red')} tone="white" edge={18} />,
  bulb: (b, t, k) => {
    const lit = b.litAt !== undefined ? prog(t, b.litAt, 0.2) : b.lit ? 1 : 0;
    return (
      <g>
        {lit > 0 && [...Array(7)].map((_, i) => { const a = -Math.PI + (i * Math.PI) / 6; return <line key={i} x1={Math.cos(a) * 92} y1={-30 + Math.sin(a) * 92} x2={Math.cos(a) * 122} y2={-30 + Math.sin(a) * 122} stroke={col(k, 'yellow')} strokeWidth={8} strokeLinecap="round" opacity={lit} />; })}
        <path d="M-30,60 C-30,30 -70,10 -70,-30 C-70,-75 -35,-100 0,-100 C35,-100 70,-75 70,-30 C70,10 30,30 30,60 Z" fill={lit > 0 ? mixHex('#ffffff', col(k, 'yellow'), lit) : '#fff'} stroke={col(k, 'ink')} strokeWidth={6} />
        <rect x={-32} y={60} width={64} height={40} rx={6} fill={col(k, 'grey')} stroke={col(k, 'ink')} strokeWidth={5} />
        <path d="M-32,73 L32,73 M-32,86 L32,86" stroke={col(k, 'ink')} strokeWidth={3} />
      </g>
    );
  },
  key: (b, t, k) => (
    <g>
      <Cut d="M-120,-50 A50,50 0 1 1 -120,50 A50,50 0 1 1 -120,-50 Z M-120,-20 A20,20 0 1 0 -120,20 A20,20 0 1 0 -120,-20 Z M-72,-14 L120,-14 L120,40 L96,40 L96,14 L76,14 L76,46 L52,46 L52,14 L-72,14 Z" fill={col(k, b.fill, 'gold')} tone="dark" edge={16} />
    </g>
  ),
  shield: (b, t, k) => (
    <g>
      <Cut d="M0,-130 C60,-110 100,-100 120,-100 C120,10 80,90 0,140 C-80,90 -120,10 -120,-100 C-100,-100 -60,-110 0,-130 Z" fill={col(k, b.fill, 'red')} tone="dark" edge={20} />
      <path d="M0,-100 C40,-86 72,-78 90,-78 C90,4 60,66 0,104 C-60,66 -90,4 -90,-78 C-72,-78 -40,-86 0,-100 Z" fill="none" stroke="#f3e9d4" strokeWidth={6} />
    </g>
  ),
  sword: (b, t, k) => (
    <g>
      <Cut d="M-16,-170 L0,-210 L16,-170 L16,60 L-16,60 Z" fill={col(k, 'silver')} stroke={col(k, 'ink')} edge={16} sw={4} />
      <Cut d="M-80,60 L80,60 L80,82 L-80,82 Z" fill={col(k, b.fill, 'wood')} edge={14} />
      <Cut d="M-14,82 L14,82 L14,170 L-14,170 Z" fill="#5a3d1e" edge={14} />
      <circle cy={186} r={18} fill={col(k, 'gold')} stroke="#fff" strokeWidth={6} />
    </g>
  ),
  crown: (b, t, k) => (
    <g>
      <Cut d="M-120,70 L-130,-50 L-65,5 L0,-85 L65,5 L130,-50 L120,70 Z" fill={col(k, b.fill, 'yellow')} tone="dark" edge={18} />
      {[-65, 0, 65].map((x0) => <circle key={x0} cx={x0} cy={40} r={14} fill={col(k, 'red')} />)}
    </g>
  ),
  dove: (b, t, k) => {
    const flap = b.flap ? Math.sin(t * 9) * 14 : 0;
    return (
      <g>
        <path d={`M-20,-5 C10,-${70 + flap} 60,-${105 + flap} 125,-${115 + flap} C95,-${60 + flap / 2} 70,-20 35,8 Z`} fill="#fff" stroke={col(k, 'ink')} strokeWidth={4} strokeLinejoin="round" />
        <path d="M-130,10 C-95,-12 -60,-14 -30,-4 C10,10 60,18 110,48 C70,54 30,52 10,50 C-20,74 -70,78 -100,52 C-118,40 -126,26 -130,10 Z" fill="#fff" stroke={col(k, 'ink')} strokeWidth={4} strokeLinejoin="round" />
        <path d="M-150,6 L-128,2 L-130,16 Z" fill={col(k, 'gold')} stroke={col(k, 'ink')} strokeWidth={3} />
        <circle cx={-112} cy={4} r={4} fill={col(k, 'ink')} />
      </g>
    );
  },
  lamp: (b, t, k) => {
    const fl = 1 + 0.12 * Math.sin(t * 13) + 0.06 * Math.sin(t * 21);
    return (
      <g>
        <path transform={`translate(150,-44) scale(${2 - fl},${fl})`} d="M0,0 C-22,-10 -16,-40 0,-70 C16,-40 22,-10 0,0 Z" fill={col(k, 'orange')} stroke="#fff" strokeWidth={6} />
        <path transform={`translate(150,-44) scale(${(2 - fl) * 0.55},${fl * 0.6})`} d="M0,0 C-22,-10 -16,-40 0,-70 C16,-40 22,-10 0,0 Z" fill={col(k, 'yellow')} />
        <Cut d="M-120,20 C-120,-20 -40,-40 40,-30 C90,-25 120,-10 160,-36 C150,0 120,30 80,45 C20,70 -100,60 -120,20 Z" fill={col(k, b.fill, 'clay')} tone="dark" edge={18} />
        <path d="M-118,6 C-160,-10 -170,40 -128,40" stroke={col(k, b.fill, 'clay')} strokeWidth={14} fill="none" />
      </g>
    );
  },
  tent: (b, t, k) => (
    <g>
      <Cut d="M-180,120 L0,-130 L180,120 Z" fill={col(k, b.fill, 'tan')} tone="dark" edge={18} />
      <path d="M-34,120 L0,30 L34,120 Z" fill={col(k, 'brown')} />
      <path d="M0,-130 L0,-160 M0,-130 L-200,130 M0,-130 L200,130" stroke="#5a3d1e" strokeWidth={6} />
    </g>
  ),
  wall: (b, t, k) => (
    <g>
      <g filter="url(#vxShadow)">
        {Array.from({length: 5}, (_, r) =>
          Array.from({length: r % 2 ? 4 : 5}, (_, c) => <rect key={`${r}${c}`} x={-250 + c * 100 + (r % 2 ? 50 : 0)} y={-100 + r * 50} width={96} height={46} fill={col(k, b.fill, 'stone')} stroke="#fff" strokeWidth={6} />),
        )}
        {[0, 1, 2, 3, 4].map((c) => <rect key={c} x={-250 + c * 100 + 18} y={-150} width={60} height={50} fill={col(k, b.fill, 'stone')} stroke="#fff" strokeWidth={6} />)}
      </g>
      <rect x={-256} y={-156} width={512} height={312} fill="url(#vxHtS)" opacity={0.25} />
    </g>
  ),
  trumpet: (b, t, k) => (
    <g>
      <Cut d="M-180,96 C-130,70 -50,52 20,14 C70,-14 100,-60 108,-118 L196,-92 C186,-24 140,36 70,70 C-10,108 -110,118 -176,122 Z" fill={col(k, b.fill, 'parchment')} tone="dark" edge={18} />
      <ellipse cx={152} cy={-105} rx={46} ry={18} transform="rotate(16 152 -105)" fill={col(k, 'brown')} stroke="#fff" strokeWidth={6} />
      {[-120, -60, 0, 60].map((x0, i) => <path key={x0} d={`M${x0},${[74, 58, 32, -4][i]} l${[6, 10, 14, 22][i]},${[42, 46, 54, 60][i]}`} stroke={col(k, 'brown')} strokeWidth={5} opacity={0.55} />)}
    </g>
  ),
  cross: (b, t, k) => (
    <g>
      <Cut d="M-22,-170 L22,-170 L22,-95 L100,-95 L100,-55 L22,-55 L22,170 L-22,170 L-22,-55 L-100,-55 L-100,-95 L-22,-95 Z" fill={col(k, b.fill, 'wood')} tone="dark" edge={18} />
    </g>
  ),
  sheep: (b, t, k) => (
    <g>
      {[[-12, 120], [36, 120], [-60, 120], [70, 120]].map(([x0, y0]) => <rect key={x0} x={x0 - 8} y={40} width={16} height={y0 - 40} fill={col(k, 'ink')} />)}
      <g filter="url(#vxShadow)">
        {[[-60, 0, 46], [-15, -24, 50], [35, -18, 50], [70, 10, 42], [20, 30, 50], [-35, 30, 46]].map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill="#fff" stroke={col(k, 'line')} strokeWidth={4} />)}
      </g>
      <ellipse cx={-110} cy={-16} rx={34} ry={44} fill={col(k, 'ink')} transform="rotate(20 -110 -16)" />
      <circle cx={-118} cy={-26} r={5} fill="#fff" />
    </g>
  ),
  mug: (b, t, k) => (
    <g transform="translate(-1570,-655)">
      <path d="M1520,600 L1620,600 L1610,710 L1530,710 Z" fill="#fff" stroke={col(k, 'ink')} strokeWidth={5} />
      <path d="M1620,620 C1660,620 1660,680 1615,680" stroke={col(k, 'ink')} strokeWidth={5} fill="none" />
      {b.steam !== false && [0, 1].map((i) => <path key={i} d={`M${1550 + i * 40},${585 - ((t * 20 + i * 10) % 20)} c 10,-14 -10,-28 0,-42`} stroke={col(k, 'mute')} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.6} />)}
    </g>
  ),
  bell: (b, t, k) => {
    const sw = b.ringAt !== undefined && t >= b.ringAt ? Math.sin((t - b.ringAt) * 30) * 18 * (1 - prog(t, b.ringAt, 0.8)) : 0;
    return (
      <g transform={`rotate(${sw} 0 -32) scale(1.6)`}>
        <path d="M-26,18 C-26,-10 -22,-30 0,-32 C22,-30 26,-10 26,18 L34,26 L-34,26 Z" fill={col(k, b.fill, 'yellow')} stroke={col(k, 'ink')} strokeWidth={4} />
        <circle cy={34} r={8} fill={col(k, 'ink')} />
      </g>
    );
  },
  cursor: (b, t, k) => <path d="M0,0 L0,64 L16,50 L28,76 L40,70 L28,46 L48,44 Z" fill="#fff" stroke={col(k, 'ink')} strokeWidth={4} strokeLinejoin="round" transform={b.clickAt !== undefined && t > b.clickAt && t < b.clickAt + 0.2 ? 'scale(0.9)' : undefined} />,
};
export const VOX_ART = Object.keys(ART);

const VoxArt: React.FC<P> = ({b, t, k, x}) => {
  if (t < b.at) return null;
  const o = fadeOut(t, b.out);
  if (o <= 0) return null;
  const fn = ART[b.kind];
  if (!fn) return null;
  const [px, py] = moved(b, t);
  const en = entrance(b.enter, t, b.at, x.W);
  const s = b.size ?? 1;
  return (
    <g opacity={o * en.op} transform={`translate(${px},${py}) ${en.tr} rotate(${b.rot ?? 0}) scale(${s * en.s * (b.flip ? -1 : 1)},${s * en.s})`} filter={b.shadow === false || NO_SHADOW.has(b.kind) ? undefined : 'url(#vxShadow)'}>
      {fn(b, t, k)}
    </g>
  );
};
// pictures that are drawn with lines or sit flat on the page get no drop shadow
const NO_SHADOW = new Set(['iron', 'crowd', 'chart', 'magnifier', 'calendar', 'daynight', 'tally', 'road', 'speaker', 'cycle', 'cursor', 'map', 'target', 'thermometer', 'wall']);

// ---------- draw anything: a drawing the storyboard carries in "drawings", in the cut out look ----------
type Part = {d?: string; fill?: string; tone?: string; line?: boolean; dash?: string; stroke?: string; width?: number; text?: string; x?: number; y?: number; size?: number; font?: string; anchor?: string};
const VoxDraw: React.FC<P> = ({b, t, k, x}) => {
  if (t < b.at) return null;
  const o = fadeOut(t, b.out);
  if (o <= 0) return null;
  const parts = ((b.drawing?.parts ?? []) as Part[]);
  const [px, py] = moved(b, t);
  const enter = b.enter ?? 'pop';
  const en = entrance(enter === 'draw' ? 'none' : enter, t, b.at, x.W);
  const s = b.size ?? 1;
  const dp = enter === 'draw' ? prog(t, b.at, b.dur ?? 0.9) : 1;
  const anim = b.anim ?? 'none';
  const rt = t - b.at;
  const a = anim === 'bob' ? `translate(0,${Math.sin(rt * 3) * 8})` : anim === 'float' ? `translate(0,${Math.sin(rt * 1.6) * 14})` : anim === 'sway' ? `rotate(${Math.sin(rt * 2.4) * 5})` : anim === 'spin' ? `rotate(${rt * 60})` : anim === 'pulse' ? `scale(${1 + 0.06 * Math.sin(rt * 5)})` : anim === 'shake' ? `translate(${Math.sin(rt * 40) * 4},0)` : '';
  const filled = parts.filter((p) => p.d && !p.line);
  const edge = (b.edge ?? 20) / s;
  return (
    <g opacity={o * en.op} transform={`translate(${px},${py}) ${en.tr} rotate(${b.rot ?? 0}) scale(${s * en.s * (b.flip ? -1 : 1)},${s * en.s}) ${a}`}>
      <g opacity={enter === 'draw' ? prog(t, b.at + (b.dur ?? 0.9) * 0.6, 0.3) : 1}>
        <g filter={b.shadow === false ? undefined : 'url(#vxShadow)'}>{edge > 0 && filled.map((p, i) => <path key={i} d={p.d} fill="#fff" stroke="#fff" strokeWidth={edge} strokeLinejoin="round" />)}</g>
        {filled.map((p, i) => (
          <g key={i}>
            <path d={p.d} fill={col(k, p.fill, 'tan')} stroke={p.stroke ? col(k, p.stroke) : undefined} strokeWidth={p.stroke ? p.width ?? 5 : undefined} strokeLinejoin="round" />
            {p.tone && TONES[p.tone] && <path d={p.d} fill={TONES[p.tone][0]} opacity={TONES[p.tone][1]} />}
          </g>
        ))}
      </g>
      {parts.filter((p) => p.d && p.line).map((p, i) =>
        p.dash ? (
          <path key={i} d={p.d} fill="none" stroke={col(k, p.stroke, 'ink')} strokeWidth={p.width ?? 6} strokeLinecap="round" strokeDasharray={p.dash} opacity={dp} />
        ) : (
          <path key={i} d={p.d} pathLength={1} fill="none" stroke={col(k, p.stroke, 'ink')} strokeWidth={p.width ?? 6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - eio(dp)} />
        ),
      )}
      {parts.filter((p) => p.text !== undefined).map((p, i) => {
        const f = fontOf(p.font ?? 'print');
        return <text key={i} x={p.x ?? 0} y={p.y ?? 0} fontSize={p.size ?? 40} fill={col(k, p.fill, 'ink')} fontFamily={`"${f.family}"`} fontWeight={f.weight} fontStyle={f.style} textAnchor={(p.anchor as any) ?? 'middle'} opacity={dp}>{p.text}</text>;
      })}
    </g>
  );
};

// ---------- dispatch ----------
const renderVox = (b: Block, t: number, k: K, x: Ctx): React.ReactNode => {
  if (b.at !== undefined && t < b.at - 0.001) return null;
  const p = {b, t, k, x};
  switch (b.type) {
    case 'voxCard': return <VoxCard {...p} />;
    case 'voxTag': return <VoxTag {...p} />;
    case 'voxText': return <VoxText {...p} />;
    case 'voxHighlight': return <VoxHighlight {...p} />;
    case 'voxLine': return <VoxLine {...p} />;
    case 'voxStamp': return <VoxStamp {...p} />;
    case 'voxChip': return <VoxChip {...p} />;
    case 'voxMark': return <VoxMark {...p} />;
    case 'voxNumbers': return <VoxNumbers {...p} />;
    case 'voxList': return <VoxList {...p} />;
    case 'voxNetwork': return <VoxNetwork {...p} />;
    case 'voxSparks': return <VoxSparks {...p} />;
    case 'voxArt': return <VoxArt {...p} />;
    case 'voxDraw': return <VoxDraw {...p} />;
    case 'voxSubscribe': return <VoxSubscribe {...p} />;
    case 'voxGroup': return <VoxGroup {...p} />;
    default: return null;
  }
};

// ---------- the stage: scenes as sheets of colour that slide, pan, zoom or cut, each with its own camera ----------
type Cam = {t: number; x?: number; y?: number; zoom?: number; dur?: number};
const camAt = (t: number, keys: Cam[], W: number, H: number) => {
  let x = W / 2, y = H / 2, z = 1;
  for (const c of keys) {
    if (t <= c.t) break;
    const p = eio(prog(t, c.t, c.dur ?? 1.2));
    x = lerp(x, c.x ?? x, p);
    y = lerp(y, c.y ?? y, p);
    z = lerp(z, c.zoom ?? z, p);
  }
  return {x, y, z};
};
// hammer hits and blocks marked "shake" jolt the camera
const shakeTimes = (blocks: Block[]): number[] => blocks.flatMap((b) => [...(b.shake && b.at !== undefined ? [b.at] : []), ...(b.type === 'voxArt' && b.kind === 'hammer' ? (b.hits ?? []) : []), ...shakeTimes((b.blocks ?? []) as Block[])]);

export const VoxAnimate: React.FC<AnimateProps> = ({style, storyboard, silent}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const [ready, setReady] = React.useState(false);
  const [handle] = React.useState(() => delayRender('loading the vox fonts and grain'));
  React.useEffect(() => {
    const img = new Image();
    const grain = new Promise<void>((done) => {
      img.onload = img.onerror = () => done();
      img.src = staticFile(GRAIN);
    });
    Promise.all([fontsReady, grain]).then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [handle]);
  const k = mergeTokens(style, storyboard.variant, storyboard.palette);
  const v = k.vox ?? {};
  const t = frame / fps;
  const TR = v.transition ?? 0.6;
  const scenes = storyboard.scenes;
  if (!ready) return <AbsoluteFill style={{backgroundColor: col(k, 'bg', 'cream')}} />;
  const layers: React.ReactNode[] = [];
  scenes.forEach((s, i) => {
    const next = scenes[i + 1];
    if (t < s.start || (next && t >= next.start + TR)) return;
    const enter = (i === 0 ? 'none' : s.transition ?? 'cut') as string;
    const kin = enter === 'none' || enter === 'cut' ? 1 : eio(prog(t, s.start, TR));
    let tr = '', op = 1, z = 1;
    if (enter === 'slide') tr = `translateY(${(1 - kin) * H}px) rotate(${(1 - kin) * 2}deg)`;
    if (enter === 'pan') tr = `translateX(${(1 - kin) * W}px)`;
    if (enter === 'zoom') tr = `scale(${lerp(0.9, 1, kin)})`;
    if (next && t >= next.start) {
      const nt = next.transition ?? 'cut';
      const j = nt === 'cut' ? 1 : eio(prog(t, next.start, TR));
      if (nt === 'pan') tr = `translateX(${-j * W}px)`;
      if (nt === 'zoom') {
        tr = `scale(${lerp(1, 1.35, j)})`;
        op = 1 - clamp(j / 0.55);
        z = 2;
      }
      if (nt === 'slide') tr = `scale(${lerp(1, 0.94, j)})`;
      if (nt === 'cut') op = 0;
    }
    const cam = camAt(t, (s.cam ?? []) as Cam[], W, H);
    const still = s.camera === 'still';
    let shake = 0;
    for (const h of shakeTimes(s.blocks)) {
      const q = prog(t, h, 0.25);
      if (q > 0 && q < 1) shake = Math.max(shake, (1 - q) * 14);
    }
    const drift = still ? 0 : v.drift ?? 5;
    const dx = Math.sin(t * 0.45 + i) * drift + (shake ? Math.sin(t * 90) * shake : 0);
    const dy = Math.cos(t * 0.38 + i) * drift * 0.8 + (shake ? Math.cos(t * 77) * shake : 0);
    const zoom = cam.z * (1 + (still ? 0 : v.breathe ?? 0.012) * Math.sin(t * 0.3 + i));
    const ctx: Ctx = {W, H, render: (c) => renderVox(c, t, k, ctx)};
    layers.push(
      <AbsoluteFill key={`${s.id}${i}`} style={{transform: tr, opacity: op, zIndex: z, background: s.tint && k.tints?.[s.tint] !== undefined ? gray(k.tints[s.tint]) : col(k, s.tint ?? 'bg', 'cream'), boxShadow: '0 -20px 40px rgba(0,0,0,.35)'}}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <g transform={`translate(${W / 2 + dx},${H / 2 + dy}) scale(${zoom}) translate(${-cam.x},${-cam.y})`}>
            {s.blocks.map((b, bi) => <g key={bi}>{renderVox(b, t, k, ctx)}</g>)}
          </g>
        </svg>
      </AbsoluteFill>,
    );
  });
  const octx: Ctx = {W, H, render: (c) => renderVox(c, t, k, octx)};
  return (
    <AbsoluteFill style={{background: '#111', overflow: 'hidden'}}>
      <svg width={0} height={0} style={{position: 'absolute'}}><Defs k={k} /></svg>
      {layers}
      {(storyboard.overlay ?? []).length > 0 && (
        <AbsoluteFill style={{zIndex: 5}}>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>{(storyboard.overlay ?? []).map((b, i) => <g key={i}>{renderVox(b, t, k, octx)}</g>)}</svg>
        </AbsoluteFill>
      )}
      {(v.grain ?? 0.35) > 0 && <AbsoluteFill style={{backgroundImage: `url(${staticFile(GRAIN)})`, backgroundSize: '512px 512px', opacity: v.grain ?? 0.35, zIndex: 10}} />}
      {(v.vignette ?? 0.3) > 0 && <AbsoluteFill style={{background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(60,40,10,${v.vignette ?? 0.3}) 100%)`, zIndex: 11}} />}
      {!silent && storyboard.audio && <Audio src={staticFile(storyboard.audio)} />}
    </AbsoluteFill>
  );
};

// re exported for the reference sheets and the validator's lists
export type VoxScene = Scene;

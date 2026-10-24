// Soft light for sleek looks: gradient fills that any shape or the hero may use, a rainbow edge like light caught
// on glass, and the `ring` block (a glowing ring that draws itself, breathes, spins and may be an arc).
import React from 'react';
import type {Block} from './blocks';
import {StyleTokens, clamp, cubicInOut, gray, progress} from './lib';
import {easeBack, easeIn, easeOut, pose} from './paper';

type P = {b: Block; t: number; k: StyleTokens};

// ---------- gradients ----------
// `gradient` is a list of colour names (first at the top, last at the bottom) or
// {colors, angle, kind}: angle 0 runs top to bottom, 90 left to right; kind linear (default) or radial (from the middle out).
export type Grad = {colors: string[]; angle: number; kind: 'linear' | 'radial'};
export const gradOf = (g: any): Grad | null => {
  if (Array.isArray(g) && g.length) return {colors: g, angle: 0, kind: 'linear'};
  if (g && typeof g === 'object' && Array.isArray(g.colors) && g.colors.length) return {colors: g.colors, angle: g.angle ?? 0, kind: g.kind === 'radial' ? 'radial' : 'linear'};
  return null;
};
export const colorOf = (k: StyleTokens, c: string | undefined, def: string) => (c && k.palette?.[c] !== undefined ? gray(k.palette[c]) : c && c.startsWith('#') ? c : def);

// The same block always gets the same id, so a frame never depends on what was drawn before it.
export const idOf = (prefix: string, b: Block) => {
  const s = JSON.stringify(b);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${prefix}${(h >>> 0).toString(36)}`;
};

export const GradDef: React.FC<{id: string; g: Grad; stops: string[]; spin?: number}> = ({id, g, stops, spin = 0}) => {
  const st = stops.map((c, i) => <stop key={i} offset={`${stops.length === 1 ? 0 : (i / (stops.length - 1)) * 100}%`} stopColor={c} />);
  if (g.kind === 'radial') return <radialGradient id={id} cx="0.5" cy="0.5" r="0.6">{st}</radialGradient>;
  const a = ((g.angle + spin) * Math.PI) / 180;
  const vx = Math.sin(a) / 2, vy = Math.cos(a) / 2;
  return (
    <linearGradient id={id} x1={0.5 - vx} y1={0.5 - vy} x2={0.5 + vx} y2={0.5 + vy}>
      {st}
    </linearGradient>
  );
};

// ---------- rainbow edge: a thin stroke that runs pink, amber, mint, cyan and violet on one side and fades out on the other ----------
const RAINBOW = ['#ff5fa2', '#ffb547', '#7dffb0', '#59c8ff', '#8b6bff'];
export const Rainbow: React.FC<{id: string; d: string; width: number; amount: number; angle: number}> = ({id, d, width, amount, angle}) => {
  if (amount <= 0.01) return null;
  const a = (angle * Math.PI) / 180;
  const vx = Math.sin(a) / 2, vy = -Math.cos(a) / 2;
  return (
    <g opacity={clamp(amount)} style={{mixBlendMode: 'screen'}}>
      <linearGradient id={id} x1={0.5 + vx} y1={0.5 + vy} x2={0.5 - vx} y2={0.5 - vy}>
        {RAINBOW.map((c, i) => (
          <stop key={i} offset={`${i * 14}%`} stopColor={c} stopOpacity={1} />
        ))}
        <stop offset="78%" stopColor={RAINBOW[4]} stopOpacity={0} />
      </linearGradient>
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={width} strokeLinecap="round" style={{filter: `blur(${Math.max(1.5, width * 0.35)}px)`}} />
    </g>
  );
};

// ---------- ring: a glowing ring with a soft bloom inside and out ----------
// {type: ring, at, x, y, r, width, color or gradient, glow 0 to 1, rainbow 0 to 1, sweep (degrees, 360 is whole),
//  rot (where an arc is centred, 0 is the top), spin (degrees a second), enter draw | pop | grow | rise | none, out,
//  keys [{t, dur, ease, x, y, r, width, glow, rainbow, sweep, rot, opacity}], breathe false to keep the light still}
const EASE: Record<string, (x: number) => number> = {back: easeBack, out: easeOut, in: easeIn, inout: cubicInOut, linear: clamp, spring: (x: number) => (x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.exp(-6.5 * x) * Math.cos(13 * x) * (1 - x))};
const arcD = (cx: number, cy: number, r: number, sweep: number, rot: number) => {
  if (sweep >= 359.9) return `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
  const p = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(cx + Math.sin(a) * r).toFixed(2)},${(cy - Math.cos(a) * r).toFixed(2)}`;
  };
  const s = Math.max(0.01, sweep);
  return `M${p(rot - s / 2)} A${r},${r} 0 ${s > 180 ? 1 : 0},1 ${p(rot + s / 2)}`;
};

export const RingBlock: React.FC<P> = ({b, t, k}) => {
  const draw = (b.enter ?? 'draw') === 'draw';
  // exit fade (default) fades over 0.4 s; pop, peel and fly use the shared exits
  const fades = (b.exit ?? 'fade') === 'fade';
  const ps = pose(t, b.at, fades ? undefined : b.out, draw || b.enter === 'grow' ? 'none' : b.enter ?? 'pop', b.exit ?? 'pop', 1920);
  if (ps.gone || (fades && b.out !== undefined && t > b.out + 0.4)) return null;
  const v: Record<string, number> = {x: b.x ?? 540, y: b.y ?? 820, r: b.r ?? 160, width: b.width ?? 22, glow: b.glow ?? 1, rainbow: b.rainbow ?? 0, sweep: b.sweep ?? 360, rot: b.rot ?? 0, opacity: 1};
  for (const kf of (b.keys as any[] | undefined) ?? []) {
    if (t < kf.t) break;
    const p = (EASE[kf.ease] ?? cubicInOut)(progress(t, kf.t, kf.dur ?? 0.6));
    for (const key of Object.keys(v)) if (kf[key] !== undefined) v[key] += (kf[key] - v[key]) * p;
  }
  const e = Math.max(0, t - b.at);
  const grow = b.enter === 'grow' ? easeOut(e / 0.8) : 1;
  const sweep = draw ? v.sweep * cubicInOut(progress(t, b.at, b.dur ?? 0.9)) : v.sweep;
  if (sweep <= 0.5) return null;
  const fadeOut = fades && b.out !== undefined ? 1 - progress(t, b.out, 0.4) : 1;
  const breathe = b.breathe === false ? 1 : 1 + 0.08 * Math.sin(e * 2 * Math.PI * 0.4);
  const pulse = b.loop === 'pulse' ? 1 + 0.03 * Math.sin(e * 3.2) : 1;
  const rot = v.rot + (b.spin ?? 0) * e;
  const cx = v.x + ps.x, cy = v.y + ps.y;
  const r = v.r * ps.scale * grow * pulse;
  const w = v.width * ps.scale;
  if (r <= 1 || w <= 0.2) return null;
  const g = gradOf(b.gradient);
  const base = colorOf(k, b.color ?? g?.colors[0], colorOf(k, 'blue', '#2f7bf6'));
  const light = g ? colorOf(k, g.colors[g.colors.length - 1], base) : base;
  const gid = idOf('rg', b), rid = idOf('rr', b);
  const d = arcD(cx, cy, r, sweep, rot);
  const glow = v.glow * breathe;
  const op = ps.opacity * fadeOut * v.opacity * (b.opacity ?? 1) * (b.enter === 'grow' ? clamp(e / 0.4) : 1);
  return (
    <g opacity={op}>
      {g && <GradDef id={gid} g={g} stops={g.colors.map((c) => colorOf(k, c, base))} spin={rot} />}
      {glow > 0.01 && <path d={d} fill="none" stroke={base} strokeWidth={w * 3.2} strokeLinecap="round" opacity={0.42 * glow} style={{filter: `blur(${Math.max(10, w * 1.7)}px)`}} />}
      {glow > 0.01 && <path d={d} fill="none" stroke={light} strokeWidth={w * 1.5} strokeLinecap="round" opacity={0.5 * glow} style={{filter: `blur(${Math.max(4, w * 0.6)}px)`}} />}
      <path d={d} fill="none" stroke={g ? `url(#${gid})` : base} strokeWidth={w} strokeLinecap="round" style={{filter: `blur(${Math.max(0.6, w * 0.12)}px)`}} />
      <Rainbow id={rid} d={arcD(cx, cy, r + w * 0.42, sweep, rot)} width={Math.max(2, w * 0.32)} amount={v.rainbow} angle={(b.rainbowAngle ?? -35) + rot} />
    </g>
  );
};

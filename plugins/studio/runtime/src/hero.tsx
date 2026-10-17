// The hero of Abstract Geometry: one shape that stands for the viewer and acts out every line.
// Its outline is 180 points, so any two shapes morph point to point. It squashes, spikes, shatters into wedges,
// leaves a trail, glows from inside and crystallises into a gem. Besides the ready made shapes, a storyboard may
// draw its own (`shapes`): any outline that can be seen whole from its own middle.
import React from 'react';
import type {Block} from './blocks';
import {StyleTokens, clamp, cubicInOut, gray, hash, progress} from './lib';
import {easeBack, easeIn, easeOut} from './paper';

type P = {b: Block; t: number; k: StyleTokens};

const N = 180;
const WEDGES = 9;

// Radial distance from the centre to the outline of a polygon, along direction theta (0 = up, clockwise).
// Where the outline folds back behind itself the farthest crossing wins, so a shape never tears.
const rayRadius = (verts: number[][], theta: number) => {
  const dx = Math.sin(theta), dy = -Math.cos(theta);
  let best = 0;
  for (let i = 0; i < verts.length; i++) {
    const [ax, ay] = verts[i], [bx, by] = verts[(i + 1) % verts.length];
    const ex = bx - ax, ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const tt = (ax * ey - ay * ex) / den;
    const u = (ax * dy - ay * dx) / den;
    if (tt > 0 && u >= -1e-9 && u <= 1 + 1e-9 && tt > best) best = tt;
  }
  return best || 1;
};

const blur = (arr: number[], w: number) =>
  arr.map((_, i) => {
    let s = 0;
    for (let j = -w; j <= w; j++) s += arr[(i + j + N) % N];
    return s / (2 * w + 1);
  });

// Points along a circle from angle a0 to a1 in degrees (0 = up, clockwise).
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) =>
  Array.from({length: n + 1}, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
  });

const polyShape = (verts: number[][], soften = 0) => {
  const r = Array.from({length: N}, (_, i) => rayRadius(verts, (i / N) * Math.PI * 2));
  return soften ? blur(r, soften) : r;
};

const SHAPES: Record<string, number[]> = {
  circle: Array(N).fill(1),
  square: polyShape([[-0.88, -0.88], [0.88, -0.88], [0.88, 0.88], [-0.88, 0.88]], 7),
  triangle: polyShape([[0, -1.2], [1.04, 0.6], [-1.04, 0.6]], 4),
  hexagon: polyShape(Array.from({length: 6}, (_, i) => [Math.sin((i / 6) * Math.PI * 2) * 1.05, -Math.cos((i / 6) * Math.PI * 2) * 1.05]), 2),
  // table, crown, girdle and the point of the pavilion
  gem: polyShape([[-0.5, -0.7], [0.5, -0.7], [1.0, -0.2], [0, 1.0], [-1.0, -0.2]]),
  star: polyShape(Array.from({length: 10}, (_, i) => [Math.sin((i / 10) * Math.PI * 2) * (i % 2 ? 0.56 : 1.25), -Math.cos((i / 10) * Math.PI * 2) * (i % 2 ? 0.56 : 1.25)]), 1),
  drop: polyShape([[0, -1.3], ...arc(0, 0.25, 0.85, 56.8, 303.2, 24)], 1),
  heart: polyShape(Array.from({length: 48}, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return [(16 * Math.sin(a) ** 3) / 15, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 15 + 0.1];
  }), 1),
  arrow: polyShape([[0, -1.2], [1.0, 0.05], [0.4, 0.05], [0.4, 1.1], [-0.4, 1.1], [-0.4, 0.05], [-1.0, 0.05]], 1),
  shield: polyShape([[-0.88, -0.95], [0.88, -0.95], [0.88, 0.15], [0.62, 0.72], [0, 1.2], [-0.62, 0.72], [-0.88, 0.15]], 2),
  pill: polyShape([...arc(0.68, 0, 0.62, 0, 180, 12), ...arc(-0.68, 0, 0.62, 180, 360, 12)]),
  cross: polyShape([[-0.36, -1.1], [0.36, -1.1], [0.36, -0.36], [1.1, -0.36], [1.1, 0.36], [0.36, 0.36], [0.36, 1.1], [-0.36, 1.1], [-0.36, 0.36], [-1.1, 0.36], [-1.1, -0.36], [-0.36, -0.36]], 1),
  house: polyShape([[0, -1.15], [1.08, 0.02], [0.8, 0.02], [0.8, 0.98], [-0.8, 0.98], [-0.8, 0.02], [-1.08, 0.02]], 1),
  leaf: polyShape([...Array.from({length: 17}, (_, i) => [0.62 * Math.sin((i / 16) * Math.PI), -1.25 + (2.5 * i) / 16]), ...Array.from({length: 15}, (_, i) => [-0.62 * Math.sin(((15 - i) / 16) * Math.PI), -1.25 + (2.5 * (15 - i)) / 16])]),
};
export const HERO_SHAPES = Object.keys(SHAPES);

// Thin inner lines that give a shape its detail (unit coordinates), shown while the hero is that shape.
const DETAILS: Record<string, number[][]> = {
  leaf: [[0, -0.95, 0, 0.95], [0, -0.2, 0.3, -0.5], [0, 0.3, -0.32, 0]],
};

// Shapes a storyboard draws for itself: {points: [[x, y], ...], soften, lines}, in the same unit square as the ones above.
type Custom = {points: number[][]; soften?: number; lines?: number[][]};
const customCache = new Map<string, number[]>();
const shapeOf = (name: string | null | undefined, b: Block): number[] | undefined => {
  if (!name) return undefined;
  if (SHAPES[name]) return SHAPES[name];
  const def = (b.shapes as Record<string, Custom> | undefined)?.[name];
  if (!def?.points) return undefined;
  const key = name + JSON.stringify(def.points) + (def.soften ?? 0);
  if (!customCache.has(key)) customCache.set(key, polyShape(def.points, Math.round(clamp((def.soften ?? 1) / 10) * 10)));
  return customCache.get(key);
};
const detailOf = (name: string | null | undefined, b: Block): number[][] | undefined =>
  name ? DETAILS[name] ?? (SHAPES[name] ? undefined : (b.shapes as Record<string, Custom> | undefined)?.[name]?.lines) : undefined;

const rgb = (c: string): number[] => {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};
const mix = (a: number[], b: number[], p: number) => a.map((v, i) => v + (b[i] - v) * p);
const hex = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;

const EASE: Record<string, (x: number) => number> = {back: easeBack, out: easeOut, in: easeIn, inout: cubicInOut, linear: clamp, spring: (x: number) => (x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.exp(-6.5 * x) * Math.cos(13 * x) * (1 - x))};
const NUM_DEFAULT: Record<string, number> = {x: 0, y: 0, r: 0, sx: 1, sy: 1, squash: 0, rot: 0, spike: 0, core: 0, trail: 0, shat: 0, glow: 0, opacity: 1};

type State = {num: Record<string, number>; from: string; to: string | null; m: number; col: number[]};

const stateAt = (b: Block, t: number, k: StyleTokens): State => {
  const palette = (c: string | undefined, def: string) => (c && k.palette?.[c] !== undefined ? gray(k.palette[c]) : c && c.startsWith('#') ? c : def);
  const num = {...NUM_DEFAULT, x: b.x ?? 540, y: b.y ?? 820, r: b.r ?? 96};
  let col = rgb(palette(b.color ?? 'white', '#f0ede4'));
  let from: string = b.shape ?? 'circle';
  let to: string | null = null;
  let m = 0;
  for (const kf of (b.keys as any[] | undefined) ?? []) {
    if (t < kf.t) break;
    const p = (EASE[kf.ease] ?? cubicInOut)(progress(t, kf.t, kf.dur ?? 0.5));
    for (const key of Object.keys(NUM_DEFAULT)) if (kf[key] !== undefined) num[key] += (kf[key] - num[key]) * p;
    if (kf.color !== undefined) col = mix(col, rgb(palette(kf.color, '#f0ede4')), p);
    if (kf.shape !== undefined && kf.shape !== from) {
      if (p >= 1) (from = kf.shape, (to = null), (m = 0));
      else (to = kf.shape, (m = p));
    }
  }
  num.sx *= 1 + num.squash * 0.25;
  num.sy *= 1 - num.squash * 0.3;
  return {num, from, to, m, col};
};

const outline = (s: State, t: number, b: Block) => {
  const a = shapeOf(s.from, b) ?? SHAPES.circle;
  const bShape = s.to ? shapeOf(s.to, b) ?? a : a;
  const q = s.to ? cubicInOut(s.m) : 0;
  const {r, spike} = s.num;
  return Array.from({length: N}, (_, i) => {
    let rr = a[i] + (bShape[i] - a[i]) * q;
    if (spike > 0.001) rr *= 1 + spike * 0.2 * (0.55 * Math.sin(i * 1.7 + t * 19) + 0.45 * Math.sin(i * 4.3 - t * 27));
    return rr * r;
  });
};

const pointsOf = (rad: number[], s: State, cx: number, cy: number) => {
  const rot = (s.num.rot * Math.PI) / 180;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  return rad.map((rr, i) => {
    const th = (i / N) * Math.PI * 2;
    const lx = Math.sin(th) * rr * s.num.sx, ly = -Math.cos(th) * rr * s.num.sy;
    return [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr];
  });
};

const toD = (pts: number[][]) => 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L') + ' Z';

export const HeroBlock: React.FC<P> = ({b, t, k}) => {
  if (t < b.at) return null;
  const enter = b.enter === 'none' ? 1 : easeBack((t - b.at) / 0.5);
  const fade = b.out !== undefined ? 1 - progress(t, b.out, 0.3) : 1;
  if (enter <= 0 || fade <= 0) return null;
  const s = stateAt(b, t, k);
  const {x, y, r} = s.num;
  const e = Math.max(0, t - b.at);
  const float = b.loop === 'float' ? Math.sin(e * 1.7) * 8 : 0;
  // alive at rest: a slow breath of about 2 percent, so the hero never freezes
  const breathe = b.loop === 'pulse' ? 1 + 0.03 * Math.sin(e * 3.2) : b.breathe === false ? 1 : 1 + 0.02 * Math.sin(e * 2 * Math.PI * 0.45);
  const cx = x, cy = y + float;
  const pal = (c: string, def: string) => (k.palette?.[c] !== undefined ? gray(k.palette[c]) : def);
  const lime = pal('lime', '#e9ff1f');
  const dark = pal('dark', gray(k.dark));
  const fill = hex(s.col);
  const rad = outline(s, t, b);
  const pts = pointsOf(rad.map((v) => v * enter * breathe), s, cx, cy);
  const gemW = s.to === 'gem' ? cubicInOut(s.m) : s.from === 'gem' ? (s.to ? 1 - cubicInOut(s.m) : 1) : 0;
  const shat = s.num.shat;

  // ghosts: earlier positions of the hero, fading
  const ghosts: React.ReactNode[] = [];
  if (s.num.trail > 0.01) {
    for (let g = 1; g <= 4; g++) {
      const gs = stateAt(b, t - g * 0.055, k);
      if (Math.hypot(gs.num.x - x, gs.num.y - y) < 3) continue;
      ghosts.push(<path key={g} d={toD(pointsOf(outline(gs, t - g * 0.055, b).map((v) => v * enter), gs, gs.num.x, gs.num.y + float))} fill={fill} opacity={0.26 * s.num.trail * (1 - g / 5)} />);
    }
  }

  // shatter: nine pie wedges fly out, spin and fall, then reassemble when `shat` returns to 0
  let body: React.ReactNode;
  if (shat > 0.001) {
    const per = N / WEDGES;
    body = Array.from({length: WEDGES}, (_, wi) => {
      const lo = Math.round(wi * per), hi = Math.round((wi + 1) * per);
      const seg = pts.slice(lo, hi + 1 > N ? N : hi + 1);
      if (hi >= N) seg.push(pts[0]);
      const th = (((lo + hi) / 2) / N) * Math.PI * 2;
      const dist = r * 2.9 * easeOut(shat) * (0.8 + hash(wi, 3) * 0.5);
      const fall = shat * shat * r * 1.4;
      const spin = (hash(wi, 5) - 0.5) * 300 * shat;
      const wc = [cx + Math.sin(th) * r * 0.45, cy - Math.cos(th) * r * 0.45];
      const d = 'M' + [`${cx.toFixed(1)},${cy.toFixed(1)}`, ...seg.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)].join(' L') + ' Z';
      return (
        <path key={wi} d={d} fill={fill} opacity={1 - 0.35 * shat} transform={`translate(${Math.sin(th) * dist},${-Math.cos(th) * dist + fall}) rotate(${spin},${wc[0]},${wc[1]}) translate(${wc[0]},${wc[1]}) scale(${1 - 0.28 * shat}) translate(${-wc[0]},${-wc[1]})`} />
      );
    });
  } else {
    body = <path d={toD(pts)} fill={fill} strokeLinejoin="round" />;
  }

  // gem facets, drawn with the hero's own rotation and squash
  let facets: React.ReactNode = null;
  if (gemW > 0.02 && shat < 0.01) {
    const tr = (px: number, py: number) => {
      const rot = (s.num.rot * Math.PI) / 180;
      const lx = px * r * s.num.sx * enter, ly = py * r * s.num.sy * enter;
      return `${(cx + lx * Math.cos(rot) - ly * Math.sin(rot)).toFixed(1)},${(cy + lx * Math.sin(rot) + ly * Math.cos(rot)).toFixed(1)}`;
    };
    const lines = [[-1, -0.2, 1, -0.2], [-0.5, -0.7, -0.3, -0.2], [0.5, -0.7, 0.3, -0.2], [-0.3, -0.2, 0, 1], [0.3, -0.2, 0, 1], [0, -0.2, 0, 1]];
    facets = (
      <g opacity={gemW}>
        {lines.map((l, i) => (
          <path key={i} d={`M${tr(l[0], l[1])} L${tr(l[2], l[3])}`} stroke={dark} strokeWidth={3} opacity={0.32} strokeLinecap="round" />
        ))}
        <path d={`M${tr(-0.38, -0.6)} L${tr(0.06, -0.6)} L${tr(-0.2, -0.28)} Z`} fill="#fff" opacity={0.55} />
      </g>
    );
  }

  // inner lines of any other shape that carries detail, faded in and out with the morph
  const details: React.ReactNode[] = [];
  if (shat < 0.01) {
    const q = s.to ? cubicInOut(s.m) : 0;
    for (const [name, w] of [[s.from, 1 - q], [s.to, q]] as [string | null, number][]) {
      const lines = name === 'gem' ? undefined : detailOf(name, b);
      if (!lines || w < 0.02) continue;
      const rot = (s.num.rot * Math.PI) / 180;
      const tr = (px: number, py: number) => {
        const lx = px * r * s.num.sx * enter, ly = py * r * s.num.sy * enter;
        return `${(cx + lx * Math.cos(rot) - ly * Math.sin(rot)).toFixed(1)},${(cy + lx * Math.sin(rot) + ly * Math.cos(rot)).toFixed(1)}`;
      };
      details.push(
        <g key={name} opacity={w}>
          {lines.map((l, i) => (
            <path key={i} d={`M${tr(l[0], l[1])} L${tr(l[2], l[3])}`} stroke={dark} strokeWidth={Math.max(3, r * 0.045)} opacity={0.4} strokeLinecap="round" />
          ))}
        </g>,
      );
    }
  }

  const marker =
    b.marker && shat < 0.01 ? (() => {
      const rot = (s.num.rot * Math.PI) / 180;
      const p = (rr: number) => `${(cx + Math.sin(rot) * rr * s.num.sx).toFixed(1)},${(cy - Math.cos(rot) * rr * s.num.sy).toFixed(1)}`;
      return <path d={`M${p(r * 0.58)} L${p(r * 0.9)}`} stroke={dark} strokeWidth={Math.max(4, r * 0.07)} strokeLinecap="round" opacity={0.5} />;
    })() : null;

  return (
    <g opacity={fade * s.num.opacity}>
      {s.num.glow > 0.01 && <circle cx={cx} cy={cy} r={r * 1.8} fill={lime} opacity={0.3 * s.num.glow} style={{filter: `blur(${Math.max(18, r * 0.5)}px)`}} />}
      {ghosts}
      {body}
      {facets}
      {details}
      {marker}
      {s.num.core > 0.01 && shat < 0.01 && <circle cx={cx} cy={cy} r={r * 0.62 * Math.min(1.2, s.num.core) * enter} fill={lime} opacity={0.92} style={{filter: `blur(${Math.max(8, r * 0.2)}px)`}} />}
    </g>
  );
};

// Raw ink on paper: brush strokes that swell and taper, ink splatters, stamps, doodle frames and the brush swipe between scenes.
import React from 'react';
import type {Block} from './blocks';
import {StyleTokens, clamp, cubicInOut, gray, hash, progress, quintOut} from './lib';

type P = {b: Block; t: number; k: StyleTokens};

const pal = (k: StyleTokens, c: string | undefined, def: string) => (c && k.palette?.[c] !== undefined ? gray(k.palette[c]) : c && c.startsWith('#') ? c : def);
const inkOf = (k: StyleTokens, c?: string) => pal(k, c, gray(k.ink));
const paperOf = (k: StyleTokens) => pal(k, 'paper', gray(k.bg));

// ---------- brush strokes: a ribbon whose width follows pen pressure, on a hand that is never quite steady ----------
type Pt = {x: number; y: number};
type Ribbon = {left: Pt[]; right: Pt[]; s: number[]; len: number};

const sampleSub = (d: string, step: number): {pts: Pt[]; s: number[]; len: number} => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  const len = el.getTotalLength();
  const n = Math.max(2, Math.ceil(len / step));
  const pts: Pt[] = [];
  const s: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((len * i) / n);
    pts.push({x: p.x, y: p.y});
    s.push((len * i) / n);
  }
  return {pts, s, len};
};

const smooth = (x: number) => x * x * (3 - 2 * x);

// pressure: taper in over the first 8 percent, swell in the middle, flick out at the end
const pressure = (u: number, seed: number) => {
  const inP = 0.28 + 0.72 * smooth(clamp(u / 0.08));
  const outP = 0.08 + 0.92 * smooth(clamp((1 - u) / 0.12));
  return Math.min(inP, outP) * (1 + 0.24 * Math.sin(Math.PI * u)) * (1 + 0.07 * Math.sin(u * 23 + seed));
};

const buildRibbon = (d: string, w: number, seedIn: number): Ribbon | null => {
  const {pts, s, len} = sampleSub(d, 4);
  if (len < 1.5) return null;
  const seed = seedIn * 6.28;
  const amp = clamp(w * 0.2, 1.3, 2.8);
  const ph = [hash(seedIn, 1) * 6.28, hash(seedIn, 2) * 6.28, hash(seedIn, 3) * 6.28];
  const wob = (ss: number) => amp * (0.55 * Math.sin(ss * 0.019 + ph[0]) + 0.3 * Math.sin(ss * 0.043 + ph[1]) + 0.15 * Math.sin(ss * 0.091 + ph[2]));
  // a little overshoot past the ends, like a pen that runs on
  const over = Math.min(7, len * 0.04);
  const a = pts[0], a2 = pts[Math.min(3, pts.length - 1)];
  const z = pts[pts.length - 1], z2 = pts[Math.max(0, pts.length - 4)];
  const norm = (dx: number, dy: number) => {
    const m = Math.hypot(dx, dy) || 1;
    return {x: dx / m, y: dy / m};
  };
  const ta = norm(a.x - a2.x, a.y - a2.y), tz = norm(z.x - z2.x, z.y - z2.y);
  const all = [{x: a.x + ta.x * over, y: a.y + ta.y * over}, ...pts, {x: z.x + tz.x * over, y: z.y + tz.y * over}];
  const ss = [-over, ...s, len + over];
  const total = len + over * 2;
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < all.length; i++) {
    const p0 = all[Math.max(0, i - 1)], p1 = all[Math.min(all.length - 1, i + 1)];
    const nm = norm(-(p1.y - p0.y), p1.x - p0.x);
    const o = wob(ss[i] + seed * 40);
    const half = (w * pressure((ss[i] + over) / total, seed)) / 2;
    const cx = all[i].x + nm.x * o, cy = all[i].y + nm.y * o;
    left.push({x: cx + nm.x * half, y: cy + nm.y * half});
    right.push({x: cx - nm.x * half, y: cy - nm.y * half});
  }
  return {left, right, s: ss.map((v) => v + over), len: total};
};

const polyD = (pts: Pt[]) => 'M' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');

export const BrushStroke: React.FC<{d: string; stroke: string; w: number; frac: number; opacity?: number}> = ({d, stroke, w, frac, opacity}) => {
  const ribbons = React.useMemo(() => {
    const subs = d.split(/(?=M)/).map((x) => x.trim()).filter(Boolean);
    const rs = subs.map((sd, i) => buildRibbon(sd, w, (Math.abs(sd.length * 7 + sd.charCodeAt(Math.min(5, sd.length - 1)) * 3 + i * 11) % 997) / 997));
    const total = rs.reduce((n, r) => n + (r ? r.len : 0), 0) || 1;
    return {rs, total};
  }, [d, w]);
  if (frac <= 0) return null;
  let used = 0;
  const parts: React.ReactNode[] = [];
  ribbons.rs.forEach((r, i) => {
    if (!r) return;
    const share = r.len / ribbons.total;
    const f = clamp((frac - used) / share);
    used += share;
    if (f <= 0) return;
    const upto = r.len * f;
    let n = r.s.findIndex((v) => v >= upto);
    if (n < 0) n = r.s.length - 1;
    const tip = (arr: Pt[]) => {
      const i1 = Math.max(1, n), i0 = i1 - 1;
      const span = r.s[i1] - r.s[i0] || 1;
      const u = clamp((upto - r.s[i0]) / span);
      return {x: arr[i0].x + (arr[i1].x - arr[i0].x) * u, y: arr[i0].y + (arr[i1].y - arr[i0].y) * u};
    };
    const l = r.left.slice(0, n), rt = r.right.slice(0, n);
    if (f < 1) (l.push(tip(r.left)), rt.push(tip(r.right)));
    else (l.push(r.left[r.left.length - 1]), rt.push(r.right[r.right.length - 1]));
    if (l.length < 2) return;
    parts.push(<path key={i} d={`${polyD(l)} L${rt.reverse().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} Z`} fill={stroke} />);
  });
  return <g opacity={opacity}>{parts}</g>;
};

// ---------- splatter: a main blot that lands fast, then droplets that fall off with distance ----------
const blobD = (r: number, seed: number, n = 30) => {
  const ph = [hash(seed, 1) * 6.28, hash(seed, 2) * 6.28, hash(seed, 3) * 6.28];
  const pts = Array.from({length: n}, (_, i) => {
    const a = (i / n) * 6.2832;
    const rr = r * (1 + 0.17 * Math.sin(a * 3 + ph[0]) + 0.1 * Math.sin(a * 5 + ph[1]) + 0.07 * Math.sin(a * 8 + ph[2]) + 0.08 * (hash(seed, i, 9) - 0.5));
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  });
  const mid = (i: number) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2];
  let d = `M${mid(n - 1)[0].toFixed(1)},${mid(n - 1)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mid(i)[0].toFixed(1)},${mid(i)[1].toFixed(1)}`;
  return d + ' Z';
};

export const SplatBlock: React.FC<P> = ({b, t, k}) => {
  const seed = b.seed ?? Math.round((b.x ?? 0) * 7 + (b.y ?? 0) * 13);
  const r = b.r ?? 46;
  const geo = React.useMemo(() => {
    const n = b.drops ?? 6 + Math.floor(hash(seed, 50) * 14);
    const drops = Array.from({length: n}, (_, i) => {
      const a = hash(seed, i, 1) * 6.2832;
      const dist = r * (1.45 + Math.pow(hash(seed, i, 2), 0.85) * 3.9);
      const size = Math.max(2.4, r * 0.24 * (1 - dist / (r * 6)) * (0.6 + hash(seed, i, 3) * 0.8));
      return {a, dist, size, delay: 0.03 + (dist / r) * 0.014, tail: hash(seed, i, 4) > 0.62};
    });
    return {blob: blobD(r, seed), drops};
  }, [seed, r, b.drops]);
  const p = quintOut(progress(t, b.at, 0.2));
  if (p <= 0) return null;
  const fill = inkOf(k, b.color);
  const fade = b.out !== undefined ? 1 - progress(t, b.out, 0.3) : 1;
  return (
    <g transform={`translate(${b.x},${b.y})`} fill={fill} opacity={(b.opacity ?? 1) * fade}>
      <path d={geo.blob} transform={`scale(${p * (1 + 0.1 * (1 - p))},${p * (1 - 0.06 * (1 - p))})`} />
      {geo.drops.map((dr, i) => {
        const dp = quintOut(progress(t, b.at + dr.delay, 0.13));
        if (dp <= 0) return null;
        const cx = Math.cos(dr.a) * dr.dist * dp, cy = Math.sin(dr.a) * dr.dist * dp;
        return (
          <g key={i}>
            {dr.tail && <path d={`M${cx},${cy} L${cx - Math.cos(dr.a) * dr.size * 3.4 * dp},${cy - Math.sin(dr.a) * dr.size * 3.4 * dp} L${cx + Math.sin(dr.a) * dr.size * 0.9},${cy - Math.cos(dr.a) * dr.size * 0.9} Z`} />}
            <ellipse cx={cx} cy={cy} rx={dr.size * dp} ry={dr.size * (0.8 + hash(seed, i, 6) * 0.3) * dp} />
          </g>
        );
      })}
    </g>
  );
};

// ---------- stamp: a round or square ink stamp, partly dry, for the one word that matters ----------
export const StampBlock: React.FC<P> = ({b, t, k}) => {
  const size = b.size ?? 170;
  const seed = b.seed ?? Math.round(b.x * 3 + b.y * 5);
  const geo = React.useMemo(() => {
    const square = b.kind === 'square';
    const d = square
      ? `M${-size / 2},${-size / 2 + 8} Q0,${-size / 2 - 5} ${size / 2},${-size / 2 + 4} Q${size / 2 + 6},0 ${size / 2 - 3},${size / 2} Q0,${size / 2 + 6} ${-size / 2 + 4},${size / 2 - 3} Q${-size / 2 - 5},0 ${-size / 2},${-size / 2 + 8} Z`
      : blobD(size / 2, seed, 36);
    const specks = Array.from({length: 30}, (_, i) => {
      const a = hash(seed, i, 1) * 6.2832;
      const rr = Math.sqrt(hash(seed, i, 2)) * size * 0.46;
      return {x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: 1 + hash(seed, i, 3) * 2.6};
    });
    return {d, specks};
  }, [b.kind, size, seed]);
  if (t < b.at) return null;
  const e = progress(t, b.at, 0.2);
  const s = 1 + 0.42 * (1 - quintOut(e)) + 0.06 * Math.sin(e * 3.14);
  const fade = b.out !== undefined ? 1 - progress(t, b.out, 0.3) : 1;
  const text = String(b.text ?? '');
  return (
    <g transform={`translate(${b.x},${b.y}) rotate(${b.rotate ?? -6}) scale(${s})`} opacity={clamp(e * 5) * fade}>
      <path d={geo.d} fill={inkOf(k, b.color)} />
      {geo.specks.map((sp, i) => (
        <circle key={i} cx={sp.x} cy={sp.y} r={sp.r} fill={paperOf(k)} opacity={0.6} />
      ))}
      {text && (
        <text x={0} y={0} dy="0.35em" textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={k.type?.headlineWeight ?? 400} fontSize={b.textSize ?? size * 0.34} fill={paperOf(k)}>
          {text}
        </text>
      )}
    </g>
  );
};

// ---------- doodle frame: two slightly misaligned passes of a wobbly border, with a gap where the pen lifted ----------
const framePasses = (family: string, [x, y, w, h]: number[], seed: number): string[] => {
  const j = (n: number, a = 6) => (hash(seed, n) - 0.5) * 2 * a;
  const L = x, R = x + w, T = y, B = y + h;
  if (family === 'dashed') {
    const dashes: string[] = [];
    const run = (x1: number, y1: number, x2: number, y2: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let s = 0; s < len - 20; s += 64) {
        const e = Math.min(len, s + 38);
        dashes.push(`M${(x1 + ((x2 - x1) * s) / len).toFixed(1)},${(y1 + ((y2 - y1) * s) / len).toFixed(1)} L${(x1 + ((x2 - x1) * e) / len).toFixed(1)},${(y1 + ((y2 - y1) * e) / len).toFixed(1)}`);
      }
    };
    run(L, T, R, T), run(R, T, R, B), run(R, B, L, B), run(L, B, L, T);
    return [dashes.join(' ')];
  }
  if (family === 'cloud') {
    const arcs: string[] = [];
    const edge = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.round(len / 70);
      for (let i = 0; i < n; i++) {
        const a = i / n, b2 = (i + 1) / n;
        const ax = x1 + (x2 - x1) * a, ay = y1 + (y2 - y1) * a, bx = x1 + (x2 - x1) * b2, by = y1 + (y2 - y1) * b2;
        arcs.push(`${i ? '' : `M${ax.toFixed(1)},${ay.toFixed(1)} `}Q${((ax + bx) / 2 + nx * (22 + j(i + 9, 6))).toFixed(1)},${((ay + by) / 2 + ny * (22 + j(i + 9, 6))).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`);
      }
    };
    edge(L, T, R, T, 0, -1), edge(R, T, R, B, 1, 0), edge(R, B, L, B, 0, 1), edge(L, B, L, T, -1, 0);
    return [arcs.join(' ')];
  }
  if (family === 'zigzag') {
    const pts: string[] = [];
    const edge = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.round(len / 26);
      for (let i = 0; i <= n; i++) {
        const o = i % 2 ? 11 + j(i + 3, 3) : 0;
        pts.push(`${(x1 + ((x2 - x1) * i) / n + nx * o).toFixed(1)},${(y1 + ((y2 - y1) * i) / n + ny * o).toFixed(1)}`);
      }
    };
    edge(L, T, R, T, 0, -1), edge(R, T, R, B, 1, 0), edge(R, B, L, B, 0, 1), edge(L, B, L, T, -1, 0);
    return [`M${pts.join(' L')}`];
  }
  if (family === 'corners') {
    const arm = 120;
    return [
      `M${L},${T + arm} Q${L + j(1, 5)},${T + j(2, 5)} ${L + arm},${T + j(3, 4)}`,
      `M${R - arm},${T + j(4, 4)} Q${R + j(5, 5)},${T + j(6, 5)} ${R},${T + arm}`,
      `M${R},${B - arm} Q${R + j(7, 5)},${B + j(8, 5)} ${R - arm},${B + j(9, 4)}`,
      `M${L + arm},${B + j(10, 4)} Q${L + j(11, 5)},${B + j(12, 5)} ${L},${B - arm}`,
    ];
  }
  // rough: two passes, corners overshoot, the second pass stops short where the pen lifted
  const pass = (o: number, gap: boolean) => {
    const a = [L + j(o, 8) - 10, T + j(o + 1, 8)], b2 = [R + j(o + 2, 8) + 8, T + j(o + 3, 8)], c = [R + j(o + 4, 8), B + j(o + 5, 8) + 10], d = [L + j(o + 6, 8) - 6, B + j(o + 7, 8)];
    const e = [L + j(o + 8, 8), T + j(o + 9, 8) - 12];
    const last = gap ? [d[0] + (e[0] - d[0]) * 0.8, d[1] + (e[1] - d[1]) * 0.8] : e;
    return `M${a} L${b2} L${c} L${d} L${last}`;
  };
  return [pass(0, false), pass(20, true)];
};

export const FrameBlock: React.FC<P> = ({b, t, k}) => {
  const rect: number[] = b.rect ?? [64, 210, 952, 1300];
  const seed = b.seed ?? 3;
  const passes = React.useMemo(() => framePasses(b.family ?? 'rough', rect, seed), [b.family, rect.join(','), seed]);
  const p = cubicInOut(progress(t, b.at, b.dur ?? 0.9));
  if (p <= 0) return null;
  const fade = b.out !== undefined ? 1 - progress(t, b.out, 0.3) : 1;
  return (
    <g opacity={fade * (b.opacity ?? 1)}>
      {passes.map((d, i) => (
        <BrushStroke key={i} d={d} stroke={inkOf(k, b.color)} w={i ? k.lineWidths.construction : k.lineWidths.secondary} frac={clamp(p * 1.15 - i * 0.12)} />
      ))}
    </g>
  );
};

// ---------- brush swipe: a dry brush sweeps across the page, and the next scene is there when it lifts ----------
export const InkSwipe: React.FC<{k: StyleTokens; t: number; cuts: number[]; W: number; H: number}> = ({k, t, cuts, W, H}) => {
  const half = 0.3;
  const cut = cuts.find((c) => t > c - half && t < c + half);
  if (cut === undefined) return null;
  const reach = W + 520;
  const lead = -260 + reach * quintOut(clamp((t - (cut - half)) / half)) ;
  const trail = -260 + reach * cubicInOut(clamp((t - cut) / half));
  const rows = Math.ceil(H / 16);
  const edge = (base: number, seed: number, streak: number) =>
    Array.from({length: rows + 1}, (_, i) => {
      const y = i * 16;
      const bristle = hash(seed, Math.floor(i / 2)) * streak + Math.sin(i * 0.31 + seed) * 18;
      return `${(base + bristle).toFixed(1)},${y}`;
    });
  const a = edge(lead, 1, 150), b2 = edge(trail, 2, 90).reverse();
  return <path d={`M${a.join(' L')} L${b2.join(' L')} Z`} fill={gray(k.ink)} />;
};

// Paper collage pieces: torn cutouts with a white border and soft shadow, ransom note letters, tape and ink faces.
import React from 'react';
import {getBoundingBox, getLength, getPointAtLength, getSubpaths, scalePath, translatePath} from '@remotion/paths';
import type {Block} from './blocks';
import {StyleTokens, clamp, gray, hash, progress} from './lib';

type P = {b: Block; t: number; k: StyleTokens};

export const easeBack = (x: number) => {
  x = clamp(x);
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const easeIn = (x: number) => Math.pow(clamp(x), 3);

export const seedOf = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000;
};

// The stop motion drawing number. Styles with motion.stepFps hold each drawing for several frames.
const stepOf = (t: number, k: StyleTokens) => Math.round(t * (k.motion.stepFps ?? 12));
const jit = (step: number, seed: number, n: number, amt: number) => (hash(step, seed, n) - 0.5) * 2 * amt;

// ---------- shapes ----------
// Ready cut stickers, drawn in a 200 x 200 box around 0,0. A cutout picks one with "kind" and places it with x, y and size.
export const STAMPS: Record<string, string> = {
  star: 'M0,-92 L26,-32 L90,-28 L40,14 L56,78 L0,44 L-56,78 L-40,14 L-90,-28 L-26,-32 Z',
  heart: 'M0,78 C-96,14 -100,-62 -50,-76 C-24,-82 -6,-64 0,-46 C6,-64 24,-82 50,-76 C100,-62 96,14 0,78 Z',
  bolt: 'M18,-96 L-56,8 L-8,8 L-26,96 L58,-22 L8,-22 Z',
  arrow: 'M-92,-24 L10,-24 L10,-62 L92,0 L10,62 L10,24 L-92,24 Z',
  burst: 'M0,-96 L20,-44 L68,-68 L44,-20 L96,0 L44,20 L68,68 L20,44 L0,96 L-20,44 L-68,68 L-44,20 L-96,0 L-44,-20 L-68,-68 L-20,-44 Z',
  cloud: 'M-80,36 C-110,36 -112,-8 -80,-14 C-82,-54 -30,-66 -10,-36 C10,-70 72,-56 62,-14 C102,-12 102,36 68,36 Z',
  drop: 'M0,-92 C-30,-40 -62,-4 -62,30 C-62,66 -34,92 0,92 C34,92 62,66 62,30 C62,-4 30,-40 0,-92 Z',
};
export const shapeD = (b: Block): string => {
  if (b.d) return b.d;
  const {x, y} = b;
  // a strip of paper with words on it is as wide as its words
  if (b.text && b.shape === 'rect' && b.w === undefined) b = {...b, w: [...String(b.text)].length * (b.textSize ?? 56) * 0.64 + (b.textSize ?? 56) * 1.1, h: b.h ?? (b.textSize ?? 56) * 1.75};
  if (b.kind && STAMPS[b.kind]) return translatePath(scalePath(STAMPS[b.kind], (b.size ?? 200) / 200, (b.size ?? 200) / 200), x, y);
  if (b.shape === 'circle' || b.shape === 'ellipse') {
    const rx = b.rx ?? b.r ?? (b.w ?? 200) / 2;
    const ry = b.ry ?? b.r ?? (b.h ?? b.w ?? 200) / 2;
    return `M${x - rx},${y} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
  }
  const w = b.w ?? 200, h = b.h ?? 200;
  const r = Math.min(b.r ?? 0, w / 2, h / 2);
  const L = x - w / 2, T = y - h / 2, R = x + w / 2, B = y + h / 2;
  if (!r) return `M${L},${T} L${R},${T} L${R},${B} L${L},${B} Z`;
  return `M${L + r},${T} L${R - r},${T} Q${R},${T} ${R},${T + r} L${R},${B - r} Q${R},${B} ${R - r},${B} L${L + r},${B} Q${L},${B} ${L},${B - r} L${L},${T + r} Q${L},${T} ${L + r},${T} Z`;
};

// Walk the outline and nudge each point in or out, so the edge looks torn by hand rather than cut by a machine.
export const tear = (d: string, seed: number, rough = 3, spacing = 9): string =>
  getSubpaths(d)
    .map((sub, si) => {
      const len = getLength(sub);
      if (len < 8) return '';
      const n = Math.max(10, Math.round(len / spacing));
      const pts: string[] = [];
      for (let i = 0; i < n; i++) {
        const a = getPointAtLength(sub, (len * i) / n);
        const c = getPointAtLength(sub, (len * (i + 0.5)) / n);
        const dx = c.x - a.x, dy = c.y - a.y;
        const m = Math.hypot(dx, dy) || 1;
        const wave = Math.sin((i / n) * Math.PI * 2 * 5 + seed) * 0.5; // slow drift
        const o = ((hash(seed, si, i) - 0.5) * 2 + wave) * rough;
        pts.push(`${(a.x - (dy / m) * o).toFixed(1)},${(a.y + (dx / m) * o).toFixed(1)}`);
      }
      return `M${pts.join(' L')} Z`;
    })
    .join(' ');

const DARK_PAPER = ['red', 'teal', 'navy', 'ink'];

// ---------- one piece of paper: shadow, white border, coloured face, pattern, fibre grain ----------
export const Piece: React.FC<{k: StyleTokens; d: string; color: string; pattern?: string; border?: number; shadow?: boolean; inner?: React.ReactNode}> = ({k, d, color, pattern, border, shadow, inner}) => {
  const pp = k.paper!;
  const bw = border ?? pp.border;
  const edge = gray(k.palette?.white ?? '#faf7ee');
  const sh = pp.shadow;
  return (
    <>
      {shadow !== false && (
        <g transform={`translate(${sh.dx},${sh.dy})`} opacity={sh.opacity} filter="url(#paperShadow)">
          <path d={d} fill="#281e14" stroke="#281e14" strokeWidth={bw * 2} strokeLinejoin="round" />
        </g>
      )}
      {bw > 0 && <path d={d} fill={edge} stroke={edge} strokeWidth={bw * 2} strokeLinejoin="round" />}
      {bw > 0 && <path d={d} fill="url(#paperGrain)" stroke="url(#paperGrain)" strokeWidth={bw * 2} strokeLinejoin="round" opacity={pp.grain * 0.7} />}
      <path d={d} fill={color} />
      {pattern && pattern !== 'plain' && <path d={d} fill={`url(#pat-${pattern})`} />}
      <path d={d} fill="url(#paperGrain)" opacity={pp.grain} />
      {inner}
    </>
  );
};

// A strip of masking tape, centred on 0,0.
const Tape: React.FC<{k: StyleTokens; w: number; seed: number}> = ({k, w, seed}) => {
  const h = w * 0.36;
  const d = React.useMemo(() => {
    const n = 5;
    const left = Array.from({length: n + 1}, (_, i) => `${(-w / 2 + hash(seed, i) * 7).toFixed(1)},${(h / 2 - (h * i) / n).toFixed(1)}`);
    const right = Array.from({length: n + 1}, (_, i) => `${(w / 2 - hash(seed, i + 9) * 7).toFixed(1)},${(-h / 2 + (h * i) / n).toFixed(1)}`);
    return `M${left.join(' L')} L${right.join(' L')} Z`;
  }, [w, h, seed]);
  return (
    <g opacity={0.72}>
      <path d={d} fill={gray(k.paper!.tape)} />
      <path d={d} fill="url(#paperGrain)" opacity={k.paper!.grain} />
    </g>
  );
};

// ---------- entrances and exits shared by cutouts and letters ----------
type Pose = {x: number; y: number; rot: number; scale: number; opacity: number; gone: boolean};
export const pose = (t: number, at: number, out: number | undefined, enter: string, exit: string, H: number): Pose => {
  const p: Pose = {x: 0, y: 0, rot: 0, scale: 1, opacity: 1, gone: t < at};
  const e = t - at;
  if (enter === 'drop') {
    p.y = -(1 - easeOut(e / 0.4)) * (H * 0.6);
    p.scale = 1 + 0.06 * Math.sin(clamp(e / 0.5) * Math.PI);
  } else if (enter === 'rise') p.y = (1 - easeBack(e / 0.45)) * (H * 0.6);
  else if (enter === 'left') p.x = -(1 - easeBack(e / 0.45)) * 900;
  else if (enter === 'right') p.x = (1 - easeBack(e / 0.45)) * 900;
  else if (enter === 'slap') {
    p.scale = 1 + 0.7 * (1 - easeOut(e / 0.16)) + 0.05 * Math.sin(clamp((e - 0.16) / 0.2) * Math.PI);
    p.opacity = clamp(e / 0.06);
  } else if (enter !== 'none') p.scale = easeBack(e / 0.38);
  if (out !== undefined && t >= out) {
    const q = t - out;
    if (exit === 'peel') {
      const f = easeIn(q / 0.5);
      p.y -= f * 1500;
      p.x += f * 240;
      p.rot += f * 55;
      p.gone = p.gone || q > 0.5;
    } else if (exit === 'fly') {
      const f = easeIn(q / 0.45);
      p.y -= f * 1300;
      p.rot += f * 140;
      p.gone = p.gone || q > 0.45;
    } else {
      p.scale *= 1 - easeIn(q / 0.25);
      p.gone = p.gone || q > 0.25;
    }
  }
  return p;
};

// ---------- cutout: a torn paper shape that pops, drops or slides on, and may carry children ----------
export const CutoutBlock: React.FC<P & {render: (b: Block) => React.ReactNode}> = ({b, t, k, render}) => {
  const geo = React.useMemo(() => {
    const d = shapeD(b);
    const seed = seedOf(d);
    const torn = tear(d, seed, b.rough ?? k.paper!.tear);
    const bb = getBoundingBox(torn);
    // Tape goes where there is paper to hold: the highest point of the outline in the left and right thirds.
    const len = getLength(torn);
    const top = (lo: number, hi: number) => {
      let best = {x: (bb.x1 + bb.x2) / 2, y: bb.y1};
      let found = false;
      for (let i = 0; i < 60; i++) {
        const p = getPointAtLength(torn, (len * i) / 60);
        const f = (p.x - bb.x1) / (bb.x2 - bb.x1 || 1);
        if (f >= lo && f <= hi && (!found || p.y < best.y)) (best = p), (found = true);
      }
      return best;
    };
    const l = top(0.08, 0.3), r = top(0.7, 0.92), m = top(0.4, 0.6);
    return {torn, seed, bb, l, r, m, cx: b.origin?.[0] ?? (bb.x1 + bb.x2) / 2, cy: b.origin?.[1] ?? (bb.y1 + bb.y2) / 2};
  }, [b, k]);
  const ps = pose(t, b.at, b.out, b.enter ?? 'pop', b.exit ?? 'pop', 1920);
  if (ps.gone || ps.scale <= 0.02) return null;
  const step = stepOf(t, k);
  const j = k.jitter ?? {pos: 0, rot: 0};
  const amt = b.jitter ?? 1;
  const bob = b.bob ? Math.sin(((t - b.at) * 2 * Math.PI) / 3.2) * 7 : 0;
  const x = ps.x + jit(step, geo.seed, 1, j.pos * amt);
  const y = ps.y + bob + jit(step, geo.seed, 2, j.pos * amt);
  const rot = (b.rotate ?? 0) + ps.rot + jit(step, geo.seed, 3, j.rot * amt);
  const {cx, cy, bb} = geo;
  const spin = `translate(${cx},${cy}) rotate(${rot}) scale(${ps.scale}) translate(${-cx},${-cy})`;
  const tapes = b.tape ? (b.tape === 1 ? [[geo.m.x, geo.m.y + 6, -4]] : [[geo.l.x, geo.l.y + 8, -32], [geo.r.x, geo.r.y + 8, 30]]) : [];
  const tp = easeOut((t - b.at - 0.55) / 0.15);
  const tw = b.twinkle ? 0.72 + 0.28 * Math.sin((t - b.at) * 2.6 + geo.seed) : 1;
  return (
    <g transform={`translate(${x},${y})`} opacity={ps.opacity * (b.opacity ?? 1) * (b.twinkle ? 0.8 + 0.2 * tw : 1)}>
      <g transform={spin}>
        {b.glow && <circle cx={cx} cy={cy} r={Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1) * 0.95} fill={gray(k.palette?.[typeof b.glow === 'string' ? b.glow : b.color] ?? '#ffe9a0')} opacity={0.3 * tw} style={{filter: `blur(${Math.max(10, (bb.x2 - bb.x1) * 0.28)}px)`}} />}
        <Piece k={k} d={geo.torn} color={gray(k.palette?.[b.color] ?? k.fill)} pattern={b.pattern} border={b.border} shadow={b.shadow} />
        {b.text && (
          <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontFamily={k.fonts.ui} fontWeight={k.type?.labelWeight ?? 700} fontSize={b.textSize ?? 56} fill={gray(k.palette?.[b.textColor] ?? k.ink)}>
            {b.text}
          </text>
        )}
        {(b.blocks as Block[] | undefined)?.map((c, i) => <React.Fragment key={i}>{render(c)}</React.Fragment>)}
        {tp > 0 &&
          tapes.map(([tx, ty, tr], i) => (
            <g key={i} transform={`translate(${tx},${ty}) rotate(${tr}) scale(${tp})`}>
              <Tape k={k} w={Math.min(120, Math.max(70, (bb.x2 - bb.x1) * 0.3))} seed={geo.seed + i} />
            </g>
          ))}
      </g>
    </g>
  );
};

// ---------- ransom: a title made of mismatched magazine letters, one torn tile each ----------
const RANSOM_FONTS: [string, number, string?][] = [['Big Shoulders', 900], ['STIX Two Text', 700], ['JetBrains Mono', 700], ['Big Shoulders', 900], ['STIX Two Text', 700], ['Inter', 500]];
const TILE_COLORS = ['red', 'mustard', 'teal', 'navy', 'pink', 'sage', 'kraft', 'white', 'sky'];
const TILE_PATTERNS = [undefined, undefined, undefined, 'dots', 'lines', 'print'];

export const RansomBlock: React.FC<P> = ({b, t, k}) => {
  const lines: string[] = b.lines ?? [b.text];
  const size = b.size ?? 190; // tile height
  const cx = b.x ?? 540;
  const tiles = React.useMemo(() => {
    const out: any[] = [];
    let n = 0;
    lines.forEach((line, li) => {
      const chars = [...line.toUpperCase()];
      const fit = Math.min(1, 900 / ((chars.length * 0.84 + 0.16) * size * 0.8));
      const th = size * fit, tw = th * 0.8, gap = tw * 0.84; // tiles overlap a little, never enough to hide a letter
      const x0 = cx - ((chars.length - 1) * gap) / 2;
      chars.forEach((ch, i) => {
        const seed = seedOf(`${line}${li}${i}${ch}`) + (b.seed ?? 0);
        const idx = n++;
        if (ch === ' ') return;
        const r = (m: number) => hash(seed, m);
        const w = tw * (0.9 + r(1) * 0.22), h = th * (0.9 + r(2) * 0.2);
        const colors = TILE_COLORS.filter((c) => k.palette?.[c] !== undefined);
        // neighbours never share a colour
        let color = colors[Math.floor(r(3) * colors.length)];
        if (out.length && out[out.length - 1].color === color) color = colors[(colors.indexOf(color) + 1) % colors.length];
        const oval = r(4) < 0.25;
        const shape = oval ? {shape: 'ellipse', x: 0, y: 0, rx: w / 2, ry: h / 2} : {shape: 'rect', x: 0, y: 0, w, h, r: [0, 0, 10, 30][Math.floor(r(5) * 4)] * fit};
        const font = RANSOM_FONTS[Math.floor(r(6) * RANSOM_FONTS.length)];
        out.push({
          ch, idx, seed, color, w, h,
          x: x0 + i * gap, y: b.y + li * th * 1.08 + (r(7) - 0.5) * th * 0.08,
          d: tear(shapeD(shape as Block), seed, k.paper!.tileTear ?? 2.2, 8),
          pattern: DARK_PAPER.includes(color) ? undefined : TILE_PATTERNS[Math.floor(r(8) * TILE_PATTERNS.length)],
          font, fs: h * (font[0] === 'Big Shoulders' ? 0.88 : 0.74) * (oval ? 0.85 : 1),
          tilt: (idx % 2 ? 1 : -1) * (5 + r(9) * 2),
        });
      });
    });
    return out;
  }, [b, k]);
  if (t < b.at) return null;
  const step = stepOf(t, k);
  const j = k.jitter ?? {pos: 0, rot: 0};
  return (
    <g>
      {tiles.map((tl) => {
        const at = b.at + tl.idx * (b.stagger ?? 0.06);
        const ps = pose(t, at, b.out === undefined ? undefined : b.out + tl.idx * 0.03, 'drop', 'fly', 900);
        if (ps.gone) return null;
        const wob = Math.sin((t - at) * 1.6 + tl.idx) * 1.2;
        const x = tl.x + ps.x + jit(step, tl.seed, 1, j.pos * 0.6);
        const y = tl.y + ps.y + jit(step, tl.seed, 2, j.pos * 0.6);
        const fg = DARK_PAPER.includes(tl.color) ? gray(k.palette?.white ?? '#fff') : gray(k.ink);
        return (
          <g key={tl.idx} transform={`translate(${x},${y}) rotate(${tl.tilt + wob + ps.rot + jit(step, tl.seed, 3, j.rot * 0.6)}) scale(${ps.scale})`}>
            <Piece k={k} d={tl.d} color={gray(k.palette![tl.color])} pattern={tl.pattern} border={0} />
            <text x={0} y={0} dy="0.36em" textAnchor="middle" fontFamily={tl.font[0]} fontWeight={tl.font[1]} fontStyle={tl.font[2]} fontSize={tl.fs} fill={fg}>
              {tl.ch}
            </text>
          </g>
        );
      })}
    </g>
  );
};

// ---------- face: ink features for a character's head. size is the head width. ----------
export const FaceBlock: React.FC<P> = ({b, t, k}) => {
  if (t < b.at) return null;
  // mood may change over time: moods: [{t, mood}]
  let mood: string = b.mood ?? 'smile';
  for (const m of (b.moods as {t: number; mood: string}[] | undefined) ?? []) if (t >= m.t) mood = m.mood;
  const s = (b.size ?? 240) / 240;
  const ink = gray(k.ink);
  const w = 6;
  const step = stepOf(t, k);
  const blink = mood !== 'wince' && mood !== 'relief' && step % 30 < 2;
  const stroke = {fill: 'none', stroke: ink, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  const eye = (sx: number) => {
    const ex = sx * 42;
    if (blink) return <path d={`M${ex - 11},-12 L${ex + 11},-12`} {...stroke} />;
    if (mood === 'wince') return <path d={`M${ex - sx * 12},-24 L${ex + sx * 8},-12 L${ex - sx * 12},0`} {...stroke} />;
    if (mood === 'relief') return <path d={`M${ex - 13},-8 Q${ex},-24 ${ex + 13},-8`} {...stroke} />;
    if (mood === 'surprised') return <circle cx={ex} cy={-14} r={12} {...stroke} />;
    return <circle cx={ex} cy={-12} r={9} fill={ink} />;
  };
  const mouth =
    mood === 'wince' ? <path d="M-26,44 L-13,36 L0,44 L13,36 L26,44" {...stroke} />
    : mood === 'surprised' ? <ellipse cx={0} cy={44} rx={11} ry={14} {...stroke} />
    : mood === 'relief' ? <path d="M-22,38 Q0,54 22,38" {...stroke} />
    : mood === 'grin' ? <path d="M-34,30 Q0,84 34,30 Z" fill={ink} stroke={ink} strokeWidth={w} strokeLinejoin="round" />
    : mood === 'flat' ? <path d="M-20,42 L20,42" {...stroke} />
    : <path d="M-28,32 Q0,62 28,32" {...stroke} />;
  const pop = b.pop === false ? 1 : easeBack((t - b.at) / 0.3);
  return (
    <g transform={`translate(${b.x + jit(step, 77, 1, 1.2)},${b.y + jit(step, 77, 2, 1.2)}) scale(${s * pop})`}>
      {[-1, 1].map((sx) => (
        <ellipse key={sx} cx={sx * 70} cy={26} rx={k.palette?.blush ? 21 : 17} ry={k.palette?.blush ? 14 : 17} fill={gray(k.palette?.blush ?? k.palette?.pink ?? k.mid)} opacity={0.75} />
      ))}
      {eye(-1)}
      {eye(1)}
      {mouth}
      {mood === 'wince' && <path d="M92,-78 q-16,24 0,34 q16,-10 0,-34 Z" fill={gray(k.palette?.sky ?? k.soft)} stroke={ink} strokeWidth={3} strokeLinejoin="round" />}
    </g>
  );
};

// ---------- table and sheet: the surface everything sits on ----------
// The sheet flips in from the right at the start and flies off to the left at the end, carrying everything on it.
export const sheetTransform = (t: number, D: number, k: StyleTokens, W: number, H: number) => {
  const sh = k.sheet!;
  const step = stepOf(t, k);
  const pin = easeOut(t / (sh.flipIn ?? 0.45));
  const pout = easeIn((t - (D - (sh.flyOut ?? 0.55) - 0.05)) / (sh.flyOut ?? 0.55));
  const x = (1 - pin) * (W + 120) - pout * (W + 300);
  const rot = -12 * (1 - pin) - 10 * pout + jit(step, 5, 1, 0.25);
  return `translate(${x},${pout * -60}) translate(${W / 2},${H / 2}) rotate(${rot}) translate(${-W / 2},${-H / 2})`;
};

export const Table: React.FC<{k: StyleTokens; W: number; H: number}> = ({k, W, H}) => (
  <g>
    <rect width={W} height={H} fill="url(#paperGrain)" opacity={(k.background?.grain ?? 0.5)} />
    {[
      'M70,60 q30,-24 54,2 q-34,22 -8,40 q30,10 52,-18',
      'M930,1840 q40,10 70,-20 q-40,-12 -66,8 q30,26 80,14',
      'M960,90 l44,38 M1000,84 l-40,50',
    ].map((d, i) => (
      <path key={i} d={d} fill="none" stroke={gray(k.ink)} strokeWidth={3} strokeLinecap="round" opacity={0.1} />
    ))}
    <rect width={W} height={H} fill="url(#vignette)" opacity={k.background?.vignette ?? 0.22} />
  </g>
);

export const Sheet: React.FC<{k: StyleTokens; W: number; H: number}> = ({k, W, H}) => {
  const sh = k.sheet!;
  const geo = React.useMemo(() => {
    const rect = (x: number, y: number, w: number, h: number) => shapeD({type: 'cutout', at: 0, shape: 'rect', x, y, w, h} as Block);
    const L = (W - sh.w) / 2, T = (H - sh.h) / 2;
    return {
      sheet: tear(rect(W / 2, H / 2, sh.w, sh.h), 11, sh.tear ?? 2.5, 12),
      // quiet scraps tucked at two corners
      scrapA: tear(`M${L - 26},${T + sh.h - 150} L${L + 210},${T + sh.h - 118} L${L + 190},${T + sh.h + 30} L${L - 40},${T + sh.h + 16} Z`, 23, (sh.tear ?? 2.5) * 1.6),
      scrapB: tear(`M${L + sh.w - 190},${T - 34} L${L + sh.w + 32},${T - 14} L${L + sh.w + 22},${T + 120} L${L + sh.w - 170},${T + 96} Z`, 31, (sh.tear ?? 2.5) * 1.6),
    };
  }, [W, H, sh.w, sh.h, sh.tear]);
  return (
    <g>
      <Piece k={k} d={geo.sheet} color={gray(sh.color)} border={0} />
      {sh.scraps !== false && (
        <>
          <Piece k={k} d={geo.scrapA} color={gray(k.palette?.kraft ?? k.soft)} pattern="print" border={0} />
          <Piece k={k} d={geo.scrapB} color={gray(k.palette?.white ?? k.fill)} pattern="lines" border={0} />
        </>
      )}
    </g>
  );
};

// Pattern and shadow definitions used by every paper piece.
export const PaperDefs: React.FC<{k: StyleTokens; grain: string}> = ({k, grain}) => {
  const ps = k.paper!.patternScale;
  const fine = ps ? `scale(${ps})` : undefined;
  return (
  <>
    <pattern id="paperGrain" patternUnits="userSpaceOnUse" width={512} height={512}>
      <image href={grain} width={512} height={512} />
    </pattern>
    <filter id="paperShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation={k.paper!.shadow.blur} />
    </filter>
    <pattern id="pat-dots" patternUnits="userSpaceOnUse" patternTransform={fine} width={22} height={44}>
      <circle cx={5} cy={5} r={3.2} fill="#000" opacity={0.18} />
      <circle cx={16} cy={27} r={3.2} fill="#000" opacity={0.18} />
    </pattern>
    <pattern id="pat-lines" patternUnits="userSpaceOnUse" patternTransform={fine} width={18} height={18}>
      <rect x={0} y={7} width={18} height={3} fill="#000" opacity={0.14} />
    </pattern>
    <pattern id="pat-halftone" patternUnits="userSpaceOnUse" patternTransform={ps ? `scale(${ps}) rotate(45)` : undefined} width={14} height={14}>
      <circle cx={7} cy={7} r={3.6} fill="#000" opacity={0.2} />
    </pattern>
    <pattern id="pat-print" patternUnits="userSpaceOnUse" width={260} height={64}>
      {[[8, 10, 52], [70, 10, 30], [110, 10, 60], [182, 10, 44], [8, 26, 24], [42, 26, 58], [112, 26, 36], [158, 26, 70], [8, 42, 60], [78, 42, 22], [110, 42, 48], [170, 42, 56], [8, 58, 36], [54, 58, 62], [128, 58, 28], [166, 58, 50]].map(([x, y, w], i) => (
        <rect key={i} x={x} y={y - 2} width={w} height={4} fill="#5a544c" opacity={0.75} />
      ))}
    </pattern>
  </>
  );
};

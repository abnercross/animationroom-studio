// Flat colour cartoon pieces: outlined shapes, a small prop library, the chibi character rig, chapter badges,
// pop on titles, tinted sets with a floor, and the iris wipe between chapters.
import React from 'react';
import {flushSync} from 'react-dom';
import {continueRender, delayRender} from 'remotion';
import {getBoundingBox} from '@remotion/paths';
import type {Block} from './blocks';
import {fontsReady} from './fonts';
import {StyleTokens, clamp, cubicInOut, gray, hash, progress} from './lib';
import {easeBack, easeIn, easeOut, pose, seedOf, shapeD} from './paper';
import {BrushStroke} from './sketch';

type P = {b: Block; t: number; k: StyleTokens};

// Things every block in a storyboard may need: the cast of characters and when the voice is speaking.
export const StoryContext = React.createContext<{cast?: Record<string, any>; speech?: number[][]; W?: number; H?: number}>({});

const pal = (k: StyleTokens, c: string | undefined, def: string) => (c && k.palette?.[c] !== undefined ? gray(k.palette[c]) : c && c.startsWith('#') ? c : def);

// Lines boil: a tiny new offset and tilt a few times a second, so held poses still feel drawn by hand.
const boil = (t: number, k: StyleTokens, seed: number) => {
  const bo = k.boil;
  if (!bo) return {x: 0, y: 0, r: 0};
  const s = Math.floor(t * bo.fps);
  return {x: (hash(s, seed, 1) - 0.5) * 2 * bo.pos, y: (hash(s, seed, 2) - 0.5) * 2 * bo.pos, r: (hash(s, seed, 3) - 0.5) * 2 * bo.rot};
};

const bounce = (x: number) => {
  x = clamp(x);
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};
const EASE: Record<string, (x: number) => number> = {back: easeBack, out: easeOut, in: easeIn, inout: cubicInOut, bounce, linear: clamp};

// ---------- flat: one outlined part with a flat fill and a soft shade that deepens towards one side ----------
let uid = 0;
const Flat: React.FC<{k: StyleTokens; d: string; fill: string; ow: number; shade?: boolean; clipTo?: {x1: number; x2: number; y1: number; y2: number}}> = ({k, d, fill, ow, shade, clipTo}) => {
  const id = React.useMemo(() => `fl${uid++}`, []);
  const bb = React.useMemo(() => clipTo ?? (shade === false ? null : getBoundingBox(d)), [d, shade, clipTo]);
  return (
    <>
      {k.rig?.halo && ow > 0 && <path d={d} fill={gray(k.rig.halo.color)} stroke={gray(k.rig.halo.color)} strokeWidth={ow + k.rig.halo.width * 2} strokeLinejoin="round" strokeLinecap="round" />}
      <path d={d} fill={fill} stroke={gray(k.ink)} strokeWidth={ow} strokeLinejoin="round" strokeLinecap="round" />
      {shade !== false && bb && (
        <>
          <clipPath id={id}>
            <path d={d} />
          </clipPath>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={(k.rig?.shade ?? 0.09) * 1.9} />
          </linearGradient>
          {k.rig?.shadeStyle === 'dots' ? (
            <rect clipPath={`url(#${id})`} x={bb.x1 + (bb.x2 - bb.x1) * 0.6} y={bb.y1 - 4} width={(bb.x2 - bb.x1) * 0.42 + 4} height={bb.y2 - bb.y1 + 8} fill="url(#bendayS)" opacity={(k.rig?.shade ?? 0.09) * 3} />
          ) : (
            <rect clipPath={`url(#${id})`} x={bb.x1 + (bb.x2 - bb.x1) * 0.42} y={bb.y1 - 4} width={(bb.x2 - bb.x1) * 0.6 + 4} height={bb.y2 - bb.y1 + 8} fill={`url(#${id}g)`} />
          )}
          <path d={d} fill="none" stroke={gray(k.ink)} strokeWidth={ow} strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
    </>
  );
};

// Gentle life after landing.
const loopOf = (b: Block, t: number) => {
  const e = Math.max(0, t - b.at);
  if (b.loop === 'float') return {y: Math.sin(e * 2.1) * 9, s: 1, r: 0};
  if (b.loop === 'pulse') return {y: 0, s: 1 + 0.05 * Math.sin(e * 5), r: 0};
  if (b.loop === 'beat') return {y: 0, s: 1 + 0.12 * Math.pow(Math.max(0, Math.sin(e * 6.6)), 6), r: 0};
  if (b.loop === 'spin') return {y: 0, s: 1, r: e * 70};
  if (b.loop === 'sway') return {y: 0, s: 1, r: Math.sin(e * 2.4) * 6};
  return {y: 0, s: 1, r: 0};
};

const enterPose = (b: Block, t: number) => {
  if (b.enter === 'fall') {
    const p = bounce((t - b.at) / 0.7);
    return {x: 0, y: -(1 - p) * 900, rot: 0, scale: 1, opacity: 1, gone: t < b.at || (b.out !== undefined && t > b.out + 0.25)};
  }
  return pose(t, b.at, b.out, b.enter ?? 'pop', b.exit ?? 'pop', 1920);
};

// ---------- shape: any flat colour drawing. d, or shape circle / ellipse / rect. ----------
export const ShapeBlock: React.FC<P> = ({b, t, k}) => {
  const geo = React.useMemo(() => {
    const d = shapeD(b);
    const bb = getBoundingBox(d);
    return {d, bb, seed: seedOf(d), cx: b.origin?.[0] ?? (bb.x1 + bb.x2) / 2, cy: b.origin?.[1] ?? (bb.y1 + bb.y2) / 2};
  }, [b]);
  const clipId = React.useMemo(() => `st${uid++}`, []);
  // "stitch": the shape is sewn in row by row from the top instead of popping
  const stitch = b.enter === 'stitch';
  const ps = enterPose(stitch ? {...b, enter: 'none'} : b, t);
  if (ps.gone || ps.scale <= 0.02) return null;
  const rows = stitch ? cubicInOut(progress(t, b.at, b.dur ?? 0.7)) : 1;
  // keys move, grow, squash, turn or fade a shape over time: [{t, dur, ease, dx, dy, scale, squash, rotate, opacity}]
  const mv: Record<string, number> = {dx: 0, dy: 0, scale: 1, squash: 0, rotate: 0, opacity: 1};
  for (const kf of (b.keys as any[] | undefined) ?? []) {
    if (t < kf.t) break;
    const p = (EASE[kf.ease] ?? cubicInOut)(progress(t, kf.t, kf.dur ?? 0.4));
    for (const key of Object.keys(mv)) if (kf[key] !== undefined) mv[key] += (kf[key] - mv[key]) * p;
  }
  const lp = loopOf(b, t);
  const bo = boil(t, k, geo.seed);
  const {cx, cy} = geo;
  const sc = ps.scale * lp.s;
  return (
    <g transform={`translate(${ps.x + bo.x},${ps.y + lp.y + bo.y}) translate(${cx + mv.dx},${cy + mv.dy}) rotate(${(b.rotate ?? 0) + ps.rot + lp.r + bo.r + mv.rotate}) scale(${sc * mv.scale * (1 + mv.squash * 0.25)},${sc * mv.scale * (1 - mv.squash * 0.3)}) translate(${-cx},${-cy})`} opacity={ps.opacity * (b.opacity ?? 1) * mv.opacity} clipPath={rows < 1 ? `url(#${clipId})` : undefined}>
      {rows < 1 && (
        <clipPath id={clipId}>
          <rect x={geo.bb.x1 - 20} y={geo.bb.y1 - 20} width={geo.bb.x2 - geo.bb.x1 + 40} height={Math.round(((geo.bb.y2 - geo.bb.y1 + 40) * rows) / 8) * 8} />
        </clipPath>
      )}
      {b.glow && <circle cx={cx} cy={cy} r={Math.max(geo.bb.x2 - geo.bb.x1, geo.bb.y2 - geo.bb.y1) * 0.9} fill={pal(k, typeof b.glow === 'string' ? b.glow : b.color, '#ffe680')} opacity={0.34} style={{filter: `blur(${Math.max(14, (geo.bb.x2 - geo.bb.x1) * 0.3)}px)`}} />}
      <Flat k={k} d={geo.d} fill={b.color === 'none' ? 'none' : pal(k, b.color, gray(k.fill))} ow={b.outline === false || (b.outline === undefined && k.rig?.outline === false) ? 0 : widthFor(k, b.width)} shade={b.shade ?? b.color !== 'none'} />
    </g>
  );
};
const widthFor = (k: StyleTokens, w?: string | number) => (typeof w === 'number' ? w : w === 'secondary' ? k.lineWidths.secondary : k.lineWidths.primary);

// ---------- prop: ready made objects, drawn around 0,0 (most fit a 200 x 200 box; furniture is wider) ----------
type Part = {d?: string; fill?: string; shade?: boolean; line?: boolean; main?: boolean; tint?: boolean; tint2?: boolean; rot?: number; text?: string; x?: number; y?: number; size?: number; ink?: string};
const circle = (r: number, cx = 0, cy = 0) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
const card = (w: number, h: number, r: number) => `M${-w + r},${-h} H${w - r} Q${w},${-h} ${w},${-h + r} V${h - r} Q${w},${h} ${w - r},${h} H${-w + r} Q${-w},${h} ${-w},${h - r} V${-h + r} Q${-w},${-h} ${-w + r},${-h} Z`;
const ticks = (r1: number, r2: number, n: number) => Array.from({length: n}, (_, i) => { const a = (i / n) * Math.PI * 2; return `M${(Math.sin(a) * r1).toFixed(1)},${(-Math.cos(a) * r1).toFixed(1)} L${(Math.sin(a) * r2).toFixed(1)},${(-Math.cos(a) * r2).toFixed(1)}`; }).join(' ');
const PROPS: Record<string, (b: Block) => Part[]> = {
  heart: () => [{d: 'M0,70 C-90,10 -95,-60 -48,-72 C-22,-78 -6,-62 0,-44 C6,-62 22,-78 48,-72 C95,-60 90,10 0,70 Z', fill: 'red'}],
  star: () => [{d: 'M0,-88 L24,-30 L86,-26 L38,14 L54,76 L0,42 L-54,76 L-38,14 L-86,-26 L-24,-30 Z', fill: 'yellow'}],
  bulb: (b) => [
    {d: 'M-26,44 L26,44 L22,78 L-22,78 Z', fill: 'grey'},
    {d: 'M0,-84 C52,-84 74,-44 74,-14 C74,16 46,30 34,48 L-34,48 C-46,30 -74,16 -74,-14 C-74,-44 -52,-84 0,-84 Z', fill: b.lit === false ? 'white' : 'yellow'},
    {d: 'M-16,40 L-8,-4 L8,-4 L16,40', line: true},
  ],
  cloud: () => [{d: 'M-70,40 C-104,40 -108,-6 -74,-12 C-76,-52 -26,-66 -8,-36 C12,-70 72,-54 62,-12 C102,-10 100,40 66,40 Z', fill: 'white'}],
  rock: () => [{d: 'M-84,56 L-64,-10 L-22,-48 L34,-40 L78,4 L88,56 Z', fill: 'grey'}, {d: 'M-22,-48 L-6,-4 L34,-40 M-6,-4 L-20,56', line: true}],
  coin: () => [{d: circle(70), fill: 'yellow'}, {d: circle(46), line: true}],
  weight: () => [{d: 'M-34,-58 a34,26 0 1,1 68,0', line: true}, {d: 'M-62,-44 L62,-44 L88,70 L-88,70 Z', fill: 'slate'}],
  diamond: () => [{d: 'M-52,-56 L52,-56 L90,-14 L0,80 L-90,-14 Z', fill: 'cyan'}, {d: 'M-90,-14 L90,-14 M-52,-56 L-28,-14 L0,80 L28,-14 L52,-56 M-28,-14 L0,-56 L28,-14', line: true}],
  flag: () => [{d: 'M-40,-86 L-40,88', line: true}, {d: 'M-40,-84 L64,-56 L-40,-22 Z', fill: 'red'}],
  clock: (b) => [{d: circle(80), fill: 'white'}, {d: ticks(60, 70, 12), line: true}, {d: 'M0,-44 L0,0 L26,18', line: true, rot: b.hands ?? 0}],
  check: () => [{d: circle(78), fill: 'green'}, {d: 'M-36,2 L-10,30 L40,-28', line: true}],
  bolt: () => [{d: 'M14,-90 L-52,10 L-6,10 L-22,90 L56,-22 L8,-22 Z', fill: 'yellow'}],
  bubble: () => [{d: 'M-88,-60 Q-88,-84 -64,-84 L64,-84 Q88,-84 88,-60 L88,10 Q88,34 64,34 L-14,34 L-48,74 L-40,34 L-64,34 Q-88,34 -88,10 Z', fill: 'white'}],
  // furniture and set pieces
  desk: () => [
    {d: 'M-116,-24 H-96 V84 H-116 Z', fill: 'wood'},
    {d: 'M34,-24 H118 V84 H34 Z', fill: 'wood'},
    {d: 'M54,6 H98 M54,46 H98', line: true},
    {d: 'M-132,-44 H132 Q138,-44 138,-38 V-28 Q138,-22 132,-22 H-132 Q-138,-22 -138,-28 V-38 Q-138,-44 -132,-44 Z', fill: 'wood', main: true},
  ],
  chair: () => [
    {d: 'M-14,30 V64 M-52,76 H24 M-14,64 L-52,76 M-14,64 L24,76', line: true},
    {d: circle(7, -52, 82), fill: 'white', shade: false},
    {d: circle(7, 24, 82), fill: 'white', shade: false},
    {d: 'M-62,12 H36 Q44,12 44,20 Q44,30 36,30 H-62 Q-70,30 -70,20 Q-70,12 -62,12 Z', fill: 'slate'},
    {d: 'M-70,-96 Q-58,-100 -54,-88 V14 H-72 V-88 Z', fill: 'slate', main: true},
  ],
  plant: () => [
    {d: 'M-4,34 C-46,20 -56,-30 -44,-52 C-18,-36 -4,0 -4,34 Z', fill: 'green'},
    {d: 'M4,34 C46,20 56,-30 44,-52 C18,-36 4,0 4,34 Z', fill: 'green'},
    {d: 'M0,34 C-24,-6 -16,-62 0,-82 C16,-62 24,-6 0,34 Z', fill: 'green', main: true},
    {d: 'M-26,30 H26 L20,84 H-20 Z', fill: 'white'},
  ],
  books: () => [{d: 'M-70,-2 H60 V16 H-70 Z', fill: 'grey'}, {d: 'M-58,-20 H70 V-2 H-58 Z', fill: 'cyan', main: true}],
  sign: (b) => [{d: card(120, b.sub ? 64 : 50, 16), fill: 'white', shade: false}],
  ff: () => [{d: card(92, 64, 22), fill: 'white', shade: false}, {d: 'M-52,-32 L-6,0 L-52,32 Z', fill: 'green', shade: false}, {d: 'M8,-32 L54,0 L8,32 Z', fill: 'green', shade: false, main: true}],
  shop: () => [
    {d: 'M-58,-104 H58 Q64,-104 64,-98 V-74 H-64 V-98 Q-64,-104 -58,-104 Z', fill: 'charcoal'},
    {d: 'M-72,-20 H72 V92 H-72 Z', fill: 'white'},
    {d: 'M-56,6 H4 V52 H-56 Z', fill: 'cyan', shade: false},
    {d: 'M24,6 H56 V92 H24 Z', fill: 'wood'},
    {d: 'M-84,-66 H84 V-28 Q70,-10 56,-28 Q42,-10 28,-28 Q14,-10 0,-28 Q-14,-10 -28,-28 Q-42,-10 -56,-28 Q-70,-10 -84,-28 Z', fill: 'red', main: true},
    {d: 'M-56,-66 V-28 M-28,-66 V-28 M0,-66 V-28 M28,-66 V-28 M56,-66 V-28', line: true},
  ],
  umbrella: () => [
    {d: 'M0,6 V82 Q0,100 16,100 Q30,100 30,86 M0,-62 V-72', line: true},
    {d: 'M-104,10 C-96,-88 96,-88 104,10 Q78,-10 52,10 Q26,-10 0,10 Q-26,-10 -52,10 Q-78,-10 -104,10 Z', fill: 'green', main: true},
  ],
  compass: (b) => [
    {d: circle(90), fill: 'cream', shade: false},
    {d: circle(74) + ' ' + ticks(60, 72, 8), line: true},
    {text: 'N', x: 0, y: -40, size: 26},
    {d: 'M-10,0 L0,-56 L10,0 Z', fill: 'red', shade: false, rot: b.needle ?? 55},
    {d: 'M-10,0 L0,56 L10,0 Z', fill: 'white', shade: false, rot: b.needle ?? 55},
    {d: circle(8), fill: 'yellow', shade: false},
  ],
  arrow: () => [{d: 'M-84,-22 H8 V-58 L86,0 L8,58 V22 H-84 Z', fill: 'red'}],
  calendar: () => [],
  rays: () => [],
  // a bystander: round head on a capsule body, one flat colour
  buddy: () => [{d: 'M-30,-22 Q-30,-52 0,-52 Q30,-52 30,-22 V58 Q30,90 0,90 Q-30,90 -30,58 Z', fill: 'cyan', main: true}, {d: circle(27, 0, -84), fill: 'cyan', tint: true}],
  // a person seen from behind: `hair` long, bun, curly or short, `color` the dress, `color2` the hair. Feet stand at y 100.
  figure: (b) => {
    const hair = b.hair ?? 'long';
    const legs: Part[] = [{d: 'M-10,44 V94 M10,44 V94', line: true}, {d: 'M-21,97 a9,5.5 0 1,0 18,0 a9,5.5 0 1,0 -18,0 Z M3,97 a9,5.5 0 1,0 18,0 a9,5.5 0 1,0 -18,0 Z', fill: 'navy', tint2: true, shade: false}];
    const arms: Part[] = [{d: 'M-22,-36 L-31,8 M22,-36 L31,8', line: true}, {d: circle(4.5, -31, 12), fill: 'white', shade: false}, {d: circle(4.5, 31, 12), fill: 'white', shade: false}];
    const dress: Part = {d: 'M-22,-42 Q0,-48 22,-42 L20,-12 L46,44 Q0,52 -46,44 L-20,-12 Z', fill: 'white', main: true};
    const waist: Part = {d: 'M-20,-12 Q0,-8 20,-12', line: true};
    const head: Part[] =
      hair === 'long' ? [{d: 'M-27,-98 Q-27,-128 0,-128 Q27,-128 27,-98 L27,-30 Q0,-24 -27,-30 Z', fill: 'navy', tint2: true, shade: false}]
      : hair === 'curly' ? [{d: 'M-8,-74 H8 V-44 H-8 Z', fill: 'white', shade: false}, {d: 'M0,-132 q14,-6 20,8 q16,2 12,18 q10,14 -4,22 q-2,14 -18,10 q-10,8 -20,0 q-16,4 -18,-10 q-14,-8 -4,-22 q-4,-16 12,-18 q6,-14 20,-8 Z', fill: 'navy', tint2: true, shade: false}]
      : [{d: 'M-8,-76 H8 V-42 H-8 Z', fill: 'white', shade: false}, ...(hair === 'bun' ? [{d: circle(11, 0, -134), fill: 'navy', tint2: true, shade: false} as Part] : []), {d: 'M-25,-100 a25,27 0 1,0 50,0 a25,27 0 1,0 -50,0 Z', fill: 'navy', tint2: true, shade: false}];
    return [...legs, ...arms, dress, waist, ...head];
  },
  moon: () => [{d: 'M30,-70 A76,76 0 1,0 70,36 A60,60 0 1,1 30,-70 Z', fill: 'white', shade: false}],
  field: () => [],
  stars: () => [],
  block: () => [],
  lens: () => [],
  sun: () => [{d: ticks(96, 128, 12), line: true}, {d: circle(78), fill: 'yellow', main: true}],
  ribbon: () => [],
  thought: () => [{d: circle(9, -62, 86), fill: 'white'}, {d: circle(15, -40, 58), fill: 'white'}, {d: 'M-70,-10 C-100,-20 -96,-70 -56,-66 C-44,-98 20,-100 34,-70 C78,-84 104,-40 76,-14 C100,20 60,44 30,30 C10,54 -44,50 -52,26 C-84,34 -96,6 -70,-10 Z', fill: 'white', main: true}],
};
export const PROP_KINDS = Object.keys(PROPS);

// A cutaway block: stacked layers seen from the front with a top and a side, like a slice of skin, soil or cake.
// layers: [{h, color, pattern}] from the top down; pattern fibres, cells, stripes, ripple or none. Front face is 400 wide, the block 330 tall, drawn around 0,0.
const Cutaway: React.FC<{b: Block; k: StyleTokens}> = ({b, k}) => {
  const layers: {h: number; color: string; pattern?: string}[] = b.layers ?? [{h: 1, color: 'peach', pattern: 'ripple'}, {h: 4, color: 'pink', pattern: 'fibres'}, {h: 2, color: 'cream', pattern: 'cells'}, {h: 1.4, color: 'red', pattern: 'stripes'}];
  const total = layers.reduce((n, l) => n + l.h, 0);
  const W = 400, H = 330, dx = 116, dy = -84, x0 = -W / 2 - dx / 2, y0 = -H / 2 - dy / 2;
  const line = pal(k, b.color2 ?? 'line', gray(k.mid));
  let y = y0;
  const id = React.useMemo(() => `cw${uid++}`, []);
  return (
    <g>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.07} />
        </linearGradient>
      </defs>
      <ellipse cx={dx / 2} cy={y0 + H + 14} rx={W * 0.62} ry={20} fill="#000" opacity={0.1} style={{filter: 'blur(14px)'}} />
      <path d={`M${x0},${y0} l${dx},${dy} h${W} l${-dx},${-dy} Z`} fill={pal(k, layers[0].color, '#f0c4ad')} stroke={line} strokeWidth={1.4} strokeLinejoin="round" />
      <path d={`M${x0},${y0} l${dx},${dy} h${W} l${-dx},${-dy} Z`} fill="#fff" opacity={0.16} />
      {layers.map((l, i) => {
        const h = (H * l.h) / total, top = y;
        y += h;
        const fill = pal(k, l.color, '#f0c4ad');
        const cid = `${id}c${i}`;
        const detail = pal(k, l.detail ?? 'red', '#c9685a');
        return (
          <g key={i}>
            <path d={`M${x0 + W},${top} l${dx},${dy} v${h} l${-dx},${-dy} Z`} fill={fill} stroke={line} strokeWidth={1.4} strokeLinejoin="round" />
            <path d={`M${x0 + W},${top} l${dx},${dy} v${h} l${-dx},${-dy} Z`} fill="#000" opacity={0.1} />
            <rect x={x0} y={top} width={W} height={h} fill={fill} />
            <clipPath id={cid}>
              <rect x={x0} y={top} width={W} height={h} />
            </clipPath>
            <g clipPath={`url(#${cid})`}>
              {l.pattern === 'stripes' && Array.from({length: Math.ceil(h / 9)}, (_, j) => <line key={j} x1={x0} x2={x0 + W} y1={top + 5 + j * 9} y2={top + 5 + j * 9} stroke="#000" strokeWidth={1.6} opacity={0.14} />)}
              {l.pattern === 'cells' &&
                Array.from({length: Math.ceil(h / 30) + 1}, (_, r) =>
                  Array.from({length: 15}, (_, c) => <circle key={`${r}.${c}`} cx={x0 + c * 29 + (r % 2 ? 14 : 0) + (hash(r, c, 3) - 0.5) * 5} cy={top + 16 + r * 29} r={14.5 + hash(r, c, 5) * 2} fill="#fff" fillOpacity={0.3} stroke={line} strokeWidth={1} opacity={0.75} />),
                )}
              {l.pattern === 'fibres' &&
                Array.from({length: Math.round(h / 9)}, (_, j) => {
                  const yy = top + ((j + 0.5) * h) / Math.round(h / 9), a1 = 5 + hash(j, 7) * 9, ph = hash(j, 9) * 6;
                  const pts = Array.from({length: 21}, (_, q) => `${(x0 + q * 20).toFixed(0)},${(yy + Math.sin(q * (0.7 + hash(j, 11) * 0.5) + ph) * a1 + Math.sin(q * 0.31 + ph * 2) * 6).toFixed(1)}`);
                  return <path key={j} d={`M${pts.join(' L')}`} fill="none" stroke={detail} strokeWidth={2 + hash(j, 13) * 2.4} strokeLinejoin="round" opacity={0.75} />;
                })}
              {l.pattern === 'ripple' && <path d={`M${x0},${top + h} ${Array.from({length: 21}, (_, q) => `q10,${q % 2 ? 7 : -7} 20,0`).join(' ')} V${top + h + 12} H${x0} Z`} fill={pal(k, layers[i + 1]?.color ?? l.color, fill)} transform={`translate(0,${-6})`} opacity={0} />}
            </g>
            {l.pattern === 'ripple' && <path d={`M${x0},${top + h} ${Array.from({length: 20}, () => 'q5,6 10,0 q5,-6 10,0').join(' ')}`} fill="none" stroke={line} strokeWidth={1.4} />}
            {i > 0 && layers[i - 1].pattern !== 'ripple' && <line x1={x0} x2={x0 + W} y1={top} y2={top} stroke={line} strokeWidth={1.2} />}
          </g>
        );
      })}
      <rect x={x0} y={y0} width={W} height={H} fill={`url(#${id}s)`} />
      <rect x={x0} y={y0} width={W} height={H} fill="none" stroke={line} strokeWidth={1.4} />
    </g>
  );
};

// A wall calendar that crosses its days off one by one: `text` heading, `marks` how many days get a cross, `every` seconds between crosses.
const Calendar: React.FC<{b: Block; t: number; k: StyleTokens; ow: number}> = ({b, t, k, ow}) => {
  const ink = gray(k.ink);
  const cols = b.cols ?? 6, rows = b.rows ?? 5, cell = 44, gap = 14;
  const w = cols * cell + (cols + 1) * gap, head = 62, h = head + rows * cell + (rows + 1) * gap;
  const x0 = -w / 2, y0 = -h / 2;
  const red = pal(k, b.color ?? 'red', '#ef6f6c');
  const start = (b.marksAt ?? b.at + 0.5) as number;
  return (
    <g>
      <rect x={x0} y={y0} width={w} height={h} rx={20} fill="#fff" stroke={ink} strokeWidth={ow} />
      <path d={`M${x0},${y0 + head} V${y0 + 20} Q${x0},${y0} ${x0 + 20},${y0} H${-x0 - 20} Q${-x0},${y0} ${-x0},${y0 + 20} V${y0 + head} Z`} fill={red} stroke={ink} strokeWidth={ow} strokeLinejoin="round" />
      {b.text && (
        <text x={0} y={y0 + head / 2} dy="0.36em" textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={b.textSize ?? 30} fill="#fff">
          {b.text}
        </text>
      )}
      {Array.from({length: rows * cols}, (_, i) => {
        const cx = x0 + gap + (i % cols) * (cell + gap) + cell / 2, cy = y0 + head + gap + Math.floor(i / cols) * (cell + gap) + cell / 2;
        const p = i < (b.marks ?? 0) ? easeBack((t - start - i * (b.every ?? 0.12)) / 0.22) : 0;
        return (
          <g key={i}>
            <rect x={cx - cell / 2} y={cy - cell / 2} width={cell} height={cell} rx={9} fill="#fff" stroke={ink} strokeWidth={ow * 0.55} />
            {p > 0 && <path d={`M${cx - 12},${cy - 12} L${cx + 12},${cy + 12} M${cx + 12},${cy - 12} L${cx - 12},${cy + 12}`} stroke={red} strokeWidth={ow * 0.9} strokeLinecap="round" transform={`translate(${cx},${cy}) scale(${p}) translate(${-cx},${-cy})`} />}
          </g>
        );
      })}
    </g>
  );
};

export const PropBlock: React.FC<P> = ({b, t, k}) => {
  // engine 1.9: `parts` is a drawing from the storyboard's "drawings" (the checker copies it in), drawn like any ready made prop
  const parts = React.useMemo(() => (b.parts as Part[] | undefined) ?? (PROPS[b.kind] ?? PROPS.star)(b), [b]);
  const ps = enterPose(b, t);
  if (ps.gone || ps.scale <= 0.02) return null;
  const lp = loopOf(b, t);
  const seed = seedOf(`${b.kind}${b.x}${b.y}`);
  const bo = boil(t, k, seed);
  const s = ((b.size ?? 200) / 200) * ps.scale * lp.s;
  const ow = k.lineWidths.primary / (s || 1);
  const ink = gray(k.ink);
  // a bulb can switch on at a word
  const lit = b.kind === 'bulb' && b.litAt !== undefined ? t >= b.litAt : b.kind === 'bulb' && b.lit !== false;
  const list = b.kind === 'bulb' ? PROPS.bulb({...b, lit}) : parts;
  // `color` repaints the main part (the one marked main, else the last filled one)
  const marked = list.findIndex((p) => p.main);
  const main = marked >= 0 ? marked : list.reduce((m, p, i) => (p.line || p.text ? m : i), 0);
  const signY = b.kind === 'bubble' ? -14 : b.kind === 'thought' ? -18 : b.kind === 'ribbon' ? 0 : b.kind === 'lens' ? 64 : b.kind === 'sign' ? (b.sub ? -12 : 0) : 8;
  return (
    <g transform={`translate(${b.x + ps.x + bo.x},${b.y + ps.y + lp.y + bo.y}) rotate(${(b.rotate ?? 0) + ps.rot + lp.r + bo.r}) scale(${b.flip ? -s : s},${s})`} opacity={ps.opacity}>
      {b.glow && <circle r={150} fill={pal(k, typeof b.glow === 'string' ? b.glow : 'yellow', '#ffe680')} opacity={0.28} style={{filter: 'blur(26px)'}} />}
      {lit &&
        [-150, -120, -90, -60, -30].map((a) => {
          const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180);
          return <path key={a} d={`M${c * 100},${-14 + sn * 100} L${c * 126},${-14 + sn * 126}`} stroke={ink} strokeWidth={ow} strokeLinecap="round" />;
        })}
      {b.kind === 'calendar' && <Calendar b={b} t={t} k={k} ow={ow} />}
      {b.kind === 'block' && <Cutaway b={b} k={k} />}
      {b.kind === 'lens' && (
        // a magnifier: a pale disc with a fine ring, a hairline to what it enlarges (`to`: [x, y] in canvas pixels) and a small label inside
        <g>
          {b.to && <path d={`M0,0 L${((b.to[0] - b.x) / s).toFixed(1)},${((b.to[1] - b.y) / s).toFixed(1)}`} stroke={pal(k, b.color ?? 'red', ink)} strokeWidth={1.6 / s} opacity={0.8} />}
          <circle r={104} fill="#000" opacity={0.08} style={{filter: 'blur(10px)'}} transform="translate(0,8)" />
          <circle r={100} fill={pal(k, 'white', '#fff')} stroke={gray(k.soft)} strokeWidth={2 / s} />
          <circle r={92} fill="none" stroke={gray(k.soft)} strokeWidth={1 / s} opacity={0.6} />
        </g>
      )}
      {b.kind === 'field' && (
        // ground: a soft wash below a hand drawn horizon, with grass ticks. x, y is the middle of the horizon line; size 200 keeps canvas pixels.
        <g>
          <rect x={-700} y={0} width={1400} height={1400} fill={pal(k, b.color ?? 'mint', '#cfe6d6')} opacity={b.wash ?? 0.75} />
          {Array.from({length: b.count ?? 110}, (_, i) => {
            const gx = -560 + hash(i, 11) * 1120, gy = 30 + hash(i, 13) * (b.depth ?? 620), gh = 14 + hash(i, 17) * 16;
            return <path key={i} d={`M${gx.toFixed(0)},${gy.toFixed(0)} l${((hash(i, 19) - 0.5) * 8).toFixed(1)},${-gh.toFixed(0)}`} stroke={pal(k, b.color2 ?? 'green', '#7fb08a')} strokeWidth={3} strokeLinecap="round" opacity={0.8} />;
          })}
          <path d="M-700,0 C-400,-5 -200,4 0,0 S400,-4 700,2" fill="none" stroke={ink} strokeWidth={ow * 0.8} strokeLinecap="round" />
        </g>
      )}
      {b.kind === 'stars' &&
        Array.from({length: b.count ?? 90}, (_, i) => <circle key={i} cx={(-540 + hash(i, 23) * 1080).toFixed(0)} cy={(-(b.depth ?? 1200) / 2 + hash(i, 29) * (b.depth ?? 1200)).toFixed(0)} r={1.6 + hash(i, 31) * 2.6} fill={pal(k, b.color ?? 'white', '#fff')} opacity={0.5 + hash(i, 37) * 0.5} />)}
      {b.kind === 'ribbon' &&
        (() => {
          // a caption ribbon as wide as its words, with a coloured tab at each end
          const ts = b.textSize ?? 44;
          const w = [...String(b.text ?? '')].length * ts * 0.7 + ts * 1.6, h = ts * 1.9;
          return (
            <g>
              <rect x={-w / 2 - 14} y={-h / 2 + 8} width={w + 28} height={h - 16} fill={pal(k, b.color ?? 'red', '#c8553d')} />
              <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={pal(k, 'cream', '#ece3cf')} stroke={ink} strokeWidth={5} />
              <rect x={-w / 2 + 9} y={-h / 2 + 9} width={w - 18} height={h - 18} fill="none" stroke={ink} strokeWidth={2} />
            </g>
          );
        })()}
      {b.kind === 'rays' &&
        Array.from({length: b.count ?? 34}, (_, i) => {
          // speed lines: thin ink wedges that point at the middle, each a different length
          const n = b.count ?? 34;
          const a0 = (i / n) * Math.PI * 2 + (hash(i, 3) - 0.5) * 0.12;
          const r1 = (b.inner ?? 330) * (0.85 + hash(i, 5) * 0.6), r2 = 1600;
          const wd = 0.012 + hash(i, 7) * 0.02;
          const pt = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
          return <path key={i} d={`M${pt(r1, a0)} L${pt(r2, a0 - wd)} L${pt(r2, a0 + wd)} Z`} fill={b.color ? pal(k, b.color, ink) : ink} />;
        })}
      {list.map((p, i) => {
        const el = p.text ? (
          <text x={p.x} y={p.y} dy="0.36em" textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={p.size} fill={ink}>
            {p.text}
          </text>
        ) : p.line ? (
          <>
            {k.rig?.halo && <path d={p.d} fill="none" stroke={gray(k.rig.halo.color)} strokeWidth={ow * 0.8 + k.rig.halo.width * 2} strokeLinecap="round" strokeLinejoin="round" />}
            <path d={p.d} fill="none" stroke={ink} strokeWidth={ow * 0.8} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <Flat k={k} d={p.d!} fill={pal(k, p.tint2 && b.color2 ? b.color2 : (i === main || p.tint) && b.color && !(b.kind === 'bulb') ? b.color : p.fill, gray(k.fill))} ow={k.rig?.outline === false ? 0 : ow} shade={p.shade} />
        );
        return p.rot ? <g key={i} transform={`rotate(${p.rot})`}>{el}</g> : <React.Fragment key={i}>{el}</React.Fragment>;
      })}
      {b.text && b.kind !== 'calendar' && (
        <text transform={b.flip ? 'scale(-1,1)' : undefined} x={0} y={signY} dy={b.kind === 'sign' || b.kind === 'ribbon' ? '0.36em' : undefined} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={b.textSize ?? 44} fill={b.kind === 'weight' ? '#fff' : ink}>
          {b.text}
        </text>
      )}
      {b.sub && (
        <text x={0} y={34} dy="0.36em" textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={(b.textSize ?? 44) * 0.5} fill={gray(k.mid)} letterSpacing={1.5}>
          {b.sub}
        </text>
      )}
    </g>
  );
};

// ---------- person: the chibi rig. Feet stand on x, y. ----------
const NUM: Record<string, number> = {x: 0, y: 0, lift: 0, scale: 1, rotate: 0, lean: 0, squash: 0, armL: 12, armR: 12, elbowL: 8, elbowR: 8, lookX: 0, lookY: 0, tilt: 0, headDown: 0, sit: 0, glow: 0};
const FLAG: Record<string, any> = {eyes: 'open', mouth: 'smile', brows: 'normal', sweat: false, blush: true, talk: false, grey: false, wave: false};

const stateAt = (b: Block, t: number) => {
  const st: Record<string, any> = {...NUM, ...FLAG, x: b.x, y: b.y, scale: b.scale ?? 1};
  for (const key of Object.keys(st)) if (b[key] !== undefined && key !== 'x' && key !== 'y' && key !== 'scale') st[key] = b[key];
  for (const kf of (b.keys as any[] | undefined) ?? []) {
    if (t < kf.t) break;
    const p = (EASE[kf.ease] ?? cubicInOut)(progress(t, kf.t, kf.dur ?? 0.4));
    for (const key of Object.keys(kf)) {
      if (key === 't' || key === 'dur' || key === 'ease') continue;
      if (key in NUM) st[key] = st[key] + (kf[key] - st[key]) * p;
      else if (key in FLAG) st[key] = kf[key];
    }
  }
  return st;
};

const limb = (pts: number[][]) => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')}`;

// The simple comic figure: a round head, a triangle dress or shirt, ink line arms and legs.
const StickPerson: React.FC<P> = ({b, t, k}) => {
  const story = React.useContext(StoryContext);
  if (t < b.at || (b.out !== undefined && t > b.out + 0.25)) return null;
  const look = {...(story.cast?.[b.who] ?? {}), ...(b.look ?? {})};
  const rig = k.rig!;
  const st = stateAt(b, t);
  const prev = stateAt(b, t - 0.04);
  const pop = b.enter === 'none' ? 1 : easeBack((t - b.at) / 0.35);
  const gone = b.out !== undefined && t >= b.out ? 1 - easeIn((t - b.out) / 0.25) : 1;
  const S = st.scale * pop * gone;
  if (S <= 0.02) return null;
  const ow = k.lineWidths.primary / S;
  const ink = gray(k.ink);
  const moving = Math.abs(st.x - prev.x) > 0.25;
  const phase = (st.x / (30 * st.scale)) * Math.PI;
  const bob = moving ? Math.abs(Math.sin(phase)) * 5 : 0;
  const top = pal(k, look.top, gray(rig.top));
  const skin = pal(k, look.skin, gray(rig.skin));
  const hairC = pal(k, look.hairColor, gray(rig.hair));
  const hipY = -72;
  const line = {fill: 'none', stroke: ink, strokeWidth: ow, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  const legs = [-1, 1].map((sx) => {
    const off = sx > 0 ? Math.PI : 0;
    const lift = moving ? Math.max(0, Math.sin(phase + off)) * 12 : 0;
    const fx = sx * 13 + (moving ? Math.cos(phase + off) * 9 : 0);
    return `M${sx * 13},${hipY} L${fx.toFixed(1)},${-lift.toFixed(1)}`;
  });
  const arm = (sx: number) => {
    const a = (((sx < 0 ? st.armL : st.armR) + 22) * Math.PI) / 180;
    const e = a + ((sx < 0 ? st.elbowL : st.elbowR) * Math.PI) / 180;
    const sh = [sx * 20, -134];
    const el = [sh[0] + sx * Math.sin(a) * 30, sh[1] + Math.cos(a) * 30];
    return limb([sh, el, [el[0] + sx * Math.sin(e) * 28, el[1] + Math.cos(e) * 28]]);
  };
  const hy = -206 + st.headDown * 10;
  const hair = look.hair ?? 'bob';
  const fy = hair === 'bob' ? hy + 10 : hy; // the middle of the face
  const ex = st.lookX * 5, ey = st.lookY * 4 + st.headDown * 5;
  const blinkOn = (t + (seedOf(`${b.who}${b.x}`) % 7) * 0.37) % 3.6 < 0.12;
  const eyes = blinkOn && ['open', 'wide'].includes(st.eyes) ? 'closed' : st.eyes;
  const eye = (sx: number) => {
    const cx = sx * 19 + ex, cy = fy - 2 + ey;
    if (eyes === 'happy') return <path d={`M${cx - 8},${cy + 2} Q${cx},${cy - 9} ${cx + 8},${cy + 2}`} {...line} strokeWidth={ow * 0.7} />;
    if (eyes === 'closed' || eyes === 'squint') return <path d={`M${cx - 8},${cy} L${cx + 8},${cy}`} {...line} strokeWidth={ow * 0.7} />;
    if (eyes === 'x') return <path d={`M${cx - 6},${cy - 6} L${cx + 6},${cy + 6} M${cx + 6},${cy - 6} L${cx - 6},${cy + 6}`} {...line} strokeWidth={ow * 0.7} />;
    return (
      <g>
        <circle cx={cx} cy={cy} r={eyes === 'wide' ? 7.5 : 5.5} fill={ink} />
        {(eyes === 'sad' || st.brows === 'worried') && <path d={`M${cx - sx * 9},${cy - 12} L${cx + sx * 8},${cy - 18}`} {...line} strokeWidth={ow * 0.6} />}
        {st.brows === 'angry' && <path d={`M${cx - sx * 9},${cy - 18} L${cx + sx * 8},${cy - 11}`} {...line} strokeWidth={ow * 0.6} />}
      </g>
    );
  };
  const speaking = st.talk && (story.speech ?? []).some(([a, z]) => t >= a && t <= z);
  const mouth = speaking ? (Math.floor(t * 9) % 2 ? 'o' : 'flat') : st.mouth;
  const my = fy + 22 + ey * 0.6, mx = ex * 0.6;
  const thin = {...line, strokeWidth: ow * 0.7};
  const mouthEl =
    mouth === 'big' ? <path d={`M${mx - 11},${my - 4} Q${mx},${my + 15} ${mx + 11},${my - 4} Z`} fill={ink} stroke={ink} strokeWidth={ow * 0.6} strokeLinejoin="round" />
    : mouth === 'sad' ? <path d={`M${mx - 9},${my + 4} Q${mx},${my - 6} ${mx + 9},${my + 4}`} {...thin} />
    : mouth === 'o' ? <ellipse cx={mx} cy={my} rx={5} ry={6.5} fill={ink} />
    : mouth === 'flat' ? <path d={`M${mx - 7},${my} L${mx + 7},${my}`} {...thin} />
    : mouth === 'wobble' || mouth === 'grit' ? <path d={`M${mx - 12},${my} q3,-5 6,0 t6,0 t6,0 t6,0`} {...thin} />
    : mouth === 'smirk' ? <path d={`M${mx - 8},${my} Q${mx + 3},${my + 5} ${mx + 10},${my - 4}`} {...thin} />
    : <path d={`M${mx - 9},${my - 2} Q${mx},${my + 9} ${mx + 9},${my - 2}`} {...thin} />;
  const blush = st.blush && (b.blush !== undefined || ((b.keys as any[] | undefined) ?? []).some((kf) => kf.blush !== undefined));
  const faded = st.grey || look.grey;
  return (
    <g transform={`translate(${st.x},${st.y - st.lift - bob}) rotate(${st.rotate + st.lean}) scale(${S * (1 + st.squash * 0.18)},${S * (1 - st.squash * 0.25)})`} opacity={faded ? 0.5 : 1}>
      {legs.map((d, i) => <path key={i} d={d} {...line} />)}
      <path d={`M-15,-150 L15,-150 L${look.build === 'shirt' ? 30 : 50},${hipY} L${look.build === 'shirt' ? -30 : -50},${hipY} Z`} fill={top} {...{stroke: ink, strokeWidth: ow, strokeLinejoin: 'round' as const}} />
      <path d={arm(-1)} {...line} />
      <path d={arm(1)} {...line} />
      {st.glow > 0 && <path d="M0,-96 C-34,-120 -34,-146 -17,-150 C-8,-152 -2,-146 0,-140 C2,-146 8,-152 17,-150 C34,-146 34,-120 0,-96 Z" fill={pal(k, 'red', '#ee5d50')} stroke={ink} strokeWidth={ow * 0.7} strokeLinejoin="round" transform={`translate(0,${-123 * (1 - st.glow)}) scale(${st.glow})`} />}
      <g transform={`rotate(${st.tilt},0,${hy + 60})`}>
        {hair === 'bob' ? (
          <>
            <path d={`M-66,${hy + 50} L-66,${hy - 10} Q-66,${hy - 74} 0,${hy - 74} Q66,${hy - 74} 66,${hy - 10} L66,${hy + 50} Z`} fill={hairC} stroke={ink} strokeWidth={ow} strokeLinejoin="round" />
            <path d={`M-48,${fy - 14} L48,${fy - 14} Q50,${fy + 46} 0,${fy + 46} Q-50,${fy + 46} -48,${fy - 14} Z`} fill={skin} />
          </>
        ) : (
          <>
            <circle cx={0} cy={hy} r={58} fill={skin} stroke={ink} strokeWidth={ow} />
            {hair === 'short' && <path d={`M-58,${hy - 4} Q-58,${hy - 60} 0,${hy - 60} Q58,${hy - 60} 58,${hy - 4} Q30,${hy - 30} 0,${hy - 28} Q-30,${hy - 30} -58,${hy - 4} Z`} fill={hairC} stroke={ink} strokeWidth={ow} strokeLinejoin="round" />}
          </>
        )}
        {blush && [-1, 1].map((sx) => <ellipse key={sx} cx={sx * 33 + ex * 0.5} cy={fy + 14} rx={9} ry={6} fill={pal(k, 'red', '#ee5d50')} opacity={0.55} />)}
        {eye(-1)}
        {eye(1)}
        {mouthEl}
        {st.sweat && <path d={`M70,${hy - 30} q-9,14 0,20 q9,-6 0,-20 Z`} fill={pal(k, 'sky', '#bcd4f0')} stroke={ink} strokeWidth={ow * 0.6} strokeLinejoin="round" />}
      </g>
    </g>
  );
};

export const PersonBlock: React.FC<P> = (p) => (p.k.rig?.build === 'stick' ? <StickPerson {...p} /> : <ChibiPerson {...p} />);

const ChibiPerson: React.FC<P> = ({b, t, k}) => {
  const story = React.useContext(StoryContext);
  if (t < b.at || (b.out !== undefined && t > b.out + 0.25)) return null;
  const look = {...(story.cast?.[b.who] ?? {}), ...(b.look ?? {})};
  const rig = k.rig!;
  const st = stateAt(b, t);
  const prev = stateAt(b, t - 0.04);
  const seed = seedOf(`${b.who ?? 'p'}${b.x}`);
  const bo = boil(t, k, seed);
  const pop = b.enter === 'none' ? 1 : easeBack((t - b.at) / 0.35);
  const gone = b.out !== undefined && t >= b.out ? 1 - easeIn((t - b.out) / 0.25) : 1;
  const S = st.scale * pop * gone;
  if (S <= 0.02) return null;
  const ow = k.lineWidths.primary / S;
  const ink = gray(k.ink);

  // walking: feet alternate with distance travelled, so they never slide; arms swing and the body leans into the move
  const vx = (st.x - prev.x) / 0.04;
  const moving = Math.abs(st.x - prev.x) > 0.25 && st.sit < 0.5;
  const dir = vx >= 0 ? 1 : -1;
  const phase = (st.x / (34 * st.scale)) * Math.PI;
  const wob = moving ? Math.sin(phase) * 3 + dir * 4 : 0;
  const bob = moving ? Math.abs(Math.sin(phase)) * 6 : 0;
  const swing = moving ? Math.sin(phase) * 22 : 0;
  const breath = Math.sin(t * 2.2 + seed) * 0.012;

  const skin = pal(k, look.skin, gray(rig.skin));
  const top = pal(k, look.top, gray(rig.top));
  const trousers = pal(k, look.trousers, gray(rig.trousers));
  const hairC = pal(k, look.hairColor, gray(rig.hair));
  const shoes = pal(k, look.shoes, gray(rig.shoes));

  const sitDrop = st.sit * 46;
  const hipY = -64 + sitDrop * 0.2;
  const legs = [-1, 1].map((sx) => {
    const lift = moving ? Math.max(0, Math.sin(phase + (sx > 0 ? Math.PI : 0))) * 16 : 0;
    const stride = moving ? Math.cos(phase + (sx > 0 ? Math.PI : 0)) * 9 * dir : 0;
    const fx = sx * (14 + st.sit * 22) + stride, fy = -lift + sitDrop * 0.2;
    return {sx, fx, fy, d: limb([[sx * 14, hipY], [fx, fy - 16]])};
  });
  // engine 1.9: wave true swings the right forearm side to side
  const waveR = st.wave ? Math.sin((t - b.at) * 11) * 26 : 0;
  const arm = (sx: number) => {
    const a = (((sx < 0 ? st.armL - swing * 0.5 : st.armR + swing * 0.5)) * Math.PI) / 180;
    const e = a + ((sx < 0 ? st.elbowL : st.elbowR + waveR) * Math.PI) / 180;
    const sh = [sx * 37, -126];
    const el = [sh[0] + sx * Math.sin(a) * 27, sh[1] + Math.cos(a) * 27];
    const hand = [el[0] + sx * Math.sin(e) * 25, el[1] + Math.cos(e) * 25];
    return {d: limb([sh, el, hand]), hand};
  };
  const arms = [arm(-1), arm(1)];

  // head
  const hy = -215 + st.headDown * 12;
  const blinkOn = (t + (seed % 7) * 0.37) % 3.3 < 0.12;
  const eyes = blinkOn && ['open', 'wide'].includes(st.eyes) ? 'closed' : st.eyes;
  const ex = st.lookX * 6, ey = st.lookY * 5 + st.headDown * 7;
  const speaking = st.talk && (story.speech ?? []).some(([a, z]) => t >= a && t <= z);
  const mouth = speaking ? (Math.floor(t * 9) % 3 === 0 ? 'flat' : Math.floor(t * 9) % 3 === 1 ? 'o' : 'big') : st.mouth;
  const line = {fill: 'none', stroke: ink, strokeWidth: ow * 0.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  const eye = (sx: number) => {
    const cx = sx * 25 + ex, cy = hy + 24 + ey;
    switch (eyes) {
      case 'happy': return <path d={`M${cx - 10},${cy + 3} Q${cx},${cy - 12} ${cx + 10},${cy + 3}`} {...line} />;
      case 'closed': return <path d={`M${cx - 10},${cy} Q${cx},${cy + 7} ${cx + 10},${cy}`} {...line} />;
      case 'squint': return <path d={`M${cx - 10},${cy} L${cx + 10},${cy}`} {...line} />;
      case 'x': return <path d={`M${cx - 8},${cy - 8} L${cx + 8},${cy + 8} M${cx + 8},${cy - 8} L${cx - 8},${cy + 8}`} {...line} />;
      case 'spiral': return <path d={`M${cx},${cy} m0,-2 a3,3 0 1,1 -3,3 a6,6 0 1,1 6,6 a9,9 0 1,1 -9,-9`} {...line} strokeWidth={ow * 0.55} />;
      default: {
        const ry = eyes === 'wide' ? 13 : eyes === 'sad' ? 9 : 10.5;
        const rx = eyes === 'wide' ? 9.5 : 8;
        return (
          <g>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={ink} />
            <circle cx={cx + 2.6} cy={cy - ry * 0.38} r={3} fill="#fff" />
            {eyes === 'sad' && <path d={`M${cx - sx * 11},${cy - ry - 1} L${cx + sx * 11},${cy - ry - 8}`} stroke={ink} strokeWidth={ow * 0.65} strokeLinecap="round" />}
          </g>
        );
      }
    }
  };
  const brow = (sx: number) => {
    const cx = sx * 25 + ex, cy = hy + 5 + ey * 0.6;
    const d =
      st.brows === 'up' ? `M${cx - 9},${cy - 3} Q${cx},${cy - 10} ${cx + 9},${cy - 3}`
      : st.brows === 'worried' ? `M${cx - sx * 9},${cy + 2} L${cx + sx * 9},${cy - 6}`
      : st.brows === 'angry' ? `M${cx - sx * 9},${cy - 6} L${cx + sx * 9},${cy + 3}`
      : st.brows === 'flat' ? `M${cx - 9},${cy} L${cx + 9},${cy}`
      : st.brows === 'none' ? ''
      : `M${cx - 8},${cy + 1} Q${cx},${cy - 4} ${cx + 8},${cy + 1}`;
    return d ? <path d={d} {...line} strokeWidth={ow * 0.7} /> : null;
  };
  const my = hy + 47 + ey * 0.6, mx = ex * 0.6;
  const mouthEl =
    mouth === 'big' ? <path d={`M${mx - 14},${my - 5} Q${mx},${my + 20} ${mx + 14},${my - 5} Z`} fill={pal(k, 'red', '#ef6f6c')} stroke={ink} strokeWidth={ow * 0.7} strokeLinejoin="round" />
    : mouth === 'sad' ? <path d={`M${mx - 11},${my + 5} Q${mx},${my - 7} ${mx + 11},${my + 5}`} {...line} />
    : mouth === 'o' ? <ellipse cx={mx} cy={my + 1} rx={6.5} ry={8.5} fill={pal(k, 'red', '#ef6f6c')} stroke={ink} strokeWidth={ow * 0.7} />
    : mouth === 'flat' ? <path d={`M${mx - 9},${my} L${mx + 9},${my}`} {...line} />
    : mouth === 'wobble' ? <path d={`M${mx - 14},${my} q3.5,-6 7,0 t7,0 t7,0 t7,0`} {...line} />
    : mouth === 'smirk' ? <path d={`M${mx - 9},${my + 1} Q${mx + 4},${my + 7} ${mx + 12},${my - 5}`} {...line} />
    : mouth === 'grit' ? <rect x={mx - 12} y={my - 5} width={24} height={11} rx={4} fill="#fff" stroke={ink} strokeWidth={ow * 0.7} />
    : <path d={`M${mx - 10},${my - 2} Q${mx},${my + 10} ${mx + 10},${my - 2}`} {...line} />;

  const capOn = look.cap !== undefined ? !!look.cap : false;
  const hair = look.hair ?? (capOn ? 'fringe' : 'tuft');
  const headD = `M-72,${hy} a72,70 0 1,0 144,0 a72,70 0 1,0 -144,0 Z`;
  const hairD =
    hair === 'none' ? ''
    : hair === 'long' ? `M-78,${hy + 72} Q-92,${hy - 84} 0,${hy - 80} Q92,${hy - 84} 78,${hy + 72} L56,${hy + 68} Q66,${hy - 18} 30,${hy - 34} Q-10,${hy - 14} -52,${hy - 26} Q-64,${hy + 10} -56,${hy + 68} Z`
    : hair === 'bun' ? `M-74,${hy - 2} Q-80,${hy - 78} 0,${hy - 78} Q80,${hy - 78} 74,${hy - 2} Q50,${hy - 40} 0,${hy - 38} Q-50,${hy - 40} -74,${hy - 2} Z M-24,${hy - 94} a24,22 0 1,0 48,0 a24,22 0 1,0 -48,0 Z`
    : hair === 'short' ? `M-74,${hy - 4} Q-82,${hy - 80} 0,${hy - 78} Q82,${hy - 80} 74,${hy - 4} Q56,${hy - 42} 0,${hy - 40} Q-56,${hy - 42} -74,${hy - 4} Z`
    : hair === 'fringe' ? `M-70,${hy + 20} Q-76,${hy - 40} -40,${hy - 58} L40,${hy - 58} Q76,${hy - 40} 70,${hy + 20} L61,${hy + 3} L50,${hy + 13} L38,${hy - 1} L24,${hy + 9} L8,${hy - 3} L-10,${hy + 9} L-26,${hy - 1} L-40,${hy + 11} L-54,${hy + 1} L-61,${hy + 4} Z`
    : `M-74,${hy - 4} Q-84,${hy - 76} -10,${hy - 78} Q0,${hy - 106} 26,${hy - 94} Q18,${hy - 86} 22,${hy - 76} Q80,${hy - 72} 74,${hy - 4} Q58,${hy - 36} 14,${hy - 42} Q-30,${hy - 22} -74,${hy - 4} Z`;
  const capC = pal(k, typeof look.cap === 'string' ? look.cap : undefined, gray(rig.cap ?? rig.hair));
  const dotC = pal(k, look.capDot, gray(rig.capDot ?? '#eeff01'));
  const domeD = `M-76,${hy - 10} C-82,${hy - 66} -44,${hy - 92} 0,${hy - 92} C44,${hy - 92} 82,${hy - 66} 76,${hy - 10} Z`;
  const brimD = `M-78,${hy - 12} Q0,${hy - 46} 78,${hy - 12} Q83,${hy} 72,${hy + 2} Q0,${hy - 30} -72,${hy + 2} Q-83,${hy} -78,${hy - 12} Z`;

  const torsoD = `M-34,-140 Q0,-150 34,-140 Q41,-137 41,-126 L42,${hipY - 6} Q0,${hipY + 2} -42,${hipY - 6} L-41,-126 Q-41,-137 -34,-140 Z`;
  const beltD = `M-41,${hipY - 8} Q0,${hipY} 41,${hipY - 8} L39,${hipY + 8} Q0,${hipY + 14} -39,${hipY + 8} Z`;
  const squashY = 1 - st.squash * 0.25 + breath, squashX = 1 + st.squash * 0.18;
  const air = clamp((st.lift + bob) / 260);
  return (
    <g style={st.grey || look.grey ? {filter: 'grayscale(1) brightness(1.05)'} : undefined}>
      {b.shadow !== false && <ellipse cx={st.x} cy={st.y + 3 * S} rx={52 * S * (1 - air * 0.45)} ry={9 * S * (1 - air * 0.45)} fill={k.hatch ? 'url(#inkLine)' : '#000'} opacity={(k.hatch ? 0.8 : 0.11) * (1 - air * 0.5)} />}
      {moving && Math.abs(vx) > 320 &&
        [[-228, 34], [-170, 46], [-112, 60], [-54, 78]].map(([ly, len], i) => (
          <path key={i} d={`M${st.x - dir * (86 + (i % 2) * 14) * S},${st.y + ly * S} h${-dir * len * S}`} stroke={gray(k.soft)} strokeWidth={ow * S * 0.75} strokeLinecap="round" />
        ))}
      <g transform={`translate(${st.x + bo.x},${st.y - st.lift - bob + bo.y}) rotate(${st.rotate + wob + bo.r}) scale(${S * squashX},${S * squashY}) translate(0,${sitDrop})`}>
        {st.glow > 0 && <circle cx={0} cy={-150} r={210} fill={pal(k, 'yellow', '#ffe680')} opacity={0.35 * st.glow} style={{filter: 'blur(30px)'}} />}
        {legs.map((l) => (
          <g key={l.sx}>
            <path d={l.d} stroke={ink} strokeWidth={24 + ow * 2} strokeLinecap="round" fill="none" />
            <path d={l.d} stroke={trousers} strokeWidth={24} strokeLinecap="round" fill="none" />
            <ellipse cx={l.fx + l.sx * 3} cy={l.fy - 9} rx={17} ry={10.5} fill={shoes} stroke={ink} strokeWidth={ow} />
          </g>
        ))}
        <g transform={`rotate(${st.lean})`}>
          <Flat k={k} d={torsoD} fill={top} ow={ow} />
          <Flat k={k} d={beltD} fill={trousers} ow={ow} shade={false} />
          {arms.map((a, i) => (
            <g key={i}>
              <path d={a.d} stroke={ink} strokeWidth={21 + ow * 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d={a.d} stroke={top} strokeWidth={21} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx={a.hand[0]} cy={a.hand[1]} r={11.5} fill={skin} stroke={ink} strokeWidth={ow} />
            </g>
          ))}
          <g transform={`rotate(${st.tilt},0,${hy + 60})`}>
            {[-1, 1].map((sx) => (
              <circle key={sx} cx={sx * 71} cy={hy + 22} r={11} fill={skin} stroke={ink} strokeWidth={ow} />
            ))}
            {hair === 'long' && <Flat k={k} d={hairD} fill={hairC} ow={ow} shade={false} />}
            <Flat k={k} d={headD} fill={skin} ow={ow} />
            {hair !== 'long' && hairD && <Flat k={k} d={hairD} fill={hairC} ow={ow} shade={false} />}
            {capOn ? (
              <>
                <Flat k={k} d={domeD} fill={capC} ow={ow} />
                <path d={`M0,${hy - 92} Q-30,${hy - 70} -37,${hy - 34} M0,${hy - 92} Q30,${hy - 70} 37,${hy - 34}`} fill="none" stroke="#fff" strokeWidth={ow * 0.45} strokeLinecap="round" opacity={0.16} />
                <path d={`M-56,${hy - 52} Q-46,${hy - 72} -26,${hy - 80}`} fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" opacity={0.2} />
                <path d={brimD} fill={capC} stroke={ink} strokeWidth={ow} strokeLinejoin="round" />
                <path d={brimD} fill="#fff" opacity={0.08} />
                <circle cx={0} cy={hy - 54} r={8.5} fill={dotC} stroke={ink} strokeWidth={ow * 0.8} />
                <ellipse cx={0} cy={hy - 93} rx={12} ry={6.5} fill={dotC} stroke={ink} strokeWidth={ow * 0.8} />
              </>
            ) : (
              <path d={`M-44,${hy - 42} Q-30,${hy - 58} -8,${hy - 60}`} fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" opacity={0.3} />
            )}
            {st.blush && rig.blush !== 'hatch' && [-1, 1].map((sx) => <ellipse key={sx} cx={sx * 47 + ex * 0.5} cy={hy + 42 + ey * 0.5} rx={12} ry={8} fill={pal(k, 'pink', '#f4a6a0')} opacity={0.75} />)}
            {st.blush && rig.blush === 'hatch' && [-1, 1].map((sx) => <path key={sx} d={[-9, 0, 9].map((o) => `M${sx * 47 + o - 4},${hy + 47} l8,-10`).join(' ')} {...line} strokeWidth={ow * 0.5} opacity={0.7} />)}
            {eye(-1)}
            {eye(1)}
            {brow(-1)}
            {brow(1)}
            {mouthEl}
            {look.glasses && <path d={`M${-41 + ex},${hy + 24 + ey} a16,16 0 1,0 32,0 a16,16 0 1,0 -32,0 M${9 + ex},${hy + 24 + ey} a16,16 0 1,0 32,0 a16,16 0 1,0 -32,0 M${-9 + ex},${hy + 24 + ey} L${9 + ex},${hy + 24 + ey}`} {...line} strokeWidth={ow * 0.6} />}
            {st.sweat && <path d={`M84,${hy - 22} q-12,18 0,26 q12,-8 0,-26 Z`} fill={pal(k, 'cyan', '#bfe6f5')} stroke={ink} strokeWidth={ow * 0.6} strokeLinejoin="round" />}
          </g>
        </g>
      </g>
    </g>
  );
};

// ---------- badge: chapter number. Pops in the middle with its label, then parks in the top left corner. ----------
export const BadgeBlock: React.FC<P> = ({b, t, k}) => {
  const {W = 1080, H = 1920} = React.useContext(StoryContext);
  if (t < b.at || (b.out !== undefined && t > b.out + 0.2)) return null;
  const pop = easeBack((t - b.at) / 0.35);
  const park = cubicInOut(progress(t, b.at + (b.hold ?? 0.9), 0.45));
  const gone = b.out !== undefined && t >= b.out ? 1 - easeIn((t - b.out) / 0.2) : 1;
  const y0 = b.y ?? (H < W ? 420 : 520);
  const x = W / 2 + (116 - W / 2) * park, y = y0 + (150 - y0) * park;
  const s = (1 + (0.34 - 1) * park) * pop * gone;
  const ow = k.lineWidths.primary / (s || 1);
  const fill = pal(k, b.color ?? 'teal', '#1f6f78');
  if (k.type?.badge === 'counter') {
    const two = (v: any) => String(v).padStart(2, '0');
    return (
      <g opacity={Math.min(1, pop) * gone} transform="translate(96,150)">
        <text fontFamily={k.fonts.mono} fontSize={34} fontWeight={700} fill={gray(k.ink)}>
          {two(b.text)}
          <tspan fill={gray(k.soft)} fontWeight={400}>{b.total ? ` / ${two(b.total)}` : ''}</tspan>
        </text>
        <rect x={0} y={14} width={44 * Math.min(1, pop)} height={5} fill={pal(k, b.color ?? 'lime', '#e9ff1f')} />
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y}) rotate(${-6 * (1 - park) * (1 - clamp((t - b.at) / 0.35))}) scale(${s})`}>
      <rect x={-140} y={-126} width={280} height={280} rx={56} fill={gray(k.ink)} stroke={gray(k.ink)} strokeWidth={ow} />
      <rect x={-140} y={-140} width={280} height={270} rx={56} fill={fill} stroke={gray(k.ink)} strokeWidth={ow} />
      <path d="M-96,-98 Q-70,-112 -30,-112" fill="none" stroke="#fff" strokeWidth={10} strokeLinecap="round" opacity={0.22} />
      <text x={0} y={-6} dy="0.35em" textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={String(b.text).length > 1 ? 140 : 190} fill={b.textColor ? pal(k, b.textColor, '#fff') : '#fff'}>
        {b.text}
      </text>
      {b.label && (
        <text x={0} y={230} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={44} letterSpacing={3} fill={gray(k.mid)} opacity={1 - park}>
          {b.label}
        </text>
      )}
    </g>
  );
};

// ---------- pop text: keywords whose letters pop on one by one with a little overshoot ----------
const usePositions = (text: string) => {
  const ref = React.useRef<SVGTextElement>(null);
  const [pos, setPos] = React.useState<{x: number; w: number}[] | null>(null);
  const [, bump] = React.useState(0);
  React.useEffect(() => {
    const h = delayRender('measuring letters');
    fontsReady.then(() => {
      flushSync(() => bump((n) => n + 1));
      continueRender(h);
    });
  }, []);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text.length) return;
    const next = [...text].map((_, i) => ({x: el.getStartPositionOfChar(i).x, w: el.getSubStringLength(i, 1)}));
    if (!pos || pos.length !== next.length || pos.some((p, i) => Math.abs(p.x - next[i].x) > 0.5)) setPos(next);
  });
  return [ref, pos] as const;
};

const PopLine: React.FC<{k: StyleTokens; t: number; at: number; text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; size: number; fill: string; outline?: string; underline?: string}> = ({k, t, at, text, x, y, anchor, size, fill, outline, underline}) => {
  const [ref, pos] = usePositions(text);
  const font = {fontFamily: k.fonts.headline, fontWeight: k.type?.headlineWeight ?? 700, fontSize: size};
  return (
    <g>
      <text ref={ref} x={x} y={y} textAnchor={anchor} {...font} opacity={0}>
        {text}
      </text>
      {pos &&
        [...text].map((ch, i) => {
          const p = easeBack((t - at - i * 0.035) / 0.28);
          if (p <= 0 || ch === ' ') return null;
          const cx = pos[i].x + pos[i].w / 2;
          // hand lettering: each letter sits a little off its neighbours
          const jit = k.type?.jitter ? `translate(${cx},${y}) rotate(${((hash(i, text.length, 1) - 0.5) * 4).toFixed(2)}) scale(${(0.97 + hash(i, text.length, 3) * 0.06).toFixed(3)}) translate(${-cx},${-y}) translate(0,${((hash(i, text.length, 2) - 0.5) * 6).toFixed(1)}) ` : '';
          return (
            <text key={i} x={cx} y={y} textAnchor="middle" {...font} fill={fill} stroke={outline} strokeWidth={outline ? size * 0.16 : 0} strokeLinejoin="round" paintOrder="stroke" transform={`${jit}translate(0,${-14 * (1 - clamp(p))}) translate(${cx},${y - size * 0.35}) scale(${p}) translate(${-cx},${-(y - size * 0.35)})`}>
              {ch}
            </text>
          );
        })}
      {underline && pos && pos.length > 0 && (() => {
        const first = pos.find((_, i) => text[i] !== ' ')!, lastI = text.trimEnd().length - 1;
        const x0 = first.x - 6, x1 = pos[lastI].x + pos[lastI].w + 6, uy = y + size * 0.2;
        const up = cubicInOut(progress(t, at + text.length * 0.035 + 0.3, 0.35));
        return <BrushStroke d={`M${x0},${uy} Q${(x0 + x1) / 2},${uy - 9} ${x1},${uy - 4}`} stroke={underline} w={Math.max(7, size * 0.09)} frac={up} />;
      })()}
    </g>
  );
};

export const PopHeadline: React.FC<P> = ({b, t, k}) => {
  const {W = 1080} = React.useContext(StoryContext);
  if (t < b.at) return null;
  const size = b.size ?? 96;
  const anchor = b.align === 'left' ? 'start' : b.align === 'right' ? 'end' : 'middle';
  const lines: string[] = b.lines ?? [b.text];
  let n = 0;
  const gone = b.out !== undefined ? 1 - progress(t, b.out, 0.2) : 1;
  return (
    <g opacity={gone} transform={b.rotate ? `rotate(${b.rotate},${b.x ?? W / 2},${b.y})` : undefined}>
      {lines.map((s, i) => {
        const at = b.at + n * 0.035;
        n += s.length;
        return <PopLine key={i} k={k} t={t} at={at} text={s} x={b.x ?? W / 2} y={b.y + i * size * 1.12} anchor={anchor} size={size} fill={pal(k, b.color, gray(k.ink))} outline={b.outline ? (typeof b.outline === 'string' ? pal(k, b.outline, '#fff') : '#fff') : undefined} underline={b.underline ? pal(k, typeof b.underline === 'string' ? b.underline : 'ink', gray(k.ink)) : undefined} />;
      })}
    </g>
  );
};

// ---------- set: chapter tint with a soft glow behind the action, and a floor a little darker with faint plank lines ----------
export const TintSet: React.FC<{k: StyleTokens; t: number; W: number; H: number; tint: string; floor: number | false}> = ({k, W, H, tint, floor}) => {
  const c = gray(k.tints?.[tint] ?? k.bg);
  const dark = tint === 'night';
  return (
    <g>
      <defs>
        <radialGradient id="setGlow" gradientUnits="userSpaceOnUse" cx={W / 2} cy={H * 0.4} r={W * 0.95}>
          <stop offset="0%" stopColor="#fff" stopOpacity={k.background?.glow ?? (dark ? 0.1 : 0.5)} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={c} />
      <rect width={W} height={H} fill="url(#setGlow)" />
      {k.background?.dots && <rect width={W} height={floor === false ? H : floor} fill="url(#benday)" opacity={k.background.dots} />}
      {floor !== false && (
        <g>
          {k.background?.dots ? (
            <>
              <rect x={0} y={floor} width={W} height={H - floor} fill="#000" opacity={0.1} />
              <rect x={0} y={floor} width={W} height={H - floor} fill="url(#benday)" opacity={k.background.dots * 0.35} />
            </>
          ) : k.hatch ? (
            <>
              <mask id="hatchFloorMask" maskUnits="userSpaceOnUse" x={0} y={floor} width={W} height={H - floor}>
                <rect x={0} y={floor} width={W} height={H - floor} fill="url(#hatchFloor)" />
              </mask>
              <rect x={0} y={floor} width={W} height={H - floor} fill="url(#inkLine)" mask="url(#hatchFloorMask)" opacity={dark ? 0.9 : 0.7} />
              {[0.14, 0.34, 0.6].map((f) => (
                <line key={f} x1={0} y1={floor + (H - floor) * f} x2={W} y2={floor + (H - floor) * f} stroke={gray(k.ink)} strokeWidth={2.5} strokeDasharray="10 9" opacity={0.3} />
              ))}
            </>
          ) : (
            <>
              <rect x={0} y={floor} width={W} height={H - floor} fill="#000" opacity={0.07} />
              <rect x={0} y={floor} width={W} height={60} fill="url(#floorFade)" opacity={0.05} />
              <line x1={0} y1={floor} x2={W} y2={floor} stroke={gray(k.ink)} strokeWidth={3} opacity={0.1} />
              {[0.17, 0.4, 0.7].map((f) => (
                <line key={f} x1={0} y1={floor + (H - floor) * f} x2={W} y2={floor + (H - floor) * f} stroke={gray(k.ink)} strokeWidth={2.5} opacity={0.045} />
              ))}
            </>
          )}
        </g>
      )}
    </g>
  );
};

// ---------- iris: a circle closes on one chapter and opens on the next ----------
export const Iris: React.FC<{k: StyleTokens; t: number; cuts: number[]; W: number; H: number}> = ({k, t, cuts, W, H}) => {
  const half = 0.32;
  const cut = cuts.find((c) => Math.abs(t - c) < half);
  if (cut === undefined) return null;
  const R = Math.hypot(W, H) / 2 + 20;
  const r = t < cut ? R * (1 - easeIn((t - (cut - half)) / half)) : R * easeOut((t - cut) / half);
  return <path fillRule="evenodd" fill={gray(k.ink)} d={`M0,0 H${W} V${H} H0 Z M${W / 2 - r},${H / 2} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`} />;
};

// ---------- page wipe: the panel empties to bare paper and the next chapter prints in ----------
export const PageWipe: React.FC<{k: StyleTokens; t: number; cuts: number[]; W: number; H: number}> = ({k, t, cuts, W, H}) => {
  const half = 0.22;
  const cut = cuts.find((c) => Math.abs(t - c) < half);
  if (cut === undefined) return null;
  const p = 1 - Math.abs(t - cut) / half;
  return <rect width={W} height={H} fill={gray(k.panel?.page ?? k.bg)} opacity={easeOut(p * 1.6)} />;
};

// ---------- caption: the spoken words under the picture; the word being said lights up ----------
export const CaptionBlock: React.FC<P> = ({b, t, k}) => {
  const words = (b.words ?? []) as [number, number, string][];
  if (!words.length || t < b.at - 0.15 || (b.out !== undefined && t > b.out + 0.2)) return null;
  const size = b.size ?? 62;
  const max = b.wrap ?? 30;
  const lines: [number, number, string][][] = [[]];
  let n = 0;
  for (const w of words) {
    if (n && n + w[2].length + 1 > max) (lines.push([]), (n = 0));
    lines[lines.length - 1].push(w);
    n += w[2].length + 1;
  }
  const now = words.filter((w) => t >= w[0]).length - 1;
  const fade = Math.min(progress(t, b.at - 0.15, 0.15), b.out !== undefined ? 1 - progress(t, b.out, 0.2) : 1);
  let i = 0;
  return (
    <g opacity={fade}>
      {lines.map((ln, li) => (
        <text key={li} x={b.x ?? 540} y={b.y + li * size * 1.2} textAnchor="middle" fontFamily={k.fonts.ui} fontWeight={k.type?.labelWeight ?? 500} fontSize={size} style={{whiteSpace: 'pre'}}>
          {ln.map((w, j) => {
            const idx = i++;
            return (
              <tspan key={j} fill={idx === now ? pal(k, b.color ?? 'red', gray(k.ink)) : idx < now ? gray(k.ink) : gray(k.soft)}>
                {(j ? ' ' : '') + w[2]}
              </tspan>
            );
          })}
        </text>
      ))}
    </g>
  );
};

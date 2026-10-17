// Engine 1.7: Happy Bean. A bean shaped hero with a face, thin arms and stubby legs, built for this style only
// (nothing shared with the chibi rig), plus the flat scenarios it acts in, a headline with a short underline and badges.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {Block} from './blocks';
import {StoryContext} from './chibi'; // shared storyboard data only (cast and word timings); nothing of the chibi rig
import {StyleTokens, clamp, cubicInOut, gray, hash, outFade, progress, quintOut} from './lib';

type P = {b: Block; t: number; k: StyleTokens};

// ---------- shared helpers ----------
const col = (k: StyleTokens, c: string | undefined, fallback: string) => {
  const n = c ?? fallback;
  if (k.palette && n in k.palette) return gray(k.palette[n]);
  if (n === 'ink') return gray(k.ink);
  if (n === 'mid') return gray(k.mid);
  if (n === 'soft') return gray(k.soft);
  if (n === 'bg') return gray(k.bg);
  if (n === 'fill') return gray(k.fill);
  return gray(k.ink);
};
const ink = (k: StyleTokens) => gray(k.ink);
const LW = (k: StyleTokens) => k.lineWidths.primary;
// spring that overshoots a little and settles: 0 -> 1
export const backOut = (x: number, s = 2.2) => {
  x = clamp(x);
  const c = s + 1;
  return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
};
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
// pop in: scale with a little overshoot, then fade on out
const popIn = (t: number, at: number, dur = 0.45) => (t < at ? 0 : backOut(progress(t, at, dur)));

// ---------- the bean ----------
// Moods: each is a set of eyes, mouth, brows and extras. The storyboard only ever names the mood.
export const MOODS: Record<string, {eyes: string; mouth: string; brows?: string; extra?: string; blush?: boolean}> = {
  happy: {eyes: 'dot', mouth: 'smile'},
  grin: {eyes: 'dot', mouth: 'open'},
  joy: {eyes: 'happy', mouth: 'smile', blush: true},
  laugh: {eyes: 'happy', mouth: 'laugh', blush: true},
  wink: {eyes: 'wink', mouth: 'smile'},
  calm: {eyes: 'closed', mouth: 'small'},
  curious: {eyes: 'dot', mouth: 'small', brows: 'raised', extra: 'look'},
  thinking: {eyes: 'dot', mouth: 'side', brows: 'one', extra: 'lookup'},
  surprised: {eyes: 'wide', mouth: 'o', brows: 'raised'},
  shocked: {eyes: 'wide', mouth: 'scream', brows: 'raised', extra: 'shock'},
  worried: {eyes: 'dot', mouth: 'wavy', brows: 'worried', extra: 'sweat'},
  sad: {eyes: 'down', mouth: 'frown', brows: 'worried'},
  crying: {eyes: 'down', mouth: 'cry', brows: 'worried', extra: 'tears'},
  angry: {eyes: 'dot', mouth: 'grit', brows: 'angry', extra: 'steam'},
  determined: {eyes: 'dot', mouth: 'flat', brows: 'angry'},
  proud: {eyes: 'happy', mouth: 'smirk'},
  sleepy: {eyes: 'down', mouth: 'small', extra: 'zzz'},
  love: {eyes: 'heart', mouth: 'smile', blush: true, extra: 'hearts'},
  confused: {eyes: 'odd', mouth: 'wavy', brows: 'one', extra: 'question'},
  shy: {eyes: 'down', mouth: 'small', blush: true},
};
export const BEAN_MOODS = Object.keys(MOODS);

// Arm angles in degrees: 0 hangs straight down, positive swings out away from the body, negative swings across it.
// Each arm is [upper, lower]. The near arm is the one on the side the bean faces.
type Pose = {l: [number, number]; r: [number, number]; legs?: 'stand' | 'walk' | 'sit' | 'jump' | 'tiptoe'; tilt?: number; lean?: number};
export const POSES: Record<string, Pose> = {
  stand: {l: [12, 6], r: [12, 6]},
  wave: {l: [12, 6], r: [140, 165]},
  point: {l: [12, 6], r: [92, 90]},
  pointup: {l: [12, 6], r: [168, 180]},
  cheer: {l: [128, 172], r: [128, 172]},
  shrug: {l: [55, 140], r: [55, 140]},
  think: {l: [-25, -100], r: [-30, -165]},
  hips: {l: [48, -40], r: [48, -40], tilt: 0},
  hold: {l: [35, 95], r: [35, 95]},
  read: {l: [-15, -95], r: [-15, -95]},
  hug: {l: [-40, -110], r: [-40, -110]},
  open: {l: [70, 110], r: [70, 110]},
  highfive: {l: [12, 6], r: [150, 178]},
  facepalm: {l: [12, 6], r: [-35, -170], tilt: 4},
  sad: {l: [4, 0], r: [4, 0], tilt: 3},
  walk: {l: [12, 6], r: [12, 6], legs: 'walk'},
  run: {l: [30, 100], r: [30, 100], legs: 'walk', lean: 8},
  climb: {l: [40, 120], r: [12, 6], legs: 'walk'},
  jump: {l: [140, 160], r: [140, 160], legs: 'jump'},
  fall: {l: [120, 60], r: [150, 100], legs: 'jump', tilt: -14},
  sit: {l: [20, 40], r: [20, 40], legs: 'sit'},
  sleep: {l: [6, 0], r: [6, 0], tilt: 8},
  peek: {l: [100, 150], r: [100, 150]},
  carry: {l: [150, 175], r: [150, 175], legs: 'walk'},
  tiptoe: {l: [70, 140], r: [70, 140], legs: 'tiptoe'},
  holdhand: {l: [12, 6], r: [50, 60]},
  bothhands: {l: [50, 60], r: [50, 60]},
};
export const BEAN_POSES = Object.keys(POSES);

type Key = {t: number; x?: number; y?: number; pose?: string; mood?: string; dur?: number; hop?: number; face?: number; look?: number; talk?: boolean; view?: string};

// Where the bean is and what it is doing at time t. Keys are sorted by the validator.
const beanState = (b: Block, t: number) => {
  let x = b.x as number, y = b.y as number, face = b.face ?? 1, look = b.look ?? 0, talk = !!b.talk, view = b.view ?? 'front';
  let pose = b.pose ?? 'stand', prevPose = pose, poseT = -9;
  let mood = b.mood ?? 'happy', moodT = -9;
  let walking = false, dist = 0, hopY = 0, landT = -9;
  let fromX = x, fromY = y;
  for (const kf of (b.keys ?? []) as Key[]) {
    if (t < kf.t) break;
    const dur = kf.dur ?? (kf.x !== undefined || kf.y !== undefined ? Math.max(0.35, Math.hypot((kf.x ?? x) - x, (kf.y ?? y) - y) / 520) : 0.3);
    const p = kf.hop ? progress(t, kf.t, dur) : cubicInOut(progress(t, kf.t, dur));
    fromX = x; fromY = y;
    const tx = kf.x ?? x, ty = kf.y ?? y;
    if (kf.x !== undefined || kf.y !== undefined) {
      const moving = t < kf.t + dur;
      x = lerp(fromX, tx, p);
      y = lerp(fromY, ty, p);
      if (kf.hop) {
        hopY = moving ? -Math.sin(Math.PI * p) * kf.hop : 0;
        if (!moving) landT = kf.t + dur;
      } else {
        hopY = 0;
        if (moving) { walking = true; dist = Math.abs(x - fromX) + Math.abs(y - fromY); }
        else walking = false;
      }
      if (kf.face === undefined && tx !== fromX && moving) face = tx > fromX ? 1 : -1;
    }
    if (kf.face !== undefined) face = kf.face;
    if (kf.look !== undefined) look = kf.look;
    if (kf.talk !== undefined) talk = kf.talk;
    if (kf.view !== undefined) view = kf.view;
    if (kf.pose !== undefined && kf.pose !== pose) { prevPose = pose; pose = kf.pose; poseT = kf.t; }
    if (kf.mood !== undefined && kf.mood !== mood) { mood = kf.mood; moodT = kf.t; }
  }
  return {x, y, face, look, pose, prevPose, poseT, mood, moodT, walking, dist, hopY, landT, talk, view};
};

const armPath = (sx: number, sy: number, side: number, up: number, lo: number, L1: number, L2: number) => {
  const r = (a: number) => (a * Math.PI) / 180;
  const ex = sx + side * Math.sin(r(up)) * L1, ey = sy + Math.cos(r(up)) * L1;
  const hx = ex + side * Math.sin(r(lo)) * L2, hy = ey + Math.cos(r(lo)) * L2;
  return {d: `M${sx},${sy} Q${ex},${ey} ${hx},${hy}`, hx, hy};
};

// The face, drawn around (0, 0) = the middle between the eyes. u = body width.
const Face: React.FC<{mood: string; u: number; t: number; blink: boolean; look: number; k: StyleTokens; seed: number; talk?: string}> = ({mood, u, t, blink, look, k, seed, talk}) => {
  const m = MOODS[mood] ?? MOODS.happy;
  const c = ink(k);
  const ex = u * 0.18, er = u * 0.062, sw = u * 0.048;
  const lx = (m.extra === 'look' ? u * 0.05 : 0) + look * u * 0.06;
  const ly = m.extra === 'lookup' ? -u * 0.05 : 0;
  const my = u * 0.2;
  const eye = (side: number, kind: string) => {
    const cx = side * ex + lx, cy = ly;
    if (blink && !['happy', 'closed', 'down', 'heart'].includes(kind)) return <path key={side} d={`M${cx - er * 1.2},${cy} H${cx + er * 1.2}`} stroke={c} strokeWidth={sw} strokeLinecap="round" />;
    switch (kind) {
      case 'happy': return <path key={side} d={`M${cx - er * 1.4},${cy + er * 0.5} Q${cx},${cy - er * 1.6} ${cx + er * 1.4},${cy + er * 0.5}`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      case 'down': return <path key={side} d={`M${cx - er * 1.4},${cy - er * 0.2} Q${cx},${cy + er * 1.4} ${cx + er * 1.4},${cy - er * 0.2}`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      case 'closed': return <path key={side} d={`M${cx - er * 1.3},${cy} H${cx + er * 1.3}`} stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      case 'wide': return (
        <g key={side}>
          <circle cx={cx} cy={cy} r={er * 2} fill="#fff" stroke={c} strokeWidth={sw * 0.8} />
          <circle cx={cx + look * er * 0.6} cy={cy} r={er * 0.9} fill={c} />
        </g>
      );
      case 'heart': {
        const s = er * 2.1;
        return <path key={side} transform={`translate(${cx},${cy})`} d={`M0,${s * 0.9} C${-s * 1.6},${-s * 0.1} ${-s * 0.7},${-s * 1.3} 0,${-s * 0.35} C${s * 0.7},${-s * 1.3} ${s * 1.6},${-s * 0.1} 0,${s * 0.9} Z`} fill={col(k, 'coral', 'ink')} stroke={c} strokeWidth={sw * 0.5} strokeLinejoin="round" />;
      }
      case 'wink': return side < 0 ? eye(side, 'dot') : eye(side, 'happy');
      case 'odd': return side < 0 ? <ellipse key={side} cx={cx} cy={cy} rx={er * 1.25} ry={er * 1.45} fill={c} /> : <ellipse key={side} cx={cx} cy={cy + er * 0.2} rx={er * 0.75} ry={er * 0.85} fill={c} />;
      default: return <ellipse key={side} cx={cx} cy={cy} rx={er} ry={er * 1.25} fill={c} />;
    }
  };
  const mw = u * 0.13;
  const mouth = () => {
    const mx = lx * 0.6;
    switch (talk ?? m.mouth) {
      case 'open': return <path d={`M${mx - mw * 1.3},${my - mw * 0.2} Q${mx},${my + mw * 1.6} ${mx + mw * 1.3},${my - mw * 0.2} Z`} fill={c} stroke={c} strokeWidth={sw * 0.6} strokeLinejoin="round" />;
      case 'laugh': return (
        <g>
          <path d={`M${mx - mw * 1.5},${my - mw * 0.3} Q${mx},${my + mw * 2} ${mx + mw * 1.5},${my - mw * 0.3} Z`} fill={c} stroke={c} strokeWidth={sw * 0.6} strokeLinejoin="round" />
          <ellipse cx={mx} cy={my + mw * 0.75} rx={mw * 0.6} ry={mw * 0.32} fill={col(k, 'coral', 'ink')} />
        </g>
      );
      case 'small': return <path d={`M${mx - mw * 0.5},${my} Q${mx},${my + mw * 0.45} ${mx + mw * 0.5},${my}`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      case 'side': return <path d={`M${mx - mw * 0.2},${my + mw * 0.15} Q${mx + mw * 0.4},${my + mw * 0.3} ${mx + mw * 0.9},${my - mw * 0.1}`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      case 'smirk': return <path d={`M${mx - mw},${my} Q${mx},${my + mw * 0.7} ${mx + mw * 1.1},${my - mw * 0.35}`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      case 'o': return <ellipse cx={mx} cy={my + mw * 0.2} rx={mw * 0.42} ry={mw * 0.55} fill={c} />;
      case 'scream': return <ellipse cx={mx} cy={my + mw * 0.4} rx={mw * 0.62} ry={mw * 0.95} fill={c} />;
      case 'wavy': return <path d={`M${mx - mw},${my + mw * 0.2} q${mw * 0.33},${-mw * 0.4} ${mw * 0.66},0 q${mw * 0.33},${mw * 0.4} ${mw * 0.67},0 q${mw * 0.33},${-mw * 0.4} ${mw * 0.67},0`} fill="none" stroke={c} strokeWidth={sw * 0.85} strokeLinecap="round" />;
      case 'frown': return <path d={`M${mx - mw * 0.8},${my + mw * 0.45} Q${mx},${my - mw * 0.35} ${mx + mw * 0.8},${my + mw * 0.45}`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      case 'cry': return <path d={`M${mx - mw},${my + mw * 0.7} Q${mx},${my - mw * 0.7} ${mx + mw},${my + mw * 0.7} Z`} fill={c} stroke={c} strokeWidth={sw * 0.6} strokeLinejoin="round" />;
      case 'grit': return (
        <g>
          <rect x={mx - mw} y={my - mw * 0.25} width={mw * 2} height={mw * 0.7} rx={mw * 0.2} fill="#fff" stroke={c} strokeWidth={sw * 0.7} />
          <path d={`M${mx - mw},${my + mw * 0.1} H${mx + mw}`} stroke={c} strokeWidth={sw * 0.5} />
        </g>
      );
      case 'flat': return <path d={`M${mx - mw * 0.7},${my + mw * 0.1} H${mx + mw * 0.7}`} stroke={c} strokeWidth={sw} strokeLinecap="round" />;
      default: return <path d={`M${mx - mw},${my - mw * 0.15} Q${mx},${my + mw * 0.95} ${mx + mw},${my - mw * 0.15}`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />;
    }
  };
  const by = -er * 2.6 + ly;
  const brows = () => {
    const w = er * 1.4;
    const one = (side: number, tilt: number, lift = 0) => (
      <path key={side} d={`M${side * ex + lx - w},${by - lift + side * tilt} L${side * ex + lx + w},${by - lift - side * tilt}`} stroke={c} strokeWidth={sw * 0.9} strokeLinecap="round" />
    );
    switch (m.brows) {
      case 'raised': return [one(-1, 0, er * 0.9), one(1, 0, er * 0.9)];
      case 'worried': return [one(-1, -er * 0.55), one(1, -er * 0.55)];
      case 'angry': return [one(-1, er * 0.7), one(1, er * 0.7)];
      case 'one': return [one(-1, 0), one(1, -er * 0.3, er * 0.9)];
      default: return null;
    }
  };
  const extra = () => {
    const tt = t + seed;
    switch (m.extra) {
      case 'sweat': return <path transform={`translate(${u * 0.36},${-u * 0.08})`} d={`M0,${-er * 2} Q${er * 1.3},${er * 0.4} 0,${er * 0.9} Q${-er * 1.3},${er * 0.4} 0,${-er * 2} Z`} fill="#bfe3ef" stroke={c} strokeWidth={sw * 0.6} />;
      case 'tears': {
        const f = (tt * 1.6) % 1;
        return [-1, 1].map((s) => (
          <ellipse key={s} cx={s * (ex + er * 0.3)} cy={er * 2 + f * u * 0.35} rx={er * 0.55} ry={er * 0.8} fill="#9fd6ea" opacity={1 - f} />
        ));
      }
      case 'steam': return [-1, 1].map((s) => (
        <path key={s} transform={`translate(${s * u * 0.32},${-u * 0.42 - ((tt * 30) % 14)})`} d={`M0,0 q${s * 8},-10 0,-20 q${-s * 8},-10 0,-20`} fill="none" stroke={c} strokeWidth={sw * 0.6} strokeLinecap="round" opacity={0.8} />
      ));
      case 'zzz': return [0, 1, 2].map((i) => {
        const f = ((tt * 0.6 + i / 3) % 1);
        return <text key={i} x={u * 0.35 + f * u * 0.3} y={-u * 0.35 - f * u * 0.5} fontFamily={k.fonts.headline} fontWeight={700} fontSize={u * (0.12 + i * 0.03)} fill={c} opacity={Math.sin(Math.PI * f)}>z</text>;
      });
      case 'hearts': return [0, 1].map((i) => {
        const f = ((tt * 0.5 + i / 2) % 1), s = er * 2;
        return <path key={i} transform={`translate(${(i ? 1 : -1) * u * 0.42},${-u * 0.3 - f * u * 0.5})`} d={`M0,${s * 0.9} C${-s * 1.6},${-s * 0.1} ${-s * 0.7},${-s * 1.3} 0,${-s * 0.35} C${s * 0.7},${-s * 1.3} ${s * 1.6},${-s * 0.1} 0,${s * 0.9} Z`} fill={col(k, 'coral', 'ink')} opacity={Math.sin(Math.PI * f)} />;
      });
      case 'question': return <text x={u * 0.38} y={-u * 0.35} fontFamily={k.fonts.headline} fontWeight={700} fontSize={u * 0.32} fill={col(k, 'coral', 'ink')} transform={`rotate(${Math.sin(tt * 3) * 8},${u * 0.45},${-u * 0.45})`}>?</text>;
      case 'shock': return [-50, -20, 20, 50].map((a) => {
        const r = (a * Math.PI) / 180;
        return <path key={a} d={`M${Math.sin(r) * u * 0.55},${-u * 0.55 - Math.cos(r) * u * 0.05} l${Math.sin(r) * u * 0.12},${-Math.cos(r) * u * 0.12}`} stroke={c} strokeWidth={sw * 0.8} strokeLinecap="round" />;
      });
      default: return null;
    }
  };
  return (
    <g>
      {m.blush && [-1, 1].map((s) => <ellipse key={s} cx={s * (ex + er * 1.5)} cy={er * 2} rx={er * 1.3} ry={er * 0.7} fill={col(k, 'blush', 'coral')} opacity={0.55} />)}
      {brows()}
      {eye(-1, m.eyes)}
      {eye(1, m.eyes)}
      {mouth()}
      {extra()}
    </g>
  );
};

// Accessories sit on the body, drawn in the body's own space (feet at 0, 0; top of the head at -bodyH - legH).
const Accessory: React.FC<{kind: string; u: number; top: number; k: StyleTokens; color?: string}> = ({kind, u, top, k, color}) => {
  const c = ink(k), lw = LW(k) * 0.8;
  switch (kind) {
    case 'headband': return (
      <g>
        <path d={`M${-u * 0.5},${top + u * 0.36} Q0,${top + u * 0.28} ${u * 0.5},${top + u * 0.36}`} fill="none" stroke={col(k, color, 'coral')} strokeWidth={u * 0.11} />
        <path d={`M${u * 0.48},${top + u * 0.34} l${u * 0.2},${-u * 0.08} M${u * 0.48},${top + u * 0.36} l${u * 0.22},${u * 0.06}`} stroke={col(k, color, 'coral')} strokeWidth={u * 0.07} strokeLinecap="round" />
      </g>
    );
    case 'cap': return (
      <g>
        <path d={`M${-u * 0.42},${top + u * 0.26} Q${-u * 0.4},${top - u * 0.12} 0,${top - u * 0.12} Q${u * 0.4},${top - u * 0.12} ${u * 0.42},${top + u * 0.26} Z`} fill={col(k, color, 'coral')} stroke={c} strokeWidth={lw} strokeLinejoin="round" />
        <path d={`M${u * 0.3},${top + u * 0.24} L${u * 0.78},${top + u * 0.3}`} stroke={c} strokeWidth={lw * 1.6} strokeLinecap="round" />
      </g>
    );
    case 'glasses': return (
      <g fill="none" stroke={c} strokeWidth={lw * 0.8}>
        <circle cx={-u * 0.17} cy={top + u * 0.47} r={u * 0.13} />
        <circle cx={u * 0.17} cy={top + u * 0.47} r={u * 0.13} />
        <path d={`M${-u * 0.04},${top + u * 0.45} H${u * 0.04}`} />
      </g>
    );
    case 'crown': return <path d={`M${-u * 0.26},${top + u * 0.02} L${-u * 0.3},${top - u * 0.26} L${-u * 0.13},${top - u * 0.1} L0,${top - u * 0.32} L${u * 0.13},${top - u * 0.1} L${u * 0.3},${top - u * 0.26} L${u * 0.26},${top + u * 0.02} Z`} fill={col(k, 'yellow', 'ink')} stroke={c} strokeWidth={lw} strokeLinejoin="round" />;
    case 'grad': return (
      <g stroke={c} strokeWidth={lw} strokeLinejoin="round">
        <path d={`M${-u * 0.6},${top - u * 0.02} L0,${top - u * 0.24} L${u * 0.6},${top - u * 0.02} L0,${top + u * 0.18} Z`} fill={c} />
        <path d={`M${u * 0.42},${top + u * 0.02} V${top + u * 0.3}`} fill="none" stroke={col(k, 'yellow', 'ink')} />
      </g>
    );
    default: return null;
  }
};

export const BEAN_ITEMS = ['cane', 'book', 'flag', 'heart', 'coin', 'phone', 'bulb', 'balloon', 'trophy', 'pencil', 'star'];
// Small things a hand can hold, drawn around the hand point.
const HandItem: React.FC<{kind: string; u: number; k: StyleTokens; t: number; face: number}> = ({kind, u, k, t, face}) => {
  const c = ink(k), lw = LW(k) * 0.75;
  switch (kind) {
    case 'cane': return <path d={`M0,${u * 0.9} V${-u * 0.35} q0,${-u * 0.14} ${-face * u * 0.12},${-u * 0.14}`} fill="none" stroke={c} strokeWidth={lw * 1.1} strokeLinecap="round" />;
    case 'flag': return (
      <g>
        <path d={`M0,${u * 0.25} V${-u * 0.75}`} stroke={c} strokeWidth={lw} strokeLinecap="round" />
        <path d={`M0,${-u * 0.75} L${face * u * 0.45},${-u * 0.6 + Math.sin(t * 6) * u * 0.02} L0,${-u * 0.45} Z`} fill={col(k, 'coral', 'ink')} stroke={c} strokeWidth={lw * 0.8} strokeLinejoin="round" />
      </g>
    );
    case 'book': return (
      <g stroke={c} strokeWidth={lw * 0.8} strokeLinejoin="round">
        <path d={`M0,${-u * 0.05} L${-u * 0.32},${-u * 0.15} V${u * 0.22} L0,${u * 0.32} Z`} fill="#fff" />
        <path d={`M0,${-u * 0.05} L${u * 0.32},${-u * 0.15} V${u * 0.22} L0,${u * 0.32} Z`} fill="#fff" />
      </g>
    );
    case 'heart': { const s = u * 0.16; return <path d={`M0,${s * 0.9} C${-s * 1.6},${-s * 0.1} ${-s * 0.7},${-s * 1.3} 0,${-s * 0.35} C${s * 0.7},${-s * 1.3} ${s * 1.6},${-s * 0.1} 0,${s * 0.9} Z`} fill={col(k, 'coral', 'ink')} stroke={c} strokeWidth={lw * 0.8} />; }
    case 'coin': return (
      <g>
        <circle r={u * 0.15} fill={col(k, 'yellow', 'ink')} stroke={c} strokeWidth={lw * 0.8} />
        <text y={u * 0.06} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={u * 0.17} fill={c}>$</text>
      </g>
    );
    case 'phone': return (
      <g>
        <rect x={-u * 0.11} y={-u * 0.2} width={u * 0.22} height={u * 0.38} rx={u * 0.04} fill={c} />
        <rect x={-u * 0.08} y={-u * 0.16} width={u * 0.16} height={u * 0.28} rx={u * 0.02} fill={col(k, 'sky', 'fill')} />
      </g>
    );
    case 'bulb': return (
      <g stroke={c} strokeWidth={lw * 0.8}>
        <circle cy={-u * 0.12} r={u * 0.15} fill={col(k, 'yellow', 'ink')} />
        <rect x={-u * 0.07} y={u * 0.01} width={u * 0.14} height={u * 0.09} fill="#fff" />
      </g>
    );
    case 'balloon': return (
      <g>
        <path d={`M0,0 q${face * u * 0.06},${-u * 0.3} 0,${-u * 0.6}`} fill="none" stroke={c} strokeWidth={lw * 0.6} />
        <ellipse cy={-u * 0.82} rx={u * 0.2} ry={u * 0.25} fill={col(k, 'coral', 'ink')} stroke={c} strokeWidth={lw * 0.8} transform={`rotate(${Math.sin(t * 1.5) * 4},0,0)`} />
      </g>
    );
    case 'trophy': return (
      <g stroke={c} strokeWidth={lw * 0.8} strokeLinejoin="round">
        <path d={`M${-u * 0.16},${-u * 0.3} H${u * 0.16} Q${u * 0.16},${-u * 0.02} 0,${-u * 0.02} Q${-u * 0.16},${-u * 0.02} ${-u * 0.16},${-u * 0.3} Z`} fill={col(k, 'yellow', 'ink')} />
        <path d={`M0,${-u * 0.02} V${u * 0.08} M${-u * 0.1},${u * 0.1} H${u * 0.1}`} fill="none" />
      </g>
    );
    case 'pencil': return (
      <g stroke={c} strokeWidth={lw * 0.7} strokeLinejoin="round" transform="rotate(-30)">
        <rect x={-u * 0.04} y={-u * 0.4} width={u * 0.08} height={u * 0.38} fill={col(k, 'yellow', 'ink')} />
        <path d={`M${-u * 0.04},${-u * 0.02} L0,${u * 0.08} L${u * 0.04},${-u * 0.02} Z`} fill="#fff" />
      </g>
    );
    case 'star': return <Star r={u * 0.17} fill={col(k, 'yellow', 'ink')} k={k} />;
    default: return null;
  }
};

const Star: React.FC<{r: number; fill: string; k: StyleTokens}> = ({r, fill, k}) => {
  const pts = Array.from({length: 10}, (_, i) => {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
  });
  return <polygon points={pts.join(' ')} fill={fill} stroke={ink(k)} strokeWidth={LW(k) * 0.7} strokeLinejoin="round" />;
};

export const BeanBlock: React.FC<P> = ({b, t, k}) => {
  const st = beanState(b, t);
  const story = React.useContext(StoryContext);
  const size = (b.size ?? 300) as number;
  const bd = BUILDS[b.build ?? 'bean'] ?? BUILDS.bean;
  const u = size * bd.w; // body width
  const legH = size * 0.065 * bd.leg;
  const bodyH = size - legH;
  const lw = LW(k) * (b.small ? 0.7 : 1);
  const c = ink(k);
  const fill = col(k, b.color, 'teal');
  const seed = hash(b.x, b.y, size) * 10;
  // entrance
  const enter = b.enter ?? 'pop';
  const at = b.at ?? 0;
  let sIn = 1, dyIn = 0, opIn = 1;
  if (enter === 'pop') sIn = popIn(t, at, 0.5);
  if (enter === 'drop') { const p = progress(t, at, 0.45); dyIn = -900 * (1 - p * p); if (p >= 1) sIn = 1; }
  if (enter === 'rise') { const p = quintOut(progress(t, at, 0.55)); dyIn = (1 - p) * size * 1.2; }
  if (enter === 'fade') opIn = progress(t, at, 0.35);
  const out = b.out !== undefined ? 1 - progress(t, b.out, 0.25) : 1;
  if (out <= 0) return null;
  // squash and stretch: after a pop, a drop or a hop landing
  const landAt = enter === 'drop' ? at + 0.45 : st.landT;
  const sinceLand = t - Math.max(landAt, enter === 'pop' ? at + 0.2 : -9);
  const squash = sinceLand >= 0 && sinceLand < 0.5 ? Math.sin(sinceLand * 18) * Math.exp(-sinceLand * 7) * 0.16 : 0;
  const airStretch = st.hopY < 0 ? 0.06 : 0;
  // breathing: a very slow small swell, the only movement at rest
  const breathe = b.breathe === false ? 0 : Math.sin((t + seed) * 2.1) * 0.012;
  const sy = 1 + breathe - squash + airStretch;
  const sx = 1 - breathe * 0.5 + squash * 0.8 - airStretch * 0.6;
  // blink every few seconds, and on every mood change
  const bi = Math.floor((t + seed) / 3.3);
  const blinkAt = bi * 3.3 + hash(bi, seed) * 1.6;
  const blink = (t + seed > blinkAt && t + seed < blinkAt + 0.12) || (t > st.moodT && t < st.moodT + 0.1);
  // pose: blend arm angles from the last pose to the new one
  const pp = cubicInOut(progress(t, st.poseT, 0.28));
  const A = POSES[st.prevPose] ?? POSES.stand, B = POSES[st.pose] ?? POSES.stand;
  const mix = (a: [number, number], b2: [number, number]): [number, number] => [lerp(a[0], b2[0], pp), lerp(a[1], b2[1], pp)];
  let L = mix(A.l, B.l), R = mix(A.r, B.r);
  const tilt = lerp(A.tilt ?? 0, B.tilt ?? 0, pp) + (st.walking ? lerp(0, B.lean ?? 3, 1) : 0) + (bd.stoop ?? 0);
  const pose = st.pose;
  // pose life: waving, walking arm swing, fall flailing
  if (pose === 'wave') R = [R[0], R[1] + Math.sin((t - st.poseT) * 11) * 26];
  if (pose === 'cheer') { const w = Math.sin((t - st.poseT) * 8) * 8; L = [L[0] + w, L[1]]; R = [R[0] - w, R[1]]; }
  if (pose === 'fall') { const w = Math.sin((t - st.poseT) * 16) * 20; L = [L[0] + w, L[1] - w]; R = [R[0] - w, R[1] + w]; }
  const legs = B.legs ?? 'stand';
  const phase = st.walking ? st.dist / (size * 0.18) : 0;
  if (st.walking && (pose === 'stand' || pose === 'walk')) { const s = Math.sin(phase) * 22; L = [L[0] + s, L[1] + s * 0.4]; R = [R[0] - s, R[1] - s * 0.4]; }
  const bob = st.walking ? -Math.abs(Math.sin(phase)) * size * 0.03 : 0;
  // body geometry, feet at (0, 0)
  const top = -legH - bodyH;
  const bodyD = `M${-u / 2},${-legH - u / 2} V${top + u / 2} A${u / 2},${u / 2} 0 0 1 ${u / 2},${top + u / 2} V${-legH - u / 2} A${u / 2},${u / 2} 0 0 1 ${-u / 2},${-legH - u / 2} Z`;
  // legs
  const legW = u * 0.1;
  const leg = (side: number) => {
    const bx = side * u * 0.2;
    let a = 0, len = legH + u * 0.06;
    if (legs === 'walk' && st.walking) a = Math.sin(phase + (side > 0 ? Math.PI : 0)) * 28;
    if (legs === 'jump' || st.hopY < 0) a = side * 18;
    if (legs === 'tiptoe') len *= 1.25;
    if (legs === 'sit') return <path key={side} d={`M${bx},${-legH - u * 0.05} q0,${legH * 0.5} ${st.face * u * 0.32},${legH * 0.5}`} fill="none" stroke={c} strokeWidth={legW} strokeLinecap="round" />;
    const r = (a * Math.PI) / 180;
    return <path key={side} d={`M${bx},${-legH - u * 0.06} l${Math.sin(r) * len},${Math.cos(r) * len} l${st.face * u * 0.06},0`} fill="none" stroke={c} strokeWidth={legW} strokeLinecap="round" strokeLinejoin="round" />;
  };
  const shoulderY = top + bodyH * 0.58;
  const L1 = size * 0.15, L2 = size * 0.13;
  // the near arm (facing side) is the "right" arm of the pose
  const near = armPath(st.face * u * 0.47, shoulderY, st.face, R[0], R[1], L1, L2);
  const far = armPath(-st.face * u * 0.47, shoulderY, -st.face, L[0], L[1], L1, L2);
  const armW = lw * 0.9;
  const handR = lw * 1.25;
  const sitDy = legs === 'sit' ? legH * 0.6 : 0;
  const shadowS = 1 + st.hopY / 600;
  // side view while walking (or when asked), lip sync while a word is spoken
  const side = st.view === 'side' || (st.walking && st.view !== 'front-only' && b.view !== 'front');
  const speaking = st.talk && (story.speech ?? []).some(([a2, z]) => t >= a2 && t <= z);
  const talkMouth = speaking ? ['open', 'small', 'o', 'open', 'flat'][Math.floor((t + seed) * 11) % 5] : undefined;
  const hands = {near: [near.hx, near.hy], far: [far.hx, far.hy]};
  return (
    <g opacity={out * opIn} transform={`translate(${st.x},${st.y + dyIn})`}>
      {b.shadow !== false && <ellipse cx={0} cy={4} rx={u * 0.6 * sIn * shadowS} ry={u * 0.09 * sIn * shadowS} fill={c} opacity={0.08} />}
      <g transform={`translate(0,${st.hopY + bob + sitDy}) scale(${sIn}) rotate(${tilt * st.face}) scale(${sx},${sy})`}>
        {legs !== 'sit' && [leg(-1), leg(1)]}
        <path d={far.d} fill="none" stroke={c} strokeWidth={armW} strokeLinecap="round" />
        <circle cx={far.hx} cy={far.hy} r={handR} fill={c} />
        <path d={bodyD} fill={fill} stroke={c} strokeWidth={lw} strokeLinejoin="round" />
        {/* soft highlight down the lit side, like the reference's flat cel shading */}
        <path d={`M${-u * 0.3},${top + u * 0.42} V${-legH - u * 0.55}`} stroke="#fff" strokeOpacity={0.18} strokeWidth={u * 0.09} strokeLinecap="round" />
        {legs === 'sit' && [leg(-1), leg(1)]}
        <g transform={`translate(${st.face * u * (side ? 0.2 : 0.04)},${top + u * 0.42 + u * bd.faceY}) scale(${side ? 0.78 : 1},1)`}>
          <Face mood={st.mood} u={u * bd.face} t={t} blink={blink} look={st.look * st.face + (side ? st.face * 0.6 : 0)} k={k} seed={seed} talk={talkMouth} />
        </g>
        {b.hair && <Hair kind={b.hair} u={u} top={top} k={k} face={st.face} color={b.hairColor} />}
        {(b.wear ? [].concat(b.wear) : []).map((w: string) => <Accessory key={w} kind={w} u={u} top={top} k={k} color={b.wearColor} />)}
        <path d={near.d} fill="none" stroke={c} strokeWidth={armW} strokeLinecap="round" />
        {b.hold && <g transform={`translate(${near.hx},${near.hy})`}><HandItem kind={b.hold} u={u} k={k} t={t} face={st.face} /></g>}
        <circle cx={near.hx} cy={near.hy} r={handR} fill={c} />
        {(b.spots ?? []).map((sp: any, i: number) => <Spot key={i} sp={sp} t={t} k={k} at={partAt(sp.part, sp.side ?? 1, u, top, bodyH, legH, st.face, hands)} u={u} />)}
        {(b.pains ?? []).map((pn: any, i: number) => <Pain key={i} pn={pn} t={t} k={k} a={partAt(pn.from, pn.fromSide ?? 1, u, top, bodyH, legH, st.face, hands)} z={partAt(pn.to, pn.toSide ?? 1, u, top, bodyH, legH, st.face, hands)} />)}
      </g>
    </g>
  );
};

// ---------- body builds, hair, pointing at the body ----------
export const BUILDS: Record<string, {w: number; leg: number; face: number; faceY: number; stoop?: number}> = {
  bean: {w: 0.5, leg: 1, face: 1, faceY: 0},
  round: {w: 0.66, leg: 0.9, face: 1, faceY: 0.02},
  tall: {w: 0.4, leg: 1.2, face: 0.95, faceY: -0.02},
  kid: {w: 0.56, leg: 0.8, face: 1.22, faceY: 0.1},
  elder: {w: 0.5, leg: 1, face: 0.95, faceY: 0.04, stoop: 5},
};
export const BEAN_HAIR = ['tuft', 'bow', 'curl', 'bun', 'sprout', 'grey', 'pony'];
const Hair: React.FC<{kind: string; u: number; top: number; k: StyleTokens; face: number; color?: string}> = ({kind, u, top, k, face, color}) => {
  const c = ink(k), lw = LW(k);
  const hc = col(k, color, kind === 'grey' ? 'white' : 'ink');
  switch (kind) {
    case 'tuft': return <path d={`M${-u * 0.08},${top + u * 0.02} q${-u * 0.02},${-u * 0.2} ${-u * 0.14},${-u * 0.24} M0,${top} q${u * 0.02},${-u * 0.22} ${u * 0.1},${-u * 0.28} M${u * 0.08},${top + u * 0.02} q${u * 0.08},${-u * 0.14} ${u * 0.2},${-u * 0.16}`} fill="none" stroke={c} strokeWidth={lw * 0.9} strokeLinecap="round" />;
    case 'sprout': return (
      <g stroke={c} strokeWidth={lw * 0.8} strokeLinejoin="round">
        <path d={`M0,${top + u * 0.01} V${top - u * 0.18}`} fill="none" />
        <path d={`M0,${top - u * 0.16} q${-u * 0.22},${-u * 0.02} ${-u * 0.24},${-u * 0.18} q${u * 0.2},${-u * 0.02} ${u * 0.24},${u * 0.18}`} fill={col(k, 'green', 'teal')} />
        <path d={`M0,${top - u * 0.16} q${u * 0.22},${-u * 0.02} ${u * 0.24},${-u * 0.18} q${-u * 0.2},${-u * 0.02} ${-u * 0.24},${u * 0.18}`} fill={col(k, 'green', 'teal')} />
      </g>
    );
    case 'bow': return (
      <g transform={`translate(${-face * u * 0.26},${top + u * 0.08}) rotate(${-face * 20})`} stroke={c} strokeWidth={lw * 0.8} strokeLinejoin="round">
        <path d={`M0,0 L${-u * 0.2},${-u * 0.12} V${u * 0.12} Z M0,0 L${u * 0.2},${-u * 0.12} V${u * 0.12} Z`} fill={col(k, color, 'coral')} />
        <circle r={u * 0.05} fill={col(k, color, 'coral')} />
      </g>
    );
    case 'curl': return <path d={`M0,${top + u * 0.01} q${u * 0.02},${-u * 0.16} ${u * 0.14},${-u * 0.14} q${u * 0.1},${u * 0.04} ${u * 0.02},${u * 0.1} q${-u * 0.06},${u * 0.01} ${-u * 0.04},${-u * 0.06}`} fill="none" stroke={c} strokeWidth={lw * 0.9} strokeLinecap="round" />;
    case 'bun': return <circle cx={0} cy={top - u * 0.08} r={u * 0.15} fill={hc} stroke={c} strokeWidth={lw} />;
    case 'pony': return <path d={`M${-face * u * 0.45},${top + u * 0.35} q${-face * u * 0.3},${u * 0.05} ${-face * u * 0.22},${u * 0.45} q${-face * u * 0.05},${-u * 0.25} ${face * u * 0.04},${-u * 0.38} Z`} fill={hc} stroke={c} strokeWidth={lw * 0.9} strokeLinejoin="round" />;
    case 'grey': return [-1, 1].map((sd) => (
      <g key={sd} fill="#fff" stroke={c} strokeWidth={lw * 0.7}>
        <circle cx={sd * u * 0.47} cy={top + u * 0.4} r={u * 0.1} />
        <circle cx={sd * u * 0.42} cy={top + u * 0.25} r={u * 0.11} />
        <circle cx={sd * u * 0.3} cy={top + u * 0.12} r={u * 0.09} />
      </g>
    ));
    default: return null;
  }
};

export const BODY_PARTS = ['head', 'temple', 'eye', 'jaw', 'neck', 'shoulder', 'chest', 'heart', 'belly', 'back', 'hip', 'arm', 'hand', 'knee', 'foot'];
// A point on the bean's body, in its own space (feet at 0, 0). side is the screen side, 1 right, minus 1 left.
const partAt = (part: string, side: number, u: number, top: number, bodyH: number, legH: number, face: number, hands: {near: number[]; far: number[]}): [number, number] => {
  const handOn = side === face ? hands.near : hands.far;
  switch (part) {
    case 'head': return [0, top + u * 0.12];
    case 'temple': return [side * u * 0.4, top + u * 0.36];
    case 'eye': return [side * u * 0.18, top + u * 0.42];
    case 'jaw': return [side * u * 0.3, top + u * 0.66];
    case 'neck': return [side * u * 0.28, top + u * 0.86];
    case 'shoulder': return [side * u * 0.4, top + bodyH * 0.52];
    case 'chest': return [side * u * 0.12, top + bodyH * 0.62];
    case 'heart': return [-face * u * 0.14, top + bodyH * 0.6];
    case 'belly': return [0, top + bodyH * 0.78];
    case 'back': return [-face * u * 0.44, top + bodyH * 0.66];
    case 'hip': return [side * u * 0.36, top + bodyH * 0.9];
    case 'arm': return [(side * u * 0.47 + handOn[0]) / 2, (top + bodyH * 0.58 + handOn[1]) / 2];
    case 'hand': return [handOn[0], handOn[1]];
    case 'knee': return [side * u * 0.2, -legH * 0.6];
    case 'foot': return [side * u * 0.24, -legH * 0.1];
    default: return [0, top + bodyH * 0.6];
  }
};
// A glowing spot that pulses on a body part: pain, tension, a muscle, where to look.
const Spot: React.FC<{sp: any; t: number; k: StyleTokens; at: [number, number]; u: number}> = ({sp, t, k, at, u}) => {
  if (t < sp.at || (sp.out !== undefined && t > sp.out + 0.3)) return null;
  const op = sp.out !== undefined ? 1 - progress(t, sp.out, 0.3) : 1;
  const e = t - sp.at, r = u * (sp.r ?? 0.11);
  const p = backOut(progress(t, sp.at, 0.35));
  const ring = (e * 1.3) % 1;
  const c = col(k, sp.color, 'coral');
  return (
    <g opacity={op} transform={`translate(${at[0]},${at[1]})`}>
      <circle r={r * (1 + ring * 1.4)} fill="none" stroke={c} strokeWidth={LW(k) * 0.7} opacity={1 - ring} />
      <circle r={r * p * (1 + Math.sin(e * 7) * 0.08)} fill={c} opacity={0.9} stroke={ink(k)} strokeWidth={LW(k) * 0.5} />
    </g>
  );
};
// A zigzag of pain that runs from one body part to another, like a nerve or a pull.
const Pain: React.FC<{pn: any; t: number; k: StyleTokens; a: [number, number]; z: [number, number]}> = ({pn, t, k, a, z}) => {
  if (t < pn.at || (pn.out !== undefined && t > pn.out + 0.3)) return null;
  const op = pn.out !== undefined ? 1 - progress(t, pn.out, 0.3) : 1;
  const p = cubicInOut(progress(t, pn.at, pn.dur ?? 0.6));
  const n = 7, dx = z[0] - a[0], dy = z[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len, amp = Math.min(22, len * 0.12);
  const pts = Array.from({length: n + 1}, (_, i) => {
    const f = i / n, w = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * amp;
    return `${(a[0] + dx * f + nx * w).toFixed(1)},${(a[1] + dy * f + ny * w).toFixed(1)}`;
  });
  const flick = 0.75 + 0.25 * Math.sin((t - pn.at) * 20);
  return (
    <g opacity={op}>
      <polyline points={pts.join(' ')} fill="none" stroke={col(k, pn.color, 'coral')} strokeWidth={LW(k) * 1.1} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={`${p} 1`} opacity={flick} />
      {p >= 1 && <circle cx={z[0]} cy={z[1]} r={LW(k) * 2.2} fill={col(k, pn.color, 'coral')} stroke={ink(k)} strokeWidth={LW(k) * 0.5} />}
    </g>
  );
};

// ---------- headline with a short underline and a small line under it ----------
export const BeanTitle: React.FC<P> = ({b, t, k}) => {
  const {width: W} = useVideoConfig();
  const size = b.size ?? 76;
  const align = b.align ?? 'left';
  const x = b.x ?? (align === 'center' ? W / 2 : align === 'right' ? W - k.margins : k.margins);
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const lines: string[] = b.lines ?? [b.text];
  const op = outFade(t, b.out, 0.3);
  const lh = size * 1.15;
  const underline = b.underline ?? align !== 'center';
  const last = b.y + (lines.length - 1) * lh;
  const ulP = cubicInOut(progress(t, b.at + 0.25 + lines.length * 0.08, 0.4));
  const ulW = b.underlineWidth ?? size * 1.5;
  const ulX = align === 'center' ? x - ulW / 2 : align === 'right' ? x - ulW : x;
  const subP = quintOut(progress(t, b.at + 0.4, 0.45));
  return (
    <g opacity={op}>
      {lines.map((s, i) => {
        const words = s.split(' ');
        let n = 0;
        return (
          <text key={i} x={x} y={b.y + i * lh} textAnchor={anchor} fontFamily={k.fonts.headline} fontWeight={700} fontSize={size} letterSpacing={size * -0.01} fill={col(k, b.color, 'ink')}>
            {words.map((w, j) => {
              const p = backOut(progress(t, b.at + (i * words.length + j) * 0.07, 0.35), 1.6);
              n++;
              return (
                <tspan key={j} opacity={clamp(p * 1.5)} dy={j === 0 ? 0 : undefined}>
                  {(j ? ' ' : '') + w}
                </tspan>
              );
            })}
          </text>
        );
      })}
      {underline && <rect x={ulX} y={last + size * 0.3} width={ulW * ulP} height={size * 0.085} rx={size * 0.04} fill={col(k, b.underlineColor, 'coral')} />}
      {b.sub && (
        <text x={x} y={last + size * (underline ? 0.95 : 0.75) + 10 * (1 - subP)} opacity={subP} textAnchor={anchor} fontFamily={k.fonts.ui} fontWeight={500} fontSize={b.subSize ?? size * 0.36} fill={col(k, 'mid', 'mid')}>
          {b.sub}
        </text>
      )}
    </g>
  );
};

// ---------- badges: a tilted tag (NEW), a pill button (SUBSCRIBE), a round number with a word under it ----------
export const BeanBadge: React.FC<P> = ({b, t, k}) => {
  const s = popIn(t, b.at, 0.45);
  if (s <= 0) return null;
  const op = outFade(t, b.out);
  const c = ink(k);
  const kind = b.kind ?? 'tag';
  const size = b.size ?? 40;
  const text = String(b.text ?? '');
  const tw = text.length * size * 0.68 + size * 1.1;
  let body: React.ReactNode = null;
  if (kind === 'tag') body = (
    <g transform={`rotate(${b.rotate ?? 14})`}>
      <rect x={-tw / 2} y={-size * 0.8} width={tw} height={size * 1.6} rx={size * 0.8} fill={col(k, b.color, 'yellow')} stroke={c} strokeWidth={LW(k) * 0.7} />
      <text y={size * 0.36} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={size} fill={c}>{text}</text>
    </g>
  );
  if (kind === 'pill') {
    const pulse = 1 + Math.max(0, Math.sin((t - b.at - 0.6) * 5)) * 0.04 * (t > b.at + 0.6 ? 1 : 0);
    body = (
      <g transform={`scale(${pulse})`}>
        <rect x={-tw / 2} y={-size * 0.75} width={tw} height={size * 1.5} rx={size * 0.75} fill={col(k, b.color, 'coral')} />
        <text y={size * 0.34} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={size} fill="#fff" letterSpacing={size * 0.04}>{text.toUpperCase()}</text>
      </g>
    );
  }
  if (kind === 'number') body = (
    <g>
      <circle r={size * 1.45} fill={col(k, b.color, 'ink')} />
      <text y={size * 0.62} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={size * 1.8} fill={col(k, 'bg', 'bg')}>{text}</text>
      {b.label && <text y={size * 2.45} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={size * 0.6} fill={c} letterSpacing={size * 0.04}>{String(b.label).toUpperCase()}</text>}
    </g>
  );
  return <g opacity={op} transform={`translate(${b.x},${b.y}) scale(${s})`}>{body}</g>;
};

// ---------- scenarios: the flat props and places a bean acts in ----------
export const BEAN_PROPS = ['ground', 'disc', 'network', 'stairs', 'sunburst', 'book', 'bubble', 'podium', 'finish', 'mountain', 'phone', 'laptop', 'desk', 'bulb', 'clock', 'calendar', 'heart', 'coins', 'chart', 'cloud', 'plant', 'door', 'signpost', 'magnifier', 'trophy', 'arrow', 'sparks', 'star', 'check', 'cross', 'crowd', 'gift', 'rocket', 'house', 'bed', 'scale', 'puzzle', 'target', 'battery', 'shield', 'chain', 'cup'];

export const BeanProp: React.FC<P> = ({b, t, k}) => {
  const {width: W} = useVideoConfig();
  const at = b.at ?? 0;
  if (t < at) return null;
  const op = outFade(t, b.out, 0.3);
  if (op <= 0) return null;
  const c = ink(k), lw = LW(k);
  const s = b.size ?? 1; // scale for the drawing
  const x = b.x ?? W / 2, y = b.y ?? 960;
  const fill = (n: string) => col(k, b.color, n);
  const e = t - at; // seconds since it came in
  const pop = popIn(t, at, 0.5);
  const S: React.SVGProps<SVGPathElement> = {stroke: c, strokeWidth: lw, strokeLinejoin: 'round', strokeLinecap: 'round'};
  const wrap = (node: React.ReactNode, scale = pop) => <g opacity={op} transform={`translate(${x},${y}) scale(${s * scale})`}>{node}</g>;
  const heartD = (r: number) => `M0,${r * 0.95} C${-r * 1.7},${-r * 0.1} ${-r * 0.75},${-r * 1.35} 0,${-r * 0.38} C${r * 0.75},${-r * 1.35} ${r * 1.7},${-r * 0.1} 0,${r * 0.95} Z`;
  switch (b.kind) {
    case 'ground': {
      const w = b.width ?? W, p = cubicInOut(progress(t, at, 0.6));
      return <path opacity={op} d={`M${x - (w / 2) * p},${y} H${x + (w / 2) * p}`} stroke={c} strokeWidth={lw * 0.8} strokeLinecap="round" />;
    }
    case 'disc': return wrap(<circle r={b.r ?? 240} fill={fill('disc')} />, quintOut(progress(t, at, 0.6)));
    case 'network': {
      const N: [number, number][] = [[-150, -90], [-40, -150], [80, -110], [150, -10], [60, 60], [-70, 30], [-170, 50], [180, 120]];
      const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 5], [2, 4], [5, 6], [3, 7]];
      const lit = b.litAt ?? at + 1.2; // the new link
      const lp = cubicInOut(progress(t, lit, 0.6));
      return wrap(
        <g>
          {links.map(([a, z], i) => {
            const p = cubicInOut(progress(t, at + i * 0.08, 0.35));
            return <path key={i} d={`M${N[a][0]},${N[a][1]} L${lerp(N[a][0], N[z][0], p)},${lerp(N[a][1], N[z][1], p)}`} stroke={c} strokeWidth={lw * 0.6} />;
          })}
          <path d={`M${N[6][0]},${N[6][1]} Q-150,140 ${N[4][0]},${N[4][1]}`} fill="none" stroke={col(k, 'coral', 'ink')} strokeWidth={lw * 0.7} strokeDasharray="4 12" strokeLinecap="round" opacity={1 - lp} />
          <path d={`M${N[6][0]},${N[6][1]} L${lerp(N[6][0], N[3][0], lp)},${lerp(N[6][1], N[3][1] + 80, lp)}`} stroke={col(k, 'coral', 'ink')} strokeWidth={lw * 1.2} strokeLinecap="round" opacity={t >= lit ? 1 : 0} />
          {N.map(([nx, ny], i) => {
            const red = t >= lit && (i === 6 || i === 7);
            return <circle key={i} cx={nx} cy={ny} r={red ? 20 : 15} fill={red ? col(k, 'coral', 'ink') : '#fff'} stroke={c} strokeWidth={lw * 0.6} transform={`scale(${popIn(t, at + i * 0.06, 0.4)})`} style={{transformOrigin: `${nx}px ${ny}px`, transformBox: 'view-box'}} />;
          })}
        </g>,
        1,
      );
    }
    case 'stairs': {
      const n = b.steps ?? 5, sw = b.stepW ?? 105, sh = b.stepH ?? 95;
      const ramp = ['#cdeee6', '#9fe0d2', '#6fd0bf', '#3fbfa9', '#22a892', '#178f7c', '#0f7a69'];
      return (
        <g opacity={op} transform={`translate(${x},${y}) scale(${s})`}>
          {Array.from({length: n}, (_, i) => {
            const p = backOut(progress(t, at + i * 0.15, 0.4), 1.4);
            const h = sh * (i + 1) * p;
            return (
              <g key={i}>
                <rect x={i * sw} y={-h} width={sw} height={h} fill={ramp[Math.round((i / Math.max(1, n - 1)) * (ramp.length - 1))]} stroke={c} strokeWidth={lw * 0.8} />
                {p > 0.6 && <text x={i * sw + sw / 2} y={-h + sh * 0.48} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={sh * 0.38} fill={c} opacity={clamp((p - 0.6) * 3)}>{i + 1}</text>}
              </g>
            );
          })}
          {b.flag !== false && (() => {
            const fp = popIn(t, at + n * 0.15 + 0.2, 0.4);
            const fx = (n - 0.5) * sw, fy = -sh * n;
            return (
              <g transform={`translate(${fx},${fy}) scale(${fp})`}>
                <path d={`M0,0 V${-sh * 1.6}`} stroke={c} strokeWidth={lw * 0.8} />
                <path d={`M0,${-sh * 1.6} L${sw * 0.6},${-sh * 1.45 + Math.sin(e * 5) * 4} L0,${-sh * 1.25} Z`} fill={col(k, 'coral', 'ink')} stroke={c} strokeWidth={lw * 0.6} strokeLinejoin="round" />
              </g>
            );
          })()}
        </g>
      );
    }
    case 'sunburst': {
      const r = b.r ?? 160;
      const rp = cubicInOut(progress(t, at + 0.25, 0.5));
      const pulse = 1 + Math.sin(e * 3) * 0.04;
      return wrap(
        <g>
          {Array.from({length: 10}, (_, i) => {
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const r1 = r * 1.35 * pulse, r2 = r1 + r * 0.32 * rp;
            return <path key={i} d={`M${Math.cos(a) * r1},${Math.sin(a) * r1} L${Math.cos(a) * r2},${Math.sin(a) * r2}`} stroke={c} strokeWidth={lw * 0.8} strokeLinecap="round" />;
          })}
          <circle r={r} fill={fill('yellow')} />
        </g>,
      );
    }
    case 'book': {
      const w = 180, h = 150, op2 = cubicInOut(progress(t, at + 0.15, 0.4));
      const page = (side: number) => (
        <g>
          <path d={`M0,${-h / 2 + 10} Q${side * w * 0.5},${-h / 2 - 12} ${side * w},${-h / 2} V${h / 2} Q${side * w * 0.5},${h / 2 - 14} 0,${h / 2 + 8} Z`} fill="#fff" {...S} />
          {[0, 1, 2].map((i) => <path key={i} d={`M${side * w * 0.2},${-h / 2 + 40 + i * 28} H${side * w * (0.2 + 0.6 * op2)}`} stroke={col(k, 'soft', 'soft')} strokeWidth={lw * 0.9} strokeLinecap="round" />)}
        </g>
      );
      return wrap(<g>{page(-1)}{page(1)}</g>);
    }
    case 'bubble': {
      const w = b.w ?? 170, h = b.h ?? 120, tail = b.tail ?? -1;
      const text = b.text ?? '?';
      const think = b.style === 'thought';
      const bubbleFill = col(k, b.color, think ? 'fill' : 'coral');
      const tc = think ? c : '#fff';
      return wrap(
        <g>
          {think ? (
            <>
              <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} fill={bubbleFill} {...S} />
              <circle cx={tail * w * 0.42} cy={h * 0.62} r={14} fill={bubbleFill} {...S} />
              <circle cx={tail * w * 0.56} cy={h * 0.88} r={8} fill={bubbleFill} {...S} />
            </>
          ) : (
            <path d={`M${-w / 2 + 20},${-h / 2} H${w / 2 - 20} Q${w / 2},${-h / 2} ${w / 2},${-h / 2 + 20} V${h / 2 - 20} Q${w / 2},${h / 2} ${w / 2 - 20},${h / 2} H${tail * -w * 0.1} L${tail * w * 0.4},${h / 2 + 40} L${tail * w * 0.15},${h / 2} H${-w / 2 + 20} Q${-w / 2},${h / 2} ${-w / 2},${h / 2 - 20} V${-h / 2 + 20} Q${-w / 2},${-h / 2} ${-w / 2 + 20},${-h / 2} Z`} fill={bubbleFill} {...S} />
          )}
          {b.icon === 'heart' ? <path d={heartD(26)} fill={think ? col(k, 'coral', 'ink') : '#fff'} /> : b.icon === 'bulb' ? <g transform="translate(0,6)"><circle cy={-10} r={24} fill={col(k, 'yellow', 'ink')} stroke={c} strokeWidth={lw * 0.6} /><rect x={-11} y={10} width={22} height={14} fill="#fff" stroke={c} strokeWidth={lw * 0.6} /></g> : (
            <text y={String(text).length > 2 ? 12 : 22} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={String(text).length > 2 ? Math.min(44, (w * 1.6) / String(text).length) : 70} fill={tc}>{text}</text>
          )}
        </g>,
      );
    }
    case 'podium': {
      const blocks: [number, number, string][] = [[-160, 120, '2'], [0, 180, '1'], [160, 80, '3']];
      return wrap(
        <g>
          {blocks.map(([bx, bh, n], i) => {
            const p = backOut(progress(t, at + i * 0.12, 0.4), 1.3);
            return (
              <g key={i}>
                <rect x={bx - 80} y={-bh * p} width={160} height={bh * p} fill={['#9fe0d2', '#3fbfa9', '#cdeee6'][i]} {...S} />
                <text x={bx} y={-bh * p + 55} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={46} fill={c} opacity={p}>{n}</text>
              </g>
            );
          })}
        </g>,
        1,
      );
    }
    case 'finish': {
      const w = b.width ?? 420, snap = b.snapAt;
      const broken = snap !== undefined && t >= snap;
      const sp = broken ? quintOut(progress(t, snap, 0.5)) : 0;
      const post = (side: number) => (
        <g transform={`translate(${side * w / 2},0)`}>
          <rect x={-10} y={-260} width={20} height={260} fill="#fff" {...S} />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={-10} y={-260 + i * 30} width={20} height={15} fill={c} />)}
        </g>
      );
      return wrap(
        <g>
          {post(-1)}
          {post(1)}
          {!broken && <path d={`M${-w / 2},-150 Q0,-140 ${w / 2},-150`} fill="none" stroke={col(k, 'coral', 'ink')} strokeWidth={lw * 1.4} />}
          {broken && [-1, 1].map((side) => <path key={side} d={`M${side * w / 2},-150 Q${side * w * 0.35},${-150 + 60 * sp} ${side * w * (0.1 + 0.2 * sp)},${-120 + 100 * sp}`} fill="none" stroke={col(k, 'coral', 'ink')} strokeWidth={lw * 1.4} strokeLinecap="round" />)}
        </g>,
        1,
      );
    }
    case 'mountain': {
      const fp = popIn(t, at + 0.5, 0.4);
      return wrap(
        <g>
          <path d="M-320,0 L-60,-380 L40,-250 L120,-330 L320,0 Z" fill={fill('mint')} {...S} />
          <path d="M-132,-275 L-60,-380 L12,-285 L-30,-300 L-70,-268 Z" fill="#fff" {...S} />
          <g transform={`translate(-60,-380) scale(${fp})`}>
            <path d="M0,0 V-110" {...S} />
            <path d={`M0,-110 L60,${-96 + Math.sin(e * 5) * 4} L0,-80 Z`} fill={col(k, 'coral', 'ink')} {...S} />
          </g>
        </g>,
      );
    }
    case 'phone': return wrap(
      <g>
        <rect x={-95} y={-170} width={190} height={340} rx={30} fill={c} />
        <rect x={-80} y={-148} width={160} height={290} rx={16} fill={col(k, 'fill', 'fill')} />
        {[0, 1, 2].map((i) => {
          const p = popIn(t, at + 0.3 + i * 0.25, 0.35);
          return (
            <g key={i} transform={`translate(0,${-100 + i * 80}) scale(${p})`}>
              <rect x={-62} y={-26} width={124} height={52} rx={14} fill={['#cdeee6', '#fde8c4', '#fbd5cf'][i]} />
              <circle cx={-36} cy={0} r={14} fill={[col(k, 'teal', 'ink'), col(k, 'yellow', 'ink'), col(k, 'coral', 'ink')][i]} />
              <path d="M-12,-6 H44 M-12,8 H24" stroke={col(k, 'soft', 'soft')} strokeWidth={6} strokeLinecap="round" />
            </g>
          );
        })}
      </g>,
    );
    case 'laptop': return wrap(
      <g>
        <rect x={-170} y={-230} width={340} height={220} rx={16} fill={c} />
        <rect x={-150} y={-212} width={300} height={184} rx={8} fill={col(k, 'fill', 'fill')} />
        {[0, 1, 2].map((i) => <path key={i} d={`M-120,${-170 + i * 45} H${-120 + 220 * cubicInOut(progress(t, at + 0.3 + i * 0.2, 0.4)) * [1, 0.7, 0.85][i]}`} stroke={[col(k, 'teal', 'ink'), col(k, 'soft', 'soft'), col(k, 'coral', 'ink')][i]} strokeWidth={14} strokeLinecap="round" />)}
        <path d="M-210,-10 H210 L190,14 H-190 Z" fill="#fff" {...S} />
      </g>,
    );
    case 'desk': return wrap(
      <g>
        <rect x={-240} y={-190} width={480} height={30} rx={6} fill={fill('wood')} {...S} />
        <path d="M-210,-160 V0 M210,-160 V0" {...S} />
      </g>,
      1,
    );
    case 'bulb': {
      const lit = b.litAt === undefined || t >= b.litAt;
      const lp = lit ? quintOut(progress(t, b.litAt ?? at, 0.3)) : 0;
      return wrap(
        <g>
          {Array.from({length: 8}, (_, i) => {
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r1 = 105, r2 = 105 + 45 * lp;
            return <path key={i} d={`M${Math.cos(a) * r1},${Math.sin(a) * r1 - 20} L${Math.cos(a) * r2},${Math.sin(a) * r2 - 20}`} {...S} opacity={lp} />;
          })}
          <path d="M-70,-20 A80,80 0 1 1 70,-20 Q45,20 42,60 H-42 Q-45,20 -70,-20 Z" fill={lit ? col(k, 'yellow', 'ink') : '#fff'} {...S} />
          <rect x={-42} y={60} width={84} height={40} rx={8} fill={col(k, 'soft', 'soft')} {...S} />
        </g>,
      );
    }
    case 'clock': {
      const spin = b.spin ?? 1;
      const a1 = e * 360 * 0.6 * spin, a2 = e * 360 * 0.05 * spin + 60;
      return wrap(
        <g>
          <circle r={130} fill="#fff" {...S} />
          {Array.from({length: 12}, (_, i) => <path key={i} d="M0,-112 V-96" {...S} strokeWidth={lw * 0.6} transform={`rotate(${i * 30})`} />)}
          <path d="M0,0 V-90" {...S} transform={`rotate(${a1})`} />
          <path d="M0,0 V-60" {...S} strokeWidth={lw * 1.3} transform={`rotate(${a2})`} />
          <circle r={10} fill={col(k, 'coral', 'ink')} />
        </g>,
      );
    }
    case 'calendar': {
      const marks = b.marks ?? 0;
      return wrap(
        <g>
          <rect x={-150} y={-150} width={300} height={290} rx={20} fill="#fff" {...S} />
          <path d="M-150,-90 H150 V-130 Q150,-150 130,-150 H-130 Q-150,-150 -150,-130 Z" fill={col(k, 'coral', 'ink')} {...S} />
          {Array.from({length: 12}, (_, i) => {
            const cx = -100 + (i % 4) * 66, cy = -40 + Math.floor(i / 4) * 62;
            const done = i < marks && t >= at + 0.4 + i * (b.every ?? 0.15);
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={18} fill={col(k, 'disc', 'soft')} />
                {done && <path d={`M${cx - 12},${cy} l8,9 l16,-18`} fill="none" stroke={col(k, 'teal', 'ink')} strokeWidth={lw * 0.9} strokeLinecap="round" strokeLinejoin="round" />}
              </g>
            );
          })}
        </g>,
      );
    }
    case 'heart': {
      const beat = 1 + Math.max(0, Math.sin(e * 6)) * 0.06;
      return wrap(<path d={heartD(110)} fill={fill('coral')} {...S} transform={`scale(${beat})`} />);
    }
    case 'coins': {
      const n = b.count ?? 5;
      return wrap(
        <g>
          {Array.from({length: n}, (_, i) => {
            const p = clamp(progress(t, at + i * 0.12, 0.3));
            const dy = -(1 - p * p) * 400;
            return (
              <g key={i} transform={`translate(0,${-i * 34 + dy})`} opacity={p > 0 ? 1 : 0}>
                <ellipse cx={0} cy={0} rx={90} ry={26} fill={fill('yellow')} {...S} />
                <path d="M-90,0 V-14 M90,0 V-14" {...S} />
                <ellipse cx={0} cy={-14} rx={90} ry={26} fill={fill('yellow')} {...S} />
              </g>
            );
          })}
        </g>,
        1,
      );
    }
    case 'chart': {
      const down = b.dir === 'down';
      const v = down ? [5, 4, 3, 1.5] : [1.5, 2.5, 3.5, 5];
      const ap = cubicInOut(progress(t, at + 0.8, 0.6));
      const pts = v.map((h, i): [number, number] => [-150 + i * 100 + 35, -h * 60 - 40]);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
      return wrap(
        <g>
          <path d="M-190,0 H230" {...S} />
          {v.map((h, i) => {
            const p = backOut(progress(t, at + i * 0.12, 0.4), 1.3);
            return <rect key={i} x={-150 + i * 100} y={-h * 60 * p} width={70} height={h * 60 * p} fill={['#cdeee6', '#9fe0d2', '#3fbfa9', '#178f7c'][down ? 3 - i : i]} {...S} />;
          })}
          <path d={line} fill="none" stroke={col(k, 'coral', 'ink')} strokeWidth={lw * 1.1} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${ap} 1`} />
        </g>,
        1,
      );
    }
    case 'cloud': {
      const rain = b.rain !== false;
      return wrap(
        <g>
          {rain && Array.from({length: 6}, (_, i) => {
            const f = ((e * 1.4 + hash(i, 9)) % 1);
            const dx = -100 + i * 40;
            return <path key={i} d={`M${dx},${60 + f * 200} l-6,22`} stroke={col(k, 'sky', 'mid')} strokeWidth={lw * 0.8} strokeLinecap="round" opacity={1 - f} />;
          })}
          <path d="M-140,50 Q-170,50 -170,15 Q-170,-25 -125,-30 Q-115,-90 -50,-90 Q0,-120 45,-80 Q120,-95 135,-30 Q175,-20 170,20 Q168,50 135,50 Z" fill={b.color ? fill('fill') : col(k, 'soft', 'soft')} {...S} />
        </g>,
      );
    }
    case 'plant': {
      const g = cubicInOut(progress(t, b.growAt ?? at + 0.3, b.growDur ?? 1.6));
      const h = 60 + 260 * g;
      return (
        <g opacity={op} transform={`translate(${x},${y}) scale(${s})`}>
          <path d={`M-70,0 L-55,-90 H55 L70,0 Z`} fill={fill('coral')} {...S} />
          <path d={`M0,-90 V${-90 - h}`} {...S} strokeWidth={lw * (1 + g)} />
          <path d={`M0,${-90 - h * 0.45} q-60,-10 -70,-60 q55,0 70,60`} fill={col(k, 'teal', 'ink')} {...S} transform={`scale(${clamp(g * 2)})`} style={{transformOrigin: `0px ${-90 - h * 0.45}px`, transformBox: 'view-box'}} />
          <path d={`M0,${-90 - h * 0.65} q60,-10 70,-60 q-55,0 -70,60`} fill={col(k, 'teal', 'ink')} {...S} />
          {g > 0.6 && <circle cx={0} cy={-90 - h} r={110 * (g - 0.6) / 0.4} fill={col(k, 'mint', 'ink')} {...S} />}
        </g>
      );
    }
    case 'door': {
      const o = b.openAt !== undefined ? cubicInOut(progress(t, b.openAt, 0.6)) : 0;
      return wrap(
        <g>
          <rect x={-110} y={-330} width={220} height={330} fill={col(k, 'sun', 'yellow')} {...S} />
          <path d={`M-110,-330 L${-110 + 220 * (1 - 0.75 * o)},${-330 - 30 * o} V${-30 * o} L-110,0 Z`} fill={fill('teal')} {...S} />
          <circle cx={-110 + 190 * (1 - 0.75 * o)} cy={-160} r={10} fill={c} opacity={1 - o * 0.6} />
        </g>,
        1,
      );
    }
    case 'signpost': {
      const a: string = b.text ?? '', z: string = b.text2 ?? '';
      return wrap(
        <g>
          <path d="M0,0 V-360" {...S} strokeWidth={lw * 1.5} />
          <g transform={`rotate(${Math.sin(e * 2) * 1.5},0,-300)`}>
            <path d="M-10,-330 H190 L230,-295 L190,-260 H-10 Z" fill={col(k, 'teal', 'ink')} {...S} />
            <text x={90} y={-282} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={32} fill="#fff">{a}</text>
          </g>
          {z && (
            <g>
              <path d="M10,-240 H-190 L-230,-205 L-190,-170 H10 Z" fill={col(k, 'coral', 'ink')} {...S} />
              <text x={-90} y={-192} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={32} fill="#fff">{z}</text>
            </g>
          )}
        </g>,
      );
    }
    case 'magnifier': return wrap(
      <g transform={`rotate(${Math.sin(e * 1.5) * 6}) translate(${Math.sin(e * 1.1) * 12},0)`}>
        <path d="M60,60 L150,150" {...S} strokeWidth={lw * 3} />
        <circle r={90} fill="#eaf6f8" {...S} />
        <path d="M-50,-30 A60,60 0 0 1 -20,-60" fill="none" stroke="#fff" strokeWidth={lw * 1.5} strokeLinecap="round" />
      </g>,
    );
    case 'trophy': return wrap(
      <g>
        <path d="M-90,-260 H90 Q90,-130 0,-110 Q-90,-130 -90,-260 Z" fill={fill('yellow')} {...S} />
        <path d="M-90,-230 Q-150,-230 -130,-170 Q-115,-140 -80,-150 M90,-230 Q150,-230 130,-170 Q115,-140 80,-150" fill="none" {...S} />
        <path d="M-18,-110 H18 V-50 H-18 Z" fill={fill('yellow')} {...S} />
        <rect x={-70} y={-50} width={140} height={50} rx={6} fill={c} />
        <Star r={34} fill="#fff" k={k} />
      </g>,
    );
    case 'arrow': {
      const p = cubicInOut(progress(t, at, b.dur ?? 0.6));
      const d: string = b.d ?? 'M-150,40 Q0,-120 150,0';
      return (
        <g opacity={op} transform={`translate(${x},${y}) scale(${s})`}>
          <path d={d} fill="none" stroke={col(k, b.color, 'coral')} strokeWidth={lw * 1.2} strokeLinecap="round" pathLength={1} strokeDasharray={`${p} 1`} />
          {p >= 1 && (b.head ?? true) && <path d={`M${(b.headAt ?? [150, 0])[0]},${(b.headAt ?? [150, 0])[1]} l-38,-14 m38,14 l-24,32`} transform={`rotate(${b.headRot ?? 15},${(b.headAt ?? [150, 0])[0]},${(b.headAt ?? [150, 0])[1]})`} fill="none" stroke={col(k, b.color, 'coral')} strokeWidth={lw * 1.2} strokeLinecap="round" />}
        </g>
      );
    }
    case 'sparks': {
      const p = quintOut(progress(t, at, 0.4)), f = 1 - progress(t, at + 0.8, 0.4);
      const r = b.r ?? 120;
      return (
        <g opacity={op * f} transform={`translate(${x},${y}) scale(${s})`}>
          {Array.from({length: 7}, (_, i) => {
            const a = (-150 + i * 20) * Math.PI / 180;
            return <path key={i} d={`M${Math.cos(a) * r * (0.6 + 0.3 * p)},${Math.sin(a) * r * (0.6 + 0.3 * p)} L${Math.cos(a) * r * (0.75 + 0.5 * p)},${Math.sin(a) * r * (0.75 + 0.5 * p)}`} {...S} />;
          })}
        </g>
      );
    }
    case 'star': return wrap(<g transform={`rotate(${Math.sin(e * 2) * 6})`}><Star r={90} fill={fill('yellow')} k={k} /></g>);
    case 'check': return wrap(
      <g>
        <circle r={90} fill={fill('teal')} {...S} />
        <path d="M-40,0 L-10,32 L45,-30" fill="none" stroke="#fff" strokeWidth={lw * 2.2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${cubicInOut(progress(t, at + 0.25, 0.35))} 1`} />
      </g>,
    );
    case 'cross': return wrap(
      <g>
        <circle r={90} fill={fill('coral')} {...S} />
        <path d="M-32,-32 L32,32 M32,-32 L-32,32" stroke="#fff" strokeWidth={lw * 2.2} strokeLinecap="round" />
      </g>,
    );
    case 'crowd': {
      // a line of small plain beans, smallest first, like a queue behind the hero
      const n = b.count ?? 5;
      return (
        <g opacity={op}>
          {Array.from({length: n}, (_, i) => {
            const sz = (b.from ?? 90) + i * (b.grow ?? 18);
            const bx = x + i * (b.gap ?? 70) + i * i * 2;
            return <BeanBlock key={i} b={{type: 'bean', at: at + i * 0.08, x: bx, y, size: sz, color: b.color ?? 'cream', mood: hash(i, 4) > 0.5 ? 'happy' : 'calm', breathe: true, small: true}} t={t} k={k} />;
          })}
        </g>
      );
    }
    case 'gift': {
      const o = b.openAt !== undefined ? quintOut(progress(t, b.openAt, 0.5)) : 0;
      return wrap(
        <g>
          <rect x={-110} y={-170} width={220} height={170} fill={fill('coral')} {...S} />
          <rect x={-18} y={-170} width={36} height={170} fill={col(k, 'yellow', 'ink')} {...S} />
          <g transform={`translate(${o * 90},${-o * 160}) rotate(${o * 25})`}>
            <rect x={-125} y={-215} width={250} height={50} fill={fill('coral')} {...S} />
            <rect x={-18} y={-215} width={36} height={50} fill={col(k, 'yellow', 'ink')} {...S} />
            <path d="M0,-215 q-60,-60 -70,-10 q10,15 70,10 q60,5 70,-10 q-10,-50 -70,10" fill={col(k, 'yellow', 'ink')} {...S} />
          </g>
          {o > 0 && <g opacity={o}><Star r={40} fill={col(k, 'yellow', 'ink')} k={k} /></g>}
        </g>,
        1,
      );
    }
    case 'rocket': {
      const lift = b.launchAt !== undefined ? Math.pow(Math.max(0, t - b.launchAt), 2) * 500 : 0;
      return wrap(
        <g transform={`translate(0,${-lift})`}>
          {(b.launchAt === undefined || t >= b.launchAt) && <path d={`M-30,120 Q0,${200 + Math.sin(e * 30) * 20} 30,120 Z`} fill={col(k, 'yellow', 'ink')} {...S} />}
          <path d="M-60,120 L-100,160 V90 L-60,40 Z M60,120 L100,160 V90 L60,40 Z" fill={fill('coral')} {...S} />
          <path d="M0,-170 Q80,-80 60,120 H-60 Q-80,-80 0,-170 Z" fill="#fff" {...S} />
          <circle cy={-30} r={30} fill={col(k, 'sky', 'teal')} {...S} />
        </g>,
      );
    }
    case 'house': return wrap(
      <g>
        <rect x={-150} y={-200} width={300} height={200} fill="#fff" {...S} />
        <path d="M-180,-190 L0,-330 L180,-190 Z" fill={fill('coral')} {...S} />
        <rect x={-40} y={-110} width={80} height={110} fill={col(k, 'teal', 'ink')} {...S} />
        <rect x={60} y={-160} width={60} height={60} fill={col(k, 'yellow', 'ink')} {...S} />
      </g>,
    );
    case 'bed': return wrap(
      <g>
        <path d="M-220,0 V-200 M220,0 V-110" {...S} strokeWidth={lw * 1.4} />
        <rect x={-220} y={-110} width={440} height={60} fill={fill('wood')} {...S} />
        <rect x={-200} y={-160} width={110} height={50} rx={22} fill="#fff" {...S} />
        <path d="M-80,-110 Q-60,-170 0,-160 H220 V-110 Z" fill={col(k, 'teal', 'ink')} {...S} />
      </g>,
      1,
    );
    case 'scale': {
      const tip = (b.tip ?? 0) * cubicInOut(progress(t, b.tipAt ?? at + 0.5, 0.6)) * 14;
      const pan = (side: number) => {
        const py = Math.sin((tip * Math.PI) / 180) * 170 * side;
        return (
          <g transform={`translate(${side * 170},${-260 + py})`}>
            <path d="M0,0 L-60,90 M0,0 L60,90" {...S} strokeWidth={lw * 0.6} />
            <path d="M-80,90 H80 Q70,130 0,130 Q-70,130 -80,90 Z" fill={side < 0 ? col(k, 'teal', 'ink') : col(k, 'coral', 'ink')} {...S} />
          </g>
        );
      };
      return wrap(
        <g>
          <path d="M0,0 V-270 M-80,0 H80" {...S} strokeWidth={lw * 1.4} />
          <path d={`M-170,-260 L170,-260`} {...S} transform={`rotate(${tip},0,-260)`} />
          {pan(-1)}
          {pan(1)}
        </g>,
      );
    }
    case 'puzzle': {
      const p = cubicInOut(progress(t, b.joinAt ?? at + 0.6, 0.5));
      return wrap(
        <g>
          <path d="M-150,-75 H0 V-25 q30,0 30,25 q0,25 -30,25 V75 H-150 Z" fill={col(k, 'teal', 'ink')} {...S} />
          <path d="M0,-75 H150 V75 H0 V25 q30,0 30,-25 q0,-25 -30,-25 Z" transform={`translate(${(1 - p) * 110},${(1 - p) * -60}) rotate(${(1 - p) * 12})`} fill={col(k, 'yellow', 'ink')} {...S} />
        </g>,
      );
    }
    case 'target': {
      const hit = b.hitAt !== undefined ? progress(t, b.hitAt - 0.3, 0.3) : 1;
      return wrap(
        <g>
          {[130, 90, 50].map((r, i) => <circle key={r} r={r} fill={i % 2 ? '#fff' : fill('coral')} {...S} />)}
          <g transform={`translate(${(1 - hit) * 400},${-(1 - hit) * 200})`} opacity={hit > 0 ? 1 : 0}>
            <path d="M0,0 L150,-75" {...S} strokeWidth={lw * 1.2} />
            <path d="M150,-75 l20,-30 m-20,30 l35,0" {...S} />
          </g>
        </g>,
      );
    }
    case 'battery': {
      const lvl = b.level ?? 1;
      const fp = cubicInOut(progress(t, at + 0.3, 1.2)) * lvl;
      return wrap(
        <g>
          <rect x={-140} y={-70} width={280} height={140} rx={20} fill="#fff" {...S} />
          <rect x={140} y={-30} width={22} height={60} rx={6} fill={c} />
          <rect x={-124} y={-54} width={248 * fp} height={108} rx={10} fill={fp < 0.3 ? col(k, 'coral', 'ink') : col(k, 'teal', 'ink')} />
        </g>,
      );
    }
    case 'shield': return wrap(
      <g>
        <path d="M0,-150 L120,-110 V-10 Q120,90 0,150 Q-120,90 -120,-10 V-110 Z" fill={fill('teal')} {...S} />
        <path d="M-40,0 L-10,32 L45,-30" fill="none" stroke="#fff" strokeWidth={lw * 2} strokeLinecap="round" strokeLinejoin="round" />
      </g>,
    );
    case 'chain': {
      const br = b.breakAt !== undefined ? quintOut(progress(t, b.breakAt, 0.5)) : 0;
      return wrap(
        <g>
          {[-2, -1, 0, 1, 2].map((i) => {
            const off = i === 0 ? 0 : Math.sign(i) * br * 60;
            return <rect key={i} x={i * 90 - 60 + off} y={-30 - (i === 0 ? br * 60 : 0)} width={120} height={60} rx={30} fill="none" {...S} strokeWidth={lw * 1.4} transform={i === 0 ? `rotate(${br * 40},${i * 90},0)` : undefined} />;
          })}
        </g>,
      );
    }
    case 'cup': return wrap(
      <g>
        {[0, 1, 2].map((i) => <path key={i} d={`M${-40 + i * 40},-150 q-14,-25 0,-50 q14,-25 0,-50`} fill="none" {...S} opacity={0.4 + 0.6 * Math.abs(Math.sin(e * 2 + i))} />)}
        <path d="M-100,-130 H100 L85,0 H-85 Z" fill={fill('coral')} {...S} />
        <path d="M100,-110 q60,0 50,45 q-8,30 -58,30" fill="none" {...S} />
      </g>,
    );
    default:
      return null;
  }
};

// ---------- draw anything: a new object in the house look, drawn by Claude in the storyboard ----------
// storyboard "drawings": {name: {parts: [{d, fill, line, width, text, x, y, size}]}} on a sheet about 200 by 200 around 0, 0.
// Every part gets the same navy outline as the rest of the style; line parts are open strokes; fills are palette names.
export const DRAW_ANIMS = ['none', 'bob', 'spin', 'pulse', 'shake', 'sway', 'float'];
export const BeanDraw: React.FC<P> = ({b, t, k}) => {
  const def = b.drawing ?? b.drawings?.[b.draw];
  if (!def) return null;
  const at = b.at ?? 0;
  if (t < at) return null;
  const op = outFade(t, b.out, 0.3);
  if (op <= 0) return null;
  const s = b.size ?? 1, e = t - at;
  const enter = b.enter ?? 'pop';
  const sc = enter === 'pop' ? backOut(progress(t, at, 0.5)) : 1;
  const dp = enter === 'draw' ? cubicInOut(progress(t, at, b.dur ?? 0.9)) : 1; // strokes draw on, then fills come up
  const fp = enter === 'draw' ? progress(t, at + (b.dur ?? 0.9) * 0.6, 0.35) : 1;
  const a = b.anim ?? 'none';
  const anim = a === 'bob' ? `translate(0,${Math.sin(e * 3) * 8})` : a === 'float' ? `translate(${Math.sin(e * 0.9) * 6},${Math.sin(e * 1.4) * 10})` : a === 'spin' ? `rotate(${e * 90})` : a === 'pulse' ? `scale(${1 + Math.max(0, Math.sin(e * 5)) * 0.06})` : a === 'shake' ? `rotate(${Math.sin(e * 28) * 4 * Math.exp(-((e % 1.5) * 3))})` : a === 'sway' ? `rotate(${Math.sin(e * 2) * 6})` : '';
  const lw = LW(k);
  // keys move it: {t, x, y, dur}
  let x = b.x ?? 540, y = b.y ?? 960;
  for (const kf of b.keys ?? []) {
    if (t < kf.t) break;
    const p = cubicInOut(progress(t, kf.t, kf.dur ?? 0.6));
    x = lerp(x, kf.x ?? x, p); y = lerp(y, kf.y ?? y, p);
  }
  return (
    <g opacity={op} transform={`translate(${x},${y}) scale(${s * sc}) rotate(${b.rotate ?? 0}) ${anim} ${b.flip ? 'scale(-1,1)' : ''}`}>
      {(def.parts ?? []).map((pt: any, i: number) => {
        if (pt.text !== undefined) return <text key={i} x={pt.x ?? 0} y={pt.y ?? 0} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={pt.size ?? 40} fill={col(k, pt.fill, 'ink')} opacity={fp}>{pt.text}</text>;
        const line = pt.line || pt.fill === 'none' || pt.fill === undefined;
        return (
          <path key={i} d={pt.d} fill={line ? 'none' : col(k, pt.fill, 'fill')} fillOpacity={line ? 0 : fp} stroke={pt.outline === false ? 'none' : col(k, pt.stroke, 'ink')} strokeWidth={(pt.width ?? 1) * lw / (s || 1)} strokeLinejoin="round" strokeLinecap="round" pathLength={dp < 1 ? 1 : undefined} strokeDasharray={dp < 1 ? `${dp} 1` : undefined} />
        );
      })}
    </g>
  );
};

// ---------- information layouts: list, compare, myth and fact, counter, percent, pie, timeline, quote ----------
// rough width of Poppins Bold at a size, to wrap text without measuring
const wrap = (text: string, size: number, maxW: number): string[] => {
  const words = String(text ?? '').split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length * size * 0.56 > maxW && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
};
const TL: React.FC<{lines: string[]; x: number; y: number; size: number; fill: string; k: StyleTokens; anchor?: 'start' | 'middle' | 'end'; weight?: number; font?: string}> = ({lines, x, y, size, fill, k, anchor = 'start', weight = 700, font}) => (
  <text x={x} y={y} textAnchor={anchor} fontFamily={font ?? k.fonts.headline} fontWeight={weight} fontSize={size} fill={fill}>
    {lines.map((l, i) => <tspan key={i} x={x} dy={i ? size * 1.18 : 0}>{l}</tspan>)}
  </text>
);
export const INFO_KINDS = ['list', 'compare', 'myth', 'counter', 'percent', 'pie', 'timeline', 'quote'];
const RAMP = ['teal', 'yellow', 'coral', 'mint', 'purple', 'sky'];
export const BeanInfo: React.FC<P> = ({b, t, k}) => {
  const {width: W} = useVideoConfig();
  const at = b.at ?? 0;
  if (t < at) return null;
  const op = outFade(t, b.out, 0.3);
  if (op <= 0) return null;
  const c = ink(k), lw = LW(k);
  const x = b.x ?? k.margins, y = b.y ?? 600;
  const w = b.w ?? W - k.margins * 2;
  const size = b.textSize ?? 44;
  const card = (cx: number, cy: number, cw: number, ch: number, fill: string, p: number, key?: any) => (
    <rect key={key} x={cx} y={cy} width={cw} height={ch} rx={26} fill={fill} stroke={c} strokeWidth={lw * 0.8} transform={`translate(${cx + cw / 2},${cy + ch / 2}) scale(${p}) translate(${-cx - cw / 2},${-cy - ch / 2})`} />
  );
  switch (b.kind) {
    case 'list': {
      const items: any[] = b.items ?? [];
      let cy = y;
      return (
        <g opacity={op}>
          {items.map((it, i) => {
            const ia = it.at ?? at + i * 0.5;
            const p = backOut(progress(t, ia, 0.4));
            const lines = wrap(it.text, size, w - 130);
            const h = Math.max(96, lines.length * size * 1.18 + 44);
            const top = cy;
            cy += h + 22;
            if (t < ia) return null;
            const done = it.doneAt !== undefined && t >= it.doneAt;
            return (
              <g key={i} opacity={clamp(p * 1.4)} transform={`translate(${(1 - p) * -40},0)`}>
                {card(x, top, w, h, '#fff', 1)}
                <circle cx={x + 52} cy={top + h / 2} r={30} fill={col(k, it.color, RAMP[i % 3])} stroke={c} strokeWidth={lw * 0.7} />
                {done
                  ? <path d={`M${x + 38},${top + h / 2} l10,11 l20,-22`} fill="none" stroke="#fff" strokeWidth={lw * 1.1} strokeLinecap="round" strokeLinejoin="round" />
                  : <text x={x + 52} y={top + h / 2 + 12} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={34} fill={c}>{b.bullets === false ? '' : it.icon ?? i + 1}</text>}
                <TL lines={lines} x={x + 105} y={top + h / 2 - ((lines.length - 1) * size * 1.18) / 2 + size * 0.36} size={size} fill={c} k={k} />
              </g>
            );
          })}
        </g>
      );
    }
    case 'compare': case 'myth': {
      const myth = b.kind === 'myth';
      const L = b.left ?? (myth ? {title: 'Myth', text: b.myth, at: b.mythAt ?? at} : {});
      const Rr = b.right ?? (myth ? {title: 'Fact', text: b.fact, at: b.factAt ?? at + 1} : {});
      const vertical = b.layout === 'stack' || (b.layout === undefined && W < 1200);
      const gap = 40, cw = vertical ? w : (w - gap) / 2, ch = b.h ?? (vertical ? 300 : 420);
      const side = (it: any, i: number) => {
        const ia = it.at ?? at + i * 0.6;
        if (t < ia) return null;
        const p = backOut(progress(t, ia, 0.45));
        const cx = vertical ? x : x + i * (cw + gap), cy = vertical ? y + i * (ch + gap) : y;
        const tone = col(k, it.color, myth ? (i ? 'teal' : 'coral') : i ? 'teal' : 'coral');
        const tp = progress(t, ia + 0.25, 0.3);
        const markDone = myth && (i ? true : t >= (b.crossAt ?? Rr.at ?? ia + 1));
        return (
          <g key={i}>
            {card(cx, cy, cw, ch, '#fff', p)}
            <rect x={cx} y={cy} width={cw} height={78} rx={26} fill={tone} opacity={p > 0.95 ? 1 : 0} />
            <rect x={cx} y={cy + 52} width={cw} height={26} fill={tone} opacity={p > 0.95 ? 1 : 0} />
            <text x={cx + 32} y={cy + 54} fontFamily={k.fonts.headline} fontWeight={700} fontSize={38} fill="#fff" opacity={tp}>{String(it.title ?? '').toUpperCase()}</text>
            {myth && markDone && (i
              ? <path d={`M${cx + cw - 70},${cy + 40} l12,13 l24,-26`} fill="none" stroke="#fff" strokeWidth={lw * 1.1} strokeLinecap="round" strokeLinejoin="round" />
              : <path d={`M${cx + cw - 66},${cy + 26} l26,26 m0,-26 l-26,26`} stroke="#fff" strokeWidth={lw * 1.1} strokeLinecap="round" />)}
            <g opacity={tp}>
              <TL lines={wrap(it.text, size, cw - 64)} x={cx + 32} y={cy + 78 + size * 1.5} size={size} fill={c} k={k} />
            </g>
            {myth && !i && markDone && wrap(it.text, size, cw - 64).map((ln, li) => {
              const ly = cy + 78 + size * 1.5 + li * size * 1.18 - size * 0.32;
              return <path key={li} d={`M${cx + 26},${ly} H${cx + 38 + ln.length * size * 0.56}`} stroke={col(k, 'coral', 'ink')} strokeWidth={lw * 0.9} strokeLinecap="round" pathLength={1} strokeDasharray={`${cubicInOut(progress(t, (b.crossAt ?? Rr.at ?? ia + 1) + li * 0.15, 0.3))} 1`} />;
            })}
          </g>
        );
      };
      const bp = popIn(t, Math.max(L.at ?? at, Rr.at ?? at) + 0.2, 0.4);
      const badge = b.badge ?? (myth ? null : 'vs');
      const bx = vertical ? x + w / 2 : x + cw + gap / 2, by = vertical ? y + ch + gap / 2 : y + ch / 2;
      return (
        <g opacity={op}>
          {side(L, 0)}
          {side(Rr, 1)}
          {badge && (
            <g transform={`translate(${bx},${by}) scale(${bp})`}>
              <circle r={44} fill={col(k, 'yellow', 'ink')} stroke={c} strokeWidth={lw * 0.8} />
              {badge === 'arrow'
                ? <path d={vertical ? 'M0,-18 V18 M-14,4 L0,18 L14,4' : 'M-18,0 H18 M4,-14 L18,0 L4,14'} fill="none" stroke={c} strokeWidth={lw} strokeLinecap="round" strokeLinejoin="round" />
                : <text y={12} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={32} fill={c}>{badge === 'vs' ? 'VS' : badge}</text>}
            </g>
          )}
        </g>
      );
    }
    case 'counter': {
      const p = 1 - Math.pow(1 - progress(t, at, b.dur ?? 1.4), 3);
      const from = b.from ?? 0, to = b.to ?? 100;
      const v = from + (to - from) * p;
      const dec = b.decimals ?? (Number.isInteger(to) ? 0 : 1);
      const big = b.size ?? 200;
      const cx = b.x ?? W / 2;
      const done = p >= 1 ? backOut(progress(t, at + (b.dur ?? 1.4), 0.3)) : 0;
      return (
        <g opacity={op}>
          <text x={cx} y={y} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={big * (1 + 0.06 * Math.sin(Math.PI * done))} fill={col(k, b.color, 'ink')}>
            {(b.prefix ?? '') + v.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec}) + (b.suffix ?? '')}
          </text>
          <rect x={cx - big * 0.5 * p} y={y + big * 0.28} width={big * p} height={big * 0.06} rx={big * 0.03} fill={col(k, 'coral', 'ink')} />
          {b.label && <TL lines={wrap(b.label, size * 0.8, w)} x={cx} y={y + big * 0.28 + size * 1.4} size={size * 0.8} fill={col(k, 'mid', 'mid')} k={k} anchor="middle" weight={500} font={k.fonts.ui} />}
        </g>
      );
    }
    case 'percent': {
      const v = clamp((b.value ?? 50) / 100);
      const p = cubicInOut(progress(t, at + 0.2, b.dur ?? 1.1)) * v;
      const h = b.h ?? 70;
      return (
        <g opacity={op}>
          {b.label && <TL lines={wrap(b.label, size, w - 200)} x={x} y={y - 28} size={size} fill={c} k={k} />}
          <text x={x + w} y={y - 28} textAnchor="end" fontFamily={k.fonts.headline} fontWeight={700} fontSize={size * 1.2} fill={col(k, b.color, 'coral')}>{Math.round(p * 100)}%</text>
          <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#fff" stroke={c} strokeWidth={lw * 0.8} />
          {p > 0.005 && <rect x={x + 8} y={y + 8} width={Math.max(h - 16, (w - 16) * p)} height={h - 16} rx={(h - 16) / 2} fill={col(k, b.color, 'teal')} />}
        </g>
      );
    }
    case 'pie': {
      const parts: any[] = b.parts ?? [];
      const total = parts.reduce((n, p2) => n + (p2.value ?? 0), 0) || 1;
      const r = b.r ?? 220, cx = b.x ?? W / 2;
      let a0 = -Math.PI / 2;
      const sw = r * 0.42;
      return (
        <g opacity={op}>
          {parts.map((pt, i) => {
            const pa = pt.at ?? at + i * 0.4;
            const share = (pt.value ?? 0) / total;
            const p = cubicInOut(progress(t, pa, 0.6));
            const a1 = a0 + share * Math.PI * 2 * p;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const rr = r - sw / 2;
            const d = `M${cx + Math.cos(a0) * rr},${y + Math.sin(a0) * rr} A${rr},${rr} 0 ${large} 1 ${cx + Math.cos(a1) * rr},${y + Math.sin(a1) * rr}`;
            const mid = a0 + share * Math.PI;
            a0 += share * Math.PI * 2;
            if (t < pa) return null;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={col(k, pt.color, RAMP[i % RAMP.length])} strokeWidth={sw} />
                {pt.label && p >= 1 && <text x={cx + Math.cos(mid) * (r + 70)} y={y + Math.sin(mid) * (r + 70) + 14} textAnchor={Math.cos(mid) > 0.2 ? 'start' : Math.cos(mid) < -0.2 ? 'end' : 'middle'} fontFamily={k.fonts.headline} fontWeight={700} fontSize={size * 0.8} fill={c}>{pt.label}</text>}
              </g>
            );
          })}
          <circle cx={cx} cy={y} r={r} fill="none" stroke={c} strokeWidth={lw * 0.8} />
          <circle cx={cx} cy={y} r={r - sw} fill="#fff" stroke={c} strokeWidth={lw * 0.8} />
          {b.center && <text x={cx} y={y + size * 0.45} textAnchor="middle" fontFamily={k.fonts.headline} fontWeight={700} fontSize={size * 1.3} fill={c} opacity={progress(t, at + 0.3, 0.3)}>{b.center}</text>}
        </g>
      );
    }
    case 'timeline': {
      const pts: any[] = b.points ?? [];
      const n = Math.max(1, pts.length - 1);
      const vertical = b.layout === 'vertical';
      const len = vertical ? b.h ?? 900 : w;
      const lp = cubicInOut(progress(t, at, 0.6));
      return (
        <g opacity={op}>
          <path d={vertical ? `M${x},${y} V${y + len * lp}` : `M${x},${y} H${x + len * lp}`} stroke={c} strokeWidth={lw} strokeLinecap="round" />
          {pts.map((pt, i) => {
            const pa = pt.at ?? at + 0.3 + i * 0.5;
            if (t < pa) return null;
            const p = backOut(progress(t, pa, 0.4));
            const px = vertical ? x : x + (len * i) / n, py = vertical ? y + (len * i) / n : y;
            const above = !vertical && i % 2 === 0;
            return (
              <g key={i}>
                <circle cx={px} cy={py} r={22 * p} fill={col(k, pt.color, RAMP[i % 3])} stroke={c} strokeWidth={lw * 0.7} />
                {vertical
                  ? <TL lines={wrap(pt.text, size * 0.85, w - 80)} x={px + 50} y={py + size * 0.3} size={size * 0.85} fill={c} k={k} />
                  : <TL lines={wrap(pt.text, size * 0.75, Math.max(160, len / n - 10))} x={px} y={above ? py - 50 - (wrap(pt.text, size * 0.75, Math.max(160, len / n - 10)).length - 1) * size * 0.88 : py + 70} size={size * 0.75} fill={c} k={k} anchor="middle" />}
              </g>
            );
          })}
        </g>
      );
    }
    case 'quote': {
      const p = backOut(progress(t, at, 0.45));
      const lines = wrap(b.text, size * 1.1, w - 190);
      const h = lines.length * size * 1.3 + (b.by ? 110 : 60) + 40;
      return (
        <g opacity={op}>
          {card(x, y, w, h, '#fff', p)}
          <text x={x + 34} y={y + 150} fontFamily={k.fonts.headline} fontWeight={700} fontSize={160} fill={col(k, b.color, 'coral')} opacity={clamp(p)}>{'“'}</text>
          <g opacity={progress(t, at + 0.25, 0.4)}>
            <TL lines={lines} x={x + 130} y={y + 50 + size} size={size * 1.1} fill={c} k={k} />
            {b.by && <text x={x + 130} y={y + h - 40} fontFamily={k.fonts.ui} fontWeight={500} fontSize={size * 0.7} fill={col(k, 'mid', 'mid')}>{b.by}</text>}
          </g>
        </g>
      );
    }
    default:
      return null;
  }
};

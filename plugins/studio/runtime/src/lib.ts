// Animation Room engine: shared helpers and types.
// Styles are data (tokens + rules). The engine owns the block types.
import React from 'react';

export const ENGINE_VERSION = '1.10.0';

// Things every block in a storyboard may need: the cast of characters, when the voice is speaking and the frame size
// (1080 x 1920 or 1920 x 1080). Blocks that centre or align to an edge read the size here instead of assuming portrait.
export const StoryContext = React.createContext<{cast?: Record<string, any>; speech?: number[][]; W?: number; H?: number}>({});
export const useFrame = () => {
  const {W = 1080, H = 1920} = React.useContext(StoryContext);
  return {W, H};
};

export type Gray = number; // 0 = black, 1 = white
export type Color = Gray | string; // a gray level, or a CSS colour such as "#22342c"

export type StyleTokens = {
  bg: Color;
  gridMinor: Color;
  gridMajor: Color;
  gridMinorStep: number;
  gridMajorStep: number;
  ink: Color;
  mid: Color;
  soft: Color;
  fill: Color;
  dark: Color;
  lineWidths: {primary: number; secondary: number; construction: number};
  dashes: {construction: number[]; dotted: number[]};
  fonts: {headline: string; ui: string; mono: string};
  monoTracking: number;
  corners: {inset: number; arm: number};
  header: {y: number};
  margins: number;
  motion: {
    drawDefault: number;
    labelStagger: number;
    typeMsPerChar: number;
    revealDur: number;
    cameraPush: number;
    exitDur: number;
    writeMsPerChar?: number;
    fps?: number; // engine 1.5.1: frames per second for this style (default 30)
    stepFps?: number; // engine 1.2: stop motion. Hold each drawing so only this many are shown per second.
  };
  // ----- engine 1.1: everything below is optional; leaving it out gives the 1.0 look -----
  // Named colours a storyboard may use in `color` and `fill`, next to ink, mid, soft, fill, dark, bg.
  palette?: Record<string, Color>;
  // What sits behind the drawing. grid: paper grid that fades in. board: a wiped chalkboard.
  background?: {type: 'grid' | 'board' | 'table' | 'tint' | 'poster' | 'plain'; smudge?: number; grain?: number; vignette?: number; floor?: number; dots?: number; glow?: number; motes?: number};
  chrome?: {corners?: boolean; header?: boolean};
  // chalk: every stroke is drawn three times, slightly offset, and broken up by a dusty grain.
  stroke?: {style?: 'clean' | 'chalk' | 'brush'};
  type?: {
    headlineWeight?: number;
    headlineTracking?: number; // in em
    headlineUnderline?: string; // colour name; draws a line under headlines
    labelStyle?: 'normal' | 'italic';
    labelWeight?: number;
    labelCase?: 'upper' | 'none';
    labelScale?: number; // multiplies every label, note and caption size
    badge?: 'counter'; // chapter badge drawn as a small 01 / 03 counter
    jitter?: boolean; // engine 1.5: every letter sits a little off, like hand lettering
    reveal?: 'slide' | 'write' | 'pop'; // write: left to right behind a chalk tip. pop: letters pop on one by one
  };
  // cut: a scene leaves when the next starts. additive: everything stays, the picture builds up.
  scenes?: 'cut' | 'additive';
  fade?: {in?: number; out?: number; to?: 'bg'}; // to bg: fade to the ground colour instead of black
  // ----- engine 1.2: paper collage -----
  // Paper pieces (cutout, ransom): white border width, soft shadow, fibre grain strength, how ragged the torn edge is.
  paper?: {border: number; shadow: {dx: number; dy: number; blur: number; opacity: number}; grain: number; tear: number; tape: Color; tileTear?: number; patternScale?: number};
  // A sheet of paper everything sits on. It flips in at the start and flies out at the end.
  sheet?: {w: number; h: number; color: Color; flipIn?: number; flyOut?: number; scraps?: boolean; tear?: number};
  // Hand made wobble, new on every stop motion drawing: piece position (px) and rotation (deg), whole frame shift (px), brightness flicker (0..1).
  jitter?: {pos: number; rot: number; frame?: number; flicker?: number};
  tail?: number; // seconds the video runs past the last word (default 0.9)
  // ----- engine 1.3: flat colour cartoon -----
  // Default colours for the character rig, and how dark the soft shade is.
  rig?: {skin: Color; top: Color; trousers: Color; hair: Color; shoes: Color; cap?: Color; capDot?: Color; shade: number; blush?: 'hatch'; shadeStyle?: 'dots'; build?: 'stick'; outline?: boolean; halo?: {color: Color; width: number}};
  // A printed comic page: everything sits in one inked panel on `page` coloured paper.
  panel?: {inset: number; border: number; page: Color; radius?: number; borderColor?: Color; dash?: number[]};
  // Pen and ink shading: fills named url(#ink1) to url(#ink4) are crosshatch tones drawn in `ink` on `paper`, `step` px apart. url(#inkLine) is a bare diagonal hatch.
  hatch?: {paper: Color; ink: Color; step: number};
  // Named background tints; a scene picks one with "tint".
  tints?: Record<string, Color>;
  // Outlines boil: a tiny new offset (px) and tilt (deg), fps times a second.
  boil?: {fps: number; pos: number; rot: number};
  // keys: each scene may move the camera with "cam" keyframes; cuts get a small zoom punch.
  camera?: 'push' | 'keys';
  cameraDrift?: number; // px of slow camera drift for keyed cameras
  // Paper grain and corner darkening laid over the finished frame.
  finish?: {grain?: number; vignette?: number; rough?: number; stitch?: number};
  // ----- engine 1.5: raw ink on paper -----
  // The whole page drifts a few px and tilts a little on a smooth path; `shift` is the small jump it makes on each new scene.
  page?: {drift: number; rot: number; shift?: number};
  // ----- engine 1.6: printed poster -----
  // Chapter grounds for background.type poster; a scene picks one with "tint". base and ray are palette names, stip is the stipple filter (Deep, Rust, TealD) laid over the lower part.
  poster?: {grain?: number; grounds: Record<string, {base: string; ray: string; stip?: string; spin?: number; stars?: boolean; rayOpacity?: number}>};
  // ----- engine 1.8: the raw Vox look (vox.tsx draws the whole video when this is set) -----
  // grain: strength of the still film grain; vignette: warm corner darkening; drift: px the camera breathes;
  // breathe: how much it zooms in and out while it rests; transition: seconds a scene change takes; shadow: colour of the paper shadows.
  vox?: {grain?: number; vignette?: number; drift?: number; breathe?: number; transition?: number; shadow?: string};
};

export type Style = {
  id: string;
  name: string;
  version: string;
  minEngine: string;
  tokens: StyleTokens;
  variants?: Record<string, Partial<StyleTokens>>;
  wide?: Partial<StyleTokens>; // engine 1.9: tokens that change in a wide (16:9) frame, such as the floor height
  sound?: unknown;
};

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const cubicInOut = (x: number) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const quintOut = (x: number) => 1 - Math.pow(1 - clamp(x), 5);
export const progress = (t: number, t0: number, dur: number) =>
  dur <= 0 ? (t >= t0 ? 1 : 0) : clamp((t - t0) / dur);

export const gray = (v: Color) => {
  if (typeof v === 'string') return v;
  const c = Math.round(clamp(v) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${c}${c}${c}`;
};

// Fade a block out after `out` seconds.
export const outFade = (t: number, out?: number, dur = 0.3) =>
  out === undefined ? 1 : 1 - progress(t, out, dur);

export const semverGte = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true;
};

const mixHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

export const mergeTokens = (style: Style, variant?: string, palette?: Record<string, string>, wide?: boolean): StyleTokens => {
  const framed = wide && style.wide ? ({...style.tokens, ...style.wide} as StyleTokens) : style.tokens;
  const base = !variant || !style.variants?.[variant] ? framed : ({...framed, ...style.variants[variant]} as StyleTokens);
  if (!palette) return base;
  // A storyboard may recolour named palette entries (the member's accent colour).
  const merged = {...base, palette: {...base.palette, ...palette}} as StyleTokens;
  // Pale scene tints that follow an accent entry (token accentTints: {entry: [tint names]}) are remixed from the new colour.
  const at = (base as any).accentTints as Record<string, string[]> | undefined;
  if (at && base.tints) {
    const tints = {...base.tints} as Record<string, string>;
    for (const [entry, names] of Object.entries(at)) {
      const c = palette[entry];
      if (c) for (const n of names) tints[n] = mixHex(c, (base as any).bg && /^#/.test((base as any).bg) ? (base as any).bg : '#f3f0e7', 0.55);
    }
    (merged as any).tints = tints;
  }
  return merged;
};

// Deterministic pseudo random number in 0..1 from any numbers (same input, same output on every frame).
export const hash = (...n: number[]) => {
  let h = 2166136261;
  for (const v of n) h = Math.imul(h ^ Math.round(v * 1000), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

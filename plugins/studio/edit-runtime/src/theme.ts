import defaults from "./defaults.json";

// Tokens an Edit style provides (style.json "tokens"). Gray values are 0 (black) to 1 (white).
// defaults.json holds the starting values for each shape; the same file is read by the checks in Node.
export type Rect = { x: number; w: number; top: number; h: number };
export type Tokens = {
  bg: number; gridMinor: number; gridMajor: number; gridMinorStep: number; gridMajorStep: number;
  ink: number; mid: number; soft: number; fill: number;
  corners: { inset: number; arm: number };
  window: { x: number; y: number; w: number; h: number; radius: number; zoom: number; anchorY: number };
  fullAnchorY: number;
  textScale: number; // 1 for vertical; wider screens read smaller, so text is larger there
  caption: { x: number; w: number; y: number; size: number; words: number }; // the conventional subtitle strip, one of the typography layouts
  typo: { factor: number; lowerBase: number; stackBase: number; bigKey: number; bigSmall: number; panelBase: number; keywordKey: number; keywordSmall: number; maxWords: number; maxChars: number };
  block: Rect; blockFull: Rect;
  visual: { box: Rect; text: Rect; pad: number; corner: number; line: number; detail: number; textBase: number; textFactor: number; safeBottom: number }; // a drawing and the text that goes with it
  tag: { x: number; y: number };
  safe: { top: number; bottom: number };
  strip: { x: number; gap: number }; // 16:9 with a vertical recording: the person as a tall strip, text beside it
  motion: { transition: number; reveal: number };
};
export type Format = "9:16" | "16:9";
export const SIZE: Record<Format, { w: number; h: number }> = { "9:16": { w: 1080, h: 1920 }, "16:9": { w: 1920, h: 1080 } };

export const gray = (v: number, a = 1) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return a >= 1 ? `rgb(${c},${c},${c})` : `rgba(${c},${c},${c},${a})`;
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export const deepMerge = <T,>(a: T, b: unknown): T => {
  if (!isObj(b)) return a;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const k of Object.keys(b)) out[k] = isObj(b[k]) && isObj(out[k]) ? deepMerge(out[k], b[k]) : b[k];
  return out as T;
};
export const merge = (t: Partial<Tokens> | undefined, format: Format = "9:16"): Tokens => {
  const base = deepMerge(defaults.portrait, format === "16:9" ? defaults.landscape : {}) as unknown as Tokens;
  return deepMerge(base, t);
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3); // settles, no bounce
export const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// How big a single line of text can be and still fit a width (Inter, about this wide per character).
export const fitWidth = (text: string, base: number, width: number, factor: number, floor = 30) => Math.max(floor, Math.min(base, width / (Math.max(1, text.length) * factor)));

// Text size for a phrase: the biggest size at which it still fits in the given number of lines.
export const linesFor = (len: number, fs: number, w: number, factor: number) => Math.max(1, Math.ceil((len * factor * fs) / w));
export const fitLines = (len: number, base: number, w: number, maxLines: number, factor: number, floor = 34) => {
  let fs = base;
  while (fs > floor && linesFor(len, fs, w, factor) > maxLines) fs *= 0.94;
  return Math.max(floor, fs);
};

// Beside a drawing the text has a narrow column, so whole words decide the lines: count them as they would wrap,
// and take the biggest size that keeps the headline to a few lines. The checks in Node use the same rule.
export const wrapCount = (text: string, fs: number, w: number, factor: number) => {
  let lines = 1, cur = 0;
  for (const word of text.split(" ")) {
    const len = word.length * factor * fs, gap = cur ? 0.5 * factor * fs : 0;
    if (cur && cur + gap + len > w) { lines++; cur = len; } else cur += gap + len;
  }
  return lines;
};
export const fitWrapped = (text: string, base: number, w: number, maxLines: number, factor: number, floor = 40) => {
  const longest = Math.max(1, ...text.split(" ").map((x) => x.length));
  let fs = Math.min(base, w / (longest * factor));
  while (fs > floor && wrapCount(text, fs, w, factor) > maxLines) fs *= 0.95;
  return Math.max(floor, fs);
};

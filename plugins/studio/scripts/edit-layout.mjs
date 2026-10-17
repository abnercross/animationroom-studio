// Edit mode: where things sit on the page, and the checks that depend on it (safe zones, text fit,
// the head inside the frame, text over the face). The starting values are in edit-runtime/src/defaults.json,
// the same file the engine reads, so a check and the picture can never disagree about a position.
import path from "node:path";
import { PLUGIN_ROOT, readJson } from "./edit-core.mjs";

export const DEFAULTS = readJson(path.join(PLUGIN_ROOT, "edit-runtime", "src", "defaults.json"));
export const SIZE = { "9:16": { w: 1080, h: 1920 }, "16:9": { w: 1920, h: 1080 } };
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
export const deepMerge = (a, b) => {
  if (!isObj(b)) return a;
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = isObj(b[k]) && isObj(o[k]) ? deepMerge(o[k], b[k]) : b[k];
  return o;
};
// Layers, weakest first: the shape's defaults, the style, what the member saved, this plan's own changes.
export function resolveTokens(format, ...layers) {
  let t = deepMerge(DEFAULTS.portrait, format === "16:9" ? DEFAULTS.landscape : {});
  for (const l of layers) {
    if (!l) continue;
    const { landscape, ...rest } = l;
    t = deepMerge(t, rest);
    if (format === "16:9") t = deepMerge(t, landscape);
  }
  return t;
}

// Typography settings for the spoken words (same file the engine reads).
export const typo = (format) => ({ ...DEFAULTS.portrait.typo, ...(format === "16:9" ? DEFAULTS.landscape.typo : {}) });
const linesFor = (len, fs, w, f) => Math.max(1, Math.ceil((len * f * fs) / w));
const fitLines = (len, base, w, maxLines, f, floor = 34) => { let fs = base; while (fs > floor && linesFor(len, fs, w, f) > maxLines) fs *= 0.94; return Math.max(floor, fs); };
export const FULL_VARIANTS = ["lower", "stack", "big", "strip"], WINDOW_VARIANTS = ["panel", "keyword"];
// Height a typography moment needs in a space of width w (matches the engine).
export function estimateWords(m, w, tk) {
  const T = tk.typo, sc = tk.textScale, f = T.factor;
  const words = (m.phrase || []).map((x) => x[2]);
  const text = words.join(" "), L = text.length;
  const keyLen = (words[m.key] || "").length;
  const v = m.variant || "lower";
  if (v === "stack") { const n = Math.ceil(words.length / 2); const longest = Math.max(...Array.from({ length: n }, (_, k) => words.slice(k * 2, k * 2 + 2).join(" ").length)); const fs = Math.min(T.stackBase * sc, w / (Math.max(6, longest) * f)); return fs * 1.02 * n; }
  if (v === "big") { const fs = Math.min(T.bigKey * sc, w / (Math.max(3, keyLen) * 0.6)); const small = T.bigSmall * sc; return fs + small * 1.1 * (words.length > 1 ? (m.key > 0 && m.key < words.length - 1 ? 2 : 1) : 0); }
  if (v === "strip") return tk.caption.size * 1.12 * Math.min(2, linesFor(L, tk.caption.size, w, f));
  if (v === "panel") { const fs = fitLines(L, T.panelBase * sc, w, 3, f); return fs * 1.1 * linesFor(L, fs, w, f); }
  if (v === "keyword") { const fs = Math.min(T.keywordKey * sc, w / (Math.max(3, keyLen) * 0.6)); const small = T.keywordSmall * sc; return fs + 10 + small * 1.1 * linesFor(L - keyLen, small, w, f); }
  const fs = fitLines(L, T.lowerBase * sc, w, 2, f); return fs * 1.1 * linesFor(L, fs, w, f);
}

// The headline beside a drawing: whole words decide the lines (same rule as the engine, theme.ts).
const wrapCount = (text, fs, w, factor) => { let n = 1, cur = 0; for (const word of text.split(" ")) { const len = word.length * factor * fs, gap = cur ? 0.5 * factor * fs : 0; if (cur && cur + gap + len > w) { n++; cur = len; } else cur += gap + len; } return n; };
const fitWrapped = (text, base, w, maxLines, factor, floor = 40) => { let fs = Math.min(base, w / (Math.max(1, ...text.split(" ").map((x) => x.length)) * factor)); while (fs > floor && wrapCount(text, fs, w, factor) > maxLines) fs *= 0.95; return Math.max(floor, fs); };

// Rough text measures for Inter (about this wide per character). The engine shrinks a list line to fit by the
// same rule, so these are estimates in the same spirit, kept a little on the safe side.
const sizeFor = (n, big) => (n <= 18 ? big : n <= 30 ? big * 0.84 : n <= 48 ? big * 0.7 : big * 0.58);
const lines = (len, fs, w, f = 0.56) => Math.max(1, Math.ceil((len * f * fs) / w));
export function estimate(m, w, sc = 1, tk = null) {
  if (m.type === "words") return { h: estimateWords(m, w, tk), note: "" };
  const len = (m.text || "").length;
  if (m.type === "title") { const fs = sizeFor(len, 116 * sc); return { h: (m.kicker ? 50 : 0) + lines(len, fs, w) * fs * 1.04 + 37, note: `${lines(len, fs, w)} lines` }; }
  if (m.type === "key") { const fs = sizeFor(len, 118 * sc); return { h: (m.kicker ? 50 : 0) + lines(len, fs, w) * fs * 1.12 + 8, note: `${lines(len, fs, w)} lines` }; }
  if (m.type === "cta") { const fs = sizeFor(len, 96 * sc); return { h: lines(len, fs, w) * fs * 1.06 + 52 + 90, note: "" }; }
  if (m.type === "number") return { h: (250 + 66) * sc + (m.label ? 38 : 0), note: "" };
  if (m.type === "visual") { if (!m.text) return { h: 0, note: "" }; const f = tk.visual.textFactor, fs = fitWrapped(m.text, tk.visual.textBase * sc, w, 3, f), n = wrapCount(m.text, fs, w, f); return { h: (m.kicker ? 46 : 0) + n * fs * 1.12 + 8, note: `${n} lines` }; }
  if (m.type === "list") return { h: ((m.heading ? 64 : 0) + (m.items || []).length * 116) * sc, note: "" };
  return { h: 0, note: "" };
}

// Head box in video pixels, from the face the plan names: x, y is between the eyes and the nose, w the head width.
const headBox = (f, vw, vh) => ({ x0: f.x * vw - 0.6 * f.w * vw, x1: f.x * vw + 0.6 * f.w * vw, y0: f.y * vh - 1.05 * f.w * vw, y1: f.y * vh + 0.78 * f.w * vw });
const clampCover = (v, size, box) => Math.min(0, Math.max(box - size, v));
const samples = (face) => (face.track ? face.track.x.map((x, i) => ({ t: i * face.track.step, x, y: face.track.y[i] })) : [{ t: 0, x: face.x, y: face.y }]);

export function layoutChecks({ plan, tokens: tk, format, moments }) {
  const warnings = [], errors = [];
  const { w: W, h: H } = SIZE[format];
  const { width: vw, height: vh } = plan.video;
  const f = { x: plan.face.x, y: plan.face.y, w: plan.face.w || 0.3, track: plan.face.track };
  const strip = format === "16:9" && vw < vh;

  // Safe zones: nothing the member needs to read may sit where the app's buttons go.
  const stripBottom = tk.caption.y - tk.caption.size + tk.caption.size * 1.12 * 2;
  if (stripBottom > tk.safe.bottom + 20) warnings.push(`the subtitle strip layout reaches ${Math.round(stripBottom)} px, past the safe line at ${tk.safe.bottom} px. Move it up (tokens caption)`);
  for (const [name, r] of [["graphics", tk.block], ["end graphics", tk.blockFull]]) {
    if (r.top + r.h > tk.safe.bottom + 1) warnings.push(`the ${name} area ends at ${r.top + r.h} px, past the safe line at ${tk.safe.bottom} px`);
    if (r.x < 40 || r.x + r.w > W - 40) warnings.push(`the ${name} area runs too close to the edge of the picture`);
  }
  // The frame and the graphics area must not overlap.
  const wn = tk.window;
  const clash = format === "16:9" ? tk.block.x < wn.x + wn.w - 1 : tk.block.top < wn.y + wn.h - 1;
  if (clash) errors.push("the graphics area overlaps the person's frame. Move the frame or the graphics area (tokens window and block)");

  // Text fit, per moment, against the space it will be drawn in.
  for (const m of moments) {
    const window = (m.layout ?? "window") === "window";
    const r = m.type === "visual" || m.beside ? tk.visual.text : window ? tk.block : strip ? { w: W - (tk.strip.x + (H * vw) / vh + tk.strip.gap) - 100, h: 840 } : tk.blockFull;
    const e = estimate(m, r.w, tk.textScale, tk);
    if (e.h > r.h) warnings.push(`the ${m.type} at ${m.from.toFixed(1)} s needs about ${Math.round(e.h)} px of height${e.note ? ` (${e.note})` : ""} but has ${r.h} px. Shorten the text`);
    if (m.type === "list") for (const it of m.items || []) {
      const fs = Math.min(sizeFor(it.text.length, 74 * tk.textScale) * 0.9, (r.w - 112 * tk.textScale - 8) / (it.text.length * 0.52));
      if (fs < 36) warnings.push(`the list line "${it.text}" at ${m.from.toFixed(1)} s would be shrunk to ${Math.round(fs)} px to fit. Make it shorter`);
    }
  }

  // Drawings: inside the safe area, never over the person, clear of their own text, and up long enough to be seen.
  const visuals = moments.filter((m) => m.type === "visual");
  if (visuals.length) {
    const V = tk.visual, b = V.box, tx = V.text, frame = { x: wn.x, top: wn.y, w: wn.w, h: wn.h };
    const hit = (a, c) => a.x < c.x + c.w - 1 && a.x + a.w > c.x + 1 && a.top < c.top + c.h - 1 && a.top + a.h > c.top + 1;
    if (hit(b, frame)) errors.push("the drawing area overlaps the person's frame, so a drawing would cover the person. Move the drawing (tokens visual box) or the frame (tokens window)");
    if (hit(tx, frame)) errors.push("the text beside the drawing overlaps the person's frame. Move it (tokens visual text) or the frame (tokens window)");
    if (hit(b, tx)) errors.push("the drawing and the text beside it overlap (tokens visual box and visual text)");
    if (b.x < 40 || b.x + b.w > W - 40 || tx.x < 40 || tx.x + tx.w > W - 40) errors.push("the drawing or its text runs too close to the edge of the picture (tokens visual)");
    if (tx.top + tx.h > V.safeBottom + 1) errors.push(`the text beside the drawing ends at ${tx.top + tx.h} px, past the safe line at ${V.safeBottom} px (tokens visual text)`);
    for (const v of visuals) {
      const at = v.from.toFixed(1), bottom = Math.round(b.top + b.h + (v.label ? 14 + 34 * tk.textScale : 0));
      if (b.top < tk.safe.top || bottom > V.safeBottom) errors.push(`the ${v.draw} drawing at ${at} s reaches from ${b.top} to ${bottom} px, outside the safe area (${tk.safe.top} to ${V.safeBottom} px). Move it up (tokens visual box)${v.label ? ' or drop its "label"' : ""}`);
      const start = Math.max(v.at ?? v.from, v.from + tk.motion.transition * 0.85);
      if (v.to - start < 1.5) errors.push(`the ${v.draw} drawing at ${at} s is on screen for only ${Math.max(0, v.to - start).toFixed(1)} s after it starts to draw. It needs at least 1.5 s: end the moment later, or tie it to an earlier word`);
      if (v.label && v.label.length * 0.62 * 24 * tk.textScale + v.label.length * 4 > b.w) warnings.push(`the label "${v.label}" under the drawing at ${at} s is wider than the drawing. Use one or two short words`);
    }
  }

  // The head inside the frame, all the way through the video (follows the face track when there is one).
  const sWin = Math.max(wn.w / vw, wn.h / vh) * wn.zoom;
  let cutTop = 0, cutSide = 0, cutChin = 0, worstTop = 0, worstSide = 0, worstChin = 0;
  const S = samples(f);
  for (const s of S) {
    const b = headBox({ ...f, x: s.x, y: s.y }, vw, vh);
    const left = clampCover(wn.w / 2 - s.x * vw * sWin, vw * sWin, wn.w);
    const top = clampCover(wn.h * wn.anchorY - s.y * vh * sWin, vh * sWin, wn.h);
    const x0 = left + b.x0 * sWin, x1 = left + b.x1 * sWin, y0 = top + b.y0 * sWin, y1 = top + b.y1 * sWin;
    if (y0 < 6) { cutTop++; worstTop = Math.max(worstTop, 6 - y0); }
    if (x0 < 6 || x1 > wn.w - 6) { cutSide++; worstSide = Math.max(worstSide, 6 - x0, x1 - (wn.w - 6)); }
    if (y1 > wn.h - 6) { cutChin++; worstChin = Math.max(worstChin, y1 - (wn.h - 6)); }
  }
  const pc = (n) => Math.round((n / S.length) * 100);
  if (cutTop / S.length > 0.05) warnings.push(`the top of the head is cut off by the frame for ${pc(cutTop)}% of the video (by up to ${Math.round(worstTop)} px). Lower the picture in the frame (tokens window anchorY) or zoom out (window zoom)`);
  if (cutSide / S.length > 0.05) warnings.push(`the sides of the head touch the frame edge for ${pc(cutSide)}% of the video. Zoom out (tokens window zoom)`);
  if (cutChin / S.length > 0.05) warnings.push(`the chin is cut off by the frame for ${pc(cutChin)}% of the video. Raise the picture in the frame or zoom out`);

  // Text over the face in the full screen state.
  if (!strip) {
    const sFull = Math.max(W / vw, H / vh), fw = vw * sFull, fh = vh * sFull;
    for (const m of moments.filter((x) => (x.layout ?? "window") === "full")) {
      const e = estimate(m, tk.blockFull.w, tk.textScale, tk);
      const top = tk.blockFull.top + tk.blockFull.h - Math.min(e.h, tk.blockFull.h);
      const inRange = S.filter((s) => s.t >= m.from - 0.2 && s.t <= m.to + 0.2);
      let over = 0;
      for (const s of inRange.length ? inRange : S) {
        const b = headBox({ ...f, x: s.x, y: s.y }, vw, vh);
        const left = clampCover(W / 2 - s.x * fw, fw, W), tp = clampCover(H * tk.fullAnchorY - s.y * fh, fh, H);
        const y1 = tp + b.y1 * sFull, x0 = left + b.x0 * sFull, x1 = left + b.x1 * sFull;
        const hit = y1 > top + 20 && x1 > tk.blockFull.x && x0 < tk.blockFull.x + tk.blockFull.w;
        if (hit) over++;
      }
      if (over / (inRange.length || S.length) > 0.25) warnings.push(`the text at ${m.from.toFixed(1)} s sits over the person's chin or face. Shorten it, or use a frame moment instead`);
    }
  }
  return { warnings, errors };
}

// The lowest point of the head (the chin) on a full screen picture, over the whole video. Null when the whole
// video is shown (a vertical recording in a 16:9 video).
export function fullHeadBottom({ plan, tokens: tk, format }) {
  const { w: W, h: H } = SIZE[format];
  const { width: vw, height: vh } = plan.video;
  if (format === "16:9" && vw < vh) return null;
  const f = { x: plan.face.x, y: plan.face.y, w: plan.face.w || 0.3, track: plan.face.track };
  const sFull = Math.max(W / vw, H / vh), fh = vh * sFull;
  let low = 0;
  for (const s of samples(f)) {
    const b = headBox({ ...f, x: s.x, y: s.y }, vw, vh);
    low = Math.max(low, clampCover(H * tk.fullAnchorY - s.y * fh, fh, H) + b.y1 * sFull);
  }
  return low;
}

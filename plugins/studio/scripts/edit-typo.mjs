// Edit mode: the spoken words as dynamic typography. The plan only places graphics (titles, key phrases, lists...).
// Every stretch of the video with no graphic is filled here with the words themselves, a phrase at a time, in layouts
// that change from phrase to phrase, so there is always typography on screen and it always comes from the voiceover.
import { FULL_VARIANTS, WINDOW_VARIANTS, estimateWords, fullHeadBottom, typo } from "./edit-layout.mjs";

const STOP = new Set("the a an and or but so to of in on at for with from by as is are was were be been it its this that these those i you he she we they my your our their me him her us them not no yes if then than just very really also".split(" "));
const clean = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
const endsClause = (w) => /[.?!,;:]["')]*$/.test(w);

// Words into short phrases: a breath, a sentence end or a comma closes one, and so does the length limit.
function phrasesOf(ws, maxWords, maxChars) {
  const out = [];
  let cur = [];
  const chars = (a) => a.map((x) => x[2]).join(" ").length;
  ws.forEach((w, i) => {
    const prev = cur[cur.length - 1];
    if (cur.length && (cur.length >= maxWords || chars([...cur, w]) > maxChars || w[0] - prev[1] > 0.4 || (endsClause(prev[2]) && cur.length >= 2))) { out.push(cur); cur = []; }
    cur.push(w);
  });
  if (cur.length) out.push(cur);
  // A lone word is joined to its neighbour when that stays short enough.
  for (let i = out.length - 1; i > 0; i--) {
    if (out[i].length === 1 && out[i][0][0] - out[i - 1][out[i - 1].length - 1][1] < 0.4 && out[i - 1].length < maxWords + 1) { out[i - 1].push(out[i][0]); out.splice(i, 1); }
  }
  return out;
}
// The word to stress: the longest meaningful one.
const keyIndex = (ph) => {
  let best = -1, len = 4;
  ph.forEach((w, i) => { const c = clean(w[2]); if (!STOP.has(c) && c.length > len) { len = c.length; best = i; } });
  return best;
};

export function fillTypography({ moments, words, duration, tokens, format, plan, strip = true }) {
  const T = typo(format);
  const sorted = moments.map((m) => ({ ...m })).sort((a, b) => a.from - b.from); // copies: a graphic may be held longer
  const gaps = [];
  let t = 0;
  // A drawing with no headline of its own does not carry text, so the spoken words run beside it for as long as it is up.
  const soft = (m) => !!m && m.type === "visual" && !m.text;
  for (const m of sorted) {
    const i = sorted.indexOf(m);
    if (m.from > t + 0.05) gaps.push({ from: t, to: m.from, prev: sorted[i - 1], next: m });
    if (soft(m)) gaps.push({ from: m.from, to: m.to, prev: sorted[i - 1], next: sorted[i + 1], beside: true });
    t = Math.max(t, m.to);
  }
  if (duration > t + 0.05) gaps.push({ from: t, to: duration, prev: sorted[sorted.length - 1], next: null });

  const regionFull = tokens.blockFull, head = fullHeadBottom({ plan, tokens, format });
  const room = head === null ? regionFull.h : Math.min(regionFull.h, regionFull.top + regionFull.h - head - 30);
  const auto = [];
  let windowTurn = 0, fullI = 0, winI = 0;
  const win = (m) => m && (m.layout ?? "window") === "window";
  for (const g of gaps) {
    const hi = g.beside || soft(g.next) ? g.to - 0.05 : g.to; // a word on the join belongs to the stretch that starts there
    const ws = words.filter((w) => w[0] >= g.from - 0.05 && w[0] < hi);
    const dur = g.to - g.from;
    const beside = !!g.beside, side = tokens.visual.text;
    // No word starts in a short gap: the graphic before it simply holds on, so the screen is never bare.
    if (!ws.length) { if (g.prev && dur < 1.2 && !beside) g.prev.to = g.to; continue; }
    // Frame or full screen for this stretch. Between two frame moments it stays in the frame (no closing and reopening);
    // otherwise longer stretches alternate with full screen, so the person is sometimes alone and sometimes framed.
    let layout = "full";
    if (beside) layout = "window";
    else if ((win(g.prev) && win(g.next) && dur < 2.5) || (win(g.prev) && dur < 1.0) || (win(g.next) && g.prev === undefined && dur < 1.0)) layout = "window";
    else if (dur >= 3.5 && windowTurn++ % 2 === 1) layout = "window";
    const phrases = phrasesOf(ws, T.maxWords, T.maxChars);
    phrases.forEach((ph, k) => {
      const next = phrases[k + 1];
      const first = ph[0][0], last = ph[ph.length - 1][1];
      let from = k === 0 ? (first - g.from < 0.7 ? g.from : first - 0.08) : first - 0.08;
      let to = next ? next[0][0] - 0.08 : (g.to - last < 0.7 ? g.to : Math.min(g.to, last + 0.6));
      to = Math.min(to, g.to);
      const pause = next ? next[0][0] - last > 0.9 : true;
      if (pause && next) to = Math.min(to, last + 0.6);
      const key = keyIndex(ph);
      const m = { type: "words", auto: true, layout, ...(beside ? { beside: true } : {}), from: +from.toFixed(2), to: +to.toFixed(2), phrase: ph, key, fadeOut: !!pause };
      const tryVariant = (list, counter) => {
        for (let n = 0; n < list.length; n++) {
          const v = list[(counter + n) % list.length];
          if ((v === "big" || v === "keyword") && key < 0) continue;
          if (v === "strip" && !strip) continue;
          const mm = { ...m, variant: v };
          const h = estimateWords(mm, beside ? side.w : layout === "window" ? tokens.block.w : regionFull.w, tokens);
          const space = beside ? side.h : layout === "window" ? tokens.block.h : room;
          if (h <= space) return { v, used: counter + n + 1 };
        }
        return { v: layout === "window" ? "panel" : "lower", used: counter + 1 };
      };
      if (layout === "window") { const r = tryVariant(WINDOW_VARIANTS, winI); m.variant = r.v; winI = r.used; }
      else { const r = tryVariant(FULL_VARIANTS, fullI); m.variant = r.v; fullI = r.used; }
      auto.push(m);
    });
  }
  return [...sorted, ...auto].sort((a, b) => a.from - b.from || a.to - b.to);
}

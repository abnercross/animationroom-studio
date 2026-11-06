// Edit mode step 2: decide what to keep, and make the cuts. Everything is on video time.
//
// Rules, in plain words:
//  1. Every word stays. The member records (or trims) their final, good take; nothing is judged a retake
//     (Abner, 3 Nov 2026: a repeat said on purpose was being cut, and detecting retakes was not worth the risk).
//  2. Silences longer than a natural pause are shortened. A pause after a sentence stays a little longer.
//  3. Black frames (left at the joins when the member trimmed the video on their phone) are cut out.
//  4. A cut always lands inside a silence or between two words, never inside a word, and every cut
//     has a tiny sound fade so it cannot click.
import { ALIGN, ff, fail, probe } from "./edit-core.mjs";

const endsSentence = (w) => /[.?!]["')]*$/.test(w[2]);

export function proposeCuts(a, { pause = 0.3, sentencePause = 0.5, lead = 0.1, maxPause = 0.6, keepPause = 0.35 } = {}) {
  const { words, duration } = a;
  const sil = a.silences.filter((s) => s.to - s.from >= 0.3);
  const restarts = new Map(); // nothing is dropped for being said again; kept so the piece logic stays one shape
  // Real onset and offset of a word: snap to the silence edge when one is right there.
  // A word stamped inside a silence really starts where the silence ends: after a quiet opening the speech engine
  // often puts the first words at 0 s (a phone video kept 2.2 s of silence at the start because of it).
  const onset = (w) => {
    const inside = sil.find((x) => x.from <= w[0] + 0.05 && x.to - 0.05 > w[0]);
    if (inside) return inside.to;
    const s = sil.find((x) => Math.abs(x.to - w[0]) < 0.3);
    return s ? s.to : w[0];
  };
  const offset = (w) => { const s = sil.find((x) => Math.abs(x.from - w[1]) < 0.3 || (x.from <= w[1] && x.to >= w[1])); return s ? Math.max(w[0] + 0.05, s.from) : w[1]; };
  const silenceBetween = (w1, w2) => sil.find((s) => s.from >= w1[0] && s.to <= w2[1] + 0.3 && s.to - s.from >= 0.3 && s.from < w2[0] + 0.1);

  // Pieces: runs of words with the same decision, split wherever a silence is long enough to shorten.
  const pieces = [];
  let cur = null;
  words.forEach((w, i) => {
    const drop = restarts.get(i);
    const prev = words[i - 1];
    const gap = prev ? silenceBetween(prev, w) : null;
    if (!cur || !!drop !== !!cur.drop || gap) {
      cur = { drop: drop || "", words: [], gap: gap ? gap.to - gap.from : 0, i0: i };
      pieces.push(cur);
    }
    cur.words.push(w);
  });
  pieces.forEach((p) => {
    p.on = onset(p.words[0]);
    p.off = offset(p.words[p.words.length - 1]);
    p.text = p.words.map((w) => w[2]).join(" ");
    p.sentenceEnd = endsSentence(p.words[p.words.length - 1]);
  });

  // Keep decisions to timeline entries, shortening each long silence between two kept pieces.
  const keeps = [];
  pieces.forEach((p, idx) => {
    if (p.drop) return;
    const prevKept = keeps[keeps.length - 1];
    const prevPiece = pieces[idx - 1];
    const joinsPrev = prevKept && prevPiece && !prevPiece.drop; // nothing dropped in between
    if (joinsPrev) {
      const L = p.on - prevKept.off;
      const keepGap = prevKept.sentenceEnd ? sentencePause : pause;
      if (L <= keepGap + 0.15) {
        prevKept.off = p.off; prevKept.text += " " + p.text; prevKept.sentenceEnd = p.sentenceEnd; prevKept.words.push(...p.words);
        prevKept.dropStart = pieces[idx + 1]?.drop ? pieces[idx + 1].on : null;
        return;
      }
    }
    keeps.push({ on: p.on, off: p.off, text: p.text, sentenceEnd: p.sentenceEnd, words: [...p.words], dropEnd: prevPiece?.drop ? prevPiece.off : null, dropStart: pieces[idx + 1]?.drop ? pieces[idx + 1].on : null });
  });
  // Final bounds with a little air around speech. Next to a dropped piece the cut stays tight.
  const cuts = [];
  keeps.forEach((k, i) => {
    const prev = keeps[i - 1], next = keeps[i + 1];
    const gapBefore = prev ? k.on - prev.off : k.on;
    const gapAfter = next ? next.on - k.off : duration - k.off;
    const keepGap = (k.sentenceEnd ? sentencePause : pause);
    let padBefore = prev ? Math.min(lead + 0.05, gapBefore / 2) : Math.min(lead, k.on);
    let padAfter = next ? Math.min(Math.max(keepGap - lead, 0.08), gapAfter / 2) : Math.min(0.35, duration - k.off);
    // Next to speech that is being dropped, stay tight so none of it leaks into the cut.
    if (k.dropEnd !== null) padBefore = Math.max(0, Math.min(padBefore, k.on - k.dropEnd - 0.02));
    if (k.dropStart !== null) padAfter = Math.max(0, Math.min(padAfter, k.dropStart - k.off - 0.02));
    cuts.push({ from: +Math.max(0, k.on - padBefore).toFixed(2), to: +Math.min(duration, k.off + padAfter).toFixed(2), keep: true, reason: "speech", text: k.text });
  });
  // Any long silence inside a kept part is shortened, found in the sound itself: the speech engine can stretch
  // a word across a pause, so word gaps alone would miss it.
  for (let i = cuts.length - 1; i >= 0; i--) {
    const c = cuts[i];
    const inner = sil.filter((s) => s.from > c.from + 0.1 && s.to < c.to - 0.1 && s.to - s.from > maxPause).sort((x, y) => x.from - y.from);
    if (!inner.length) continue;
    const parts = [];
    let from = c.from;
    for (const s of inner) {
      parts.push({ ...c, from, to: +(s.from + keepPause / 2).toFixed(2), text: "" });
      from = +(s.to - keepPause / 2).toFixed(2);
    }
    parts.push({ ...c, from, to: c.to, text: "" });
    // The words go to the part they fall in.
    parts.forEach((p) => { p.text = words.filter((w) => (w[0] + w[1]) / 2 >= p.from && (w[0] + w[1]) / 2 < p.to).map((w) => w[2]).join(" ") || c.text; });
    cuts.splice(i, 1, ...parts);
  }
  // Snap each cut to the quietest moment close by, so no cut lands inside a word.
  const e = a.energy;
  if (e && e.length) {
    const snap = (t, lo, hi) => {
      const c = Math.round(t * 100), r = 15;
      let best = c, bv = Infinity;
      for (let i = Math.max(Math.round(lo * 100), c - r); i <= Math.min(Math.round(hi * 100), c + r) && i < e.length; i++) {
        // prefer the quietest point, and the nearest of equals
        const v = e[i] + Math.abs(i - c) * 0.15;
        if (v < bv) { bv = v; best = i; }
      }
      return +(best / 100).toFixed(2);
    };
    cuts.forEach((c, i) => {
      const prev = cuts[i - 1], next = cuts[i + 1];
      if (c.from > 0.05) c.from = snap(c.from, prev ? prev.to + 0.05 : 0, c.to - 0.5);
      if (c.to < duration - 0.05) c.to = snap(c.to, c.from + 0.5, next ? next.from - 0.05 : duration);
    });
  }
  // Black frames are carved out of whatever is kept around them, to the frame (three decimals, not two).
  for (const b of a.black || []) {
    for (let i = cuts.length - 1; i >= 0; i--) {
      const c = cuts[i];
      if (b.to <= c.from || b.from >= c.to) continue;
      const parts = [];
      if (b.from - c.from > 0.05) parts.push({ ...c, to: +b.from.toFixed(3) });
      if (c.to - b.to > 0.05) parts.push({ ...c, from: +b.to.toFixed(3) });
      parts.forEach((p) => { p.text = words.filter((w) => (w[0] + w[1]) / 2 >= p.from && (w[0] + w[1]) / 2 < p.to).map((w) => w[2]).join(" "); });
      cuts.splice(i, 1, ...parts);
    }
  }
  // Fill the timeline: whatever is not kept is listed with its reason, so nothing disappears silently.
  const all = [];
  let t = 0;
  const dropText = (from, to) => words.filter((w) => w[0] >= from - 0.01 && w[0] < to).map((w) => w[2]).join(" ");
  const isBlack = (from, to) => (a.black || []).some((b) => b.from < to && b.to > from);
  cuts.forEach((c) => {
    if (c.from > t + 0.005) {
      // A silence is measured from the sound, so a word the speech engine stamped inside it is a timing slip:
      // listing it would only invite putting it back.
      const black = isBlack(t, c.from);
      all.push({ from: +t.toFixed(3), to: c.from, keep: false, reason: black ? "black picture" : `silence ${(c.from - t).toFixed(1)} s`, text: black ? dropText(t, c.from) : "" });
    }
    all.push(c);
    t = c.to;
  });
  if (duration > t + 0.02) all.push({ from: +t.toFixed(2), to: +duration.toFixed(2), keep: false, reason: "silence at the end", text: "" });
  return all;
}

// Apply the cuts with one filter graph: trim, tiny fades, join. Returns the new words on the cut timeline.
export function applyCuts(video, cuts, words, outFile) {
  const meta = probe(video);
  const keep = cuts.filter((c) => c.keep && c.to - c.from > 0.1);
  if (!keep.length) fail("every part is marked to drop, nothing would be left");
  const FADE = 0.02;
  const lines = [];
  keep.forEach((c, i) => {
    const d = c.to - c.from;
    lines.push(`[0:v]trim=start=${c.from}:end=${c.to},setpts=PTS-STARTPTS[v${i}]`);
    lines.push(`[0:a]${ALIGN},atrim=start=${c.from}:end=${c.to},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE},afade=t=out:st=${Math.max(0, d - FADE).toFixed(3)}:d=${FADE}[a${i}]`);
  });
  lines.push(`${keep.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${keep.length}:v=1:a=1[v][a]`);
  // The graph goes in as one argument (works with every ffmpeg version; a few dozen cuts is far below the size limit).
  ff(["-v", "error", "-y", "-i", video, "-filter_complex", lines.join(";"), "-map", "[v]", "-map", "[a]", "-r", String(Math.round(meta.fps)), "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outFile]);
  let shift = 0;
  const map = keep.map((c) => { const m = { from: c.from, to: c.to, offset: shift - c.from }; shift += c.to - c.from; return m; });
  const moved = [];
  for (const w of words) {
    const seg = map.find((m) => w[0] >= m.from - 0.001 && w[0] < m.to);
    if (seg) moved.push([+(w[0] + seg.offset).toFixed(2), +(Math.min(w[1], seg.to) + seg.offset).toFixed(2), w[2]]);
  }
  return { duration: shift, words: moved };
}

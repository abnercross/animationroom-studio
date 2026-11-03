// Edit mode check of a finished file: length, sound, long silences, black frames, loudness, words heard.
import { ALIGN, DATA, ff, fail, probe } from "./edit-core.mjs";
import { findSilences } from "./edit-analyze.mjs";
import { transcribeWords } from "./speech.mjs";

const norm = (s) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
// For comparing what was said with what was meant: "2." and "two", "ok" and "okay" are the same.
const DIGIT_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const same = (w) => { const n = norm(w); if (/^\d+$/.test(n) && +n <= 20) return DIGIT_WORD[+n]; if (n === "ok") return "okay"; return stem(n); };

// ---------- the finished file ----------
function lcsDiff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const extra = [], missing = []; // extra: heard but not meant to stay; missing: meant to stay but not heard
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) missing.push(i++);
    else extra.push(j++);
  }
  while (i < n) missing.push(i++);
  while (j < m) extra.push(j++);
  return { extra, missing };
}

// What the viewer hears: the edited video's own transcript is compared with the words meant to stay. It compares
// two transcripts of the same sound, so it is only a hint. A phrase said twice is not looked for: the member's
// take is final, and a repeat is theirs to make (Abner, 3 Nov 2026).
export function transcriptWarnings(expectedWords, heard) {
  const warnings = [];
  const hw = heard.filter((w) => norm(w[2]));
  const a = (expectedWords || []).map((w) => same(w[2])).filter((x) => x && x !== "number");
  const b = hw.map((w) => same(w[2])).filter((x) => x !== "number");
  const { extra } = lcsDiff(a, b);
  return { warnings, note: `transcript check: ${hw.length} words heard, ${Math.max(0, b.length - extra.length)} of ${a.length} expected` };
}

export async function videoCheck(file, { expectedDuration, expectedWords, transcript = false } = {}) {
  const warnings = [], notes = [];
  const meta = probe(file);
  if (!meta.audio) warnings.push("the video has no sound");
  if (expectedDuration && Math.abs(meta.duration - expectedDuration) > 0.3) warnings.push(`the video is ${meta.duration.toFixed(1)} s but the plan says ${expectedDuration.toFixed(1)} s`);
  // Sound and picture should end together.
  const lens = (map) => { const r = ff(["-hide_banner", "-i", file, "-map", map, "-f", "null", "-"], { allowFail: true }).stderr; const t = [...r.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop(); return t ? +t[1] * 3600 + +t[2] * 60 + +t[3] : 0; };
  if (meta.audio) { const dv = lens("0:v"), da = lens("0:a"); if (Math.abs(dv - da) > 0.15) warnings.push(`sound and picture differ in length by ${Math.abs(dv - da).toFixed(2)} s`); }
  const sil = meta.audio ? findSilences(file, { minDur: 0.3 }).list : [];
  sil.filter((s) => s.to - s.from >= 0.9).forEach((s) => warnings.push(`silence of ${(s.to - s.from).toFixed(1)} s at ${s.from.toFixed(1)} s`));
  const black = ff(["-hide_banner", "-i", file, "-an", "-vf", "blackdetect=d=0.3:pix_th=0.1", "-f", "null", "-"], { allowFail: true }).stderr;
  [...black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].forEach((m) => warnings.push(`black picture from ${(+m[1]).toFixed(1)} to ${(+m[2]).toFixed(1)} s`));
  if (meta.audio) {
    const r = ff(["-hide_banner", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], { allowFail: true }).stderr;
    const lufs = r.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0];
    const peak = r.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop()?.match(/-?[\d.]+/)?.[0];
    if (lufs !== undefined) { notes.push(`loudness ${lufs} LUFS`); if (+lufs < -21) warnings.push(`quiet sound (${lufs} LUFS). Phones play around minus 14`); if (+lufs > -9) warnings.push(`very loud sound (${lufs} LUFS)`); }
    if (peak !== undefined && +peak > -0.3) warnings.push(`the sound touches the maximum (${peak} dBFS) and may crackle`);
  }
  if (transcript && expectedWords && meta.audio) {
    const heard = await transcribeWords({ input: file, data: DATA, ff: (a) => ff(a), fail, out: () => {} });
    const t = transcriptWarnings(expectedWords, heard);
    warnings.push(...t.warnings);
    notes.push(t.note);
  }
  return { warnings, notes, meta };
}

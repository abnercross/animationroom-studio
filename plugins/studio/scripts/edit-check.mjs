// Edit mode checks. Two kinds:
//   planCheck   the plan, before anything renders (pace, no invented facts, frame flapping)
//   videoCheck  the finished file (length, sound, long silences, black frames, loudness, leftover fragments)
import fs from "node:fs";
import { ALIGN, DATA, ff, fail, probe } from "./edit-core.mjs";
import { findSilences } from "./edit-analyze.mjs";
import { transcribeWords } from "./speech.mjs";
import { findRestarts } from "./edit-cuts.mjs";
import { DRAWINGS, matches } from "./edit-draw.mjs";

const norm = (s) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
// For comparing what was said with what was meant: "2." and "two", "ok" and "okay" are the same.
const DIGIT_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const same = (w) => { const n = norm(w); if (/^\d+$/.test(n) && +n <= 20) return DIGIT_WORD[+n]; if (n === "ok") return "okay"; return stem(n); };
const NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

// ---------- the plan ----------
export function planCheck({ moments, words, duration, drawings }) {
  const errors = [], warnings = [];
  const spoken = new Set(words.map((w) => norm(w[2])).filter(Boolean));
  const spokenStems = new Set([...spoken].map(stem));
  const spokenNums = new Set();
  words.forEach((w) => { const n = norm(w[2]); if (/^\d+$/.test(n)) spokenNums.add(+n); if (NUM[n] !== undefined) spokenNums.add(NUM[n]); if (ORD[n]) spokenNums.add(ORD[n]); });

  // Pace: something should change on screen every few seconds, and the frame should not flap.
  const sorted = [...moments].sort((a, b) => a.from - b.from);
  let t = 0;
  for (const m of sorted) {
    if (m.from - t > 4.5) warnings.push(`no text on screen from ${t.toFixed(1)} to ${m.from.toFixed(1)} s (${(m.from - t).toFixed(1)} s). Nothing was said there to show`);
    t = Math.max(t, m.to);
  }
  if (duration - t > 4.5) warnings.push(`no text on screen from ${t.toFixed(1)} s to the end`);
  const covered = sorted.reduce((s, m) => s + (m.to - m.from), 0);
  if (covered / duration < 0.5) warnings.push(`graphics cover only ${Math.round((covered / duration) * 100)}% of the video`);
  // The rule: typography on screen at every moment of speech. The system fills the gaps, so this should never fire.
  // (A drawing with no headline carries no text itself: the spoken words beside it do.)
  const carries = (m) => !(m.type === "visual" && !m.text);
  const bare = words.filter((w) => !sorted.some((m) => carries(m) && w[0] >= m.from - 0.001 && w[0] <= m.to + 0.001));
  if (bare.length) warnings.push(`${bare.length} spoken word(s) have no text on screen, starting at ${bare[0][0].toFixed(1)} s ("${bare[0][2]}")`);
  const graphics = sorted.filter((m) => m.type !== "words");
  sorted.forEach((m, i) => {
    if (m.type === "words") return; // typography is made by the system, from the speech
    const prev = sorted.slice(0, i).reverse().find((x) => x.type !== "words");
    if (prev && (prev.layout ?? "window") === "window" && (m.layout ?? "window") === "window" && m.from - prev.to > 1.0 && m.from - prev.to < 1.8)
      warnings.push(`the frame closes and reopens between ${prev.to.toFixed(1)} and ${m.from.toFixed(1)} s. Joining the two moments, or leaving at least 1.8 s, looks calmer`);
    const gi = graphics.indexOf(m);
    const kind = (x) => (x.type === "visual" ? `visual ${x.text ? "with text" : "alone"}` : x.type); // a drawing alone and a drawing with a headline are different pictures
    if (gi >= 2 && kind(graphics[gi - 1]) === kind(m) && kind(graphics[gi - 2]) === kind(m)) warnings.push(`three ${m.type} moments in a row at ${m.from.toFixed(1)} s. Vary the blocks`);
    if (m.to - m.from < 1.6 && m.type !== "number") warnings.push(`the ${m.type} at ${m.from.toFixed(1)} s is on screen for only ${(m.to - m.from).toFixed(1)} s. Too short to read comfortably`);
  });
  // Frame openings, counting each stretch where the person is in the frame once.
  let openings = 0, lastWin = -9;
  sorted.filter((m) => (m.layout ?? "window") === "window").forEach((m) => { if (m.from - lastWin >= 1.0) openings++; lastWin = m.to; });
  if (openings > Math.max(3, duration / 6)) warnings.push(`the frame opens ${openings} times in ${duration.toFixed(0)} s. That is a lot of change. Fewer, longer stretches feel calmer`);

  // Drawings: each one is tied to a word the person says and appears on it, and there are as many as the member asked for.
  const visuals = sorted.filter((m) => m.type === "visual");
  for (const v of visuals) {
    const at = v.at ?? v.from, where = `the ${v.draw} drawing at ${v.from.toFixed(1)} s`;
    if (at < v.from - 0.01 || at > v.to) errors.push(`${where}: "at" (${at} s) must fall inside the moment`);
    else if (!words.some((w) => Math.abs(w[0] - at) <= 0.35)) errors.push(`${where} is not tied to a spoken word: nothing is said at ${at} s. Set "at" to a word the person says there, like "@word"`);
    const said = words.filter((w) => w[0] >= v.from - 0.5 && w[0] <= v.to + 0.3).map((w) => w[2]);
    if (DRAWINGS[v.draw] && !matches(v.draw, [...said, ...String(v.text || "").split(/\s+/)])) warnings.push(`${where}: none of the words said there are on this drawing's list ("${said.join(" ").slice(0, 60)}"). Keep it only if the link to what is said is plain to see`);
    if (!v.text && said.length && !sorted.some((m) => m.type === "words" && m.beside && m.from < v.to && m.to > v.from)) warnings.push(`${where} has speech during it but no words beside it`);
  }
  const twice = visuals.map((v) => v.draw).filter((d, i, a) => a.indexOf(d) !== i);
  if (twice.length) warnings.push(`the ${[...new Set(twice)].join(", ")} drawing is used more than once. A different drawing for each idea reads better`);
  if (drawings === "none" && visuals.length) warnings.push(`the member asked for no drawings, but the plan has ${visuals.length}`);
  const most = drawings === "few" ? Math.max(2, Math.round(duration / 10)) : drawings === "lots" ? Math.max(3, Math.round(duration / 5)) : Infinity;
  if (visuals.length > most) warnings.push(`${visuals.length} drawings is more than "${drawings}" means for a ${duration.toFixed(0)} s video (about ${most} at most)`);

  // No invented facts: every number must be said, and every word on screen should have been said.
  const texts = [];
  for (const m of sorted.filter((x) => x.type !== "words")) {
    for (const f of ["text", "kicker", "heading", "label", "action", "name", "role", "prefix", "suffix"]) if (m[f]) texts.push([m, f, m[f]]);
    (m.items || []).forEach((it) => texts.push([m, "item", it.text]));
    if (m.type === "number" && typeof m.value === "number" && ![...spokenNums].some((n) => n === m.value) && !(m.value > 1000 && !errors.length))
      errors.push(`the number ${m.value} at ${m.from.toFixed(1)} s is not said in the video. Only show numbers the person says`);
  }
  for (const [m, f, s] of texts) {
    if (f === "name" || f === "role" || f === "action") continue; // identity details the member supplies
    for (const tok of s.split(/\s+/)) {
      const n = norm(tok);
      if (!n) continue;
      if (/\d/.test(n)) { if (!spokenNums.has(+n.replace(/\D/g, ""))) errors.push(`"${tok}" on screen at ${m.from.toFixed(1)} s is a number the person does not say`); continue; }
      if (n.length <= 2 || spoken.has(n) || spokenStems.has(stem(n))) continue;
      if (m.type === "visual" && f === "label") errors.push(`"${tok}" in the label of the drawing at ${m.from.toFixed(1)} s is not a word the person says. A label may only use their words`);
      else warnings.push(`"${tok}" on screen at ${m.from.toFixed(1)} s is not a word the person says. Use their words`);
    }
  }
  return { errors, warnings };
}

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
const runs = (idx) => { const out = []; let cur = []; idx.forEach((x) => { if (cur.length && x !== cur[cur.length - 1] + 1) { out.push(cur); cur = []; } cur.push(x); }); if (cur.length) out.push(cur); return out; };

// What the viewer hears. The edited video's own transcript is searched for a phrase said twice (a restart that
// was not cut) and for words that were meant to stay but cannot be heard. The first check is exact; the second
// compares two transcripts of the same sound, so it is only a hint.
export function transcriptWarnings(expectedWords, heard, silences = []) {
  const warnings = [];
  const hw = heard.filter((w) => norm(w[2]));
  const dropped = findRestarts(hw, silences.filter((s) => s.to - s.from >= 0.3));
  runs([...dropped.keys()].sort((x, y) => x - y)).forEach((r) => warnings.push(`a phrase is said twice here, around ${hw[r[0]][0].toFixed(1)} s: "${r.map((x) => hw[x][2]).join(" ")}"`));
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
    const t = transcriptWarnings(expectedWords, heard, sil);
    warnings.push(...t.warnings);
    notes.push(t.note);
  }
  return { warnings, notes, meta };
}

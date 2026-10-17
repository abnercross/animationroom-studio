// Edit mode step 1: measure the video, find every silence in its sound, and transcribe it, all on one clock
// (video time). Writes analysis.json next to the job's other files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ALIGN, DATA, ff, ffRaw, fail, out, probe, writeJson } from "./edit-core.mjs";
import { transcribeWords } from "./speech.mjs";

// Silence is relative to how loud this recording is, so a quiet room and a loud one both work.
function loudness(video) {
  const r = ff(["-hide_banner", "-i", video, "-vn", "-af", `${ALIGN},volumedetect`, "-f", "null", "-"], { allowFail: true }).stderr;
  const mean = r.match(/mean_volume: (-?[\d.]+) dB/);
  return mean ? +mean[1] : -25;
}
export function findSilences(video, { noise, minDur = 0.3 } = {}) {
  const level = noise ?? Math.max(-42, Math.min(-30, loudness(video) - 13));
  const r = ff(["-hide_banner", "-i", video, "-vn", "-af", `${ALIGN},silencedetect=noise=${level}dB:d=${minDur}`, "-f", "null", "-"], { allowFail: true }).stderr;
  const starts = [...r.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, +m[1]));
  const ends = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const list = starts.map((a, i) => ({ from: +a.toFixed(2), to: +(ends[i] ?? a).toFixed(2) })).filter((s) => s.to > s.from);
  return { level, list };
}

// How loud the sound is every 10 milliseconds, in dB (whole numbers). Cuts are placed in its quiet valleys.
export function energyCurve(video) {
  const buf = ffRaw(["-v", "error", "-i", video, "-vn", "-af", ALIGN, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]);
  const n = Math.floor(buf.length / 2 / 80);
  const curve = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < 80; k++) { const v = buf.readInt16LE((i * 80 + k) * 2) / 32768; sum += v * v; }
    curve[i] = Math.max(-90, Math.round(10 * Math.log10(sum / 80 + 1e-10)));
  }
  return curve;
}

// The speech engine sometimes stamps several words with the same moment. Where that happens, transcribe just
// that stretch of sound again (between the silences around it) and use its timings instead.
async function repairWords(video, words, silences, duration) {
  const collapsed = (w) => w[1] - w[0] < 0.07;
  const runs = [];
  for (let i = 0; i < words.length; ) {
    let j = i;
    while (j + 1 < words.length && collapsed(words[j + 1]) && Math.abs(words[j + 1][0] - words[i][0]) < 0.3) j++;
    if (j - i + 1 >= 3 && collapsed(words[i])) runs.push([i, j]);
    i = j + 1;
  }
  if (!runs.length) return { words, repaired: 0 };
  const sil = silences.filter((s) => s.to - s.from >= 0.3);
  let out_ = words.slice();
  let repaired = 0;
  for (const [i, j] of runs.reverse()) {
    const mid = (words[i][0] + words[j][1]) / 2;
    const before = [...sil].reverse().find((s) => s.to <= mid);
    const after = sil.find((s) => s.from >= mid);
    const from = before ? before.to : 0, to = after ? after.from : duration;
    const tmp = path.join(os.tmpdir(), `ar-chunk-${process.pid}-${i}.wav`);
    ff(["-v", "error", "-y", "-i", video, "-vn", "-af", `${ALIGN},atrim=start=${Math.max(0, from - 0.1)}:end=${Math.min(duration, to + 0.1)},asetpts=PTS-STARTPTS`, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", tmp]);
    const again = await transcribeWords({ input: tmp, data: DATA, ff: (x) => ff(x), fail, out: () => {}, language: words.language });
    fs.rmSync(tmp, { force: true });
    const shift = Math.max(0, from - 0.1);
    const fresh = again.map((w) => [+(w[0] + shift).toFixed(2), +(w[1] + shift).toFixed(2), w[2]]);
    const keepBefore = out_.filter((w) => (w[0] + w[1]) / 2 < from - 0.05);
    const keepAfter = out_.filter((w) => (w[0] + w[1]) / 2 > to + 0.05);
    out_ = [...keepBefore, ...fresh, ...keepAfter];
    repaired += j - i + 1;
  }
  return { words: out_, repaired };
}

export async function analyze(video, workDir, prefix = "") {
  const meta = probe(video);
  if (!meta.audio) fail("this video has no sound, so there is no speech to edit around");
  const sil = findSilences(video);
  let words = await transcribeWords({ input: video, data: DATA, ff: (a) => ff(a), fail, out });
  if (!words.length) fail("no speech was found in this video");
  const fixed = await repairWords(video, words, sil.list, meta.duration);
  const language = words.language;
  words = fixed.words;
  if (fixed.repaired) out("TIMING_REPAIRED", fixed.repaired);
  const a = { video: path.basename(video), ...meta, language, noiseDb: sil.level, silences: sil.list, words, energy: energyCurve(video) };
  fs.mkdirSync(workDir, { recursive: true });
  writeJson(path.join(workDir, `${prefix}analysis.json`), a);
  writeJson(path.join(workDir, `${prefix}words.json`), words);
  return a;
}

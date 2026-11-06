// Speech to words with exact timing, for Animate (voiceovers) and Edit (videos). Uses the speech engine
// that `studio.mjs transcriber install` put in the data folder, built with whichever render engine is installed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// Languages members are likely to use, for plain messages. Anything else is shown by its code.
export const LANGUAGE_NAMES = { en: "English", pt: "Portuguese", es: "Spanish", fr: "French", de: "German", it: "Italian", nl: "Dutch", pl: "Polish", ru: "Russian", tr: "Turkish", ar: "Arabic", hi: "Hindi", ja: "Japanese", ko: "Korean", zh: "Chinese", sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish", cs: "Czech", ro: "Romanian", uk: "Ukrainian", el: "Greek", he: "Hebrew", id: "Indonesian", vi: "Vietnamese", th: "Thai", ca: "Catalan", hu: "Hungarian" };
export const languageName = (code) => LANGUAGE_NAMES[code] || code;
// One multilingual model does every language and finds the language by itself (whisper.cpp reports it in its result).
export const SPEECH_MODEL = "medium"; // about 1.5 GB, the only speech download
// Installs made before plugin 0.16 hold the English only model "medium.en". It quietly translates any other language
// into rough English, so those installs keep the old check: the small "tiny" model finds the language first, and
// another language needs the multilingual model downloaded. Reinstalling the speech engine moves them to one model.
export const DETECT_MODEL = "tiny"; // old installs only
export const WORLD_MODEL = "medium";

// The language spoken in the first 30 seconds, like "pt". Needs the speech engine and the small model.
function detectLanguage(whisperDir, wav16) {
  const bin = ["main", "main.exe"].map((b) => path.join(whisperDir, "whisper.cpp", b)).find((b) => fs.existsSync(b));
  const model = path.join(whisperDir, "models", `ggml-${DETECT_MODEL}.bin`);
  if (!bin || !fs.existsSync(model)) return null;
  const r = spawnSync(bin, ["-m", model, "-f", wav16, "-l", "auto", "-dl"], { encoding: "utf8", maxBuffer: 1e8 });
  const m = /auto-detected language:\s*([a-z]{2,3})/.exec(`${r.stdout}\n${r.stderr}`);
  return m ? m[1] : null;
}

// Signs that the speech engine looped instead of listening: a run of 8 or more words said again straight away,
// word for word, or a word that ends before it starts. A person rarely repeats 8 words in a row exactly; when
// they did, listening again gives the same repeat, so the first version is kept.
export function looksWrong(words) {
  const norm = words.map((w) => w[2].toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
  if (words.some((w) => w[1] < w[0] - 0.05)) return true;
  for (let k = 8; k * 2 <= norm.length; k++) {
    for (let i = 0; i + 2 * k <= norm.length; i++) {
      let same = true;
      for (let j = 0; j < k && same; j++) same = norm[i + j] === norm[i + k + j];
      if (same) return true;
    }
  }
  return false;
}

// Where to cut a recording for listening again: in the middle of pauses, so no word is split, with pieces of
// at least 6 seconds (enough for the engine to follow a sentence) and at most 25 (inside one listening window).
function piecesAtPauses(ff, wav16) {
  const r = ff(["-hide_banner", "-i", wav16, "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"]);
  const log = String(r.stderr);
  const total = +(/Duration: (\d+):(\d+):([\d.]+)/.exec(log) || [0, 0, 0, 0]).slice(1).reduce((s, v, i) => s + v * [3600, 60, 1][i], 0);
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, +m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const mids = starts.map((s, i) => (s + (ends[i] ?? total)) / 2);
  const cuts = [];
  let from = 0;
  for (const m of mids) {
    while (m - from > 25) { cuts.push(from + 25); from += 25; }
    if (m - from >= 6 && total - m >= 1) { cuts.push(m); from = m; }
  }
  while (total - from > 25) { cuts.push(from + 25); from += 25; }
  const edges = [0, ...cuts, total];
  return edges.slice(1).map((b, i) => [+edges[i].toFixed(3), +b.toFixed(3)]);
}

// input: any audio or video file. ff(args) runs ffmpeg. Returns [[start, end, word], ...] in seconds, with the
// spoken language on the result as words.language. language: a code like "pt" to skip the check.
export async function transcribeWords({ input, data: DATA, ff, fail, out, language }) {
  const runtime = ["runtime", "runtime-edit"].map((d) => path.join(DATA, d)).find((d) => fs.existsSync(path.join(d, "node_modules")));
  const importRuntime = (name) => import(pathToFileURL(createRequire(path.join(runtime, "package.json")).resolve(name)).href);
  const audio = input;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ar-"));
  const wav16 = path.join(tmp, "vo16.wav");
  // first_pts=0 pads the sound to start where the picture starts, so every word time is a video time.
  ff(["-v", "error", "-y", "-i", audio, "-vn", "-af", "aresample=async=1:first_pts=0", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav16]);
  const whisperDir = path.join(DATA, "whisper");
  let words;
  if (fs.existsSync(path.join(whisperDir, ".ready"))) {
    const ready = readJson(path.join(whisperDir, ".ready"));
    const w = await importRuntime("@remotion/install-whisper-cpp");
    const models = path.join(whisperDir, "models");
    const legacy = ready.model.endsWith(".en");
    // Old English only installs: fetch the small language check model once (about 75 MB, under a minute).
    if (legacy && !language && !fs.existsSync(path.join(models, `ggml-${DETECT_MODEL}.bin`))) {
      console.error("Getting the small language check file for the speech engine (about 75 MB, once)...");
      try { await w.downloadWhisperModel({ model: DETECT_MODEL, folder: models, printOutput: false }); } catch { /* without it, English is assumed */ }
    }
    // The multilingual model finds the language itself ("auto"); the answer is read from its result below.
    let lang = language || (legacy ? detectLanguage(whisperDir, wav16) || "en" : "auto");
    if (legacy) {
      out("LANGUAGE", lang);
      out("LANGUAGE_NAME", languageName(lang));
    }
    let model = ready.model;
    if (lang !== "en" && lang !== "auto" && model.endsWith(".en")) {
      model = WORLD_MODEL;
      if (!fs.existsSync(path.join(models, `ggml-${model}.bin`))) {
        out("LANGUAGE_MODEL", "missing");
        out("LANGUAGE_DOWNLOAD", "1.5 GB");
        fail(`this recording is in ${languageName(lang)}. The speech engine needs a one time 1.5 GB download for ${languageName(lang)} (10 to 20 minutes). Ask the member first, then run: studio.mjs transcriber install --language ${lang}`);
      }
    }
    // Exact word timing (DTW) needs a model whisper.cpp 1.5.5 knows. Older installs may have large-v3-turbo.
    const DTW_OK = ["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large-v1", "large-v2", "large-v3"];
    const exact = DTW_OK.includes(model);
    if (!exact) out("TRANSCRIBER_UPGRADE", `the ${model} model gives slightly looser word timing. For exact timing run: studio.mjs transcriber install --model medium.en`);
    const listen = async (additionalArgs, inputPath = wav16) => {
      const res = await w.transcribe({
        inputPath,
        whisperPath: path.join(whisperDir, "whisper.cpp"),
        whisperCppVersion: ready.whisperCpp,
        model,
        modelFolder: models,
        language: lang,
        tokenLevelTimestamps: exact,
        splitOnWord: !exact,
        tokensPerItem: 1,
        printOutput: false,
        additionalArgs,
      });
      const { captions } = w.toCaptions({ whisperCppOutput: res });
      // Tokens that start with a space begin a new word; the rest attach to the previous word.
      const list = [];
      for (const c of captions) {
        const txt = c.text;
        if (!txt.trim() || /^\s*\[.*\]\s*$/.test(txt)) continue;
        if (/^\s/.test(txt) || !list.length) list.push([c.startMs / 1000, c.endMs / 1000, txt.trim()]);
        else {
          const last = list[list.length - 1];
          last[1] = c.endMs / 1000;
          last[2] += txt.trim();
        }
      }
      return { res, words: list.map(([a, b, t]) => [+a.toFixed(2), +b.toFixed(2), t]) };
    };
    let { res, words: heard } = await listen();
    // The speech engine can fall into a loop: on one 17 s phone video it replaced the first 8 seconds with a copy
    // of the sentence that follows. When the words look like that, listen again in pieces cut at the pauses (each
    // piece the usual way, and one guess at a time if a piece still loops), and keep that version if it is clean.
    if (looksWrong(heard)) {
      const again = [];
      for (const [a, b] of piecesAtPauses(ff, wav16)) {
        const piece = path.join(tmp, `piece-${a.toFixed(2)}.wav`);
        ff(["-v", "error", "-y", "-i", wav16, "-af", `atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS`, "-c:a", "pcm_s16le", piece]);
        let part = (await listen(undefined, piece)).words;
        if (looksWrong(part)) part = (await listen(["--beam-size", "1", "--best-of", "1"], piece)).words;
        again.push(...part.map(([s, e, t]) => [+(s + a).toFixed(2), +(e + a).toFixed(2), t]));
      }
      if (again.length && !looksWrong(again)) {
        heard = again;
        out("SPEECH_RETRIED", "yes");
      }
    }
    if (lang === "auto") {
      lang = (res.result && res.result.language) || "en";
      out("LANGUAGE", lang);
      out("LANGUAGE_NAME", languageName(lang));
    }
    words = heard;
    words.language = lang;
  } else {
    // Claude's cloud workspace: faster whisper, when Python has it.
    const py = `
import numpy as np, json, sys, wave
from faster_whisper import WhisperModel
w = wave.open(sys.argv[1]); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
lang = sys.argv[2] or None
if not lang:
  _, info = WhisperModel('tiny', compute_type='int8').transcribe(a[:16000*30])
  lang = info.language
m = WhisperModel('base.en' if lang == 'en' else 'base', compute_type='int8')
s,_ = m.transcribe(a, word_timestamps=True, language=lang)
print(json.dumps({"language": lang, "words": [[round(x.start,2),round(x.end,2),x.word.strip()] for seg in s for x in seg.words]}))`;
    const r = spawnSync("python3", ["-c", py, wav16, language || ""], { encoding: "utf8", maxBuffer: 1e8 });
    if (r.status !== 0) {
      out("TRANSCRIBER", "missing");
      fail("the speech engine is not installed yet. Run: studio.mjs transcriber install");
    }
    const res = JSON.parse(r.stdout);
    words = res.words;
    words.language = res.language;
    out("LANGUAGE", res.language);
    out("LANGUAGE_NAME", languageName(res.language));
  }
  // Drop sound tags like [BLANK_AUDIO] that the speech engine adds, and anything left empty.
  const spoken = words.language;
  // Letters with accents count too: in Portuguese the tag is [silêncio]. A word with no letter or digit (a music
  // note the engine writes over a sound it cannot place) is dropped too.
  words = words.map((w) => [w[0], w[1], w[2].replace(/\s*[\[(][\p{L}_ ]+[\])]/gu, "").trim()]).filter((w) => /[\p{L}\p{N}]/u.test(w[2]));
  words.language = spoken;
  return words;
}

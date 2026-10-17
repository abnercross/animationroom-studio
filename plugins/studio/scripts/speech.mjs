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
    const res = await w.transcribe({
      inputPath: wav16,
      whisperPath: path.join(whisperDir, "whisper.cpp"),
      whisperCppVersion: ready.whisperCpp,
      model,
      modelFolder: models,
      language: lang,
      tokenLevelTimestamps: exact,
      splitOnWord: !exact,
      tokensPerItem: 1,
      printOutput: false,
    });
    if (lang === "auto") {
      lang = (res.result && res.result.language) || "en";
      out("LANGUAGE", lang);
      out("LANGUAGE_NAME", languageName(lang));
    }
    const { captions } = w.toCaptions({ whisperCppOutput: res });
    // Tokens that start with a space begin a new word; the rest attach to the previous word.
    words = [];
    for (const c of captions) {
      const txt = c.text;
      if (!txt.trim() || /^\s*\[.*\]\s*$/.test(txt)) continue;
      if (/^\s/.test(txt) || !words.length) words.push([c.startMs / 1000, c.endMs / 1000, txt.trim()]);
      else {
        const last = words[words.length - 1];
        last[1] = c.endMs / 1000;
        last[2] += txt.trim();
      }
    }
    words = words.map(([a, b, t]) => [+a.toFixed(2), +b.toFixed(2), t]);
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
  words = words.map((w) => [w[0], w[1], w[2].replace(/\s*[\[(][A-Za-z_ ]+[\])]/g, "").trim()]).filter((w) => w[2]);
  words.language = spoken;
  return words;
}

---
name: edit
description: Animation Room Edit mode. Turns a recording of a person talking to camera into a finished edit: cuts the mistakes and silences, frames the person, adds simple graphics and dynamic typography tied to what they say. Use when the user says "edit my video", "edit this talking head", "cut the pauses and add graphics", drops in a video of themselves talking, or names an Edit style such as Clean Grid.
---

# Edit mode

Talking head video in, finished edit out. Everything runs on the member's own computer: the video never leaves it. Only the words (text) and a few preview pictures are read by Claude. Say this plainly if they ask about privacy.

The person is usually a beginner. Talk the way the setup guide does: plain words, one question at a time, you run every command, say how long before anything slow. Never paste raw command output. Never use hyphens, en dashes or em dashes, in on screen text or in your replies; use commas, full stops or separate sentences instead. Say "your videos folder", "the render engine" and "the speech engine", not technical names.

## How this mode works, in one paragraph

A ready made engine draws everything. You do not write video code. You fill in a short plan file (cuts, then moments), the scripts check it and render it. The work moves through gates, and **nothing moves past a gate until the member has approved it**: the cuts, then an 8 to 12 second sample, then the full video. Fixes change one entry in the plan and remake only that stretch. The original recording is never touched.

## Paths and helpers

- Plugin folder: `${CLAUDE_PLUGIN_ROOT}`. Studio data folder: `${CLAUDE_PLUGIN_DATA}`.
- Find the Node to use by running the setup check (`skills/setup/scripts/check.sh`, or `check.ps1` on Windows) and reading `NODE_USE`.
- `EDIT` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/edit.mjs"` and `STUDIO` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/studio.mjs"`. Always add `--data "${CLAUDE_PLUGIN_DATA}"`.
- Scripts end with `KEY=value` lines. `RESULT=failed` comes with a `REASON` written for the person; pass it on in your own words and do what it says. Lines starting `warning:` or `problem:` are for you to act on, not to read out.

## Step 0. Is everything ready?

1. Run the setup check. If `CLOUD_SESSION=yes`, explain that editing runs only on their own computer: open the Claude app, go to the **Code** tab and ask there. If `READY_EDIT=yes`, say nothing about setup, engines or updates and carry on. If `READY_EDIT=no`, run the setup skill in repair mode for exactly what `MISSING` lists first. An engine older than the plugin updates itself when the first command needs it: never ask about that.
2. The render engine for Edit is separate from the one for Animate. If `${CLAUDE_PLUGIN_DATA}/runtime-edit` does not exist or `EDIT` reports it is out of date, tell them it is a one time install of about a minute and run `STUDIO runtime install --engine edit`.
3. The speech engine: if the check says `SPEECH_ENGINE=not_yet`, tell them it is a one time 1.5 GB download (10 to 20 minutes) that understands every language, and run `STUDIO transcriber install`. If it prints `NEEDS_APPLE_TOOLS=yes`, follow the setup guide (Step 6), otherwise say nothing about developer tools.
4. Their videos folder: if `STUDIO config get videosFolder` is empty, run `STUDIO folders`, then tell them in plain words where it is (`VIDEOS_FOLDER`) and that it has three folders: **Drop videos here**, **Finished videos** and **Work in progress**. If it says the folder is in a synced place such as iCloud, use the suggested one instead.

## Step 1. The brief (ask only what is missing)

Ask one question at a time and skip anything they already told you:

1. What is the video for, and who watches it? (one sentence)
2. **Which shape: vertical (9:16, for Reels, TikTok and Shorts) or horizontal (16:9, for YouTube or a website)?** Put it in the plan as `"format"`. If they are unsure, suggest vertical for social media and horizontal for a lesson or a website. Both can be made from the same recording later (a second plan with the other format). A vertical recording made into a horizontal video shows the person as a tall strip beside the graphics; say so if it applies.
3. What should the viewer do at the end? (follow, save, book, nothing)
4. Which style? Offer **Clean Grid** unless they name another from `STUDIO` catalog listing.
5. **Do you want animated drawings too? None, a few, or lots.** A drawing is a small line picture that draws itself beside the words when the person says something it can show (a magnifier, a bottle and dropper, a target). Put the answer in the plan as `"drawings": "none"`, `"few"` or `"lots"`. If they are unsure, suggest a few.
6. Anything to keep exactly as it is? (a phrase, a pause, a name)

Everything that appears on screen must come from what the person says. Never add prices, numbers, results or promises. If they want a name and role shown at the end, ask for them and use exactly that.

If they have used Edit mode before, run `EDIT prefs show`. If it has saved looks, say so in one line and use them.

## Step 2. Pick the video

`EDIT start` (or `EDIT start "<path>"` if they gave a path; a file from elsewhere is copied into Drop videos here, never moved). It prints `VIDEO`, `PROJECT` (the project's folder name, like `20261013 Skin treatment`), `WORK_FOLDER` and `FINISHED_FOLDER`. Work in `WORK_FOLDER` from now on. The same name is used in both places: drafts and plans in Work in progress, every exported version in Finished videos. If they dropped the file into the chat instead of the folder, tell them kindly that the file stays on the computer: ask them to put it in Drop videos here.

## Step 3. Listen to the recording

`EDIT analyze "<VIDEO>" --work "<WORK_FOLDER>"`. It takes about a minute. It measures the sound, finds every silence, and writes the words with their times (`analysis.json`). If it prints `TIMING_REPAIRED`, that is fine, it fixed itself. It also prints the language they speak in (`LANGUAGE_NAME`). If it stops with `LANGUAGE_MODEL=missing`, this is an older install that still holds the English only speech model: explain in one line that the speech engine is being replaced by one that covers every language and takes less space, run `STUDIO transcriber install` (1.5 GB, it removes the old files), and analyze again. Never build an edit from words in the wrong language. All text on screen is in the language they speak.

## Step 4. Cuts (gate 1)

`EDIT cuts "<WORK_FOLDER>/analysis.json"`, then `EDIT cut "<VIDEO>" "<WORK_FOLDER>/cuts.json" --analysis "<WORK_FOLDER>/analysis.json" --out "<WORK_FOLDER>/edited.mp4"`.

What the cuts do: drop earlier tries when a phrase was said again (the last try wins), shorten long silences to a natural pause, cut only inside quiet moments, and fade the sound for a split second at every cut so nothing clicks.

Read the list that `cuts` prints. The speech engine can be wrong about timing, so use your judgement:
- If a dropped part looks like it contains something the person wanted to keep, set `"keep": true` for it in `cuts.json`.
- `cut` listens to its own result. Lines starting `warning:` tell you about a silence left over, or a phrase said twice. A phrase heard at the start of a part usually means the cut should start later. Open `analysis.json`, find the silence that ends just after the unwanted words, move that part's `from` to just before the silence ends (about 0.1 s earlier), and run `cut` again. Repeat until `CHECK=clean`.
- The words for everything that follows are in `edited.words.json` (made from the cut video itself, so they are exact).

**Tell the member what was cut, in plain words** ("I removed three false starts and 18 seconds of pauses, the video is now 42 seconds"), then ask them to watch `edited.mp4` (open it with `STUDIO open`). Wait for their yes. Nothing visual happens before that. If they say a cut is wrong, set that part back to keep or move its edge, and run `cut` again.

## Step 5. Find the face

`EDIT face "<WORK_FOLDER>/edited.mp4" --at 5` makes `face.png` with a red grid (10 by 10, heavier lines at the middle). Look at it and read, as fractions of the picture from the top left: `x` and `y` of the middle of the face (between the eyes and the nose) and `w`, how wide the head is. Write them into the plan as `"face": {"x": 0.55, "y": 0.52, "w": 0.33}`. After the plan exists, `EDIT track "<plan.json>"` follows the face through the video so the frame stays on the person if they move. If it warns that the face was lost often, check the numbers again.

## Step 6. The plan (the creative part)

Tell them the idea in 4 to 6 short lines first: what shows when, and how it ends. Then write `plan.json` in the work folder.

```json
{
  "style": "clean-grid",
  "format": "9:16",
  "video": "edited.mp4",
  "face": { "x": 0.55, "y": 0.52, "w": 0.33 },
  "moments": [
    { "type": "title", "from": "@why", "to": "@back+0.9", "kicker": "3 reasons", "text": "Why I always reassess a client" },
    { "type": "list", "from": 18.5, "to": 25.0, "heading": "I find out", "items": [
      { "text": "Nothing changed", "at": "@nothing" } ] }
  ]
}
```

Times are seconds on the edited video, or word references from `edited.words.json`: `"@reasons"`, `"@back+0.9"`, `"@know#2"` (second time that word is said).

**Moments (Clean Grid)**

| type | what it is | fields |
|---|---|---|
| `title` | the idea of this part, big | `text`, optional `kicker` (small label above) |
| `key` | one strong statement, one phrase underlined | `text`, optional `mark` (words from `text`), `kicker` |
| `list` | up to 3 short points in vertical (4 in horizontal) that build as they are said | `items` (each with `text` and `at`), optional `heading` |
| `number` | a figure counting up | `value`, optional `prefix`, `suffix`, `decimals`, `label` |
| `cta` | the ask at the end | `text`, optional `action`, `name`, `role` |
| `visual` | a line drawing that draws itself on a spoken word | `draw` (a name from the library), `at` (the word it appears on), optional `text` with `kicker` and `mark` (a headline beside it), `label` |

Common fields: `layout` is `"window"` (default: the person moves into a frame and the graphic fills the page) or `"full"` (the person stays full screen and the text sits on a soft fade at the bottom, good for the ending). `tag` is a tiny label top left in window layout ("01"). 

**Typography rule (always).** There is visible typography on screen at every moment, and it always comes from the voiceover. Where a graphic is up, the graphic is the typography. Everywhere else the system fills the stretch automatically with the spoken words as large, changing type: a phrase at a time, every word of it, each word lighting up as it is spoken, the key word underlined. You never write these. The layouts change from phrase to phrase (a big phrase low on the person, stacked lines, one huge key word, a phrase in the grid area beside the frame, and the ordinary subtitle strip as one option among them), and the person's frame opens for some stretches and not others. A new phrase takes over from the last with no gap, so nothing blinks. So plan graphics for the ideas that deserve one, and leave the rest to the typography; do not try to cover every second with a graphic. `"typography": {"strip": false}` at the top of the plan turns the ordinary subtitle strip layout off if the member does not want it. Do not write a `captions` field (it is no longer used).

**Drawings (only if the member asked for them).** A `visual` moment puts one drawing from the library on the page beside the person's frame. `EDIT drawings --words "<WORK_FOLDER>/edited.words.json"` lists every drawing with what it stands for, and prints `suggest:` lines: the spoken words that match a drawing, already written as word references. They are suggestions only. You decide, and you may pick a drawing the list did not suggest when the link to what is said is plain to see.

```json
{ "type": "visual", "from": 3.2, "to": 7.0, "draw": "magnifier", "at": "@actually", "kicker": "One", "text": "What's actually going on with your skin", "mark": "actually going on" }
{ "type": "visual", "from": 7.0, "to": 9.8, "draw": "branches", "at": "@concern" }
```

- With `text` the drawing sits next to its headline (use it in place of a `title` or `key` for that idea). Without `text` it stands alone and the spoken words run beside it on their own, so there is still type on screen.
- `at` is the spoken word the drawing appears on. It must be a word said inside the moment, and the drawing needs at least 1.5 seconds on screen after that, so choose an early word of the phrase and end the moment late enough.
- A drawing is always chosen from something the person says. Never use one to add an idea, and never invent a `label`: a label may only use the person's own words, and most drawings need none.
- How many: none means none. A few is about one every 10 to 15 seconds, for the main ideas only. Lots is up to about one every 5 seconds. Use each drawing once in a video.
- Drawings never cover the person and stay in the safe area. They are not available in the `full` layout.

How to plan it well:
- Read the whole transcript first. Find the ideas, one per moment. Use the person's own words on screen, short ones.
- Aim for a graphic every 4 to 8 seconds, for the ideas that deserve one. The stretches in between are filled with the spoken words as dynamic typography, so they are never empty.
- Keep each moment on screen at least 2 seconds, long enough to read. Vary the types; do not use the same type three times in a row.
- Neighbouring window moments should touch or leave at least 1.8 seconds, so the frame does not close and reopen.
- Start full screen (the hook) when the first seconds are the person just saying hello, and end full screen when there is a closing line.
- Use a `number` only for a figure the person actually says. Never invent one.

Run `EDIT validate "<plan.json>" --words "<WORK_FOLDER>/edited.words.json"`. Fix every `problem:`. Read every `warning:` and decide: change the plan, or accept it knowingly. Validate also reports how much typography was generated (`TYPOGRAPHY_PHRASES`, `TYPOGRAPHY_LAYOUTS`). The checks cover:
- pace, frames closing and reopening, and graphics too short to read;
- any word or number on screen that the person did not say;
- text that will not fit its space, and list lines that would shrink too small;
- captions or graphics past the safe line where the app's buttons sit;
- the head cut off by the frame (top, sides or chin) at any point of the video, following the face track;
- end text, and any generated typography on full screen, sitting over the chin or face;
- drawings: tied to a spoken word, on screen long enough, inside the safe area, clear of the person and of their own text, words beside a drawing that stands alone, and no more drawings than the member asked for. Validate prints the count as `DRAWINGS`.

The fixes for layout warnings are look settings in the plan's `tokens`, for example `"tokens": {"window": {"anchorY": 0.5, "zoom": 1.0}}` for the head in the frame, or `"caption": {"y": 1450}` for the subtitle strip layout, or shorter text. Positions have separate starting values for each shape, so a change only affects the shape the plan is in. Look settings for 16:9 and 9:16 are saved separately.

## Step 7. Sample (gate 2)

`EDIT sample "<plan.json>" --words "<WORK_FOLDER>/edited.words.json"` makes a 10 second sample of the most varied stretch (`SAMPLE_FROM`, `SAMPLE_TO`; or add `--range 12,22` for a stretch they ask about). It takes under a minute. Open it for them and ask them to watch it on a phone if they can: is the person well framed, is the text easy to read, is it calm enough? Wait for their answer. A sample they approve is the pattern for the whole video.

If they want a change, make it in `plan.json` (or in `tokens` for the look, for example `"tokens": {"window": {"zoom": 1.25}, "caption": {"size": 66}}`), and make the sample again. Change only what they asked.

## Step 8. The full video (gate 3)

Make a draft first when they might want changes: `EDIT render "<plan.json>" --words "<...edited.words.json>"` (a draft in the work folder, checked as a file). When they are happy, make the final:

`EDIT render "<plan.json>" --words "<...edited.words.json>" --final --name "<short name of the video>" --note "<what this version is>"`

If the recording was quiet (phone recordings often are), the export raises the sound to a normal phone level on its own and prints `LOUDNESS=raised`; mention it in one line. It saves the plan as the next version (V01, V02, and so on, in the work folder), writes the video into this project's folder in **Finished videos** (`FINISHED_FOLDER`) as `<name> V01.mp4`, and then checks the file itself: length, sound, long silences, black frames, loudness, and it listens to the result for any phrase said twice. `CHECK=clean` means it passed. Any `warning:` lines are yours to fix before you hand it over, or to mention honestly.

Tell them where the file is, how long it is, and open it for them. Ask them to watch it from start to end once.

**Timeline preview (optional, offer it after the final).** `EDIT preview "<plan.json>" --words "<...edited.words.json>"` opens the edit on the Remotion timeline and prints `PREVIEW_URL`. Open that address (in the built in browser, or tell them to open it in their own). They see the video with its sound waveform, every graphic and every phrase of typography as its own named bar, and can scrub, pause and play. It shows the plan, not the exported file, so playback can be a little slower than the final video. If you change the plan, run `preview` again and ask them to reload the page. When they are done, `EDIT preview --stop`.

## Step 9. Fixes (only the part that is wrong)

Ask for each fix as: where, what is wrong, what it should be. Change only that entry in `plan.json` and make that stretch only:

`EDIT render "<plan.json>" --words "<...>" --range 12.5,20`

It remakes those seconds, plus a second either side so the joins can be judged. Show it. If the same problem comes back, stop trying things: look for the cause (the validate warnings, the face guide, the cuts) and make the smallest change. When approved, make a new final; it becomes the next version and the earlier one stays untouched.

If a fix is to the cuts (a clipped word, a leftover pause), change `cuts.json`, run `cut` again, and then run `EDIT track` and `validate` again before rendering, because the times moved.

## Step 10. Keep what worked

When they approve the final, ask: "Would you like me to remember this look for your next videos?" If yes, put the look changes they approved into the plan's `"tokens"` and run `EDIT prefs save "<plan.json>"`. This saves only the look (caption size, frame size and position), never the words or facts of this video. Next time, `EDIT prefs show` and use them.

Saved looks are kept separately for each shape (9:16 and 16:9). Offer once, in one line, to make a variation: `EDIT variant "<plan.json>" --name B --set moments.0.text="Another title" --note "testing a different opening"` makes a copy with that one change and records it in `variations.csv` in the work folder. Render it as its own final. Say honestly that a preview cannot tell them which version will perform better.

When they are done with the project, tell them in one line that Drop videos here can be kept empty and offer: "Shall I move your original recording into the project folder so Drop videos here stays empty?" Only after a yes, run `STUDIO project --project "<PROJECT>" --original "<VIDEO>"`; it moves the recording into `Original` inside the project's Finished videos folder. If they ask for a fix later that needs the recording again (a new cut), use it from there. Then offer to clear the work folder for this job (the cut video and drafts are large). Only delete after they say yes, and never touch the original or Finished videos.

## Rules that always hold

- The original recording is never changed or deleted. It is only moved, with their yes, from Drop videos here into the project's own Finished videos folder, never anywhere else.
- Everything on screen comes from what the person said. No invented numbers, names, prices or results. For health, money or similar topics, add no promises and no advice.
- Nothing past a gate without the member's yes: cuts, then sample, then the full video.
- One change at a time when fixing, and say what you left alone.
- Be honest about what you could not check. You have not watched the video play, you have seen still pictures and read the checks. Say so, and ask them to watch it.

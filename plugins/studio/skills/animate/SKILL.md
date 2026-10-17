---
name: animate
description: Animation Room Animate mode. Turns a voiceover into a finished animation in one of the member's Animation Room styles. Use when the user says "animate this voiceover", "make an animation in Blueprint style" (or any style name), "make a reel from this audio", pastes a request copied from the members page, or drops in a voiceover and names a style.
---

# Animate mode

Voiceover in, finished animation out. The person is usually a beginner. Talk the way the setup guide does: plain words, one question at a time, you run every command, say how long before anything slow. Never paste raw command output. Never use hyphens, en dashes or em dashes, in on screen text or in your replies; use commas, full stops or separate sentences instead.

## Paths and helpers

- Plugin folder: `${CLAUDE_PLUGIN_ROOT}`. Studio data folder: `${CLAUDE_PLUGIN_DATA}`.
- Find the Node to use by running the setup check (`skills/setup/scripts/check.sh`, or `check.ps1` on Windows) and reading `NODE_USE`.
- `ANIMATE` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/animate.mjs"` and `STUDIO` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/studio.mjs"`. Always add `--data "${CLAUDE_PLUGIN_DATA}"`.
- Scripts end with `KEY=value` lines. `RESULT=failed` comes with a `REASON` written for the person; pass it on in your own words and do what it says.

## Step 0. Is the studio ready?

Run the setup check. If `CLOUD_SESSION=yes`, explain that rendering in Claude's cloud is coming soon, and for now they should open the Claude app on their computer, go to the **Code** tab and ask there. If `READY_ANIMATE=yes`, go straight to Step 1 and say nothing about setup, engines, updates or the speech engine: the person has set up already and should never be asked again. If `READY_ANIMATE=no`, run the setup skill in repair mode for exactly what `MISSING` lists, then come back here. A render engine older than the plugin updates itself when the first command needs it (the script prints one line); never ask permission for that and never run the whole setup because of it.

## Step 1. The voiceover

- Ask for the audio file if they haven't dropped one in (mp3, wav or m4a, ideally 20 to 40 seconds, hook first, one call to action at the end).
- Pick a short topic name (two to four words, for example `Referred pain`). Run `STUDIO project --name "<Topic>"`. It makes the project's work folder and prints `PROJECT` (the folder name, like `20261013 Referred pain`), `WORK_FOLDER`, `FINISHED_FOLDER` (made when the first video is saved), `NEXT_VERSION` and `OUT_FILE`. If it says the videos folder is not set up, run `STUDIO folders` first. Copy the audio into `WORK_FOLDER` as `vo.<ext>`, leave the original where it is for now, and work in `WORK_FOLDER` from now on. A project is one folder name used twice: working files in Work in progress (safe to clear later), and every finished version in Finished videos.

## Step 2. The style

- If they didn't name one, run `ANIMATE styles` and offer the list in plain words.
- Styles marked `personal` in that list are the member's own: they live only in a folder on this computer (config `personalStylesDir`) and are never on the website. Treat them like any other style; `ANIMATE style <id>` prints `PERSONAL=yes` for them.
- `ANIMATE style <id>`, then **read the file in `GUIDE` in full**. It holds that style's look, safe zones and content rules, and it wins over anything in this file.
- `UPDATE_REQUIRED` means the style needs a newer studio: tell them to run `/plugin update studio` and restart Claude. `UPDATE_AVAILABLE` alone just gets one friendly line at the end.

## Step 3. Word timings

`ANIMATE transcribe vo.<ext> words.json`. If it says the speech engine is missing (`SPEECH_ENGINE=not_yet` in the check, or `TRANSCRIBER=missing`), tell them it is a one time 1.5 GB download (10 to 20 minutes) that understands every language, run `STUDIO transcriber install`, then try again. If it prints `NEEDS_APPLE_TOOLS=yes`, follow the setup guide (Step 6), otherwise say nothing about developer tools.

It also prints the language the voiceover is spoken in (`LANGUAGE`, `LANGUAGE_NAME`), found by the speech engine itself, so there is nothing to choose and nothing extra to download. If the language reported is plainly wrong, transcribe again with `--language <code>` (for example `--language en`). Older installs may instead stop with `LANGUAGE_MODEL=missing` or print `TRANSCRIBER_UPGRADE`: they still hold the old English only speech model. Explain in one line that the speech engine is being replaced by one that covers every language and takes less space, then run `STUDIO transcriber install` (1.5 GB, it removes the old files) and transcribe again. Never work from an English transcript of a voiceover in another language.

Read the words that are printed. The pauses between sentences are where scenes change. Every word on screen is written in the voiceover's language, taken from what is actually said.

## Step 4. Storyboard (the creative part)

Tell them the plan first in 4 to 6 short lines: one per scene, the element that travels through the whole video, and the ending. Adjust if they want changes. Then write `storyboard.json` in the project folder.

```json
{
  "style": "blueprint",
  "duration": "auto",
  "header": {"left": "TOPIC", "right": "SUBTITLE"},
  "scenes": [
    {"id": "hook", "start": 0, "end": 2.8, "camera": "push", "blocks": []},
    {"id": "cta", "start": 2.8, "end": "end", "camera": "still", "blocks": []}
  ],
  "overlay": []
}
```
Times are seconds or word references: `"@trapezius"`, `"@temple+0.15"`, `"@your#3"` (third time that word is spoken). `"end"` is the end of the video. `"variant"` picks a style variant such as `"dark"`. `overlay` holds blocks that live across scenes. Some styles add scene fields (`tint`, `cam`, `transition`) and a top level `cast`; the style guide says which. Some styles have blocks of their own (for example the `vox` blocks of the Vox look); their guide lists them in full.

**Block types (engine 1.3)**

| type | fields |
| --- | --- |
| `path` | `d` (SVG path in canvas pixels, 1080 x 1920), `at`, `dur`, `width` primary/secondary/construction or a number, `dashed` true or "dotted", `fill` fill/dark/hatch/bg, `color`, `arrow` true or "both", `pulse` |
| `morph` | `keys: [{t, d}, ...]` shape changes (same command structure morphs smoothly, anything else cross fades), `drawDur`, `dur` |
| `dot` | `x`, `y`, `r`, `ring`, `pulse`, `hollow` |
| `label` | `text`, `target: [x, y]`, `labelY`, `side` left or right, `sub` |
| `text` | `lines: [...]`, `kicker`, `y`, `size`, `align`, `x` |
| `note` | `text`, `x`, `y`, `size`, `align`, `color` |
| `counter` | `value`, `from`, `unit`, `caption`, `x`, `y`, `decimals`, `dur` |
| `ruler` | `x1`, `x2`, `y`, `ticks`, `band: [a, b]`, `marker`, `markerFrom`, `markerAt`, `ends` |
| `mark` | `kind` circle/box/underline/cross/tick/burst, `x`, `y` (centre of the thing marked), `w`, `h`, `color`, `dur`, `pulse`; burst also `rays`, `len` |
| `travel` | `d` (path the dot follows), `dur`, `r`, `color` |
| `cutout` | paper styles only. `d` or `shape` circle/ellipse/rect with `x`, `y`, `r`, `rx`, `ry`, `w`, `h`; `color`, `pattern` dots/lines/halftone/print, `enter` pop/drop/rise/left/right/slap, `exit` pop/peel/fly, `border`, `tape` true or 1, `bob`, `rotate`, `blocks: [...]` riding on it. Or `kind` star/heart/bolt/arrow/burst/drop with `x`, `y`, `size` for a ready cut sticker |
| `ransom` | paper styles only. `text` or `lines` (two rows at most), `y`, `size`, `x` |
| `face` | `x`, `y` (middle of the head), `size`, `mood` smile/grin/flat/wince/surprised/relief, `moods: [{t, mood}]` |
| `person` | cartoon styles only. `who` (a name in the storyboard's `cast`), `x`, `y` (feet), `scale`, starting pose, `keys: [{t, dur, ease, ...pose changes}]`. Pose fields are in the style guide |
| `prop` | cartoon styles only. `kind` (icons, set pieces and interface pieces; the style guide lists them), `x`, `y`, `size`, `color`, `text`, `enter`, `loop`, `litAt` |
| `shape` | cartoon styles only. `d` or `shape` circle/ellipse/rect, `color`, `enter` pop/fall/drop/rise/left/right/none, `loop` float/pulse/beat/spin/sway |
| `badge` | cartoon styles only. `text` (chapter number), `color`, `hold` |
| `hero` | Abstract Geometry only. One shape that morphs (ready made shapes, or ones drawn in a top level `shapes`; the style guide lists both), squashes, spikes, shatters, trails and glows. `x`, `y`, `r`, `shape`, `color`, `marker`, `loop`, `keys: [{t, dur, ease, x, y, r, rot, squash, sx, sy, shape, spike, color, shat, trail, core, glow, opacity}]` |
| `posterWord`, `posterHero`, `posterRing`, `posterCards`, `posterBanner`, `posterTile`, `posterSlots`, `posterSplit`, `posterGauge`, `posterSteps`, `posterRecap`, `posterJourney`, `posterButton`, `posterPanel`, `posterBar`, `posterArrow`, `posterSparks`, `posterStars` | Space Age Poster only. Printed poster pieces: words in two inks, the one hero object, a counting ring, cards, steps, a banner, opening tiles and letter slots, a split screen, a gauge, a fall from space, a recap and a button, plus panels, bars, arrows and sparkles. Scenes may use `transition` iris with `origin`. Which blocks to combine for which kind of speech, and every field, is in the style guide. |
| `splat` | brush styles. Ink splatter: `x`, `y`, `r`, `seed`, `drops` |
| `stamp` | brush styles. Ink stamp: `x`, `y`, `kind` round/square, `size`, `text`, `textSize`, `rotate` |
| `frame` | brush styles. Doodle border: `family` rough/dashed/cloud/zigzag/corners, `rect: [x, y, w, h]`, `dur` |
| `group` | `blocks: [...]`, `keys: [{t, x, y, scale, rotate, opacity, dur}]`, `origin` |

A storyboard may set `"format": "16:9"` (1920 x 1080) when the style supports it, and a scene may set `"transition": "swipe"` (brush styles). Every block also takes `out` (fade out time), `accent: true` (the single big reveal gets a thump and bell) and `sfx: false`. `color` is `ink`, `mid`, `soft`, `dark`, or one of the colour names the style's guide lists; a style without colours only has the first four. Which blocks suit a style, and how they look in it, is in that style's guide. Use `"camera": "still"` on scenes whose labels point at a drawing in `overlay`, so they stay lined up.

## Step 5. Check before rendering

1. `ANIMATE validate storyboard.json --words words.json`. Fix every problem it lists and run it again.
2. `ANIMATE stills storyboard.json --words words.json` makes a contact sheet (`FILE`). **Open the image and look at it yourself**: overlaps, labels crossing lines, text too low, anything that doesn't belong to this topic. Fix and repeat until it's clean. Then open it for them with `STUDIO open "<FILE>"`.

## Step 6. Render

Tell them it takes about a minute for every 20 seconds of video. Then:

`ANIMATE render storyboard.json --words words.json --vo vo.<ext> --out "<OUT_FILE>"`

It renders the picture, writes a matching score and sound effects, lowers the music under their voice, sets the loudness for social media and saves the music and effects as separate files next to the video, all in the project's own folder in Finished videos. A second version of the same topic gets the next name (`<Topic> V02.mp4`): run `STUDIO project --name "<Topic>"` again for it and use the new `OUT_FILE`, which keeps the earlier versions. Open the result with `STUDIO open "<FILE>"`.

## Step 7. Review the first version

Do this only for the first finished video of a topic: if `<WORK_FOLDER>/review.done` exists, skip to Step 8. Otherwise:

1. `ANIMATE review "<the finished mp4>" --out "<WORK_FOLDER>/review.png"`. It puts about ten evenly spaced frames from the real render on one sheet (`FILE`). Open it and look at every frame yourself.
2. Answer one question for the person: **What would you change to make this animation better and smoother?** Answer in two short groups, **Smoother** first, then **Better**, most important first inside each, at most five per group and fewer when fewer are real. Leave a group out if it has nothing in it.
   - Each change is one numbered item. It starts with a bold title that names the improvement itself (what to do, not where), and the title ends with the moment in brackets, written as minutes and seconds: `(00:15-00:17)` for a stretch, `(00:08)` for a single moment, `(00:23, 00:33)` for two. This time range is the one place a hyphen is allowed. After the title, one or two plain sentences: what is wrong and what you would do. Example: "**Ease the push and pull (00:15-00:17).** The block moves three times in a second and a half with no wind up. I would give it a small lean before each move and let it settle."
   - **Smoother** is about motion. Frames cannot show it, so read your own storyboard for it: moves with no wind up or settle, a turn or slide squeezed into well under a second, several changes landing in the same instant, words that vanish and come straight back, a camera that sits dead still for many seconds or moves in separate steps, things that pop out when they could turn into the next idea.
   - **Better** is about the picture and the meaning. Look on the sheet for: text crossing a drawing, empty or crowded stretches, a moment that does not match what is said, text too small or too low, weak contrast, an ending that is not clear.
   - If the video looks good, say so in one line and give only one optional polish idea. Never invent problems.
3. Be honest about the limit: you judged the look from still frames and the motion from the storyboard, and you have not watched it play or heard the sound. Say so in one line.
4. If the notes are mostly about fine detail (small objects, extra touches, richer drawings), add one sentence: for more detail they can raise the effort level in the Claude app's model picker and ask for a second version. You cannot change it for them. Do not mention effort otherwise.
5. Offer to apply the changes as a second version (render to a new file name, keep the first). Write an empty file `review.done` in `WORK_FOLDER` so this review never repeats for this video.

## Step 8. Wrap up

In a few lines: where the video is, the beats by timestamp (3 to 5 bullets), and easy variations (a style variant such as dark, a different ending, slower drawing).

If the voiceover is still in Drop videos here, ask once, in one line: "Shall I move your voiceover into the project folder so Drop videos here stays empty?" Only after a yes, run `STUDIO project --project "<PROJECT>" --original "<the voiceover in Drop videos here>"`; it moves the file into `Original` inside the project's Finished videos folder (it never moves a file that is not in Drop videos here). Offer, in a separate line, to clear the project's Work in progress folder; only after a yes, and never the Finished videos folder.

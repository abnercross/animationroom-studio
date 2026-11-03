---
name: edit
description: Animation Room Edit mode. Turns a recording of a person talking to camera into a finished edit: cuts the silences, then animates the idea of each sentence with the real characters, props and drawings of any Animation Room style, in one of three layouts: Cutout Above, Cutout Around or Frame. Use when the user says "edit my video", "edit this talking head", "cut the pauses and add animation", or drops in a video of themselves talking. Portuguese (Brazil) works too: "edite meu vídeo", "edite este vídeo meu falando", "corte as pausas e adicione animação". Answer in Portuguese when the person writes in Portuguese.
---

# Edit mode

Talking head video in, finished edit out. Everything runs on the member's own computer: the video never leaves it. Only the words (text) and a few preview pictures are read by Claude. Say this plainly if they ask about privacy.

The person is usually a beginner. Talk the way the setup guide does: plain words, one question at a time, you run every command, say how long before anything slow. Never paste raw command output. Never use hyphens, en dashes or em dashes, in on screen text or in your replies; use commas, full stops or separate sentences instead. Say "your videos folder", "the render engine" and "the speech engine", not technical names.

## Language

Reply in the language the person writes in, from the first message to the last. If they write in Portuguese (Brazil), everything you say stays in Portuguese for the whole project: questions, explanations, notes after a review, and the fixed sentences in this guide (say them in Portuguese, in your own words). Keep what the person sees on screen exactly as it is: the real folder names (Drop videos here, Work in progress, Finished videos), style names, and the button and menu names in the Claude app (Code, Plugins, Add). Words on screen in a video follow the language of the voiceover, not the language of the chat. The rule about hyphens and dashes holds in Portuguese too.

## How this mode works, in one paragraph

The person gets two things: a clean edit of their recording, then a style applied to it. You write the scenes for this one video in Remotion, following Remotion's own official skills, inside a small project that already has the layers, captions, sound and checks. The work moves through gates, and **nothing moves past a gate until the member has approved it**: the cuts, then the scene table, then a sample of about 10 seconds, then the full video. The original recording is never touched. If they ask for Clean Grid (an older editing look), tell them kindly it was replaced by this one, and offer a calm style such as Blueprint instead.

## Paths and helpers

- Plugin folder: `${CLAUDE_PLUGIN_ROOT}`. Studio data folder: `${CLAUDE_PLUGIN_DATA}`.
- Find the Node to use by running the setup check (`skills/setup/scripts/check.sh`, or `check.ps1` on Windows) and reading `NODE_USE`.
- `EDIT` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/edit.mjs"` and `STUDIO` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/studio.mjs"`. Always add `--data "${CLAUDE_PLUGIN_DATA}"`.
- Scripts end with `KEY=value` lines. `RESULT=failed` comes with a `REASON` written for the person; pass it on in your own words and do what it says. Lines starting `warning:` or `problem:` are for you to act on, not to read out.
- Commands below run the same way: `EDIT prepare`, `EDIT cutout`, `EDIT project`, and so on, always with `--data`.
- Video tools (ffmpeg): the studio looks after them. The scripts find a full copy or install one into the studio folder by themselves (one line on screen, about a minute, once). Never install ffmpeg yourself (no brew, winget or downloads) and never ask the person about it. If you need to cut or convert a file yourself, run `STUDIO ffmpeg install` and use the `FFMPEG_PATH` it prints.

## Step 0. Is everything ready?

1. Run the setup check. If `CLOUD_SESSION=yes`, explain that editing runs only on their own computer: open the Claude app, go to the **Code** tab and ask there. If `READY_EDIT=yes`, say nothing about setup, engines or updates and carry on. If `READY_EDIT=no`, run the setup skill in repair mode for exactly what `MISSING` lists first. An engine older than the plugin updates itself when the first command needs it: never ask about that.
2. The render engine for Edit is separate from the one for Animate. If `${CLAUDE_PLUGIN_DATA}/runtime-edit` does not exist or `EDIT` reports it is out of date, tell them it is a one time install of about a minute and run `STUDIO runtime install --engine edit`.
3. The speech engine: if the check says `SPEECH_ENGINE=not_yet`, tell them it is a one time 1.5 GB download (10 to 20 minutes) that understands every language, and run `STUDIO transcriber install`. If it prints `NEEDS_APPLE_TOOLS=yes`, follow the setup guide (Step 6), otherwise say nothing about developer tools.
4. Their videos folder: if `STUDIO config get videosFolder` is empty, run `STUDIO folders`, then tell them in plain words where it is (`VIDEOS_FOLDER`) and that it has three folders: **Drop videos here**, **Finished videos** and **Work in progress**. If it says the folder is in a synced place such as iCloud, use the suggested one instead.

5. **First use of the new Edit.** Run `EDIT prepare`. It is quick and only does work once: it brings the edit engine up to date and fetches Remotion's official skills into the studio's own folder, where they stay out of the person's list of skills. If it did anything slow, say in one line "getting the editor ready, this only happens once". Its `REMOTION_SKILLS_FOLDER` is where you read them from in Step 7. If it prints `REMOTION_SKILLS=missing`, read https://www.remotion.dev/docs/ai/skills and try the procedure it gives in that same folder; if that fails too, carry on without them and do not mention it to the person.

## Step 1. The brief (ask only what is missing)

One question at a time, skipping anything they already told you:

1. What is the video for, and who watches it? (one sentence)
2. **Which style?** Show the names from `node animate.mjs styles` (in the scripts folder of the plugin), or take the one they named.
3. **Which layout: Cutout Above, Cutout Around or Frame?** (In Portuguese say Recorte Acima, Recorte ao Redor and Quadro.) Offer all three in one short line each:
   - **Cutout Above**: the person is cut out, and the animation plays in the free space above their head, like a strip of story over them. Calm, and the person stays the centre.
   - **Cutout Around**: the person is cut out and stands inside the style's world: characters beside them, things walking behind them, a few pieces in front of them (a heart on their chest). The most immersive.
   - **Frame**: the person sits in a frame that moves and changes shape with the story, and the animations live around it. A little faster to make, and suits videos with a lot of information.
   If they are unsure, suggest Cutout Around. A request from the members page may already say. Never pick for them without saying so: the layout changes the whole video.
4. Anything to keep exactly as it is? (a phrase, a pause, a name)

The first version is vertical 9:16. Everything on screen must come from what the person says: no invented prices, numbers, results or promises.

## Step 2. Pick the video

**Tip to give them once, in one line, before you start:** the edit uses the recording as it is, so they get the best result from one clean, final take. If they said a line twice or stumbled, they can trim it on their phone first or record that part again. Pauses and black frames are taken care of.

`EDIT start` (or `EDIT start "<path>"` if they gave a path; a file from elsewhere is copied into Drop videos here, never moved). It prints `VIDEO`, `PROJECT` (the project's folder name, like `20261013 Skin treatment`), `WORK_FOLDER` and `FINISHED_FOLDER`. Work in `WORK_FOLDER` from now on. The same name is used in both places: drafts and plans in Work in progress, every exported version in Finished videos. If they dropped the file into the chat instead of the folder, tell them kindly that the file stays on the computer: ask them to put it in Drop videos here.

## Step 3. Listen to the recording

`EDIT analyze "<VIDEO>" --work "<WORK_FOLDER>"`. It takes about a minute. It measures the sound, finds every silence, and writes the words with their times (`analysis.json`). If it prints `TIMING_REPAIRED`, that is fine, it fixed itself. It also prints the language they speak in (`LANGUAGE_NAME`). If it stops with `LANGUAGE_MODEL=missing`, this is an older install that still holds the English only speech model: explain in one line that the speech engine is being replaced by one that covers every language and takes less space, run `STUDIO transcriber install` (1.5 GB, it removes the old files), and analyze again. Never build an edit from words in the wrong language. All text on screen is in the language they speak.

## Step 4. Cuts (gate 1)

`EDIT cuts "<WORK_FOLDER>/analysis.json"`, then `EDIT cut "<VIDEO>" "<WORK_FOLDER>/cuts.json" --analysis "<WORK_FOLDER>/analysis.json" --out "<WORK_FOLDER>/edited.mp4"`.

What the cuts do: shorten long silences to a natural pause, remove black frames (phones leave one where the person trimmed the video), cut only inside quiet moments, and fade the sound for a split second at every cut so nothing clicks. Every word they said stays: their recording is their final take. Nothing is judged a retake, because a repeat is often said on purpose.

Read the list that `cuts` prints. Dropped parts are only silences and black pictures; a silence is measured from the sound itself, so leave them dropped.
- `cut` listens to its own result. Lines starting `warning:` tell you about a silence or black picture left over: look at that spot in `analysis.json`, adjust the part's edge, and run `cut` again until `CHECK=clean`.
- The words for everything that follows are in `edited.words.json` (made from the cut video itself, so they are exact).

**Tell the member what was cut, in plain words** ("I shortened the pauses, 6 seconds in all, and removed three black frames; the video is now 42 seconds"), then ask them to watch `edited.mp4` (open it with `STUDIO open`). Wait for their yes. Nothing visual happens before that. If they hear a false start or a line said twice that they do not want, offer two ways: record that part again, or tell you the words to remove, and you mark that stretch `"keep": false` in `cuts.json` (split a part at the silence around those words if needed) and run `cut` again. Only remove words they asked you to remove.

## Step 5. Find the face

`EDIT face "<WORK_FOLDER>/edited.mp4" --at 5` makes `face.png` with a red grid (10 by 10, heavier lines at the middle). Look at it and read, as fractions of the picture from the top left: `x` and `y` of the middle of the face (between the eyes and the nose) and `w`, how wide the head is. You give these to `EDIT project` in the next step as `--face x,y,w`, and it follows the face through the video. If it warns that the face was lost often, check the numbers again.

## Step 6. Set up the stage

For **Cutout Above** and **Cutout Around**: run `EDIT cutout "<WORK_FOLDER>/edited.mp4"`. Say first that it takes a few minutes. If it prints `QUALITY=poor` or fails, do not push on: look at a frame or two, and tell them in plain words that this recording is hard to cut out (for example busy background, or the person moves a lot), and suggest the Frame layout for this video. If they want a Cutout anyway, carry on and say what to expect.

Then `EDIT project "<WORK_FOLDER>" --mode above --style <id> --face x,y,w` (or `--mode around`, or `--mode frame`). It makes the project in `<WORK_FOLDER>/remotion`, sharing the installed engine, and prints the files you need. You only ever write `src/scenes.tsx` and `src/sound.json`. You may restyle `src/Captions.tsx`. Leave `Edit.tsx`, `kit.tsx`, `pieces.tsx`, `data.ts`, `Root.tsx` and the `src/animate` folder alone.

## Step 7. Read before writing

1. Read `<REMOTION_SKILLS_FOLDER>/remotion-best-practices/SKILL.md` and the parts it points you to for what this video needs (markup, and video if you touch it). Follow them.
2. Read the whole style guide (`STYLE_GUIDE`): its look and feel (colours, shapes, light, movement, sound, what things mean) and its pieces (cast, moods, poses, props, drawings). Open the reference sheets it names when it has them. You use the style's real pieces, see below.
3. Read the words in `src/data.ts`.

## The style's own pieces

An Edit video uses the same characters, props and drawings as Animate, so the member's hero looks the same in both modes and in every video. Never draw a style's character or one of its ready made props again by hand.

- `<Pieces blocks={[...]} />` from `pieces.tsx` draws Animate pieces. Write each block exactly as in an Animate storyboard (`person`, `prop`, `shape`, `path` and the style's own blocks, with `mood`, `pose`, `keys`, `enter`, `loop`, `out`), with times in seconds from `sec("word")` or `sec("word", 2)` instead of `@word`. Put it in `Behind` (passes behind the person or the frame) or `Stage`. `x`, `y` and `scale` on `Pieces` move a whole set, for example to follow the frame.
- The cast, drawings and choices go in `scenes.tsx` as `export const CAST = {...}`, `DRAWINGS = {...}` (draw anything, in the guide's format), and `VARIANT` or `PALETTE` when the member chose one. Follow the guide for the member's choices: the female hero, the male hero, colours.
- `<Scenery tint="peach" floor={555} />` is the style's own set (its chapter tint, soft glow and floor) for styles with tints. Use it in `Stage`, with `opacity` to fade one tint into the next.
- `colour("coral")` gives a palette colour by name for anything you draw yourself, and for `<Say>` text.
- Draw by hand only what no piece covers, in the style's look, and say so in your notes. Text still goes through `<Say>` in `Front`, never as text inside a piece.
- Styles without characters (Blueprint, Cobalt Halo and others) work the same way: their paths, rings, hero shapes and drawings are pieces too.
- Pieces are drawn in list order: something that sits on a character (a heart on the chest) comes after the character in the list.
- When the frame moves, a character changes place like a cut in Animate: end its block with `out` just before the move and start a new block for the new place once the frame has landed. A character keyed across the screen slides behind the frame.
- Pieces are as big as Animate makes them. Characters read well at `scale` 1 to 1.3.
- `<Pieces follow blocks={[...]} />` moves the pieces with the person's face: place them for the face where `FACE` in `data.ts` says it is (x times 1080, y times 1920), and they stay on the person as they move. The text check leaves pieces out, so pieces in `Front` are fine.

## Step 8. The scene table (gate 2)

Before any code, show a short table: when, the words said, what happens on screen, and which background. Invent the metaphors from this script: every element must answer "why does this belong to this sentence?", never reuse something from another video. Name the ending. Ask for their yes.

Good habits from earlier videos:
- In the Cutout layouts, alternate backgrounds: the real room for most of it and a full style stage for the three or four biggest moments, joined by fades of about half a second. The room stays dimmed (`LOOK.room`, brightness only). Darken its top, where light graphics and text live.
- Keep one thing that travels through the video instead of a new object per sentence, when the style allows.

## The two Cutout layouts

Look at `face.png` first: where the head and shoulders are tells you where the free space is.

**Cutout Above.** The story plays in the free band above the head. Put a floor line (`Scenery` `floor`) a little above the hair, characters at `scale` 1 to 1.3 standing on it, props beside them, and short titles at the very top. Everything sits in `Behind`, so it passes behind the head if the person rises. Keep the band busy enough that it reads as a little stage, not as icons floating.

**Cutout Around.** The person stands inside the style's world:
- The set fills the whole picture and the floor runs behind their shoulders (about where the shoulders start in `face.png`), so it shows at both sides.
- Characters stand on both sides of the head, at `scale` about 1.3, partly hidden behind the person where they overlap. The band above the head is the sky: things that are thought of or named (a house, a laptop, a star, a heart) float there.
- Use the person as part of the scene: a character leaves by walking behind them (a key on `x` from one side to the other side and out), or crosses to the other side the same way. Check a still in the middle of the walk.
- Two or three moments come in front of the person, in `Front` with `follow`: a heart on their chest, sparkles at their hand. Keep these few and short, clear of the face and above the captions.
- Their face stays clear of every piece.

## The Frame look is a dance, not a layout

The frame is a character. It must move and change shape with the story, and the animations must always look attached to it. A frame parked in one place with graphics floating far away is the mistake to avoid.

- **Move it on the story's beats**, about every 4 to 8 seconds, with `FRAMES`: full screen on the opening hook and on strong personal lines, `bottom` when graphics need the top, `narrow` when things come in from both sides, `round` inside a ring, a clock or a lens, `left` or `right` for comparisons, your own `box` for anything else. Name these moves in the scene table.
- **Never type a position for a graphic** that has to follow the frame. Place it from where the frame is right now (pieces too: plan each move of the frame and put the pieces in the space it leaves): `frameBox(f)` gives its box, `spaceAt(f, "above")` the free space on a side, and `<Around side="above" w={600} h={400}>` holds a drawing against that edge, following the frame and fitting the space.
- **Keep things touching.** Graphics sit within about 30 to 60 pixels of the frame, or actually touch it: a line that ends on its edge, an arrow landing on its top, a ring around it, cards sliding out from behind it. Draw things in `Stage` or `Behind` to pass behind the frame, in `Front` to overlap its edge.
- **Let the frame act on things**: it pushes a graphic aside as it grows, swallows a shape, or reveals one when it moves away.
- Big empty areas far from the frame mean the frame is the wrong size or in the wrong place. Change `FRAMES` first.

## Step 9. Write the scenes

Fill `src/scenes.tsx`, keeping its exports: `TAIL_SECONDS` (a few seconds of ending without the person, or 0), `LOOK`, `FRAMES` (Frame look: where the frame goes), `Stage`, `Behind`, `Front`.

- Time everything from the words with `cue("word")` or `cue("word", 2)` from `kit.tsx`, never with a typed frame number that nobody can check. Each thing enters on its word. Call `cue` and `sec` inside components or functions, never at the top of the file: `FRAMES` is read while `kit.tsx` loads, so for it look the word up in `WORDS` from `data.ts` yourself.
- `useCurrentFrame()` drives all movement. No CSS animations, no timers, no `Math.random` (use Remotion's `random`).
- **All text goes through `<Say>` in `Front`**, plus `<Captions />`. Never put text in `Behind` or draw it in SVG: the check cannot see it there, and in the Cutout layouts it would pass behind the person.
- `faceAt(frame)` tells you where the face is, to keep graphics clear of it.
- In a tail, cover the video yourself in `Front` with a full page, before the footage runs out, and put `<NoPerson />` from `kit.tsx` inside it while the person is hidden.
- `src/sound.json` is a list such as `[{ "kind": "pop", "at": 3.2 }]` in seconds on the words: `pop`, `whoosh`, `thump`, `chime`, with an optional `g` to make it softer. The music comes from the style by itself. Use effects sparingly; whooshes are heard more than you expect.
- No hyphens, en dashes or em dashes in any on screen text.

## Step 10. Check, look, sample (gate 3)

1. `EDIT scenecheck "<WORK_FOLDER>"` compiles the code and measures all text against the face and the phone's buttons. Fix every `problem:` line, and code errors, by yourself. Repeat until `RESULT=clean`. The person never sees this part.
2. `EDIT scenestills "<WORK_FOLDER>" --at <times>`, with times in the middle of your key moments, and look at the sheet honestly: does each moment match its sentence, does anything overlap, does it look like the style? Fix what you see.
3. `EDIT scenesample "<WORK_FOLDER>" --range a,b` for about 10 seconds with the most going on, open it with `STUDIO open`, and ask if they like the direction.

## Step 11. The full video (gate 4)

`EDIT scenerender "<WORK_FOLDER>" --final --name "<short name>" --note "<what this version is>"`. It saves the code as the next version and writes `<name> V01.mp4` in this project's **Finished videos** folder, then checks the file (length, sound, black frames, and it listens for repeated phrases). Fix any `warning:` line or mention it honestly. Tell them where the file is, and ask them to watch it once from start to end.

If they want to see or adjust it on a timeline, `EDIT sceneopen "<WORK_FOLDER>"` opens Remotion Studio and prints the address; `EDIT sceneopen --stop` closes it.

## Step 12. The colour grade is their choice (always ask, never apply by yourself)

The footage keeps its own colours through the whole process. Never put a colour change in `LOOK`, and never grade without a clear yes. When they are happy with the full video, make this the last offer:

1. Pick the style's main colour from its guide or tokens, and run `EDIT scenegrade "<WORK_FOLDER>" --tint "#hex" --at <a time when the person is well in view>`. It makes one picture: the same frame without the colour grade on the left and with it on the right. Show it to them.
2. Ask one question with three answers: **blend the video with the style** (the picture they just saw), **my own colour grade** (they describe it in words, such as warmer, cooler, less saturated, or show a reference), or **no colour grade**.
3. Own colour grade: translate their words into `--tint`, `--strength` (the first picture uses 1, which is subtle; 1.6 is clearer, 2.5 is strong) and `--saturate` (1 is unchanged), make a new picture and ask again until they like it.
4. On a yes, `EDIT scenegrade "<WORK_FOLDER>" --tint "#hex" --strength <n> --saturate <n> --apply` (the same numbers they approved; for the first picture they saw, leave both out), then `scenerender --final`: it becomes the next version and the earlier one stays. With no colour grade nothing changes and no new render is needed; `--none` takes one away later.

## Step 13. Fixes

Ask where, what is wrong, what it should be. Change only that part of `scenes.tsx` or `sound.json`, run `scenecheck`, then `scenesample --range` around it. A sound only change still needs `scenerender`. When approved, make a new final: it becomes the next version and the earlier one stays. If a fix is to the cuts, run `cut` again, then `cutout` for the Cutout layouts and `project` again, because the times moved; check every `cue` still lands.

When they are done with the project, tell them in one line that Drop videos here can be kept empty and offer: "Shall I move your original recording into the project folder so Drop videos here stays empty?" Only after a yes, run `STUDIO project --project "<PROJECT>" --original "<VIDEO>"`.

## Rules that always hold

- The original recording is never changed or deleted. It is only moved, with their yes, from Drop videos here into the project's own Finished videos folder, never anywhere else.
- Everything on screen comes from what the person said. No invented numbers, names, prices or results. For health, money or similar topics, add no promises and no advice.
- Nothing past a gate without the member's yes: cuts, then scene table, then sample, then the full video.
- The colour grade is offered at the end and is never applied without their yes.
- One change at a time when fixing, and say what you left alone.
- Be honest about what you could not check. You have not watched the video play, you have seen still pictures and read the checks. Say so, and ask them to watch it.

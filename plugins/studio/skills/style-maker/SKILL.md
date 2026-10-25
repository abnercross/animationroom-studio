---
name: style-maker
description: Animation Room Style Maker. Helps a member change one of the Animation Room styles into their own look, or build a new look from scratch, by answering a few questions. Use when the user says "make it my own", "change this style", "build my own style", "create my own look", "my own animation style", "I can't find my style", pastes a request that asks for an interview about changing a style, or asks for a colour, font, line, motion or sound that the style does not have.
---

# Style Maker

The member wants a look of their own. You interview them, then build a style folder that works exactly like the library styles: it appears in their style list as **yours**, works in 9:16 and 16:9, and renders with the same checks, sound and review. It lives only on their computer.

The person is usually a beginner. Talk the way the setup guide does: plain words, two to four questions at a time, never paste raw command output, never use hyphens, en dashes or em dashes in your replies or in on screen text (use commas, full stops or separate sentences). Offer examples to pick from ("warm and soft, or bold and bright?"), and accept "you decide" as an answer.

## Paths and helpers

- Plugin folder: `${CLAUDE_PLUGIN_ROOT}`. Studio data folder: `${CLAUDE_PLUGIN_DATA}`.
- Find the Node to use by running the setup check (`skills/setup/scripts/check.sh`, or `check.ps1` on Windows) and reading `NODE_USE`.
- `ANIMATE` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/animate.mjs"` and `STUDIO` means `"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/studio.mjs"`. Always add `--data "${CLAUDE_PLUGIN_DATA}"`.
- Scripts end with `KEY=value` lines. `RESULT=failed` comes with a `REASON`; pass it on in your own words. Lines starting `warning:` or `problem:` are for you to act on, not to read out.
- Never install ffmpeg yourself. If you need frames from a video the member gives you as an example, run `STUDIO ffmpeg install` and use the `FFMPEG_PATH` it prints.

## Step 0. Is the studio ready?

Run the setup check. If `CLOUD_SESSION=yes`, explain that styles are built on their own computer: open the Claude app, go to the **Code** tab and ask there. If `READY_ANIMATE=yes`, say nothing about setup and carry on. If `READY_ANIMATE=no`, run the setup skill in repair mode for exactly what `MISSING` lists, then come back.

## Step 1. What they can and cannot make (say it once, briefly)

Tell the member in two or three sentences, in your own words:

1. A style is the look: colours, lettering, line weight and texture, background, how things move, the music and sound effects, and the rules Claude follows. Those you can change freely.
2. The pieces the engine draws (characters, paper cutouts, diagrams, posters) are fixed shapes. You can recolour and restyle them. Anything that is not in the library can still be drawn for one video as a drawing, but a brand new kind of drawing (3D, watercolour, photos, their own logo as a picture) is not possible yet.
3. When something they ask for is not possible yet, you will say so straight away, offer the nearest thing and save it to their wishlist.

## Step 2. The interview

Two ways in. Find out which:

**A. Change a style they already like.** The request names the style ("I want to change this style" after "in the Blueprint style"), or they name one. This interview is short. Ask what they want to change, as a pick list with examples: colours, lines and texture, lettering, how things move, music and sound, rules (always or never do), something else. Then ask only about what they picked.

**B. Build from scratch.** Ask in three rounds, a few questions each, skipping what they already told you:
1. What will you make with it, and for whom (lessons, explainers, stories, social posts, ads)? Vertical, wide or both? Do you have an example you love: a video, a screenshot, a website, a logo or brand colours? What carries the story: a character, objects and diagrams, shapes, or just text?
2. The look: your colours, or a mood (warm, cool, bold, soft)? Dark or light ground? Lines and texture (clean, hand drawn, chalk, brush, ink hatching, paper, grain)? Thick or thin? Lettering (round and bold, tall print capitals, a book serif, handwriting, clean modern)? How things move (calm, snappy, bouncy, hand made stop motion)?
3. Sound and rules: music mood (soft, playful, warm, bright, none), the kind of effects (pencil, chalk, paper, pops, none), anything it must always or never do ("never red", "end on my logo colour"). Then a name.

Examples the member gives: if they drop pictures in the chat, look at them yourself and read the colours, the line quality and the lettering feel from them. For a video, take about six frames with ffmpeg. Take the feel, never the artwork: do not copy a living artist's drawings, a brand's characters or someone else's logo. Their own brand colours and the general qualities of a look ("flat colour, thick outlines") are fine.

When you have enough, write the brief back in one short paragraph plus the colours as a list with their hex codes, and ask whether to go ahead. Do not build before they say yes.

## Step 3. Choose the starting point

Style files are built on a family of engine parts, so every new style starts from the nearest one. For A, that is the style they named. For B, choose by what carries the story, and say it in plain words ("I will build on the part of the engine that draws characters"), not by library names:

| What they want | Start from |
| --- | --- |
| Text, diagrams, drawn objects, nothing else | blank canvas (`--blank`) |
| Chalk on a board | `chalkboard` |
| Technical, precise line art | `blueprint` |
| Hand inked sketchbook, brush lines | `sketchbook-ink` |
| Medical or cutaway pictures | `clinical-cutaway` |
| Cute character, flat colour | `chibi-flat-colour` |
| Cute character, pen and ink shading | `chibi-ink-hatching` |
| Round friendly bean characters, simple diagrams | `happy-bean` |
| Simple stick figures, no panels | `borderless-comic` |
| Comic book page, halftone dots | `comic-page-halftone` |
| Torn paper and tape, stop motion | `paper-collage` |
| Layered night time paper storybook | `paper-cutout-storybook` |
| Stitched, woven thread look | `woven-tapestry` |
| One morphing shape, no characters | `abstract-geometry` |
| Printed retro poster | `space-age-poster` |

## Step 4. Build it

1. `ANIMATE mystyle new --name "<Name>" --from <style id>` (or `--blank`). It prints `MYSTYLE` (the id), `FOLDER`, `STYLE_JSON` and `GUIDE`. The member's name for it is theirs: do not add words like "custom".
2. Edit `STYLE_JSON` and `GUIDE` in that folder. **Only these two files.** Never touch the plugin folder, the library cache or another style.
3. In `style.json` change values that already exist; keep the structure. Colours are `#rrggbb` text (a plain grey is a number from 0 to 1). Where the look lives:
   * Ground and drawing colours: `tokens.bg`, `ink`, `mid`, `soft`, `fill`, `dark`, and the named colours in `tokens.palette`. For a flat ground with no grid set `tokens.background` to `{"type": "plain"}`; for a paper grid use `grid` and give `gridMinor` and `gridMajor` colours a little different from `bg`. A `dark` variant lives in `variants`: keep it readable or remove it.
   * Characters: `tokens.rig` (skin, top, trousers, hair, shoes, cap) and the scene grounds in `tokens.tints`. Paper looks: `tokens.paper` (tape, border, shadow) and `tokens.sheet.color`. Pen shading: `tokens.hatch` (paper and ink colours). Poster grounds: `tokens.poster.grounds`. Panels: `tokens.panel`.
   * Lettering: `tokens.fonts.headline`, `ui` and `mono`. Only these fonts exist in the engine, and anything else makes the check fail: Poppins (round and bold), Inter (clean and modern), JetBrains Mono (technical), STIX Two Text (book serif, also Greek), Big Shoulders (tall and condensed), Caveat (handwriting), Caveat Brush (brush marker), Bebas Neue (tall print capitals), Assistant (clean sans, Hebrew). A font that is not on this list goes on the wishlist.
   * Lines and texture: `tokens.lineWidths` (primary, secondary, construction, in pixels; about 2 is fine and 6 is bold), `tokens.stroke.style` (`clean`, `chalk`, `brush`), `tokens.background` (`plain`, `grid`, `board`, and the others the starting style already uses), `tokens.finish` (`grain` and `vignette`, 0 to 1, a little film grain over everything).
   * Living light (engine 1.13, for looks with gradients, rings or glow): `tokens.shimmer` `{"sway": 14, "period": 9, "sheen": 0.45, "every": 4.5, "rainbow": 16, "orbit": 45}` makes every gradient sway a few degrees, a glint slide across gradient shapes every few seconds, a small light travel round rings and rainbow edges turn. Use it when the member wants the look less static; leave it out for flat, still looks.
   * Pieces the member never wants (a chapter counter, captions, a ring): list their block types in the style's top level `noBlocks`, like `"noBlocks": ["badge"]`, take them out of the guide and say so in **Rules from the member**. The storyboard check then refuses them.
   * Movement: `tokens.motion`. Calm: `drawDefault` 1.4, `revealDur` 0.7, `cameraPush` 0.02. Snappy: `drawDefault` 0.6 to 0.8, `labelStagger` 0.25, `typeMsPerChar` 20, `revealDur` 0.35. Hand made stop motion: `stepFps` 8 to 12. `fps` stays 30 (60 makes renders twice as slow).
   * Sound: `sound.score` has `kind` (`pad` soft, `pizzicato` playful, `rhodes` warm, `vibes` bright, `quirky`), `bpm` (60 to 80 calm, 100 to 120 upbeat), `level` (about -15; lower is quieter) and `chords`. **Each kind writes its chords in its own layout**, so when you change `kind`, delete `chords` (every kind brings its own) unless you write new ones in that kind's layout: `pad` lists of five or more note numbers, `pizzicato` and `rhodes` lists of notes, `quirky` lists of three or more, `vibes` a bass note and a list of four or more, like `[[48, [64, 67, 71, 74]], [45, [64, 67, 72, 76]]]`. The check names the layout it expects. `sound.sfx` takes only these values: `path` pencil, chalk or none (silent lines, for sleek glowing looks), `label` click+type or chalk, `text` whoosh, pops or chalk, `sceneChange` whoosh or none, `gridIntro` rise, flip or none, `end` bell, chime, flip or none, `accent` thump+bell or thump+chime. `roomTone` true adds a quiet room.
   * Things that go wrong, learned from real examples: on a dark ground make `ink` light **and** set `palette.white` to a dark colour, because label cards and signs are filled with `white` and would otherwise hide their text. A line art look (Blueprint, Chalkboard) only feels different when you also thicken `lineWidths` (primary 6 to 8), raise `type.labelScale` (2 to 2.5 for handwriting fonts) and give `fill` a real colour. Characters change look through `rig` (clothes, hair, cap), `tints` (scene grounds) and `palette` (props) together: change all three or the result looks half done.
4. In `guide.md` rewrite what describes the look (usually the first section: the look, the colours and their names, the lettering, the sound) and add a short **Rules from the member** section with their always and never rules. Mention every named colour exactly as written in `palette`, and say when to use each. **Leave the layout sections, Draw anything, Timing, the block lists and Request choices exactly as they are**: they keep the safe zones and the engine's rules, and the checker and renderer depend on them. If you rename or remove a colour name, fix every place the guide uses it.
5. `ANIMATE mystyle check <id>`. Fix every `problem:` and read every `warning:` (a pale colour on a pale ground is the usual one). Repeat until it says `RESULT=valid`.

## Step 5. Look at it

1. `ANIMATE mystyle sheet <id>` renders a short sample script in their style as a sheet of stills (about a minute). Add `--format 16:9` for the wide version. It takes the sample of the look the style started from, so the layout is a rough test script: judge the colours, lettering, lines and feel, not the sample's own composition.
2. **Open the image and look at it yourself first**: is the text readable, are the colours distinct from the ground and from each other, does anything vanish, is it overloaded with colour (three to five named colours is plenty)? Fix and render again before you show them. Then show them with `STUDIO open "<FILE>"`.
3. Ask what they would change ("warmer", "thicker lines", "calmer"), turn it into edits of `style.json`, run the check and the sheet again. Expect two to five rounds. Say each time, in plain words, what you changed.
4. If the look needs something the engine cannot do, say so at once, give the nearest honest option and save it: `ANIMATE mystyle wish --text "<what they wanted, in a sentence>" --style <id>`.

## Step 6. Finish

1. Tell them the style is saved and called what they named it. It appears in their style list marked as yours, and they use it like any other: "animate this in <Name>". It stays on this computer. `ANIMATE mystyle remove <id>` puts it away (nothing is deleted for good) and `ANIMATE mystyle reset <id>` goes back to where it started.
2. Ask once: **keep it as your own style, or was it just for this video?** Remember the answer. If they have a voiceover waiting in this chat, go on with the Animate skill from Step 1 using the new style's id. Otherwise say they can drop a voiceover whenever they are ready.
3. If their wishlist has anything in it (`ANIMATE mystyle wishes`), tell them how many things are on it, read them out in a line each, and say that sending the list to support@animationroom.app helps decide what gets built next. Do not send anything for them.

# Blank canvas: storyboard guide

Read this before writing a storyboard. The engine draws the ground, the camera push and the scene exits for you. You write the content: scenes and blocks keyed to the voiceover words.

## The look
Clean ink line drawings on a plain light ground. Lines draw themselves, labels sit on leader lines, headlines are bold with a short accent underline. Three named accent colours: `accent`, `accent2` and `highlight`; everything else is ink, `mid`, `soft`, `fill` and `dark`. A `dark` variant exists (`"variant": "dark"`) if the member asks for it.

Never put hyphens or em dashes in any on screen text.

## Copy the style, invent the content
Every video gets its own storyboard built from its own topic. Never reuse shapes or scene ideas from a previous video by default.
1. **Connective element**: pick one simple element that comes from the subject itself and travels through every scene, changing shape rather than cutting (use a `morph` block in `overlay`, or a `group` with keyframes).
2. **Data widgets** (`counter`, `ruler`) only when the voiceover states a number or a measurable change.
3. **CTA** built from what the voiceover actually asks (follow, comment a word, save, book) and from the subject's own imagery.
For each scene you should be able to say why every element belongs to THIS topic. If you cannot, replace it.

## Colour use
Ink carries the drawing. Use `accent` for the one thing the eye should land on in a scene, `accent2` for a second idea or the contrast, `highlight` for small marks, underlines and notes. A scene rarely needs more than two of them.

## Layout 9:16 (1080 x 1920)
* Main drawing between y 430 and y 1100, centred on x 540.
* Labels sit in the side margins (96 px). Use `label` with `side` left or right, alternate sides, keep label rows at least 70 px apart.
* Keep everything above y 1560 (Instagram caption area) and away from the right edge below y 1100 (Instagram buttons). No burned in captions unless asked.
* Headlines: `text` block, `size` 104 to 118, at most 3 lines of about 12 characters each, `y` around 760 to 900, with a short `kicker`.

## Layout 16:9 (1920 x 1080)
Put `"format": "16:9"` at the top of the storyboard when the member wants a wide video (YouTube, a presentation). Spread the picture sideways: the drawing on one side, the labels in a column beside it, headlines across the middle.
* Keep everything between y 120 and y 1000.
* Main drawing: about 600 px wide and 600 px tall, between y 330 and y 930, centred on x 600 (or x 1320 for a mirrored layout). Leave the other half of the frame for labels and notes.
* Labels: `label` takes `labelX`, the x where the text column starts, so leaders stay short. A column on the right of a drawing at x 600 uses `labelX` 1100 and `"side": "left"` (the text is left aligned at `labelX`). A column on the left uses `labelX` 200. Keep label rows at least 90 px apart.
* Headlines: a `text` block, `size` 104 to 120, one or two lines of about 22 characters. With nothing else on screen use `y` 520 to 620. With a diagram below it use `y` 480 and keep the diagram below y 620. The kicker sits about 200 px above the first line, so never use a `y` under 480.
* Rows (source, line, symptom): keep rows 80 to 160 px apart between y 640 and y 960, x from 560 to 1360.
* Anything drawn in `overlay` stays on screen across scenes, so give it an `out` time before a scene that needs the room.

## Draw anything
The voiceover decides what is on screen, not the pieces listed above. When a line names something no ready made piece shows, draw it yourself. Never show a different object because it is the closest one in the list. A drawing you make must still look like it belongs: same colours, same line and the same level of detail as the pieces around it.

Draw it with `path` blocks. One closed outline with `"width": "primary"`, then the inner details with `"width": "secondary"`. Everything is a `d` path in canvas pixels.
```json
{"type": "path", "at": "@tooth", "d": "M435,700 Q405,655 465,648 Q510,643 540,670 Q570,643 615,648 Q675,655 645,700 Q630,790 615,880 Q608,955 578,955 Q555,955 548,880 Q540,850 532,880 Q525,955 502,955 Q472,955 465,880 Q450,790 435,700 Z", "width": "primary", "fill": "fill", "dur": 1.4},
{"type": "path", "at": "@tooth+1.1", "d": "M480,715 Q495,692 525,700", "width": "secondary", "dur": 0.5}
```
Build objects, tools and diagrams from simple curves: schematic beats detailed. `"fill": "fill"` washes it light, `"dark"` marks an opening, or give `"color": "accent"` to a line. If the real thing has parts that move, draw it in two or three steps (the same object with the part moved) and morph between them.

## Timing
* Key every event to a word: `"at": "@trapezius"` or `"@temple+0.15"`; use `"@word#2"` for the second time a word is spoken.
* Scene changes go in the pauses between sentences. Each scene `start` is the previous scene `end`.
* Draw durations 0.8 to 1.6 s. Stagger labels 0.35 to 0.45 s apart.
* Set `"accent": true` on the single biggest reveal so the sound design lands a thump and bell there.
* The last scene holds about 0.8 s past the final word.

## Drawing
* Shapes are SVG path strings (`d`) in canvas pixels. Clean and schematic beats detailed.
* Primary outline `width: "primary"`; inner detail `"secondary"`; guides `"dashed": true`.
* Fills fade in after the outline finishes.

## Sound (automatic)
The engine synthesizes a soft ambient score and subtle sound effects from your blocks: pencil scratch while paths draw, clicks and typing ticks on labels, whooshes on headlines and scene changes, thump plus bell on the `accent` block, a closing bell. Music ducks under the voiceover. Nothing to write unless you want `"sfx": false` on a block.

## Request choices from the members page
A request may say "Make it vertical (9:16)." (the default) or "Make it wide (16:9) for YouTube." Wide: put `"format": "16:9"` at the top of the storyboard and follow Layout 16:9.

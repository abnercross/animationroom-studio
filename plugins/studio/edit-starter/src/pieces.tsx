// Animate's own pieces inside an Edit video: the style's real characters, props and drawings, the same ones Animate
// draws, so a member's hero looks the same in both modes. edit.mjs project copies Animate's engine source into
// src/animate (a copy: Animate itself is never changed) and the style into data.ts. This file stays as it is.
import React, { useContext } from "react";
import { useCurrentFrame } from "remotion";
import * as A from "./animate/blocks";
import * as C from "./animate/chibi";
import * as G from "./animate/glow";
import * as H from "./animate/hero";
import * as K from "./animate/sketch";
import * as O from "./animate/poster";
import * as B from "./animate/bean";
import * as P from "./animate/paper";
import { StoryContext, gray, mergeTokens, StyleTokens } from "./animate/lib";
import { expandChibi } from "./animate/names.mjs";
import { FACE, FPS, HEIGHT, STYLE, WIDTH } from "./data";
import { CheckContext, cue, faceAt } from "./kit";
import * as S from "./scenes";

// The word's start in seconds: Animate's pieces count time in seconds ("at", keys "t").
export const sec = (word: string, nth = 1) => cue(word, nth) / FPS;

// The style's tokens with the member's choices: VARIANT and PALETTE may be exported from scenes.tsx.
// Read when first drawn, not when the file loads: scenes.tsx imports this file.
let merged: StyleTokens | null = null;
export const tokens = (): StyleTokens => (merged ??= mergeTokens(STYLE as any, (S as any).VARIANT, (S as any).PALETTE, WIDTH > HEIGHT));
// A colour from the style's palette, by name ("coral"), for anything drawn by hand next to the pieces.
export const colour = (name: string) => gray(((tokens().palette as any)?.[name] ?? name) as any);

type Block = Record<string, any>;
const one = (b: Block, t: number, k: StyleTokens): React.ReactNode => {
  const p = { b: b as any, t, k };
  if (b.at !== undefined && t < b.at - 0.001 && b.type !== "group" && b.type !== "morph") return null;
  const kids = (c: any) => one(c, t, k);
  switch (b.type) {
    case "path": return <A.PathBlock {...p} />;
    case "morph": return <A.MorphBlock {...p} />;
    case "dot": return <A.DotBlock {...p} />;
    case "label": return <A.LabelBlock {...p} />;
    case "text": return <A.TextBlock {...p} />;
    case "note": return <A.NoteBlock {...p} />;
    case "counter": return <A.CounterBlock {...p} />;
    case "ruler": return <A.RulerBlock {...p} />;
    case "mark": return <A.MarkBlock {...p} />;
    case "travel": return <A.TravelBlock {...p} />;
    case "group": return <A.GroupBlock {...p} render={kids} />;
    case "cutout": return <P.CutoutBlock {...p} render={kids} />;
    case "ransom": return <P.RansomBlock {...p} />;
    case "face": return <P.FaceBlock {...p} />;
    case "shape": return <C.ShapeBlock {...p} />;
    case "prop": return <C.PropBlock {...p} />;
    case "person": return <C.PersonBlock {...p} />;
    case "badge": return <C.BadgeBlock {...p} />;
    case "ring": return <G.RingBlock {...p} />;
    case "hero": return <H.HeroBlock {...p} />;
    case "splat": return <K.SplatBlock {...p} />;
    case "stamp": return <K.StampBlock {...p} />;
    case "frame": return <K.FrameBlock {...p} />;
    case "posterDraw": return <O.PosterDraw {...p} />;
    case "posterHero": return <O.PosterHero {...p} />;
    case "posterWord": return <O.PosterWord {...p} />;
    case "posterSparks": return <O.PosterSparks {...p} />;
    case "posterStars": return <O.PosterStars {...p} />;
    case "posterArrow": return <O.PosterArrow {...p} />;
    case "bean": return <B.BeanBlock {...p} />;
    case "beanProp": return <B.BeanProp {...p} />;
    case "beanDraw": return <B.BeanDraw {...p} />;
    case "beanBadge": return <B.BeanBadge {...p} />;
    default: throw new Error(`Piece: "${b.type}" is not one of Animate's pieces that work in Edit`);
  }
};

// The same fill ins Animate's checker makes: mood and pose names, drawings by name, word times.
const prepared = new WeakMap<Block, Block>();
const prepare = (b: Block): Block => {
  if (prepared.has(b)) return prepared.get(b)!;
  const c: Block = JSON.parse(JSON.stringify(b));
  const walk = (x: Block, parentAt?: number) => {
    if (x.at === undefined && parentAt !== undefined) x.at = parentAt;
    if (x.type === "person") {
      for (const st of [x, ...(x.keys ?? [])]) {
        const bad = expandChibi(st);
        if (bad.length) throw new Error(`Piece person: ${bad.join("; ")}`);
      }
      x.keys?.sort((a: Block, z: Block) => a.t - z.t);
      if (x.who && !(S as any).CAST?.[x.who]) throw new Error(`Piece person: "${x.who}" is not in CAST in scenes.tsx`);
    }
    if (x.draw !== undefined) {
      const def = (S as any).DRAWINGS?.[x.draw];
      if (!def) throw new Error(`Piece: drawing "${x.draw}" is not in DRAWINGS in scenes.tsx`);
      x.parts = def.parts;
      if (x.type === "prop" && x.kind === undefined) x.kind = "drawing";
    }
    if (x.type === "hero" && (S as any).SHAPES) x.shapes = (S as any).SHAPES;
    for (const kid of x.blocks ?? []) walk(kid, x.at);
  };
  walk(c);
  prepared.set(b, c);
  return c;
};

// Patterns and filters some pieces fill with (pen hatching, comic dots, rough ink). Copied from Animate's stage.
const Defs: React.FC<{ k: StyleTokens }> = ({ k }) => (
  <defs>
    {Object.entries(k.palette ?? {}).map(([name, c]) => (
      <pattern key={name} id={`hatch-${name}`} patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={16} stroke={gray(c as any)} strokeWidth={1.3} />
      </pattern>
    ))}
    {k.hatch &&
      ([["ink1", 0.22, false], ["ink2", 0.2, true], ["ink3", 0.38, true], ["ink4", 0.56, true], ["inkLine", 0.22, false]] as [string, number, boolean][]).map(([id, w, cross]) => {
        const st = k.hatch!.step;
        return (
          <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={st} height={st} patternTransform="rotate(45)">
            {id !== "inkLine" && <rect width={st} height={st} fill={gray(k.hatch!.paper)} />}
            <rect width={st} height={st * w} fill={gray(k.hatch!.ink)} />
            {cross && <rect width={st * w} height={st} fill={gray(k.hatch!.ink)} />}
          </pattern>
        );
      })}
    {(k.background?.dots || k.rig?.shadeStyle === "dots") && (
      <>
        <pattern id="benday" patternUnits="userSpaceOnUse" width={15} height={15} patternTransform="rotate(45)">
          <circle cx={7.5} cy={7.5} r={3.7} fill="#000" />
        </pattern>
        <pattern id="bendayS" patternUnits="userSpaceOnUse" width={6.4} height={6.4} patternTransform="rotate(45)">
          <circle cx={3.2} cy={3.2} r={1.75} fill="#000" />
        </pattern>
      </>
    )}
    <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#000" stopOpacity={1} />
      <stop offset="100%" stopColor="#000" stopOpacity={0} />
    </linearGradient>
    {k.hatch && (
      <linearGradient id="hatchFloor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity={0.75} />
        <stop offset="9%" stopColor="#fff" stopOpacity={0.12} />
        <stop offset="40%" stopColor="#fff" stopOpacity={0} />
        <stop offset="100%" stopColor="#fff" stopOpacity={0.8} />
      </linearGradient>
    )}
    {k.finish?.rough && (
      <filter id="roughInk" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency={0.035} numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={k.finish.rough} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    )}
  </defs>
);

// The style's own set, for styles with chapter tints (Chibi and the other character styles): the tint, its soft glow
// and the floor from y floor down (false for no floor). Use it in Stage; opacity lets one set fade into the next.
export const Scenery: React.FC<{ tint: string; floor?: number | false; opacity?: number }> = ({ tint, floor = false, opacity = 1 }) => {
  const k = tokens();
  if (!k.tints?.[tint]) throw new Error(`Scenery: "${tint}" is not one of the style's tints (${Object.keys(k.tints ?? {}).join(", ") || "none"})`);
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", left: 0, top: 0, opacity }}>
      <Defs k={k} />
      <C.TintSet k={k} t={0} W={WIDTH} H={HEIGHT} tint={tint} floor={floor} />
    </svg>
  );
};

// Draws Animate pieces over the whole picture (1080 by 1920), in the layer it is placed in (Stage, Behind or Front).
// blocks are written exactly like an Animate storyboard's blocks; times in seconds (use sec("word")).
// x, y, scale move the whole set, so pieces can follow the frame or the person. follow moves them with the face:
// place them for the face where FACE in data.ts says it is, and they keep that place as the person moves.
// The text check leaves pieces out, so pieces in Front (a heart on the person's chest) are not taken for text.
export const Pieces: React.FC<{ blocks: Block[]; x?: number; y?: number; scale?: number; opacity?: number; follow?: boolean }> = ({ blocks, x = 0, y = 0, scale = 1, opacity = 1, follow = false }) => {
  const frame = useCurrentFrame();
  const checking = useContext(CheckContext);
  if (checking) return null;
  if (follow) {
    const p = faceAt(frame);
    x += p.x - FACE.x * WIDTH;
    y += p.y - FACE.y * HEIGHT;
  }
  const k = tokens();
  const stepFps = k.motion?.stepFps;
  const t = stepFps ? Math.floor((frame / FPS) * stepFps + 1e-6) / stepFps : frame / FPS;
  return (
    <StoryContext.Provider value={{ cast: (S as any).CAST, speech: (S as any).SPEECH, W: WIDTH, H: HEIGHT }}>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity }}>
        <Defs k={k} />
        <g transform={`translate(${x},${y}) scale(${scale})`} filter={k.finish?.rough ? "url(#roughInk)" : undefined}>
          {blocks.map((b, i) => <React.Fragment key={i}>{one(prepare(b), t, k)}</React.Fragment>)}
        </g>
      </svg>
    </StoryContext.Provider>
  );
};

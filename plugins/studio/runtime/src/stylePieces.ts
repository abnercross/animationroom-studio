// Pieces a style brings with it (engine 1.14).
//
// A style may ship its own drawing code in its folder on the server (pieces.tsx, named by "pieces" in style.json), so a
// brand new look needs no new engine and no plugin release. The studio copies that file next to the engine before a
// render and registers it here; a style without one leaves this empty and everything draws exactly as before.
//
// What a pieces.tsx may export (all optional):
//   blocks   {name: Component}  block types of its own, drawn with {b, t, k} like every engine block
//   Defs     Component {k, W, H}          patterns, filters and gradients, placed once in the stage's <defs>
//   Ground   Component {t, k, W, H, scene}  its own background, drawn in place of the engine's
//   Finish   Component {t, k, W, H}       a last layer over everything (grain, a vignette, a frame)
// It imports the engine's helpers from '../../engine' and nothing else from the engine.
import type React from 'react';

export type StylePieces = {
  blocks?: Record<string, React.FC<{b: any; t: number; k: any}>>;
  Defs?: React.FC<{k: any; W: number; H: number}>;
  Ground?: React.FC<{t: number; k: any; W: number; H: number; scene?: any}>;
  Finish?: React.FC<{t: number; k: any; W: number; H: number}>;
};

let current: StylePieces | undefined;
export const setStylePieces = (p: StylePieces | undefined) => {
  current = p;
};
export const stylePieces = () => current;

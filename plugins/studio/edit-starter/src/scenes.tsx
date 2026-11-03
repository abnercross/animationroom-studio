// Claude writes this file for each video. Replace everything below; keep the same exports.
import { AbsoluteFill } from "remotion";
import { Captions } from "./Captions";
import type { FrameMark } from "./kit";

// Extra seconds after the speech ends, for an ending with no person on screen.
export const TAIL_SECONDS = 0;

export const LOOK = {
  background: "#0b0b0d",
  // Never put colour changes here: the colour grade is the member's choice at the end of the process.
  room: "brightness(.6)", // cutout look: how dim the filmed background is, so graphics read on it
  person: "none", // light only, such as a soft glow around the person
  frame: {} as React.CSSProperties, // frame look: border or shadow of the frame
};

// Frame look only: where the frame goes and when. A shape from BOXES in kit.tsx, or your own box, with dur frames to get there.
export const FRAMES: FrameMark[] = [{ at: 0, shape: "bottom" }];

// Behind everything (a dark stage that comes and goes, the background).
export const Stage: React.FC = () => <AbsoluteFill />;
// In the cutout look these pass behind the person. No text here: text goes in Front.
export const Behind: React.FC = () => <AbsoluteFill />;
// In front of the person: all text (with Say) and the captions.
export const Front: React.FC = () => (
  <AbsoluteFill>
    <Captions />
  </AbsoluteFill>
);

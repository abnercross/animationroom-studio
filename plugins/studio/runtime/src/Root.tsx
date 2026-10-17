import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { Hello, HelloProps } from "./Hello";
import { Animate, AnimateProps } from "./Animate";
import { ENGINE_VERSION, semverGte } from "./lib";

// Placeholder props so the Animate composition can be opened without a style.
// Real renders always pass a style (from the server) and a storyboard.
const placeholder: AnimateProps = {
  style: {
    id: "none",
    name: "No style loaded",
    version: "0.0.0",
    minEngine: "1.0.0",
    tokens: {
      bg: 0.955, gridMinor: 0.915, gridMajor: 0.875, gridMinorStep: 40, gridMajorStep: 200,
      ink: 0.11, mid: 0.45, soft: 0.68, fill: 0.885, dark: 0.2,
      lineWidths: { primary: 2.2, secondary: 1.5, construction: 1 },
      dashes: { construction: [14, 6, 3, 6], dotted: [6, 7] },
      fonts: { headline: "Inter", ui: "Inter", mono: "JetBrains Mono" },
      monoTracking: 4, corners: { inset: 56, arm: 34 }, header: { y: 214 }, margins: 96,
      motion: { drawDefault: 1.2, labelStagger: 0.4, typeMsPerChar: 35, revealDur: 0.55, cameraPush: 0.035, exitDur: 0.4 },
    },
  },
  storyboard: { duration: 3, scenes: [{ id: "a", start: 0, end: 3, blocks: [{ type: "text", at: 0.5, y: 900, kicker: "Animation Room", lines: ["Load a style"] }] }] },
};

export const Root: React.FC = () => {
  return (
    <>
      {/* The setup test clip. Rendering it proves Node, the bundler, fonts, the browser and the encoder all work. */}
      <Composition
        id="Hello"
        component={Hello}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ name: "" } satisfies HelloProps}
      />
      {/* Animate mode: style tokens + storyboard in, animation out. */}
      <Composition
        id="Animate"
        component={Animate}
        defaultProps={placeholder}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={90}
        calculateMetadata={({ props }) => {
          if (!semverGte(ENGINE_VERSION, props.style.minEngine)) {
            throw new Error(`Style "${props.style.name}" needs engine ${props.style.minEngine} or newer (this is ${ENGINE_VERSION}). Update the Studio plugin.`);
          }
          const fps = props.storyboard.fps ?? 30;
          return {
            fps,
            width: props.storyboard.width ?? 1080,
            height: props.storyboard.height ?? 1920,
            durationInFrames: Math.ceil(props.storyboard.duration * fps),
          };
        }}
      />
    </>
  );
};

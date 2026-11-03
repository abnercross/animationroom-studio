// The Edit engine's own setup test. Each Edit video is its own small project (studio/edit-starter) that uses this
// engine's packages; this clip only proves the engine renders on this computer.
import React from "react";
import { AbsoluteFill, Composition, interpolate, useCurrentFrame } from "remotion";

const Ready: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#131A21", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#fff", fontFamily: "sans-serif", fontSize: 72, fontWeight: 700, opacity: interpolate(f, [0, 15], [0, 1], { extrapolateRight: "clamp" }) }}>Edit engine ready</div>
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => <Composition id="Edit" component={Ready} width={1080} height={1920} fps={30} durationInFrames={60} />;

import React from "react";
import { Composition } from "remotion";
import { Edit } from "./Edit";
import { EditProps } from "./types";
import { SIZE } from "./theme";

// One composition for every Edit style. The plan decides length and what is drawn; the style provides tokens.
const FPS = 30;
export const Root: React.FC = () => (
  <Composition
    id="Edit"
    component={Edit}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={FPS}
    defaultProps={{ plan: { duration: 1, video: { src: "", width: 720, height: 1280 }, face: { x: 0.5, y: 0.4 }, words: [], moments: [] } } as EditProps}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.round(props.plan.duration * FPS)), width: SIZE[props.plan.format ?? "9:16"].w, height: SIZE[props.plan.format ?? "9:16"].h })}
  />
);

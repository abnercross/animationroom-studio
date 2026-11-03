import { Composition } from "remotion";
import { Edit } from "./Edit";
import { FPS, HEIGHT, VIDEO_SECONDS, WIDTH } from "./data";
import { TAIL_SECONDS } from "./scenes";

export const Root: React.FC = () => (
  <Composition
    id="Edit"
    component={Edit}
    durationInFrames={Math.ceil((VIDEO_SECONDS + TAIL_SECONDS) * FPS)}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={{ check: false }}
  />
);

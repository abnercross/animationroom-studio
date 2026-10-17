import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Fonts ship inside the runtime (public/fonts), so renders never depend on the internet.
// Licences: public/fonts/OFL-*.txt (SIL Open Font License 1.1).
export const SANS = "Inter";
export const MONO = "JetBrains Mono";

const files: [string, string, string][] = [
  [SANS, "inter-latin-500-normal.woff2", "500"],
  [SANS, "inter-latin-600-normal.woff2", "600"],
  [SANS, "inter-latin-700-normal.woff2", "700"],
  [SANS, "inter-latin-800-normal.woff2", "800"],
  [MONO, "jetbrains-mono-latin-500-normal.woff2", "500"],
  [MONO, "jetbrains-mono-latin-700-normal.woff2", "700"],
];
export const fontsReady: Promise<void[]> = Promise.all(files.map(([family, file, weight]) => loadFont({ family, url: staticFile(`fonts/${file}`), weight })));

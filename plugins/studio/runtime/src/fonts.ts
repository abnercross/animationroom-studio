import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Fonts ship inside the runtime (public/fonts), so renders never depend on the internet.
// Licences: public/fonts/OFL-*.txt (SIL Open Font License 1.1).
export const DISPLAY = "Big Shoulders";
export const MONO = "JetBrains Mono";
export const SANS = "Inter";
export const SERIF = "STIX Two Text";
export const ROUND = "Poppins";
export const HAND = "Caveat";
export const BRUSH = "Caveat Brush";
export const PRINT = "Bebas Neue"; // engine 1.8: condensed capitals for printed labels
export const HEBREW = "Assistant"; // engine 1.8: Hebrew letters (and Latin)

const fonts: [string, string, string][] = [
  [DISPLAY, "big-shoulders-latin-900-normal.woff2", "900"],
  [MONO, "jetbrains-mono-latin-400-normal.woff2", "400"],
  [MONO, "jetbrains-mono-latin-500-normal.woff2", "500"],
  [MONO, "jetbrains-mono-latin-700-normal.woff2", "700"],
  [SANS, "inter-latin-300-normal.woff2", "300"],
  [SANS, "inter-latin-400-normal.woff2", "400"],
  [SANS, "inter-latin-500-normal.woff2", "500"],
  [ROUND, "poppins-latin-700-normal.woff2", "700"],
  [HAND, "caveat-700-normal.ttf", "700"],
  [HAND, "caveat-500-normal.ttf", "500"],
  [BRUSH, "caveat-brush-latin-400-normal.woff2", "400"],
  [PRINT, "bebas-neue-400-normal.ttf", "400"],
  [HEBREW, "assistant-700-normal.ttf", "700"],
];
const loading: Promise<void>[] = fonts.map(([family, file, weight]) => loadFont({ family, url: staticFile(`fonts/${file}`), weight }));

// Serif with Greek letters, for chalkboard titles, labels and equations.
const GREEK = "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF";
(["latin", "greek"] as const).forEach((subset) => {
  const unicodeRange = subset === "greek" ? GREEK : undefined;
  loading.push(loadFont({ family: SERIF, url: staticFile(`fonts/stix-two-text-${subset}-700-normal.woff2`), weight: "700", unicodeRange }));
  loading.push(loadFont({ family: SERIF, url: staticFile(`fonts/stix-two-text-${subset}-400-italic.woff2`), weight: "400", style: "italic", unicodeRange }));
});

// Resolves when every bundled font can be measured and drawn.
export const fontsReady: Promise<unknown> = Promise.all(loading).catch(() => undefined);

export const displayStack = `"${DISPLAY}", "Arial Narrow", sans-serif`;
export const monoStack = `"${MONO}", Menlo, monospace`;

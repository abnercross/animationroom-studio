export type Word = [number, number, string];

// One thing that appears on screen for a stretch of the video. Times are seconds on the edited timeline.
export type Moment = {
  type: "title" | "list" | "number" | "key" | "cta" | "words" | "visual";
  from: number;
  to: number;
  layout?: "window" | "full"; // window: the person moves into a frame and the block fills the page (default)
  tag?: string; // small mono label top left in window layout
  // title
  kicker?: string; text?: string;
  // list
  heading?: string; items?: { text: string; at: number }[];
  // number
  value?: number; prefix?: string; suffix?: string; decimals?: number; label?: string;
  // key
  mark?: string;
  // words: the spoken words as large type (the plan never writes these, the system fills every stretch with no graphic)
  phrase?: Word[]; variant?: "lower" | "stack" | "big" | "strip" | "panel" | "keyword"; key?: number; fadeOut?: boolean; auto?: boolean;
  // cta
  action?: string; name?: string; role?: string;
  // visual: a line drawing from the library (drawings.json) that draws itself on a spoken word. With "text" it sits
  // next to its headline; without, the spoken words run beside it (words moments marked "beside")
  draw?: string; at?: number; beside?: boolean;
};

export type EditPlan = {
  format?: "9:16" | "16:9"; // the shape of the finished video (default 9:16)
  duration: number;
  video: { src: string; width: number; height: number };
  face: { x: number; y: number; track?: { step: number; x: number[]; y: number[] } }; // centre of the face as fractions of the video frame, and where it goes
  words: Word[];
  moments: Moment[];
};

export type EditProps = { plan: EditPlan; tokens?: Partial<import("./theme").Tokens> };

// Named faces and poses for the chibi rig (person block). The checker turns a name into the rig's own fields,
// so every video uses the same faces and poses. Fields given next to the name always win.
// Arms: 0 hangs down, 90 points sideways, 180 straight up; elbows bend the forearm further.

export const CHIBI_MOODS = {
  happy: { eyes: "open", mouth: "smile", brows: "normal", sweat: false },
  joy: { eyes: "happy", mouth: "big", brows: "up", sweat: false },
  excited: { eyes: "wide", mouth: "big", brows: "up", sweat: false },
  calm: { eyes: "closed", mouth: "smile", brows: "normal", sweat: false },
  proud: { eyes: "closed", mouth: "smirk", brows: "up", sweat: false },
  smug: { eyes: "squint", mouth: "smirk", brows: "flat", sweat: false },
  neutral: { eyes: "open", mouth: "flat", brows: "normal", sweat: false },
  curious: { eyes: "open", mouth: "o", brows: "up", sweat: false },
  thinking: { eyes: "open", mouth: "flat", brows: "flat", sweat: false },
  surprised: { eyes: "wide", mouth: "o", brows: "up", sweat: false },
  shocked: { eyes: "wide", mouth: "o", brows: "worried", sweat: true },
  worried: { eyes: "open", mouth: "wobble", brows: "worried", sweat: true },
  nervous: { eyes: "wide", mouth: "grit", brows: "worried", sweat: true },
  sad: { eyes: "sad", mouth: "sad", brows: "worried", sweat: false },
  tired: { eyes: "squint", mouth: "flat", brows: "flat", sweat: false },
  annoyed: { eyes: "squint", mouth: "flat", brows: "angry", sweat: false },
  angry: { eyes: "open", mouth: "grit", brows: "angry", sweat: false },
  determined: { eyes: "open", mouth: "flat", brows: "angry", sweat: false },
  strain: { eyes: "squint", mouth: "grit", brows: "angry", sweat: true },
  shy: { eyes: "happy", mouth: "smile", brows: "worried", sweat: false, blush: true },
  dizzy: { eyes: "spiral", mouth: "wobble", brows: "none", sweat: false },
  knocked: { eyes: "x", mouth: "o", brows: "none", sweat: false },
};

const ARMS = (armL, elbowL, armR, elbowR, more = {}) => ({ armL, elbowL, armR, elbowR, tilt: 0, headDown: 0, lean: 0, wave: false, ...more });
export const CHIBI_POSES = {
  stand: ARMS(12, 8, 12, 8, { sit: 0 }),
  wave: ARMS(12, 8, 150, 10, { wave: true }),
  point: ARMS(12, 8, 90, 0),
  pointleft: ARMS(90, 0, 12, 8),
  pointup: ARMS(12, 8, 110, 55),
  present: ARMS(12, 8, 72, -25),
  cheer: ARMS(130, 15, 130, 15),
  fist: ARMS(12, 8, 60, 115),
  open: ARMS(100, -10, 100, -10),
  shrug: ARMS(60, 60, 60, 60, { tilt: 6 }),
  hips: ARMS(41, -74, 41, -74),
  cross: ARMS(17, -107, 17, -107),
  clasp: ARMS(24, -105, 24, -105),
  think: ARMS(12, 8, -40, 240, { tilt: -5 }),
  handhead: ARMS(12, 8, 150, 55, { headDown: 0.25 }),
  cover: ARMS(121, 77, 121, 77),
  lift: ARMS(160, 30, 160, 30),
  slump: ARMS(4, 0, 4, 0, { headDown: 0.6 }),
  sit: ARMS(25, 30, 25, 30, { sit: 1 }),
};

// Fill in a block or key from its mood and pose names. Returns the list of unknown names.
export const expandChibi = (st) => {
  const bad = [];
  for (const [field, table] of [["mood", CHIBI_MOODS], ["pose", CHIBI_POSES]]) {
    if (st[field] === undefined) continue;
    const def = table[st[field]];
    if (!def) { bad.push(`${field} "${st[field]}" is not one of ${Object.keys(table).join(", ")}`); continue; }
    for (const [key, v] of Object.entries(def)) if (st[key] === undefined) st[key] = v;
  }
  return bad;
};

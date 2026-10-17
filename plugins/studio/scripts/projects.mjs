// Project folders, shared by Animate and Edit. One project is one folder name, "YYYYMMDD Name", used twice:
// in Work in progress (drafts and plans, safe to clear) and in Finished videos (every exported version and,
// once the member agrees, the original recording or voiceover). No file ever lives in two places.
import fs from "node:fs";
import path from "node:path";

export const FOLDER_NAMES = { inbox: "Drop videos here", finished: "Finished videos", work: "Work in progress" };

// A name that is safe as a folder or file name on Mac and Windows.
export const safeName = (s) =>
  String(s ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 60).trim() || "Project";

export const dayStamp = (d = new Date()) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("");

export const projectFolderName = (name, d) => `${dayStamp(d)} ${safeName(name)}`;

// The plain name of a project from any work folder name: new ("20261013 Name"), old ("Name 2026 10 13") or a
// copy of a phone video ("copy_8B97..." ).
export const jobNameOf = (folderName) =>
  String(folderName).replace(/^\d{8} /, "").replace(/ \d{4} \d{2} \d{2}$/, "").replace(/^copy_/, "");

// The Finished videos folder name that belongs to a work folder. Old work folders get the new style name.
export function finishedProjectName(workFolderName) {
  if (/^\d{8} /.test(workFolderName)) return workFolderName;
  const m = /^(.*) (\d{4}) (\d{2}) (\d{2})$/.exec(workFolderName);
  if (m) return `${m[2]}${m[3]}${m[4]} ${safeName(jobNameOf(workFolderName))}`;
  return projectFolderName(jobNameOf(workFolderName));
}

// The next free version label (V01, V02...) for "<base> V01.mp4" files already in a folder.
export function nextVersion(dir, base) {
  const re = new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " V(\\d+)", "i");
  let top = 0;
  if (fs.existsSync(dir)) for (const n of fs.readdirSync(dir)) { const m = re.exec(n); if (m) top = Math.max(top, +m[1]); }
  return "V" + String(top + 1).padStart(2, "0");
}

// Start or resume a project today. The finished folder is only made when something is exported into it.
export function openProject(root, name, d) {
  const folder = projectFolderName(name, d);
  const work = path.join(root, FOLDER_NAMES.work, folder);
  const finished = path.join(root, FOLDER_NAMES.finished, folder);
  fs.mkdirSync(work, { recursive: true });
  return { folder, work, finished, name: safeName(name) };
}

// Move the member's original out of Drop videos here into the project's finished folder, so the drop folder
// stays an empty inbox. Only files that are inside Drop videos here are ever moved.
export function moveOriginal(root, projectFolder, file) {
  const inbox = path.join(root, FOLDER_NAMES.inbox);
  const from = path.resolve(file);
  if (!fs.existsSync(from)) return { moved: false, reason: `${from} is not there any more` };
  if (!from.startsWith(inbox + path.sep)) return { moved: false, reason: "the file is not in Drop videos here, so it was left where it is" };
  const dir = path.join(root, FOLDER_NAMES.finished, projectFolder, "Original");
  fs.mkdirSync(dir, { recursive: true });
  let to = path.join(dir, path.basename(from));
  for (let i = 2; fs.existsSync(to); i++) to = path.join(dir, path.basename(from).replace(/(\.[^.]*)?$/, ` ${i}$1`));
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== "EXDEV") throw e;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
  return { moved: true, to };
}

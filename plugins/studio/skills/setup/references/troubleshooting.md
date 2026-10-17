# Setup troubleshooting

Find the symptom, try the fix once, then run the check again. If the fix doesn't work, give the person the support details at the bottom.

## Commands freeze or never finish

Almost always a folder synced to the cloud. iCloud (Desktop and Documents on a Mac), OneDrive, Dropbox and Google Drive keep files online only, and the render engine stalls while it waits for them.

Fix: choose a videos folder outside those (see Step 4), then rerun the step. If `${CLAUDE_PLUGIN_DATA}` itself is inside a synced folder, tell the person and point them to support; that is unusual.

## "No internet" while the person is clearly online

A VPN, a company network or a firewall is blocking `registry.npmjs.org` or `nodejs.org`.

Fix: ask them to switch off the VPN for the install, or try a home network. Company laptops sometimes block installs completely; if so, say so plainly and suggest a personal computer.

## Node.js download fails or the checksum check fails

Run the Node install script once more (downloads sometimes break halfway). The script falls back to a known good release by itself if the release list cannot be read. If it fails again, use the official installer instead:

- Mac: run `open https://nodejs.org/en/download` and tell them to download the **macOS Installer (.pkg)** for the LTS version, open it and click through. Their Mac password is needed for this installer; that's expected here.
- Windows: run `start https://nodejs.org/en/download` and tell them to download the **Windows Installer (.msi)** for the LTS version and click through.

Then run the check again. `NODE_OK=system` means it worked.

## The render engine install says it cannot find Node.js

This happens when Node.js is the private copy inside the studio folder: it is not on the computer's path, and some install steps of the render engine call plain `node`. Since plugin 0.16 the helper puts that Node on the path for everything it starts, so just run `runtime install` again with the full `NODE_USE` path (`"<NODE_USE>" "${CLAUDE_PLUGIN_ROOT}/scripts/studio.mjs" runtime install ...`). Do not edit anything by hand.

## The render engine install fails

1. Run `runtime install` once more. It picks up where it stopped.
2. If the error mentions `EACCES` or permissions, the data folder isn't writable. Run the check and send the result to support.
3. If the error mentions the **browser** (for example a download of `chromium-headless-shell` failing), the network blocks that download. If Google Chrome is installed, use it instead:
   - Mac: `STUDIO runtime install --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --data "${CLAUDE_PLUGIN_DATA}"`
   - Windows: `STUDIO runtime install --browser "C:\Program Files\Google\Chrome\Application\chrome.exe" --data "${CLAUDE_PLUGIN_DATA}"`
   If Chrome isn't installed, ask them to install it from google.com/chrome and try again.

## Apple's developer tools window never appears, or says it can't install

This only matters when the speech engine install printed `NEEDS_APPLE_TOOLS=yes`. A Mac normally downloads a ready made engine and needs none of this.

- If `xcode-select --install` prints "already installed", the tools are there. Run the check again.
- If it prints "invalid active developer path" (common after a macOS update), run `xcode-select --install` again.
- If the window says the software isn't available, ask them to install **Command Line Tools for Xcode** from developer.apple.com/download (a free Apple account is needed).

## The speech engine fails to build (Mac)

A Mac downloads the engine ready made and tests it before using it. If that did not work (no internet to animationroom.app, or the test on a few seconds of speech failed), the install says why and builds the engine instead, which needs Apple's developer tools: when it prints `NEEDS_APPLE_TOOLS=yes`, install them as described above, then run `transcriber install` again. If the ready made engine keeps failing its test, delete the folder `${CLAUDE_PLUGIN_DATA}/whisper/whisper.cpp` and run `transcriber install` once more, then send the support email with the lines it printed.

## The studio asks for the license or the install again in a new chat

Run the check: the chat may be using an empty data folder (for example after the studio was added a second way, by file upload and from the store). If the check prints `DATA_ADOPTED`, the existing studio is found and used, nothing to do. If it prints `DATA_FOLDER` for an empty folder and the person did set up before, look for older folders with `ls ~/.claude/plugins/data` (Windows: `%USERPROFILE%\.claude\plugins\data`), choose the one that holds `config.json`, and remember it for good with `STUDIO config set setupComplete=true --data "<that folder>"` (this saves the choice, and every later chat finds that studio), then tell the person to remove the duplicate install in Plugins so only one remains.

## The test video fails to render

1. Run `runtime install` again, then the test again.
2. If the error mentions memory, ask them to close other heavy apps (video editors, many browser tabs) and retry.
3. If it mentions the browser failing to launch, use the Chrome fallback above.

## Windows: scripts are blocked

If PowerShell says running scripts is disabled, make sure the command starts with `powershell -NoProfile -ExecutionPolicy Bypass -File`. This allows only that one script to run, once, and changes no settings.

## Windows: very slow install

Antivirus software scans every file the render engine unpacks. The install still finishes; it just takes longer. Tell them it can take up to ten minutes.

## Support

Email: support@animationroom.app

Ask them to include:
- what they were doing when it failed,
- the checklist from the latest check (you can write it out for them),
- their operating system.

Write a three line summary they can paste into the email.

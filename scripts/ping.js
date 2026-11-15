#!/usr/bin/env node
/**
 * Cross-platform attention dialog for the `ping-me` skill.
 *
 * Detects the host platform and shows a blocking, always-on-top dialog titled
 * "hey, listen!" using whatever native mechanism is available:
 *
 *   Windows  WinForms via PowerShell (scripts/Show-AttentionDialog.ps1)
 *   macOS    AppleScript `display dialog` / `choose from list` via osascript
 *   Linux    zenity, then kdialog
 *   Anywhere a numbered prompt on the controlling terminal, as a last resort
 *
 * The chosen option is written to stdout. Exits non-zero if the user dismissed
 * the dialog without choosing.
 */

import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = join(scriptDir, "..");
const DEFAULT_SOUND = join(skillDir, "hey_listen.mp3");
const ICON = join(skillDir, "navi.png");
const TITLE = "hey, listen!";

/**
 * Config files, lowest precedence first. The user-level file survives skill
 * upgrades; the one inside the skill directory is replaced on reinstall.
 */
const CONFIG_PATHS = [
  join(skillDir, "config.json"),
  join(homedir(), ".claude", "ping-me.config.json"),
  join(homedir(), ".copilot", "ping-me.config.json"),
];

function expandHome(value) {
  return value.startsWith("~") ? join(homedir(), value.slice(1).replace(/^[\\/]/, "")) : value;
}

function readConfig() {
  const config = {};
  for (const path of CONFIG_PATHS) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.silent === "boolean") config.silent = parsed.silent;
        if (typeof parsed.sound === "string" && parsed.sound.trim()) {
          const sound = expandHome(parsed.sound.trim());
          config.sound = isAbsolute(sound) ? sound : resolve(dirname(path), sound);
        }
      }
    } catch (error) {
      process.stderr.write(`Ignoring invalid config ${path}: ${error.message}\n`);
    }
  }
  return config;
}

function truthy(value) {
  return value !== undefined && !/^(0|false|no|off|)$/i.test(String(value).trim());
}

/**
 * Resolves sound settings. Precedence: CLI flags, environment, user config,
 * skill config, bundled default.
 */
function resolveSound({ silentFlag, soundFlag }) {
  const config = readConfig();

  let silent = config.silent ?? false;
  if (process.env.PING_ME_SILENT !== undefined) silent = truthy(process.env.PING_ME_SILENT);
  if (silentFlag) silent = true;

  let sound = config.sound ?? DEFAULT_SOUND;
  if (process.env.PING_ME_SOUND) sound = expandHome(process.env.PING_ME_SOUND);
  if (soundFlag) sound = expandHome(soundFlag);

  if (silent) return null;
  if (!existsSync(sound)) {
    process.stderr.write(`Attention sound not found: ${sound}\n`);
    return existsSync(DEFAULT_SOUND) ? DEFAULT_SOUND : null;
  }
  return sound;
}

function parseArgs(argv) {
  let message = null;
  let options = "";
  let silent = false;
  let sound = null;
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const flag = arg.toLowerCase();
    if (flag === "-m" || flag === "--message" || flag === "-message") {
      message = argv[++i] ?? "";
    } else if (flag === "-o" || flag === "--options" || flag === "-options") {
      options = argv[++i] ?? "";
    } else if (flag.startsWith("--message=")) {
      message = arg.slice(arg.indexOf("=") + 1);
    } else if (flag.startsWith("--options=")) {
      options = arg.slice(arg.indexOf("=") + 1);
    } else if (flag === "-s" || flag === "--silent" || flag === "-silent") {
      silent = true;
    } else if (flag === "--sound" || flag === "-sound") {
      sound = argv[++i] ?? "";
    } else if (flag.startsWith("--sound=")) {
      sound = arg.slice(arg.indexOf("=") + 1);
    } else if (flag === "-h" || flag === "--help") {
      console.log(
        'Usage: node ping.js --message "Task completed." [--options "Yes|No"] [--silent] [--sound <file>]',
      );
      process.exit(0);
    } else {
      positional.push(arg);
    }
  }

  return {
    message: message ?? (positional.length ? positional.join(" ") : "Task completed."),
    options: splitOptions(options),
    silentFlag: silent,
    soundFlag: sound,
  };
}

function splitOptions(value) {
  return String(value ?? "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function which(command) {
  const probe = platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { stdio: "ignore" });
  return result.status === 0;
}

/** Plays the attention sound without blocking, and never fails the ping. */
function playSound(sound) {
  if (!sound) return null;

  const players =
    platform === "darwin"
      ? [["afplay", [sound]]]
      : [
          ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", sound]],
          ["mpg123", ["-q", sound]],
          ["mpv", ["--really-quiet", "--no-video", sound]],
          ["cvlc", ["--play-and-exit", "--intf", "dummy", sound]],
          ["paplay", [sound]],
        ];

  for (const [command, args] of players) {
    if (!which(command)) continue;
    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.unref();
      return child;
    } catch {
      // Try the next player.
    }
  }

  process.stderr.write("\u0007");
  return null;
}

// --- Windows -----------------------------------------------------------------

function windowsDialog(message, options, sound) {
  const shell = which("pwsh") ? "pwsh" : "powershell.exe";
  const ps1 = join(scriptDir, "Show-AttentionDialog.ps1");
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Message", message];
  if (options.length) args.push("-Options", options.join("|"));
  if (sound) args.push("-SoundPath", sound);
  else args.push("-Silent");

  const result = spawnSync(shell, args, { encoding: "utf8" });
  if (result.error) return { ok: false, unavailable: true };

  const selected = (result.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).pop();
  if (result.status !== 0 || !selected) return { ok: false };
  return { ok: true, selected };
}

// --- macOS -------------------------------------------------------------------

function escapeAppleScript(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function macDialog(message, options) {
  const buttons = options.length ? options : ["OK"];
  const iconClause = existsSync(ICON)
    ? ` with icon (POSIX file "${escapeAppleScript(ICON)}")`
    : "";

  // `display dialog` supports at most three buttons; fall back to a list picker.
  const script =
    buttons.length <= 3
      ? `tell application "System Events"
             activate
             set answer to display dialog "${escapeAppleScript(message)}" with title "${escapeAppleScript(TITLE)}" buttons {${buttons
               .map((b) => `"${escapeAppleScript(b)}"`)
               .join(", ")}} default button 1${iconClause}
             return button returned of answer
         end tell`
      : `tell application "System Events"
             activate
             set answer to choose from list {${buttons
               .map((b) => `"${escapeAppleScript(b)}"`)
               .join(", ")}} with title "${escapeAppleScript(TITLE)}" with prompt "${escapeAppleScript(message)}" default items {"${escapeAppleScript(buttons[0])}"}
             if answer is false then return ""
             return item 1 of answer
         end tell`;

  const result = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
  if (result.error) return { ok: false, unavailable: true };

  const selected = (result.stdout ?? "").trim();
  if (result.status !== 0 || !selected) return { ok: false };
  return { ok: true, selected };
}

// --- Linux -------------------------------------------------------------------

function hasDisplay() {
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

function zenityDialog(message, options) {
  const buttons = options.length ? options : ["OK"];
  const args = ["--title", TITLE, "--text", message];
  if (existsSync(ICON)) args.push("--window-icon", ICON);

  if (buttons.length === 1) {
    args.unshift("--info");
    args.push("--ok-label", buttons[0]);
  } else {
    args.unshift("--question");
    args.push("--ok-label", buttons[0], "--cancel-label", buttons[1]);
    for (const extra of buttons.slice(2)) args.push("--extra-button", extra);
  }

  const result = spawnSync("zenity", args, { encoding: "utf8" });
  if (result.error) return { ok: false, unavailable: true };

  // An extra button prints its own label; --ok-label exits 0, --cancel-label exits 1.
  const printed = (result.stdout ?? "").trim();
  if (printed && buttons.includes(printed)) return { ok: true, selected: printed };
  if (result.status === 0) return { ok: true, selected: buttons[0] };
  if (result.status === 1 && buttons.length > 1) return { ok: true, selected: buttons[1] };
  return { ok: false };
}

function kdialogDialog(message, options) {
  const buttons = options.length ? options : ["OK"];
  const common = ["--title", TITLE];
  if (existsSync(ICON)) common.push("--icon", ICON);

  let args;
  if (buttons.length === 1) args = [...common, "--msgbox", message, "--ok-label", buttons[0]];
  else if (buttons.length === 2)
    args = [...common, "--yesno", message, "--yes-label", buttons[0], "--no-label", buttons[1]];
  else if (buttons.length === 3)
    args = [
      ...common,
      "--yesnocancel",
      message,
      "--yes-label",
      buttons[0],
      "--no-label",
      buttons[1],
      "--cancel-label",
      buttons[2],
    ];
  else args = [...common, "--menu", message, ...buttons.flatMap((b, i) => [String(i), b])];

  const result = spawnSync("kdialog", args, { encoding: "utf8" });
  if (result.error) return { ok: false, unavailable: true };

  if (buttons.length > 3) {
    const index = Number.parseInt((result.stdout ?? "").trim(), 10);
    if (result.status !== 0 || Number.isNaN(index) || !buttons[index]) return { ok: false };
    return { ok: true, selected: buttons[index] };
  }

  if (result.status === 0) return { ok: true, selected: buttons[0] };
  if (result.status === 1 && buttons.length > 1) return { ok: true, selected: buttons[1] };
  if (result.status === 2 && buttons.length > 2) return { ok: true, selected: buttons[2] };
  return { ok: false };
}

// --- Terminal fallback -------------------------------------------------------

function terminalPrompt(message, options) {
  const buttons = options.length ? options : ["OK"];
  const tty = platform === "win32" ? "CON" : "/dev/tty";
  if (!existsSync(tty) && platform !== "win32") return { ok: false };

  const menu = buttons.map((b, i) => `  ${i + 1}) ${b}`).join("\n");
  process.stderr.write(`\n*** ${TITLE} ***\n${message}\n${menu}\n`);

  const read = spawnSync(
    process.execPath,
    [
      "-e",
      "const fs=require('fs');const fd=fs.openSync(process.argv[1],'rs');const b=Buffer.alloc(256);" +
        "let s='';while(true){const n=fs.readSync(fd,b,0,256,null);if(!n)break;s+=b.toString('utf8',0,n);" +
        "if(s.includes('\\n'))break;}process.stdout.write(s.split('\\n')[0]);",
      tty,
    ],
    { encoding: "utf8" },
  );

  if (read.status !== 0) return { ok: false };
  const answer = (read.stdout ?? "").trim();
  if (!answer) return { ok: true, selected: buttons[0] };

  const index = Number.parseInt(answer, 10);
  if (!Number.isNaN(index) && buttons[index - 1]) return { ok: true, selected: buttons[index - 1] };

  const matched = buttons.find((b) => b.toLowerCase() === answer.toLowerCase());
  return matched ? { ok: true, selected: matched } : { ok: false };
}

// --- Dispatch ----------------------------------------------------------------

function backendsFor() {
  if (platform === "win32") return [windowsDialog];
  if (platform === "darwin") return [macDialog];

  const linux = [];
  if (hasDisplay() && which("zenity")) linux.push(zenityDialog);
  if (hasDisplay() && which("kdialog")) linux.push(kdialogDialog);
  return linux;
}

function main() {
  const { message, options, silentFlag, soundFlag } = parseArgs(process.argv.slice(2));
  const sound = resolveSound({ silentFlag, soundFlag });

  // On Windows the PowerShell dialog owns playback, so it stops with the dialog.
  const player = platform === "win32" ? null : playSound(sound);

  let outcome = { ok: false, unavailable: true };
  for (const backend of [...backendsFor(), terminalPrompt]) {
    outcome = backend(message, options, sound);
    if (outcome.ok || !outcome.unavailable) break;
  }

  if (player) {
    try {
      process.kill(player.pid);
    } catch {
      // The player already exited.
    }
  }

  if (!outcome.ok) {
    process.stderr.write("The attention dialog closed without acknowledgment.\n");
    process.exit(1);
  }

  process.stdout.write(`${outcome.selected}\n`);
}

main();

---
name: ping-me
description: Get the user's attention by opening a native acknowledgment dialog titled "hey, listen!" on Windows, macOS or Linux, optionally offering a small set of choices. Use when a long-running task finishes, an approval or gate needs the user, or the user asks to be pinged or notified.
allowed-tools: Bash(node:*)
---

# Show a native attention dialog

Run the bundled Node script to display a blocking, always-on-top dialog. The title is always
**`hey, listen!`**, it shows the Navi icon and plays the attention sound where the platform allows
it, and it is dismissed by clicking a button or pressing Enter (which triggers the first option).

The script detects the host platform and picks a native backend automatically — no per-OS command
is needed from you:

| Platform | Backend |
| --- | --- |
| Windows | WinForms dialog via PowerShell |
| macOS | AppleScript `display dialog` (or `choose from list` for 4+ options) via `osascript` |
| Linux | `zenity`, then `kdialog` |
| Any (headless / no GUI) | numbered prompt on the controlling terminal |

Paths below are relative to this skill's directory (e.g. `~/.copilot/skills/ping-me` or
`~/.claude/skills/ping-me`).

Basic acknowledgment (single **OK** button):

```bash
node "scripts/ping.js" --message "Task completed."
```

## Offering choices

When there is a simple yes/no or a small set of options to continue work, pass `--options` (a single
**pipe-delimited** string) so the user can answer directly from the dialog without returning to the
console. The script writes the chosen option's text to stdout (capture it to decide what to do
next). The **first** option is the default and is triggered by pressing Enter.

```bash
node "scripts/ping.js" --message "Tests pass. Deploy now?" --options "Yes|No"
```

```bash
node "scripts/ping.js" --message "How should I continue?" --options "Merge|Keep working|Stop"
```

Use a short message that says what needs attention. Wait for the script to exit before reporting the
result, then read the printed option to continue. The script exits non-zero if the dialog was closed
without a choice. Keep options short (1–3 words) and limited to a few clear choices; for anything
more complex, fall back to the console. Do not send a Teams message or use WorkIQ for this skill.

## Sound configuration

The attention sound can be silenced or replaced, without editing the script.

Create `~/.copilot/ping-me.config.json` or `~/.claude/ping-me.config.json` (survive skill
upgrades) — or `config.json` inside the skill folder, which is replaced on reinstall. See
`config.example.json`:

```json
{
  "silent": false,
  "sound": "~/sounds/my-alert.mp3"
}
```

| Key | Meaning |
| --- | --- |
| `silent` | `true` skips audio entirely; the dialog still appears |
| `sound` | Path to the audio file to play instead of the bundled `hey_listen.mp3`. Relative paths resolve against the config file |

Precedence, highest first: CLI flags (`--silent`, `--sound <file>`), the `PING_ME_SILENT` and
`PING_ME_SOUND` environment variables, `~/.copilot/ping-me.config.json`,
`~/.claude/ping-me.config.json`, the skill's `config.json`, then the bundled default.

```bash
node "scripts/ping.js" --message "Build finished." --silent
```

If the user asks to be pinged silently, pass `--silent` rather than changing their config file.

## Requirements

Node.js 18 or newer. On Linux, install `zenity` (GNOME) or `kdialog` (KDE) for a graphical dialog;
without either, the script prompts on the terminal instead.

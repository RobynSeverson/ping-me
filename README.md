# ping-me

An agent skill that gets your attention with a native, always-on-top **"hey, listen!"** dialog
(with sound) when a long-running task finishes or the agent needs a decision. It can optionally
offer a few choices (e.g. `Yes|No`) so you can answer straight from the dialog.

Works with **GitHub Copilot CLI** and **Claude Code** on Windows, macOS and Linux.

## Install

### GitHub Copilot CLI

```bash
git clone https://github.com/RobynSeverson/ping-me.git ~/.copilot/skills/ping-me
```

Then append [`copilot-instructions.md`](copilot-instructions.md) to your global instructions
(`~/.copilot/copilot-instructions.md`) so Copilot pings you automatically:

```bash
cat ~/.copilot/skills/ping-me/copilot-instructions.md >> ~/.copilot/copilot-instructions.md
```

### Claude Code

```bash
git clone https://github.com/RobynSeverson/ping-me.git ~/.claude/skills/ping-me
```

Then append [`CLAUDE.md`](CLAUDE.md) to your user memory file (`~/.claude/CLAUDE.md`) so Claude
pings you automatically:

```bash
cat ~/.claude/skills/ping-me/CLAUDE.md >> ~/.claude/CLAUDE.md
```

## Usage

The agent runs it for you, but you can try it directly:

```bash
node scripts/ping.js --message "Task completed."
node scripts/ping.js --message "Tests pass. Deploy now?" --options "Yes|No"
node scripts/ping.js --message "Build finished." --silent
```

The selected option is printed to stdout; the script exits non-zero if the dialog is closed
without a choice. See [`SKILL.md`](SKILL.md) for full details.

## Configuration

Silence or replace the sound with `~/.copilot/ping-me.config.json` or
`~/.claude/ping-me.config.json` (see [`config.example.json`](config.example.json)):

```json
{
  "silent": false,
  "sound": "~/sounds/my-alert.mp3"
}
```

Environment variables `PING_ME_SILENT` and `PING_ME_SOUND`, and the `--silent` / `--sound <file>`
flags, override the config file.

## Requirements

- Node.js 18+
- Linux: `zenity` or `kdialog` for a graphical dialog (falls back to a terminal prompt), and one
  of `ffplay`, `mpg123`, `mpv`, `cvlc` or `paplay` for sound

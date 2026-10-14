# Install Blinkling

You need Claude Code on the computer you are using, signed in. Blinkling runs on that computer and uses that Claude Code.

There is an [install guide with animated steps](https://arthur031221.github.io/Blinkling/install/) that picks your computer for you. The same three actions in text:

1. Paste this line into a terminal and press Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

   In Windows PowerShell 5, use `;` instead of `&&`.

2. In Claude Code, run:

   ```text
   /blinkling:blinkling
   ```

3. On a Mac, allow **Screen Recording** for Blinkling once: System Settings, Privacy & Security.

The first run downloads the desktop app for your computer from this repository's GitHub release, checks it against the SHA-256 hash pinned in the plugin, and starts it. Nothing else is asked. After that, Blinkling starts with Claude Code unless you turn that off in its settings.

## Gatekeeper and SmartScreen

Blinkling is not notarized by Apple and has no paid Windows certificate, so the installer handles what it can. It removes the quarantine flag from its own download on macOS, signs the app ad hoc and verifies the signature, and clears the Zone.Identifier stream on Windows. If macOS still says it cannot open Blinkling, open System Settings, Privacy & Security and choose **Open Anyway**. If Windows says it protected your PC, choose **More info**, then **Run anyway**. The install guide shows both with a short animation.

## Linux

Blinkling needs a desktop session (X11 or Wayland). Ubuntu 24.04 and later restrict unprivileged user namespaces, which Chromium's sandbox needs. Blinkling checks this itself and starts without the sandbox only when no working one exists; you do nothing.

## Upgrade

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
```

Then run `/reload-plugins` and `/blinkling:blinkling` in Claude Code. The new plugin pins the new desktop build; the launcher installs it and keeps the previous one until the new one answers.

## Run a source checkout

Install Node.js 22 or newer and a recent Claude Code. In a terminal:

```sh
git clone https://github.com/Arthur031221/Blinkling.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
claude --plugin-dir "$PWD"
```

The version check must print **3.0.0**. In the session that the last command opens, run `/blinkling:blinkling`. The `--plugin-dir` flag loads your checkout for that session, so use it each time you start Claude Code from source, and restart the session after rebuilding.

A checkout has no pinned release until the release workflow commits one. Until then `plugin/desktop/manifest.json` lists no builds, and `/blinkling:blinkling` says so instead of downloading anything.

## Limits

Blinkling works with desktop Claude Code on macOS, Windows and Linux. It does not run on a computer without a screen. If Claude Code is missing on the computer, Blinkling tells you how to install it. Browser settings pages, other apps' secure fields and password managers are never read.

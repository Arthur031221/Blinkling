These tests exercise the desktop shell with real Electron windows, native XTest
input, a compositing window manager, and desktopCapturer pixels. They use one
worker and zero retries. No Claude requests are needed for shell verification.

Run from the repository root with Node 24:

```sh
export PATH="$HOME/.local/node24/bin:$PATH"
export BLINKLING_REPORT_DIR=/tmp/blinkling-shell-report
npm run desktop:check
bash desktop/main/acceptance/linux.sh
bash desktop/main/acceptance/multi.sh
npm run desktop:build
BLINKLING_TEST_EXECUTABLE="$PWD/release/desktop/Blinkling-linux-x64/Blinkling" \
  xvfb-run -a -s '-screen 0 1280x800x24 +extension Composite' \
  dbus-run-session -- bash desktop/e2e/linux.sh
```

Linux prerequisites: Xvfb, xfwm4, dbus-x11, Python 3, libX11/libXtst, and
Electron's shared libraries. The two-display test additionally needs xrandr,
Xorg, and xserver-xorg-video-dummy. It allocates its own X server through
displayfd, drives two real RandR outputs, and removes/restores an output.
Both runners stop only the server/manager processes they started.

Screenshots are composited desktop captures, including the background app.
Inspect the menu and card captures at 100/150/200% in both themes, plus peek,
hover, drag, pupil, permission, and dual-display captures. Frame reports contain
actual requestAnimationFrame intervals: p95 must stay below 21 ms and fewer than
three intervals may exceed 33.4 ms in each 179-frame sample. These measurements
establish the tested X11 environment's frame budget, not physical GPU or other
operating systems' performance.

The registered action test supplies service handlers and verifies native menu
dispatch and the confirmed auto-explain toggle. Session-expression tests supply
typed events through main-process IPC. Actual feature services, Claude turn
transport, composer contents, and permission approval belong to their owning
buckets. Chat window focus, pinning, native cutout hit regions, and expressions
are implemented here. The original desktop E2E security/capture/overlay checks
also run against the packaged executable.

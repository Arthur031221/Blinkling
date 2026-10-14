# Desktop shell verification

Run from the repository root with Node 24 and installed npm dependencies.
Linux tests need Xvfb, xfwm4 with compositing, dbus-run-session, xmessage, Python 3,
libX11 and libXtst. The display test also needs Xorg with the dummy driver
and xrandr. It starts a dedicated server and never changes the host displays.

```sh
export BLINKLING_REPORT_DIR="$PWD/test-results/desktop-shell"
xvfb-run -a -s '-screen 0 1280x800x24 +extension Composite' \
  dbus-run-session -- bash desktop/main/e2e/linux.sh
bash desktop/main/e2e/displays.sh
npm run desktop:build
export BLINKLING_TEST_EXECUTABLE="$PWD/release/desktop/Blinkling-linux-x64/Blinkling"
xvfb-run -a -s '-screen 0 1280x800x24 +extension Composite' \
  dbus-run-session -- bash desktop/main/e2e/linux.sh
```

`linux.sh` runs the original sandbox, native alpha, capture and overlay tests,
then the shell motion and scale/theme matrix. XTest sends native pointer input.
Desktop screenshots and pixel assertions include the actual compositor output.
RAF samples measure breathing, blinks, eye movement, waving, fan stagger,
release bounce, reverse closing and frame cost. A separate xmessage process
proves that closing an intentional chat restores another application's native
focus. The menu routing test injects feature handlers
only for the services supplied by other build buckets; screen capture is real.

`hover.e2e.mjs` and `card.e2e.mjs` cover pointer polling over another
application, the wheel over the answer deck, deck bounds after a drag to each
edge, every menu pill with bubbles present, what keeps the card open, and the
keyboard after a capture (typed with native XTest keys). The native file
chooser cannot be driven under Xvfb, so its test stubs the picker and
dispatches `cancel`.

`displays.sh` exercises actual RandR hotplug, cross-display drag, per-display
restart, removal while pinned and resolution changes. Set
`BLINKLING_XORG_DISPLAY` if its default `:9119` is occupied. Tests fail on an
occupied display or dead compositor rather than silently testing another server.

These tests prove Linux X11 behavior. macOS Spaces, Windows fullscreen and
physical mixed-DPI displays still require native platform acceptance before
release. Native Wayland needs the XWayland positioning path described in the
architecture document.

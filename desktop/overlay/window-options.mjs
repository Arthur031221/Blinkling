/** How the overlay window is made. It covers its whole display, menu bar
 * included: without enableLargerThanScreen macOS pushes it down to the work
 * area and every mark is drawn that far from its place. */
export const overlayWindowOptions = (display, preload) => ({
  ...display.bounds,
  title: "Blinkling",
  transparent: true,
  frame: false,
  hasShadow: false,
  alwaysOnTop: true,
  focusable: false,
  show: false,
  resizable: false,
  enableLargerThanScreen: true,
  webPreferences: {
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
  },
});

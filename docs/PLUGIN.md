# Plugin layout

- The plugin metadata declares the plugin identity and marketplace source.
- `.mcp.json` starts the committed `bin/blinkling.cjs` bundle.
- `commands/` contains the installed slash-command instructions.
- `skills/screen-sharing/SKILL.md` documents consent and capture behavior for the screen-sharing skill.
- `bin/blinkling.cjs` contains the bridge and its runtime dependencies.
- `bin/extension/` is the optional companion that `extension_install` copies to `~/Blinkling-extension`.
- `bin/panel/assets/` holds the images the setup page shows.

The bundled plugin needs no separate bridge install or checkout at runtime. Run `npm run build:plugin` to build the companion and bundle the bridge into generated files. Do not edit generated bundle files by hand.

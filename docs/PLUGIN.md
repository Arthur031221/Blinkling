# Plugin layout

- The plugin metadata declares the plugin identity and marketplace source.
- `.mcp.json` starts the committed `bin/blinkling.cjs` bundle.
- `commands/` contains the installed slash-command instructions.
- `skills/screen-sharing/SKILL.md` documents consent and capture behavior for the screen-sharing skill.
- `bin/blinkling.cjs` contains the bridge and its runtime dependencies.
- `bin/extension/` contains the optional browser helper.

The bundled plugin does not require a browser extension, separate bridge install or checkout at runtime. Run `npm run build:plugin` to build the helper and bundle the bridge into generated files. Do not edit generated bundle files by hand.

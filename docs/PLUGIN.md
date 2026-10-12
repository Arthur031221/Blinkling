# Plugin layout

- The plugin metadata declares the plugin identity and marketplace source.
- `.mcp.json` starts the committed `bin/glimpselet.cjs` bundle.
- `commands/` contains the installed slash-command instructions.
- `skills/screen-sharing/SKILL.md` documents consent and capture behavior for the screen-sharing skill.
- `bin/glimpselet.cjs` contains the bridge and its runtime dependencies.
- `bin/panel/` contains the static browser application.

The bundled plugin does not require a browser extension, separate bridge install or checkout at runtime. After changing bridge or panel sources, run `npm run build:plugin` to rebuild generated files. Do not edit generated bundle files by hand.

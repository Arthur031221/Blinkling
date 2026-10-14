# Marked

`marked.mjs` is the ESM distribution of **marked 16.3.0**, already pinned in the
root package.json, copied from `node_modules/marked/lib/marked.esm.js` and
formatted with the repository's Prettier. The sourcemap footer was removed.
The upstream source is otherwise unchanged. `LICENSE.md` preserves its licenses.

Vendoring permits local ESM imports in a sandboxed Electron `file:` renderer
without Node integration, a development server, network imports or a bundler
dependency on workspace-hoisted packages. Update this copy deliberately with
the pinned root dependency and rerun the Markdown safety/structure tests.

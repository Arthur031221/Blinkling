// Playwright evaluate runs in a VM without dynamic-import support. Keep the
// importer in the actual test entry module; this file is excluded from packages.
globalThis.b3Import = (path) => import(path);
import("../../main/shell.mjs");

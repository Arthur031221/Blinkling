import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderInstallScripts } from "./sync-install-scripts.mjs";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const config = JSON.parse(read("config/install.json"));

describe("install.sh and install.ps1 share one default", () => {
  const sh = read("install.sh");
  const ps1 = read("install.ps1");

  it("both default to the marketplace in config/install.json", () => {
    expect(sh).toContain(`\${BLINKLING_MARKETPLACE:-${config.marketplace}}`);
    expect(ps1).toContain(`else { '${config.marketplace}' }`);
  });

  it("both read the same default and install the same plugin", () => {
    const fromSh = sh.match(/BLINKLING_MARKETPLACE:-([^}"]+)/)[1];
    const fromPs1 = ps1.match(/else \{ '([^']+)' \}/)[1];
    expect(fromPs1).toBe(fromSh);
    expect(sh).toContain(`claude plugin install ${config.plugin}`);
    expect(ps1).toContain(`claude plugin install ${config.plugin}`);
  });

  it("the committed scripts are what the generator writes", () => {
    expect(renderInstallScripts(config, { sh, ps1 })).toEqual({ sh, ps1 });
  });

  it("an edited default is carried into both scripts", () => {
    const changed = renderInstallScripts(
      { marketplace: "someone/else", plugin: "x@y" },
      { sh, ps1 },
    );
    expect(changed.sh).toContain("BLINKLING_MARKETPLACE:-someone/else");
    expect(changed.ps1).toContain("else { 'someone/else' }");
    expect(changed.ps1).toContain("claude plugin install x@y");
  });
});

// install.sh and install.ps1 must install from the same place. The place lives
// in config/install.json; this writes it into both (or checks that it is).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function renderInstallScripts({ marketplace, plugin }, { sh, ps1 }) {
  return {
    sh: sh
      .replace(
        /BLINKLING_MARKETPLACE:-[^}"]+/,
        `BLINKLING_MARKETPLACE:-${marketplace}`,
      )
      .replace(/claude plugin install \S+/, `claude plugin install ${plugin}`),
    ps1: ps1
      .replace(/else \{ '[^']+' \}/, `else { '${marketplace}' }`)
      .replace(/claude plugin install \S+/, `claude plugin install ${plugin}`),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync("config/install.json", "utf8"));
  const current = {
    sh: readFileSync("install.sh", "utf8"),
    ps1: readFileSync("install.ps1", "utf8"),
  };
  const next = renderInstallScripts(config, current);
  if (process.argv.includes("--check")) {
    if (next.sh !== current.sh || next.ps1 !== current.ps1) {
      console.error(
        "install.sh and install.ps1 differ from config/install.json. Run: node scripts/sync-install-scripts.mjs",
      );
      process.exit(1);
    }
  } else {
    writeFileSync("install.sh", next.sh);
    writeFileSync("install.ps1", next.ps1);
  }
}

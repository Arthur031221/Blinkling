import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

// Chromium's sandbox needs either unprivileged user namespaces or a setuid
// root helper next to the executable. A stock Ubuntu 24.04 allows neither:
// AppArmor strips the capabilities a new user namespace needs, and a build
// that was unpacked as a normal user cannot own a setuid root file. Without a
// sandbox the app dies at start (SIGTRAP), so the launcher picks one that
// works and only then falls back to running without it.

const SYSCTLS = {
  apparmor: "kernel/apparmor_restrict_unprivileged_userns",
  clone: "kernel/unprivileged_userns_clone",
  max: "user/max_user_namespaces",
};

/** Pure decision. `userns` is "open", "apparmor", "disabled" or "none";
 * `helper` is "none", "present but not setuid", "setuid but owned by a user"
 * or "setuid root". A working sandbox always wins over running without one. */
export function chooseSandbox({ platform, userns, helper }) {
  if (platform !== "linux")
    return { sandbox: true, via: "system", reason: "not Linux" };
  if (helper === "setuid root")
    return { sandbox: true, via: "setuid-helper", reason: "" };
  if (userns === "open")
    return { sandbox: true, via: "user-namespaces", reason: "" };
  const reason =
    userns === "apparmor"
      ? "AppArmor restricts unprivileged user namespaces and the sandbox helper is not setuid root"
      : "user namespaces are disabled and the sandbox helper is not setuid root";
  return { sandbox: false, via: "none", reason };
}

export const sandboxArgs = (decision) =>
  decision.sandbox ? [] : ["--no-sandbox"];

async function number(path) {
  try {
    return Number((await readFile(path, "utf8")).trim());
  } catch {
    return undefined;
  }
}

/** What the kernel and the unpacked build allow, read without running anything. */
export async function readSandboxFacts({
  platform = process.platform,
  executable,
  sys = "/proc/sys",
} = {}) {
  if (platform !== "linux") return { platform };
  const [apparmor, clone, max] = await Promise.all(
    [SYSCTLS.apparmor, SYSCTLS.clone, SYSCTLS.max].map((name) =>
      number(join(sys, name)),
    ),
  );
  const userns =
    max === 0
      ? "none"
      : clone === 0
        ? "disabled"
        : apparmor === 1
          ? "apparmor"
          : "open";
  let helper = "none";
  try {
    const info = await stat(join(dirname(executable), "chrome-sandbox"));
    helper =
      (info.mode & 0o4000) === 0
        ? "present but not setuid"
        : info.uid === 0
          ? "setuid root"
          : "setuid but owned by a user";
  } catch {
    // No helper shipped with this build.
  }
  return { platform, userns, helper };
}

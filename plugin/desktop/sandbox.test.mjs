import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseSandbox, readSandboxFacts, sandboxArgs } from "./sandbox.mjs";

const open = { userns: "open", helper: "none" };
const kernels = {
  "no restriction anywhere": ["open", true, "user-namespaces"],
  "AppArmor restricts unprivileged user namespaces": [
    "apparmor",
    false,
    "apparmor",
  ],
  "the distribution switch turns user namespaces off": [
    "disabled",
    false,
    "disabled",
  ],
  "no user namespaces are allowed at all": ["none", false, "disabled"],
};
const helpers = {
  none: false,
  "present but not setuid": false,
  "setuid but owned by a user": false,
  "setuid root": true,
};

for (const [kernel, [userns, namespacesWork, why]] of Object.entries(kernels))
  for (const [helper, helperWorks] of Object.entries(helpers)) {
    test(`linux: ${kernel}, helper ${helper}`, () => {
      const decision = chooseSandbox({ platform: "linux", userns, helper });
      assert.equal(decision.sandbox, namespacesWork || helperWorks);
      if (helperWorks) assert.equal(decision.via, "setuid-helper");
      else if (namespacesWork) assert.equal(decision.via, "user-namespaces");
      else assert.match(decision.reason, new RegExp(why, "i"));
    });
  }

test("a working sandbox is always preferred over turning it off", () => {
  for (const userns of ["open", "apparmor", "disabled", "none"]) {
    const decision = chooseSandbox({
      platform: "linux",
      userns,
      helper: "setuid root",
    });
    assert.equal(decision.sandbox, true);
    assert.deepEqual(sandboxArgs(decision), []);
  }
});

test("only a failed Linux probe adds --no-sandbox, other systems never do", () => {
  assert.deepEqual(
    sandboxArgs(chooseSandbox({ platform: "linux", ...open })),
    [],
  );
  assert.deepEqual(
    sandboxArgs(
      chooseSandbox({ platform: "linux", userns: "apparmor", helper: "none" }),
    ),
    ["--no-sandbox"],
  );
  for (const platform of ["darwin", "win32"])
    assert.deepEqual(
      sandboxArgs(
        chooseSandbox({ platform, userns: "apparmor", helper: "none" }),
      ),
      [],
    );
});

async function fixture(sysctls, helper) {
  const root = await mkdtemp(join(tmpdir(), "blinkling-sandbox-"));
  for (const [name, value] of Object.entries(sysctls)) {
    const file = join(root, "sys", ...name.split("."));
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, `${value}\n`);
  }
  const executable = join(root, "app", "blinkling");
  await mkdir(join(root, "app"));
  await writeFile(executable, "");
  if (helper !== undefined) {
    await writeFile(join(root, "app", "chrome-sandbox"), "");
    await chmod(join(root, "app", "chrome-sandbox"), helper);
  }
  return { root, executable, sys: join(root, "sys") };
}

test("facts come from the kernel switches and the helper next to the executable", async () => {
  const cases = [
    [{}, undefined, { userns: "open", helper: "none" }],
    [
      { "kernel.apparmor_restrict_unprivileged_userns": 1 },
      undefined,
      { userns: "apparmor", helper: "none" },
    ],
    [
      { "kernel.apparmor_restrict_unprivileged_userns": 0 },
      0o755,
      { userns: "open", helper: "present but not setuid" },
    ],
    [
      { "kernel.unprivileged_userns_clone": 0 },
      undefined,
      { userns: "disabled", helper: "none" },
    ],
    [
      { "user.max_user_namespaces": 0 },
      undefined,
      { userns: "none", helper: "none" },
    ],
  ];
  for (const [sysctls, mode, expected] of cases) {
    const { root, executable, sys } = await fixture(sysctls, mode);
    try {
      const facts = await readSandboxFacts({
        platform: "linux",
        executable,
        sys,
      });
      assert.deepEqual(facts, { platform: "linux", ...expected });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("a setuid helper owned by this user is not a working sandbox", async () => {
  const { root, executable, sys } = await fixture(
    { "kernel.apparmor_restrict_unprivileged_userns": 1 },
    0o4755,
  );
  try {
    const facts = await readSandboxFacts({
      platform: "linux",
      executable,
      sys,
    });
    assert.equal(
      facts.helper,
      process.getuid() === 0 ? "setuid root" : "setuid but owned by a user",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("other systems need no facts", async () => {
  assert.deepEqual(await readSandboxFacts({ platform: "darwin" }), {
    platform: "darwin",
  });
});

/** Model and effort names, in one place for the list, the selected value and
 * the validation in index.mjs. */
export const efforts = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
/** Blink has no tools, so asking first and planning are the only modes. */
export const permissionModes = Object.freeze(["default", "plan"]);
/** The one version table. A family alias such as "opus" means the version
 * listed here, and the list shows every family with that version. */
export const modelVersions = Object.freeze({
  opus: "5.5",
  sonnet: "5.5",
  haiku: "5.5",
  fable: "5.1",
});
export const families = Object.freeze(Object.keys(modelVersions));

const full = new RegExp(
  `^(?:claude-)?(${families.join("|")})(?:-(\\d+)(?:-(\\d{1,2}))?)?(?:-\\d{8})?$`,
);

const capital = (family) => `${family[0].toUpperCase()}${family.slice(1)}`;

/** "claude-opus-5-5-20260101" and "opus" become "Opus 5.5". An id that is not
 * a Claude family is shown as it is, never invented. */
export function modelLabel(id) {
  const match = String(id).match(full);
  if (!match) return String(id);
  const [, family, major, minor] = match;
  if (major === undefined) return `${capital(family)} ${modelVersions[family]}`;
  return `${capital(family)} ${major}${minor === undefined ? "" : `.${minor}`}`;
}

/** A family alias becomes the current full id ("fable" is
 * "claude-fable-5-1"); anything else is returned as it came. */
export function modelId(id) {
  const alias = String(id);
  if (!Object.hasOwn(modelVersions, alias)) return alias;
  return `claude-${alias}-${modelVersions[alias].replace(".", "-")}`;
}

/** The family a full id belongs to, when the list has that family's row. */
export const familyOf = (id) => String(id).match(full)?.[1];

/** Model and effort names, in one place for the list, the selected value and
 * the validation in index.mjs. */
export const efforts = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
/** Blink has no tools, so asking first and planning are the only modes. */
export const permissionModes = Object.freeze(["default", "plan"]);
export const families = Object.freeze(["opus", "sonnet", "haiku"]);

const full =
  /^(?:claude-)?(opus|sonnet|haiku)(?:-(\d+)(?:-(\d{1,2}))?)?(?:-\d{8})?$/;

/** "claude-opus-5-5-20260101" and "opus" become "Opus 5.5" and "Opus". An id
 * that is not a Claude family is shown as it is, never invented. */
export function modelLabel(id) {
  const match = String(id).match(full);
  if (!match) return String(id);
  const [, family, major, minor] = match;
  const name = `${family[0].toUpperCase()}${family.slice(1)}`;
  if (major === undefined) return name;
  return `${name} ${major}${minor === undefined ? "" : `.${minor}`}`;
}

/** The family a full id belongs to, when the list has that family's row. */
export const familyOf = (id) => String(id).match(full)?.[1];

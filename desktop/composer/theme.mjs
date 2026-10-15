/** The shell knows the real theme (`data-theme`), and a window's media query
 * does not always follow it. look.css only switches on the media query, so
 * mirror its two rules under `[data-theme]`, taking the values from look.css
 * rather than restating them. */
const dark = (rule) =>
  /prefers-color-scheme:\s*dark/.test(rule.media?.mediaText ?? "");
export function followShellTheme(doc = document) {
  const sheet = [...doc.styleSheets].find((s) =>
    /look\.css/.test(s.href ?? ""),
  );
  if (!sheet) return false;
  const rules = [...sheet.cssRules];
  const base = rules.find((r) => r.selectorText === ":root");
  const night = rules.find(dark)?.cssRules?.[0];
  if (!base || !night) return false;
  sheet.insertRule(
    `:root[data-theme="light"] { ${base.style.cssText} }`,
    sheet.cssRules.length,
  );
  sheet.insertRule(
    `:root[data-theme="dark"] { ${night.style.cssText} }`,
    sheet.cssRules.length,
  );
  return true;
}

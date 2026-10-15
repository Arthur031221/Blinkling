/** What Blink never looks at (PV-1). Pure rules over what the locator reports
 * about the focused window; no I/O. */

const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** The seven managers the brief names, plus Apple's. Matched against the
 * normalised app or process name, so "com.agilebits.onepassword7", "1Password"
 * and "bitwarden.exe" all count. */
export const PASSWORD_MANAGERS = Object.freeze([
  { id: "1password", app: /1password|onepassword/ },
  { id: "bitwarden", app: /bitwarden/ },
  { id: "keepassxc", app: /keepass/ },
  { id: "lastpass", app: /lastpass/ },
  { id: "dashlane", app: /dashlane/ },
  { id: "keeper", app: /^keeper$|keeper(?:password|security|desktop)/ },
  { id: "proton-pass", app: /protonpass/ },
  { id: "apple-passwords", app: /^passwords$|^comapplepasswords/ },
]);

const BROWSER =
  /chrome|chromium|msedge|microsoftedge|firefox|safari|brave|vivaldi|^opera|operagx|librewolf|waterfox|orion|thorium|duckduckgo|^arc$|^zen$/;

/** Window titles that browsers give a private window, in the nine languages. */
const PRIVATE_TITLE = [
  /incognito|inprivate|private (?:browsing|window)/i,
  /incógnito|inkognito|anônima|anónima|navegación privada|navegação privada|navigation privée|privater modus|privates fenster/i,
  /無痕|无痕|隐身|隱私瀏覽|隐私浏览|私密瀏覽|シークレット|プライベートブラウズ|プライベートウィンドウ|시크릿|비공개 브라우징/,
  // Safari marks a private window by a trailing "— Private".
  /[—–-]\s*(?:private|私密|privat|privé|privado|プライベート|비공개)\s*$/i,
];

const isBrowser = (app) => BROWSER.test(norm(app));
const managerApp = (app) =>
  PASSWORD_MANAGERS.some((m) => m.app.test(norm(app)));

/** Returns `{ ok: true }` or `{ ok: false, reason }` for the focused window.
 * A focused password or secure field outranks a password manager, which
 * outranks a private window. */
export function classify(focus) {
  if (focus?.secure) return { ok: false, reason: "secure" };
  const window = focus?.window;
  if (!window) return { ok: true };
  const app = window.app ?? "";
  const title = String(window.title ?? "");
  // A tab that merely mentions a manager must not count: titles are only read
  // for apps that are not browsers (browsers carry the companion's flag).
  const known = norm(app).length > 0;
  if (
    window.passwordManager === true ||
    managerApp(app) ||
    (known && !isBrowser(app) && managerApp(title))
  )
    return { ok: false, reason: "password-manager" };
  if (
    window.private === true ||
    ((!known || isBrowser(app)) &&
      PRIVATE_TITLE.some((rule) => rule.test(title)))
  )
    return { ok: false, reason: "private" };
  return { ok: true };
}

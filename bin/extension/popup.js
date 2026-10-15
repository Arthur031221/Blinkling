// extension/strings.ts
var en = {
  connected: "Connected to Blinkling in Claude Code.",
  notSetUp: "Not set up yet. Open the companion guide from Blink's settings.",
  bridgeMissing: "Can't find Blinkling. Start Claude Code with the Blinkling plugin.",
  blinkRunning: "Blink is running.",
  blinkOff: "Blink is not running.",
  blinkUnknown: "Blink can't be checked until Blinkling is connected.",
  pageReadable: "Blink can read this page.",
  pageRestricted: "Blink can't read this kind of page.",
  wake: "Wake Blink",
  waking: "Waking Blink\u2026",
  wakeFailed: "Blink did not wake. Try again."
};
var popupLocales = {
  en,
  "zh-TW": {
    connected: "\u5DF2\u9023\u5230 Claude Code \u88E1\u7684 Blinkling\u3002",
    notSetUp: "\u5C1A\u672A\u8A2D\u5B9A\u3002\u8ACB\u5F9E Blink \u7684\u8A2D\u5B9A\u958B\u555F\u5C0F\u5E6B\u624B\u8AAA\u660E\u3002",
    bridgeMissing: "\u627E\u4E0D\u5230 Blinkling\u3002\u8ACB\u555F\u52D5\u5DF2\u5B89\u88DD Blinkling \u5916\u639B\u7684 Claude Code\u3002",
    blinkRunning: "Blink \u6B63\u5728\u57F7\u884C\u3002",
    blinkOff: "Blink \u6C92\u6709\u5728\u57F7\u884C\u3002",
    blinkUnknown: "\u9023\u4E0A Blinkling \u5F8C\u624D\u80FD\u6AA2\u67E5 Blink\u3002",
    pageReadable: "Blink \u53EF\u4EE5\u8B80\u53D6\u9019\u500B\u9801\u9762\u3002",
    pageRestricted: "Blink \u7121\u6CD5\u8B80\u53D6\u9019\u985E\u9801\u9762\u3002",
    wake: "\u559A\u9192 Blink",
    waking: "\u6B63\u5728\u559A\u9192 Blink\u2026",
    wakeFailed: "Blink \u6C92\u6709\u9192\u4F86\uFF0C\u8ACB\u518D\u8A66\u4E00\u6B21\u3002"
  },
  "zh-CN": {
    connected: "\u5DF2\u8FDE\u63A5\u5230 Claude Code \u4E2D\u7684 Blinkling\u3002",
    notSetUp: "\u5C1A\u672A\u8BBE\u7F6E\u3002\u8BF7\u5728 Blink \u7684\u8BBE\u7F6E\u4E2D\u6253\u5F00\u914D\u5957\u8BF4\u660E\u3002",
    bridgeMissing: "\u627E\u4E0D\u5230 Blinkling\u3002\u8BF7\u542F\u52A8\u5DF2\u5B89\u88C5 Blinkling \u63D2\u4EF6\u7684 Claude Code\u3002",
    blinkRunning: "Blink \u6B63\u5728\u8FD0\u884C\u3002",
    blinkOff: "Blink \u6CA1\u6709\u8FD0\u884C\u3002",
    blinkUnknown: "\u8FDE\u63A5 Blinkling \u540E\u624D\u80FD\u68C0\u67E5 Blink\u3002",
    pageReadable: "Blink \u53EF\u4EE5\u8BFB\u53D6\u6B64\u9875\u9762\u3002",
    pageRestricted: "Blink \u65E0\u6CD5\u8BFB\u53D6\u8FD9\u7C7B\u9875\u9762\u3002",
    wake: "\u5524\u9192 Blink",
    waking: "\u6B63\u5728\u5524\u9192 Blink\u2026",
    wakeFailed: "Blink \u6CA1\u6709\u9192\u6765\uFF0C\u8BF7\u91CD\u8BD5\u3002"
  },
  ja: {
    connected: "Claude Code \u306E Blinkling \u306B\u63A5\u7D9A\u3057\u3066\u3044\u307E\u3059\u3002",
    notSetUp: "\u307E\u3060\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002Blink \u306E\u8A2D\u5B9A\u304B\u3089\u30B3\u30F3\u30D1\u30CB\u30AA\u30F3\u306E\u6848\u5185\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002",
    bridgeMissing: "Blinkling \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002Blinkling \u30D7\u30E9\u30B0\u30A4\u30F3\u5165\u308A\u306E Claude Code \u3092\u8D77\u52D5\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    blinkRunning: "Blink \u306F\u8D77\u52D5\u3057\u3066\u3044\u307E\u3059\u3002",
    blinkOff: "Blink \u306F\u8D77\u52D5\u3057\u3066\u3044\u307E\u305B\u3093\u3002",
    blinkUnknown: "Blinkling \u306B\u63A5\u7D9A\u3059\u308B\u307E\u3067 Blink \u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002",
    pageReadable: "Blink \u306F\u3053\u306E\u30DA\u30FC\u30B8\u3092\u8AAD\u3081\u307E\u3059\u3002",
    pageRestricted: "Blink \u306F\u3053\u306E\u7A2E\u985E\u306E\u30DA\u30FC\u30B8\u3092\u8AAD\u3081\u307E\u305B\u3093\u3002",
    wake: "Blink \u3092\u8D77\u3053\u3059",
    waking: "Blink \u3092\u8D77\u3053\u3057\u3066\u3044\u307E\u3059\u2026",
    wakeFailed: "Blink \u304C\u8D77\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002"
  },
  ko: {
    connected: "Claude Code\uC758 Blinkling\uC5D0 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    notSetUp: "\uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Blink \uC124\uC815\uC5D0\uC11C \uB3D9\uBC18 \uC548\uB0B4\uB97C \uC5EC\uC138\uC694.",
    bridgeMissing: "Blinkling\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. Blinkling \uD50C\uB7EC\uADF8\uC778\uC774 \uC788\uB294 Claude Code\uB97C \uC2DC\uC791\uD558\uC138\uC694.",
    blinkRunning: "Blink\uAC00 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4.",
    blinkOff: "Blink\uAC00 \uC2E4\uD589 \uC911\uC774 \uC544\uB2D9\uB2C8\uB2E4.",
    blinkUnknown: "Blinkling\uC5D0 \uC5F0\uACB0\uB418\uC5B4\uC57C Blink\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    pageReadable: "Blink\uAC00 \uC774 \uD398\uC774\uC9C0\uB97C \uC77D\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    pageRestricted: "Blink\uAC00 \uC77D\uC744 \uC218 \uC5C6\uB294 \uC885\uB958\uC758 \uD398\uC774\uC9C0\uC785\uB2C8\uB2E4.",
    wake: "Blink \uAE68\uC6B0\uAE30",
    waking: "Blink\uB97C \uAE68\uC6B0\uB294 \uC911\u2026",
    wakeFailed: "Blink\uAC00 \uAE68\uC5B4\uB098\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694."
  },
  es: {
    connected: "Conectado a Blinkling en Claude Code.",
    notSetUp: "A\xFAn sin configurar. Abre la gu\xEDa del complemento desde los ajustes de Blink.",
    bridgeMissing: "No se encuentra Blinkling. Inicia Claude Code con el plugin de Blinkling.",
    blinkRunning: "Blink est\xE1 en marcha.",
    blinkOff: "Blink no est\xE1 en marcha.",
    blinkUnknown: "Blink no se puede comprobar hasta conectar con Blinkling.",
    pageReadable: "Blink puede leer esta p\xE1gina.",
    pageRestricted: "Blink no puede leer este tipo de p\xE1gina.",
    wake: "Despertar a Blink",
    waking: "Despertando a Blink\u2026",
    wakeFailed: "Blink no despert\xF3. Int\xE9ntalo de nuevo."
  },
  fr: {
    connected: "Connect\xE9 \xE0 Blinkling dans Claude Code.",
    notSetUp: "Pas encore configur\xE9. Ouvrez le guide du compagnon depuis les r\xE9glages de Blink.",
    bridgeMissing: "Blinkling est introuvable. Lancez Claude Code avec le plugin Blinkling.",
    blinkRunning: "Blink est en marche.",
    blinkOff: "Blink n'est pas en marche.",
    blinkUnknown: "Blink ne peut \xEAtre v\xE9rifi\xE9 qu'une fois Blinkling connect\xE9.",
    pageReadable: "Blink peut lire cette page.",
    pageRestricted: "Blink ne peut pas lire ce type de page.",
    wake: "R\xE9veiller Blink",
    waking: "R\xE9veil de Blink\u2026",
    wakeFailed: "Blink ne s'est pas r\xE9veill\xE9. R\xE9essayez."
  },
  de: {
    connected: "Mit Blinkling in Claude Code verbunden.",
    notSetUp: "Noch nicht eingerichtet. \xD6ffne die Begleiter-Anleitung in den Einstellungen von Blink.",
    bridgeMissing: "Blinkling wurde nicht gefunden. Starte Claude Code mit dem Blinkling-Plugin.",
    blinkRunning: "Blink l\xE4uft.",
    blinkOff: "Blink l\xE4uft nicht.",
    blinkUnknown: "Blink l\xE4sst sich erst pr\xFCfen, wenn Blinkling verbunden ist.",
    pageReadable: "Blink kann diese Seite lesen.",
    pageRestricted: "Blink kann diese Art von Seite nicht lesen.",
    wake: "Blink wecken",
    waking: "Blink wird geweckt\u2026",
    wakeFailed: "Blink ist nicht aufgewacht. Versuche es erneut."
  },
  "pt-BR": {
    connected: "Conectado ao Blinkling no Claude Code.",
    notSetUp: "Ainda n\xE3o configurado. Abra o guia do companheiro nas configura\xE7\xF5es do Blink.",
    bridgeMissing: "N\xE3o encontrei o Blinkling. Inicie o Claude Code com o plugin do Blinkling.",
    blinkRunning: "O Blink est\xE1 em execu\xE7\xE3o.",
    blinkOff: "O Blink n\xE3o est\xE1 em execu\xE7\xE3o.",
    blinkUnknown: "O Blink s\xF3 pode ser verificado depois de conectar ao Blinkling.",
    pageReadable: "O Blink pode ler esta p\xE1gina.",
    pageRestricted: "O Blink n\xE3o pode ler este tipo de p\xE1gina.",
    wake: "Acordar o Blink",
    waking: "Acordando o Blink\u2026",
    wakeFailed: "O Blink n\xE3o acordou. Tente de novo."
  }
};
function pickLocale(tag) {
  const lower = (tag || "en").toLowerCase().replace("_", "-");
  if (lower.startsWith("zh"))
    return /hant|-tw|-hk|-mo/.test(lower) ? "zh-TW" : "zh-CN";
  if (lower.startsWith("pt")) return "pt-BR";
  const base = lower.split("-")[0];
  return base in popupLocales ? base : "en";
}
function popupText(tag) {
  return popupLocales[pickLocale(tag)];
}

// extension/popup.ts
function statusLines(status, text) {
  return [
    status.connected ? { text: text.connected, ok: true } : {
      text: status.trusted ? text.bridgeMissing : text.notSetUp,
      ok: false
    },
    !status.connected ? { text: text.blinkUnknown, ok: void 0 } : status.blink ? { text: text.blinkRunning, ok: true } : { text: text.blinkOff, ok: false },
    status.pageReadable ? { text: text.pageReadable, ok: true } : { text: text.pageRestricted, ok: false }
  ];
}
function drawTitle(heading) {
  const name = document.createElement("span");
  name.className = "sparkle-name";
  const word = document.createElement("span");
  word.className = "sparkle-text";
  word.textContent = "Blinkling";
  name.append(word);
  for (let star = 0; star < 3; star++) {
    const mark = document.createElement("i");
    mark.className = "sparkle-star";
    mark.setAttribute("aria-hidden", "true");
    name.append(mark);
  }
  heading.replaceChildren(name);
}
async function mountPopup(root = document) {
  const text = popupText(chrome.i18n.getUILanguage());
  const lines = root.getElementById("lines");
  const wake = root.getElementById("wake");
  const note = root.getElementById("note");
  drawTitle(root.getElementById("title"));
  root.documentElement.lang = chrome.i18n.getUILanguage();
  wake.textContent = text.wake;
  const refresh = async () => {
    const status = await chrome.runtime.sendMessage({ type: "blinkling:status" }).catch(() => void 0);
    const shown = status ?? {
      trusted: false,
      connected: false,
      pageReadable: false
    };
    lines.replaceChildren(
      ...statusLines(shown, text).map((line) => {
        const item = document.createElement("li");
        item.textContent = line.text;
        if (line.ok !== void 0) item.dataset.ok = String(line.ok);
        return item;
      })
    );
    wake.disabled = !shown.connected;
  };
  wake.addEventListener("click", async () => {
    wake.disabled = true;
    note.textContent = text.waking;
    const reply = await chrome.runtime.sendMessage({ type: "blinkling:wake" }).catch(() => void 0);
    note.textContent = reply?.ok ? "" : text.wakeFailed;
    await refresh();
  });
  await refresh();
}
if (typeof document !== "undefined" && document.getElementById("lines"))
  void mountPopup();
export {
  mountPopup,
  statusLines
};

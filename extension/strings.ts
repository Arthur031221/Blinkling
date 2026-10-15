/** The companion's own words, in the browser's language. 'Blinkling' and 'Blink' stay as they are. */
const en = {
  connected: "Connected to Blinkling in Claude Code.",
  notSetUp: "Not set up yet. Open the companion guide from Blink's settings.",
  bridgeMissing:
    "Can't find Blinkling. Start Claude Code with the Blinkling plugin.",
  blinkRunning: "Blink is running.",
  blinkOff: "Blink is not running.",
  blinkUnknown: "Blink can't be checked until Blinkling is connected.",
  pageReadable: "Blink can read this page.",
  pageRestricted: "Blink can't read this kind of page.",
  wake: "Wake Blink",
  waking: "Waking Blink…",
  wakeFailed: "Blink did not wake. Try again.",
};
export type PopupText = { [K in keyof typeof en]: string };

export const popupLocales: Record<string, PopupText> = {
  en,
  "zh-TW": {
    connected: "已連到 Claude Code 裡的 Blinkling。",
    notSetUp: "尚未設定。請從 Blink 的設定開啟小幫手說明。",
    bridgeMissing:
      "找不到 Blinkling。請啟動已安裝 Blinkling 外掛的 Claude Code。",
    blinkRunning: "Blink 正在執行。",
    blinkOff: "Blink 沒有在執行。",
    blinkUnknown: "連上 Blinkling 後才能檢查 Blink。",
    pageReadable: "Blink 可以讀取這個頁面。",
    pageRestricted: "Blink 無法讀取這類頁面。",
    wake: "喚醒 Blink",
    waking: "正在喚醒 Blink…",
    wakeFailed: "Blink 沒有醒來，請再試一次。",
  },
  "zh-CN": {
    connected: "已连接到 Claude Code 中的 Blinkling。",
    notSetUp: "尚未设置。请在 Blink 的设置中打开配套说明。",
    bridgeMissing:
      "找不到 Blinkling。请启动已安装 Blinkling 插件的 Claude Code。",
    blinkRunning: "Blink 正在运行。",
    blinkOff: "Blink 没有运行。",
    blinkUnknown: "连接 Blinkling 后才能检查 Blink。",
    pageReadable: "Blink 可以读取此页面。",
    pageRestricted: "Blink 无法读取这类页面。",
    wake: "唤醒 Blink",
    waking: "正在唤醒 Blink…",
    wakeFailed: "Blink 没有醒来，请重试。",
  },
  ja: {
    connected: "Claude Code の Blinkling に接続しています。",
    notSetUp:
      "まだ設定されていません。Blink の設定からコンパニオンの案内を開いてください。",
    bridgeMissing:
      "Blinkling が見つかりません。Blinkling プラグイン入りの Claude Code を起動してください。",
    blinkRunning: "Blink は起動しています。",
    blinkOff: "Blink は起動していません。",
    blinkUnknown: "Blinkling に接続するまで Blink を確認できません。",
    pageReadable: "Blink はこのページを読めます。",
    pageRestricted: "Blink はこの種類のページを読めません。",
    wake: "Blink を起こす",
    waking: "Blink を起こしています…",
    wakeFailed: "Blink が起きませんでした。もう一度お試しください。",
  },
  ko: {
    connected: "Claude Code의 Blinkling에 연결되었습니다.",
    notSetUp: "아직 설정되지 않았습니다. Blink 설정에서 동반 안내를 여세요.",
    bridgeMissing:
      "Blinkling을 찾을 수 없습니다. Blinkling 플러그인이 있는 Claude Code를 시작하세요.",
    blinkRunning: "Blink가 실행 중입니다.",
    blinkOff: "Blink가 실행 중이 아닙니다.",
    blinkUnknown: "Blinkling에 연결되어야 Blink를 확인할 수 있습니다.",
    pageReadable: "Blink가 이 페이지를 읽을 수 있습니다.",
    pageRestricted: "Blink가 읽을 수 없는 종류의 페이지입니다.",
    wake: "Blink 깨우기",
    waking: "Blink를 깨우는 중…",
    wakeFailed: "Blink가 깨어나지 않았습니다. 다시 시도하세요.",
  },
  es: {
    connected: "Conectado a Blinkling en Claude Code.",
    notSetUp:
      "Aún sin configurar. Abre la guía del complemento desde los ajustes de Blink.",
    bridgeMissing:
      "No se encuentra Blinkling. Inicia Claude Code con el plugin de Blinkling.",
    blinkRunning: "Blink está en marcha.",
    blinkOff: "Blink no está en marcha.",
    blinkUnknown: "Blink no se puede comprobar hasta conectar con Blinkling.",
    pageReadable: "Blink puede leer esta página.",
    pageRestricted: "Blink no puede leer este tipo de página.",
    wake: "Despertar a Blink",
    waking: "Despertando a Blink…",
    wakeFailed: "Blink no despertó. Inténtalo de nuevo.",
  },
  fr: {
    connected: "Connecté à Blinkling dans Claude Code.",
    notSetUp:
      "Pas encore configuré. Ouvrez le guide du compagnon depuis les réglages de Blink.",
    bridgeMissing:
      "Blinkling est introuvable. Lancez Claude Code avec le plugin Blinkling.",
    blinkRunning: "Blink est en marche.",
    blinkOff: "Blink n'est pas en marche.",
    blinkUnknown: "Blink ne peut être vérifié qu'une fois Blinkling connecté.",
    pageReadable: "Blink peut lire cette page.",
    pageRestricted: "Blink ne peut pas lire ce type de page.",
    wake: "Réveiller Blink",
    waking: "Réveil de Blink…",
    wakeFailed: "Blink ne s'est pas réveillé. Réessayez.",
  },
  de: {
    connected: "Mit Blinkling in Claude Code verbunden.",
    notSetUp:
      "Noch nicht eingerichtet. Öffne die Begleiter-Anleitung in den Einstellungen von Blink.",
    bridgeMissing:
      "Blinkling wurde nicht gefunden. Starte Claude Code mit dem Blinkling-Plugin.",
    blinkRunning: "Blink läuft.",
    blinkOff: "Blink läuft nicht.",
    blinkUnknown: "Blink lässt sich erst prüfen, wenn Blinkling verbunden ist.",
    pageReadable: "Blink kann diese Seite lesen.",
    pageRestricted: "Blink kann diese Art von Seite nicht lesen.",
    wake: "Blink wecken",
    waking: "Blink wird geweckt…",
    wakeFailed: "Blink ist nicht aufgewacht. Versuche es erneut.",
  },
  "pt-BR": {
    connected: "Conectado ao Blinkling no Claude Code.",
    notSetUp:
      "Ainda não configurado. Abra o guia do companheiro nas configurações do Blink.",
    bridgeMissing:
      "Não encontrei o Blinkling. Inicie o Claude Code com o plugin do Blinkling.",
    blinkRunning: "O Blink está em execução.",
    blinkOff: "O Blink não está em execução.",
    blinkUnknown:
      "O Blink só pode ser verificado depois de conectar ao Blinkling.",
    pageReadable: "O Blink pode ler esta página.",
    pageRestricted: "O Blink não pode ler este tipo de página.",
    wake: "Acordar o Blink",
    waking: "Acordando o Blink…",
    wakeFailed: "O Blink não acordou. Tente de novo.",
  },
};

/** The locale for a browser language tag, English when there is no match. */
export function pickLocale(tag: string | undefined): keyof typeof popupLocales {
  const lower = (tag || "en").toLowerCase().replace("_", "-");
  if (lower.startsWith("zh"))
    return /hant|-tw|-hk|-mo/.test(lower) ? "zh-TW" : "zh-CN";
  if (lower.startsWith("pt")) return "pt-BR";
  const base = lower.split("-")[0]!;
  return base in popupLocales ? base : "en";
}

export function popupText(tag?: string): PopupText {
  return popupLocales[pickLocale(tag)]!;
}

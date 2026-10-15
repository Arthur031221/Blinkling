// The install page in the nine languages the app ships. English is also the
// markup in index.html, so the page reads right before this script runs.

export const LOCALES = Object.freeze([
  "en",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "de",
  "es",
  "fr",
  "pt-BR",
]);

/** Each language in its own words, for the picker. Never translated. */
export const LANGUAGE_NAMES = Object.freeze({
  en: "English",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  "pt-BR": "Português (Brasil)",
});

/** The first language in a visitor's ordered list that the page speaks. */
export function pickLocale(preferred = []) {
  for (const raw of [preferred].flat()) {
    const [language = "", region = ""] = String(raw || "")
      .replace(/_/g, "-")
      .split("-");
    const lang = language.toLowerCase();
    if (lang === "zh")
      return ["TW", "HK", "MO", "HANT"].includes(region.toUpperCase())
        ? "zh-TW"
        : "zh-CN";
    if (lang === "pt") return "pt-BR";
    if (LOCALES.includes(lang)) return lang;
  }
  return "en";
}

/** `?lang=` wins, then the saved choice, then the browser's own list. */
export function chooseLocale({ search = "", saved, languages = [] } = {}) {
  const asked = new URLSearchParams(search).get("lang");
  if (LOCALES.includes(asked)) return asked;
  if (LOCALES.includes(saved)) return saved;
  return pickLocale(languages);
}

export const TEXT = {
  en: {
    install: "Install",
    title: "Install Blinkling",
    description:
      "Install Blinkling in two or three steps. Pick your computer and follow its short, animated steps.",
    language: "Language",
    nav: "Main",
    overview: "Overview",
    lead: "You need Claude Code, signed in. Then it is one pasted line, one command, and on a Mac one permission.",
    legend: "Which computer do you have?",
    detected: "We picked this from your browser.",
    macChip:
      "Not sure? Apple menu, About This Mac: “Chip” says Apple M…, “Processor” says Intel.",
    choose: "Pick your computer above to see its steps.",
    macSteps: "Steps for a Mac",
    windowsSteps: "Steps for Windows",
    linuxSteps: "Steps for Linux",
    pasteMac: "Paste this line into Terminal and press Return.",
    pasteWindows: "Paste this line into PowerShell and press Enter.",
    pasteLinux: "Paste this line into a terminal and press Enter.",
    runIt: "In Claude Code, run this. Blink appears.",
    permission:
      "Allow Screen Recording once: switch on Blinkling in System Settings, Privacy & Security. macOS also asks for Accessibility so the Ctrl key works. Allow it the same way.",
    copy: "Copy",
    copied: "Copied",
    copyCommand: "Copy command",
    copiedStatus: "Copied to the clipboard.",
    copyManual: "Select the line and copy it.",
    sceneMac:
      "Animation: the line is pasted into Terminal and the plugin installs.",
    sceneWindows:
      "Animation: the line is pasted into PowerShell and the plugin installs.",
    sceneLinux:
      "Animation: the line is pasted into a terminal and the plugin installs.",
    sceneClaude:
      "Animation: the command is typed in Claude Code and Blink waves hello.",
    scenePermission:
      "Animation: the Blinkling switch is turned on under Screen Recording.",
    sceneGatekeeper:
      "Animation: the blocked message, then Open Anyway is clicked in Privacy and Security.",
    sceneSmartscreen: "Animation: More info is clicked, then Run anyway.",
    paneTitle: "Screen & System Audio Recording",
    privacyTitle: "Privacy & Security",
    gkFallback: "If macOS still says it cannot open Blinkling",
    gkNote:
      "Blinkling is not notarized by Apple. Normally nothing is asked. If it is, open System Settings, Privacy & Security and choose Open Anyway.",
    gkDialogTitle: "“Blinkling” can’t be opened",
    gkDialogSmall: "Apple could not check it for malware.",
    gkDone: "Done",
    gkBlocked: "“Blinkling” was blocked.",
    gkOpen: "Open Anyway",
    wFallback: "If Windows says it protected your PC",
    wNote:
      "Blinkling is not signed with a paid certificate, so SmartScreen may ask. Choose More info, then Run anyway.",
    wDialogTitle: "Windows protected your PC",
    wDialogSmall:
      "Microsoft Defender SmartScreen prevented an unrecognized app from starting.",
    wMore: "More info",
    wRun: "Run anyway",
    linuxNote:
      "Blink needs a desktop session (X11 or Wayland). On Ubuntu 24.04 it starts by itself.",
    manual: "Read the manual steps",
    manualLead: "Prefer to do it by hand?",
    footer: "Blinkling runs on your computer and uses your own Claude Code.",
    privacy: "Privacy",
  },
  "zh-TW": {
    install: "安裝",
    title: "安裝 Blinkling",
    description:
      "兩三個步驟就能安裝 Blinkling。選好你的電腦，照著簡短的動畫步驟做即可。",
    language: "語言",
    nav: "主要導覽",
    overview: "總覽",
    lead: "你需要已登入的 Claude Code。接著只要貼上一行、執行一個指令，Mac 上再允許一項權限。",
    legend: "你用的是哪一種電腦？",
    detected: "我們依你的瀏覽器選好了。",
    macChip:
      "不確定嗎？點蘋果選單的「關於這台 Mac」：「晶片」寫 Apple M…，「處理器」寫 Intel。",
    choose: "請先在上方選你的電腦，就會看到對應的步驟。",
    macSteps: "Mac 的步驟",
    windowsSteps: "Windows 的步驟",
    linuxSteps: "Linux 的步驟",
    pasteMac: "把這一行貼到「終端機」，按下 Return。",
    pasteWindows: "把這一行貼到 PowerShell，按下 Enter。",
    pasteLinux: "把這一行貼到終端機，按下 Enter。",
    runIt: "在 Claude Code 裡執行這個指令，Blink 就會出現。",
    permission:
      "允許一次螢幕錄製：到「系統設定」的「隱私權與安全性」，開啟 Blinkling。macOS 也會要求輔助使用權限，Ctrl 鍵才能運作，用同樣的方式允許即可。",
    copy: "複製",
    copied: "已複製",
    copyCommand: "複製指令",
    copiedStatus: "已複製到剪貼簿。",
    copyManual: "請選取這一行再自行複製。",
    sceneMac: "動畫：把這一行貼到終端機，外掛隨即安裝。",
    sceneWindows: "動畫：把這一行貼到 PowerShell，外掛隨即安裝。",
    sceneLinux: "動畫：把這一行貼到終端機，外掛隨即安裝。",
    sceneClaude: "動畫：在 Claude Code 輸入指令，Blink 揮手打招呼。",
    scenePermission: "動畫：在「螢幕錄製」下開啟 Blinkling 的開關。",
    sceneGatekeeper:
      "動畫：先出現被阻擋的訊息，再到「隱私權與安全性」按「仍要打開」。",
    sceneSmartscreen: "動畫：先按「其他資訊」，再按「仍要執行」。",
    paneTitle: "螢幕與系統音訊錄製",
    privacyTitle: "隱私權與安全性",
    gkFallback: "如果 macOS 還是說無法打開 Blinkling",
    gkNote:
      "Blinkling 沒有經過 Apple 公證。一般情況下不會有任何提示。如果出現提示，請開啟「系統設定」的「隱私權與安全性」，按「仍要打開」。",
    gkDialogTitle: "無法打開「Blinkling」",
    gkDialogSmall: "Apple 無法檢查是否含有惡意軟體。",
    gkDone: "完成",
    gkBlocked: "已阻擋「Blinkling」。",
    gkOpen: "仍要打開",
    wFallback: "如果 Windows 說已保護你的電腦",
    wNote:
      "Blinkling 沒有用付費憑證簽署，所以 SmartScreen 可能會詢問。請按「其他資訊」，再按「仍要執行」。",
    wDialogTitle: "Windows 已保護您的電腦",
    wDialogSmall:
      "Microsoft Defender SmartScreen 已阻止無法辨識的應用程式啟動。",
    wMore: "其他資訊",
    wRun: "仍要執行",
    linuxNote:
      "Blink 需要桌面環境（X11 或 Wayland）。在 Ubuntu 24.04 上會自動啟動。",
    manual: "閱讀手動安裝步驟",
    manualLead: "想自己動手？",
    footer: "Blinkling 在你的電腦上執行，使用你自己的 Claude Code。",
    privacy: "隱私權",
  },
  "zh-CN": {
    install: "安装",
    title: "安装 Blinkling",
    description:
      "两三个步骤就能安装 Blinkling。选好你的电脑，照着简短的动画步骤做即可。",
    language: "语言",
    nav: "主导航",
    overview: "概览",
    lead: "你需要已登录的 Claude Code。接着只要粘贴一行、运行一个命令，Mac 上再允许一项权限。",
    legend: "你用的是哪种电脑？",
    detected: "我们根据你的浏览器选好了。",
    macChip:
      "不确定？点苹果菜单的“关于本机”：“芯片”写 Apple M…，“处理器”写 Intel。",
    choose: "请先在上方选择你的电脑，就会看到对应的步骤。",
    macSteps: "Mac 的步骤",
    windowsSteps: "Windows 的步骤",
    linuxSteps: "Linux 的步骤",
    pasteMac: "把这一行粘贴到“终端”，按下 Return。",
    pasteWindows: "把这一行粘贴到 PowerShell，按下 Enter。",
    pasteLinux: "把这一行粘贴到终端，按下 Enter。",
    runIt: "在 Claude Code 里运行这个命令，Blink 就会出现。",
    permission:
      "允许一次屏幕录制：在“系统设置”的“隐私与安全性”中打开 Blinkling。macOS 还会请求辅助功能权限，Ctrl 键才能工作，用同样的方式允许即可。",
    copy: "复制",
    copied: "已复制",
    copyCommand: "复制命令",
    copiedStatus: "已复制到剪贴板。",
    copyManual: "请选中这一行再自行复制。",
    sceneMac: "动画：把这一行粘贴到终端，插件随即安装。",
    sceneWindows: "动画：把这一行粘贴到 PowerShell，插件随即安装。",
    sceneLinux: "动画：把这一行粘贴到终端，插件随即安装。",
    sceneClaude: "动画：在 Claude Code 输入命令，Blink 挥手打招呼。",
    scenePermission: "动画：在“屏幕录制”下打开 Blinkling 的开关。",
    sceneGatekeeper:
      "动画：先出现被阻止的提示，再到“隐私与安全性”点“仍要打开”。",
    sceneSmartscreen: "动画：先点“更多信息”，再点“仍要运行”。",
    paneTitle: "屏幕与系统音频录制",
    privacyTitle: "隐私与安全性",
    gkFallback: "如果 macOS 仍然说无法打开 Blinkling",
    gkNote:
      "Blinkling 没有经过 Apple 公证。一般情况下不会有任何提示。如果出现提示，请打开“系统设置”的“隐私与安全性”，点“仍要打开”。",
    gkDialogTitle: "无法打开“Blinkling”",
    gkDialogSmall: "Apple无法检查其是否包含恶意软件。",
    gkDone: "完成",
    gkBlocked: "已阻止“Blinkling”。",
    gkOpen: "仍要打开",
    wFallback: "如果 Windows 说已保护你的电脑",
    wNote:
      "Blinkling 没有用付费证书签名，所以 SmartScreen 可能会询问。请点“更多信息”，再点“仍要运行”。",
    wDialogTitle: "Windows 已保护你的电脑",
    wDialogSmall: "Microsoft Defender SmartScreen 已阻止无法识别的应用启动。",
    wMore: "更多信息",
    wRun: "仍要运行",
    linuxNote:
      "Blink 需要桌面环境（X11 或 Wayland）。在 Ubuntu 24.04 上会自动启动。",
    manual: "阅读手动安装步骤",
    manualLead: "想自己动手？",
    footer: "Blinkling 在你的电脑上运行，使用你自己的 Claude Code。",
    privacy: "隐私",
  },
  ja: {
    install: "インストール",
    title: "Blinkling をインストール",
    description:
      "2〜3 ステップで Blinkling をインストールします。お使いのパソコンを選び、短いアニメーションの手順に従ってください。",
    language: "言語",
    nav: "メイン",
    overview: "概要",
    lead: "サインイン済みの Claude Code が必要です。あとは 1 行を貼り付け、コマンドを 1 つ実行し、Mac では権限を 1 つ許可するだけです。",
    legend: "お使いのパソコンはどれですか？",
    detected: "ブラウザの情報から選びました。",
    macChip:
      "わからない場合は、Apple メニューの「このMacについて」を開きます。「チップ」に Apple M… と出れば Apple シリコン、「プロセッサ」に Intel と出れば Intel です。",
    choose: "上でパソコンを選ぶと、その手順が表示されます。",
    macSteps: "Mac の手順",
    windowsSteps: "Windows の手順",
    linuxSteps: "Linux の手順",
    pasteMac: "この行を「ターミナル」に貼り付けて、Return を押します。",
    pasteWindows: "この行を PowerShell に貼り付けて、Enter を押します。",
    pasteLinux: "この行をターミナルに貼り付けて、Enter を押します。",
    runIt: "Claude Code でこれを実行すると、Blink が現れます。",
    permission:
      "画面収録を 1 度だけ許可します。「システム設定」の「プライバシーとセキュリティ」で Blinkling をオンにしてください。Ctrl キーを使えるように、macOS はアクセシビリティの許可も求めます。同じ方法で許可してください。",
    copy: "コピー",
    copied: "コピーしました",
    copyCommand: "コマンドをコピー",
    copiedStatus: "クリップボードにコピーしました。",
    copyManual: "この行を選択して、自分でコピーしてください。",
    sceneMac:
      "アニメーション：行がターミナルに貼り付けられ、プラグインがインストールされます。",
    sceneWindows:
      "アニメーション：行が PowerShell に貼り付けられ、プラグインがインストールされます。",
    sceneLinux:
      "アニメーション：行がターミナルに貼り付けられ、プラグインがインストールされます。",
    sceneClaude:
      "アニメーション：Claude Code にコマンドを入力すると、Blink が手を振ります。",
    scenePermission:
      "アニメーション：「画面収録」で Blinkling のスイッチがオンになります。",
    sceneGatekeeper:
      "アニメーション：ブロックのメッセージが出たあと、「プライバシーとセキュリティ」で「このまま開く」を押します。",
    sceneSmartscreen:
      "アニメーション：「詳細情報」を押してから「実行」を押します。",
    paneTitle: "画面収録とシステムオーディオ録音",
    privacyTitle: "プライバシーとセキュリティ",
    gkFallback: "macOS がまだ Blinkling を開けないと言う場合",
    gkNote:
      "Blinkling は Apple の公証を受けていません。通常は何も表示されません。表示された場合は、「システム設定」の「プライバシーとセキュリティ」を開き、「このまま開く」を選びます。",
    gkDialogTitle: "“Blinkling”は開けません",
    gkDialogSmall: "Apple はマルウェアのチェックができませんでした。",
    gkDone: "完了",
    gkBlocked: "“Blinkling”はブロックされました。",
    gkOpen: "このまま開く",
    wFallback: "Windows が PC を保護したと表示された場合",
    wNote:
      "Blinkling は有料の証明書で署名されていないため、SmartScreen が確認を求めることがあります。「詳細情報」を選び、「実行」を選びます。",
    wDialogTitle: "Windows によって PC が保護されました",
    wDialogSmall:
      "Microsoft Defender SmartScreen は認識されないアプリの起動を停止しました。",
    wMore: "詳細情報",
    wRun: "実行",
    linuxNote:
      "Blink にはデスクトップセッション（X11 または Wayland）が必要です。Ubuntu 24.04 では自動的に起動します。",
    manual: "手動の手順を読む",
    manualLead: "自分で行いたい場合は、",
    footer:
      "Blinkling はお使いのパソコン上で動作し、ご自身の Claude Code を使います。",
    privacy: "プライバシー",
  },
  ko: {
    install: "설치",
    title: "Blinkling 설치",
    description:
      "두세 단계로 Blinkling을 설치하세요. 컴퓨터를 고르고 짧은 애니메이션 안내를 따라 하면 됩니다.",
    language: "언어",
    nav: "주 메뉴",
    overview: "개요",
    lead: "로그인된 Claude Code가 필요합니다. 그다음에는 한 줄을 붙여 넣고, 명령 하나를 실행하고, Mac에서는 권한 하나를 허용하면 됩니다.",
    legend: "어떤 컴퓨터를 쓰고 계신가요?",
    detected: "브라우저 정보를 바탕으로 골랐습니다.",
    macChip:
      "잘 모르겠다면 Apple 메뉴의 ‘이 Mac에 관하여’를 열어 보세요. ‘칩’에 Apple M…이라고 나오면 Apple 실리콘이고, ‘프로세서’에 Intel이라고 나오면 Intel입니다.",
    choose: "위에서 컴퓨터를 고르면 해당 단계가 나옵니다.",
    macSteps: "Mac 설치 단계",
    windowsSteps: "Windows 설치 단계",
    linuxSteps: "Linux 설치 단계",
    pasteMac: "이 줄을 터미널에 붙여 넣고 Return을 누르세요.",
    pasteWindows: "이 줄을 PowerShell에 붙여 넣고 Enter를 누르세요.",
    pasteLinux: "이 줄을 터미널에 붙여 넣고 Enter를 누르세요.",
    runIt: "Claude Code에서 이것을 실행하면 Blink가 나타납니다.",
    permission:
      "화면 녹화를 한 번만 허용하세요. ‘시스템 설정’의 ‘개인정보 보호 및 보안’에서 Blinkling을 켜면 됩니다. Ctrl 키가 동작하도록 macOS가 손쉬운 사용 권한도 요청합니다. 같은 방법으로 허용하세요.",
    copy: "복사",
    copied: "복사됨",
    copyCommand: "명령 복사",
    copiedStatus: "클립보드에 복사했습니다.",
    copyManual: "이 줄을 선택해서 직접 복사하세요.",
    sceneMac: "애니메이션: 줄을 터미널에 붙여 넣으면 플러그인이 설치됩니다.",
    sceneWindows:
      "애니메이션: 줄을 PowerShell에 붙여 넣으면 플러그인이 설치됩니다.",
    sceneLinux: "애니메이션: 줄을 터미널에 붙여 넣으면 플러그인이 설치됩니다.",
    sceneClaude:
      "애니메이션: Claude Code에 명령을 입력하면 Blink가 손을 흔듭니다.",
    scenePermission: "애니메이션: ‘화면 녹화’에서 Blinkling 스위치가 켜집니다.",
    sceneGatekeeper:
      "애니메이션: 차단 메시지가 나온 뒤 ‘개인정보 보호 및 보안’에서 ‘그래도 열기’를 누릅니다.",
    sceneSmartscreen: "애니메이션: ‘추가 정보’를 누른 뒤 ‘실행’을 누릅니다.",
    paneTitle: "화면 및 시스템 오디오 녹화",
    privacyTitle: "개인정보 보호 및 보안",
    gkFallback: "macOS에서 계속 Blinkling을 열 수 없다고 할 때",
    gkNote:
      "Blinkling은 Apple 공증을 받지 않았습니다. 보통은 아무것도 묻지 않습니다. 묻는다면 ‘시스템 설정’의 ‘개인정보 보호 및 보안’을 열고 ‘그래도 열기’를 선택하세요.",
    gkDialogTitle: "“Blinkling”을(를) 열 수 없습니다",
    gkDialogSmall: "Apple에서 악성 코드가 있는지 확인할 수 없습니다.",
    gkDone: "완료",
    gkBlocked: "“Blinkling”이(가) 차단되었습니다.",
    gkOpen: "그래도 열기",
    wFallback: "Windows가 PC를 보호했다고 나올 때",
    wNote:
      "Blinkling은 유료 인증서로 서명되지 않아서 SmartScreen이 물어볼 수 있습니다. ‘추가 정보’를 선택한 다음 ‘실행’을 선택하세요.",
    wDialogTitle: "Windows의 PC 보호",
    wDialogSmall:
      "Microsoft Defender SmartScreen에서 인식되지 않는 앱의 시작을 차단했습니다.",
    wMore: "추가 정보",
    wRun: "실행",
    linuxNote:
      "Blink에는 데스크톱 세션(X11 또는 Wayland)이 필요합니다. Ubuntu 24.04에서는 저절로 시작됩니다.",
    manual: "수동 설치 단계 읽기",
    manualLead: "직접 하고 싶다면?",
    footer: "Blinkling은 내 컴퓨터에서 실행되며 내 Claude Code를 사용합니다.",
    privacy: "개인정보 처리방침",
  },
  de: {
    install: "Installieren",
    title: "Blinkling installieren",
    description:
      "Installiere Blinkling in zwei oder drei Schritten. Wähle deinen Computer und folge den kurzen, animierten Schritten.",
    language: "Sprache",
    nav: "Hauptnavigation",
    overview: "Überblick",
    lead: "Du brauchst Claude Code, angemeldet. Dann sind es eine eingefügte Zeile, ein Befehl und auf dem Mac eine Berechtigung.",
    legend: "Welchen Computer hast du?",
    detected: "Wir haben das anhand deines Browsers ausgewählt.",
    macChip:
      "Nicht sicher? Apple-Menü, „Über diesen Mac“: Steht bei „Chip“ Apple M…, ist es Apple Silicon. Steht bei „Prozessor“ Intel, ist es Intel.",
    choose: "Wähle oben deinen Computer, um die Schritte zu sehen.",
    macSteps: "Schritte für den Mac",
    windowsSteps: "Schritte für Windows",
    linuxSteps: "Schritte für Linux",
    pasteMac: "Füge diese Zeile ins Terminal ein und drücke die Eingabetaste.",
    pasteWindows: "Füge diese Zeile in PowerShell ein und drücke Enter.",
    pasteLinux: "Füge diese Zeile in ein Terminal ein und drücke Enter.",
    runIt: "Führe das in Claude Code aus. Blink erscheint.",
    permission:
      "Erlaube die Bildschirmaufnahme einmal: Schalte Blinkling in den Systemeinstellungen unter „Datenschutz & Sicherheit“ ein. macOS fragt außerdem nach der Bedienungshilfen-Berechtigung, damit die Ctrl-Taste funktioniert. Erlaube sie auf dieselbe Weise.",
    copy: "Kopieren",
    copied: "Kopiert",
    copyCommand: "Befehl kopieren",
    copiedStatus: "In die Zwischenablage kopiert.",
    copyManual: "Markiere die Zeile und kopiere sie selbst.",
    sceneMac:
      "Animation: Die Zeile wird ins Terminal eingefügt und das Plugin installiert sich.",
    sceneWindows:
      "Animation: Die Zeile wird in PowerShell eingefügt und das Plugin installiert sich.",
    sceneLinux:
      "Animation: Die Zeile wird in ein Terminal eingefügt und das Plugin installiert sich.",
    sceneClaude:
      "Animation: Der Befehl wird in Claude Code getippt und Blink winkt zum Gruß.",
    scenePermission:
      "Animation: Der Schalter für Blinkling wird unter „Bildschirmaufnahme“ eingeschaltet.",
    sceneGatekeeper:
      "Animation: Die Sperrmeldung erscheint, dann wird unter „Datenschutz & Sicherheit“ auf „Trotzdem öffnen“ geklickt.",
    sceneSmartscreen:
      "Animation: Auf „Weitere Informationen“ wird geklickt, dann auf „Trotzdem ausführen“.",
    paneTitle: "Bildschirm- & Systemaudioaufnahme",
    privacyTitle: "Datenschutz & Sicherheit",
    gkFallback: "Wenn macOS Blinkling trotzdem nicht öffnen will",
    gkNote:
      "Blinkling ist nicht von Apple notarisiert. Normalerweise wird nichts gefragt. Falls doch, öffne die Systemeinstellungen, „Datenschutz & Sicherheit“, und wähle „Trotzdem öffnen“.",
    gkDialogTitle: "„Blinkling“ kann nicht geöffnet werden",
    gkDialogSmall:
      "Apple konnte nicht prüfen, ob die App Schadsoftware enthält.",
    gkDone: "Fertig",
    gkBlocked: "„Blinkling“ wurde blockiert.",
    gkOpen: "Trotzdem öffnen",
    wFallback: "Wenn Windows meldet, dass es deinen PC geschützt hat",
    wNote:
      "Blinkling ist nicht mit einem kostenpflichtigen Zertifikat signiert, deshalb kann SmartScreen nachfragen. Wähle „Weitere Informationen“ und dann „Trotzdem ausführen“.",
    wDialogTitle: "Der Computer wurde durch Windows geschützt",
    wDialogSmall:
      "Microsoft Defender SmartScreen hat den Start einer unbekannten App verhindert.",
    wMore: "Weitere Informationen",
    wRun: "Trotzdem ausführen",
    linuxNote:
      "Blink braucht eine Desktop-Sitzung (X11 oder Wayland). Unter Ubuntu 24.04 startet es von selbst.",
    manual: "Die manuellen Schritte lesen",
    manualLead: "Lieber von Hand?",
    footer:
      "Blinkling läuft auf deinem Computer und nutzt dein eigenes Claude Code.",
    privacy: "Datenschutz",
  },
  es: {
    install: "Instalar",
    title: "Instalar Blinkling",
    description:
      "Instala Blinkling en dos o tres pasos. Elige tu ordenador y sigue sus pasos breves y animados.",
    language: "Idioma",
    nav: "Principal",
    overview: "Resumen",
    lead: "Necesitas Claude Code con la sesión iniciada. Después son una línea pegada, un comando y, en un Mac, un permiso.",
    legend: "¿Qué ordenador tienes?",
    detected: "Lo hemos elegido a partir de tu navegador.",
    macChip:
      "¿No estás seguro? Menú Apple, «Acerca de este Mac»: si «Chip» dice Apple M…, es Apple silicon. Si «Procesador» dice Intel, es Intel.",
    choose: "Elige arriba tu ordenador para ver sus pasos.",
    macSteps: "Pasos para un Mac",
    windowsSteps: "Pasos para Windows",
    linuxSteps: "Pasos para Linux",
    pasteMac: "Pega esta línea en Terminal y pulsa Retorno.",
    pasteWindows: "Pega esta línea en PowerShell y pulsa Intro.",
    pasteLinux: "Pega esta línea en un terminal y pulsa Intro.",
    runIt: "En Claude Code, ejecuta esto. Aparece Blink.",
    permission:
      "Permite una vez la grabación de pantalla: activa Blinkling en Ajustes del Sistema, Privacidad y seguridad. macOS también pide Accesibilidad para que funcione la tecla Ctrl. Permítelo de la misma forma.",
    copy: "Copiar",
    copied: "Copiado",
    copyCommand: "Copiar comando",
    copiedStatus: "Copiado al portapapeles.",
    copyManual: "Selecciona la línea y cópiala.",
    sceneMac: "Animación: la línea se pega en Terminal y el plugin se instala.",
    sceneWindows:
      "Animación: la línea se pega en PowerShell y el plugin se instala.",
    sceneLinux:
      "Animación: la línea se pega en un terminal y el plugin se instala.",
    sceneClaude:
      "Animación: el comando se escribe en Claude Code y Blink saluda con la mano.",
    scenePermission:
      "Animación: el interruptor de Blinkling se activa en Grabación de pantalla.",
    sceneGatekeeper:
      "Animación: aparece el aviso de bloqueo y luego se pulsa Abrir igualmente en Privacidad y seguridad.",
    sceneSmartscreen:
      "Animación: se pulsa Más información y luego Ejecutar de todas formas.",
    paneTitle: "Grabación de pantalla y audio del sistema",
    privacyTitle: "Privacidad y seguridad",
    gkFallback: "Si macOS sigue diciendo que no puede abrir Blinkling",
    gkNote:
      "Apple no ha notarizado Blinkling. Normalmente no se pregunta nada. Si lo hace, abre Ajustes del Sistema, Privacidad y seguridad, y elige Abrir igualmente.",
    gkDialogTitle: "No se puede abrir “Blinkling”",
    gkDialogSmall:
      "Apple no ha podido comprobar si contiene software malicioso.",
    gkDone: "Hecho",
    gkBlocked: "Se ha bloqueado “Blinkling”.",
    gkOpen: "Abrir igualmente",
    wFallback: "Si Windows dice que protegió tu PC",
    wNote:
      "Blinkling no está firmado con un certificado de pago, así que SmartScreen puede preguntar. Elige Más información y después Ejecutar de todas formas.",
    wDialogTitle: "Windows protegió su PC",
    wDialogSmall:
      "Microsoft Defender SmartScreen impidió el inicio de una aplicación no reconocida.",
    wMore: "Más información",
    wRun: "Ejecutar de todas formas",
    linuxNote:
      "Blink necesita una sesión de escritorio (X11 o Wayland). En Ubuntu 24.04 se inicia solo.",
    manual: "Lee los pasos manuales",
    manualLead: "¿Prefieres hacerlo a mano?",
    footer: "Blinkling funciona en tu ordenador y usa tu propio Claude Code.",
    privacy: "Privacidad",
  },
  fr: {
    install: "Installer",
    title: "Installer Blinkling",
    description:
      "Installez Blinkling en deux ou trois étapes. Choisissez votre ordinateur et suivez ses courtes étapes animées.",
    language: "Langue",
    nav: "Principal",
    overview: "Présentation",
    lead: "Il vous faut Claude Code, connecté. Ensuite, c’est une ligne collée, une commande et, sur un Mac, une autorisation.",
    legend: "Quel ordinateur avez-vous ?",
    detected: "Nous l’avons choisi d’après votre navigateur.",
    macChip:
      "Pas sûr ? Menu Pomme, « À propos de ce Mac » : si « Puce » indique Apple M…, c’est Apple silicon. Si « Processeur » indique Intel, c’est Intel.",
    choose: "Choisissez votre ordinateur ci-dessus pour voir ses étapes.",
    macSteps: "Étapes pour un Mac",
    windowsSteps: "Étapes pour Windows",
    linuxSteps: "Étapes pour Linux",
    pasteMac: "Collez cette ligne dans Terminal et appuyez sur Retour.",
    pasteWindows: "Collez cette ligne dans PowerShell et appuyez sur Entrée.",
    pasteLinux: "Collez cette ligne dans un terminal et appuyez sur Entrée.",
    runIt: "Dans Claude Code, lancez ceci. Blink apparaît.",
    permission:
      "Autorisez une fois l’enregistrement de l’écran : activez Blinkling dans Réglages Système, Confidentialité et sécurité. macOS demande aussi l’accessibilité pour que la touche Ctrl fonctionne. Autorisez-la de la même façon.",
    copy: "Copier",
    copied: "Copié",
    copyCommand: "Copier la commande",
    copiedStatus: "Copié dans le presse-papiers.",
    copyManual: "Sélectionnez la ligne et copiez-la.",
    sceneMac:
      "Animation : la ligne est collée dans Terminal et le plugin s’installe.",
    sceneWindows:
      "Animation : la ligne est collée dans PowerShell et le plugin s’installe.",
    sceneLinux:
      "Animation : la ligne est collée dans un terminal et le plugin s’installe.",
    sceneClaude:
      "Animation : la commande est saisie dans Claude Code et Blink fait un signe de la main.",
    scenePermission:
      "Animation : l’interrupteur de Blinkling est activé sous Enregistrement de l’écran.",
    sceneGatekeeper:
      "Animation : le message de blocage apparaît, puis on clique sur Ouvrir quand même dans Confidentialité et sécurité.",
    sceneSmartscreen:
      "Animation : on clique sur Informations complémentaires, puis sur Exécuter quand même.",
    paneTitle: "Enregistrement de l’écran et de l’audio système",
    privacyTitle: "Confidentialité et sécurité",
    gkFallback: "Si macOS dit toujours qu’il ne peut pas ouvrir Blinkling",
    gkNote:
      "Blinkling n’est pas notarisé par Apple. Normalement, rien n’est demandé. Si c’est le cas, ouvrez Réglages Système, Confidentialité et sécurité, puis choisissez Ouvrir quand même.",
    gkDialogTitle: "« Blinkling » ne peut pas être ouvert",
    gkDialogSmall:
      "Apple n’a pas pu vérifier l’absence de logiciel malveillant.",
    gkDone: "OK",
    gkBlocked: "« Blinkling » a été bloqué.",
    gkOpen: "Ouvrir quand même",
    wFallback: "Si Windows indique qu’il a protégé votre ordinateur",
    wNote:
      "Blinkling n’est pas signé avec un certificat payant, donc SmartScreen peut demander confirmation. Choisissez Informations complémentaires, puis Exécuter quand même.",
    wDialogTitle: "Windows a protégé votre ordinateur",
    wDialogSmall:
      "Microsoft Defender SmartScreen a empêché le démarrage d’une application non reconnue.",
    wMore: "Informations complémentaires",
    wRun: "Exécuter quand même",
    linuxNote:
      "Blink a besoin d’une session de bureau (X11 ou Wayland). Sous Ubuntu 24.04, il démarre tout seul.",
    manual: "Lire les étapes manuelles",
    manualLead: "Vous préférez le faire à la main ?",
    footer:
      "Blinkling s’exécute sur votre ordinateur et utilise votre propre Claude Code.",
    privacy: "Confidentialité",
  },
  "pt-BR": {
    install: "Instalar",
    title: "Instalar o Blinkling",
    description:
      "Instale o Blinkling em dois ou três passos. Escolha seu computador e siga os passos curtos e animados.",
    language: "Idioma",
    nav: "Principal",
    overview: "Visão geral",
    lead: "Você precisa do Claude Code, com login feito. Depois são uma linha colada, um comando e, no Mac, uma permissão.",
    legend: "Qual computador você tem?",
    detected: "Escolhemos isto pelo seu navegador.",
    macChip:
      "Não tem certeza? Menu Apple, “Sobre Este Mac”: se “Chip” diz Apple M…, é Apple silicon. Se “Processador” diz Intel, é Intel.",
    choose: "Escolha seu computador acima para ver os passos.",
    macSteps: "Passos para o Mac",
    windowsSteps: "Passos para o Windows",
    linuxSteps: "Passos para o Linux",
    pasteMac: "Cole esta linha no Terminal e pressione Return.",
    pasteWindows: "Cole esta linha no PowerShell e pressione Enter.",
    pasteLinux: "Cole esta linha em um terminal e pressione Enter.",
    runIt: "No Claude Code, execute isto. O Blink aparece.",
    permission:
      "Permita a Gravação de Tela uma vez: ative o Blinkling em Ajustes do Sistema, Privacidade e Segurança. O macOS também pede Acessibilidade para a tecla Ctrl funcionar. Permita da mesma forma.",
    copy: "Copiar",
    copied: "Copiado",
    copyCommand: "Copiar comando",
    copiedStatus: "Copiado para a área de transferência.",
    copyManual: "Selecione a linha e copie.",
    sceneMac: "Animação: a linha é colada no Terminal e o plugin é instalado.",
    sceneWindows:
      "Animação: a linha é colada no PowerShell e o plugin é instalado.",
    sceneLinux:
      "Animação: a linha é colada em um terminal e o plugin é instalado.",
    sceneClaude:
      "Animação: o comando é digitado no Claude Code e o Blink acena.",
    scenePermission:
      "Animação: o interruptor do Blinkling é ativado em Gravação de Tela.",
    sceneGatekeeper:
      "Animação: aparece o aviso de bloqueio e depois clica-se em Abrir Mesmo Assim em Privacidade e Segurança.",
    sceneSmartscreen:
      "Animação: clica-se em Mais informações e depois em Executar assim mesmo.",
    paneTitle: "Gravação de Tela e Áudio do Sistema",
    privacyTitle: "Privacidade e Segurança",
    gkFallback: "Se o macOS ainda disser que não consegue abrir o Blinkling",
    gkNote:
      "O Blinkling não é notarizado pela Apple. Normalmente nada é perguntado. Se for, abra Ajustes do Sistema, Privacidade e Segurança, e escolha Abrir Mesmo Assim.",
    gkDialogTitle: "Não é possível abrir “Blinkling”",
    gkDialogSmall: "A Apple não conseguiu verificar se há malware.",
    gkDone: "OK",
    gkBlocked: "“Blinkling” foi bloqueado.",
    gkOpen: "Abrir Mesmo Assim",
    wFallback: "Se o Windows disser que protegeu seu computador",
    wNote:
      "O Blinkling não é assinado com um certificado pago, então o SmartScreen pode perguntar. Escolha Mais informações e depois Executar assim mesmo.",
    wDialogTitle: "O Windows protegeu o computador",
    wDialogSmall:
      "O Microsoft Defender SmartScreen impediu a inicialização de um aplicativo não reconhecido.",
    wMore: "Mais informações",
    wRun: "Executar assim mesmo",
    linuxNote:
      "O Blink precisa de uma sessão de área de trabalho (X11 ou Wayland). No Ubuntu 24.04 ele inicia sozinho.",
    manual: "Leia os passos manuais",
    manualLead: "Prefere fazer à mão?",
    footer:
      "O Blinkling roda no seu computador e usa o seu próprio Claude Code.",
    privacy: "Privacidade",
  },
};

/** Looks up a string; English fills any gap. */
export function translator(locale) {
  const own = TEXT[locale] ?? {};
  return (key) => {
    const text = own[key] ?? TEXT.en[key];
    if (text === undefined) throw new Error(`Missing string: ${key}`);
    return text;
  };
}

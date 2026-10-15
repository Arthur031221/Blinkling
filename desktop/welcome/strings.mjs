import { translator } from "../shared/i18n.mjs";

/** The welcome has exactly three steps (N1.6): hello, screen permission, hold the
 * pick key and click. "Blinkling" is never translated; {key} is the pick key. */
export const strings = {
  en: {
    close: "Close",
    next: "Next",
    back: "Back",
    done: "Got it",
    step: "Step {n} of 3",
    helloTitle: "Hi, I'm Blink",
    helloBody:
      "I live in the corner of your screen and help with whatever you are looking at.",
    permissionTitle: "Let me see your screen",
    permissionBody:
      "To look at what you point at, Blinkling needs the screen recording switch in System Settings.",
    permissionAllow: "Allow",
    permissionOpen: "Open System Settings",
    permissionOn: "Screen access is on",
    permissionNone:
      "Nothing to allow on this computer. I can already see your screen.",
    tryTitle: "Hold {key} and click",
    tryBody:
      "Click what you want to ask about. Hold {key} and drag to take an area.",
    drag: "drag",
  },
  "zh-TW": {
    close: "關閉",
    next: "下一步",
    back: "上一步",
    done: "知道了",
    step: "第 {n} 步，共 3 步",
    helloTitle: "嗨，我是 Blink",
    helloBody: "我住在你螢幕的角落，你看到什麼，我就幫你看。",
    permissionTitle: "讓我看看你的螢幕",
    permissionBody:
      "為了看你指的地方，Blinkling 需要在系統設定裡打開螢幕錄製。",
    permissionAllow: "允許",
    permissionOpen: "開啟系統設定",
    permissionOn: "已允許看螢幕",
    permissionNone: "這台電腦不用另外允許，我已經看得到你的螢幕。",
    tryTitle: "按住 {key} 再點一下",
    tryBody: "點你想問的東西。按住 {key} 拖曳可以框選一個區域。",
    drag: "拖曳",
  },
  "zh-CN": {
    close: "关闭",
    next: "下一步",
    back: "上一步",
    done: "知道了",
    step: "第 {n} 步，共 3 步",
    helloTitle: "嗨，我是 Blink",
    helloBody: "我住在你屏幕的角落，你看到什么，我就帮你看。",
    permissionTitle: "让我看看你的屏幕",
    permissionBody:
      "为了看你指的地方，Blinkling 需要在系统设置里打开屏幕录制。",
    permissionAllow: "允许",
    permissionOpen: "打开系统设置",
    permissionOn: "已允许查看屏幕",
    permissionNone: "这台电脑不用另外允许，我已经看得到你的屏幕。",
    tryTitle: "按住 {key} 再点一下",
    tryBody: "点你想问的东西。按住 {key} 拖动可以框选一个区域。",
    drag: "拖动",
  },
  ja: {
    close: "閉じる",
    next: "次へ",
    back: "戻る",
    done: "わかった",
    step: "ステップ {n} / 3",
    helloTitle: "こんにちは、Blink です",
    helloBody: "画面の隅にいて、あなたが見ているものを一緒に見ます。",
    permissionTitle: "画面を見せてください",
    permissionBody:
      "指したところを見るため、システム設定で画面収録をオンにしてください。",
    permissionAllow: "許可する",
    permissionOpen: "システム設定を開く",
    permissionOn: "画面へのアクセスはオンです",
    permissionNone:
      "このコンピューターでは許可は不要です。すでに画面を見られます。",
    tryTitle: "{key} を押しながらクリック",
    tryBody:
      "聞きたいものをクリック。{key} を押しながらドラッグすると範囲を選べます。",
    drag: "ドラッグ",
  },
  ko: {
    close: "닫기",
    next: "다음",
    back: "이전",
    done: "알겠어요",
    step: "{n} / 3단계",
    helloTitle: "안녕하세요, Blink예요",
    helloBody: "화면 구석에 살면서 보고 있는 것을 함께 봐 드려요.",
    permissionTitle: "화면을 보여 주세요",
    permissionBody: "가리킨 곳을 보려면 시스템 설정에서 화면 기록을 켜야 해요.",
    permissionAllow: "허용",
    permissionOpen: "시스템 설정 열기",
    permissionOn: "화면 접근이 켜져 있어요",
    permissionNone:
      "이 컴퓨터에서는 따로 허용할 것이 없어요. 이미 화면을 볼 수 있어요.",
    tryTitle: "{key}을(를) 누른 채 클릭",
    tryBody:
      "묻고 싶은 것을 클릭하세요. {key}을(를) 누른 채 드래그하면 영역을 고를 수 있어요.",
    drag: "드래그",
  },
  de: {
    close: "Schließen",
    next: "Weiter",
    back: "Zurück",
    done: "Verstanden",
    step: "Schritt {n} von 3",
    helloTitle: "Hallo, ich bin Blink",
    helloBody:
      "Ich wohne in der Ecke deines Bildschirms und helfe bei allem, was du gerade ansiehst.",
    permissionTitle: "Lass mich deinen Bildschirm sehen",
    permissionBody:
      "Um zu sehen, worauf du zeigst, braucht Blinkling in den Systemeinstellungen die Bildschirmaufnahme.",
    permissionAllow: "Erlauben",
    permissionOpen: "Systemeinstellungen öffnen",
    permissionOn: "Bildschirmzugriff ist an",
    permissionNone:
      "Auf diesem Computer ist nichts zu erlauben. Ich sehe deinen Bildschirm schon.",
    tryTitle: "{key} halten und klicken",
    tryBody:
      "Klicke auf das, wonach du fragen willst. Mit {key} und Ziehen wählst du einen Bereich.",
    drag: "ziehen",
  },
  es: {
    close: "Cerrar",
    next: "Siguiente",
    back: "Atrás",
    done: "Entendido",
    step: "Paso {n} de 3",
    helloTitle: "Hola, soy Blink",
    helloBody:
      "Vivo en la esquina de tu pantalla y te ayudo con lo que estés mirando.",
    permissionTitle: "Déjame ver tu pantalla",
    permissionBody:
      "Para ver lo que señalas, Blinkling necesita el permiso de grabación de pantalla en Ajustes del Sistema.",
    permissionAllow: "Permitir",
    permissionOpen: "Abrir Ajustes del Sistema",
    permissionOn: "El acceso a la pantalla está activado",
    permissionNone:
      "En este equipo no hay nada que permitir. Ya puedo ver tu pantalla.",
    tryTitle: "Mantén {key} y haz clic",
    tryBody:
      "Haz clic en lo que quieras preguntar. Mantén {key} y arrastra para tomar un área.",
    drag: "arrastrar",
  },
  fr: {
    close: "Fermer",
    next: "Suivant",
    back: "Retour",
    done: "Compris",
    step: "Étape {n} sur 3",
    helloTitle: "Salut, je suis Blink",
    helloBody:
      "Je vis dans le coin de ton écran et je t'aide avec ce que tu regardes.",
    permissionTitle: "Laisse-moi voir ton écran",
    permissionBody:
      "Pour voir ce que tu montres, Blinkling a besoin de l'enregistrement d'écran dans les Réglages Système.",
    permissionAllow: "Autoriser",
    permissionOpen: "Ouvrir les Réglages Système",
    permissionOn: "L'accès à l'écran est activé",
    permissionNone:
      "Rien à autoriser sur cet ordinateur. Je vois déjà ton écran.",
    tryTitle: "Maintiens {key} et clique",
    tryBody:
      "Clique sur ce que tu veux demander. Maintiens {key} et glisse pour prendre une zone.",
    drag: "glisser",
  },
  "pt-BR": {
    close: "Fechar",
    next: "Próximo",
    back: "Voltar",
    done: "Entendi",
    step: "Passo {n} de 3",
    helloTitle: "Oi, eu sou o Blink",
    helloBody:
      "Moro no canto da sua tela e ajudo com o que você estiver olhando.",
    permissionTitle: "Deixe-me ver sua tela",
    permissionBody:
      "Para ver o que você aponta, o Blinkling precisa da gravação de tela nos Ajustes do Sistema.",
    permissionAllow: "Permitir",
    permissionOpen: "Abrir Ajustes do Sistema",
    permissionOn: "O acesso à tela está ativado",
    permissionNone:
      "Não há nada para permitir neste computador. Já consigo ver sua tela.",
    tryTitle: "Segure {key} e clique",
    tryBody:
      "Clique no que quiser perguntar. Segure {key} e arraste para pegar uma área.",
    drag: "arrastar",
  },
};
/** The locale comes from main (shared/i18n.mjs asks the system once). */
export const welcomeText = (locale = "en") => translator(strings, locale);

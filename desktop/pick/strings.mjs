import { translator } from "../shared/i18n.mjs";

/** Pick strings, one table per locale (N3.10). The product and the mascot,
 * Blinkling and Blink, are never translated. The prompts are the questions the
 * quick-ask chips send, written in the reader's own language. */
export const strings = {
  en: {
    "chip.what": "What is this",
    "chip.translate": "Translate",
    "chip.keypoints": "Key points",
    "tag.frame": "Current frame",
    "mini.pause": "Auto explain paused",
    "translate.page": "Translate page",
    "pdf.offer":
      "This PDF has no text I can pick. Open it in the Blinkling PDF reader to select text?",
    "keys.denied": "Blinkling needs permission to hear keys and clicks",
    "keys.deniedNote":
      "Without Input Monitoring or Accessibility, the pick key does not work and an open card cannot close when you click elsewhere. macOS will ask next: turn Blinkling on in Privacy & Security, then use Blinkling again.",
    "hint.pick": "Click once to ask about this",
    "hint.several":
      "Keep holding the key to pick more, let go to send them all",
    "key.control": "Control",
    "key.option": "Option",
  },
  "zh-TW": {
    "chip.what": "這是什麼",
    "chip.translate": "翻譯",
    "chip.keypoints": "重點",
    "tag.frame": "目前畫面",
    "mini.pause": "暫停自動解說",
    "translate.page": "翻譯整頁",
    "pdf.offer":
      "這份 PDF 沒有可選取的文字。要用 Blinkling 的 PDF 閱讀器開啟並選取文字嗎？",
    "keys.denied": "Blinkling 需要聽取按鍵與點擊的權限",
    "keys.deniedNote":
      "沒有「輸入監控」或「輔助使用」權限，選取鍵無法使用，點擊其他地方也無法關閉卡片。接下來 macOS 會詢問：請在「隱私權與安全性」中開啟 Blinkling。",
    "hint.pick": "點一下就能詢問這個",
    "hint.several": "繼續按住按鍵可再選取更多，放開就會一起送出",
    "key.control": "Control",
    "key.option": "Option",
  },
  "zh-CN": {
    "chip.what": "这是什么",
    "chip.translate": "翻译",
    "chip.keypoints": "要点",
    "tag.frame": "当前画面",
    "mini.pause": "暂停自动解说",
    "translate.page": "翻译整页",
    "pdf.offer":
      "这份 PDF 没有可选取的文字。要用 Blinkling 的 PDF 阅读器打开并选取文字吗？",
    "keys.denied": "Blinkling 需要监听按键和点击的权限",
    "keys.deniedNote":
      "没有“输入监控”或“辅助功能”权限，选取键无法使用，点击其他位置也无法关闭卡片。接下来 macOS 会询问：请在“隐私与安全性”中打开 Blinkling。",
    "hint.pick": "点一下就能询问这个",
    "hint.several": "继续按住按键可再选取更多，松开就会一起发送",
    "key.control": "Control",
    "key.option": "Option",
  },
  ja: {
    "chip.what": "これは何",
    "chip.translate": "翻訳",
    "chip.keypoints": "要点",
    "tag.frame": "現在の画面",
    "mini.pause": "自動解説を一時停止",
    "translate.page": "ページ全体を翻訳",
    "pdf.offer":
      "この PDF には選択できるテキストがありません。Blinkling の PDF リーダーで開いてテキストを選択しますか？",
    "keys.denied": "Blinkling にキーとクリックを受け取る許可が必要です",
    "keys.deniedNote":
      "「入力監視」または「アクセシビリティ」がないと、選択キーが働かず、ほかの場所をクリックしてもカードが閉じません。このあと macOS が確認します。「プライバシーとセキュリティ」で Blinkling をオンにしてください。",
    "hint.pick": "クリックするとこれについて質問できます",
    "hint.several":
      "キーを押したままにすると続けて選べます。離すとまとめて送られます",
    "key.control": "Control",
    "key.option": "Option",
  },
  ko: {
    "chip.what": "이게 뭐야",
    "chip.translate": "번역",
    "chip.keypoints": "요점",
    "tag.frame": "현재 화면",
    "mini.pause": "자동 설명 일시 중지",
    "translate.page": "페이지 전체 번역",
    "pdf.offer":
      "이 PDF에는 선택할 수 있는 텍스트가 없습니다. Blinkling PDF 리더로 열어 텍스트를 선택할까요?",
    "keys.denied": "Blinkling에 키와 클릭을 받을 권한이 필요합니다",
    "keys.deniedNote":
      "입력 모니터링 또는 손쉬운 사용 권한이 없으면 선택 키가 동작하지 않고, 다른 곳을 클릭해도 카드가 닫히지 않습니다. 이어서 macOS가 묻습니다. 개인정보 보호 및 보안에서 Blinkling을 켜 주세요.",
    "hint.pick": "한 번 클릭하면 이것에 대해 물어볼 수 있어요",
    "hint.several":
      "키를 계속 누르고 있으면 더 고를 수 있고, 놓으면 한꺼번에 보내져요",
    "key.control": "Control",
    "key.option": "Option",
  },
  de: {
    "chip.what": "Was ist das",
    "chip.translate": "Übersetzen",
    "chip.keypoints": "Kernpunkte",
    "tag.frame": "Aktuelles Bild",
    "mini.pause": "Automatische Erklärung pausiert",
    "translate.page": "Ganze Seite übersetzen",
    "pdf.offer":
      "Dieses PDF enthält keinen auswählbaren Text. Im Blinkling-PDF-Reader öffnen, um Text auszuwählen?",
    "keys.denied":
      "Blinkling braucht die Erlaubnis, Tasten und Klicks zu hören",
    "keys.deniedNote":
      "Ohne Eingabeüberwachung oder Bedienungshilfen funktioniert die Auswahltaste nicht, und eine offene Karte schließt sich nicht, wenn Sie woanders klicken. macOS fragt gleich nach: Schalten Sie Blinkling unter Datenschutz & Sicherheit ein.",
    "hint.pick": "Einmal klicken, um dazu zu fragen",
    "hint.several":
      "Taste gedrückt halten, um mehr auszuwählen, loslassen sendet alles",
    "key.control": "Control",
    "key.option": "Option",
  },
  es: {
    "chip.what": "Qué es esto",
    "chip.translate": "Traducir",
    "chip.keypoints": "Puntos clave",
    "tag.frame": "Imagen actual",
    "mini.pause": "Explicación automática en pausa",
    "translate.page": "Traducir la página",
    "pdf.offer":
      "Este PDF no tiene texto seleccionable. ¿Abrirlo en el lector de PDF de Blinkling para seleccionar texto?",
    "keys.denied": "Blinkling necesita permiso para oír teclas y clics",
    "keys.deniedNote":
      "Sin Supervisión de entrada o Accesibilidad, la tecla de selección no funciona y una tarjeta abierta no se cierra al hacer clic fuera. macOS preguntará a continuación: activa Blinkling en Privacidad y seguridad.",
    "hint.pick": "Haz clic una vez para preguntar sobre esto",
    "hint.several":
      "Mantén la tecla para elegir más y suéltala para enviarlo todo",
    "key.control": "Control",
    "key.option": "Option",
  },
  fr: {
    "chip.what": "C’est quoi",
    "chip.translate": "Traduire",
    "chip.keypoints": "Points clés",
    "tag.frame": "Image actuelle",
    "mini.pause": "Explication automatique en pause",
    "translate.page": "Traduire la page",
    "pdf.offer":
      "Ce PDF n’a pas de texte sélectionnable. L’ouvrir dans le lecteur PDF de Blinkling pour sélectionner du texte ?",
    "keys.denied":
      "Blinkling a besoin de l’autorisation d’entendre les touches et les clics",
    "keys.deniedNote":
      "Sans Surveillance de l’entrée ou Accessibilité, la touche de sélection ne fonctionne pas et une carte ouverte ne se ferme pas quand vous cliquez ailleurs. macOS va demander : activez Blinkling dans Confidentialité et sécurité.",
    "hint.pick": "Cliquez une fois pour poser une question",
    "hint.several":
      "Gardez la touche enfoncée pour en choisir d'autres, relâchez pour tout envoyer",
    "key.control": "Control",
    "key.option": "Option",
  },
  "pt-BR": {
    "chip.what": "O que é isto",
    "chip.translate": "Traduzir",
    "chip.keypoints": "Pontos principais",
    "tag.frame": "Quadro atual",
    "mini.pause": "Explicação automática em pausa",
    "translate.page": "Traduzir a página",
    "pdf.offer":
      "Este PDF não tem texto selecionável. Abrir no leitor de PDF do Blinkling para selecionar texto?",
    "keys.denied":
      "O Blinkling precisa de permissão para ouvir teclas e cliques",
    "keys.deniedNote":
      "Sem Monitoramento de entrada ou Acessibilidade, a tecla de seleção não funciona e um cartão aberto não fecha ao clicar fora. O macOS vai perguntar em seguida: ative o Blinkling em Privacidade e segurança.",
    "hint.pick": "Clique uma vez para perguntar sobre isto",
    "hint.several":
      "Segure a tecla para escolher mais e solte para enviar tudo",
    "key.control": "Control",
    "key.option": "Option",
  },
};

export const t = (locale) => translator(strings, locale);

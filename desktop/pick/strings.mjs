import { translator } from "../shared/i18n.mjs";

/** Pick strings, one table per locale (N3.10). The product and the mascot,
 * Blinkling and Blink, are never translated. The prompts are the questions the
 * quick-ask chips send, written in the reader's own language. */
export const strings = {
  en: {
    "chip.what": "What is this",
    "chip.translate": "Translate",
    "chip.keypoints": "Key points",
    "prompt.what": "Explain what this is.",
    "prompt.translate": "Translate this into English.",
    "prompt.keypoints": "Give me the key points of this.",
    "tag.frame": "Current frame",
    "mini.pause": "Auto explain paused",
    "translate.page": "Translate page",
    "pdf.offer":
      "This PDF has no text I can pick. Open it in the Blinkling PDF reader to select text?",
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
    "prompt.what": "請解釋這是什麼。",
    "prompt.translate": "請把這段內容翻譯成繁體中文。",
    "prompt.keypoints": "請幫我整理這段內容的重點。",
    "tag.frame": "目前畫面",
    "mini.pause": "暫停自動解說",
    "translate.page": "翻譯整頁",
    "pdf.offer":
      "這份 PDF 沒有可選取的文字。要用 Blinkling 的 PDF 閱讀器開啟並選取文字嗎？",
    "hint.pick": "點一下就能詢問這個",
    "hint.several": "繼續按住按鍵可再選取更多，放開就會一起送出",
    "key.control": "Control",
    "key.option": "Option",
  },
  "zh-CN": {
    "chip.what": "这是什么",
    "chip.translate": "翻译",
    "chip.keypoints": "要点",
    "prompt.what": "请解释这是什么。",
    "prompt.translate": "请把这段内容翻译成简体中文。",
    "prompt.keypoints": "请帮我整理这段内容的要点。",
    "tag.frame": "当前画面",
    "mini.pause": "暂停自动解说",
    "translate.page": "翻译整页",
    "pdf.offer":
      "这份 PDF 没有可选取的文字。要用 Blinkling 的 PDF 阅读器打开并选取文字吗？",
    "hint.pick": "点一下就能询问这个",
    "hint.several": "继续按住按键可再选取更多，松开就会一起发送",
    "key.control": "Control",
    "key.option": "Option",
  },
  ja: {
    "chip.what": "これは何",
    "chip.translate": "翻訳",
    "chip.keypoints": "要点",
    "prompt.what": "これが何かを説明してください。",
    "prompt.translate": "これを日本語に翻訳してください。",
    "prompt.keypoints": "これの要点をまとめてください。",
    "tag.frame": "現在の画面",
    "mini.pause": "自動解説を一時停止",
    "translate.page": "ページ全体を翻訳",
    "pdf.offer":
      "この PDF には選択できるテキストがありません。Blinkling の PDF リーダーで開いてテキストを選択しますか？",
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
    "prompt.what": "이게 무엇인지 설명해 주세요.",
    "prompt.translate": "이 내용을 한국어로 번역해 주세요.",
    "prompt.keypoints": "이 내용의 요점을 정리해 주세요.",
    "tag.frame": "현재 화면",
    "mini.pause": "자동 설명 일시 중지",
    "translate.page": "페이지 전체 번역",
    "pdf.offer":
      "이 PDF에는 선택할 수 있는 텍스트가 없습니다. Blinkling PDF 리더로 열어 텍스트를 선택할까요?",
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
    "prompt.what": "Erkläre, was das ist.",
    "prompt.translate": "Übersetze das ins Deutsche.",
    "prompt.keypoints": "Fasse die Kernpunkte davon zusammen.",
    "tag.frame": "Aktuelles Bild",
    "mini.pause": "Automatische Erklärung pausiert",
    "translate.page": "Ganze Seite übersetzen",
    "pdf.offer":
      "Dieses PDF enthält keinen auswählbaren Text. Im Blinkling-PDF-Reader öffnen, um Text auszuwählen?",
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
    "prompt.what": "Explica qué es esto.",
    "prompt.translate": "Traduce esto al español.",
    "prompt.keypoints": "Dame los puntos clave de esto.",
    "tag.frame": "Imagen actual",
    "mini.pause": "Explicación automática en pausa",
    "translate.page": "Traducir la página",
    "pdf.offer":
      "Este PDF no tiene texto seleccionable. ¿Abrirlo en el lector de PDF de Blinkling para seleccionar texto?",
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
    "prompt.what": "Explique ce que c’est.",
    "prompt.translate": "Traduis ceci en français.",
    "prompt.keypoints": "Donne-moi les points clés de ceci.",
    "tag.frame": "Image actuelle",
    "mini.pause": "Explication automatique en pause",
    "translate.page": "Traduire la page",
    "pdf.offer":
      "Ce PDF n’a pas de texte sélectionnable. L’ouvrir dans le lecteur PDF de Blinkling pour sélectionner du texte ?",
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
    "prompt.what": "Explique o que é isto.",
    "prompt.translate": "Traduza isto para o português.",
    "prompt.keypoints": "Me dê os pontos principais disto.",
    "tag.frame": "Quadro atual",
    "mini.pause": "Explicação automática em pausa",
    "translate.page": "Traduzir a página",
    "pdf.offer":
      "Este PDF não tem texto selecionável. Abrir no leitor de PDF do Blinkling para selecionar texto?",
    "hint.pick": "Clique uma vez para perguntar sobre isto",
    "hint.several":
      "Segure a tecla para escolher mais e solte para enviar tudo",
    "key.control": "Control",
    "key.option": "Option",
  },
};

export const t = (locale) => translator(strings, locale);

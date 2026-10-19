import { pickLocale, translator } from "../shared/i18n.mjs";

/** The sentences guide mode says in a bubble when a tour fails or ends. The
 * model's own steps come in the user's language from the prompt; these are ours.
 * The closing sentence names the "Overview" chip with the label the chip shows. */
export const STRINGS = Object.freeze({
  en: {
    failure: "The guide could not finish",
    session: "Claude is still starting, try again in a few seconds",
    capture: "Blinkling could not capture this screen",
    draw: "There is nothing on this screen to mark",
    timeout: "Claude took too long to reply",
    noSteps: "Claude's reply had no steps to follow",
    unreadable: "Claude's reply was not in a format Blinkling can read",
    reported: "Claude reported a problem ({detail})",
    unknown: "unknown cause",
    back: "Previous",
    next: "Next",
    done: "Done",
    end: "End guide",
    screenOnly:
      "Marks follow the screen, not the page. Install the browser helper to keep them on the text when you scroll.",
    asked: "Guide me through this screen",
    closing:
      "That is the end of the guide. Just ask me if you want to go over any part again.",
  },
  "zh-TW": {
    failure: "導覽暫時無法完成",
    session: "Claude 還在啟動，請稍等幾秒再試",
    capture: "沒辦法擷取這個螢幕的畫面",
    draw: "畫面上沒有可以標示的區塊",
    timeout: "Claude 太久沒有回覆",
    noSteps: "Claude 的回覆裡沒有可以照著走的步驟",
    unreadable: "Claude 的回覆不是我能讀的格式",
    reported: "Claude 回報了問題（{detail}）",
    unknown: "原因不明",
    back: "上一步",
    next: "下一步",
    done: "完成",
    end: "結束導覽",
    screenOnly:
      "目前以螢幕位置標示，捲動頁面時標記不會跟著動。裝上瀏覽器輔助程式就能固定在內容上。",
    asked: "帶我看這個畫面",
    closing: "導覽到這裡結束。想再看哪一段，直接問我就好。",
  },
  "zh-CN": {
    failure: "导览暂时无法完成",
    session: "Claude 还在启动，请稍等几秒再试",
    capture: "没办法截取这个屏幕的画面",
    draw: "画面上没有可以标示的区块",
    timeout: "Claude 太久没有回复",
    noSteps: "Claude 的回复里没有可以照着走的步骤",
    unreadable: "Claude 的回复不是我能读的格式",
    reported: "Claude 报告了问题（{detail}）",
    unknown: "原因不明",
    back: "上一步",
    next: "下一步",
    done: "完成",
    end: "结束导览",
    screenOnly:
      "目前按屏幕位置标示，滚动页面时标记不会跟着动。装上浏览器辅助程序就能固定在内容上。",
    asked: "带我看这个画面",
    closing: "导览到这里结束。想再看哪一段，直接问我就好。",
  },
  ja: {
    failure: "ガイドを完了できませんでした",
    session: "Claude がまだ起動中です。数秒待ってからもう一度お試しください",
    capture: "この画面を取り込めませんでした",
    draw: "この画面に印を付ける場所がありません",
    timeout: "Claude の返事に時間がかかりすぎました",
    noSteps: "Claude の返事に、たどれる手順がありませんでした",
    unreadable: "Claude の返事を読み取れない形式でした",
    reported: "Claude から問題が報告されました（{detail}）",
    unknown: "原因不明",
    back: "前へ",
    next: "次へ",
    done: "完了",
    end: "ガイドを終了",
    screenOnly:
      "画面上の位置で表示しています。スクロールすると印は動きません。ブラウザ補助を入れると内容に固定できます。",
    asked: "この画面を案内して",
    closing:
      "ガイドはここまでです。もう一度見たいところは、そのまま聞いてください。",
  },
  ko: {
    failure: "안내를 끝내지 못했어요",
    session: "Claude가 아직 시작 중이에요. 몇 초 뒤에 다시 시도해 주세요",
    capture: "이 화면을 캡처하지 못했어요",
    draw: "이 화면에는 표시할 곳이 없어요",
    timeout: "Claude가 너무 오래 답하지 않았어요",
    noSteps: "Claude의 답에 따라 할 단계가 없었어요",
    unreadable: "Claude의 답을 읽을 수 없는 형식이었어요",
    reported: "Claude가 문제를 알려 왔어요 ({detail})",
    unknown: "원인 불명",
    back: "이전",
    next: "다음",
    done: "완료",
    end: "안내 끝내기",
    screenOnly:
      "화면 위치로 표시하고 있어요. 스크롤하면 표시가 따라가지 않아요. 브라우저 도우미를 설치하면 내용에 고정돼요.",
    asked: "이 화면을 안내해 줘",
    closing: "안내는 여기까지예요. 다시 보고 싶은 부분은 그냥 물어봐 주세요.",
  },
  de: {
    failure: "Die Führung konnte nicht abgeschlossen werden",
    session: "Claude startet noch, versuche es in ein paar Sekunden erneut",
    capture: "Dieser Bildschirm konnte nicht aufgenommen werden",
    draw: "Auf diesem Bildschirm gibt es nichts zu markieren",
    timeout: "Claude hat zu lange nicht geantwortet",
    noSteps: "Claudes Antwort enthielt keine Schritte zum Befolgen",
    unreadable:
      "Claudes Antwort hatte ein Format, das Blinkling nicht lesen kann",
    reported: "Claude meldete ein Problem ({detail})",
    unknown: "Ursache unbekannt",
    back: "Zurück",
    next: "Weiter",
    done: "Fertig",
    end: "Anleitung beenden",
    screenOnly:
      "Die Markierungen folgen dem Bildschirm, nicht der Seite. Mit dem Browser-Helfer bleiben sie beim Scrollen am Text.",
    asked: "Führe mich durch diesen Bildschirm",
    closing:
      "Das war die Anleitung. Fragen Sie mich einfach, wenn Sie einen Teil noch einmal sehen möchten.",
  },
  es: {
    failure: "La guía no pudo terminar",
    session:
      "Claude aún se está iniciando, inténtalo de nuevo en unos segundos",
    capture: "No se pudo capturar esta pantalla",
    draw: "No hay nada que marcar en esta pantalla",
    timeout: "Claude tardó demasiado en responder",
    noSteps: "La respuesta de Claude no tenía pasos que seguir",
    unreadable:
      "La respuesta de Claude no tenía un formato que Blinkling pueda leer",
    reported: "Claude informó de un problema ({detail})",
    unknown: "causa desconocida",
    back: "Anterior",
    next: "Siguiente",
    done: "Listo",
    end: "Terminar guía",
    screenOnly:
      "Las marcas siguen la pantalla, no la página. Con el ayudante del navegador se quedan en el texto al desplazarte.",
    asked: "Guíame por esta pantalla",
    closing:
      "Aquí termina la guía. Pregúntame si quieres repasar alguna parte.",
  },
  fr: {
    failure: "Le guide n’a pas pu se terminer",
    session: "Claude démarre encore, réessayez dans quelques secondes",
    capture: "Cet écran n’a pas pu être capturé",
    draw: "Il n’y a rien à marquer sur cet écran",
    timeout: "Claude a mis trop de temps à répondre",
    noSteps: "La réponse de Claude ne contenait aucune étape à suivre",
    unreadable:
      "La réponse de Claude n’était pas dans un format que Blinkling sait lire",
    reported: "Claude a signalé un problème ({detail})",
    unknown: "cause inconnue",
    back: "Précédent",
    next: "Suivant",
    done: "Terminé",
    end: "Terminer le guide",
    screenOnly:
      "Les repères suivent l'écran, pas la page. Avec l'assistant du navigateur, ils restent sur le texte quand vous défilez.",
    asked: "Guide-moi sur cet écran",
    closing:
      "Le guide s'arrête ici. Demandez-moi si vous voulez revoir une partie.",
  },
  "pt-BR": {
    failure: "O guia não pôde terminar",
    session: "O Claude ainda está iniciando, tente de novo em alguns segundos",
    capture: "Não foi possível capturar esta tela",
    draw: "Não há nada para marcar nesta tela",
    timeout: "O Claude demorou demais para responder",
    noSteps: "A resposta do Claude não tinha passos a seguir",
    unreadable:
      "A resposta do Claude não estava num formato que o Blinkling consegue ler",
    reported: "O Claude relatou um problema ({detail})",
    unknown: "causa desconhecida",
    back: "Anterior",
    next: "Próximo",
    done: "Concluir",
    end: "Encerrar guia",
    screenOnly:
      "As marcas seguem a tela, não a página. Instale o ajudante do navegador para mantê-las no texto ao rolar.",
    asked: "Guie-me por esta tela",
    closing:
      "O guia termina aqui. É só me perguntar se quiser rever alguma parte.",
  },
});

/** t(key, vars) for the user's language. */
export function guideStrings(preferred) {
  return translator(STRINGS, pickLocale(preferred));
}

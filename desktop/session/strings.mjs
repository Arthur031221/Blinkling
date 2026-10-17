import { translator } from "../shared/i18n.mjs";

/** The two lines a chat says on its own account. "Blink" and "Claude Code" are
 * names and stay as they are in every language. */
export const strings = Object.freeze({
  en: {
    closed:
      "The Claude Code session for this chat is closed. Start it again, or open Blink from another session.",
    undelivered:
      "Claude Code did not answer this in time, so Blink answered it here.",
  },
  "zh-TW": {
    closed:
      "這個對話的 Claude Code 工作階段已經關閉。請重新啟動，或從其他工作階段開啟 Blink。",
    undelivered: "Claude Code 沒有及時回答，所以由 Blink 在這裡回答。",
  },
  "zh-CN": {
    closed:
      "这个对话的 Claude Code 会话已经关闭。请重新启动，或从其他会话打开 Blink。",
    undelivered: "Claude Code 没有及时回答，所以由 Blink 在这里回答。",
  },
  ja: {
    closed:
      "このチャットの Claude Code セッションは終了しました。もう一度起動するか、別のセッションから Blink を開いてください。",
    undelivered:
      "Claude Code が時間内に答えなかったため、Blink がここで答えました。",
  },
  ko: {
    closed:
      "이 대화의 Claude Code 세션이 닫혔습니다. 다시 시작하거나 다른 세션에서 Blink를 여세요.",
    undelivered:
      "Claude Code가 제때 답하지 않아 Blink가 여기서 대신 답했습니다.",
  },
  de: {
    closed:
      "Die Claude-Code-Sitzung für diesen Chat ist beendet. Starte sie neu oder öffne Blink aus einer anderen Sitzung.",
    undelivered:
      "Claude Code hat nicht rechtzeitig geantwortet, deshalb hat Blink hier geantwortet.",
  },
  es: {
    closed:
      "La sesión de Claude Code de este chat está cerrada. Inicia otra vez o abre Blink desde otra sesión.",
    undelivered:
      "Claude Code no respondió a tiempo, así que Blink respondió aquí.",
  },
  fr: {
    closed:
      "La session Claude Code de ce chat est fermée. Relancez-la ou ouvrez Blink depuis une autre session.",
    undelivered:
      "Claude Code n'a pas répondu à temps, alors Blink a répondu ici.",
  },
  "pt-BR": {
    closed:
      "A sessão do Claude Code deste chat foi fechada. Inicie de novo ou abra o Blink a partir de outra sessão.",
    undelivered:
      "O Claude Code não respondeu a tempo, então o Blink respondeu aqui.",
  },
});

export const say = (locale) => translator(strings, locale);

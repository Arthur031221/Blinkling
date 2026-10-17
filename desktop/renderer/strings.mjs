import { documentLocale, translator } from "../shared/i18n.mjs";
/** Text the character window itself shows, one table per locale. */
export const strings = {
  en: {
    permission: "Blink needs your OK",
    dismiss: "Dismiss",
    grumble1: "Blink is so bored...",
    grumble2: "Anything to show Blink?",
    grumble3: "Blink is hungry. A screenshot would do.",
    grumble4:
      "Blink is counting the pixels on the screen... three million so far.",
    grumble5: "Hmm... did everyone forget Blink?",
    grumble6: "Blink is sneaking a little stretch.",
    grumble7: "Where did that cursor go?",
    grumble8: "Blink's eyes are dry. Blink blinks.",
  },
  "zh-TW": {
    permission: "需要你的允許",
    dismiss: "關閉提示",
    grumble1: "Blink 好無聊……",
    grumble2: "有沒有東西要給 Blink 看看呀……",
    grumble3: "Blink 肚子餓餓，想吃截圖",
    grumble4: "Blink 在數螢幕上的像素……數到三百萬了",
    grumble5: "嗯……Blink 是不是被忘記了",
    grumble6: "Blink 偷偷伸個懶腰",
    grumble7: "剛剛那個游標跑去哪了……",
    grumble8: "Blink 眼睛好乾，眨一下",
  },
  "zh-CN": {
    permission: "需要你的允许",
    dismiss: "关闭提示",
    grumble1: "Blink 好无聊……",
    grumble2: "有没有东西要给 Blink 看看呀……",
    grumble3: "Blink 肚子饿饿，想吃截图",
    grumble4: "Blink 在数屏幕上的像素……数到三百万了",
    grumble5: "嗯……Blink 是不是被忘记了",
    grumble6: "Blink 偷偷伸个懒腰",
    grumble7: "刚刚那个光标跑去哪了……",
    grumble8: "Blink 眼睛好干，眨一下",
  },
  ja: {
    permission: "許可が必要です",
    dismiss: "閉じる",
    grumble1: "Blink はひまだなあ……",
    grumble2: "Blink に見せたいものはない？",
    grumble3: "Blink はおなかがすいたよ。スクリーンショットが食べたいな",
    grumble4: "Blink は画面のピクセルを数えているよ……三百万まで数えた",
    grumble5: "うーん……Blink は忘れられちゃったかな",
    grumble6: "Blink はこっそり伸びをするよ",
    grumble7: "さっきのカーソル、どこへ行ったんだろう……",
    grumble8: "Blink は目が乾いたので、まばたきするね",
  },
  ko: {
    permission: "허락이 필요해요",
    dismiss: "닫기",
    grumble1: "Blink 너무 심심해요……",
    grumble2: "Blink 한테 보여줄 거 없어요?",
    grumble3: "Blink 배고파요, 스크린샷이 먹고 싶어요",
    grumble4: "Blink 는 화면의 픽셀을 세고 있어요……삼백만까지 셌어요",
    grumble5: "음……Blink 를 잊어버린 걸까요",
    grumble6: "Blink 몰래 기지개를 켜요",
    grumble7: "아까 그 커서는 어디로 갔지……",
    grumble8: "Blink 눈이 건조해요, 깜빡깜빡",
  },
  de: {
    permission: "Blink braucht dein OK",
    dismiss: "Schließen",
    grumble1: "Blink ist so gelangweilt...",
    grumble2: "Gibt es etwas, das Blink sich ansehen soll?",
    grumble3: "Blink hat Hunger. Ein Screenshot wäre schön.",
    grumble4:
      "Blink zählt die Pixel auf dem Bildschirm... drei Millionen bisher.",
    grumble5: "Hmm... hat man Blink vergessen?",
    grumble6: "Blink streckt sich heimlich ein bisschen.",
    grumble7: "Wo ist der Cursor von eben hin?",
    grumble8: "Blinks Augen sind trocken. Blink blinzelt.",
  },
  es: {
    permission: "Blink necesita tu permiso",
    dismiss: "Cerrar",
    grumble1: "Blink se aburre mucho...",
    grumble2: "¿Hay algo que enseñarle a Blink?",
    grumble3: "Blink tiene hambre. Le vendría bien una captura.",
    grumble4: "Blink cuenta los píxeles de la pantalla... van tres millones.",
    grumble5: "Mmm... ¿se habrán olvidado de Blink?",
    grumble6: "Blink se estira a escondidas.",
    grumble7: "¿Adónde se fue ese cursor?",
    grumble8: "A Blink se le secan los ojos. Blink parpadea.",
  },
  fr: {
    permission: "Blink a besoin de ton accord",
    dismiss: "Fermer",
    grumble1: "Blink s'ennuie tellement...",
    grumble2: "Y a-t-il quelque chose à montrer à Blink ?",
    grumble3: "Blink a faim. Une capture d'écran ferait l'affaire.",
    grumble4: "Blink compte les pixels de l'écran... trois millions déjà.",
    grumble5: "Hum... a-t-on oublié Blink ?",
    grumble6: "Blink s'étire en cachette.",
    grumble7: "Où est passé ce curseur ?",
    grumble8: "Blink a les yeux secs. Blink cligne.",
  },
  "pt-BR": {
    permission: "Blink precisa da sua permissão",
    dismiss: "Fechar",
    grumble1: "O Blink está tão entediado...",
    grumble2: "Tem algo para mostrar ao Blink?",
    grumble3: "O Blink está com fome. Uma captura de tela serve.",
    grumble4: "O Blink está contando os pixels da tela... já são três milhões.",
    grumble5: "Hmm... será que esqueceram o Blink?",
    grumble6: "O Blink está se espreguiçando de fininho.",
    grumble7: "Para onde foi aquele cursor?",
    grumble8: "Os olhos do Blink estão secos. O Blink pisca.",
  },
};
/** How many idle lines each locale has: grumble1 to grumble8. */
export const GRUMBLES = 8;
export const windowText = (locale = documentLocale(globalThis.document)) =>
  translator(strings, locale);
/** Fill every [data-label] / [data-text] from the table. */
export function applyText(root, text = windowText()) {
  for (const el of root.querySelectorAll("[data-label]"))
    el.setAttribute("aria-label", text(el.dataset.label));
  for (const el of root.querySelectorAll("[data-text]"))
    el.textContent = text(el.dataset.text);
}

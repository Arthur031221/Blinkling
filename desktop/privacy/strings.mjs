import { translator } from "../shared/i18n.mjs";

/** Every user-visible sentence this module says. "Blink" and "Blinkling" are
 * names and stay as they are in every language. */
export const strings = Object.freeze({
  en: {
    lockSecure: "That's a password field, so Blink looked away.",
    lockPasswordManager:
      "A password manager is in front, so Blink looked away.",
    lockPrivate: "That's a private window, so Blink looked away.",
    usageLimit:
      "Claude's usage limit is reached. Blink will pause and start again around {time}.",
    usageLimitUnknown:
      "Claude's usage limit is reached. Blink pauses auto explain for now.",
    claudeMissing:
      "Blink can't find Claude Code. Install it from claude.com/claude-code and Blink will connect by itself.",
  },
  "zh-TW": {
    lockSecure: "這是密碼欄位，Blink 先把視線移開了。",
    lockPasswordManager: "密碼管理員在最前面，Blink 先把視線移開了。",
    lockPrivate: "這是私密視窗，Blink 先把視線移開了。",
    usageLimit:
      "已達到 Claude 的使用上限。Blink 會先暫停，約在 {time} 後自動繼續。",
    usageLimitUnknown: "已達到 Claude 的使用上限。Blink 先暫停自動解說。",
    claudeMissing:
      "Blink 找不到 Claude Code。請到 claude.com/claude-code 安裝，Blink 會自動連上。",
  },
  "zh-CN": {
    lockSecure: "这是密码输入框，Blink 先把目光移开了。",
    lockPasswordManager: "密码管理器在最前面，Blink 先把目光移开了。",
    lockPrivate: "这是隐私窗口，Blink 先把目光移开了。",
    usageLimit:
      "已达到 Claude 的使用上限。Blink 先暂停，约在 {time} 后自动继续。",
    usageLimitUnknown: "已达到 Claude 的使用上限。Blink 先暂停自动讲解。",
    claudeMissing:
      "Blink 找不到 Claude Code。请到 claude.com/claude-code 安装，Blink 会自动连上。",
  },
  ja: {
    lockSecure: "パスワード欄なので、Blink は目をそらしました。",
    lockPasswordManager:
      "パスワードマネージャーが前面にあるので、Blink は目をそらしました。",
    lockPrivate: "プライベートウィンドウなので、Blink は目をそらしました。",
    usageLimit:
      "Claude の利用上限に達しました。Blink は一時停止し、{time} ごろに自動で再開します。",
    usageLimitUnknown:
      "Claude の利用上限に達しました。Blink は自動解説を一時停止します。",
    claudeMissing:
      "Blink は Claude Code を見つけられません。claude.com/claude-code からインストールすると、Blink が自動でつながります。",
  },
  ko: {
    lockSecure: "비밀번호 입력란이라 Blink가 시선을 돌렸어요.",
    lockPasswordManager:
      "비밀번호 관리자가 앞에 있어서 Blink가 시선을 돌렸어요.",
    lockPrivate: "비공개 창이라 Blink가 시선을 돌렸어요.",
    usageLimit:
      "Claude 사용 한도에 도달했어요. Blink는 잠시 멈췄다가 {time}쯤 자동으로 다시 시작해요.",
    usageLimitUnknown:
      "Claude 사용 한도에 도달했어요. Blink는 자동 설명을 잠시 멈춰요.",
    claudeMissing:
      "Blink가 Claude Code를 찾지 못했어요. claude.com/claude-code에서 설치하면 Blink가 자동으로 연결돼요.",
  },
  de: {
    lockSecure: "Das ist ein Passwortfeld, deshalb hat Blink weggeschaut.",
    lockPasswordManager:
      "Ein Passwortmanager ist im Vordergrund, deshalb hat Blink weggeschaut.",
    lockPrivate: "Das ist ein privates Fenster, deshalb hat Blink weggeschaut.",
    usageLimit:
      "Das Nutzungslimit von Claude ist erreicht. Blink pausiert und macht gegen {time} automatisch weiter.",
    usageLimitUnknown:
      "Das Nutzungslimit von Claude ist erreicht. Blink pausiert die automatische Erklärung.",
    claudeMissing:
      "Blink findet Claude Code nicht. Installiere es von claude.com/claude-code, dann verbindet sich Blink von selbst.",
  },
  es: {
    lockSecure:
      "Es un campo de contraseña, así que Blink miró hacia otro lado.",
    lockPasswordManager:
      "Hay un gestor de contraseñas al frente, así que Blink miró hacia otro lado.",
    lockPrivate: "Es una ventana privada, así que Blink miró hacia otro lado.",
    usageLimit:
      "Se alcanzó el límite de uso de Claude. Blink hace una pausa y continúa solo hacia las {time}.",
    usageLimitUnknown:
      "Se alcanzó el límite de uso de Claude. Blink pausa la explicación automática.",
    claudeMissing:
      "Blink no encuentra Claude Code. Instálalo desde claude.com/claude-code y Blink se conectará solo.",
  },
  fr: {
    lockSecure:
      "C'est un champ de mot de passe, alors Blink a détourné le regard.",
    lockPasswordManager:
      "Un gestionnaire de mots de passe est au premier plan, alors Blink a détourné le regard.",
    lockPrivate: "C'est une fenêtre privée, alors Blink a détourné le regard.",
    usageLimit:
      "La limite d'utilisation de Claude est atteinte. Blink fait une pause et reprend tout seul vers {time}.",
    usageLimitUnknown:
      "La limite d'utilisation de Claude est atteinte. Blink met l'explication automatique en pause.",
    claudeMissing:
      "Blink ne trouve pas Claude Code. Installez-le depuis claude.com/claude-code et Blink se connectera tout seul.",
  },
  "pt-BR": {
    lockSecure: "É um campo de senha, então o Blink desviou o olhar.",
    lockPasswordManager:
      "Um gerenciador de senhas está na frente, então o Blink desviou o olhar.",
    lockPrivate: "É uma janela privada, então o Blink desviou o olhar.",
    usageLimit:
      "O limite de uso do Claude foi atingido. O Blink faz uma pausa e continua sozinho por volta de {time}.",
    usageLimitUnknown:
      "O limite de uso do Claude foi atingido. O Blink pausa a explicação automática.",
    claudeMissing:
      "O Blink não encontra o Claude Code. Instale em claude.com/claude-code e o Blink se conecta sozinho.",
  },
});

export const say = (locale) => translator(strings, locale);

/** The sentence for a blocked capture, by guard reason. */
export const lockKey = {
  secure: "lockSecure",
  "password-manager": "lockPasswordManager",
  private: "lockPrivate",
};

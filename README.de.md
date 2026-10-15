<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Die Antwort bleibt neben der Seite.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vom alten Plugin? Führe `/plugin uninstall glimpselet@glimpselet` und `/plugin marketplace remove glimpselet` aus und installiere dann Blinkling mit den Schritten unten.

Blink ist ein kleiner Begleiter in der Ecke deines Bildschirms. Halte Strg gedrückt und klicke auf etwas, um Claude Code danach zu fragen.

> [!TIP]
> Blink nutzt das Claude Code, bei dem du auf demselben Computer bereits angemeldet bist.

## Installation

1. Installiere das Plugin in Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Wecke Blink auf. Beim ersten Mal erscheint ein Willkommen in drei Schritten:

   ```text
   /blinkling:blinkling
   ```

3. Optional, für die Seitenstruktur, die Aufnahme ganzer Seiten, die Übersetzung an Ort und Stelle und den PDF-Reader: Führe `/blinkling:install` aus, aktiviere den **Entwicklermodus** unter `chrome://extensions` (oder `edge://extensions`), wähle **Load unpacked** und wähle `~/Blinkling-extension`.

> [!NOTE]
> Der Helfer ist optional: Blink funktioniert auch ohne ihn. [Installation und Aktualisierung](docs/INSTALL.md).

### Erweitert: aus dem Quellcode laden

<details>
<summary>Quellcode und manuelle Updates</summary>

Um das Plugin aus dem Quellcode zu starten, brauchst du Node.js 22+ und eine aktuelle Claude-Code-Version. Wenn dein Terminal bereits im Stammordner eines vorhandenen Checkouts ist, überspringe die ersten beiden Befehle. Führe im Terminal diese Befehle aus:

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details blinkling
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

Beide Versionsprüfungen müssen **2.1.0** ausgeben, und die Plugin-Liste muss `blinkling@inline` mit **2.1.0** zeigen, für diese Sitzung aktiviert. Führe in der vom letzten Befehl geöffneten Claude-Code-Sitzung `/blinkling:blinkling` aus. Die Option `--plugin-dir` lädt deinen Checkout nur für diese Sitzung. Verwende sie bei jedem Start von Claude Code aus dem Quellcode und starte die Sitzung nach einem Neubau neu. Die gebaute Erweiterung liegt im Checkout unter `dist-extension`.

Die Plugin-Details müssen außerdem die Skills `blinkling` und `install` sowie den MCP-Server `blinkling` enthalten. Die paketierte Erweiterung liegt unter `bin/extension`; ihre Version muss ebenfalls **2.1.0** lauten.

Der Browser-Helfer ist optional. Führe `/blinkling:install` aus, um die gebaute Erweiterung in den festen Ordner `~/Blinkling-extension` zu kopieren. Öffne in Chrome oder Edge `chrome://extensions` oder `edge://extensions`, aktiviere **Developer mode**, wähle **Load unpacked** und wähle diesen Ordner. Der Entwicklermodus-Hinweis bleibt sichtbar, und Updates erfolgen manuell, wenn eine neue Version erscheint.

Führe nach dem Upgrade der entpackten Erweiterung erneut `/blinkling:install` aus, um den festen Ordner zu aktualisieren, und klicke auf der Erweiterungsseite bei ihrer Karte auf Neu laden. Beim Wechsel zu `~/Blinkling-extension` entfernst du die alte Karte und lädst diesen Ordner einmal.

Führe bei einem installierten Plugin diese Befehle aus, danach `/reload-plugins` und `/blinkling:blinkling` in Claude Code. Prüfe, dass Plugin-Liste und Erweiterungskarte die Version **2.1.0** zeigen.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## Beim Lesen

- **Frage nach dem, was unter dem Zeiger liegt.** Halte Strg gedrückt und klicke auf etwas, oder ziehe einen Bereich auf. Er fliegt in Blink hinein, und der Mini-Composer öffnet sich. Enter sendet.
- **Sprich mit Blink.** Klicke auf Blink, um die letzte Unterhaltung im Mini-Composer fortzusetzen. Eine lange Nachricht oder Umschalt+Enter öffnet den vollständigen Composer.
- **Antworten als Sprechblasen.** Sie zeigen auf das, wovon sie sprechen. Drehe das Mausrad über Blink, um frühere zu lesen.
- **Das Menü.** Fahre mit dem Zeiger über Blink, um es zu öffnen: Aufnahme, Führung, automatisch erklären und Einstellungen. Eine Führung nummeriert ihre Schritte auf der Seite und lässt sich als Markdown speichern. Automatisch erklären ist standardmäßig aus, fügt höchstens zwei Sprechblasen hinzu und zeichnet nie Markierungen.
- **Browser-Helfer (optional).** Sein Popup in der Symbolleiste zeigt, was verbunden ist, und hat eine Schaltfläche **Wake Blink**. Er lässt Blink die Seitenstruktur lesen, eine ganze Seite aufnehmen, eine Seite an Ort und Stelle übersetzen und PDFs in einem Reader öffnen.

Für die Aufnahme gibt es außerdem einen globalen Hotkey, Strg+Umschalt+S (Cmd unter macOS), den du in den Einstellungen ändern kannst.

## Datenschutz

Blink fragt das Claude Code, bei dem du auf diesem Computer angemeldet bist, und nichts wird aufgenommen, bevor du es verlangst. Keine Telemetrie und kein vom Herausgeber betriebener Antwortdienst. Gewählter Kontext und Aufnahmen gehen an Claude Code und seinen Anbieter; die Bedingungen und Nutzungsgebühren des Anbieters gelten. Der Helfer spricht nur mit der Bridge auf `127.0.0.1` und liest nie Passwortfelder oder Eingabewerte. Automatisch erklären bleibt aus, bis du es einschaltest.

[Datenschutzdetails](docs/SECURITY.md) | [Nutzung](docs/USAGE.md) | [Funktionen](docs/FEATURES.md) | [Versionshinweise](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

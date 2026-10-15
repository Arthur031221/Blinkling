<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Die Antwort bleibt neben der Seite.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vom alten Plugin? Führe `/plugin uninstall glimpselet@glimpselet` und `/plugin marketplace remove glimpselet` aus und installiere dann Blinkling mit den Schritten unten.

Ein kleines schwebendes Claude Code-Chatfenster. Stelle Fragen zur Seite, erfasse einen Bereich, folge einer Anleitung oder übersetze einen Abschnitt.

> [!TIP]
> Du brauchst dein eigenes angemeldetes Claude Code-Konto und Chrome oder Edge auf dem Desktop. Für Claude Code ist kein API-Schlüssel nötig.

![Google Flights: eine Seitenführung, danach eine Frage zur Buchung eines Hin- und Rückflugs.](assets/demo.gif)

_Google Flights: eine Seitenführung, danach eine Frage zur Buchung eines Hin- und Rückflugs._

## Installation

1. Installiere das Plugin in Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Öffne die Willkommensanleitung:

   ```text
   /blinkling:blinkling
   ```

3. Aktiviere den **Entwicklermodus** unter `chrome://extensions` (oder `edge://extensions`). Wähle **Load unpacked** und den Ordner, den **Show in Files / Finder** öffnet. Die Willkommensseite verbindet sich automatisch. Klicke danach in der Symbolleiste auf die Blink-Schaltfläche, um zu sehen, dass sie verbunden ist.

> [!NOTE]
> Der Browser-Helfer ist optional: Blink funktioniert ohne ihn in jedem Fenster. Für Chrome oder Edge führst du `/blinkling:install` aus und lädst `~/Blinkling-extension` wie in Schritt 3. [Details zu Installation und Update](docs/INSTALL.md).

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

Beide Versionsprüfungen sollten `2.1.0` ausgeben. Die Plugin-Liste sollte `blinkling@inline` mit Version `2.1.0` als für diese Sitzung aktiviert anzeigen. Der letzte Befehl öffnet Claude Code. Führe dort `/blinkling:blinkling` aus, um die Willkommensanleitung zu öffnen. `--plugin-dir` lädt diesen Checkout nur für diese Sitzung. Verwende die Option bei jedem Start und starte Claude Code nach einem erneuten `npm run build:plugin` neu. Die erstellte Erweiterung liegt in `dist-extension`. Die Willkommensanleitung kopiert sie in den festen Ordner unten.

Die Plugin-Details müssen auch die Skills `blinkling` und `install` sowie den MCP-Server `blinkling` enthalten. Die verpackte Erweiterung liegt in `bin/extension`. Auch ihre Version muss **2.1.0** sein. Läuft Claude Code auf einem entfernten Rechner, nutze den SSH-Befehl der Anleitung, lade die Erweiterungs-ZIP auf dem Computer mit dem Browser herunter und lade dort den entpackten Ordner.

Wenn Browser und Claude Code auf demselben Computer laufen, kopiert die Willkommensanleitung die gebaute Erweiterung in den festen Ordner `~/Blinkling-extension`. Öffne in Chrome oder Edge `chrome://extensions` oder `edge://extensions`, aktiviere den **Entwicklermodus**, wähle **Entpackte Erweiterung laden** und dann diesen Ordner. Der Entwicklermodus-Hinweis bleibt sichtbar. Neue Versionen musst du manuell aktualisieren.

Schließe zum Aktualisieren einer entpackten Erweiterung die alte Bubble und führe `/blinkling:blinkling` erneut aus, um den festen Ordner zu aktualisieren. Klicke auf der Erweiterungskarte auf Neu laden. Bei einem entfernten Claude-Code-Host lade die neue ZIP über die Anleitung herunter, ersetze die entpackten Dateien auf dem Browser-Computer und lade die Erweiterung neu. Beim Wechsel zu `~/Blinkling-extension` entferne die alte Erweiterungskarte und lade diesen Ordner einmal.

Führe für ein installiertes Plugin diese Befehle aus, dann `/reload-plugins` und `/blinkling:blinkling` in Claude Code. Prüfe **2.1.0** in der Plugin-Liste und auf der Erweiterungskarte, bevor du die Bubble neu öffnest.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## Beim Lesen

- **Halte Strg gedrückt und klicke** auf einen Absatz, eine Schaltfläche oder ein Bild auf dem Bildschirm: Blink nimmt es auf und fragt Claude Code dazu. **Halte Strg und ziehe**, um stattdessen einen Bereich aufzunehmen.
- Ein kleines Eingabefeld öffnet sich mit drei Schnellfragen. Enter sendet die markierte. Klicke jederzeit auf Blink, um das Gespräch fortzusetzen.
- Antworten erscheinen als Blasen, die auf das zeigen, worüber sie sprechen. Das Menü von Blink bietet Aufnahme, Führung, Automatisch erklären (aus, bis du sie einschaltest) und Einstellungen.
- Der optionale Browser-Helfer für Chrome oder Edge liefert die eigene Struktur der Seite, damit Blink weiß, auf welchen Absatz oder welche Schaltfläche du gezeigt hast, dazu eine Aufnahme der ganzen Seite, Übersetzung der Seite an Ort und Stelle und einen PDF-Reader. Seine Symbolleistenschaltfläche zeigt, ob er verbunden ist, und weckt Blink. Ohne ihn funktioniert Blink weiterhin in jedem Fenster.

## Tastenkürzel

| Tastenkürzel                      | Aktion                                      |
| --------------------------------- | ------------------------------------------- |
| Strg + Klick                      | Nach dem fragen, was unter dem Zeiger liegt |
| Strg + Ziehen                     | Einen Bereich aufnehmen                     |
| Tastenkürzel in den Einstellungen | Aufnahme-Overlay öffnen                     |

Die Tasten wählst du in den Einstellungen.

## Sitzungen und Datenschutz

Blink sendet, was du ausgewählt hast, an dein eigenes angemeldetes Claude Code und zeigt die Antwort neben dem Gegenstand, um den es geht. Verwende dasselbe Gespräch nicht gleichzeitig in einem Terminal.

> [!IMPORTANT]
> Der Browser-Helfer liest eine Seite nur, wenn du darauf zeigst. Passwort- und Zahlungsfelder werden nie gelesen, und er spricht nur mit Blinkling auf deinem eigenen Rechner. Automatisch erklären bleibt aus, bis du es einschaltest.

Keine Telemetrie und kein vom Herausgeber betriebener Antwortdienst. Was du auswählst, geht an dein Claude Code; es gelten die Bedingungen und Nutzungsgebühren des Anbieters. Browsereinstellungen, Erweiterungsshops und der eingebaute PDF-Viewer des Browsers sind geschützte Seiten: Dort antwortet Blink anhand des Bildschirms. [Datenschutz](docs/SECURITY.md) | [Nutzung](docs/USAGE.md) | [Versionshinweise](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

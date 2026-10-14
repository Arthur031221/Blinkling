<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Die Antwort bleibt neben der Seite.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vom alten Plugin? Führe `/plugin uninstall glimpselet@glimpselet` und `/plugin marketplace remove glimpselet` aus und installiere dann Blinkling mit den Schritten unten.

Ein kleines schwebendes Claude Code-Chatfenster. Stelle Fragen zur Seite, erfasse einen Bereich, folge einer Anleitung oder übersetze einen Abschnitt.

> [!TIP]
> Du brauchst dein eigenes angemeldetes Claude Code-Konto und Chrome oder Edge auf dem Desktop. Für Claude Code ist kein API-Schlüssel nötig.

![Google Flights: eine Seitenführung, danach eine Frage zur Buchung eines Hin- und Rückflugs.](assets/demo.gif)

_Google Flights: eine Seitenführung, danach eine Frage zur Buchung eines Hin- und Rückflugs._

## Installation

Du brauchst Claude Code, angemeldet. Dann:

1. Füge diese Zeile in ein Terminal ein und drücke Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Führe in Claude Code aus:

   ```text
   /blinkling:blinkling
   ```

3. Erlaube auf dem Mac einmalig **Bildschirmaufnahme** für Blinkling: Systemeinstellungen, Datenschutz & Sicherheit.

> [!NOTE]
> In Windows PowerShell 5 nimm `;` statt `&&`. Animierte Schritte für deinen Rechner: [Installationsanleitung](https://arthur031221.github.io/Blinkling/install/). Weitere Wege, Updates und die Linux-Sandbox: [docs/INSTALL.md](docs/INSTALL.md).

## Beim Lesen

- **Bildschirm aufnehmen** oder **Bereich wählen**. Halte Shift und ziehe auf einer unterstützten Seite oder in der Bubble. Enter bestätigt, Esc bricht ab. Bei Bildschirmaufnahmen verschwindet die Bubble und kehrt anschließend zurück.
- **Diese Seite erklären** zeigt eine Übersicht und führt mit Weiter/Zurück durch Lesebereiche und Bedienelemente.
- Markiere Text zum Fragen, Erklären oder Übersetzen. Übersetze eine Seite mit Wiederherstellung oder öffne ein PDF im integrierten Reader.
- **Automatisch erklären** schlägt bis zu drei Fragen vor und fasst Änderungen zusammen. Alt+P pausiert. Wähle Opus, Sonnet oder Haiku für den Chat.

![arXiv: Abstract markieren, eine Frage stellen und ins traditionelle Chinesisch übersetzen.](assets/arxiv.gif)

_arXiv: Abstract markieren, eine Frage stellen und ins traditionelle Chinesisch übersetzen._

Mit der echten Erweiterung auf Live-Websites und Antworten von Claude Code aufgenommen. Wartezeiten sind gekürzt. Seiteninhalte und Antworten sind unverändert.

## Tastenkürzel

| Tastenkürzel | Aktion                            |
| ------------ | --------------------------------- |
| Alt+Shift+G  | Bubble öffnen                     |
| Ctrl+Shift+S | Im Browser zuschneiden            |
| Ctrl+Shift+7 | Aus einer anderen App zuschneiden |

Auf macOS ersetzt Cmd die Ctrl-Taste. Anpassen unter `chrome://extensions/shortcuts`. Shift funktioniert nur auf unterstützten Seiten und in der Bubble.

## Sitzungen und Datenschutz

Blinkling nutzt einen bestätigten Live-Kanal von Claude Code, sonst setzt ein separater Prozess das neueste gespeicherte Projektgespräch fort. Arbeite nicht gleichzeitig im Terminal an demselben Verlauf. [Kanal und Grenzen](docs/DESIGN.md#the-running-claude-code-conversation).

> [!IMPORTANT]
> Automatisch erklären fasst Seitenänderungen **ohne Bildschirmfreigabe** nach Zustimmung und Seitenfreigabe zusammen. Passwortfelder und die Sperrliste pausieren automatische Seitenzusammenfassungen und Vorschläge. Bildschirmzusammenfassungen verwenden einen geteilten Browser-Tab, der mit demselben geprüften Tab verbunden ist, und dieselben Prüfungen. Ein geteilter Monitor oder eine App braucht **eine separate Zustimmung für jede Freigabe**. Passwortfelder und gesperrte Websites lassen sich in diesen Pixeln nicht prüfen. Unbekannte Quellen bleiben pausiert.
> Ladende oder unzugängliche eingebettete Seiten pausieren automatische Seitenanfragen ebenfalls.

Keine Telemetrie und kein Antwortdienst des Herausgebers. Gewählter Kontext und Aufnahmen gehen an dein Backend. Dessen Bedingungen und Nutzungskosten gelten. Native Apps liefern nur Pixel. Browsereinstellungen, Erweiterungsstores und geschützte Seiten sperren Seitenwerkzeuge. Das native Fenster hat Browsergrenzen für Transparenz und Klickdurchleitung. [Datenschutz](docs/SECURITY.md) | [Nutzung](docs/USAGE.md) | [Versionshinweise](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

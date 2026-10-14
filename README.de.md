<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br />Blinkling</h1>

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

3. Aktiviere den **Entwicklermodus** unter `chrome://extensions` (oder `edge://extensions`). Wähle **Load unpacked** und den Ordner, den **Show in Files / Finder** öffnet. Die Willkommensseite verbindet sich automatisch. Öffne die Bubble.

> [!NOTE]
> Lokal öffnet **Try without installing** ein separates Chromium-Profil. Bei einem entfernten Host führst du den angezeigten SSH-Befehl auf dem Browser-Rechner aus. [Installation und Updates](docs/INSTALL.md).

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

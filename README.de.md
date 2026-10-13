# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

Ein kleiner schwebender Chat, mit dem du Claude Code Fragen zur geöffneten Seite oder zum Bildschirm stellen kannst. Lies und übersetze Webseiten, lass dir Bedienelemente zeigen und erfasse einen Bereich für eine Frage.

|           Schwebender Glimpselet-Chat           |                 Beispiel für eine Anleitung auf der Seite                  |
| :---------------------------------------------: | :------------------------------------------------------------------------: |
| ![Schwebender Glimpselet-Chat](assets/demo.gif) | ![Beispiel für eine Anleitung auf der Seite](assets/screenshots/guide.png) |

Voraussetzungen: eine aktuelle Claude-Code-Version, Anmeldung mit deinem eigenen Abo-Konto und ein Chromium-Desktopbrowser wie Chrome oder Edge.

Glimpselet verbindet sich mit einer bestätigten Live-Sitzung von Claude Code, wenn sie verfügbar ist. Andernfalls setzt es automatisch die neueste Unterhaltung im aktuellen Projekt fort oder beginnt eine neue, wenn keine gespeichert ist. [Sitzungen einrichten und Grenzen](docs/DESIGN.md#the-running-claude-code-conversation).

## Installation

1. Füge in Claude Code den Marketplace hinzu und installiere das Plugin:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. Prüfe im Terminal, dass `claude plugin list` Glimpselet **2.0.0** anzeigt, und führe dann `/glimpselet:glimpse` in Claude Code aus.

3. Die Willkommensseite hat drei Schritte: Erweiterung installieren, automatisch verbinden und die Blase öffnen. Wähle auf einem lokalen Desktop **Ohne Installation ausprobieren** oder lade die Erweiterung in deinem Browser. Läuft Claude Code auf einem entfernten Host, führe den im Terminal angezeigten SSH-Befehl auf dem Browsercomputer aus und lade dort die ZIP herunter und die Erweiterung daraus. Die Blase zeigt **Mit deinem Claude Code verbunden**. Siehe die [Verbindungsdetails](docs/INSTALL.md).

### Erweitert: aus dem Quellcode laden

Um das Plugin aus dem Quellcode zu starten, brauchst du Node.js 22+ und eine aktuelle Claude-Code-Version. Wenn dein Terminal bereits im Stammordner eines vorhandenen Checkouts ist, überspringe die ersten beiden Befehle. Führe im Terminal diese Befehle aus:

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Glimpselet
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details glimpselet
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

Beide Versionsprüfungen sollten `2.0.0` ausgeben. Die Plugin-Liste sollte `glimpselet@inline` mit Version `2.0.0` als für diese Sitzung aktiviert anzeigen. Der letzte Befehl öffnet Claude Code. Führe dort `/glimpselet:glimpse` aus, um die Willkommensanleitung zu öffnen. `--plugin-dir` lädt diesen Checkout nur für diese Sitzung. Verwende die Option bei jedem Start und starte Claude Code nach einem erneuten `npm run build:plugin` neu. Die erstellte Erweiterung liegt in `dist-extension`. Die Willkommensanleitung kopiert sie in den festen Ordner unten.

Die Plugin-Details müssen auch die Skills `glimpse` und `install` sowie den MCP-Server `glimpselet` enthalten. Die verpackte Erweiterung liegt in `bin/extension`. Auch ihre Version muss **2.0.0** sein. Läuft Claude Code auf einem entfernten Rechner, nutze den SSH-Befehl der Anleitung, lade die Erweiterungs-ZIP auf dem Computer mit dem Browser herunter und lade dort den entpackten Ordner.

Wenn Browser und Claude Code auf demselben Computer laufen, kopiert die Willkommensanleitung die gebaute Erweiterung in den festen Ordner `~/Glimpselet-extension`. Öffne in Chrome oder Edge `chrome://extensions` oder `edge://extensions`, aktiviere den **Entwicklermodus**, wähle **Entpackte Erweiterung laden** und dann diesen Ordner. Der Entwicklermodus-Hinweis bleibt sichtbar. Neue Versionen musst du manuell aktualisieren.

Schließe zum Aktualisieren einer entpackten Erweiterung die alte Bubble und führe `/glimpselet:glimpse` erneut aus, um den festen Ordner zu aktualisieren. Klicke auf der Erweiterungskarte auf Neu laden. Bei einem entfernten Claude-Code-Host lade die neue ZIP über die Anleitung herunter, ersetze die entpackten Dateien auf dem Browser-Computer und lade die Erweiterung neu. Beim Wechsel zu `~/Glimpselet-extension` entferne die alte Erweiterungskarte und lade diesen Ordner einmal.

## Glimpselet schon installiert?

Führe diese Befehle im Terminal auf dem Computer aus, auf dem Claude Code läuft. Das Aktualisieren des Marketplace-Katalogs allein garantiert kein Update des installierten Plugins.

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

Führe in deiner offenen Claude-Code-Sitzung `/reload-plugins` aus (oder starte Claude Code neu), danach `/glimpselet:glimpse`. Die Liste muss `glimpselet@glimpselet` mit **2.0.0** zeigen und der Befehl die Begrüßungs- und Kopplungsanleitung öffnen. Prüfe auch **2.0.0** unter `chrome://extensions` oder `edge://extensions` auf dem Browser-Computer. Bleibt das Plugin bei 1.1.1, ist v2 möglicherweise noch nicht im öffentlichen Marketplace verfügbar. Die alte Bildschirm-Auswahlseite ist keine v2-Begrüßung. [Update prüfen](docs/DESIGN.md#plugin-upgrades-and-release-verification).

## Was du damit tun kannst

- Streame Chat-Antworten und stelle Rückfragen mit Opus, Sonnet oder Haiku.
- Erfasse einen geteilten Bildschirm in der Vollbildansicht oder schneide mit dem Seiten-Overlay einen Bereich aus. Halte Shift gedrückt und ziehe. Drücke dann Enter zum Erfassen oder Esc zum Abbrechen.
- Erhalte Vorschlagsfragen, die sich mit der Seite aktualisieren.
- Aktiviere optional Passive-Zusammenfassungen, pausiere sie mit Alt+P und sieh die Kosten pro Stunde.
- Lass dir eine Anleitung direkt über den tatsächlichen Bedienelementen der Seite anzeigen. Übersetze Text an Ort und Stelle und stelle ihn mit Restore wieder her.
- Markiere Text, um ihn zu erklären, zu übersetzen oder dazu zu fragen. Öffne PDFs im mitgelieferten Reader und stelle Fragen dazu.

![Diese Seite erklären](assets/guide.gif)

![Ausgewählter Bereich](assets/crop.gif)

| Tastenkombination                    | Aktion                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Alt+Shift+G                          | Glimpselet öffnen und **Float** wählen, um den schwebenden Chat zu öffnen.            |
| Ctrl+Shift+S (auf macOS Cmd+Shift+S) | Aktuelle Seite oder geteilten Bildschirm zuschneiden.                                 |
| Ctrl+Shift+7 (auf macOS Cmd+Shift+7) | Aus einer beliebigen App zuschneiden. Unter `chrome://extensions/shortcuts` änderbar. |
| Shift gedrückt halten                | In einer Glimpselet-Blase oder -Seite einen Zuschnitt starten.                        |
| Alt+P                                | Passive-Zusammenfassungen pausieren.                                                  |

Auf macOS öffnet Cmd+Shift+5 das Screenshot-Werkzeug. Shift funktioniert auf Webseiten, auf denen Glimpselet Seitenzugriff hat. Andere Apps können die Taste nicht an Glimpselet weitergeben.

**Float** ist die erste Aktion. Die Erweiterung fragt nach Seitenzugriff, wenn du eine Funktion verwendest, die ihn benötigt. Mit deiner eigenen angemeldeten Claude-Code-Sitzung ist kein API-Schlüssel nötig. Der direkte API-Modus ist optional und erfordert deinen eigenen API-Schlüssel.

## Claude-Code-Sitzungen

Befehl und Einrichtung für die Channel-Vorschau findest du unter [Claude-Code-Sitzungen](docs/DESIGN.md#the-running-claude-code-conversation). Ohne Channel kann Glimpselet die neueste Sitzung im aktuellen Projekt automatisch in einem separaten Prozess fortsetzen. Das ist eine parallele Fortsetzung. Verwende dieselbe Sitzung nicht gleichzeitig im Terminal, da parallele Zugriffe zu Konflikten führen können.

## Grenzen und Datenschutz

Glimpselet funktioniert in Desktop-Browsern auf Chrome, Edge und anderen Chromium-Browsern. Der Entwicklermodus-Hinweis bleibt sichtbar, bis eine Store-Verteilung verfügbar ist. Updates erfolgen manuell. Manche Browserseiten wie Einstellungen, Erweiterungsstores und eingeschränkte Seiten sind nicht zugänglich. Der integrierte PDF-Viewer von Chrome ist nicht zugänglich. Verwende den Glimpselet-Reader. Native Apps liefern nur Bildpunkte, keinen Seitentext und keine Overlays. Shift funktioniert in der Blase und auf Seiten mit erteiltem Zugriff. In anderen Apps nutze das globale Tastenkürzel zum Zuschneiden. Das schwebende Fenster kann Klicks nicht durchlassen.

Automatische Vorschlagsfragen verwenden Seitenkontext nur mit deiner Zustimmung. Für Seitenzusammenfassungen ohne Bildschirmfreigabe öffne eine Seite, aktiviere **Passive** und erlaube Glimpselet den Zugriff auf diese Website, wenn du gefragt wirst. Glimpselet prüft den Seitentext und kann Änderungen am Inhalt oder der URL zusammenfassen. Passwortfelder und Websites auf der Sperrliste pausieren automatische Zusammenfassungen und Vorschlagsfragen.

Während der Bildschirmfreigabe benötigen automatische Zusammenfassungen von Bildänderungen einen geteilten Browser-Tab, der demselben geprüften Tab zugeordnet ist, mit Seitenzugriff und denselben Datenschutzprüfungen. Bei Fenstern, ganzen Bildschirmen, nativen Apps, unbekannten oder nicht zugänglichen Quellen pausieren automatische Zusammenfassungen. Manuelle Fragen und Aufnahmen bleiben verfügbar.

[Installationsanleitung](docs/INSTALL.md) | [Nutzung](docs/USAGE.md) | [Design](docs/DESIGN.md) | [Datenschutzdetails](docs/SECURITY.md)

Assisted by Claude/Codex.

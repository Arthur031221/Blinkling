# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

Ein kleiner schwebender Chat, mit dem du Claude Code Fragen zur geöffneten Seite oder zum Bildschirm stellen kannst. Lies und übersetze Webseiten, lass dir Bedienelemente zeigen und erfasse einen Bereich für eine Frage.

|           Schwebender Glimpselet-Chat           |                 Beispiel für eine Anleitung auf der Seite                  |
| :---------------------------------------------: | :------------------------------------------------------------------------: |
| ![Schwebender Glimpselet-Chat](assets/demo.gif) | ![Beispiel für eine Anleitung auf der Seite](assets/screenshots/guide.png) |

Voraussetzungen: eine aktuelle Claude-Code-Version, Anmeldung mit deinem eigenen Abo-Konto und ein Chromium-Desktopbrowser wie Chrome oder Edge.

Glimpselet beginnt eine eigene Unterhaltung. Alternativ können Sie eine aktuelle Claude Code Sitzung in einem separaten Prozess fortsetzen. Um Anfragen an die bereits im Terminal geöffnete interaktive Sitzung zu senden, aktivieren Sie die Channel Vorschau. [Channel Einrichtung](docs/DESIGN.md#the-running-claude-code-conversation).

## Installation

1. Füge in Claude Code den Marketplace hinzu und installiere das Plugin:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. Prüfe im Terminal, dass `claude plugin list` Glimpselet **2.0.0** anzeigt, und führe dann `/glimpselet:glimpse` in Claude Code aus.

3. Folge der Willkommensanleitung, um deinen Browser zu verbinden. Wähle auf einem lokalen Desktop **Try without installing** oder lade die Erweiterung in deinem eigenen Browser und kopple sie. Bei einem entfernten Claude-Code-Host führe den angezeigten SSH-Befehl auf dem Computer mit deinem Browser aus. Lade dort die ZIP-Datei herunter und lade die Erweiterung in diesem Browser. Die Option ohne Installation ist auf dem entfernten Host nicht verfügbar. Nach erfolgreicher Kopplung zeigt das Glimpselet-Panel den Verbindungsmodus und das Projekt an.

### Erweitert: aus dem Quellcode laden

Für deinen eigenen Desktop-Browser liegt die Erweiterung dauerhaft im Ordner `~/.glimpselet/extension`. Öffne in Chrome oder Edge `chrome://extensions` oder `edge://extensions`, aktiviere den **Entwicklermodus**, wähle **Entpackte Erweiterung laden** und dann diesen Ordner. Der Entwicklermodus-Hinweis bleibt sichtbar. Neue Versionen musst du manuell aktualisieren.

## Von v1 aktualisieren

Wenn Glimpselet bereits installiert ist, aktualisiere den Marketplace und das Plugin im Terminal:

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

Starte Claude Code neu oder führe `/reload-plugins` in der offenen Sitzung aus. Prüfe, dass `claude plugin list` Glimpselet **2.0.0** anzeigt, und starte dann erneut `/glimpselet:glimpse`. Die Willkommens- und Verbindungsanleitung sollte sich öffnen. Bleibt die Version bei 1.x, ist v2 möglicherweise noch nicht an der Marketplace-Quelle veröffentlicht. Erneutes Installieren aktualisiert kein zwischengespeichertes Plugin.

Bei einer entpackten Erweiterung kopiert die Anleitung die neuen Dateien nach `~/.glimpselet/extension`. Lade Glimpselet unter `chrome://extensions` oder `edge://extensions` neu und prüfe die Version **2.0.0**. Lade bei SSH die neue ZIP-Datei über die Anleitung auf den Computer mit deinem Browser herunter, entpacke sie in den zuvor geladenen Ordner und lade die Erweiterung neu. Der entfernte Host kann den Browser ohne Installation nicht auf deinem Computer öffnen.

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

Auf macOS öffnet Cmd+Shift+5 das Screenshot-Werkzeug. Shift auf Webseiten funktioniert nur auf Glimpselet-Seiten und kann keine anderen Apps erfassen.

**Float** ist die erste Aktion. Die Erweiterung fragt nach Seitenzugriff, wenn du eine Funktion verwendest, die ihn benötigt. Mit deiner eigenen angemeldeten Claude-Code-Sitzung ist kein API-Schlüssel nötig. Der direkte API-Modus ist optional und erfordert deinen eigenen API-Schlüssel.

## Claude-Code-Sitzungen

Befehl und Einrichtung für die Channel-Vorschau findest du unter [Claude-Code-Sitzungen](docs/DESIGN.md#the-running-claude-code-conversation). Ohne Channel kann Glimpselet eine ausgewählte Sitzung in einem separaten Prozess fortsetzen. Das ist eine parallele Fortsetzung. Verwende dieselbe Sitzung nicht gleichzeitig im Terminal, da parallele Zugriffe zu Konflikten führen können.

## Grenzen und Datenschutz

Glimpselet funktioniert in Desktop-Browsern auf Chrome, Edge und anderen Chromium-Browsern. Der Entwicklermodus-Hinweis bleibt sichtbar, bis eine Store-Verteilung verfügbar ist. Updates erfolgen manuell. Manche Browserseiten wie Einstellungen, Erweiterungsstores und eingeschränkte Seiten sind nicht zugänglich. Der integrierte PDF-Viewer von Chrome ist nicht zugänglich. Verwende den Glimpselet-Reader. Native Apps liefern nur Bildpunkte, keinen Seitentext und keine Overlays. Umschalt funktioniert nur in Glimpselets eigenen Browseroberflächen, nicht in einer anderen App. Das schwebende Fenster kann Klicks nicht durchlassen.

Automatische Vorschlagsfragen verwenden Seitenkontext nur mit deiner Zustimmung. Passive Zusammenfassungen sind optional und benötigen einen geteilten, geprüften Browser-Tab. Bei Fenstern, Bildschirmen, nativen Apps, unbekannten oder anderweitig nicht zugänglichen Quellen pausieren automatische Zusammenfassungen. Manuelle Fragen und Aufnahmen bleiben verfügbar.

[Installationsanleitung](docs/INSTALL.md) | [Nutzung](docs/USAGE.md) | [Design](docs/DESIGN.md) | [Datenschutzdetails](docs/SECURITY.md)

Assisted by Claude/Codex.

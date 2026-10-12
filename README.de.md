# Glimpselet

Glimpselet ist ein kleiner Chat, der über anderen Fenstern bleibt und eine Verbindung zu einer bestehenden Claude-Code-Sitzung herstellt. Er kann zugängliche Webseiten lesen und übersetzen, Hinweise direkt auf der Seite einzeichnen und Seitenbereiche oder Bildschirmaufnahmen für Fragen erfassen.

![Schwebender Glimpselet-Chat](assets/demo.gif)

![Hinweiskreise direkt auf der echten Webseite](assets/screenshots/guide.png)

[Statische Demo öffnen](https://arthur031221.github.io/Glimpselet/). Sie verwendet ein Beispielbild und eine aufgezeichnete Antwort und sendet keine Anfrage an einen Anbieter.

## Installation

Installiere das Glimpselet-Plugin in Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Führe `/glimpse` aus und folge der Einrichtungsanleitung. Sie ist die maßgebliche Quelle für Installation und Kopplung.

### Erweitert: aus dem Quellcode laden

1. Öffne `chrome://extensions` in Chrome oder Edge und aktiviere den **Entwicklermodus**.
2. Wähle **Entpackte Erweiterung laden**.
3. Wähle den von der Einrichtungsanleitung erstellten Erweiterungsordner aus.
   > **Entwicklermodus:** Glimpselet wird derzeit im Entwicklermodus verteilt. Bis es einen Store-Eintrag gibt, müssen Updates manuell installiert werden.

## Erfassen und Tastenkürzel

Halte Umschalt in der schwebenden Blase oder auf einer zugänglichen Webseite gedrückt, um einen Bereich auszuwählen. Umschalt funktioniert nicht in anderen Apps. Auf Webseiten erfolgt die Auswahl direkt über der Seite. Bei der Bildschirmfreigabe wird das Bild eingefroren und zum Zuschneiden im Vollbild geöffnet. Enter bestätigt, Esc bricht ab.

Das Browser-Kürzel ist Ctrl+Shift+S (auf dem Mac Cmd+Shift+S). Es startet den Zuschnitt im Browser. Das separate globale Kürzel ist standardmäßig Strg+Umschalt+5, da Chrome für globale Kürzel eine Zahl verlangt. Du kannst es unter `chrome://extensions/shortcuts` ändern, auch auf S.

## Claude-Code-Sitzungen

Die dokumentierte MCP-Channel-Unterstützung kann Nachrichten an eine bereits laufende Claude-Code-Sitzung senden. Glimpselet zeigt Antworten aus den Chunks des Antwort-Tools im Channel an. Modell und Berechtigungen legt weiterhin die Sitzung im Terminal fest. Für den benutzerdefinierten Glimpselet-Channel musst du die Sitzung mit aktiviertem Entwicklungs-Channel neu starten und anschließend `/glimpse` ausführen:

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

Ohne Channel kann Glimpselet dieselbe Sitzung mit `claude --resume SESSION_ID -p` in einem separaten Print-Modus-Prozess fortsetzen. Das ist eine parallele Fortsetzung. Führe sie nicht gleichzeitig mit dem Terminalprozess für dieselbe Sitzung aus. Gleichzeitiger Zugriff kann zu Konflikten führen.

## Einschränkungen

- Nur Chrome, Edge und andere Chromium-Browser.
- Interne Browserseiten wie `chrome://`, der Erweiterungsstore und manche verwalteten Seiten blockieren den Zugriff.
- Glimpselet kann nicht über nativen Apps zeichnen. Du kannst deren Bildschirm freigeben und zum Bild fragen, aber Seiten-Overlays und Textaktionen gibt es dort nicht.
- PDFs öffnest du im mitgelieferten Glimpselet-Reader. Der integrierte PDF-Viewer von Chrome ist keine zugängliche Seite.
- Die Document-Picture-in-Picture-API des Browsers unterstützt keine Klick-Durchlässigkeit. Daher kann das schwebende Fenster Klicks nicht an andere Apps weitergeben. Der Browser garantiert weder ein schwebendes Fenster noch das automatische Ausklappen. Lass die Erweiterungsseite geöffnet, solange du das Fenster nutzt.

## Datenschutz

Es wird keine Telemetrie erfasst. Mit deiner Zustimmung kann Seitentext zum Erstellen von Fragen gesendet werden. Fragen und optionale passive Zusammenfassungen können ebenfalls relevante Texte und Bilder senden. Frames bleiben im Arbeitsspeicher und werden nur bei Aufnahme- oder Frageanfragen an die Bridge gesendet. Im Bridge-Modus läuft die CLI auf dem Host und speichert dort Sitzungsprotokolle. Im direkten API-Modus sendet die Erweiterung Anfragen. API-Schlüssel und Bridge-Tokens bleiben im Sitzungsspeicher des Browsers. Einstellungen liegen im lokalen Browserspeicher. Details stehen unter [Sicherheit und Datenschutz](docs/SECURITY.md).

## Weitere Informationen

[Installation](docs/INSTALL.md) | [Nutzung](docs/USAGE.md) | [Design und Integration](docs/DESIGN.md) | [Store-Vorbereitung](docs/STORE.md) | [Versionshinweise](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.

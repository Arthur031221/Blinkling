<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, Glimpselets Begleiter"><br><strong>Glimpselet</strong><br><em>Blink wartet. Du wählst den Ausschnitt. Es antwortet.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> Stell deinem Coding-Assistenten in einem kleinen, schwebenden Fenster Fragen zu dem Bildschirm, den du teilst.

Geprüftes Ergebnis: 20/20 synthetische Bildschirm-Leseaufgaben bestanden, jede Antwort wurde vom Autor geprüft. Live-Lauf des gebündelten Plugins mit CLI Haiku. Median: 2,609 s, p95: 3,263 s. [Ergebnisse und Methode](assets/benchmark.json).

| Vorher                        | Nachher                                               |
| ----------------------------- | ----------------------------------------------------- |
| Ein Bildschirm voller Details | Bild einfrieren, zuschneiden oder abdecken und fragen |

Installiere das Plugin mit zwei Slash-Befehlen:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Starte danach `/glimpselet:glimpse`. Node.js 22 oder neuer ist erforderlich. Eine Browser-Erweiterung gibt es nicht.

<p align="center"><img src="assets/demo.gif" width="800" alt="Demo mit einem beschrifteten Testbild und einer aufgezeichneten Antwort, kein Modellaufruf"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Statische Demo öffnen</a>  |  aufgezeichnetes Beispiel, keine Anfrage an einen Anbieter</p>

## Im Alltag

```text
/glimpselet:glimpse
Wähle im Browserdialog einen Bildschirm, ein Fenster oder einen Tab.
Friere ein Bild ein, schneide einen Bereich aus und decke Privates mit undurchsichtigen Masken ab.
Stelle eine Frage, lies die gestreamte Antwort und frage weiter.
Kopiere oder hefte die Antwort an und lösche danach die lokale Sitzung.
```

Das Bild bleibt auf deinem Rechner, bis du eine Frage stellst oder passive Notizen aktivierst. Undurchsichtige Masken verändern das gesendete Bild. Passive Notizen erfassen alle zwei Sekunden ein Bild und senden bei Änderungen eine Anfrage für eine kurze Beschreibung. Standardmäßig sind es höchstens sechs Anfragen pro rollender Minute, also maximal 360 pro Stunde. Das ist eine Anfragengrenze und keine Kostenangabe. Eine niedrigere Grenze ist möglich.

**Du entscheidest, wann du teilst, die Beobachtung startet nie von allein.**

## Einzelheiten

<details>
<summary>Installation und Start</summary>

Die beiden Befehle oben fügen das gebündelte Plugin hinzu und installieren es. `/glimpselet:glimpse` öffnet ein lokales Panel auf einem zufälligen Port. Der einmal nutzbare Link läuft nach 60 Sekunden ab, die Sitzung im Arbeitsspeicher dauert 30 Minuten. Wähle im Browserdialog einen Bildschirm, ein App-Fenster oder einen Tab.

</details>

<details>
<summary>Fragen, Nachfragen und Prüfen</summary>

Wähle den Modellalias `sonnet`, `opus` oder `haiku`. Fragen laufen über das installierte, eingeschränkte CLI oder optional über eine API-Anfrage der lokalen Bridge. Das eingeschränkte CLI entfernt gewöhnliche Kommandozeilenwerkzeuge, aber von Unternehmen verwaltete Hooks können weiterhin ausgeführt werden. Es ist daher keine Sandbox auf Betriebssystemebene. Du musst dem installierten CLI und den von deiner Organisation konfigurierten Richtlinien-Hooks vertrauen. Nachfragen können begrenzten jüngsten Kontext enthalten. Das Panel bietet Zuschneiden, Einfrieren, undurchsichtige Masken, Kopieren, Anheften, eine Zeitleiste der letzten zehn Minuten, Zusammenfassung und Markdown-Export. Die Zusammenfassung nutzt vorhandene passive Notizen und sendet kein neues Bild. **Clear** bricht laufende Jobs ab und entfernt lokale Bilder, Notizen, Verlauf und den API-Schlüssel im Arbeitsspeicher.

</details>

<details>
<summary>Schwebendes Fenster und Browser</summary>

Zum Öffnen des schwebenden Panels ist eine Benutzeraktion nötig. Chrome und Edge ab Version 116 können, sofern verfügbar, Document Picture-in-Picture verwenden. Wird diese Anfrage abgelehnt, klicke in einer zweiten Benutzeraktion auf **Open popup**, um ein normales Popup zu öffnen, das möglicherweise nicht über anderen Fenstern bleibt. Der Browser bestimmt die Position und kann die vorherige Position wiederverwenden. Dieser Tab merkt sich die kompakte oder erweiterte Größe. Berechtigungen und Auswahlmöglichkeiten unterscheiden sich je nach Browser und Betriebssystem.

</details>

<details>
<summary>Aus dem Quelltext entwickeln</summary>

Installiere Node.js 22 oder neuer und führe `npm ci`, `npm run build` und `npm run build:plugin` aus. Alle Prüfungen stehen im [Beitragsleitfaden](CONTRIBUTING.md). Die statische Demo nutzt ein Testbild und aufgezeichneten Text, sie fragt kein Modell an.

</details>

## Grenzen

Bei aktiver Browserfreigabe verwenden MCP-Aufnahmen diese Quelle. Wenn sie getrennt wird oder nicht antwortet, schlägt die Aufnahme fehl, ein natives Bild ohne Masken wird nicht ersatzweise verwendet. Nach einer Trennung bleibt die Freigabeabsicht bestehen, bis du die Freigabe ausdrücklich beendest, lokale Daten mit **Clear** löschst oder die Sitzung abläuft. Bis dahin wird keine native Aufnahme verwendet. Danach hängen native Aufnahmen von Plattformwerkzeugen und Systemberechtigungen ab: macOS unterstützt Bildschirm, Fenster und Bereich, Windows den Bildschirm, unter Linux hängt es von Wayland- oder X11-Werkzeugen ab. Ein Popup bleibt nicht garantiert immer im Vordergrund. Passwörter, Cursorpositionen und Fenstertitel lassen sich nicht zuverlässig erkennen. Prüfe jedes Bild vor dem Senden.

Das separate MCP-Werkzeug `screen_watch_start` nimmt seriell alle 5 bis 60 Sekunden Bilder auf, behält nur veränderte Bilder und ruft kein Modell auf. Es unterscheidet sich von den passiven Panel-Notizen, die alle zwei Sekunden erfassen und Beschreibungen anfordern.

[Nutzung](docs/USAGE.md) | [Installation](docs/INSTALL.md) | [Konfiguration](docs/CONFIGURATION.md) | [Architektur](docs/ARCHITECTURE.md) | [Sicherheit](docs/SECURITY.md) | [Plugin-Aufbau](docs/PLUGIN.md) | [Mitwirken](CONTRIBUTING.md) | [MIT-Lizenz](LICENSE)

## Disclosure

Assisted by Claude/Codex.

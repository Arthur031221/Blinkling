<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, Glimpselets Begleiter"><br><strong>Glimpselet</strong><br><em>Blink wartet. Du wählst den Ausschnitt. Es antwortet.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> Frag deinen Coding-Assistenten in einem kompakten schwebenden Fenster zu einem Bildschirm, den du auswählst. Friere ein Bild ein, schneide es zu, decke private Details ab und stelle deine Frage.

<p align="center"><img src="assets/demo.gif" width="800" alt="Testbild und aufgezeichnete Antwort im Glimpselet-Fenster"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Statische Demo öffnen</a>. Sie zeigt ein Testbild und eine aufgezeichnete Antwort. Es gibt keine Anbieteranfragen.</p>

<p align="center"><img src="assets/screenshots/light-420.png" width="49%" alt="Helles Design bei 420 px"><img src="assets/screenshots/dark-420.png" width="49%" alt="Dunkles Design bei 420 px"></p>

<details>
<summary>Alle sechs Größen und Designs</summary>

<p><img src="assets/screenshots/light-360.png" width="140" alt="Helles Bedienfeld 360 px"><img src="assets/screenshots/light-420.png" width="140" alt="Helles Bedienfeld 420 px"><img src="assets/screenshots/light-520.png" width="140" alt="Helles Bedienfeld 520 px"></p>
<p><img src="assets/screenshots/dark-360.png" width="140" alt="Dunkles Bedienfeld 360 px"><img src="assets/screenshots/dark-420.png" width="140" alt="Dunkles Bedienfeld 420 px"><img src="assets/screenshots/dark-520.png" width="140" alt="Dunkles Bedienfeld 520 px"></p>

</details>

Für den schwebenden Modus brauchst du einen Desktop-Browser auf Chromium-Basis. Halte Node.js 22 oder neuer und einen installierten Coding-Assistenten bereit.

Installiere das Plugin mit zwei Slash-Befehlen:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Starte danach `/glimpselet:glimpse`. Node.js 22 oder neuer ist erforderlich. Eine Browser-Erweiterung gibt es nicht.

## Im Alltag

```text
/glimpselet:glimpse
Wähle im Browserdialog einen Bildschirm, ein Fenster oder einen Tab.
Friere ein Bild ein, schneide einen Bereich aus und decke Privates mit undurchsichtigen Masken ab.
Stelle eine Frage, lies die gestreamte Antwort und frage weiter.
Kopiere oder hefte die Antwort an und lösche danach die lokale Sitzung.
```

Das Bild bleibt auf deinem Rechner, bis du eine Frage stellst oder passive Notizen aktivierst. Undurchsichtige Masken verändern das gesendete Bild. Passive Notizen erfassen alle zwei Sekunden ein Bild und senden bei Änderungen eine Anfrage für eine kurze Beschreibung. Standardmäßig sind es höchstens sechs Anfragen pro rollender Minute, also maximal 360 pro Stunde. Das ist eine Anfragengrenze und keine Kostenangabe. Eine niedrigere Grenze ist möglich.

MCP Bildschirmwerkzeuge geben Bilder auf Anfrage an die Programmiersitzung zurück. Aufnahmen aus dem Panel sind nach Zuschnitt und Abdeckung auf 1536 Pixel an der längsten Seite und 1,8 Millionen Pixel begrenzt. Kleinere ausgewählte Bereiche behalten ihre ursprüngliche Auflösung.

**Du entscheidest, wann du teilst, die Beobachtung startet nie von allein.**

## Einzelheiten

<details>
<summary>Bedienung und Status</summary>

Ziehe zum Ändern der Größe an den Fensterkanten oder nutze die Größensteuerung und Pfeiltasten. Im Zuschneide- oder Abdeckmodus verschieben die Pfeile die Auswahl, Umschalt plus Pfeiltasten ändern ihre Größe, Enter übernimmt sie und Escape bricht ab. Escape im Fragefeld pausiert passive Notizen und bricht die aktuelle Frage ab, ohne ihren Text zu löschen. Einstellungen öffnen sich in einem Dialog. Ältere Antworten lassen sich lösen. **Zuletzt gesendetes Bild** kennzeichnet das mit einer Frage gesendete Standbild. **Livevorschau anzeigen** kehrt ohne eine weitere Frage zur geteilten Bildschirmansicht zurück und behält Zuschnitt und Masken bei. **Passive Notizen pausieren** bricht den laufenden passiven Streaming-Auftrag ab und verhindert weitere Notizen, bis du sie fortsetzt. Die Tasten S/E/T/P funktionieren nur, wenn die Bildschirmvorschau fokussiert ist. Die Schaltflächen bleiben per Tastatur erreichbar. Beim Scrollen nach oben endet das Folgen einer gestreamten Antwort. Das Panel zeigt den Freigabe-, Modell- und Passivnotiz-Status.

Vergleichsantworten behalten Tabellenüberschriften und Spalten bei. Breite Tabellen lassen sich innerhalb der Antwort horizontal scrollen. Fokussiere die Antwort und nutze die Pfeiltasten, um weitere Spalten zu lesen.

</details>

<details>
<summary>Installation und Start</summary>

Die beiden Befehle oben fügen das gebündelte Plugin hinzu und installieren es. `/glimpselet:glimpse` öffnet ein lokales Panel auf einem zufälligen Port. Der einmal nutzbare Link läuft nach 60 Sekunden ab, die Sitzung im Arbeitsspeicher dauert 30 Minuten. Wähle im Browserdialog einen Bildschirm, ein App-Fenster oder einen Tab.

</details>

<details>
<summary>Fragen, Nachfragen und Prüfen</summary>

Fragen laufen über den installierten Coding-Assistenten oder optional über eine API-Anfrage der lokalen Bridge. Das eingeschränkte CLI entfernt gewöhnliche Kommandozeilenwerkzeuge, aber von Unternehmen verwaltete Hooks können weiterhin ausgeführt werden. Es ist daher keine Sandbox auf Betriebssystemebene. Du musst dem installierten CLI und den von deiner Organisation konfigurierten Richtlinien-Hooks vertrauen. Nachfragen können begrenzten jüngsten Kontext enthalten. Das Panel bietet Zuschneiden, Einfrieren, undurchsichtige Masken, Kopieren, Anheften, eine Zeitleiste der letzten zehn Minuten, Zusammenfassung und Markdown-Export. Die Zusammenfassung nutzt vorhandene passive Notizen und sendet kein neues Bild. **Clear** bricht laufende Jobs ab und entfernt lokale Bilder, Notizen, Verlauf und den API-Schlüssel im Arbeitsspeicher.

</details>

<details>
<summary>Schwebendes Fenster und Browser</summary>

Document Picture-in-Picture ist in unterstützten Desktop Chromium Browsern verfügbar. Der Browser bestimmt die Position dieses Fensters. Kompakte und erweiterte Maße, Popup-Position und Fensterrahmen werden über Bridge-Neustarts hinweg in einer lokalen Geometriedatei und im Browser-Cache gespeichert, sofern der Speicher verfügbar ist. Die Speicherorte stehen unter [Konfiguration](docs/CONFIGURATION.md).

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

<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink wohnt in der Ecke deines Bildschirms. Halte Ctrl, klicke auf etwas, bekomme die Antwort.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vom alten Plugin? Führe `/plugin uninstall glimpselet@glimpselet` und `/plugin marketplace remove glimpselet` aus und installiere dann Blinkling mit den Schritten unten.

Blinkling setzt Blink, einen kleinen grünen Begleiter, in die Ecke deines Bildschirms, über alle Apps. Halte Strg (auf dem Mac Control) gedrückt und klicke auf alles, wonach du fragen willst, oder ziehe einen Bereich auf. Die Auswahl fliegt in Blink hinein, du tippst deine Frage, und die Antwort öffnet sich in einer Chatkarte neben Blink.

Blinkling schaut nur hin und erklärt. Es klickt und tippt nie in deinen Apps.

Es nutzt das Claude Code, bei dem du auf diesem Computer schon angemeldet bist.

<p align="center">
<img src="assets/pick.webp" alt="Strg und Klick auf einen Absatz einer arXiv-Seite. Sein Schnappschuss fliegt in Blinks Mund, die Chatkarte öffnet sich und die Antwort läuft ein."><br>
Paper: Strg und Klick auf einen Absatz, dann die Antwort lesen.
</p>

<p align="center">
<img src="assets/translate.webp" alt="Auf einer arabischen Wikipedia-Seite geht ein gewählter Absatz in Blink, der Chip Übersetzen wird gedrückt und die Antwort erklärt den Absatz auf Englisch."><br>
Übersetzen: ein arabischer Absatz, auf Englisch erklärt.
</p>

<p align="center">
<img src="assets/tour.webp" alt="Auf einer dichten öffentlichen Webseite markiert die Anleitung die Teile der Seite. Blink hält einen Zeigestab auf den aktuellen Schritt, Weiter geht die Schritte durch."><br>
Anleitung: eine schwer bedienbare Seite, Schritt für Schritt.
</p>

## Installation

Du brauchst Claude Code, auf diesem Computer angemeldet. Unter Windows brauchst du außerdem Node.js 22 oder neuer von nodejs.org, das Blinkling nicht für dich herunterlädt. macOS und Linux brauchen sonst nichts.

Wenn du irgendetwas installiert hast, schließe das Terminal und öffne ein neues, damit es das neue Programm findet.

1. Füge diese Zeile in ein Terminal ein und drücke Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Starte Claude Code mit Blinks Kanal:

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   Das Flag lässt Blinks Chat und diese Terminal-Sitzung einander sehen. Claude Code bittet dich einmal um Bestätigung. Ohne das Flag funktioniert Blink weiter und antwortet aus seiner eigenen Sitzung.

   Führe danach in dieser Sitzung aus:

   ```text
   /blinkling:blinkling
   ```

3. Erlaube auf dem Mac Blinkling einmal die Bildschirmaufnahme, in den Systemeinstellungen unter Datenschutz & Sicherheit. macOS fragt außerdem einmal nach den Bedienungshilfen, damit die Strg-Taste eine Auswahl starten kann. Erlaube sie an derselben Stelle.

Hat ein Mac oder Linux-Rechner kein Node.js, holt Blinkling beim ersten Start eine eigene private Kopie. Sie ist etwa 45 MB groß und wird gegen eine festgelegte SHA-256 geprüft. Meldet Claude Code beim ersten Start, die Verbindung zu Blinkling sei fehlgeschlagen, warte eine Minute und führe `/mcp` aus.

> [!NOTE]
> In Windows PowerShell 5 führst du die beiden Befehle nacheinander aus, statt sie mit `&&` zu verbinden. Animierte Schritte für deinen Computer stehen in der [Installationsanleitung](https://arthur031221.github.io/Blinkling/install/). Weitere Installationswege, Updates und die Linux-Sandbox findest du in [docs/INSTALL.md](docs/INSTALL.md).

## Beim Lesen

- Halte Strg gedrückt und klicke auf einen Absatz, eine Schaltfläche oder ein Bild, dann nimmt Blink es mit.
- Halte Strg gedrückt und ziehe, um stattdessen einen Bereich aufzunehmen.
- Die Chatkarte öffnet sich neben Blink mit deiner Auswahl, drei schnellen Fragen und den Auswahlfeldern für Modell, Aufwand und Berechtigung. Enter sendet die markierte Frage.
- Klicke jederzeit auf Blink, um zu sprechen. Die Karte öffnet sich mit deinem bisherigen Gespräch.

![Klicke auf Blink, tippe eine Frage, und die Antwort läuft in die Chatkarte.](assets/ask.webp)

- Blinks Menü bietet Aufnahme, Guide, Automatisch erklären und Einstellungen. Die Automatisch erklären bleibt aus, bis du sie einschaltest.
- Der optionale Browser-Helfer für Chrome oder Edge gibt Blink die Struktur der Seite, sodass es weiß, auf welchen Absatz oder welche Schaltfläche du gezeigt hast. Dazu kommen die Aufnahme ganzer Seiten, Übersetzen direkt auf der Seite und ein PDF-Leser. Die Schaltfläche in der Symbolleiste zeigt, ob er verbunden ist, und weckt Blink auf. Ohne ihn funktioniert Blink in jedem Fenster.

## Tastenkürzel

| Tastenkürzel                      | Aktion                                                 |
| --------------------------------- | ------------------------------------------------------ |
| Strg + Klick                      | Nach dem fragen, was unter dem Zeiger liegt            |
| Strg + Ziehen                     | Einen Bereich aufnehmen                                |
| Tastenkürzel in den Einstellungen | Aufnahme-Overlay öffnen                                |
| Ctrl + Alt + Shift + B            | Blink beenden (auf dem Mac Ctrl + Option + Befehl + B) |

Die Tasten kannst du in den Einstellungen ändern.

## Sitzungen und Datenschutz

Blink schickt, was du ausgewählt hast, an dein eigenes, angemeldetes Claude Code und zeigt die Antwort in der Chatkarte. Was du in der Terminal-Sitzung tippst, die Blink gestartet hat, und die Antwort darauf erscheinen ebenfalls in Blinks Chat.

Die andere Richtung, Blinks Chat im Terminal, läuft über die experimentellen Kanäle von Claude Code. Sie werden nur beim Start von Claude Code geladen, starte es also mit `claude --dangerously-load-development-channels plugin:blinkling@blinkling`. `/blinkling:blinkling` gibt denselben Befehl aus.

> [!IMPORTANT]
> Der Browser-Helfer liest eine Seite nur, wenn du darauf zeigst. Er liest nie Passwort- oder Zahlungsfelder und spricht nur mit Blinkling auf deinem eigenen Computer. Automatisch erklären bleibt aus, bis du es einschaltest.

Blinkling hat keine Telemetrie und keinen eigenen Antwortdienst. Was du auswählst, geht an dein Claude Code, und es gelten die Bedingungen und Nutzungskosten des Anbieters. Browser-Einstellungen, Erweiterungsshops und der eigene PDF-Viewer des Browsers sind geschützte Seiten, deshalb antwortet Blink dort anhand des Bildschirms.

[Datenschutz](docs/SECURITY.md) | [Nutzung](docs/USAGE.md) | [Versionshinweise](docs/releases/v3.2.7.md)

Assisted by Claude/Codex.

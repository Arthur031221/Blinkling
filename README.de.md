<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink wohnt in der Ecke deines Bildschirms. Halte Ctrl, klicke auf etwas, bekomme die Antwort.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vom alten Plugin? Führe `/plugin uninstall glimpselet@glimpselet` und `/plugin marketplace remove glimpselet` aus und installiere dann Blinkling mit den Schritten unten.

Blinkling setzt Blink, einen kleinen grünen Begleiter, in die Ecke deines Bildschirms, über alle Apps. Halte **Ctrl** (unter macOS Control) gedrückt und klicke auf das, wonach du fragen willst, oder ziehe einen Bereich auf. Es fliegt in Blink hinein, du fragst, und die Antwort öffnet sich in einer Chatkarte neben Blink.

> **Sicher von Grund auf:** Blinkling schaut nur hin und erklärt. Es klickt, tippt und steuert nie Ihre Apps.

Nutzt das Claude Code, bei dem du auf diesem Computer schon angemeldet bist.

![Halte Strg gedrückt und klicke auf einen Absatz einer Webseite. Er fliegt in Blink hinein, du fragst, und die Antwort öffnet sich in einer Chatkarte neben Blink.](assets/pick.gif)

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

3. Erlaube auf dem Mac einmalig **Bildschirmaufnahme** für Blinkling: Systemeinstellungen, Datenschutz & Sicherheit. macOS fragt außerdem einmal nach **Bedienungshilfen**, damit die Strg-Taste eine Auswahl starten kann. Erlaube es an derselben Stelle.

> [!NOTE]
> In Windows PowerShell 5 nimm `;` statt `&&`. Animierte Schritte für deinen Rechner: [Installationsanleitung](https://arthur031221.github.io/Blinkling/install/). Weitere Wege, Updates und die Linux-Sandbox: [docs/INSTALL.md](docs/INSTALL.md).

## Beim Lesen

- **Halte Strg gedrückt und klicke** auf einen Absatz, eine Schaltfläche oder ein Bild. Blink nimmt es auf.
- **Halte Strg und ziehe**, um stattdessen einen Bereich aufzunehmen.
- Ein kleines Eingabefeld öffnet sich mit drei Schnellfragen. Enter sendet die markierte.
- Klicke jederzeit auf Blink, um zu sprechen. Neben Blink öffnet sich die Chatkarte mit deinem Gespräch.

![Klicke auf Blink, tippe eine Frage, und die Antwort läuft in die Chatkarte.](assets/ask.gif)

- Das Menü von Blink bietet Aufnahme, Führung, Automatisch erklären (aus, bis du sie einschaltest) und Einstellungen.
- Der optionale Browser-Helfer für Chrome oder Edge liefert die eigene Struktur der Seite, damit Blink weiß, auf welchen Absatz oder welche Schaltfläche du gezeigt hast, dazu eine Aufnahme der ganzen Seite, Übersetzung der Seite an Ort und Stelle und einen PDF-Reader. Seine Symbolleistenschaltfläche zeigt, ob er verbunden ist, und weckt Blink. Ohne ihn funktioniert Blink weiterhin in jedem Fenster.

## Tastenkürzel

| Tastenkürzel                      | Aktion                                      |
| --------------------------------- | ------------------------------------------- |
| Strg + Klick                      | Nach dem fragen, was unter dem Zeiger liegt |
| Strg + Ziehen                     | Einen Bereich aufnehmen                     |
| Tastenkürzel in den Einstellungen | Aufnahme-Overlay öffnen                     |

Die Tasten wählst du in den Einstellungen.

## Sitzungen und Datenschutz

Blink sendet, was du ausgewählt hast, an dein eigenes angemeldetes Claude Code und zeigt die Antwort in der Chatkarte neben Blink. Eine Eingabe und eine fertige Antwort aus der Terminal-Sitzung, die Blink gestartet hat, erscheinen von selbst im Chat von Blink. Die Gegenrichtung, der Chat von Blink im Terminal, nutzt die experimentellen Channels von Claude Code, die nur beim Start geladen werden: Starte Claude Code mit `claude --dangerously-load-development-channels plugin:blinkling@blinkling` (`/blinkling:blinkling` zeigt es an), dann sehen beide Orte alles. Ohne das antwortet Blink aus seiner eigenen Sitzung.

> [!IMPORTANT]
> Der Browser-Helfer liest eine Seite nur, wenn du darauf zeigst. Passwort- und Zahlungsfelder werden nie gelesen, und er spricht nur mit Blinkling auf deinem eigenen Rechner. Automatisch erklären bleibt aus, bis du es einschaltest.

Keine Telemetrie und kein vom Herausgeber betriebener Antwortdienst. Was du auswählst, geht an dein Claude Code; es gelten die Bedingungen und Nutzungsgebühren des Anbieters. Browsereinstellungen, Erweiterungsshops und der eingebaute PDF-Viewer des Browsers sind geschützte Seiten: Dort antwortet Blink anhand des Bildschirms. [Datenschutz](docs/SECURITY.md) | [Nutzung](docs/USAGE.md) | [Versionshinweise](docs/releases/v3.2.0.md)

Assisted by Claude/Codex.

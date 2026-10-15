<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>La réponse reste à côté de la page.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vous utilisez l'ancien plugin ? Exécutez `/plugin uninstall glimpselet@glimpselet` puis `/plugin marketplace remove glimpselet`, et installez Blinkling avec les étapes ci-dessous.

Un petit chat flottant Claude Code. Posez une question sur la page, capturez une zone, suivez un guide ou traduisez un passage.

> [!TIP]
> Utilisez votre propre compte Claude Code connecté et Chrome ou Edge sur ordinateur. Claude Code ne nécessite pas de clé API.

![Google Flights : un guide de la page, puis une question sur la réservation d'un aller-retour.](assets/demo.gif)

_Google Flights : un guide de la page, puis une question sur la réservation d'un aller-retour._

## Installation

Il vous faut Claude Code, connecté. Ensuite :

1. Collez cette ligne dans un terminal et appuyez sur Entrée :

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Dans Claude Code, lancez :

   ```text
   /blinkling:blinkling
   ```

3. Sur Mac, autorisez une fois l’**Enregistrement de l’écran** pour Blinkling : Réglages Système, Confidentialité et sécurité.

> [!NOTE]
> Dans Windows PowerShell 5, utilisez `;` au lieu de `&&`. Étapes animées pour votre ordinateur : [guide d’installation](https://arthur031221.github.io/Blinkling/install/). Autres méthodes, mises à jour et sandbox Linux : [docs/INSTALL.md](docs/INSTALL.md).

## Pendant la lecture

- **Capturer l'écran** ou **Choisir une zone**. Maintenez Shift et faites glisser sur une page compatible ou dans la bulle. Entrée confirme, Échap annule. La bulle disparaît pendant la capture partagée, puis revient.
- **Guider cette page** propose une vue générale et un parcours Suivant/Précédent des zones de lecture et des commandes.
- Sélectionnez du texte pour poser une question, expliquer ou traduire. Traduisez une page puis restaurez-la, ou ouvrez un PDF dans le lecteur intégré.
- **Explication automatique** propose jusqu'à trois questions et résume les changements. Alt+P met en pause. Choisissez Opus, Sonnet ou Haiku pour le chat.

![arXiv : sélectionner un résumé, poser une question et le traduire en chinois traditionnel.](assets/arxiv.gif)

_arXiv : sélectionner un résumé, poser une question et le traduire en chinois traditionnel._

Enregistré avec la vraie extension sur des sites en ligne et des réponses de Claude Code. Les attentes sont raccourcies. Le contenu et les réponses ne sont pas préparés.

## Raccourcis

| Raccourci    | Action                                |
| ------------ | ------------------------------------- |
| Alt+Shift+G  | Ouvrir la bulle                       |
| Ctrl+Shift+S | Recadrer dans le navigateur           |
| Ctrl+Shift+7 | Recadrer depuis une autre application |

Sur macOS, utilisez Cmd au lieu de Ctrl. Modifiez les raccourcis dans `chrome://extensions/shortcuts`. Shift fonctionne uniquement sur les pages compatibles et dans la bulle.

## Sessions et confidentialité

Blinkling utilise un canal actif vérifié de Claude Code. Sinon, un processus séparé reprend la dernière conversation enregistrée du projet. Évitez de travailler simultanément sur ce même historique dans le terminal. [Canal et limites](docs/DESIGN.md#the-running-claude-code-conversation).

> [!IMPORTANT]
> Explication automatique résume les changements **sans partage d'écran**, après consentement et autorisation du site. Les champs de mot de passe et la liste de blocage suspendent résumés et suggestions automatiques. Les résumés d'écran utilisent un onglet partagé associé au même onglet inspecté, avec les mêmes vérifications. Un écran ou une application partagés nécessitent **un consentement séparé pour chaque partage**. Les pixels ne permettent pas de vérifier mots de passe ou sites bloqués. Les sources inconnues restent en pause.
> Les pages intégrées en chargement ou inaccessibles suspendent aussi les requêtes automatiques.

Aucune télémétrie ni service de réponses géré par l'éditeur. Le contexte et les captures choisis vont à votre backend. Ses conditions et coûts s'appliquent. Les applications natives fournissent seulement des pixels. Les paramètres, boutiques d'extensions et pages protégées bloquent les outils. Opacité et passage des clics de la fenêtre native dépendent du navigateur. [Confidentialité](docs/SECURITY.md) | [Utilisation](docs/USAGE.md) | [Notes de version](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink vit dans un coin de votre écran. Maintenez Ctrl, cliquez sur n'importe quoi, la réponse arrive.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vous utilisez l'ancien plugin ? Exécutez `/plugin uninstall glimpselet@glimpselet` puis `/plugin marketplace remove glimpselet`, et installez Blinkling avec les étapes ci-dessous.

Blinkling place Blink, un petit compagnon vert, dans un coin de votre écran, au-dessus de toutes les applications. Maintenez **Ctrl** (Control sur macOS) et cliquez sur ce que vous voulez demander, ou faites glisser pour prendre une zone. L'élément s'envole vers Blink, vous posez votre question, et la réponse s'ouvre dans une carte de discussion à côté de Blink.

> **Sûr par conception :** Blinkling regarde et explique, rien de plus. Il ne clique, ne tape et ne contrôle jamais vos applications.

Utilise le Claude Code déjà connecté sur cet ordinateur.

![Maintenez Ctrl et cliquez sur un paragraphe d’une page web. Il s’envole vers Blink, vous posez votre question, et la réponse s'ouvre dans une carte de discussion à côté de Blink.](assets/pick.gif)

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

3. Sur Mac, autorisez une fois l’**Enregistrement de l’écran** pour Blinkling : Réglages Système, Confidentialité et sécurité. macOS demande aussi une fois l’**Accessibilité**, pour que la touche Ctrl puisse lancer une sélection. Autorisez-la au même endroit.

> [!NOTE]
> Dans Windows PowerShell 5, utilisez `;` au lieu de `&&`. Étapes animées pour votre ordinateur : [guide d’installation](https://arthur031221.github.io/Blinkling/install/). Autres méthodes, mises à jour et sandbox Linux : [docs/INSTALL.md](docs/INSTALL.md).

## Pendant la lecture

- **Maintenez Ctrl et cliquez** sur un paragraphe, un bouton ou une image. Blink le prend.
- **Maintenez Ctrl et faites glisser** pour prendre une zone.
- Un petit champ de saisie s'ouvre avec trois questions rapides. Entrée envoie celle qui est en surbrillance.
- Cliquez sur Blink à tout moment pour parler. La carte de discussion s'ouvre à côté de Blink avec votre conversation.

![Cliquez sur Blink, tapez une question, et la réponse arrive dans la carte de discussion.](assets/ask.gif)

- Le menu de Blink propose capture, visite guidée, Explication automatique (désactivée tant que vous ne l'activez pas) et réglages.
- L'assistant facultatif pour Chrome ou Edge apporte la structure propre de la page, pour que Blink sache quel paragraphe ou bouton vous avez désigné, ainsi que la capture de page entière, la traduction de la page sur place et un lecteur de PDF. Son bouton de barre d'outils indique s'il est connecté et réveille Blink. Sans lui, Blink fonctionne toujours sur toutes les fenêtres.

## Raccourcis

| Raccourci              | Action                                 |
| ---------------------- | -------------------------------------- |
| Ctrl + clic            | Interroger ce qui est sous le pointeur |
| Ctrl + glisser         | Prendre une zone                       |
| Raccourci des Réglages | Ouvrir la superposition de capture     |

Choisissez les touches dans les Réglages.

## Sessions et confidentialité

Blink envoie ce que vous avez choisi à votre propre Claude Code connecté et affiche la réponse dans la carte de discussion à côté de Blink. La session de terminal qui a lancé Blink et la discussion de Blink se suivent : une demande et une réponse terminée saisies à l'un des deux endroits apparaissent aux deux.

> [!IMPORTANT]
> L'assistant du navigateur ne lit une page que lorsque vous la désignez. Il ne lit jamais les champs de mot de passe ni de paiement, et ne communique qu'avec Blinkling sur votre propre ordinateur. Explication automatique reste désactivée tant que vous ne l'activez pas.

Aucune télémétrie ni service de réponses exploité par l'éditeur. Ce que vous choisissez va à votre Claude Code ; les conditions et les frais d'utilisation du fournisseur s'appliquent. Les réglages du navigateur, les boutiques d'extensions et le lecteur PDF intégré du navigateur sont des pages protégées : Blink y répond à partir de l'écran. [Confidentialité](docs/SECURITY.md) | [Utilisation](docs/USAGE.md) | [Notes de version](docs/releases/v3.2.0.md)

Assisted by Claude/Codex.

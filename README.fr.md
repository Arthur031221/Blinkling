<h1 align="center"><img src="assets/blink-lying.gif" width="150" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink vit dans un coin de votre écran. Maintenez Ctrl, cliquez sur n'importe quoi, la réponse arrive.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vous utilisez l'ancien plugin ? Exécutez `/plugin uninstall glimpselet@glimpselet` puis `/plugin marketplace remove glimpselet`, et installez Blinkling avec les étapes ci-dessous.

Blinkling place Blink, un petit compagnon vert, dans un coin de votre écran, au-dessus de toutes les applications. Maintenez Ctrl (Control sur macOS) et cliquez sur ce dont vous voulez parler, ou faites glisser pour prendre une zone. Votre sélection s'envole vers Blink, vous tapez votre question, et la réponse s'ouvre dans une carte de discussion à côté de Blink.

Blinkling regarde et explique, rien de plus. Il ne clique ni ne tape jamais dans vos applications.

Il utilise le Claude Code auquel vous êtes déjà connecté sur cet ordinateur.

<p align="center">
<img src="assets/pick.webp" alt="Ctrl et clic sur un paragraphe d'une page arXiv. Sa capture s'envole dans la bouche de Blink, la carte de discussion s'ouvre et la réponse arrive au fil de l'eau."><br>
Article : Ctrl et clic sur un paragraphe, puis lisez la réponse.
</p>

<p align="center">
<img src="assets/translate.webp" alt="Sur une page de Wikipédia en arabe, un passage choisi entre dans Blink, on appuie sur Traduire et la réponse explique le passage en anglais."><br>
Traduire : un passage en arabe, expliqué en anglais.
</p>

<p align="center">
<img src="assets/tour.webp" alt="Sur une page publique très dense, le guide marque les parties de la page. Blink tient un bâton pointeur sur l'étape en cours et Suivant parcourt les étapes."><br>
Guide : une page difficile, pas à pas.
</p>

## Installation

Il vous faut Claude Code, connecté sur cet ordinateur. Sous Windows, il faut aussi Node.js 22 ou plus récent depuis nodejs.org, que Blinkling ne télécharge pas à votre place. macOS et Linux n'ont besoin de rien d'autre.

Après avoir installé quoi que ce soit, fermez le terminal et ouvrez-en un nouveau, pour qu'il trouve le nouveau programme.

1. Collez cette ligne dans un terminal et appuyez sur Entrée :

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Lancez Claude Code avec le canal de Blink :

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   L'option permet au chat de Blink et à cette session de terminal de se voir. Claude Code vous demande de la confirmer une fois. Sans elle, Blink fonctionne quand même et répond depuis sa propre session.

   Ensuite, dans cette session, exécutez :

   ```text
   /blinkling:blinkling
   ```

3. Sur un Mac, autorisez une fois l'Enregistrement de l'écran pour Blinkling, dans Réglages Système, Confidentialité et sécurité. macOS demande aussi une fois l'Accessibilité, pour que la touche Ctrl puisse lancer une sélection. Autorisez-la au même endroit.

Si un Mac ou un ordinateur Linux n'a pas Node.js, Blinkling récupère sa propre copie privée au premier démarrage. Elle pèse environ 45 Mo et est vérifiée par rapport à un SHA-256 fixé. Si, à ce premier démarrage, Claude Code indique que la connexion à Blinkling a échoué, attendez une minute et exécutez `/mcp`.

> [!NOTE]
> Dans Windows PowerShell 5, exécutez les deux commandes l'une après l'autre au lieu de les relier avec `&&`. Les étapes animées pour votre ordinateur sont dans le [guide d'installation](https://arthur031221.github.io/Blinkling/install/). Les autres méthodes d'installation, les mises à jour et le bac à sable Linux sont dans [docs/INSTALL.md](docs/INSTALL.md).

## Pendant la lecture

- Maintenez Ctrl et cliquez sur un paragraphe, un bouton ou une image, et Blink le prend.
- Maintenez Ctrl et faites glisser pour prendre une zone.
- La carte de discussion s'ouvre à côté de Blink avec votre sélection, trois questions rapides et les sélecteurs de modèle, d'effort et d'autorisation. Entrée envoie la question en surbrillance.
- Cliquez sur Blink à tout moment pour parler. La carte s'ouvre avec votre conversation.

![Cliquez sur Blink, tapez une question, et la réponse arrive dans la carte de discussion.](assets/ask.webp)

- Le menu de Blink propose la capture, le guide, Explication automatique et les réglages. Explication automatique reste désactivée tant que vous ne l'activez pas.
- L'assistant de navigateur facultatif pour Chrome ou Edge donne à Blink la structure de la page, ce qui lui permet de savoir quel paragraphe ou quel bouton vous avez désigné. Il ajoute aussi la capture de page entière, la traduction sur place et un lecteur de PDF. Le bouton de la barre d'outils indique s'il est connecté et réveille Blink. Sans lui, Blink fonctionne dans toutes les fenêtres.

## Raccourcis

| Raccourci              | Action                                                |
| ---------------------- | ----------------------------------------------------- |
| Ctrl + clic            | Interroger ce qui est sous le pointeur                |
| Ctrl + glisser         | Prendre une zone                                      |
| Raccourci des Réglages | Ouvrir la superposition de capture                    |
| Ctrl + Alt + Shift + B | Quitter Blink (sur Mac, Ctrl + Option + Commande + B) |

Vous pouvez changer les touches dans les Réglages.

## Sessions et confidentialité

Blink envoie ce que vous avez sélectionné à votre propre Claude Code connecté et affiche la réponse dans la carte de discussion. Ce que vous tapez dans la session de terminal qui a lancé Blink, et la réponse correspondante, apparaissent aussi dans le chat de Blink.

Le sens inverse, le chat de Blink dans le terminal, passe par les canaux expérimentaux de Claude Code. Ils ne se chargent qu'au démarrage de Claude Code, donc lancez-le avec `claude --dangerously-load-development-channels plugin:blinkling@blinkling`. `/blinkling:blinkling` affiche la même commande.

> [!IMPORTANT]
> L'assistant de navigateur ne lit une page que lorsque vous la désignez. Il ne lit jamais les champs de mot de passe ni de paiement, et ne parle qu'à Blinkling sur votre propre ordinateur. L'option Explication automatique reste désactivée tant que vous ne l'activez pas.

Blinkling n'a ni télémétrie ni service de réponses à lui. Ce que vous sélectionnez part vers votre Claude Code, et les conditions et frais d'utilisation du fournisseur s'appliquent. Les réglages du navigateur, les boutiques d'extensions et le lecteur de PDF du navigateur sont des pages protégées, donc Blink y répond à partir de l'écran.

[Confidentialité](docs/SECURITY.md) | [Utilisation](docs/USAGE.md) | [Notes de version](docs/releases/v3.2.7.md)

Assisted by Claude/Codex.

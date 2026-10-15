<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>La réponse reste à côté de la page.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vous utilisez l'ancien plugin ? Exécutez `/plugin uninstall glimpselet@glimpselet` puis `/plugin marketplace remove glimpselet`, et installez Blinkling avec les étapes ci-dessous.

Un petit chat flottant Claude Code. Posez une question sur la page, capturez une zone, suivez un guide ou traduisez un passage.

> [!TIP]
> Utilisez votre propre compte Claude Code connecté et Chrome ou Edge sur ordinateur. Claude Code ne nécessite pas de clé API.

![Google Flights : un guide de la page, puis une question sur la réservation d'un aller-retour.](assets/demo.gif)

_Google Flights : un guide de la page, puis une question sur la réservation d'un aller-retour._

## Installation

1. Installez le plugin dans Claude Code :

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Ouvrez le guide de bienvenue :

   ```text
   /blinkling:blinkling
   ```

3. Activez le **mode développeur** dans `chrome://extensions` (ou `edge://extensions`). Choisissez **Load unpacked** et le dossier ouvert par **Show in Files / Finder**. La page de bienvenue se connecte automatiquement. Cliquez ensuite sur le bouton Blink de la barre d'outils pour voir qu'il est connecté.

> [!NOTE]
> L'assistant du navigateur est facultatif : Blink fonctionne sur n'importe quelle fenêtre sans lui. Pour Chrome ou Edge, exécutez `/blinkling:install`, puis chargez `~/Blinkling-extension` comme à l'étape 3. [Détails d'installation et de mise à jour](docs/INSTALL.md).

### Avancé : charger depuis les sources

<details>
<summary>Code source et mises à jour manuelles</summary>

Pour lancer le plugin depuis les sources, il vous faut Node.js 22+ et une version récente de Claude Code. Si votre terminal se trouve déjà à la racine d'une copie locale du dépôt, sautez les deux premières commandes. Exécutez ces commandes dans le terminal :

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details blinkling
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

Les deux vérifications de version doivent afficher `2.1.0`. La liste des plugins doit afficher `blinkling@inline` en version `2.1.0`, activé pour cette session. La dernière commande ouvre Claude Code. Exécutez-y `/blinkling:blinkling` pour ouvrir le guide de bienvenue. `--plugin-dir` charge cette copie du dépôt uniquement pour cette session. Utilisez cette option à chaque lancement et redémarrez Claude Code après avoir relancé `npm run build:plugin`. L'extension compilée se trouve dans `dist-extension`. Le guide de bienvenue la copie dans le dossier stable indiqué ci-dessous.

Les détails du plugin doivent aussi inclure les compétences `blinkling` et `install` et le serveur MCP `blinkling`. L'extension empaquetée se trouve dans `bin/extension`. Sa version doit aussi être **2.1.0**. Si Claude Code est distant, utilisez la commande SSH du guide, téléchargez le ZIP de l'extension sur l'ordinateur avec le navigateur et chargez-y le dossier extrait.

Si le navigateur et Claude Code fonctionnent sur le même ordinateur, le guide de bienvenue copie l'extension compilée dans le dossier stable `~/Blinkling-extension`. Dans Chrome ou Edge, ouvrez `chrome://extensions` ou `edge://extensions`, activez **Developer mode**, choisissez **Load unpacked** et sélectionnez ce dossier. La bannière de développement reste visible. Les mises à jour doivent être installées manuellement.
Pour mettre à jour une extension décompressée, fermez l'ancienne bulle et relancez `/blinkling:blinkling` pour actualiser le dossier stable. Cliquez sur Recharger sur la fiche de l'extension. Si Claude Code est distant, téléchargez le nouveau ZIP depuis le guide, remplacez les fichiers extraits sur la machine avec le navigateur, puis rechargez l'extension. Pour passer à `~/Blinkling-extension`, supprimez l'ancienne fiche et chargez ce dossier une fois.

Pour mettre à jour le plugin installé, exécutez ces commandes, puis `/reload-plugins` et `/blinkling:blinkling` dans Claude Code. Vérifiez **2.1.0** dans la liste des plugins et sur la fiche de l'extension avant de rouvrir la bulle.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## Pendant la lecture

- **Maintenez Ctrl et cliquez** sur un paragraphe, un bouton ou une image de votre écran : Blink le prend et interroge Claude Code. **Maintenez Ctrl et faites glisser** pour prendre une zone.
- Un petit champ de saisie s'ouvre avec trois questions rapides. Entrée envoie celle qui est en surbrillance. Cliquez sur Blink à tout moment pour reprendre la conversation.
- Les réponses arrivent sous forme de bulles qui pointent ce dont elles parlent. Le menu de Blink propose capture, visite guidée, Explication automatique (désactivée tant que vous ne l'activez pas) et réglages.
- L'assistant facultatif pour Chrome ou Edge apporte la structure propre de la page, pour que Blink sache quel paragraphe ou bouton vous avez désigné, ainsi que la capture de page entière, la traduction de la page sur place et un lecteur de PDF. Son bouton de barre d'outils indique s'il est connecté et réveille Blink. Sans lui, Blink fonctionne toujours sur toutes les fenêtres.

## Raccourcis

| Raccourci              | Action                                 |
| ---------------------- | -------------------------------------- |
| Ctrl + clic            | Interroger ce qui est sous le pointeur |
| Ctrl + glisser         | Prendre une zone                       |
| Raccourci des Réglages | Ouvrir la superposition de capture     |

Choisissez les touches dans les Réglages.

## Sessions et confidentialité

Blink envoie ce que vous avez choisi à votre propre Claude Code connecté et affiche la réponse à côté de ce dont elle parle. Évitez d'utiliser la même conversation dans un terminal en même temps.

> [!IMPORTANT]
> L'assistant du navigateur ne lit une page que lorsque vous la désignez. Il ne lit jamais les champs de mot de passe ni de paiement, et ne communique qu'avec Blinkling sur votre propre ordinateur. Explication automatique reste désactivée tant que vous ne l'activez pas.

Aucune télémétrie ni service de réponses exploité par l'éditeur. Ce que vous choisissez va à votre Claude Code ; les conditions et les frais d'utilisation du fournisseur s'appliquent. Les réglages du navigateur, les boutiques d'extensions et le lecteur PDF intégré du navigateur sont des pages protégées : Blink y répond à partir de l'écran. [Confidentialité](docs/SECURITY.md) | [Utilisation](docs/USAGE.md) | [Notes de version](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

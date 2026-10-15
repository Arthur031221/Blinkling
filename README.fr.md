<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>La réponse reste à côté de la page.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vous utilisez l'ancien plugin ? Exécutez `/plugin uninstall glimpselet@glimpselet` puis `/plugin marketplace remove glimpselet`, et installez Blinkling avec les étapes ci-dessous.

Blink est un petit compagnon dans un coin de votre écran. Maintenez Ctrl et cliquez sur quelque chose pour interroger Claude Code à son sujet.

> [!TIP]
> Blink utilise le Claude Code auquel vous êtes déjà connecté, sur le même ordinateur.

## Installation

1. Installez le plugin dans Claude Code :

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Réveillez Blink. Un accueil en trois étapes apparaît la première fois :

   ```text
   /blinkling:blinkling
   ```

3. Facultatif, pour la structure de la page, la capture de page entière, la traduction sur place et le lecteur PDF : exécutez `/blinkling:install`, activez le **mode développeur** dans `chrome://extensions` (ou `edge://extensions`), choisissez **Load unpacked** et sélectionnez `~/Blinkling-extension`.

> [!NOTE]
> L'assistant est facultatif : Blink fonctionne sans lui. [Détails d'installation et de mise à jour](docs/INSTALL.md).

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

Les deux vérifications de version doivent afficher **2.1.0**, et la liste des plugins doit montrer `blinkling@inline` en **2.1.0**, activé pour cette session. Dans la session Claude Code ouverte par la dernière commande, exécutez `/blinkling:blinkling`. L'option `--plugin-dir` charge votre copie de travail pour cette session seulement. Utilisez-la à chaque lancement de Claude Code depuis les sources et redémarrez la session après une reconstruction. L'extension construite se trouve dans `dist-extension`, dans la copie de travail.

Les détails du plugin doivent aussi lister les skills `blinkling` et `install` ainsi que le serveur MCP `blinkling`. L'extension empaquetée se trouve dans `bin/extension` et sa version doit aussi être **2.1.0**.

L'assistant du navigateur est facultatif. Exécutez `/blinkling:install` pour copier l'extension construite dans le dossier fixe `~/Blinkling-extension`. Dans Chrome ou Edge, ouvrez `chrome://extensions` ou `edge://extensions`, activez **Developer mode**, choisissez **Load unpacked** et sélectionnez ce dossier. La bannière de développement reste affichée et les mises à jour doivent être faites manuellement quand une nouvelle version est disponible.

Après la mise à jour de l'extension non empaquetée, exécutez de nouveau `/blinkling:install` pour actualiser le dossier fixe, puis cliquez sur Recharger sur sa carte dans la page des extensions. En passant à `~/Blinkling-extension`, supprimez l'ancienne carte et chargez ce dossier une fois.

Pour un plugin installé, exécutez ces commandes, puis `/reload-plugins` et `/blinkling:blinkling` dans Claude Code. Vérifiez que la liste des plugins et la carte de l'extension affichent la version **2.1.0**.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## Pendant la lecture

- **Interroger ce qui est sous le pointeur.** Maintenez Ctrl et cliquez sur quelque chose, ou faites glisser pour prendre une zone. Elle s'envole vers Blink et le mini-compositeur s'ouvre. Entrée envoie.
- **Parler à Blink.** Cliquez sur Blink pour reprendre la dernière conversation dans le mini-compositeur. Un long message ou Maj+Entrée ouvre le compositeur complet.
- **Des réponses en bulles.** Elles pointent vers ce dont elles parlent. Tournez la molette sur Blink pour relire les précédentes.
- **Le menu.** Survolez Blink pour l'ouvrir : capture, guide, explication automatique et réglages. Un guide numérote ses étapes sur la page et peut être enregistré en Markdown. L'explication automatique est désactivée par défaut, ajoute au plus deux bulles et ne dessine jamais de repères.
- **Assistant du navigateur (facultatif).** Sa fenêtre de la barre d'outils indique ce qui est connecté et propose un bouton **Wake Blink**. Il permet à Blink de lire la structure de la page, de capturer une page entière, de traduire une page sur place et d'ouvrir les PDF dans un lecteur.

La capture a aussi un raccourci global, Ctrl+Maj+S (Cmd sur macOS), modifiable dans les réglages.

## Confidentialité

Blink interroge le Claude Code auquel vous êtes connecté sur cet ordinateur, et rien n'est capturé tant que vous ne le demandez pas. Aucune télémétrie ni service de réponses exploité par l'éditeur. Le contexte choisi et les captures vont à Claude Code et à son fournisseur ; les conditions et les frais d'utilisation du fournisseur s'appliquent. L'assistant ne communique qu'avec le pont sur `127.0.0.1` et ne lit jamais les champs de mot de passe ni les valeurs saisies. L'explication automatique reste désactivée tant que vous ne l'activez pas.

[Détails de confidentialité](docs/SECURITY.md) | [Utilisation](docs/USAGE.md) | [Fonctionnalités](docs/FEATURES.md) | [Notes de version](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

Un petit chat flottant pour poser à Claude Code des questions sur la page ou l'écran affiché. Consultez et traduisez des pages web, faites-vous guider vers les commandes utiles et capturez une zone pour poser une question.

|           Chat flottant Glimpselet           |                 Exemple de guide sur la page                  |
| :------------------------------------------: | :-----------------------------------------------------------: |
| ![Chat flottant Glimpselet](assets/demo.gif) | ![Exemple de guide sur la page](assets/screenshots/guide.png) |

Prérequis : une version récente de Claude Code, une connexion avec votre propre abonnement et un navigateur Chromium de bureau comme Chrome ou Edge.

Glimpselet démarre une conversation dédiée. Vous pouvez aussi poursuivre une session récente de Claude Code dans un processus séparé. Pour envoyer des demandes à la session interactive déjà ouverte dans le terminal, activez la préversion des channels. [Configuration du channel](docs/DESIGN.md#the-running-claude-code-conversation).

## Installation

1. Ajoutez la marketplace et installez le plugin dans Claude Code :

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. Dans votre terminal, vérifiez que `claude plugin list` affiche Glimpselet **2.0.0**, puis exécutez `/glimpselet:glimpse` dans Claude Code.

3. Suivez le guide de bienvenue pour connecter votre navigateur. Sur un ordinateur local, choisissez **Try without installing** ou chargez et associez l'extension dans votre navigateur. Si Claude Code fonctionne sur un hôte distant, exécutez la commande SSH affichée par le guide sur l'ordinateur avec le navigateur. Téléchargez-y le ZIP et chargez l'extension dans ce navigateur. L'option sans installation n'est pas disponible sur l'hôte distant. Une fois l'association réussie, le panneau Glimpselet affiche le mode de connexion et le projet.

### Avancé : charger depuis les sources

Pour lancer le plugin depuis les sources, il vous faut Node.js 22+ et une version récente de Claude Code. Si votre terminal se trouve déjà à la racine d’une copie locale du dépôt, sautez les deux premières commandes. Exécutez ces commandes dans le terminal :

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Glimpselet
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD"
```

Les deux vérifications de version doivent afficher `2.0.0`. La liste des plugins doit afficher `glimpselet@inline` en version `2.0.0`, activé pour cette session. La dernière commande ouvre Claude Code ; exécutez-y `/glimpselet:glimpse` pour ouvrir le guide de bienvenue. `--plugin-dir` charge cette copie du dépôt uniquement pour cette session. Utilisez cette option à chaque lancement et redémarrez Claude Code après avoir relancé `npm run build:plugin`. L’extension compilée se trouve dans `dist-extension` ; le guide de bienvenue la copie dans le dossier stable indiqué ci-dessous.

Dans votre navigateur de bureau, l'extension se trouve dans le dossier stable `~/.glimpselet/extension`. Dans Chrome ou Edge, ouvrez `chrome://extensions` ou `edge://extensions`, activez **Developer mode**, choisissez **Load unpacked** et sélectionnez ce dossier. La bannière de développement reste visible. Les mises à jour doivent être installées manuellement.

Pour mettre à jour une extension décompressée, fermez l’ancienne bulle et relancez `/glimpselet:glimpse` pour actualiser le dossier stable. Cliquez sur Recharger sur la fiche de l’extension. Si Claude Code est distant, téléchargez le nouveau ZIP depuis le guide, remplacez les fichiers extraits sur la machine avec le navigateur, puis rechargez l’extension.

## Glimpselet est déjà installé ?

Exécutez ces commandes dans un terminal sur la machine où fonctionne Claude Code. Actualiser le catalogue seul ne garantit pas la mise à jour du plugin installé.

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

Dans votre session Claude Code, exécutez `/reload-plugins` (ou redémarrez Claude Code), puis `/glimpselet:glimpse`. La liste doit afficher `glimpselet@glimpselet` en **2.0.0** et la commande doit ouvrir le guide de bienvenue et de connexion. Vérifiez aussi **2.0.0** sur `chrome://extensions` ou `edge://extensions` sur la machine avec votre navigateur. Si le plugin affiche toujours 1.1.1, v2 peut ne pas encore être publiée dans le catalogue public ; l’ancienne page de sélection d’écran n’est pas le guide v2. [Vérification de la mise à jour](docs/DESIGN.md#plugin-upgrades-and-release-verification).

Pour l’extension non empaquetée, le guide copie les nouveaux fichiers dans `~/.glimpselet/extension`. Rechargez Glimpselet dans `chrome://extensions` ou `edge://extensions` et vérifiez la version **2.0.0**. Avec SSH, téléchargez le nouveau ZIP depuis le guide sur l’ordinateur de votre navigateur, extrayez-le dans le dossier déjà chargé, puis rechargez l’extension. L’hôte distant ne peut pas ouvrir le navigateur sans installation sur votre ordinateur.

## Ce que vous pouvez faire

- Recevoir les réponses en streaming et poser des questions de suivi avec Opus, Sonnet ou Haiku.
- Capturer un écran partagé en plein écran ou recadrer une zone avec la superposition de la page. Maintenez Shift et faites glisser, puis appuyez sur Enter pour capturer ou Esc pour annuler.
- Voir des questions suggérées qui s'actualisent avec la page.
- Activer les résumés Passive facultatifs, les mettre en pause avec Alt+P et consulter leur coût horaire.
- Afficher un guide sur les commandes réelles de la page. Traduisez le texte sur place et utilisez Restore pour le rétablir.
- Sélectionner du texte pour l'expliquer, le traduire ou poser une question. Vous pouvez aussi ouvrir un PDF dans le lecteur inclus et poser des questions.

![Guider cette page](assets/guide.gif)

![Zone sélectionnée](assets/crop.gif)

| Raccourci                            | Action                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Alt+Shift+G                          | Ouvrir Glimpselet et choisir **Float** pour afficher le chat flottant.                         |
| Ctrl+Shift+S (Cmd+Shift+S sur macOS) | Recadrer la page actuelle ou l'écran partagé.                                                  |
| Ctrl+Shift+7 (Cmd+Shift+7 sur macOS) | Recadrer depuis n'importe quelle application. Modifiable dans `chrome://extensions/shortcuts`. |
| Maintenir Shift                      | Démarrer un recadrage dans une bulle ou une page Glimpselet.                                   |
| Alt+P                                | Mettre en pause les résumés Passive.                                                           |

Sur macOS, Cmd+Shift+5 ouvre l'outil système de capture d'écran. Shift fonctionne sur les pages auxquelles Glimpselet a accès. Une page web ne peut pas recevoir cette touche depuis une autre application.

**Float** est la première action. L'extension demande l'accès à la page lorsque vous utilisez une fonction qui en a besoin. Aucune clé API n'est nécessaire avec votre propre session Claude Code connectée. Le mode API direct est facultatif et nécessite votre clé API.

## Sessions Claude Code

Consultez [Sessions Claude Code](docs/DESIGN.md#the-running-claude-code-conversation) pour la commande et la configuration de l'aperçu des channels. Sans le channel, Glimpselet peut continuer une session choisie dans un processus séparé. Il s'agit d'une continuation parallèle. N'utilisez pas cette session dans le terminal en même temps, car les accès simultanés peuvent entrer en conflit.

## Limites et confidentialité

Glimpselet fonctionne sur ordinateur avec Chrome, Edge et les autres navigateurs Chromium. La bannière de développement reste visible jusqu'à la distribution dans une boutique, et les mises à jour sont manuelles. Certaines pages, comme les paramètres du navigateur, les boutiques d'extensions et les pages restreintes, bloquent l'accès. Le lecteur PDF intégré à Chrome n'est pas accessible. Utilisez le lecteur Glimpselet. Les applications natives ne fournissent que des pixels, sans texte ni superposition. Shift fonctionne dans la bulle et sur les pages dont l'accès est autorisé. Dans une autre application, utilisez le raccourci global de capture. La fenêtre flottante ne permet pas de transmettre les clics.

Les questions suggérées automatiquement utilisent le contexte de la page uniquement avec votre consentement. Passive est facultatif : autorisez Glimpselet à accéder au site, activez **Passive**, puis naviguez ou changez la page inspectée pour recevoir des résumés sans partage d’écran. Les résumés de pages utilisent le texte et la structure des pages dont l’accès est autorisé. Lors d’un partage d’écran, les résumés des changements à l’écran nécessitent un onglet de navigateur partagé et vérifié qui correspond à la page inspectée. Une fenêtre, l’écran entier, une application native ou une source inconnue ou inaccessible mettent ces résumés en pause. Les pages contenant des champs de mot de passe et les sites bloqués sont exclus des résumés et des questions suggérées automatiques. Les questions et captures manuelles restent disponibles.

[Guide d'installation](docs/INSTALL.md) | [Utilisation](docs/USAGE.md) | [Conception](docs/DESIGN.md) | [Détails sur la confidentialité](docs/SECURITY.md)

Assisted by Claude/Codex.

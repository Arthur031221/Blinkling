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

2. Exécutez `/glimpselet:glimpse`.

3. Suivez le guide de bienvenue pour connecter votre navigateur. Sur un ordinateur local, choisissez **Try without installing** ou chargez et associez l'extension dans votre navigateur. Si Claude Code fonctionne sur un hôte distant, exécutez la commande SSH affichée par le guide sur l'ordinateur avec le navigateur. Téléchargez-y le ZIP et chargez l'extension dans ce navigateur. L'option sans installation n'est pas disponible sur l'hôte distant. Une fois l'association réussie, le panneau Glimpselet affiche le mode de connexion et le projet.

### Avancé : charger depuis les sources

Dans votre navigateur de bureau, l'extension se trouve dans le dossier stable `~/.glimpselet/extension`. Dans Chrome ou Edge, ouvrez `chrome://extensions` ou `edge://extensions`, activez **Developer mode**, choisissez **Load unpacked** et sélectionnez ce dossier. La bannière de développement reste visible. Les mises à jour doivent être installées manuellement.

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

Les questions suggérées automatiquement utilisent le contexte de la page uniquement avec votre consentement. Les résumés passifs sont facultatifs et nécessitent le partage d'un onglet de navigateur inspecté. Si la source partagée est une fenêtre, un écran, une application native, une source inconnue ou inaccessible, les résumés automatiques se mettent en pause. Les questions et captures manuelles restent disponibles.

[Guide d'installation](docs/INSTALL.md) | [Utilisation](docs/USAGE.md) | [Conception](docs/DESIGN.md) | [Détails sur la confidentialité](docs/SECURITY.md)

Assisted by Claude/Codex.

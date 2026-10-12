# Glimpselet

Glimpselet est un petit chat qui reste au-dessus des autres fenêtres et se connecte à une session Claude Code existante. Il peut lire et traduire les pages web accessibles, dessiner des repères sur la page réelle et capturer des zones de page ou des images d'écran partagé pour répondre aux questions.

![Chat flottant Glimpselet](assets/demo.gif)

![Cercles de repérage dessinés sur la page réelle](assets/screenshots/guide.png)

[Ouvrir la démo statique](https://arthur031221.github.io/Glimpselet/). Elle utilise une image d'exemple et une réponse enregistrée, sans requête au fournisseur.

## Installation

Installez le plugin Glimpselet dans Claude Code :

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Lancez `/glimpse` et suivez le guide de configuration. Ce guide fait référence pour l'installation et l'association.

### Avancé : charger depuis les sources

1. Ouvrez `chrome://extensions` dans Chrome ou Edge et activez le **mode développeur**.
2. Choisissez **Charger l'extension non empaquetée**.
3. Sélectionnez le dossier de l'extension indiqué par le guide de configuration.

> **Mode développeur :** Glimpselet est actuellement distribué en mode développeur. En attendant sa disponibilité dans une boutique, les mises à jour doivent être installées manuellement.

## Captures et raccourcis

Maintenez Maj dans la bulle flottante ou sur une page accessible pour démarrer un recadrage. Maj ne détecte pas les touches dans les autres applications. Sur une page web, la sélection se fait directement dessus. Pendant un partage d'écran, l'image est figée puis affichée en plein écran pour le recadrage. Appuyez sur Entrée pour confirmer ou Échap pour annuler.

Le raccourci du navigateur est Ctrl+Shift+S (Cmd+Shift+S sur Mac). Il démarre le recadrage dans le navigateur. Le raccourci global est Ctrl+Maj+5 par défaut, car Chrome exige une touche numérique pour les raccourcis globaux. Vous pouvez le modifier, notamment pour utiliser S, dans `chrome://extensions/shortcuts`.

## Sessions Claude Code

La prise en charge documentée des MCP channels permet d'envoyer des messages à une session Claude Code déjà en cours. Glimpselet affiche les réponses à partir des fragments de l'outil de réponse du channel. Le modèle et les autorisations restent contrôlés par la session du terminal. Pour ajouter le channel personnalisé de Glimpselet, redémarrez la session avec le channel de développement activé, puis lancez `/glimpse` :

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

Sans channel, Glimpselet peut continuer la même session dans un processus distinct en mode print avec `claude --resume SESSION_ID -p`. C'est une continuation en parallèle. Ne l'exécutez pas en même temps que le processus du terminal qui utilise cette session. Les accès concurrents peuvent entrer en conflit.

## Limites

- Chrome, Edge et les autres navigateurs Chromium uniquement.
- Les pages internes comme `chrome://`, la boutique d'extensions et certaines pages gérées bloquent l'accès.
- Glimpselet ne peut pas dessiner sur les applications natives. Vous pouvez partager leur écran pour poser une question sur l'image, sans superposition ni action sur le texte.
- Ouvrez les PDF dans le lecteur Glimpselet fourni. Le lecteur PDF intégré de Chrome n'est pas accessible comme une page ordinaire.
- L'API Document Picture-in-Picture du navigateur ne prend pas en charge le passage des clics. La fenêtre flottante ne peut donc pas transmettre les clics à une autre application. Le navigateur ne garantit ni fenêtre flottante ni ouverture automatique. Gardez la page de l'extension ouverte pendant l'utilisation de la fenêtre.

## Confidentialité

Aucune télémétrie n'est collectée. Avec votre accord, le texte de la page peut être envoyé pour créer des questions suggérées. Les questions et résumés passifs facultatifs peuvent aussi envoyer du texte et des images pertinents. Les images restent en mémoire et ne sont envoyées au bridge que lors d'une capture ou d'une question. En mode passerelle, la CLI tourne sur l'hôte et y conserve les transcriptions. Le mode API direct envoie les requêtes depuis l'extension. Les clés API et les jetons du bridge restent dans le stockage de session du navigateur. Les préférences sont enregistrées localement. Consultez [sécurité et confidentialité](docs/SECURITY.md) pour les flux de données.

## En savoir plus

[Installation](docs/INSTALL.md) | [Utilisation](docs/USAGE.md) | [Conception et intégration](docs/DESIGN.md) | [Préparation des boutiques](docs/STORE.md) | [Notes de version](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.

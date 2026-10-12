<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, le compagnon de Glimpselet"><br><strong>Glimpselet</strong><br><em>Blink attend. Vous choisissez. Il répond.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.de.md">Deutsch</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> Posez une question à votre assistant de programmation sur l'écran choisi, dans un panneau flottant compact. Figez une image, recadrez-la, masquez les détails privés et posez votre question.

<p align="center"><img src="assets/demo.gif" width="800" alt="Image de test et réponse enregistrée dans le panneau Glimpselet"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Ouvrir la démo statique</a>. Elle montre une image de test et une réponse enregistrée. Aucun appel à un fournisseur.</p>

<p align="center"><img src="assets/screenshots/light-420.png" width="49%" alt="Thème clair à 420 px"><img src="assets/screenshots/dark-420.png" width="49%" alt="Thème sombre à 420 px"></p>

<details>
<summary>Les six tailles et thèmes</summary>

<p><img src="assets/screenshots/light-360.png" width="140" alt="Panneau clair 360 px"><img src="assets/screenshots/light-420.png" width="140" alt="Panneau clair 420 px"><img src="assets/screenshots/light-520.png" width="140" alt="Panneau clair 520 px"></p>
<p><img src="assets/screenshots/dark-360.png" width="140" alt="Panneau sombre 360 px"><img src="assets/screenshots/dark-420.png" width="140" alt="Panneau sombre 420 px"><img src="assets/screenshots/dark-520.png" width="140" alt="Panneau sombre 520 px"></p>

</details>

Le mode flottant nécessite un navigateur Chromium sur ordinateur. Avant l'installation, prévoyez Node.js 22 ou une version ultérieure et un assistant de programmation installé.

Installez le plugin avec deux commandes slash :

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Lancez ensuite `/glimpselet:glimpse`. Node.js 22 ou une version ultérieure est nécessaire. Aucune extension de navigateur n'est requise.

## Au quotidien

```text
/glimpselet:glimpse
Choisissez un écran, une fenêtre ou un onglet dans le sélecteur du navigateur.
Figez l'image, recadrez une zone et couvrez les détails privés avec des masques opaques.
Posez une question, lisez la réponse en continu et poursuivez avec une autre question.
Copiez ou épinglez la réponse, puis effacez la session locale en terminant.
```

L'image reste sur votre machine tant que vous ne posez pas de question ou n'activez pas les notes passives. Les masques opaques modifient l'image envoyée. Les notes passives échantillonnent l'écran toutes les deux secondes et demandent une courte description des images modifiées. La limite par défaut est de six requêtes par minute glissante, soit jusqu'à 360 par heure. C'est une limite de requêtes, pas une estimation du coût. Vous pouvez choisir une limite plus basse.

Les outils MCP de capture renvoient des images à la session de programmation sur demande. Après recadrage et masquage, les captures du panneau sont limitées à 1536 pixels sur le côté le plus long et à 1,8 million de pixels. Les petites zones sélectionnées conservent leur résolution d'origine.

**C'est vous qui démarrez le partage , l'écran n'est jamais observé automatiquement.**

## Détails

<details>
<summary>Commandes et état</summary>

Redimensionnez le panneau avec son bouton ou les flèches. Faites glisser les bords de la fenêtre si le navigateur le permet. En mode recadrage ou masquage, les flèches déplacent la sélection, Maj et les flèches la redimensionnent, Entrée l'applique et Échap annule. Échap dans le champ de question met les notes passives en pause et annule la question actuelle sans effacer son texte. Les paramètres s'ouvrent dans une fenêtre modale. Vous pouvez désépingler une ancienne réponse. **Dernière image envoyée** désigne l'image fixe envoyée avec une question. **Afficher la vue en direct** revient à l'écran partagé sans envoyer une nouvelle question et conserve le recadrage et les masques. **Suspendre les notes passives** annule la tâche passive en cours de diffusion et arrête les prochaines notes jusqu'à leur reprise. Les raccourcis S/E/T/P fonctionnent uniquement lorsque l'aperçu de l'écran est sélectionné. Les boutons restent accessibles au clavier. Le suivi d'une réponse diffusée s'arrête quand vous remontez dans la page. Le panneau affiche l'état du partage, du modèle et des notes passives.

Les réponses comparatives conservent les en-têtes et les colonnes des tableaux. Les tableaux larges défilent dans la réponse. Placez le focus sur la réponse et utilisez les touches fléchées pour lire les autres colonnes.

</details>

<details>
<summary>Installation et ouverture</summary>

Les deux commandes ci-dessus ajoutent et installent le plugin intégré. `/glimpselet:glimpse` ouvre un panneau local sur un port aléatoire. Le lien à usage unique expire après 60 secondes , la session en mémoire dure 30 minutes. Choisissez un écran, une fenêtre d'application ou un onglet dans le sélecteur du navigateur.

</details>

<details>
<summary>Questions, suivi et relecture</summary>

Les questions passent par l'assistant de programmation installé ou, en option, par une requête API envoyée depuis le pont local. Le CLI restreint retire les outils de commande habituels, mais les hooks gérés par l'entreprise peuvent encore s'exécuter : ce n'est donc pas un bac à sable au niveau du système d'exploitation. Il faut faire confiance au CLI installé et aux hooks de stratégie configurés par l'organisation. Les questions de suivi peuvent inclure un contexte récent et limité. Le panneau permet le recadrage, le gel d'image, les masques opaques, la copie, l'épinglage, une chronologie de dix minutes, un résumé et un export Markdown. Le résumé utilise les notes passives existantes et n'envoie aucune nouvelle image. **Clear** annule les tâches et supprime les images locales, notes, historique et clé API en mémoire.

</details>

<details>
<summary>Fenêtre flottante et navigateurs</summary>

Document Picture-in-Picture est disponible dans les navigateurs Chromium compatibles sur ordinateur. Le navigateur contrôle le placement de cette fenêtre. Les dimensions compacte et développée, la position du popup et le cadre de la fenêtre sont conservés entre les redémarrages du pont dans un fichier local limité à la géométrie et dans le cache du navigateur, si le stockage est disponible. Consultez les [emplacements](docs/CONFIGURATION.md) dans la configuration.

</details>

<details>
<summary>Développement depuis les sources</summary>

Avec Node.js 22 ou ultérieur, lancez `npm ci`, `npm run build` et `npm run build:plugin`. Consultez le [guide de contribution](CONTRIBUTING.md) pour la liste complète des vérifications. La démo statique utilise une image de test et du texte préenregistré , elle ne demande aucune réponse à un modèle.

</details>

## Limites

Lorsqu'un partage navigateur est actif, les captures MCP utilisent cette source. Si elle se déconnecte ou ne répond pas, la capture échoue sans la remplacer par une capture native qui ne respecterait pas les masques. Après une déconnexion, l'intention de partage reste active jusqu'à l'arrêt explicite du partage, à l'effacement des données locales avec **Clear** ou à l'expiration de la session. Aucune capture native n'est utilisée jusque-là. Une fois cette intention terminée, la capture native dépend des outils de la plateforme et des permissions du système. macOS prend en charge l'écran, les fenêtres et les régions. Windows prend en charge l'écran. Linux dépend des outils Wayland ou X11 installés. Une popup n'est pas garantie de rester au premier plan. Les mots de passe, coordonnées du curseur et titres de fenêtre ne sont pas détectés de façon fiable. Vérifiez chaque image avant l'envoi.

L'outil MCP distinct `screen_watch_start` effectue des captures en série à intervalles de 5 à 60 secondes, conserve les images modifiées et ne fait aucun appel de modèle. Il diffère des notes passives du panneau, qui échantillonnent toutes les deux secondes et génèrent une description.

[Utilisation](docs/USAGE.md) | [Installation](docs/INSTALL.md) | [Configuration](docs/CONFIGURATION.md) | [Architecture](docs/ARCHITECTURE.md) | [Sécurité](docs/SECURITY.md) | [Structure du plugin](docs/PLUGIN.md) | [Contribution](CONTRIBUTING.md) | [Licence MIT](LICENSE)

## Disclosure

Assisted by Claude/Codex.

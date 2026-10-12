<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, le compagnon de Glimpselet"><br><strong>Glimpselet</strong><br><em>Blink attend. Vous choisissez. Il répond.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.de.md">Deutsch</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> Posez des questions à votre assistant de programmation sur l'écran partagé, dans une petite fenêtre flottante.

Résultat sur les fixtures : 20/20 tâches synthétiques de lecture d'écran réussies. Chaque réponse a été vérifiée par l'auteur. Exécution réelle du plugin intégré avec le CLI Haiku. Médiane : 2,609 s, p95 : 3,263 s. [Résultats et méthode](assets/benchmark.json).

| Avant                     | Après                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| Un écran plein de détails | Figez une image, recadrez-la ou masquez-la, puis posez une question |

Installez le plugin avec deux commandes slash :

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Lancez ensuite `/glimpselet:glimpse`. Node.js 22 ou une version ultérieure est nécessaire. Aucune extension de navigateur n'est requise.

<p align="center"><img src="assets/demo.gif" width="800" alt="Démo avec une image de test annotée et une réponse préenregistrée , aucun modèle n'est appelé"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Ouvrir la démo statique</a>  |  exemple préenregistré, aucune requête au fournisseur</p>

## Au quotidien

```text
/glimpselet:glimpse
Choisissez un écran, une fenêtre ou un onglet dans le sélecteur du navigateur.
Figez l'image, recadrez une zone et couvrez les détails privés avec des masques opaques.
Posez une question, lisez la réponse en continu et poursuivez avec une autre question.
Copiez ou épinglez la réponse, puis effacez la session locale en terminant.
```

L'image reste sur votre machine tant que vous ne posez pas de question ou n'activez pas les notes passives. Les masques opaques modifient l'image envoyée. Les notes passives échantillonnent l'écran toutes les deux secondes et demandent une courte description des images modifiées. La limite par défaut est de six requêtes par minute glissante, soit jusqu'à 360 par heure. C'est une limite de requêtes, pas une estimation du coût. Vous pouvez choisir une limite plus basse.

**C'est vous qui démarrez le partage , l'écran n'est jamais observé automatiquement.**

## Détails

<details>
<summary>Installation et ouverture</summary>

Les deux commandes ci-dessus ajoutent et installent le plugin intégré. `/glimpselet:glimpse` ouvre un panneau local sur un port aléatoire. Le lien à usage unique expire après 60 secondes , la session en mémoire dure 30 minutes. Choisissez un écran, une fenêtre d'application ou un onglet dans le sélecteur du navigateur.

</details>

<details>
<summary>Questions, suivi et relecture</summary>

Choisissez l'alias de modèle `sonnet`, `opus` ou `haiku`. Les questions passent par le CLI installé et restreint, ou par une requête API facultative envoyée depuis le pont local. Le CLI restreint retire les outils de commande habituels, mais les hooks gérés par l'entreprise peuvent encore s'exécuter : ce n'est donc pas un bac à sable au niveau du système d'exploitation. Il faut faire confiance au CLI installé et aux hooks de stratégie configurés par l'organisation. Les questions de suivi peuvent inclure un contexte récent et limité. Le panneau permet le recadrage, le gel d'image, les masques opaques, la copie, l'épinglage, une chronologie de dix minutes, un résumé et un export Markdown. Le résumé utilise les notes passives existantes et n'envoie aucune nouvelle image. **Clear** annule les tâches et supprime les images locales, notes, historique et clé API en mémoire.

</details>

<details>
<summary>Fenêtre flottante et navigateurs</summary>

Une action de l'utilisateur est nécessaire pour ouvrir le panneau flottant. Chrome et Edge 116 ou ultérieurs peuvent utiliser Document Picture-in-Picture quand cette fonction est disponible. Si la demande est refusée, faites un second geste et cliquez sur **Open popup** pour ouvrir une fenêtre popup classique, qui peut ne pas rester au-dessus des autres fenêtres. Le navigateur contrôle son emplacement et peut reprendre la position précédente. Cet onglet mémorise le choix entre la taille compacte et la taille développée. Les permissions et options de capture varient selon le navigateur et le système d'exploitation.

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

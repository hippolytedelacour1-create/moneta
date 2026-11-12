# Moneta V2 — audit et préparation du déploiement

Audit du 11 novembre 2026, depuis main à c6c66aeba3faaa7e199057065121021f6159e539.

## Structure complète initiale

- `index.html` : vitrine française, CSS et JavaScript intégrés, liens vers `/app/`, formulaire de démonstration sans envoi.
- `app/index.html` : application V2 autonome, CSS et JavaScript intégrés. Accueil, dépenses, objectif, prévisions, coach à règles, paramètres, export JSON et suppression locale.
- `_redirects` : réécritures Netlify de `/app` et `/app/` vers `/app/index.html`.
- `README.txt` : instructions de déploiement manuel.

Aucun serveur, compte utilisateur, base distante, système de compilation, dépendance npm ou service worker. Les données sont propres au navigateur et à l'origine du site.

## V2 et calcul

La V2 est déjà installée dans `app/index.html` sur main (titre V2, enveloppes et `budgetUsed()`). Le correctif du double comptage existe déjà dans le commit c6c66ae ; cette proposition le conserve et le protège par des tests exécutant le code réel de la page.

Budget réservé = max(fixe prévu, fixe dépensé) + max(essentiel prévu, essentiel dépensé) + max(ajustable prévu, ajustable dépensé) + dépenses hors enveloppe.

Disponible = revenu prévu + revenus ponctuels du mois − budget réservé − réserve.

Exemple : revenus 2 000 €, enveloppes 1 800 €, réserve 100 € : disponible 100 €. Ajouter 200 € de courses dans une enveloppe de 350 € conserve 100 €. Atteindre 400 € de courses donne 50 €. Ajouter ensuite 25 € dans Autre donne 25 €.

Les revenus ajoutés sont des revenus supplémentaires : ne pas saisir à nouveau le salaire déjà inclus dans le revenu mensuel prévu. Les prévisions futures utilisent volontairement les montants récurrents, sans opérations ponctuelles. Les opérations des autres mois ne changent pas le calcul du mois courant.

## Compatibilité et changements

La clé `moneta-demo-v1` et tous les champs existants sont conservés. Aucun effacement ni migration automatique au chargement. Les anciens montants numériques sous forme de chaînes sont convertis pour éviter les concaténations. Les champs supplémentaires sont préservés. Les catégories inconnues sont hors enveloppe.

Les données mal formées et le stockage inaccessible ne font plus planter les vues : un message persistant signale le problème et les sauvegardes sont bloquées pour éviter d'écraser l'original. Une sauvegarde refusée par le navigateur ne déclenche plus un message de succès. La date locale est désormais construite explicitement en AAAA-MM-JJ.

Le HTML visuel, les styles, la palette, les mises en page et la vitrine sont conservés. Aucun changement d'identité.

## Pourquoi la version publiée est ancienne

Le 11 novembre 2026, récupération HTTP de `/` et `/app/` sur https://inquisitive-sable-0a6180.netlify.app/ : les fichiers diffèrent de main. La page publiée `/app/` porte le titre « Moneta — Mon espace » et utilise encore `net = income + extraIncome − fixed − essentials − flexible − extraExpenses`, responsable du double comptage. Ce constat vient d'une nouvelle requête HTTP, indépendamment du cache du navigateur de l'utilisateur.

Le dépôt ne contient initialement ni configuration Netlify ni workflow. Cela ne prouve pas l'absence d'une connexion Git configurée dans le tableau de bord. Sans accès aux réglages et journaux Netlify, impossible de départager un dépôt/une branche incorrects, une publication manuelle ancienne, des déploiements suspendus ou un déploiement échoué. La configuration ajoutée ne peut pas établir elle-même la connexion Git.

## Publication automatique depuis GitHub

Le nouveau `netlify.toml` fixe le dossier publié à la racine et exécute les tests avant publication avec Node 22. La racine conserve la vitrine et `/app/` conserve l'application. Les règles existantes `_redirects` sont conservées. Les pages sont revalidées pour limiter la persistance des anciennes versions.

Sur le site Netlify existant, vérifier dans les paramètres de build :

1. Dépôt `hippolytedelacour1-create/moneta`, branche de production `main`.
2. Dossier de base vide/racine ; aucun dossier de package. Publication `.` et commande `node --test tests/budget.test.cjs` via netlify.toml.
3. Builds automatiques actifs et autorisation GitHub pour le dépôt.
4. Après revue et fusion de la proposition, vérifier qu'un déploiement du SHA fusionné est publié.
5. Ouvrir `/`, `/app` et `/app/` ; contrôler le titre V2 et l'exemple de budget ci-dessus. Si nécessaire, relancer un déploiement en vidant le cache de build, puis vérifier ses journaux.

Conserver le domaine actuel : localStorage est isolé par origine. Une Deploy Preview ou un nouveau domaine n'aura pas les données du site de production. Exporter depuis Paramètres avant la mise à jour constitue une sauvegarde utile ; aucun export réel utilisateur n'a été consulté pendant cet audit.

Le workflow GitHub ajouté exécute les tests sur les PR et les pushes sur main. La publication est assurée par l'intégration Git native Netlify ; aucun jeton Netlify à ajouter dans GitHub.

## Vérification effectuée

- `node --test tests/budget.test.cjs` : 9 tests réussis : enveloppes, dépassements, hors enveloppe, revenus, mois distincts, suppression, clé V1, chaînes numériques et champs supplémentaires, données corrompues et stockage inaccessible.
- Chromium avec Playwright sur serveur HTTP local : configuration du budget, ajout d'une dépense, persistance après rechargement, suppression, navigation dans toutes les vues, largeur mobile 390 px sans débordement, blocage d'écrasement de données corrompues. Aucune erreur JavaScript.
- `git diff --check` : réussi.

Limites : aucune donnée réelle utilisateur testée, aucun accès au tableau de bord Netlify, aucune publication de production effectuée. La validation locale ne remplace pas la vérification du déploiement Netlify et de ses réécritures après fusion.

# Améliorations du suivi quotidien

## Fonctionnalités livrées

- Restaurer un export JSON Moneta ancien (objet direct) ou versionné : sélection du fichier, validation complète, aperçu, confirmation explicite. Le fichier ne fusionne jamais les opérations avec celles présentes, ce qui évite de dupliquer une restauration.
- Conserver une copie locale exacte avant remplacement ou remise à zéro ; restaurer cette copie depuis Paramètres. Chaque nouvelle restauration remplace cette unique copie. L'export JSON reste la sauvegarde durable à conserver hors du navigateur.
- Exporter les données originales même si le JSON local est endommagé. La restauration reste accessible au premier lancement et pendant une récupération.
- Modifier toutes les propriétés d'une opération, y compris son mois. Identifiant et champs supplémentaires sont conservés. Annuler ne modifie rien.
- Consulter un mois distinct : opérations, dépenses, revenus supplémentaires et différence des opérations. Les anciens montants prévisionnels n'ayant pas été enregistrés, l'historique n'invente pas un budget disponible. Accueil, objectif et coach concernent toujours le mois courant.
- Expliquer la distinction entre salaire prévu et revenu supplémentaire dans le budget, la liste et le formulaire d'opération. Aucun revenu existant n'est supprimé ou reclassé automatiquement.
- Additionner en centimes pour éviter un déficit fantôme lié aux nombres flottants ; afficher les centimes.

## Compatibilité et structure

La clé `moneta-demo-v1`, les catégories et les champs historiques sont conservés. Les montants numériques stockés en texte sont acceptés. La copie de récupération utilise `moneta-backup-v1`.

L'application reste en HTML/CSS/JavaScript sur Netlify, sans framework ajouté. `app/index.html` conserve la présentation ; le JavaScript existant est déplacé dans `app/app.js`. `app/data.js` regroupe validation et calculs pour utiliser les mêmes fonctions en production et dans les tests. Les dates impossibles, doublons d'identifiant et montants non valides sont refusés ; les données initiales restent conservées en cas de problème.

Une écriture n'actualise l'état affiché qu'après son enregistrement réussi. Une restauration avorte si sa copie de sécurité ne peut pas être enregistrée. Un onglet dont le budget est périmé ne peut pas écraser les changements d'un autre onglet : il faut le recharger.

Le fichier importé est limité à 5 Mo et à 20 000 opérations. Les contenus saisis et importés sont échappés avant affichage. Les exports ne quittent pas le navigateur sauf si leur propriétaire choisit de les partager.

## Vérification

`node --test tests/budget.test.cjs` : 17 tests sur les calculs, la validation, la compatibilité, la récupération, les conflits et les écritures refusées.

`tests/browser.cjs` : Chromium vérifie configuration existante, édition, déplacement entre mois, suppression, export réel et relecture du fichier, import invalide, annulation, restauration, retour à la copie précédente, conflit d'onglets, récupération de données illisibles et mobile à 390 px. Aucune erreur JavaScript.

Le workflow GitHub lance les deux suites. Netlify lance les tests de données avant publication. Pour lancer les parcours localement, servir le dépôt (`python -m http.server 8080`), installer Playwright dans l'environnement de développement puis exécuter `node tests/browser.cjs`. Les variables facultatives `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` et `MONETA_TEST_URL` permettent d'utiliser un navigateur et un serveur existants.

## Limites connues

Les copies locales disparaissent si les données du navigateur sont effacées. La connexion des comptes confirmés et la synchronisation explicite sont désormais disponibles ; les inscriptions publiques restent fermées jusqu'à configuration des e-mails. Voir COMPTES-ET-SYNCHRONISATION.md. Les prévisions futures restent des estimations récurrentes, sans solde bancaire initial. Le changement de mois dans Mes dépenses ne change pas les paramètres mensuels du budget.


## Build depuis l'ajout des comptes

`npm ci` puis `npm run build` valident les calculs et produisent le SDK Supabase regroupé dans `app/supabase-client.js` (fichier généré, non versionné). Le serveur local doit servir le dépôt après ce build. Netlify utilise la même commande ; aucun secret de base de données n'est nécessaire pour construire le frontend.

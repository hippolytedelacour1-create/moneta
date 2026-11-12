# Comptes et synchronisation — Moneta

## État livré

Le projet Supabase **Moneta** est créé dans l'organisation personnelle du propriétaire, à Paris (`eu-west-3`). Référence : `ypdvqatkqzvzyrggiseh`. Le site reste hébergé à son adresse Netlify existante.

La rubrique **Mon compte** permet aux utilisateurs déjà confirmés de se connecter avec leur e-mail et mot de passe. Le SDK officiel Supabase est installé avec une version exacte et un lockfile ; il est regroupé localement pendant le build, sans CDN externe ni changement de framework.

Les inscriptions publiques sont volontairement fermées (`allowSignup: false` dans `app/cloud-config.js`) tant que les e-mails et URLs de confirmation ne sont pas configurés et vérifiés. Le parcours d'inscription est préparé mais n'est pas proposé à l'utilisateur. Aucun e-mail n'a été envoyé pendant les tests.

## Données locales et compte

- Le budget original reste sous `moneta-demo-v1`, indépendant de tout compte. La connexion ne le transfère jamais.
- Chaque compte possède une copie distincte sur l'appareil (`moneta-account-v1:<identifiant>`). Le bandeau indique le budget utilisé.
- **Copier mon budget local vers le compte** copie les données dans la copie du compte sur cet appareil, après confirmation. **Synchroniser le budget du compte** enregistre ensuite explicitement la version distante.
- À la connexion, une version distante est chargée si la copie locale du compte n'a pas de modifications en attente. Les modifications non synchronisées ne sont jamais remplacées automatiquement.
- Si deux appareils modifient la même version, le second reçoit un conflit. Il conserve ses données et peut les exporter ou recharger la version distante avec une copie préalable.
- La déconnexion explicite efface la copie du compte et sa sauvegarde sur l'appareil, après avertissement si des modifications ne sont pas synchronisées. Le budget local indépendant reste conservé.
- **Supprimer le budget du compte** efface le contenu distant après confirmation. Une révision vide reste pour empêcher les appareils périmés de recréer silencieusement une ancienne version. Cette action ne supprime pas le compte utilisateur.

## Base privée

`public.moneta_documents` contient un document par utilisateur. La politique de lecture combine rôle authentifié et propriété `auth.uid() = user_id`. Les visiteurs anonymes n'ont aucun accès. Les clients authentifiés ne peuvent pas écrire directement dans la table.

Les RPC publiques sont `SECURITY INVOKER`. Leur implémentation privilégiée est dans `moneta_private`, hors des schémas exposés par la Data API, avec un contrôle d'identité explicite et un `search_path` fermé. Chaque écriture valide les montants, dates, champs et identifiants d'opérations côté serveur, puis vérifie la révision attendue. Les conflits applicatifs renvoient le code explicite `PT409` ; ils ne sont pas présentés comme des erreurs SQL de sérialisation à réessayer automatiquement.

Le client distant est lié au jeton précis de sa session pour ne pas transférer les données de A avec la session de B. Aucun mot de passe n'est enregistré dans les budgets ou exports. La configuration frontend ne contient qu'une URL de projet et une clé publique. Aucune clé privilégiée n'est exposée.

## Vérification effectuée

- Tests Node du budget et du cache de synchronisation.
- Tests PostgreSQL/PGlite sur migrations, RLS, permissions, révisions, suppression et recréation.
- Tests sur le **service Supabase réel**, avec deux comptes fictifs confirmés : connexion, lecture propriétaire, isolation A/B, anonymes refusés, écritures directes refusées, conflits et suppression.
- Parcours Chromium sur le service réel : transfert explicite, deux appareils, modification concurrente, conflit sans perte, rechargement avec copie précédente, déconnexion, passage A → B et mobile 390 px. Aucune erreur JavaScript.
- Audit Supabase après installation : aucun avis de sécurité ni de performance sur le schéma ajouté.

Les comptes fictifs, sessions et budgets de test ont été supprimés. Aucune donnée réelle utilisateur n'a été transférée.

La CI exécute les tests Node, PostgreSQL local et les parcours navigateur. Le parcours compte en CI utilise des réponses HTTP simulées, sans secrets ni comptes persistants. Les tests du service réel sont opt-in (`tests/supabase.integration.cjs` et `tests/accounts.browser.cjs`) et exigent deux comptes fictifs jetables. Ils ne sont pas lancés contre des budgets d'utilisateurs.

## Réglages du propriétaire avant inscriptions publiques

Dans https://supabase.com/dashboard/project/ypdvqatkqzvzyrggiseh/auth/url-configuration :

1. Régler **Site URL** sur `https://inquisitive-sable-0a6180.netlify.app/app/`.
2. Ajouter la même URL exacte aux **Redirect URLs**.
3. Configurer un fournisseur SMTP dans les réglages d'authentification. Le service de démonstration Supabase est limité aux adresses autorisées ; il ne constitue pas une inscription publique fiable.
4. Tester création → e-mail → confirmation → connexion avec une adresse de test contrôlée par le propriétaire. Ne pas désactiver la confirmation d'e-mail pour contourner le réglage.
5. Vérifier la récupération du mot de passe et le parcours de suppression complète du compte avant ouverture au public ; ils ne sont pas encore fournis dans l'interface actuelle.
6. Activer ensuite `allowSignup` dans une modification revue et testée.

Pour utiliser la connexion en bêta sans ouvrir les inscriptions, le propriétaire peut créer son premier utilisateur confirmé dans **Authentication → Users → Add user → Create new user**. Le mot de passe doit être saisi dans Supabase, jamais transmis dans une conversation.

La configuration des e-mails et des URLs ne peut pas être modifiée avec les outils Supabase disponibles dans cette session. Aucun abonnement payant n'a été accepté.

Références : https://supabase.com/docs/guides/auth/auth-email-passwordless, https://supabase.com/docs/guides/auth/passwords et https://supabase.com/docs/guides/auth/auth-smtp.

# Préparation des comptes et de la synchronisation

## Choix proposé pour l'existant

Conserver Netlify et le frontend HTML/JavaScript. Un service géré comme Supabase peut réunir authentification et PostgreSQL sans reconstruction de l'application. Un plugin Supabase est disponible mais aucun projet, connexion ou secret n'est configuré dans cet environnement. Cette architecture est préparée ; aucune infrastructure n'a été créée, aucune migration exécutée et aucune donnée locale envoyée.

Les guides d'authentification et de stockage ont été consultés. Les exemples Next.js/Vercel ne sont pas appliqués à cette application statique Netlify.

## Contrat de données envisagé

Première étape : un document de budget par utilisateur, avec `user_id`, `payload` (même contrat que les exports JSON actuels), `revision` entière et `updated_at` côté serveur. Les identifiants d'opérations existants doivent être conservés. Le modèle local `app/data.js` fournit une validation réutilisable ; une validation serveur indépendante reste obligatoire.

- Activer l'isolation des lignes (RLS). Chaque lecture, création, modification et suppression doit vérifier côté base que l'utilisateur authentifié est propriétaire du document.
- La clé publique du projet peut être dans la configuration du frontend. Aucune clé `service_role` ou autre secret privilégié ne doit y figurer.
- Créer une fonction d'écriture transactionnelle comparant la révision attendue, puis incrémentant la révision côté serveur. Si elle diffère, renvoyer un conflit explicite ; ne pas écraser silencieusement le budget distant.
- Garder l'export JSON et le mode local. La connexion seule ne doit pas transférer les données : un aperçu et une action « Transférer ce budget vers mon compte » seront nécessaires.
- Ne pas ajouter les montants et libellés des opérations aux logs ni à la télémétrie.

## Parcours à implémenter après connexion du service

1. Authentification par lien e-mail avec URLs de retour autorisées pour le domaine Netlify existant. Prévoir expiration, erreur, renvoi du lien et déconnexion.
2. Si un budget distant existe et un budget local aussi : choix explicite, sauvegarde locale et aperçu. Pas de fusion automatique par montant/date, car deux opérations identiques peuvent être réelles.
3. Synchronisation d'un document validé avec contrôle de révision. Un statut visible doit distinguer « enregistré sur cet appareil » et « synchronisé ».
4. Déconnexion : retirer la session, demander quoi conserver sur un appareil partagé, éviter d'afficher le budget du compte A au compte B.
5. Export, suppression du document et suppression du compte. Le comportement des sauvegardes distantes et leur durée de conservation doit être défini avant ouverture publique.

## Tests exigés avant activation

- Compte A incapable de lire/écrire/supprimer le budget de B, via requête directe et pas seulement via l'interface.
- Lien de connexion invalide/expiré ; session expirée pendant une sauvegarde ; déconnexion puis connexion d'un autre compte.
- Deux appareils écrivant la même révision : une seule écriture acceptée ; l'autre conserve sa copie et voit le conflit.
- Première migration d'un budget local, annulation, rechargement et absence de transfert sans action.
- Réseau indisponible : données locales conservées, statut exact, reprise sans doublons.
- Suppression du compte et contrôle de l'accès ensuite.

## Ce qui nécessite une intervention du propriétaire

Connecter le service choisi au bon compte, choisir sa région et ses conditions de facturation, puis configurer l'authentification et les secrets dans les réglages du service/hébergement. Ces choix ne sont pas remplacés par une fausse connexion dans l'interface. Ne pas transmettre de secret dans une conversation.

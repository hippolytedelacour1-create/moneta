# Moneta Gratuit et Moneta Plus — préparation commerciale

## Offre et état réel

Le modèle choisi par le propriétaire est freemium. Les fonctions déjà livrées restent gratuites : budget, enveloppes, opérations, historique, export/restauration et synchronisation du compte. Aucun budget existant n'est bloqué derrière un abonnement.

Première fonction Plus livrée : simulation d'une dépense supplémentaire hors enveloppes et de variations mensuelles de revenus/dépenses sur 1 à 12 mois. Le calcul s'exécute sur le serveur après vérification des droits. Les objectifs multiples et bilans avancés restent des pistes de développement ; ils ne sont pas présentés comme disponibles.

**État : test exclusivement.** Le prix de travail est 4,90 EUR/mois. Aucun encaissement réel n'est activé et ce tarif doit être validé avant le lancement réel. Le propriétaire a indiqué ne pas facturer la TVA ; Stripe Tax et Managed Payments ne sont pas activés pour ces tests. Cela ne constitue pas une qualification juridique du régime fiscal.

La vitrine présente Gratuit et Plus avec leur état réel. Le formulaire de liste d'attente fictif est retiré ; le bouton principal ouvre l'application gratuite. Aucun e-mail commercial ni aucune campagne payante n'ont été envoyés ou lancés.

## Ressources Stripe de test

Compte : `acct_1UazmE884rWrgKXu` (environnement de test moneta).

- Produit : `prod_VcK8ldjE2LMwWX`
- Prix : `price_1Ub5U4884rWrgKXupz2EMosL`, 490 centimes EUR par mois
- Portail : `bpc_1Ub5VK884rWrgKXusQ9PfSbf`, annulation en fin de période
- Notifications : `we_1Ub5hG884rWrgKXulEFsGopJ`

Les identifiants ci-dessus sont publics/non secrets. La clé secrète de test a été saisie par le propriétaire dans les secrets Supabase sous `STRIPE_SECRET_KEY`. Sa valeur n'a pas été lue ni ajoutée au dépôt. Le secret de signature du webhook est conservé dans Supabase Vault sous `moneta_stripe_test_webhook`. Seul le backend peut le récupérer.

## Parcours de paiement

1. Le visiteur utilise gratuitement Moneta sans carte.
2. Pour tester Plus, il se connecte à un compte confirmé.
3. Le serveur vérifie l'identité Supabase, utilise son propre mapping client Stripe, son prix fixe et ses URLs de retour. Aucun `customer_id`, prix ou droit fourni par le navigateur n'est utilisé.
4. Checkout hébergé Stripe reçoit l'utilisateur. Une session encore ouverte est réutilisée, et les créations sont idempotentes.
5. Le retour sur `?checkout=test_success` ne donne aucun droit. Seul un webhook signé, suivi d'une lecture de l'abonnement courant dans Stripe, met à jour le statut.
6. Le portail client gère le moyen de paiement et la résiliation. Une résiliation en fin de période conserve l'accès tant que la période payée est valide ; une annulation effective le retire. Les impayés, abonnements incomplets et périodes expirées ne donnent pas accès aux simulations.

Les fonctions gratuites restent disponibles quel que soit le statut Plus.

## Sécurité et exploitation

La fonction `moneta-billing` valide elle-même le JWT Supabase pour les routes utilisateur et la signature HMAC Stripe pour le webhook. Son `verify_jwt` de passerelle est désactivé parce que Stripe n'envoie pas un JWT Supabase : cela ne rend pas les opérations de paiement anonymes.

- `GET /status` : statut du compte courant, état de préparation et tarif de test.
- `POST /checkout` : nouvelle session pour le propriétaire du JWT uniquement.
- `POST /portal` : portail du client Stripe de ce compte.
- `POST /simulate` : nécessite un droit Plus actif et non expiré côté base.
- `POST /webhook` : corps brut signé, tolérance de 5 minutes, mode test obligatoire.

Les événements traités sont enregistrés pour ne pas les appliquer deux fois. Le serveur récupère l'état canonique Stripe ; une observation plus ancienne ne remplace pas une plus récente. Les droits sont stockés par abonnement, pour que l'annulation d'un ancien abonnement ne supprime pas un nouvel accès valide.

Les clients ne peuvent lire ni modifier les tables internes de paiement. La réponse du statut ne contient pas de secret ni d'identifiant de facturation externe. Aucun mot de passe, montant de budget ou détail de scénario n'est envoyé à Stripe. Le scénario est calculé sans stockage côté serveur.

La fonction refuse les clés live et les événements `livemode=true`. Le seul changement d'une valeur dans localStorage ne peut pas ouvrir Plus : chaque calcul appelle le serveur.

## Vérification effectuée

- Tests des calculs en centimes, dépenses exceptionnelles, réserve, objectifs et prise en compte des dépenses déjà saisies.
- Tests de signature, signature falsifiée/expirée, accès anonyme, clé live refusée, droits issus d'un retour success refusés.
- Tests PostgreSQL de permissions, séparation A/B, événements dupliqués, ordre inversé et révocation.
- Test sur les vrais services Supabase et Stripe **en mode test** : session Checkout créée à 490 centimes EUR ; portail créé ; abonnement actif ; webhook Stripe reçu ; accès Plus ouvert ; calcul serveur validé ; autre compte refusé ; annulation programmée puis effective ; calcul refusé après annulation.
- Pour tester la partie abonnement/webhook sans carte, la première facture a reçu une remise technique de 100 %, à usage unique. Cette facture est payée à zéro en sandbox. Cela valide le cycle d'accès, **pas l'encaissement d'une carte à 4,90 €**. Le paiement complet avec une carte de test Checkout doit aussi être vérifié avant le passage en réel.
- Parcours Chromium réel : connexion du compte temporaire Plus, calcul de scénario et largeur mobile de 390 px, sans erreur JavaScript.
- CI : parcours navigateur avec réponses HTTP simulées, sans clés ou comptes persistants. Le transport simulé n'est jamais utilisé en production.

Les comptes/sessions Supabase temporaires sont supprimés après vérification. L'abonnement Stripe temporaire a été annulé. Les objets historiques de test restent visibles dans Stripe ; aucun abonnement réel n'existe.

L'audit Supabase signale une configuration d'authentification à examiner : protection contre les mots de passe compromis désactivée. Référence : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Aucun changement de forfait payant n'est effectué automatiquement pour cette option.

## Construction et déploiement

- `npm run build` : tests et bundle du SDK frontend.
- `npm run build:edge` : bundle de la fonction dans `work/moneta-billing/index.js` (non versionné).
- Les sources sont dans `supabase/functions/moneta-billing` et `_shared` ; les migrations SQL sont versionnées. Le déploiement de la fonction Supabase est distinct du déploiement Netlify. Un futur changement backend doit être redéployé et vérifié sur Supabase.

## Avant les premiers encaissements réels

Valider le tarif et le contenu exact de Plus, connecter un compte Stripe réel et terminer son activation avec les informations du propriétaire. Définir les conditions de vente, le contact client et les réglages fiscaux correspondant à l'activité réelle. Aucun abonnement live n'est créé automatiquement par cette livraison.

Il reste également à terminer l'ouverture des inscriptions, les e-mails de confirmation, la récupération de mot de passe et la suppression complète du compte. La connexion des comptes confirmés et le mode local restent utilisables pendant cette phase.

Première cible de validation : obtenir 10 utilisateurs qui reviennent chaque semaine, puis 10 abonnés payants satisfaits. Mesurer activation (budget configuré et première dépense), retour hebdomadaire et conversion Plus avant toute publicité payante. À 4,90 €, 100 abonnés mensuels représentent 490 € de revenus bruts avant frais de paiement, taxes, hébergement et travail : ce n'est pas un bénéfice ni une prévision.
